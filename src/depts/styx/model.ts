// River Styx: pure numbers and state (specs/03). No Pixi imports: the economy definition
// (def.ts), the balance simulation and quick node scripts load this file on their own.
//
// Seeds follow 03 §5-§7. Changes for the MVP, marked TUNED:
//  - NET_YIELD: netters keep a fraction of a soul's ledger value (they net stragglers). It holds
//    on-screen active play at ~2.4-3x on-screen idle (03 §3) with the shipped catch loop.
//  - Netters reach a share of the *unlocked* depth (Longer Poles), as 03 §6.3 says, but every
//    band's value counts at its own band multiplier, so idle grows with each band unlock.
//  - v1.1 content (03 §15 "Later"): bands 4-5 (Abyssal Choir, Lethe Bottom), the Trophy Wall,
//    Twin Hooks, the Lantern Eel, the Chum Barrel, Hero's Lock bait and Ripper souls at Wrath 10.
//  - Skill expression (balance pass note: "the loop is mostly waiting"): a CLEAN reel (the line
//    never reached the red) pays a rarity-scaled bonus, deeper rares fight with shorter
//    telegraphs, and Rippers cut a taut line, so reeling well is worth more than reeling at all.

import { LONG_GROWTH, LONG_MAX, longMult } from '../../core/longnode';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Behavior =
  | 'drift'
  | 'zigzag'
  | 'heavy'
  | 'circle'
  | 'twin'
  | 'teleport'
  | 'sinker'
  | 'singer'
  | 'king'
  | 'canon'
  | 'conductor'
  | 'fader'
  | 'drifter'
  | 'leviathan'
  | 'echo';
export type BaitId = 'worm' | 'promise' | 'debt' | 'gilded' | 'lock';

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
export const MAX_BANDS = 5; // 03 §5.1: Shallows, Murk, Drowned Halls, Abyssal Choir, Lethe Bottom
/** SIM-TUNED (Wave 1, fishing research R1): 40 -> 90 px/s, a Shallows cast sinks in ~0.3-0.7 s. */
export const SINK_PX_S = 90;

export const BANDS = [
  { id: 'shallows', name: 'SHALLOWS', cost: 0, mult: 1 },
  { id: 'murk', name: 'MURK', cost: 500, mult: 4 },
  { id: 'halls', name: 'DROWNED HALLS', cost: 12_000, mult: 16 },
  { id: 'choir', name: 'ABYSSAL CHOIR', cost: 300_000, mult: 64 },
  { id: 'lethe', name: 'LETHE BOTTOM', cost: 8_000_000, mult: 256 },
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
  { id: 'chorister', name: 'Abyss Chorister', band: 3, rarity: 'common', base: 640, pull: 42, thrashes: 2, speed: 13, behavior: 'canon', note: 'THRASHES IN PAIRS. AMEN.' },
  { id: 'siren', name: 'Red Siren', band: 3, rarity: 'uncommon', base: 1600, pull: 52, thrashes: 3, speed: 18, behavior: 'singer', note: 'HER DIPS LIE. WAIT.' },
  { id: 'conductor', name: 'Choirmaster', band: 3, rarity: 'rare', base: 8000, pull: 85, thrashes: 6, speed: 14, behavior: 'conductor', note: 'KEEPS TIME. QUICK TELLS.' },
  { id: 'forgotten', name: 'The Forgotten', band: 4, rarity: 'common', base: 2560, pull: 44, thrashes: 2, speed: 9, behavior: 'fader', note: 'WHO? EXACTLY.' },
  { id: 'wanderer', name: 'Blank Wanderer', band: 4, rarity: 'uncommon', base: 6400, pull: 55, thrashes: 3, speed: 15, behavior: 'drifter', note: 'SLIPS LOOSE IF LEFT SLACK.' },
  { id: 'leviathan', name: 'Lethe Leviathan', band: 4, rarity: 'rare', base: 32000, pull: 95, thrashes: 7, speed: 8, behavior: 'leviathan', note: 'DIVES ONCE. HOLD ON.' },
  { id: 'echo', name: "Hero's Echo", band: -1, rarity: 'legendary', base: 0, pull: 90, thrashes: 8, speed: 25, behavior: 'echo', note: 'A HERO, ONCE. GOLD NOW.' },
];
export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
export const COMMON_BASE = [10, 40, 160, 640, 2560];

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
  lock: { name: "Hero's Lock", short: 'LOCK', cost: 5000, pack: 3, desc: 'X5 LEGENDARY BITES' },
};
export const BAIT_ORDER: BaitId[] = ['worm', 'promise', 'debt', 'gilded', 'lock'];
/** Consumable baits (worm is free and infinite). */
export const PAID_BAITS: BaitId[] = ['promise', 'debt', 'gilded', 'lock'];
/** Stock cap per bait (D-styx-02): 50 packs. Stock persists through Falls (03 §5.3) but can't be
 * banked into a permanent x2: an end-of-cycle bank buys at most this many. */
export const BAIT_CAP: Record<BaitId, number> = { worm: 0, promise: 500, debt: 500, gilded: 250, lock: 150 };
/** Bait prices follow the deepest open band (D-styx-02): x4^(0.75 (bands - 1)) = x1, 3, 8, 23, 64.
 * TUNED: a band-5 Gilded Obol (12.8k a bait) is about one deep catch, so it pays only on a combo,
 * as the Shallows' 200-Obol one does at band 1. */
export const baitBandMult = (bands = 1) => Math.round(4 ** (0.75 * (Math.max(1, Math.min(MAX_BANDS, bands)) - 1)));

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
  // v1.1 nodes (03 §6.2-6.3). Twin Hooks: 25k x10, max 2. Chum Barrel: 10k x2, max 3. The Lantern
  // Eel has no spec price: one level at 60k, after the Drowned Halls (a late reading aid).
  twin: { base: 25_000, growth: 10, max: 2 },
  eel: { base: 60_000, growth: 1, max: 1 },
  chum: { base: 10_000, growth: 2, max: 3 },
  // The long node (sim/README.md "Pass 5"): the Ferryman's Legend, every soul, wisp and netted
  // catch x1.15 per level; opens after the 2nd Fall. SIM-TUNED base: ~2 h of a later cycle's
  // plateau idle (~330/s). v1.1: x20 (2.4e6), with the plateau idle ~x20 once the Abyssal Choir
  // and the Lethe Bottom open (at 1.2e5 it maxed out by week 3 and returns found nothing to buy).
  legend: { base: 2.4e6, growth: LONG_GROWTH, max: LONG_MAX },
} satisfies Record<string, NodeDef>;
/** Ferryman's Legend milestone titles (one per 10 levels). */
export const LEGENDS = ['WHISPER', 'RUMOR', 'TALE', 'BALLAD', 'SAGA', 'MYTH', 'LEGEND'];
export const legendMult = (r: { lv: Levels }) => longMult(r.lv.legend ?? 0);
export type NodeId = keyof typeof NODES;
export type Levels = Record<NodeId, number>;

export const nodeCost = (id: NodeId, lvl: number) => NODES[id].base * NODES[id].growth ** lvl;

export function defaultLevels(): Levels {
  return { reel: 0, line: 0, steady: 0, strike: 0, barb: 0, lantern: 0, scent: 0, wispnet: 0, netter: 0, nets: 0, poles: 0, twin: 0, eel: 0, chum: 0, legend: 0 };
}

// ---------- Wrath (03 §7) ----------

export const WRATH_MAX = 20;
export const wrathCost = (level: number) => 1000 * 3 ** level; // price of buying level `level`
export const wrathActive = (w: number) => 1.12 ** w;
export const wrathIdle = (w: number) => 1.1 ** w;
export const wrathPull = (w: number) => 1.08 ** w;
export const wrathThrashes = (w: number) => Math.floor(w / 3);
/**
 * Fake-outs as a nibble COUNT, not a chance (Wave 1, research R1; Animal Crossing's guaranteed
 * bite): a soul makes 0..fakeMax fake dips, then the next dip is the real plunge, and never later
 * than the MAX_NIBBLES-th nibble (the Choirboy and the Siren add one lie, inside that cap).
 * Wrath raises the count only a little (none at Wrath 0, up to 3 from Wrath 8); mostly it makes
 * the fakes harder to tell from the plunge (fakeTell). SIM-TUNED (was 30% + 5%/Wrath, up to 60%,
 * re-rolled after every dip: unbounded, the audit's 38 s cast).
 */
export const MAX_NIBBLES = 5;
export const fakeMax = (w: number) => (w < 1 ? 1 : w < 8 ? 2 : 3);
/** Fake dips before the plunge; `r` is a uniform draw in [0, 1). */
export function fakeCount(w: number, liar: boolean, r: number): number {
  const n = Math.min(fakeMax(w), Math.floor(Math.max(0, Math.min(0.999999, r)) * (fakeMax(w) + 1)));
  return Math.min(MAX_NIBBLES - 1, n + (liar ? 1 : 0));
}
/** Expected fake dips per bite (the bot's estimate). */
export const fakeMean = (w: number, liar = false) => fakeMax(w) / 2 + (liar ? 1 : 0);
/** How much a fake dip mimics the plunge, 0..1: at Wrath 0 a 1 px bob with a grey ring, by Wrath
 * 10 a 2 px plunge with a gold flicker (the real bite is still a 3 px plunge and a thunk). */
export const fakeTell = (w: number) => Math.max(0, Math.min(1, w / 10));
/** Nibble timings (s): the bob before each dip, and the pause after a fake dip. SIM-TUNED from
 * 0.5-0.9 and 0.4-0.9 (anticipation stays, the dead air goes). */
export const NIB_S = [0.35, 0.3] as const;
export const NIB_AFTER_S = [0.3, 0.3] as const;
/** Fog Surges from Wrath 5 (03 §7): 20 s of murk every 70-130 s. */
export const FOG_WRATH = 5;
export const FOG_S = 20;

// Ripper souls (03 §7, W >= 10): a Ripper streaks across the river during a reel. It cuts a taut
// line (an escape, nothing more); a line eased below RIPPER_TAUT when it crosses lets it pass.
// The fin shows RIPPER_WARN s before the crossing.
export const RIPPER_WRATH = 10;
export const RIPPER_WARN = 1.0;
export const RIPPER_TAUT = 45;
/** Chance a reel at Wrath w gets one Ripper pass. */
export const ripperChance = (w: number) => (w < RIPPER_WRATH ? 0 : Math.min(0.5, 0.15 + 0.035 * (w - RIPPER_WRATH)));

// ---------- Infamy skill gate (00 §2.2) ----------

export const GATE_LANDS = 20;
/** Escapes allowed while landing 20 souls with <= 30% escapes: e / (20 + e) <= 0.3. */
export const GATE_ESC = Math.floor((0.3 * GATE_LANDS) / 0.7);

// ---------- derived numbers ----------

/** Reel speed in spec px/s while holding below the red. */
export const reelSpeed = (lv: number) => 16 * (1 + 0.08 * lv);
/** Tension rise while holding (%/s), before thrashes; Braided Line spreads it over a bigger cap. */
export const REEL_RISE = 32;
/** The red zone: reeling stalls at or above it, and touching it spoils a CLEAN reel. */
export const RED = 80;
export const lineCap = (lv: number) => 1 + 0.06 * lv;
/** Tension drain on release, %/s (2x the rise, +5% per Steady Hand). */
export const drainRate = (lv: number) => 2 * REEL_RISE * (1 + 0.05 * lv);
export const hookWindowMs = (strike: number, w: number) => Math.max(250, (600 + 40 * strike) * 0.97 ** w);
export const barbChance = (lv: number) => 0.015 * lv;
/** Mean seconds from the hook settling to a soul starting to nibble. SIM-TUNED (Wave 1, research
 * R1): base 4.5 -> 2 s, floor 1 -> 0.6 s. */
export const biteWait = (lantern: number) => Math.max(0.6, 2 * 0.96 ** lantern);
/** One bite-wait draw (`r` uniform): bounded around the mean, 0.4x-1.6x (Webfishing's pity ramp:
 * no long tail). Was exponential, up to ~3x the mean. */
export const biteSample = (mean: number, r: number) => mean * (0.4 + 1.2 * Math.max(0, Math.min(1, r)));
export const scentMult = (lv: number) => 1.04 ** lv;
export const wispMult = (lv: number) => 1 + 0.2 * lv;
export const wispEvery = (lv: number) => 10 / (1 + 0.05 * lv);
export const comboMult = (streak: number) => 1 + 0.05 * Math.min(streak, 20);

/** Thrash telegraph (s): the red glow before a thrash. The deep rares give less warning. */
export function teleS(sp: Species): number {
  return sp.behavior === 'conductor' ? 0.18 : sp.behavior === 'leviathan' ? 0.22 : 0.3;
}
/** Thrash length (s). */
export function thrashS(sp: Species): number {
  return sp.behavior === 'king' || sp.behavior === 'leviathan' ? 1.3 : sp.behavior === 'heavy' ? 1.1 : sp.behavior === 'echo' ? 1.0 : 0.75;
}
/** Seconds at 0% tension before the soul drifts loose (the Blank Wanderer slips sooner). */
export const driftS = (sp: Species) => (sp.behavior === 'drifter' ? 1.2 : 2.5);

// ---------- the gold band (Wave 1, research R2: a second, moving axis in every reel) ----------
//
// The Last Stand's gold band (laststand.ts) moved into the main reel, and it MOVES: the soul's
// comfort zone drifts on the tension track by its behaviour (Stardew's archetypes). Holding with
// the tension inside the band reels at ZONE_IN x speed, outside it at ZONE_OUT x, so the old
// "hold to 65, let go" threshold bot still lands souls (casual play is never locked out) but a
// thumb that tracks the band lands them much faster. Thrashes jerk the band low (let go!).
export const ZONE_W = 24; // band width, tension %
export const ZONE_IN = 1.3; // SIM-TUNED: reel speed x inside the band
export const ZONE_OUT = 0.55; // SIM-TUNED: reel speed x outside it (still below the red)
const ZONE_LO = 6 + ZONE_W / 2;
const ZONE_HI = 80 - 2 - ZONE_W / 2; // under the red (RED = 80)
/** Deterministic 0..1 hash (shared by the scene and the balance sim). */
function hash01(n: number, seed: number): number {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
/** Centre of the gold band (tension %) `t` seconds into a reel. `seed` in [0, 1) per reel. */
export function zoneCenter(b: Behavior, t: number, seed: number, thrashing = false): number {
  const ph = seed * 6.283;
  let c: number;
  switch (b) {
    case 'zigzag':
    case 'twin':
      c = (Math.floor(t / 1.1 + seed) % 2 ? 34 : 60) + 4 * (hash01(Math.floor(t / 1.1 + seed), seed) - 0.5);
      break;
    case 'heavy':
    case 'sinker':
    case 'leviathan':
    case 'king':
      c = 34 + 8 * Math.sin(0.7 * t + ph);
      break;
    case 'circle':
      c = 46 + 16 * Math.sin(1.6 * t + ph);
      break;
    case 'teleport':
      c = 26 + 42 * hash01(Math.floor(t / 1.4 + seed), seed);
      break;
    case 'singer':
    case 'canon':
    case 'conductor':
      c = 46 + 12 * Math.sin(1.2 * t + ph) + (hash01(Math.floor(t / 2), seed) > 0.6 ? 10 : 0);
      break;
    case 'echo':
      c = 46 + 18 * Math.sin(1.8 * t + ph);
      break;
    default: // drift, drifter, fader
      c = 46 + 14 * Math.sin(0.9 * t + ph);
  }
  if (thrashing) c -= 16;
  return Math.max(ZONE_LO, Math.min(ZONE_HI, c));
}
export const inZone = (tension: number, center: number) => Math.abs(tension - center) <= ZONE_W / 2;

// ---------- the catch roll (Wave 1, research R3: size, stars, records) ----------
//
// Every landed soul rolls a Heft (normal, ~+-20%, clamped) and 0-3 stars. A CLEAN reel adds a
// star (Stardew's perfect catch), any paid bait leans the roll up. Both scale the Obols of that
// one catch; the netters (idle) keep paying the plain EV, so idleRate is untouched.
export const STAR_W = [52, 32, 13, 3];
/** Star value factors. EV ~0.99 without a CLEAN reel, so stars move value around, not up. */
export const STAR_MULT = [0.85, 1, 1.3, 1.8];
export const STAR_NAMES = ['FAINT', 'BRIGHT', 'RADIANT', 'LUMINOUS'];
export const HEFT_SD = 0.2;
export const HEFT_MIN = 0.5;
export const HEFT_MAX = 1.7;
/**
 * SIM-TUNED: Obols per hand catch x CATCH_K. Wave 1 cut a cast from ~10-25 s to ~6-9 s and added
 * the gold band, so ~1.6x the catches per minute; CATCH_K holds active : on-screen idle in its
 * 2.4-3.2x band (more catches and more reveals, not more money per minute).
 */
export const CATCH_K = 0.62;
/** Stars for one catch: `r` uniform. Paid bait halves the 0-star weight; CLEAN adds one (max 3). */
export function rollStars(r: number, clean: boolean, bait: BaitId = 'worm'): number {
  const w = STAR_W.slice();
  if (bait !== 'worm') w[0] *= 0.5;
  const tot = w.reduce((a, b) => a + b, 0);
  let x = Math.max(0, Math.min(0.999999, r)) * tot;
  let s = 0;
  for (; s < 3; s++) {
    x -= w[s];
    if (x < 0) break;
  }
  return Math.min(3, s + (clean ? 1 : 0));
}
/** Expected star factor (the bot's estimate). */
export function starEV(clean: boolean, bait: BaitId = 'worm'): number {
  const w = STAR_W.slice();
  if (bait !== 'worm') w[0] *= 0.5;
  const tot = w.reduce((a, b) => a + b, 0);
  let ev = 0;
  for (let s = 0; s < 4; s++) ev += (w[s] / tot) * STAR_MULT[Math.min(3, s + (clean ? 1 : 0))];
  return ev;
}
/** Heft from a standard normal draw `g`. */
export const rollHeft = (g: number) => Math.max(HEFT_MIN, Math.min(HEFT_MAX, 1 + HEFT_SD * g));
/** Value factor of one catch (before CLEAN, combo and the rest). */
export const catchMult = (heft: number, stars: number) => heft * STAR_MULT[Math.max(0, Math.min(3, stars))] * CATCH_K;
/** A soul's weight in stone for the reveal card and the Codex (deeper and rarer = heavier). */
export function heftSt(sp: Species, heft: number): number {
  const rk = sp.rarity === 'legendary' ? 6 : sp.rarity === 'rare' ? 2.6 : sp.rarity === 'uncommon' ? 1.6 : 1;
  const bk = 1 + 0.7 * Math.max(0, sp.band);
  return Math.round(heft * rk * bk * 10) / 10;
}

export interface CodexBest {
  h: number; // best heft
  s: number; // best stars
}
/** Records a catch in the per-species bests. Returns which records it broke (none on a first). */
export function recordCatch(p: StyxPersistent, id: string, heft: number, stars: number): { heft: boolean; stars: boolean; first: boolean } {
  p.best = p.best ?? {};
  const b = p.best[id];
  if (!b) {
    p.best[id] = { h: heft, s: stars };
    return { heft: false, stars: false, first: true };
  }
  const out = { heft: heft > b.h + 1e-9, stars: stars > b.s, first: false };
  if (out.heft) b.h = heft;
  if (out.stars) b.s = stars;
  return out;
}

// ---------- the Codex as a map (Wave 1, research R4) ----------

/** Frame tier per species: 1 / 10 / 50 catches = bronze / silver / gold. */
export const codexTier = (n: number) => (n >= 50 ? 3 : n >= 10 ? 2 : n >= 1 ? 1 : 0);
export const TIER_AT = [1, 10, 50];
/** Rumoured hints for unseen souls (Moonglow Bay's rumoured fish), <= 34 characters. */
export const HINTS: Record<string, string> = {
  clerk: 'SOMETHING WEEPS OVER PAPERWORK',
  tourist: 'A VOICE ASKS THE WAY. IN SHALLOWS',
  knight: 'ARMOUR CLANKS ON THE SHALLOW BED',
  poet: 'SOMEONE RHYMES IN THE MURK',
  wraiths: 'TWO SHADOWS SWIM AS ONE. MURK',
  witch: 'MOONLIGHT BLINKS DEEP IN THE MURK',
  bishop: 'A MITRE SINKS THROUGH THE HALLS',
  choir: 'A CHILD SINGS IN THE DROWNED HALLS',
  king: 'A CROWN GLINTS AT THE HALLS FLOOR',
  chorister: 'AMENS ECHO IN THE ABYSSAL CHOIR',
  siren: 'A RED SONG LIES IN THE CHOIR',
  conductor: 'SOMETHING KEEPS TIME. THE CHOIR',
  forgotten: 'NOBODY REMEMBERS. LETHE BOTTOM',
  wanderer: 'A BLANK FACE DRIFTS IN THE LETHE',
  leviathan: 'THE LETHE BOTTOM BREATHES',
  echo: "A HERO'S GOLD. ANY DEPTH. RARE.",
};

// ---------- netters fish what you know (Wave 1, research R9) ----------

/** The netters only know a species once you landed one by hand (the Codex); Pilk's lads always
 * know the band's common soul. A soul they don't know mostly slips the net: it fetches
 * NET_UNKNOWN of its value. No persistent data = every species (headless callers). */
export function netKnows(p: StyxPersistent | undefined, sp: Species): boolean {
  return !p || sp.rarity === 'common' || (p.codex?.[sp.id] ?? 0) > 0;
}
/** SIM-TUNED: share of an unknown soul's value the netters still fetch. 0 (a hard gate) cut early
 * idle ~half (day-1 active : idle ~6x, the first Fall a day late); 0.4 keeps the gate felt. */
export const NET_UNKNOWN = 0.4;
/** Species the netters know (for the Codex header). */
export const netKnownCount = (p: StyxPersistent) => SPECIES.filter((s) => netKnows(p, s)).length;

/** CLEAN reel bonus (the line never touched the red): rarity-scaled, so the rare fights pay most. */
export const CLEAN_MULT: Record<Rarity, number> = { common: 1.1, uncommon: 1.15, rare: 1.35, legendary: 1.5 };

/** Twin Hooks (03 §6.2): hooks per cast, bites one at a time. After a CLEAN land the next hook is
 * already down and soaking (no sink or recast, bite wait x TWIN_WAIT); a reel that touched the red
 * tangles the spares and an escape loses them, so the rig comes up. TUNED: spares follow clean
 * lands only (skill expression; with every land the reference bot's active : idle ran ~4.5x). */
export const hooksPerCast = (twin: number) => 1 + Math.max(0, Math.min(2, twin));
export const TWIN_WAIT = 0.75;

/** Chum Barrel (03 §6.3): netters fish with the equipped bait at 25% efficiency per level. */
export const chumEff = (lv: number) => 0.25 * Math.max(0, Math.min(3, lv));
/** D-styx-01: the barrel uses the stock up. The netters use 1 bait per CHUM_SOULS souls netted at
 * full strength, and the strength is the barrel's fill (stock / BAIT_CAP), so a single bait smells
 * of almost nothing and a full barrel fades as it empties. TUNED: band 5, 20 netters, Bigger Nets
 * 40 net ~3.4 souls/s: ~250 Gilded Obols an hour (~3.2M Obols at band-5 prices) against the
 * full barrel's +75% (~6M an hour), so chumming pays but is never free. */
export const CHUM_SOULS = 50;

export const PILK_NETTERS = 30 / 45; // Pilk's skiff: 1 soul / 45 s, in netter-equivalents
export const NET_S = 30; // one soul per 30 s per netter
export const NET_YIELD = 0.6; // TUNED: share of ledger value the netters' stragglers fetch (balance sim pass 3: kept 0.65, 2.5-2.7x on screen; pass 5: 0.6, the reference seed read 2.3x with seven departments)
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
export function baitCost(id: BaitId, collectors = 0, bands = 1): number {
  const c = BAITS[id].cost * baitBandMult(bands);
  return id === 'debt' ? Math.ceil(c * (1 - 0.15 * Math.max(0, Math.min(3, collectors)))) : c;
}

/** Applies a bait's weight effect at `pot` potency (1 = full; the Chum Barrel uses 0.25-0.75). */
function baitWeights(wt: Weights, bait: BaitId, band: number, pot: number): Weights {
  if (bait === 'promise') wt.uncommon *= 1 + 0.5 * pot;
  if (bait === 'debt' && band >= 1) wt.rare *= 1 + pot;
  if (bait === 'lock') wt.legendary *= 1 + 4 * pot;
  return wt;
}

export function rarityWeights(bait: BaitId, band: number, scent: number, w: number, brew = 0): Weights {
  const k = scentMult(scent) * 1.03 ** w;
  const wt: Weights = { ...RARITY_W, rare: RARITY_W.rare * k, legendary: RARITY_W.legendary * k };
  return baitWeights(wt, bait, band, brewPotency(brew));
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

const BAND_EV0 = COMMON_BASE.map((_, b) => bandEV(b));

// ---------- Trophy Wall (03 §6.4; persists through Falls) ----------

export interface Trophy {
  id: string; // species id
  band: number; // band it was caught in (a Hero's Echo counts for that band)
}
/** Wall slots: 3 base, +1 per 5 Codex species. TUNED from "+1 per 10": the Codex holds 16
 * species, so per 10 would add a single slot ever. */
export const WALL_BASE = 3;
export const WALL_MAX = 6;
export const wallSlots = (p: StyxPersistent) => Math.min(WALL_MAX, WALL_BASE + Math.floor(codexCount(p) / 5));
export const trophyBonus = (t: Trophy) => (SPECIES_BY_ID[t.id]?.rarity === 'legendary' ? 0.1 : 0.02);
/** Permanent Obols multiplier the Wall gives one band (catches and netted souls alike). */
export function wallMult(p: StyxPersistent | undefined, band: number): number {
  let m = 1;
  for (const t of p?.wall ?? []) if (t.band === band) m += trophyBonus(t);
  return m;
}
/** Index of the weakest mounted trophy (lowest bonus, then shallowest), or -1 if the wall is empty. */
export function weakestTrophy(p: StyxPersistent): number {
  let best = -1;
  for (let i = 0; i < p.wall.length; i++) {
    const t = p.wall[i];
    const b = p.wall[best];
    if (best < 0 || trophyBonus(t) < trophyBonus(b) || (trophyBonus(t) === trophyBonus(b) && t.band < b.band)) best = i;
  }
  return best;
}
/** Would keeping this catch improve the wall? (a free slot, or it beats the weakest trophy) */
export function trophyWorthy(p: StyxPersistent, t: Trophy): boolean {
  if (!RARE_PLUS(SPECIES_BY_ID[t.id]?.rarity ?? 'common')) return false;
  if (p.wall.length < wallSlots(p)) return true;
  const w = p.wall[weakestTrophy(p)];
  return !!w && (trophyBonus(t) > trophyBonus(w) || (trophyBonus(t) === trophyBonus(w) && t.band > w.band));
}
/** Mounts a trophy (into a free slot, else over the weakest). */
export function mountTrophy(p: StyxPersistent, t: Trophy): void {
  if (p.wall.length < wallSlots(p)) p.wall.push({ id: t.id, band: t.band });
  else {
    const i = weakestTrophy(p);
    if (i >= 0) p.wall[i] = { id: t.id, band: t.band };
  }
}

// ---------- the netters ----------

/** Netted rarity weights: the base table, plus the equipped bait at the Chum Barrel's efficiency. */
function netWeights(bait: BaitId, band: number, eff: number): Weights {
  return eff > 0 ? baitWeights({ ...RARITY_W }, bait, band, eff) : RARITY_W;
}

/** The netters' reach (03 §3, §6.3): a share (Longer Poles) of the water they work. Up to the
 * Drowned Halls that is the whole open river from the surface. TUNED for bands 4-5: from the
 * Abyssal Choir down Pilk's skiff works further out, so their stretch starts NET_SHIFT of a band
 * lower per band past the third and keeps its three-band width. With no shift each deep band
 * paid active fishing x4 and the netters ~x1.5 (active : on-screen idle 5-6x); a whole band per
 * band (x4 each) read 2.1x, so the shift sits at 3/4 (balance sim, ~2.8x). */
export const NET_SPAN_BANDS = 3;
export const NET_SHIFT = 0.75;
export function netWindow(bands: number, poles: number): { top: number; depth: number } {
  const top = NET_SHIFT * Math.max(0, bands - NET_SPAN_BANDS) * BAND_PX;
  return { top, depth: poleFrac(poles) * Math.min(bands, NET_SPAN_BANDS) * BAND_PX };
}

/** bandEV with the souls the netters don't know yet mostly let go (Wave 1, R9). */
function knownEV(band: number, wt: Weights, p: StyxPersistent): number {
  const total = wt.common + wt.uncommon + wt.rare + wt.legendary;
  let ev = 0;
  for (const k of ['common', 'uncommon', 'rare', 'legendary'] as Rarity[]) ev += (wt[k] / total) * RARITY_MULT[k] * (netKnows(p, speciesFor(band, k)) ? 1 : NET_UNKNOWN);
  return ev * COMMON_BASE[band];
}

/** Expected ledger value of a netted soul: the depth-weighted average over the netters' window.
 * With a worm and no Wall this is the plain base-table EV per band. */
export function netEV(bands: number, poles: number, bait: BaitId = 'worm', chum = 0, p?: StyxPersistent, fill = 1): number {
  const { top: w0, depth } = netWindow(bands, poles);
  const w1 = w0 + depth;
  const eff = bait === 'worm' ? 0 : chumEff(chum) * Math.max(0, Math.min(1, fill));
  const gild = bait === 'gilded' ? 1 + eff : 1;
  let sum = 0;
  for (let b = 0; b < bands; b++) {
    const top = b * BAND_PX;
    const span = Math.max(0, Math.min(w1, top + BAND_PX) - Math.max(w0, top));
    if (span <= 0) continue;
    const ev = !p ? (eff > 0 ? bandEV(b, netWeights(bait, b, eff)) : BAND_EV0[b]) : knownEV(b, eff > 0 ? netWeights(bait, b, eff) : RARITY_W, p);
    sum += span * ev * wallMult(p, b);
  }
  return depth > 0 ? (sum / depth) * gild : BAND_EV0[0];
}

/** Netted souls per second (before value). */
export function netRate(r: StyxRun): number {
  return ((r.lv.netter + PILK_NETTERS) / NET_S) * netMult(r.lv.nets);
}

/** Souls (00 §4, 03 §16): a rare-or-better catch = 1, every 10th other catch = 1. Netted souls
 * use the base rarity weights. */
export const SOULS_PER_CATCH = (RARITY_W.rare + RARITY_W.legendary) / 100 + (1 - (RARITY_W.rare + RARITY_W.legendary) / 100) / 10;
export const netSoulsPerH = (r: StyxRun) => netRate(r) * 3600 * SOULS_PER_CATCH;

/** The bait the Chum Barrel sees: the equipped one while it has stock (stock unknown = trust it). */
export function chumBait(r: StyxRun, p?: StyxPersistent): BaitId {
  if ((r.lv.chum ?? 0) <= 0 || r.bait === 'worm') return 'worm';
  if (p && !((p.baits?.[r.bait] ?? 0) > 0)) return 'worm';
  return r.bait;
}

/** The barrel's fill, 0-1 (D-styx-01): the stock left of the equipped bait over its cap, less
 * the share of the top bait already used. No persistent data = a full barrel (headless callers). */
export function chumFill(r: StyxRun, p?: StyxPersistent): number {
  const b = chumBait(r, p);
  if (b === 'worm') return 0;
  if (!p) return 1;
  return Math.max(0, Math.min(1, ((p.baits[b] ?? 0) - (r.chumUsed ?? 0)) / BAIT_CAP[b]));
}

/** Baits the netters use per second at the current fill (D-styx-01). */
export const chumUseRate = (r: StyxRun, p?: StyxPersistent) => (chumFill(r, p) * netRate(r)) / CHUM_SOULS;

/**
 * Settles the Chum Barrel's bait use over `seconds` of netting (D-styx-01): the scene calls it
 * every frame, `onOffline` for an absence and the in-session time off screen. The use rate
 * follows the fill, so the stock decays exponentially (closed form: one call covers a long
 * absence, and the boost credited at a fill is paid for at that fill). Whole baits leave the stock as they are used up; the share of the top one
 * already used lives in `run.chumUsed`. The equipped bait falls back to the worm once it is gone.
 */
export function settleChum(r: StyxRun, p: StyxPersistent, seconds: number): void {
  const b = chumBait(r, p);
  if (b === 'worm' || !(seconds > 0)) return;
  const cap = BAIT_CAP[b];
  const S0 = Math.min(cap, p.baits[b] ?? 0) - (r.chumUsed ?? 0);
  const c = netRate(r) / CHUM_SOULS; // baits/s at a full barrel
  if (!(S0 > 0) || !(c > 0)) return;
  // dS/dt = -c S / cap (S <= cap): S(t) = S0 exp(-c t / cap).
  let S = S0 * Math.exp((-c * seconds) / cap);
  if (S < 0.5) S = 0; // the last half bait goes too, so the tail ends
  const whole = Math.max(0, Math.ceil(S - 1e-9));
  p.baits[b] = whole;
  r.chumUsed = whole - S;
  if (whole <= 0) {
    r.chumUsed = 0;
    r.bait = 'worm';
  }
}

/** On-screen idle Obols/s (03 §3): R_idle x EV(netDepth) x 1.10^W x yield. Pure and cheap.
 * `p` (persistent) adds the Trophy Wall and the Chum Barrel's fill (D-styx-01). */
export function idleObols(r: StyxRun, p?: StyxPersistent): number {
  return netRate(r) * netEV(r.bands, r.lv.poles, chumBait(r, p), r.lv.chum ?? 0, p, chumFill(r, p)) * wrathIdle(r.wrath) * NET_YIELD * legendMult(r);
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
  cleans: number;
  cuts: number;
  rippers: number;
  trophies: number;
  twinLands: number;
  fogs: number;
}

export interface StyxRun {
  bank: number;
  lv: Levels;
  bands: number; // unlocked depth bands, 1..5
  wrathMax: number; // bought this cycle
  wrath: number; // set (0..wrathMax)
  bait: BaitId;
  combo: number;
  gate: Gate;
  stats: StyxStats;
  aim: { x: number; d: number } | null; // last cast, as a fraction of the river width + depth px
  /** Chum Barrel (D-styx-01): share of the equipped bait's top unit the netters already used. */
  chumUsed?: number;
  /** Chum Barrel: wall clock (ms) its bait use was last settled (scene frame or absence). */
  chumAt?: number;
}

export interface StyxPersistent {
  codex: Record<string, number>; // species id -> souls landed, ever
  baits: Record<BaitId, number>; // stock (worm is infinite)
  wall: Trophy[]; // the Trophy Wall (03 §6.4)
  maxBand: number; // deepest band ever opened (tier_reached lines)
  /** Per-species personal bests (Wave 1 records): heft and stars. Persists through Falls. */
  best?: Record<string, CodexBest>;
  /** Night Order "SCOUT A RARE": a rare Pilk spotted while you were away; the scene turns it
   * into a glowing trail on the next visit (then clears it). */
  scout?: { id: string; band: number };
}

export function defaultStats(): StyxStats {
  return { casts: 0, hooks: 0, lands: 0, escapes: 0, wisps: 0, rares: 0, legendaries: 0, twitches: 0, bestCombo: 0, snaps: 0, baitsCrafted: 0, cleans: 0, cuts: 0, rippers: 0, trophies: 0, twinLands: 0, fogs: 0 };
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
  return { codex: {}, baits: { worm: 0, promise: 0, debt: 0, gilded: 0, lock: 0 }, wall: [], maxBand: 1, best: {} };
}

/** Fills in fields missing from older or partial saves. */
export function normalize(r: StyxRun, p: StyxPersistent): void {
  const dr = defaultRun();
  r.lv = { ...dr.lv, ...(r.lv ?? {}) };
  r.stats = { ...dr.stats, ...(r.stats ?? {}) };
  r.gate = r.gate ?? dr.gate;
  r.bands = Math.max(1, Math.min(MAX_BANDS, r.bands ?? 1));
  r.wrathMax = Math.max(0, Math.min(WRATH_MAX, r.wrathMax ?? 0));
  r.wrath = Math.max(0, Math.min(r.wrath ?? 0, r.wrathMax));
  r.bait = r.bait && r.bait in BAITS ? r.bait : 'worm';
  r.combo = r.combo ?? 0;
  r.aim = r.aim ?? null;
  r.bank = Number.isFinite(r.bank) ? r.bank : 0;
  p.codex = p.codex ?? {};
  p.baits = { ...defaultPersistent().baits, ...(p.baits ?? {}) };
  // D-styx-02: older saves could bank unlimited stock; clamp it to the cap.
  for (const b of PAID_BAITS) p.baits[b] = Math.max(0, Math.min(BAIT_CAP[b], Math.floor(Number(p.baits[b]) || 0)));
  r.chumUsed = Math.max(0, Math.min(1, Number(r.chumUsed) || 0));
  p.wall = Array.isArray(p.wall) ? p.wall.filter((t) => t && SPECIES_BY_ID[t.id] && t.band >= 0 && t.band < MAX_BANDS).slice(0, WALL_MAX) : [];
  p.maxBand = Math.max(p.maxBand ?? 1, r.bands);
  const best: Record<string, CodexBest> = {};
  for (const [id, b] of Object.entries(p.best ?? {})) {
    if (SPECIES_BY_ID[id] && b && Number.isFinite(b.h)) best[id] = { h: Math.max(HEFT_MIN, Math.min(HEFT_MAX, b.h)), s: Math.max(0, Math.min(3, Math.floor(b.s) || 0)) };
  }
  p.best = best;
  const sc = p.scout;
  if (sc && !(SPECIES_BY_ID[sc.id] && sc.band >= 0 && sc.band < MAX_BANDS)) delete p.scout;
}

export const codexCount = (p: StyxPersistent) => SPECIES.filter((s) => (p.codex?.[s.id] ?? 0) > 0).length;

// ---------- advancement hooks (00 §2.5, §5.2) ----------

/** Run-level idle-rate delta of raising one node (or opening a band), for the Steward. Pure. */
export function idleDelta(r: StyxRun, p: StyxPersistent | undefined, id: NodeId | 'deeper'): number {
  const v0 = idleObols(r, p);
  if (id === 'deeper') {
    if (r.bands >= MAX_BANDS) return 0;
    r.bands++;
    const v1 = idleObols(r, p);
    r.bands--;
    return v1 - v0;
  }
  const l0 = r.lv[id];
  r.lv[id] = l0 + 1;
  const v1 = idleObols(r, p);
  r.lv[id] = l0;
  return v1 - v0;
}
