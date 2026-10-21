// Throne upgrades (Tribute) and Dread perks, specs/00 §2.5 and §5.2. Pure data + cost functions.
import type { DeptId } from './types';

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  cost(level: number): number;
}

export const THRONE_UPGRADES: MetaUpgrade[] = [
  { id: 'curfewBells', name: 'Curfew Bells', desc: '+1h offline cap, every department', max: 8, cost: (l) => 600 * 2 ** l },
  { id: 'treasury', name: 'Treasury Vaults', desc: '+2h Tribute offline cap', max: 8, cost: (l) => 200 * 1.8 ** l },
];

export const bannerId = (d: DeptId) => `banner.${d}`;
export const BANNER = { max: 25, cost: (l: number) => 100 * 1.6 ** l, desc: '+10% income here' };

export const DREAD_PERKS: MetaUpgrade[] = [
  { id: 'empire.ironFist', name: 'Iron Fist', desc: '+10% all local income', max: Infinity, cost: (l) => 5 * 1.4 ** l },
  { id: 'empire.tithe', name: 'Tithe Collector', desc: '+15% Tribute', max: Infinity, cost: (l) => 6 * 1.45 ** l },
  { id: 'empire.longReach', name: 'Long Reach', desc: '+1h offline cap', max: 8, cost: (l) => 8 * 1.6 ** l },
  { id: 'empire.idleHands', name: 'Idle Hands', desc: '+0.05 offline rate', max: 6, cost: (l) => 10 * 1.7 ** l },
];

export const ruinbornId = (d: DeptId) => `${d}.ruinborn`;
export const RUINBORN = { max: 20, cost: (l: number) => 4 * 1.5 ** l, desc: '+25% income here' };

/** Seal costs in Tribute (specs/00 §6). Departments not yet built show as Under Construction.
 * SIM-TUNED (sim/README.md "Tuning log"): Dungeon 400 -> 2,500 and Bridge 4,000 -> 44,000. Tribute
 * runs ~10x the 00 §6 arc on day 1 (Rank 40 arrives within the first hour), so the provisional
 * prices opened the Dungeon at 10 active min and the Bridge at 45. Now the Dungeon opens at the
 * start of the second session (45 min; arc 40 +- 30) and the Bridge during the day-1 evening
 * session or at the next morning's (80-90 min; arc 105 +- 30, 00 §8 "Department 4 open <= 2 h").
 * Pass 3 (Styx and Spire built): Styx 25,000 -> 120,000 and Spire 150,000 -> 900,000. Lifetime Dread
 * (10 / 60) is met by day 2 / day 3, so Tribute binds: the Styx now opens on day 2 (12:30-18:00,
 * 1.5-1.75 d; it opened at the Bridge's moment, day 2 08:00, at 25K) and the Spire on day 4
 * (12:30-21:00, 3.5-3.9 d; it opened on day 3 at 150K). War Pit 600,000 -> 3,000,000 is provisional,
 * only to keep the ladder rising (the phantom-Seal sim variant pays it); the Pit's own pass sets it. */
export const SEAL_COST: Record<DeptId, number> = {
  cauldron: 0,
  mines: 60,
  dungeon: 2500,
  bridge: 44000,
  styx: 120000,
  spire: 900000,
  pit: 3000000,
};
export const SEAL_DREAD: Partial<Record<DeptId, number>> = { styx: 10, spire: 60, pit: 150 };
