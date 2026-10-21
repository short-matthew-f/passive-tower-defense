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
//   --ref-only    reference profile only (all --seeds), no side profiles
//   --floor-growth X  experiment: economy floor growth per Fall (shipped default FLOOR_GROWTH, 2.5)
//   --no-goods    turn the Goods system off (the pre-Goods baseline for before/after tables)
//   --out DIR     write report.{md,json} to DIR instead of sim/out (cli.mjs; parallel runs)
//   --profile P   reference-profile slot runs profile P instead (e.g. steward)
//   --seed N      first seed (default 1; --seeds counts up from it)
//   --off LIST    experiment: new rules off (edicts,rituals,extras,wings,later) for attribution
import { SEAL_DREAD } from '../src/core/meta';
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
  const floorGrowth = arg(argv, 'floor-growth') ? Number(arg(argv, 'floor-growth')) : undefined;
  const noGoods = argv.includes('--no-goods');
  const seed0 = Number(arg(argv, 'seed') ?? 1);
  const off = arg(argv, 'off')?.split(',').filter(Boolean);
  const profile = PROFILES[arg(argv, 'profile') ?? 'reference'] ?? PROFILES.reference;
  const aopts: AdapterOpts = { cauldron: { skill, liveOnly: live }, mines: { skill }, dungeon: { skill }, bridge: { skill }, styx: { skill }, spire: { skill, liveOnly: live }, pit: { skill } };

  // ----- reference profile, N seeds -----
  const runs: SimResult[] = [];
  const perSeed: Metric[][] = [];
  for (let k = 0; k < seeds; k++) {
    const factories = allAdapters(aopts);
    const cfg = { ...DEFAULT_CONFIG, off, profile, noGoods, days, fallAt, floorGrowth, seed: seed0 + k, adapters: factories };
    const r = simulate(cfg);
    runs.push(r);
    perSeed.push(evaluate(r, factories.map((f) => f(0))));
    console.log(`${profile.name} seed ${cfg.seed}: ${days} days in ${(r.runtimeMs / 1000).toFixed(1)} s`);
  }
  const metrics = [...aggregate(perSeed), ...perkMetrics(runs)];

  // ----- side profiles -----
  const side: Metric[] = [];
  let phantomEvents = '';
  if (!argv.includes('--quick') && !argv.includes('--ref-only')) {
    // Idle-only: two Collect-All visits a day; Infamy must never come from offline.
    const idle = simulate({ ...DEFAULT_CONFIG, off, noGoods, days, profile: PROFILES['idle-only'], adapters: allAdapters(aopts) });
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

    // Steward profile (Satchel L3, Steward on everywhere at a 25% reserve): the Steward must never
    // spend below the reserve or past its allowance, nor buy a dial (hard); its pace is context.
    {
      const factories = allAdapters(aopts);
      const r = simulate({ ...DEFAULT_CONFIG, off, noGoods, days, fallAt, profile: PROFILES.steward, adapters: factories });
      side.push(...stewardMetrics(r, runs, evaluate(r, factories.map((f) => f(0)))));
    }

    // Full-suite Tribute sink: the same run with the unbuilt departments' Seals paid as sinks.
    {
      const factories = allAdapters(aopts);
      const r = simulate({ ...DEFAULT_CONFIG, off, noGoods, days, fallAt, phantomSeals: true, adapters: factories });
      const ms = evaluate(r, factories.map((f) => f(0)));
      const pick = ['firstFallAE', 'firstFallDay', 'ratioOffline', 'dreadPacing', 'tributeDay1'];
      for (const m of ms.filter((x) => pick.includes(x.id)))
        side.push({ ...m, id: `phantom.${m.id}`, label: `[phantom Seals] ${m.label}`, ci: false });
      phantomEvents = eventsList(r.events, ['seal', 'fall']);
    }

    // Single-department main: the reference schedule, one department only. Departments 5-7 need
    // lifetime Dread from elsewhere, so they start from the reference player's meta at their
    // unlock (00 §8.1, W-23).
    for (const f of allAdapters(aopts)) {
      const a = f(0);
      const fixture = SEAL_DREAD[a.id] ? runs[0].tracks[a.id]?.metaAtUnlock : undefined;
      const solo = simulate({ ...DEFAULT_CONFIG, off, noGoods, days, adapters: [f], initialMeta: fixture });
      // Reference: the seed median of the department's first-Fall AE (like the other rows).
      const refs = runs.map((r) => r.tracks[a.id]?.falls[0]?.cycleAEH).filter((x): x is number => x !== undefined).sort((x, y) => x - y);
      const ref = refs.length ? refs[Math.floor(refs.length / 2)] : null;
      const s0 = solo.tracks[a.id]?.falls[0];
      const ok = !!s0 && ref !== null && s0.cycleAEH <= 1.5 * ref;
      side.push({
        id: 'singleDept',
        dept: a.id,
        label: 'Single-department main: first Fall vs reference',
        value: s0 ? s0.cycleAEH : null,
        display: s0 ? `${s0.cycleAEH.toFixed(2)} h AE vs reference ${ref !== null ? ref.toFixed(2) : 'n/a'} h${fixture ? ' (fixture: reference meta at unlock)' : ''}` : 'no Fall',
        band: '<= 1.5x reference',
        level: 'hard',
        ci: false,
        // No reference first Fall in this window (the War Pit in a 7-day run): nothing to compare.
        status: ref === null ? 'INFO' : ok ? 'PASS' : 'FAIL',
      });
    }

    // Calibration probes: the live core with no player input vs idleRate (00 §7: idleRate is the
    // on-screen idle rate), over an 8 h solo stretch with the greedy buyer.
    for (const [id, f] of [
      // 900 s live samples per board state: the payout is skewed (rare gold-triple jackpots), so
      // short samples mostly undershoot the mean and the default 180 s read ~0.85x.
      ['cauldron', allAdapters({ cauldron: { passive: true, sampleS: 900 } })[0]],
      ['mines', allAdapters({ mines: { passive: true } })[1]],
      ['dungeon', allAdapters({ dungeon: { passive: true } })[2]],
      ['bridge', allAdapters({ bridge: { passive: true } })[3]],
    ] as const) {
      const r = simulate({ ...DEFAULT_CONFIG, off, noGoods, days: 1, profile: PROFILES.solo, noMeta: true, adapters: [f] });
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
            : id === 'mines'
              ? 'Crew alone on the live wall (hops, overkill, regrowth) vs the closed form; the probe taps only until the first hire.'
              : id === 'dungeon'
                ? 'The live 20 Hz floor with no verbs (coins auto-collect) vs Cautious Mode; steals hit the bank, not earnings.'
                : 'Goons work the gate with no orders vs the 06 §3 closed form; each entry refills the bench.',
      });
    }
  }

  const all = [...metrics, ...side];
  const title = `Overlord balance sim: ${profile.name} profile, ${days} days, ${seeds} seed(s), Fall at ${fallAt}%, ${skill} bots${floorGrowth ? `, floor growth x${floorGrowth} (experiment)` : ''}`;
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
    `- Edict at the end: ${JSON.stringify(r0.final.meta.edict ?? null)}; switches ${JSON.stringify(r0.perks.edicts)}`,
    `- Steward: ${JSON.stringify(r0.steward)}`,
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

const medianOf = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

/** New-rule context rows (Pass 6): when the reference bot buys the new perks and extras, how its
 * Edict stood, and the ritual bonus. INFO only. */
function perkMetrics(runs: SimResult[]): Metric[] {
  const out: Metric[] = [];
  const keys = new Set<string>();
  for (const r of runs) for (const k of Object.keys(r.perks.firstBuy)) keys.add(k);
  const first = [...keys]
    .map((k) => ({ k, d: medianOf(runs.map((r) => r.perks.firstBuy[k] ?? NaN)), seeds: runs.filter((r) => r.perks.firstBuy[k] !== undefined).length }))
    .sort((a, b) => (a.d ?? 99) - (b.d ?? 99));
  out.push({
    id: 'perkFirstBuy',
    label: 'New perks / Throne extras: first bought (day, seed median)',
    value: first.length,
    display: first.length ? first.map((f) => `${f.k} d${f.d === null ? '?' : (f.d + 1).toFixed(1)}${f.seeds < runs.length ? ` (${f.seeds}/${runs.length} seeds)` : ''}`).join(', ') : 'none',
    band: 'sensible use, no exploit',
    level: 'info',
    ci: false,
    status: 'INFO',
  });
  const newShare = medianOf(runs.map((r) => r.perks.dreadNew / Math.max(1, r.perks.dreadNew + r.perks.dreadOld)));
  out.push({
    id: 'perkDreadShare',
    label: 'Dread spent on the Later / wing perks (share)',
    value: newShare,
    display: `${((newShare ?? 0) * 100).toFixed(0)}% (seed median)`,
    band: 'context',
    level: 'info',
    ci: false,
    status: 'INFO',
  });
  const r0 = runs[0];
  const secs = Object.entries(r0.perks.edictSecs).map(([k, v]) => `${k} ${((v ?? 0) / 86400).toFixed(1)} d`);
  out.push({
    id: 'edicts',
    label: `Edicts stood (seed ${r0.config.seed})`,
    value: Object.values(r0.perks.edicts).reduce((a, b) => a + b, 0),
    display: secs.length ? `${secs.join(', ')}; ${Object.values(r0.perks.edicts).reduce((a, b) => a + b, 0)} switches` : 'no Edict Board',
    band: 'context',
    level: 'info',
    ci: false,
    status: 'INFO',
  });
  out.push({
    id: 'rituals',
    label: 'Return rituals played (score 0.7, +3.5% of each haul)',
    value: medianOf(runs.map((r) => r.perks.rituals)),
    display: `${medianOf(runs.map((r) => r.perks.rituals))} (seed median)`,
    band: 'context',
    level: 'info',
    ci: false,
    status: 'INFO',
  });
  return out;
}

/** Steward profile rows: the hard rule audit plus pace context against the reference seeds. */
function stewardMetrics(r: SimResult, ref: SimResult[], ms: Metric[]): Metric[] {
  const out: Metric[] = [];
  const v = r.steward.violations;
  out.push({
    id: 'stewardRules',
    label: '[steward] Never below the reserve, past the allowance, or a dial',
    value: v.length,
    display: v.length ? `${v.length}: ${v[0]}` : `clean (${r.steward.buys} buys in ${r.steward.passes} passes)`,
    band: '0 violations',
    hi: 0,
    level: 'hard',
    ci: false,
    status: v.length ? 'FAIL' : 'PASS',
  });
  const spent = Object.entries(r.steward.spent).map(([id, x]) => `${id} ${fmt(x ?? 0, 0)}`).join(', ');
  const top = Object.entries(r.steward.bought).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`).join(', ');
  out.push({
    id: 'stewardBuys',
    label: '[steward] What it bought',
    value: r.steward.buys,
    display: r.steward.buys ? `${top}; spent ${spent}` : 'nothing (Satchel L2 not reached?)',
    band: 'idle nodes only',
    level: 'info',
    ci: false,
    status: r.steward.buys ? 'INFO' : 'WARN',
  });
  for (const id of r.config.depts) {
    const s0 = r.tracks[id].falls[0];
    const refDay = medianOf(ref.map((x) => x.tracks[id]?.falls[0]?.day ?? NaN));
    out.push({
      id: 'stewardFirstFall',
      dept: id,
      label: '[steward] First Fall day vs reference',
      value: s0 ? s0.day : null,
      display: `${s0 ? (s0.day).toFixed(2) : 'none'} d vs ${refDay === null ? 'none' : refDay.toFixed(2)} d; Falls ${r.tracks[id].falls.length} vs ${medianOf(ref.map((x) => x.tracks[id]?.falls.length ?? 0))}`,
      band: 'context',
      level: 'info',
      ci: false,
      status: 'INFO',
    });
  }
  // The steward run must still pass every hard band the reference run does.
  const hardFails = ms.filter((m) => m.level === 'hard' && m.status === 'FAIL');
  out.push({
    id: 'stewardHard',
    label: '[steward] Hard bands (integrity, first upgrade, ratios, returns, cycles)',
    value: hardFails.length,
    display: hardFails.length ? hardFails.map((m) => `${m.dept ?? 'suite'} ${m.id} ${m.display}`).join('; ').slice(0, 200) : 'all pass',
    band: '0 FAIL',
    hi: 0,
    level: 'hard',
    ci: false,
    status: hardFails.length ? 'FAIL' : 'PASS',
  });
  return out;
}
