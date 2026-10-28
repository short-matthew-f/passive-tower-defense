// Cauldron adapter: drives the game's own headless core (src/depts/cauldron/logic.ts, the same
// CauldronCore the scene runs, on the real peg-board physics in sim.ts) with a reference bot.
//
// Two layers (00 §8.1): the live core runs for the first SAMPLE_S seconds the bot spends in each
// coarse board state; after that the measured active:idle ratio and Batch rate for that state are
// reused (a lazily filled activeRate table). Cycles revisit the same states, so long runs mostly
// hit the table. Set `liveOnly` to run every second live (slower; used to validate the table).
import { cauldronEcon } from '../../src/depts/cauldron/def';
import {
  bucketMults,
  dropsPerSec,
  heldMalice,
  idleRateOf,
  inZone,
  lvOf,
  MALICE_MAX,
  maliceCost,
  rlvOf,
  rows,
  upCost,
  UPGRADES,
  upLocked,
  type CPersistent,
  type CRun,
} from '../../src/depts/cauldron/econ';
import { CauldronCore } from '../../src/depts/cauldron/logic';
import { Board, BALL_R, BOARD_W, BUCKETS, CENTER_X, COL_W, ROW_H, type SimEvents } from '../../src/depts/cauldron/sim';
import { longMult } from '../../src/core/longnode';
import type { DeptSave } from '../../src/core/types';
import { childSeed, makeRng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';

/** Bot skill (00 §8.1: novice / reference / expert set reaction noise and decision quality). */
const SKILL: Record<Skill, { tossDelay: number; ladleEvery: number; ladleMin: number }> = {
  // tossDelay: mean reaction (s) after the Toss cooldown ends; ladleEvery: seconds between Ladle
  // decisions; ladleMin: ingredients a Ladle must catch to be worth a charge.
  novice: { tossDelay: 1.2, ladleEvery: 2, ladleMin: 1 },
  reference: { tossDelay: 0.45, ladleEvery: 0.75, ladleMin: 1.8 },
  expert: { tossDelay: 0.1, ladleEvery: 0.3, ladleMin: 2.2 },
};

export interface CauldronOpts {
  skill?: Skill;
  /** No Tosses, no Ladles: the live board with no input (calibrates idleRate). */
  passive?: boolean;
  /** Live seconds sampled per coarse board state before the cached ratio is reused. */
  sampleS?: number;
  liveOnly?: boolean;
}

/** Bot decision cadence (s): Tosses are taken as soon as the cooldown allows, within this. */
const BOT_TICK = 0.1;
const REROLL_STALE_S = 45;

// ---------- chute landing distributions (the bot's "Scrying" knowledge), common random numbers ----------

const chuteCache = new Map<string, number[][]>();
function chuteDist(r: number, malice: number): number[][] {
  const key = `${r}|${malice}`;
  let d = chuteCache.get(key);
  if (d) return d;
  d = [];
  const N = 160;
  for (let k = 0; k < BUCKETS; k++) {
    const counts = new Array(BUCKETS).fill(0);
    const board = new Board({ rows: r, malice, gold: 0 }, 777 + k);
    const jit = makeRng(4242 + k);
    const ev: SimEvents = { land: (_b, b) => counts[b]++ };
    let dropped = 0;
    while (dropped < N || board.balls.length) {
      if (dropped < N && board.balls.length < 16) {
        const x = k * COL_W + COL_W / 2 + (jit() - 0.5) * 2;
        board.drop('newt', Math.max(BALL_R, Math.min(BOARD_W - BALL_R, x)), true);
        dropped++;
      }
      board.step(ev);
    }
    d.push(counts.map((c) => c / N));
  }
  chuteCache.set(key, d);
  return d;
}

// ---------- greedy buyer ----------

/** Active-only nodes don't move idleRate; the buyer values them with these proxies (share of income).
 * Gold Peg and Gold Polish are in idleRate (econ.ts expectedMult), so they need no proxy. */
function activeProxy(run: CRun): number {
  return 1 + 0.05 * lvOf(run, 'charges') + 0.03 * lvOf(run, 'longLadle');
}
const value = (run: CRun) => idleRateOf(run) * activeProxy(run);

function withLevel(run: CRun, id: string): CRun {
  return { ...run, lv: { ...run.lv, [id]: lvOf(run, id) + 1 } };
}

function coarseKey(run: CRun, per: CPersistent): string {
  return [
    rows(run),
    run.malice,
    lvOf(run, 'gold'),
    lvOf(run, 'charges'),
    lvOf(run, 'longLadle'),
    Math.floor(rlvOf(per, 'quickToss') / 3),
    lvOf(run, 'hire'),
    Math.floor(lvOf(run, 'bribes') / 4),
    lvOf(run, 'jackpot'),
    Math.floor(lvOf(run, 'polish') / 5),
    lvOf(run, 'lined') > 0 ? 1 : 0,
  ].join('|');
}

interface TableRow {
  liveS: number;
  base: number;
  idle: number;
  batches: number;
}

export const createCauldron = (opts: CauldronOpts = {}): AdapterFactory => (seed) => {
  const sampleS = opts.sampleS ?? 180;
  const sk = SKILL[opts.skill ?? 'reference'];
  const table = new Map<string, TableRow>();
  let sessions = 0;
  const counters = { liveS: 0, tableS: 0 };

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const run = save.run as CRun;
    const per = save.persistent as CPersistent;
    const rnd = makeRng(childSeed(seed, `cauldron.bot.${sessions}`));
    let base = 0;
    const core = new CauldronCore(
      run,
      per,
      {
        earn: (b) => {
          base += b;
          return env.earn(b);
        },
        raiseSkill: (l) => env.raiseSkill(l),
        imports: save.imports,
      },
      childSeed(seed, `cauldron.core.${sessions++}`),
    );
    env.raiseSkill(heldMalice(run));
    let ladleT = 0;
    let tossWait = -1; // reaction countdown once the Toss is ready
    let lastTicks = run.stats.ticks;
    let staleT = 0;
    let batchAcc = 0;
    let dropAcc = 0;

    function bestChute(): number {
      const dist = chuteDist(rows(run), run.malice);
      const mults = bucketMults(run);
      const ing = run.spoon[0];
      const t = run.ticket;
      const need = !!t && t.items.some((i) => i.ing === ing && i.got < i.n);
      let best = 4;
      let bs = -Infinity;
      for (let k = 0; k < BUCKETS; k++) {
        let ev = 0;
        let pz = 0;
        for (let b = 0; b < BUCKETS; b++) {
          ev += dist[k][b] * mults[b];
          if (t && inZone(b, t.zone)) pz += dist[k][b];
        }
        const s = need ? pz * 1000 + ev : ev;
        if (s > bs) {
          bs = s;
          best = k;
        }
      }
      return best;
    }

    function ladle(): void {
      const board = core.board;
      const t = run.ticket;
      const needed = new Set(t ? t.items.filter((i) => i.got < i.n).map((i) => i.ing) : []);
      while (core.charges > 0) {
        let best = null;
        let bs = 0;
        for (const p of board.pegs) {
          if (p.kind !== 'iron' || p.ladleUntil > board.t) continue;
          if (Math.abs(p.x - CENTER_X) < 5) continue;
          let s = 0;
          for (const b of board.balls) {
            if (!b.alive || b.ladled) continue;
            const dy = p.y - b.y;
            if (dy < 2 || dy > 2.2 * ROW_H) continue;
            if (Math.abs(b.x - p.x) > 7) continue;
            // Heavy (bundled) ingredients carry several drops (logic.ts RAIN_VIS).
            s += (needed.has(b.ing) ? 3 : 1) * b.drops;
          }
          // Lower rows send the kicked ingredient straight into the inner buckets.
          s *= 0.6 + (0.4 * p.row) / Math.max(1, rows(run) - 1);
          if (s > bs) {
            bs = s;
            best = p;
          }
        }
        const full = core.charges >= core.maxCharges;
        if (!best || bs < (full ? 0.9 : sk.ladleMin)) break;
        core.curse(best);
      }
    }

    function liveStep(dt: number): void {
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(BOT_TICK, left);
        ladleT += h;
        if (opts.passive) {
          core.update(h);
          left -= h;
          continue;
        }
        if (core.canToss()) {
          if (tossWait < 0) tossWait = sk.tossDelay * (0.5 + rnd());
          tossWait -= h;
          if (tossWait <= 0) {
            core.toss(bestChute());
            tossWait = -1;
          }
        }
        if (ladleT >= sk.ladleEvery) {
          ladleT = 0;
          if (core.charges > 0) ladle();
        }
        if (run.stats.ticks !== lastTicks) {
          lastTicks = run.stats.ticks;
          staleT = 0;
        } else staleT += h;
        if (staleT > REROLL_STALE_S && core.reroll(env.now())) staleT = 0;
        core.update(h);
        left -= h;
      }
    }

    return {
      step(dt) {
        const key = coarseKey(run, per);
        let row = table.get(key);
        if (!row) table.set(key, (row = { liveS: 0, base: 0, idle: 0, batches: 0 }));
        const idle = idleRateOf(run, save.imports?.contraband ?? 0);
        if (opts.liveOnly || row.liveS < sampleS || row.idle <= 0) {
          const b0 = base;
          const n0 = run.stats.batches;
          liveStep(dt);
          row.liveS += dt;
          row.base += base - b0;
          row.idle += idle * dt;
          row.batches += run.stats.batches - n0;
          counters.liveS += dt;
          return;
        }
        // Table mode: the measured ratio and Batch rate for this board state.
        counters.tableS += dt;
        const ratio = row.base / row.idle;
        const amount = idle * ratio * dt;
        base += amount;
        env.earn(amount);
        dropAcc += dropsPerSec(run) * dt;
        const drops = Math.floor(dropAcc);
        dropAcc -= drops;
        run.stats.drops += drops;
        batchAcc += (row.batches / row.liveS) * dt;
        while (batchAcc >= 1) {
          batchAcc -= 1;
          run.stats.batches++;
          run.batchByMal[run.malice] = (run.batchByMal[run.malice] ?? 0) + 1;
          per.tokens += 1;
          per.batchesLifetime += 1;
          env.raiseSkill(heldMalice(run));
        }
      },

      buy(goals: BotGoals) {
        const bought: string[] = [];
        for (let guard = 0; guard < 200; guard++) {
          const dialNeeded = run.maliceBought < Math.min(goals.dialGoal, MALICE_MAX);
          const mCost = maliceCost(run.maliceBought);
          if (dialNeeded && run.bank >= mCost) {
            run.bank -= mCost;
            run.maliceBought++;
            run.malice = run.maliceBought;
            bought.push('malice');
            continue;
          }
          const v0 = value(run);
          let best: { id: string; cost: number; ratio: number; gain: number } | null = null;
          for (const u of UPGRADES) {
            if (u.tokens || upLocked(u, save.cycle.n)) continue;
            const l = lvOf(run, u.id);
            if (l >= u.max) continue;
            const cost = upCost(u, l);
            const gain = value(withLevel(run, u.id)) - v0;
            if (!(gain > 0)) continue;
            const ratio = gain / cost;
            if (!best || ratio > best.ratio) best = { id: u.id, cost, ratio, gain };
          }
          if (!best || run.bank < best.cost) break;
          // Saving for the dial: only buy what pays for itself before the dial is affordable anyway.
          if (dialNeeded && best.cost / best.gain > Math.max(60, (mCost - run.bank) / v0)) break;
          run.bank -= best.cost;
          run.lv[best.id] = lvOf(run, best.id) + 1;
          bought.push(best.id);
        }
        // Batch Tokens (persistent): cheapest recipe first.
        for (let guard = 0; guard < 50; guard++) {
          let cheap: { id: string; cost: number } | null = null;
          for (const u of UPGRADES) {
            if (!u.tokens) continue;
            const l = rlvOf(per, u.id);
            if (l >= u.max) continue;
            const cost = upCost(u, l);
            if (!cheap || cost < cheap.cost) cheap = { id: u.id, cost };
          }
          if (!cheap || per.tokens < cheap.cost) break;
          per.tokens -= cheap.cost;
          per.rlv[cheap.id] = rlvOf(per, cheap.id) + 1;
          bought.push(cheap.id);
        }
        if (bought.length) core.refresh();
        return bought;
      },

      end() {},
      stats: () => ({ ...counters, tableStates: table.size }),
    };
  }

  return {
    id: 'cauldron',
    def: cauldronEcon,
    dialMax: MALICE_MAX,
    dialId: 'malice',
    ratioScale: (save) => longMult(lvOf(save.run as CRun, 'size')),
    dialCost: (k) => maliceCost(k),
    startSession,
    anyAffordable(save) {
      const run = save.run as CRun;
      const per = save.persistent as CPersistent;
      if (run.maliceBought < MALICE_MAX && run.bank >= maliceCost(run.maliceBought)) return true;
      for (const u of UPGRADES) {
        const l = u.tokens ? rlvOf(per, u.id) : lvOf(run, u.id);
        if (l >= u.max || upLocked(u, save.cycle.n)) continue;
        if ((u.tokens ? per.tokens : run.bank) >= upCost(u, l)) return true;
      }
      return false;
    },
    dialLevel: (save) => (save.run as CRun).maliceBought ?? 0,
    // 05 §3: active ~2-3x on-screen idle.
    localRatioBands: { all: [2, 3] },
    describe(save) {
      const run = save.run as CRun;
      return `malice ${run.maliceBought} toads ${1 + lvOf(run, 'hire')} fresh ${lvOf(run, 'fresh')} size ${lvOf(run, 'size')} rows ${rows(run)}`;
    },
  };
};
