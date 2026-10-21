// The River Styx's pure economy definition (no Pixi): the shared core and the headless balance
// simulation read this; index.ts spreads it into the full DeptDef.
import type { DeptEcon } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import * as M from './model';

const run = (s: DeptSave) => s.run as M.StyxRun;
const per = (s: DeptSave) => s.persistent as M.StyxPersistent;
const stats = (s: DeptSave) => run(s).stats ?? M.defaultStats();

export const styxEcon: DeptEcon = {
  id: 'styx',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  idleRate(save) {
    const r = run(save);
    if (!r || !r.lv) return 0;
    return M.idleObols(r);
  },

  // Infamy skill gate (00 §2.2, 03 §7): land 20 souls at Wrath >= min(5 + 2N, 20) with <= 30%
  // escapes, including at least one rare or better, on screen.
  skillTarget: (n) => Math.min(5 + 2 * n, M.WRATH_MAX),
  skillLabel: (t) => `LAND ${M.GATE_LANDS} AT WRATH ${t}, 1 RARE`,

  // SIM-TUNED (sim/README.md "Pass 3"), against the balance sim's Styx adapter (sim/adapters/
  // styx.ts: the scene's catch loop ported headless, ~3.5 catches/min for the reference bot) in
  // the reference profile, where the Styx opens on day 2 and gets ~8 on-screen minutes a day
  // beside five other departments, so offline netters carry most of each cycle:
  //  - econBase 1e6 -> 1.2e8: at 1e6 the first Fall came 0.6-0.8 days after the unlock (day 3
  //    08:00, before the Mines); now it lands on day 5 (4.5-4.75 d), ~3 days after the unlock like
  //    the Dungeon and the Bridge. The skill gate (Wrath 5) fills on day 2-3; economy binds.
  //  - rankRef 6 -> 12: idle on the first visit (~14 netters, Bigger Nets ~10) is ~13/s.
  //  - rankTarget 60 -> 250: idle at the first 100% Infamy (20 netters, Bigger Nets 40, Longer
  //    Poles 4, Wrath 5-9) is ~250-280/s. At 6/60 the Styx sat at Rank 70-78 (28% of Tribute).
  econBase: 1.2e8,
  rankRef: 12,
  rankTarget: 250,

  commendations: [
    { id: 'first', label: 'FIRST SOUL LANDED', test: (s) => stats(s).lands >= 1 },
    { id: 'imp', label: 'HIRED AN IMP', test: (s) => (run(s).lv?.netter ?? 0) >= 1 },
    { id: 'murk', label: 'INTO THE MURK', test: (s) => (run(s).bands ?? 1) >= 2 },
    { id: 'rare', label: 'A RARE CATCH', test: (s) => stats(s).rares >= 1 },
    { id: 'combo', label: 'TEN IN A ROW', test: (s) => stats(s).bestCombo >= 10 },
    { id: 'codex', label: 'CODEX: 6 SPECIES', test: (s) => M.codexCount(per(s) ?? M.defaultPersistent()) >= 6 },
    { id: 'wrath', label: 'RIVER WRATH 3', test: (s) => (run(s).wrathMax ?? 0) >= 3 },
    { id: 'hundred', label: '100 SOULS LANDED', test: (s) => stats(s).lands >= 100 },
  ],
};
