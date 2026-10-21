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
  skillTarget: (n) => 30 + 5 * n,
  skillLabel: (t) => `BREAK ${M.GATE_ROCKS} ROCKS AT DEPTH ${t}`,

  // Seeds from a greedy 6 taps/s bot on the model.ts curves (Gems, kegs and the drum ignored):
  //  - earnings 6e6 at 2 h, 9e6 at 2.5 h, 1.3e7 at 3 h active. 00 §2.2 wants E0 reached about
  //    2.5 h active-equivalent into the first cycle, so E0 = 1e7 (x3 per Fall).
  //  - depth 30 (the first skill target) at ~3.3 h active. With ~90 min of attention on day 1
  //    split across departments and ~50 min/day after, plus offline income filling the economy
  //    gate, that lands the first Mines Fall on about day 3 (00 §6).
  //  - rankRef: on-screen idle about 10 min in (5-8 goblins at depth ~10-14) is ~25/s.
  //  - rankTarget: idle at the first 100% Infamy (depth ~30, tier 2-3, picks ~26) is ~1-3e3/s.
  econBase: 1e7,
  rankRef: 20,
  rankTarget: 1500,

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
