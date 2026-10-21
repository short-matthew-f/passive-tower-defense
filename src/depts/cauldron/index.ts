// The Cauldron (specs/05): idle plinko. Toadlings pour a constant rain of foul ingredients;
// the Overlord steers it by cursing pegs into Ladles and Tossing Granny's spoon down a chute.
import type { DeptDef } from '../../core/dept';
import { defaultPersistent, defaultRun, idleRateOf, type CRun } from './econ';
import { commendations, granny, onboarding } from './granny';
import { CauldronScene } from './scene';

export const cauldron: DeptDef = {
  id: 'cauldron',
  name: 'The Cauldron',
  currency: 'Bile',
  currencyColor: '#9ad43a',
  doorColor: 0x4a7a22,
  version: 1,
  defaultRun,
  defaultPersistent,
  idleRate(save) {
    const run = save.run as CRun;
    if (!run || !run.lv) return 0;
    return idleRateOf(run);
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
  manager: granny,
  onboarding,
  legend: {
    name: 'Dame Brightjaw the Unreasonably Tall',
    line: "I've come to scrub your pot, hag. With a sword.",
  },
  createScene: (ctx) => new CauldronScene(ctx),
};
