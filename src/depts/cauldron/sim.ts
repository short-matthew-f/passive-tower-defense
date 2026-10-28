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
/** Slop Pail (05 §4): a bumper-kicked ingredient that hits a side wall at least this fast may
 * bounce out of the board. Only bumpers start it, so it is a Malice hazard (never at Malice 0). */
export const SPILL_V = 60;
export const SPILL_P = 0.35;
/** Boomshroom blast radius (px) and how long the gold pegs it lights stay boosted (s). */
export const BOOM_R = 24;
export const BOOM_S = 2;
/** Rune pegs charge the ingredient they lift (value multiplier). */
export const RUNE_MULT = 1.25;

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

export type IngId = 'newt' | 'toad' | 'bat' | 'mandrake' | 'splitroot' | 'boomshroom' | 'leadheart' | 'wisp' | 'sock' | 'pumpkin';

export interface Ingredient {
  id: IngId;
  name: string;
  value: number;
  weight: number;
  rest: number; // restitution vs pegs
  grav: number; // gravity scale
  /** Value the toadling rain sees per drop relative to `value` (Splitroot: 3 halves = 1.5). */
  idleValue?: number;
}

export const INGREDIENTS: Record<IngId, Ingredient> = {
  newt: { id: 'newt', name: 'Newt Eye', value: 1, weight: 50, rest: 0.45, grav: 1 },
  toad: { id: 'toad', name: 'Toad', value: 4, weight: 30, rest: 0.35, grav: 1 },
  bat: { id: 'bat', name: 'Bat Wing', value: 3, weight: 15, rest: 0.45, grav: 0.7 },
  mandrake: { id: 'mandrake', name: 'Mandrake', value: 12, weight: 5, rest: 0.45, grav: 1 },
  splitroot: { id: 'splitroot', name: 'Splitroot', value: 6, weight: 4, rest: 0.45, grav: 1, idleValue: 1.5 },
  boomshroom: { id: 'boomshroom', name: 'Boomshroom', value: 8, weight: 3, rest: 0.45, grav: 1 },
  leadheart: { id: 'leadheart', name: 'Lead Heart', value: 10, weight: 3, rest: 0.12, grav: 1.4 },
  wisp: { id: 'wisp', name: 'Wisp Salt', value: 5, weight: 3, rest: 0.5, grav: 0.8 },
  sock: { id: 'sock', name: "Hero's Sock", value: 50, weight: 0.5, rest: 0.45, grav: 1 },
  // Seasonal (05 §15 Later): Granny's spoon only, never the toadling rain, so idleRate ignores it.
  pumpkin: { id: 'pumpkin', name: 'Pumpkin Hex', value: 20, weight: 0, rest: 0.4, grav: 1 },
};
/** The base flow. The EV cache's common random numbers drop this mix only, so unlocking a
 * special never moves the cached distributions (specials are priced in at their idle value). */
export const ING_ORDER: IngId[] = ['newt', 'toad', 'bat', 'mandrake'];
/** Unlockable specials, in unlock order (each has a Pantry node of the same id). */
export const SPECIALS: IngId[] = ['mandrake', 'splitroot', 'boomshroom', 'leadheart', 'wisp', 'sock'];

export type PegKind = 'iron' | 'bumper' | 'bone' | 'rune' | 'thorn' | 'wall';

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
  boostUntil: number; // Boomshroom: hits count double until then
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
  /** Share of the ingredient's value this piece carries (Splitroot / thorn halves). */
  scale: number;
  split: boolean;
  rune: boolean;
  boomed: boolean;
  /** Hopper ritual rain: lands for the ritual score only, never pays. */
  hopper: boolean;
  /** Kicked by a bumper (only those can spill: the Slop Pail is a Malice hazard). */
  bumped: boolean;
  /** Split pieces share one ticket tick (the first piece to count fills the line). */
  group: { ticked: boolean } | null;
  /** Toadling drops this ball carries (the thinned rain bundles drops into heavy balls; 1 for
   * everything else). Its value is already in `scale`; this only feeds the drop count. */
  drops: number;
}

export type LayoutId = 'classic' | 'funnel' | 'hex' | 'spiral';

export interface LayoutDef {
  id: LayoutId;
  name: string;
  /** Falls needed (lifetime) to unlock (05 §7 Board Layouts). */
  falls: number;
  /** Bucket tier per column: 0 = Dregs ... 4 = Jackpot. */
  tiers: number[];
  blurb: string;
}

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  classic: { id: 'classic', name: 'Classic', falls: 0, tiers: [0, 1, 2, 3, 4, 3, 2, 1, 0], blurb: 'Old rack' },
  funnel: { id: 'funnel', name: 'Funnel', falls: 1, tiers: [0, 1, 2, 3, 4, 3, 2, 1, 0], blurb: 'Herds rain' },
  hex: { id: 'hex', name: 'Hex', falls: 3, tiers: [3, 1, 0, 2, 4, 2, 0, 1, 3], blurb: 'Holey, odd pot' },
  spiral: { id: 'spiral', name: 'Spiral', falls: 5, tiers: [2, 3, 4, 3, 2, 1, 0, 1, 2], blurb: 'Lopsided' },
};
export const LAYOUT_ORDER: LayoutId[] = ['classic', 'funnel', 'hex', 'spiral'];

export interface BoardConfig {
  rows: number; // 10..12
  malice: number; // bumpers
  gold: number; // moving gold pegs
  bone?: number; // bone pegs (count)
  rune?: number;
  thorn?: number;
  layout?: LayoutId;
  /** Where Ladles and Wisp Salt steer: the x of the best bucket (default the center). */
  goalX?: number;
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
  bone?(b: Ball, p: Peg): void;
  rune?(b: Ball, p: Peg): void;
  split?(b: Ball, parts: Ball[]): void;
  boom?(b: Ball, lit: GoldPeg[]): void;
  spill?(b: Ball, side: number): void;
  land?(b: Ball, bucket: number): void;
}

// Bumper slots by Malice level: rows counted from the bottom, and an x offset from center.
const BUMPER_SLOTS: [number, number][] = [
  [3, -9], [6, 9], [1, 0], [8, -18], [4, 18], [7, 0], [2, -27], [5, 27], [9, 0], [2, 9],
];
const RUNE_SLOTS: [number, number][] = [[2, -45], [3, 45], [1, -63], [2, 63]];
const THORN_SLOTS: [number, number][] = [[7, -36], [7, 36], [5, -54], [5, 54]];
const GOLD_ROWS = [7, 4, 2, 8, 5]; // rows from the bottom; gold pegs ride between rows

function newBall(ing: IngId, x: number, y: number, vx: number, vy: number, tossed: boolean): Ball {
  return {
    ing,
    x,
    y,
    vx,
    vy,
    age: 0,
    tossed,
    ladled: false,
    goldHits: 0,
    lastGold: -1,
    lastPeg: -1,
    hits: 0,
    alive: true,
    scale: 1,
    split: false,
    rune: false,
    boomed: false,
    hopper: false,
    bumped: false,
    group: null,
    drops: 1,
  };
}

export class Board {
  readonly cfg: BoardConfig;
  pegs: Peg[] = [];
  rowPegs: Peg[][] = [];
  gold: GoldPeg[] = [];
  balls: Ball[] = [];
  t = 0;
  readonly bucketY: number; // landing line, board-local
  readonly dropY: number;
  goalX: number;
  private rng: () => number;
  private born: Ball[] = [];

  constructor(cfg: BoardConfig, seed: number) {
    this.cfg = cfg;
    this.rng = mulberry32(seed);
    this.goalX = cfg.goalX ?? CENTER_X;
    const R = cfg.rows;
    const layout = cfg.layout ?? 'classic';
    let id = 0;
    for (let r = 0; r < R; r++) {
      const fromBottom = R - 1 - r;
      const boundary = fromBottom % 2 === 0;
      const row: Peg[] = [];
      const n = boundary ? BUCKETS - 1 : BUCKETS;
      // Spiral: each row drifts sideways, so the rain winds down the board.
      const drift = layout === 'spiral' ? Math.round(5 * Math.sin(r * 0.8)) : 0;
      for (let i = 0; i < n; i++) {
        let x = (boundary ? COL_W * (i + 1) : COL_W * i + COL_W / 2) + drift;
        if (x < 4 || x > BOARD_W - 4) continue;
        // Hex: every third peg is missing, in a staggered pattern (open cells).
        if (layout === 'hex' && r > 0 && r < R - 1 && (i + r * 2) % 3 === 0) continue;
        // Funnel: the upper rows lose their outer pegs to the funnel walls.
        if (layout === 'funnel' && r < 4 && Math.abs(x - CENTER_X) > 30 + r * 14) continue;
        x = Math.round(x);
        const p: Peg = { id: id++, row: r, x, y: r * ROW_H, kind: 'iron', ladleUntil: 0, flash: 0 };
        row.push(p);
        this.pegs.push(p);
      }
      this.rowPegs.push(row);
    }
    if (layout === 'funnel') {
      // Two slanted walls of close-set pegs from the top corners in toward the middle.
      for (const side of [-1, 1]) {
        for (let k = 0; k <= 10; k++) {
          const f = k / 10;
          const y = -6 + f * (3 * ROW_H + 6);
          const x = Math.round(CENTER_X + side * (CENTER_X - 4 - f * (CENTER_X - 4 - 34)));
          const r = Math.max(0, Math.min(R - 1, Math.round(y / ROW_H)));
          const p: Peg = { id: id++, row: r, x, y: Math.round(y), kind: 'wall', ladleUntil: 0, flash: 0 };
          this.rowPegs[r].push(p);
          this.pegs.push(p);
        }
      }
    }
    const place = (slots: [number, number][], count: number, kind: PegKind) => {
      for (let m = 0; m < Math.min(count, slots.length); m++) {
        const [fb, off] = slots[m];
        const row = this.rowPegs[Math.max(0, R - 1 - fb)];
        const target = CENTER_X + off;
        const sorted = row.filter((q) => q.kind === 'iron').sort((a, b) => Math.abs(a.x - target) - Math.abs(b.x - target));
        if (sorted[0]) sorted[0].kind = kind;
      }
    };
    place(BUMPER_SLOTS, cfg.malice, 'bumper');
    place(RUNE_SLOTS, cfg.rune ?? 0, 'rune');
    place(THORN_SLOTS, cfg.thorn ?? 0, 'thorn');
    // Bone pegs: a fixed scatter of iron pegs (deterministic stride), 3 per level.
    const bone = cfg.bone ?? 0;
    if (bone > 0) {
      const iron = this.pegs.filter((p) => p.kind === 'iron');
      let k = 5;
      for (let i = 0; i < Math.min(bone, iron.length); i++) {
        while (iron[k % iron.length].kind !== 'iron') k++;
        iron[k % iron.length].kind = 'bone';
        k += 7;
      }
    }
    for (let g = 0; g < Math.min(cfg.gold, GOLD_ROWS.length); g++) {
      const r = Math.max(0, R - 1 - GOLD_ROWS[g]);
      this.gold.push({ id: g, y: r * ROW_H + ROW_H / 2, x: 20 + ((g * 47) % 120), dir: g % 2 ? -1 : 1, flash: 0, boostUntil: 0 });
    }
    this.bucketY = (R - 1) * ROW_H + 12;
    this.dropY = dropYFor(R);
    // Rows sorted by x (stable: Classic rows already are), so step() scans only the pegs in reach.
    for (const row of this.rowPegs) row.sort((a, b) => a.x - b.x);
  }

  rand(): number {
    return this.rng();
  }

  drop(ing: IngId, x: number, tossed = false): Ball {
    const b = newBall(ing, Math.max(BALL_R, Math.min(BOARD_W - BALL_R, x)), this.dropY, (this.rng() - 0.5) * 6, 10, tossed);
    this.balls.push(b);
    return b;
  }

  /** Nearest curseable peg (iron or bone) to a board-local point within maxD, or null. */
  pegAt(x: number, y: number, maxD: number): Peg | null {
    let best: Peg | null = null;
    let bd = maxD * maxD;
    for (const p of this.pegs) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd && (p.kind === 'iron' || p.kind === 'bone')) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Splits a ball into `n` pieces sharing its value (the original stays as one piece). */
  private splitBall(b: Ball, n: number, ev: SimEvents): void {
    b.split = true;
    b.scale /= n === 3 ? 2 : n; // Splitroot: three halves (x1.5 value); thorn: two halves
    b.group ??= { ticked: false };
    const parts: Ball[] = [];
    for (let i = 1; i < n; i++) {
      const dir = i % 2 ? -1 : 1;
      const c = newBall(b.ing, b.x, b.y, dir * (22 + 10 * i) + b.vx * 0.3, Math.min(b.vy, -15), b.tossed);
      c.ladled = b.ladled;
      c.goldHits = b.goldHits;
      c.lastPeg = b.lastPeg;
      c.scale = b.scale;
      c.split = true;
      c.rune = b.rune;
      c.boomed = true;
      c.hopper = b.hopper;
      c.bumped = b.bumped;
      c.group = b.group;
      c.drops = b.drops;
      parts.push(c);
      this.born.push(c);
    }
    ev.split?.(b, parts);
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
      b.vx *= b.ing === 'leadheart' ? 0.97 : 0.998;
      if (b.ing === 'wisp') {
        // Wisp Salt homes toward the best bucket below it (30% of gravity, sideways).
        const off = this.goalX - b.x;
        if (Math.abs(off) > 2) b.vx += Math.sign(off) * 0.3 * GRAVITY * dt;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Walls (a hard hit can bounce out into the Slop Pail).
      if (b.x < BALL_R || b.x > BOARD_W - BALL_R) {
        const side = b.x < BALL_R ? -1 : 1;
        if (b.bumped && Math.abs(b.vx) >= SPILL_V && b.y < this.bucketY - 2 * ROW_H && this.rng() < SPILL_P) {
          b.alive = false;
          died = true;
          ev.spill?.(b, side);
          continue;
        }
        b.x = side < 0 ? BALL_R : BOARD_W - BALL_R;
        b.vx = -side * Math.abs(b.vx) * 0.6;
      }
      // Static pegs in nearby rows.
      const rowF = b.y / ROW_H;
      const r0 = Math.max(0, Math.floor(rowF - 0.5));
      const r1 = Math.min(this.rowPegs.length - 1, Math.ceil(rowF + 0.5));
      for (let r = r0; r <= r1; r++) {
        const row = this.rowPegs[r];
        if (!row) continue;
        // Lower bound of the first peg with x >= b.x - rr.
        let lo = 0;
        let hi = row.length;
        const xmin = b.x - rr;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (row[mid].x < xmin) lo = mid + 1;
          else hi = mid;
        }
        for (let pi = lo; pi < row.length; pi++) {
          const p = row[pi];
          const dx = b.x - p.x;
          if (dx < -rr) break;
          if (dx > rr) continue;
          const dy = b.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          this.collide(b, p.x, p.y, Math.sqrt(d2), p.kind === 'wall' ? 0.3 : ing.rest);
          if (p.kind === 'wall') continue;
          if (b.lastPeg !== p.id) {
            b.lastPeg = p.id;
            b.hits++;
            p.flash = 1;
            ev.peg?.(b, p);
            if (p.kind === 'bone') ev.bone?.(b, p);
            if (b.ing === 'splitroot' && !b.split) this.splitBall(b, 3, ev);
            else if (p.kind === 'thorn' && b.ing === 'toad' && !b.split) this.splitBall(b, 2, ev);
            if (b.ing === 'boomshroom' && !b.boomed && b.hits >= 4) {
              b.boomed = true;
              const lit = this.gold.filter((g) => (g.x - b.x) ** 2 + (g.y - b.y) ** 2 <= BOOM_R * BOOM_R);
              for (const g of lit) g.boostUntil = this.t + BOOM_S;
              ev.boom?.(b, lit);
            }
            if (p.kind === 'rune' && !b.rune) {
              // Lift two rows (more bounces) and charge the value.
              b.rune = true;
              b.y = Math.max(this.dropY, b.y - 2 * ROW_H);
              b.vy = 15;
              b.lastPeg = -1;
              ev.rune?.(b, p);
              break;
            }
          }
          if (p.kind === 'bumper') {
            const dir = Math.abs(b.x - CENTER_X) < 1 ? (this.rng() < 0.5 ? -1 : 1) : Math.sign(b.x - CENTER_X);
            b.vx = dir * BUMP_KICK * (0.9 + this.rng() * 0.2);
            b.vy = Math.min(b.vy, -20);
            b.bumped = true;
            ev.bump?.(b, p);
          } else if (p.ladleUntil > this.t) {
            const off = this.goalX - b.x;
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
          b.goldHits = Math.min(3, b.goldHits + (g.boostUntil > this.t ? 2 : 1));
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
    if (this.born.length) {
      for (const c of this.born) this.balls.push(c);
      this.born.length = 0;
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

export interface LandingStats {
  /** Value share landing in each bucket (sums to 1 - spill). */
  dist: number[];
  /** Mean gold-peg hits of the value landing in bucket k. */
  goldHits: number[];
  /** Share of the value landing in bucket k that was rune-charged. */
  rune: number[];
  /** Value share that spilled into the Slop Pail. */
  spill: number;
  /** Mean distinct peg hits per drop (bone pegs are a share of these). */
  hits: number;
  /** Curseable pegs on this board (the bone-peg share denominator). */
  pegs: number;
}

/**
 * Landing statistics of drops (no Ladles), using common random numbers: the same seeds every call
 * so only the board changes between upgrade states. `chute` < 0 drops at uniformly random x (the
 * toadling rain); a chute index drops down that chute (Tosses, Taught Toadlings, Scrying Ladle).
 * The moving gold pegs ride along (sim-tuned: idleRate counts what the board earns with no
 * input, gold included). `flowMix` (D-cauldron-03) drops the run's own value-weighted pour,
 * specials included, instead of the base mix.
 *
 * D-cauldron-02: resumable, so the EV cache can spread a cold board over several frames
 * (`run(deadline)` stops at the deadline and picks up where it left off; same result either way).
 */
export class LandingJob {
  private counts = new Array(BUCKETS).fill(0);
  private hits = new Array(BUCKETS).fill(0);
  private runes = new Array(BUCKETS).fill(0);
  private spill = 0;
  private pegHits = 0;
  private dropped = 0;
  private xs: () => number;
  private board: Board;
  private ev: SimEvents;
  private order: IngId[];
  private mix: number[];
  private mixW: number;
  private res: LandingStats | null = null;

  constructor(
    cfg: BoardConfig,
    private n = 1500,
    private chute = -1,
    flowMix?: { ing: IngId; w: number }[],
  ) {
    this.xs = mulberry32(chute < 0 ? 0xc0ffee : 0xc0ffee + 101 * (chute + 1));
    this.board = new Board(cfg, chute < 0 ? 12345 : 12345 + chute);
    this.ev = {
      land: (b, k) => {
        this.counts[k] += b.scale;
        this.hits[k] += b.goldHits * b.scale;
        if (b.rune) this.runes[k] += b.scale;
        this.pegHits += b.hits * b.scale;
      },
      spill: (b) => {
        this.spill += b.scale;
        this.pegHits += b.hits * b.scale;
      },
    };
    // Ingredients fall differently (bounce, gravity), so drop the value-weighted mix (weight x
    // value) the payout actually sees, not Newts only.
    this.order = flowMix ? flowMix.map((m) => m.ing) : ING_ORDER;
    this.mix = flowMix ? flowMix.map((m) => m.w) : ING_ORDER.map((i) => INGREDIENTS[i].weight * INGREDIENTS[i].value);
    this.mixW = this.mix.reduce((a, b) => a + b, 0);
  }

  get done(): boolean {
    return this.res !== null;
  }

  private pick(r: number): IngId {
    let x = r * this.mixW;
    for (let i = 0; i < this.order.length; i++) if ((x -= this.mix[i]) <= 0) return this.order[i];
    return this.order[0];
  }

  /** Steps until finished, or until `deadline` (performance.now() ms) passes. True when done. */
  run(deadline = Infinity): boolean {
    if (this.res) return true;
    const { board, ev, n, chute } = this;
    let k = 0;
    // Keep ~20 balls in flight so the run is cheap but still uses the real step.
    while (this.dropped < n || board.balls.length) {
      if (this.dropped < n && board.balls.length < 20) {
        const x = chute < 0 ? BALL_R + this.xs() * (BOARD_W - 2 * BALL_R) : chute * COL_W + COL_W / 2 + (this.xs() - 0.5) * 2;
        board.drop(this.pick(this.xs()), x, chute >= 0);
        this.dropped++;
      }
      board.step(ev);
      if (++k % 32 === 0 && deadline !== Infinity && performance.now() >= deadline) return false;
    }
    const { counts, hits, runes, spill } = this;
    const landed = counts.reduce((a, b) => a + b, 0);
    const total = landed + spill || 1;
    this.res = {
      dist: counts.map((c) => c / total),
      goldHits: hits.map((h, i) => (counts[i] ? h / counts[i] : 0)),
      rune: runes.map((h, i) => (counts[i] ? h / counts[i] : 0)),
      spill: spill / total,
      hits: this.pegHits / total,
      pegs: board.pegs.filter((p) => p.kind === 'iron' || p.kind === 'bone').length,
    };
    return true;
  }

  result(): LandingStats {
    this.run();
    return this.res!;
  }
}

export function landingStats(cfg: BoardConfig, n = 1500, chute = -1, flowMix?: { ing: IngId; w: number }[]): LandingStats {
  return new LandingJob(cfg, n, chute, flowMix).result();
}

export function landingDistribution(rows: number, malice: number, n = 1500): number[] {
  return landingStats({ rows, malice, gold: 0 }, n).dist;
}
