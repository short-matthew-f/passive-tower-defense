// The contract every department implements. The core owns saves, offline time, Tribute,
// Infamy, Falls, managers and the HUD; a department owns its own play and its numbers.
import type { Container } from 'pixi.js';
import type { DeptId, DeptSave } from './types';
import type { Layout } from './layout';
import type { Game } from './game';

export interface ManagerDef {
  name: string;
  title: string; // "Head Cook"
  /** 12x12 portrait rows; each char indexes `palette` ('.' = transparent). Two frames: idle, talking. */
  portrait: [string[], string[]];
  palette: Record<string, string>;
  /** Trigger -> lines. Core triggers: intro, firstUpgrade, legend, fall, returnFall, returnLong. Departments add their own. */
  lines: Record<string, string[]>;
}

export interface OnboardingStep {
  id: string;
  line: string; // what the manager says
  /** Returns true once the player has done the thing; the next step then shows. */
  done(save: DeptSave): boolean;
}

export interface Commendation {
  id: string;
  label: string;
  test(save: DeptSave): boolean;
}

export interface DeptDef {
  id: DeptId;
  name: string;
  currency: string; // display name of the local currency
  currencyColor: string;
  doorColor: number;
  version: number;
  defaultRun(): { bank: number } & Record<string, any>;
  defaultPersistent(): Record<string, any>;
  /** On-screen idle rate in local currency per second, before core multipliers (Throne, Dread, temp). Pure. */
  idleRate(save: DeptSave): number;
  /** Infamy skill gate: the signature level needed in cycle n, and how to describe it. */
  skillTarget(n: number): number;
  skillLabel(target: number): string;
  /** Economy gate base E0: cycle earnings needed for the first Fall (x3 per Fall). */
  econBase: number;
  /** Rank reference points (idle rate early, and at first 100% Infamy). */
  rankRef: number;
  rankTarget: number;
  commendations: Commendation[];
  manager: ManagerDef;
  onboarding: OnboardingStep[];
  legend: { name: string; line: string };
  createScene(ctx: DeptCtx): DeptScene;
}

export interface DeptScene {
  root: Container;
  /** dt in seconds (clamped). */
  update(dt: number): void;
  resize(layout: Layout): void;
  destroy(): void;
}

export interface DeptCtx {
  game: Game;
  def: DeptDef;
  save: DeptSave;
  layout: Layout;
  /** Content area below the core HUD and above the bottom safe inset, in logical px. */
  content(): { x: number; y: number; w: number; h: number };
  /** Credit local income: applies core multipliers and adds to bank + cycle earnings. Returns the amount credited. */
  earn(base: number): number;
  /** Core multiplier for this department (Throne x Dread x temp), for display and previews. */
  mult(): number;
  /** Spend from the bank; false if unaffordable. */
  spend(amount: number): boolean;
  /** Ratchet the Infamy skill gate. */
  raiseSkill(level: number): void;
  /** Fire a manager trigger (rate-limited, respects chatter setting). Milestone triggers bypass the rate limit. */
  say(trigger: string, opts?: { milestone?: boolean; vars?: Record<string, string | number> }): void;
  /** Mark something as seen (for one-time lines/commendation checks). */
  seen(key: string): boolean;
  markSeen(key: string): void;
  haptic(ms?: number): void;
  /** Floating text helper in the HUD layer. */
  float(text: string, x: number, y: number, color?: string): void;
  /** Ask the core to persist soon (after a big purchase). */
  saveSoon(): void;
  /** Open the shared upgrade sheet. */
  openUpgrades(groups: UpgradeGroup[]): void;
}

export interface UpgradeEntry {
  id: string;
  name: string;
  /** Short effect text for the current -> next level. */
  desc(): string;
  level(): number;
  max: number;
  cost(): number;
  /** Currency label if not the bank (e.g. Gems). */
  currency?: string;
  canAfford(): boolean;
  buy(): void;
  visible?(): boolean;
  locked?(): string | null; // reason if locked
}

export interface UpgradeGroup {
  name: string;
  entries: UpgradeEntry[];
}
