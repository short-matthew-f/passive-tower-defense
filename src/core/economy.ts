// Suite-wide economy math (specs/00 §2, §3.1, §5.1, §7). Pure functions over the save,
// shared by the game and the headless balance simulation.
import { bannerId, ruinbornId } from './meta';
import { importAdd } from './goods';
import { edictOfflineAdd, edictTributeAdd, rushSeconds, trophyAdd } from './perks';
import type { DeptEcon } from './dept';
import { DEPT_ORDER, type DeptId, type DeptSave, type SaveRoot } from './types';

export const OFFLINE_BASE = 0.6;
export const OFFLINE_CAP_FACTOR = 0.9;
export const MAX_ELAPSED = 7 * 24 * 3600;
export const REBUILD_RUSH_S = 30 * 60;

const perk = (s: SaveRoot, id: string) => s.meta.dreadPerks[id] ?? 0;
const throne = (s: SaveRoot, id: string) => s.meta.throne[id] ?? 0;

/** Offline factor; pass the department to include Iron Discipline (the Edict, +0.1 there). The
 * 0.9 hard cap holds either way (00 §7). */
export function offlineFactor(s: SaveRoot, id?: DeptId): number {
  return Math.min(OFFLINE_CAP_FACTOR, OFFLINE_BASE + 0.05 * perk(s, 'empire.idleHands') + edictOfflineAdd(s, id));
}

/**
 * Base offline cap in hours (local income, Goods and Tribute alike).
 * Pass 7 (fun plan A4 / research R10): 8 h -> 24 h. A forgotten evening or a night's sleep is never
 * lost; Curfew Bells, Long Reach and Treasury Vaults stretch it past a day.
 */
export const OFFLINE_CAP_BASE_H = 24;

export function offlineCapSeconds(s: SaveRoot): number {
  return (OFFLINE_CAP_BASE_H + throne(s, 'curfewBells') + perk(s, 'empire.longReach')) * 3600;
}

/**
 * Fun plan A5, "your hands move the meter": local income earned by on-screen play (ctx.earn, not
 * the present-but-idle rate) counts x2 toward the economy gate. The bank gets the plain amount.
 */
export const ACTIVE_GATE_MULT = 2;

/**
 * Offline time fills the economy gate only up to this fraction of the floor (linear; ~99% Infamy
 * on the log bar), so a Legend is always one short visit away and the last push is the player's.
 * The "gate" Night Order (core/orders.ts) lifts the limit. Background departments while the player
 * is present count in full.
 */
export const OFFLINE_GATE_CAP = 0.9;

/** How much of an offline gate credit the economy gate may still take under `capFrac` x floor
 * (Infinity = no limit). Pure. */
export function offlineGateRoom(def: DeptEcon, d: DeptSave, capFrac = OFFLINE_GATE_CAP): number {
  if (!Number.isFinite(capFrac)) return Infinity;
  const room = capFrac * econFloor(def, d.cycle.n) - d.cycle.earnings;
  return Number.isFinite(room) ? Math.max(0, room) : 0;
}

/** The present-but-idle rule (00 §7): seconds of an offline credit a department gets when `live`
 * seconds of the same span were already paid to it on screen (one cap for both). */
export function offlineSecondsFor(elapsed: number, cap: number, live = 0): number {
  return Math.max(0, Math.min(elapsed, cap) - Math.max(0, live));
}

/** Whether the on-screen department may still earn while present but idle (00 §7): only inside
 * the offline cap, counted from the start of the idle span. */
export function idleEarnAllowed(idleSince: number, now: number, capSeconds: number): boolean {
  return (now - idleSince) / 1000 < capSeconds;
}

export function tributeCapSeconds(s: SaveRoot): number {
  return (OFFLINE_CAP_BASE_H + 2 * throne(s, 'treasury')) * 3600;
}

/** Temp multiplier: Rebuild Rush (x3 for 30 min after a Fall, +15 min per Swift Rebuild) or Late
 * Recruit (x2), never both. */
export function tempMult(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>, now: number): number {
  const d = s.depts[id];
  if (!d) return 1;
  // A future startedAt (clock corrected after a Fall) never stretches the Rush (save.repairClock).
  if (d.cycle.n > 0 && now >= d.cycle.startedAt && now - d.cycle.startedAt < rushSeconds(s) * 1000) return 3;
  if (lateRecruit(s, id, defs)) return 2;
  return 1;
}

/** Late Recruit state: `on` = x2 applies now; `done` = it can never apply again (latch). */
export function lateRecruitState(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>): { on: boolean; done: boolean } {
  const d = s.depts[id];
  if (!d) return { on: false, done: false };
  if (d.lateRecruitDone || d.cycle.n > 0) return { on: false, done: true };
  const others = DEPT_ORDER.filter((o) => o !== id && s.depts[o] && defs[o]);
  // Only a department unlocked after another one is a recruit (the first department never is).
  if (!others.some((o) => s.depts[o]!.unlockedAt < d.unlockedAt)) return { on: false, done: true };
  const avg = others.reduce((a, o) => a + rankEff(s, o, defs), 0) / others.length;
  const r = rank(s, id, defs);
  if (r < 0.6 * avg) return { on: true, done: false };
  // Reaching 60% of the average ends it for good; an all-zero average decides nothing yet.
  return { on: false, done: avg > 0 };
}

/** Late Recruit (00 §6): a newly unlocked department earns x2 until its Rank first reaches 60% of
 * the other departments' average, during its first cycle only. Latched by updateLateRecruit. */
function lateRecruit(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>): boolean {
  return lateRecruitState(s, id, defs).on;
}

/** Latches Late Recruit off once its end condition is met (game and sim checkProgress). */
export function updateLateRecruit(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>): void {
  const d = s.depts[id];
  if (d && !d.lateRecruitDone && lateRecruitState(s, id, defs).done) d.lateRecruitDone = true;
}

/** A department's idle rate, or 0 when its hook throws or returns NaN/Infinity: one broken
 * department never poisons Rank, Tribute or the peak rank of the suite. */
export function safeIdleRate(def: DeptEcon, d: DeptSave): number {
  try {
    const v = def.idleRate(d);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** Core multiplier (Throne group x Dread group x Goods group x temp), specs/00 §3.1. */
export function coreMult(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>, now: number): number {
  const throneGroup = 1 + 0.1 * throne(s, bannerId(id));
  const dreadGroup = 1 + 0.1 * perk(s, 'empire.ironFist') + 0.25 * perk(s, ruinbornId(id));
  const goodsGroup = 1 + importAdd(s.depts[id]); // <= +18%
  return throneGroup * dreadGroup * goodsGroup * tempMult(s, id, defs, now);
}

/**
 * Rank without temp multipliers so catch-up bonuses don't feed back into Tribute.
 * SIM-TUNED: Dark Banners (the Throne group) are left out too. Banners are bought with Tribute, so
 * counting them closed a Tribute -> Banner -> Rank -> Tribute loop (about 20 Banners per department
 * by day 7 in the balance sim). The Dread group stays: Dread isn't bought with Tribute. The Goods
 * group is left out for the same reason as Banners (the Black Market sells Goods for Tribute).
 */
export function rank(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>): number {
  const d = s.depts[id];
  const def = defs[id];
  if (!d || !def) return 0;
  const dreadGroup = 1 + 0.1 * perk(s, 'empire.ironFist') + 0.25 * perk(s, ruinbornId(id));
  const idle = safeIdleRate(def, d) * dreadGroup;
  if (!Number.isFinite(idle) || idle <= def.rankRef) return 0;
  const r = Math.floor((40 * Math.log10(idle / def.rankRef)) / Math.log10(def.rankTarget / def.rankRef));
  return Number.isFinite(r) ? Math.max(0, r) : 0;
}

export function rankEff(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>): number {
  const d = s.depts[id];
  if (!d) return 0;
  const peak = Number.isFinite(d.lifetime.peakRank) ? d.lifetime.peakRank : 0;
  return Math.max(rank(s, id, defs), Math.floor(0.6 * peak));
}

/** Tribute per second from one department. */
export function tributeRate(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>, onScreen: boolean): number {
  if (!s.depts[id]) return 0;
  const r = rankEff(s, id, defs);
  // Tribute group (00 §3.1): Tithe Collector + Dark Tithe (Edict) + Trophy Hall (<= +25%).
  const group = 1 + 0.15 * perk(s, 'empire.tithe') + edictTributeAdd(s) + trophyAdd(s);
  const perMin = 0.5 * (1 + r) ** 1.5 * group * (onScreen ? 1.5 : 1);
  const v = perMin / 60;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Economy floor growth per Fall (00 §8, anti-domination rule 4: spec seed x3).
 * SIM-TUNED x3 -> x2.5 (sim/README.md "Pass 5", floor-growth comparison): with each department's
 * long node (core/longnode.ts) income keeps growing through a cycle, and x2.5 is the only variant
 * that puts all seven departments' weeks 2-4 cycles inside 1.5-3 days (x3 left the War Pit at ~3.6)
 * while lifetime Dread stays inside the day-7 band (x2 overshot it) and no department passes 30%
 * of the Dread at day 30. Infamy 100-200% spans one more step of this factor.
 */
export const FLOOR_GROWTH = 2.5;

/** Per-department floor growth: the shipped FLOOR_GROWTH unless a balance-sim experiment overrides
 * it on the definition (DeptEcon.floorGrowth; the game never sets it). */
export const floorGrowth = (def: DeptEcon): number => def.floorGrowth ?? FLOOR_GROWTH;

export function econFloor(def: DeptEcon, n: number): number {
  return def.econBase * floorGrowth(def) ** n;
}

/** Infamy 0-200, specs/00 §2.2. */
export function infamy(def: DeptEcon, d: DeptSave): { value: number; skill: number; econ: number } {
  const n = d.cycle.n;
  const target = def.skillTarget(n);
  const floor = econFloor(def, n);
  const skillFrac = Math.min(1, d.cycle.heldLevel / target);
  const econFrac = Math.min(1, Math.log10(Math.max(1, d.cycle.earnings)) / Math.log10(floor));
  let value = 100 * Math.min(skillFrac, econFrac);
  if (skillFrac >= 1 && econFrac >= 1) {
    const t1 = def.skillTarget(n + 1);
    const skillOver = t1 === target ? 1 : (d.cycle.heldLevel - target) / (t1 - target);
    // 100% -> 200% spans one more floor step (x3 by default).
    const econOver = Math.log(d.cycle.earnings / floor) / Math.log(floorGrowth(def));
    value = 100 + 100 * Math.max(0, Math.min(1, skillOver, econOver));
  }
  return { value, skill: skillFrac, econ: econFrac };
}

/** Dread payout for a Fall, specs/00 §2.3. `bane` = that department's Legend's Bane level
 * (perks.legendsBane), +10% each. */
export function dreadPayout(d: DeptSave, infamyValue: number, crush: number, bane = 0): number {
  const n = d.cycle.n;
  const fresh = d.lifetime.falls === 0 ? 2 : 1;
  return Math.floor(
    10 * (1 + 0.5 * n) * (infamyValue / 100) ** 1.5 * fresh * (1 + 0.1 * Math.max(0, bane)) * (1 + Math.max(0, Math.min(0.25, crush))),
  );
}

export function commendationReward(i: number): number {
  return Math.round(25 * 1.3 ** i);
}
