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
  /** Motherlodes broken (each yields MOTHER_INGOTS Ingots, counted by the export). */
  mothers: number;
  /** Rocks broken since the last Motherlode spawned (one every MOTHER_EVERY rocks). */
  sinceMother: number;
  /** Bedrock blasted open (3 Gems each). */
  bedrock: number;
  /** Thunder Beats landed. */
  thunders: number;
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
  knuckles: number; // Heavy Knuckles (later)
  // B. Crew
  grunts: number;
  sappers: number;
  shockers: number; // later, unlock depth 20
  prospectors: number; // later, unlock depth 30
  picks: number;
  tier: number;
  // D. Shaft
  supports: number;
  regrow: number;
  lanterns: number; // later: gas duration -1 s per level
  // E. Drum Circle (Nugget levels; the drum itself is persistent)
  drumhead: number;
  wide: number;
  frenzy: number;
  fuse: number;
  drummers: number;
  steadyH: number; // Steady Hands (later)
  whip: number; // Gritch's Whip (later)
  encore: number; // Encore (later)
  /** Richer Seams, the long node (core/longnode.ts): every rock pays x1.15 per level. */
  seams: number;
  /** Rocks broken on screen per depth this cycle (Infamy skill gate: 50 at the target). */
  gate: Record<string, number>;
  stats: MinesStats;
}

export type Tempo = 'march' | 'stomp' | 'charge';

export interface MinesPersistent {
  gems: number;
  gemsEver: number;
  chain: number; // Chain Lightning
  powder: number; // Blasting Powder
  lucky: number; // Lucky Rocks
  magma: number; // Magma Pick (later)
  echo: number; // Echo Strike (later)
  thunder: number; // Thunder Beat (later, Gems)
  tempoL: number; // Tempo Lever level (later, Gems): 1 = Stomp, 2 = Charge
  tempo: Tempo; // the chosen tempo option
  drum: boolean; // the Doom Drum, kept through Falls
  drumOn: boolean; // its on/off switch, also kept (02 §6E)
  // Player/device options (hold-to-auto-hit, Steady Drum, drum latency) live in the suite settings
  // now (meta.settings.depts.mines, see index.ts `settings`); older saves' fields here move there
  // on load. `latency` stays as the headless default the balance sim reads.
  latency: number; // default touch-to-beat latency in seconds (the live game reads settings)
  /** Gems credited while away (DeptDef.onOffline) and not yet shown on the wall. */
  gemAway: number;
  /** Fractional Gems earned while away (offline gemRate, 02 §3). */
  gemFrac: number;
  /** Last time (ms) the wall was on screen, for offline Gems. 0 = never. */
  gemAt: number;
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
  return {
    taps: 0,
    rocks: 0,
    crits: 0,
    veins: 0,
    geodes: 0,
    kegs: 0,
    beatHits: 0,
    frenzies: 0,
    bestStreak: 0,
    lightning: 0,
    mothers: 0,
    sinceMother: 0,
    bedrock: 0,
    thunders: 0,
  };
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
    knuckles: 0,
    grunts: 0,
    sappers: 0,
    shockers: 0,
    prospectors: 0,
    picks: 0,
    tier: 0,
    supports: 0,
    regrow: 0,
    lanterns: 0,
    drumhead: 0,
    wide: 0,
    frenzy: 0,
    fuse: 0,
    drummers: 0,
    steadyH: 0,
    whip: 0,
    encore: 0,
    seams: 0,
    gate: {},
    stats: defaultStats(),
  };
}

export function defaultPersistent(): MinesPersistent {
  return {
    gems: 0,
    gemsEver: 0,
    chain: 0,
    powder: 0,
    lucky: 0,
    magma: 0,
    echo: 0,
    thunder: 0,
    tempoL: 0,
    tempo: 'march',
    drum: false,
    drumOn: true,
    latency: BEAT_LATENCY,
    gemAway: 0,
    gemFrac: 0,
    gemAt: 0,
  };
}

// ---------- rocks ----------

/** Common rock HP at depth d. */
export const H = (d: number) => 10 * 1.25 ** (d - 1); // TUNED: growth 1.17 -> 1.25
/** Common rock reward at depth d. */
export const R = (d: number) => 2 * 1.26 ** (d - 1); // TUNED: growth 1.19 -> 1.26

export type RockKind =
  | 'common'
  | 'vein'
  | 'geode'
  | 'keg'
  | 'rubble'
  | 'mother' // Motherlode (later): one every MOTHER_EVERY rocks
  | 'gas' // Gas Rock (later, d >= 25)
  | 'bedrock' // Bedrock (later, d >= 30): blasts and lightning only
  | 'magnet' // stratum behaviours (later, D-14): Iron
  | 'mirror' // Crystal
  | 'hot' // Magma
  | 'hollow'; // Abyss

export const VEIN_P = 0.08;
export const GEODE_P = 0.005;
export const kegP = (powder: number) => 0.03 + 0.005 * powder;
/** Prospectors: +2% vein spawn each, at most +10% (02 §5). */
export const PROSPECT_P = 0.02;
export const PROSPECT_CAP = 0.1;
export const veinP = (prospectors: number) => VEIN_P + Math.min(PROSPECT_CAP, PROSPECT_P * prospectors);
export const GAS_DEPTH = 25;
export const GAS_P = 0.04;
export const BEDROCK_DEPTH = 30;
export const BEDROCK_P = 0.03;
/** Blasted bedrock holds a Gem 1 time in BEDROCK_GEM_EVERY. SIM-TUNED (02 §5 says 3 Gems each):
 * at 3% of spawns and 3 Gems apiece, bedrock out-paid Geodes ~18x below depth 30, and the Gems
 * then bought enough active nodes to lift the drum-on on-screen ratio past 4x (band 2.4-3.0x).
 * At 1 in 6 it pays about what the Geodes do. */
export const BEDROCK_GEMS = 1;
export const BEDROCK_GEM_EVERY = 6;
/** Stratum behaviour rocks: each stratum from Iron on adds one, at this spawn share each. */
export const BEHAVIOUR_P = 0.05;
export const BEHAVIOURS: RockKind[] = ['magnet', 'mirror', 'hot', 'hollow']; // Iron, Crystal, Magma, Abyss
export const MOTHER_EVERY = 200;
export const MOTHER_INGOTS = 5;

export const KIND_HP: Record<RockKind, number> = {
  common: 1,
  vein: 2,
  geode: 3,
  keg: 0,
  rubble: 0,
  mother: 15,
  gas: 1,
  bedrock: 0,
  magnet: 1,
  mirror: 1,
  hot: 1,
  hollow: 1, // per shell; two shells
};
/** Reward per break as a multiple of R(d). A Hollow rock pays HOLLOW_OUTER for its outer shell. */
export const KIND_REWARD: Record<RockKind, number> = {
  common: 1,
  vein: 5,
  geode: 1,
  keg: 0,
  rubble: 0,
  mother: 40,
  gas: 1.5,
  bedrock: 0,
  magnet: 1.2,
  mirror: 1.2,
  hot: 1.2,
  hollow: 2,
};
export const HOLLOW_OUTER = 0.5;

/** Behaviour rocks open by stratum: Iron (index 2) adds Magnet, Crystal Mirror, Magma Hot, Abyss Hollow. */
export function behavioursAt(d: number): RockKind[] {
  const st = stratumOf(d);
  return st < 2 ? [] : BEHAVIOURS.slice(0, st - 1);
}

/**
 * The spawn table at depth d (02 §5): probabilities of each kind except Motherlodes, which come
 * one every MOTHER_EVERY rocks. Common takes the remainder. Kegs first (Blasting Powder).
 */
export function spawnTable(d: number, powder: number, prospectors: number): [RockKind, number][] {
  const t: [RockKind, number][] = [
    ['keg', kegP(powder)],
    ['geode', GEODE_P],
    ['vein', veinP(prospectors)],
  ];
  if (d >= GAS_DEPTH) t.push(['gas', GAS_P]);
  if (d >= BEDROCK_DEPTH) t.push(['bedrock', BEDROCK_P]);
  for (const b of behavioursAt(d)) t.push([b, BEHAVIOUR_P]);
  return t;
}

/** Rolls a kind from the spawn table with x in [0, 1). */
export function rollKind(x: number, d: number, powder: number, prospectors: number): RockKind {
  let acc = 0;
  for (const [k, p] of spawnTable(d, powder, prospectors)) {
    acc += p;
    if (x < acc) return k;
  }
  return 'common';
}

const KEG_REF = 0.03; // the averages below hold the keg share at its base (Powder only adds kegs)

/** Average HP and reward factors (x H(d), x R(d)) of the rocks the crew chews through: the
 * spawn mix without kegs and bedrock, plus one Motherlode per MOTHER_EVERY rocks. */
export function avgFactors(d: number, prospectors = 0): { hp: number; reward: number; vein: number; gas: number } {
  let w = 0;
  let hp = 0;
  let rw = 0;
  let others = 0;
  let vein = 0;
  let gas = 0;
  for (const [k, p] of spawnTable(d, 0, prospectors)) {
    if (k === 'keg') continue;
    others += p;
    if (k === 'bedrock') continue;
    w += p;
    hp += p * KIND_HP[k] * (k === 'hollow' ? 2 : 1);
    rw += p * (KIND_REWARD[k] + (k === 'hollow' ? HOLLOW_OUTER : 0));
    if (k === 'vein') vein += p;
    if (k === 'gas') gas += p;
  }
  const common = 1 - KEG_REF - others;
  w += common;
  hp += common;
  rw += common;
  hp /= w;
  rw /= w;
  // One Motherlode among every MOTHER_EVERY rocks.
  const m = 1 / MOTHER_EVERY;
  return {
    hp: hp * (1 - m) + KIND_HP.mother * m,
    reward: rw * (1 - m) + KIND_REWARD.mother * m,
    vein: (vein / w) * (1 - m),
    gas: (gas / w) * (1 - m),
  };
}

/** Kept for callers of the old constants: the depth-1 averages (no Motherlode). */
export const AVG_HP_F = (1 - VEIN_P - GEODE_P - KEG_REF + VEIN_P * 2 + GEODE_P * 3) / (1 - KEG_REF); // ~1.093
export const AVG_REWARD_F = (1 - VEIN_P - GEODE_P - KEG_REF + VEIN_P * 5 + GEODE_P) / (1 - KEG_REF); // ~1.33

export const gemChance = (lucky: number) => GEODE_P / (1 - KEG_REF) + 0.001 * lucky;

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
/** Keen Eye: Veins, Geodes and Motherlodes glint this long before they finish regrowing. */
export const KEEN_GLINT_S = 1;
export const keenBonus = (L: number) => 1 + 0.1 * L;
/** Heavy Knuckles (later): each tap splashes 15%/L (cap 60%) of the damage it dealt (overkill
 * excluded), shared by the rocks in the 4 adjacent sockets. SIM-TUNED reading of 02 §6A: as 60% of
 * the full tap onto *each* neighbour, a one-hit tap became five kills and the node alone pushed
 * the drum-on on-screen ratio from ~2.5x to ~3.8x (band 2.4-3.0x). */
export const knucklesCost = (L: number) => 1e3 * 1.9 ** L;
export const KNUCKLES_MAX = 4;
export const knucklesSplash = (L: number) => 0.15 * Math.min(KNUCKLES_MAX, L);

/**
 * SIM-TUNED: the gauntlet is forged at the crew's Pick Tier, so each tier multiplies tap damage
 * too (x1.9 per tier, against the crew's x2.5). Before, tiers multiplied only the crew (x98 at
 * tier 5), taps fell to ~5% of income and the drum-on on-screen ratio was 1.05x (02 §3: 2.4-3.0x).
 * The ratio is steep in this number (tier^5): x1.6 gives ~1.8x, x2.0 ~3.4x, x2.5 lets taps carry
 * the whole department (~10x the crew); x1.9 lands the drum-on reference bot at ~2.8x.
 * SIM-TUNED 1.9 -> 2.0 (sim/README.md "Pass 5"): with seven departments sharing the reference
 * player's minutes and Richer Seams (a universal multiplier the buyer rightly prefers to Tap
 * Damage once it opens), the reference seed read 2.2-2.25x on screen.
 * SIM-TUNED 2.0 -> 1.8 (finishing pass): Heavy Knuckles, Magma Pick, Echo Strike, Thunder Beat,
 * offline Gems and Motherlodes all add to the taps, and at 2.0 the drum-on ratio read ~3.7x; at
 * 1.8 (with econBase 4e10) the 3-seed median is 2.69x (band 2.4-3.0x, centre 2.7x).
 */
export const FIST_TIER = 1.8;
export const fistTierMult = (T: number) => FIST_TIER ** T;
/** Damage of one plain tap (no crit, beat or Frenzy) at the run's Tap Damage level and Pick Tier. */
export const fistDamage = (r: MinesRun) => tapDamage(r.tap) * fistTierMult(r.tier);
/** Expected tap damage including crits (for hints and the sim). */
export const tapExpected = (r: MinesRun) => fistDamage(r) * (1 + critChance(r.critC) * (critMult(r.critP) - 1));
/** Hold-to-auto-hit rate (02 §10): slower than real play, never judged by the drum. */
export const HOLD_RATE = 4;

// ---------- crew ----------

export type GobKind = 'grunt' | 'sapper' | 'shocker' | 'prospector' | 'bone';

export const goblins = (r: MinesRun) => r.grunts + r.sappers + (r.shockers ?? 0) + (r.prospectors ?? 0);
/** Goblins on the wall: the hired crew plus `bones` free Bone Miners (Bones import, 00 §4), who
 * swing like Grunts, come last in the crew order and take crew slots (the wall still holds
 * MAX_GOBLINS). SIM-TUNED: as 3 extra goblins beyond the cap they added ~+35% to the crew's idle
 * rate and pulled the drum-on on-screen ratio from 2.68x to 2.33x (02 §3: 2.4-3.0x); inside the cap
 * they are three free hires, a post-Fall head start, as an import should be (small, 00 §4). */
export const crewSize = (r: MinesRun, bones = 0) => Math.min(MAX_GOBLINS, goblins(r) + Math.max(0, Math.min(3, bones)));
/** Crew slot i: hired Grunts, then Sappers, Shockers, Prospectors, then Bone Miners. */
export function slotKind(r: MinesRun, i: number): GobKind {
  let n = r.grunts;
  if (i < n) return 'grunt';
  if (i < (n += r.sappers)) return 'sapper';
  if (i < (n += r.shockers ?? 0)) return 'shocker';
  if (i < (n += r.prospectors ?? 0)) return 'prospector';
  return 'bone';
}
export const isSapperSlot = (r: MinesRun, i: number) => slotKind(r, i) === 'sapper';
export const isBoneSlot = (r: MinesRun, i: number) => slotKind(r, i) === 'bone';
/** Stamina Stew (Potions import, 00 §4): every Nth tap is a guaranteed crit (30/25/20; 0 = off). */
export const stewEvery = (L: number) => (L > 0 ? 35 - 5 * Math.min(3, L) : 0);
export const stewCrit = (L: number, taps: number) => L > 0 && taps > 0 && taps % stewEvery(L) === 0;
export const hireCost = (r: MinesRun) => 25 * 1.6 ** goblins(r);
export const sapperCost = (r: MinesRun) => 2 * hireCost(r);
export const shockerCost = (r: MinesRun) => 3 * hireCost(r);
export const prospectorCost = (r: MinesRun) => 3 * hireCost(r);
export const SAPPER_DEPTH = 10;
/** A Sapper plants a keg this often (seconds). */
export const SAPPER_PLANT_S = 20;
export const SHOCKER_DEPTH = 20;
export const PROSPECTOR_DEPTH = 30;
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
export const SHOCKER_DPS = 0.5;
export const PROSPECTOR_DPS = 0.3;
/** Shocker: Chain Lightning every SHOCK_EVERY s, SHOCK_JUMPS jumps of 2x its DPS each (02 §5). */
export const SHOCK_EVERY = 6;
export const SHOCK_JUMPS = 4;
export const SHOCK_DMG = 2;
/** A Shocker's swing plus its lightning, as a steady DPS for idleRate. */
export const SHOCKER_EFF = SHOCKER_DPS * (1 + (SHOCK_JUMPS * SHOCK_DMG) / SHOCK_EVERY);
export const baseDps = (k: GobKind) =>
  k === 'sapper' ? SAPPER_DPS : k === 'shocker' ? SHOCKER_DPS : k === 'prospector' ? PROSPECTOR_DPS : GRUNT_DPS;

/** DPS of one goblin of the given base at the current state (live tick uses the same number). */
export function goblinDps(base: number, r: MinesRun, p: MinesPersistent): number {
  return base * picksMult(r.picks) * tierMult(r.tier) * overdepth(r) * drumSync(r, p);
}

/** The crew's base DPS groups [count, base DPS] (Bone Miners swing as Grunts; Shockers counted
 * with their lightning). */
function crewGroups(r: MinesRun, bones: number): [number, number][] {
  return [
    [r.grunts + crewSize(r, bones) - goblins(r), GRUNT_DPS],
    [r.sappers, SAPPER_DPS],
    [r.shockers ?? 0, SHOCKER_EFF],
    [r.prospectors ?? 0, PROSPECTOR_DPS],
  ];
}

export function crewDps(r: MinesRun, p: MinesPersistent, bones = 0): number {
  let base = 0;
  for (const [n, b] of crewGroups(r, bones)) base += Math.max(0, n) * b;
  return goblinDps(base, r, p);
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
/** Lanterns (later): gas lasts 8 s, -1 s per level (cap -6). */
export const lanternsCost = (L: number) => 2e3 * 1.6 ** L;
export const LANTERNS_MAX = 6;
export const gasDuration = (L: number) => 8 - Math.min(LANTERNS_MAX, L);
export const GAS_SLOW = 0.5;
/** Bedrock in steady state blocks about this share of the wall (it clears only by blasts and
 * lightning); idleRate's regrowth ceiling counts the rest. Fitted to the live wall. */
export const BEDROCK_BLOCK = 0.2;

// ---------- drum circle ----------

/** Tempo options (Tempo Lever, later): period, window and Beat Hit multiplier adjustments. */
export const TEMPO: Record<Tempo, { period: number; window: number; mult: number; name: string }> = {
  march: { period: 1, window: 1, mult: 0, name: 'MARCH' },
  stomp: { period: 1.25, window: 1.4, mult: -0.3, name: 'STOMP' },
  charge: { period: 0.8, window: 0.8, mult: 0.3, name: 'CHARGE' },
};
export const TEMPO_ORDER: Tempo[] = ['march', 'stomp', 'charge'];
export const tempoOf = (p: MinesPersistent): Tempo => {
  const t = p.tempo ?? 'march';
  const idx = TEMPO_ORDER.indexOf(t);
  return idx > 0 && idx <= (p.tempoL ?? 0) ? t : 'march';
};
export const beatPeriod = (d: number, tempo: Tempo = 'march') => Math.max(0.5, 0.7 - 0.03 * Math.floor((d - 1) / 10)) * TEMPO[tempo].period;
/** Half-width of the on-beat window in seconds. 02 §6E: 60 ms + 10 ms per Wide Swing level.
 * We read it as a half-width (±), which is kinder to touch latency on phones without calibration.
 * Steady Drum doubles it. */
export const beatWindow = (wide: number, tempo: Tempo = 'march', steady = false) =>
  (0.06 + 0.01 * wide) * TEMPO[tempo].window * (steady ? 2 : 1);
export const beatMult = (drumhead: number, tempo: Tempo = 'march') => 2 + 0.1 * drumhead + TEMPO[tempo].mult;
export const streakBonus = (streak: number) => 1 + 0.03 * Math.min(streak, 10);
/** Default touch-to-beat latency before calibration. */
export const BEAT_LATENCY = 0.04;
export const LATENCY_MAX = 0.25;
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
/** Steady Hands (later): forgives L missed judged taps per streak; pips decay every 3 + L s. */
export const steadyCost = (L: number) => 3000 * 2.5 ** L;
export const STEADY_MAX = 3;
export const pipDecayS = (L: number) => 3 + Math.min(STEADY_MAX, L);
/** Gritch's Whip (later): +10%/L goblin DPS during Frenzy. */
export const whipCost = (L: number) => 2e3 * 1.5 ** L;
export const WHIP_MAX = 10;
export const whipMult = (L: number) => 1 + 0.1 * L;
/** Encore (later): after Frenzy the drummers keep a war rhythm: goblins x1.25 for 3 s/L. */
export const encoreCost = (L: number) => 8000 * 2 ** L;
export const ENCORE_MAX = 5;
export const ENCORE_MULT = 1.25;
export const encoreDur = (L: number) => 3 * L;
/** Thunder Beat (later, Gems): every 16th beat; a Beat Hit on it fires Chain Lightning, +L jumps. */
export const thunderCost = (L: number) => 12 * 1.6 ** L;
export const THUNDER_MAX = 5;
export const THUNDER_EVERY = 16;
/** Tempo Lever (later, Gems): L1 Stomp, L2 Charge. */
export const tempoCost = (L: number) => 10 * 2 ** L;
export const TEMPO_MAX = 2;

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
/** Magma Pick (later): taps leave a burn of 20% of the tap's damage per second for 3 s + 0.5 s/L. */
export const magmaCost = (L: number) => 8 * 1.6 ** L;
export const MAGMA_MAX = 10;
export const MAGMA_DPS = 0.2;
export const magmaDur = (L: number) => (L > 0 ? 3 + 0.5 * L : 0);
/** Echo Strike (later): 3%/L chance a tap repeats 0.3 s later. */
export const echoCost = (L: number) => 10 * 1.7 ** L;
export const ECHO_MAX = 10;
export const echoChance = (L: number) => 0.03 * L;
export const ECHO_DELAY = 0.3;

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

/** Extra rocks broken by kegs that blow by themselves (fitted to the live wall). */
export const KEG_FREE = 1.05;
/** Rubble tiles per cave-in (3-5), each costing a goblin a hop for no reward. */
export const RUBBLE_PER_CAVE = 4;

/** Rocks per second the crew breaks at depth d: each goblin swings for avgHP / DPS, then hops,
 * softly bounded by the regrowth ceiling (live tiles / (regrow time + a hop)). Cave-in rubble adds
 * wasted hops; gas slows goblins caught in a cloud and bedrock blocks part of the wall. Kegs that
 * blow by themselves count as a flat KEG_FREE share: their blast scales with the fist, and an
 * exact term would make Tap Damage an idle upgrade (the greedy buyer then poured Nuggets into
 * taps and the drum-on ratio jumped to ~3.7x). */
export function crewRocksPerSec(r: MinesRun, p: MinesPersistent, d = r.depth, bones = 0): number {
  const f = avgFactors(d, r.prospectors ?? 0);
  const hp = H(d) * f.hp;
  const rr = d === r.depth ? r : { ...r, depth: d };
  const tiles = TILES * (d >= BEDROCK_DEPTH ? 1 - BEDROCK_BLOCK : 1);
  // A regrown socket waits about one hop before a goblin reaches it.
  const ceil = tiles / (regrowTime(r.regrow) + GOBLIN_HOP_S);
  const cave = d >= 15 ? 0.02 * Math.max(0, 1 - 0.15 * (r.supports ?? 0)) : 0;
  const hop = GOBLIN_HOP_S * (1 + RUBBLE_PER_CAVE * cave);
  const pass = (slow: number) => {
    let rocks = 0;
    for (const [n, base] of crewGroups(r, bones)) {
      if (n <= 0) continue;
      const dps = goblinDps(base, rr, p) * slow;
      if (dps > 0) rocks += n / (hp / dps + hop);
    }
    // The regrowth ceiling acts as a soft limit: near it, goblins wait for tiles to regrow (sim fit).
    return rocks > 0 ? 1 / Math.sqrt(1 / (rocks * rocks) + 1 / (ceil * ceil)) : 0;
  };
  let rocks = pass(1);
  if (f.gas > 0 && rocks > 0) {
    // Each gas break clouds ~7 of 25 tiles (a 3x3, clipped at the edges) for gasDuration seconds;
    // overlapping clouds saturate. Two fixed-point passes are plenty.
    for (let k = 0; k < 2; k++) {
      const covered = 1 - Math.exp(-rocks * f.gas * gasDuration(r.lanterns ?? 0) * (7 / TILES));
      rocks = pass(1 - (1 - GAS_SLOW) * covered);
    }
  }
  return rocks * KEG_FREE;
}

/**
 * On-screen idle rate (Nuggets/s before core multipliers), 02 §3. Pure and cheap.
 * Crew rocks/s (swing time plus hop per rock), bounded by the regrowth ceiling, x the average
 * reward of the spawn mix (Motherlodes included).
 */
export function idleNuggets(r: MinesRun, p: MinesPersistent, bones = 0): number {
  return crewRocksPerSec(r, p, r.depth, bones) * R(r.depth) * avgFactors(r.depth, r.prospectors ?? 0).reward * oreMult(r);
}

/** Expected Gems per second from the idle crew (02 §3: gemRate = rocksPerSec x gemChance). */
export function idleGems(r: MinesRun, p: MinesPersistent, bones = 0): number {
  return crewRocksPerSec(r, p, r.depth, bones) * gemChance(p.lucky ?? 0);
}

/** Gems earned while away (02 §3 gemRate, at the suite's offline factor), credited on the next
 * entry. SIM-TUNED cap: OFFLINE_GEMS_PER_H. Uncapped, a strong crew's overnight Geodes (~10
 * rocks/s) paid ~20x the Gems of active play, maxed the Gem nodes within days and lifted the
 * drum-on on-screen ratio to ~5x (band 2.4-3.0x). */
export const OFFLINE_GEMS_PER_H = 1;
export function offlineGems(r: MinesRun, p: MinesPersistent, bones: number, factor: number, seconds: number): number {
  const s = Math.max(0, seconds);
  return Math.min(idleGems(r, p, bones) * factor * s, (OFFLINE_GEMS_PER_H * s) / 3600);
}

/** Ingots (00 §4, 02 §16): 2% of Ore Veins yield one. Motherlodes (5 each) spawn only on the live
 * wall, so they count through the export counter, not the passive rate. */
export const INGOT_PER_VEIN = 0.02;
export function crewIngotsPerH(r: MinesRun, p: MinesPersistent, bones = 0): number {
  return crewRocksPerSec(r, p, r.depth, bones) * avgFactors(r.depth, r.prospectors ?? 0).vein * INGOT_PER_VEIN * 3600;
}

/** Expected taps to break a common rock at depth d (lever hint). */
export function tapsPerRock(r: MinesRun, d: number, p?: MinesPersistent): number {
  let dmg = tapExpected(r);
  if (p?.drum && p.drumOn) dmg *= 1 + 0.5 * (beatMult(r.drumhead, tempoOf(p)) - 1); // assume half the taps land on-beat
  return Math.max(1, Math.ceil(H(d) / dmg));
}

/** Fills fields missing from older saves (cheap; safe to call often). */
export function normalize(run: any, per: any): void {
  if (run) {
    const def = defaultRun() as any;
    for (const k in def) if (run[k] === undefined) run[k] = def[k];
    if (!run.gate || typeof run.gate !== 'object') run.gate = {};
    const st = defaultStats() as any;
    for (const k in st) if (run.stats[k] === undefined) run.stats[k] = st[k];
  }
  if (per) {
    const def = defaultPersistent() as any;
    for (const k in def) if (per[k] === undefined) per[k] = def[k];
    if (!TEMPO_ORDER.includes(per.tempo)) per.tempo = 'march';
    if (!Number.isFinite(per.latency)) per.latency = BEAT_LATENCY;
  }
}

/** True once every field normalize() fills is present (cheap check for hot paths). */
export const isNormal = (run: any, per: any) => run?.stats?.thunders !== undefined && run.encore !== undefined && per?.gemAt !== undefined;

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
