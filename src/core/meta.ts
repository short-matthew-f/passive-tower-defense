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

/** Seal costs in Tribute (specs/00 §6). Departments not yet built show as Under Construction. */
export const SEAL_COST: Record<DeptId, number> = {
  cauldron: 0,
  mines: 60,
  dungeon: 400,
  bridge: 4000,
  styx: 25000,
  spire: 150000,
  pit: 600000,
};
export const SEAL_DREAD: Partial<Record<DeptId, number>> = { styx: 10, spire: 60, pit: 150 };
