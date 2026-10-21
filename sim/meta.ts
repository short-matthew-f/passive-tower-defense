// The meta simulation (00 §8.1 layer 2): the reference player's days, Tribute, Seals, Infamy,
// Falls, Dread, Throne/Dread spending and offline, on the game's own pure functions
// (src/core/economy.ts, src/core/meta.ts). It mirrors src/core/game.ts step for step:
//   econTick     -> one 1 s step while the player is on screen (off-screen depts accrue idleRate x
//                   coreMult at 1.0, Tribute accrues with the x1.5 on-screen bonus);
//   applyOffline -> a closed-form jump between sessions (offlineFactor, offline caps, Tribute cap);
//   checkProgress, completeFall, buySeal -> the same rules, same order.
// Departments plug in through sim/types.ts adapters; nothing here knows any department's mechanics.
import {
  coreMult,
  commendationReward,
  dreadPayout,
  FLOOR_GROWTH,
  infamy,
  offlineCapSeconds,
  offlineFactor,
  rank,
  rankEff,
  tributeCapSeconds,
  tributeRate,
} from '../src/core/economy';
import type { DeptEcon } from '../src/core/dept';
import {
  activeGoodsStep,
  addGoods,
  buyImport,
  buyMarket,
  canBuyImport,
  EXPORT_OF,
  GOOD_ORDER,
  GOODS,
  goodsIncomePerH,
  goodsStock,
  importAdd,
  importLv,
  IMPORT_NODES,
  lineOpen,
  MARKET_BUNDLE,
  marketCost,
  newActiveTrack,
  nodeCost,
  offlineGoods,
  passivePerH,
  ROADS,
  type ActiveGoodsTrack,
  type GoodId,
} from '../src/core/goods';
import { BANNER, bannerId, DREAD_PERKS, RUINBORN, ruinbornId, SEAL_COST, SEAL_DREAD, THRONE_UPGRADES } from '../src/core/meta';
import {
  activeEdict,
  CARAVAN_ID,
  DARK_TITHE,
  EDICT_BOARD_ID,
  econGateMult,
  edictCooldown,
  edictTributeAdd,
  headStartId,
  headStartLevel,
  hasSignature,
  LATER_PERKS,
  legendsBane,
  legendsBaneId,
  ritualBonus,
  SATCHEL_ID,
  satchelLevel,
  setEdict,
  signatureId,
  stewardOn,
  stewardShare,
  stewardSpend,
  SWIFT_REBUILD_ID,
  THRONE_EXTRAS,
  TROPHY_CAP,
  TROPHY_HALL_ID,
  TROPHY_STEP,
  trophyAdd,
  WING_PERKS,
  type EdictId,
} from '../src/core/perks';
import { DEPT_ORDER, newSave, type DeptId, type DeptSave, type SaveRoot } from '../src/core/types';
import { childSeed } from './rng';
import type { ActiveSession, AdapterFactory, BotGoals, DeptAdapter, SessionEnv } from './types';

// ---------- profiles (00 §6 reference player, §8.1 profiles) ----------

export interface SessionPlan {
  /** Hour of the day the session starts. */
  at: number;
  /** Minutes of active play (0 = a Collect-All visit that only shops). */
  min: number;
}

export interface Profile {
  name: string;
  day(day: number): SessionPlan[];
  /** Return-ritual score (0-1) on the first entry after an absence (00 §5.3, perks.ritualBonus):
   * +5% x score of the haul. 0 = skips rituals (Collect-All players). Default 0. */
  ritualScore?: number;
  /** Opts in Gobbo's Satchel L2-L3 and the Steward in every department (00 §5.2 m5). `reserve` is
   * the bank fraction it never spends below (the Throne UI's default is 0.25). */
  steward?: { satchel: 2 | 3; reserve: number };
}

const REFERENCE_DAY = (d: number): SessionPlan[] =>
  d === 0
    ? [
        { at: 9, min: 45 },
        { at: 13, min: 15 },
        { at: 19, min: 30 },
      ]
    : [
        { at: 8, min: 10 },
        { at: 12.5, min: 10 },
        { at: 18, min: 10 },
        { at: 21, min: 20 },
      ];

export const PROFILES: Record<string, Profile> = {
  // Day 1: 90 min active; then ~50 min/day as 3 x 10 min + 1 x 20 min; the rest offline.
  reference: { name: 'reference', day: REFERENCE_DAY, ritualScore: 0.7 },
  // The reference schedule with Gobbo's Satchel L3 and the Steward on in every department (reserve
  // 25%, the UI default): checks the Steward's rules (never below the reserve, never a dial,
  // consumable or spatial item) and what it does to the pace.
  steward: { name: 'steward', day: REFERENCE_DAY, ritualScore: 0.7, steward: { satchel: 3, reserve: 0.25 } },
  // Two Collect-All visits a day that buy what's Ready; no on-screen play after the first look.
  'idle-only': {
    name: 'idle-only',
    day: (d) => (d === 0 ? [{ at: 9, min: 5 }, { at: 20, min: 0 }] : [{ at: 8, min: 0 }, { at: 20, min: 0 }]),
  },
  // Plays one stretch of 8 h on day 1 (local-curve checks, single-department runs).
  solo: { name: 'solo', day: (d) => (d === 0 ? [{ at: 8, min: 480 }] : [{ at: 8, min: 60 }]), ritualScore: 0.7 },
  grinder: {
    name: 'grinder',
    ritualScore: 0.9,
    day: () => [
      { at: 9, min: 60 },
      { at: 14, min: 60 },
      { at: 20, min: 60 },
    ],
  },
};

// ---------- config & results ----------

export interface SimConfig {
  days: number;
  seed: number;
  profile: Profile;
  adapters: AdapterFactory[];
  /** Fall once Infamy reaches this % (100 = at once; up to 200 = push). */
  fallAt: number;
  /** Average Crush timing result, 0-0.25. */
  crush: number;
  /** Minutes per department slice inside a session. */
  sliceMin: number;
  /** Seconds between the bot's shopping checks while on screen. */
  buyEveryS: number;
  /** Skip Throne/Dread spending (isolates a department's own curve). */
  noMeta?: boolean;
  /** Pay the Seals of departments not built yet as pure Tribute sinks (models the full suite's
   * Tribute economy; the current build has no such sink, so Tribute all goes to Banners). */
  phantomSeals?: boolean;
  /** Start from this meta state (Throne, Dread perks, lifetime Dread): the 00 §8.1 single-department
   * fixture for departments 5-7 (W-23), the reference player's meta at that department's unlock. */
  initialMeta?: SaveRoot['meta'];
  /** Experiment: economy floor growth per Fall for every department (shipped default FLOOR_GROWTH). */
  floorGrowth?: number;
  /** Turn the Goods system off (no accrual, no imports, no Black Market or Roads): the pre-Goods
   * baseline for before/after comparisons (`--no-goods`). */
  noGoods?: boolean;
  /** Experiment: turn new rules off for attribution (`--off edicts,rituals,extras,wings,later`):
   * Edicts, return rituals, the Throne extras (Trophy Hall, Edict Board, Satchel), the wing perks
   * (Head Start, Legend's Bane, Signature) and the Later perks (Swift Rebuild, Goods Caravan). */
  off?: string[];
}

export const DEFAULT_CONFIG: Omit<SimConfig, 'adapters'> = {
  days: 7,
  seed: 1,
  profile: PROFILES.reference,
  fallAt: 100,
  crush: 0.15,
  sliceMin: 5,
  buyEveryS: 2,
};

export interface FallRecord {
  n: number;
  t: number; // sim seconds
  day: number;
  infamy: number;
  dread: number;
  cycleWallH: number;
  cycleOnScreenH: number;
  cycleAEH: number;
}

export interface RatioAgg {
  base: number;
  idle: number;
  secs: number;
  factorSecs: number; // sum of offlineFactor x secs, for the active:offline conversion
}

export interface DeptTrack {
  id: DeptId;
  unlockedAt: number | null; // sim seconds
  unlockedAtActiveMin: number | null;
  firstEntryAt: number | null;
  firstBuyOnScreenS: number | null; // on-screen seconds from first entry to first purchase
  firstBuyIds: string[];
  onScreenS: number;
  onScreenCycleS: number;
  aeCycleS: number;
  econGateAEH: number | null; // first cycle: active-equivalent hours when the economy gate filled
  skillGateAEH: number | null;
  falls: FallRecord[];
  tribute: number;
  tributeCommend: number;
  dread: number;
  returns: number;
  returnsAffordable: number;
  /** Ratio aggregates keyed `${phase}:${state}`: phase 'early' (< 30 min on screen this cycle) or 'base'. */
  ratio: Record<string, RatioAgg>;
  /** Dial purchases: level bought, and its price in minutes of the bot's current income (§8.1 step cost). */
  dialBuys: { level: number; minutes: number; cycle: number }[];
  /** Baseline ratio per day (drift view). */
  ratioByDay: Record<number, RatioAgg>;
  cycleStartT: number;
  cycleStartOnScreen: number;
  /** Copy of the meta state when this department unlocked (fixture for single-department runs). */
  metaAtUnlock?: SaveRoot['meta'];
  /** Goods: this department's export earned (passive / active), and each import line's maxed time. */
  goodsPassive: number;
  goodsActive: number;
  lineMaxedAt: Record<string, number>;
}

export interface DaySnap {
  day: number;
  t: number;
  activeMin: number;
  tribute: number;
  tributeLifetime: number;
  dread: number;
  dreadLifetime: number;
  depts: Record<string, { bank: number; earnings: number; infamy: number; skill: number; econ: number; rank: number; falls: number; dial: number; idle: number; desc: string }>;
}

export interface SimEvent {
  t: number;
  day: number;
  activeMin: number;
  kind: string;
  dept?: DeptId;
  text: string;
}

export interface GoodsTrack {
  /** Goods bought on the Black Market, and Tribute spent there. */
  marketGoods: number;
  marketTribute: number;
  /** Goods spent on import nodes. */
  spent: Partial<Record<GoodId, number>>;
  /** Import levels bought per day (all departments). */
  levelsByDay: Record<number, number>;
  /** Stock at each day's end. */
  stockByDay: Record<number, Partial<Record<GoodId, number>>>;
  roads: number;
}

/** The Steward (Satchel L2-L3) audit: what it bought, and any rule it broke (must stay empty). */
export interface StewardTrack {
  passes: number;
  buys: number;
  /** Local currency spent, per department. */
  spent: Partial<Record<DeptId, number>>;
  /** Purchases by department and candidate id. */
  bought: Record<string, number>;
  /** Rule breaks: spent below the reserve floor, bought a dial level, or more than the allowance. */
  violations: string[];
}

/** New-rule bookkeeping (Edicts, rituals, wing perks), for the report. */
export interface PerkTrack {
  /** Edict switches by `${edict}:${target}`. */
  edicts: Record<string, number>;
  /** Seconds each Edict stood (sim time), by Edict id. */
  edictSecs: Partial<Record<EdictId, number>>;
  /** Ritual bonus credited (local currency, summed across departments; count of rituals). */
  rituals: number;
  /** Day each new perk / extra was first bought (id -> sim day). */
  firstBuy: Record<string, number>;
  /** Dread spent on the Later / wing perks vs the original Dread perks. */
  dreadNew: number;
  dreadOld: number;
}

export interface SimResult {
  config: { days: number; seed: number; profile: string; fallAt: number; crush: number; depts: DeptId[]; phantomSeals: boolean; floorGrowth: number; noGoods: boolean };
  goods: GoodsTrack;
  steward: StewardTrack;
  perks: PerkTrack;
  tracks: Record<string, DeptTrack>;
  snaps: DaySnap[];
  events: SimEvent[];
  problems: string[]; // NaN / Infinity / negative balances
  final: SaveRoot;
  activeS: number;
  adapterStats: Record<string, Record<string, number>>;
  runtimeMs: number;
}

const DAY = 86400;
/** 00 §8 baseline: a department's state 30 min or more into a cycle. Counted in active-equivalent
 * time (on-screen seconds plus background/offline income at the measured active rate), so the
 * baseline is "the helpers a 30-min player would have bought". With 4+ departments sharing the
 * reference player's ~50 min a day, a department rarely gets 30 on-screen minutes in one cycle. */
const BASELINE_S = 30 * 60;

// ---------- the simulation ----------

export function simulate(cfg: SimConfig): SimResult {
  const t0 = performance.now();
  const adapters: DeptAdapter[] = cfg.adapters.map((f, i) => f(childSeed(cfg.seed, `adapter.${i}`)));
  const byId: Partial<Record<DeptId, DeptAdapter>> = {};
  for (const a of adapters) byId[a.id] = a;
  const defs: Record<string, DeptEcon> = {};
  for (const a of adapters) defs[a.id] = cfg.floorGrowth ? { ...a.def, floorGrowth: cfg.floorGrowth } : a.def;
  const built = DEPT_ORDER.filter((id) => byId[id]);

  const s = newSave(0);
  if (cfg.initialMeta) s.meta = JSON.parse(JSON.stringify(cfg.initialMeta));
  let t = 0; // sim seconds
  let activeS = 0;
  const nowMs = () => t * 1000;
  const day = () => Math.floor(t / DAY);
  const tracks: Record<string, DeptTrack> = {};
  const events: SimEvent[] = [];
  const snaps: DaySnap[] = [];
  const problems: string[] = [];
  const log = (kind: string, text: string, dept?: DeptId) =>
    events.push({ t, day: day(), activeMin: activeS / 60, kind, dept, text });

  for (const id of built) {
    tracks[id] = {
      id,
      unlockedAt: null,
      unlockedAtActiveMin: null,
      firstEntryAt: null,
      firstBuyOnScreenS: null,
      firstBuyIds: [],
      onScreenS: 0,
      onScreenCycleS: 0,
      aeCycleS: 0,
      econGateAEH: null,
      skillGateAEH: null,
      falls: [],
      tribute: 0,
      tributeCommend: 0,
      dread: 0,
      returns: 0,
      returnsAffordable: 0,
      ratio: {},
      dialBuys: [],
      ratioByDay: {},
      cycleStartT: 0,
      cycleStartOnScreen: 0,
      goodsPassive: 0,
      goodsActive: 0,
      lineMaxedAt: {},
    };
  }
  const goodsTrack: GoodsTrack = { marketGoods: 0, marketTribute: 0, spent: {}, levelsByDay: {}, stockByDay: {}, roads: 0 };
  const activeGoods: Partial<Record<DeptId, ActiveGoodsTrack>> = {};
  const useGoods = !cfg.noGoods;
  const stewardTrack: StewardTrack = { passes: 0, buys: 0, spent: {}, bought: {}, violations: [] };
  const perkTrack: PerkTrack = { edicts: {}, edictSecs: {}, rituals: 0, firstBuy: {}, dreadNew: 0, dreadOld: 0 };
  const off = new Set(cfg.off ?? []);
  const ritualScore = off.has('rituals') ? 0 : (cfg.profile.ritualScore ?? 0);
  let stewardAcc = 0;

  // Profile-derived constants for the meta buyer's value heuristics.
  const dayPlan = cfg.profile.day(1);
  const gaps: number[] = [];
  for (let i = 0; i < dayPlan.length; i++) {
    const end = dayPlan[i].at * 3600 + dayPlan[i].min * 60;
    const next = i + 1 < dayPlan.length ? dayPlan[i + 1].at * 3600 : 24 * 3600 + dayPlan[0].at * 3600;
    gaps.push(next - end);
  }
  const activePerDayS = dayPlan.reduce((a, p) => a + p.min * 60, 0);

  // ----- helpers mirroring game.ts -----

  const unlocked = () => built.filter((id) => s.depts[id]);

  /** game.ts credit(): the bank gets the amount, the economy gate counts it x econGateMult
   * (Fear Itself, +25% gate progress in the Edict's department). */
  function credit(d: DeptSave, amount: number, id?: DeptId): void {
    if (!(amount > 0)) return;
    d.run.bank += amount;
    d.cycle.earnings += amount * (id ? econGateMult(s, id) : 1);
  }
  function addTribute(amount: number, from?: DeptId, commend = false): void {
    if (!(amount > 0)) return;
    const m = s.meta;
    m.tribute += amount;
    m.tributeLifetime += amount;
    m.tributePeak = Math.max(m.tributePeak, m.tribute);
    if (from) {
      tracks[from].tribute += amount;
      if (commend) tracks[from].tributeCommend += amount;
    }
  }
  function unlock(id: DeptId): void {
    const def = defs[id];
    s.depts[id] = {
      v: def.version,
      unlockedAt: nowMs(),
      cycle: { n: 0, startedAt: nowMs(), earnings: 0, heldLevel: 0, legendWaiting: false },
      lifetime: { peakRank: 0, falls: 0, best: {} },
      imports: {},
      persistent: def.defaultPersistent(),
      run: def.defaultRun() as DeptSave['run'],
      seen: {},
    };
    const tr = tracks[id];
    tr.unlockedAt = t;
    tr.unlockedAtActiveMin = activeS / 60;
    tr.metaAtUnlock = JSON.parse(JSON.stringify(s.meta));
    tr.cycleStartT = t;
    log('unlock', `${id} unlocked`, id);
  }
  /** Measured active:on-screen-idle ratio so far (for active-equivalent time), default 2.5. */
  function ratioEst(id: DeptId): number {
    let b = 0;
    let i = 0;
    for (const a of Object.values(tracks[id].ratio)) {
      b += a.base;
      i += a.idle;
    }
    return i > 0 && b > 0 ? b / i : 2.5;
  }
  /** When each department's economy gate filled this cycle (slice picker, pass 6). */
  const econFullAt: Partial<Record<DeptId, number>> = {};
  function checkProgress(): void {
    for (const id of built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = defs[id];
      const tr = tracks[id];
      d.lifetime.peakRank = Math.max(d.lifetime.peakRank, rank(s, id, defs));
      const inf = infamy(def, d);
      if (inf.econ >= 1 && econFullAt[id] === undefined) econFullAt[id] = t;
      if (d.cycle.n === 0) {
        if (inf.econ >= 1 && tr.econGateAEH === null) tr.econGateAEH = tr.aeCycleS / 3600;
        if (inf.skill >= 1 && tr.skillGateAEH === null) tr.skillGateAEH = tr.aeCycleS / 3600;
      }
      if (inf.value >= 100 && !d.cycle.legendWaiting) {
        d.cycle.legendWaiting = true;
        log('legend', `${id} Legend at the gate (cycle ${d.cycle.n})`, id);
      }
      const mask = s.meta.commendations[id] ?? 0;
      def.commendations.forEach((c, i) => {
        if (mask & (1 << i)) return;
        if (c.test(d)) {
          s.meta.commendations[id] = (s.meta.commendations[id] ?? 0) | (1 << i);
          addTribute(commendationReward(i), id, true);
        }
      });
    }
  }
  function applyOffline(elapsed: number): void {
    const cap = offlineCapSeconds(s);
    const tt = Math.min(elapsed, cap);
    const tcap = Math.min(elapsed, tributeCapSeconds(s));
    const now = nowMs();
    for (const id of unlocked()) {
      const d = s.depts[id]!;
      // game.ts applyOffline: per-department factor (Iron Discipline adds 0.1 in its target, <= 0.9)
      // for local income and that department's Tribute.
      const factor = offlineFactor(s, id);
      const rate = defs[id].idleRate(d) * coreMult(s, id, defs, now);
      const amount = rate * factor * tt;
      credit(d, amount, id);
      tracks[id].aeCycleS += (factor * tt) / ratioEst(id);
      addTribute(tributeRate(s, id, defs, false) * factor * tcap, id);
      // Return ritual: the haul waits for the first entry after this absence.
      if (elapsed >= 60 && amount > 0) d.haul = (d.haul ?? 0) + amount;
      if (stewardOn(s, id)) stewardPass(id, stewardShare(s) * amount);
    }
    if (useGoods) {
      // game.ts applyOffline: passive Goods under the offline cap.
      const got = offlineGoods(s, defs, elapsed);
      for (const [g, amt] of Object.entries(got)) {
        addGoods(s, g as GoodId, amt);
        const ex = GOODS[g as GoodId].exporter;
        if (tracks[ex]) tracks[ex].goodsPassive += amt;
      }
    }
    checkProgress();
  }
  /** game.ts stewardPass (Satchel L2-L3): adds `allowance` to the pool (capped at the bank) and
   * spends what the ranking, the pool and the reserve allow, through the core's stewardSpend. The
   * audit checks the rules the core promises: never below the reserve floor, never past the pool,
   * never a dial level (each department's stewardCandidates must exclude dials, consumables and
   * spatial items; a dial move during the pass is the detectable symptom). */
  function stewardPass(id: DeptId, allowance: number): void {
    const d = s.depts[id];
    const def = defs[id];
    if (!d || !def?.stewardCandidates) return;
    const st = (s.meta.steward[id] ??= { on: true, reserve: 0, pool: 0 });
    st.pool = Math.min(d.run.bank, (st.pool || 0) + Math.max(0, allowance));
    const floor = Math.max(0, Math.min(0.9, st.reserve || 0)) * d.run.bank;
    const pool0 = st.pool;
    const dial0 = byId[id]!.dialLevel(d);
    const r = stewardSpend(d, () => def.stewardCandidates!(d), st.pool, floor);
    st.pool = Math.max(0, st.pool - r.spent);
    stewardTrack.passes++;
    if (!r.bought.length) return;
    stewardTrack.buys += r.bought.length;
    stewardTrack.spent[id] = (stewardTrack.spent[id] ?? 0) + r.spent;
    for (const b of r.bought) stewardTrack.bought[`${id}:${b}`] = (stewardTrack.bought[`${id}:${b}`] ?? 0) + 1;
    const bad = (msg: string) => stewardTrack.violations.length < 20 && stewardTrack.violations.push(`${id} t=${t}: ${msg}`);
    if (d.run.bank < floor - 1e-6 * Math.max(1, floor)) bad(`bank ${d.run.bank} below the reserve floor ${floor}`);
    if (r.spent > pool0 * (1 + 1e-9) + 1e-9) bad(`spent ${r.spent} past the pool ${pool0}`);
    if (byId[id]!.dialLevel(d) !== dial0) bad(`dial moved ${dial0} -> ${byId[id]!.dialLevel(d)} (bought ${r.bought.join(', ')})`);
    if (r.bought.some((b) => b === byId[id]!.dialId)) bad(`bought the dial (${byId[id]!.dialId})`);
  }

  function snapshot(dayIdx: number): void {
    const depts: DaySnap['depts'] = {};
    for (const id of unlocked()) {
      const d = s.depts[id]!;
      const inf = infamy(defs[id], d);
      depts[id] = {
        bank: d.run.bank,
        earnings: d.cycle.earnings,
        infamy: inf.value,
        skill: inf.skill,
        econ: inf.econ,
        rank: rankEff(s, id, defs),
        falls: d.lifetime.falls,
        dial: byId[id]!.dialLevel(d),
        idle: defs[id].idleRate(d),
        desc: byId[id]!.describe(d),
      };
    }
    goodsTrack.stockByDay[dayIdx] = Object.fromEntries(GOOD_ORDER.map((g) => [g, goodsStock(s, g)]));
    snaps.push({
      day: dayIdx,
      t,
      activeMin: activeS / 60,
      tribute: s.meta.tribute,
      tributeLifetime: s.meta.tributeLifetime,
      dread: s.meta.dread,
      dreadLifetime: s.meta.dreadLifetime,
      depts,
    });
    scan(s, `day ${dayIdx}`, problems);
  }

  // ----- the Throne Room: Seals, Throne upgrades, Dread perks -----

  const phantom = new Set<DeptId>();
  function nextSeal(): DeptId | null {
    const order = cfg.phantomSeals ? DEPT_ORDER : built;
    for (const id of order) if (!s.depts[id] && !phantom.has(id)) return id;
    return null;
  }
  function offlineShareGain(capS: number, extraS: number): number {
    const f = offlineFactor(s);
    let num = 0;
    let den = activePerDayS * 2.5;
    for (const g of gaps) {
      num += (Math.min(g, capS + extraS) - Math.min(g, capS)) * f;
      den += Math.min(g, capS) * f;
    }
    return den > 0 ? num / den : 0;
  }
  /** Tribute group without the option being valued (Tithe, Dark Tithe, Trophy Hall). */
  const tributeGroup = () => 1 + 0.15 * (s.meta.dreadPerks['empire.tithe'] ?? 0) + edictTributeAdd(s) + trophyAdd(s);
  /** Measured Dread per day from one department so far, net of its Legend's Bane. */
  function dreadPerDay(id: DeptId): number {
    const tr = tracks[id];
    if (tr.unlockedAt === null) return 0;
    const days = Math.max(1, (t - tr.unlockedAt) / DAY);
    return tr.dread / (1 + 0.1 * legendsBane(s, id)) / days;
  }
  const noteFirst = (key: string) => {
    if (perkTrack.firstBuy[key] === undefined) perkTrack.firstBuy[key] = t / DAY;
  };

  function throne(): void {
    if (cfg.noMeta) return;
    // Seals first, in unlock order.
    for (;;) {
      const id = nextSeal();
      if (!id) break;
      if (!byId[id]) {
        // Phantom Seal (unbuilt department): a pure Tribute sink.
        if (s.meta.dreadLifetime < (SEAL_DREAD[id] ?? 0) || s.meta.tribute + 1e-9 < SEAL_COST[id]) break;
        s.meta.tribute -= SEAL_COST[id];
        phantom.add(id);
        log('seal', `phantom Seal for ${id} (${SEAL_COST[id]} Tribute)`);
        continue;
      }
      if (s.meta.dreadLifetime < (SEAL_DREAD[id] ?? 0)) break;
      if (s.meta.tribute + 1e-9 < SEAL_COST[id]) break;
      s.meta.tribute -= SEAL_COST[id];
      unlock(id);
    }
    const seal = nextSeal();
    const reserve = seal && s.meta.dreadLifetime >= (SEAL_DREAD[seal] ?? 0) ? SEAL_COST[seal] : 0;
    const ids = unlocked();
    const n = Math.max(1, ids.length);
    if (useGoods) buyImportsWithGoods();
    // Tribute: Dark Banners, Curfew Bells, Treasury Vaults, Roads and the Throne extras by value per
    // Tribute (prices rounded up like the Throne sheet). Value = share of the empire's income; Tribute
    // boosts count half (the Tithe heuristic), since Tribute only buys these and Seals.
    const steward = cfg.profile.steward;
    for (let guard = 0; guard < 200; guard++) {
      const opts: { key: string; cost: number; value: number; qty?: number }[] = [];
      for (const id of ids) {
        const L = s.meta.throne[bannerId(id)] ?? 0;
        if (L < BANNER.max) opts.push({ key: bannerId(id), cost: Math.ceil(BANNER.cost(L)), value: 0.1 / (1 + 0.1 * L) / n });
      }
      for (const u of THRONE_UPGRADES) {
        const L = s.meta.throne[u.id] ?? 0;
        if (L >= u.max) continue;
        const v =
          u.id === 'curfewBells'
            ? offlineShareGain(offlineCapSeconds(s), 3600)
            : u.id === 'treasury'
              ? 0.5 * offlineShareGain(tributeCapSeconds(s), 7200)
              : u.id === ROADS.id && useGoods
                ? roadsValue(n)
                : 0;
        if (v > 0) opts.push({ key: u.id, cost: Math.ceil(u.cost(L)), value: v });
      }
      for (const u of off.has('extras') ? [] : THRONE_EXTRAS) {
        const L = s.meta.throne[u.id] ?? 0;
        if (L >= u.max) continue;
        let v = 0;
        // Trophy Hall: +1% Tribute per Legend captured (cap 25%), counting the next week's Falls.
        if (u.id === TROPHY_HALL_ID) {
          const fallsPerWeek = ids.reduce((a, id) => a + Math.min(7, 7 / Math.max(1.5, cycleDaysEst(id))), 0);
          v = (0.5 * Math.min(TROPHY_CAP, TROPHY_STEP * (s.meta.trophies.length + fallsPerWeek))) / tributeGroup();
        }
        // Edict Board: worth at least a standing Dark Tithe (+25% Tribute).
        else if (u.id === EDICT_BOARD_ID) v = (0.5 * DARK_TITHE) / tributeGroup();
        // Gobbo's Satchel: quality of life only for the reference player; the steward profile buys
        // it up to its Steward level ahead of everything but the Seal reserve.
        else if (u.id === SATCHEL_ID && steward && L < steward.satchel) v = 1e3;
        if (v > 0) opts.push({ key: u.id, cost: Math.ceil(u.cost(L)), value: v });
      }
      if (useGoods) {
        const m = marketOption(n);
        if (m) opts.push(m);
      }
      opts.sort((a, b) => b.value / b.cost - a.value / a.cost);
      const pick = opts[0];
      if (!pick || s.meta.tribute - pick.cost < reserve) break;
      if (pick.key.startsWith('market:')) {
        // Black Market: buy the shortfall of one import node, then the node.
        const node = IMPORT_NODES[Number(pick.key.slice(7))];
        const qty = pick.qty ?? MARKET_BUNDLE;
        const before = s.meta.tribute;
        if (!buyMarket(s, node.good, day(), qty)) break;
        goodsTrack.marketGoods += qty;
        goodsTrack.marketTribute += before - s.meta.tribute;
        buyImportsWithGoods();
        continue;
      }
      s.meta.tribute -= pick.cost;
      s.meta.throne[pick.key] = (s.meta.throne[pick.key] ?? 0) + 1;
      if (pick.key === ROADS.id) goodsTrack.roads++;
      if (THRONE_EXTRAS.some((u) => u.id === pick.key)) {
        noteFirst(`${pick.key}${s.meta.throne[pick.key]}`);
        log('extra', `${pick.key} L${s.meta.throne[pick.key]} (${pick.cost} Tribute)`);
      }
    }
    // Steward opt-in (steward profile): every unlocked department, at the profile's reserve.
    if (steward && satchelLevel(s) >= 2) {
      for (const id of ids) {
        const st = (s.meta.steward[id] ??= { on: false, reserve: steward.reserve, pool: 0 });
        if (!st.on) {
          st.on = true;
          st.reserve = steward.reserve;
        }
      }
    }
    if (!off.has('edicts')) edicts();
    // Dread: the original perks, the Later perks (Swift Rebuild, Goods Caravan) and the wing perks
    // (Head Start, Legend's Bane, Signature) by value per Dread, prices rounded up like the Altar.
    for (let guard = 0; guard < 200; guard++) {
      const opts: { key: string; cost: number; value: number; isNew: boolean; dept?: DeptId }[] = [];
      const perk = (k: string) => s.meta.dreadPerks[k] ?? 0;
      const dg = (id: DeptId) => 1 + 0.1 * perk('empire.ironFist') + 0.25 * perk(ruinbornId(id));
      const push = (key: string, cost: (l: number) => number, value: number, isNew: boolean, dept?: DeptId) => {
        if (value > 0) opts.push({ key, cost: Math.ceil(cost(perk(key))), value, isNew, dept });
      };
      for (const u of DREAD_PERKS) {
        const L = perk(u.id);
        if (L >= u.max) continue;
        let v = 0;
        if (u.id === 'empire.ironFist') v = ids.reduce((a, id) => a + 0.1 / dg(id), 0) / n;
        else if (u.id === 'empire.tithe') v = (0.5 * 0.15) / tributeGroup();
        else if (u.id === 'empire.longReach') v = offlineShareGain(offlineCapSeconds(s), 3600);
        else if (u.id === 'empire.idleHands') v = offlineFactor(s) < 0.9 ? (0.05 / offlineFactor(s)) * 0.6 : 0;
        push(u.id, u.cost, v, false);
      }
      for (const u of off.has('later') ? [] : LATER_PERKS) {
        if (perk(u.id) >= u.max) continue;
        // Swift Rebuild: 15 more Rush minutes at x3 per Fall, i.e. ~1,800 s of income per cycle,
        // weighed at half (income is lowest right after a Fall).
        if (u.id === SWIFT_REBUILD_ID) push(u.id, u.cost, ids.reduce((a, id) => a + (0.5 * 1800) / (cycleDaysEst(id) * DAY), 0) / n, true);
        // Goods Caravan: the same +10% trickle as an Imperial Roads level.
        else if (u.id === CARAVAN_ID && useGoods) push(u.id, u.cost, roadsValue(n), true);
      }
      for (const id of ids) {
        const L = perk(ruinbornId(id));
        if (L < RUINBORN.max) push(ruinbornId(id), RUINBORN.cost, 0.25 / dg(id) / n, false);
        // Head Start: the first 2L dial levels and 1 + L helpers each cycle. Valued as a fading
        // share of the department's income (the rebuild ramp it skips): +10% x 0.6^L.
        if (off.has('wings')) continue;
        if (defs[id].applyHeadStart && perk(headStartId(id)) < WING_PERKS.headStart.max)
          push(headStartId(id), WING_PERKS.headStart.cost, (0.1 * 0.6 ** perk(headStartId(id))) / dg(id) / n, true, id);
        // Signature: a one-time perk, valued like +15% local income.
        if (defs[id].signature && perk(signatureId(id)) < 1) push(signatureId(id), WING_PERKS.signature.cost, 0.15 / dg(id) / n, true, id);
      }
      // Legend's Bane pays in Dread: bought when its extra Dread over a week buys more than its
      // price would now (value = the best current value per Dread x a week of extra Dread).
      const lambda = opts.reduce((a, o) => Math.max(a, o.value / o.cost), 0);
      for (const id of off.has('wings') ? [] : ids) {
        if (perk(legendsBaneId(id)) >= WING_PERKS.legendsBane.max) continue;
        push(legendsBaneId(id), WING_PERKS.legendsBane.cost, lambda * 0.1 * dreadPerDay(id) * 7, true, id);
      }
      opts.sort((a, b) => b.value / b.cost - a.value / a.cost);
      const pick = opts[0];
      if (!pick || s.meta.dread + 1e-9 < pick.cost) break;
      s.meta.dread -= pick.cost;
      s.meta.dreadPerks[pick.key] = perk(pick.key) + 1;
      if (pick.isNew) {
        perkTrack.dreadNew += pick.cost;
        noteFirst(pick.key);
        log('perk', `${pick.key} L${s.meta.dreadPerks[pick.key]} (${pick.cost} Dread)`, pick.dept);
      } else perkTrack.dreadOld += pick.cost;
      // The Altar applies a Signature at once (throne.ts onBuy); it re-applies at every cycle start.
      if (pick.key.endsWith('.signature') && pick.dept) {
        const d = s.depts[pick.dept];
        if (d) defs[pick.dept].signature?.apply(d);
      }
    }
  }

  /** Average wall-clock days per completed cycle so far (2 before the first Fall). */
  function cycleDaysEst(id: DeptId): number {
    const f = tracks[id].falls;
    if (f.length < 2) return 2;
    const later = f.slice(1);
    return later.reduce((a, x) => a + x.cycleWallH, 0) / later.length / 24;
  }

  /**
   * The reference player's Edict (Edict Board): one standing Edict, switched at most hourly
   * (perks.setEdict enforces the cooldown).
   *  1. Dark Tithe while the next Seal's Dread is met but its Tribute is short.
   *  2. Otherwise Fear Itself where a department's economy gate is what holds its Legend (skill gate
   *     at least as full as the economy gate), the most lagging one.
   *  3. Otherwise Iron Discipline on the department whose cycle has run longest.
   */
  function edicts(): void {
    if (!(s.meta.throne[EDICT_BOARD_ID] ?? 0)) return;
    const now = nowMs();
    const cur = activeEdict(s);
    if (edictCooldown(s, now) > 0) return;
    const seal = nextSeal();
    let want: { id: EdictId; target?: DeptId } | null = null;
    if (seal && byId[seal] && s.meta.dreadLifetime >= (SEAL_DREAD[seal] ?? 0) && s.meta.tribute < SEAL_COST[seal]) want = { id: 'darkTithe' };
    if (!want) {
      let best: DeptId | null = null;
      let gap = 0;
      for (const id of unlocked()) {
        const d = s.depts[id]!;
        if (d.cycle.legendWaiting) continue;
        const inf = infamy(defs[id], d);
        if (inf.econ >= 1 || inf.skill < inf.econ) continue;
        const g = inf.skill - inf.econ + (1 - inf.econ);
        if (g > gap) {
          gap = g;
          best = id;
        }
      }
      if (best) want = { id: 'fearItself', target: best };
    }
    if (!want) {
      const ids = unlocked().filter((id) => !s.depts[id]!.cycle.legendWaiting);
      const longest = ids.sort((a, b) => tracks[a].cycleStartT - tracks[b].cycleStartT)[0];
      want = longest ? { id: 'ironDiscipline', target: longest } : { id: 'darkTithe' };
    }
    if (cur && cur.id === want.id && cur.target === want.target) return;
    if (setEdict(s, want.id, want.target, now)) {
      if (cur) perkTrack.edictSecs[cur.id] = (perkTrack.edictSecs[cur.id] ?? 0) + (now - cur.since) / 1000;
      const k = `${want.id}:${want.target ?? ''}`;
      perkTrack.edicts[k] = (perkTrack.edicts[k] ?? 0) + 1;
    }
  }

  // ----- Goods: import nodes, the Black Market, Imperial Roads -----

  /** Value of one import level, as a share of the empire's income (the Throne bot's currency):
   * +1.5% in one department plus its small mechanic (counted as another +0.5%). */
  const IMPORT_VALUE = 0.02;
  /** Buys every affordable import node with Goods, cheapest first (Goods have no other use). */
  function buyImportsWithGoods(): void {
    for (let guard = 0; guard < 64; guard++) {
      const cands = IMPORT_NODES.filter((nd) => canBuyImport(s, nd)).sort((a, b) => nodeCost(s, a) - nodeCost(s, b));
      const nd = cands[0];
      if (!nd) return;
      const c = nodeCost(s, nd);
      buyImport(s, nd);
      goodsTrack.spent[nd.good] = (goodsTrack.spent[nd.good] ?? 0) + c;
      goodsTrack.levelsByDay[day()] = (goodsTrack.levelsByDay[day()] ?? 0) + 1;
      const d = s.depts[nd.dept]!;
      if (importLv(d, nd.key) >= nd.max) {
        tracks[nd.dept].lineMaxedAt[nd.key] = t;
        log('goods', `${nd.dept} ${nd.good} line maxed`, nd.dept);
      }
    }
  }
  function openUnmaxed(): typeof IMPORT_NODES {
    return IMPORT_NODES.filter((nd) => byId[nd.dept] && lineOpen(s, nd) && importLv(s.depts[nd.dept], nd.key) < nd.max);
  }
  /** Imperial Roads: +10% of the passive Goods income over the next week, in import levels. */
  function roadsValue(n: number): number {
    const open = openUnmaxed();
    if (!open.length) return 0;
    const inc = goodsIncomePerH(s, defs);
    // The trickle group: Imperial Roads + Goods Caravan (goods.roadsMult).
    const L = (s.meta.throne[ROADS.id] ?? 0) + (s.meta.dreadPerks[CARAVAN_ID] ?? 0);
    let perDay = 0;
    for (const g of new Set(open.map((nd) => nd.good))) perDay += (inc[g] / (1 + 0.1 * L)) * 0.1 * 18;
    const avgCost = open.reduce((a, nd) => a + nodeCost(s, nd), 0) / open.length;
    return ((perDay * 7) / Math.max(1, avgCost)) * (IMPORT_VALUE / n);
  }
  /** The Black Market's best offer: the open node with the smallest Tribute shortfall. */
  function marketOption(n: number): { key: string; cost: number; value: number; qty: number } | null {
    let best: { key: string; cost: number; value: number; qty: number } | null = null;
    for (const nd of openUnmaxed()) {
      const short = nodeCost(s, nd) - goodsStock(s, nd.good);
      if (short <= 0) continue;
      const qty = Math.ceil(short / MARKET_BUNDLE) * MARKET_BUNDLE;
      const cost = marketCost(s, day(), qty);
      const value = IMPORT_VALUE / (1 + importAdd(s.depts[nd.dept])) / n;
      if (!best || value / cost > best.value / best.cost) best = { key: `market:${IMPORT_NODES.indexOf(nd)}`, cost, value, qty };
    }
    return best;
  }

  // ----- Falls -----

  function goals(id: DeptId): BotGoals {
    const d = s.depts[id]!;
    const def = defs[id];
    const n = d.cycle.n;
    return { dialGoal: cfg.fallAt > 100 ? def.skillTarget(n + 1) : def.skillTarget(n) };
  }
  function fallReady(id: DeptId): boolean {
    const d = s.depts[id]!;
    if (!d.cycle.legendWaiting) return false;
    const inf = infamy(defs[id], d).value;
    // Push policy: wait for fallAt, but never past the 200% ceiling.
    return inf >= Math.min(cfg.fallAt, 200) - 1e-9;
  }
  function fall(id: DeptId): void {
    const d = s.depts[id]!;
    const def = defs[id];
    const tr = tracks[id];
    const inf = infamy(def, d).value;
    const dread = dreadPayout(d, inf, cfg.crush, legendsBane(s, id));
    s.meta.dread += dread;
    s.meta.dreadLifetime += dread;
    s.meta.trophies.push({ dept: id, name: `${id}#${d.cycle.n}`, at: nowMs() });
    tr.dread += dread;
    tr.falls.push({
      n: d.cycle.n,
      t,
      day: t / DAY,
      infamy: inf,
      dread,
      cycleWallH: (t - tr.cycleStartT) / 3600,
      cycleOnScreenH: tr.onScreenCycleS / 3600,
      cycleAEH: tr.aeCycleS / 3600,
    });
    log('fall', `${id} Fall #${d.lifetime.falls + 1} at ${inf.toFixed(0)}% Infamy: +${dread} Dread`, id);
    d.lifetime.falls += 1;
    d.run = def.defaultRun() as DeptSave['run'];
    d.cycle = { n: d.cycle.n + 1, startedAt: nowMs(), earnings: 0, heldLevel: 0, legendWaiting: false };
    delete d.haul; // mirrors game.ts completeFall: an unplayed ritual never pays into the new cycle
    // game.ts applyCyclePerks: Head Start, then the Signature.
    const hs = headStartLevel(s, id);
    if (hs > 0) def.applyHeadStart?.(d, hs);
    if (hasSignature(s, id)) def.signature?.apply(d);
    tr.cycleStartT = t;
    delete econFullAt[id];
    tr.onScreenCycleS = 0;
    tr.aeCycleS = 0;
  }

  // ----- on-screen play -----

  const sessionStats: Record<string, ActiveSession> = {};
  let baseThisStep = 0;
  function envFor(id: DeptId): SessionEnv {
    const d = () => s.depts[id]!;
    return {
      now: nowMs,
      earn(base: number) {
        if (!(base > 0) || !Number.isFinite(base)) {
          if (!Number.isFinite(base)) problems.push(`non-finite earn in ${id} at t=${t}`);
          return 0;
        }
        baseThisStep += base;
        const amount = base * coreMult(s, id, defs, nowMs());
        credit(d(), amount, id);
        return amount;
      },
      raiseSkill(level: number) {
        if (level > d().cycle.heldLevel) d().cycle.heldLevel = level;
      },
    };
  }
  function shopOnce(id: DeptId, sess: ActiveSession): void {
    const a = byId[id]!;
    const d = s.depts[id]!;
    const dial0 = a.dialLevel(d);
    const income = defs[id].idleRate(d) * coreMult(s, id, defs, nowMs()) * ratioEst(id);
    const bought = sess.buy(goals(id));
    const tr = tracks[id];
    const dial1 = a.dialLevel(d);
    for (let k = dial0; k < dial1; k++)
      tr.dialBuys.push({ level: k + 1, minutes: income > 0 ? a.dialCost(k) / income / 60 : Infinity, cycle: d.cycle.n });
    if (bought.length && tr.firstBuyOnScreenS === null) {
      tr.firstBuyOnScreenS = tr.onScreenS;
      tr.firstBuyIds = bought.slice(0, 3);
      log('firstBuy', `${id} first upgrade (${bought[0]}) after ${tr.onScreenS.toFixed(0)} s on screen`, id);
    }
  }
  function enter(id: DeptId, play = true): ActiveSession {
    const tr = tracks[id];
    if (tr.firstEntryAt === null) tr.firstEntryAt = t;
    // Return ritual (game.ts startRitual): once, on the first entry after an absence, +5% x score
    // of the haul. A Collect-All visit (no play) skips it and keeps the haul for the next entry.
    const d = s.depts[id]!;
    if (play && d.haul && d.haul > 0) {
      const haul = d.haul;
      delete d.haul;
      const bonus = ritualBonus(haul, ritualScore);
      if (bonus > 0) {
        credit(d, bonus, id);
        perkTrack.rituals++;
      }
    }
    // The ritual plays on entry, before the player lets a waiting Legend in (the bonus is forfeit
    // if the scene closes, and the Fall re-enters the department), so it pays the old cycle.
    if (fallReady(id)) fall(id);
    activeGoods[id] = newActiveTrack();
    const sess = byId[id]!.startSession(s.depts[id]!, envFor(id));
    sessionStats[id] = sess;
    shopOnce(id, sess);
    return sess;
  }
  /** One second on screen in department `cur` (game.ts econTick + the live scene). */
  function tick(cur: DeptId, sess: ActiveSession): void {
    const d = s.depts[cur]!;
    const tr = tracks[cur];
    const idle = defs[cur].idleRate(d);
    // Ratio metrics net of the long node, which scales active and idle alike (sim/types.ts).
    const scale = byId[cur]!.ratioScale?.(d) ?? 1;
    const state = byId[cur]!.ratioState?.(d) ?? 'all';
    const phase = tr.aeCycleS >= BASELINE_S ? 'base' : 'early';
    baseThisStep = 0;
    sess.step(1);
    t += 1;
    activeS += 1;
    tr.onScreenS += 1;
    tr.onScreenCycleS += 1;
    tr.aeCycleS += 1;
    const agg = (tr.ratio[`${phase}:${state}`] ??= { base: 0, idle: 0, secs: 0, factorSecs: 0 });
    agg.base += baseThisStep / scale;
    agg.idle += idle / scale;
    agg.secs += 1;
    agg.factorSecs += offlineFactor(s, cur);
    if (phase === 'base') {
      const dd = (tr.ratioByDay[day()] ??= { base: 0, idle: 0, secs: 0, factorSecs: 0 });
      dd.base += baseThisStep / scale;
      dd.idle += idle / scale;
      dd.secs += 1;
      dd.factorSecs += offlineFactor(s, cur);
    }
    let tribute = 0;
    // game.ts econTick: the Steward's allowance accrues every tick, it spends every 5 s.
    const share = stewardShare(s);
    const stewardNow = share > 0 && ++stewardAcc >= 5;
    if (stewardNow) stewardAcc = 0;
    for (const id of unlocked()) {
      const od = s.depts[id]!;
      if (id !== cur) {
        const amount = defs[id].idleRate(od) * coreMult(s, id, defs, nowMs());
        credit(od, amount, id);
        tracks[id].aeCycleS += 1 / ratioEst(id);
        if (stewardOn(s, id)) {
          const st = (s.meta.steward[id] ??= { on: true, reserve: 0, pool: 0 });
          st.pool = (st.pool || 0) + share * amount;
          if (stewardNow) stewardPass(id, 0);
        }
      }
      const tr2 = tributeRate(s, id, defs, id === cur);
      tribute += tr2;
      tracks[id].tribute += tr2;
      if (useGoods) {
        // game.ts econTick: passive Goods everywhere, the active bonus on screen.
        const good = EXPORT_OF[id];
        const pas = passivePerH(s, id, defs) / 3600;
        addGoods(s, good, pas);
        tracks[id].goodsPassive += pas;
        if (id === cur) {
          const act = activeGoodsStep(defs[id], od, (activeGoods[id] ??= newActiveTrack()), 1);
          addGoods(s, good, act);
          tracks[id].goodsActive += act;
        }
      }
    }
    s.meta.tribute += tribute;
    s.meta.tributeLifetime += tribute;
    s.meta.tributePeak = Math.max(s.meta.tributePeak, s.meta.tribute);
    checkProgress();
  }

  /** Sim time each department's last on-screen slice ended. SIM CHANGE (pass 3): the slice picker
   * used "least time today" reset every session, so with 10-min sessions only the first two
   * departments in order ever got screen time (Cauldron and Mines ~25 min a day, the Dungeon and
   * the Bridge ~5, and departments 5-6 none outside Legend days). Now it rotates. */
  const lastVisit: Record<string, number> = {};
  function playSession(plan: SessionPlan, isReturn: boolean): void {
    if (isReturn) {
      for (const id of unlocked()) {
        // Only departments the player has entered: one unlocked at the very end of a session
        // (e.g. the Bridge, which starts with an empty bank and no goons) has had no chance to earn.
        if (tracks[id].firstEntryAt === null) continue;
        tracks[id].returns++;
        if (byId[id]!.anyAffordable(s.depts[id]!)) tracks[id].returnsAffordable++;
        else log('dry', `${id}: nothing affordable on return (${byId[id]!.describe(s.depts[id]!)})`, id);
      }
    }
    throne();
    let remaining = Math.round(plan.min * 60);
    const sessionStart = t;
    if (remaining <= 0) {
      // Collect-All visit: pop into each department to shop, no on-screen play.
      for (const id of unlocked()) enter(id, false).end();
      throne();
      return;
    }
    while (remaining > 0) {
      const ids = unlocked();
      const fresh = ids.find((id) => tracks[id].firstEntryAt === null);
      const legend = ids.find((id) => fallReady(id));
      // SIM CHANGE (pass 6): then a department whose economy gate has been full for 12 h while its
      // skill gate isn't (the HUD's Infamy bar shows it), once per session, the longest-waiting
      // first. Late War Pit cycles hung on one Triumph with ~1 Run a day (a 5.5-day stall in 1 of 3
      // seeds); a player reads that bar. The 12 h keeps it to real stalls, not the normal flow.
      const lagging = ids
        .filter((id) => (lastVisit[id] ?? -1) < sessionStart && !s.depts[id]!.cycle.legendWaiting)
        .filter((id) => econFullAt[id] !== undefined && t - econFullAt[id]! >= 12 * 3600 && infamy(defs[id], s.depts[id]!).skill < 1)
        .sort((a, b) => econFullAt[a]! - econFullAt[b]!)[0];
      // Otherwise the department visited longest ago (a round robin across sessions and days).
      const cur = fresh ?? legend ?? lagging ?? ids.slice().sort((a, b) => (lastVisit[a] ?? -1) - (lastVisit[b] ?? -1))[0];
      let sess = enter(cur);
      const slice = Math.min(remaining, cfg.sliceMin * 60);
      for (let i = 0; i < slice; i++) {
        tick(cur, sess);
        if ((i + 1) % cfg.buyEveryS === 0) shopOnce(cur, sess);
        if (fallReady(cur)) {
          sess.end();
          fall(cur);
          sess = enter(cur);
        }
      }
      sess.end();
      lastVisit[cur] = t;
      remaining -= slice;
      throne();
    }
  }

  // ----- run the days -----

  // First launch: the game unlocks the Cauldron in start(), at the first session.
  const first = cfg.profile.day(0)[0];
  t = first ? first.at * 3600 : 0;
  if (built.length) unlock(byId.cauldron ? 'cauldron' : built[0]);
  let lastDay = 0;
  for (let dIdx = 0; dIdx < cfg.days; dIdx++) {
    for (const plan of cfg.profile.day(dIdx)) {
      const start = dIdx * DAY + plan.at * 3600;
      if (start < t) continue;
      while (Math.floor(start / DAY) > lastDay) snapshot(lastDay++);
      const gap = start - t;
      if (gap >= 5) {
        t = start;
        applyOffline(gap);
      } else t = start;
      playSession(plan, gap >= 900);
    }
  }
  const end = cfg.days * DAY;
  if (end > t) {
    const gap = end - t;
    t = end;
    applyOffline(gap);
  }
  while (lastDay < cfg.days) snapshot(lastDay++);

  {
    const e = activeEdict(s);
    if (e) perkTrack.edictSecs[e.id] = (perkTrack.edictSecs[e.id] ?? 0) + (nowMs() - e.since) / 1000;
  }
  const adapterStats: Record<string, Record<string, number>> = {};
  for (const [id, sess] of Object.entries(sessionStats)) adapterStats[id] = sess.stats?.() ?? {};

  return {
    config: { days: cfg.days, seed: cfg.seed, profile: cfg.profile.name, fallAt: cfg.fallAt, crush: cfg.crush, depts: built, phantomSeals: !!cfg.phantomSeals, floorGrowth: cfg.floorGrowth ?? FLOOR_GROWTH, noGoods: !!cfg.noGoods },
    goods: goodsTrack,
    steward: stewardTrack,
    perks: perkTrack,
    tracks,
    snaps,
    events,
    problems,
    final: s,
    activeS,
    adapterStats,
    runtimeMs: performance.now() - t0,
  };
}

/** Flags NaN / Infinity anywhere in the save, and negative balances. */
export function scan(o: unknown, where: string, out: string[], path = 'save'): void {
  if (typeof o === 'number') {
    if (!Number.isFinite(o) && !(o === Infinity && path.endsWith('.max'))) out.push(`${where}: ${path} = ${o}`);
    else if (o < -1e-6 && (/(bank|tribute|dread|gems|tokens|earnings)$/i.test(path) || /\.(goods|imports)\./.test(path))) out.push(`${where}: negative ${path} = ${o}`);
    return;
  }
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) scan(v, where, out, `${path}.${k}`);
}
