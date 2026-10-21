// Cauldron numbers (05 §5, §6, §7): save shapes, upgrade formulas, bucket table and idleRate.
// Everything here is pure so the HUD, the core and the balance scripts can call it freely.
import { LONG_GROWTH, LONG_MAX, longDesc, longLocked, longMult } from '../../core/longnode';
import type { DeptSave } from '../../core/types';
import {
  BUCKETS,
  COL_W,
  CENTER_X,
  INGREDIENTS,
  ING_ORDER,
  LAYOUTS,
  landingStats,
  RUNE_MULT,
  SPECIALS,
  type BoardConfig,
  type IngId,
  type LandingStats,
  type LayoutId,
} from './sim';

export interface TicketItem {
  ing: IngId;
  n: number;
  got: number;
}

export interface Ticket {
  items: TicketItem[];
  zone: number; // 0 = jackpot only, 1 = tier 3+, 2 = tier 2+
  /** A Hero's Sock went in: this Batch pays double (05 §5). */
  sock?: boolean;
  /** The free spoon swap was used on this ticket (05 §11). */
  swapped?: boolean;
}

export interface CStats {
  drops: number;
  tossLands: number;
  curses: number;
  ladledLands: number;
  ticks: number;
  batches: number;
  bestMult: number;
  goldTriples: number;
  jackpots: number;
  goldHits: number;
  spills: number;
  /** Ladled drops landing in the inner buckets at Malice >= 1 (the Malice lesson). */
  ladledMal: number;
  specials: number;
  socks: number;
  boneHits: number;
}

export interface CRun {
  bank: number;
  lv: Record<string, number>;
  malice: number; // dial setting
  maliceBought: number;
  ticket: Ticket | null;
  /** Double Order's second ticket (null without it). */
  ticket2?: Ticket | null;
  rerollAt: number; // Date.now() ms when a free reroll is ready
  spoon: IngId[];
  stats: CStats;
  batchByMal: number[];
  /** Board Layout for this cycle (undefined = the persistent pick, else Classic). */
  layout?: LayoutId;
  /** Picked layouts lock once the player buys a Malice level this cycle. */
  layoutLock?: boolean;
  /** Bucket Shift: bucket tiers after swaps (undefined = the layout's own order). */
  tiers?: number[];
  /** Date.now() ms when the next Bucket Shift swap is ready. */
  shiftAt?: number;
}

export interface CPersistent {
  tokens: number;
  rlv: Record<string, number>;
  batchesLifetime: number;
  /** Last Board Layout picked (the next cycle starts on it). */
  layout?: LayoutId;
}

export type CSave = DeptSave<CRun, CPersistent>;

export function defaultStats(): CStats {
  return {
    drops: 0,
    tossLands: 0,
    curses: 0,
    ladledLands: 0,
    ticks: 0,
    batches: 0,
    bestMult: 0,
    goldTriples: 0,
    jackpots: 0,
    goldHits: 0,
    spills: 0,
    ladledMal: 0,
    specials: 0,
    socks: 0,
    boneHits: 0,
  };
}

export function defaultRun(): CRun {
  return {
    bank: 0,
    lv: {},
    malice: 0,
    maliceBought: 0,
    ticket: null,
    ticket2: null,
    rerollAt: 0,
    spoon: ['newt', 'toad'],
    stats: defaultStats(),
    batchByMal: new Array(11).fill(0),
  };
}

export function defaultPersistent(): CPersistent {
  return { tokens: 0, rlv: {}, batchesLifetime: 0 };
}

/** Default-fills fields added after a save was written (old saves load; idempotent). */
export function fillRun(run: CRun, per?: CPersistent): void {
  const def = defaultRun();
  run.lv ??= {};
  run.stats = { ...def.stats, ...(run.stats ?? {}) };
  run.batchByMal ??= def.batchByMal;
  run.maliceBought ??= 0;
  run.malice = Math.max(0, Math.min(run.malice ?? 0, run.maliceBought));
  run.ticket2 ??= null;
  if (run.tiers && (run.tiers.length !== BUCKETS || run.tiers.some((t) => !(t >= 0 && t <= 4)))) delete run.tiers;
  if (run.layout && !LAYOUTS[run.layout]) delete run.layout;
  if (per) {
    per.rlv ??= {};
    per.tokens ??= 0;
    per.batchesLifetime ??= 0;
    if (per.layout && !LAYOUTS[per.layout]) delete per.layout;
  }
}

// ---------- upgrade table ----------

export type Branch = 'pantry' | 'board' | 'buckets' | 'kitchen' | 'recipes';

export interface UpDef {
  id: string;
  name: string;
  branch: Branch;
  base: number;
  growth: number;
  max: number;
  tokens?: boolean; // paid in Batch Tokens (persistent)
  /** Locked until this department's 2nd Fall (the long node, core/longnode.ts). */
  afterFall?: boolean;
  /** Only changes active play (the Steward and Ready list skip it when false-y for idle). */
  activeOnly?: boolean;
  desc(l: number): string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmtX = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(n >= 10 ? 1 : 2));
const JACKPOT = [3, 5, 7, 10, 15];

/** Bone pegs: each hit pays this share of the ingredient's value, x1.15 per level after the first. */
export const BONE_FRAC = 0.08;
export const BONE_GROWTH = 1.15;
export const BONE_PER_LEVEL = 3;
/** Taught Toadlings: share of toadling drops aimed (best chute +-1) per level. */
export const TAUGHT_SHARE = 0.1;
/** Slop Pail payout (x value x Deeper Pot), 05 §4. */
export const SLOP_MULT = 0.25;
/** Bucket Shift cooldown (05 §6: 1 swap per 5 min). */
export const SHIFT_MS = 5 * 60_000;
/** Double Order ticket count. */
export const ticketsOf = (p: CPersistent) => (rlvOf(p, 'double') > 0 ? 2 : 1);

export const UPGRADES: UpDef[] = [
  // Toadling Kitchen.
  { id: 'hire', name: 'Hire Toadling', branch: 'kitchen', base: 100, growth: 7, max: 7, desc: (l) => `Toadlings ${l + 1} > ${l + 2}` },
  { id: 'bribes', name: 'Fly Bribes', branch: 'kitchen', base: 75, growth: 1.9, max: 20, desc: (l) => `Drop every ${interval(l).toFixed(2)}s > ${interval(l + 1).toFixed(2)}s` },
  // SIM-TUNED price (spec seed 10,000 x 2^L): an idle multiplier (+~6%/level), so it sits late.
  { id: 'taught', name: 'Taught Toadlings', branch: 'kitchen', base: 1e8, growth: 15, max: 3, desc: (l) => `Aimed drops ${pct(TAUGHT_SHARE * l)} > ${pct(TAUGHT_SHARE * (l + 1))}` },
  // Pantry.
  { id: 'fresh', name: 'Fresher Stock', branch: 'pantry', base: 15, growth: 1.22, max: Infinity, desc: (l) => `Value x${fmtX(freshMult(l))} > x${fmtX(freshMult(l + 1))}${(l + 1) % 25 === 0 ? ' X2!' : ''}` },
  // The long node (core/longnode.ts, sim/README.md "Pass 5"): every ingredient x1.15 per level, a
  // bigger pot every 10 levels. SIM-TUNED base: ~2 h of a later cycle's plateau idle (~2e6/s).
  { id: 'size', name: 'Grander Cauldron', branch: 'pantry', base: 1.5e10, growth: LONG_GROWTH, max: LONG_MAX, afterFall: true, desc: (l) => longDesc(CAULDRON_SIZES, l) },
  // Specials (05 §5). SIM-TUNED prices on this economy's scale (spec seeds 500 / 2K / 8K / 25K /
  // 80K / 250K): Mandrake lands ~10-12 min in, the rest spread over the cycle. Priced ~x15 above a
  // straight rescale (with the Bone/Rune/Thorn/Taught nodes): cheaper, they sped cycles 2-5 up by
  // ~3 h each through earlier Malice buys and added a 6th Fall by day 7 (sim, 2026-10-21).
  { id: 'mandrake', name: 'Mandrake Patch', branch: 'pantry', base: 1500, growth: 1, max: 1, desc: () => 'Mandrake: worth 12, screams' },
  { id: 'splitroot', name: 'Splitroot', branch: 'pantry', base: 3e5, growth: 1, max: 1, desc: () => 'Splits in 3 on first peg' },
  { id: 'boomshroom', name: 'Boomshroom', branch: 'pantry', base: 5e6, growth: 1, max: 1, desc: () => '4th peg: BOOM, gold x2' },
  { id: 'leadheart', name: 'Lead Heart', branch: 'pantry', base: 1e8, growth: 1, max: 1, desc: () => 'Worth 10, drops straight' },
  { id: 'wisp', name: 'Wisp Salt', branch: 'pantry', base: 2e9, growth: 1, max: 1, desc: () => 'Homes in on the jackpot' },
  { id: 'odds', name: 'Special Odds', branch: 'pantry', base: 1e6, growth: 2.6, max: 10, desc: (l) => `Specials +${l} > +${l + 1} weight` },
  { id: 'sock', name: 'Sock Drawer', branch: 'pantry', base: 5e10, growth: 1, max: 1, desc: () => "Hero's Sock: 50, Batch x2" },
  // Peg Board.
  { id: 'gold', name: 'Gold Peg', branch: 'board', base: 200, growth: 2.2, max: 4, desc: (l) => `Moving gold pegs ${l + 1} > ${l + 2}` },
  { id: 'polish', name: 'Gold Polish', branch: 'board', base: 100, growth: 1.35, max: 15, desc: (l) => `Gold hit +${Math.round(50 + 10 * l)}% > +${Math.round(60 + 10 * l)}%` },
  { id: 'charges', name: 'Ladle Charges', branch: 'board', base: 150, growth: 2, max: 3, activeOnly: true, desc: (l) => `Ladle charges ${3 + l} > ${4 + l}` },
  { id: 'longLadle', name: 'Long Ladle', branch: 'board', base: 400, growth: 2.2, max: 4, activeOnly: true, desc: (l) => `Ladles last ${4 + l}s > ${5 + l}s` },
  { id: 'scry', name: 'Scrying Ladle', branch: 'board', base: 2e4, growth: 1, max: 1, activeOnly: true, desc: () => 'Hold a chute: see odds' },
  { id: 'row', name: 'Extra Row', branch: 'board', base: 5000, growth: 300, max: 2, desc: (l) => `Peg rows ${10 + l} > ${11 + l}, +4% mult` },
  { id: 'bone', name: 'Bone Pegs', branch: 'board', base: 5e5, growth: 4, max: 10, desc: (l) => `${BONE_PER_LEVEL * (l + 1)} bone pegs, +${pct(boneFrac(l + 1))} value/hit` },
  { id: 'rune', name: 'Rune Pegs', branch: 'board', base: 5e6, growth: 5, max: 4, desc: (l) => `Rune pegs ${l} > ${l + 1}: lift, x1.25` },
  { id: 'thorn', name: 'Thorn Pegs', branch: 'board', base: 2e7, growth: 5, max: 4, desc: (l) => `Thorn pegs ${l} > ${l + 1}: split toads` },
  // Buckets (the Pot tab).
  { id: 'pot', name: 'Deeper Pot', branch: 'buckets', base: 50, growth: 1.35, max: Infinity, desc: (l) => `All buckets x${(1 + 0.05 * l).toFixed(2)} > x${(1 + 0.05 * (l + 1)).toFixed(2)}` },
  { id: 'jackpot', name: 'Center Jackpot', branch: 'buckets', base: 400, growth: 20, max: 4, desc: (l) => `Jackpot x${JACKPOT[l]} > x${JACKPOT[Math.min(4, l + 1)]}` },
  { id: 'lined', name: 'Lined Buckets', branch: 'buckets', base: 250, growth: 2.6, max: 10, desc: (l) => `Outer buckets +${pct(0.04 * l)} > +${pct(0.04 * (l + 1))}` },
  { id: 'shift', name: 'Bucket Shift', branch: 'buckets', base: 5e5, growth: 1, max: 1, activeOnly: true, desc: () => 'Hold a bucket: swap it' },
  // Recipes (Batch Tokens; persist through Falls).
  { id: 'bigger', name: 'Bigger Batches', branch: 'recipes', base: 2, growth: 1.5, max: 10, tokens: true, desc: (l) => `Batch payout +${20 * l}% > +${20 * (l + 1)}%` },
  { id: 'quickToss', name: 'Quick Toss', branch: 'recipes', base: 2, growth: 1.6, max: 10, tokens: true, desc: (l) => `Toss cooldown ${tossCd(l).toFixed(2)}s > ${tossCd(l + 1).toFixed(2)}s` },
  { id: 'quickTix', name: 'Quick Tickets', branch: 'recipes', base: 3, growth: 2, max: 5, tokens: true, desc: (l) => `Free reroll every ${60 - 10 * l}s > ${60 - 10 * (l + 1)}s` },
  // SIM-TUNED: 40 tokens (spec 15). A second ticket nearly doubles the Batch rate, the bulk of the
  // active edge, so it comes after the first few recipe levels (active : idle stays in 2-3x).
  { id: 'double', name: 'Double Order', branch: 'recipes', base: 40, growth: 1, max: 1, tokens: true, desc: () => 'Two tickets at once' },
];
export const UP: Record<string, UpDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upCost(u: UpDef, level: number): number {
  return Math.ceil(u.base * u.growth ** level);
}

/** Grander Cauldron's milestone titles (one per 10 levels). */
export const CAULDRON_SIZES = ['POT', 'KETTLE', 'VAT', 'TUN', 'CISTERN', 'MOAT', 'LAKE'];

/** Lock reason for a node in cycle `n` (the long node opens after the 2nd Fall), or null. */
export const upLocked = (u: UpDef, n: number): string | null => (u.afterFall ? longLocked(n) : null);

export const MALICE_MAX = 10;
/**
 * Price of the next Malice level (one-time per cycle). Spec seed is 2,000 x 5^M (05 §7).
 * SIM-TUNED: x5 per level up to Malice V while the capped nodes fill (the income ramp), then x2 per
 * level, which tracks the plateau income at the top of the dial (00 §8.1 step-cost band). The old
 * 100,000 x 15^M priced Malice VIII at 1.7e13 Bile against ~2e11/day, so the Cauldron stalled at
 * 88% Infamy for good after its 4th Fall.
 */
export const MALICE_KNEE = 5;
export function maliceCost(bought: number): number {
  return 2.7e6 * 5 ** Math.min(bought, MALICE_KNEE) * 2 ** Math.max(0, bought - MALICE_KNEE);
}

// ---------- derived stats ----------

export const lvOf = (run: CRun, id: string) => run.lv[id] ?? 0;
export const rlvOf = (p: CPersistent, id: string) => p.rlv?.[id] ?? 0;

export function interval(bribes: number): number {
  return Math.max(0.5, 2 * 0.92 ** bribes);
}
export function tossCd(l: number): number {
  return Math.max(0.5, 1 - 0.05 * l);
}
export const toadlings = (run: CRun) => 1 + lvOf(run, 'hire');
export const dropsPerSec = (run: CRun) => toadlings(run) / interval(lvOf(run, 'bribes'));
export const rows = (run: CRun) => 10 + lvOf(run, 'row');
export const goldCount = (run: CRun) => 1 + lvOf(run, 'gold');
export const goldMult = (run: CRun) => 1.5 + 0.1 * lvOf(run, 'polish');
/** Ladle charges; `sigils` = Essence import level (Ladle Sigils, +1 each, 00 §4). */
export const ladleCharges = (run: CRun, sigils = 0) => 3 + lvOf(run, 'charges') + Math.max(0, Math.min(3, sigils));
export const ladleSecs = (run: CRun) => 4 + lvOf(run, 'longLadle');
export const boneFrac = (l: number) => (l > 0 ? BONE_FRAC * BONE_GROWTH ** (l - 1) : 0);
export const taughtShare = (run: CRun) => TAUGHT_SHARE * lvOf(run, 'taught');
export const layoutOf = (run: CRun): LayoutId => (run.layout && LAYOUTS[run.layout] ? run.layout : 'classic');
export const tiersOf = (run: CRun): number[] => run.tiers ?? LAYOUTS[layoutOf(run)].tiers;

/** The x (board-local) Ladles and Wisp Salt steer to: the jackpot column nearest the middle. */
export function goalX(tiers: number[]): number {
  let best = 4;
  for (let k = 0; k < BUCKETS; k++) {
    if (tiers[k] > tiers[best] || (tiers[k] === tiers[best] && Math.abs(k - 4) < Math.abs(best - 4))) best = k;
  }
  return best * COL_W + COL_W / 2;
}

/** The board this run plays on (one place, so the scene, the EV cache and the sim agree). */
export function boardConfig(run: CRun): BoardConfig {
  return {
    rows: rows(run),
    malice: run.malice,
    gold: goldCount(run),
    bone: BONE_PER_LEVEL * lvOf(run, 'bone'),
    rune: lvOf(run, 'rune'),
    thorn: lvOf(run, 'thorn'),
    layout: layoutOf(run),
    goalX: goalX(tiersOf(run)),
  };
}

/** Fresher Stock: +25% per level, and x2 at every 25th level (the visible milestone, 00 §8). */
export function freshMult(l: number): number {
  return (1 + 0.25 * l) * 2 ** Math.floor(l / 25);
}

export function ingValue(run: CRun, ing: IngId): number {
  return INGREDIENTS[ing].value * freshMult(lvOf(run, 'fresh')) * longMult(lvOf(run, 'size'));
}

/** What the toadlings pour: the base three plus every unlocked special. */
export function flow(run: CRun): IngId[] {
  return [...ING_ORDER.filter((i) => i !== 'mandrake'), ...SPECIALS.filter((i) => lvOf(run, i) > 0)];
}

/** Flow weight of an ingredient. `exotic` = Contraband import level (Smuggled Spice, 00 §4):
 * each level takes 4 weight off the Newt, so the pricier ingredients come more often. Special
 * Odds adds +1 weight per level to every unlocked special (the Sock stays 1-in-200). */
export function ingWeight(ing: IngId, exotic = 0, odds = 0): number {
  const w = INGREDIENTS[ing].weight;
  if (ing === 'newt') return Math.max(10, w - 4 * Math.max(0, Math.min(3, exotic)));
  if (ing !== 'sock' && SPECIALS.includes(ing)) return w + odds;
  return w;
}

export function avgValue(run: CRun, exotic = 0): number {
  const f = flow(run);
  const o = lvOf(run, 'odds');
  const w = f.reduce((a, i) => a + ingWeight(i, exotic, o), 0);
  return f.reduce((a, i) => a + ingWeight(i, exotic, o) * ingValue(run, i) * (INGREDIENTS[i].idleValue ?? 1), 0) / w;
}

export function pickIngredient(run: CRun, r: number, exotic = 0): IngId {
  const f = flow(run);
  const o = lvOf(run, 'odds');
  const w = f.reduce((a, i) => a + ingWeight(i, exotic, o), 0);
  let x = r * w;
  for (const i of f) {
    x -= ingWeight(i, exotic, o);
    if (x <= 0) return i;
  }
  return f[0];
}

/** The x Deeper Pot and Extra Row give every bucket. */
export function allFactor(run: CRun): number {
  return (1 + 0.05 * lvOf(run, 'pot')) * 1.04 ** lvOf(run, 'row');
}

/** Multiplier by bucket tier (0 Dregs .. 4 Jackpot) at a Malice setting (05 §5, §7; seeds). */
export function tierMults(run: CRun, malice = run.malice): number[] {
  const lined = 1 + 0.04 * lvOf(run, 'lined');
  const all = allFactor(run) * layoutNorm(run);
  const center = JACKPOT[lvOf(run, 'jackpot')] * 1.2 ** malice;
  const adj = 2 * lined * 1.1 ** malice;
  const dregs = Math.min(0.5 * lined * (1 + 0.04 * malice), 0.6 * lined);
  return [dregs, 1 * lined, 1.5 * lined, adj, center].map((v) => v * all);
}

/** Bucket multipliers left to right (layout order and Bucket Shift swaps applied). */
export function bucketMults(run: CRun, malice = run.malice): number[] {
  const t = tierMults(run, malice);
  return tiersOf(run).map((k) => t[k]);
}

/** Does a bucket count for a ticket zone? (tier >= 4 - zone). */
export function inZone(bucket: number, zone: number, tiers: number[] = LAYOUTS.classic.tiers): boolean {
  return (tiers[bucket] ?? 0) >= 4 - zone;
}

// ---------- EV cache (05 §3): landing stats per board, computed once ----------

const statCache = new Map<string, LandingStats>();
const CACHE_MAX = 4000;
function cached(key: string, make: () => LandingStats): LandingStats {
  let d = statCache.get(key);
  if (!d) {
    if (statCache.size >= CACHE_MAX) statCache.delete(statCache.keys().next().value!);
    d = make();
    statCache.set(key, d);
  }
  return d;
}
// Bone, rune and thorn pegs are priced in analytically (bone and rune as a share of peg hits,
// thorn halves are value-neutral), so the cache only keys the board's shape: rows, Malice, gold
// pegs, layout and the steering goal. That keeps the EV cache to the same ~200 boards per save.
const cfgKey = (c: BoardConfig) => `${c.rows}|${c.malice}|${c.gold}|${c.layout ?? 'classic'}|${Math.round(c.goalX ?? CENTER_X)}`;
const shape = (c: BoardConfig): BoardConfig => ({ ...c, bone: 0, rune: 0, thorn: 0 });

/** Random-x landing stats for a board (bone pegs don't change the physics, so not in the key). */
export function boardStats(c: BoardConfig): LandingStats {
  return cached(cfgKey(c), () => landingStats(shape(c), 1200));
}

/** Landing stats for drops down chute k (Taught Toadlings, Scrying Ladle). */
export function chuteStats(c: BoardConfig, k: number): LandingStats {
  return cached(`${cfgKey(c)}#${k}`, () => landingStats(shape(c), 120, k));
}

/** Layout balance: other layouts' bucket table is scaled so a random drop is worth what it is on
 * Classic (a layout is a different game, not a strict upgrade; 05 §7 "its own EV cache"). */
const BASE_TIER = [0.5, 1, 1.5, 2, 3];
export function layoutNorm(run: CRun): number {
  const layout = layoutOf(run);
  if (layout === 'classic') return 1;
  const ev = (l: LayoutId) => {
    const st = boardStats({ rows: rows(run), malice: run.malice, gold: 0, layout: l, goalX: goalX(LAYOUTS[l].tiers) });
    return LAYOUTS[l].tiers.reduce((a, t, k) => a + st.dist[k] * BASE_TIER[t], 0);
  };
  const e = ev(layout);
  return e > 0 ? ev('classic') / e : 1;
}

export function distribution(r: number, malice: number): number[] {
  return boardStats({ rows: r, malice, gold: 0 }).dist;
}

/** Rune pegs: the share of drops that touch one (one charge per drop), from the peg-hit share. */
function runeShare(run: CRun, st: LandingStats): number {
  const n = lvOf(run, 'rune');
  return n > 0 ? Math.min(1, (st.hits * n) / Math.max(1, st.pegs)) : 0;
}

/** Expected bucket multiplier of a set of landing stats on this run's buckets (gold, runes and
 * the Slop Pail included). */
function multOf(run: CRun, st: LandingStats, mults: number[]): number {
  const g = goldMult(run) - 1;
  let s = 0;
  for (let i = 0; i < BUCKETS; i++) s += st.dist[i] * mults[i] * (1 + g * st.goldHits[i]);
  return s * (1 + (RUNE_MULT - 1) * runeShare(run, st)) + st.spill * SLOP_MULT * allFactor(run);
}

/** The chute Taught Toadlings aim at: the jackpot column (they're taught where the good bucket is). */
export function bestChute(run: CRun): number {
  return Math.round((goalX(tiersOf(run)) - COL_W / 2) / COL_W);
}

/** Expected bucket multiplier for a toadling drop (no Ladles, no Tosses): random x, plus the
 * Taught Toadlings' aimed share at the best chute +-1 (05 §3 E[mult]_aimed).
 * SIM-TUNED: the moving gold pegs are included (05 §3 originally left them out). They hit the
 * toadling rain with no input at all, so leaving them out made the live board earn ~1.8x idleRate
 * and pushed active:offline to ~6.6x. Counting them keeps idleRate = "the board with no input"
 * (00 §7), and Gold Peg / Gold Polish now raise idle income and Rank like any other node. */
export function expectedMult(run: CRun, malice = run.malice): number {
  const c = { ...boardConfig(run), malice };
  const mults = bucketMults(run, malice);
  const rand = multOf(run, boardStats(c), mults);
  const a = taughtShare(run);
  if (a <= 0) return rand;
  const r = { ...run, malice };
  const b = bestChute(r);
  let aimed = 0;
  for (const k of [b - 1, b, b + 1]) aimed += multOf(run, chuteStats(c, Math.max(0, Math.min(BUCKETS - 1, k))), mults) / 3;
  return (1 - a) * rand + a * aimed;
}

/** Expected bone-peg Bile per drop: share of peg hits on bone x the bone payout x the value. */
export function boneEv(run: CRun, exotic = 0): number {
  const l = lvOf(run, 'bone');
  if (l <= 0) return 0;
  const st = boardStats(boardConfig(run));
  const share = Math.min(1, (BONE_PER_LEVEL * l) / Math.max(1, st.pegs));
  return st.hits * share * boneFrac(l) * avgValue(run, exotic);
}

export function evPerDrop(run: CRun, exotic = 0): number {
  return avgValue(run, exotic) * expectedMult(run) + boneEv(run, exotic);
}

/** On-screen idle Bile/s before core multipliers: toadling drops x value x E[mult]_random.
 * `exotic` = Contraband import level (ingWeight). */
export function idleRateOf(run: CRun, exotic = 0): number {
  return dropsPerSec(run) * evPerDrop(run, exotic);
}

export const BATCH_IDLE_S = 8;
export function batchPayout(run: CRun, p: CPersistent, exotic = 0, sock = false): number {
  // Seed: 25x the average drop (spec) plus some seconds of idle income so Batches stay worth
  // chasing once the toadling rain dwarfs a single drop.
  // SIM-TUNED: 10 s -> 8 s, which holds active at ~2.5-3x on-screen idle (05 §3) once Bigger
  // Batches is levelled in later cycles. Batches are most of the Cauldron's active edge.
  return (25 * evPerDrop(run, exotic) + BATCH_IDLE_S * idleRateOf(run, exotic)) * (1 + 0.2 * rlvOf(p, 'bigger')) * (sock ? 2 : 1);
}

/** Highest Malice L with at least 5 Batches completed at Malice >= L this cycle (skill gate). */
export function heldMalice(run: CRun): number {
  let sum = 0;
  for (let m = MALICE_MAX; m >= 1; m--) {
    sum += run.batchByMal[m] ?? 0;
    if (sum >= 5) return m;
  }
  return 0;
}

export function newTicket(run: CRun, rnd: () => number): Ticket {
  const done = run.stats.batches;
  // Tickets ask for the everyday flow plus Mandrake (never the rare Sock).
  const f = flow(run).filter((i) => i !== 'sock');
  const total = Math.min(5, 2 + Math.floor(done / 3) + (rnd() < 0.4 ? 1 : 0));
  const zone = done < 2 ? 2 : rnd() < 0.6 ? 1 : 2;
  const items: TicketItem[] = [];
  let left = total;
  const kinds = Math.min(left, rnd() < 0.5 ? 1 : 2);
  for (let k = 0; k < kinds; k++) {
    let ing = pickIngredient(run, rnd());
    let guard = 0;
    while ((ing === 'sock' || items.some((i) => i.ing === ing)) && guard++ < 10) ing = f[Math.floor(rnd() * f.length)];
    if (ing === 'sock' || items.some((i) => i.ing === ing)) break;
    const n = k === kinds - 1 ? left : Math.max(1, Math.floor(left / 2));
    left -= n;
    items.push({ ing, n, got: 0 });
  }
  if (!items.length) items.push({ ing: 'newt', n: 0, got: 0 });
  if (left > 0) items[0].n += left;
  return { items, zone };
}

// ---------- Board Layouts (persistent collection, 05 §7) ----------

/** Layouts unlocked by this department's lifetime Falls. */
export function layoutsOpen(falls: number): LayoutId[] {
  return (Object.keys(LAYOUTS) as LayoutId[]).filter((l) => falls >= LAYOUTS[l].falls);
}

// ---------- the Hopper ritual (05 §13) ----------

/** Hopper rain size for a haul (the backlog shown on the rail); purely visual scale. */
export const HOPPER_DROPS = 24;
