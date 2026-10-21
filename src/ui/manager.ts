// Department managers: a portrait + speech bubble under the HUD. Handles onboarding steps,
// milestone lines (always shown unless chatter is off) and rate-limited flavor lines.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { DeptDef, OnboardingStep } from '../core/dept';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import { HUD_H } from './hud';
import { PixelText, measure, wrap } from './font';
import { C, drawPanel, drawSprite } from './widgets';

const FLAVOR_GAP_S = 90;
const SHOW_S = 5;
const PORTRAIT_PX = 2;

interface Line {
  def: DeptDef;
  text: string;
  pinned: boolean; // onboarding lines stay until their step is done
}

export class ManagerBubble extends Container {
  private game: Game;
  private bubble = new Container();
  private toastBox = new Container();
  private queue: Line[] = [];
  private showing: Line | null = null;
  private timer = 0;
  private sinceFlavor = FLAVOR_GAP_S;
  private talk = 0;
  private portrait = new Graphics();
  private textSprite = new PixelText('', '#2a1a3a', null);
  private bg = new Graphics();
  private toastBg = new Graphics();
  private toastText = new PixelText('');
  private toastTimer = 0;
  private chip = new Container();
  private chipBg = new Graphics();
  private chipText = new PixelText('', '#f4e8c1', null);
  private onboarding: { def: DeptDef; d: DeptSave; steps: OnboardingStep[]; i: number } | null = null;

  constructor(game: Game) {
    super();
    this.game = game;
    // Touches pass through the bubble (it never blocks play); only the small chip is tappable.
    this.chip.addChild(this.chipBg, this.chipText);
    this.chip.eventMode = 'static';
    this.chip.cursor = 'pointer';
    this.chip.on('pointertap', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    this.bubble.addChild(this.bg, this.portrait, this.textSprite, this.chip);
    this.bubble.visible = false;
    this.bubble.eventMode = 'passive';
    this.toastBox.addChild(this.toastBg, this.toastText);
    this.toastBox.visible = false;
    this.toastBox.eventMode = 'none';
    this.addChild(this.bubble, this.toastBox);
  }

  clear(): void {
    this.queue = [];
    this.showing = null;
    this.bubble.visible = false;
    this.onboarding = null;
  }

  startOnboarding(def: DeptDef, d: DeptSave): void {
    if (d.seen.onboardingDone) return;
    const steps = def.onboarding;
    const i = steps.findIndex((s) => !d.seen[`ob.${s.id}`]);
    if (i < 0) {
      d.seen.onboardingDone = 1;
      return;
    }
    this.onboarding = { def, d, steps, i };
  }

  say(def: DeptDef, trigger: string, opts?: { milestone?: boolean; vars?: Record<string, string | number> }): void {
    const chatter = this.game.save.meta.settings.chatter;
    if (chatter === 'off') return;
    const milestone = !!opts?.milestone;
    if (!milestone) {
      if (chatter !== 'full' || this.sinceFlavor < FLAVOR_GAP_S || this.showing || this.queue.length) return;
      this.sinceFlavor = 0;
    }
    const options = def.manager.lines[trigger];
    if (!options?.length) return;
    let text = options[Math.floor(Math.random() * options.length)];
    for (const [k, v] of Object.entries(opts?.vars ?? {})) text = text.split(`%${k}%`).join(String(v));
    if (this.queue.length > 3) this.queue.shift();
    this.queue.push({ def, text, pinned: false });
  }

  toast(text: string): void {
    const L = this.game.layout;
    const w = L.w - L.safe.l - L.safe.r - 8;
    const wrapped = wrap(text, w - 8);
    this.toastText.set(wrapped);
    const m = measure(wrapped);
    const g = this.toastBg.clear();
    drawPanel(g, 0, 0, w, m.h + 8, 0x1c1028, C.gold);
    this.toastText.position.set(4, 4);
    this.toastBox.position.set(L.safe.l + 4, this.toastY());
    this.toastBox.visible = true;
    this.toastTimer = 3.5;
  }

  /** Toasts sit at the top, under the HUD (and under a manager line if one is showing), never over controls. */
  private toastY(): number {
    const L = this.game.layout;
    const base = L.safe.t + HUD_H + 2;
    return this.bubble.visible ? this.bubble.y + this.bubble.height + 2 : base;
  }

  private dismiss(): void {
    if (this.showing?.pinned && this.onboarding) {
      // Tapping an onboarding line skips the rest of the tour.
      this.onboarding.d.seen.onboardingDone = 1;
      this.onboarding = null;
    }
    this.showing = null;
    this.bubble.visible = false;
  }

  update(dt: number): void {
    this.sinceFlavor += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.visible = false;
      else this.toastBox.y = this.toastY();
    }

    // Advance onboarding.
    const ob = this.onboarding;
    if (ob) {
      const step = ob.steps[ob.i];
      if (step.done(ob.d)) {
        ob.d.seen[`ob.${step.id}`] = 1;
        ob.i = ob.steps.findIndex((s) => !ob.d.seen[`ob.${s.id}`]);
        if (this.showing?.pinned) this.showing = null;
        if (ob.i < 0) {
          ob.d.seen.onboardingDone = 1;
          this.onboarding = null;
        }
      } else if (!this.showing && !this.queue.length) {
        this.show({ def: ob.def, text: step.line, pinned: true });
      }
    }

    if (this.showing) {
      this.talk += dt;
      if (!this.showing.pinned) {
        this.timer -= dt;
        if (this.timer <= 0) this.dismiss();
      }
      this.drawPortrait(Math.floor(this.talk * 6) % 2 === 0 && this.talk < 1.5 ? 1 : 0);
    } else if (this.queue.length) {
      this.show(this.queue.shift()!);
    }
  }

  private show(line: Line): void {
    this.showing = line;
    this.timer = SHOW_S + line.text.length / 25;
    this.talk = 0;
    const L = this.game.layout;
    const w = L.w - L.safe.l - L.safe.r - 4;
    const pw = 12 * PORTRAIT_PX;
    const textW = w - pw - 30; // leaves room for the chip
    const name = `${line.def.manager.name.toUpperCase()}:`;
    const body = wrap(line.text, textW);
    const full = `${name}\n${body}`;
    const m = measure(full);
    const h = Math.max(pw + 6, m.h + 8);
    const g = this.bg.clear();
    drawPanel(g, 0, 0, w, h, 0xf4e8c1, C.outline);
    g.rect(2, 2, w - 4, 1).fill(0xffffff);
    this.textSprite.position.set(pw + 8, 4);
    this.textSprite.set(full, '#2a1a3a');
    this.portrait.position.set(4, 3);
    this.bubble.position.set(L.safe.l + 2, L.safe.t + HUD_H + 2);
    const label = line.pinned ? 'SKIP' : 'X';
    this.chipText.set(label);
    const cw = this.chipText.width + 6;
    this.chipBg.clear().rect(0, 0, cw, 9).fill(C.edge);
    this.chipText.position.set(3, 2);
    this.chip.position.set(w - cw - 2, h - 11);
    // Generous touch target around the small chip.
    this.chip.hitArea = new Rectangle(-6, -6, cw + 10, 19);
    this.bubble.visible = true;
    this.drawPortrait(0);
  }

  private drawPortrait(frame: number): void {
    if (!this.showing) return;
    const m = this.showing.def.manager;
    const g = this.portrait.clear();
    g.rect(-1, -1, 12 * PORTRAIT_PX + 2, 12 * PORTRAIT_PX + 2).fill(C.outline);
    drawSprite(g, m.portrait[frame], m.palette, 0, 0, PORTRAIT_PX);
  }
}
