// The Goblin Mines' pure economy definition (no Pixi): the shared core and the headless
// balance simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { DeptEcon } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import * as M from './model';

const run = (s: DeptSave) => s.run as M.MinesRun;
const per = (s: DeptSave) => s.persistent as M.MinesPersistent;

export const minesEcon: DeptEcon = {
  id: 'mines',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  idleRate(save) {
    const r = run(save);
    const p = per(save);
    if (r.stats === undefined || p.drumOn === undefined) M.normalize(r, p);
    return M.idleNuggets(r, p);
  },

  // Infamy skill gate (00 §2.2, 02 §7): break 50 rocks at depth 30 + 5N, on screen.
  // SIM-TUNED: capped at the dial's max depth. Uncapped, Fall #7 asked for depth 65 on a 60-deep
  // shaft and the Mines stalled at 92% Infamy for good; capped, overflow comes from the economy
  // gate alone, as 00 §2.2 specifies for a capped dial.
  skillTarget: (n) => Math.min(30 + 5 * n, M.MAX_DEPTH),
  skillLabel: (t) => `BREAK ${M.GATE_ROCKS} ROCKS AT DEPTH ${t}`,

  // SIM-TUNED (sim/README.md "Tuning log"), drum-on reference bot:
  //  - econBase: the economy gate fills on the evening of day 2 (00 §6 wants day 3), with cycles
  //    of ~2 days after it. That is ~9 h active-equivalent, above the 3-4 h +- 1 h the 00 §8
  //    milestone states for the first (Cauldron) Fall: the night and day gaps add ~4 h AE a day at
  //    the Mines' ~4x active:offline ratio, so the arc day and the AE band can't both hold. Higher
  //    values reach day 3 but bring the later-cycle plateau stall (README tuning log) a Fall sooner.
  //  - rankRef: on-screen idle about 10 min into the crew build (~20/s).
  //  - rankTarget: idleRate at the first 100% Infamy (~2e5/s, near the maxed crew).
  econBase: 2.5e10,
  rankRef: 20,
  rankTarget: 2e5,

  commendations: [
    { id: 'firstRock', label: 'FIRST ROCK SMASHED', test: (s) => (run(s).stats?.rocks ?? 0) >= 1 },
    { id: 'hired', label: 'HIRED HELP', test: (s) => M.goblins(run(s)) >= 1 },
    { id: 'crunch', label: 'CRUNCH! 25 CRITS', test: (s) => (run(s).stats?.crits ?? 0) >= 25 },
    { id: 'geode', label: 'FIRST GEODE', test: (s) => (per(s).gemsEver ?? 0) >= 1 },
    { id: 'kaboom', label: 'KABOOM: 10 KEGS', test: (s) => (run(s).stats?.kegs ?? 0) >= 10 },
    { id: 'shiny', label: 'SHINY HUNTER: 50 VEINS', test: (s) => (run(s).stats?.veins ?? 0) >= 50 },
    { id: 'drum', label: 'FIRST DOOM DRUM BOOM', test: (s) => !!per(s).drum },
    { id: 'iron', label: 'INTO THE IRON: DEPTH 21', test: (s) => (s.lifetime.best.maxDepth ?? 1) >= 21 },
  ],
};
