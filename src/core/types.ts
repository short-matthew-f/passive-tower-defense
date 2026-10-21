// Save data model, following specs/00 §9.

export type DeptId = 'cauldron' | 'mines' | 'dungeon' | 'bridge' | 'styx' | 'spire' | 'pit';
export const DEPT_ORDER: DeptId[] = ['cauldron', 'mines', 'dungeon', 'bridge', 'styx', 'spire', 'pit'];
/** Cross-department Goods (specs/00 §4); data and rules live in core/goods.ts. */
export type GoodId = 'potions' | 'ingots' | 'bones' | 'contraband' | 'souls' | 'essence' | 'captives';

export interface Cycle {
  n: number; // prior Falls of this department
  startedAt: number;
  earnings: number; // this cycle's lifetime local earnings (offline included), economy gate
  heldLevel: number; // best signature level achieved this cycle (skill gate), ratchets
  legendWaiting: boolean;
}

export interface DeptSave<Run = any, Persistent = any> {
  v: number;
  unlockedAt: number;
  cycle: Cycle;
  lifetime: { peakRank: number; falls: number; best: Record<string, number> };
  imports: Record<string, number>; // import-node levels (core/goods.ts), persist across Falls
  persistent: Persistent;
  run: Run & { bank: number }; // bank = this department's local currency
  seen: Record<string, number>; // manager lines / onboarding steps already shown
}

export interface Settings {
  notation: 'suffix' | 'sci';
  haptics: boolean;
  sfx: number;
  chatter: 'full' | 'milestones' | 'off';
}

export interface LegendRecord {
  dept: DeptId;
  name: string;
  at: number;
}

export interface SaveRoot {
  schema: number;
  savedAt: number;
  lastSeen: number;
  meta: {
    tribute: number;
    tributePeak: number;
    tributeLifetime: number;
    dread: number;
    dreadLifetime: number;
    /** Goods stockpile (fractional internally; shown and spent as integers). */
    goods: Record<GoodId, number>;
    /** Black Market purchases on the current local day (price climbs +2% each). */
    market: { day: number; n: number };
    throne: Record<string, number>; // upgrade id -> level (banner.<dept> for banners)
    dreadPerks: Record<string, number>; // "empire.ironFist", "mines.ruinborn"
    commendations: Partial<Record<DeptId, number>>; // bitmask of paid commendations
    trophies: LegendRecord[];
    seen: Record<string, number>; // global onboarding flags
    settings: Settings;
  };
  depts: Partial<Record<DeptId, DeptSave>>; // absent = locked
}

export const SCHEMA = 1;

export function newSave(now: number): SaveRoot {
  return {
    schema: SCHEMA,
    savedAt: now,
    lastSeen: now,
    meta: {
      tribute: 0,
      tributePeak: 0,
      tributeLifetime: 0,
      dread: 0,
      dreadLifetime: 0,
      goods: { potions: 0, ingots: 0, bones: 0, contraband: 0, souls: 0, essence: 0, captives: 0 },
      market: { day: 0, n: 0 },
      throne: {},
      dreadPerks: {},
      commendations: {},
      trophies: [],
      seen: {},
      settings: { notation: 'suffix', haptics: true, sfx: 0.6, chatter: 'full' },
    },
    depts: {},
  };
}
