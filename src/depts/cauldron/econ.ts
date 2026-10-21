// Cauldron numbers (05 §5, §6, §7): save shapes, upgrade formulas, bucket table and idleRate.
// Everything here is pure so the HUD, the core and the balance scripts can call it freely.
import type { DeptSave } from '../../core/types';
import { BUCKETS, INGREDIENTS, ING_ORDER, landingStats, type IngId } from './sim';

export interface TicketItem {
  ing: IngId;
  n: number;
  got: number;
}

export interface Ticket {
  items: TicketItem[];
  zone: number; // 0 = center only, 1 = center +-1, 2 = center +-2
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
}

export interface CRun {
  bank: number;
  lv: Record<string, number>;
  malice: number; // dial setting
  maliceBought: number;
  ticket: Ticket | null;
  rerollAt: number; // Date.now() ms when a free reroll is ready
  spoon: IngId[];
  stats: CStats;
  batchByMal: number[];
}

export interface CPersistent {
  tokens: number;
  rlv: Record<string, number>;
  batchesLifetime: number;
}

export type CSave = DeptSave<CRun, CPersistent>;

export function defaultRun(): CRun {
  return {
    bank: 0,
    lv: {},
    malice: 0,
    maliceBought: 0,
    ticket: null,
    rerollAt: 0,
    spoon: ['newt', 'toad'],
    stats: { drops: 0, tossLands: 0, curses: 0, ladledLands: 0, ticks: 0, batches: 0, bestMult: 0, goldTriples: 0, jackpots: 0, goldHits: 0 },
    batchByMal: new Array(11).fill(0),
  };
}

export function defaultPersistent(): CPersistent {
  return { tokens: 0, rlv: {}, batchesLifetime: 0 };
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
  desc(l: number): string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmtX = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(n >= 10 ? 1 : 2));
const JACKPOT = [3, 5, 7, 10, 15];

export const UPGRADES: UpDef[] = [
  { id: 'fresh', name: 'Fresher Stock', branch: 'pantry', base: 15, growth: 1.22, max: Infinity, desc: (l) => `Value x${fmtX(freshMult(l))} > x${fmtX(freshMult(l + 1))}${(l + 1) % 25 === 0 ? ' X2!' : ''}` },
  { id: 'mandrake', name: 'Mandrake Patch', branch: 'pantry', base: 1500, growth: 1, max: 1, desc: () => 'Mandrakes join the flow. Worth 12' },
  { id: 'hire', name: 'Hire Toadling', branch: 'kitchen', base: 100, growth: 7, max: 7, desc: (l) => `Toadlings ${l + 1} > ${l + 2}` },
  { id: 'bribes', name: 'Fly Bribes', branch: 'kitchen', base: 75, growth: 1.9, max: 20, desc: (l) => `Drop every ${interval(l).toFixed(2)}s > ${interval(l + 1).toFixed(2)}s` },
  { id: 'pot', name: 'Deeper Pot', branch: 'buckets', base: 50, growth: 1.35, max: Infinity, desc: (l) => `All buckets x${(1 + 0.05 * l).toFixed(2)} > x${(1 + 0.05 * (l + 1)).toFixed(2)}` },
  { id: 'jackpot', name: 'Center Jackpot', branch: 'buckets', base: 400, growth: 20, max: 4, desc: (l) => `Center x${JACKPOT[l]} > x${JACKPOT[Math.min(4, l + 1)]}` },
  { id: 'lined', name: 'Lined Buckets', branch: 'buckets', base: 250, growth: 2.6, max: 10, desc: (l) => `Outer buckets +${pct(0.04 * l)} > +${pct(0.04 * (l + 1))}` },
  { id: 'gold', name: 'Gold Peg', branch: 'board', base: 200, growth: 2.2, max: 4, desc: (l) => `Moving gold pegs ${l + 1} > ${l + 2}` },
  { id: 'polish', name: 'Gold Polish', branch: 'board', base: 100, growth: 1.35, max: 15, desc: (l) => `Gold hit +${Math.round(50 + 10 * l)}% > +${Math.round(60 + 10 * l)}%` },
  { id: 'charges', name: 'Ladle Charges', branch: 'board', base: 150, growth: 2, max: 3, desc: (l) => `Ladle charges ${3 + l} > ${4 + l}` },
  { id: 'longLadle', name: 'Long Ladle', branch: 'board', base: 400, growth: 2.2, max: 4, desc: (l) => `Ladles last ${4 + l}s > ${5 + l}s` },
  { id: 'row', name: 'Extra Row', branch: 'board', base: 5000, growth: 300, max: 2, desc: (l) => `Peg rows ${10 + l} > ${11 + l}, +4% mult` },
  { id: 'bigger', name: 'Bigger Batches', branch: 'recipes', base: 2, growth: 1.5, max: 10, tokens: true, desc: (l) => `Batch payout +${20 * l}% > +${20 * (l + 1)}%` },
  { id: 'quickToss', name: 'Quick Toss', branch: 'recipes', base: 2, growth: 1.6, max: 10, tokens: true, desc: (l) => `Toss cooldown ${tossCd(l).toFixed(2)}s > ${tossCd(l + 1).toFixed(2)}s` },
  { id: 'quickTix', name: 'Quick Tickets', branch: 'recipes', base: 3, growth: 2, max: 5, tokens: true, desc: (l) => `Free reroll every ${60 - 10 * l}s > ${60 - 10 * (l + 1)}s` },
];
export const UP: Record<string, UpDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upCost(u: UpDef, level: number): number {
  return Math.ceil(u.base * u.growth ** level);
}

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
export const rlvOf = (p: CPersistent, id: string) => p.rlv[id] ?? 0;

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

/** Fresher Stock: +25% per level, and x2 at every 25th level (the visible milestone, 00 §8). */
export function freshMult(l: number): number {
  return (1 + 0.25 * l) * 2 ** Math.floor(l / 25);
}

export function ingValue(run: CRun, ing: IngId): number {
  return INGREDIENTS[ing].value * freshMult(lvOf(run, 'fresh'));
}

export function flow(run: CRun): IngId[] {
  return ING_ORDER.filter((i) => i !== 'mandrake' || lvOf(run, 'mandrake') > 0);
}

/** Flow weight of an ingredient. `exotic` = Contraband import level (Smuggled Spice, 00 §4):
 * each level takes 4 weight off the Newt, so the pricier ingredients come more often. */
export function ingWeight(ing: IngId, exotic = 0): number {
  const w = INGREDIENTS[ing].weight;
  return ing === 'newt' ? Math.max(10, w - 4 * Math.max(0, Math.min(3, exotic))) : w;
}

export function avgValue(run: CRun, exotic = 0): number {
  const f = flow(run);
  const w = f.reduce((a, i) => a + ingWeight(i, exotic), 0);
  return f.reduce((a, i) => a + ingWeight(i, exotic) * ingValue(run, i), 0) / w;
}

export function pickIngredient(run: CRun, r: number, exotic = 0): IngId {
  const f = flow(run);
  const w = f.reduce((a, i) => a + ingWeight(i, exotic), 0);
  let x = r * w;
  for (const i of f) {
    x -= ingWeight(i, exotic);
    if (x <= 0) return i;
  }
  return f[0];
}

/** Bucket multipliers at a Malice setting (05 §5 table, §7 Malice scaling; exponents are seeds). */
export function bucketMults(run: CRun, malice = run.malice): number[] {
  const lined = 1 + 0.04 * lvOf(run, 'lined');
  const all = (1 + 0.05 * lvOf(run, 'pot')) * 1.04 ** lvOf(run, 'row');
  const center = JACKPOT[lvOf(run, 'jackpot')] * 1.2 ** malice;
  const adj = 2 * lined * 1.1 ** malice;
  const dregs = Math.min(0.5 * lined * (1 + 0.04 * malice), 0.6 * lined);
  const m = [dregs, 1 * lined, 1.5 * lined, adj, center, adj, 1.5 * lined, 1 * lined, dregs];
  return m.map((v) => v * all);
}

/** Bucket indices that count for a ticket zone. */
export function inZone(bucket: number, zone: number): boolean {
  return Math.abs(bucket - (BUCKETS - 1) / 2) <= zone;
}

// ---------- EV cache (05 §3): landing stats per (rows, malice, gold pegs), computed once ----------

const statCache = new Map<string, { dist: number[]; goldHits: number[] }>();
function stats(r: number, malice: number, gold: number): { dist: number[]; goldHits: number[] } {
  const key = `${r}|${malice}|${gold}`;
  let d = statCache.get(key);
  if (!d) {
    d = landingStats(r, malice, gold, 1200);
    statCache.set(key, d);
  }
  return d;
}

export function distribution(r: number, malice: number): number[] {
  return stats(r, malice, 0).dist;
}

/** Expected bucket multiplier for a uniformly random drop (no Ladles, no Tosses).
 * SIM-TUNED: the moving gold pegs are included (05 §3 originally left them out). They hit the
 * toadling rain with no input at all, so leaving them out made the live board earn ~1.8x idleRate
 * and pushed active:offline to ~6.6x. Counting them keeps idleRate = "the board with no input"
 * (00 §7), and Gold Peg / Gold Polish now raise idle income and Rank like any other node. */
export function expectedMult(run: CRun, malice = run.malice): number {
  const st = stats(rows(run), malice, goldCount(run));
  const m = bucketMults(run, malice);
  const g = goldMult(run) - 1;
  let s = 0;
  for (let i = 0; i < BUCKETS; i++) s += st.dist[i] * m[i] * (1 + g * st.goldHits[i]);
  return s;
}

export function evPerDrop(run: CRun, exotic = 0): number {
  return avgValue(run, exotic) * expectedMult(run);
}

/** On-screen idle Bile/s before core multipliers: toadling drops x value x E[mult]_random.
 * `exotic` = Contraband import level (ingWeight). */
export function idleRateOf(run: CRun, exotic = 0): number {
  return dropsPerSec(run) * evPerDrop(run, exotic);
}

export const BATCH_IDLE_S = 8;
export function batchPayout(run: CRun, p: CPersistent, exotic = 0): number {
  // Seed: 25x the average drop (spec) plus some seconds of idle income so Batches stay worth
  // chasing once the toadling rain dwarfs a single drop.
  // SIM-TUNED: 10 s -> 8 s, which holds active at ~2.5-3x on-screen idle (05 §3) once Bigger
  // Batches is levelled in later cycles. Batches are most of the Cauldron's active edge.
  return (25 * evPerDrop(run, exotic) + BATCH_IDLE_S * idleRateOf(run, exotic)) * (1 + 0.2 * rlvOf(p, 'bigger'));
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
  const f = flow(run);
  const total = Math.min(5, 2 + Math.floor(done / 3) + (rnd() < 0.4 ? 1 : 0));
  const zone = done < 2 ? 2 : rnd() < 0.6 ? 1 : 2;
  const items: TicketItem[] = [];
  let left = total;
  const kinds = Math.min(left, rnd() < 0.5 ? 1 : 2);
  for (let k = 0; k < kinds; k++) {
    let ing = pickIngredient(run, rnd());
    let guard = 0;
    while (items.some((i) => i.ing === ing) && guard++ < 10) ing = f[Math.floor(rnd() * f.length)];
    if (items.some((i) => i.ing === ing)) break;
    const n = k === kinds - 1 ? left : Math.max(1, Math.floor(left / 2));
    left -= n;
    items.push({ ing, n, got: 0 });
  }
  if (left > 0) items[0].n += left;
  return { items, zone };
}
