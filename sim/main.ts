// `npm run sim` entry: runs the reference profile over several seeds plus side profiles and
// calibration probes, prints the metrics table, and writes sim/out/report.{json,md}.
//
// Options (npm run sim -- --days 30 --seeds 5 --fall-at 150 --skill expert --live):
//   --days N      simulated days for the reference profile (default 7)
//   --seeds N     seeds for the reference profile (default 3)
//   --fall-at X   Fall policy: Fall at X% Infamy (100 = at once, up to 200 = push)
//   --skill S     bot skill: novice | reference | expert
//   --live        run the Cauldron's live core every second (no activeRate table)
//   --quick       reference profile only, 1 seed
import { allAdapters, type AdapterOpts } from './adapters';
import { DEFAULT_CONFIG, PROFILES, simulate, type SimResult } from './meta';
import { aggregate, evaluate, fmt, type Metric } from './metrics';
import { consoleTable, eventsList, markdownTable, snapsTable, statusCounts } from './report';
import type { Skill } from './adapters/mines';

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export interface SimOutput {
  code: number;
  files: Record<string, string>; // file name in sim/out -> contents (cli.mjs writes them)
}

export async function main(argv: string[] = []): Promise<SimOutput> {
  const t0 = performance.now();
  const days = Number(arg(argv, 'days') ?? 7);
  const seeds = argv.includes('--quick') ? 1 : Number(arg(argv, 'seeds') ?? 3);
  const fallAt = Number(arg(argv, 'fall-at') ?? 100);
  const skill = (arg(argv, 'skill') ?? 'reference') as Skill;
  const live = argv.includes('--live');
  const aopts: AdapterOpts = { cauldron: { skill, liveOnly: live }, mines: { skill } };

  // ----- reference profile, N seeds -----
  const runs: SimResult[] = [];
  const perSeed: Metric[][] = [];
  for (let k = 0; k < seeds; k++) {
    const factories = allAdapters(aopts);
    const cfg = { ...DEFAULT_CONFIG, days, fallAt, seed: 1 + k, adapters: factories };
    const r = simulate(cfg);
    runs.push(r);
    perSeed.push(evaluate(r, factories.map((f) => f(0))));
    console.log(`reference seed ${cfg.seed}: ${days} days in ${(r.runtimeMs / 1000).toFixed(1)} s`);
  }
  const metrics = aggregate(perSeed);

  // ----- side profiles -----
  const side: Metric[] = [];
  let phantomEvents = '';
  if (!argv.includes('--quick')) {
    // Idle-only: two Collect-All visits a day; Infamy must never come from offline.
    const idle = simulate({ ...DEFAULT_CONFIG, days, profile: PROFILES['idle-only'], adapters: allAdapters(aopts) });
    const falls = Object.values(idle.tracks).reduce((a, t) => a + t.falls.length, 0);
    side.push({
      id: 'idleOnlyFalls',
      label: 'Idle-only profile: Falls (no Infamy from offline)',
      value: falls,
      display: `${falls} Falls; skill gates ${Object.values(idle.final.depts)
        .map((d) => d?.cycle.heldLevel)
        .join('/')}`,
      band: '0',
      level: 'hard',
      ci: false,
      status: falls === 0 ? 'PASS' : 'FAIL',
    });
    const grew = idle.snaps.every((s, i) => i === 0 || Object.entries(s.depts).every(([id, d]) => d.idle >= (idle.snaps[i - 1].depts[id]?.idle ?? 0) - 1e-9));
    side.push({
      id: 'idleOnlyGrowth',
      label: 'Idle-only profile: idle income never falls day to day',
      value: grew ? 1 : 0,
      display: grew ? 'grows' : 'drops on some day',
      band: 'grows on every visit',
      level: 'hard',
      ci: false,
      status: grew ? 'PASS' : 'FAIL',
    });

    // Full-suite Tribute sink: the same run with the unbuilt departments' Seals paid as sinks.
    {
      const factories = allAdapters(aopts);
      const r = simulate({ ...DEFAULT_CONFIG, days, fallAt, phantomSeals: true, adapters: factories });
      const ms = evaluate(r, factories.map((f) => f(0)));
      const pick = ['firstFallAE', 'firstFallDay', 'ratioOffline', 'dreadPacing', 'tributeDay1'];
      for (const m of ms.filter((x) => pick.includes(x.id)))
        side.push({ ...m, id: `phantom.${m.id}`, label: `[phantom Seals] ${m.label}`, ci: false });
      phantomEvents = eventsList(r.events, ['seal', 'fall']);
    }

    // Single-department main: the reference schedule, one department only.
    for (const f of allAdapters(aopts)) {
      const a = f(0);
      const solo = simulate({ ...DEFAULT_CONFIG, days, adapters: [f] });
      const ref = runs[0].tracks[a.id]?.falls[0];
      const s0 = solo.tracks[a.id]?.falls[0];
      const ok = !!s0 && !!ref && s0.cycleAEH <= 1.5 * ref.cycleAEH;
      side.push({
        id: 'singleDept',
        dept: a.id,
        label: 'Single-department main: first Fall vs reference',
        value: s0 ? s0.cycleAEH : null,
        display: s0 ? `${s0.cycleAEH.toFixed(2)} h AE vs reference ${ref ? ref.cycleAEH.toFixed(2) : 'n/a'} h` : 'no Fall',
        band: '<= 1.5x reference',
        level: 'hard',
        ci: false,
        status: ok ? 'PASS' : 'FAIL',
      });
    }

    // Calibration probes: the live core with no player input vs idleRate (00 §7: idleRate is the
    // on-screen idle rate), over an 8 h solo stretch with the greedy buyer.
    for (const [id, f] of [
      // 900 s live samples per board state: the payout is skewed (rare gold-triple jackpots), so
      // short samples mostly undershoot the mean and the default 180 s read ~0.85x.
      ['cauldron', allAdapters({ cauldron: { passive: true, sampleS: 900 } })[0]],
      ['mines', allAdapters({ mines: { passive: true } })[1]],
    ] as const) {
      const r = simulate({ ...DEFAULT_CONFIG, days: 1, profile: PROFILES.solo, noMeta: true, adapters: [f] });
      const tr = r.tracks[id];
      let b = 0;
      let i = 0;
      for (const v of Object.values(tr.ratio)) {
        b += v.base;
        i += v.idle;
      }
      side.push({
        id: 'calibration',
        dept: id,
        label: 'Live board with no input / idleRate',
        value: b / i,
        display: `${fmt(b / i)}x`,
        band: '≈ 1.0 (idleRate is the on-screen idle rate)',
        lo: 0.9,
        hi: 1.15,
        level: 'soft',
        ci: false,
        status: b / i >= 0.9 && b / i <= 1.15 ? 'PASS' : 'WARN',
        note:
          id === 'cauldron'
            ? 'idleRate counts the gold pegs (sim-tuned, econ.ts expectedMult), so the live rain matches it.'
            : 'Crew alone on the live wall (hops, overkill, regrowth) vs the closed form; the probe taps only until the first hire.',
      });
    }
  }

  const all = [...metrics, ...side];
  const title = `Overlord balance sim: reference profile, ${days} days, ${seeds} seed(s), Fall at ${fallAt}%, ${skill} bots`;
  console.log(consoleTable(title, all));

  // ----- reports (written to sim/out by cli.mjs) -----
  const r0 = runs[0];
  const md = [
    `# ${title}`,
    '',
    `Generated by \`npm run sim\` (${new Date().toISOString().slice(0, 10)}). ${statusCounts(all)}. Runtime ${((performance.now() - t0) / 1000).toFixed(1)} s.`,
    '',
    'Levels follow 00 §8.1 (hard = spec hard band, soft = flagged). Only rows marked (CI) gate `npm test`. Values are seed medians; status is the worst seed.',
    '',
    markdownTable(all),
    '',
    `## Timeline (seed ${r0.config.seed})`,
    '',
    eventsList(r0.events),
    '',
    '## Phantom-Seal variant timeline (unbuilt Seals paid as Tribute sinks)',
    '',
    phantomEvents || '(not run)',
    '',
    `## End-of-day state (seed ${r0.config.seed})`,
    '',
    snapsTable(r0.snaps),
    '',
    `## Meta purchases at the end (seed ${r0.config.seed})`,
    '',
    `- Throne: ${JSON.stringify(r0.final.meta.throne)}`,
    `- Dread perks: ${JSON.stringify(r0.final.meta.dreadPerks)}`,
    `- Adapter stats: ${JSON.stringify(r0.adapterStats)}`,
    '',
  ].join('\n');
  const json = JSON.stringify(
      {
        title,
        metrics: all,
        perSeed,
        runs: runs.map((r) => ({ ...r, final: { meta: r.final.meta } })),
      },
      null,
      1,
    );
  console.log(`\nSimulated in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return { code: 0, files: { 'report.md': md, 'report.json': json } };
}
