// The Dungeon's pure economy definition (no Pixi): the shared core and the headless balance
// simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { Commendation, DeptEcon, StewardCandidate } from '../../core/dept';
import { LONG_EFFECT, longLocked } from '../../core/longnode';
import type { DeptSave } from '../../core/types';
import { FLOORS } from './map';
import * as M from './model';
import { dungeonImports, idleOf, idleRateOf } from './sim';

const run = (s: DeptSave) => s.run as M.DungeonRun;
const per = (s: DeptSave) => s.persistent as M.DungeonPersistent;
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

/** Fills old-save gaps; false when there is no run yet. */
function ready(save: DeptSave): boolean {
  const r = run(save);
  if (!r) return false;
  if (!r.pieces || !r.ws || !r.stats || !Array.isArray(r.bait) || typeof r.floor !== 'number') M.normalize(r, save.persistent);
  return true;
}

const gridOf = (save: DeptSave) => M.gridOf(run(save), per(save));
const idleNow = (save: DeptSave) => idleRateOf(run(save), dungeonImports(save.imports), gridOf(save));

/**
 * Steward candidates (00 §5.2 m5): Workshop income and power nodes and plain piece levels. No
 * placeables, Dig, Bait Chests, Floors, Lure tiers, branch levels (they need a choice) or the
 * active-only Overlord's Gaze. deltaIdle is an estimate (the real idle rate is a 20 Hz sim run):
 * income nodes scale the rate exactly; power raises it only through fewer leaks or Cautious Mode
 * holding a higher tier, so it is weighted by how close the layout is to leaking.
 */
function steward(save: DeptSave): StewardCandidate[] {
  if (!ready(save)) return [];
  const r = run(save);
  const res = idleOf(r, dungeonImports(save.imports), gridOf(save));
  const idle = res.pps * M.greedMult(r.ws);
  if (!(idle > 0)) return [];
  // How much extra power is worth: little while the line holds easily, more near the 20% gate or
  // when Cautious Mode dropped below the selected Lure.
  const pressure = Math.min(0.6, 0.06 + 1.5 * res.leak + (res.tier < r.lure ? 0.3 : 0));
  let towerInv = 0;
  let lairInv = 0;
  let runeInv = 0;
  for (const p of r.pieces) {
    const v = p.inv + M.PIECES[p.k].cost;
    if (M.PIECES[p.k].slot === 'wall') towerInv += v;
    else if (M.PIECES[p.k].slot === 'chamber') lairInv += v;
    else runeInv += v;
  }
  const total = Math.max(1, towerInv + lairInv + runeInv);
  const out: StewardCandidate[] = [];
  const ws = (k: keyof M.Workshop, rel: number) => {
    const n = r.ws[k] ?? 0;
    if (n >= M.WS[k].max) return;
    out.push({
      id: `ws.${k}`,
      label: M.WS[k].name,
      cost: M.wsCost(k, n),
      deltaIdle: idle * rel,
      buy: () => {
        r.ws[k] = (r.ws[k] ?? 0) + 1;
        r.rev++;
      },
    });
  };
  ws('ledger', 0.04 / (1 + 0.04 * r.ws.ledger));
  if (!longLocked(save.cycle?.n ?? 0)) ws('greed', LONG_EFFECT - 1);
  ws('whet', pressure * (0.05 / (1 + 0.05 * r.ws.whet)) * (towerInv / total));
  ws('necro', pressure * (0.08 / (1 + 0.08 * r.ws.necro)) * (lairInv / total));
  ws('insc', pressure * (0.06 / (1 + 0.06 * r.ws.insc)) * (runeInv / total));
  for (const p of r.pieces) {
    if (p.l >= M.MAX_LEVEL || M.branchAt(p.l)) continue;
    const share = (p.inv + M.PIECES[p.k].cost) / total;
    const rel = p.k === 'greed' ? 0.05 * share * 0.5 : pressure * 0.22 * share;
    const id = p.id;
    out.push({
      id: `up.${p.id}`,
      label: `${M.PIECES[p.k].name} L${p.l + 1}`,
      cost: M.levelCost(p.k, p.l),
      deltaIdle: idle * rel,
      buy: () => {
        const q = r.pieces.find((x) => x.id === id);
        if (!q || q.l >= M.MAX_LEVEL || M.branchAt(q.l)) return;
        q.inv += M.levelCost(q.k, q.l);
        q.l++;
        r.stats.upgrades++;
        r.rev++;
      },
    });
  }
  return out;
}

export const dungeonEcon: DeptEcon = {
  id: 'dungeon',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  // On-screen idle rate: a headless 20 Hz sim of the layout (Cautious Mode), memoized by a
  // layout/upgrade/Lure/floor hash, so the per-frame HUD call is a lookup (sim.ts).
  idleRate(save) {
    if (!ready(save)) return 0;
    return idleNow(save);
  },

  // Bones (00 §4, 01 §16): 1 per 25 kills. Passive: the floor's idle kill rate (one party of
  // partySize every PARTY_EVERY s once the layout earns anything).
  goods: {
    id: 'bones',
    rate: (save) => {
      if (!ready(save)) return 0;
      if (!(idleNow(save) > 0)) return 0;
      return (M.partySize(run(save).lure ?? 0) * 3600) / M.PARTY_EVERY / 25;
    },
    count: (save) => (run(save)?.stats?.kills ?? 0) / 25,
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
  //  - 2.5e7 -> 3.5e7 (finish pass, 2026-10-21): with the suite's newer Dread/Tribute pacing the
  //    gate filled at ~15.6 h AE (day 3 18:00, under the 3-4 d arc band); 3.5e7 is back at ~19 h AE,
  //    day 4 08:00, cycle 2 ~2.2 days.
  //  - rankRef: on-screen idle ~10 min in (~2/s); rankTarget: idle at the first 100% Infamy
  //    (Lure ~18-20, ~60 pieces) is ~140-220/s, so Rank passes 40 in cycle 1 and the Tribute share
  //    sits at ~24% of 4 departments.
  econBase: 3.5e7,
  rankRef: 2,
  rankTarget: 100,

  commendations,

  // Gobbo's Satchel "Ready" list: the next Workshop levels, the next Lure tier, the cheapest piece
  // level, a Bait Chest while a loop is free, and the next Floor (the core keeps the affordable ones).
  readyBuys(save) {
    if (!ready(save)) return [];
    const r = run(save);
    const p = per(save);
    const out: { label: string; cost: number }[] = [];
    for (const k of ['whet', 'necro', 'insc', 'ledger', 'gaze', 'slots', 'greed'] as (keyof M.Workshop)[]) {
      if ((r.ws[k] ?? 0) >= M.WS[k].max || (k === 'greed' && longLocked(save.cycle?.n ?? 0))) continue;
      if (k === 'slots' && M.runeCount(r) < M.runeSlots(r)) continue;
      out.push({ label: M.WS[k].name, cost: M.wsCost(k, r.ws[k] ?? 0) });
    }
    if (r.lureMax < M.MAX_LURE) out.push({ label: `Lure ${r.lureMax + 1}`, cost: M.lureCost(r.lureMax + 1) });
    let cheap: M.PieceSave | null = null;
    for (const q of r.pieces) if (q.l < M.MAX_LEVEL && (!cheap || M.levelCost(q.k, q.l) < M.levelCost(cheap.k, cheap.l))) cheap = q;
    if (cheap) out.push({ label: `${M.PIECES[cheap.k].name} L${cheap.l + 1}`, cost: M.levelCost(cheap.k, cheap.l) });
    if (r.bait.length < gridOf(save).spots.length) out.push({ label: 'Bait Chest', cost: M.chestCost(r) });
    const nf = p?.floors ?? 1;
    if (nf < FLOORS.length) out.push({ label: FLOORS[nf].name, cost: FLOORS[nf].cost });
    return out.sort((a, b) => a.cost - b.cost).slice(0, 6);
  },

  stewardCandidates: steward,

  // Head Start (00 §2.5): the first 2L Lure tiers and 1 + L free Arrow Slits on the Cellar.
  applyHeadStart(save, level) {
    if (!ready(save)) return;
    M.applyHeadStart(run(save), level);
  },

  // Master Mason (00 §2.5): blueprints auto-rebuild at L1 as Plunder allows. The flag drives the
  // scene's rebuild; at cycle start it converts last cycle's layout and builds what the kit affords.
  signature: {
    name: 'Master Mason',
    desc: 'Blueprints auto-rebuild at L1 as Plunder allows',
    apply(save) {
      if (!ready(save)) return;
      const r = run(save);
      const p = per(save);
      M.normalize(r, p);
      p.mason = 1;
      M.startCycle(r, p, save.cycle?.n ?? 0);
      M.masonRebuild(r, p);
    },
  },
};
