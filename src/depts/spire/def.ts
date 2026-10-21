// The Sorcerer's Spire: pure economy (specs/04). No Pixi, no physics: the shared core, the
// headless balance simulation and the scene all read this. index.ts spreads `spireEcon` into the
// full DeptDef.
import type { Commendation, DeptEcon } from '../../core/dept';
import type { DeptSave } from '../../core/types';

// ---------- orb tiers (04 §3; radii re-curved so a Void Star is ~46% of the base width) ----------

export interface TierDef {
  name: string;
  r: number;
  /** Arcana paid when a merge creates this tier (before multipliers). */
  value: number;
}

/** Index = tier (1..11). Tier 0 is unused. */
export const TIERS: TierDef[] = [
  { name: '', r: 0, value: 0 },
  { name: 'Spark', r: 4, value: 1 },
  { name: 'Ember', r: 5, value: 4 },
  { name: 'Wisp', r: 6, value: 12 },
  { name: 'Glimmer', r: 8, value: 36 },
  { name: 'Hexball', r: 10, value: 110 },
  { name: 'Bloodmoon', r: 12, value: 330 },
  { name: 'Soulfire', r: 15, value: 1000 },
  { name: 'Stormheart', r: 18, value: 3000 },
  { name: 'Eclipse', r: 21, value: 9000 },
  { name: 'Abyssal Eye', r: 24, value: 27000 },
  { name: 'Void Star', r: 26, value: 81000 },
];
export const MAX_TIER = 11;
/** A Singularity (two Void Stars) counts as tier 12 for the Feat. */
export const SINGULARITY_TIER = 12;
export const SINGULARITY_VALUE = 250_000;

// ---------- flask geometry (logical px) ----------

export const BASE_FLASK_W = 112;
/** Fixed interior height so the puzzle plays the same on every screen (spec 184 + 32 of neck room). */
export const FLASK_H = 216;
export const VOL_MAX = 10;

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
}

export interface SpireRun {
  bank: number;
  lv: Record<string, number>;
  vol: number; // the dial setting
  volBought: number; // levels bought this cycle
  vIdle: number; // lowest Volatility set in the last 10 min of active play (idle uses it)
  volSetAt: number; // Date.now() of the last raise
  minSinceVent: number; // lowest Volatility since the last vent (Feat rule)
  volLog: number[]; // Volatility at each of the last 60 drops (Feat rule)
  ceiling: number; // Distill Ceiling: highest tier created by a merge this cycle
  featBest: number; // best Feat score this cycle (t + v)
  /** Saved flask: flattened [tier, x (from center), y (from mouth)] triples. Velocities are zeroed. */
  flask: number[];
  queue: number[];
  t1Run: number; // consecutive T1s drawn by the bag
  stats: SpireStats;
}

export interface SpirePersistent {
  pages: number;
  pagesEver: number;
  tomes: Record<string, number>;
  /** Volatility milestones already paid (first Singularity at V3/6/9/10). */
  singMilestones: number[];
  singularitiesEver: number;
}

export type SpireSave = DeptSave<SpireRun, SpirePersistent>;

export function defaultStats(): SpireStats {
  return { drops: 0, merges: 0, bestChain: 0, vents: 0, dropsSinceVent: 0, singularities: 0, voidStars: 0, maxTier: 0, essence: 0 };
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
    stats: defaultStats(),
  };
}

export function defaultPersistent(): SpirePersistent {
  return { pages: 0, pagesEver: 0, tomes: {}, singMilestones: [], singularitiesEver: 0 };
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
  run.minSinceVent ??= 0;
  run.ceiling ??= 0;
  run.featBest ??= 0;
  per.tomes ??= {};
  per.singMilestones ??= [];
  per.pages ??= 0;
  per.pagesEver ??= 0;
  per.singularitiesEver ??= 0;
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
  desc(l: number): string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const UPGRADES: UpDef[] = [
  // A. Alchemy
  { id: 'potent', name: 'Potent Mana', branch: 'alchemy', base: 50, growth: 1.15, max: 100, desc: (l) => `Merge value x${potentMultL(l).toFixed(1)} > x${potentMultL(l + 1).toFixed(1)}` },
  { id: 'richer', name: 'Richer Spawns', branch: 'alchemy', base: 200, growth: 1.9, max: 10, desc: (l) => `Sparks ${pct(spawnTableL(l, 0)[0])} > ${pct(spawnTableL(l + 1, 0)[0])}, more Wisps` },
  { id: 'seed', name: 'Seed Orb', branch: 'alchemy', base: 5000, growth: 4, max: 5, desc: (l) => `Hexballs spawn ${l}% > ${l + 1}%` },
  { id: 'glass', name: 'Resonant Glass', branch: 'alchemy', base: 300, growth: 1.6, max: 10, desc: (l) => `Resonance cap x${resCapL(l).toFixed(2)} > x${resCapL(l + 1).toFixed(2)}` },
  { id: 'echo', name: 'Echo Window', branch: 'alchemy', base: 400, growth: 1.7, max: 8, desc: (l) => `Chain window ${cascadeWindowL(l).toFixed(2)}S > ${cascadeWindowL(l + 1).toFixed(2)}S` },
  // B. Apparatus
  { id: 'valve', name: 'Quick Valve', branch: 'apparatus', base: 100, growth: 1.5, max: 4, desc: (l) => `Drop cooldown ${cooldownL(l).toFixed(2)}S > ${cooldownL(l + 1).toFixed(2)}S` },
  { id: 'wider', name: 'Wider Flask', branch: 'apparatus', base: 1000, growth: 3, max: 5, desc: (l) => `Flask width ${BASE_FLASK_W + 6 * l} > ${BASE_FLASK_W + 6 * (l + 1)}` },
  { id: 'neck', name: 'Taller Neck', branch: 'apparatus', base: 1500, growth: 3, max: 4, desc: () => 'Brim Line raised 8 px' },
  // C. Apprentices
  { id: 'hire', name: 'Hire Apprentice', branch: 'apprentices', base: 250, growth: 2.5, max: 4, desc: (l) => `Homunculi ${l} > ${l + 1} (4 drops/min each)` },
  { id: 'diligence', name: 'Diligence', branch: 'apprentices', base: 150, growth: 1.25, max: 25, desc: (l) => `Apprentice speed +${8 * l}% > +${8 * (l + 1)}%` },
  { id: 'tutelage', name: 'Tutelage', branch: 'apprentices', base: 400, growth: 1.4, max: 7, desc: (l) => `Chain skill ${pct(chainFactorL(l))} > ${pct(chainFactorL(l + 1))}` },
  // D. Tomes (Grimoire Pages, persist through Falls)
  { id: 'twinning', name: 'Tome of Twinning', branch: 'tomes', base: 3, growth: 1, max: 1, pages: true, desc: () => '5% of merges skip a tier' },
  { id: 'patience', name: 'Tome of Patience', branch: 'tomes', base: 5, growth: 1, max: 1, pages: true, desc: () => 'Apprentices distill up to T10' },
  { id: 'mirror', name: 'Tome of the Mirror', branch: 'tomes', base: 6, growth: 1, max: 1, pages: true, desc: () => 'Preview 3 orbs instead of 2' },
];
export const UP: Record<string, UpDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upCost(u: UpDef, level: number): number {
  return Math.ceil(u.base * u.growth ** level);
}

/** Volatility level V costs 5,000 x 4^(V-1) for the V-th level (04 §7: `5,000 x 4^V` with V = levels owned). */
export function volCost(bought: number): number {
  return 5000 * 4 ** bought;
}

export const lvOf = (run: SpireRun, id: string) => run.lv?.[id] ?? 0;
export const tomeOf = (per: SpirePersistent, id: string) => per.tomes?.[id] ?? 0;

// ---------- derived stats ----------

export const potentMultL = (l: number) => 1 + 0.1 * l;
export const resCapL = (l: number) => 3 + 0.25 * l;
export const cascadeWindowL = (l: number) => 1.5 + 0.15 * l;
export const cooldownL = (l: number) => Math.max(0.4, 0.6 - 0.05 * l);
export const chainFactorL = (l: number) => Math.min(1, 0.8 + 0.03 * l);

export const potentMult = (run: SpireRun) => potentMultL(lvOf(run, 'potent'));
export const resCap = (run: SpireRun) => resCapL(lvOf(run, 'glass'));
export const cascadeWindow = (run: SpireRun) => cascadeWindowL(lvOf(run, 'echo'));
export const cooldown = (run: SpireRun) => cooldownL(lvOf(run, 'valve'));
/** Flask width; `glass` = Ingots import level (Tempered Glass, +2 px each, 00 §4). */
export const flaskW = (run: SpireRun, glass = 0) => BASE_FLASK_W + 6 * lvOf(run, 'wider') + 2 * Math.max(0, Math.min(3, glass));
export const apprentices = (run: SpireRun) => lvOf(run, 'hire');

export function arcanaMult(v: number): number {
  return 1 + 0.3 * Math.max(0, v) ** 1.25;
}
export function gravityMult(v: number): number {
  return 1 + 0.03 * v;
}
/** Brim Line depth below the flask mouth: 14 px base, 32 px of neck room, lowered 2 px per Volatility. */
export function brimDepth(run: SpireRun): number {
  return 14 + 8 * (4 - lvOf(run, 'neck')) + 2 * run.vol;
}
export const VENT_BAND = 40;

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
 */
export const IDLE_TUNE = 8;

/** On-screen idle Arcana/s before core multipliers (04 §4). Pure and cheap. */
export function idleRateOf(run: SpireRun, per: SpirePersistent, fuel = 0): number {
  const dpm = apprenticeDropsPerMin(run, fuel);
  if (dpm <= 0) return 0;
  const ceil = distillCeiling(run, per);
  if (ceil < 2) return 0;
  const ev = evDropTable(spawnTable(run), ceil) * potentMult(run);
  const cdf = chainFactorL(lvOf(run, 'tutelage'));
  return (dpm / 60) * ev * cdf * arcanaMult(run.vIdle ?? 0) * IDLE_TUNE;
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
  econBase: 1.8e10,
  rankRef: 1500,
  rankTarget: 1e4,
  commendations,
};
