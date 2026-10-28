// The War Pit battle engine (specs/07 §2 battle rules, §14.2 engine contract). Pure TS, no Pixi:
// the scene plays back its frame log, Skirmish Gauntlets and idleRate run it headless, and the
// balance simulation imports it in Node. Same inputs -> same result, always.
//
// Contract notes:
//  - Stats arrive as integers (prepared once at battle start, see run.ts `prepareLine`); every
//    battle-time effect is an integer add.
//  - One seeded mulberry32 stream per battle, `battle(hash(teamCanon, rivalCanon, round, pv))`.
//  - Total trigger order: highest attack, then side 0 (yours) before side 1, then slot from the
//    front, then unit id.
//  - Sudden Death from exchange 50 (+1 dmg, +1 more every 10 exchanges); 200 exchanges = draw.
import { HELD_POOL, UNITS, type HuntId, type ItemId, type Trig, type UnitId } from './units';

// ---------- RNG ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string, mixed with optional numbers. */
export function hashStr(s: string, ...nums: number[]): number {
  let h = 0x811c9dc5;
  const feed = (c: number) => {
    h ^= c & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    feed(c);
    feed(c >>> 8);
  }
  for (const n of nums) {
    const v = n | 0;
    feed(v);
    feed(v >>> 8);
    feed(v >>> 16);
    feed(v >>> 24);
  }
  return h >>> 0;
}

// ---------- inputs and outputs ----------

export interface Fighter {
  kind: UnitId;
  lvl: number;
  atk: number;
  hp: number;
  item?: ItemId | null;
  brand?: boolean;
  armor?: number;
  /** Marked Prey (tactics card 15): the Run's first-bought unit. */
  marked?: boolean;
  /** Index of this unit in the owner's Run line (side 0), for permanent Knockout gains. */
  ref?: number;
  /** The Huntmaster's counter-move (params version 4); absent = the classic net. */
  hunt?: HuntId;
}

export interface BattleOpts {
  seed: number;
  /** Stakes level for the rival tactics cards (3 Muzzled Front, 6 Ambush, 9 Pack Healer,
   * 12 War Drums, 15 Marked Prey, 18 Huntmaster's Oath). */
  tactics?: number;
  /** Essence import: your front 1/2/3 units start with Armor 1. */
  sigils?: number;
  /** Souls import level: your first unit to faint returns as a Shade (L/L). 0 = none. */
  shade?: number;
  /** Record the frame log for playback. */
  log?: boolean;
}

/** A unit as the renderer sees it in one frame. */
export interface Snap {
  u: number; // battle unit id
  k: UnitId;
  a: number;
  h: number;
  l: number;
  it: ItemId | null;
  ar: number; // armor
  th: number; // thorns
  sk: number; // strikes to skip (netted)
  b: boolean; // branded
}

export type FrameKind = 'start' | 'trig' | 'hit' | 'faint' | 'end';

export interface Frame {
  e: FrameKind;
  /** Source unit (trigger owner, or the striker for a one-sided Wyvern strike). */
  src?: number;
  icon?: Trig;
  /** For 'hit': the strikers that actually struck. */
  hit?: number[];
  ex: number; // exchange counter (Sudden Death tint from 50)
  lines: [Snap[], Snap[]];
}

export interface BattleResult {
  /** From side 0's view: 1 win, 0 draw, -1 loss. */
  outcome: 1 | 0 | -1;
  exchanges: number;
  frames: Frame[];
  /** Ember Hound Knockouts: permanent +atk/+hp per Run line index (side 0). */
  koGains: { ref: number; atk: number; hp: number }[];
  /** Per-unit tallies for the post-fight recap (only with `log`): damage dealt (strikes,
   * abilities, thorns), Knockouts and triggers fired. Display only. */
  stats?: UnitTally[];
}

export interface UnitTally {
  u: number;
  side: 0 | 1;
  k: UnitId;
  dmg: number;
  kos: number;
  trig: number;
}

export const SUDDEN_DEATH_AT = 50;
export const EXCHANGE_CAP = 200;
export const LINE_MAX = 5;

// ---------- internals ----------

interface BU {
  uid: number;
  side: 0 | 1;
  kind: UnitId;
  lvl: number;
  atk: number;
  hp: number;
  maxHp: number;
  armor: number;
  thorns: number;
  skip: number;
  item: ItemId | null;
  brand: boolean;
  ref: number;
  marked: boolean;
  toyUsed: boolean;
  collarUsed: boolean;
  wyvernLeft: number;
  hurt: number; // pending Hurt triggers
  killer: number; // uid of the striker that knocked it out (-1 = ability)
  out: boolean; // fainted and removed
  hunt?: HuntId;
}

class Battle {
  lines: [BU[], BU[]] = [[], []];
  rng: () => number;
  frames: Frame[] = [];
  log: boolean;
  ex = 0;
  uid = 1;
  shadeLvl: number;
  shadeUsed = false;
  oathUsed = false;
  koGains = new Map<number, { atk: number; hp: number }>();
  pendingWyvern: BU[] = [];
  byUid = new Map<number, BU>();
  /** Recap tallies (log only) and the ability source being resolved, for credit. */
  tally = new Map<number, UnitTally>();
  cur: BU | null = null;
  muzzled = false;

  constructor(a: Fighter[], b: Fighter[], private o: BattleOpts) {
    this.rng = mulberry32(o.seed);
    this.log = !!o.log;
    this.shadeLvl = o.shade ?? 0;
    a.slice(0, LINE_MAX).forEach((f) => this.lines[0].push(this.make(f, 0)));
    b.slice(0, LINE_MAX).forEach((f) => this.lines[1].push(this.make(f, 1)));
  }

  make(f: Fighter, side: 0 | 1): BU {
    const u: BU = {
      uid: this.uid++,
      side,
      kind: f.kind,
      lvl: Math.max(1, f.lvl | 0),
      atk: Math.max(0, f.atk | 0),
      hp: Math.max(1, f.hp | 0),
      maxHp: Math.max(1, f.hp | 0),
      armor: f.armor ?? (f.kind === 'hunt' ? 2 : 0),
      thorns: 0,
      skip: 0,
      item: f.item ?? null,
      brand: !!f.brand,
      ref: f.ref ?? -1,
      marked: !!f.marked,
      toyUsed: false,
      collarUsed: false,
      wyvernLeft: f.kind === 'wyvern' ? Math.max(1, f.lvl | 0) : 0,
      hurt: 0,
      killer: -1,
      out: false,
      hunt: f.hunt,
    };
    this.byUid.set(u.uid, u);
    if (this.log) this.tally.set(u.uid, { u: u.uid, side, k: u.kind, dmg: 0, kos: 0, trig: 0 });
    return u;
  }

  token(kind: UnitId, side: 0 | 1, lvl: number, atk: number, hp: number): BU {
    return this.make({ kind, lvl, atk, hp }, side);
  }

  snap(): [Snap[], Snap[]] {
    const s = (u: BU): Snap => ({ u: u.uid, k: u.kind, a: u.atk, h: u.hp, l: u.lvl, it: u.item, ar: u.armor, th: u.thorns, sk: u.skip, b: u.brand });
    return [this.lines[0].map(s), this.lines[1].map(s)];
  }

  frame(e: FrameKind, extra?: Partial<Frame>): void {
    if (!this.log) return;
    if (e === 'trig' && extra?.src !== undefined) {
      const t = this.tally.get(extra.src);
      if (t) t.trig++;
    }
    this.frames.push({ e, ex: this.ex, lines: this.snap(), ...extra });
  }

  alive(side: 0 | 1): BU[] {
    return this.lines[side].filter((u) => u.hp > 0);
  }

  slot(u: BU): number {
    return this.lines[u.side].indexOf(u);
  }

  /** Total trigger order (07 §14.2). */
  order(units: BU[]): BU[] {
    return units
      .map((u) => ({ u, s: this.slot(u) }))
      .sort((x, y) => y.u.atk - x.u.atk || x.u.side - y.u.side || x.s - y.s || x.u.uid - y.u.uid)
      .map((x) => x.u);
  }

  pick<T>(arr: T[]): T | undefined {
    if (!arr.length) return undefined;
    return arr[Math.floor(this.rng() * arr.length)];
  }

  /** Deals damage after Armor, Gargoyle hide and Chew Toy (min 1). Returns the damage dealt. */
  damage(t: BU, amount: number, from: BU | null, by: BU | null = from ?? this.cur): number {
    if (t.hp <= 0 || amount <= 0) return 0;
    let d = amount - t.armor;
    if (t.kind === 'gargoyle') d -= t.lvl;
    if (t.item === 'toy' && !t.toyUsed) {
      t.toyUsed = true;
      d -= 2;
    }
    d = Math.max(1, d);
    const before = t.hp;
    t.hp -= d;
    if (t.hp > 0) t.hurt++;
    else t.killer = from ? from.uid : -1;
    if (this.log && by && by.side !== t.side) {
      const c = this.tally.get(by.uid);
      if (c) {
        c.dmg += Math.min(d, before);
        if (t.hp <= 0) c.kos++;
      }
    }
    return d;
  }

  /** Resolve Hurt and Faint triggers until the board is stable. */
  settle(): void {
    for (let guard = 0; guard < 64; guard++) {
      let changed = false;
      // Hurt (Tusk Boar).
      for (const u of this.order([...this.lines[0], ...this.lines[1]].filter((x) => x.hurt > 0 && x.hp > 0))) {
        const n = u.hurt;
        u.hurt = 0;
        if (u.kind === 'boar') {
          u.atk += 2 * u.lvl * n;
          this.frame('trig', { src: u.uid, icon: 'hurt' });
          changed = true;
        }
      }
      for (const u of [...this.lines[0], ...this.lines[1]]) if (u.hp <= 0) u.hurt = 0;
      const dead = this.order([...this.lines[0], ...this.lines[1]].filter((x) => x.hp <= 0 && !x.out));
      if (dead.length) {
        changed = true;
        for (const u of dead) this.faint(u);
      }
      if (!changed) break;
    }
  }

  faint(u: BU): void {
    const line = this.lines[u.side];
    const idx = line.indexOf(u);
    if (idx < 0) return;
    // Huntmaster's Oath (tactics 18): the Huntmaster revives once at 50% HP.
    if (u.kind === 'hunt' && !this.oathUsed && (this.o.tactics ?? 0) >= 18) {
      this.oathUsed = true;
      u.hp = Math.max(1, Math.ceil(u.maxHp / 2));
      this.frame('trig', { src: u.uid, icon: 'faint' });
      return;
    }
    // Bone Charm: return once at 1 HP.
    if (u.item === 'charm') {
      u.item = null;
      u.hp = 1;
      this.frame('trig', { src: u.uid, icon: 'faint' });
      return;
    }
    u.out = true;
    line.splice(idx, 1);
    this.frame('faint', { src: u.uid });
    const L = u.lvl;
    const side = u.side;
    const room = () => LINE_MAX - this.lines[side].length;
    const summon = (kind: UnitId, n: number, atk: number, hp: number, lvl: number) => {
      let put = 0;
      for (let i = 0; i < n && room() > 0; i++) {
        this.lines[side].splice(idx + put, 0, this.token(kind, side, lvl, atk, hp));
        put++;
      }
      if (put) this.frame('trig', { src: this.lines[side][idx].uid, icon: 'faint' });
    };
    // Knockout triggers of the striker.
    const killer = u.killer > 0 ? this.byUid.get(u.killer) : undefined;
    if (killer && killer.hp > 0 && killer.side !== side) {
      if (killer.kind === 'ember') {
        killer.atk += killer.lvl;
        killer.hp += killer.lvl;
        if (killer.side === 0 && killer.ref >= 0) {
          const g = this.koGains.get(killer.ref) ?? { atk: 0, hp: 0 };
          g.atk += killer.lvl;
          g.hp += killer.lvl;
          this.koGains.set(killer.ref, g);
        }
        this.frame('trig', { src: killer.uid, icon: 'ko' });
      } else if (killer.kind === 'wyvern' && killer.wyvernLeft > 0 && !this.pendingWyvern.includes(killer)) {
        this.pendingWyvern.push(killer);
      }
    }
    // The friend behind (now at idx) reacts first: Carrion Crow.
    const behind = line[idx];
    if (behind && behind.hp > 0 && behind.kind === 'crow') {
      behind.atk += behind.lvl;
      behind.hp += behind.lvl;
      this.frame('trig', { src: behind.uid, icon: 'ahead' });
    }
    switch (u.kind) {
      case 'rat':
        summon('ratling', L, 1, 1, 1);
        break;
      case 'spider':
        summon('brood', 1, 2 * L, 2 * L, L);
        break;
      case 'ogre':
        summon('ratling', 2, L, L, L);
        break;
      case 'hydra':
        summon('head', 2, 3 * L, 3 * L, L);
        break;
      case 'bat': {
        this.frame('trig', { src: u.uid, icon: 'faint' });
        const foes = this.alive(side === 0 ? 1 : 0);
        for (let i = 0; i < 2 && foes.length; i++) {
          const t = foes.splice(Math.floor(this.rng() * foes.length), 1)[0];
          this.damage(t, L, null, u);
        }
        break;
      }
      case 'mimic': {
        const f = line[idx];
        if (f && f.hp > 0) {
          f.item = this.pick(HELD_POOL) ?? 'toy';
          f.toyUsed = false;
          f.collarUsed = false;
          this.frame('trig', { src: f.uid, icon: 'faint' });
        }
        break;
      }
    }
    // Restless Spirits (Souls import): your first unit to faint returns as a Shade.
    if (side === 0 && this.shadeLvl > 0 && !this.shadeUsed && u.kind !== 'shade') {
      this.shadeUsed = true;
      if (room() > 0) {
        const s = this.token('shade', 0, this.shadeLvl, this.shadeLvl, this.shadeLvl);
        this.lines[0].splice(Math.min(idx, this.lines[0].length), 0, s);
        this.frame('trig', { src: s.uid, icon: 'faint' });
      }
    }
  }

  start(): void {
    const S = this.o.tactics ?? 0;
    const [A, B] = this.lines;
    // Tactics cards (rival side).
    if (S >= 6 && B.length >= 2) {
      const back = B.pop()!;
      B.unshift(back);
    }
    if (S >= 3 && B.length) B[0].armor += 1;
    // War Drums (12): every rival beast +1 attack.
    if (S >= 12) for (const u of B) u.atk += 1;
    // Warding Sigils (Essence import).
    for (let i = 0; i < Math.min(this.o.sigils ?? 0, A.length); i++) A[i].armor += 1;
    this.frame('start');
    // Marked Prey (15): your first-bought unit (the front one if it's gone) takes 3 at the start.
    if (S >= 15 && A.length) {
      const prey = A.find((u) => u.marked) ?? A[0];
      this.damage(prey, 3, null, null);
      this.frame('trig', { src: prey.uid, icon: 'start' });
      this.settle();
    }
    // The Muzzler (hunt): your Start triggers fizzle this bout.
    const muz = B.find((u) => u.kind === 'hunt' && u.hunt === 'muzzle');
    if (muz) {
      this.muzzled = true;
      this.frame('trig', { src: muz.uid, icon: 'start' });
    }
    // Start-of-battle triggers, in total order.
    const starters = this.order([...A, ...B].filter((u) => UNITS[u.kind].trig === 'start' && !(this.muzzled && u.side === 0)));
    for (const u of starters) {
      if (u.hp <= 0 || u.out) continue;
      this.cur = u;
      const foeSide: 0 | 1 = u.side === 0 ? 1 : 0;
      const foes = this.alive(foeSide);
      const friends = this.alive(u.side);
      const L = u.lvl;
      let fired = true;
      switch (u.kind) {
        case 'stirge': {
          const t = this.pick(foes);
          if (t) this.damage(t, L, null);
          else fired = false;
          break;
        }
        case 'rust': {
          const t = foes[0];
          if (t) {
            t.atk = Math.max(1, t.atk - 2 * L);
            t.armor = Math.max(0, t.armor - 1);
          } else fired = false;
          break;
        }
        case 'gorgon': {
          const t = [...foes].sort((x, y) => y.atk - x.atk || this.slot(x) - this.slot(y))[0];
          if (t) t.skip += L;
          else fired = false;
          break;
        }
        case 'wasp':
          for (const f of friends) f.thorns += L;
          break;
        case 'manticore': {
          const ts = [...foes].sort((x, y) => y.hp - x.hp || this.slot(x) - this.slot(y)).slice(0, 2);
          for (const t of ts) this.damage(t, 3 * L, null);
          fired = ts.length > 0;
          break;
        }
        case 'sabre':
          u.atk += L * Math.max(0, LINE_MAX - this.lines[u.side].length);
          break;
        case 'dragon':
          for (const t of foes) this.damage(t, 2 * L, null);
          fired = foes.length > 0;
          break;
        case 'hunt':
          fired = this.huntStart(u, foes, friends);
          break;
        default:
          fired = false;
      }
      if (fired) this.frame('trig', { src: u.uid, icon: 'start' });
      this.settle();
    }
    this.cur = null;
  }

  /** The Huntmaster's Start: his hunt of the bout (units.ts HUNTS). */
  huntStart(u: BU, foes: BU[], friends: BU[]): boolean {
    switch (u.hunt ?? 'net') {
      case 'net': {
        const t = [...foes].sort((x, y) => y.atk - x.atk || this.slot(x) - this.slot(y))[0];
        if (t) t.skip += 1;
        for (const f of friends) if (f !== u) f.atk += 1;
        return true;
      }
      case 'trap':
        if (!foes.length) return false;
        this.damage(foes[0], 4, null, u);
        return true;
      case 'volley': {
        const back = foes.slice(-2);
        for (const t of back) this.damage(t, 2, null, u);
        return back.length > 0;
      }
      case 'muzzle':
        return false; // already resolved before the Start triggers (and framed there)
      case 'hamstring': {
        const t = [...foes].sort((x, y) => y.hp - x.hp || this.slot(x) - this.slot(y))[0];
        if (!t) return false;
        t.atk = Math.max(1, t.atk - 3);
        return true;
      }
    }
    return false;
  }

  /** One front strikes the other front. Returns damage dealt (0 if it skipped). */
  strikeDamage(a: BU, sd: number): number {
    let d = a.atk + sd;
    if (a.item === 'collar' && !a.collarUsed) {
      a.collarUsed = true;
      d += 3;
    }
    return d;
  }

  exchange(): void {
    this.ex++;
    const sd = this.ex >= SUDDEN_DEATH_AT ? 1 + Math.floor((this.ex - SUDDEN_DEATH_AT) / 10) : 0;
    const S = this.o.tactics ?? 0;
    // Pack Healer (tactics 9): the rival rearmost unit heals the front 1.
    if (S >= 9) {
      const B = this.lines[1];
      if (B.length >= 2 && B[0].hp > 0 && B[0].hp < B[0].maxHp) {
        B[0].hp += 1;
        this.frame('trig', { src: B[B.length - 1].uid, icon: 'passive' });
      }
    }
    // Before attack: Bog Leech steals HP.
    for (const side of [0, 1] as const) {
      const f = this.lines[side][0];
      const foe = this.lines[side === 0 ? 1 : 0][0];
      if (f && foe && f.kind === 'leech' && f.hp > 0 && foe.hp > 0) {
        const got = this.damage(foe, f.lvl, f);
        f.hp += got;
        this.frame('trig', { src: f.uid, icon: 'attack' });
      }
    }
    this.settle();
    const a = this.lines[0][0];
    const b = this.lines[1][0];
    if (!a || !b) return;
    // Simultaneous strike.
    const aStrikes = a.skip > 0 ? (a.skip--, false) : true;
    const bStrikes = b.skip > 0 ? (b.skip--, false) : true;
    const da = aStrikes ? this.strikeDamage(a, sd) : 0;
    const db = bStrikes ? this.strikeDamage(b, sd) : 0;
    if (aStrikes) this.damage(b, da, a);
    if (bStrikes) this.damage(a, db, b);
    // Thorns hit back.
    if (aStrikes && b.thorns > 0) this.damage(a, b.thorns, null, b);
    if (bStrikes && a.thorns > 0) this.damage(b, a.thorns, null, a);
    const hit: number[] = [];
    if (aStrikes) hit.push(a.uid);
    if (bStrikes) hit.push(b.uid);
    this.frame('hit', { hit });
    // Dire Wolf: friend ahead attacks.
    for (const [side, striker, struck] of [[0, a, aStrikes], [1, b, bStrikes]] as const) {
      const w = this.lines[side][1];
      if (struck && striker.hp > -999 && w && w.kind === 'wolf' && w.hp > 0) {
        w.atk += w.lvl;
        this.frame('trig', { src: w.uid, icon: 'ahead' });
      }
    }
    this.settle();
    // Wyvern: strike again after a Knockout.
    for (let guard = 0; guard < 8 && this.pendingWyvern.length; guard++) {
      const w = this.pendingWyvern.shift()!;
      const foe = this.lines[w.side === 0 ? 1 : 0][0];
      if (w.hp <= 0 || w.out || !foe || w.wyvernLeft <= 0 || this.lines[w.side][0] !== w) continue;
      w.wyvernLeft--;
      this.damage(foe, w.atk + sd, w);
      if (foe.thorns > 0) this.damage(w, foe.thorns, null, foe);
      this.frame('hit', { hit: [w.uid], src: w.uid, icon: 'ko' });
      this.settle();
    }
    this.pendingWyvern.length = 0;
  }

  run(): BattleResult {
    this.start();
    while (this.lines[0].length && this.lines[1].length && this.ex < EXCHANGE_CAP) this.exchange();
    const a = this.lines[0].length;
    const b = this.lines[1].length;
    const outcome: 1 | 0 | -1 = a && !b ? 1 : b && !a ? -1 : 0;
    this.frame('end');
    const koGains = [...this.koGains.entries()].map(([ref, g]) => ({ ref, ...g }));
    const res: BattleResult = { outcome, exchanges: this.ex, frames: this.frames, koGains };
    if (this.log) res.stats = [...this.tally.values()];
    return res;
  }
}

/** Runs one deterministic battle. Side 0 is yours (front = index 0). */
export function battle(a: Fighter[], b: Fighter[], opts: BattleOpts): BattleResult {
  return new Battle(a, b, opts).run();
}

/** Canonical string of a line, for the battle seed and cache keys. */
export function canon(line: Fighter[]): string {
  return line.map((f) => `${f.kind}${f.lvl}.${f.atk}.${f.hp}${f.item ? f.item[0] : ''}${f.brand ? '*' : ''}${f.hunt && f.hunt !== 'net' ? f.hunt : ''}`).join(',');
}

export function battleSeed(a: Fighter[], b: Fighter[], round: number, pv: number): number {
  return hashStr(canon(a) + '|' + canon(b), round, pv);
}
