// Metrics and target bands (00 §8 milestone table, §8.1 metrics table, department specs).
// Each metric carries the spec's level (hard / soft / info) and a separate `ci` flag: CI fails only
// on ci-flagged hard metrics, so balance bands can stay visible as FAIL/WARN in the report while
// the coordinator decides when to gate merges on them.
import { dreadPayout, offlineFactor } from '../src/core/economy';
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
};

/** 00 §6 reference unlock day for departments 5-7 (0-based days), tolerance ± 1 day (00 §8.1). */
export const ARC_UNLOCK_DAY: Partial<Record<DeptId, [number, number]>> = {
  styx: [1.0, 2.0], // "day 2"
  spire: [3.0, 5.0], // "day 4-5"
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
  void H;
  void DAY;
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
