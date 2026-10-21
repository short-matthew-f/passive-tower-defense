// Advancement extras (specs/00 §2.5 "Later", §5.2 "later" rows): the wings expansion, Gobbo's
// Satchel and the Steward, the Edict Board, the Trophy Hall and Throne cosmetics.
// Pure data + rules with no Pixi, shared by the game (core/economy.ts, core/game.ts) and, later,
// the headless balance sim. These lists are kept apart from THRONE_UPGRADES / DREAD_PERKS on
// purpose: the sim auto-buys everything in those two lists, and these must not change its output
// until the sim mirrors them (see the "SIM MIRROR" notes on each function).
import type { MetaUpgrade } from './meta';
import type { DeptId, DeptSave, SaveRoot } from './types';

const perk = (s: SaveRoot, id: string) => s.meta.dreadPerks[id] ?? 0;
const throne = (s: SaveRoot, id: string) => s.meta.throne[id] ?? 0;

// ---------- Dread tree, "Later" (00 §2.5) ----------

export const SWIFT_REBUILD_ID = 'empire.swiftRebuild';
export const CARAVAN_ID = 'empire.caravan';

/** Empire perks from the wings expansion (bought at the Altar beside DREAD_PERKS). */
export const LATER_PERKS: MetaUpgrade[] = [
  { id: SWIFT_REBUILD_ID, name: 'Swift Rebuild', desc: 'Rebuild Rush +15 min', max: 4, cost: (l) => 12 * 2 ** l },
  { id: CARAVAN_ID, name: 'Goods Caravan', desc: '+10% Goods trickle', max: 10, cost: (l) => 10 * 1.6 ** l },
];

export const headStartId = (d: DeptId) => `${d}.headStart`;
export const legendsBaneId = (d: DeptId) => `${d}.legendsBane`;
export const signatureId = (d: DeptId) => `${d}.signature`;

/** Per-department wing perks (Ruinborn lives in meta.ts). */
export const WING_PERKS = {
  headStart: { name: 'Head Start', max: 5, cost: (l: number) => 15 * 2.2 ** l, desc: (l: number) => `Start: dial ${2 * (l + 1)}, ${l + 2} helpers` },
  legendsBane: { name: "Legend's Bane", max: 5, cost: (l: number) => 20 * 2 ** l, desc: (_l: number) => '+10% Dread from Falls here' },
  signature: { name: 'Signature', max: 1, cost: (_l: number) => 40 },
} as const;

/** Rebuild Rush length in seconds: 30 min + 15 min per Swift Rebuild. SIM MIRROR: automatic
 * (economy.tempMult reads it). */
export function rushSeconds(s: SaveRoot): number {
  return (30 + 15 * perk(s, SWIFT_REBUILD_ID)) * 60;
}

/** Legend's Bane level for a department (+10% Dread per level, in economy.dreadPayout). */
export function legendsBane(s: SaveRoot, id: DeptId): number {
  return perk(s, legendsBaneId(id));
}

/** Goods Caravan level (+10% Goods trickle; adds into the Imperial Roads group in goods.ts). */
export function caravanLevel(s: SaveRoot): number {
  return perk(s, CARAVAN_ID);
}

export function headStartLevel(s: SaveRoot, id: DeptId): number {
  return perk(s, headStartId(id));
}

export function hasSignature(s: SaveRoot, id: DeptId): boolean {
  return perk(s, signatureId(id)) > 0;
}

// ---------- Throne extras (00 §5.2) ----------

export const SATCHEL_ID = 'satchel';
export const EDICT_BOARD_ID = 'edictBoard';
export const TROPHY_HALL_ID = 'trophyHall';

export const THRONE_EXTRAS: MetaUpgrade[] = [
  { id: SATCHEL_ID, name: "Gobbo's Satchel", desc: 'L1 Ready list, L2-3 Steward', max: 3, cost: (l) => 500 * 4 ** l },
  { id: TROPHY_HALL_ID, name: 'Trophy Hall', desc: '+1% Tribute per Legend, max 25%', max: 1, cost: () => 1500 },
  { id: EDICT_BOARD_ID, name: 'Edict Board', desc: 'One standing Edict, switch hourly', max: 1, cost: () => 2500 },
];

export const satchelLevel = (s: SaveRoot): number => throne(s, SATCHEL_ID);

/** Throne cosmetics: visual only (00 §5.2), drawn by scenes/throne.ts. */
export const COSMETICS: MetaUpgrade[] = [
  { id: 'cosmetic.braziers', name: 'Hellfire Braziers', desc: 'Green flames, two more braziers', max: 1, cost: () => 1_000 },
  { id: 'cosmetic.carpet', name: 'Gilded Carpet', desc: 'Gold-trimmed carpet with a skull', max: 1, cost: () => 10_000 },
  { id: 'cosmetic.guards', name: 'Minion Guards', desc: 'Two halberd minions by the throne', max: 1, cost: () => 100_000 },
  { id: 'cosmetic.throne', name: 'Obsidian Throne', desc: 'A taller throne with a crown of horns', max: 1, cost: () => 1_000_000 },
];
export const hasCosmetic = (s: SaveRoot, id: string): boolean => throne(s, id) > 0;

// ---------- Trophy Hall ----------

export const TROPHY_STEP = 0.01;
export const TROPHY_CAP = 0.25;

/** Tribute bonus from captured Legends: +1% each with the Trophy Hall, capped at +25%. SIM MIRROR:
 * automatic once the sim buys the Hall (economy.tributeRate reads it). */
export function trophyAdd(s: SaveRoot): number {
  if (throne(s, TROPHY_HALL_ID) <= 0) return 0;
  return Math.min(TROPHY_CAP, TROPHY_STEP * s.meta.trophies.length);
}

// ---------- Edict Board ----------

export type EdictId = 'darkTithe' | 'ironDiscipline' | 'fearItself';
export interface EdictState {
  id: EdictId;
  target?: DeptId;
  since: number; // ms epoch
}
export const EDICTS: Record<EdictId, { name: string; desc: string; targeted: boolean }> = {
  darkTithe: { name: 'Dark Tithe', desc: '+25% Tribute', targeted: false },
  ironDiscipline: { name: 'Iron Discipline', desc: '+0.1 offline rate here (max 0.9)', targeted: true },
  fearItself: { name: 'Fear Itself', desc: '+25% economy-gate progress here', targeted: true },
};
export const EDICT_ORDER: EdictId[] = ['darkTithe', 'ironDiscipline', 'fearItself'];
export const EDICT_SWITCH_MS = 60 * 60 * 1000;
export const DARK_TITHE = 0.25;
export const IRON_DISCIPLINE = 0.1;
export const FEAR_ITSELF = 1.25;

/** The standing Edict, or null without the Edict Board. */
export function activeEdict(s: SaveRoot): EdictState | null {
  if (throne(s, EDICT_BOARD_ID) <= 0) return null;
  const e = s.meta.edict;
  return e && EDICTS[e.id] ? e : null;
}

/** Ms until the Edict may change (0 = now). The first Edict is free to set at once. */
export function edictCooldown(s: SaveRoot, now: number): number {
  const e = s.meta.edict;
  if (!e) return 0;
  return Math.max(0, e.since + EDICT_SWITCH_MS - now);
}

export function setEdict(s: SaveRoot, id: EdictId, target: DeptId | undefined, now: number): boolean {
  if (throne(s, EDICT_BOARD_ID) <= 0 || edictCooldown(s, now) > 0) return false;
  if (EDICTS[id].targeted && !target) return false;
  const cur = s.meta.edict;
  if (cur && cur.id === id && cur.target === (EDICTS[id].targeted ? target : undefined)) return false;
  s.meta.edict = EDICTS[id].targeted ? { id, target, since: now } : { id, since: now };
  return true;
}

/** Dark Tithe: added into the Tribute group (economy.tributeRate). */
export function edictTributeAdd(s: SaveRoot): number {
  return activeEdict(s)?.id === 'darkTithe' ? DARK_TITHE : 0;
}

/** Iron Discipline: offline factor add for one department (economy.offlineFactor, still <= 0.9). */
export function edictOfflineAdd(s: SaveRoot, id: DeptId | undefined): number {
  const e = activeEdict(s);
  return id && e?.id === 'ironDiscipline' && e.target === id ? IRON_DISCIPLINE : 0;
}

/**
 * Fear Itself: "+25% economy-gate progress" for one department. Applied to what the gate counts:
 * local income credited to `cycle.earnings` counts x1.25 (the bank gets the normal amount). It is
 * deliberately not x1.25 on the log-scale gate fraction, which would cut the floor to floor^0.8
 * (about 25x less income) and undo the x3-per-Fall anti-farming rule (00 §8).
 * SIM MIRROR: sim credit() must add `amount * econGateMult(s, id)` to cycle.earnings.
 */
export function econGateMult(s: SaveRoot, id: DeptId): number {
  const e = activeEdict(s);
  return e?.id === 'fearItself' && e.target === id ? FEAR_ITSELF : 1;
}

// ---------- Gobbo's Satchel L2-L3: the Steward (00 §5.2, m5) ----------

/**
 * One thing the Steward may buy. Departments list these from `DeptDef.stewardCandidates`.
 * Exclusions are the department's job: never list consumables (bait), spatial items (placeables,
 * Dig, Bait Chests) or dial levels (00 §5.2 m5).
 */
export interface StewardCandidate {
  id: string;
  /** Short name for the report ("Toadling"). */
  label?: string;
  /** Price in the department's bank currency. */
  cost: number;
  /** Increase in `idleRate(save)` this purchase gives (same units as idleRate). */
  deltaIdle: number;
  /** Apply the purchase (raise the level). The core has ALREADY deducted `cost` from run.bank;
   * buy() must not spend again. Must be pure save mutation (no scene, no ctx). */
  buy(): void;
}

export interface StewardSetting {
  on: boolean;
  /** Fraction of the bank (at the start of each Steward pass) it never spends below: 0-0.9. */
  reserve: number;
  /** Unspent allowance (local currency) carried between passes: share x income accrued. */
  pool: number;
}

export const STEWARD_SHARE = [0, 0, 0.25, 0.5];
export const RESERVE_STEPS = [0, 0.25, 0.5, 0.75];

/** Share of each department's offline/background haul the Steward may spend (0 below Satchel 2). */
export function stewardShare(s: SaveRoot): number {
  return STEWARD_SHARE[Math.min(3, satchelLevel(s))] ?? 0;
}

export function stewardOn(s: SaveRoot, id: DeptId): boolean {
  return stewardShare(s) > 0 && !!s.meta.steward?.[id]?.on;
}

/** Best value first: deltaIdle / cost, dropping free, useless or broken entries. */
export function rankStewardCandidates(list: StewardCandidate[]): StewardCandidate[] {
  return list
    .filter((c) => Number.isFinite(c.cost) && c.cost > 0 && Number.isFinite(c.deltaIdle) && c.deltaIdle > 0)
    .sort((a, b) => b.deltaIdle / b.cost - a.deltaIdle / a.cost);
}

/**
 * Greedy Steward pass: repeatedly buys the best-ranked candidate that fits both the allowance
 * (`budget`) and the reserve floor (`floor`, absolute bank units), re-listing after every buy
 * because prices change. Returns what it spent and bought. SIM MIRROR: the sim's idle buyer should
 * call this with the same budget/floor during applyOffline and the off-screen 1 Hz tick.
 */
export function stewardSpend(
  d: DeptSave,
  candidates: () => StewardCandidate[],
  budget: number,
  floor: number,
  maxBuys = 100,
): { spent: number; bought: string[] } {
  let spent = 0;
  const bought: string[] = [];
  for (let i = 0; i < maxBuys; i++) {
    const left = budget - spent;
    if (!(left > 0)) break;
    const pick = rankStewardCandidates(candidates()).find((c) => c.cost <= left + 1e-9 && d.run.bank - c.cost >= floor - 1e-9);
    if (!pick) break;
    d.run.bank -= pick.cost;
    spent += pick.cost;
    pick.buy();
    bought.push(pick.label ?? pick.id);
  }
  return { spent, bought };
}

// ---------- Return rituals (00 §5.3) ----------

export const RITUAL_BONUS = 0.05;

/** Bonus for a finished ritual: 5% of the department's haul x the ritual's score (0-1). */
export function ritualBonus(haul: number, score: number): number {
  if (!(haul > 0)) return 0;
  return RITUAL_BONUS * haul * Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
}
