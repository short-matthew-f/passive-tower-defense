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
//  - Gong: Wave 1 made it Kingdom Rush's early call (see GONG_* below): at least 7 s between
//    launches, a bonus that shrinks as the timer runs down, and a small perfect-wave stack.
//    Unlimited ringing made active play 5-13x idle. (Pre-Wave 1: 8 s gap, five +8% rings.)
//  - Glare: 40 dmg x the hero HP scale (so it stays a real verb at high Lure) x Gaze, and a 12 s
//    base cooldown (spec 20 s) so the primary active verb comes round often on a phone.
//  - The idle sim measures 10 consecutive parties (always one Champion party) on 2 seeds, run
//    synchronously and debounced 1.5 s after a change (spec: 300 s on 3 seeds in a Worker).

import { LONG_GROWTH, LONG_MAX, longMult } from '../../core/longnode';
import { buildGrid, FLOORS, idx, isRuneTile, lairPost, tileKind, type DugTile, type Grid } from './map';

export type TowerKind = 'arrow' | 'brazier' | 'ballista' | 'eye';
export type LairKind = 'crypt' | 'slime' | 'ogre';
export type RuneKind = 'mire' | 'spikes' | 'greed' | 'confusion';
export type PieceKind = TowerKind | LairKind | RuneKind;
export type HeroType = 'squire' | 'rogue' | 'knight' | 'cleric' | 'wizard' | 'champ';

export interface PieceSave {
  id: number;
  k: PieceKind;
  x: number;
  y: number;
  l: number; // level 1-10
  b: 0 | 1 | 2; // L5 branch (0 = none yet)
  /** L10 branch (0 = none yet; older saves have none). */
  b2?: 0 | 1 | 2;
  inv: number; // Plunder invested (for refunds and blueprint value)
}

export interface Workshop {
  whet: number;
  necro: number;
  insc: number;
  slots: number;
  ledger: number;
  gaze: number;
  /** Hoard of Greed, the long node (core/longnode.ts): all Plunder x1.15 per level. */
  greed: number;
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
  dug: number;
  moved: number;
  dispels: number;
  greedKills: number;
  captured: number;
}

/** A stored layout of a floor that is not active (each floor keeps its own, 01 §6D). */
export interface FloorLayout {
  pieces: PieceSave[];
  bait: number[];
}

export interface DungeonRun {
  bank: number;
  lure: number; // selected tier (free to change within lureMax)
  lureMax: number; // bought this cycle
  pieces: PieceSave[];
  nextId: number;
  /** Tile indices of placed Bait Chests on the active floor (replaces the MVP's `chests` pair). */
  bait: number[];
  ws: Workshop;
  stats: DStats;
  /** Lure tiers of Champions slain while leaks stayed under 20% (top 6, descending). */
  champs: number[];
  party: number; // parties launched this cycle (Champions every 10th)
  rev: number; // bumped on every change the idle sim depends on
  /** Last idle-sim result and its layout hash (sim.ts idleOf): a reload or a queued re-run answers
   * from it at once (P-03). */
  idleMemo?: { key: string; pps: number; leak: number; tier: number };
  /** Active floor (0-2). */
  floor: number;
  /** Layouts of the other floors this cycle. */
  layouts: Record<string, FloorLayout>;
  /** Head Start free slits granted this cycle (idempotence). */
  hs: number;
}

export interface Ghost {
  k: PieceKind;
  x: number;
  y: number;
  /** Floor (older saves: 0). */
  f?: number;
}

export interface DungeonPersistent {
  /** Live snapshot of this cycle's layout; becomes ghosts after a Fall. */
  bp: { cycle: number; pieces: Ghost[]; value: number };
  ghosts: Ghost[];
  bestLure: number; // highest tier ever bought (dial_raised lines)
  /** Floors opened (1-3), kept across Falls. */
  floors: number;
  /** Dug tiles per floor, kept across Falls. */
  dug: Record<string, DugTile[]>;
  /** Master Mason signature owned (auto-rebuild blueprints at L1). */
  mason: number;
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
  cleric: { hp: 25, spd: 0.9, armor: 0, b: 7, atk: 2, dodge: 0, name: 'Cleric', short: 'CL' },
  wizard: { hp: 22, spd: 1.0, armor: 0, b: 9, atk: 3, dodge: 0, name: 'Wizard', short: 'WZ' },
  champ: { hp: 400, spd: 0.6, armor: 5, b: 60, atk: 14, dodge: 0, name: 'Champion', short: 'CH' },
};

export const ROGUE_LURE = 3;
export const KNIGHT_LURE = 5;
export const CLERIC_LURE = 8;
export const WIZARD_LURE = 12;
export const CHAMP_LURE = 1;
export const MAX_LURE = 40;
export const PARTY_EVERY = 12; // s
export const SPAWN_GAP = 0.8; // s between heroes of one party
/** Party weights (01 §5.1): Squire 50, Rogue 15, Knight 15, Cleric 10, Wizard 10, by unlock tier. */
export const HERO_WEIGHTS: [HeroType, number, number][] = [
  ['squire', 50, 0],
  ['rogue', 15, ROGUE_LURE],
  ['knight', 15, KNIGHT_LURE],
  ['cleric', 10, CLERIC_LURE],
  ['wizard', 10, WIZARD_LURE],
];
/** Hero types a tier unlocks (preview, lessons). */
export const NEW_HERO_AT: Partial<Record<number, HeroType>> = { [ROGUE_LURE]: 'rogue', [KNIGHT_LURE]: 'knight', [CLERIC_LURE]: 'cleric', [WIZARD_LURE]: 'wizard' };
/** Cleric: heals allies within 1.5 tiles for 4 HP/s (x the tier HP scale). */
export const CLERIC_HEAL = 4;
export const CLERIC_RANGE = 1.5;
/** Wizard: every 8 s disables the nearest rune within 3 tiles for 6 s. */
export const WIZ_EVERY = 8;
export const WIZ_RANGE = 3;
export const WIZ_OFF = 6;
/** Water lanes (Drowned Halls): Rogues run 1.3x. */
export const WATER_ROGUE = 1.3;

export const hpScale = (T: number) => 1.16 ** T; // TUNED 1.15 -> 1.16
export const bountyScale = (T: number) => 1.17 ** T;
export const atkScale = (T: number) => 1.12 ** T;
export const heroArmor = (t: HeroType, T: number) => HEROES[t].armor + Math.floor(T / 10);
export const partySize = (T: number) => Math.min(12, 3 + Math.floor(T / 4));
export const isChampParty = (n: number, T: number) => T >= CHAMP_LURE && n % 10 === 9;
export const lureCost = (T: number) => 40 * LURE_GROWTH ** T; // price of tier T (TUNED 1.45 -> 1.75)
export const LURE_GROWTH = 1.75;

/** Steal on reaching the Hoard: min(4 x bounty (x5 Champions), 2% of unspent Plunder). A looter
 * (Bait Chest purse pips, LOOT_*) wants more and may take a bigger share of the bank. */
export const stealBase = (t: HeroType, bounty: number, loot = 0) => 4 * bounty * (t === 'champ' ? 5 : 1) * (1 + LOOT_STEAL * loot);
/** The bank share a thief can carry: 2%, +1% per loot pip. */
export const stealCap = (bank: number, loot = 0) => (0.02 + 0.01 * loot) * Math.max(0, bank);

// ---------- Bait Chests: fatten, then feast (Wave 1, research R7) ----------
// Each Bait Chest holds one purse per party: the first hero who walks past it (Rogues ignore
// chests) grabs it and carries a gold-bag pip. A looter is worth more dead (bounty x(1 + LOOT_BONUS)
// per pip), but if he reaches the Hoard he wants LOOT_STEAL more per pip and can carry a bigger
// share of the bank, and an escape takes it all. So a chest right before the killbox is the high
// yield, high risk spot, and one deep in a safe loop is the cautious one.
// SIM-TUNED: +60% per pip keeps the Dungeon's first Fall on day 4 and active : idle in band (the idle
// sim and Cautious Mode play it too: it is a floor rule, not an active verb).
export const LOOT_BONUS = 0.6;
export const LOOT_STEAL = 1;

// ---------- placeables (01 §5.2, §6A) ----------

export interface PieceDef {
  name: string;
  short: string;
  cost: number;
  slot: 'wall' | 'chamber' | 'path';
  /** L5 branches. */
  branches: [string, string];
  branchDesc: [string, string];
  /** L10 branches. */
  branches2: [string, string];
  branchDesc2: [string, string];
  /** One-line role for the tray / lessons. */
  role: string;
}

export const PIECES: Record<PieceKind, PieceDef> = {
  arrow: { name: 'Arrow Slit', short: 'ARROW', cost: 25, slot: 'wall', role: 'SINGLE TARGET, RANGE 3', branches: ['Crossbow', 'Barbed'], branchDesc: ['DMG X2.2 RATE X0.6', 'BLEED 2/S FOR 3S'], branches2: ['Volley', 'Piercer'], branchDesc2: ['RATE X1.5', 'IGNORES ARMOR'] },
  brazier: { name: 'Flame Brazier', short: 'FLAME', cost: 60, slot: 'wall', role: 'BURNS ALL IN RANGE, NO ARMOR', branches: ['Wide Coals', 'White Fire'], branchDesc: ['RANGE +0.7', 'BURN X1.7'], branches2: ['Inferno', 'Cinders'], branchDesc2: ['BURN X1.4', 'SLOW 20% IN RANGE'] },
  ballista: { name: 'Bone Ballista', short: 'BALLISTA', cost: 120, slot: 'wall', role: 'PIERCING BOLT, RANGE 5', branches: ['Siege Bolt', 'Skewer'], branchDesc: ['DMG X2', 'PIERCE 5, RATE X1.25'], branches2: ['Bonebreak', 'Twin Bolt'], branchDesc2: ['DMG X1.5', 'RATE X1.6'] },
  eye: { name: 'Eye of Gloom', short: 'EYE', cost: 150, slot: 'wall', role: 'SLOW 25%, ROGUES CANNOT DODGE', branches: ['Dread Gaze', 'Searchlight'], branchDesc: ['SLOW 40%', 'RANGE +1'], branches2: ['Withering', 'Deep Gloom'], branchDesc2: ['+20% DMG TAKEN', 'SLOW +15% R+0.5'] },
  crypt: { name: 'Skeleton Crypt', short: 'CRYPT', cost: 50, slot: 'chamber', role: '2 SKELETONS BLOCK THE PATH', branches: ['Bone Legion', 'Grave Knts'], branchDesc: ['+1 SKELETON', 'HP X2.5'], branches2: ['Ossuary', 'Deathless'], branchDesc2: ['+1 SKELETON', 'RESPAWN X0.5'] },
  slime: { name: 'Slime Pit', short: 'SLIME', cost: 90, slot: 'chamber', role: 'SPLITS IN TWO ON DEATH', branches: ['Big Slime', 'Acid'], branchDesc: ['HP X2', 'DMG X2'], branches2: ['Mitosis', 'Glue'], branchDesc2: ['SPLITS IN THREE', 'BLOCKS 2'] },
  ogre: { name: 'Ogre Den', short: 'OGRE', cost: 250, slot: 'chamber', role: 'BLOCKS 2, CLEAVES', branches: ['Bruiser', 'Bulwark'], branchDesc: ['DMG X1.7', 'BLOCKS 3, HP X1.5'], branches2: ['Warlord', 'Ironhide'], branchDesc2: ['DMG X1.5 HP X1.3', 'HP X2'] },
  mire: { name: 'Mire Rune', short: 'MIRE', cost: 40, slot: 'path', role: 'SLOW 40% FOR 2S', branches: ['Tar Pit', 'Sinkhole'], branchDesc: ['SLOW 55%', '8% TRAP 1.5S'], branches2: ['Quagmire', 'Swallow'], branchDesc2: ['LASTS X1.6', 'TRAP CHANCE X2'] },
  spikes: { name: 'Spike Rune', short: 'SPIKES', cost: 70, slot: 'path', role: '8 DMG, 3 CHARGES', branches: ['Serrated', 'Quickset'], branchDesc: ['DMG X1.8', '5 CHARGES, 2S'], branches2: ['Impaler', 'Barbs'], branchDesc2: ['DMG X1.6', 'BLEED 3/S 3S'] },
  greed: { name: 'Greed Rune', short: 'GREED', cost: 100, slot: 'path', role: 'KILLS NEAR IT DROP +50%', branches: ['Gilded', 'Wide Greed'], branchDesc: ['BONUS X1.5', 'RADIUS 3'], branches2: ['Avarice', 'Midas'], branchDesc2: ['BONUS X1.3', 'RADIUS +1'] },
  confusion: { name: 'Confusion Rune', short: 'CONFUSE', cost: 150, slot: 'path', role: 'WALKS BACKWARD 1.5S', branches: ['Vertigo', 'Quick Wits'], branchDesc: ['LASTS 2.5S', 'COOLDOWN 6S'], branches2: ['Madness', 'Hex'], branchDesc2: ['LASTS X1.4', 'COOLDOWN X0.6'] },
};

/** Ordered for the balance bot's candidate list: the MVP kinds first (its tie-breaks), then the rest. */
export const KIND_ORDER: PieceKind[] = ['arrow', 'brazier', 'ballista', 'crypt', 'ogre', 'mire', 'spikes', 'eye', 'slime', 'greed', 'confusion'];
/** Tray tabs (01 §10: "Twr Sum Run Bait"). */
export const TABS: { id: string; label: string; kinds: (PieceKind | TrayExtra)[] }[] = [
  { id: 'tower', label: 'TOWER', kinds: ['arrow', 'brazier', 'ballista', 'eye'] },
  { id: 'lair', label: 'LAIR', kinds: ['crypt', 'slime', 'ogre'] },
  { id: 'rune', label: 'RUNE', kinds: ['mire', 'spikes', 'greed', 'confusion'] },
  { id: 'dig', label: 'DIG', kinds: ['chest', 'dig.w', 'dig.c', 'dig.p'] },
];
export type TrayExtra = 'chest' | 'dig.w' | 'dig.c' | 'dig.p';

export const MAX_LEVEL = 10;
export const BRANCH_LEVEL = 5;
export const BRANCH_LEVEL2 = 10;
export const COPY_GROWTH = 1.18; // TUNED (see header)
/** Re-buying a branch costs 50% of that branch level's price (01 §6A). */
export const SWAP_FRAC = 0.5;

export const levelMult = (l: number) => 1.22 ** (l - 1);
export const rangeBonus = (l: number) => 0.1 * Math.floor((l - 1) / 3);
/** Cost to go from level l to l + 1. */
export const levelCost = (k: PieceKind, l: number) => PIECES[k].cost * 1.6 ** l;
/** True when buying level l + 1 means choosing a branch. */
export const branchAt = (l: number) => l + 1 === BRANCH_LEVEL || l + 1 === BRANCH_LEVEL2;
/** Price to swap the L5 (which = 1) or L10 (which = 2) branch. */
export const swapCost = (k: PieceKind, which: 1 | 2) => SWAP_FRAC * levelCost(k, (which === 1 ? BRANCH_LEVEL : BRANCH_LEVEL2) - 1);
export const countKind = (r: DungeonRun, k: PieceKind) => r.pieces.reduce((a, p) => a + (p.k === k ? 1 : 0), 0);
export const placeCost = (r: DungeonRun, k: PieceKind) => PIECES[k].cost * COPY_GROWTH ** countKind(r, k);
export const runeCount = (r: DungeonRun) => r.pieces.reduce((a, p) => a + (PIECES[p.k].slot === 'path' ? 1 : 0), 0);
export const runeSlots = (r: DungeonRun) => 3 + r.ws.slots;
export const chestCost = (r: DungeonRun) => 80 * 2 ** r.bait.length;
export const SELL_REFUND = 0.8;
/** Refund for the most recently priced chest (80% of what the last one cost). */
export const chestRefund = (r: DungeonRun) => 80 * 2 ** Math.max(0, r.bait.length - 1) * SELL_REFUND;
export const UNDO_S = 10;
export const SETTLE_S = 3;
export const HOLD_MS = 300; // hold-to-drag on a placed piece (01 §11)

// ---------- runes (01 §5.2) ----------

export const GREED_BONUS = 0.5;
export const GREED_RADIUS = 2;
export const CONFUSE_S = 1.5;
export const CONFUSE_CD = 10;

// ---------- Dig and Floors (01 §6D) ----------

/** Dig: `50 x 1.35^k` (k = tiles dug so far on this floor, kept across Falls). */
export const digCost = (k: number) => 50 * 1.35 ** k;
export const floorBounty = (f: number) => FLOORS[f]?.bounty ?? 1;
export const dugOf = (per: DungeonPersistent | undefined, f: number): DugTile[] => per?.dug?.[f] ?? [];
export const gridOf = (r: DungeonRun, per: DungeonPersistent | undefined): Grid => buildGrid(r.floor ?? 0, dugOf(per, r.floor ?? 0));

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
  // The long node (sim/README.md "Pass 5"): opens after the 2nd Fall. SIM-TUNED base: ~2 h of a
  // later cycle's plateau idle (~900/s).
  greed: { name: 'Hoard of Greed', base: 5e5, growth: LONG_GROWTH, max: LONG_MAX },
};
/** Hoard of Greed milestone titles (one per 10 levels). */
export const GREED = ['COFFER', 'CHEST', 'STRONGBOX', 'VAULT', 'TREASURY', 'HOARD', 'MOUNTAIN'];
export const greedMult = (w: Workshop) => longMult(w.greed ?? 0);
export const wsCost = (k: keyof Workshop, n: number) => WS[k].base * WS[k].growth ** n;

export const towerMult = (w: Workshop) => 1 + 0.05 * w.whet;
export const summonMult = (w: Workshop) => 1 + 0.08 * w.necro;
export const runeMult = (w: Workshop) => 1 + 0.06 * w.insc;
export const plunderMult = (w: Workshop) => (1 + 0.04 * w.ledger) * greedMult(w);

// ---------- active verbs (01 §5.3) ----------

export const glareDamage = (w: Workshop, T: number) => 40 * hpScale(T) * (1 + 0.2 * w.gaze); // TUNED
export const glareCooldown = (w: Workshop) => Math.max(4, 12 - 0.5 * w.gaze); // TUNED
export const GLARE_SNAP = 14; // logical px around the touch
export const TRAP_OPEN = 2;
/** Coin taps no longer pay extra (Wave 1: the +10% tap was a chore, research R5 / fun review P7).
 * Tapping a coin still banks it at once; untouched coins walk in by themselves. */
export const GRAB_BONUS = 0;
export const RECOVER_BONUS = 0.25;
export const COIN_LIFE = 1.5;
// The Gong is Kingdom Rush's early call (Wave 1, research R5): it pulls the next party in now, on
// top of whatever is still walking. The earlier you ring (the more of the party timer is left) the
// bigger the called party's bonus, and the more of Glare's cooldown it skips; a really early call
// also banks the unused Trapdoor charge instead of resetting it. Unbroken (leak-free) calls still
// stack a smaller perfect-wave bonus, drawn as gong rings. The greed is real: an overlapping party
// that leaks steals, breaks the stack and (with a looter) takes a bigger bite.
// SIM-TUNED (balance sim, reference bot ringing as soon as the Gong lights): gap 7 s, +20% early,
// +2% per ring keeps active : on-screen idle at 2.13x (01 §3 band 1.8-2.2x), as before Wave 1. Gap
// 6 s measured 2.3-2.8x; gap 8 s leaves only a 4 s window for "how early".
export const GONG_STEP = 0.02; // was +8% per ring; the early part now carries most of the bonus
export const GONG_MAX = 5; // five rings: +10% from the stack
/** The early-call bonus at the very first moment the Gong lights (scales down to 0 at the bell). */
export const GONG_EARLY = 0.2;
/** Minimum seconds after a launch before the Gong lights (the party must also have filed in).
 * Throughput is at most 12/7 = 1.7x at the earliest call (was a flat 8 s gap). */
export const GONG_GAP = 7;
/** Share of Glare's remaining cooldown an earliest call skips (scaled by earliness). */
export const GONG_CD_CUT = 0.5;
/** Earliness at or above which an unused Trapdoor charge is banked (max TRAP_MAX). */
export const GONG_TRAP_F = 0.5;
export const TRAP_MAX = 2;
/** Earliness of a call right now: 1 at the moment the Gong lights, 0 at the natural bell. */
export const gongEarly = (partyTimer: number) => Math.max(0, Math.min(1, partyTimer / (PARTY_EVERY - GONG_GAP)));
/** The called party's bonus for a given stack (after this ring) and earliness. */
export const gongBonus = (stack: number, f: number) => GONG_STEP * Math.min(GONG_MAX, stack) + GONG_EARLY * f;
/** Ledger-Bones throws bones from the Hoard: 1 dps, range 3 (starter kit). */
export const CLERK = { dmg: 1, rate: 1, range: 3 };

// ---------- defaults ----------

export function defaultStats(): DStats {
  return {
    kills: 0, placed: 0, upgrades: 0, branches: 0, grabs: 0, glares: 0, glareKills: 0, traps: 0, gongs: 0,
    bestGong: 0, champs: 0, thieves: 0, recovered: 0, escaped: 0, detours: 0, bestPieces: 0, dug: 0, moved: 0,
    dispels: 0, greedKills: 0, captured: 0,
  };
}

export function defaultRun(): DungeonRun {
  return {
    bank: 100,
    lure: 0,
    lureMax: 0,
    pieces: FLOORS[0].starter.map(([x, y], i) => ({ id: i + 1, k: 'arrow' as const, x, y, l: 1, b: 0 as const, b2: 0 as const, inv: 0 })),
    nextId: FLOORS[0].starter.length + 1,
    bait: [],
    ws: { whet: 0, necro: 0, insc: 0, slots: 0, ledger: 0, gaze: 0, greed: 0 },
    stats: defaultStats(),
    champs: [],
    party: 0,
    rev: 0,
    floor: 0,
    layouts: {},
    hs: 0,
  };
}

export function defaultPersistent(): DungeonPersistent {
  return { bp: { cycle: 0, pieces: [], value: 0 }, ghosts: [], bestLure: 0, floors: 1, dug: {}, mason: 0 };
}

/** Fills fields missing from older saves (cheap; safe to call often). */
export function normalize(run: any, per: any): void {
  if (run && (run.stats === undefined || run.ws === undefined || run.pieces === undefined)) {
    const d = defaultRun();
    for (const k of Object.keys(d)) if (run[k] === undefined && k !== 'bait') run[k] = (d as any)[k];
  }
  if (run) {
    run.stats = { ...defaultStats(), ...run.stats };
    run.ws = { ...defaultRun().ws, ...run.ws };
    if (!Array.isArray(run.bait)) {
      // MVP saves: chests [loopA, loopB] on floor 0 -> the authored spots' tile indices.
      const spots = buildGrid(0).spots;
      const c = Array.isArray(run.chests) ? run.chests : [0, 0];
      run.bait = [0, 1].filter((i) => c[i]).map((i) => spots[i]);
      delete run.chests;
    }
    if (typeof run.floor !== 'number') run.floor = 0;
    if (!run.layouts || typeof run.layouts !== 'object') run.layouts = {};
    if (typeof run.hs !== 'number') run.hs = 0;
    for (const p of run.pieces) if (p.b2 === undefined) p.b2 = 0;
  }
  if (per) {
    if (per.bp === undefined || per.ghosts === undefined) Object.assign(per, { ...defaultPersistent(), ...per });
    if (typeof per.floors !== 'number') per.floors = 1;
    if (!per.dug || typeof per.dug !== 'object') per.dug = {};
    if (typeof per.mason !== 'number') per.mason = 0;
  }
}

/** Leak gate (01 §7): the held signature level is the second-best Champion tier in the list. */
export const heldLure = (r: DungeonRun) => (r.champs.length >= 2 ? r.champs[1] : 0);
export function recordChamp(r: DungeonRun, T: number): void {
  r.champs.push(T);
  r.champs.sort((a, b) => b - a);
  if (r.champs.length > 6) r.champs.length = 6;
}

/** Plunder in every floor's layout this cycle (blueprint value, starter kit). */
export const layoutValue = (r: DungeonRun) =>
  r.pieces.reduce((a, p) => a + p.inv, 0) + Object.values(r.layouts ?? {}).reduce((a, l) => a + l.pieces.reduce((b, p) => b + p.inv, 0), 0);

// ---------- placement rules (shared by the scene, the Steward and the balance bot) ----------

export const pieceAt = (r: DungeonRun, x: number, y: number) => r.pieces.find((p) => p.x === x && p.y === y);

/** Can a new `k` stand on (x, y) of grid `g`? */
export function validTile(g: Grid, r: DungeonRun, k: PieceKind, x: number, y: number): boolean {
  if (pieceAt(r, x, y)) return false;
  const slot = PIECES[k].slot;
  const kind = tileKind(g, x, y);
  if (slot === 'wall') return kind === 'wall';
  if (slot === 'chamber') return kind === 'chamber' && !!lairPost(g, x, y);
  return isRuneTile(g, x, y) && !r.bait.includes(idx(x, y));
}

/** Blueprint snapshot of every floor's layout this cycle. */
export function blueprint(r: DungeonRun, cycle: number): DungeonPersistent['bp'] {
  const pieces: Ghost[] = r.pieces.map((p) => ({ k: p.k, x: p.x, y: p.y, f: r.floor }));
  for (const [f, l] of Object.entries(r.layouts ?? {})) for (const p of l.pieces) pieces.push({ k: p.k, x: p.x, y: p.y, f: Number(f) });
  return { cycle, pieces, value: layoutValue(r) };
}

/**
 * Cycle start (01 §4, §7): last cycle's layout becomes ghosts and the starter kit adds 10% of its
 * value. Idempotent (runs once per cycle number). Returns true when it converted a blueprint.
 */
export function startCycle(r: DungeonRun, per: DungeonPersistent, n: number): boolean {
  const bp = per.bp;
  if (bp.cycle >= n) return false;
  const starter = (g: Ghost) => (g.f ?? 0) === 0 && FLOORS[0].starter.some(([x, y]) => g.x === x && g.y === y && g.k === 'arrow');
  const fresh = bp.pieces.filter((g) => !starter(g));
  const same = (a: Ghost, b: Ghost) => a.x === b.x && a.y === b.y && (a.f ?? 0) === (b.f ?? 0);
  const keep = per.ghosts.filter((g) => !fresh.some((f) => same(f, g)));
  per.ghosts = [...fresh, ...keep].slice(0, 200);
  if (bp.value > 0) r.bank += 0.1 * bp.value;
  per.bp = { cycle: n, pieces: [], value: 0 };
  return true;
}

/** Ghosts that can be rebuilt now on the active floor (in blueprint order). */
export function rebuildable(r: DungeonRun, per: DungeonPersistent): number[] {
  const g = gridOf(r, per);
  const out: number[] = [];
  per.ghosts.forEach((gh, i) => {
    if ((gh.f ?? 0) !== r.floor || !validTile(g, r, gh.k, gh.x, gh.y)) return;
    if (PIECES[gh.k].slot === 'path' && runeCount(r) >= runeSlots(r)) return;
    out.push(i);
  });
  return out;
}

/** Places ghost `i` at L1, paying from the bank. Returns the new piece or null. */
export function rebuildGhost(r: DungeonRun, per: DungeonPersistent, i: number): PieceSave | null {
  const gh = per.ghosts[i];
  if (!gh || (gh.f ?? 0) !== r.floor) return null;
  if (!validTile(gridOf(r, per), r, gh.k, gh.x, gh.y)) return null;
  if (PIECES[gh.k].slot === 'path' && runeCount(r) >= runeSlots(r)) return null;
  const cost = placeCost(r, gh.k);
  if (r.bank + 1e-9 < cost) return null;
  r.bank -= cost;
  const p: PieceSave = { id: r.nextId++, k: gh.k, x: gh.x, y: gh.y, l: 1, b: 0, b2: 0, inv: cost };
  r.pieces.push(p);
  r.stats.placed++;
  per.ghosts.splice(i, 1);
  r.rev++;
  return p;
}

/** Master Mason (00 §2.5): rebuild every affordable ghost at L1, in blueprint order. */
export function masonRebuild(r: DungeonRun, per: DungeonPersistent, max = 60): number {
  let built = 0;
  for (let guard = 0; guard < max; guard++) {
    const cand = rebuildable(r, per).find((i) => r.bank >= placeCost(r, per.ghosts[i].k));
    if (cand === undefined || !rebuildGhost(r, per, cand)) break;
    built++;
  }
  return built;
}

/** Head Start (00 §2.5): the first 2L Lure tiers and 1 + L free Arrow Slits. Idempotent. */
export function applyHeadStart(r: DungeonRun, L: number): void {
  if (!(L >= 1)) return;
  r.lureMax = Math.max(r.lureMax, Math.min(MAX_LURE, 2 * L));
  const want = Math.min(FLOORS[0].headStart.length, 1 + L);
  if ((r.hs ?? 0) >= want || r.floor !== 0) return;
  for (const [x, y] of FLOORS[0].headStart) {
    if ((r.hs ?? 0) >= want) break;
    if (pieceAt(r, x, y)) continue;
    r.pieces.push({ id: r.nextId++, k: 'arrow', x, y, l: 1, b: 0, b2: 0, inv: 0 });
    r.hs = (r.hs ?? 0) + 1;
  }
  r.rev++;
}

/** Saves the active floor's layout and loads floor `f` (free; 01 §6D one floor active at a time). */
export function switchFloor(r: DungeonRun, f: number): void {
  if (f === r.floor) return;
  r.layouts[r.floor] = { pieces: r.pieces, bait: r.bait };
  const next = r.layouts[f] ?? { pieces: [], bait: [] };
  delete r.layouts[f];
  r.pieces = next.pieces;
  r.bait = next.bait;
  r.floor = f;
  r.rev++;
}
