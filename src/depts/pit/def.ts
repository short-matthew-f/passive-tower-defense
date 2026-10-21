// The War Pit's pure economy (specs/07 §3, §6-§8; 00 §2.2). No Pixi: the shared core, the
// headless balance simulation and the scene all read this. index.ts spreads `pitEcon` into the
// full DeptDef.
import type { Commendation, DeptEcon } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { battle, battleSeed, hashStr, type Fighter } from './engine';
import {
  BASE_GRIT,
  PARAMS_VERSION,
  battleTeeth,
  lvlOf,
  newPet,
  prepareLine,
  rival,
  type Pet,
  type RunOpts,
  type RunState,
  type ShopUnit,
} from './run';
import { BASE_POOL, BESTIARY, UNITS, type UnitId } from './units';

// ---------- save shapes ----------

export interface PitStats {
  runs: number;
  triumphs: number;
  retreats: number;
  lowRetreats: number; // consecutive Retreats under 3 wins (Snarl's "Drop Stakes?")
  battlesWon: number;
  bestWins: number;
  stations: number;
  captives: number; // Captives taken this cycle (Goods export counter)
}

export interface PitRun {
  bank: number;
  lv: Record<string, number>;
  stakes: number; // the dial setting
  stakesBought: number; // highest Stakes bought this cycle
  garrison: Pet[]; // the Standing Warband (front first)
  history: Pet[][]; // last 3 finished warbands
  cur: RunState | null; // the open (possibly paused) Run
  /** Pit Crowns this cycle: Triumph count per Stakes level. */
  crowns: Record<string, number>;
  stats: PitStats;
  /** Battle playback speed preference (1, 2 or 4). */
  speed?: number;
}

export interface PitPersistent {
  crests: number;
  crestsEver: number;
  beasts: UnitId[]; // Bestiary unlocks
  ped: Record<string, number>; // Pedigrees
  carry: ShopUnit | null; // frozen unit carried into the next Run (Pedigree)
  life: { triumphs: number; l3: number; battlesWon: number; crownsEver: number; bestStakesCrown: number };
}

export type PitSave = DeptSave<PitRun, PitPersistent>;

export function defaultStats(): PitStats {
  return { runs: 0, triumphs: 0, retreats: 0, lowRetreats: 0, battlesWon: 0, bestWins: 0, stations: 0, captives: 0 };
}

/** The starter garrison (07 §3): Gutter Rat, Stirge, Tusk Piglet. */
export function starterGarrison(): Pet[] {
  return [newPet('rat'), newPet('piglet'), newPet('stirge')];
}

/** Snarl's opening purse, on unlock and after each Fall (07 §3). */
export const OPENING_PURSE = 120;

export function defaultRun(): PitRun {
  return {
    bank: OPENING_PURSE,
    lv: {},
    stakes: 0,
    stakesBought: 0,
    garrison: starterGarrison(),
    history: [],
    cur: null,
    crowns: {},
    stats: defaultStats(),
  };
}

export function defaultPersistent(): PitPersistent {
  return { crests: 0, crestsEver: 0, beasts: [], ped: {}, carry: null, life: { triumphs: 0, l3: 0, battlesWon: 0, crownsEver: 0, bestStakesCrown: -1 } };
}

/** Fill fields added after a save was written (cheap; safe to call often). */
export function normalize(run: PitRun, per: PitPersistent): void {
  run.lv ??= {};
  run.stakes ??= 0;
  run.stakesBought ??= 0;
  run.garrison ??= starterGarrison();
  run.history ??= [];
  run.cur ??= null;
  run.crowns ??= {};
  run.stats = { ...defaultStats(), ...(run.stats ?? {}) };
  run.stakes = Math.max(0, Math.min(run.stakes, run.stakesBought));
  per.crests ??= 0;
  per.crestsEver ??= 0;
  per.beasts ??= [];
  per.ped ??= {};
  per.carry ??= null;
  per.life = { ...defaultPersistent().life, ...(per.life ?? {}) };
}

// ---------- upgrades (07 §6) ----------

export type Branch = 'pens' | 'spoils' | 'kennels';

export interface UpDef {
  id: string;
  name: string;
  branch: Branch;
  base: number;
  growth: number;
  max: number;
  desc(l: number): string;
}

export const UPGRADES: UpDef[] = [
  { id: 'hardy', name: 'Hardy Stock', branch: 'pens', base: 100, growth: 1.5, max: 25, desc: (l) => `Beasts +${4 * l}% > +${4 * (l + 1)}% atk & hp` },
  { id: 'larder', name: 'Larder', branch: 'pens', base: 500, growth: 4, max: 2, desc: (l) => `Chow per round ${10 + l} > ${11 + l}` },
  { id: 'pen', name: 'Pen Space', branch: 'pens', base: 800, growth: 3, max: 2, desc: (l) => (l === 0 ? 'Shop slot 4 from round 3' : 'Shop slot 5 from round 5') },
  { id: 'freeroll', name: 'Free Roll', branch: 'pens', base: 1500, growth: 1, max: 1, desc: () => 'First roll each round free' },
  { id: 'scout', name: 'Scouting', branch: 'pens', base: 250, growth: 2, max: 2, desc: (l) => (l === 0 ? 'See rival stats' : 'See rival levels and items') },
  { id: 'pliers', name: 'Tooth Pliers', branch: 'spoils', base: 120, growth: 1.55, max: Infinity, desc: (l) => `Teeth x${pliersMult(l).toFixed(2)} > x${pliersMult(l + 1).toFixed(2)}` },
  { id: 'showman', name: 'Showman', branch: 'spoils', base: 300, growth: 1.7, max: 20, desc: (l) => `Run-end bonus +${10 * l}% > +${10 * (l + 1)}%` },
  { id: 'grit', name: 'Grit', branch: 'spoils', base: 800, growth: 5, max: 2, desc: (l) => `Grit hearts ${BASE_GRIT + l} > ${BASE_GRIT + l + 1}` },
  { id: 'pace', name: 'Skirmish Pace', branch: 'kennels', base: 60, growth: 1.9, max: 6, desc: (l) => `Gauntlet every ${intervalL(l)}s > ${intervalL(l + 1)}s` },
  { id: 'drill', name: 'Drill Yard', branch: 'kennels', base: 300, growth: 1.9, max: 15, desc: (l) => `Garrison +${l}/+${l} > +${l + 1}/+${l + 1}` },
];
export const UP: Record<string, UpDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upCost(u: UpDef, level: number): number {
  return Math.ceil(u.base * u.growth ** level);
}

export const lvOf = (run: PitRun, id: string) => run.lv?.[id] ?? 0;

/** Tooth Pliers: +6% all Teeth per level, x2 at every 10th level (07 §6, W-01). */
export const pliersMult = (l: number) => (1 + 0.06 * l) * 2 ** Math.floor(l / 10);
export const intervalL = (l: number) => 40 - 2.5 * Math.min(6, l);

/** Stakes level S+1 costs 300 x 2.2^S Teeth (07 §7). */
export const STAKES_MAX = 20;
export function stakesCost(bought: number): number {
  return Math.ceil(300 * 2.2 ** bought);
}

/** Tactics cards (07 §7, MVP 3/6/9). */
export const TACTICS: { at: number; name: string; text: string }[] = [
  { at: 3, name: 'MUZZLED FRONT', text: 'RIVAL FRONT UNIT GAINS ARMOR 1' },
  { at: 6, name: 'AMBUSH', text: 'RIVAL BACK UNIT SWAPS TO THE FRONT' },
  { at: 9, name: 'PACK HEALER', text: 'RIVAL REARMOST HEALS ITS FRONT 1 PER EXCHANGE' },
];

// ---------- Bestiary and Pedigrees (07 §6D, Crests) ----------

export const PEDIGREES: { id: string; name: string; cost: number; max: number; text: string }[] = [
  { id: 'rat', name: 'Kennel Rat', cost: 3, max: 1, text: 'Start Runs with a Gutter Rat' },
  { id: 'chow', name: 'Fat Purse', cost: 4, max: 1, text: '+2 Chow in round 1' },
  { id: 'carry', name: 'Cold Cage', cost: 8, max: 1, text: 'Carry one frozen unit to the next Run' },
  { id: 'larder', name: 'Deep Larder', cost: 10, max: 3, text: '+1 Chow every round' },
];

export function unitPool(per: PitPersistent): UnitId[] {
  return [...BASE_POOL, ...BESTIARY.filter((k) => per.beasts?.includes(k))];
}

/** Imports (00 §4): Souls -> Restless Spirits (Shade), Essence -> Warding Sigils (front Armor). */
export const importShade = (save: DeptSave) => Math.min(3, save.imports?.souls ?? 0);
export const importSigils = (save: DeptSave) => Math.min(3, save.imports?.essence ?? 0);

export function runOpts(save: PitSave): RunOpts {
  const r = save.run;
  const p = save.persistent;
  return {
    pool: unitPool(p),
    larder: lvOf(r, 'larder'),
    deepLarder: p.ped?.larder ?? 0,
    penSpace: lvOf(r, 'pen'),
    freeRoll: lvOf(r, 'freeroll') > 0,
    gritMax: BASE_GRIT + lvOf(r, 'grit'),
    hardy: lvOf(r, 'hardy'),
    ratStart: (p.ped?.rat ?? 0) > 0,
    chowR1: (p.ped?.chow ?? 0) > 0,
    sigils: importSigils(save),
    shade: importShade(save),
    carry: (p.ped?.carry ?? 0) > 0 ? p.carry : null,
  };
}

// ---------- Pit Crowns and the skill gate (07 §7) ----------

/** Highest Stakes S with at least 2 Crowns won at Stakes >= S this cycle (-1 if none). */
export function heldCrownLevel(crowns: Record<string, number>): number {
  const levels = Object.keys(crowns)
    .map(Number)
    .filter((s) => crowns[s] > 0)
    .sort((a, b) => b - a);
  let count = 0;
  for (const s of levels) {
    count += crowns[s];
    if (count >= 2) return s;
  }
  return -1;
}

export function crownsAtOrAbove(crowns: Record<string, number>, S: number): number {
  let n = 0;
  for (const k of Object.keys(crowns)) if (Number(k) >= S) n += crowns[k];
  return n;
}

// ---------- the Skirmish Gauntlet (07 §3) ----------

/**
 * k_idle: Gauntlet Teeth relative to active battle Teeth, by construction (W-02).
 * TUNED with scripts/pit-bot.ts (greedy reference drafter, time model 8 s + 3 s/action per shop,
 * battles at 1x then 2x): a stationed Run warband earns ~1/2.7 of the bot's active Teeth/min.
 */
export const K_IDLE = 0.06;
export const GAUNTLETS = 8;
export const GAUNTLET_ROUNDS = 12;

/** The Standing Warband as fighters (Drill Yard, Hardy Stock, Brand). */
export function garrisonFighters(run: PitRun): Fighter[] {
  return prepareLine(run.garrison ?? [], lvOf(run, 'hardy'), lvOf(run, 'drill'));
}

export interface GauntletReport {
  /** Mean base Teeth per Gauntlet (before Pliers, x k_idle). */
  mean: number;
  /** Mean rounds cleared, and the best, at the chosen Stakes. */
  meanRounds: number;
  best: number;
  stakes: number; // Stakes used (Cautious Stakes may drop 2 or 4)
}

const gauntletSeed = (cycle: number, g: number) => hashStr('gauntlet', cycle, g);

/** One Gauntlet: fight r = 1, 2, ... until the first loss or draw (a draw pays 0.7 and ends it). */
export function runGauntlet(team: Fighter[], cycle: number, g: number, S: number, opts: { sigils: number; shade: number }): { teeth: number; rounds: number } {
  let teeth = 0;
  let rounds = 0;
  const seed = gauntletSeed(cycle, g);
  for (let r = 1; r <= GAUNTLET_ROUNDS; r++) {
    const riv = rival(r, S, seed);
    const res = battle(team, riv.line, { seed: battleSeed(team, riv.line, r, PARAMS_VERSION), tactics: S, ...opts });
    if (res.outcome === 1) {
      teeth += battleTeeth(r, S);
      rounds = r;
    } else {
      if (res.outcome === 0) teeth += 0.7 * battleTeeth(r, S);
      break;
    }
  }
  return { teeth, rounds };
}

/** One Gauntlet battle with its frame log, for the on-screen Skirmish (same seeds as idleRate). */
export function runGauntletLog(save: DeptSave, team: Fighter[], g: number, r: number, S: number) {
  const riv = rival(r, S, gauntletSeed(save.cycle?.n ?? 0, g));
  const res = battle(team, riv.line, { seed: battleSeed(team, riv.line, r, PARAMS_VERSION), tactics: S, sigils: importSigils(save), shade: importShade(save), log: true });
  return { frames: res.frames, outcome: res.outcome, arch: riv.arch };
}

const memo = new Map<string, GauntletReport>();

function gauntletKey(run: PitRun, save: DeptSave): string {
  let s = `${PARAMS_VERSION}|${save.cycle?.n ?? 0}|${run.stakes ?? 0}|${lvOf(run, 'hardy')}|${lvOf(run, 'drill')}|${importShade(save)}|${importSigils(save)}|`;
  for (const p of run.garrison ?? []) s += `${p.k}${p.xp}.${p.a}.${p.h}${p.it ?? ''}${p.br ? '*' : ''},`;
  return s;
}

/** The exact Gauntlet report for this warband, upgrades and Stakes (memoized per hash). */
export function gauntletReport(save: DeptSave): GauntletReport {
  const run = save.run as PitRun;
  const key = gauntletKey(run, save);
  const hit = memo.get(key);
  if (hit) return hit;
  const team = garrisonFighters(run);
  const opts = { sigils: importSigils(save), shade: importShade(save) };
  const cycle = save.cycle?.n ?? 0;
  let best: GauntletReport = { mean: 0, meanRounds: 0, best: 0, stakes: run.stakes ?? 0 };
  // Cautious Stakes: also run at S-2 and S-4; idle uses whichever pays most.
  for (const S of [run.stakes ?? 0, (run.stakes ?? 0) - 2, (run.stakes ?? 0) - 4]) {
    if (S < 0) continue;
    let sum = 0;
    let rounds = 0;
    let top = 0;
    if (team.length)
      for (let g = 0; g < GAUNTLETS; g++) {
        const r = runGauntlet(team, cycle, g, S, opts);
        sum += r.teeth;
        rounds += r.rounds;
        top = Math.max(top, r.rounds);
      }
    const rep = { mean: sum / GAUNTLETS, meanRounds: rounds / GAUNTLETS, best: top, stakes: S };
    if (rep.mean > best.mean || (best.mean === 0 && S === run.stakes)) best = rep;
  }
  if (memo.size > 64) memo.clear();
  memo.set(key, best);
  return best;
}

/** Skirmish Teeth per second for a given report (before core multipliers). */
export function idleFromReport(run: PitRun, rep: GauntletReport): number {
  return (K_IDLE * rep.mean * pliersMult(lvOf(run, 'pliers'))) / intervalL(lvOf(run, 'pace'));
}

/** Preview for stationing: Teeth/s if `garrison` were the Standing Warband. */
export function idleRateWith(save: DeptSave, garrison: Pet[]): number {
  const run = save.run as PitRun;
  const fake = { ...save, run: { ...run, garrison } } as DeptSave;
  return idleFromReport(run, gauntletReport(fake));
}

// ---------- commendations (8) ----------

const run = (s: DeptSave) => s.run as PitRun;
const per = (s: DeptSave) => s.persistent as PitPersistent;

export const commendations: Commendation[] = [
  { id: 'blood', label: 'FIRST BLOOD', test: (s) => (per(s)?.life?.battlesWon ?? 0) >= 1 },
  { id: 'drill', label: 'GARRISON DRILLED', test: (s) => lvOf(run(s), 'drill') >= 1 },
  { id: 'station', label: 'A STANDING WARBAND', test: (s) => (run(s)?.stats?.stations ?? 0) >= 1 },
  { id: 'l3', label: 'A LEVEL 3 BEAST', test: (s) => (per(s)?.life?.l3 ?? 0) >= 1 },
  { id: 'triumph', label: 'HUNTMASTER DOWN', test: (s) => (per(s)?.life?.triumphs ?? 0) >= 1 },
  { id: 'stakes3', label: 'STAKES 3', test: (s) => (run(s)?.stakesBought ?? 0) >= 3 },
  { id: 'crown3', label: 'PIT CROWN AT STAKES 3', test: (s) => (per(s)?.life?.bestStakesCrown ?? -1) >= 3 },
  { id: 'beast', label: 'BESTIARY: FIRST BEAST', test: (s) => (per(s)?.beasts?.length ?? 0) >= 1 },
];

// ---------- the DeptEcon ----------

export const pitEcon: DeptEcon = {
  id: 'pit',
  version: 1,
  defaultRun,
  defaultPersistent,

  // Exact and cheap: the Gauntlet is computed once per warband/upgrade/Stakes hash (memo above);
  // per frame this is one short key string and a Map lookup.
  idleRate(save) {
    const r = save.run as PitRun;
    if (!r || !r.garrison) return 0;
    return idleFromReport(r, gauntletReport(save));
  },

  // Captives (00 §4, 07 §16): 1 per Run reaching 6 wins, 3 per Triumph (active); 1 per 60
  // Gauntlet rounds cleared (passive, held to the Good's passive rate by the core).
  goods: {
    id: 'captives',
    rate: (save) => {
      const r = save.run as PitRun;
      if (!r || !r.garrison) return 0;
      const rep = gauntletReport(save);
      return (rep.meanRounds * (3600 / intervalL(lvOf(r, 'pace')))) / 60;
    },
    count: (save) => (save.run as PitRun)?.stats?.captives ?? 0,
  },

  // Infamy skill gate (07 §7, 00 §2.2): 2 Pit Crowns (Triumphs) at Stakes >= target.
  skillTarget: (n) => Math.min(4 + 2 * n, 10),
  skillLabel: (t) => `2 CROWNS AT STAKES ${t}+`,

  // SEEDS (the Pit unlocks ~day 6-8, 00 §6), from scripts/pit-bot.ts (greedy drafter, Stakes
  // stepped up as it wins, time model 8 s + 3 s per shop action):
  //  - active ~30-45 Teeth/min at Stakes 0-2 with no upgrades, ~100+/min by Stakes 4 with Pliers;
  //    Stakes 4 (the first skill target) needs ~5.6K Teeth of dial plus Hardy Stock to win there.
  //  - econBase: the economy gate ~2-3 days after unlock at a day-7 player's Pit attention
  //    (~20 min/day on screen + offline Skirmishes at 0.75): 4e4 Teeth.
  //  - rankRef: on-screen idle ~10 min in (first Run stationed, Skirmish Pace 1-2): ~0.15/s.
  //  - rankTarget: idle at the first 100% Infamy (Stakes 4 warband, Pliers ~10, Pace 6): ~3/s.
  econBase: 4e4,
  rankRef: 0.15,
  rankTarget: 3,
  commendations,
};

/** Unit display helper for the garrison tab and previews. */
export function petLabel(p: Pet): string {
  return `${UNITS[p.k].name.toUpperCase()} L${lvlOf(p.xp)}`;
}
