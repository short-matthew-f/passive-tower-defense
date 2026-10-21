// The Spire's game logic without rendering: the flask, the dropper and smarter bag, merges with
// cascade Resonance, the Overflow Vent, the Feat and Grimoire Pages. The scene drives it every
// frame; a balance bot can drive it headless.
import {
  arcanaMult,
  brimDepth,
  canMerge,
  CATALYST,
  catalystEvery,
  cascadeWindow,
  cooldown,
  HEX,
  HEX_TOP_CAP,
  hexChance,
  isSpecial,
  LEGEND_BODY,
  lvOf,
  orbR,
  QUICK,
  QUICK_CD,
  QUICK_LIFE_S,
  TREMOR_CD,
  VENT_NOW_CD,
  VENT_NOW_REFUND,
  VOL_LOWER_MS,
  FLASK_H,
  essenceFor,
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
/** A full-flask vent ejects at least this many orbs. */
const MIN_VENTED = 10;
const V_IDLE_HOLD_MS = 10 * 60_000;

export interface CoreHooks {
  earn(base: number): number;
  raiseSkill(level: number): void;
  merge?(e: MergeEvent, amount: number, depth: number, res: number): void;
  singularity?(x: number, y: number, amount: number): void;
  vent?(ejected: Orb[], refund: number, manual: boolean): void;
  drop?(o: Orb): void;
  newTier?(tier: number): void;
  page?(n: number, why: string): void;
  /** Hex Stones shattered (orbs already removed). */
  shatter?(stones: Orb[], amount: number): void;
  /** A Void Star (Tome of Hunger) ate a small orb. */
  devour?(eater: Orb, eaten: Orb, amount: number): void;
  /** A Quicksilver bead dissolved. */
  fizz?(o: Orb): void;
  tremor?(): void;
  /** A lowered Volatility took effect. */
  volApplied?(v: number): void;
  /** DeptSave.imports (Goods, 00 §4): Tempered Glass widens the flask. */
  imports?: Record<string, number>;
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
  /** Tool cooldowns (s). */
  tremorCool = 0;
  quickCool = 0;
  ventNowCool = 0;
  /** No Hex Stones are drawn (the onboarding's first drops, the Last Stand). */
  noHex = false;
  private acc = 0;
  private falling: Orb | null = null;
  private ticks = 0;

  constructor(run: SpireRun, per: SpirePersistent, hooks: CoreHooks, seed = (Math.random() * 2 ** 31) | 0) {
    normalize(run, per);
    this.run = run;
    this.per = per;
    this.hooks = hooks;
    this.rnd = rng(seed);
    this.flask = new Flask(flaskW(run, hooks.imports?.ingots ?? 0), FLASK_H, orbR, MAX_ORBS);
    this.flask.mergeable = canMerge;
    this.flask.catalyst = CATALYST;
    // Quicksilver shoves like a much bigger orb; the Legend is a boulder.
    this.flask.mass = (o) => (o.tier === QUICK ? 18 * 18 : o.tier === LEGEND_BODY ? 60 * 60 : o.r * o.r);
    this.flask.mergeTier = (t) => (tomeOf(per, 'twinning') > 0 && t < MAX_TIER - 1 && this.rnd() < 0.05 ? t + 2 : t + 1);
    this.flask.onMerge = (e) => this.onMerge(e);
    this.refresh();
    this.restore();
  }

  // ---------- state ----------

  /** Re-read upgrade-driven geometry and physics. */
  refresh(): void {
    this.flask.w = flaskW(this.run, this.hooks.imports?.ingots ?? 0);
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
      const raw = Math.round(f[i]);
      if (!Number.isFinite(raw) || !Number.isFinite(f[i + 1]) || !Number.isFinite(f[i + 2])) continue;
      const t = raw === CATALYST || raw === HEX || raw === QUICK ? raw : Math.max(1, Math.min(MAX_TIER, raw));
      const half = this.flask.w / 2 - orbR(t);
      const o = this.flask.add(t, Math.max(-half, Math.min(half, f[i + 1])), Math.max(-10, Math.min(FLASK_H - orbR(t), f[i + 2])));
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
    const run = this.run;
    // The Catalyst is scheduled (04 §3): one per catalystEvery drops.
    if (run.catT >= catalystEvery(run) && !run.queue.includes(CATALYST)) {
      run.catT = 0;
      return CATALYST;
    }
    // Volatility junk (04 §7): Hex Stones; never two in a row in the preview.
    const hx = this.rnd();
    if (!this.noHex && hx < hexChance(run.vol) && run.queue[run.queue.length - 1] !== HEX) return HEX;
    const noT1 = run.t1Run >= 2;
    const t = pickSpawn(run, this.rnd(), noT1);
    run.t1Run = t === 1 ? run.t1Run + 1 : 0;
    return t;
  }

  canDrop(): boolean {
    return this.cool <= 0 && this.lock <= 0 && this.flask.count < MAX_ORBS;
  }

  /** Clamp an aim x (from center) so the current orb stays inside the walls. */
  clampAim(x: number): number {
    const r = orbR(this.current);
    const half = this.flask.w / 2;
    return Math.max(-half + r, Math.min(half - r, x));
  }

  dropY(): number {
    return -orbR(this.current) - 3;
  }

  /** Put an orb in the dropper ahead of the queue (Quicksilver, the sealed return gift). */
  pushFront(tier: number): void {
    this.run.queue.unshift(tier);
    if (this.run.queue.length > 5) this.run.queue.length = 5;
  }

  // ---------- tools (04 §5, §6 B) ----------

  get hasTremor(): boolean {
    return lvOf(this.run, 'tremor') > 0;
  }
  get hasQuick(): boolean {
    return lvOf(this.run, 'quick') > 0;
  }
  get hasVentNow(): boolean {
    return lvOf(this.run, 'settle') > 0;
  }

  /** Overlord's Tremor: jolt every orb upward (10 s cooldown). Same-tier neighbours that sat a
   * hair apart get a second chance to touch. */
  tremor(): boolean {
    if (!this.hasTremor || this.tremorCool > 0 || this.flask.count === 0) return false;
    this.tremorCool = TREMOR_CD;
    for (const o of this.flask.orbs) {
      if (o.tier === LEGEND_BODY) continue;
      const k = Math.max(0.5, 1.2 - o.r / 40); // big orbs barely lift
      o.vy -= 120 * k;
      o.vx += (this.rnd() - 0.5) * 50 * k;
    }
    this.run.stats.tremors++;
    this.hooks.tremor?.();
    return true;
  }

  /** Quicksilver Phial: the next orb out is a Quicksilver bead (the orb in hand waits behind it). */
  quick(): boolean {
    if (!this.hasQuick || this.quickCool > 0 || this.current === QUICK) return false;
    this.quickCool = QUICK_CD;
    this.pushFront(QUICK);
    this.run.stats.quicks++;
    return true;
  }

  /** Orbs a vent would eject right now. */
  ventable(): number {
    const line = this.brimY + VENT_BAND;
    let n = 0;
    for (const o of this.flask.orbs) if (o.y < line && o !== this.falling) n++;
    return n;
  }

  /** Settle Charm: vent on purpose at 50% (20 s cooldown). It does not restart the Feat's hold
   * window (only a real overflow does), so it can't be used to launder a just-raised knob. */
  ventNow(): boolean {
    if (!this.hasVentNow || this.ventNowCool > 0 || this.lock > 0 || this.ventable() === 0) return false;
    this.ventNowCool = VENT_NOW_CD;
    this.run.stats.ventNows++;
    this.vent(VENT_NOW_REFUND, true);
    return true;
  }

  drop(x = this.aimX): Orb | null {
    if (!this.canDrop()) return null;
    const run = this.run;
    const tier = this.current;
    const o = this.flask.add(tier, this.clampAim(x), this.dropY(), 0, 30);
    if (!o) return null;
    run.queue.shift();
    run.catT++;
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

  /** The setting the knob points at (a pending lower setting, else the live one). */
  get volTarget(): number {
    return this.run.volPending >= 0 ? this.run.volPending : this.run.vol;
  }

  /**
   * Turn the knob. Raising applies at once; lowering applies on the next vent or after 30 s
   * (04 §7), so a hot flask can't be cooled the instant before it overflows.
   */
  setVol(v: number, now = Date.now()): boolean {
    const run = this.run;
    const n = Math.max(0, Math.min(run.volBought, v));
    if (n === this.volTarget) return false;
    if (n >= run.vol) {
      run.volPending = -1;
      if (n === run.vol) return true;
      run.volSetAt = now;
      run.vol = n;
      this.refresh();
      return true;
    }
    run.volPending = n;
    run.volPendAt = now;
    return true;
  }

  /** Apply a pending lower setting now. */
  private applyPendingVol(): void {
    const run = this.run;
    if (run.volPending < 0) return;
    const n = Math.min(run.volPending, run.vol);
    run.volPending = -1;
    run.vol = n;
    run.minSinceVent = Math.min(run.minSinceVent, n);
    if (n < run.vIdle) run.vIdle = n;
    this.refresh();
    this.hooks.volApplied?.(n);
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
    const run = this.run;
    if (run.volPending >= 0 && now - run.volPendAt >= VOL_LOWER_MS) this.applyPendingVol();
    // Idle uses the lowest Volatility of the last 10 min.
    if (run.vol < run.vIdle) run.vIdle = run.vol;
    else if (run.vol > run.vIdle && now - run.volSetAt >= V_IDLE_HOLD_MS) run.vIdle = run.vol;
  }

  private tick(): void {
    this.cool = Math.max(0, this.cool - STEP);
    this.lock = Math.max(0, this.lock - STEP);
    this.sinceDrop += STEP;
    this.sinceMerge += STEP;
    this.tremorCool = Math.max(0, this.tremorCool - STEP);
    this.quickCool = Math.max(0, this.quickCool - STEP);
    this.ventNowCool = Math.max(0, this.ventNowCool - STEP);
    this.flask.step();
    if (this.falling && (!this.falling.alive || this.falling.landed)) this.falling = null;
    if (++this.ticks % 6 === 0) this.specials();
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
    // A flask packed to the body cap with small orbs and Hex Stones can stay under the Brim Line
    // and still refuse every drop: treat a full flask as an overflow too (never a softlock).
    if (!over && this.flask.count >= MAX_ORBS) over = true;
    this.brimT = over ? this.brimT + STEP : 0;
    if (this.brimT >= VENT_S) this.vent();
  }

  /** Special orbs, ten times a second: Quicksilver melts, Hex triples shatter, Void Stars feed. */
  private specials(): void {
    const orbs = this.flask.orbs;
    let hexes = 0;
    let voids = 0;
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      if (o.tier === QUICK && o.age >= QUICK_LIFE_S) {
        this.flask.remove(o);
        this.hooks.fizz?.(o);
      } else if (o.tier === HEX) hexes++;
      else if (o.tier === MAX_TIER) voids++;
    }
    if (hexes >= 3) this.shatterHex();
    if (voids > 0 && tomeOf(this.per, 'hunger') > 0) this.feedVoids();
  }

  /** The value one Hex Stone pays when its triple shatters: 3 x the top tier's value / 10 per
   * triple (04 §3), so a tenth of it per stone. */
  hexValue(): number {
    let top = Math.max(2, Math.min(MAX_TIER, this.run.ceiling || 2));
    for (const o of this.flask.orbs) if (!isSpecial(o.tier) && o.tier > top) top = o.tier;
    return TIERS[Math.min(HEX_TOP_CAP, top)].value / 10;
  }

  private shatterHex(): void {
    const hx = this.flask.orbs.filter((o) => o.tier === HEX);
    // Union-find over touching Hex Stones.
    const parent = hx.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < hx.length; i++)
      for (let j = i + 1; j < hx.length; j++) {
        const a = hx[i];
        const b = hx[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 1.2) parent[find(i)] = find(j);
      }
    const groups = new Map<number, Orb[]>();
    hx.forEach((o, i) => {
      const k = find(i);
      const g = groups.get(k);
      if (g) g.push(o);
      else groups.set(k, [o]);
    });
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      for (const o of g) this.flask.remove(o);
      const run = this.run;
      const amount = this.hooks.earn(this.hexValue() * g.length * potentMult(run) * arcanaMult(run.vol));
      run.stats.hexShatters++;
      this.hooks.shatter?.(g, amount);
    }
  }

  /** Tome of Hunger: each Void Star eats one touching T1-T3 orb per tenth of a second, paying it
   * as if it had merged once. */
  private feedVoids(): void {
    const run = this.run;
    for (const v of this.flask.orbs.slice()) {
      if (v.tier !== MAX_TIER || !v.alive) continue;
      for (const o of this.flask.orbs) {
        if (o === v || o.tier > 3 || isSpecial(o.tier) || o === this.falling) continue;
        if (Math.hypot(o.x - v.x, o.y - v.y) > o.r + v.r + 1) continue;
        this.flask.remove(o);
        const amount = this.hooks.earn(TIERS[o.tier + 1].value * potentMult(run) * arcanaMult(run.vol));
        this.hooks.devour?.(v, o, amount);
        break;
      }
    }
  }

  /** Overflow Vent (04 §5): eject every orb above the Vent Line for a 25% refund. `manual` = the
   * Settle Charm's Vent Now (50%, keeps the Feat's hold window). */
  vent(refundFrac = VENT_REFUND, manual = false): void {
    const line = this.brimY + VENT_BAND;
    const out = this.flask.orbs.filter((o) => o.y < line && o.tier !== LEGEND_BODY);
    if (!manual && out.length < MIN_VENTED && this.flask.count >= MAX_ORBS - MIN_VENTED) {
      // Packed full below the Vent Line: the steam takes the highest orbs instead.
      const rest = this.flask.orbs.filter((o) => !out.includes(o)).sort((a, b) => a.y - b.y);
      out.push(...rest.slice(0, MIN_VENTED - out.length));
    }
    let base = 0;
    for (const o of out) {
      base += isSpecial(o.tier) ? 0 : TIERS[o.tier].value;
      this.flask.remove(o);
    }
    const run = this.run;
    const refund = base > 0 ? this.hooks.earn(base * refundFrac * potentMult(run) * arcanaMult(run.vol)) : 0;
    this.brimT = 0;
    this.depth = 0;
    this.res = 1;
    this.lock = VENT_LOCK_S;
    this.falling = null;
    if (!manual) {
      run.stats.vents++;
      run.stats.dropsSinceVent = 0;
      run.minSinceVent = run.vol;
    }
    this.applyPendingVol();
    this.hooks.vent?.(out, refund, manual);
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
    if (e.catalyst) run.stats.catalysts++;
    const held = heldVol(run);
    const score = created + held;
    if (score > run.featBest) run.featBest = score;
    this.hooks.raiseSkill(score);
    run.stats.essence = (run.stats.essence ?? 0) + essenceFor(created);
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
    return this.sinceMerge < 1.5 || this.brimT > 0.4 || this.sinceDrop < 0.6;
  }
}
