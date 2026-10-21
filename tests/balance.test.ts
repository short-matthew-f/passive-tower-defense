// Fast balance gate (00 §8.1 CI tier): a seeded 7-day run of the headless meta simulation (sim/).
// Fails on the CI-flagged hard bands in sim/metrics.ts (integrity, first upgrade < 60 s, offline
// factor cap, Fall reachability, every department reaching its first Fall) and on the tuned bands
// listed in TUNED_GATES below; everything else is printed as a warning. The full report is
// `npm run sim`.
import { describe, expect, it } from 'vitest';
import { allAdapters } from '../sim/adapters';
import { DEFAULT_CONFIG, PROFILES, simulate } from '../sim/meta';
import { evaluate, type Metric } from '../sim/metrics';

// 7 days, so the later departments (first Falls on days 2-5) have cycles and baseline time to measure.
const DAYS = 7;

/**
 * Bands the balance tuning brought into range (sim/README.md "Tuning log"). A regression here
 * fails CI. Keyed `metricId|dept`, for the tuned departments only, so a department that has just
 * been added isn't gated before its own tuning pass. Both PASS-required: a soft band that slips
 * shows as WARN and still fails here.
 *
 * Left as warnings on purpose (not reached, see the tuning log):
 *  - firstFallDay|cauldron: the hard AE band (3-4 h +- 1 h) needs the Fall in the day-1 evening
 *    session; the arc's "early day 2" means ~5.5 h AE in the reference profile.
 *  - firstFallAE of the Mines, Dungeon and Bridge, econGateAE|*: the same AE-vs-arc conflict (each
 *    department's first Fall is held to its arc day instead).
 *  - cycleAvg|cauldron: week-1 Cauldron cycles run ~1.1 days (the 1.5-3 day band is for weeks 2-4).
 *  - dialStep|*: dial levels bought during the post-Fall ramp always read as a few minutes.
 *  - ratioLocal.all|bridge: 2.1-2.9x across seeds on ~25-35 baseline minutes (band 2.3-3.2x);
 *    the hard active:offline band is gated instead.
 *  - cycleAvg|bridge: one completed cycle in 7 days.
 */
const TUNED_GATES = [
  'firstFallAE|cauldron',
  'cycleMin|cauldron',
  'cycleMax|cauldron',
  'ratioOffline|cauldron',
  'ratioLocal.all|cauldron',
  'returnAffordable|cauldron',
  'unlock|mines',
  'cycleMin|mines',
  'cycleMax|mines',
  'cycleAvg|mines',
  'ratioOffline|mines',
  'ratioLocal.drum|mines',
  'returnAffordable|mines',
  'unlock|dungeon',
  'firstFallDay|dungeon',
  'cycleMin|dungeon',
  'cycleMax|dungeon',
  'ratioOffline|dungeon',
  'ratioLocal.all|dungeon',
  'returnAffordable|dungeon',
  'unlock|bridge',
  'firstFallDay|bridge',
  'cycleMin|bridge',
  'cycleMax|bridge',
  'ratioOffline|bridge',
  'returnAffordable|bridge',
];

/**
 * Suite-level bands whose targets are derived from the set of built departments (shares, the
 * day-7 Dread band). Gated per department set: adding a department moves the bands, so a set
 * that hasn't had its own tuning pass gates none of them until it's re-baselined here.
 *
 * Cauldron + Mines + Dungeon + Bridge: dreadShare|cauldron is left as a warning. The Cauldron
 * cycles every ~1.1 days in week 1 and Falls 6 times by day 7, while the Dungeon (first Fall
 * day 4) and the Bridge (day 5) Fall 1-2 times by the arc, so its share runs ~50% (cap 45.7%).
 * See the tuning log.
 */
const SUITE_GATES: Record<string, string[]> = {
  'cauldron,mines': ['tributeShare|cauldron', 'dreadShare|cauldron', 'tributeShare|mines', 'dreadShare|mines', 'dreadPacing|'],
  'cauldron,mines,dungeon,bridge': [
    'tributeShare|cauldron',
    'tributeShare|mines',
    'tributeShare|dungeon',
    'tributeShare|bridge',
    'dreadShare|mines',
    'dreadShare|dungeon',
    'dreadShare|bridge',
    'dreadPacing|',
  ],
};

const key = (m: Metric) => `${m.id}|${m.dept ?? ''}`;
const show = (m: Metric) => `${m.status} ${m.dept ?? 'suite'} ${m.label}: ${m.display} (band ${m.band})`;

describe('balance simulation (fast tier)', () => {
  const factories = allAdapters();
  const result = simulate({ ...DEFAULT_CONFIG, days: DAYS, seed: 1, adapters: factories });
  const metrics = evaluate(result, factories.map((f) => f(0)));
  const suite = SUITE_GATES[result.config.depts.join(',')];
  const activeGates = () => [...TUNED_GATES, ...(suite ?? [])];

  it('runs every built department', () => {
    if (!suite) console.warn(`balance: no suite gates for ${result.config.depts.join('+')} yet (re-baseline SUITE_GATES after its tuning pass)`);
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
    // A second run of the same seed (1 day, fresh adapters) must replay day 1 of the 7-day run
    // event for event, including every department's first purchase and the Seal unlocks.
    const b = simulate({ ...DEFAULT_CONFIG, days: 1, seed: 1, profile: PROFILES.reference, adapters: allAdapters() });
    const day1 = (r: typeof result) => JSON.stringify(r.events.filter((e) => e.t < 86400));
    expect(b.events.length).toBeGreaterThan(5);
    expect(day1(b)).toEqual(day1(result));
  });
});
