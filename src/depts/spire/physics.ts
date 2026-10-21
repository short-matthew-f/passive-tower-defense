// The Spire's own small circle physics (no Matter.js): position-based dynamics with substeps.
// Circles plus two walls and a floor, fixed 60 Hz steps, a hard body cap. Position correction is
// split by mass (uniform density: m = r^2), with contact friction so piles stack instead of
// sliding like ice. Same-tier contacts are queued and resolved once per step (lowest id wins).
// Pure TypeScript: the scene and the headless bot both run it.

export const STEP = 1 / 60;
const SUBSTEPS = 3;
const ITERS = 3;
const BASE_G = 520; // px/s^2 at Volatility 0
const MAX_V = 420;
const MERGE_SLOP = 0.6;
const GROW_S = 0.12;

export interface Orb {
  id: number;
  tier: number;
  x: number; // from the flask's center line
  y: number; // from the flask mouth, downward
  vx: number;
  vy: number;
  r: number; // current radius (grows after a merge)
  rt: number; // target radius
  px: number;
  py: number;
  alive: boolean;
  age: number;
  /** Set once the orb has touched something (a dropped orb in free fall never vents the flask). */
  landed: boolean;
  /** Merge flash timer for rendering. */
  flash: number;
}

export interface MergeEvent {
  a: Orb;
  b: Orb;
  /** The orb that now holds the merged tier (null for a Singularity: both vanish). */
  into: Orb | null;
  x: number;
  y: number;
  fromTier: number;
}

export class Flask {
  orbs: Orb[] = [];
  /** Interior width and height. */
  w: number;
  h: number;
  gravity = BASE_G;
  /** Soft ceiling (the dropper rail): overlap pushes never fling an orb out over the HUD. */
  top = -20;
  maxOrbs: number;
  private nextId = 1;
  private pairs: [Orb, Orb][] = [];
  private contacts: [Orb, Orb, number, number][] = [];
  /** Tier a merge of two `t` orbs produces; the core may return t+2 (Tome of Twinning). */
  mergeTier: (t: number) => number = (t) => t + 1;
  radius: (t: number) => number;
  onMerge: (e: MergeEvent) => void = () => {};

  constructor(w: number, h: number, radius: (t: number) => number, maxOrbs = 64) {
    this.w = w;
    this.h = h;
    this.radius = radius;
    this.maxOrbs = maxOrbs;
  }

  get count(): number {
    return this.orbs.length;
  }

  add(tier: number, x: number, y: number, vx = 0, vy = 0): Orb | null {
    if (this.orbs.length >= this.maxOrbs) return null;
    const r = this.radius(tier);
    const o: Orb = { id: this.nextId++, tier, x, y, vx, vy, r, rt: r, px: x, py: y, alive: true, age: 0, landed: false, flash: 0 };
    this.orbs.push(o);
    return o;
  }

  remove(o: Orb): void {
    o.alive = false;
    const i = this.orbs.indexOf(o);
    if (i >= 0) this.orbs.splice(i, 1);
  }

  clear(): void {
    this.orbs.length = 0;
  }

  /** Radial impulse toward (x, y) (the Singularity's implosion; negative = outward). */
  pull(x: number, y: number, speed: number): void {
    for (const o of this.orbs) {
      const dx = x - o.x;
      const dy = y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      o.vx += (dx / d) * speed;
      o.vy += (dy / d) * speed;
    }
  }

  /** One fixed step. */
  step(): void {
    const h = STEP / SUBSTEPS;
    const orbs = this.orbs;
    const half = this.w / 2;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const o of orbs) {
        if (o.r < o.rt) o.r = Math.min(o.rt, o.r + (o.rt / GROW_S) * h);
        o.vy += this.gravity * h;
        o.px = o.x;
        o.py = o.y;
        o.x += o.vx * h;
        o.y += o.vy * h;
      }
      const last = s === SUBSTEPS - 1;
      for (let it = 0; it < ITERS; it++) this.solve(half, last && it === ITERS - 1);
      for (const o of orbs) {
        let vx = (o.x - o.px) / h;
        let vy = (o.y - o.py) / h;
        const sp = Math.hypot(vx, vy);
        if (sp > MAX_V) {
          vx *= MAX_V / sp;
          vy *= MAX_V / sp;
        }
        // A whisper of air drag keeps resting piles calm.
        o.vx = vx * 0.998;
        o.vy = vy * 0.998;
        // Floor and wall friction (restitution ~0 from the position solve).
        if (o.y >= this.h - o.r - 0.05) {
          o.vx *= 0.9;
          o.landed = true;
        }
        if (o.x <= -half + o.r + 0.05 || o.x >= half - o.r - 0.05) o.vy *= 0.97;
      }
      this.friction();
    }
    for (const o of orbs) {
      o.age += STEP;
      if (o.flash > 0) o.flash = Math.max(0, o.flash - STEP);
    }
    this.resolveMerges();
  }

  private solve(half: number, record: boolean): void {
    const orbs = this.orbs;
    const n = orbs.length;
    if (record) {
      this.contacts.length = 0;
    }
    for (let i = 0; i < n; i++) {
      const a = orbs[i];
      for (let j = i + 1; j < n; j++) {
        const b = orbs[j];
        const rs = a.r + b.r;
        const dx = b.x - a.x;
        if (dx > rs + MERGE_SLOP || dx < -rs - MERGE_SLOP) continue;
        const dy = b.y - a.y;
        if (dy > rs + MERGE_SLOP || dy < -rs - MERGE_SLOP) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= (rs + MERGE_SLOP) * (rs + MERGE_SLOP)) continue;
        if (record && a.tier === b.tier) this.pairs.push(a.id < b.id ? [a, b] : [b, a]);
        if (d2 >= rs * rs) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = d2 > 0 ? dx / d : 0;
        const ny = d2 > 0 ? dy / d : 1;
        const pen = rs - d;
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const wa = mb / (ma + mb);
        const wb = 1 - wa;
        a.x -= nx * pen * wa;
        a.y -= ny * pen * wa;
        b.x += nx * pen * wb;
        b.y += ny * pen * wb;
        a.landed = true;
        b.landed = true;
        if (record) this.contacts.push([a, b, nx, ny]);
      }
    }
    for (const o of orbs) {
      if (o.x < -half + o.r) o.x = -half + o.r;
      else if (o.x > half - o.r) o.x = half - o.r;
      if (o.y > this.h - o.r) o.y = this.h - o.r;
      else if (o.y < this.top + o.r) o.y = this.top + o.r;
    }
  }

  /** Coulomb-ish tangential damping at contacts: piles hold their shape. */
  private friction(): void {
    for (const [a, b, nx, ny] of this.contacts) {
      if (!a.alive || !b.alive) continue;
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      const tx = rvx - vn * nx;
      const ty = rvy - vn * ny;
      const ma = a.r * a.r;
      const mb = b.r * b.r;
      const k = 0.25;
      const ia = (mb / (ma + mb)) * k;
      const ib = (ma / (ma + mb)) * k;
      a.vx += tx * ia;
      a.vy += ty * ia;
      b.vx -= tx * ib;
      b.vy -= ty * ib;
    }
  }

  private resolveMerges(): void {
    if (!this.pairs.length) return;
    const pairs = this.pairs;
    pairs.sort((p, q) => p[0].id - q[0].id || p[1].id - q[1].id);
    const used = new Set<number>();
    for (const [a, b] of pairs) {
      if (!a.alive || !b.alive || a.tier !== b.tier || used.has(a.id) || used.has(b.id)) continue;
      used.add(a.id);
      used.add(b.id);
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const fromTier = a.tier;
      const next = this.mergeTier(a.tier);
      if (next > 11) {
        // Singularity: both vanish.
        this.remove(a);
        this.remove(b);
        this.onMerge({ a, b, into: null, x, y, fromTier });
        continue;
      }
      this.remove(b);
      // The lower id keeps its identity, grows from its old size, and sits at the midpoint.
      a.tier = next;
      a.rt = this.radius(next);
      a.x = a.px = x;
      a.y = a.py = y;
      a.vx = (a.vx + b.vx) / 2;
      a.vy = Math.min(0, (a.vy + b.vy) / 2);
      a.flash = 0.2;
      a.landed = true;
      used.add(a.id);
      this.onMerge({ a, b, into: a, x, y, fromTier });
    }
    pairs.length = 0;
  }

  speed(o: Orb): number {
    return Math.hypot(o.vx, o.vy);
  }
}
