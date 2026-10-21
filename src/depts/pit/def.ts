// The War Pit's pure economy (specs/07 §3, §6-§8; 00 §2.2). No Pixi: the shared core, the
// headless balance simulation and the scene all read this. index.ts spreads `pitEcon` into the
// full DeptDef.
import type { Commendation, DeptEcon, StewardCandidate } from '../../core/dept';
import { LONG_GROWTH, LONG_MAX, longDesc, longLocked, longMult } from '../../core/longnode';
import type { DeptSave } from '../../core/types';
import { battle, battleSeed, hashStr, type Fighter } from './engine';
import {
  BASE_GRIT,
  PARAMS_VERSION,
  SHOWMAN_STEP,
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
  /** Huntmaster scars this cycle (run.ts SCAR_STEP each): +1 per Run at Stakes >= the Infamy
   * target that reached him and still Retreated, cleared by a Crown at the target. */
  scars?: number;
}

export interface PitPersistent {
  crests: number;
  crestsEver: number;
  beasts: UnitId[]; // Bestiary unlocks
  ped: Record<string, number>; // Pedigrees
  carry: ShopUnit | null; // frozen unit carried into the next Run (Pedigree)
  life: { triumphs: number; l3: number; battlesWon: number; crownsEver: number; bestStakesCrown: number };
  /** Beast skins owned: a bitmask of SKINS styles per unit (Crest sink, 07 §6D). */
  skins: Record<string, number>;
  /** Skin worn per unit (index into SKINS, 0 = none). */
  wear: Record<string, number>;
  /** The last stationed warband, kept for the Old Guard Signature (00 §2.5). */
  guard: Pet[] | null;
  /** Export playtest log (07 §14.1): a per-Run summary, newest last, at most PLAYTEST_LOG_MAX. */
  log: PlaytestEntry[];
}

/** One finished Run in the playtest log (it travels with the save export, locally). */
export interface PlaytestEntry {
  at: number; // ms epoch
  s: number; // Stakes
  w: number; // wins
  l: number; // losses
  tri: 0 | 1;
  buys: number;
  min: number; // minutes of play
  pv: number;
}
export const PLAYTEST_LOG_MAX = 60;

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
  return { crests: 0, crestsEver: 0, beasts: [], ped: {}, carry: null, life: { triumphs: 0, l3: 0, battlesWon: 0, crownsEver: 0, bestStakesCrown: -1 }, skins: {}, wear: {}, guard: null, log: [] };
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
  run.scars ??= 0;
  run.stats = { ...defaultStats(), ...(run.stats ?? {}) };
  run.stakes = Math.max(0, Math.min(run.stakes, run.stakesBought));
  per.crests ??= 0;
  per.crestsEver ??= 0;
  per.beasts ??= [];
  per.ped ??= {};
  per.carry ??= null;
  per.life = { ...defaultPersistent().life, ...(per.life ?? {}) };
  per.skins ??= {};
  per.wear ??= {};
  per.log ??= [];
  // Saves from before Old Guard: the current Standing Warband counts once it was stationed.
  if (per.guard === undefined) per.guard = run.stats.stations > 0 && run.garrison.length ? run.garrison.map((p) => ({ ...p })) : null;
  if (per.log.length > PLAYTEST_LOG_MAX) per.log.splice(0, per.log.length - PLAYTEST_LOG_MAX);
}

// ---------- beast skins (07 §6D repeatable Crest sink) ----------

/** Skin styles: a palette swap applied to any roster beast (index 0 = the natural coat). */
export const SKINS = ['NATURAL', 'BONE', 'EMBER', 'SHADOW', 'GILDED'] as const;
export const SKIN_COST = 3;
export const ownsSkin = (per: PitPersistent, k: string, i: number) => i === 0 || ((per.skins?.[k] ?? 0) & (1 << i)) !== 0;
/** Skin index worn by unit k (0 if none or not owned). */
export const skinOf = (per: PitPersistent | undefined, k: string) => {
  const i = per?.wear?.[k] ?? 0;
  return per && i > 0 && ownsSkin(per, k, i) ? i : 0;
};
export function buySkin(per: PitPersistent, k: string, i: number): boolean {
  if (i <= 0 || i >= SKINS.length || ownsSkin(per, k, i) || per.crests < SKIN_COST) return false;
  per.crests -= SKIN_COST;
  per.skins[k] = (per.skins[k] ?? 0) | (1 << i);
  per.wear[k] = i;
  return true;
}
export function skinsOwned(per: PitPersistent): number {
  let n = 0;
  for (const v of Object.values(per.skins ?? {})) for (let b = v; b; b &= b - 1) n++;
  return n;
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
  /** Locked until this department's 2nd Fall (the long node, core/longnode.ts). */
  afterFall?: boolean;
  desc(l: number): string;
}

export const UPGRADES: UpDef[] = [
  { id: 'hardy', name: 'Hardy Stock', branch: 'pens', base: 100, growth: 1.5, max: 25, desc: (l) => `Beasts +${4 * l}% > +${4 * (l + 1)}% atk & hp` },
  { id: 'larder', name: 'Larder', branch: 'pens', base: 500, growth: 4, max: 2, desc: (l) => `Chow per round ${10 + l} > ${11 + l}` },
  { id: 'pen', name: 'Pen Space', branch: 'pens', base: 800, growth: 3, max: 2, desc: (l) => (l === 0 ? 'Shop slot 4 from round 3' : 'Shop slot 5 from round 5') },
  { id: 'freeroll', name: 'Free Roll', branch: 'pens', base: 1500, growth: 1, max: 1, desc: () => 'First roll each round free' },
  { id: 'scout', name: 'Scouting', branch: 'pens', base: 250, growth: 2, max: 2, desc: (l) => (l === 0 ? 'See rival stats' : 'See rival levels and items') },
  { id: 'pliers', name: 'Tooth Pliers', branch: 'spoils', base: 120, growth: 1.55, max: Infinity, desc: (l) => `Teeth x${pliersMult(l).toFixed(2)} > x${pliersMult(l + 1).toFixed(2)}` },
  // The long node (core/longnode.ts, sim/README.md "Pass 5"): the arena's renown, all Teeth (Runs
  // and Skirmishes) x1.15 per level, a grander arena every 10 levels; opens after the 2nd Fall.
  // SIM-TUNED base: ~2 h of a later cycle's plateau idle (~20/s).
  { id: 'renown', name: 'Arena Renown', branch: 'spoils', base: 2e4, growth: LONG_GROWTH, max: LONG_MAX, afterFall: true, desc: (l) => longDesc(ARENAS, l) },
  { id: 'showman', name: 'Showman', branch: 'spoils', base: 300, growth: 1.7, max: 20, desc: (l) => `Run-end bonus +${Math.round(100 * SHOWMAN_STEP * l)}% > +${Math.round(100 * SHOWMAN_STEP * (l + 1))}%` },
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
/** Arena Renown milestone titles (one per 10 levels). */
export const ARENAS = ['BRAWL', 'PIT', 'RING', 'ARENA', 'COLISEUM', 'SPECTACLE', 'EPIC'];
export const renownMult = (l: number) => longMult(l);
/** Every Teeth multiplier local to the Pit: Tooth Pliers x Arena Renown (Runs and Skirmishes). */
export const teethMult = (run: PitRun) => pliersMult(lvOf(run, 'pliers')) * renownMult(lvOf(run, 'renown'));
/** Lock reason for a node in cycle `n` (the long node opens after the 2nd Fall), or null. */
export const upLocked = (u: UpDef, n: number): string | null => (u.afterFall ? longLocked(n) : null);
export const intervalL = (l: number) => 40 - 2.5 * Math.min(6, l);

/** Stakes level S+1 costs 300 x 2.2^S Teeth (07 §7). */
export const STAKES_MAX = 20;
export function stakesCost(bought: number): number {
  return Math.ceil(300 * 2.2 ** bought);
}

/** Tactics cards (07 §7): the MVP's 3/6/9 and the "Later" 12/15/18 (params version 3). */
export const TACTICS: { at: number; name: string; text: string }[] = [
  { at: 3, name: 'MUZZLED FRONT', text: 'RIVAL FRONT UNIT GAINS ARMOR 1' },
  { at: 6, name: 'AMBUSH', text: 'RIVAL BACK UNIT SWAPS TO THE FRONT' },
  { at: 9, name: 'PACK HEALER', text: 'RIVAL REARMOST HEALS ITS FRONT 1 PER EXCHANGE' },
  { at: 12, name: 'WAR DRUMS', text: 'EVERY RIVAL BEAST +1 ATTACK' },
  { at: 15, name: 'MARKED PREY', text: 'YOUR FIRST-BOUGHT BEAST TAKES 3 AT THE START' },
  { at: 18, name: "HUNTMASTER'S OATH", text: 'THE HUNTMASTER REVIVES ONCE AT HALF HP' },
];

/** Infamy target cap: 10 in the MVP (W-21: no target outruns the shipped cards), 20 now that the
 * cards 12/15/18 ship (07 §7). Measured (sim pass 6, 30 days x 3 seeds): weeks 2-4 cycles
 * 3.1-3.4 d against 2.7-3.4 d at cap 10, longest 4.0-4.4 d (no stall past 5 d either way). */
export const TARGET_CAP = 20;

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
    scars: r.scars ?? 0,
  };
}

// ---------- Pit Crowns and the skill gate (07 §7) ----------

/**
 * Pit Crowns the skill gate needs at Stakes >= the target (07 §7 default 2).
 * SIM-TUNED 2 -> 1, 07 open question 8's own fallback ("if the sim can't meet the <= 2.5-day band
 * with Triumphs at the top of 35-50%, drop to 1 Crown at Stakes >= target"): the reference player
 * gives the Pit ~8 on-screen minutes a day (~1.5 Runs), so two Crowns at the target took 3-5 days
 * per cycle and the Pit's weeks 2-4 cycles averaged ~4.4 days with stalls past 5 (sim/README.md
 * "Pass 5").
 */
export const PIT_CROWNS = 1;

/** Highest Stakes S with at least PIT_CROWNS Crowns won at Stakes >= S this cycle (-1 if none). */
export function heldCrownLevel(crowns: Record<string, number>): number {
  const levels = Object.keys(crowns)
    .map(Number)
    .filter((s) => crowns[s] > 0)
    .sort((a, b) => b - a);
  let count = 0;
  for (const s of levels) {
    count += crowns[s];
    if (count >= PIT_CROWNS) return s;
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
 * SIM-TUNED 0.06 -> 0.05 (sim/README.md "Pass 5"): in the balance sim the reference bot stations a
 * warband that clears all 12 Gauntlet rounds within a day of each Fall, which caps Skirmish pay
 * at ~0.3 x 1.22^S x Pliers per s; at 0.06 Skirmishes paid ~1/1.9 of active play on screen
 * (07 §3 band 2.6-3.8x, centre 3.2x) early in the 30-day runs; later cycles add Run-only levels
 * (Showman, Grit, Larder) and read higher. At 0.05 the reference profile reads ~3-4x on screen
 * across 30 days (~4-5x active : offline at the Pit's ~0.75-0.8 factor).
 */
export const K_IDLE = 0.05;
export const GAUNTLETS = 8;
export const GAUNTLET_ROUNDS = 12;

/** The Standing Warband as fighters (Drill Yard, Hardy Stock, Brand). */
export function garrisonFighters(run: PitRun): Fighter[] {
  // Marked Prey hits a Standing Warband's slot 1 (07 §7), not the Run's first-bought unit.
  return prepareLine(run.garrison ?? [], lvOf(run, 'hardy'), lvOf(run, 'drill')).map((f) => ({ ...f, marked: false }));
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
  return (K_IDLE * rep.mean * teethMult(run)) / intervalL(lvOf(run, 'pace'));
}

/** Preview for stationing: Teeth/s if `garrison` were the Standing Warband. */
export function idleRateWith(save: DeptSave, garrison: Pet[]): number {
  const run = save.run as PitRun;
  const fake = { ...save, run: { ...run, garrison } } as DeptSave;
  return idleFromReport(run, gauntletReport(fake));
}

// ---------- advancement hooks (00 §2.5, §5.2) ----------

/** Tree nodes that raise the Gauntlet idleRate (the Steward's list; the Stakes dial is excluded). */
const STEWARD_NODES = ['hardy', 'drill', 'pace', 'pliers', 'renown'];

function withLevel(save: DeptSave, id: string, l: number): DeptSave {
  const r = save.run as PitRun;
  return { ...save, run: { ...r, lv: { ...r.lv, [id]: l } } } as DeptSave;
}

/** Ready list (Satchel L1): every tree node and the next Stakes level, cheapest first. */
export function readyBuys(save: DeptSave): { label: string; cost: number }[] {
  const r = save.run as PitRun;
  if (!r?.lv) return [];
  const out: { label: string; cost: number }[] = [];
  for (const u of UPGRADES) {
    const l = lvOf(r, u.id);
    if (l >= u.max || upLocked(u, save.cycle?.n ?? 0)) continue;
    out.push({ label: u.name, cost: upCost(u, l) });
  }
  const list = out.sort((a, b) => a.cost - b.cost).slice(0, 5);
  if ((r.stakesBought ?? 0) < STAKES_MAX) list.push({ label: `Stakes ${r.stakesBought + 1}`, cost: stakesCost(r.stakesBought) });
  return list;
}

/**
 * The Steward's list (00 §5.2 m5): Kennels and Spoils nodes plus Hardy Stock, each with its exact
 * idleRate gain. Excludes the Stakes dial, Run-only nodes (no idle gain) and Crest buys. Pliers,
 * Renown and Pace don't touch the Gauntlet, so only Hardy and Drill run new (memoized) Gauntlets.
 */
export function stewardCandidates(save: DeptSave): StewardCandidate[] {
  const r = save.run as PitRun;
  if (!r?.lv || !r.garrison?.length) return [];
  const base = pitEcon.idleRate(save);
  const out: StewardCandidate[] = [];
  for (const id of STEWARD_NODES) {
    const u = UP[id];
    const l = lvOf(r, id);
    if (l >= u.max || upLocked(u, save.cycle?.n ?? 0)) continue;
    const deltaIdle = pitEcon.idleRate(withLevel(save, id, l + 1)) - base;
    out.push({
      id,
      label: u.name,
      cost: upCost(u, l),
      deltaIdle,
      buy: () => {
        const rr = save.run as PitRun;
        rr.lv[id] = Math.min(u.max, lvOf(rr, id) + 1);
      },
    });
  }
  return out;
}

/** Head Start (00 §2.5): the first 2L Stakes levels owned and 1 + L Drill Yard levels ("helpers":
 * 07 §18 counts the drilled garrison as the Pit's helpers). Idempotent (max), run data only; the
 * dial setting stays where it was (raising it is free). */
export function applyHeadStart(save: DeptSave, level: number): void {
  const r = save.run as PitRun;
  if (!r || level < 1) return;
  r.lv ??= {};
  r.stakesBought = Math.max(r.stakesBought ?? 0, Math.min(STAKES_MAX, 2 * level));
  r.lv.drill = Math.max(lvOf(r, 'drill'), Math.min(UP.drill.max, 1 + level));
}

/** Old Guard (00 §2.5 Signature): the Standing Warband survives the Fall. The warband is kept in
 * persistent data on every station; at a cycle start (nothing stationed yet) it returns. */
export const oldGuard = {
  name: 'Old Guard',
  desc: 'The Standing Warband survives the Fall',
  apply(save: DeptSave): void {
    const r = save.run as PitRun;
    const p = save.persistent as PitPersistent;
    if (!r || !p?.guard?.length) return;
    if ((r.stats?.stations ?? 0) > 0) return;
    r.garrison = p.guard.map((x) => ({ ...x }));
  },
};

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

  // Infamy skill gate (07 §7, 00 §2.2): PIT_CROWNS Pit Crowns (Triumphs) at Stakes >= target.
  skillTarget: (n) => Math.min(4 + 2 * n, TARGET_CAP),
  skillLabel: (t) => `${PIT_CROWNS} CROWN${PIT_CROWNS > 1 ? 'S' : ''} AT STAKES ${t}+`,

  // SEEDS (the Pit unlocks ~day 6-8, 00 §6), from scripts/pit-bot.ts (greedy drafter, Stakes
  // stepped up as it wins, time model 8 s + 3 s per shop action):
  //  - active ~30-45 Teeth/min at Stakes 0-2 with no upgrades, ~100+/min by Stakes 4 with Pliers;
  //    Stakes 4 (the first skill target) needs ~5.6K Teeth of dial plus Hardy Stock to win there.
  //  - econBase: the economy gate ~2-3 days after unlock at a day-7 player's Pit attention
  //    (~20 min/day on screen + offline Skirmishes at 0.75): 4e4 Teeth.
  //  - rankRef: on-screen idle ~10 min in (first Run stationed, Skirmish Pace 1-2): ~0.15/s.
  //  - rankTarget: idle at the first 100% Infamy (Stakes 4 warband, Pliers ~10, Pace 6): ~3/s.
  // SIM-TUNED (sim/README.md "Pass 5", sim/adapters/pit.ts on the reference profile, Pit open day 7
  // 08:00 with ~8 on-screen min a day): the core multiplier (Banners, Dread perks, Goods, Late
  // Recruit x2) and offline Skirmishes at ~0.7 fill 4e4 in under an hour of active-equivalent
  // play, so the skill gate alone set a first Fall ~1.5 days after the Seal. Cycle earnings run
  // ~1e6 a day after the unlock and ~5e6 after ~2.5 days, so econBase 4e4 -> 5e6 puts the first
  // Fall ~3 days after the Seal (day 10 08:00 for a day-6/7 Seal) (00 §6 arc, like departments 4-6). rankRef 0.15 -> 0.5 (idle once the
  // first Run is stationed), rankTarget 3 -> 12 (idle at the first 100% Infamy).
  econBase: 5e6,
  rankRef: 0.5,
  rankTarget: 12,
  commendations,
  readyBuys,
  stewardCandidates,
  applyHeadStart,
  signature: oldGuard,
};

/** Unit display helper for the garrison tab and previews. */
export function petLabel(p: Pet): string {
  return `${UNITS[p.k].name.toUpperCase()} L${lvlOf(p.xp)}`;
}
