// Goblin Mines: pure numbers and state (specs/02). No Pixi imports, so the balance
// simulation (and a quick node script) can load this file on its own.
//
// Seeds follow 02 §5-§6 except where the spec's own targets disagreed with them (02 says
// "where a seed and a band disagree, the band wins"). Changes, all marked TUNED below:
//  - Tap Damage cost growth 1.10 -> 1.16 and Dig Deeper base 100 -> 150: with the raw seeds a
//    greedy tapping bot reached depth 30 (the first Infamy target) in ~20 minutes, far ahead of the
//    3-6 h first-Fall band. See the TUNING note at the bottom of this file.
//  - SIM-TUNED by the balance harness (sim/README.md "Tuning log"): Pick Tier also multiplies tap
//    damage (FIST_TIER), and idleRate models the goblins' hop between rocks (GOBLIN_HOP_S) instead
//    of a flat 0.85 overkill factor.

import { longCost, longMult } from '../../core/longnode';

export interface MinesStats {
  taps: number;
  rocks: number;
  crits: number;
  veins: number;
  geodes: number;
  kegs: number;
  beatHits: number;
  frenzies: number;
  bestStreak: number;
  lightning: number;
}

export interface MinesRun {
  bank: number;
  depth: number; // selected depth (free to change within maxDepth)
  maxDepth: number; // bought with Dig Deeper; resets on Fall
  // A. Gauntlet
  tap: number;
  critC: number;
  critP: number;
  keen: number;
  // B. Crew
  grunts: number;
  sappers: number;
  picks: number;
  tier: number;
  // D. Shaft
  supports: number;
  regrow: number;
  // E. Drum Circle (Nugget levels; the drum itself is persistent)
  drumhead: number;
  wide: number;
  frenzy: number;
  fuse: number;
  drummers: number;
  /** Richer Seams, the long node (core/longnode.ts): every rock pays x1.15 per level. */
  seams: number;
  /** Rocks broken on screen per depth this cycle (Infamy skill gate: 50 at the target). */
  gate: Record<string, number>;
  stats: MinesStats;
}

export interface MinesPersistent {
  gems: number;
  gemsEver: number;
  chain: number; // Chain Lightning
  powder: number; // Blasting Powder
  lucky: number; // Lucky Rocks
  drum: boolean; // the Doom Drum, kept through Falls
  drumOn: boolean; // its on/off switch, also kept (02 §6E)
}

export const MAX_DEPTH = 60;
export const MAX_GOBLINS = 8;

/** Richer Seams (the long node, sim/README.md "Pass 5"): every rock's Nuggets x1.15 per level, a
 * richer ore every 10 levels; opens after the 2nd Fall. SIM-TUNED base: ~2 h of a later cycle's
 * plateau idle (~3e5/s). */
export const SEAMS_BASE = 2e9;
export const SEAMS = ['COPPER', 'SILVER', 'GOLD', 'MITHRIL', 'ADAMANT', 'STARMETAL', 'DRAGONORE'];
export const seamsCost = (L: number) => longCost(SEAMS_BASE, L);
export const oreMult = (r: MinesRun) => longMult(r.seams ?? 0);
export const GRID = 5;
export const TILES = GRID * GRID;
export const GATE_ROCKS = 50;
export const DRUM_GEMS = 8;
export const DRUM_DEPTH = 6;

export function defaultStats(): MinesStats {
  return { taps: 0, rocks: 0, crits: 0, veins: 0, geodes: 0, kegs: 0, beatHits: 0, frenzies: 0, bestStreak: 0, lightning: 0 };
}

export function defaultRun(): MinesRun {
  return {
    bank: 0,
    depth: 1,
    maxDepth: 1,
    tap: 0,
    critC: 0,
    critP: 0,
    keen: 0,
    grunts: 0,
    sappers: 0,
    picks: 0,
    tier: 0,
    supports: 0,
    regrow: 0,
    drumhead: 0,
    wide: 0,
    frenzy: 0,
    fuse: 0,
    drummers: 0,
    seams: 0,
    gate: {},
    stats: defaultStats(),
  };
}

export function defaultPersistent(): MinesPersistent {
  return { gems: 0, gemsEver: 0, chain: 0, powder: 0, lucky: 0, drum: false, drumOn: true };
}

// ---------- rocks ----------

/** Common rock HP at depth d. */
export const H = (d: number) => 10 * 1.25 ** (d - 1); // TUNED: growth 1.17 -> 1.25
/** Common rock reward at depth d. */
export const R = (d: number) => 2 * 1.26 ** (d - 1); // TUNED: growth 1.19 -> 1.26

export type RockKind = 'common' | 'vein' | 'geode' | 'keg' | 'rubble';

export const VEIN_P = 0.08;
export const GEODE_P = 0.005;
export const kegP = (powder: number) => 0.03 + 0.005 * powder;

export const KIND_HP: Record<RockKind, number> = { common: 1, vein: 2, geode: 3, keg: 0, rubble: 0 };
export const KIND_REWARD: Record<RockKind, number> = { common: 1, vein: 5, geode: 1, keg: 0, rubble: 0 };

/** Average HP and reward of a non-keg rock (the spawn mix the crew chews through). */
const nonKeg = 1 - 0.03;
export const AVG_HP_F = (1 - VEIN_P - GEODE_P - 0.03 + VEIN_P * 2 + GEODE_P * 3) / nonKeg; // ~1.093
export const AVG_REWARD_F = (1 - VEIN_P - GEODE_P - 0.03 + VEIN_P * 5 + GEODE_P) / nonKeg; // ~1.33

export const gemChance = (lucky: number) => GEODE_P / nonKeg + 0.001 * lucky;

// ---------- strata ----------

export const STRATA = ['DIRT', 'STONE', 'IRON', 'CRYSTAL', 'MAGMA', 'ABYSS'] as const;
export const stratumOf = (d: number) => Math.min(STRATA.length - 1, Math.floor((d - 1) / 10));

// ---------- gauntlet ----------

export const tapDamage = (L: number) => (1 + L) * 2 ** Math.floor(L / 25);
export const tapCost = (L: number) => 10 * 1.2 ** L; // TUNED: growth 1.10 -> 1.20
export const critChance = (L: number) => Math.min(0.25, 0.05 + 0.01 * L); // TUNED cap 30% -> 25%
export const critCost = (L: number) => 60 * 1.45 ** L;
export const CRIT_C_MAX = 20;
export const critMult = (L: number) => Math.min(9, 5 + L); // TUNED cap x15 -> x9 (crits top out at +200%, 02 §3)
export const critPowerCost = (L: number) => 200 * 1.6 ** L;
export const CRIT_P_MAX = 4;
export const keenCost = (L: number) => 400 * 1.8 ** L;
export const KEEN_MAX = 5;

/**
 * SIM-TUNED: the gauntlet is forged at the crew's Pick Tier, so each tier multiplies tap damage
 * too (x1.9 per tier, against the crew's x2.5). Before, tiers multiplied only the crew (x98 at
 * tier 5), taps fell to ~5% of income and the drum-on on-screen ratio was 1.05x (02 §3: 2.4-3.0x).
 * The ratio is steep in this number (tier^5): x1.6 gives ~1.8x, x2.0 ~3.4x, x2.5 lets taps carry
 * the whole department (~10x the crew); x1.9 lands the drum-on reference bot at ~2.8x.
 * SIM-TUNED 1.9 -> 2.0 (sim/README.md "Pass 5"): with seven departments sharing the reference
 * player's minutes and Richer Seams (a universal multiplier the buyer rightly prefers to Tap
 * Damage once it opens), the reference seed read 2.2-2.25x on screen.
 */
export const FIST_TIER = 2.0;
export const fistTierMult = (T: number) => FIST_TIER ** T;
/** Damage of one plain tap (no crit, beat or Frenzy) at the run's Tap Damage level and Pick Tier. */
export const fistDamage = (r: MinesRun) => tapDamage(r.tap) * fistTierMult(r.tier);
/** Expected tap damage including crits (for hints and the sim). */
export const tapExpected = (r: MinesRun) => fistDamage(r) * (1 + critChance(r.critC) * (critMult(r.critP) - 1));

// ---------- crew ----------

export const goblins = (r: MinesRun) => r.grunts + r.sappers;
/** Goblins on the wall: the hired crew plus `bones` free Bone Miners (Bones import, 00 §4), who
 * swing like Grunts, come last in the crew order and take crew slots (the wall still holds
 * MAX_GOBLINS). SIM-TUNED: as 3 extra goblins beyond the cap they added ~+35% to the crew's idle
 * rate and pulled the drum-on on-screen ratio from 2.68x to 2.33x (02 §3: 2.4-3.0x); inside the cap
 * they are three free hires, a post-Fall head start, as an import should be (small, 00 §4). */
export const crewSize = (r: MinesRun, bones = 0) => Math.min(MAX_GOBLINS, goblins(r) + Math.max(0, Math.min(3, bones)));
/** Crew slot i: hired Grunts, then Sappers, then Bone Miners. */
export const isSapperSlot = (r: MinesRun, i: number) => i >= r.grunts && i < goblins(r);
export const isBoneSlot = (r: MinesRun, i: number) => i >= goblins(r);
/** Stamina Stew (Potions import, 00 §4): every Nth tap is a guaranteed crit (30/25/20; 0 = off). */
export const stewEvery = (L: number) => (L > 0 ? 35 - 5 * Math.min(3, L) : 0);
export const stewCrit = (L: number, taps: number) => L > 0 && taps > 0 && taps % stewEvery(L) === 0;
export const hireCost = (r: MinesRun) => 25 * 1.6 ** goblins(r);
export const sapperCost = (r: MinesRun) => 2 * hireCost(r);
export const SAPPER_DEPTH = 10;
export const picksMult = (L: number) => 1.18 ** L; // TUNED: x1.15 -> x1.18
export const picksCost = (L: number) => 100 * 1.5 ** L;
export const PICKS_MAX = 40;
export const tierCost = (T: number) => 500 * 12 ** T;
export const TIER_MAX = 5;
/** Deepest depth the crew mines at full speed. */
export const tierDepth = (T: number) => 10 * (T + 1);
export const overdepth = (r: MinesRun) => (r.depth > tierDepth(r.tier) ? 0.4 : 1);
/** TUNED: each Pick Tier also multiplies crew DPS by 2.5, so the crew keeps pace with HP across strata. */
export const tierMult = (T: number) => 2.5 ** T;
export const drumSync = (r: MinesRun, p: MinesPersistent) => (p.drum ? 1 + 0.08 * r.drummers : 1);
export const GRUNT_DPS = 1;
export const SAPPER_DPS = 0.5;

/** DPS of one goblin of the given base at the current state (live tick uses the same number). */
export function goblinDps(base: number, r: MinesRun, p: MinesPersistent): number {
  return base * picksMult(r.picks) * tierMult(r.tier) * overdepth(r) * drumSync(r, p);
}

export function crewDps(r: MinesRun, p: MinesPersistent, bones = 0): number {
  return goblinDps((r.grunts + crewSize(r, bones) - goblins(r)) * GRUNT_DPS + r.sappers * SAPPER_DPS, r, p);
}

// ---------- shaft ----------

export const digCost = (d: number) => 100 * DIG_G ** d; // d = current max depth
const DIG_G = 1.36; // TUNED: growth 1.21 -> 1.36
export const supportsCost = (L: number) => 1e3 * 1.6 ** L;
export const SUPPORTS_MAX = 6;
export const caveInChance = (r: MinesRun) => (r.depth >= 15 ? 0.02 * Math.max(0, 1 - 0.15 * r.supports) : 0);
export const regrowCost = (L: number) => 300 * 1.4 ** L;
export const REGROW_MAX = 9;
export const regrowTime = (L: number) => Math.max(0.6, 1.5 - 0.1 * L);

// ---------- drum circle ----------

export const beatPeriod = (d: number) => Math.max(0.5, 0.7 - 0.03 * Math.floor((d - 1) / 10));
/** Half-width of the on-beat window in seconds. 02 §6E: 60 ms + 10 ms per Wide Swing level.
 * We read it as a half-width (±), which is kinder to touch latency on phones without calibration. */
export const beatWindow = (wide: number) => 0.06 + 0.01 * wide;
export const beatMult = (drumhead: number) => 2 + 0.1 * drumhead;
export const streakBonus = (streak: number) => 1 + 0.03 * Math.min(streak, 10);
export const drumheadCost = (L: number) => 400 * 1.6 ** L;
export const DRUMHEAD_MAX = 10;
export const wideCost = (L: number) => 600 * 1.9 ** L;
export const WIDE_MAX = 6;
export const frenzyCost = (L: number) => 1500 * 1.8 ** L;
export const FRENZY_MAX = 6;
export const frenzyPips = (L: number) => 8 - Math.max(0, Math.min(3, L - 1)); // L2-L4: -1 each
export const frenzyTapMult = (L: number) => 2 + 0.5 * Math.max(0, L - 4); // L5-L6: +0.5 each
export const FRENZY_GOBLIN_MULT = 1.5;
export const fuseCost = (L: number) => 500 * 1.7 ** L;
export const FUSE_MAX = 8;
export const frenzyBase = (fuse: number) => 5 + 0.5 * fuse;
export const frenzyCap = (fuse: number) => 10 + 0.5 * fuse;
export const drummerCost = (n: number) => 2500 * 2.2 ** n;
export const DRUMMERS_MAX = 4;

// ---------- infernal engineering (Gems, persistent) ----------

export const chainCost = (L: number) => 5 * 1.5 ** L;
export const CHAIN_MAX = 20;
export const chainChance = (L: number) => (L > 0 ? 0.05 + 0.015 * L : 0);
export const chainJumps = (L: number) => 2 + Math.floor(L / 5);
export const powderCost = (L: number) => 5 * 1.5 ** L;
export const POWDER_MAX = 10;
export const blastMult = (powder: number) => 10 + 2 * powder;
export const luckyCost = (L: number) => 6 * 1.5 ** L;
export const LUCKY_MAX = 20;

// ---------- idle ----------

/**
 * Seconds a goblin loses per rock between breaking one and swinging at the next: the hop
 * (scene.ts: 0.18 s + distance / 400 px/s, at most 0.5 s), crowding and waiting for regrowth.
 * SIM-TUNED: fitted to the live wall (sim/adapters/mines.ts, no taps) across 1-8 goblins and
 * 0.07-6 s of swinging per rock; it replaces the flat overkillEff 0.85, which overpaid a strong
 * crew by up to 2.5x (one-hit rocks spend most of their time hopping), so offline out-earned the
 * live wall late in a cycle.
 */
export const GOBLIN_HOP_S = 0.4;

/** Rocks per second the crew breaks at depth d: each goblin swings for avgHP / DPS, then hops,
 * softly bounded by the regrowth ceiling (25 tiles / regrow time). */
export function crewRocksPerSec(r: MinesRun, p: MinesPersistent, d = r.depth, bones = 0): number {
  const hp = H(d) * AVG_HP_F;
  const rr = d === r.depth ? r : { ...r, depth: d };
  let rocks = 0;
  for (const [n, base] of [
    [r.grunts + crewSize(r, bones) - goblins(r), GRUNT_DPS],
    [r.sappers, SAPPER_DPS],
  ]) {
    if (n <= 0) continue;
    const dps = goblinDps(base, rr, p);
    if (dps > 0) rocks += n / (hp / dps + GOBLIN_HOP_S);
  }
  // The regrowth ceiling acts as a soft limit: near it, goblins wait for tiles to regrow (sim fit).
  const ceil = TILES / regrowTime(r.regrow);
  return rocks > 0 ? 1 / Math.sqrt(1 / (rocks * rocks) + 1 / (ceil * ceil)) : 0;
}

/**
 * On-screen idle rate (Nuggets/s before core multipliers), 02 §3. Pure and cheap.
 * Crew rocks/s (swing time plus hop per rock), bounded by the regrowth ceiling (25 tiles /
 * regrow time), x the average reward of the spawn mix.
 */
export function idleNuggets(r: MinesRun, p: MinesPersistent, bones = 0): number {
  return crewRocksPerSec(r, p, r.depth, bones) * R(r.depth) * AVG_REWARD_F * oreMult(r);
}

/** Ingots (00 §4, 02 §16): 2% of Ore Veins yield one. Veins are VEIN_P of the non-keg spawn mix. */
export const INGOT_PER_VEIN = 0.02;
export function crewIngotsPerH(r: MinesRun, p: MinesPersistent, bones = 0): number {
  return crewRocksPerSec(r, p, r.depth, bones) * (VEIN_P / nonKeg) * INGOT_PER_VEIN * 3600;
}

/** Expected taps to break a common rock at depth d (lever hint). */
export function tapsPerRock(r: MinesRun, d: number, p?: MinesPersistent): number {
  let dmg = tapExpected(r);
  if (p?.drum && p.drumOn) dmg *= 1 + 0.5 * (beatMult(r.drumhead) - 1); // assume half the taps land on-beat
  return Math.max(1, Math.ceil(H(d) / dmg));
}

/** Fills fields missing from older saves (cheap; safe to call often). */
export function normalize(run: any, per: any): void {
  if (run && run.stats === undefined) Object.assign(run, { ...defaultRun(), ...run });
  if (run && run.stats) run.stats = { ...defaultStats(), ...run.stats };
  if (per && per.drumOn === undefined) Object.assign(per, { ...defaultPersistent(), ...per });
}

/*
 * TUNING (seed reasoning for the future balance sim; greedy bot at 6 taps/s that values
 * idle income x2 as much as active, Gems/kegs/drum ignored; scratch script, not shipped):
 *  - Raw spec seeds: depth 30 (first Infamy target) at ~14-20 min, and tap DPS ~300x the crew,
 *    so on-screen active:idle was ~100-300x. Two problems: Tap Damage (x2 per 25 levels on top of
 *    linear, plus crits to +420%) outgrew its 1.10 cost growth, and the crew (8 goblins, picks
 *    capped) could not follow HP across strata.
 *  - Fixes: crit caps 25% / x9 (now also spec R4-02), Tap Damage cost growth 1.20, Pick Tier also
 *    multiplies crew DPS x2.5, picks x1.18/L, HP growth 1.25 and reward 1.26 per depth (deeper is
 *    still slightly richer per HP), Dig Deeper 100 x 1.36^d.
 *  - Result: first Tap Damage at ~6 s, first goblin ~25 s, depth 6 at 2 min, 10 at 5 min, 20 at
 *    25 min, 30 at ~3.3 h active. Active:on-screen idle ~2.7x at 30 min, 1.8-2.6x from 1-3 h
 *    (pre-drum band 1.8-2.5x). Taps/rock at the pushed depth stays ~4-10.
 *  - Superseded in part by the balance sim (sim/README.md "Tuning log"): in the meta sim the crew
 *    outgrew taps once Pick Tier 4-5 landed (drum-on ratio 1.05x), and the flat overkill factor
 *    overpaid a one-hitting crew. FIST_TIER and the hop model above fix both.
 */
