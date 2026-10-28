// Fast balance gate (00 §8.1 CI tier): a seeded 7-day run of the headless meta simulation (sim/).
// Fails on the CI-flagged hard bands in sim/metrics.ts (integrity, first upgrade < 60 s, offline
// factor cap, Fall reachability, every department reaching its first Fall) and on the tuned bands
// listed in TUNED_GATES below; everything else is printed as a warning. The full report is
// `npm run sim`. A 30-day tier (weeks 2-4 cycle lengths, ~30 s) runs with BALANCE_LONG=1.
import { describe, expect, it } from 'vitest';
import { allAdapters } from '../sim/adapters';
import { DEFAULT_CONFIG, PROFILES, simulate } from '../sim/meta';
import { evaluate, type Metric } from '../sim/metrics';

// 7 days, so the later departments (first Falls on days 2-7) have cycles and baseline time to measure.
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
 *  - cycleAvg|cauldron: week-1 Cauldron cycles run ~1.2 days (the 1.5-3 day band is for weeks 2-4).
 *  - dialStep|*: dial levels bought during the post-Fall ramp always read as a few minutes.
 *  - ratioLocal.all|bridge: 2.1-2.9x across seeds on ~25-35 baseline minutes (band 2.3-3.2x);
 *    the hard active:offline band is gated instead.
 *  - cycleAvg|bridge: one completed cycle in 7 days.
 *  - firstFallAE|styx, |spire, econGateAE|*: the same AE-vs-arc conflict as departments 2-4.
 *  - ratioOffline|spire, ratioLocal.all|spire: ~25 baseline minutes of a lumpy payout (one
 *    Singularity is worth ~2,000 s of idle), so single seeds read 3.2-5.6x active:offline although
 *    the pooled 6-seed value is 4.1x (on screen 2.8x). Gated through `npm run sim`'s seed medians.
 *  - firstFallDay|spire: the first Spire Fall lands on day 7 08:00 or 18:00 (6.3-6.8 d) or just
 *    after the run, depending on whether the Seal opens on day 4 12:30 or 21:00.
 *  - dialStep|styx, |spire: as for the other departments.
 *  - War Pit (pass 5): the Seal opens on day 6-7 (5.5-6.3 d), so a 7-day run holds < 1.5 days of
 *    it. Its first Fall (~3 days after the Seal), cycles and active : offline (~5-30 baseline
 *    minutes here) are measured by `npm run sim -- --days 30` and the BALANCE_LONG tier, not here.
 *    firstUpgrade|pit is a CI-hard metric anyway.
 *  - Pass 6 (final): ratioOffline|spire, ratioLocal.all|spire and firstFallDay|spire stay warnings
 *    (15-20 baseline minutes in week 1; one seed in three Falls just after day 7);
 *    ratioLocal.all|bridge reads 2.33-2.44x on a 2.3x floor. Added: firstFallDay|mines,
 *    cycleAvg|dungeon, cycleMax|pit, and dreadShare|cauldron for the seven-department set.
 *  - Pass 7 (Wave 1 pacing reset: cheaper Seals, 24 h offline cap, Night Orders, active play x2 on
 *    the economy gate): the unlock / first-Fall arcs in sim/metrics.ts were re-baselined to the new
 *    design (Bridge in session 1, Styx day 1, Spire day 2, Pit day 3). cycleAvg|mines dropped: its
 *    week-1 cycles now run ~1.5 days, at the floor of the weeks 2-4 band (like the Cauldron's).
 */
const TUNED_GATES = [
  'firstFallAE|cauldron',
  'cycleMin|cauldron',
  'cycleMax|cauldron',
  'ratioOffline|cauldron',
  'ratioLocal.all|cauldron',
  'returnAffordable|cauldron',
  'unlock|mines',
  'firstFallDay|mines',
  'cycleMin|mines',
  'cycleMax|mines',
  'ratioOffline|mines',
  'ratioLocal.drum|mines',
  'returnAffordable|mines',
  'unlock|dungeon',
  'firstFallDay|dungeon',
  'cycleAvg|dungeon',
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
  'unlockDay|styx',
  'firstFallDay|styx',
  'cycleMin|styx',
  'cycleMax|styx',
  'ratioOffline|styx',
  'ratioLocal.all|styx',
  'returnAffordable|styx',
  'unlockDay|spire',
  'cycleMin|spire',
  'cycleMax|spire',
  'returnAffordable|spire',
  'unlockDay|pit',
  'cycleMax|pit',
  'returnAffordable|pit',
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
  // Six departments (pass 3). dreadShare|cauldron stays a warning for the same reason (~41% vs a
  // 37.4% cap; the 00 §6 arc itself implies 24-31% for the starter, see the tuning log).
  'cauldron,mines,dungeon,bridge,styx,spire': [
    'tributeShare|cauldron',
    'tributeShare|mines',
    'tributeShare|dungeon',
    'tributeShare|bridge',
    'tributeShare|styx',
    'tributeShare|spire',
    'dreadShare|mines',
    'dreadShare|dungeon',
    'dreadShare|bridge',
    'dreadShare|styx',
    'dreadShare|spire',
    'dreadPacing|',
  ],
  // Seven departments (pass 5). Shares cap at 35% (00 §8.1's own number at 7). Pass 6: the
  // Cauldron's skill gate is one Malice level higher from its second cycle, which brought
  // dreadShare|cauldron from ~45% to 32-34% (seed 3 still ~40%; seed 1 is gated here).
  'cauldron,mines,dungeon,bridge,styx,spire,pit': [
    'tributeShare|cauldron',
    'dreadShare|cauldron',
    'tributeShare|mines',
    'tributeShare|dungeon',
    'tributeShare|bridge',
    'tributeShare|styx',
    'tributeShare|spire',
    'tributeShare|pit',
    'dreadShare|mines',
    'dreadShare|dungeon',
    'dreadShare|bridge',
    'dreadShare|styx',
    'dreadShare|spire',
    'dreadShare|pit',
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

  // The second run costs ~2-4 s alone, but more on a loaded CI box (it once timed out at 5 s).
  it('is deterministic for a seed', { timeout: 20_000 }, () => {
    // A second run of the same seed (1 day, fresh adapters) must replay day 1 of the 7-day run
    // event for event, including every department's first purchase and the Seal unlocks.
    const b = simulate({ ...DEFAULT_CONFIG, days: 1, seed: 1, profile: PROFILES.reference, adapters: allAdapters() });
    const day1 = (r: typeof result) => JSON.stringify(r.events.filter((e) => e.t < 86400));
    expect(b.events.length).toBeGreaterThan(5);
    expect(day1(b)).toEqual(day1(result));
  });
});

describe('balance simulation (Steward)', () => {
  it('never spends below the reserve, past its allowance, or on a dial', { timeout: 20_000 }, () => {
    // The steward profile buys Gobbo's Satchel L2-L3 on day 1-2 and opts every department in at a
    // 25% reserve; 3 days cover the Satchel, the first Falls and the first Steward-run nights.
    const r = simulate({ ...DEFAULT_CONFIG, days: 3, seed: 1, profile: PROFILES.steward, adapters: allAdapters() });
    expect(r.steward.violations).toEqual([]);
    expect(r.steward.buys).toBeGreaterThan(0);
    expect(r.problems).toEqual([]);
  });
});

/**
 * Long tier (00 §8.1 "weeks 2-4"): one seeded 30-day run, ~30 s, so it runs only with
 * BALANCE_LONG=1 (`BALANCE_LONG=1 npx vitest run tests/balance.test.ts`). Pass 5 brought every
 * department's weeks 2-4 cycles into 1.5-3 days (long nodes, floor growth x2.5); this gates that
 * band and the hard 5-day ceiling on seed 1. Known risk (sim/README.md "Pass 5"): the War Pit's
 * late cycles hang on one Triumph at Stakes 10 with ~1 Run a day, so other seeds can stall it.
 */
const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BALANCE_LONG;
describe.skipIf(!LONG)('balance simulation (30-day tier)', () => {
  it('keeps weeks 2-4 cycles in 1.5-3 days and every cycle under 5 days', { timeout: 120_000 }, () => {
    // Inside the test: a skipped describe still runs its body when the file is collected.
    const factories = allAdapters();
    const result = simulate({ ...DEFAULT_CONFIG, days: 30, seed: 1, adapters: factories });
    const metrics = evaluate(result, factories.map((f) => f(0)));
    const problems = metrics.filter((m) => (m.id === 'cycleLate' || m.id === 'cycleMax') && m.status !== 'PASS').map(show);
    expect(metrics.filter((m) => m.id === 'cycleLate').length).toBe(result.config.depts.length);
    expect(problems).toEqual([]);
  });
});
