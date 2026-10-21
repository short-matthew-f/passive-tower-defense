// Metrics and target bands (00 §8 milestone table, §8.1 metrics table, department specs).
// Each metric carries the spec's level (hard / soft / info) and a separate `ci` flag: CI fails only
// on ci-flagged hard metrics, so balance bands can stay visible as FAIL/WARN in the report while
// the coordinator decides when to gate merges on them.
import { dreadPayout, offlineFactor } from '../src/core/economy';
import { EXPORT_OF, GOOD_ORDER, GOODS, importAdd, importLv, IMPORT_NODES } from '../src/core/goods';
import type { DeptId } from '../src/core/types';
import type { RatioAgg, SimResult } from './meta';
import type { DeptAdapter } from './types';

export type Level = 'hard' | 'soft' | 'info';
export type Status = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export interface Metric {
  id: string;
  label: string;
  dept?: DeptId;
  value: number | null;
  display: string;
  band: string;
  lo?: number;
  hi?: number;
  level: Level;
  ci: boolean;
  status: Status;
  note?: string;
}

const H = 3600;
const DAY = 86400;
/** Baseline seconds below which the ratio rows are reported as INFO (too few payouts to judge). */
const MIN_RATIO_S = 600;

/** Spec arc (00 §6): first Fall of each department, in days since the start (0-based, fractional). */
export const ARC_FIRST_FALL_DAY: Partial<Record<DeptId, [number, number]>> = {
  cauldron: [1.0, 1.5], // "typically early day 2"
  mines: [2.0, 3.0], // "the Mines Fall second (day 3)"
  dungeon: [3.0, 4.0], // "the Dungeon third (day 4)"
  bridge: [4.0, 5.0], // not stated; next in line
  // Not stated in 00 §6. Derived: the Dungeon and the Bridge Fall ~2.8 and ~3.0 days after their
  // unlock in the reference profile, so departments 5-6 are held to 2.75-3.75 days after theirs
  // (Styx opens day 2, ~1.5 d; Spire day 4-5, ~3.5 d). That staggers them after the Bridge and
  // leaves the Spire's first Fall at the end of week 1, as 00 §6 implies (the full suite's
  // 120-200 Dread has the Spire contributing almost nothing by day 7).
  styx: [4.25, 5.25],
  spire: [6.25, 7.25],
  // The War Pit opens on day 6-8 (00 §6, ~6.0 d); the same 2.75-3.75 days after its unlock.
  pit: [8.75, 9.75],
};

/** 00 §6 reference unlock day for departments 5-7 (0-based days), tolerance ± 1 day (00 §8.1). */
export const ARC_UNLOCK_DAY: Partial<Record<DeptId, [number, number]>> = {
  styx: [1.0, 2.0], // "day 2"
  spire: [3.0, 5.0], // "day 4-5"
  pit: [5.0, 7.0], // "day 6-8"
};

/** Expected unlock time from 00 §6, in active minutes, with the ±30 min tolerance for departments 2-4. */
export const ARC_UNLOCK_ACTIVE_MIN: Partial<Record<DeptId, number>> = { mines: 10, dungeon: 40, bridge: 105 };

/** Sim seconds -> "day 2 08:10" (1-based day, like the spec's "day 2"). */
export function dayClock(t: number): string {
  const d = Math.floor(t / 86400);
  const h = (t - d * 86400) / 3600;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `day ${d + 1} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export const fmt = (x: number | null, digits = 2): string => {
  if (x === null || x === undefined) return 'n/a';
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-2)) return x.toExponential(2);
  return x.toFixed(digits);
};

function mk(m: Omit<Metric, 'status' | 'display'> & { display?: string; status?: Status }): Metric {
  let status: Status = m.status ?? 'INFO';
  if (!m.status && m.level !== 'info') {
    const v = m.value;
    const bad = v === null || !Number.isFinite(v) || (m.lo !== undefined && v < m.lo) || (m.hi !== undefined && v > m.hi);
    status = bad ? (m.level === 'hard' ? 'FAIL' : 'WARN') : 'PASS';
  }
  return { ...m, display: m.display ?? fmt(m.value), status };
}

function ratioOf(aggs: RatioAgg[]): { onScreen: number | null; offline: number | null; secs: number } {
  let b = 0;
  let i = 0;
  let f = 0;
  let n = 0;
  for (const a of aggs) {
    b += a.base;
    i += a.idle;
    f += a.factorSecs;
    n += a.secs;
  }
  if (!(i > 0) || n === 0) return { onScreen: null, offline: null, secs: n };
  const on = b / i;
  return { onScreen: on, offline: on / (f / n), secs: n };
}

/** Derived Dread band at day 7 for only the departments that exist (see README). */
export function dreadBand(depts: DeptId[], days = 7): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const id of depts) {
    const arc = ARC_FIRST_FALL_DAY[id];
    if (!arc) continue;
    const pay = (cycle: number, crush: number, first: number) => {
      let total = 0;
      let n = 0;
      for (let t = first; t <= days + 1e-9; t += cycle) {
        total += dreadPayout({ cycle: { n }, lifetime: { falls: n } } as never, 100, crush);
        n++;
      }
      return total;
    };
    lo += pay(3, 0, arc[1]);
    hi += pay(1.5, 0.25, arc[0]);
  }
  return [lo, hi];
}

export function evaluate(r: SimResult, adapters: DeptAdapter[]): Metric[] {
  const out: Metric[] = [];
  const ids = r.config.depts;
  const n = ids.length;
  const days = r.config.days;

  // ----- integrity (CI) -----
  out.push(
    mk({
      id: 'integrity',
      label: 'No NaN/Infinity, no negative balances',
      value: r.problems.length,
      display: r.problems.length ? `${r.problems.length} problems: ${r.problems[0]}` : 'clean',
      band: '0 problems',
      lo: 0,
      hi: 0,
      level: 'hard',
      ci: true,
    }),
  );
  out.push(
    mk({
      id: 'offlineFactor',
      label: 'Effective offline factor',
      value: offlineFactor(r.final),
      band: '<= 0.9',
      hi: 0.9,
      level: 'hard',
      ci: true,
    }),
  );

  for (const a of adapters) {
    const id = a.id;
    const tr = r.tracks[id];
    if (!tr) continue;

    // Fall reachability: every Fall #0-#5 target inside the shipped dial range.
    const need = Math.max(...[0, 1, 2, 3, 4, 5].map((k) => a.def.skillTarget(k)));
    out.push(
      mk({
        id: 'reach',
        dept: id,
        label: 'Fall #0-#5 skill targets inside the dial range',
        value: need,
        display: `max target ${need} / dial ${a.dialMax}`,
        band: `<= ${a.dialMax}`,
        hi: a.dialMax,
        level: 'hard',
        ci: true,
      }),
    );

    // First upgrade < 60 s on screen.
    out.push(
      mk({
        id: 'firstUpgrade',
        dept: id,
        label: 'First upgrade after entering (on-screen s)',
        value: tr.firstEntryAt === null ? null : tr.firstBuyOnScreenS,
        display: tr.firstBuyOnScreenS === null ? (tr.firstEntryAt === null ? 'never entered' : 'never') : `${tr.firstBuyOnScreenS.toFixed(0)} s (${tr.firstBuyIds.join(', ')})`,
        band: '< 60 s',
        lo: 0,
        hi: 59.999,
        level: 'hard',
        ci: tr.firstEntryAt !== null,
      }),
    );

    // Unlock time (departments 2+).
    const unlockArc = ARC_UNLOCK_ACTIVE_MIN[id];
    if (unlockArc !== undefined) {
      out.push(
        mk({
          id: 'unlock',
          dept: id,
          label: 'Unlock time (active minutes)',
          value: tr.unlockedAtActiveMin,
          display: tr.unlockedAtActiveMin === null ? 'never' : `${tr.unlockedAtActiveMin.toFixed(1)} min`,
          band: `${unlockArc} ± 30 min`,
          lo: Math.max(0, unlockArc - 30),
          hi: unlockArc + 30,
          level: 'soft',
          ci: false,
        }),
      );
    }

    const unlockDay = ARC_UNLOCK_DAY[id];
    if (unlockDay) {
      const d = tr.unlockedAt === null ? null : tr.unlockedAt / DAY;
      out.push(
        mk({
          id: 'unlockDay',
          dept: id,
          label: 'Unlock time (days since start)',
          value: d,
          display: d === null ? 'never' : `${d.toFixed(2)} d (${dayClock(tr.unlockedAt!)}, ${tr.unlockedAtActiveMin!.toFixed(0)} active min)`,
          band: `${unlockDay[0]}-${unlockDay[1]} d ± 1 day (00 §6)`,
          lo: unlockDay[0] - 1,
          hi: unlockDay[1] + 1,
          level: 'soft',
          ci: false,
        }),
      );
    }

    // First Fall.
    const f0 = tr.falls[0];
    const isStarter = id === ids[0];
    out.push(
      mk({
        id: 'firstFallAE',
        dept: id,
        label: 'First Fall, active-equivalent hours',
        value: f0 ? f0.cycleAEH : null,
        display: f0 ? `${f0.cycleAEH.toFixed(2)} h AE (${f0.cycleOnScreenH.toFixed(2)} h on screen, ${dayClock(f0.t)})` : 'no Fall',
        band: '3-4 h ± 1 h',
        lo: 2,
        hi: 5,
        level: isStarter ? 'hard' : 'soft',
        ci: false,
        note: isStarter ? 'The 00 §8 milestone is stated for the first Fall (the Cauldron).' : 'Held to the same band softly.',
      }),
    );
    const arc = ARC_FIRST_FALL_DAY[id];
    if (arc) {
      out.push(
        mk({
          id: 'firstFallDay',
          dept: id,
          label: 'First Fall, wall clock (days since start)',
          value: f0 ? f0.day : null,
          display: f0 ? `${f0.day.toFixed(2)} d (${dayClock(f0.t)})` : 'no Fall',
          band: `${arc[0]}-${arc[1]} d (00 §6 arc)`,
          lo: arc[0] - 0.15,
          hi: arc[1] + 0.5,
          level: 'soft',
          ci: false,
        }),
      );
    }
    // Generous cap for CI: the department must Fall at all within the run (when the run is long
    // enough for the spec arc).
    if (arc && days >= Math.ceil(arc[1] + 1)) {
      out.push(
        mk({
          id: 'fallsAtAll',
          dept: id,
          label: `Reaches its first Fall within ${days} days`,
          value: f0 ? f0.day : null,
          display: f0 ? `yes, ${dayClock(f0.t)}` : 'NO',
          band: `by day ${days}`,
          lo: 0,
          hi: days,
          level: 'hard',
          ci: true,
        }),
      );
    }

    out.push(
      mk({
        id: 'econGateAE',
        dept: id,
        label: 'Economy gate filled, first cycle (AE hours)',
        value: tr.econGateAEH,
        band: '≈ 2.5 h (00 §2.2)',
        lo: 2,
        hi: 3,
        level: 'soft',
        ci: false,
        note: tr.skillGateAEH !== null ? `skill gate filled at ${tr.skillGateAEH.toFixed(2)} h AE` : 'skill gate not filled',
      }),
    );

    // Cycle lengths.
    if (tr.falls.length) {
      const minWall = Math.min(...tr.falls.map((f) => f.cycleWallH));
      out.push(
        mk({
          id: 'cycleMin',
          dept: id,
          label: 'Shortest cycle (wall-clock hours)',
          value: minWall,
          display: `${minWall.toFixed(2)} h over ${tr.falls.length} Falls`,
          band: '>= 2 h',
          lo: 2,
          level: 'hard',
          ci: false,
        }),
      );
      const late = tr.falls.filter((f) => f.day >= 7);
      if (late.length) {
        const avg = late.reduce((acc, f) => acc + f.cycleWallH, 0) / late.length / 24;
        out.push(
          mk({
            id: 'cycleLate',
            dept: id,
            label: 'Cycle length, weeks 2-4 (days)',
            value: avg,
            band: '1.5-3 days (soft), <= 5 (hard)',
            lo: 1.5,
            hi: 3,
            level: 'soft',
            ci: false,
          }),
        );
      }
    }

    // Later cycles and stalls: the cycle in progress at the end counts if it has run past 5 days.
    {
      const endT = r.config.days * DAY;
      const lastStart = tr.falls.length ? tr.falls[tr.falls.length - 1].t : (tr.unlockedAt ?? 0);
      const openDays = (endT - lastStart) / DAY;
      const later = tr.falls.slice(1).map((f) => f.cycleWallH / 24);
      const longest = Math.max(openDays, ...later, 0);
      out.push(
        mk({
          id: 'cycleMax',
          dept: id,
          label: 'Longest cycle incl. the open one (days)',
          value: longest,
          display: `${longest.toFixed(2)} d (open cycle ${openDays.toFixed(2)} d, Infamy ${(r.snaps[r.snaps.length - 1]?.depts[id]?.infamy ?? 0).toFixed(0)}% at the end)`,
          band: '<= 5 days',
          hi: 5,
          level: 'hard',
          ci: false,
        }),
      );
      if (later.length) {
        const avg = later.reduce((acc, x) => acc + x, 0) / later.length;
        out.push(
          mk({
            id: 'cycleAvg',
            dept: id,
            label: 'Average cycle after the first Fall (days)',
            value: avg,
            display: `${avg.toFixed(2)} d over ${later.length} cycles`,
            band: '1.5-3 days (weeks 2-4 target)',
            lo: 1.5,
            hi: 3,
            level: 'soft',
            ci: false,
          }),
        );
      }
    }

    // Active : offline at baseline (>= 30 min on screen into a cycle).
    const states = new Set(Object.keys(tr.ratio).map((k) => k.split(':')[1]));
    const base = ratioOf(Object.entries(tr.ratio).filter(([k]) => k.startsWith('base:')).map(([, v]) => v));
    out.push(
      mk({
        id: 'ratioOffline',
        dept: id,
        label: 'Active : offline at baseline',
        value: base.offline,
        display: base.offline === null ? 'no baseline time' : `${fmt(base.offline)}x (on-screen ${fmt(base.onScreen)}x, ${(base.secs / 60).toFixed(0)} min)`,
        band: '3-5x',
        lo: 3,
        hi: 5,
        level: 'hard',
        ci: false,
        // A few baseline minutes (a department opened late in the run, e.g. the War Pit in a
        // 7-day run) are one or two lumpy payouts: reported, not judged.
        status: base.secs > 0 && base.secs < MIN_RATIO_S ? 'INFO' : undefined,
        note: base.secs > 0 && base.secs < MIN_RATIO_S ? `under ${MIN_RATIO_S / 60} baseline minutes: not judged` : undefined,
      }),
    );
    const early = ratioOf(Object.entries(tr.ratio).filter(([k]) => k.startsWith('early:')).map(([, v]) => v));
    out.push(
      mk({
        id: 'ratioEarly',
        dept: id,
        label: 'Active : offline, first 30 min of a cycle',
        value: early.offline,
        display: early.offline === null ? 'n/a' : `${fmt(early.offline)}x (on-screen ${fmt(early.onScreen)}x)`,
        band: 'may run higher (00 §8)',
        level: 'info',
        ci: false,
      }),
    );
    for (const st of states) {
      const band = a.localRatioBands?.[st];
      const rs = ratioOf(Object.entries(tr.ratio).filter(([k]) => k === `base:${st}`).map(([, v]) => v));
      if (!band || rs.onScreen === null) continue;
      out.push(
        mk({
          status: rs.secs < MIN_RATIO_S ? 'INFO' : undefined,
          id: `ratioLocal.${st}`,
          dept: id,
          label: `Active : on-screen idle at baseline (${st})`,
          value: rs.onScreen,
          display: `${fmt(rs.onScreen)}x (${(rs.secs / 60).toFixed(0)} min)`,
          band: `${band[0]}-${band[1]}x (dept spec)`,
          lo: band[0],
          hi: band[1],
          level: 'soft',
          ci: false,
        }),
      );
    }
    const days_ = Object.keys(tr.ratioByDay).map(Number).sort((x, y) => x - y);
    if (days_.length >= 2) {
      const series = days_.map((d) => ratioOf([tr.ratioByDay[d]]).offline);
      out.push(
        mk({
          id: 'ratioDrift',
          dept: id,
          label: 'Baseline active : offline by day',
          value: series[series.length - 1],
          display: series.map((x, i) => `d${days_[i]} ${fmt(x, 1)}`).join(' '),
          band: 'drift to 2.5-3x late (soft)',
          level: 'info',
          ci: false,
        }),
      );
    }

    // Something affordable on every return > 15 min.
    out.push(
      mk({
        id: 'returnAffordable',
        dept: id,
        label: 'Something affordable on returns > 15 min',
        value: tr.returns ? tr.returnsAffordable / tr.returns : null,
        display: tr.returns ? `${tr.returnsAffordable}/${tr.returns}` : 'no returns',
        band: '100%',
        lo: 0.99999,
        level: 'hard',
        ci: false,
      }),
    );

    // Dial step cost (W-01): minutes of income per dial level, towards the skill target.
    const db = tr.dialBuys.filter((b) => Number.isFinite(b.minutes) && b.level >= 2);
    if (db.length) {
      const mins = db.map((b) => b.minutes).sort((x, y) => x - y);
      const med = mins[Math.floor(mins.length / 2)];
      out.push(
        mk({
          id: 'dialStep',
          dept: id,
          label: 'Dial step cost (minutes of current income)',
          value: med,
          display: `median ${fmt(med, 1)} (min ${fmt(mins[0], 1)}, max ${fmt(mins[mins.length - 1], 1)}, ${mins.length} buys)`,
          band: '25-60 min',
          lo: 25,
          hi: 60,
          level: 'soft',
          ci: false,
        }),
      );
    }
  }

  // ----- suite-level: Tribute and Dread shares, Dread pacing -----
  const tribTotal = ids.reduce((acc, id) => acc + (r.tracks[id]?.tribute ?? 0), 0);
  const dreadTotal = ids.reduce((acc, id) => acc + (r.tracks[id]?.dread ?? 0), 0);
  const shareCap = Math.min(1, 1 / n + (0.35 - 1 / 7));
  for (const id of ids) {
    const tr = r.tracks[id];
    if (tribTotal > 0)
      out.push(
        mk({
          id: 'tributeShare',
          dept: id,
          label: `Tribute share by day ${days}`,
          value: tr.tribute / tribTotal,
          display: `${((100 * tr.tribute) / tribTotal).toFixed(1)}%`,
          band: `<= ${(100 * shareCap).toFixed(1)}% (derived)`,
          hi: shareCap,
          level: 'soft',
          ci: false,
          note: 'Spec: <= 35% at 7 depts = equal share + 20.7 pp; same margin applied to the departments that exist.',
        }),
      );
    if (dreadTotal > 0)
      out.push(
        mk({
          id: 'dreadShare',
          dept: id,
          label: `Dread share by day ${days}`,
          value: tr.dread / dreadTotal,
          display: `${((100 * tr.dread) / dreadTotal).toFixed(1)}%`,
          band: `<= ${(100 * shareCap).toFixed(1)}% (derived)`,
          hi: shareCap,
          level: 'soft',
          ci: false,
        }),
      );
  }
  const d7 = r.snaps.find((sn) => sn.day === 6);
  if (d7) {
    const [lo, hi] = dreadBand(ids);
    out.push(
      mk({
        id: 'dreadPacing',
        label: 'Lifetime Dread by day 7',
        value: d7.dreadLifetime,
        band: `${lo}-${hi} (derived for ${ids.join('+')}; full suite 120-200)`,
        lo,
        hi,
        level: 'soft',
        ci: false,
        note: 'Band = the 00 §6 arc for the departments that exist: first Falls on their arc day, then cycles of 3 days (low, Crush 0) to 1.5 days (high, Crush 25%), at 100% Infamy.',
      }),
    );
    out.push(
      mk({
        id: 'tributeDay7',
        label: 'Lifetime Tribute by day 7',
        value: d7.tributeLifetime,
        band: 'Seals: Bridge 4,000 at ~1:45, Styx 25,000 day 2, War Pit 600,000 day 6-8',
        level: 'info',
        ci: false,
      }),
    );
  }
  const d1 = r.snaps.find((sn) => sn.day === 0);
  if (d1)
    out.push(
      mk({
        id: 'tributeDay1',
        label: 'Lifetime Tribute by end of day 1',
        value: d1.tributeLifetime,
        band: 'arc: ~4,000 by 1:45 active (Bridge Seal), ~25,000 by day 2',
        level: 'info',
        ci: false,
      }),
    );
  if (!r.config.noGoods) out.push(...goodsMetrics(r, ids));
  void H;
  void DAY;
  return out;
}

/** 00 §8.1 Goods graph lint (hard): 7 exporters, 14 links, exactly 2 importers per Good, 2 imports
 * per department, and the import nodes match the graph. Pure data, so it never varies by seed. */
export function goodsGraphProblems(): string[] {
  const bad: string[] = [];
  const exporters = new Set(GOOD_ORDER.map((g) => GOODS[g].exporter));
  if (GOOD_ORDER.length !== 7 || exporters.size !== 7) bad.push('need 7 Goods from 7 different exporters');
  for (const g of GOOD_ORDER) {
    if (EXPORT_OF[GOODS[g].exporter] !== g) bad.push(`${g}: EXPORT_OF mismatch`);
    const imp = new Set(GOODS[g].importers);
    if (imp.size !== 2 || imp.has(GOODS[g].exporter)) bad.push(`${g}: needs 2 importers other than its exporter`);
  }
  const node1 = IMPORT_NODES.filter((nd) => nd.node === 1);
  if (node1.length !== 14) bad.push(`expected 14 Node-1 links, found ${node1.length}`);
  for (const nd of node1) if (!GOODS[nd.good].importers.includes(nd.dept)) bad.push(`${nd.dept} imports ${nd.good} off-graph`);
  const perDept = new Map<string, number>();
  for (const nd of node1) perDept.set(nd.dept, (perDept.get(nd.dept) ?? 0) + 1);
  for (const [d, k] of perDept) if (k !== 2) bad.push(`${d} has ${k} import lines`);
  return bad;
}

function goodsMetrics(r: SimResult, ids: DeptId[]): Metric[] {
  const out: Metric[] = [];
  const bad = goodsGraphProblems();
  out.push(
    mk({
      id: 'goodsGraph',
      label: 'Goods graph lint (7 exporters, 14 links, 2 importers per Good)',
      value: bad.length,
      display: bad.length ? bad.join('; ') : 'ok',
      band: '0 problems',
      hi: 0,
      level: 'hard',
      ci: true,
    }),
  );
  const endT = r.config.days * DAY;
  for (const g of GOOD_ORDER) {
    const gd = GOODS[g];
    const ex = r.tracks[gd.exporter];
    if (!ex || ex.unlockedAt === null) continue;
    const lines = IMPORT_NODES.filter((nd) => nd.good === g && ids.includes(nd.dept));
    // Earned per day while the exporter was unlocked.
    const alive = Math.max(1, (endT - ex.unlockedAt) / DAY);
    const earned = ex.goodsPassive + ex.goodsActive;
    out.push(
      mk({
        id: 'goodsIncome',
        dept: gd.exporter,
        label: `${gd.name} earned per day (passive + active)`,
        value: earned / alive,
        display: `${(earned / alive).toFixed(0)}/day (${((100 * ex.goodsActive) / Math.max(1e-9, earned)).toFixed(0)}% active)`,
        band: '00 §4: ~130/day per Good',
        level: 'info',
        ci: false,
      }),
    );
    if (lines.length < 2) continue; // an importer isn't built (the War Pit): the 2-line band can't be read
    const maxed = lines.map((nd) => r.tracks[nd.dept]?.lineMaxedAt[nd.key]);
    const levels = lines.reduce((a, nd) => a + importLv(r.final.depts[nd.dept], nd.key), 0);
    const all = maxed.every((x) => x !== undefined);
    const days = all ? (Math.max(...(maxed as number[])) - ex.unlockedAt) / DAY : null;
    const open = !all && (endT - ex.unlockedAt) / DAY < 16;
    out.push(
      mk({
        id: 'goodsLines',
        dept: gd.exporter,
        label: `${gd.name}: both import lines maxed (days after the exporter unlocks)`,
        value: days,
        display: days !== null ? `${days.toFixed(1)} d` : `not maxed by day ${r.config.days} (${levels}/${lines.length * 3} levels)`,
        band: '~12 ± 4 days (00 §8.1, soft)',
        lo: 8,
        hi: 16,
        level: 'soft',
        ci: false,
        status: open ? 'INFO' : undefined,
      }),
    );
  }
  const imp = ids.map((id) => `${id} +${(100 * importAdd(r.final.depts[id])).toFixed(1)}%`).join(', ');
  out.push(mk({ id: 'goodsImportAdd', label: `Goods group (importAdd) at day ${r.config.days}`, value: null, display: imp, band: '<= +18% each (cap)', level: 'info', ci: false }));
  const lifeT = r.final.meta.tributeLifetime;
  out.push(
    mk({
      id: 'goodsMarket',
      label: 'Black Market: Goods bought / share of lifetime Tribute',
      value: r.goods.marketGoods,
      display: `${r.goods.marketGoods} Goods for ${fmt(r.goods.marketTribute, 0)} Tribute (${((100 * r.goods.marketTribute) / Math.max(1, lifeT)).toFixed(1)}%), Roads ${r.goods.roads}`,
      band: 'a top-up, not the main source',
      level: 'info',
      ci: false,
    }),
  );
  return out;
}


/** Collapse per-seed metric lists: median value, worst status. */
export function aggregate(runs: Metric[][]): Metric[] {
  const rank: Record<Status, number> = { INFO: 0, PASS: 1, WARN: 2, FAIL: 3 };
  const key = (m: Metric) => `${m.id}|${m.dept ?? ''}`;
  const groups = new Map<string, Metric[]>();
  for (const run of runs) for (const m of run) groups.set(key(m), [...(groups.get(key(m)) ?? []), m]);
  const out: Metric[] = [];
  for (const ms of groups.values()) {
    const vals = ms.map((m) => m.value).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const worst = ms.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    const medRun = ms.find((m) => m.value === median) ?? worst;
    const spread = vals.length > 1 ? ` [seeds ${fmt(vals[0])}..${fmt(vals[vals.length - 1])}]` : '';
    out.push({ ...medRun, status: worst.status, display: medRun.display + (ms.length > 1 && vals.length > 1 ? spread : '') });
  }
  return out;
}
