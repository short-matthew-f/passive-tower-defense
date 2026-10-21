// The contract every department implements. The core owns saves, offline time, Tribute,
// Infamy, Falls, managers and the HUD; a department owns its own play and its numbers.
import type { Container } from 'pixi.js';
import type { DeptId, DeptSave, GoodId } from './types';
import type { Layout } from './layout';
import type { Game } from './game';
import type { TriggerType } from './director';
import type { StewardCandidate } from './perks';

export type { TriggerType } from './director';
export type { StewardCandidate } from './perks';

/** A rectangle in logical screen px (the same space as `ctx.layout`). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ghost-finger gesture demo drawn by the core over a beat's highlight target. */
export type Gesture = 'tap' | 'hold' | 'drag';

/**
 * Where a beat points. A string is a TargetId: the core asks the open scene's
 * `DeptScene.targetRect(id)`, except the core-owned ids 'hud.home', 'hud.bank', 'hud.infamy' and
 * 'hud.legend'. A function gets the open scene and returns a rect (or null while hidden).
 */
export type TargetRef = string | ((scene: DeptScene) => Rect | null);

export interface ManagerDef {
  name: string;
  title: string; // "Head Cook"
  /** 12x12 portrait rows; each char indexes `palette` ('.' = transparent). Two frames: idle, talking. */
  portrait: [string[], string[]];
  palette: Record<string, string>;
  /**
   * Trigger -> lines (variants picked at random). Core-fired keys: intro, firstUpgrade, legend,
   * infamy50, infamy100, fall, returnFall, returnLong (and returnLong3d for >= 3 days away),
   * goodsLink, ambient (fired by the director after 60 s without input, Full chattiness, at most
   * 1 / 10 min) and report (Gobbo's report flavour pool, 00 §5.4.7). Departments add their own
   * keys and fire them with ctx.say(key, { type }). Keep readable lines <= 32 characters.
   */
  lines: Record<string, string[]>;
}

/**
 * One onboarding / micro-lesson beat (00 §5.4.2). Backward compatible: `id`, `line` and `done`
 * are all a beat needs; the rest is optional.
 *  - `target`: highlight with a pulsing 1 px outline. If it lies under the bubble, the bubble
 *    starts collapsed to the portrait and the line shows as a caption beside the highlight.
 *  - `gesture`: ghost-finger demo on the target (`dragTo` = where a drag ends; default 32 px down).
 *    It plays when the beat starts and again after 10 s without input. After 30 s the bubble
 *    shrinks to the portrait; the highlight stays.
 *  - `waitFor`: the beat only starts once this holds (e.g. its upgrade is affordable). Until then
 *    the strip hides and the player plays freely.
 * The core records progress as `save.seen['ob.<id>']` (intro) or `save.seen['ls.<lesson>.<id>']`
 * (lessons), and resumes at the first beat not done on the next entry.
 */
export interface OnboardingStep {
  id: string;
  line: string; // what the manager says (<= 32 characters)
  /** Returns true once the player has done the thing; the next step then shows. */
  done(save: DeptSave): boolean;
  target?: TargetRef;
  gesture?: Gesture;
  dragTo?: TargetRef;
  waitFor?(save: DeptSave): boolean;
}

export interface Commendation {
  id: string;
  label: string;
  test(save: DeptSave): boolean;
}

/**
 * The pure, render-free part of a department: everything the shared economy and the headless
 * balance simulation (sim/) need. Keep it in a module with no Pixi imports (e.g. `<dept>/def.ts`).
 */
export interface DeptEcon {
  id: DeptId;
  version: number;
  defaultRun(): { bank: number } & Record<string, any>;
  defaultPersistent(): Record<string, any>;
  /** On-screen idle rate in local currency per second, before core multipliers (Throne, Dread, temp). Pure. */
  idleRate(save: DeptSave): number;
  /** Infamy skill gate: the signature level needed in cycle n, and how to describe it. */
  skillTarget(n: number): number;
  skillLabel(target: number): string;
  /** Economy gate base E0: cycle earnings needed for the first Fall (x FLOOR_GROWTH per Fall). */
  econBase: number;
  /** Balance-sim experiments only: economy floor growth per Fall (default FLOOR_GROWTH = 2.5 in
   * economy.ts). No department sets it. */
  floorGrowth?: number;
  /** Rank reference points (idle rate early, and at first 100% Infamy). */
  rankRef: number;
  rankTarget: number;
  commendations: Commendation[];
  /**
   * The department's export (specs/00 §4; core/goods.ts applies trickle, caps, Roads, offline).
   * `rate`: passive Goods per hour from its helpers (pure, cheap; the core clamps it to
   * [2/h trickle, the Good's passive rate]). `count`: a counter of export events that only grows
   * within a cycle (Batches, kills / 25, confiscations ...); while the department is on screen
   * the core credits its increases, held to the Good's active rate.
   */
  goods?: { id: GoodId; rate(save: DeptSave): number; count?(save: DeptSave): number };

  // ----- optional advancement hooks (pure; the balance sim may call them too) -----

  /**
   * "Ready" buys for Gobbo's Satchel L1 (the report's Ready list and the Throne door's Ready pip):
   * things the player could sensibly buy right now. The core shows those with cost <= run.bank.
   * If absent, the core falls back to `stewardCandidates`.
   */
  readyBuys?(save: DeptSave): { label: string; cost: number }[];
  /**
   * The Steward's shopping list (Satchel L2-L3, opt-in per department). Exclude consumables,
   * spatial items and dial levels (00 §5.2 m5). The core ranks by deltaIdle / cost, honours the
   * player's reserve and allowance, deducts `cost` from run.bank and then calls `buy()`.
   */
  stewardCandidates?(save: DeptSave): StewardCandidate[];
  /**
   * Head Start wing perk (00 §2.5): called right after a Fall resets `run` (and on first unlock if
   * the perk is owned), with the perk level L >= 1. Grant "the first 2L dial levels and 1 + L free
   * helpers" by writing the fresh run. Must be idempotent and must not touch persistent data.
   */
  applyHeadStart?(save: DeptSave, level: number): void;
  /**
   * Signature wing perk (one-time, 40 Dread; 00 §2.5). `apply` runs once when bought and again at
   * every cycle start (after a Fall, after Head Start). Must be idempotent (use max(), not +=).
   * Departments without one show "Coming soon" at the Altar.
   */
  signature?: { name: string; desc: string; apply(save: DeptSave): void };
}

/** What a department's interactive Last Stand mini-scene gets (00 §2.3). */
export interface LastStandCtx {
  game: Game;
  def: DeptDef;
  save: DeptSave;
  layout: Layout;
  /** Infamy at the moment of the Fall (0-200). */
  infamy: number;
  /** Full-screen container above the Fall card; the core destroys it when the promise settles. */
  root: Container;
  /** Per-frame callback (dt in seconds, clamped); removed automatically when the promise settles. */
  onTick(fn: (dt: number) => void): void;
  haptic(ms?: number): void;
}

export interface DeptDef extends DeptEcon {
  name: string;
  currency: string; // display name of the local currency
  currencyColor: string;
  doorColor: number;
  manager: ManagerDef;
  onboarding: OnboardingStep[];
  legend: { name: string; line: string };
  createScene(ctx: DeptCtx): DeptScene;
  /** Micro-lessons (1-3 beats) keyed by id. Fired by ctx.lesson(id) or by a say(id, { type:
   * 'mechanic_unlocked' }) whose key has an entry here; replayable from Settings -> Managers. */
  lessons?: Record<string, OnboardingStep[]>;
  /**
   * Interactive Last Stand (00 §2.3, v0.7+). When present the Fall card offers it next to the
   * static Crush bar. Draw a short (~5-10 s) mini-scene into ctx.root and resolve with the Crush
   * bonus in [0, 0.25] (clamped by the core). A rejection or a throw falls back to the Crush bar.
   */
  lastStand?(ctx: LastStandCtx): Promise<number>;
}

export interface DeptScene {
  root: Container;
  /** dt in seconds (clamped). */
  update(dt: number): void;
  resize(layout: Layout): void;
  destroy(): void;
  /** An import node was bought while this scene is open (re-read import-driven state). */
  onImports?(): void;
  /** True during intense moments (00 §5.4.4); non-guided manager lines wait until it has been
   * false for 2 s. Called every frame: keep it cheap. */
  isIntense?(): boolean;
  /** Screen rect of a TargetId used by onboarding beats (`OnboardingStep.target`), or null while
   * it is hidden or off screen. */
  targetRect?(id: string): Rect | null;
  /**
   * Return ritual (00 §5.3): called once on the first entry after an absence (when no onboarding
   * is running), with this department's haul from that absence. Play a ~5 s tactile ritual in the
   * scene and resolve with a score in [0, 1]; the core grants score x 5% of the haul. Never
   * required: resolving 0 (or never being called) only skips the bonus.
   */
  returnRitual?(haul: number): Promise<number>;
}

export interface SayOpts {
  /** Legacy flag: an untyped milestone line (shown promptly; the department gates repeats). */
  milestone?: boolean;
  vars?: Record<string, string | number>;
  /** The 00 §5.4.3 trigger type. With a type, the director applies that row's priority,
   * chattiness, caps and repeat rule (`key` defaults to the trigger key, e.g. per-tier keys). */
  type?: TriggerType;
  key?: string;
  /** A struggle offer: the bubble shows a ✓ chip that runs this. */
  offer?: () => void;
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
  /**
   * Fire a manager line from `def.manager.lines[trigger]` through the ManagerDirector. Pass
   * `type` to get the 00 §5.4.3 rules (priority queue, rate limits, calm, repeats). Untyped calls
   * keep their old behaviour: `milestone: true` shows promptly, otherwise it is Full-only flavour.
   */
  say(trigger: string, opts?: SayOpts): void;
  /**
   * Run a micro-lesson once per save (00 §5.4.2): `beats` or `def.lessons[id]`. It starts when no
   * other script runs (as a "Show me / Skip" prompt at chattiness Off). Returns false if it was
   * already seen or has no beats.
   */
  lesson(id: string, beats?: OnboardingStep[]): boolean;
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
  /** Text after the name instead of "level/max" (e.g. a Goods stock). */
  levelText?(): string;
  max: number;
  cost(): number;
  /** Currency label if not the bank (e.g. Gems); an icon token such as '{potion}' shows as the icon. */
  currency?: string;
  /** Button label instead of BUY (e.g. '+10'). */
  buyLabel?: string;
  canAfford(): boolean;
  buy(): void;
  visible?(): boolean;
  locked?(): string | null; // reason if locked
  /** A section label row (only `name` is shown; no button). */
  header?: boolean;
  /** Button label once level >= max (default 'MAX'), e.g. 'ACTIVE'. */
  maxLabel?: string;
  /** Button sub-label instead of the formatted cost (e.g. 'ON' / '25%'). */
  costText?(): string;
}

export interface UpgradeGroup {
  name: string;
  entries: UpgradeEntry[];
  /** Header line while this tab is open, instead of the sheet's bank line (e.g. Goods stock). */
  bank?(): { text: string; color: string };
}
