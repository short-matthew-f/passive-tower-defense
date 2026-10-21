// The Dungeon: pure numbers and save state (specs/01). No Pixi imports, so the headless sim and a
// node balance script can load it.
//
// Deviations from the spec seeds (marked TUNED below; the spec says bands beat seeds). Measured with a
// greedy-builder bot and an active bot on the headless sim (scratch scripts, not shipped):
//  - New pieces of a kind cost x1.18 per copy already on the board (the spec has flat prices, which
//    let 60 Arrow Slits fill the floor for 1.5K Plunder in the first ten minutes).
//  - Lure price growth 1.45 -> 1.75 and hero HP growth 1.15 -> 1.16 per tier: with the raw seeds the
//    bot held Lure 14 after 30 min and Lure 17 on day 1 (first skill target is 15, first Fall ~day 4).
//    Now: Lure 5 ~12 min, Lure 8 at 30 min, 13 at end of day 1, 16 on day 2.
//  - Gong: at least 8 s between launches and the perfect-wave stack capped at +50% (spec +100%).
//    Unlimited ringing made active play 5-13x idle; now active ~2.4-2.5x on-screen idle (~4x offline).
//  - Glare: 40 dmg x the hero HP scale (so it stays a real verb at high Lure) x Gaze, and a 12 s
//    base cooldown (spec 20 s) so the primary active verb comes round often on a phone.
//  - The idle sim measures 10 consecutive parties (always one Champion party) on 2 seeds, run
//    synchronously and debounced 1.5 s after a change (spec: 300 s on 3 seeds in a Worker).

export type TowerKind = 'arrow' | 'brazier' | 'ballista';
export type LairKind = 'crypt' | 'ogre';
export type RuneKind = 'mire' | 'spikes';
export type PieceKind = TowerKind | LairKind | RuneKind;
export type HeroType = 'squire' | 'rogue' | 'knight' | 'champ';

export interface PieceSave {
  id: number;
  k: PieceKind;
  x: number;
  y: number;
  l: number; // level 1-10
  b: 0 | 1 | 2; // L5 branch (0 = none yet)
  inv: number; // Plunder invested (for refunds and blueprint value)
}

export interface Workshop {
  whet: number;
  necro: number;
  insc: number;
  slots: number;
  ledger: number;
  gaze: number;
}

export interface DStats {
  kills: number;
  placed: number;
  upgrades: number;
  branches: number;
  grabs: number;
  glares: number;
  glareKills: number;
  traps: number;
  gongs: number;
  bestGong: number;
  champs: number;
  thieves: number;
  recovered: number;
  escaped: number;
  detours: number;
  bestPieces: number;
}

export interface DungeonRun {
  bank: number;
  lure: number; // selected tier (free to change within lureMax)
  lureMax: number; // bought this cycle
  pieces: PieceSave[];
  nextId: number;
  chests: [number, number]; // 1 = Bait Chest placed at loop A / loop B
  ws: Workshop;
  stats: DStats;
  /** Lure tiers of Champions slain while leaks stayed under 20% (top 6, descending). */
  champs: number[];
  party: number; // parties launched this cycle (Champions every 10th)
  rev: number; // bumped on every change the idle sim depends on
}

export interface Ghost {
  k: PieceKind;
  x: number;
  y: number;
}

export interface DungeonPersistent {
  /** Live snapshot of this cycle's layout; becomes ghosts after a Fall. */
  bp: { cycle: number; pieces: Ghost[]; value: number };
  ghosts: Ghost[];
  bestLure: number; // highest tier ever bought (dial_raised lines)
}

// ---------- heroes (01 §5.1) ----------

export interface HeroDef {
  hp: number;
  spd: number;
  armor: number;
  b: number;
  atk: number; // dps against blockers
  dodge: number;
  name: string;
  short: string;
}

export const HEROES: Record<HeroType, HeroDef> = {
  squire: { hp: 20, spd: 1.0, armor: 0, b: 3, atk: 3, dodge: 0, name: 'Squire', short: 'SQ' },
  rogue: { hp: 14, spd: 1.8, armor: 0, b: 5, atk: 2, dodge: 0.3, name: 'Rogue', short: 'RG' },
  knight: { hp: 60, spd: 0.7, armor: 3, b: 8, atk: 5, dodge: 0, name: 'Knight', short: 'KN' },
  champ: { hp: 400, spd: 0.6, armor: 5, b: 60, atk: 14, dodge: 0, name: 'Champion', short: 'CH' },
};

export const ROGUE_LURE = 3;
export const KNIGHT_LURE = 5;
export const CHAMP_LURE = 1;
export const MAX_LURE = 40;
export const PARTY_EVERY = 12; // s
export const SPAWN_GAP = 0.8; // s between heroes of one party

export const hpScale = (T: number) => 1.16 ** T; // TUNED 1.15 -> 1.16
export const bountyScale = (T: number) => 1.17 ** T;
export const atkScale = (T: number) => 1.12 ** T;
export const heroArmor = (t: HeroType, T: number) => HEROES[t].armor + Math.floor(T / 10);
export const partySize = (T: number) => Math.min(12, 3 + Math.floor(T / 4));
export const isChampParty = (n: number, T: number) => T >= CHAMP_LURE && n % 10 === 9;
export const lureCost = (T: number) => 40 * LURE_GROWTH ** T; // price of tier T (TUNED 1.45 -> 1.75)
export const LURE_GROWTH = 1.75;

/** Steal on reaching the Hoard: min(4 x bounty (x5 Champions), 2% of unspent Plunder). */
export const stealBase = (t: HeroType, bounty: number) => 4 * bounty * (t === 'champ' ? 5 : 1);

// ---------- placeables (01 §5.2, §6A) ----------

export interface PieceDef {
  name: string;
  short: string;
  cost: number;
  slot: 'wall' | 'chamber' | 'path';
  branches: [string, string];
  branchDesc: [string, string];
}

export const PIECES: Record<PieceKind, PieceDef> = {
  arrow: { name: 'Arrow Slit', short: 'ARROW', cost: 25, slot: 'wall', branches: ['Crossbow', 'Barbed'], branchDesc: ['DMG X2.2 RATE X0.6', 'BLEED 2/S FOR 3S'] },
  brazier: { name: 'Flame Brazier', short: 'FLAME', cost: 60, slot: 'wall', branches: ['Wide Coals', 'White Fire'], branchDesc: ['RANGE +0.7', 'BURN X1.7'] },
  ballista: { name: 'Bone Ballista', short: 'BALLISTA', cost: 120, slot: 'wall', branches: ['Siege Bolt', 'Skewer'], branchDesc: ['DMG X2', 'PIERCE 5, RATE X1.25'] },
  crypt: { name: 'Skeleton Crypt', short: 'CRYPT', cost: 50, slot: 'chamber', branches: ['Bone Legion', 'Grave Knts'], branchDesc: ['+1 SKELETON', 'HP X2.5'] },
  ogre: { name: 'Ogre Den', short: 'OGRE', cost: 250, slot: 'chamber', branches: ['Bruiser', 'Bulwark'], branchDesc: ['DMG X1.7', 'BLOCKS 3, HP X1.5'] },
  mire: { name: 'Mire Rune', short: 'MIRE', cost: 40, slot: 'path', branches: ['Tar Pit', 'Sinkhole'], branchDesc: ['SLOW 55%', '8% TRAP 1.5S'] },
  spikes: { name: 'Spike Rune', short: 'SPIKES', cost: 70, slot: 'path', branches: ['Serrated', 'Quickset'], branchDesc: ['DMG X1.8', '5 CHARGES, 2S'] },
};

export const KIND_ORDER: PieceKind[] = ['arrow', 'brazier', 'ballista', 'crypt', 'ogre', 'mire', 'spikes'];
export const MAX_LEVEL = 10;
export const BRANCH_LEVEL = 5;
export const COPY_GROWTH = 1.18; // TUNED (see header)

export const levelMult = (l: number) => 1.22 ** (l - 1);
export const rangeBonus = (l: number) => 0.1 * Math.floor((l - 1) / 3);
/** Cost to go from level l to l + 1. */
export const levelCost = (k: PieceKind, l: number) => PIECES[k].cost * 1.6 ** l;
export const countKind = (r: DungeonRun, k: PieceKind) => r.pieces.reduce((a, p) => a + (p.k === k ? 1 : 0), 0);
export const placeCost = (r: DungeonRun, k: PieceKind) => PIECES[k].cost * COPY_GROWTH ** countKind(r, k);
export const runeCount = (r: DungeonRun) => r.pieces.reduce((a, p) => a + (PIECES[p.k].slot === 'path' ? 1 : 0), 0);
export const runeSlots = (r: DungeonRun) => 3 + r.ws.slots;
export const chestCost = (r: DungeonRun) => 80 * 2 ** (r.chests[0] + r.chests[1]);
export const SELL_REFUND = 0.8;
/** Refund for the most recently priced chest (80% of what the last one cost). */
export const chestRefund = (r: DungeonRun) => 80 * 2 ** Math.max(0, r.chests[0] + r.chests[1] - 1) * SELL_REFUND;
export const UNDO_S = 10;
export const SETTLE_S = 3;

// ---------- workshop (01 §6B) ----------

export interface WsDef {
  name: string;
  base: number;
  growth: number;
  max: number;
}

export const WS: Record<keyof Workshop, WsDef> = {
  whet: { name: 'Whetstones', base: 100, growth: 1.5, max: 25 },
  necro: { name: 'Necromancy', base: 150, growth: 1.55, max: 25 },
  insc: { name: 'Deep Inscription', base: 80, growth: 1.5, max: 25 },
  ledger: { name: 'Greedy Ledger', base: 200, growth: 1.7, max: 25 },
  gaze: { name: "Overlord's Gaze", base: 250, growth: 1.8, max: 20 },
  slots: { name: 'Rune Slots', base: 500, growth: 4, max: 5 },
};
export const wsCost = (k: keyof Workshop, n: number) => WS[k].base * WS[k].growth ** n;

export const towerMult = (w: Workshop) => 1 + 0.05 * w.whet;
export const summonMult = (w: Workshop) => 1 + 0.08 * w.necro;
export const runeMult = (w: Workshop) => 1 + 0.06 * w.insc;
export const plunderMult = (w: Workshop) => 1 + 0.04 * w.ledger;

// ---------- active verbs (01 §5.3) ----------

export const glareDamage = (w: Workshop, T: number) => 40 * hpScale(T) * (1 + 0.2 * w.gaze); // TUNED
export const glareCooldown = (w: Workshop) => Math.max(4, 12 - 0.5 * w.gaze); // TUNED
export const GLARE_SNAP = 14; // logical px around the touch
export const TRAP_OPEN = 2;
export const GRAB_BONUS = 0.1;
export const RECOVER_BONUS = 0.25;
export const COIN_LIFE = 1.5;
export const GONG_STEP = 0.1;
export const GONG_MAX = 5; // TUNED +100% -> +50% (with GONG_GAP, active lands ~2.5x on-screen idle)
/** Minimum seconds between party launches when ringing early (throughput at most 12/8 = 1.5x). */
export const GONG_GAP = 8;
/** Ledger-Bones throws bones from the Hoard: 1 dps, range 3 (starter kit). */
export const CLERK = { dmg: 1, rate: 1, range: 3 };

// ---------- defaults ----------

export function defaultStats(): DStats {
  return {
    kills: 0, placed: 0, upgrades: 0, branches: 0, grabs: 0, glares: 0, glareKills: 0, traps: 0, gongs: 0,
    bestGong: 0, champs: 0, thieves: 0, recovered: 0, escaped: 0, detours: 0, bestPieces: 0,
  };
}

export function defaultRun(): DungeonRun {
  return {
    bank: 100,
    lure: 0,
    lureMax: 0,
    pieces: [
      { id: 1, k: 'arrow', x: 2, y: 2, l: 1, b: 0, inv: 0 },
      { id: 2, k: 'arrow', x: 8, y: 8, l: 1, b: 0, inv: 0 },
    ],
    nextId: 3,
    chests: [0, 0],
    ws: { whet: 0, necro: 0, insc: 0, slots: 0, ledger: 0, gaze: 0 },
    stats: defaultStats(),
    champs: [],
    party: 0,
    rev: 0,
  };
}

export function defaultPersistent(): DungeonPersistent {
  return { bp: { cycle: 0, pieces: [], value: 0 }, ghosts: [], bestLure: 0 };
}

/** Fills fields missing from older saves (cheap; safe to call often). */
export function normalize(run: any, per: any): void {
  if (run && (run.stats === undefined || run.ws === undefined || run.pieces === undefined)) {
    const d = defaultRun();
    for (const k of Object.keys(d)) if (run[k] === undefined) run[k] = (d as any)[k];
  }
  if (run) {
    run.stats = { ...defaultStats(), ...run.stats };
    run.ws = { ...defaultRun().ws, ...run.ws };
  }
  if (per && (per.bp === undefined || per.ghosts === undefined)) Object.assign(per, { ...defaultPersistent(), ...per });
}

/** Leak gate (01 §7): the held signature level is the second-best Champion tier in the list. */
export const heldLure = (r: DungeonRun) => (r.champs.length >= 2 ? r.champs[1] : 0);
export function recordChamp(r: DungeonRun, T: number): void {
  r.champs.push(T);
  r.champs.sort((a, b) => b - a);
  if (r.champs.length > 6) r.champs.length = 6;
}

export const layoutValue = (r: DungeonRun) => r.pieces.reduce((a, p) => a + p.inv, 0);
