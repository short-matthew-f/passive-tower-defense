// Contracts between the department-agnostic meta simulation and per-department adapters.
import type { DeptEcon } from '../src/core/dept';
import type { DeptId, DeptSave } from '../src/core/types';

/** What the meta sim hands an active session each step. Mirrors the game's DeptCtx money paths. */
export interface SessionEnv {
  /** Simulated wall clock in ms (the game's Date.now()). */
  now(): number;
  /** Credit base local income: the meta applies coreMult and adds to bank + cycle earnings (DeptCtx.earn). */
  earn(base: number): number;
  /** Ratchet the Infamy skill gate (DeptCtx.raiseSkill). */
  raiseSkill(level: number): void;
}

/** The bot's goals for this cycle, set by the meta sim's Fall policy. */
export interface BotGoals {
  /** Dial level the bot is working towards (skillTarget(n), or skillTarget(n+1) when pushing). */
  dialGoal: number;
}

/** One on-screen visit to a department, driven by its active bot. */
export interface ActiveSession {
  /** Advance on-screen play by dt seconds (the adapter sub-steps internally). */
  step(dt: number): void;
  /** Let the bot shop (greedy buyer). Returns the ids bought. */
  buy(goals: BotGoals): string[];
  /** Leaving the department. */
  end(): void;
  /** Optional extra counters for the report (e.g. live vs cached seconds). */
  stats?(): Record<string, number>;
}

export interface DeptAdapter {
  id: DeptId;
  /** The department's real pure economy definition (src/depts/<id>/def.ts). */
  def: DeptEcon;
  /** Start an on-screen visit. The adapter owns any live core / tile model for the visit. */
  startSession(save: DeptSave, env: SessionEnv): ActiveSession;
  /** The game's "something affordable" check for this department (Gobbo's Ready pip). */
  anyAffordable(save: DeptSave): boolean;
  /** The dial level bought this cycle (Malice, Dig Deeper depth, ...). */
  dialLevel(save: DeptSave): number;
  /** Highest dial level that exists (MVP range), for reachability checks. */
  dialMax: number;
  /** The id buy() reports for a dial purchase, and the price of dial level k -> k+1. */
  dialId: string;
  dialCost(level: number): number;
  /** Optional sub-state label for splitting ratio metrics (e.g. Mines 'drum-on' / 'no-drum'). */
  ratioState?(save: DeptSave): string;
  /** The long node's income multiplier (core/longnode.ts). It multiplies active and idle income
   * alike, so the ratio metrics divide it out of both sides: otherwise the exponential growth late in
   * a cycle lets the last hours (and single lumpy payouts) outweigh the rest. Default 1. */
  ratioScale?(save: DeptSave): number;
  /** Department-local active:on-screen-idle bands per ratioState (from the department's spec). */
  localRatioBands?: Record<string, [number, number]>;
  /** Short state summary for the timeline. */
  describe(save: DeptSave): string;
}

export type AdapterFactory = (seed: number) => DeptAdapter;
