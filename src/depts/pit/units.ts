// The War Pit's roster, foods and rival archetypes (specs/07 §5). Pure data, no Pixi: the battle
// engine, the shop, the economy and the balance simulation all read this.

export type UnitId =
  | 'rat' | 'stirge' | 'piglet' | 'dung' | 'crow' | 'leech'
  | 'wolf' | 'spider' | 'rust' | 'ember' | 'mimic' | 'bat'
  | 'boar' | 'gorgon' | 'owlbear' | 'wasp'
  | 'manticore' | 'wyvern' | 'sabre' | 'gargoyle'
  | 'ogre' | 'hydra' | 'dragon'
  // Tokens (summoned in battle, never sold in the shop) and the boss.
  | 'ratling' | 'brood' | 'head' | 'shade' | 'hunt';

/** The 8 trigger glyphs of 07 §13 (plus 'none' for tokens). */
export type Trig = 'faint' | 'hurt' | 'start' | 'attack' | 'ko' | 'buy' | 'sell' | 'endshop' | 'ahead' | 'passive' | 'none';

export interface UnitDef {
  id: UnitId;
  name: string;
  tier: number;
  atk: number;
  hp: number;
  trig: Trig;
  /** Ability text at level L (3x5 font, uppercase, short). */
  text(L: number): string;
  /** Crest cost when it is a Bestiary unit (★). */
  crests?: number;
  token?: boolean;
  /** Shop-only trigger: no effect in Skirmishes (07 §13). */
  shopOnly?: boolean;
  /** Line-order heuristic for bots and rivals: higher = nearer the front. */
  front: number;
}

const U = (d: UnitDef) => d;

export const UNITS: Record<UnitId, UnitDef> = {
  rat: U({ id: 'rat', name: 'Gutter Rat', tier: 1, atk: 2, hp: 1, trig: 'faint', front: 3, text: (L) => `FAINT: SUMMON ${L} RATLING 1/1` }),
  stirge: U({ id: 'stirge', name: 'Stirge', tier: 1, atk: 1, hp: 2, trig: 'start', front: -2, text: (L) => `START: ${L} DMG TO A RANDOM ENEMY` }),
  piglet: U({ id: 'piglet', name: 'Tusk Piglet', tier: 1, atk: 2, hp: 2, trig: 'sell', front: 1, shopOnly: true, text: (L) => `SELL: +${L} CHOW` }),
  dung: U({ id: 'dung', name: 'Dung Beetle', tier: 1, atk: 2, hp: 1, trig: 'buy', front: 0, shopOnly: true, text: (L) => `BUY: 2 RANDOM FRIENDS +${L} ATK` }),
  crow: U({ id: 'crow', name: 'Carrion Crow', tier: 1, atk: 1, hp: 3, trig: 'ahead', front: -1, text: (L) => `FRIEND AHEAD FAINTS: +${L}/+${L}` }),
  leech: U({ id: 'leech', name: 'Bog Leech', tier: 1, atk: 1, hp: 3, trig: 'attack', front: 2, text: (L) => `BEFORE ATTACK: STEAL ${L} HP` }),
  wolf: U({ id: 'wolf', name: 'Dire Wolf', tier: 2, atk: 3, hp: 3, trig: 'ahead', front: -1, text: (L) => `FRIEND AHEAD ATTACKS: +${L} ATK` }),
  spider: U({ id: 'spider', name: 'Cave Spider', tier: 2, atk: 2, hp: 2, trig: 'faint', front: 3, text: (L) => `FAINT: SUMMON A ${2 * L}/${2 * L} BROOD` }),
  rust: U({ id: 'rust', name: 'Rust Beetle', tier: 2, atk: 2, hp: 4, trig: 'start', front: 2, text: (L) => `START: FRONT ENEMY -${2 * L} ATK, -1 ARMOR` }),
  ember: U({ id: 'ember', name: 'Ember Hound', tier: 2, atk: 3, hp: 2, trig: 'ko', front: 1, text: (L) => `KNOCKOUT: +${L}/+${L} FOR THE RUN` }),
  mimic: U({ id: 'mimic', name: 'Mimic', tier: 2, atk: 2, hp: 3, trig: 'faint', front: 2, crests: 2, text: () => 'FAINT: FRIEND BEHIND GETS A RANDOM ITEM' }),
  bat: U({ id: 'bat', name: 'Grave Bat', tier: 2, atk: 2, hp: 2, trig: 'faint', front: 1, crests: 3, text: (L) => `FAINT: ${L} DMG TO 2 RANDOM ENEMIES` }),
  boar: U({ id: 'boar', name: 'Tusk Boar', tier: 3, atk: 4, hp: 4, trig: 'hurt', front: 4, text: (L) => `HURT: +${2 * L} ATK (BATTLE)` }),
  gorgon: U({ id: 'gorgon', name: 'Gorgon Lizard', tier: 3, atk: 3, hp: 5, trig: 'start', front: 0, text: (L) => `START: TOP-ATK ENEMY SKIPS ${L} STRIKE${L > 1 ? 'S' : ''}` }),
  owlbear: U({ id: 'owlbear', name: 'Owlbear', tier: 3, atk: 5, hp: 5, trig: 'endshop', front: 1, shopOnly: true, text: (L) => `END OF SHOP: FRIEND AHEAD +${L}/+${L}` }),
  wasp: U({ id: 'wasp', name: 'Hive Wasp', tier: 3, atk: 1, hp: 4, trig: 'start', front: -1, crests: 4, text: (L) => `START: ALL FRIENDS GAIN THORNS ${L}` }),
  manticore: U({ id: 'manticore', name: 'Manticore', tier: 4, atk: 5, hp: 4, trig: 'start', front: -3, text: (L) => `START: ${3 * L} DMG TO 2 HIGHEST-HP ENEMIES` }),
  wyvern: U({ id: 'wyvern', name: 'Wyvern', tier: 4, atk: 5, hp: 5, trig: 'ko', front: 1, text: (L) => `KNOCKOUT: STRIKE AGAIN (${L}X PER BATTLE)` }),
  sabre: U({ id: 'sabre', name: 'Sabre Cat', tier: 4, atk: 6, hp: 3, trig: 'start', front: 0, text: (L) => `START: +${L} ATK PER EMPTY SLOT` }),
  gargoyle: U({ id: 'gargoyle', name: 'Gargoyle', tier: 4, atk: 3, hp: 8, trig: 'passive', front: 5, crests: 5, text: (L) => `TAKES -${L} DMG PER HIT (MIN 1)` }),
  ogre: U({ id: 'ogre', name: 'Bone Ogre', tier: 5, atk: 6, hp: 6, trig: 'faint', front: 3, text: (L) => `FAINT: SUMMON TWO ${L}/${L} RATLINGS` }),
  hydra: U({ id: 'hydra', name: 'Hydra', tier: 5, atk: 4, hp: 6, trig: 'faint', front: 3, crests: 7, text: (L) => `FAINT: SUMMON TWO ${3 * L}/${3 * L} HEADS` }),
  dragon: U({ id: 'dragon', name: 'Pit Dragon', tier: 5, atk: 6, hp: 8, trig: 'start', front: -2, crests: 9, text: (L) => `START: ${2 * L} DMG TO EVERY ENEMY` }),
  ratling: U({ id: 'ratling', name: 'Ratling', tier: 1, atk: 1, hp: 1, trig: 'none', front: 0, token: true, text: () => 'SUMMONED' }),
  brood: U({ id: 'brood', name: 'Brood', tier: 1, atk: 2, hp: 2, trig: 'none', front: 0, token: true, text: () => 'SUMMONED' }),
  head: U({ id: 'head', name: 'Hydra Head', tier: 1, atk: 3, hp: 3, trig: 'none', front: 0, token: true, text: () => 'SUMMONED' }),
  shade: U({ id: 'shade', name: 'Shade', tier: 1, atk: 1, hp: 1, trig: 'none', front: 0, token: true, text: () => 'A RESTLESS SPIRIT' }),
  hunt: U({ id: 'hunt', name: 'The Huntmaster', tier: 6, atk: 8, hp: 14, trig: 'start', front: -5, token: true, text: () => 'START: NETS YOUR TOP ATTACKER, BEASTS +1 ATK. ARMOR 2' }),
};

/** The 23 shop units, in tier order. */
export const ROSTER: UnitId[] = [
  'rat', 'stirge', 'piglet', 'dung', 'crow', 'leech',
  'wolf', 'spider', 'rust', 'ember', 'mimic', 'bat',
  'boar', 'gorgon', 'owlbear', 'wasp',
  'manticore', 'wyvern', 'sabre', 'gargoyle',
  'ogre', 'hydra', 'dragon',
];
/** The 6 Bestiary (★) units, in Crest-cost order. */
export const BESTIARY: UnitId[] = ROSTER.filter((id) => UNITS[id].crests).sort((a, b) => UNITS[a].crests! - UNITS[b].crests!);
/** The 17-unit starting pool. */
export const BASE_POOL: UnitId[] = ROSTER.filter((id) => !UNITS[id].crests);

// ---------- food and held items (07 §5.3) ----------

export type FoodId = 'haunch' | 'toy' | 'pudding' | 'collar' | 'lunch' | 'charm';
export type ItemId = 'toy' | 'collar' | 'charm';

export interface FoodDef {
  id: FoodId;
  name: string;
  tier: number;
  cost: number;
  held?: boolean;
  all?: boolean; // applies to every unit on buy
  text: string;
}

export const FOODS: Record<FoodId, FoodDef> = {
  haunch: { id: 'haunch', name: 'Raw Haunch', tier: 1, cost: 3, text: '+1/+1 PERMANENT' },
  toy: { id: 'toy', name: 'Chew Toy', tier: 1, cost: 3, held: true, text: 'HELD: FIRST HIT EACH BATTLE -2 DMG' },
  pudding: { id: 'pudding', name: 'Blood Pudding', tier: 2, cost: 3, text: '+3 HP PERMANENT' },
  collar: { id: 'collar', name: 'Spiked Collar', tier: 2, cost: 3, held: true, text: 'HELD: +3 ATK ON THE FIRST STRIKE' },
  lunch: { id: 'lunch', name: "Hero's Lunchbox", tier: 3, cost: 4, all: true, text: '+1/+1 TO EVERY UNIT' },
  charm: { id: 'charm', name: 'Bone Charm', tier: 4, cost: 3, held: true, text: 'HELD: ON FAINT, RETURN ONCE AT 1 HP' },
};
export const FOOD_LIST: FoodId[] = ['haunch', 'toy', 'pudding', 'collar', 'lunch', 'charm'];
export const HELD_POOL: ItemId[] = ['toy', 'collar', 'charm'];

// ---------- tiers by round, shop sizes (07 §5.1, §5.3) ----------

/** Highest unit tier in the shop at round r: T1 r1, T2 r2, T3 r4, T4 r6, T5 r8. */
export function maxTier(r: number): number {
  return r >= 8 ? 5 : r >= 6 ? 4 : r >= 4 ? 3 : r >= 2 ? 2 : 1;
}

/** Shop unit slots at round r (Pen Space: slot 4 from r3, slot 5 from r5). */
export function shopUnits(r: number, penSpace = 0): number {
  let n = r >= 8 ? 5 : r >= 5 ? 4 : 3;
  if (penSpace >= 1 && r >= 3) n = Math.max(n, 4);
  if (penSpace >= 2 && r >= 5) n = Math.max(n, 5);
  return n;
}

export function shopFoods(r: number): number {
  return r >= 3 ? 2 : 1;
}

// ---------- rival archetypes (07 §5.2) ----------

export type ArchId = 'ratcatcher' | 'falconer' | 'bulwark' | 'brawler' | 'hexer';

export interface ArchDef {
  id: ArchId;
  name: string;
  short: string;
  from: number; // first round seen
  bias: UnitId[];
  color: number; // collar colour
  foods: boolean; // buys food and held items
}

export const ARCHES: Record<ArchId, ArchDef> = {
  ratcatcher: { id: 'ratcatcher', name: 'Ratcatcher', short: 'RAT', from: 1, bias: ['rat', 'spider', 'ogre', 'hydra', 'crow'], color: 0x8a8a7a, foods: false },
  falconer: { id: 'falconer', name: 'Falconer', short: 'FAL', from: 1, bias: ['stirge', 'bat', 'manticore', 'dragon'], color: 0x4a9ad8, foods: false },
  bulwark: { id: 'bulwark', name: 'Bulwark', short: 'BUL', from: 2, bias: ['rust', 'gargoyle', 'wasp', 'leech'], color: 0x8a6a3a, foods: false },
  brawler: { id: 'brawler', name: 'Brawler', short: 'BRW', from: 3, bias: ['wolf', 'boar', 'wyvern', 'sabre', 'ember'], color: 0xd04a3a, foods: false },
  hexer: { id: 'hexer', name: 'Hexer', short: 'HEX', from: 4, bias: ['gorgon', 'mimic', 'owlbear'], color: 0x9a4ad8, foods: true },
};
export const ARCH_LIST: ArchId[] = ['ratcatcher', 'falconer', 'bulwark', 'brawler', 'hexer'];
