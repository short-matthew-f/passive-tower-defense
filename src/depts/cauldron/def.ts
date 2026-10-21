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
  // SIM-TUNED (sim/README.md "Tuning log"). Idle rate runs ~1.5/s at start, ~8K/s after 10 min on
  // screen and ~3.5e5/s at the first 100% Infamy (gold pegs now counted, econ.ts expectedMult).
  //  - econBase 6e9 -> 2.4e9 (second pass, with 4 departments): the reference player fills the
  //    economy gate during the day-1 evening session at ~3.1-3.3 h active-equivalent (00 §8 hard
  //    band 3-4 h +- 1 h). With the Dungeon and the Bridge open on day 1 the Cauldron gets fewer
  //    of the 90 minutes, and 6e9 slipped the Fall to day 2 08:00 at ~5.7 h AE (the night adds
  //    ~2 h AE of offline income at the ~4x active:offline ratio), outside the hard band.
  //  - rankRef: idleRate after ~10 min on screen; rankTarget: idleRate at the first 100% Infamy.
  econBase: 2.4e9,
  rankRef: 8000,
  rankTarget: 350_000,
  commendations,
};
