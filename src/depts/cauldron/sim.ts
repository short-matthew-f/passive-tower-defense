// The Cauldron's peg board physics: pure TypeScript, no Pixi, so the scene and the EV cache
// share it. Ingredients are independent circles that only hit pegs, moving gold pegs and walls
// (05 §2, §14). Fixed timestep, seeded jitter, deterministic for a given seed and input.

export const STEP = 1 / 120;
export const COL_W = 18; // bucket and chute width
export const BUCKETS = 9;
export const BOARD_W = COL_W * BUCKETS; // 162
export const ROW_H = 14;
export const PEG_R = 2;
export const BALL_R = 3;
export const GRAVITY = 400;
export const MAX_VY = 170; // drag cap so the rain stays readable
export const CENTER_X = BOARD_W / 2;
export const DROP_Y = -10; // ingredients appear this far above the first row
export const LADLE_KICK = 55;
export const BUMP_KICK = 80;
export const GOLD_SPEED = 20;

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

export type IngId = 'newt' | 'toad' | 'bat' | 'mandrake';

export interface Ingredient {
  id: IngId;
  name: string;
  value: number;
  weight: number;
  rest: number; // restitution vs pegs
  grav: number; // gravity scale
}

export const INGREDIENTS: Record<IngId, Ingredient> = {
  newt: { id: 'newt', name: 'Newt Eye', value: 1, weight: 50, rest: 0.45, grav: 1 },
  toad: { id: 'toad', name: 'Toad', value: 4, weight: 30, rest: 0.35, grav: 1 },
  bat: { id: 'bat', name: 'Bat Wing', value: 3, weight: 15, rest: 0.45, grav: 0.7 },
  mandrake: { id: 'mandrake', name: 'Mandrake', value: 12, weight: 5, rest: 0.45, grav: 1 },
};
export const ING_ORDER: IngId[] = ['newt', 'toad', 'bat', 'mandrake'];

export type PegKind = 'iron' | 'bumper';

export interface Peg {
  id: number;
  row: number;
  x: number;
  y: number;
  kind: PegKind;
  ladleUntil: number; // sim time; > t means it's a Ladle
  flash: number; // render-only hit flicker
}

export interface GoldPeg {
  id: number;
  y: number;
  x: number;
  dir: number;
  flash: number;
}

export interface Ball {
  ing: IngId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  tossed: boolean;
  ladled: boolean;
  goldHits: number;
  lastGold: number; // id of the gold peg last touched (debounce)
  lastPeg: number;
  hits: number;
  alive: boolean;
}

export interface BoardConfig {
  rows: number; // 10..12
  malice: number; // bumpers
  gold: number; // moving gold pegs
}

/** Ingredients start just under the toadling rail, which sits 12 row-slots above the buckets. */
export const ROW_SLOTS = 12;
export function dropYFor(rows: number): number {
  return DROP_Y - (ROW_SLOTS - rows) * ROW_H;
}

export interface SimEvents {
  peg?(b: Ball, p: Peg): void;
  gold?(b: Ball, g: GoldPeg): void;
  ladle?(b: Ball, p: Peg): void;
  bump?(b: Ball, p: Peg): void;
  land?(b: Ball, bucket: number): void;
}

// Bumper slots by Malice level: rows counted from the bottom, and an x offset from center.
const BUMPER_SLOTS: [number, number][] = [
  [3, -9], [6, 9], [1, 0], [8, -18], [4, 18], [7, 0], [2, -27], [5, 27], [9, 0], [2, 9],
];
const GOLD_ROWS = [7, 4, 2, 8, 5]; // rows from the bottom; gold pegs ride between rows

export class Board {
  readonly cfg: BoardConfig;
  pegs: Peg[] = [];
  rowPegs: Peg[][] = [];
  gold: GoldPeg[] = [];
  balls: Ball[] = [];
  t = 0;
  readonly bucketY: number; // landing line, board-local
  readonly dropY: number;
  private rng: () => number;

  constructor(cfg: BoardConfig, seed: number) {
    this.cfg = cfg;
    this.rng = mulberry32(seed);
    const R = cfg.rows;
    let id = 0;
    for (let r = 0; r < R; r++) {
      const fromBottom = R - 1 - r;
      const boundary = fromBottom % 2 === 0;
      const row: Peg[] = [];
      const n = boundary ? BUCKETS - 1 : BUCKETS;
      for (let i = 0; i < n; i++) {
        const x = boundary ? COL_W * (i + 1) : COL_W * i + COL_W / 2;
        const p: Peg = { id: id++, row: r, x, y: r * ROW_H, kind: 'iron', ladleUntil: 0, flash: 0 };
        row.push(p);
        this.pegs.push(p);
      }
      this.rowPegs.push(row);
    }
    for (let m = 0; m < Math.min(cfg.malice, BUMPER_SLOTS.length); m++) {
      const [fb, off] = BUMPER_SLOTS[m];
      const row = this.rowPegs[Math.max(0, R - 1 - fb)];
      const target = CENTER_X + off;
      const sorted = [...row].sort((a, b) => Math.abs(a.x - target) - Math.abs(b.x - target));
      const p = sorted.find((q) => q.kind === 'iron');
      if (p) p.kind = 'bumper';
    }
    for (let g = 0; g < Math.min(cfg.gold, GOLD_ROWS.length); g++) {
      const r = Math.max(0, R - 1 - GOLD_ROWS[g]);
      this.gold.push({ id: g, y: r * ROW_H + ROW_H / 2, x: 20 + ((g * 47) % 120), dir: g % 2 ? -1 : 1, flash: 0 });
    }
    this.bucketY = (R - 1) * ROW_H + 12;
    this.dropY = dropYFor(R);
  }

  rand(): number {
    return this.rng();
  }

  drop(ing: IngId, x: number, tossed = false): Ball {
    const b: Ball = {
      ing,
      x: Math.max(BALL_R, Math.min(BOARD_W - BALL_R, x)),
      y: this.dropY,
      vx: (this.rng() - 0.5) * 6,
      vy: 10,
      age: 0,
      tossed,
      ladled: false,
      goldHits: 0,
      lastGold: -1,
      lastPeg: -1,
      hits: 0,
      alive: true,
    };
    this.balls.push(b);
    return b;
  }

  /** Nearest iron peg to a board-local point within maxD, or null. */
  pegAt(x: number, y: number, maxD: number): Peg | null {
    let best: Peg | null = null;
    let bd = maxD * maxD;
    for (const p of this.pegs) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd && p.kind === 'iron') {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  step(ev: SimEvents): void {
    const dt = STEP;
    this.t += dt;
    for (const g of this.gold) {
      g.x += g.dir * GOLD_SPEED * dt;
      if (g.x < 12) (g.x = 12), (g.dir = 1);
      if (g.x > BOARD_W - 12) (g.x = BOARD_W - 12), (g.dir = -1);
    }
    const rr = PEG_R + BALL_R;
    let died = false;
    for (const b of this.balls) {
      if (!b.alive) continue;
      const ing = INGREDIENTS[b.ing];
      b.age += dt;
      b.vy = Math.min(MAX_VY * (ing.grav < 1 ? 0.8 : 1), b.vy + GRAVITY * ing.grav * dt);
      b.vx *= 0.998;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Walls.
      if (b.x < BALL_R) {
        b.x = BALL_R;
        b.vx = Math.abs(b.vx) * 0.6;
      } else if (b.x > BOARD_W - BALL_R) {
        b.x = BOARD_W - BALL_R;
        b.vx = -Math.abs(b.vx) * 0.6;
      }
      // Static pegs in nearby rows.
      const rowF = b.y / ROW_H;
      const r0 = Math.max(0, Math.floor(rowF - 0.5));
      const r1 = Math.min(this.rowPegs.length - 1, Math.ceil(rowF + 0.5));
      for (let r = r0; r <= r1; r++) {
        const row = this.rowPegs[r];
        if (!row) continue;
        for (const p of row) {
          const dx = b.x - p.x;
          if (dx > rr || dx < -rr) continue;
          const dy = b.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          this.collide(b, p.x, p.y, Math.sqrt(d2), ing.rest);
          if (b.lastPeg !== p.id) {
            b.lastPeg = p.id;
            b.hits++;
            p.flash = 1;
            ev.peg?.(b, p);
          }
          if (p.kind === 'bumper') {
            const dir = Math.abs(b.x - CENTER_X) < 1 ? (this.rng() < 0.5 ? -1 : 1) : Math.sign(b.x - CENTER_X);
            b.vx = dir * BUMP_KICK * (0.9 + this.rng() * 0.2);
            b.vy = Math.min(b.vy, -20);
            ev.bump?.(b, p);
          } else if (p.ladleUntil > this.t) {
            const off = CENTER_X - b.x;
            if (Math.abs(off) > 3) {
              const dir = Math.sign(off);
              b.vx = dir * Math.max(LADLE_KICK, Math.abs(b.vx)) * (0.9 + this.rng() * 0.2);
            } else {
              b.vx *= 0.3; // already centered: drop straight
            }
            if (!b.ladled) {
              b.ladled = true;
              ev.ladle?.(b, p);
            }
          }
        }
      }
      // Moving gold pegs.
      for (const g of this.gold) {
        const dx = b.x - g.x;
        const dy = b.y - g.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        this.collide(b, g.x, g.y, Math.sqrt(d2), ing.rest);
        if (b.lastGold !== g.id) {
          b.lastGold = g.id;
          g.flash = 1;
          if (b.goldHits < 3) b.goldHits++;
          ev.gold?.(b, g);
        }
      }
      if (b.y >= this.bucketY || b.age > 10) {
        b.alive = false;
        died = true;
        const bucket = Math.max(0, Math.min(BUCKETS - 1, Math.floor(b.x / COL_W)));
        ev.land?.(b, bucket);
      }
    }
    if (died) this.balls = this.balls.filter((b) => b.alive);
  }

  private collide(b: Ball, px: number, py: number, d: number, rest: number): void {
    const rr = PEG_R + BALL_R;
    let nx: number;
    let ny: number;
    if (d < 1e-4) {
      nx = this.rng() < 0.5 ? -1 : 1;
      ny = 0;
    } else {
      nx = (b.x - px) / d;
      ny = (b.y - py) / d;
    }
    b.x = px + nx * rr;
    b.y = py + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const e = rest * (1 + (this.rng() - 0.5) * 0.16);
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      // Tangential jitter breaks perfect symmetry on dead-center hits.
      const j = (this.rng() - 0.5) * 16;
      b.vx += -ny * j;
      b.vy += nx * j;
    }
  }
}

/**
 * Landing distribution of uniformly random drops (no Ladles), using common random numbers: the
 * same seeds every call so only the board changes between upgrade states. With `gold` > 0 the
 * moving gold pegs ride along and `goldHits[k]` is the mean gold-peg hits of drops landing in
 * bucket k (sim-tuned: idleRate counts what the board earns with no input, gold included).
 */
export function landingStats(rows: number, malice: number, gold = 0, n = 1500): { dist: number[]; goldHits: number[] } {
  const counts = new Array(BUCKETS).fill(0);
  const hits = new Array(BUCKETS).fill(0);
  const xs = mulberry32(0xc0ffee);
  const board = new Board({ rows, malice, gold }, 12345);
  const ev: SimEvents = {
    land: (b, k) => {
      counts[k]++;
      hits[k] += b.goldHits;
    },
  };
  // Ingredients fall differently (bounce, gravity), so drop the value-weighted mix (weight x value)
  // the payout actually sees, not Newts only.
  const mix = ING_ORDER.map((i) => INGREDIENTS[i].weight * INGREDIENTS[i].value);
  const mixW = mix.reduce((a, b) => a + b, 0);
  const pick = (r: number): IngId => {
    let x = r * mixW;
    for (let i = 0; i < ING_ORDER.length; i++) if ((x -= mix[i]) <= 0) return ING_ORDER[i];
    return ING_ORDER[0];
  };
  let dropped = 0;
  // Keep ~20 balls in flight so the run is cheap but still uses the real step.
  while (dropped < n || board.balls.length) {
    if (dropped < n && board.balls.length < 20) {
      const x = BALL_R + xs() * (BOARD_W - 2 * BALL_R);
      board.drop(pick(xs()), x);
      dropped++;
    }
    board.step(ev);
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return { dist: counts.map((c) => c / total), goldHits: hits.map((h, k) => (counts[k] ? h / counts[k] : 0)) };
}

export function landingDistribution(rows: number, malice: number, n = 1500): number[] {
  return landingStats(rows, malice, 0, n).dist;
}
