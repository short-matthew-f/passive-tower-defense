// The long node (sim/README.md "Pass 5"): every department carries one long, multiplicative run
// upgrade that keeps its income growing across a cycle. Without it, income plateaus once the
// capped nodes are bought while the economy floor still grows per Fall, so weeks 2-4 cycles
// stretched to 5-8 days (00 §6 target 1.5-3). Each department themes it and prices its first
// level; the curve is shared:
//  - effect x LONG_EFFECT per level on all of that department's local income (live play, idle,
//    offline: it sits inside each department's idleRate and the scene's earn paths alike, so the
//    active : idle ratio doesn't move);
//  - cost x LONG_GROWTH per level, >= the effect growth (00 §8: an infinite node's cost growth must
//    be at least its effect growth);
//  - capped at LONG_MAX levels. Each multiplicative node's income-per-spend elasticity is
//    ln(effect)/ln(cost growth) (0.85 here), and they add: with Tooth Pliers (0.16), Fresher Stock
//    or Tap Damage alongside, a department stalled on its skill gate (or an idle-only player) grew
//    income ~x1000 a day without the cap. The cap's own ceiling is x1.3e9: the Styx, whose Wrath
//    dial costs x9 per Fall until its target caps at 20, needs ~100-120 levels late in week 4 (and
//    keeps buying while it works its Wrath-20 gate); the others use ~40-80. A local currency stays
//    well under 1e30 (00 §8);
//  - a new title every LONG_MILESTONE levels, shown in the row (00 §8 visible-milestone rule);
//  - a run upgrade: it resets on Fall like the department's other run upgrades;
//  - it opens after the department's LONG_UNLOCK_FALLS-th Fall: it exists for weeks 2-4, and in the
//    first two cycles a universal multiplier crowded out the active-only nodes (the greedy buyer
//    rightly preferred it), which pulled the week-1 active : idle ratios out of their bands.
import { formatNum } from './format';

/** Income multiplier per level. SIM-TUNED (sim/README.md "Pass 5"). */
export const LONG_EFFECT = 1.15;
/** Price growth per level (>= LONG_EFFECT). SIM-TUNED (sim/README.md "Pass 5"). */
export const LONG_GROWTH = 1.18;
/** Highest level (the long node's x1.3e9 ceiling, see above). */
export const LONG_MAX = 150;
/** The long node opens once the department has Fallen this many times (see above). */
export const LONG_UNLOCK_FALLS = 2;
/** Lock reason for the long node in cycle `n` (= prior Falls), or null once it's open. */
export const longLocked = (n: number): string | null => (n < LONG_UNLOCK_FALLS ? '2ND FALL' : null);
/** Levels per visible milestone (a new title in the row). */
export const LONG_MILESTONE = 10;

export const longMult = (level: number): number => LONG_EFFECT ** Math.max(0, level);
export const longCost = (base: number, level: number): number => Math.ceil(base * LONG_GROWTH ** level);

/** The milestone title at `level`: titles[0] below LONG_MILESTONE, then one per milestone; past
 * the list the last title counts on (LAKE+1, LAKE+2 ...). */
export function longTitle(titles: readonly string[], level: number): string {
  const k = Math.floor(Math.max(0, level) / LONG_MILESTONE);
  return k < titles.length ? titles[k] : `${titles[titles.length - 1]}+${k - titles.length + 1}`;
}

const x = (m: number) => (m < 10 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : formatNum(m));

/** Short row text (<= 28 characters, the upgrade sheet's width at 180 px): the current title and
 * the multiplier now -> next ("KETTLE X1.15 > X1.32"); on the level that reaches the next title,
 * that title and its multiplier ("NEXT: VAT X4.05"). */
export function longDesc(titles: readonly string[], level: number): string {
  const now = longTitle(titles, level);
  if (level >= LONG_MAX) return `${now} x${x(longMult(level))} MAX`;
  const next = longTitle(titles, level + 1);
  if (next !== now) return `NEXT: ${next} x${x(longMult(level + 1))}`;
  return `${now} x${x(longMult(level))} > x${x(longMult(level + 1))}`;
}
