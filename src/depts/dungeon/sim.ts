// The Dungeon's fixed-step simulation (specs/01 §14): pure TS, no Pixi. The live scene runs it at
// 20 Hz and renders from it; idleRate runs the same code headless over a few seeds.
import { COLS, HOARD, idx, lairPost, ROUTES, ROWS, type Route } from './map';
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
  charges: number;
  maxCharges: number;
  recharge: number;
  rechargeT: number;
  settle: number;
  flash: number;
}

export type SimEvent =
  | { t: 'shot'; kind: 'arrow' | 'ballista' | 'clerk'; x1: number; y1: number; x2: number; y2: number; miss: boolean }
  | { t: 'kill'; x: number; y: number; amount: number; hero: M.HeroType; sack: number; by: 'glare' | 'other' }
  | { t: 'leak'; x: number; y: number; hero: M.HeroType; sack: number }
  | { t: 'escape'; hero: M.HeroType; sack: number }
  | { t: 'rune'; x: number; y: number; kind: M.RuneKind }
  | { t: 'trapped'; x: number; y: number }
  | { t: 'party'; n: number; champ: boolean; bonus: number }
  | { t: 'partyDone'; size: number; leaked: number }
  | { t: 'minionDown'; x: number; y: number }
  | { t: 'loot'; x: number; y: number };

export interface SimSetup {
  pieces: M.PieceSave[];
  chests: [number, number];
  ws: M.Workshop;
  lure: number;
  party: number;
  seed: number;
  live: boolean;
}

interface PartyRec {
  size: number;
  done: number;
  leaked: number;
  bonus: number;
  looted: boolean;
}

export class Sim {
  t = 0;
  live: boolean;
  lure: number;
  ws: M.Workshop;
  mask = 0;
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

  constructor(s: SimSetup) {
    this.live = s.live;
    this.lure = s.lure;
    this.ws = s.ws;
    this.partyN = s.party;
    this.rng = mulberry32(s.seed);
    this.setLayout(s.pieces, s.chests, s.ws);
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
    const wR = T >= M.ROGUE_LURE ? 15 : 0;
    const wK = T >= M.KNIGHT_LURE ? 15 : 0;
    const tot = 50 + wR + wK;
    for (let i = 0; i < size; i++) {
      const r = this.rng() * tot;
      out.push(r < 50 ? 'squire' : r < 50 + wR ? 'rogue' : 'knight');
    }
    // Slow, tough heroes walk at the back so the party reads at a glance.
    out.sort((a, b) => HERO_ORDER[a] - HERO_ORDER[b]);
    if (champ) out.push('champ');
    return out;
  }

  /** Rebuilds towers, lairs and runes from the save. `settle` maps piece id -> inactive seconds. */
  setLayout(pieces: M.PieceSave[], chests: [number, number], ws: M.Workshop, settle?: Map<number, number>): void {
    this.ws = ws;
    this.mask = (chests[0] ? 1 : 0) | (chests[1] ? 2 : 0);
    for (const h of this.heroes) h.blocked = null;
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
    for (const p of pieces) {
      const lm = M.levelMult(p.l);
      const rb = M.rangeBonus(p.l);
      const st = settle?.get(p.id) ?? 0;
      const cx = p.x + 0.5;
      const cy = p.y + 0.5;
      const tw = (kind: M.TowerKind, range: number, o: Partial<SimTower>) =>
        this.towers.push({ id: p.id, kind, x: cx, y: cy, range, range2: range * range, dmg: 0, rate: 1, cd: 0, pierce: 1, bleed: 0, dps: 0, settle: st, active: false, ...o });
      switch (p.k) {
        case 'arrow':
          tw('arrow', 3 + rb, { dmg: 4 * lm * tm * (p.b === 1 ? 2.2 : 1), rate: 1.2 * (p.b === 1 ? 0.6 : 1), bleed: p.b === 2 ? 2 * lm * tm : 0 });
          break;
        case 'brazier':
          tw('brazier', 1.5 + rb + (p.b === 1 ? 0.7 : 0), { dps: 3 * lm * tm * (p.b === 2 ? 1.7 : 1) });
          break;
        case 'ballista':
          tw('ballista', 5 + rb, { dmg: 30 * lm * tm * (p.b === 1 ? 2 : 1), rate: 0.4 * (p.b === 2 ? 1.25 : 1), pierce: p.b === 2 ? 5 : 3 });
          break;
        case 'crypt':
        case 'ogre': {
          const post = lairPost(p.x, p.y);
          if (!post) break;
          const ogre = p.k === 'ogre';
          const n = ogre ? 1 : 2 + (p.b === 1 ? 1 : 0);
          const hp = ogre ? 200 * lm * sm * (p.b === 2 ? 1.5 : 1) : 30 * lm * sm * (p.b === 2 ? 2.5 : 1);
          const dps = ogre ? 12 * lm * sm * (p.b === 1 ? 1.7 : 1) : 3 * lm * sm;
          for (let i = 0; i < n; i++)
            this.minions.push({
              id: p.id, kind: p.k, n: i, px: post[0] + 0.5, py: post[1] + 0.5, hp, maxHp: hp, dps,
              cap: ogre ? (p.b === 2 ? 3 : 2) : 1, cleave: ogre, respawn: ogre ? 20 : 8,
              respawnT: st, alive: st <= 0, blocked: [], swing: 0,
            });
          break;
        }
        case 'mire':
        case 'spikes': {
          const i = this.runes.length;
          const mire = p.k === 'mire';
          this.runes.push({
            id: p.id, kind: p.k, x: p.x, y: p.y,
            slow: mire ? Math.min(0.7, (p.b === 1 ? 0.55 : 0.4) * (1 + 0.5 * (rm - 1))) : 0,
            slowDur: mire ? 2 * (1 + 0.08 * (p.l - 1)) : 0,
            stun: mire && p.b === 2 ? 0.08 : 0,
            dmg: mire ? 0 : 8 * lm * rm * (p.b === 1 ? 1.8 : 1),
            charges: mire ? 0 : p.b === 2 ? 5 : 3, maxCharges: mire ? 0 : p.b === 2 ? 5 : 3,
            recharge: p.b === 2 ? 2 : 4, rechargeT: 0, settle: st, flash: 0,
          });
          this.runeAt[idx(p.x, p.y)] = i;
          break;
        }
      }
    }
    for (const m of this.minions) {
      const o = oldM.get(`${m.id}.${m.n}`);
      if (!o || m.respawnT > 0) continue;
      m.alive = o.alive;
      m.respawnT = o.respawnT;
      m.hp = o.alive ? Math.min(m.maxHp, m.maxHp * (o.hp / o.maxHp)) : m.maxHp;
    }
    for (const r of this.runes) {
      const o = oldR.get(r.id);
      if (o && o.kind === r.kind) r.charges = Math.min(r.maxCharges, o.charges);
    }
    // Ledger-Bones throws bones from the Hoard (starter kit, 01 §4).
    this.towers.push({
      id: 0, kind: 'clerk', x: HOARD[0] + 0.5, y: HOARD[1] + 0.5, range: M.CLERK.range, range2: M.CLERK.range ** 2,
      dmg: M.CLERK.dmg, rate: M.CLERK.rate, cd: 0, pierce: 1, bleed: 0, dps: 0, settle: 0, active: false,
    });
  }

  // ---------- active verbs ----------

  /** Gong: call the next party now. Refused while the previous party is still filing in. */
  gong(): boolean {
    if (!this.gongReady) return false;
    this.gongStack = Math.min(M.GONG_MAX, this.gongStack + 1);
    this.launch(M.GONG_STEP * this.gongStack);
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
    this.hurt(h, dmg, true, true);
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
    this.moveHeroes(dt);
    if (this.minions.length) this.blockAndFight(dt);
    this.fireTowers(dt);
    this.updateRunes(dt);
    if (this.trap) this.updateTrap(dt);
    // Compact.
    let w = 0;
    for (let i = 0; i < this.heroes.length; i++) {
      const h = this.heroes[i];
      if (!h.dead && !h.gone) this.heroes[w++] = h;
    }
    this.heroes.length = w;
  }

  private launch(bonus: number): void {
    const spec = this.queue.shift() ?? this.genParty(this.partyN);
    const id = this.partyN++;
    this.queue.push(this.genParty(this.partyN + 1));
    this.parties.set(id, { size: spec.length, done: 0, leaked: 0, bonus, looted: false });
    if (!this.spawnQ.length) this.spawnT = 0;
    for (const type of spec) this.spawnQ.push({ type, party: id });
    this.partyTimer = M.PARTY_EVERY;
    this.trapCharges = 1;
    this.emit({ t: 'party', n: id, champ: spec.includes('champ'), bonus });
  }

  private spawnHero(type: M.HeroType, party: number): void {
    const T = this.lure;
    const d = M.HEROES[type];
    const route = type === 'rogue' ? ROUTES[0] : ROUTES[this.mask];
    const hp = d.hp * M.hpScale(T);
    this.heroes.push({
      id: this.nextHero++, type, hp, maxHp: hp, armor: M.heroArmor(type, T), speed: d.spd, atk: d.atk * M.atkScale(T),
      bounty: d.b * M.bountyScale(T), dodge: d.dodge, route, dist: 0, seg: 0, x: route.xs[0], y: route.ys[0],
      px: route.xs[0], py: route.ys[0], dir: 1, slowT: 0, slowF: 0, bleedT: 0, bleedDps: 0, stunT: 0, blocked: null,
      tile: -1, party, sack: 0, leaked: false, flash: 0, dead: false, gone: false, chestI: 0,
    });
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

  private moveHeroes(dt: number): void {
    for (const h of this.heroes) {
      h.px = h.x;
      h.py = h.y;
      if (h.dead || h.gone) continue;
      if (h.flash > 0) h.flash -= dt;
      if (h.bleedT > 0) {
        h.bleedT -= dt;
        this.hurt(h, h.bleedDps * dt, true);
        if (h.dead) continue;
      }
      if (h.slowT > 0) h.slowT -= dt;
      if (h.stunT > 0) {
        h.stunT -= dt;
        continue;
      }
      if (h.blocked) continue;
      let spd = h.speed * (h.dir < 0 ? 1.3 : 1);
      if (h.slowT > 0) spd *= 1 - h.slowF;
      h.dist += spd * dt * h.dir;
      if (h.dir > 0 && h.dist >= h.route.len) {
        h.dist = h.route.len;
        this.reachHoard(h);
      } else if (h.dir < 0 && h.dist <= 0) {
        h.dist = 0;
        this.escape(h);
        continue;
      }
      this.place(h);
      if (h.dir > 0 && h.chestI < h.route.chestAt.length && h.dist >= h.route.chestAt[h.chestI]) {
        h.chestI++;
        const p = this.parties.get(h.party);
        if (p && !p.looted) {
          p.looted = true;
          this.emit({ t: 'loot', x: h.x, y: h.y });
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

  private blockAndFight(dt: number): void {
    const ms = this.minions;
    for (const m of ms) {
      if (!m.blocked.length) continue;
      let w = 0;
      for (const h of m.blocked) if (!h.dead && !h.gone && h.blocked === m) m.blocked[w++] = h;
      m.blocked.length = w;
    }
    for (const h of this.heroes) {
      if (h.dead || h.gone || h.blocked) continue;
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
        this.hurt(h, m.dps * dt * (h.type === 'champ' ? 0.5 : 1), true);
      }
      if (m.swing <= 0) m.swing = 0.5;
      m.hp -= incoming * dt;
      if (m.hp <= 0) {
        m.alive = false;
        m.respawnT = m.respawn;
        for (const h of m.blocked) if (h.blocked === m) h.blocked = null;
        m.blocked.length = 0;
        this.emit({ t: 'minionDown', x: m.px, y: m.py });
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
      if (tw.kind === 'brazier') {
        tw.active = false;
        const d = tw.dps * dt;
        for (const h of hs) {
          if (h.dead || h.gone) continue;
          const dx = h.x - tw.x;
          const dy = h.y - tw.y;
          if (dx * dx + dy * dy <= tw.range2) {
            tw.active = true;
            this.hurt(h, d, true);
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
        const miss = best.dodge > 0 && this.rng() < best.dodge;
        this.emit({ t: 'shot', kind: tw.kind, x1: tw.x, y1: tw.y, x2: best.x, y2: best.y, miss });
        if (!miss) {
          this.hurt(best, tw.dmg, false);
          if (tw.bleed > 0 && !best.dead) {
            best.bleedT = 3;
            best.bleedDps = Math.max(best.bleedDps, tw.bleed);
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
      if (h.dodge > 0 && this.rng() < h.dodge) return;
      this.hurt(h, tw.dmg, false);
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
    if (r.settle > 0) return;
    if (r.kind === 'mire') {
      h.slowF = h.slowT > 0 ? Math.max(h.slowF, r.slow) : r.slow;
      h.slowT = r.slowDur;
      if (r.stun > 0 && h.type !== 'champ' && this.rng() < r.stun) h.stunT = 1.5;
      r.flash = 0.3;
      this.emit({ t: 'rune', x: r.x, y: r.y, kind: 'mire' });
    } else if (r.charges >= 1) {
      r.charges--;
      r.flash = 0.3;
      this.hurt(h, r.dmg, false);
      this.emit({ t: 'rune', x: r.x, y: r.y, kind: 'spikes' });
    }
  }

  private updateRunes(dt: number): void {
    for (const r of this.runes) {
      if (r.settle > 0) r.settle -= dt;
      if (r.flash > 0) r.flash -= dt;
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

  private hurt(h: SimHero, raw: number, ignoreArmor: boolean, glare = false): void {
    if (h.dead || h.gone) return;
    const d = ignoreArmor ? raw : Math.max(1, raw - h.armor);
    h.hp -= d;
    if (!ignoreArmor) h.flash = 0.08;
    if (h.hp <= 0) this.kill(h, glare);
  }

  private kill(h: SimHero, glare: boolean): void {
    h.dead = true;
    this.release(h);
    const p = this.parties.get(h.party);
    const bonus = p?.bonus ?? 0;
    const amount = h.leaked && h.type === 'champ' ? 0 : h.bounty * (1 + bonus) * M.plunderMult(this.ws);
    this.earned += amount;
    let net = amount;
    if (h.sack > 0) {
      this.stolen -= h.sack * (1 + M.RECOVER_BONUS);
      net += h.sack * (1 + M.RECOVER_BONUS);
    }
    if (!this.live) this.partyNet.set(h.party, (this.partyNet.get(h.party) ?? 0) + net);
    this.emit({ t: 'kill', x: h.x, y: h.y, amount, hero: h.type, sack: h.sack, by: glare ? 'glare' : 'other' });
    this.resolve(h);
  }

  private reachHoard(h: SimHero): void {
    h.leaked = true;
    h.dir = -1;
    this.release(h);
    const want = M.stealBase(h.type, h.bounty);
    const sack = this.stealFn ? this.stealFn(h) : Math.min(want, 0.02 * Math.max(200, this.earned * 0.25));
    h.sack = sack;
    if (!this.stealFn) {
      this.stolen += sack;
      this.partyNet.set(h.party, (this.partyNet.get(h.party) ?? 0) - sack);
    }
    this.leaks++;
    const p = this.parties.get(h.party);
    if (p) p.leaked++;
    this.gongStack = 0;
    this.emit({ t: 'leak', x: h.x, y: h.y, hero: h.type, sack });
  }

  private escape(h: SimHero): void {
    h.gone = true;
    this.release(h);
    this.emit({ t: 'escape', hero: h.type, sack: h.sack });
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
      this.emit({ t: 'partyDone', size: p.size, leaked: p.leaked });
    }
  }

  private emit(e: SimEvent): void {
    if (this.live && this.events.length < 400) this.events.push(e);
  }
}

const HERO_ORDER: Record<M.HeroType, number> = { rogue: 0, squire: 1, knight: 2, champ: 3 };

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

export function layoutHash(r: M.DungeonRun): string {
  const ps = r.pieces.map((p) => `${p.k[0]}${p.k[1]}${p.x},${p.y},${p.l},${p.b}`).sort().join(';');
  const w = r.ws;
  return `${ps}|${r.chests[0]}${r.chests[1]}|${w.whet},${w.necro},${w.insc},${w.ledger}|${r.lure}`;
}

/** Plunder/s (net of steals) and leak fraction for one tier, averaged over seeds. Each seed runs
 * until parties WARM..WARM+IDLE_PARTIES-1 are resolved and divides their net haul by their spacing. */
export function simTier(r: M.DungeonRun, T: number, hash: string): { pps: number; leak: number } {
  let pps = 0;
  let leak = 0;
  for (let k = 0; k < IDLE_SEEDS; k++) {
    const seed = fnv(`${hash}#${k}`);
    const start = seed % 10;
    const sim = new Sim({ pieces: r.pieces, chests: r.chests, ws: r.ws, lure: T, party: start, seed, live: false });
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

/** Cautious Mode (01 §3.3): the best tier among T..T-3 that holds the line (< 20% leaks). */
export function cautiousRate(r: M.DungeonRun): number {
  const hash = layoutHash(r);
  const top = simTier(r, r.lure, hash);
  if (top.leak < 0.2 || r.lure === 0) return top.pps;
  let best = -1;
  let last = top;
  for (let k = 1; k <= 3 && r.lure - k >= 0; k++) {
    last = simTier(r, r.lure - k, hash);
    if (last.leak < 0.2) best = Math.max(best, last.pps);
  }
  return best >= 0 ? best : last.pps;
}

// Memo: idleRate is called every frame by the HUD, so it must be a lookup.
const memo = new Map<string, number>();
let lastRun: M.DungeonRun | null = null;
let lastRev = -1;
let lastVal = 0;

export function idleRateOf(r: M.DungeonRun): number {
  if (r === lastRun && r.rev === lastRev) return lastVal;
  const key = layoutHash(r);
  let v = memo.get(key);
  if (v === undefined) {
    v = cautiousRate(r);
    if (memo.size > 64) memo.clear();
    memo.set(key, v);
  }
  lastRun = r;
  lastRev = r.rev;
  lastVal = v;
  return v;
}
