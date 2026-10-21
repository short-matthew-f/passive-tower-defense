// ManagerDirector rules (specs/00 §5.4.3-5.4.5): the trigger table, chattiness, repeats, the
// per-department queue, rate limits, settling-in grace and calm detection. Pure, no Pixi: the
// runtime half (bubble strip, onboarding runner, highlight, ghost finger) is src/ui/manager.ts,
// and unit tests drive these functions directly.

export type TriggerType =
  | 'onboarding'
  | 'first_upgrade'
  | 'first_helper'
  | 'tier_reached'
  | 'mechanic_unlocked'
  | 'dial_raised'
  | 'hazard_first'
  | 'struggle'
  | 'commendation'
  | 'infamy_50'
  | 'infamy_100'
  | 'legend_arrives'
  | 'fall'
  | 'return_after_fall'
  | 'return_long_absence'
  | 'goods_link'
  | 'report'
  | 'ambient';

/** Director-internal kinds: `legacy` = an untyped `say(key, { milestone: true })` from a department
 * written before the director (shown promptly, department gates repeats); `flavor` = an untyped
 * `say(key)` (Full only, rate-limited); `tip` = a skipped beat returning as a one-line tip. */
export type LineKind = TriggerType | 'legacy' | 'flavor' | 'tip';
export type Priority = 'guided' | 'high' | 'medium' | 'low' | 'ambient';
export type Chattiness = 'full' | 'milestones' | 'off';
export type Repeat = 'oncePerSave' | 'oncePerCycle' | 'always' | { cooldownMin: number };

export interface TriggerRule {
  priority: Priority;
  repeat: Repeat;
  /** Lowest chattiness that still shows it ('full' = Full only). */
  min: 'full' | 'milestones';
  /** Subject to the unprompted caps (1 / 3 min per department, 1 / 90 s suite-wide). */
  capped: boolean;
  /** May speak during the first 30 s after entering a department. */
  duringGrace: boolean;
}

const R = (priority: Priority, repeat: Repeat, min: 'full' | 'milestones', capped = true, duringGrace = false): TriggerRule => ({
  priority,
  repeat,
  min,
  capped,
  duringGrace,
});

/** The 00 §5.4.3 table. */
export const TRIGGER_RULES: Record<LineKind, TriggerRule> = {
  onboarding: R('guided', 'always', 'milestones', false, true),
  first_upgrade: R('low', 'oncePerSave', 'full'),
  first_helper: R('low', 'oncePerSave', 'full'),
  tier_reached: R('medium', 'oncePerSave', 'milestones'),
  mechanic_unlocked: R('high', 'oncePerSave', 'milestones'),
  dial_raised: R('medium', 'oncePerSave', 'milestones'),
  hazard_first: R('medium', 'oncePerSave', 'milestones'),
  struggle: R('medium', { cooldownMin: 30 }, 'milestones'),
  commendation: R('low', 'always', 'full'),
  infamy_50: R('medium', 'oncePerCycle', 'milestones'),
  infamy_100: R('high', 'oncePerCycle', 'milestones'),
  legend_arrives: R('high', 'oncePerCycle', 'milestones', true, true),
  fall: R('guided', 'always', 'milestones', false, true),
  return_after_fall: R('high', 'always', 'milestones', true, true),
  return_long_absence: R('medium', 'always', 'milestones', true, true),
  goods_link: R('medium', 'oncePerSave', 'milestones'),
  report: R('guided', 'always', 'milestones', false, true),
  ambient: R('ambient', { cooldownMin: 10 }, 'full'),
  legacy: R('high', 'always', 'milestones', false, true),
  flavor: R('low', 'always', 'full'),
  tip: R('low', 'always', 'full', false),
};

/** The core's old trigger keys (and the ones departments already use) mapped onto the table. */
export const TRIGGER_ALIASES: Record<string, TriggerType> = {
  firstUpgrade: 'first_upgrade',
  firstHelper: 'first_helper',
  dialRaised: 'dial_raised',
  hazardFirst: 'hazard_first',
  struggle: 'struggle',
  commendation: 'commendation',
  infamy50: 'infamy_50',
  infamy100: 'infamy_100',
  legend: 'legend_arrives',
  fall: 'fall',
  returnFall: 'return_after_fall',
  returnLong: 'return_long_absence',
  goodsLink: 'goods_link',
  ambient: 'ambient',
};

export interface Classified {
  kind: LineKind;
  rule: TriggerRule;
  /** The director enforces `rule.repeat` only for explicitly typed calls; untyped/aliased calls
   * were already gated by the department (ctx.seen) and repeat as the caller decides. */
  enforceRepeat: boolean;
}

export function classify(trigger: string, opts?: { type?: TriggerType; milestone?: boolean }): Classified {
  if (opts?.type) return { kind: opts.type, rule: TRIGGER_RULES[opts.type], enforceRepeat: true };
  const alias = TRIGGER_ALIASES[trigger];
  if (alias) {
    // A cooldown is enforced for aliases too (struggle, ambient): it is a rate rule, not a gate.
    const rule = TRIGGER_RULES[alias];
    return { kind: alias, rule, enforceRepeat: typeof rule.repeat === 'object' };
  }
  const kind: LineKind = opts?.milestone ? 'legacy' : 'flavor';
  return { kind, rule: TRIGGER_RULES[kind], enforceRepeat: false };
}

/** Chattiness gate for unprompted lines (onboarding/lessons/the Fall card/report are never gated). */
export function chattinessAllows(rule: TriggerRule, c: Chattiness): boolean {
  if (rule.priority === 'guided') return true;
  if (c === 'off') return false;
  if (c === 'milestones') return rule.min === 'milestones';
  return true;
}

/** Keys in DeptSave.seen used for repeats. */
export const repeatKey = (kind: LineKind, key: string, cycleN: number, repeat: Repeat): string =>
  repeat === 'oncePerCycle' ? `mgr.${kind}.${key}.c${cycleN}` : typeof repeat === 'object' ? `mgr.cd.${kind}` : `mgr.${kind}.${key}`;

export function repeatAllows(repeat: Repeat, kind: LineKind, key: string, seen: Record<string, number>, cycleN: number, now: number): boolean {
  if (repeat === 'always') return true;
  const k = repeatKey(kind, key, cycleN, repeat);
  if (typeof repeat === 'object') return now - (seen[k] ?? -Infinity) >= repeat.cooldownMin * 60_000;
  return !seen[k];
}

export function recordRepeat(repeat: Repeat, kind: LineKind, key: string, seen: Record<string, number>, cycleN: number, now: number): void {
  if (repeat === 'always') return;
  seen[repeatKey(kind, key, cycleN, repeat)] = typeof repeat === 'object' ? now : 1;
}

// ---------- the queue ----------

export interface QueuedLine {
  key: string;
  kind: LineKind;
  priority: Priority;
  text: string;
  at: number; // ms epoch when queued
  /** A struggle offer: the ✓ chip runs it. */
  offer?: () => void;
  /** Who fired it ('core' | 'dept' ...), for ManagerDef.voice. */
  source?: string;
  /** A ManagerDef.expressions name shown while it is up. */
  expression?: string;
}

export const PRIORITY_RANK: Record<Priority, number> = { guided: 4, high: 3, medium: 2, low: 1, ambient: 0 };
export const QUEUE_MAX = 3;
export const QUEUE_TTL_MS = 10 * 60_000;
export const DEPT_GAP_MS = 3 * 60_000;
export const SUITE_GAP_MS = 90_000;
export const AMBIENT_GAP_MS = 10 * 60_000;
export const AMBIENT_IDLE_MS = 60_000;
export const GRACE_MS = 30_000;
export const CALM_MS = 2_000;

/** Adds a line, keeping the queue sorted (priority, then age) and at most QUEUE_MAX long: the
 * lowest-priority newest line is dropped. Returns the new queue and anything dropped. */
export function enqueue(q: QueuedLine[], line: QueuedLine, max = QUEUE_MAX): { queue: QueuedLine[]; dropped: QueuedLine[] } {
  const next = [...q, line].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.at - b.at);
  return { queue: next.slice(0, max), dropped: next.slice(max) };
}

/** Removes lines older than the TTL; high-priority ones come back as `carry` (for the report). */
export function expireQueue(q: QueuedLine[], now: number, ttl = QUEUE_TTL_MS): { queue: QueuedLine[]; carry: QueuedLine[] } {
  const queue: QueuedLine[] = [];
  const carry: QueuedLine[] = [];
  for (const l of q) {
    if (now - l.at <= ttl) queue.push(l);
    else if (PRIORITY_RANK[l.priority] >= PRIORITY_RANK.high) carry.push(l);
  }
  return { queue, carry };
}

export interface SpeakClock {
  now: number;
  /** This department's last unprompted line (ms). */
  deptLast: number;
  /** Suite-wide last unprompted line (ms). */
  suiteLast: number;
  ambientLast: number;
  /** When the player entered this department (ms). */
  enteredAt: number;
  /** Last moment the scene reported isIntense() (ms; -Infinity if never). */
  intenseAt: number;
}

/** May this queued line show right now? (one-bubble-at-a-time is the caller's job.) */
export function maySpeak(kind: LineKind, c: SpeakClock): boolean {
  const rule = TRIGGER_RULES[kind];
  if (rule.priority === 'guided') return true;
  if (c.now - c.intenseAt < CALM_MS) return false;
  if (!rule.duringGrace && c.now - c.enteredAt < GRACE_MS) return false;
  if (kind === 'ambient' && c.now - c.ambientLast < AMBIENT_GAP_MS) return false;
  if (rule.capped && (c.now - c.deptLast < DEPT_GAP_MS || c.now - c.suiteLast < SUITE_GAP_MS)) return false;
  if (kind === 'tip' && c.now - c.suiteLast < SUITE_GAP_MS) return false;
  return true;
}

/** Ambient lines: Full only, >= 60 s on screen without input, nothing queued or showing. */
export function ambientDue(c: SpeakClock & { lastInput: number; busy: boolean; chattiness: Chattiness }): boolean {
  if (c.chattiness !== 'full' || c.busy) return false;
  if (c.now - c.lastInput < AMBIENT_IDLE_MS || c.now - c.enteredAt < AMBIENT_IDLE_MS) return false;
  return maySpeak('ambient', c);
}

/** Bubble time on screen: 2.5 s + 50 ms per character (3 s icon-only), 00 §5.4.5. */
export function bubbleSeconds(text: string): number {
  return text.trim() ? 2.5 + 0.05 * text.length : 3;
}

/** "Absence" greeting band: >= 8 h away (variant at >= 3 days), measured app-wide (00 §5.4.6). */
export function absenceGreeting(elapsedS: number): 0 | 1 | 2 {
  if (elapsedS >= 3 * 86400) return 2;
  if (elapsedS >= 8 * 3600) return 1;
  return 0;
}
