// The Dungeon's pure economy definition (no Pixi): the shared core and the headless balance
// simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { Commendation, DeptEcon } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import * as M from './model';
import { idleRateOf } from './sim';

const run = (s: DeptSave) => s.run as M.DungeonRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();

export const commendations: Commendation[] = [
  { id: 'firstBlood', label: 'FIRST CUSTOMER SERVED', test: (s) => st(s).kills >= 1 },
  { id: 'builder', label: 'ARCHITECT: 12 PIECES AT ONCE', test: (s) => st(s).bestPieces >= 12 },
  { id: 'baited', label: 'BAITED: A PARTY DETOURED', test: (s) => st(s).detours >= 1 },
  { id: 'glare', label: 'THE LOOK: 10 GLARE KILLS', test: (s) => st(s).glareKills >= 10 },
  { id: 'gong', label: 'PERFECT GONG: FULL STACK', test: (s) => st(s).bestGong >= M.GONG_MAX },
  { id: 'champ', label: 'CHAMPION SLAIN', test: (s) => st(s).champs >= 1 },
  { id: 'recover', label: 'RECOVERED 5 GOLD SACKS', test: (s) => st(s).recovered >= 5 },
  { id: 'lure10', label: 'RUMOR HAS IT: LURE 10', test: (s) => (run(s).lureMax ?? 0) >= 10 },
];

export const dungeonEcon: DeptEcon = {
  id: 'dungeon',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  // On-screen idle rate: a headless 20 Hz sim of the layout (Cautious Mode), memoized by a
  // layout/upgrade/Lure hash, so the per-frame HUD call is a lookup (sim.ts).
  idleRate(save) {
    const r = run(save);
    if (!r || !r.pieces || !r.ws || !r.stats) {
      if (!r) return 0;
      M.normalize(r, save.persistent);
    }
    return idleRateOf(r);
  },

  // Infamy skill gate (00 §2.2, 01 §7): slay 2 Champions at Lure >= min(15 + 4N, 40) while leaks
  // stay under 20% over the last 20 parties.
  skillTarget: (n) => Math.min(15 + 4 * n, 40),
  skillLabel: (t) => `SLAY 2 CHAMPIONS AT LURE ${t}, LEAKS UNDER 20%`,

  // SIM-TUNED (sim/README.md "Tuning log"; the balance sim's greedy builder on the real 20 Hz sim,
  // with the reference player's 4-department schedule: ~12 min a day of Dungeon attention):
  //  - econBase 6e6 -> 2.5e7: 6e6 filled the economy gate on day 3 at ~13 h active-equivalent;
  //    2.5e7 puts the first Dungeon Fall on day 4 at 08:00 (00 §6 arc: Cauldron day 2, Mines day 3,
  //    Dungeon day 4), ~19 h AE. Cycle 2 runs ~2.2 days.
  //  - rankRef: on-screen idle ~10 min in (~2/s); rankTarget: idle at the first 100% Infamy
  //    (Lure ~18-20, ~60 pieces) is ~140-220/s, so Rank passes 40 in cycle 1 and the Tribute share
  //    sits at ~24% of 4 departments.
  econBase: 2.5e7,
  rankRef: 2,
  rankTarget: 100,

  commendations,
};
