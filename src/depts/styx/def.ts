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

  // Seeds from a greedy reference bot on model.ts (scripts/styx-bot.ts: casts at the best band,
  // ~85-90% hook rate, buys the best income per Obol, Wrath as soon as it pays):
  //  - Murk opens ~2 min in, Drowned Halls ~20-25 min, Wrath 5 (the first skill target, 363K
  //    Obols in all) ~2 h. Cycle earnings: ~0.2M at 1 h, ~0.66M at 2 h, ~1.27M at 3 h on screen.
  //    The Styx unlocks on day 2 (00 §6) and plays ~15-20 min a day beside six other departments,
  //    so offline income (idle ~35-70/s at 0.65) carries most of it: E0 = 1e6 (~2.7 h on-screen
  //    equivalent) puts the first Styx Fall about 2-3 days after its unlock.
  //  - rankRef: on-screen idle ~10 min into a cycle (6-8 netters, Murk open) is ~6-9/s.
  //  - rankTarget: idle at the first 100% Infamy (20 netters, Bigger Nets ~30, Wrath 5) is ~60/s.
  econBase: 1e6,
  rankRef: 6,
  rankTarget: 60,

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
