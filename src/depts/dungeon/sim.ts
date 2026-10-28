// The Dungeon's fixed-step simulation (specs/01 §14): pure TS, no Pixi. The live scene runs it at
// 20 Hz and renders from it; idleRate runs the same code headless over a few seeds.
import { COLS, entranceOn, idx, lairPost, routeFor, ROWS, FLOOR0, type Grid, type Route } from './map';
import * as M from './model';

export const STEP = 0.05; // 20 Hz
export const MAX_HEROES = 60;

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

export interface SimHero {
  id: number;
  type: M.HeroType;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  atk: number;
  bounty: number;
  dodge: number;
  route: Route;
  dist: number;
  seg: number;
  x: number;
  y: number;
  px: number;
  py: number;
  dir: 1 | -1;
  slowT: number;
  slowF: number;
  bleedT: number;
  bleedDps: number;
  stunT: number;
  blocked: SimMinion | null;
  tile: number;
  party: number;
  sack: number;
  leaked: boolean;
  flash: number;
  dead: boolean;
  gone: boolean;
  chestI: number;
  /** Caged Bait (Captives import): baited loop entrances passed, and the glance timer. */
  baitI: number;
  glanceT: number;
  /** Eye of Gloom aura this step: slow fraction and +damage taken (reset each step). */
  gloomF: number;
  vuln: number;
  /** Inside an Eye of Gloom's aura: Rogues cannot dodge (01 §5.1 "reveals Rogues"). */
  revealed: boolean;
  /** Confusion: walking backward. */
  confT: number;
  /** Wizard: seconds to the next dispel. */
  castT: number;
  /** Bait Chest purses carried (gold-bag pips, M.LOOT_*). */
  loot: number;
  /** Last damage source (receipts: what killed whom) and the source of the current bleed. */
  src: string;
  bleedSrc: string;
}

export interface SimTower {
  id: number;
  kind: M.TowerKind | 'clerk';
  x: number;
  y: number;
  range2: number;
  range: number;
  dmg: number;
  rate: number;
  cd: number;
  pierce: number;
  bleed: number;
  dps: number;
  settle: number;
  active: boolean;
  /** Aura slow (Eye, Cinders brazier) and +damage taken (Withering Eye). */
  slow: number;
  vuln: number;
  /** Ignores armor (Piercer arrows). */
  pierceArmor: boolean;
}

export interface SimMinion {
  id: number; // owning lair piece
  kind: M.LairKind;
  n: number; // index within the lair
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  dps: number;
  cap: number;
  cleave: boolean;
  respawn: number;
  respawnT: number;
  alive: boolean;
  blocked: SimHero[];
  swing: number; // live: attack animation timer
  /** Slime Pit: a split slime (appears when the big one dies; never respawns on a timer). */
  split: boolean;
}

export interface SimRune {
  id: number;
  kind: M.RuneKind;
  x: number;
  y: number;
  slow: number;
  slowDur: number;
  stun: number;
  dmg: number;
  bleed: number;
  charges: number;
  maxCharges: number;
  recharge: number;
  rechargeT: number;
  settle: number;
  flash: number;
  /** Greed: bonus and radius. Confusion: duration, cooldown and its timer. */
  bonus: number;
  radius: number;
  confuse: number;
  cool: number;
  coolT: number;
  champConfuse: boolean;
  /** Dispelled by a Wizard (seconds left). */
  off: number;
}

export type SimEvent =
  | { t: 'shot'; kind: 'arrow' | 'ballista' | 'clerk'; x1: number; y1: number; x2: number; y2: number; miss: boolean }
  | { t: 'kill'; x: number; y: number; amount: number; hero: M.HeroType; sack: number; recover: number; by: 'glare' | 'other'; greed: boolean; src: string; loot: number }
  | { t: 'leak'; x: number; y: number; hero: M.HeroType; sack: number }
  | { t: 'escape'; hero: M.HeroType; sack: number; loot: number }
  | { t: 'rune'; x: number; y: number; kind: M.RuneKind }
  | { t: 'trapped'; x: number; y: number }
  | { t: 'sunk'; x: number; y: number }
  | { t: 'dispel'; x: number; y: number; rx: number; ry: number }
  | { t: 'party'; n: number; champ: boolean; bonus: number; gong: number }
  | { t: 'partyDone'; size: number; leaked: number; rc?: Receipt }
  | { t: 'minionDown'; x: number; y: number; split: boolean }
  | { t: 'loot'; x: number; y: number; hero: M.HeroType };

/** Live only: one party's tally for Ledger-Bones' receipt (what killed whom, what leaked). */
export interface Receipt {
  n: number;
  size: number;
  /** Kills by source (piece kind, 'glare', 'clerk'). */
  kills: Record<string, number>;
  /** Kill pay plus recovery bonuses (before core multipliers, like the floats). */
  earned: number;
  /** Plunder carried off (sacks taken minus sacks recovered). */
  stolen: number;
  leakers: M.HeroType[];
  /** Looters (gold-bag pips) killed, and looters that escaped with their purse. */
  looters: number;
  lootEsc: number;
  /** Earliness of the Gong that called this party (-1: it came on the bell). */
  gong: number;
  champ: boolean;
}

export interface SimSetup {
  pieces: M.PieceSave[];
  bait: number[];
  ws: M.Workshop;
  lure: number;
  party: number;
  seed: number;
  live: boolean;
  /** The floor's grid (default: floor 0 as authored). */
  grid?: Grid;
  /** Goods imports (00 §4): Iron-shod Towers armor pierce, Caged Bait level. */
  ap?: number;
  caged?: number;
}

interface PartyRec {
  size: number;
  done: number;
  leaked: number;
  bonus: number;
  looted: boolean;
  /** Bait Chest purses taken by this party (bit per chest on the route). */
  chests: number;
  rc: Receipt | null;
}

export class Sim {
  t = 0;
  live: boolean;
  lure: number;
  ws: M.Workshop;
  grid: Grid;
  route: Route;
  rogueRoute: Route;
  heroes: SimHero[] = [];
  towers: SimTower[] = [];
  minions: SimMinion[] = [];
  runes: SimRune[] = [];
  runeAt = new Int16Array(COLS * ROWS).fill(-1);
  queue: M.HeroType[][] = [];
  spawnQ: { type: M.HeroType; party: number }[] = [];
  spawnT = 0;
  partyN: number;
  partyTimer = 3;
  gongStack = 0;
  /** Earliness of the last Gong (scene: Glare cooldown cut, juice). */
  lastGongF = 0;
  trapCharges = 1;
  trap: { x: number; y: number; t: number } | null = null;
  parties = new Map<number, PartyRec>();
  history: { size: number; leaked: number }[] = [];
  events: SimEvent[] = [];
  /** Live: called when a hero reaches the Hoard; returns the sack actually taken from the bank. */
  stealFn: ((h: SimHero) => number) | null = null;
  // headless accounting
  earned = 0;
  stolen = 0;
  /** Headless: net Plunder per party id (kills minus steals), for steady-state measurement. */
  partyNet = new Map<number, number>();
  resolvedParties = new Set<number>();
  partyStats = new Map<number, { size: number; leaked: number }>();
  spawned = 0;
  leaks = 0;
  private rng: () => number;
  private nextHero = 1;
  /** Iron-shod Towers: armor ignored by tower and minion hits. */
  ap = 0;
  /** Caged Bait level: L1 rogues glance 1 s at each baited loop's entrance; L2-3 +10% purse each
   * on parties that loot a Bait Chest. */
  caged = 0;
  /** Route distance (on the rogues' route) of each baited loop's entrance. */
  private baitAt: number[] = [];
  private hasCleric = false;
  private hasGreed = false;

  constructor(s: SimSetup) {
    this.live = s.live;
    this.ap = Math.max(0, Math.min(3, s.ap ?? 0));
    this.caged = Math.max(0, Math.min(3, s.caged ?? 0));
    this.lure = s.lure;
    this.ws = s.ws;
    this.partyN = s.party;
    this.rng = mulberry32(s.seed);
    this.grid = s.grid ?? FLOOR0;
    this.route = routeFor(this.grid, s.bait);
    this.rogueRoute = routeFor(this.grid, [], true);
    this.setLayout(s.pieces, s.bait, s.ws, undefined, this.grid);
    this.regenQueue();
  }

  // ---------- setup ----------

  setLure(T: number): void {
    if (T === this.lure) return;
    this.lure = T;
    this.regenQueue();
  }

  regenQueue(): void {
    this.queue = [this.genParty(this.partyN), this.genParty(this.partyN + 1)];
  }

  private genParty(n: number): M.HeroType[] {
    const T = this.lure;
    const champ = M.isChampParty(n, T);
    const size = M.partySize(T) - (champ ? 1 : 0);
    const out: M.HeroType[] = [];
    let tot = 0;
    for (const [, w, at] of M.HERO_WEIGHTS) if (T >= at) tot += w;
    for (let i = 0; i < size; i++) {
      let r = this.rng() * tot;
      let pick: M.HeroType = 'squire';
      for (const [t, w, at] of M.HERO_WEIGHTS) {
        if (T < at) continue;
        if (r < w) {
          pick = t;
          break;
        }
        r -= w;
      }
      out.push(pick);
    }
    // Slow, tough heroes walk at the back so the party reads at a glance.
    out.sort((a, b) => HERO_ORDER[a] - HERO_ORDER[b]);
    if (champ) out.push('champ');
    return out;
  }

  /**
   * Rebuilds towers, lairs and runes from the save. `settle` maps piece id -> inactive seconds.
   * A new `grid` (Dig, floor switch) re-routes heroes already on the field from their position.
   */
  setLayout(pieces: M.PieceSave[], bait: number[], ws: M.Workshop, settle?: Map<number, number>, grid?: Grid): void {
    this.ws = ws;
    const regrid = !!grid && grid.key !== this.grid.key;
    if (grid) this.grid = grid;
    this.route = routeFor(this.grid, bait);
    this.rogueRoute = routeFor(this.grid, [], true);
    this.baitAt = this.route.chestAt.length
      ? bait.filter((b) => this.grid.spots.includes(b)).map((b) => entranceOn(this.grid, this.rogueRoute, b)).sort((x, y) => x - y)
      : [];
    for (const h of this.heroes) {
      h.blocked = null;
      // A new grid may remove tiles under an old route: re-route from where each hero stands. A new
      // bait set leaves heroes already on the field on their route (as the MVP did).
      if (regrid) this.reroute(h, h.type === 'rogue' ? this.rogueRoute : this.route);
    }
    // Keep minion health/respawn and rune charges across rebuilds (upgrades must not heal for free).
    const oldM = new Map(this.minions.map((m) => [`${m.id}.${m.n}`, m]));
    const oldR = new Map(this.runes.map((r) => [r.id, r]));
    this.towers = [];
    this.minions = [];
    this.runes = [];
    this.runeAt.fill(-1);
    const tm = M.towerMult(ws);
    const sm = M.summonMult(ws);
    const rm = M.runeMult(ws);
    const rp = 1 + 0.5 * (rm - 1); // rune potency for percentages
    const g = this.grid;
    for (const p of pieces) {
      const lm = M.levelMult(p.l);
      const rb = M.rangeBonus(p.l);
      const b = p.b;
      const b2 = p.l >= M.BRANCH_LEVEL2 ? (p.b2 ?? 0) : 0;
      const st = settle?.get(p.id) ?? 0;
      const cx = p.x + 0.5;
      const cy = p.y + 0.5;
      const tw = (kind: M.TowerKind, range: number, o: Partial<SimTower>) =>
        this.towers.push({
          id: p.id, kind, x: cx, y: cy, range, range2: range * range, dmg: 0, rate: 1, cd: 0, pierce: 1, bleed: 0, dps: 0,
          settle: st, active: false, slow: 0, vuln: 0, pierceArmor: false, ...o,
        });
      switch (p.k) {
        case 'arrow':
          tw('arrow', 3 + rb, {
            dmg: 4 * lm * tm * (b === 1 ? 2.2 : 1),
            rate: 1.2 * (b === 1 ? 0.6 : 1) * (b2 === 1 ? 1.5 : 1),
            bleed: b === 2 ? 2 * lm * tm : 0,
            pierceArmor: b2 === 2,
          });
          break;
        case 'brazier':
          tw('brazier', 1.5 + rb + (b === 1 ? 0.7 : 0), { dps: 3 * lm * tm * (b === 2 ? 1.7 : 1) * (b2 === 1 ? 1.4 : 1), slow: b2 === 2 ? 0.2 : 0 });
          break;
        case 'ballista':
          tw('ballista', 5 + rb, { dmg: 30 * lm * tm * (b === 1 ? 2 : 1) * (b2 === 1 ? 1.5 : 1), rate: 0.4 * (b === 2 ? 1.25 : 1) * (b2 === 2 ? 1.6 : 1), pierce: b === 2 ? 5 : 3 });
          break;
        case 'eye':
          tw('eye', 2 + rb + (b === 2 ? 1 : 0) + (b2 === 2 ? 0.5 : 0), {
            slow: Math.min(0.6, ((b === 1 ? 0.4 : 0.25) + 0.01 * (p.l - 1) + (b2 === 2 ? 0.15 : 0))),
            vuln: b2 === 1 ? 0.2 : 0,
          });
          break;
        case 'crypt':
        case 'slime':
        case 'ogre': {
          const post = lairPost(g, p.x, p.y);
          if (!post) break;
          const base = { id: p.id, kind: p.k, px: post[0] + 0.5, py: post[1] + 0.5, blocked: [] as SimHero[], swing: 0 };
          if (p.k === 'ogre') {
            const hp = 200 * lm * sm * (b === 2 ? 1.5 : 1) * (b2 === 1 ? 1.3 : b2 === 2 ? 2 : 1);
            const dps = 12 * lm * sm * (b === 1 ? 1.7 : 1) * (b2 === 1 ? 1.5 : 1);
            this.minions.push({ ...base, n: 0, hp, maxHp: hp, dps, cap: b === 2 ? 3 : 2, cleave: true, respawn: 20, respawnT: st, alive: st <= 0, split: false });
          } else if (p.k === 'crypt') {
            const n = 2 + (b === 1 ? 1 : 0) + (b2 === 1 ? 1 : 0);
            const hp = 30 * lm * sm * (b === 2 ? 2.5 : 1);
            const dps = 3 * lm * sm;
            const respawn = b2 === 2 ? 4 : 8;
            for (let i = 0; i < n; i++) this.minions.push({ ...base, blocked: [], n: i, hp, maxHp: hp, dps, cap: 1, cleave: false, respawn, respawnT: st, alive: st <= 0, split: false });
          } else {
            const hp = 50 * lm * sm * (b === 1 ? 2 : 1);
            const dps = 2 * lm * sm * (b === 2 ? 2 : 1);
            const cap = b2 === 2 ? 2 : 1;
            this.minions.push({ ...base, n: 0, hp, maxHp: hp, dps, cap, cleave: false, respawn: 12, respawnT: st, alive: st <= 0, split: false });
            const splits = b2 === 1 ? 3 : 2;
            const shp = 20 * lm * sm * (b === 1 ? 2 : 1);
            for (let i = 1; i <= splits; i++)
              this.minions.push({ ...base, blocked: [], n: i, hp: shp, maxHp: shp, dps: dps * 0.6, cap: 1, cleave: false, respawn: Infinity, respawnT: Infinity, alive: false, split: true });
          }
          break;
        }
        case 'mire':
        case 'spikes':
        case 'greed':
        case 'confusion': {
          const i = this.runes.length;
          const r: SimRune = {
            id: p.id, kind: p.k, x: p.x, y: p.y, slow: 0, slowDur: 0, stun: 0, dmg: 0, bleed: 0, charges: 0, maxCharges: 0,
            recharge: 4, rechargeT: 0, settle: st, flash: 0, bonus: 0, radius: 0, confuse: 0, cool: 0, coolT: 0, champConfuse: false, off: 0,
          };
          if (p.k === 'mire') {
            r.slow = Math.min(0.7, (b === 1 ? 0.55 : 0.4) * rp);
            r.slowDur = 2 * (1 + 0.08 * (p.l - 1)) * (b2 === 1 ? 1.6 : 1);
            r.stun = b === 2 ? 0.08 * (b2 === 2 ? 2 : 1) : 0;
          } else if (p.k === 'spikes') {
            r.dmg = 8 * lm * rm * (b === 1 ? 1.8 : 1) * (b2 === 1 ? 1.6 : 1);
            r.bleed = b2 === 2 ? 3 * lm * rm : 0;
            r.charges = r.maxCharges = b === 2 ? 5 : 3;
            r.recharge = b === 2 ? 2 : 4;
          } else if (p.k === 'greed') {
            r.bonus = M.GREED_BONUS * (1 + 0.05 * (p.l - 1)) * rp * (b === 1 ? 1.5 : 1) * (b2 === 1 ? 1.3 : 1);
            r.radius = (b === 2 ? 3 : M.GREED_RADIUS) + (b2 === 2 ? 1 : 0) + rb;
          } else {
            r.confuse = (b === 1 ? 2.5 : M.CONFUSE_S) * (1 + 0.04 * (p.l - 1)) * (b2 === 1 ? 1.4 : 1);
            r.cool = (b === 2 ? 6 : M.CONFUSE_CD) * (b2 === 2 ? 0.6 : 1);
            r.champConfuse = b2 === 1;
          }
          this.runes.push(r);
          this.runeAt[idx(p.x, p.y)] = i;
          break;
        }
      }
    }
    for (const m of this.minions) {
      const o = oldM.get(`${m.id}.${m.n}`);
      if (!o || o.kind !== m.kind) continue;
      if (m.split) {
        m.alive = o.alive;
        m.hp = o.alive ? Math.min(m.maxHp, m.maxHp * (o.hp / o.maxHp)) : m.maxHp;
        continue;
      }
      if (m.respawnT > 0) continue;
      m.alive = o.alive;
      m.respawnT = o.respawnT;
      m.hp = o.alive ? Math.min(m.maxHp, m.maxHp * (o.hp / o.maxHp)) : m.maxHp;
    }
    for (const r of this.runes) {
      const o = oldR.get(r.id);
      if (o && o.kind === r.kind) {
        r.charges = Math.min(r.maxCharges, o.charges);
        r.off = o.off;
        r.coolT = Math.min(r.cool, o.coolT);
      }
    }
    this.hasGreed = this.runes.some((r) => r.kind === 'greed');
    // Ledger-Bones throws bones from the Hoard (starter kit, 01 §4).
    const [hx, hy] = g.hoard;
    this.towers.push({
      id: 0, kind: 'clerk', x: hx + 0.5, y: hy + 0.5, range: M.CLERK.range, range2: M.CLERK.range ** 2,
      dmg: M.CLERK.dmg, rate: M.CLERK.rate, cd: 0, pierce: 1, bleed: 0, dps: 0, settle: 0, active: false, slow: 0, vuln: 0, pierceArmor: false,
    });
  }

  /** Moves a hero onto a new route at the nearest point (Dig / chest change mid-walk). */
  private reroute(h: SimHero, r: Route): void {
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < r.n; k++) {
      const d = (r.xs[k] - h.x) ** 2 + (r.ys[k] - h.y) ** 2;
      if (d < bd - 1e-9) {
        bd = d;
        best = k;
      }
    }
    h.route = r;
    h.dist = h.dir < 0 ? Math.min(r.cum[best], r.len) : r.cum[best];
    h.seg = Math.min(best, r.n - 2);
    h.chestI = r.chestAt.filter((c) => c < h.dist).length;
    this.place(h);
  }

  // ---------- active verbs ----------

  /** Gong (Kingdom Rush's early call): the next party now, with a bonus that grows with how much
   * of the timer is left. Refused while the previous party is still filing in. */
  gong(): boolean {
    if (!this.gongReady) return false;
    const f = M.gongEarly(this.partyTimer);
    this.gongStack = Math.min(M.GONG_MAX, this.gongStack + 1);
    const trap = f >= M.GONG_TRAP_F ? Math.min(M.TRAP_MAX, this.trapCharges + 1) : 1;
    this.launch(M.gongBonus(this.gongStack, f), f);
    this.trapCharges = trap;
    this.lastGongF = f;
    return true;
  }

  openTrap(x: number, y: number): boolean {
    if (this.trapCharges <= 0) return false;
    this.trapCharges--;
    this.trap = { x, y, t: M.TRAP_OPEN };
    return true;
  }

  /** Direct damage (Glare). Ignores armor. */
  smite(h: SimHero, dmg: number): void {
    this.hurt(h, dmg, true, 'glare', true);
    if (!h.dead) h.flash = 0.15;
  }

  get gongReady(): boolean {
    return !this.spawnQ.length && this.partyTimer <= M.PARTY_EVERY - M.GONG_GAP;
  }

  leakFrac(): number {
    let s = 0;
    let l = 0;
    for (const p of this.history) {
      s += p.size;
      l += p.leaked;
    }
    return s ? l / s : 0;
  }

  get champOnField(): boolean {
    return this.heroes.some((h) => h.type === 'champ' && !h.dead);
  }

  // ---------- step ----------

  step(dt = STEP): void {
    this.t += dt;
    this.partyTimer -= dt;
    if (this.partyTimer <= 0) {
      this.gongStack = 0;
      this.launch(0);
    }
    if (this.spawnQ.length) {
      this.spawnT -= dt;
      while (this.spawnT <= 0 && this.spawnQ.length && this.heroes.length < MAX_HEROES) {
        const s = this.spawnQ.shift()!;
        this.spawnHero(s.type, s.party);
        this.spawnT += M.SPAWN_GAP;
      }
    }
    this.auras();
    this.moveHeroes(dt);
    if (this.minions.length) this.blockAndFight(dt);
    this.fireTowers(dt);
    if (this.hasCleric) this.heal(dt);
    this.updateRunes(dt);
    if (this.trap) this.updateTrap(dt);
    // Compact.
    let w = 0;
    let cl = false;
    for (let i = 0; i < this.heroes.length; i++) {
      const h = this.heroes[i];
      if (!h.dead && !h.gone) {
        this.heroes[w++] = h;
        if (h.type === 'cleric') cl = true;
      }
    }
    this.heroes.length = w;
    this.hasCleric = cl;
  }

  private launch(bonus: number, gongF = -1): void {
    const spec = this.queue.shift() ?? this.genParty(this.partyN);
    const id = this.partyN++;
    this.queue.push(this.genParty(this.partyN + 1));
    const champ = spec.includes('champ');
    const rc: Receipt | null = this.live
      ? { n: id, size: spec.length, kills: {}, earned: 0, stolen: 0, leakers: [], looters: 0, lootEsc: 0, gong: gongF, champ }
      : null;
    this.parties.set(id, { size: spec.length, done: 0, leaked: 0, bonus, looted: false, chests: 0, rc });
    if (!this.spawnQ.length) this.spawnT = 0;
    for (const type of spec) this.spawnQ.push({ type, party: id });
    this.partyTimer = M.PARTY_EVERY;
    this.trapCharges = 1;
    this.emit({ t: 'party', n: id, champ, bonus, gong: gongF });
  }

  private spawnHero(type: M.HeroType, party: number): void {
    const T = this.lure;
    const d = M.HEROES[type];
    const route = type === 'rogue' ? this.rogueRoute : this.route;
    const hp = d.hp * M.hpScale(T);
    this.heroes.push({
      id: this.nextHero++, type, hp, maxHp: hp, armor: M.heroArmor(type, T), speed: d.spd, atk: d.atk * M.atkScale(T),
      bounty: d.b * M.bountyScale(T) * M.floorBounty(this.grid.f), dodge: d.dodge, route, dist: 0, seg: 0, x: route.xs[0], y: route.ys[0],
      px: route.xs[0], py: route.ys[0], dir: 1, slowT: 0, slowF: 0, bleedT: 0, bleedDps: 0, stunT: 0, blocked: null,
      tile: -1, party, sack: 0, leaked: false, flash: 0, dead: false, gone: false, chestI: 0, baitI: 0, glanceT: 0,
      gloomF: 0, vuln: 0, revealed: false, confT: 0, castT: type === 'wizard' ? M.WIZ_EVERY / 2 : 0,
      loot: 0, src: '', bleedSrc: '',
    });
    if (type === 'cleric') this.hasCleric = true;
    this.spawned++;
  }

  private place(h: SimHero): void {
    const r = h.route;
    let s = h.seg;
    while (s < r.n - 2 && r.cum[s + 1] < h.dist) s++;
    while (s > 0 && r.cum[s] > h.dist) s--;
    h.seg = s;
    const seg = r.cum[s + 1] - r.cum[s];
    const f = seg > 0 ? (h.dist - r.cum[s]) / seg : 0;
    h.x = r.xs[s] + (r.xs[s + 1] - r.xs[s]) * f;
    h.y = r.ys[s] + (r.ys[s + 1] - r.ys[s]) * f;
  }

  /** Eye of Gloom and Cinders auras: slow and vulnerability for this step. */
  private auras(): void {
    for (const h of this.heroes) {
      h.gloomF = 0;
      h.vuln = 0;
      h.revealed = false;
    }
    for (const tw of this.towers) {
      if (tw.settle > 0 || (tw.slow <= 0 && tw.vuln <= 0)) continue;
      for (const h of this.heroes) {
        if (h.dead || h.gone) continue;
        const dx = h.x - tw.x;
        const dy = h.y - tw.y;
        if (dx * dx + dy * dy > tw.range2) continue;
        if (tw.kind === 'eye') tw.active = true;
        h.gloomF = Math.max(h.gloomF, h.type === 'champ' ? tw.slow * 0.5 : tw.slow);
        h.vuln = Math.max(h.vuln, tw.vuln);
        if (tw.kind === 'eye') h.revealed = true;
      }
    }
  }

  private moveHeroes(dt: number): void {
    const g = this.grid;
    for (const h of this.heroes) {
      h.px = h.x;
      h.py = h.y;
      if (h.dead || h.gone) continue;
      if (h.flash > 0) h.flash -= dt;
      if (h.bleedT > 0) {
        h.bleedT -= dt;
        this.hurt(h, h.bleedDps * dt, true, h.bleedSrc);
        if (h.dead) continue;
      }
      if (h.type === 'wizard' && h.dir > 0) this.cast(h, dt);
      if (h.slowT > 0) h.slowT -= dt;
      if (h.stunT > 0) {
        h.stunT -= dt;
        continue;
      }
      if (h.glanceT > 0) {
        h.glanceT -= dt;
        continue;
      }
      if (h.blocked) continue;
      let spd = h.speed * (h.dir < 0 ? 1.3 : 1);
      if (h.slowT > 0) spd *= 1 - h.slowF;
      if (h.gloomF > 0) spd *= 1 - h.gloomF;
      if (h.type === 'rogue' && h.tile >= 0 && g.water[h.tile]) spd *= M.WATER_ROGUE;
      let dir = h.dir;
      if (h.confT > 0) {
        h.confT -= dt;
        dir = -dir as 1 | -1;
      }
      h.dist += spd * dt * dir;
      if (h.dist >= h.route.len) {
        h.dist = h.route.len;
        if (h.dir > 0 && dir > 0) {
          this.reachHoard(h);
          this.place(h);
          continue;
        }
      } else if (h.dist <= 0) {
        h.dist = 0;
        if (h.dir < 0 && dir < 0) {
          this.escape(h);
          continue;
        }
      }
      this.place(h);
      if (dir < 0) {
        h.tile = idx(Math.floor(h.x), Math.floor(h.y));
        continue;
      }
      if (h.type === 'rogue' && h.dir > 0 && this.caged > 0 && h.baitI < this.baitAt.length && h.dist >= this.baitAt[h.baitI]) {
        // Caged Bait: a glance at the captive, no detour (Rogues still ignore Bait Chests, W-15).
        h.baitI++;
        h.glanceT = 1;
      }
      if (h.dir > 0 && h.chestI < h.route.chestAt.length && h.dist >= h.route.chestAt[h.chestI]) {
        // Fatten, then feast: the first of each party to reach a chest takes its purse.
        const bit = 1 << Math.min(30, h.chestI);
        h.chestI++;
        const p = this.parties.get(h.party);
        if (p && !(p.chests & bit) && h.type !== 'champ') {
          p.chests |= bit;
          p.looted = true;
          h.loot++;
          this.emit({ t: 'loot', x: h.x, y: h.y, hero: h.type });
        }
      }
      const tile = idx(Math.floor(h.x), Math.floor(h.y));
      if (tile !== h.tile) {
        h.tile = tile;
        const ri = this.runeAt[tile];
        if (ri >= 0 && h.dir > 0) this.triggerRune(this.runes[ri], h);
      }
    }
  }

  /** Wizard: every WIZ_EVERY s, dispel the nearest live rune within WIZ_RANGE tiles. */
  private cast(h: SimHero, dt: number): void {
    h.castT -= dt;
    if (h.castT > 0) return;
    h.castT = M.WIZ_EVERY;
    let best: SimRune | null = null;
    let bd = M.WIZ_RANGE * M.WIZ_RANGE;
    for (const r of this.runes) {
      if (r.off > 0) continue;
      const d = (r.x + 0.5 - h.x) ** 2 + (r.y + 0.5 - h.y) ** 2;
      if (d <= bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) {
      h.castT = 1; // nothing in range: look again soon
      return;
    }
    best.off = M.WIZ_OFF;
    this.emit({ t: 'dispel', x: h.x, y: h.y, rx: best.x, ry: best.y });
  }

  /** Clerics heal allies within CLERIC_RANGE (01 §5.1). */
  private heal(dt: number): void {
    const amt = M.CLERIC_HEAL * M.hpScale(this.lure) * dt;
    const r2 = M.CLERIC_RANGE * M.CLERIC_RANGE;
    for (const c of this.heroes) {
      if (c.type !== 'cleric' || c.dead || c.gone) continue;
      for (const h of this.heroes) {
        if (h === c || h.dead || h.gone || h.hp >= h.maxHp) continue;
        const dx = h.x - c.x;
        const dy = h.y - c.y;
        if (dx * dx + dy * dy <= r2) h.hp = Math.min(h.maxHp, h.hp + amt);
      }
    }
  }

  private blockAndFight(dt: number): void {
    const ms = this.minions;
    for (const m of ms) {
      if (!m.blocked.length) continue;
      let w = 0;
      for (const h of m.blocked) if (!h.dead && !h.gone && h.blocked === m) m.blocked[w++] = h;
      m.blocked.length = w;
    }
    for (const h of this.heroes) {
      if (h.dead || h.gone || h.blocked || h.confT > 0) continue;
      for (const m of ms) {
        if (!m.alive || m.blocked.length >= m.cap) continue;
        const dx = h.x - m.px;
        const dy = h.y - m.py;
        if (dx * dx + dy * dy < 0.09) {
          h.blocked = m;
          m.blocked.push(h);
          break;
        }
      }
    }
    for (const m of ms) {
      if (!m.alive) {
        if (m.split) continue;
        m.respawnT -= dt;
        if (m.respawnT <= 0) {
          m.alive = true;
          m.hp = m.maxHp;
        }
        continue;
      }
      if (m.swing > 0) m.swing -= dt;
      if (!m.blocked.length) continue;
      let incoming = 0;
      for (const h of m.blocked) incoming += h.atk;
      const hits = m.cleave ? m.blocked.length : 1;
      for (let i = 0; i < hits && i < m.blocked.length; i++) {
        const h = m.blocked[i];
        this.hurt(h, m.dps * dt * (h.type === 'champ' ? 0.5 : 1), true, m.kind);
      }
      if (m.swing <= 0) m.swing = 0.5;
      m.hp -= incoming * dt;
      if (m.hp <= 0) {
        m.alive = false;
        m.respawnT = m.respawn;
        for (const h of m.blocked) if (h.blocked === m) h.blocked = null;
        m.blocked.length = 0;
        this.emit({ t: 'minionDown', x: m.px, y: m.py, split: m.kind === 'slime' && !m.split });
        if (m.kind === 'slime' && !m.split) {
          // The big slime splits into smaller ones on its post.
          for (const s of ms) if (s.id === m.id && s.split && !s.alive) {
            s.alive = true;
            s.hp = s.maxHp;
          }
        }
      }
    }
  }

  private prio(h: SimHero): number {
    const f = h.dist / h.route.len;
    return h.dir > 0 ? f : 2 - f; // thieves first, then whoever is closest to the Hoard
  }

  private fireTowers(dt: number): void {
    const hs = this.heroes;
    for (const tw of this.towers) {
      if (tw.settle > 0) {
        tw.settle -= dt;
        tw.active = false;
        continue;
      }
      if (tw.kind === 'eye') continue; // aura only (auras())
      if (tw.kind === 'brazier') {
        tw.active = false;
        const d = tw.dps * dt;
        for (const h of hs) {
          if (h.dead || h.gone) continue;
          const dx = h.x - tw.x;
          const dy = h.y - tw.y;
          if (dx * dx + dy * dy <= tw.range2) {
            tw.active = true;
            this.hurt(h, d, true, 'brazier');
          }
        }
        continue;
      }
      tw.cd -= dt;
      if (tw.cd > 0) continue;
      let best: SimHero | null = null;
      let bp = -1;
      for (const h of hs) {
        if (h.dead || h.gone) continue;
        const dx = h.x - tw.x;
        const dy = h.y - tw.y;
        if (dx * dx + dy * dy > tw.range2) continue;
        const p = this.prio(h);
        if (p > bp) {
          bp = p;
          best = h;
        }
      }
      if (!best) {
        tw.cd = 0;
        continue;
      }
      tw.cd = Math.max(tw.cd, -0.2) + 1 / tw.rate;
      if (tw.kind === 'ballista') this.ballista(tw, best);
      else {
        // An Eye of Gloom reveals Rogues: no dodging inside its aura.
        const miss = best.dodge > 0 && !best.revealed && this.rng() < best.dodge;
        this.emit({ t: 'shot', kind: tw.kind as 'arrow' | 'clerk', x1: tw.x, y1: tw.y, x2: best.x, y2: best.y, miss });
        if (!miss) {
          this.hurt(best, tw.dmg, tw.pierceArmor, tw.kind);
          if (tw.bleed > 0 && !best.dead) {
            best.bleedT = 3;
            best.bleedDps = Math.max(best.bleedDps, tw.bleed);
            best.bleedSrc = tw.kind;
          }
        }
      }
    }
  }

  /** A bolt from the tower through the target to full range, piercing up to `pierce` heroes. */
  private ballista(tw: SimTower, target: SimHero): void {
    let dx = target.x - tw.x;
    let dy = target.y - tw.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const ex = tw.x + dx * tw.range;
    const ey = tw.y + dy * tw.range;
    this.emit({ t: 'shot', kind: 'ballista', x1: tw.x, y1: tw.y, x2: ex, y2: ey, miss: false });
    let hits = 0;
    const tryHit = (h: SimHero) => {
      if (h.dodge > 0 && !h.revealed && this.rng() < h.dodge) return;
      this.hurt(h, tw.dmg, false, 'ballista');
      hits++;
    };
    tryHit(target);
    for (const h of this.heroes) {
      if (hits >= tw.pierce) break;
      if (h === target || h.dead || h.gone) continue;
      const rx = h.x - tw.x;
      const ry = h.y - tw.y;
      const along = rx * dx + ry * dy;
      if (along < 0 || along > tw.range) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 0.45) tryHit(h);
    }
  }

  private triggerRune(r: SimRune, h: SimHero): void {
    if (r.settle > 0 || r.off > 0) return;
    if (r.kind === 'mire') {
      h.slowF = h.slowT > 0 ? Math.max(h.slowF, r.slow) : r.slow;
      h.slowT = r.slowDur;
      if (r.stun > 0 && h.type !== 'champ' && this.rng() < r.stun) {
        h.stunT = 1.5;
        this.emit({ t: 'sunk', x: h.x, y: h.y });
      }
      r.flash = 0.3;
      this.emit({ t: 'rune', x: r.x, y: r.y, kind: 'mire' });
    } else if (r.kind === 'spikes') {
      if (r.charges < 1) return;
      r.charges--;
      r.flash = 0.3;
      this.hurt(h, r.dmg, false, 'spikes');
      if (r.bleed > 0 && !h.dead) {
        h.bleedT = 3;
        h.bleedDps = Math.max(h.bleedDps, r.bleed);
        h.bleedSrc = 'spikes';
      }
      this.emit({ t: 'rune', x: r.x, y: r.y, kind: 'spikes' });
    } else if (r.kind === 'confusion') {
      if (r.coolT > 0) return;
      if (h.type === 'champ' && !r.champConfuse) return;
      r.coolT = r.cool;
      r.flash = 0.4;
      h.confT = h.type === 'champ' ? r.confuse * 0.5 : r.confuse;
      this.release(h);
      this.emit({ t: 'rune', x: r.x, y: r.y, kind: 'confusion' });
    }
  }

  private updateRunes(dt: number): void {
    for (const r of this.runes) {
      if (r.settle > 0) r.settle -= dt;
      if (r.flash > 0) r.flash -= dt;
      if (r.off > 0) r.off -= dt;
      if (r.coolT > 0) r.coolT -= dt;
      if (r.charges < r.maxCharges) {
        r.rechargeT -= dt;
        if (r.rechargeT <= 0) {
          r.charges++;
          r.rechargeT = r.recharge;
        }
      } else r.rechargeT = r.recharge;
    }
  }

  private updateTrap(dt: number): void {
    const tr = this.trap!;
    tr.t -= dt;
    for (const h of this.heroes) {
      if (h.dead || h.gone || h.dir < 0 || h.type === 'champ') continue;
      if (Math.floor(h.x) !== tr.x || Math.floor(h.y) !== tr.y) continue;
      this.emit({ t: 'trapped', x: h.x, y: h.y });
      this.release(h);
      h.dist = 0;
      h.seg = 0;
      h.chestI = 0;
      h.tile = -1;
      h.confT = 0;
      this.place(h);
      h.px = h.x;
      h.py = h.y;
      h.stunT = 0.6;
    }
    if (tr.t <= 0) this.trap = null;
  }

  // ---------- damage and outcomes ----------

  private release(h: SimHero): void {
    const m = h.blocked;
    if (!m) return;
    h.blocked = null;
    const i = m.blocked.indexOf(h);
    if (i >= 0) m.blocked.splice(i, 1);
  }

  private hurt(h: SimHero, raw: number, ignoreArmor: boolean, src: string, glare = false): void {
    if (h.dead || h.gone) return;
    h.src = src;
    let d = ignoreArmor ? raw : Math.max(1, raw - Math.max(0, h.armor - this.ap));
    if (h.vuln > 0) d *= 1 + h.vuln;
    h.hp -= d;
    if (!ignoreArmor) h.flash = 0.08;
    if (h.hp <= 0) this.kill(h, glare);
  }

  /** Greed runes: the best bonus among live runes within their radius of (x, y). */
  private greedAt(x: number, y: number): number {
    let b = 0;
    for (const r of this.runes) {
      if (r.kind !== 'greed' || r.off > 0 || r.settle > 0) continue;
      const d2 = (r.x + 0.5 - x) ** 2 + (r.y + 0.5 - y) ** 2;
      if (d2 <= r.radius * r.radius) b = Math.max(b, r.bonus);
    }
    return b;
  }

  private kill(h: SimHero, glare: boolean): void {
    h.dead = true;
    this.release(h);
    const p = this.parties.get(h.party);
    const bonus = p?.bonus ?? 0;
    const purse = p?.looted && this.caged > 1 ? 1 + 0.1 * (this.caged - 1) : 1;
    const greed = this.hasGreed && !(h.leaked && h.type === 'champ') ? this.greedAt(h.x, h.y) : 0;
    const full = h.bounty * (1 + bonus) * M.plunderMult(this.ws) * purse * (1 + greed) * (1 + M.LOOT_BONUS * h.loot);
    // D-dungeon-01: a thief caught on the way out pays the sack back plus a recovery bonus on its
    // *bounty* (RECOVER_BONUS of the kill), carved out of that kill's pay (a Champion that reached
    // the Hoard pays only the bonus). Letting a hero in and killing it later never beats killing it
    // before the Hoard.
    const amount = h.leaked ? (h.type === 'champ' ? 0 : full * (1 - M.RECOVER_BONUS)) : full;
    const recover = h.leaked ? full * M.RECOVER_BONUS : 0;
    this.earned += amount;
    let net = amount;
    if (h.sack > 0 || recover > 0) {
      this.stolen -= h.sack + recover;
      net += h.sack + recover;
    }
    if (!this.live) this.partyNet.set(h.party, (this.partyNet.get(h.party) ?? 0) + net);
    const rc = p?.rc;
    if (rc) {
      const src = h.src || 'other';
      rc.kills[src] = (rc.kills[src] ?? 0) + 1;
      rc.earned += amount + recover;
      rc.stolen -= h.sack;
      if (h.loot > 0) rc.looters++;
    }
    this.emit({ t: 'kill', x: h.x, y: h.y, amount, hero: h.type, sack: h.sack, recover, by: glare ? 'glare' : 'other', greed: greed > 0, src: h.src, loot: h.loot });
    this.resolve(h);
  }

  private reachHoard(h: SimHero): void {
    h.leaked = true;
    h.dir = -1;
    h.confT = 0;
    this.release(h);
    const want = M.stealBase(h.type, h.bounty, h.loot);
    const sack = this.stealFn ? this.stealFn(h) : Math.min(want, M.stealCap(Math.max(200, this.earned * 0.25), h.loot));
    h.sack = sack;
    if (!this.stealFn) {
      this.stolen += sack;
      this.partyNet.set(h.party, (this.partyNet.get(h.party) ?? 0) - sack);
    }
    this.leaks++;
    const p = this.parties.get(h.party);
    if (p) {
      p.leaked++;
      if (p.rc) {
        p.rc.leakers.push(h.type);
        p.rc.stolen += sack;
      }
    }
    this.gongStack = 0;
    this.emit({ t: 'leak', x: h.x, y: h.y, hero: h.type, sack });
  }

  private escape(h: SimHero): void {
    h.gone = true;
    this.release(h);
    const rc = this.parties.get(h.party)?.rc;
    if (rc && h.loot > 0) rc.lootEsc++;
    this.emit({ t: 'escape', hero: h.type, sack: h.sack, loot: h.loot });
    this.resolve(h);
  }

  private resolve(h: SimHero): void {
    const p = this.parties.get(h.party);
    if (!p) return;
    p.done++;
    if (p.done >= p.size) {
      this.parties.delete(h.party);
      if (!this.live) this.resolvedParties.add(h.party);
      this.history.push({ size: p.size, leaked: p.leaked });
      if (!this.live) this.partyStats.set(h.party, { size: p.size, leaked: p.leaked });
      if (this.history.length > 20) this.history.shift();
      this.emit({ t: 'partyDone', size: p.size, leaked: p.leaked, rc: p.rc ?? undefined });
    }
  }

  private emit(e: SimEvent): void {
    if (this.live && this.events.length < 400) this.events.push(e);
  }
}

const HERO_ORDER: Record<M.HeroType, number> = { rogue: 0, squire: 1, wizard: 2, cleric: 3, knight: 4, champ: 5 };

// ---------- headless idle rate (01 §3) ----------

/** Parties measured per seed, after WARM_PARTIES warm-up parties (the field is then in steady state).
 * Ten consecutive parties always hold exactly one Champion party, so seeds differ only in mix. */
export const IDLE_PARTIES = 10;
export const WARM_PARTIES = 2;
export const IDLE_SEEDS = 2;
const IDLE_MAX_S = 260;

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Goods imports that change the floor (Iron-shod Towers, Caged Bait); 0/0 when none. */
export interface DungeonImports {
  ap: number;
  caged: number;
}
const NO_IMPORTS: DungeonImports = { ap: 0, caged: 0 };
export const dungeonImports = (imports: Record<string, number> | undefined): DungeonImports => ({
  ap: Math.max(0, Math.min(3, imports?.ingots ?? 0)),
  caged: Math.max(0, Math.min(3, imports?.captives ?? 0)),
});

/** The MVP's chest pair, from the bait list (floor 0 hashes stay as before for MVP layouts). */
function chestKey(r: M.DungeonRun, g: Grid): string {
  if (g.f === 0 && g.spots.length === 2 && r.bait.every((b) => b === g.spots[0] || b === g.spots[1]))
    return `${r.bait.includes(g.spots[0]) ? 1 : 0}${r.bait.includes(g.spots[1]) ? 1 : 0}`;
  return [...r.bait].sort((a, b) => a - b).join('.');
}

export function layoutHash(r: M.DungeonRun, imp: DungeonImports = NO_IMPORTS, g: Grid = FLOOR0): string {
  const ps = r.pieces
    .map((p) => `${p.k[0]}${p.k[1]}${p.x},${p.y},${p.l},${p.b}${p.b2 && p.l >= M.BRANCH_LEVEL2 ? `/${p.b2}` : ''}`)
    .sort()
    .join(';');
  const w = r.ws;
  // No imports: the pre-Goods hash exactly (it seeds the idle sim, so the baseline stays put).
  const ik = imp.ap || imp.caged ? `|${imp.ap},${imp.caged}` : '';
  const gk = g.key === '0' ? '' : `|g${g.key}`;
  return `${ps}|${chestKey(r, g)}|${w.whet},${w.necro},${w.insc},${w.ledger}|${r.lure}${ik}${gk}`;
}

/** Plunder/s (net of steals) and leak fraction for one tier, averaged over seeds. Each seed runs
 * until parties WARM..WARM+IDLE_PARTIES-1 are resolved and divides their net haul by their spacing.
 * A generator (P-03 / D-dungeon-02): it yields every few hundred steps so the browser can spread a
 * cold run over several frames; `simTier` runs it to the end. */
function* simTierGen(r: M.DungeonRun, T: number, hash: string, imp: DungeonImports, g: Grid): Generator<void, { pps: number; leak: number }> {
  let pps = 0;
  let leak = 0;
  for (let k = 0; k < IDLE_SEEDS; k++) {
    const seed = fnv(`${hash}#${k}`);
    const start = seed % 10;
    // Hoard of Greed scales every haul; idleRateOf applies it after the memo (not in the hash).
    const sim = new Sim({ pieces: r.pieces, bait: r.bait, ws: { ...r.ws, greed: 0 }, lure: T, party: start, seed, live: false, ap: imp.ap, caged: imp.caged, grid: g });
    const first = start + WARM_PARTIES;
    const last = first + IDLE_PARTIES - 1;
    const maxSteps = Math.round(IDLE_MAX_S / STEP);
    for (let i = 0; i < maxSteps; i++) {
      sim.step();
      if (sim.partyN > last + 1 && sim.resolvedParties.has(last) && (i & 15) === 0) {
        let done = true;
        for (let n = first; n <= last && done; n++) if (!sim.resolvedParties.has(n)) done = false;
        if (done) break;
      }
      if ((i & 63) === 63) yield;
    }
    let net = 0;
    let size = 0;
    let leaked = 0;
    for (let n = first; n <= last; n++) {
      net += sim.partyNet.get(n) ?? 0;
      const ps = sim.partyStats.get(n);
      if (ps) {
        size += ps.size;
        leaked += ps.leaked;
      }
    }
    pps += net / (IDLE_PARTIES * M.PARTY_EVERY);
    leak += size ? leaked / size : 0;
  }
  return { pps: Math.max(0, pps / IDLE_SEEDS), leak: leak / IDLE_SEEDS };
}

function finish<T>(gen: Generator<void, T>): T {
  for (;;) {
    const n = gen.next();
    if (n.done) return n.value;
  }
}

export function simTier(r: M.DungeonRun, T: number, hash: string, imp: DungeonImports = NO_IMPORTS, g: Grid = FLOOR0): { pps: number; leak: number } {
  return finish(simTierGen(r, T, hash, imp, g));
}

export interface IdleResult {
  pps: number;
  /** Leak fraction at the tier Cautious Mode picked. */
  leak: number;
  /** The tier it picked. */
  tier: number;
}

/** Cautious Mode (01 §3.3): the best tier among T..T-3 that holds the line (< 20% leaks). */
function* cautiousGen(r: M.DungeonRun, imp: DungeonImports, g: Grid, hash = layoutHash(r, imp, g)): Generator<void, IdleResult> {
  const top = yield* simTierGen(r, r.lure, hash, imp, g);
  if (top.leak < 0.2 || r.lure === 0) return { pps: top.pps, leak: top.leak, tier: r.lure };
  let best: IdleResult | null = null;
  let last = top;
  let lastT = r.lure;
  for (let k = 1; k <= 3 && r.lure - k >= 0; k++) {
    last = yield* simTierGen(r, r.lure - k, hash, imp, g);
    lastT = r.lure - k;
    if (last.leak < 0.2 && (!best || last.pps > best.pps)) best = { pps: last.pps, leak: last.leak, tier: lastT };
  }
  return best ?? { pps: last.pps, leak: last.leak, tier: lastT };
}

export function cautious(r: M.DungeonRun, imp: DungeonImports = NO_IMPORTS, g: Grid = FLOOR0): IdleResult {
  return finish(cautiousGen(r, imp, g));
}

export function cautiousRate(r: M.DungeonRun, imp: DungeonImports = NO_IMPORTS, g: Grid = FLOOR0): number {
  return cautious(r, imp, g).pps;
}

// Memo: idleRate is called every frame by the HUD, so it must be a lookup.
const memo = new Map<string, IdleResult>();
let lastRun: M.DungeonRun | null = null;
let lastRev = -1;
let lastImp = '';
let lastGrid = '';
let lastVal: IdleResult = { pps: 0, leak: 0, tier: 0 };

/*
 * P-03 / D-dungeon-02: a memo miss is 300 game-seconds x 3 seeds x up to 4 Lure tiers of sim
 * (20-90 ms on a desktop, more on a phone). In the browser it is queued and run in <= 6 ms slices
 * between frames; meanwhile idleOf answers with the last known result for this run (also kept in
 * the save as `run.idleMemo`, so a reload has it at once). Headless callers (tests, the balance
 * sim) compute synchronously and stay deterministic.
 */
/** Bump when the idle sim's rules change, so a saved `idleMemo` from an older build is ignored. */
const IDLE_MEMO_V = 2; // 2: Bait Chest purses (Wave 1)
let idleAsync = typeof window !== 'undefined' && typeof document !== 'undefined';
const IDLE_SLICE_MS = 6;
const idleQueue = new Map<string, Generator<void, IdleResult>>();
let idlePump = false;

/** Headless switch (tests): true = queue memo misses, false = compute at once. */
export function setIdleAsync(on: boolean): void {
  idleAsync = on;
}
export const idlePending = () => idleQueue.size;

/** Steps queued idle sims for up to `budgetMs`. Returns true when the queue is empty. */
export function pumpIdle(budgetMs = IDLE_SLICE_MS): boolean {
  const deadline = performance.now() + budgetMs;
  for (const [key, gen] of idleQueue) {
    for (;;) {
      const n = gen.next();
      if (n.done) {
        if (memo.size > 96) memo.clear();
        memo.set(key, n.value);
        idleQueue.delete(key);
        lastRun = null; // the next idleOf call re-reads the memo
        break;
      }
      if (performance.now() >= deadline) return false;
    }
  }
  return idleQueue.size === 0;
}

function scheduleIdle(): void {
  if (idlePump) return;
  idlePump = true;
  setTimeout(() => {
    idlePump = false;
    try {
      if (!pumpIdle()) scheduleIdle();
    } catch (err) {
      console.error(err);
      idleQueue.clear();
    }
  }, 0);
}

/** A frozen copy of what the idle sim reads, so later edits can't change a queued run. */
function snapshot(r: M.DungeonRun): M.DungeonRun {
  return { ...r, pieces: structuredClone(r.pieces), bait: structuredClone(r.bait), ws: { ...r.ws } };
}

/** Cautious Mode result for the run's layout (memoized by layout hash; the frame call is a lookup). */
export function idleOf(r: M.DungeonRun, imp: DungeonImports = NO_IMPORTS, g: Grid = FLOOR0): IdleResult {
  const ik = `${imp.ap},${imp.caged}`;
  if (r === lastRun && r.rev === lastRev && ik === lastImp && g.key === lastGrid) return lastVal;
  const key = layoutHash(r, imp, g);
  const saved = `${IDLE_MEMO_V}:${key}`;
  let v = memo.get(key);
  if (v === undefined && r.idleMemo?.key === saved) {
    v = { pps: r.idleMemo.pps, leak: r.idleMemo.leak, tier: r.idleMemo.tier };
    memo.set(key, v);
  }
  if (v === undefined) {
    if (idleAsync && (r.idleMemo || r === lastRun)) {
      if (!idleQueue.has(key)) {
        idleQueue.set(key, cautiousGen(snapshot(r), imp, g, key));
        scheduleIdle();
      }
      // Provisional: the last known result (not cached as this layout's; the real one lands soon).
      const m = r.idleMemo;
      return r === lastRun ? lastVal : { pps: m!.pps, leak: m!.leak, tier: m!.tier };
    }
    v = cautious(r, imp, g);
    if (memo.size > 96) memo.clear();
    memo.set(key, v);
  }
  if (r.idleMemo?.key !== saved) r.idleMemo = { key: saved, pps: v.pps, leak: v.leak, tier: v.tier };
  lastRun = r;
  lastRev = r.rev;
  lastImp = ik;
  lastGrid = g.key;
  lastVal = v;
  return v;
}

export function idleRateOf(r: M.DungeonRun, imp: DungeonImports = NO_IMPORTS, g: Grid = FLOOR0): number {
  return idleOf(r, imp, g).pps * M.greedMult(r.ws);
}
