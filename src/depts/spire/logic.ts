// The Spire's game logic without rendering: the flask, the dropper and smarter bag, merges with
// cascade Resonance, the Overflow Vent, the Feat and Grimoire Pages. The scene drives it every
// frame; a balance bot can drive it headless.
import {
  arcanaMult,
  brimDepth,
  cascadeWindow,
  cooldown,
  FLASK_H,
  flaskW,
  gravityMult,
  heldVol,
  MAX_TIER,
  normalize,
  pickSpawn,
  potentMult,
  resCap,
  SINGULARITY_TIER,
  SINGULARITY_VALUE,
  TIERS,
  tomeOf,
  VENT_BAND,
  type SpirePersistent,
  type SpireRun,
} from './def';
import { Flask, STEP, type MergeEvent, type Orb } from './physics';

export const MAX_ORBS = 64;
const VENT_S = 2.5;
const WARN_S = 1.0;
const VENT_LOCK_S = 1.5;
const SETTLED_V = 10;
const VENT_REFUND = 0.25;
const V_IDLE_HOLD_MS = 10 * 60_000;

export interface CoreHooks {
  earn(base: number): number;
  raiseSkill(level: number): void;
  merge?(e: MergeEvent, amount: number, depth: number, res: number): void;
  singularity?(x: number, y: number, amount: number): void;
  vent?(ejected: Orb[], refund: number): void;
  drop?(o: Orb): void;
  newTier?(tier: number): void;
  page?(n: number, why: string): void;
}

/** Mulberry32: a seeded RNG so bug reports reproduce. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SpireCore {
  run: SpireRun;
  per: SpirePersistent;
  flask: Flask;
  hooks: CoreHooks;
  rnd: () => number;
  /** Seconds until the next drop is allowed. */
  cool = 0;
  /** Vent lockout. */
  lock = 0;
  /** Cascade: merges since the last drop, and time since the last merge. */
  depth = 0;
  sinceMerge = 99;
  res = 1;
  /** Time a settled orb has sat above the Brim Line. */
  brimT = 0;
  /** Time since the last drop (isIntense). */
  sinceDrop = 99;
  aimX = 0;
  private acc = 0;
  private falling: Orb | null = null;

  constructor(run: SpireRun, per: SpirePersistent, hooks: CoreHooks, seed = (Math.random() * 2 ** 31) | 0) {
    normalize(run, per);
    this.run = run;
    this.per = per;
    this.hooks = hooks;
    this.rnd = rng(seed);
    this.flask = new Flask(flaskW(run), FLASK_H, (t) => TIERS[Math.min(MAX_TIER, t)].r, MAX_ORBS);
    this.flask.mergeTier = (t) => (tomeOf(per, 'twinning') > 0 && t < MAX_TIER - 1 && this.rnd() < 0.05 ? t + 2 : t + 1);
    this.flask.onMerge = (e) => this.onMerge(e);
    this.refresh();
    this.restore();
  }

  // ---------- state ----------

  /** Re-read upgrade-driven geometry and physics. */
  refresh(): void {
    this.flask.w = flaskW(this.run);
    this.flask.gravity = 520 * gravityMult(this.run.vol);
  }

  get brimY(): number {
    return brimDepth(this.run);
  }

  get current(): number {
    return this.run.queue[0];
  }

  /** Restore the saved flask (velocities zeroed). */
  private restore(): void {
    const f = this.run.flask;
    for (let i = 0; i + 2 < f.length; i += 3) {
      const t = Math.max(1, Math.min(MAX_TIER, Math.round(f[i])));
      const o = this.flask.add(t, f[i + 1], f[i + 2]);
      if (o) o.landed = true;
    }
  }

  /** Write the flask into the save (positions rounded to 0.1 px). */
  persist(): void {
    const out: number[] = [];
    for (const o of this.flask.orbs) out.push(o.tier, Math.round(o.x * 10) / 10, Math.round(o.y * 10) / 10);
    this.run.flask = out;
  }

  // ---------- the bag ----------

  private draw(): number {
    const noT1 = this.run.t1Run >= 2;
    const t = pickSpawn(this.run, this.rnd(), noT1);
    this.run.t1Run = t === 1 ? this.run.t1Run + 1 : 0;
    return t;
  }

  canDrop(): boolean {
    return this.cool <= 0 && this.lock <= 0 && this.flask.count < MAX_ORBS;
  }

  /** Clamp an aim x (from center) so the current orb stays inside the walls. */
  clampAim(x: number): number {
    const r = TIERS[this.current].r;
    const half = this.flask.w / 2;
    return Math.max(-half + r, Math.min(half - r, x));
  }

  dropY(): number {
    return -TIERS[this.current].r - 3;
  }

  drop(x = this.aimX): Orb | null {
    if (!this.canDrop()) return null;
    const run = this.run;
    const tier = this.current;
    const o = this.flask.add(tier, this.clampAim(x), this.dropY(), 0, 30);
    if (!o) return null;
    run.queue.shift();
    while (run.queue.length < 3) run.queue.push(this.draw());
    this.cool = cooldown(run);
    this.falling = o;
    // A drop ends the previous cascade (04 §2.4).
    this.depth = 0;
    this.res = 1;
    this.sinceDrop = 0;
    run.stats.drops++;
    run.stats.dropsSinceVent++;
    run.volLog.push(run.vol);
    if (run.volLog.length > 60) run.volLog.splice(0, run.volLog.length - 60);
    this.hooks.drop?.(o);
    return o;
  }

  setVol(v: number, now = Date.now()): boolean {
    const run = this.run;
    const n = Math.max(0, Math.min(run.volBought, v));
    if (n === run.vol) return false;
    if (n > run.vol) run.volSetAt = now;
    run.vol = n;
    run.minSinceVent = Math.min(run.minSinceVent, n);
    if (n < run.vIdle) run.vIdle = n;
    this.refresh();
    return true;
  }

  // ---------- frame ----------

  update(dt: number, now = Date.now()): void {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) {
      this.acc -= STEP;
      steps++;
      this.tick();
    }
    if (this.acc > STEP) this.acc = 0; // fell behind: drop the backlog rather than spiral
    // Idle uses the lowest Volatility of the last 10 min.
    const run = this.run;
    if (run.vol < run.vIdle) run.vIdle = run.vol;
    else if (run.vol > run.vIdle && now - run.volSetAt >= V_IDLE_HOLD_MS) run.vIdle = run.vol;
  }

  private tick(): void {
    this.cool = Math.max(0, this.cool - STEP);
    this.lock = Math.max(0, this.lock - STEP);
    this.sinceDrop += STEP;
    this.sinceMerge += STEP;
    this.flask.step();
    if (this.falling && (!this.falling.alive || this.falling.landed)) this.falling = null;
    // Cascade window.
    if (this.depth > 0 && this.sinceMerge > cascadeWindow(this.run)) {
      this.depth = 0;
      this.res = 1;
    }
    this.checkBrim();
  }

  get brimWarn(): boolean {
    return this.brimT >= WARN_S;
  }

  get brimFrac(): number {
    return Math.min(1, this.brimT / VENT_S);
  }

  private checkBrim(): void {
    const brim = this.brimY;
    let over = false;
    for (const o of this.flask.orbs) {
      if (!o.landed || o === this.falling) continue;
      if (o.y - o.r < brim && this.flask.speed(o) < SETTLED_V) {
        over = true;
        break;
      }
    }
    this.brimT = over ? this.brimT + STEP : 0;
    if (this.brimT >= VENT_S) this.vent();
  }

  /** Overflow Vent (04 §5): eject every orb above the Vent Line for a 25% refund. */
  vent(refundFrac = VENT_REFUND): void {
    const line = this.brimY + VENT_BAND;
    const out = this.flask.orbs.filter((o) => o.y < line);
    let base = 0;
    for (const o of out) {
      base += TIERS[o.tier].value;
      this.flask.remove(o);
    }
    const run = this.run;
    const refund = base > 0 ? this.hooks.earn(base * refundFrac * potentMult(run) * arcanaMult(run.vol)) : 0;
    this.brimT = 0;
    this.depth = 0;
    this.res = 1;
    this.lock = VENT_LOCK_S;
    this.falling = null;
    run.stats.vents++;
    run.stats.dropsSinceVent = 0;
    run.minSinceVent = run.vol;
    this.hooks.vent?.(out, refund);
  }

  private onMerge(e: MergeEvent): void {
    const run = this.run;
    this.depth++;
    this.sinceMerge = 0;
    this.res = Math.min(resCap(run), 1 + 0.25 * (this.depth - 1));
    run.stats.merges++;
    run.stats.bestChain = Math.max(run.stats.bestChain, this.depth);
    const mult = potentMult(run) * arcanaMult(run.vol) * this.res;
    const created = e.into ? e.into.tier : SINGULARITY_TIER;
    const held = heldVol(run);
    const score = created + held;
    if (score > run.featBest) run.featBest = score;
    this.hooks.raiseSkill(score);
    if (!e.into) {
      const amount = this.hooks.earn(SINGULARITY_VALUE * mult);
      run.stats.singularities++;
      this.per.singularitiesEver++;
      this.grantPage(1, 'SINGULARITY');
      for (const m of [3, 6, 9, 10]) {
        if (run.vol >= m && !this.per.singMilestones.includes(m)) {
          this.per.singMilestones.push(m);
          this.grantPage(1, `SINGULARITY AT V${m}`);
        }
      }
      this.flask.pull(e.x, e.y, 140);
      this.hooks.singularity?.(e.x, e.y, amount);
      return;
    }
    const amount = this.hooks.earn(TIERS[created].value * mult);
    if (created > run.ceiling) run.ceiling = created;
    if (created > run.stats.maxTier) {
      run.stats.maxTier = created;
      this.hooks.newTier?.(created);
    }
    if (created === MAX_TIER) run.stats.voidStars++;
    this.hooks.merge?.(e, amount, this.depth, this.res);
  }

  private grantPage(n: number, why: string): void {
    this.per.pages += n;
    this.per.pagesEver += n;
    this.hooks.page?.(n, why);
  }

  /** isIntense (04 §18): a cascade, the brim warning, or just after a drop. */
  get intense(): boolean {
    return this.sinceMerge < 1.5 || this.brimWarn || this.sinceDrop < 0.6;
  }
}
