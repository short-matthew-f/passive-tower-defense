// Goblin Mines: pure numbers and state (specs/02). No Pixi imports, so the balance
// simulation (and a quick node script) can load this file on its own.
//
// Seeds follow 02 §5-§6 except where the spec's own targets disagreed with them (02 says
// "where a seed and a band disagree, the band wins"). Changes, all marked TUNED below:
//  - Tap Damage cost growth 1.10 -> 1.16 and Dig Deeper base 100 -> 150: with the raw seeds a
//    greedy tapping bot reached depth 30 (the first Infamy target) in ~20 minutes, far ahead of the
//    3-6 h first-Fall band. See the TUNING note at the bottom of this file.

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
export const GRID = 5;
export const TILES = GRID * GRID;
export const GATE_ROCKS = 50;
export const OVERKILL_IDLE = 0.85;
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

/** Expected tap damage including crits (for hints and the sim). */
export const tapExpected = (r: MinesRun) => tapDamage(r.tap) * (1 + critChance(r.critC) * (critMult(r.critP) - 1));

// ---------- crew ----------

export const goblins = (r: MinesRun) => r.grunts + r.sappers;
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

export function crewDps(r: MinesRun, p: MinesPersistent): number {
  return goblinDps(r.grunts * GRUNT_DPS + r.sappers * SAPPER_DPS, r, p);
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
 * On-screen idle rate (Nuggets/s before core multipliers), 02 §3. Pure and cheap.
 * goblinDPS -> rocks/s, bounded by the regrowth ceiling (25 tiles / regrow time), x overkill.
 */
export function idleNuggets(r: MinesRun, p: MinesPersistent): number {
  const dps = crewDps(r, p);
  if (dps <= 0) return 0;
  const d = r.depth;
  const rocksPerSec = Math.min(dps / (H(d) * AVG_HP_F), TILES / regrowTime(r.regrow)) * OVERKILL_IDLE;
  return rocksPerSec * R(d) * AVG_REWARD_F;
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
 * TUNING (seed reasoning for the future balance sim; numbers from a greedy 6 taps/s bot,
 * scratch script, Gems ignored):
 *  - Raw spec seeds: first Tap Damage at ~5 s, depth 30 at ~20 min. Far too fast for a
 *    "first Fall on day 3" department, because Tap Damage (x2 every 25 levels on top of linear)
 *    outgrew its 1.10 cost growth and Dig Deeper was the only real wall.
 *  - With Tap Damage growth 1.16 and Dig base 150 the bot reaches depth 30 after about 4 h
 *    of active play, first upgrade at ~6 s (bands: < 60 s, first Fall 3-4 h ±1 h). See index.ts
 *    for econBase/rankRef/rankTarget, which come from the same run.
 */
