// The Cauldron's pure economy definition (no Pixi): the shared core and the headless balance
// simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { Commendation, DeptEcon } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { defaultPersistent, defaultRun, idleRateOf, type CRun } from './econ';

const run = (s: DeptSave) => s.run as CRun;
const stats = (s: DeptSave) => run(s).stats ?? ({} as CRun['stats']);
const lv = (s: DeptSave, id: string) => run(s).lv?.[id] ?? 0;

export const commendations: Commendation[] = [
  { id: 'batch1', label: 'FIRST BATCH', test: (s) => (stats(s).batches ?? 0) >= 1 },
  { id: 'toads4', label: 'FOUR WARTY HANDS', test: (s) => lv(s, 'hire') >= 3 },
  { id: 'jackpot', label: 'SWEET MIDDLE', test: (s) => lv(s, 'jackpot') >= 1 },
  { id: 'drops1k', label: '1,000 DROPS', test: (s) => (stats(s).drops ?? 0) >= 1000 },
  { id: 'goldTriple', label: 'GOLDEN TRIPLE', test: (s) => (stats(s).goldTriples ?? 0) >= 1 },
  { id: 'malice1', label: 'A NASTIER BOARD', test: (s) => (run(s).maliceBought ?? 0) >= 1 },
  { id: 'batch10', label: 'TEN BATCHES', test: (s) => (stats(s).batches ?? 0) >= 10 },
  { id: 'million', label: 'A MILLION BILE', test: (s) => s.cycle.earnings >= 1e6 },
];

export const cauldronEcon: DeptEcon = {
  id: 'cauldron',
  version: 1,
  defaultRun,
  defaultPersistent,
  idleRate(save) {
    const r = save.run as CRun;
    if (!r || !r.lv) return 0;
    return idleRateOf(r);
  },
  // Infamy skill gate (05 §7, 00 §2.2): 5 Batches at Malice >= min(4 + N, 10).
  skillTarget: (n) => Math.min(4 + n, 10),
  skillLabel: (t) => `5 BATCHES AT MALICE ${t}`,
  // Seeds from the pacing model (greedy buyer, active play earning ~2-3x idleRate; see the
  // balance notes in econ.ts). Idle rate runs ~1.5/s at start, ~300-1.4K/s at 5 min, and
  // levels off around 100-180K/s after ~2 h once the capped nodes are bought. Cycle earnings
  // reach ~2e9 at ~2 h for a perfect player (A=3) and ~3.5 h at A=2, so the first Fall lands
  // around 3-4 h active-equivalent alongside Malice IV (~340M Bile). The sim owns the final values.
  econBase: 2e9,
  rankRef: 300,
  rankTarget: 150_000,
  commendations,
};
