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
  infamy,
  offlineCapSeconds,
  offlineFactor,
  rank,
  rankEff,
  tributeCapSeconds,
  tributeRate,
} from '../src/core/economy';
import type { DeptEcon } from '../src/core/dept';
import { BANNER, bannerId, DREAD_PERKS, RUINBORN, ruinbornId, SEAL_COST, SEAL_DREAD, THRONE_UPGRADES } from '../src/core/meta';
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
}

export const PROFILES: Record<string, Profile> = {
  // Day 1: 90 min active; then ~50 min/day as 3 x 10 min + 1 x 20 min; the rest offline.
  reference: {
    name: 'reference',
    day: (d) =>
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
          ],
  },
  // Two Collect-All visits a day that buy what's Ready; no on-screen play after the first look.
  'idle-only': {
    name: 'idle-only',
    day: (d) => (d === 0 ? [{ at: 9, min: 5 }, { at: 20, min: 0 }] : [{ at: 8, min: 0 }, { at: 20, min: 0 }]),
  },
  // Plays one stretch of 8 h on day 1 (local-curve checks, single-department runs).
  solo: { name: 'solo', day: (d) => (d === 0 ? [{ at: 8, min: 480 }] : [{ at: 8, min: 60 }]) },
  grinder: {
    name: 'grinder',
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

export interface SimResult {
  config: { days: number; seed: number; profile: string; fallAt: number; crush: number; depts: DeptId[]; phantomSeals: boolean };
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
  for (const a of adapters) defs[a.id] = a.def;
  const built = DEPT_ORDER.filter((id) => byId[id]);

  const s = newSave(0);
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
    };
  }

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

  function credit(d: DeptSave, amount: number): void {
    if (!(amount > 0)) return;
    d.run.bank += amount;
    d.cycle.earnings += amount;
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
  function checkProgress(): void {
    for (const id of built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = defs[id];
      const tr = tracks[id];
      d.lifetime.peakRank = Math.max(d.lifetime.peakRank, rank(s, id, defs));
      const inf = infamy(def, d);
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
    const factor = offlineFactor(s);
    const cap = offlineCapSeconds(s);
    const tt = Math.min(elapsed, cap);
    const tcap = Math.min(elapsed, tributeCapSeconds(s));
    const now = nowMs();
    for (const id of unlocked()) {
      const d = s.depts[id]!;
      const rate = defs[id].idleRate(d) * coreMult(s, id, defs, now);
      credit(d, rate * factor * tt);
      tracks[id].aeCycleS += (factor * tt) / ratioEst(id);
      addTribute(tributeRate(s, id, defs, false) * factor * tcap, id);
    }
    checkProgress();
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
    // Tribute: Dark Banners, Curfew Bells, Treasury Vaults by value per Tribute.
    for (let guard = 0; guard < 200; guard++) {
      const opts: { key: string; cost: number; value: number }[] = [];
      for (const id of ids) {
        const L = s.meta.throne[bannerId(id)] ?? 0;
        if (L < BANNER.max) opts.push({ key: bannerId(id), cost: BANNER.cost(L), value: 0.1 / (1 + 0.1 * L) / n });
      }
      for (const u of THRONE_UPGRADES) {
        const L = s.meta.throne[u.id] ?? 0;
        if (L >= u.max) continue;
        const v =
          u.id === 'curfewBells'
            ? offlineShareGain(offlineCapSeconds(s), 3600)
            : u.id === 'treasury'
              ? 0.5 * offlineShareGain(tributeCapSeconds(s), 7200)
              : 0;
        if (v > 0) opts.push({ key: u.id, cost: u.cost(L), value: v });
      }
      opts.sort((a, b) => b.value / b.cost - a.value / a.cost);
      const pick = opts[0];
      if (!pick || s.meta.tribute - pick.cost < reserve) break;
      s.meta.tribute -= pick.cost;
      s.meta.throne[pick.key] = (s.meta.throne[pick.key] ?? 0) + 1;
    }
    // Dread perks by value per Dread.
    for (let guard = 0; guard < 200; guard++) {
      const opts: { key: string; cost: number; value: number }[] = [];
      const perk = (k: string) => s.meta.dreadPerks[k] ?? 0;
      const dg = (id: DeptId) => 1 + 0.1 * perk('empire.ironFist') + 0.25 * perk(ruinbornId(id));
      for (const u of DREAD_PERKS) {
        const L = perk(u.id);
        if (L >= u.max) continue;
        let v = 0;
        if (u.id === 'empire.ironFist') v = ids.reduce((a, id) => a + 0.1 / dg(id), 0) / n;
        else if (u.id === 'empire.tithe') v = (0.5 * 0.15) / (1 + 0.15 * L);
        else if (u.id === 'empire.longReach') v = offlineShareGain(offlineCapSeconds(s), 3600);
        else if (u.id === 'empire.idleHands') v = offlineFactor(s) < 0.9 ? (0.05 / offlineFactor(s)) * 0.6 : 0;
        if (v > 0) opts.push({ key: u.id, cost: u.cost(L), value: v });
      }
      for (const id of ids) {
        const L = perk(ruinbornId(id));
        if (L < RUINBORN.max) opts.push({ key: ruinbornId(id), cost: RUINBORN.cost(L), value: 0.25 / dg(id) / n });
      }
      opts.sort((a, b) => b.value / b.cost - a.value / a.cost);
      const pick = opts[0];
      if (!pick || s.meta.dread + 1e-9 < pick.cost) break;
      s.meta.dread -= pick.cost;
      s.meta.dreadPerks[pick.key] = perk(pick.key) + 1;
    }
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
    const dread = dreadPayout(d, inf, cfg.crush);
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
    tr.cycleStartT = t;
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
        credit(d(), amount);
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
  function enter(id: DeptId): ActiveSession {
    const tr = tracks[id];
    if (tr.firstEntryAt === null) tr.firstEntryAt = t;
    if (fallReady(id)) fall(id);
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
    agg.base += baseThisStep;
    agg.idle += idle;
    agg.secs += 1;
    agg.factorSecs += offlineFactor(s);
    if (phase === 'base') {
      const dd = (tr.ratioByDay[day()] ??= { base: 0, idle: 0, secs: 0, factorSecs: 0 });
      dd.base += baseThisStep;
      dd.idle += idle;
      dd.secs += 1;
      dd.factorSecs += offlineFactor(s);
    }
    let tribute = 0;
    for (const id of unlocked()) {
      const od = s.depts[id]!;
      if (id !== cur) {
        credit(od, defs[id].idleRate(od) * coreMult(s, id, defs, nowMs()));
        tracks[id].aeCycleS += 1 / ratioEst(id);
      }
      const tr2 = tributeRate(s, id, defs, id === cur);
      tribute += tr2;
      tracks[id].tribute += tr2;
    }
    s.meta.tribute += tribute;
    s.meta.tributeLifetime += tribute;
    s.meta.tributePeak = Math.max(s.meta.tributePeak, s.meta.tribute);
    checkProgress();
  }

  function playSession(plan: SessionPlan, isReturn: boolean): void {
    if (isReturn) {
      for (const id of unlocked()) {
        // Only departments the player has entered: one unlocked at the very end of a session
        // (e.g. the Bridge, which starts with an empty bank and no goons) has had no chance to earn.
        if (tracks[id].firstEntryAt === null) continue;
        tracks[id].returns++;
        if (byId[id]!.anyAffordable(s.depts[id]!)) tracks[id].returnsAffordable++;
      }
    }
    throne();
    let remaining = Math.round(plan.min * 60);
    const today: Record<string, number> = {};
    if (remaining <= 0) {
      // Collect-All visit: pop into each department to shop, no on-screen play.
      for (const id of unlocked()) enter(id).end();
      throne();
      return;
    }
    while (remaining > 0) {
      const ids = unlocked();
      const fresh = ids.find((id) => tracks[id].firstEntryAt === null);
      const legend = ids.find((id) => fallReady(id));
      const cur = fresh ?? legend ?? ids.slice().sort((a, b) => (today[a] ?? 0) - (today[b] ?? 0))[0];
      let sess = enter(cur);
      const slice = Math.min(remaining, cfg.sliceMin * 60);
      for (let i = 0; i < slice; i++) {
        tick(cur, sess);
        today[cur] = (today[cur] ?? 0) + 1;
        if ((i + 1) % cfg.buyEveryS === 0) shopOnce(cur, sess);
        if (fallReady(cur)) {
          sess.end();
          fall(cur);
          sess = enter(cur);
        }
      }
      sess.end();
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

  const adapterStats: Record<string, Record<string, number>> = {};
  for (const [id, sess] of Object.entries(sessionStats)) adapterStats[id] = sess.stats?.() ?? {};

  return {
    config: { days: cfg.days, seed: cfg.seed, profile: cfg.profile.name, fallAt: cfg.fallAt, crush: cfg.crush, depts: built, phantomSeals: !!cfg.phantomSeals },
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
    else if (o < -1e-6 && /(bank|tribute|dread|gems|tokens|earnings)$/i.test(path)) out.push(`${where}: negative ${path} = ${o}`);
    return;
  }
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) scan(v, where, out, `${path}.${k}`);
}
