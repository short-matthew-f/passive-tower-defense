// Fast balance gate (00 §8.1 CI tier): a seeded 7-day run of the headless meta simulation (sim/).
// Fails on the CI-flagged hard bands in sim/metrics.ts (integrity, first upgrade < 60 s, offline
// factor cap, Fall reachability, every department reaching its first Fall) and on the tuned bands
// listed in TUNED_GATES below; everything else is printed as a warning. The full report is
// `npm run sim`.
import { describe, expect, it } from 'vitest';
import { allAdapters } from '../sim/adapters';
import { DEFAULT_CONFIG, PROFILES, simulate } from '../sim/meta';
import { evaluate, type Metric } from '../sim/metrics';

// 7 days, so the Mines (first Fall on day 2-3) have cycles and baseline time to measure.
const DAYS = 7;

/**
 * Bands the balance tuning brought into range (sim/README.md "Tuning log"). A regression here
 * fails CI. Keyed `metricId|dept`, for the tuned departments only, so a department that has just
 * been added isn't gated before its own tuning pass. Both PASS-required: a soft band that slips
 * shows as WARN and still fails here.
 *
 * Left as warnings on purpose (not reached, see the tuning log):
 *  - firstFallDay|cauldron: the hard AE band (3-4 h +- 1 h) needs the Fall in the day-1 evening
 *    session; the arc's "early day 2" means ~7 h AE in the reference profile.
 *  - firstFallAE|mines, firstFallDay|mines, econGateAE|*: the same AE-vs-arc conflict.
 *  - cycleAvg|cauldron: week-1 Cauldron cycles run ~1.1 days (the 1.5-3 day band is for weeks 2-4).
 *  - dialStep|*: dial levels bought during the post-Fall ramp always read as a few minutes.
 */
const TUNED_GATES = [
  'firstFallAE|cauldron',
  'cycleMin|cauldron',
  'cycleMax|cauldron',
  'ratioOffline|cauldron',
  'ratioLocal.all|cauldron',
  'returnAffordable|cauldron',
  'tributeShare|cauldron',
  'dreadShare|cauldron',
  'unlock|mines',
  'cycleMin|mines',
  'cycleMax|mines',
  'cycleAvg|mines',
  'ratioOffline|mines',
  'ratioLocal.drum|mines',
  'returnAffordable|mines',
];

/** Suite-level bands whose targets are derived from the set of built departments (shares, the
 * day-7 Dread band). Gated only while exactly the tuned departments are built: adding one moves
 * the band, and its own tuning pass should re-baseline these. */
const TUNED_SET = ['cauldron', 'mines'];
const SUITE_GATES = ['tributeShare|cauldron', 'dreadShare|cauldron', 'tributeShare|mines', 'dreadShare|mines', 'dreadPacing|'];

const key = (m: Metric) => `${m.id}|${m.dept ?? ''}`;
const show = (m: Metric) => `${m.status} ${m.dept ?? 'suite'} ${m.label}: ${m.display} (band ${m.band})`;

describe('balance simulation (fast tier)', () => {
  const factories = allAdapters();
  const result = simulate({ ...DEFAULT_CONFIG, days: DAYS, seed: 1, adapters: factories });
  const metrics = evaluate(result, factories.map((f) => f(0)));
  const exactSet = result.config.depts.length === TUNED_SET.length && TUNED_SET.every((d) => result.config.depts.includes(d as never));
  const activeGates = () => (exactSet ? [...TUNED_GATES, ...SUITE_GATES] : TUNED_GATES);

  it('runs every built department', () => {
    expect(result.config.depts.length).toBeGreaterThanOrEqual(2);
    for (const id of result.config.depts) expect(result.tracks[id].unlockedAt).not.toBeNull();
  });

  it('passes every CI-gated hard band', () => {
    const gated = metrics.filter((m) => m.ci);
    expect(gated.length).toBeGreaterThan(0);
    const failed = gated.filter((m) => m.status === 'FAIL').map(show);
    const tuned = new Set(activeGates());
    const warned = metrics.filter((m) => !m.ci && !tuned.has(key(m)) && (m.status === 'FAIL' || m.status === 'WARN'));
    if (warned.length) console.warn(`balance: ${warned.length} soft/ungated findings (see npm run sim):\n` + warned.map((m) => `  ${show(m)}`).join('\n'));
    expect(failed).toEqual([]);
  });

  it('keeps the tuned bands in range', () => {
    const byKey = new Map(metrics.map((m) => [key(m), m]));
    const problems: string[] = [];
    for (const k of activeGates()) {
      const [id, dept] = k.split('|');
      // Gate only departments that are built in this run.
      if (dept && !result.config.depts.includes(dept as never)) continue;
      const m = byKey.get(k);
      if (!m) problems.push(`${k}: metric missing`);
      else if (m.status !== 'PASS') problems.push(`${id}: ${show(m)}`);
    }
    expect(problems).toEqual([]);
  });

  it('never produces NaN, Infinity or negative balances', () => {
    expect(result.problems).toEqual([]);
  });

  it('is deterministic for a seed', () => {
    const cfg = { ...DEFAULT_CONFIG, days: 1, seed: 7, profile: PROFILES.reference };
    const a = simulate({ ...cfg, adapters: allAdapters() });
    const b = simulate({ ...cfg, adapters: allAdapters() });
    const strip = (r: typeof a) => JSON.stringify({ tracks: r.tracks, snaps: r.snaps, events: r.events, meta: r.final.meta });
    expect(strip(a)).toEqual(strip(b));
  });
});
