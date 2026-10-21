// The ManagerDirector's runtime half (specs/00 §5.4): the manager strip (portrait + bubble), the
// onboarding / micro-lesson runner with highlight outline and ghost finger, the priority queue
// with rate limits and calm detection, ambient lines, pending tips, and toasts. The rules
// themselves are pure functions in core/director.ts.
//
// Input rule (R4-03): the strip is pass-through. A touch that lands under it goes to the game and
// collapses the bubble to the portrait for the rest of that line. The only hit targets are the
// small chips (Skip during a script, the ✓ of a struggle offer, Show me / Skip at chattiness Off).
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { DeptDef, DeptScene, OnboardingStep, Rect, SayOpts, TargetRef, VoiceSource } from '../core/dept';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import {
  ambientDue,
  bubbleSeconds,
  chattinessAllows,
  classify,
  enqueue,
  expireQueue,
  maySpeak,
  PRIORITY_RANK,
  recordRepeat,
  repeatAllows,
  TRIGGER_RULES,
  type QueuedLine,
  type SpeakClock,
} from '../core/director';
import { HUD_H } from './hud';
import { PixelText, measure, wrap } from './font';
import { C, drawPanel, drawSprite } from './widgets';

const PORTRAIT_PX = 2;
const PW = 12 * PORTRAIT_PX;
const GHOST_S = 1.6; // one ghost-finger demo
const GHOST_REPEAT_MS = 10_000;
const SHRINK_MS = 30_000;
const DEMO_MS = 5_000; // replayed beat whose action is unavailable: demonstrate, don't wait
const TIP_CHECK_S = 1;
/** Below this content height the intro line never spreads over the scene (it peeks instead). */
const SHORT_CONTENT_H = 300;
const AVOID_CHECK_S = 0.25;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

interface Script {
  kind: 'intro' | 'lesson';
  id: string;
  steps: OnboardingStep[];
  replay: boolean;
  prompt: boolean;
  i: number;
  beatStart: number | null;
  demo: boolean;
  ghostAt: number;
}

interface Showing {
  text: string;
  key?: string;
  /** The intro on a short screen / over a key control: portrait only, the line as a caption
   * placed where it covers no avoidRects. */
  peek?: boolean;
  expression?: string;
  pinned: boolean; // a script beat: stays until done
  until: number; // ms
  collapsed: boolean;
  chips: ('skip' | 'offer' | 'show' | 'no')[];
  offer?: () => void;
  target?: TargetRef;
  started: number;
  wave?: boolean;
}

/** Picks a random variant of a manager line, with `%var%` substitution (null if none). */
export function pickLine(def: DeptDef, key: string, vars?: Record<string, string | number>): string | null {
  const options = def.manager.lines[key];
  if (!options?.length) return null;
  let text = options[Math.floor(Math.random() * options.length)];
  for (const [k, v] of Object.entries(vars ?? {})) text = text.split(`%${k}%`).join(String(v));
  return text;
}

const stepKey = (sc: { kind: string; id: string }, step: OnboardingStep) => (sc.kind === 'intro' ? `ob.${step.id}` : `ls.${sc.id}.${step.id}`);
const doneKey = (sc: { kind: string; id: string }) => (sc.kind === 'intro' ? 'onboardingDone' : `ls.${sc.id}`);
const skippedKey = (sc: { kind: string; id: string }) => (sc.kind === 'intro' ? 'onboardingSkipped' : `ls.${sc.id}.skipped`);
const replayKey = (sc: { kind: string; id: string }) => (sc.kind === 'intro' ? 'onboardingReplay' : `lsReplay.${sc.id}`);

export class ManagerDirector extends Container {
  private game: Game;
  private def: DeptDef | null = null;
  private d: DeptSave | null = null;
  private scene: DeptScene | null = null;
  private enteredAt = 0;
  private intenseAt = -Infinity;
  private queue: QueuedLine[] = [];
  private showing: Showing | null = null;
  private script: Script | null = null;
  private lessonQueue: { id: string; steps: OnboardingStep[]; replay: boolean }[] = [];
  /** Lesson beats registered by ctx.lesson(id, beats) this session (for pending tips). */
  private lessonBeats: Record<string, OnboardingStep[]> = {};
  private tipAcc = 0;
  private talk = 0;

  // Strip.
  private bubble = new Container();
  private bg = new Graphics();
  private portrait = new Graphics();
  private textSprite = new PixelText('', '#2a1a3a', null);
  private chips: { root: Container; bg: Graphics; text: PixelText; kind: Showing['chips'][number] | null }[] = [];
  private bubbleRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** Collapsed chips sit under the portrait instead of beside it (the highlight is there, U-10). */
  private chipsBelow = false;
  /** Guidance overlays (never interactive); the Game stacks this above the modal layer. */
  readonly guide = new Container();
  private hl = new Graphics();
  private ghost = new Graphics();
  private caption = new Container();
  private captionBg = new Graphics();
  private captionText = new PixelText('');
  // Toast.
  private toastBox = new Container();
  private toastBg = new Graphics();
  private toastText = new PixelText('');
  private toastTimer = 0;
  private toastW = 0;
  private toastH = 0;
  private avoidAcc = AVOID_CHECK_S;
  private avoidCache: Rect[] = [];
  private anchorY: number | null = null;
  private t = 0;

  constructor(game: Game) {
    super();
    this.game = game;
    for (let i = 0; i < 2; i++) {
      const root = new Container();
      const bg = new Graphics();
      const text = new PixelText('', '#f4e8c1', null);
      root.addChild(bg, text);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.visible = false;
      const chip = { root, bg, text, kind: null as Showing['chips'][number] | null };
      root.on('pointertap', (e) => {
        e.stopPropagation();
        this.onChip(chip.kind);
      });
      root.on('pointerdown', (e) => e.stopPropagation());
      this.chips.push(chip);
    }
    this.bubble.addChild(this.bg, this.portrait, this.textSprite, ...this.chips.map((c) => c.root));
    this.bubble.visible = false;
    this.bubble.eventMode = 'passive';
    this.hl.eventMode = 'none';
    this.ghost.eventMode = 'none';
    this.caption.addChild(this.captionBg, this.captionText);
    this.caption.eventMode = 'none';
    this.caption.visible = false;
    this.toastBox.addChild(this.toastBg, this.toastText);
    this.toastBox.visible = false;
    this.toastBox.eventMode = 'none';
    this.guide.eventMode = 'none';
    this.guide.addChild(this.hl, this.caption, this.ghost);
    this.addChild(this.bubble, this.toastBox);
  }

  // ---------- lifecycle ----------

  /** A department is opening (before its scene is built): lessons fired from the scene's
   * constructor queue instead of being dropped. */
  begin(def: DeptDef, d: DeptSave): void {
    this.clear();
    this.def = def;
    this.d = d;
    this.enteredAt = Date.now();
    this.intenseAt = -Infinity;
  }

  /** A department scene opened. */
  attach(def: DeptDef, d: DeptSave, scene: DeptScene): void {
    if (this.def !== def || this.d !== d) this.begin(def, d);
    this.scene = scene;
    this.avoidAcc = AVOID_CHECK_S;
    this.anchorY = null;
    this.startIntro();
    // Lessons queued for replay from Settings -> Managers (ahead of anything the scene queued).
    const replays: typeof this.lessonQueue = [];
    for (const [id, steps] of Object.entries(def.lessons ?? {})) {
      if (d.seen[`lsReplay.${id}`]) replays.push({ id, steps, replay: true });
    }
    this.lessonQueue.unshift(...replays);
    // Dial lessons whose dial is already up (Head Start grants levels without the first buy).
    for (const [id, level] of Object.entries(def.dialLessons ?? {})) {
      if (safe(() => level(d), 0) >= 1) this.lesson(def, d, id);
    }
  }

  /** The scene closed: expired-unseen high-priority lines go to the report (00 §5.4.4). */
  clear(): void {
    if (this.d) {
      const carry = this.queue.find((l) => PRIORITY_RANK[l.priority] >= PRIORITY_RANK.high && l.kind !== 'legacy');
      if (carry) this.d.reportCarry = carry.text;
    }
    this.queue = [];
    this.showing = null;
    this.script = null;
    this.lessonQueue = [];
    this.bubble.visible = false;
    this.hl.clear();
    this.ghost.clear();
    this.caption.visible = false;
    this.def = null;
    this.d = null;
    this.scene = null;
    this.avoidCache = [];
  }

  /** True while an onboarding script or lesson is running (rituals wait for it). */
  get busy(): boolean {
    return !!this.script || this.lessonQueue.length > 0;
  }

  /** Any touch on the canvas (logical px), before the game handles it. */
  onPointer(x: number, y: number): void {
    const s = this.showing;
    if (!s || !this.bubble.visible || s.collapsed) return;
    const r = this.bubbleRect;
    if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) return;
    for (const c of this.chips) {
      if (!c.root.visible) continue;
      const b = c.root.getBounds();
      const k = this.game.layout.scale;
      if (x >= b.x / k - 4 && x < (b.x + b.width) / k + 4 && y >= b.y / k - 4 && y < (b.y + b.height) / k + 4) return;
    }
    s.collapsed = true;
    s.peek = false;
    this.layoutBubble();
  }

  // ---------- public API ----------

  say(def: DeptDef, trigger: string, opts?: SayOpts, source: VoiceSource = 'dept'): void {
    const d = this.d;
    if (!d || def !== this.def) return;
    const cls = classify(trigger, opts);
    const chat = this.game.save.meta.settings.chatter;
    // A mechanic with a micro-lesson runs the lesson instead of a line.
    if (cls.kind === 'mechanic_unlocked' && def.lessons?.[trigger]) {
      this.lesson(def, d, trigger);
      return;
    }
    if (!chattinessAllows(cls.rule, chat)) return;
    const now = Date.now();
    const key = opts?.key ?? trigger;
    if (cls.enforceRepeat && !repeatAllows(cls.rule.repeat, cls.kind, key, d.seen, d.cycle.n, now)) return;
    const text = pickLine(def, trigger, opts?.vars);
    if (!text) return;
    if (cls.enforceRepeat) recordRepeat(cls.rule.repeat, cls.kind, key, d.seen, d.cycle.n, now);
    const line: QueuedLine = { key, kind: cls.kind, priority: cls.rule.priority, text, at: now, offer: opts?.offer, source, expression: opts?.expression };
    this.queue = enqueue(this.queue, line).queue;
  }

  /** Runs a micro-lesson once per save. */
  lesson(def: DeptDef, d: DeptSave, id: string, beats?: OnboardingStep[]): boolean {
    if (def !== this.def || d !== this.d) return false;
    const steps = beats ?? def.lessons?.[id];
    if (!steps?.length || d.seen[`ls.${id}`]) return false;
    if (beats) this.lessonBeats[id] = beats;
    if (this.script?.id === id || this.lessonQueue.some((l) => l.id === id)) return true;
    this.lessonQueue.push({ id, steps, replay: false });
    return true;
  }

  /** A wave: the portrait flashes without a bubble (after the report already greeted). */
  wave(): void {
    if (!this.def) return;
    this.show({ text: '', pinned: false, until: Date.now() + 1500, collapsed: true, chips: [], started: Date.now(), wave: true });
  }

  toast(text: string): void {
    const L = this.game.layout;
    const w = L.w - L.safe.l - L.safe.r - 8;
    const wrapped = wrap(text, w - 8);
    this.toastText.set(wrapped);
    const m = measure(wrapped);
    const g = this.toastBg.clear();
    drawPanel(g, 0, 0, w, m.h + 8, 0x1c1028, C.gold);
    this.toastW = w;
    this.toastH = m.h + 8;
    this.toastText.position.set(4, 4);
    this.avoidAcc = AVOID_CHECK_S; // re-read the scene's controls now
    this.refreshAvoid(0);
    this.toastBox.position.set(L.safe.l + 4, this.toastY());
    this.toastBox.visible = true;
    this.toastTimer = 3.5;
  }

  /**
   * Toasts sit at the top, under the HUD (and under a manager line if one is showing), and dodge
   * the open scene's important controls (DeptScene.avoidRects / toastAnchor).
   */
  private toastY(): number {
    const L = this.game.layout;
    const base = L.safe.t + HUD_H + 2;
    const top = this.bubble.visible ? this.bubbleRect.y + this.bubbleRect.h + 2 : base;
    let anchor: number | null = null;
    try {
      anchor = this.scene?.toastAnchor?.()?.y ?? null;
    } catch {
      anchor = null;
    }
    const avoid = this.bubble.visible ? [...this.avoidCache, this.bubbleRect] : this.avoidCache;
    return this.placeY(L.safe.l + 4, this.toastW, this.toastH, anchor !== null && Number.isFinite(anchor) ? [anchor, top] : [top], avoid, base);
  }

  /** Re-reads the scene's avoid rects a few times a second (they are cheap but not free). */
  private refreshAvoid(dt: number): void {
    this.avoidAcc += dt;
    if (this.avoidAcc < AVOID_CHECK_S) return;
    this.avoidAcc = 0;
    try {
      const r = this.scene?.avoidRects?.();
      this.avoidCache = Array.isArray(r) ? r.filter((x) => x && Number.isFinite(x.y) && Number.isFinite(x.h)).slice(0, 16) : [];
    } catch {
      this.avoidCache = [];
    }
  }

  /**
   * A top y for a box (x, w, h) that covers none of `avoid`: the preferred ys first, then a scan
   * down the content area in 4 px steps. With no free spot, the candidate with the least overlap.
   */
  private placeY(x: number, w: number, h: number, prefer: number[], avoid: Rect[], minY: number): number {
    const L = this.game.layout;
    const maxY = L.h - L.safe.b - h - 2;
    const clamp = (y: number) => Math.round(Math.max(minY, Math.min(maxY, y)));
    if (!avoid.length) return clamp(prefer[0]);
    const cost = (y: number) => {
      const box = { x, y, w, h };
      let c = 0;
      for (const r of avoid) {
        if (!overlaps(box, r)) continue;
        c += (Math.min(x + w, r.x + r.w) - Math.max(x, r.x)) * (Math.min(y + h, r.y + r.h) - Math.max(y, r.y));
      }
      return c;
    };
    let best = clamp(prefer[0]);
    let bestCost = Infinity;
    const tryY = (raw: number) => {
      const y = clamp(raw);
      const c = cost(y);
      if (c < bestCost) {
        best = y;
        bestCost = c;
      }
      return c === 0;
    };
    for (const p of prefer) if (tryY(p)) return best;
    for (let y = minY; y <= maxY; y += 4) if (tryY(y)) return best;
    return best;
  }

  // ---------- scripts ----------

  private startIntro(): void {
    const def = this.def!;
    const d = this.d!;
    if (!def.onboarding.length) return;
    const replay = !!d.seen.onboardingReplay;
    if (d.seen.onboardingDone && !replay) return;
    this.script = this.newScript('intro', 'intro', def.onboarding, replay);
    if (this.script.i < 0) this.finishScript();
  }

  private newScript(kind: 'intro' | 'lesson', id: string, steps: OnboardingStep[], replay: boolean): Script {
    const d = this.d!;
    const sc = { kind, id };
    const i = steps.findIndex((s) => !d.seen[stepKey(sc, s)]);
    return { kind, id, steps, replay, prompt: this.game.save.meta.settings.chatter === 'off', i, beatStart: null, demo: false, ghostAt: 0 };
  }

  private finishScript(): void {
    const sc = this.script;
    const d = this.d;
    if (!sc || !d) return;
    d.seen[doneKey(sc)] = 1;
    delete d.seen[replayKey(sc)];
    this.script = null;
    if (this.showing?.pinned) this.hide();
    this.game.saveSoon();
  }

  private skipScript(): void {
    const sc = this.script;
    const d = this.d;
    if (!sc || !d) return;
    if (!sc.replay) {
      d.seen[skippedKey(sc)] = 1;
      d.pendingTips ??= [];
      for (const st of sc.steps) {
        const ref = `${sc.id}:${st.id}`;
        if (!d.seen[stepKey(sc, st)] && !safe(() => st.done(d), true) && !d.pendingTips.includes(ref)) d.pendingTips.push(ref);
      }
    }
    this.finishScript();
  }

  private onChip(kind: Showing['chips'][number] | null): void {
    const s = this.showing;
    if (!kind || !s) return;
    if (kind === 'skip' || kind === 'no') {
      this.skipScript();
      this.hide();
    } else if (kind === 'show') {
      if (this.script) this.script.prompt = false;
      this.hide();
    } else if (kind === 'offer') {
      const fn = s.offer;
      this.hide();
      try {
        fn?.();
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** Advances the running script; returns true while it owns the strip. */
  private runScript(now: number): boolean {
    const sc = this.script;
    const d = this.d!;
    const def = this.def!;
    if (!sc) return false;
    if (sc.prompt) {
      if (!this.showing) {
        const title = sc.kind === 'intro' ? 'A QUICK TOUR?' : 'A NEW TRICK?';
        this.show({ text: title, pinned: true, until: Infinity, collapsed: false, chips: ['show', 'no'], started: now });
      }
      return true;
    }
    const step = sc.steps[sc.i];
    if (!step) {
      this.finishScript();
      return false;
    }
    const doneNow = safe(() => step.done(d), false);
    if (sc.beatStart === null) {
      // Not started: wait for the beat's condition (strip hidden, play freely).
      if (!sc.replay && doneNow) return this.advance(now);
      if (!sc.replay && step.waitFor && !safe(() => step.waitFor!(d), true)) {
        if (this.showing?.pinned) this.hide();
        return false;
      }
      sc.beatStart = now;
      sc.ghostAt = now;
      sc.demo = sc.replay && (doneNow || (!!step.waitFor && !safe(() => step.waitFor!(d), true)));
      // A legacy milestone line (old department flow) may finish before the beat appears.
      if (this.showing && !this.showing.pinned) return true;
      this.showBeat(step, now);
      return true;
    }
    if (sc.demo ? now - sc.beatStart >= DEMO_MS : doneNow) return this.advance(now);
    if (!this.showing) this.showBeat(step, now);
    else if (this.showing.pinned && !this.showing.collapsed && now - sc.beatStart >= SHRINK_MS) {
      this.showing.collapsed = true;
      this.layoutBubble();
    }
    // Ghost-finger repeats after 10 s without input (every few seconds in a demo).
    const repeat = sc.demo ? 2500 : GHOST_REPEAT_MS;
    const last = Math.max(this.game.lastInputAt, sc.ghostAt + GHOST_S * 1000);
    if (step.gesture && now - last >= repeat) sc.ghostAt = now;
    void def;
    return true;
  }

  private advance(now: number): boolean {
    const sc = this.script!;
    const d = this.d!;
    const step = sc.steps[sc.i];
    if (step) d.seen[stepKey(sc, step)] = 1;
    if (this.showing?.pinned) this.hide();
    sc.i = sc.steps.findIndex((s) => !d.seen[stepKey(sc, s)]);
    sc.beatStart = null;
    if (sc.i < 0) {
      this.finishScript();
      return false;
    }
    void now;
    return true;
  }

  private showBeat(step: OnboardingStep, now: number): void {
    const target = this.resolve(step.target);
    // Bubble starts collapsed when the highlight lies under it (line shows as a caption).
    const L = this.game.layout;
    const stripBottom = L.safe.t + HUD_H + 2 + PW + 8;
    const under = !!target && target.y < stripBottom && target.y + target.h > L.safe.t + HUD_H;
    this.show({ text: step.line, key: step.id, pinned: true, until: Infinity, collapsed: under, chips: ['skip'], target: step.target, started: now });
    this.voice(step.line, step.id, 'beat');
  }

  private voice(text: string, key: string, source: VoiceSource): void {
    if (this.def && text) this.game.voice(this.def, text, key, source);
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.t += dt;
    const now = Date.now();
    this.refreshAvoid(dt);
    // Docked bubble (DeptScene.bubbleAnchor): follow the sprite when the scene re-lays out.
    if (this.showing && this.bubble.visible) {
      const ay = this.readAnchor();
      if (ay !== this.anchorY) this.layoutBubble();
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.visible = false;
      else this.toastBox.y = this.toastY();
    }
    const d = this.d;
    const def = this.def;
    if (!d || !def) return;
    try {
      if (this.scene?.isIntense?.()) this.intenseAt = now;
    } catch {
      /* a broken hook never blocks lines */
    }

    // Expire stale lines (high ones are carried to the next report).
    const ex = expireQueue(this.queue, now);
    this.queue = ex.queue;
    if (ex.carry.length) d.reportCarry = ex.carry[0].text;

    // A finished non-pinned line.
    if (this.showing && !this.showing.pinned && now >= this.showing.until) this.hide();

    // Legacy milestone lines may cut in ahead of a script beat (old department flows).
    const legacyIdx = this.queue.findIndex((l) => l.kind === 'legacy');
    if (legacyIdx >= 0 && (!this.showing || (this.showing.pinned && !this.script?.prompt))) {
      const [line] = this.queue.splice(legacyIdx, 1);
      this.showLine(line, now);
    } else if (!this.script && this.lessonQueue.length && !(this.showing && !this.showing.pinned) && !this.introPending()) {
      const next = this.lessonQueue.shift()!;
      this.script = this.newScript('lesson', next.id, next.steps, next.replay);
      if (this.script.i < 0) this.finishScript();
    }

    const scripted = this.runScript(now);
    if (!scripted && !this.showing) {
      const clock = this.clock(now);
      const idx = this.queue.findIndex((l) => maySpeak(l.kind, clock));
      if (idx >= 0) {
        const [line] = this.queue.splice(idx, 1);
        this.showLine(line, now);
      } else if (!this.queue.length) {
        if (ambientDue({ ...clock, lastInput: this.game.lastInputAt, busy: false, chattiness: this.game.save.meta.settings.chatter })) {
          const text = pickLine(def, 'ambient');
          if (text) this.showLine({ key: 'ambient', kind: 'ambient', priority: 'ambient', text, at: now }, now);
          else this.game.save.meta.managerClock.lastAmbientAt = now; // nothing to say: don't re-check every frame
        } else {
          this.tipAcc += dt;
          if (this.tipAcc >= TIP_CHECK_S) {
            this.tipAcc = 0;
            this.checkTips(now, clock);
          }
        }
      }
    }

    this.draw(now);
  }

  /** Micro-lessons wait until the intro line and the onboarding script have finished (a replay
   * from Settings is the exception: the player asked for it). */
  private introPending(): boolean {
    const d = this.d;
    const def = this.def;
    if (!d || !def) return false;
    if (this.lessonQueue[0]?.replay) return false;
    if (this.queue.some((l) => l.key === 'intro') || this.showing?.key === 'intro') return true;
    return def.onboarding.length > 0 && !d.seen.onboardingDone;
  }

  private clock(now: number): SpeakClock {
    const mc = this.game.save.meta.managerClock;
    return {
      now,
      deptLast: this.d?.seen['mgr.last'] ?? 0,
      suiteLast: mc.lastLineAt,
      ambientLast: mc.lastAmbientAt,
      enteredAt: this.enteredAt,
      intenseAt: this.intenseAt,
    };
  }

  /** Skipped beats come back as one-line tips the first time they matter (Full only). */
  private checkTips(now: number, clock: SpeakClock): void {
    const d = this.d!;
    const def = this.def!;
    const tips = (d.pendingTips ??= []);
    if (!tips.length || this.game.save.meta.settings.chatter !== 'full' || !maySpeak('tip', clock)) return;
    for (let i = 0; i < tips.length; i++) {
      const ref = tips[i];
      const [sid, bid] = ref.split(':');
      const steps = sid === 'intro' ? def.onboarding : (def.lessons?.[sid] ?? this.lessonBeats[sid]);
      const step = steps?.find((s) => s.id === bid);
      if (!steps) continue; // a lesson registered later this session; keep it
      if (!step || safe(() => step.done(d), true)) {
        tips.splice(i--, 1);
        continue;
      }
      const matters = step.waitFor ? safe(() => step.waitFor!(d), false) : true;
      if (!matters || (step.target && !this.resolve(step.target))) continue;
      tips.splice(i, 1);
      this.showLine({ key: ref, kind: 'tip', priority: 'low', text: step.line, at: now }, now, step.target);
      return;
    }
  }

  private showLine(line: QueuedLine, now: number, target?: TargetRef): void {
    const rule = TRIGGER_RULES[line.kind];
    if (rule.capped || line.kind === 'legacy' || line.kind === 'tip') {
      this.game.save.meta.managerClock.lastLineAt = now;
      if (this.d) this.d.seen['mgr.last'] = now;
    }
    if (line.kind === 'ambient') this.game.save.meta.managerClock.lastAmbientAt = now;
    const def = this.def;
    const expression = line.expression ?? def?.manager.moods?.[line.key];
    this.show({
      text: line.text,
      key: line.key,
      pinned: false,
      until: now + bubbleSeconds(line.text) * 1000,
      collapsed: false,
      peek: line.key === 'intro' && !line.offer && this.introShouldPeek(),
      expression,
      chips: line.offer ? ['offer'] : [],
      offer: line.offer,
      target,
      started: now,
    });
    const source = (line.kind === 'tip' ? 'tip' : (line.source ?? 'dept')) as VoiceSource;
    this.voice(line.text, line.key, source);
  }

  /** The intro line peeks (portrait + a dodging caption) on short screens, or when the full strip
   * would cover one of the scene's key controls. */
  private introShouldPeek(): boolean {
    const L = this.game.layout;
    const contentH = L.h - L.safe.t - L.safe.b - HUD_H;
    if (contentH < SHORT_CONTENT_H) return true;
    this.avoidAcc = AVOID_CHECK_S;
    this.refreshAvoid(0);
    const strip: Rect = { x: L.safe.l, y: L.safe.t + HUD_H, w: L.w - L.safe.l - L.safe.r, h: PW + 10 };
    return this.avoidCache.some((r) => overlaps(strip, r));
  }

  private readAnchor(): number | null {
    try {
      const y = this.scene?.bubbleAnchor?.()?.y;
      return typeof y === 'number' && Number.isFinite(y) ? Math.round(y) : null;
    } catch {
      return null;
    }
  }

  // ---------- drawing ----------

  private show(s: Showing): void {
    this.showing = s;
    this.talk = 0;
    this.layoutBubble();
  }

  private hide(): void {
    this.showing = null;
    this.bubble.visible = false;
    this.caption.visible = false;
  }

  private layoutBubble(): void {
    const s = this.showing;
    const def = this.def;
    if (!s || !def) return;
    const L = this.game.layout;
    const w = L.w - L.safe.l - L.safe.r - 4;
    const chipLabels = s.chips.map((k) => (k === 'skip' ? 'SKIP' : k === 'offer' ? '{check}OK' : k === 'show' ? '{play}SHOW ME' : 'SKIP'));
    const chipW = chipLabels.map((l) => measure(l).w + 6);
    const chipsW = chipW.reduce((a, b) => a + b + 2, 0);
    let bw: number;
    let bh: number;
    const small = s.collapsed || s.peek;
    if (small) {
      // Collapsed: the portrait's own small panel; chips sit beside it, not in an empty box (U-10).
      bw = PW + 6;
      bh = PW + 6;
      this.textSprite.visible = false;
    } else {
      const textW = w - PW - 12;
      const body = wrap(s.text, textW);
      const full = `${def.manager.name.toUpperCase()}:\n${body}`;
      const m = measure(full);
      bw = w;
      bh = Math.max(PW + 6, m.h + 8 + (chipsW ? 12 : 0));
      this.textSprite.set(full, '#2a1a3a');
      this.textSprite.position.set(PW + 8, 4);
      this.textSprite.visible = true;
      // U-09: a full strip over the scene's key controls (DeptScene.avoidRects) folds away: a beat
      // with a target keeps its caption beside the highlight, anything else peeks with a dodging
      // caption beside the portrait.
      const strip: Rect = { x: L.safe.l + 2, y: L.safe.t + HUD_H + 2, w: bw, h: bh };
      this.avoidAcc = AVOID_CHECK_S;
      this.refreshAvoid(0);
      if (s.text && this.avoidCache.some((r) => overlaps(strip, r))) {
        if (s.pinned && s.target) s.collapsed = true;
        else s.peek = true;
        this.layoutBubble();
        return;
      }
    }
    const g = this.bg.clear();
    drawPanel(g, 0, 0, bw, bh, 0xf4e8c1, C.outline);
    g.rect(2, 2, bw - 4, 1).fill(0xffffff);
    this.portrait.position.set(4, 3);
    const bx = L.safe.l + 2;
    const top = L.safe.t + HUD_H + 2;
    // Docked near the manager's sprite when the scene asks (pinned script beats keep the strip).
    this.anchorY = this.readAnchor();
    const by = this.anchorY !== null && !s.pinned ? Math.max(top, Math.min(L.h - L.safe.b - bh - 2, this.anchorY - bh)) : top;
    this.bubble.position.set(bx, by);
    this.bubbleRect = { x: bx, y: by, w: small && chipsW && !this.chipsBelow ? bw + 2 + chipsW : bw, h: bh };
    // Chips: at the bottom-right corner of the full strip; to the right of a collapsed portrait.
    let cx = bw - 2;
    let lx = bw + 2;
    this.chips.forEach((c, i) => {
      const label = chipLabels[i];
      c.kind = s.chips[i] ?? null;
      c.root.visible = !!label;
      if (!label) return;
      c.text.set(label);
      const cw = chipW[i];
      const fill = c.kind === 'show' || c.kind === 'offer' ? C.greenDark : C.edge;
      if (small) {
        c.bg.clear().rect(0, 0, cw, 11).fill(C.outline).rect(1, 1, cw - 2, 9).fill(fill);
        c.text.position.set(3, 3);
        if (this.chipsBelow) c.root.position.set(lx - bw - 2, bh + 2);
        else c.root.position.set(lx, Math.floor((bh - 11) / 2));
        lx += cw + 2;
      } else {
        cx -= cw;
        c.bg.clear().rect(0, 0, cw, 10).fill(fill);
        c.text.position.set(3, 2);
        c.root.position.set(cx, bh - 12);
        cx -= 2;
      }
      // Touch target >= 12 logical px around the small chip.
      c.root.hitArea = new Rectangle(-2, -4, cw + 4, 16);
    });
    this.bubble.visible = true;
    this.drawPortrait();
  }

  private drawPortrait(): void {
    const def = this.def;
    if (!def) return;
    const m = def.manager;
    const expr = this.showing?.expression ? m.expressions?.[this.showing.expression] : undefined;
    const frames: string[][] = expr?.length ? expr : m.portrait;
    // Talking: cycle idle and the talking frames (1..n) for the first 1.5 s of a line.
    const talking = frames.length > 1 && !!this.showing && this.talk < 1.5;
    const step = Math.floor(this.talk * 6) % frames.length;
    const frame = talking ? (frames.length === 2 ? (step === 0 ? 1 : 0) : step) : 0;
    const g = this.portrait.clear();
    g.rect(-1, -1, PW + 2, PW + 2).fill(C.outline);
    drawSprite(g, frames[frame] ?? m.portrait[0], m.palette, 0, 0, PORTRAIT_PX);
  }

  /** Resolves a beat target to a screen rect (null when hidden). */
  resolve(t: TargetRef | undefined): Rect | null {
    if (!t) return null;
    const L = this.game.layout;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    try {
      if (typeof t === 'function') return this.scene ? t(this.scene) : null;
      switch (t) {
        case 'hud.home':
          return { x: x0 + 2, y: L.safe.t + 3, w: 18, h: 18 };
        case 'hud.bank':
          return { x: x0 + 24, y: L.safe.t + 3, w: 70, h: 18 };
        case 'hud.infamy':
        case 'hud.legend':
          return { x: x0 + w - 72, y: L.safe.t + 11, w: 72, h: HUD_H - 11 };
        default:
          return this.scene?.targetRect?.(t) ?? null;
      }
    } catch {
      return null;
    }
  }

  /** The right edge of the chips row beside a collapsed portrait. */
  private chipsRight(): number {
    let right = this.bubbleRect.x + PW + 6;
    for (const c of this.chips) if (c.root.visible) right += c.bg.width + 2;
    return right;
  }

  private draw(now: number): void {
    const s = this.showing;
    if (s) {
      this.talk += 1 / 60;
      if (this.talk < 1.6) this.drawPortrait();
    }
    const hl = this.hl.clear();
    const gh = this.ghost.clear();
    this.caption.visible = false;
    if (s?.peek && s.text && this.bubble.visible) {
      this.drawPeek(s.text);
      return;
    }
    // Guidance is hidden while a modal covers the scene, except a beat that points inside the
    // open upgrade sheet (OnboardingStep.sheetTarget).
    if (!s) return;
    const modal = this.game.modalLayer.children.length > 0;
    const sc0 = this.script;
    const beat = s.pinned && sc0 ? sc0.steps[sc0.i] : null;
    let r: Rect | null = null;
    let inSheet = false;
    if (modal) {
      const sheet = this.game.sheet;
      if (!beat?.sheetTarget || !sheet || this.game.modalLayer.children.length !== 1) return;
      r = sheet.targetRect(beat.sheetTarget);
      inSheet = true;
    } else {
      if (!s.target) return;
      r = this.resolve(s.target);
    }
    if (!r) return;
    // U-10: never outline through the collapsed bubble's chips (SKIP): move them under the portrait.
    if ((s.collapsed || s.peek) && s.chips.length && this.bubble.visible) {
      const b = this.bubbleRect;
      const beside: Rect = { x: b.x + PW + 6, y: b.y, w: Math.max(0, this.chipsRight() - (b.x + PW + 6)), h: b.h };
      const want = overlaps(beside, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
      if (want !== this.chipsBelow) {
        this.chipsBelow = want;
        this.layoutBubble();
      }
    }
    // Pulsing 1 px outline (pixel-art pulse: two colours alternating, plus a corner blink).
    const on = Math.floor(this.t * 3) % 2 === 0;
    const col = on ? C.gold : 0xf4e8c1;
    const x = Math.round(r.x) - 1;
    const y = Math.round(r.y) - 1;
    const w = Math.round(r.w) + 2;
    const h = Math.round(r.h) + 2;
    hl.rect(x, y, w, 1).rect(x, y + h - 1, w, 1).rect(x, y, 1, h).rect(x + w - 1, y, 1, h).fill(col);
    if (on) hl.rect(x - 1, y - 1, 2, 2).rect(x + w - 1, y - 1, 2, 2).rect(x - 1, y + h - 1, 2, 2).rect(x + w - 1, y + h - 1, 2, 2).fill(col);
    // Caption beside the highlight when the bubble is collapsed over it (or dimmed by the sheet).
    if ((s.collapsed || inSheet) && s.pinned && s.text) this.drawCaption(s.text, r, inSheet);
    // Ghost finger (a tap inside the sheet).
    const sc = this.script;
    const step = s.pinned && sc ? sc.steps[sc.i] : null;
    if (inSheet && step && sc) {
      const p = (now - sc.ghostAt) / 1000;
      if (p >= 0 && p < GHOST_S) this.drawGhost(gh, 'tap', r, null, p / GHOST_S);
    } else if (step?.gesture && sc) {
      const p = (now - sc.ghostAt) / 1000;
      if (p >= 0 && p < GHOST_S) this.drawGhost(gh, step.gesture, r, this.resolve(step.dragTo), p / GHOST_S);
    }
  }

  /** The peeking intro: a one-or-two-line caption beside the portrait, placed off the scene's
   * key controls. */
  private drawPeek(text: string): void {
    const L = this.game.layout;
    const x0 = this.bubbleRect.x + this.bubbleRect.w + 2;
    const maxW = L.w - L.safe.r - 2 - x0;
    const line = wrap(text, maxW - 6).split('\n').slice(0, 2).join('\n');
    this.captionText.set(line);
    const m = measure(line);
    const cw = m.w + 6;
    const ch = m.h + 5;
    const cy = this.placeY(x0, cw, ch, [this.bubbleRect.y + 2], this.avoidCache, this.bubbleRect.y);
    this.captionBg.clear().rect(0, 0, cw, ch).fill({ color: 0x0a0410, alpha: 0.85 }).rect(0, ch - 1, cw, 1).fill(C.gold);
    this.captionText.position.set(3, 2);
    this.caption.position.set(x0, cy);
    this.caption.visible = true;
  }

  /** `side`: try beside the highlight first (inside the sheet, below would cover the next row). */
  private drawCaption(text: string, r: Rect, side = false): void {
    const L = this.game.layout;
    const maxW = L.w - L.safe.l - L.safe.r - 8;
    const sideW = side ? Math.max(r.x - L.safe.l - 6, L.w - L.safe.r - (r.x + r.w) - 6) : 0;
    const narrow = side && sideW >= 60;
    const line = wrap(text, (narrow ? sideW : maxW) - 6).split('\n').slice(0, narrow ? 3 : 2).join('\n');
    this.captionText.set(line);
    const m = measure(line);
    const cw = m.w + 6;
    const ch = m.h + 5;
    let cy = r.y + r.h + 3;
    if (cy + ch > L.h - L.safe.b - 2) cy = r.y - ch - 3;
    let cx = Math.max(L.safe.l + 2, Math.min(L.w - L.safe.r - cw - 2, Math.round(r.x + r.w / 2 - cw / 2)));
    if (narrow) {
      const leftRoom = r.x - L.safe.l - 6;
      cx = leftRoom >= cw ? Math.round(r.x - cw - 3) : Math.round(r.x + r.w + 3);
      cy = Math.max(L.safe.t, Math.min(L.h - L.safe.b - ch - 2, Math.round(r.y + r.h / 2 - ch / 2)));
    }
    this.captionBg.clear().rect(0, 0, cw, ch).fill({ color: 0x0a0410, alpha: 0.85 }).rect(0, ch - 1, cw, 1).fill(C.gold);
    this.captionText.position.set(3, 2);
    this.caption.position.set(cx, Math.round(cy));
    this.caption.visible = true;
  }

  /** A small pixel hand demonstrating tap / hold / drag; `p` runs 0..1 over one demo. */
  private drawGhost(g: Graphics, gesture: string, r: Rect, to: Rect | null, p: number): void {
    const cx = Math.round(r.x + r.w / 2);
    const cy = Math.round(r.y + r.h / 2);
    let fx = cx;
    let fy = cy;
    let pressed = false;
    let ring = -1;
    if (gesture === 'drag') {
      const tx = to ? Math.round(to.x + to.w / 2) : cx;
      const ty = to ? Math.round(to.y + to.h / 2) : cy + 32;
      const k = p < 0.2 ? 0 : p > 0.8 ? 1 : (p - 0.2) / 0.6;
      fx = Math.round(cx + (tx - cx) * k);
      fy = Math.round(cy + (ty - cy) * k);
      pressed = p >= 0.15 && p <= 0.85;
      if (pressed) g.moveTo(cx, cy).lineTo(fx, fy).stroke({ color: 0xf4e8c1, width: 1, alpha: 0.5 });
    } else if (gesture === 'hold') {
      pressed = p >= 0.2 && p <= 0.9;
      if (pressed) ring = (p - 0.2) / 0.7;
    } else {
      pressed = (p >= 0.3 && p < 0.45) || (p >= 0.6 && p < 0.75);
      if (p >= 0.3 && p < 0.9) ring = ((p - 0.3) % 0.3) / 0.3;
    }
    if (ring >= 0) {
      const rr = Math.round(2 + ring * 5);
      g.circle(cx, cy, rr).stroke({ color: 0xf4e8c1, width: 1, alpha: 0.8 * (1 - ring * 0.6) });
    }
    // Fingertip sits at (fx, fy); the hand trails down-right.
    const ox = fx - 1;
    const oy = fy + (pressed ? 0 : -2);
    drawSprite(g, GHOST_HAND, GHOST_PAL, ox, oy, 1);
  }
}

const GHOST_HAND = [
  '.KK.....',
  'KWWK....',
  'KWWK....',
  'KWWKKK..',
  'KWWWWWKK',
  'KWWWWWWK',
  'KWWWWWWK',
  '.KWWWWK.',
  '..KKKK..',
];
const GHOST_PAL = { K: '#0a0410', W: '#f4e8c1' };

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
