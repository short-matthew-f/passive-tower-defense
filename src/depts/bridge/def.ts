// The Troll Bridge's pure economy definition (no Pixi): the shared core and the headless balance
// simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { Commendation, DeptEcon } from '../../core/dept';
import { longLocked } from '../../core/longnode';
import type { DeptSave } from '../../core/types';
import * as M from './model';

const run = (s: DeptSave) => s.run as M.BridgeRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();
const lv = (s: DeptSave) => run(s).lv ?? M.defaultLevels();

export const commendations: Commendation[] = [
  { id: 'toll1', label: 'FIRST TOLL', test: (s) => st(s).tolls >= 1 },
  { id: 'goon', label: 'HIRED MUSCLE', test: (s) => lv(s).goons >= 1 },
  { id: 'unmask1', label: 'A HERO UNMASKED', test: (s) => st(s).unmasks >= 1 },
  { id: 'eels', label: 'PICKLED EELS SEIZED', test: (s) => st(s).confisc >= 1 },
  { id: 'big', label: 'BOUNTY X10', test: (s) => st(s).bounty10 >= 1 },
  { id: 'streak', label: 'STREAK OF 10', test: (s) => st(s).bestStreak >= 10 },
  { id: 'writs', label: 'WRITS PLEASE (MENACE 3)', test: (s) => (run(s).menaceMax ?? 0) >= 3 },
  { id: 'hundred', label: '100 TRAVELERS', test: (s) => st(s).travelers >= 100 },
  { id: 'bribe', label: 'NO BRIBE TOO SMALL', test: (s) => (st(s).bribes ?? 0) >= 1 },
];

/** Normalized run (old saves gain new fields); null before the department has a run. */
function norm(s: DeptSave): M.BridgeRun | null {
  const r = run(s);
  if (!r) return null;
  M.normalize(r, s.persistent);
  return r;
}

const nodeOpen = (s: DeptSave) => (id: keyof M.Levels) => id !== 'charter' || !longLocked(s.cycle?.n ?? 0);

export const bridgeEcon: DeptEcon = {
  id: 'bridge',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  idleRate(save) {
    const r = run(save);
    if (!r || !r.lv) return 0;
    return M.idleTollpence(r, save.imports?.bones ?? 0);
  },

  // Contraband (00 §4, 06 §16): each confiscation = 1 (active); goon crates (passive).
  goods: {
    id: 'contraband',
    rate: (save) => (run(save)?.lv ? M.crateContrabandPerH(run(save)) : 0),
    count: (save) => st(save).confisc,
  },

  // Infamy skill gate (00 §2.2, 06 §7): 5 evidence-backed Unmasks at Menace >= min(4 + 2N, 20).
  skillTarget: (n) => Math.min(4 + 2 * n, 20),
  skillLabel: (t) => `5 PROVEN UNMASKS AT MENACE ${t}`,

  // SIM-TUNED (sim/README.md "Tuning log"; the balance sim's reference bot, ~12 min a day of
  // Bridge attention in the 4-department schedule, unlocked at ~90 active min):
  //  - econBase 8e4 -> 1e7: 8e4 filled the economy gate within ~4 h AE and the Bridge fell first
  //    of all on day 2. 1e7 puts its first Fall on day 5 at 08:00 (after the Dungeon's day 4),
  //    with the skill gate (Menace 4) done on day 2-3.
  //  - rankRef 1 -> 2: on-screen idle ~10 min in (3 goons, little signage) is ~1.5-2/s.
  //  - rankTarget 6 -> 25: idle at the first 100% Infamy (Menace 7-9, signage ~20, pricing ~15) is
  //    ~20-30/s. At 6 the Bridge sat at Rank 80-95 and took ~35% of all Tribute; now ~23%.
  econBase: 1e7,
  rankRef: 2,
  rankTarget: 25,

  commendations,

  // ----- advancement hooks (00 §2.5, §5.2) -----

  readyBuys(save) {
    const r = norm(save);
    if (!r) return [];
    const open = nodeOpen(save);
    const out: { label: string; cost: number }[] = [];
    for (const id of Object.keys(M.NODES) as (keyof M.Levels)[]) {
      const L = r.lv[id] ?? 0;
      if (L >= M.NODES[id].max || !open(id)) continue;
      out.push({ label: M.NODE_NAMES[id], cost: M.nodeCost(id, L) });
    }
    if (r.menaceMax < M.MENACE_MAX) out.push({ label: `Menace ${r.menaceMax + 1}`, cost: M.menaceCost(r.menaceMax + 1) });
    return out.sort((a, b) => a.cost - b.cost);
  },

  // Only idle-raising levels; never Menace (a dial, 00 §5.2 m5). buy() only raises the level.
  stewardCandidates(save) {
    const r = norm(save);
    if (!r) return [];
    return M.stewardList(r, save.imports?.bones ?? 0, nodeOpen(save)).map((c) => ({
      id: c.id,
      label: M.NODE_NAMES[c.id],
      cost: c.cost,
      deltaIdle: c.deltaIdle,
      buy: () => {
        const L = r.lv[c.id] ?? 0;
        if (L < M.NODES[c.id].max) r.lv[c.id] = L + 1;
      },
    }));
  },

  applyHeadStart(save, level) {
    const r = norm(save);
    if (r) M.applyHeadStart(r, level);
  },

  signature: {
    name: 'Familiar Faces',
    desc: 'Start each cycle with Squint 2 and Wallet Sense 5',
    apply(save) {
      const r = norm(save);
      if (r) M.applyFamiliarFaces(r);
    },
  },
};
