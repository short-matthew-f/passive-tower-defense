// A greedy draft bot for the War Pit (07 §14.1, "novice/reference" flavour): value per Chow,
// merges first, food on the best unit, the heuristic line order, the Royal Brand on the carry.
// Pure: scripts/pit-bot.ts and the tests drive it on the real run.ts rules.
import { FOODS } from './units';
import {
  autoSlot,
  brand,
  buy,
  buyFood,
  fight,
  lineCount,
  lvlOf,
  orderLine,
  roll,
  rollCost,
  sell,
  unitValue,
  UNIT_COST,
  type FightOutcome,
  type Pet,
  type RunState,
} from './run';

const petValue = (p: Pet) => unitValue(p.k, p.a, p.h, lvlOf(p.xp));

/** Plays one shop phase. Returns the number of actions taken (for the shop-time model). */
export function botShop(rs: RunState, rng: () => number = Math.random): number {
  let actions = 0;
  for (let guard = 0; guard < 24; guard++) {
    // 1. Best unit buy (merge > empty slot > replace the weakest).
    if (rs.chow >= UNIT_COST && rs.shop.length) {
      let best = -1;
      let bestScore = 0;
      let bestSlot = -1;
      let replace = -1;
      rs.shop.forEach((s, i) => {
        if (!s) return;
        const slot = autoSlot(rs, s.k);
        const v = unitValue(s.k, s.a, s.h, 1);
        if (slot >= 0) {
          const merge = !!rs.line[slot];
          const score = merge ? 6 + v * 0.5 : v;
          if (score > bestScore) {
            bestScore = score;
            best = i;
            bestSlot = slot;
            replace = -1;
          }
        } else {
          // Line full: replace the weakest if clearly better.
          let wi = -1;
          let wv = 1e9;
          rs.line.forEach((p, j) => {
            if (p && petValue(p) < wv) {
              wv = petValue(p);
              wi = j;
            }
          });
          const score = v - wv - 2;
          if (wi >= 0 && score > 0 && score > bestScore) {
            bestScore = score;
            best = i;
            bestSlot = wi;
            replace = wi;
          }
        }
      });
      if (best >= 0) {
        if (replace >= 0) {
          sell(rs, replace);
          actions++;
        }
        if (buy(rs, best, bestSlot).ok) {
          actions++;
          continue;
        }
      }
    }
    // 2. Food on the best unit.
    const n = lineCount(rs);
    if (n) {
      const fi = rs.food.findIndex((f) => f && FOODS[f.f].cost <= rs.chow);
      if (fi >= 0 && rs.chow - FOODS[rs.food[fi]!.f].cost >= 0 && (rs.chow < UNIT_COST + 1 || !rs.shop.length)) {
        let bi = -1;
        let bv = -1;
        rs.line.forEach((p, j) => {
          if (p && petValue(p) > bv && !(FOODS[rs.food[fi]!.f].held && p.it)) {
            bv = petValue(p);
            bi = j;
          }
        });
        if (bi >= 0 && buyFood(rs, fi, bi)) {
          actions++;
          continue;
        }
      }
    }
    // 3. Roll if a buy would still be affordable afterwards.
    if (rs.chow >= rollCost(rs) + UNIT_COST && rng() < 0.95) {
      if (roll(rs)) {
        actions++;
        continue;
      }
    }
    break;
  }
  // Line order and the Brand (from round 3).
  const pets = orderLine(rs.line.filter((p): p is Pet => !!p));
  rs.line = [0, 1, 2, 3, 4].map((i) => pets[i] ?? null);
  if (!rs.brandUsed && rs.round >= 3 && pets.length) {
    let bi = 0;
    let bv = -1;
    rs.line.forEach((p, j) => {
      if (p && petValue(p) > bv) {
        bv = petValue(p);
        bi = j;
      }
    });
    if (brand(rs, bi)) actions++;
  }
  return actions;
}

export interface BotRunReport {
  wins: number;
  rounds: number;
  ended: 'triumph' | 'retreat';
  teeth: number; // base battle Teeth (before Pliers)
  seconds: number; // time model
  line: Pet[];
  outcomes: FightOutcome['outcome'][];
}

/** Seconds a battle takes to play back at 1x (mirrors the scene's frame timings). */
export function battleSeconds(frames: { e: string }[]): number {
  let t = 0.6;
  for (const f of frames) t += f.e === 'hit' ? 0.55 : f.e === 'faint' ? 0.3 : f.e === 'trig' ? 0.4 : 0.2;
  return t;
}

/** Plays a full Run with the bot. Time model (07 §14.1): shop 8 s + 3 s/action; 1x battles for 3 rounds, then 2x. */
export function botRun(rs: RunState, rng: () => number = Math.random): BotRunReport {
  let seconds = 0;
  const outcomes: FightOutcome['outcome'][] = [];
  for (let guard = 0; guard < 40 && !rs.ended; guard++) {
    const acts = botShop(rs, rng);
    seconds += 8 + 3 * acts;
    const out = fight(rs, true);
    seconds += battleSeconds(out.result.frames) / (out.round <= 3 ? 1 : 2) + 1.5; // + result card
    outcomes.push(out.outcome);
  }
  return {
    wins: rs.wins,
    rounds: rs.round,
    ended: rs.ended === 'triumph' ? 'triumph' : 'retreat',
    teeth: rs.teeth,
    seconds,
    line: rs.line.filter((p): p is Pet => !!p).map((p) => ({ ...p })),
    outcomes,
  };
}
