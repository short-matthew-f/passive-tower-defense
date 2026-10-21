// River Styx: pure numbers and state (specs/03). No Pixi imports: the economy definition
// (def.ts), the balance simulation and quick node scripts load this file on their own.
//
// Seeds follow 03 §5-§7. Changes for the MVP, marked TUNED:
//  - NET_YIELD: netters keep a fraction of a soul's ledger value (they net stragglers). It holds
//    on-screen active play at ~2.4-3x on-screen idle (03 §3) with the shipped catch loop.
//  - Netters reach a share of the *unlocked* depth (Longer Poles), as 03 §6.3 says, but every
//    band's value counts at its own band multiplier, so idle grows with each band unlock.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Behavior = 'drift' | 'zigzag' | 'heavy' | 'circle' | 'twin' | 'teleport' | 'sinker' | 'singer' | 'king' | 'echo';
export type BaitId = 'worm' | 'promise' | 'debt' | 'gilded';

export interface Species {
  id: string;
  name: string;
  band: number; // -1 = any band (Hero's Echo)
  rarity: Rarity;
  base: number; // Obols (Hero's Echo: 50x the band's common, see soulBase)
  pull: number; // tension %/s added while holding during a thrash
  thrashes: number;
  speed: number; // drift px/s (spec px)
  behavior: Behavior;
  note: string; // Codex line, <= 30 chars
}

export const BAND_PX = 60;
export const MAX_BANDS = 3; // MVP: Shallows, Murk, Drowned Halls (03 §15)
export const SINK_PX_S = 40;

export const BANDS = [
  { id: 'shallows', name: 'SHALLOWS', cost: 0, mult: 1 },
  { id: 'murk', name: 'MURK', cost: 500, mult: 4 },
  { id: 'halls', name: 'DROWNED HALLS', cost: 12_000, mult: 16 },
];

export const SPECIES: Species[] = [
  { id: 'clerk', name: 'Wailing Clerk', band: 0, rarity: 'common', base: 10, pull: 30, thrashes: 1, speed: 12, behavior: 'drift', note: 'STILL FILING. FOREVER.' },
  { id: 'tourist', name: 'Lost Tourist', band: 0, rarity: 'uncommon', base: 25, pull: 40, thrashes: 2, speed: 18, behavior: 'zigzag', note: 'ASKED FOR DIRECTIONS. ONCE.' },
  { id: 'knight', name: 'Drowned Knight', band: 0, rarity: 'rare', base: 120, pull: 60, thrashes: 4, speed: 10, behavior: 'heavy', note: 'SANK IN FULL PLATE. PROUD.' },
  { id: 'poet', name: 'Bog Poet', band: 1, rarity: 'common', base: 40, pull: 35, thrashes: 2, speed: 15, behavior: 'circle', note: 'RHYMES MURK WITH MURK.' },
  { id: 'wraiths', name: 'Twin Wraiths', band: 1, rarity: 'uncommon', base: 100, pull: 45, thrashes: 3, speed: 22, behavior: 'twin', note: 'TWO BITES. HOOK BOTH.' },
  { id: 'witch', name: 'Moon Witch', band: 1, rarity: 'rare', base: 500, pull: 70, thrashes: 5, speed: 20, behavior: 'teleport', note: 'BLINKS AWAY MID-REEL.' },
  { id: 'bishop', name: 'Sunken Bishop', band: 2, rarity: 'common', base: 160, pull: 40, thrashes: 2, speed: 10, behavior: 'sinker', note: 'SINKS IF YOU LET GO.' },
  { id: 'choir', name: 'Choirboy Shade', band: 2, rarity: 'uncommon', base: 400, pull: 50, thrashes: 3, speed: 16, behavior: 'singer', note: 'SINGS FAKE BITES.' },
  { id: 'king', name: 'Drowned King', band: 2, rarity: 'rare', base: 2000, pull: 80, thrashes: 6, speed: 12, behavior: 'king', note: 'LONG THRASHES. LONG REIGN.' },
  { id: 'echo', name: "Hero's Echo", band: -1, rarity: 'legendary', base: 0, pull: 90, thrashes: 8, speed: 25, behavior: 'echo', note: 'A HERO, ONCE. GOLD NOW.' },
];
export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
export const COMMON_BASE = [10, 40, 160];

export const RARITY_W: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 4.7, legendary: 0.3 };
const RARITY_MULT: Record<Rarity, number> = { common: 1, uncommon: 2.5, rare: 12, legendary: 50 };
export const RARE_PLUS = (r: Rarity) => r === 'rare' || r === 'legendary';

/** Ledger value of one soul of this species caught in `band` (Hero's Echo = 50x the band common). */
export function soulBase(sp: Species, band: number): number {
  return sp.rarity === 'legendary' ? 50 * COMMON_BASE[band] : sp.base;
}

export function speciesFor(band: number, rarity: Rarity): Species {
  if (rarity === 'legendary') return SPECIES_BY_ID.echo;
  return SPECIES.find((s) => s.band === band && s.rarity === rarity)!;
}

// ---------- baits (03 §5.3; stock persists through Falls) ----------

export const BAITS: Record<BaitId, { name: string; short: string; cost: number; pack: number; desc: string }> = {
  worm: { name: 'Worm of Regret', short: 'WORM', cost: 0, pack: 0, desc: 'FREE. DOES NOTHING SPECIAL' },
  promise: { name: 'Broken Promise', short: 'PROMISE', cost: 20, pack: 10, desc: '+50% UNCOMMON BITES' },
  debt: { name: 'Unpaid Debt', short: 'DEBT', cost: 200, pack: 10, desc: '+100% RARE BITES, MURK+' },
  gilded: { name: 'Gilded Obol', short: 'GILDED', cost: 1000, pack: 5, desc: '+100% OBOLS PER CATCH' },
};
export const BAIT_ORDER: BaitId[] = ['worm', 'promise', 'debt', 'gilded'];

// ---------- upgrades (03 §6) ----------

export interface NodeDef {
  base: number;
  growth: number;
  max: number;
}
export const NODES = {
  reel: { base: 15, growth: 1.15, max: 50 },
  line: { base: 40, growth: 1.18, max: 40 },
  steady: { base: 60, growth: 1.2, max: 30 },
  strike: { base: 100, growth: 1.25, max: 20 },
  barb: { base: 500, growth: 1.35, max: 20 },
  lantern: { base: 80, growth: 1.22, max: 25 },
  scent: { base: 300, growth: 1.3, max: 25 },
  wispnet: { base: 200, growth: 1.25, max: 20 },
  netter: { base: 50, growth: 1.28, max: 20 },
  nets: { base: 150, growth: 1.2, max: 40 },
  poles: { base: 1000, growth: 1.6, max: 4 },
} satisfies Record<string, NodeDef>;
export type NodeId = keyof typeof NODES;
export type Levels = Record<NodeId, number>;

export const nodeCost = (id: NodeId, lvl: number) => NODES[id].base * NODES[id].growth ** lvl;

export function defaultLevels(): Levels {
  return { reel: 0, line: 0, steady: 0, strike: 0, barb: 0, lantern: 0, scent: 0, wispnet: 0, netter: 0, nets: 0, poles: 0 };
}

// ---------- Wrath (03 §7) ----------

export const WRATH_MAX = 20;
export const wrathCost = (level: number) => 1000 * 3 ** level; // price of buying level `level`
export const wrathActive = (w: number) => 1.12 ** w;
export const wrathIdle = (w: number) => 1.1 ** w;
export const wrathPull = (w: number) => 1.08 ** w;
export const wrathThrashes = (w: number) => Math.floor(w / 3);
export const fakeChance = (w: number) => Math.min(0.6, 0.3 + 0.05 * w);

// ---------- Infamy skill gate (00 §2.2) ----------

export const GATE_LANDS = 20;
/** Escapes allowed while landing 20 souls with <= 30% escapes: e / (20 + e) <= 0.3. */
export const GATE_ESC = Math.floor((0.3 * GATE_LANDS) / 0.7);

// ---------- derived numbers ----------

/** Reel speed in spec px/s while holding below the red. */
export const reelSpeed = (lv: number) => 16 * (1 + 0.08 * lv);
/** Tension rise while holding (%/s), before thrashes; Braided Line spreads it over a bigger cap. */
export const REEL_RISE = 32;
export const lineCap = (lv: number) => 1 + 0.06 * lv;
/** Tension drain on release, %/s (2x the rise, +5% per Steady Hand). */
export const drainRate = (lv: number) => 2 * REEL_RISE * (1 + 0.05 * lv);
export const hookWindowMs = (strike: number, w: number) => Math.max(250, (600 + 40 * strike) * 0.97 ** w);
export const barbChance = (lv: number) => 0.015 * lv;
/** Mean seconds from the hook settling to a soul starting to nibble. */
export const biteWait = (lantern: number) => Math.max(1, 4.5 * 0.96 ** lantern);
export const scentMult = (lv: number) => 1.04 ** lv;
export const wispMult = (lv: number) => 1 + 0.2 * lv;
export const wispEvery = (lv: number) => 10 / (1 + 0.05 * lv);
export const comboMult = (streak: number) => 1 + 0.05 * Math.min(streak, 20);

export const PILK_NETTERS = 30 / 45; // Pilk's skiff: 1 soul / 45 s, in netter-equivalents
export const NET_S = 30; // one soul per 30 s per netter
export const NET_YIELD = 0.65; // TUNED: share of ledger value the netters' stragglers fetch (balance sim pass 3: kept, 2.5-2.7x on screen at baseline)
export const netMult = (lv: number) => 1 + 0.1 * lv;
export const poleFrac = (lv: number) => Math.min(0.6, 0.2 + 0.1 * lv);

export interface Weights {
  common: number;
  uncommon: number;
  rare: number;
  legendary: number;
}

/** Bait Brews (Potions import, 00 §4): every bait's effect +10% per level. */
export const brewPotency = (brew: number) => 1 + 0.1 * Math.max(0, Math.min(3, brew));
/** Gilded Obol payout multiplier (x2, its +100% scaled by Bait Brews). */
export const gildedMult = (brew = 0) => 1 + brewPotency(brew);
/** Debt Collectors (Contraband import, 00 §4): Unpaid Debt bait -15% per level. */
export function baitCost(id: BaitId, collectors = 0): number {
  const c = BAITS[id].cost;
  return id === 'debt' ? Math.ceil(c * (1 - 0.15 * Math.max(0, Math.min(3, collectors)))) : c;
}

export function rarityWeights(bait: BaitId, band: number, scent: number, w: number, brew = 0): Weights {
  const k = scentMult(scent) * 1.03 ** w;
  const wt: Weights = { ...RARITY_W, rare: RARITY_W.rare * k, legendary: RARITY_W.legendary * k };
  const pot = brewPotency(brew);
  if (bait === 'promise') wt.uncommon *= 1 + 0.5 * pot;
  if (bait === 'debt' && band >= 1) wt.rare *= 1 + pot;
  return wt;
}

export function rollRarity(wt: Weights, r: number): Rarity {
  const total = wt.common + wt.uncommon + wt.rare + wt.legendary;
  let x = r * total;
  for (const k of ['legendary', 'rare', 'uncommon', 'common'] as Rarity[]) {
    x -= wt[k];
    if (x < 0) return k;
  }
  return 'common';
}

/** Expected ledger value of one bite in `band` with these weights. */
export function bandEV(band: number, wt: Weights = RARITY_W): number {
  const total = wt.common + wt.uncommon + wt.rare + wt.legendary;
  let ev = 0;
  for (const k of ['common', 'uncommon', 'rare', 'legendary'] as Rarity[]) ev += (wt[k] / total) * RARITY_MULT[k];
  return ev * COMMON_BASE[band];
}

const BAND_EV0 = [bandEV(0), bandEV(1), bandEV(2)];

/** Expected ledger value of a netted soul: the depth-weighted average over [0, netDepth]. */
export function netEV(bands: number, poles: number): number {
  const depth = poleFrac(poles) * bands * BAND_PX;
  let sum = 0;
  for (let b = 0; b < bands; b++) {
    const top = b * BAND_PX;
    const span = Math.max(0, Math.min(depth, top + BAND_PX) - top);
    sum += span * BAND_EV0[b];
  }
  return depth > 0 ? sum / depth : BAND_EV0[0];
}

/** Netted souls per second (before value). */
export function netRate(r: StyxRun): number {
  return ((r.lv.netter + PILK_NETTERS) / NET_S) * netMult(r.lv.nets);
}

/** Souls (00 §4, 03 §16): a rare-or-better catch = 1, every 10th other catch = 1. Netted souls
 * use the base rarity weights. */
export const SOULS_PER_CATCH = (RARITY_W.rare + RARITY_W.legendary) / 100 + (1 - (RARITY_W.rare + RARITY_W.legendary) / 100) / 10;
export const netSoulsPerH = (r: StyxRun) => netRate(r) * 3600 * SOULS_PER_CATCH;

/** On-screen idle Obols/s (03 §3): R_idle x EV(netDepth) x 1.10^W x yield. Pure and cheap. */
export function idleObols(r: StyxRun): number {
  return netRate(r) * netEV(r.bands, r.lv.poles) * wrathIdle(r.wrath) * NET_YIELD;
}

// ---------- save state ----------

export interface Gate {
  w: number; // Wrath the tally counts at
  lands: number;
  esc: number;
  rare: number;
}

export interface StyxStats {
  casts: number;
  hooks: number;
  lands: number;
  escapes: number;
  wisps: number;
  rares: number;
  legendaries: number;
  twitches: number;
  bestCombo: number;
  snaps: number;
  baitsCrafted: number;
}

export interface StyxRun {
  bank: number;
  lv: Levels;
  bands: number; // unlocked depth bands, 1..3
  wrathMax: number; // bought this cycle
  wrath: number; // set (0..wrathMax)
  bait: BaitId;
  combo: number;
  gate: Gate;
  stats: StyxStats;
  aim: { x: number; d: number } | null; // last cast, as a fraction of the river width + depth px
}

export interface StyxPersistent {
  codex: Record<string, number>; // species id -> souls landed, ever
  baits: Record<BaitId, number>; // stock (worm is infinite)
}

export function defaultStats(): StyxStats {
  return { casts: 0, hooks: 0, lands: 0, escapes: 0, wisps: 0, rares: 0, legendaries: 0, twitches: 0, bestCombo: 0, snaps: 0, baitsCrafted: 0 };
}

export function defaultRun(): StyxRun {
  return {
    bank: 0,
    lv: defaultLevels(),
    bands: 1,
    wrathMax: 0,
    wrath: 0,
    bait: 'worm',
    combo: 0,
    gate: { w: 0, lands: 0, esc: 0, rare: 0 },
    stats: defaultStats(),
    aim: null,
  };
}

export function defaultPersistent(): StyxPersistent {
  return { codex: {}, baits: { worm: 0, promise: 0, debt: 0, gilded: 0 } };
}

/** Fills in fields missing from older or partial saves. */
export function normalize(r: StyxRun, p: StyxPersistent): void {
  const dr = defaultRun();
  r.lv = { ...dr.lv, ...(r.lv ?? {}) };
  r.stats = { ...dr.stats, ...(r.stats ?? {}) };
  r.gate = r.gate ?? dr.gate;
  r.bands = Math.max(1, Math.min(MAX_BANDS, r.bands ?? 1));
  r.wrathMax = r.wrathMax ?? 0;
  r.wrath = Math.min(r.wrath ?? 0, r.wrathMax);
  r.bait = r.bait ?? 'worm';
  r.combo = r.combo ?? 0;
  r.aim = r.aim ?? null;
  p.codex = p.codex ?? {};
  p.baits = { ...defaultPersistent().baits, ...(p.baits ?? {}) };
}

export const codexCount = (p: StyxPersistent) => SPECIES.filter((s) => (p.codex?.[s.id] ?? 0) > 0).length;
