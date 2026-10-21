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

/** Where a shown manager line came from (ManagerDef.voice). */
export type VoiceSource = 'core' | 'dept' | 'beat' | 'tip' | 'report' | 'fall';

export interface VoiceInfo {
  /** The line's trigger key ('intro', 'legend', a beat id ...). */
  key: string;
  source: VoiceSource;
  /** The suite SFX volume (0-1); the core only calls voice() when it is > 0. */
  vol: number;
  game: Game;
}

export interface ManagerDef {
  name: string;
  title: string; // "Head Cook"
  /**
   * 12x12 portrait rows; each char indexes `palette` ('.' = transparent). Frame 0 is idle; frames
   * 1..n are talking frames, cycled with the idle frame while a line is new (two frames, as every
   * department has, alternate idle / talking exactly as before).
   */
  portrait: [string[], string[], ...string[][]];
  palette: Record<string, string>;
  /**
   * Named expressions (optional): each is [idle] or [idle, talking, ...] with the same palette.
   * The director shows one while a line whose key is in `moods` (or a say() with
   * `opts.expression`) is up, then returns to `portrait`.
   */
  expressions?: Record<string, string[][]>;
  /** Line key -> expression name, e.g. { legend: 'worried', firstUpgrade: 'grin' }. */
  moods?: Record<string, string>;
  /**
   * Voice blips for a line the director actually shows (not for queued lines that never show).
   * `info.source` says who fired it: departments that already blip their own say() calls should
   * voice only `source !== 'dept'` (intro, Legend, returns, beats, the report and the Fall card).
   * Must not throw (errors are swallowed) and must stay cheap.
   */
  voice?(line: string, info: VoiceInfo): void;
  /**
   * Core-fired line keys this department handles itself, e.g. ['firstUpgrade'] when it fires its
   * own first-purchase line. The core then never fires them.
   */
  coreSkip?: string[];
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
  /**
   * While the shared upgrade sheet is open, highlight this entry id inside it instead (or the tab
   * holding it, when another tab is showing). The line then shows as a caption by the highlight.
   */
  sheetTarget?: string;
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
  /**
   * Offline extras (optional): called by the core's offline accounting (Gobbo's report) once per
   * absence, after the bank was credited. `elapsedSeconds` is already capped by the offline cap;
   * `factor` is the department's offline factor. `info.now` / `info.capSeconds` let a department
   * measure its own clock (e.g. "since the wall was last on screen"). Must not throw.
   */
  onOffline?(save: DeptSave, elapsedSeconds: number, factor: number, info: { now: number; capSeconds: number }): void;
}

/**
 * A per-department player setting shown in Settings -> <department> (00 §9). Values live in
 * `meta.settings.depts[deptId][key]`; read them with `ctx.setting(key)` (or core/settings.ts).
 *  - toggle: an on/off checkbox (`default` boolean).
 *  - action: a button; the core closes Settings, opens the department and calls
 *    `DeptScene.onSettingAction(key)` (e.g. a calibration run).
 *  - value: no control; a stored value (e.g. a calibrated latency) shown via `hint`.
 */
export interface DeptSettingDef {
  key: string;
  label: string;
  kind: 'toggle' | 'action' | 'value';
  default?: boolean | number | string;
  /** Small text under the control (gets the department's current values). */
  hint?(values: Record<string, unknown>, d: DeptSave): string;
  /** Hidden while false (e.g. until the Doom Drum is owned). */
  visible?(d: DeptSave): boolean;
  /** A `persistent` field older saves kept this value in: copied here once on load. */
  legacy?: string;
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
  /** Player settings for this department (Settings screen section); see DeptSettingDef. */
  settings?: DeptSettingDef[];
  /**
   * Dial lessons: lesson id -> the dial's current level. On entry the core queues each lesson
   * whose dial is already >= 1 but was never taught (Head Start grants dial levels without the
   * first purchase that normally fires it). Runs after the intro / onboarding, once per save.
   */
  dialLessons?: Record<string, (save: DeptSave) => number>;
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
  /**
   * Screen rects of important controls that transient overlays (Commendation and other toasts,
   * the intro line on short screens) must not cover. Called a few times a second: keep it cheap.
   */
  avoidRects?(): Rect[];
  /** Preferred toast top y (logical px), tried first; the core still dodges `avoidRects`. */
  toastAnchor?(): { y: number } | null;
  /**
   * Dock the manager bubble near the manager's in-scene sprite (06 §18): the bubble's bottom edge
   * sits at `y` (clamped below the HUD). Return null to use the default strip under the HUD.
   */
  bubbleAnchor?(): { y: number } | null;
  /** A DeptSettingDef action was chosen in Settings (the scene is open). */
  onSettingAction?(key: string): void;
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
  /** A ManagerDef.expressions name shown while this line is up (overrides `moods`). */
  expression?: string;
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
  /** A per-department setting (DeptDef.settings), default-filled. */
  setting<T = unknown>(key: string): T;
  setSetting(key: string, value: unknown): void;
  /** The suite's left-handed setting: mirror the thumb zone where the department supports it. */
  leftHanded(): boolean;
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

  // ----- bulk buying (Buy x1 / x10 / MAX, sheet-wide mode) -----
  /**
   * Whether the sheet's x10 / MAX mode applies. Default: plain levelled rows (max > 1, no
   * header / costText / buyLabel / levelText). Set false for toggles and one-at-a-time buys.
   */
  bulk?: boolean;
  /** Total price of the next n levels (n already clamped to max - level). Enables exact x10 /
   * MAX prices; without it the sheet buys repeatedly and shows the next price. */
  costFor?(n: number): number;
  /** Buys up to n levels at once; returns how many were bought. Default: buy() n times. */
  buyMany?(n: number): number;
  /** Effect text for buying n levels (default: desc()). */
  descFor?(n: number): string;
  /** Funds this row spends from, for MAX / x10 affordability (default: the department bank; rows
   * priced in another currency without it fall back to repeated buys). */
  wallet?(): number;
}

export interface UpgradeGroup {
  name: string;
  entries: UpgradeEntry[];
  /** Header line while this tab is open, instead of the sheet's bank line (e.g. Goods stock). */
  bank?(): { text: string; color: string };
}
