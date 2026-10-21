// The Cauldron's pure economy definition (no Pixi): the shared core and the headless balance
// simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { Commendation, DeptEcon, StewardCandidate } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import {
  defaultPersistent,
  defaultRun,
  dropsPerSec,
  fillRun,
  idleRateOf,
  lvOf,
  MALICE_MAX,
  maliceCost,
  upCost,
  UPGRADES,
  upLocked,
  type CPersistent,
  type CRun,
} from './econ';

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

/** Bile-priced run nodes that raise idleRate (the Steward's list and the Ready list). */
function idleNodes(s: DeptSave) {
  const r = run(s);
  if (!r?.lv) return [];
  return UPGRADES.filter((u) => !u.tokens && !u.activeOnly && !upLocked(u, s.cycle.n) && lvOf(r, u.id) < u.max);
}

const exotic = (s: DeptSave) => s.imports?.contraband ?? 0;

export const cauldronEcon: DeptEcon = {
  id: 'cauldron',
  version: 1,
  defaultRun,
  defaultPersistent,
  idleRate(save) {
    const r = save.run as CRun;
    if (!r || !r.lv) return 0;
    return idleRateOf(r, exotic(save));
  },
  // Potions (00 §4, 05 §16): 1 per Batch (active) and 1 per 3,000 toadling drops (passive).
  goods: {
    id: 'potions',
    rate: (save) => {
      const r = save.run as CRun;
      return r?.lv ? (dropsPerSec(r) * 3600) / 3000 : 0;
    },
    count: (save) => (stats(save).batches ?? 0) + (stats(save).drops ?? 0) / 3000,
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

  // ---------- advancement hooks (00 §2.5, §5.2) ----------

  /** Gobbo's Ready list: the next Malice level and the idle nodes, cheapest first. */
  readyBuys(save) {
    const r = run(save);
    if (!r?.lv) return [];
    const out = idleNodes(save).map((u) => ({ label: u.name, cost: upCost(u, lvOf(r, u.id)) }));
    if ((r.maliceBought ?? 0) < MALICE_MAX) out.push({ label: `Malice ${r.maliceBought + 1}`, cost: maliceCost(r.maliceBought) });
    return out.sort((a, b) => a.cost - b.cost).slice(0, 6);
  },

  /** The Steward: idle nodes only (no Malice levels, no active-only nodes, no Batch Tokens). */
  stewardCandidates(save) {
    const r = run(save);
    if (!r?.lv) return [];
    fillRun(r);
    const base = idleRateOf(r, exotic(save));
    return idleNodes(save).map((u): StewardCandidate => {
      const l = lvOf(r, u.id);
      const next = { ...r, lv: { ...r.lv, [u.id]: l + 1 } };
      return {
        id: u.id,
        label: u.name,
        cost: upCost(u, l),
        deltaIdle: idleRateOf(next, exotic(save)) - base,
        buy: () => {
          // The core already took the cost: only raise the level (never past max).
          if (lvOf(r, u.id) === l && l < u.max) r.lv[u.id] = l + 1;
        },
      };
    });
  },

  /** Head Start (00 §2.5): own the first 2L Malice levels and 1 + L free toadlings. Idempotent. */
  applyHeadStart(save, level) {
    const r = run(save);
    if (!r || level < 1) return;
    fillRun(r);
    r.maliceBought = Math.max(r.maliceBought, Math.min(MALICE_MAX, 2 * level));
    r.lv.hire = Math.max(lvOf(r, 'hire'), Math.min(7, 1 + level));
  },

  /** Granny's Book (00 §2.5): Mandrake and Splitroot are pre-unlocked. */
  signature: {
    name: "Granny's Book",
    desc: 'Mandrake & Splitroot unlocked',
    apply(save) {
      const r = run(save);
      if (!r) return;
      fillRun(r);
      r.lv.mandrake = Math.max(lvOf(r, 'mandrake'), 1);
      r.lv.splitroot = Math.max(lvOf(r, 'splitroot'), 1);
    },
  },
};

/** Persistent save helper for the scene (tokens, recipes, layouts). */
export const persistentOf = (s: DeptSave) => s.persistent as CPersistent;
