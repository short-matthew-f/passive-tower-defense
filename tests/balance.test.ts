// Fast balance gate (00 §8.1 CI tier): a shortened, seeded run of the headless meta simulation
// (sim/). Fails only on CI-flagged hard bands (integrity, first upgrade < 60 s, offline factor cap,
// Fall reachability, every department reaching its first Fall); everything else is printed as a
// warning. The full report is `npm run sim`.
import { describe, expect, it } from 'vitest';
import { allAdapters } from '../sim/adapters';
import { DEFAULT_CONFIG, PROFILES, simulate } from '../sim/meta';
import { evaluate } from '../sim/metrics';

const DAYS = 4;

describe('balance simulation (fast tier)', () => {
  const factories = allAdapters();
  const result = simulate({ ...DEFAULT_CONFIG, days: DAYS, seed: 1, adapters: factories });
  const metrics = evaluate(result, factories.map((f) => f(0)));

  it('runs every built department', () => {
    expect(result.config.depts.length).toBeGreaterThanOrEqual(2);
    for (const id of result.config.depts) expect(result.tracks[id].unlockedAt).not.toBeNull();
  });

  it('passes every CI-gated hard band', () => {
    const gated = metrics.filter((m) => m.ci);
    expect(gated.length).toBeGreaterThan(0);
    const failed = gated.filter((m) => m.status === 'FAIL').map((m) => `${m.dept ?? 'suite'} ${m.label}: ${m.display} (band ${m.band})`);
    const warned = metrics.filter((m) => !m.ci && (m.status === 'FAIL' || m.status === 'WARN'));
    if (warned.length)
      console.warn(`balance: ${warned.length} soft/ungated findings (see npm run sim):\n` + warned.map((m) => `  ${m.status} ${m.dept ?? 'suite'} ${m.label}: ${m.display}`).join('\n'));
    expect(failed).toEqual([]);
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
