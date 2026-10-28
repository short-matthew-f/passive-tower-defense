// The Sorcerer's Spire: pure economy (specs/04). No Pixi, no physics: the shared core, the
// headless balance simulation and the scene all read this. index.ts spreads `spireEcon` into the
// full DeptDef.
import type { Commendation, DeptEcon, DeptGoal, NightOrderDef, StewardCandidate } from '../../core/dept';
import { formatNum } from '../../core/format';
import type { DeptSave } from '../../core/types';

// ---------- orb tiers (04 §3; radii re-curved so a Void Star is ~46% of the base width) ----------

import { LONG_GROWTH, LONG_MAX, longDesc, longLocked, longMult } from '../../core/longnode';

export interface TierDef {
  name: string;
  r: number;
  /** Arcana paid when a merge creates this tier (before multipliers). */
  value: number;
}

/** Index = tier (1..11). Tier 0 is unused. */
export const TIERS: TierDef[] = [
  { name: '', r: 0, value: 0 },
  { name: 'Spark', r: 5, value: 1 },
  { name: 'Ember', r: 6, value: 4 },
  { name: 'Wisp', r: 8, value: 12 },
  { name: 'Glimmer', r: 10, value: 36 },
  { name: 'Hexball', r: 12, value: 110 },
  { name: 'Bloodmoon', r: 15, value: 330 },
  { name: 'Soulfire', r: 18, value: 1000 },
  { name: 'Stormheart', r: 22, value: 3000 },
  { name: 'Eclipse', r: 26, value: 9000 },
  { name: 'Abyssal Eye', r: 31, value: 27000 },
  { name: 'Void Star', r: 37, value: 81000 },
];
export const MAX_TIER = 11;
/** A Singularity (two Void Stars) counts as tier 12 for the Feat. */
export const SINGULARITY_TIER = 12;
export const SINGULARITY_VALUE = 250_000;

// ---------- special orbs (04 §3 "Special orbs") ----------
// Codes live above the tier range so a saved flask stores them like any orb.

/** Merges with any orb T1-T10, upgrading it one tier. 1 per 60 drops (Catalyst Coil: -6 each). */
export const CATALYST = 20;
/** Volatility junk: never merges; 3 touching Hex Stones shatter for 3 x the top tier's value / 10. */
export const HEX = 21;
/** Merges with nothing, dissolves after 20 s, and shoves what it touches (a nudge tool). */
export const QUICK = 22;
/** The Legend's heavy body in the Fall's Last Stand (never in a saved flask). */
export const LEGEND_BODY = 23;
export const isSpecial = (t: number) => t >= CATALYST;
export const SPECIAL_NAMES: Record<number, string> = { [CATALYST]: 'Catalyst', [HEX]: 'Hex Stone', [QUICK]: 'Quicksilver', [LEGEND_BODY]: 'Legend' };
export const QUICK_LIFE_S = 20;

/** Radius of any orb code (tiers and specials). */
export function orbR(t: number): number {
  if (t === CATALYST) return 5;
  if (t === HEX) return 6;
  if (t === QUICK) return 4;
  if (t === LEGEND_BODY) return 13;
  return TIERS[Math.max(1, Math.min(MAX_TIER, t))].r;
}

/** Display name of any orb code. */
export const orbName = (t: number) => SPECIAL_NAMES[t] ?? TIERS[Math.max(1, Math.min(MAX_TIER, t))].name;

/**
 * Highest tier a Catalyst can lift (it makes at most T6, a Bloodmoon). BALANCE (sim, 04 §3 says
 * "any orb"): lifting big orbs every 18-60 drops skipped whole chains (an Eclipse straight to an
 * Abyssal Eye, an Eye to a Void Star), ~3x the Singularities late and +45% active income in a
 * cycle's first 30 min, which broke the active : offline band. Up to T5 it is the wildcard the
 * spec describes: a fix for an awkward placement, worth one small orb.
 */
export const CATALYST_MAX_FROM = 5;

/** Can these two orbs fuse? Same tier up to T11 (two Void Stars = Singularity), or a Catalyst on T1-T5. */
export function canMerge(a: number, b: number): boolean {
  if (a === b) return a >= 1 && a <= MAX_TIER;
  if (a === CATALYST) return b >= 1 && b <= CATALYST_MAX_FROM;
  if (b === CATALYST) return a >= 1 && a <= CATALYST_MAX_FROM;
  return false;
}

/**
 * Hex triples pay 3 x the top tier's merge value / 10 (04 §3), the top tier read from the flask and
 * the Distill Ceiling but capped here. BALANCE: uncapped, a triple beside a Void Star paid 24,300
 * (~60 drops' worth) and herding junk out-earned merging. At the Eclipse cap a herded stone pays
 * about two ordinary drops: herding is rewarded, and the stones that aren't herded still clog
 * (the sim's novice loses ~25% at Volatility 8-9, the reference ~10-20%).
 */
export const HEX_TOP_CAP = 9;

/** Hex Stone chance per drawn orb (04 §7): 3% per Volatility level. Ignored offline. */
export const hexChance = (v: number) => 0.03 * Math.max(0, v);

// ---------- flask geometry (logical px) ----------

export const BASE_FLASK_W = 112;
/** Fixed interior height so the puzzle plays the same on every screen (spec 184 + 32 of neck room). */
export const FLASK_H = 160;
export const VOL_MAX = 10;
/** Brim Line depth below the mouth at Volatility 0. */
export const BRIM_BASE = 24;

// ---------- save shapes ----------

export interface SpireStats {
  drops: number;
  merges: number;
  bestChain: number;
  vents: number;
  dropsSinceVent: number;
  singularities: number;
  voidStars: number;
  maxTier: number; // this cycle, including T11
  essence: number; // Essence earned by merges this cycle (Goods export counter)
  catalysts: number; // Catalyst merges
  hexShatters: number; // Hex Stone triples shattered
  tremors: number;
  ventNows: number;
  quicks: number;
}

export interface SpireRun {
  bank: number;
  lv: Record<string, number>;
  vol: number; // the dial setting
  volBought: number; // levels bought this cycle
  vIdle: number; // lowest Volatility set in the last 10 min of active play (idle uses it)
  volSetAt: number; // Date.now() of the last raise
  /** D-spire-01: [setting, active seconds] runs covering the last 10 min of active play. */
  vAct?: [number, number][];
  minSinceVent: number; // lowest Volatility since the last vent (Feat rule)
  volLog: number[]; // Volatility at each of the last 60 drops (Feat rule)
  ceiling: number; // Distill Ceiling: highest tier created by a merge this cycle
  featBest: number; // best Feat score this cycle (t + v)
  /** Saved flask: flattened [tier, x (from center), y (from mouth)] triples. Velocities are zeroed. */
  flask: number[];
  queue: number[];
  t1Run: number; // consecutive T1s drawn by the bag
  /** Drops since the last Catalyst was drawn. */
  catT: number;
  /** A lowered Volatility waiting to apply (04 §7: on the next vent or after 30 s), or -1. */
  volPending: number;
  volPendAt: number;
  stats: SpireStats;
  /** Flask score (R1/R6): merge base values x chain multiplier since the last overflow vent (no
   * Potent / Volatility: it measures play, not purchases). */
  flaskScore: number;
  /** Best flask score this cycle (shown as BEST; the Wave 2 Flask Run banks against it). */
  flaskBest: number;
  /** Scores of the last STUDY_FLASKS finished flasks (newest last): the apprentices study these. */
  recent: number[];
  /** The free Quicksilver rescue (R9) was handed over in this flask. */
  qsGiven: boolean;
  /** Geometry version the saved flask and levels were written for (see GEO_V). */
  geo: number;
}

export interface SpirePersistent {
  pages: number;
  pagesEver: number;
  tomes: Record<string, number>;
  /** Volatility milestones already paid (first Singularity at V3/6/9/10). */
  singMilestones: number[];
  singularitiesEver: number;
  /** HUNT PAGES night order: hours of hunting banked toward the next Grimoire Page. */
  pageHunt: number;
}

export type SpireSave = DeptSave<SpireRun, SpirePersistent>;

export function defaultStats(): SpireStats {
  return {
    drops: 0,
    merges: 0,
    bestChain: 0,
    vents: 0,
    dropsSinceVent: 0,
    singularities: 0,
    voidStars: 0,
    maxTier: 0,
    essence: 0,
    catalysts: 0,
    hexShatters: 0,
    tremors: 0,
    ventNows: 0,
    quicks: 0,
  };
}

export function defaultRun(): SpireRun {
  return {
    bank: 0,
    lv: {},
    vol: 0,
    volBought: 0,
    vIdle: 0,
    volSetAt: 0,
    minSinceVent: 0,
    volLog: [],
    ceiling: 0,
    featBest: 0,
    flask: [],
    // The smarter bag opens with a guaranteed pair (onboarding step 2).
    queue: [1, 1, 2],
    t1Run: 0,
    catT: 0,
    volPending: -1,
    volPendAt: 0,
    stats: defaultStats(),
    flaskScore: 0,
    flaskBest: 0,
    recent: [],
    qsGiven: false,
    geo: GEO_V,
  };
}

export function defaultPersistent(): SpirePersistent {
  return { pages: 0, pagesEver: 0, tomes: {}, singMilestones: [], singularitiesEver: 0, pageHunt: 0 };
}

/** Fill fields added after a save was written (cheap; safe to call often). */
export function normalize(run: SpireRun, per: SpirePersistent): void {
  const d = defaultRun();
  run.lv ??= {};
  run.stats = { ...d.stats, ...(run.stats ?? {}) };
  run.volLog ??= [];
  run.flask ??= [];
  if (!run.queue || run.queue.length < 3) run.queue = d.queue.slice();
  run.vol = Math.max(0, Math.min(run.vol ?? 0, run.volBought ?? 0));
  run.vIdle = Math.min(run.vIdle ?? 0, run.vol);
  if (!Array.isArray(run.vAct)) run.vAct = [];
  run.minSinceVent ??= 0;
  run.ceiling ??= 0;
  run.featBest ??= 0;
  run.catT ??= 0;
  run.volBought ??= 0;
  if (typeof run.volPending !== 'number' || run.volPending >= run.vol || run.volPending < 0) run.volPending = -1;
  run.volPendAt ??= 0;
  if (!Array.isArray(run.flask) || run.flask.length % 3 !== 0) run.flask = [];
  if (!(run.flaskScore >= 0)) run.flaskScore = 0;
  if (!(run.flaskBest >= 0)) run.flaskBest = 0;
  if (!Array.isArray(run.recent)) run.recent = [];
  run.recent = run.recent.filter((x) => Number.isFinite(x) && x >= 0).slice(-STUDY_FLASKS);
  run.qsGiven = !!run.qsGiven;
  if (!((run.geo ?? 1) >= GEO_V)) migrateGeometry(run);
  per.tomes ??= {};
  per.singMilestones ??= [];
  per.pages ??= 0;
  per.pagesEver ??= 0;
  per.singularitiesEver ??= 0;
  if (!(per.pageHunt >= 0)) per.pageHunt = 0;
}

/**
 * Wave 1 geometry re-cut (genre-research R2): the flask went 216 -> 160 px tall, the radii grew
 * ~x1.3 with a 1.4-1.6 area step all the way up, and Wider Flask / Taller Neck were removed. An
 * older run gets its Wider / Neck Arcana back in full, and its saved flask is repacked: orbs are
 * kept from the bottom up while they fill under 40% of the new interior (shifted up by the lost
 * height), and the rest are paid out at their merge value x Potent, so nothing is vented.
 */
export const GEO_V = 2;
const LEGACY_NODES: [string, number, number][] = [
  ['wider', 1000, 3],
  ['neck', 1500, 3],
];
const LEGACY_FLASK_H = 216;

export function migrateGeometry(run: SpireRun): void {
  run.lv ??= {};
  let refund = 0;
  for (const [id, base, growth] of LEGACY_NODES) {
    const l = Math.max(0, Math.floor(run.lv[id] ?? 0));
    for (let i = 0; i < l; i++) refund += Math.ceil(base * growth ** i);
    delete run.lv[id];
  }
  const f = Array.isArray(run.flask) && run.flask.length % 3 === 0 ? run.flask : [];
  const orbs: { t: number; x: number; y: number }[] = [];
  for (let i = 0; i + 2 < f.length; i += 3) if (Number.isFinite(f[i]) && Number.isFinite(f[i + 1]) && Number.isFinite(f[i + 2])) orbs.push({ t: Math.round(f[i]), x: f[i + 1], y: f[i + 2] });
  orbs.sort((a, b) => b.y - a.y);
  const room = 0.4 * BASE_FLASK_W * FLASK_H;
  let used = 0;
  const kept: number[] = [];
  const pm = potentMultL(run.lv.potent ?? 0);
  for (const o of orbs) {
    const r = orbR(o.t);
    const area = Math.PI * r * r;
    if (used + area <= room) {
      used += area;
      kept.push(o.t, o.x, Math.max(BRIM_BASE + r + 2, o.y - (LEGACY_FLASK_H - FLASK_H)));
    } else if (!isSpecial(o.t)) refund += TIERS[Math.max(1, Math.min(MAX_TIER, o.t))].value * pm;
  }
  run.flask = kept;
  run.bank = (run.bank ?? 0) + Math.ceil(refund);
  run.geo = GEO_V;
}

// ---------- upgrades (04 §6) ----------

export type Branch = 'alchemy' | 'apparatus' | 'apprentices' | 'tomes';

export interface UpDef {
  id: string;
  name: string;
  branch: Branch;
  base: number;
  growth: number;
  max: number;
  pages?: boolean; // paid in Grimoire Pages (persistent)
  /** Locked until this department's 2nd Fall (the long node, core/longnode.ts). */
  afterFall?: boolean;
  /** A one-time active tool (no idle value; never on the Steward's list). */
  tool?: boolean;
  desc(l: number): string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const UPGRADES: UpDef[] = [
  // A. Alchemy
  { id: 'potent', name: 'Potent Mana', branch: 'alchemy', base: 50, growth: 1.15, max: 100, desc: (l) => `Merge value x${potentMultL(l).toFixed(1)} > x${potentMultL(l + 1).toFixed(1)}` },
  // The long node (core/longnode.ts, sim/README.md "Pass 5"): all Arcana x1.15 per level, a
  // stronger focus every 10 levels; opens after the 2nd Fall. SIM-TUNED base: ~2 h of a later
  // cycle's plateau idle (~5.6e4/s).
  { id: 'amp', name: 'Arcane Amplifier', branch: 'alchemy', base: 1.5e8, growth: LONG_GROWTH, max: LONG_MAX, afterFall: true, desc: (l) => longDesc(AMPLIFIERS, l) },
  { id: 'richer', name: 'Richer Spawns', branch: 'alchemy', base: 200, growth: 1.9, max: 10, desc: (l) => `Sparks ${pct(spawnTableL(l, 0)[0])} > ${pct(spawnTableL(l + 1, 0)[0])}, more Wisps` },
  { id: 'seed', name: 'Seed Orb', branch: 'alchemy', base: 5000, growth: 4, max: 5, desc: (l) => `Hexballs spawn ${l}% > ${l + 1}%` },
  { id: 'glass', name: 'Resonant Glass', branch: 'alchemy', base: 300, growth: 1.6, max: 10, desc: (l) => `Chain cap x${resCapL(l)} > x${resCapL(l + 1)}` },
  { id: 'echo', name: 'Echo Window', branch: 'alchemy', base: 400, growth: 1.7, max: 8, desc: (l) => `Chain window ${cascadeWindowL(l).toFixed(2)}S > ${cascadeWindowL(l + 1).toFixed(2)}S` },
  // B. Apparatus
  { id: 'valve', name: 'Quick Valve', branch: 'apparatus', base: 100, growth: 1.5, max: 4, desc: (l) => `Drop cooldown ${cooldownL(l).toFixed(2)}S > ${cooldownL(l + 1).toFixed(2)}S` },
  { id: 'coil', name: 'Catalyst Coil', branch: 'apparatus', base: 800, growth: 2.2, max: 7, desc: (l) => `X4 chains earn a Catalyst: recharge ${catalystEveryL(l)} > ${catalystEveryL(l + 1)} drops` },
  { id: 'tremor', name: "Overlord's Tremor", branch: 'apparatus', base: 600, growth: 1, max: 1, tool: true, desc: () => 'SHAKE: flick up to jolt the flask (10S)' },
  { id: 'quick', name: 'Quicksilver Phial', branch: 'apparatus', base: 1800, growth: 1, max: 1, tool: true, desc: () => 'QS: swap in a shoving bead (25S)' },
  { id: 'settle', name: 'Settle Charm', branch: 'apparatus', base: 2500, growth: 1, max: 1, tool: true, desc: () => 'VENT NOW: tidy the top, 50% back' },
  // C. Apprentices
  { id: 'hire', name: 'Hire Apprentice', branch: 'apprentices', base: 250, growth: 2.5, max: 4, desc: (l) => `Homunculi ${l} > ${l + 1} (4 drops/min each)` },
  { id: 'diligence', name: 'Diligence', branch: 'apprentices', base: 150, growth: 1.25, max: 25, desc: (l) => `Apprentice speed +${8 * l}% > +${8 * (l + 1)}%` },
  { id: 'tutelage', name: 'Tutelage', branch: 'apprentices', base: 400, growth: 1.4, max: 7, desc: (l) => `Chain skill ${pct(chainFactorL(l))} > ${pct(chainFactorL(l + 1))}` },
  // D. Tomes (Grimoire Pages, persist through Falls)
  { id: 'twinning', name: 'Tome of Twinning', branch: 'tomes', base: 3, growth: 1, max: 1, pages: true, desc: () => '5% of merges skip a tier' },
  { id: 'hunger', name: 'Tome of Hunger', branch: 'tomes', base: 4, growth: 1, max: 1, pages: true, desc: () => 'Void Stars eat touching T1-T3' },
  { id: 'patience', name: 'Tome of Patience', branch: 'tomes', base: 5, growth: 1, max: 1, pages: true, desc: () => 'Apprentices distill up to T10' },
  { id: 'mirror', name: 'Tome of the Mirror', branch: 'tomes', base: 6, growth: 1, max: 1, pages: true, desc: () => 'Preview 3 orbs instead of 2' },
];
export const UP: Record<string, UpDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upCost(u: UpDef, level: number): number {
  return Math.ceil(u.base * u.growth ** level);
}

/** Arcane Amplifier milestone titles (one per 10 levels). */
export const AMPLIFIERS = ['LENS', 'PRISM', 'FOCUS', 'CONDUIT', 'NEXUS', 'ZENITH', 'APEX'];

/** Lock reason for a node in cycle `n` (the long node opens after the 2nd Fall), or null. */
export const upLocked = (u: UpDef, n: number): string | null => (u.afterFall ? longLocked(n) : null);

/** Volatility level V costs 5,000 x 4^(V-1) for the V-th level (04 §7: `5,000 x 4^V` with V = levels owned). */
export function volCost(bought: number): number {
  return 5000 * 4 ** bought;
}

export const lvOf = (run: SpireRun, id: string) => run.lv?.[id] ?? 0;
export const tomeOf = (per: SpirePersistent, id: string) => per.tomes?.[id] ?? 0;

// ---------- derived stats ----------

export const potentMultL = (l: number) => 1 + 0.1 * l;
/** R5 (Puyo-style geometric chains): a cascade's n-th merge pays x1, x2, x4, x6, x8 ... up to the
 * Resonant Glass cap. SIM-TUNED cap 6 + 1/level (was a linear +0.25 per step, cap 3 + 0.25/level:
 * the audit saw x1.00-x1.25 on almost every frame). */
export const resCapL = (l: number) => 6 + l;
export const chainMultL = (depth: number, cap: number) => Math.min(cap, depth <= 1 ? 1 : 2 * (depth - 1));
export const cascadeWindowL = (l: number) => 1.5 + 0.15 * l;
export const cooldownL = (l: number) => Math.max(0.4, 0.6 - 0.05 * l);
/** R9: a Catalyst is earned by a x4+ chain (a cascade's 3rd merge), at most one per this many
 * drops. SIM-TUNED 36 - 4/level (min 12); it used to be dealt on a 60 - 6/level drop schedule. */
export const catalystEveryL = (l: number) => Math.max(12, 36 - 4 * l);
/** A cascade this deep (x4 at depth 3) earns a Catalyst. */
export const CATALYST_CHAIN = 3;
export const catalystEvery = (run: SpireRun) => catalystEveryL(lvOf(run, 'coil'));
export const TREMOR_CD = 10;
export const QUICK_CD = 25;
export const VENT_NOW_CD = 20;
export const VENT_NOW_REFUND = 0.5;
/** 04 §7: a lowered Volatility applies on the next vent or after this long. */
export const VOL_LOWER_MS = 30_000;
export const chainFactorL = (l: number) => Math.min(1, 0.8 + 0.03 * l);

export const potentMult = (run: SpireRun) => potentMultL(lvOf(run, 'potent')) * longMult(lvOf(run, 'amp'));
export const resCap = (run: SpireRun) => resCapL(lvOf(run, 'glass'));
export const cascadeWindow = (run: SpireRun) => cascadeWindowL(lvOf(run, 'echo'));
export const cooldown = (run: SpireRun) => cooldownL(lvOf(run, 'valve'));
/** Flask width; `glass` = Ingots import level (Tempered Glass, +2 px each, 00 §4). */
export const flaskW = (_run: SpireRun, glass = 0) => BASE_FLASK_W + 2 * Math.max(0, Math.min(3, glass));
export const apprentices = (run: SpireRun) => lvOf(run, 'hire');

export function arcanaMult(v: number): number {
  return 1 + 0.3 * Math.max(0, v) ** 1.25;
}
export function gravityMult(v: number): number {
  return 1 + 0.03 * v;
}
/** Brim Line depth below the flask mouth: 14 px base, 32 px of neck room, lowered 2 px per Volatility. */
export function brimDepth(run: SpireRun): number {
  return BRIM_BASE + 2 * run.vol;
}
export const VENT_BAND = 100;

/** Spawn table [T1..T5] after Richer Spawns (one step: -4% T1, +2% T3, +2% T4) and Seed Orb (+1% T5 each, from T1). */
export function spawnTableL(richer: number, seed: number): number[] {
  const t1 = Math.max(0, 0.4 - 0.04 * richer - 0.01 * seed);
  return [t1, 0.3, 0.2 + 0.02 * richer, 0.1 + 0.02 * richer, 0.01 * seed];
}
export const spawnTable = (run: SpireRun) => spawnTableL(lvOf(run, 'richer'), lvOf(run, 'seed'));

/** Pick a spawn tier from the table (r in [0,1)); `noT1` rerolls Sparks away (the smarter bag). */
export function pickSpawn(run: SpireRun, r: number, noT1 = false): number {
  const tab = spawnTable(run).slice();
  if (noT1) tab[0] = 0;
  const sum = tab.reduce((a, b) => a + b, 0);
  let x = r * sum;
  for (let i = 0; i < tab.length; i++) {
    x -= tab[i];
    if (x < 0 && tab[i] > 0) return i + 1;
  }
  for (let i = tab.length - 1; i >= 0; i--) if (tab[i] > 0) return i + 1;
  return 1;
}

/** Arcana a dropped orb eventually contributes if everything merges up to `ceiling` (04 §4, M2). */
export function evDropTable(tab: number[], ceiling: number): number {
  let ev = 0;
  for (let t = 1; t <= tab.length; t++) {
    let s = 0;
    for (let k = t + 1; k <= ceiling; k++) s += TIERS[k].value / 2 ** (k - t);
    ev += tab[t - 1] * s;
  }
  return ev;
}

/** Apprentice drops per minute; `fuel` = Souls import level (Spark Fuel, +5% each, still under
 * the 12/min cap, 04 §16). */
export function apprenticeDropsPerMin(run: SpireRun, fuel = 0): number {
  return Math.min(12, apprentices(run) * 4 * (1 + 0.08 * lvOf(run, 'diligence')) * (1 + 0.05 * Math.max(0, Math.min(3, fuel))));
}

export function distillCeiling(run: SpireRun, per: SpirePersistent): number {
  return Math.min(run.ceiling ?? 0, tomeOf(per, 'patience') > 0 ? 10 : 9);
}

/**
 * SIM-TUNED (sim/README.md "Pass 3"): 0.5 -> 8. The spec formula prices an apprentice orb at
 * EV_drop to the Distill Ceiling (capped at T9), but the balance sim's reference bot (sim/adapters/
 * spire.ts: greedy merge-adjacency aim on logic.ts, ~30 drops/min with a short settle) keeps
 * merging past T9 into Abyssal Eyes, Void Stars and a Singularity every ~25-30 min (250K x Potent
 * x Volatility x Resonance, worth ~2,000 s of idle each), so a live drop realizes several times
 * EV_drop(T9). At 0.5 active play ran 18-30x on-screen idle (25-42x offline). At 8 the reference
 * profile reads ~2.8x on screen and ~4.1x offline pooled over 6 seeds (04 §4 targets 2.8x / 4.0x),
 * and a long solo stretch drifts to ~2.1-2.6x late. Single 7-day seeds scatter (3.2-5.6x offline)
 * because the Spire only gets ~25 baseline minutes of a lumpy payout.
 * SIM-TUNED 8 -> 6.5 (sim/README.md "Pass 6"): with seven departments, Goods and the long node the
 * reference bot read ~2.0-2.3x on screen in 30-day runs (2.3-2.8x active:offline, below the hard
 * 3x) and ~2.3x in week 1 (04 §4 band 2.4-3.2x).
 */
// SIM-TUNED 6.5 -> 5.0 (Wave 1): idle is now x studyMult (your best flask) and chains pay
// geometrically; 5.0 keeps the reference profile at ~3.8x active:offline over 3 seeds (lowest seed
// 3.5x, hard band 3-5x) with the Spire opening on day 2 after the core's Pass 7 pacing.
export const IDLE_TUNE = 5.0;

/** The apprentices study this many of your last finished flasks (plus the one in play). */
export const STUDY_FLASKS = 3;

/** The flask score the apprentices study (R6): your best of the last STUDY_FLASKS finished flasks
 * and the one in play. Pure: a saved number, so offline stays continuous and deterministic. */
export function studyScore(run: SpireRun): number {
  let s = run.flaskScore ?? 0;
  for (const x of run.recent ?? []) if (x > s) s = x;
  return s;
}

/**
 * R6 "the apprentices copy your Best": idle x studyMult, from the studied flask score measured in
 * merges of your Distill Ceiling tier (so it reads skill, not progress): (score / (STUDY_REF x the
 * ceiling tier's value))^STUDY_E, held to [STUDY_LO, STUDY_HI]. Nothing studied yet reads the floor.
 * SIM-TUNED: ref 30 ceiling merges = x1 (the reference spirebot's typical flask), exponent 0.5,
 * floor 0.5, cap 2.5.
 */
export const STUDY_REF = 30;
export const STUDY_E = 0.5;
export const STUDY_LO = 0.5;
export const STUDY_HI = 2.5;
export function studyMultL(score: number, ceil: number): number {
  const ref = STUDY_REF * TIERS[Math.max(4, Math.min(MAX_TIER, ceil))].value;
  return Math.max(STUDY_LO, Math.min(STUDY_HI, (Math.max(0, score) / ref) ** STUDY_E));
}
export function studyMultOf(run: SpireRun, per: SpirePersistent): number {
  return studyMultL(studyScore(run), distillCeiling(run, per));
}

/** On-screen idle Arcana/s before core multipliers (04 §4). Pure and cheap. */
export function idleRateOf(run: SpireRun, per: SpirePersistent, fuel = 0): number {
  const dpm = apprenticeDropsPerMin(run, fuel);
  if (dpm <= 0) return 0;
  const ceil = distillCeiling(run, per);
  if (ceil < 2) return 0;
  const ev = evDropTable(spawnTable(run), ceil) * potentMult(run);
  const cdf = chainFactorL(lvOf(run, 'tutelage'));
  return (dpm / 60) * ev * cdf * arcanaMult(run.vIdle ?? 0) * studyMultOf(run, per) * IDLE_TUNE;
}

/** Essence (00 §4, 04 §16): T7+ merge = 1 (T11 and a Singularity = 5). */
export const essenceFor = (tier: number) => (tier >= MAX_TIER ? 5 : tier >= 7 ? 1 : 0);

/** Passive Essence per hour: the apprentices' T7+ creations. Each drop of tier t makes 1/2^(k-t)
 * of a tier-k orb on the way up to the Distill Ceiling (the same model as evDropTable). */
export function apprenticeEssencePerH(run: SpireRun, per: SpirePersistent, fuel = 0): number {
  const dpm = apprenticeDropsPerMin(run, fuel);
  const ceil = distillCeiling(run, per);
  if (dpm <= 0 || ceil < 7) return 0;
  const tab = spawnTable(run);
  let perDrop = 0;
  for (let t = 1; t <= tab.length; t++) for (let k = Math.max(7, t + 1); k <= ceil; k++) perDrop += (tab[t - 1] * essenceFor(k)) / 2 ** (k - t);
  return dpm * 60 * perDrop * chainFactorL(lvOf(run, 'tutelage'));
}

/** Highest Volatility held under the Feat rule: since the last vent, or through the last 60 drops. */
export function heldVol(run: SpireRun): number {
  let v = Math.min(run.vol, run.minSinceVent ?? 0);
  if ((run.volLog?.length ?? 0) >= 60) v = Math.max(v, Math.min(run.vol, ...run.volLog));
  return v;
}

// ---------- the DeptEcon ----------

const run = (s: DeptSave) => s.run as SpireRun;
const per = (s: DeptSave) => s.persistent as SpirePersistent;
const st = (s: DeptSave) => run(s).stats ?? defaultStats();

export const commendations: Commendation[] = [
  { id: 'merge1', label: 'FIRST FUSION', test: (s) => st(s).merges >= 1 },
  { id: 'apprentice', label: 'A HOMUNCULUS HIRED', test: (s) => lvOf(run(s), 'hire') >= 1 },
  { id: 'chain4', label: 'CHAIN OF FOUR', test: (s) => st(s).bestChain >= 4 },
  { id: 'soulfire', label: 'SOULFIRE (T7)', test: (s) => (s.lifetime.best.spireTier ?? 0) >= 7 || st(s).maxTier >= 7 },
  { id: 'vol3', label: 'VOLATILITY 3', test: (s) => (run(s).volBought ?? 0) >= 3 },
  { id: 'drops1k', label: '1,000 ORBS DROPPED', test: (s) => st(s).drops >= 1000 },
  { id: 'voidstar', label: 'A VOID STAR', test: (s) => (s.lifetime.best.spireTier ?? 0) >= 11 || st(s).maxTier >= 11 },
  { id: 'singularity', label: 'SINGULARITY', test: (s) => (per(s).singularitiesEver ?? 0) >= 1 },
];

/** Satchel L1 "Ready" list (00 §5.2): the next level of every open Arcana node plus the next
 * Volatility level, cheapest first. Tomes are paid in Pages, so they never show here. */
export function readyBuysOf(save: DeptSave): { label: string; cost: number }[] {
  const r = run(save);
  if (!r?.lv) return [];
  const out: { label: string; cost: number }[] = [];
  for (const u of UPGRADES) {
    if (u.pages || upLocked(u, save.cycle?.n ?? 0)) continue;
    const l = lvOf(r, u.id);
    if (l >= u.max) continue;
    out.push({ label: u.max > 1 ? `${u.name} ${l + 1}` : u.name, cost: upCost(u, l) });
  }
  if ((r.volBought ?? 0) < VOL_MAX) out.push({ label: `Volatility ${r.volBought + 1}`, cost: volCost(r.volBought) });
  return out.sort((a, b) => a.cost - b.cost);
}

/** The Steward's list (00 §5.2 m5): only nodes that raise idleRate. No Volatility (a dial), no
 * one-time tools, no Tomes (Pages). buy() only raises the level; the core already paid. */
export function stewardCandidatesOf(save: DeptSave): StewardCandidate[] {
  const r = run(save);
  const p = per(save);
  if (!r?.lv || !p) return [];
  const fuel = save.imports?.souls ?? 0;
  const base = idleRateOf(r, p, fuel);
  const out: StewardCandidate[] = [];
  for (const u of UPGRADES) {
    if (u.pages || u.tool || upLocked(u, save.cycle?.n ?? 0)) continue;
    const l = lvOf(r, u.id);
    if (l >= u.max) continue;
    r.lv[u.id] = l + 1;
    const delta = idleRateOf(r, p, fuel) - base;
    r.lv[u.id] = l;
    if (!(delta > 0)) continue;
    out.push({
      id: u.id,
      label: u.name,
      cost: upCost(u, l),
      deltaIdle: delta,
      buy: () => {
        const cur = lvOf(r, u.id);
        if (cur < u.max) r.lv[u.id] = cur + 1;
      },
    });
  }
  return out;
}

/** Head Start (00 §2.5, M4): the first 2L Volatility levels owned and 1 + L free apprentices.
 * Idempotent (max), run data only. The knob itself stays where the player leaves it. */
export function applyHeadStartTo(save: DeptSave, level: number): void {
  const r = run(save);
  if (!r) return;
  r.lv ??= {};
  const L = Math.max(0, Math.floor(level));
  if (L <= 0) return;
  r.volBought = Math.max(r.volBought ?? 0, Math.min(VOL_MAX, 2 * L));
  r.lv.hire = Math.max(lvOf(r, 'hire'), Math.min(UP.hire.max, 1 + L));
}

/** Signature "Seeded Flask" (00 §2.5): Richer Spawns 1 and Catalyst Coil 2 at every cycle start
 * (Wider Flask 1 until Wave 1 removed the box-growing nodes). */
export const SEEDED_FLASK = {
  name: 'Seeded Flask',
  desc: 'Start each cycle with Richer Spawns 1 and Catalyst Coil 2',
  apply(save: DeptSave): void {
    const r = run(save);
    if (!r) return;
    r.lv ??= {};
    r.lv.richer = Math.max(lvOf(r, 'richer'), 1);
    r.lv.coil = Math.max(lvOf(r, 'coil'), 2);
  },
};

// ---------- Next Goal and Night Orders (core hooks) ----------

/** The Next Goal ribbon: hire the first apprentice, then beat your best flask, else the next tier. */
export function nextGoalOf(save: DeptSave): DeptGoal | null {
  const r = run(save);
  if (!r?.lv) return null;
  if (lvOf(r, 'hire') < 1) {
    const cost = upCost(UP.hire, 0);
    return { label: 'HIRE AN APPRENTICE', progress: Math.min(1, (r.bank ?? 0) / cost), detail: `${formatNum(r.bank ?? 0)}/${formatNum(cost)}` };
  }
  const best = r.flaskBest ?? 0;
  if (best > 0) {
    const cur = r.flaskScore ?? 0;
    return { label: 'BEAT YOUR BEST FLASK', progress: Math.min(1, cur / best), detail: `${formatNum(cur)}/${formatNum(best)}` };
  }
  const top = Math.max(r.stats?.maxTier ?? 0, r.ceiling ?? 0);
  if (top < MAX_TIER) {
    const next = Math.max(2, top + 1);
    return { label: `FIRST ${TIERS[next].name.toUpperCase()}`, progress: Math.min(1, top / next) };
  }
  return null;
}

/** HUNT PAGES pays one Grimoire Page per this many hours away (the offline cap bounds it). */
export const PAGE_HUNT_H = 10;

export const SPIRE_ORDERS: NightOrderDef[] = [
  { id: 'distill', label: 'DISTILL ARCANA', desc: '+25% Arcana while away', kind: 'income' },
  { id: 'pages', label: 'HUNT PAGES', desc: `A Grimoire Page per ${PAGE_HUNT_H}h away` },
];

export function nightOrdersOf(_save: DeptSave): NightOrderDef[] {
  return SPIRE_ORDERS.map((o) => ({ ...o }));
}

/** HUNT PAGES: the apprentices comb the library instead of distilling extra (one Page per
 * PAGE_HUNT_H hours away, the rest banked toward the next). Needs an apprentice. */
export function applyNightOrderTo(save: DeptSave, orderId: string, elapsedSeconds: number): string | void {
  if (orderId !== 'pages') return;
  const r = run(save);
  const p = per(save);
  if (!r?.lv || !p) return;
  if (lvOf(r, 'hire') < 1) return 'NO APPRENTICE TO HUNT';
  const h = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0) / 3600;
  p.pageHunt = (p.pageHunt ?? 0) + h;
  const n = Math.floor(p.pageHunt / PAGE_HUNT_H);
  if (n <= 0) return `PAGE HUNT ${Math.floor((100 * p.pageHunt) / PAGE_HUNT_H)}%`;
  p.pageHunt -= n * PAGE_HUNT_H;
  p.pages = (p.pages ?? 0) + n;
  p.pagesEver = (p.pagesEver ?? 0) + n;
  return n === 1 ? 'A GRIMOIRE PAGE FOUND' : `${n} GRIMOIRE PAGES FOUND`;
}

export const spireEcon: DeptEcon = {
  id: 'spire',
  version: 1,
  defaultRun,
  defaultPersistent,
  idleRate(save) {
    const r = run(save);
    const p = per(save);
    if (!r || !r.lv || !p) return 0;
    return idleRateOf(r, p, save.imports?.souls ?? 0);
  },
  // Essence (00 §4, 04 §16): T7+ merges (T11 = 5).
  goods: {
    id: 'essence',
    rate: (save) => {
      const r = run(save);
      const p = per(save);
      if (!r || !r.lv || !p) return 0;
      return apprenticeEssencePerH(r, p, save.imports?.souls ?? 0);
    },
    count: (save) => st(save).essence ?? 0,
  },
  // Infamy skill gate (04 §7, 00 §2.2): the Feat. Create tier t while Volatility >= v was held
  // (since the last vent, or for the last 60 drops). Score = t + v, a Singularity counts as 12.
  skillTarget: (n) => Math.min(12 + n, 22),
  skillLabel: (t) => `FEAT ${t}: ORB TIER + HELD VOLATILITY`,
  // SIM-TUNED (sim/README.md "Pass 3"), with IDLE_TUNE 8 and the reference profile (the Spire
  // opens on day 4, ~8 on-screen minutes a day; the Feat 12 fills on the first or second visit):
  //  - econBase 1.5e8 -> 1.8e10: at 1.5e8 the first Fall came ~1 h AE after the unlock. Now it
  //    lands on day 7 (6.3-6.8 d), ~3 days after the unlock, or just after week 1 when the Seal
  //    opens in the day-4 evening session.
  //  - rankRef 100 -> 1,500 and rankTarget 2,000 -> 1e4: idle on the first visit is ~1.5-6e3/s and
  //    ~1e4/s at the first 100% Infamy, so the Spire sits at Rank ~40-55 like the others.
  //    Pass 6: kept at 1.8e10; IDLE_TUNE 8 -> 6.5 (below) already slows the economy gate ~15%, which
  //    moved the earliest seed's first Fall from day 6 21:00 to day 7.
  // SIM-TUNED 1.8e10 -> 1.6e10 (Wave 1): with the lower idle floor (studyMult) every seed still
  // reaches the first Fall inside week 1 (5.5-6.9 d over 3 seeds).
  econBase: 1.6e10,
  rankRef: 1500,
  rankTarget: 1e4,
  commendations,
  readyBuys: readyBuysOf,
  stewardCandidates: stewardCandidatesOf,
  applyHeadStart: applyHeadStartTo,
  signature: SEEDED_FLASK,
  nextGoal: nextGoalOf,
  nightOrders: nightOrdersOf,
  applyNightOrder: (save, id, elapsed) => applyNightOrderTo(save, id, elapsed),
};
