// War Pit sanity check: a greedy draft bot plays Runs on the real rules and we compare active
// Teeth/min with the on-screen idle of the warband it would station.
// Usage: node scripts/run-ts.mjs scripts/pit-bot.ts [runs=200] [stakes=0] [hardy=0] [pv=current]
// (pv 3 plays the pre-wave-1 rules: round-scaled rivals, the classic Huntmaster, no banked Chow.)
import { mulberry32 } from '../src/depts/pit/engine';
import { newRun, runEndBonus, type RunOpts } from '../src/depts/pit/run';
import { botRun } from '../src/depts/pit/bot';
import { BASE_POOL } from '../src/depts/pit/units';
import { defaultPersistent, defaultRun, gauntletReport, idleFromReport, intervalL } from '../src/depts/pit/def';
import type { DeptSave } from '../src/core/types';

const N = Number(process.argv[2] ?? 200);
const S = Number(process.argv[3] ?? 0);
const hardy = Number(process.argv[4] ?? 0);
const PV = process.argv[5] ? Number(process.argv[5]) : 0;

const opts: RunOpts = { pool: BASE_POOL, larder: 0, deepLarder: 0, penSpace: 0, freeRoll: false, gritMax: 4, hardy, ratStart: false, chowR1: false, sigils: 0, shade: 0 };
let tri = 0;
let wins = 0;
let secs = 0;
let teeth = 0;
let rounds = 0;
let early = 0;
let earlyN = 0;
let huntReached = 0;
let huntWon = 0;
let idleSum = 0;
const t0 = performance.now();
let battles = 0;
const rng = mulberry32(1234);
for (let i = 0; i < N; i++) {
  const rs = newRun(1000 + i, S, opts);
  if (PV) rs.pv = PV;
  const rep = botRun(rs, rng);
  battles += rep.outcomes.length;
  if (rep.ended === 'triumph') tri++;
  wins += rep.wins;
  secs += rep.seconds;
  rounds += rep.rounds;
  teeth += rep.teeth + runEndBonus(rs, 0);
  rep.outcomes.slice(0, 5).forEach((o) => {
    earlyN++;
    if (o === 1) early++;
  });
  if (rs.wins >= 7) {
    huntReached++;
    if (rep.ended === 'triumph') huntWon++;
  }
  if (i < 40) {
    const save = { cycle: { n: 0 }, imports: {}, run: { ...defaultRun(), garrison: rep.line, stakes: S, lv: { hardy } }, persistent: defaultPersistent() } as unknown as DeptSave;
    idleSum += idleFromReport(save.run as any, gauntletReport(save)) * 60;
  }
}
const ms = performance.now() - t0;
const activePerMin = teeth / (secs / 60);
const idlePerMin = idleSum / Math.min(40, N);
console.log(`Stakes ${S}, Hardy ${hardy}, ${N} runs (${(ms / battles).toFixed(3)} ms/battle incl. drafting)`);
console.log(`Triumph ${(100 * tri / N).toFixed(1)}%  avg wins ${(wins / N).toFixed(2)}  rounds ${(rounds / N).toFixed(1)}  r1-5 win ${(100 * early / earlyN).toFixed(0)}%  hunt ${huntReached ? (100 * huntWon / huntReached).toFixed(0) : '-'}% of ${huntReached}`);
console.log(`Run ${(secs / N / 60).toFixed(1)} min  Teeth/run ${(teeth / N).toFixed(0)}  active ${activePerMin.toFixed(1)}/min`);
console.log(`Stationed idle ${idlePerMin.toFixed(1)}/min at pace 0 (${intervalL(0)}s) -> ratio ${(activePerMin / idlePerMin).toFixed(2)}x; pace 6 -> ${(activePerMin / (idlePerMin * 40 / intervalL(6))).toFixed(2)}x`);
const starter = { cycle: { n: 0 }, imports: {}, run: defaultRun(), persistent: defaultPersistent() } as unknown as DeptSave;
const st = gauntletReport(starter);
console.log(`Starter garrison: ${(idleFromReport(starter.run as any, st) * 60).toFixed(2)}/min, mean rounds ${st.meanRounds.toFixed(2)}`);
