// Suite-wide economy math (specs/00 §2, §3.1, §5.1, §7). Pure functions over the save,
// shared by the game and the headless balance simulation.
import { bannerId, ruinbornId } from './meta';
import type { DeptDef } from './dept';
import { DEPT_ORDER, type DeptId, type DeptSave, type SaveRoot } from './types';

export const OFFLINE_BASE = 0.6;
export const OFFLINE_CAP_FACTOR = 0.9;
export const MAX_ELAPSED = 7 * 24 * 3600;
export const REBUILD_RUSH_S = 30 * 60;

const perk = (s: SaveRoot, id: string) => s.meta.dreadPerks[id] ?? 0;
const throne = (s: SaveRoot, id: string) => s.meta.throne[id] ?? 0;

export function offlineFactor(s: SaveRoot): number {
  return Math.min(OFFLINE_CAP_FACTOR, OFFLINE_BASE + 0.05 * perk(s, 'empire.idleHands'));
}

export function offlineCapSeconds(s: SaveRoot): number {
  return (8 + throne(s, 'curfewBells') + perk(s, 'empire.longReach')) * 3600;
}

export function tributeCapSeconds(s: SaveRoot): number {
  return (8 + 2 * throne(s, 'treasury')) * 3600;
}

/** Temp multiplier: Rebuild Rush (x3 for 30 min after a Fall) or Late Recruit (x2), never both. */
export function tempMult(s: SaveRoot, id: DeptId, defs: Record<string, DeptDef>, now: number): number {
  const d = s.depts[id];
  if (!d) return 1;
  if (d.cycle.n > 0 && now - d.cycle.startedAt < REBUILD_RUSH_S * 1000) return 3;
  if (lateRecruit(s, id, defs)) return 2;
  return 1;
}

function lateRecruit(s: SaveRoot, id: DeptId, defs: Record<string, DeptDef>): boolean {
  const others = DEPT_ORDER.filter((o) => o !== id && s.depts[o] && defs[o]);
  if (!others.length) return false;
  const avg = others.reduce((a, o) => a + rankEff(s, o, defs), 0) / others.length;
  return rank(s, id, defs) < 0.6 * avg;
}

/** Core multiplier (Throne group x Dread group x temp), specs/00 §3.1. Goods arrive in v0.3. */
export function coreMult(s: SaveRoot, id: DeptId, defs: Record<string, DeptDef>, now: number): number {
  const throneGroup = 1 + 0.1 * throne(s, bannerId(id));
  const dreadGroup = 1 + 0.1 * perk(s, 'empire.ironFist') + 0.25 * perk(s, ruinbornId(id));
  return throneGroup * dreadGroup * tempMult(s, id, defs, now);
}

/** Rank without temp multipliers so catch-up bonuses don't feed back into Tribute. */
export function rank(s: SaveRoot, id: DeptId, defs: Record<string, DeptDef>): number {
  const d = s.depts[id];
  const def = defs[id];
  if (!d || !def) return 0;
  const throneGroup = 1 + 0.1 * throne(s, bannerId(id));
  const dreadGroup = 1 + 0.1 * perk(s, 'empire.ironFist') + 0.25 * perk(s, ruinbornId(id));
  const idle = def.idleRate(d) * throneGroup * dreadGroup;
  if (idle <= def.rankRef) return 0;
  return Math.max(0, Math.floor((40 * Math.log10(idle / def.rankRef)) / Math.log10(def.rankTarget / def.rankRef)));
}

export function rankEff(s: SaveRoot, id: DeptId, defs: Record<string, DeptDef>): number {
  const d = s.depts[id];
  if (!d) return 0;
  return Math.max(rank(s, id, defs), Math.floor(0.6 * d.lifetime.peakRank));
}

/** Tribute per second from one department. */
export function tributeRate(s: SaveRoot, id: DeptId, defs: Record<string, DeptDef>, onScreen: boolean): number {
  if (!s.depts[id]) return 0;
  const r = rankEff(s, id, defs);
  const perMin = 0.5 * (1 + r) ** 1.5 * (1 + 0.15 * perk(s, 'empire.tithe')) * (onScreen ? 1.5 : 1);
  return perMin / 60;
}

export function econFloor(def: DeptDef, n: number): number {
  return def.econBase * 3 ** n;
}

/** Infamy 0-200, specs/00 §2.2. */
export function infamy(def: DeptDef, d: DeptSave): { value: number; skill: number; econ: number } {
  const n = d.cycle.n;
  const target = def.skillTarget(n);
  const floor = econFloor(def, n);
  const skillFrac = Math.min(1, d.cycle.heldLevel / target);
  const econFrac = Math.min(1, Math.log10(Math.max(1, d.cycle.earnings)) / Math.log10(floor));
  let value = 100 * Math.min(skillFrac, econFrac);
  if (skillFrac >= 1 && econFrac >= 1) {
    const t1 = def.skillTarget(n + 1);
    const skillOver = t1 === target ? 1 : (d.cycle.heldLevel - target) / (t1 - target);
    const econOver = Math.log(d.cycle.earnings / floor) / Math.log(3);
    value = 100 + 100 * Math.max(0, Math.min(1, skillOver, econOver));
  }
  return { value, skill: skillFrac, econ: econFrac };
}

/** Dread payout for a Fall, specs/00 §2.3. */
export function dreadPayout(d: DeptSave, infamyValue: number, crush: number): number {
  const n = d.cycle.n;
  const fresh = d.lifetime.falls === 0 ? 2 : 1;
  return Math.floor(10 * (1 + 0.5 * n) * (infamyValue / 100) ** 1.5 * fresh * (1 + Math.max(0, Math.min(0.25, crush))));
}

export function commendationReward(i: number): number {
  return Math.round(25 * 1.3 ** i);
}
