// The Next Goal ribbon (fun plan A3): one thin always-visible strip in the Throne Room and every
// department HUD with the single next goal and its progress ("UNSEAL THE STYX  72%"). Tapping it
// goes there. The goal comes from core/goals.ts (pure); this file only draws and routes.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Game } from '../core/game';
import { pickGoal, type Goal } from '../core/goals';
import type { DeptId } from '../core/types';
import { PixelText } from './font';
import { C } from './widgets';

export const RIBBON_H = 8;

/** Takes the player to a goal (ribbon tap, the report's GO). */
export function followGoal(game: Game, goal: Goal | null): void {
  if (!goal) return;
  const go = goal.go;
  if (go.kind === 'enter') {
    if (game.current !== go.id) game.enter(go.id);
  } else if (go.kind === 'seal' || go.kind === 'throne') {
    if (game.current !== 'throne') game.goThrone();
    if (go.kind === 'seal') game.throne?.flashDoor(go.id);
  } else if (goal.text.startsWith('SOMETHING STIRS')) {
    game.toast('GATHER TRIBUTE. THE BOARDS WILL GIVE, AND SOMETHING WILL STEP OUT.');
  } else if (goal.text.startsWith('A SEALED DOOR')) {
    game.toast('DREAD COMES FROM FALLS. FILL A LEGEND GATE, THEN LET HER IN.');
  }
}

/** The goal for a place, guarded (a throwing department hook never breaks the strip). */
export function goalFor(game: Game, where: DeptId | 'throne'): Goal | null {
  return game.guard('goal', () => pickGoal(game.save, game.defs, where)) ?? null;
}

export class Ribbon extends Container {
  private game: Game;
  private where: DeptId | 'throne';
  private w: number;
  private bg = new Graphics();
  private text = new PixelText('', C.ink);
  private detail = new PixelText('', C.goldText);
  private goal: Goal | null = null;
  private acc = 1;
  private t = 0;
  private key = '';
  private flash = 0;

  constructor(game: Game, where: DeptId | 'throne', w: number) {
    super();
    this.game = game;
    this.where = where;
    this.w = w;
    this.addChild(this.bg, this.text, this.detail);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    // Generous touch target: the strip plus 3 px above and below.
    this.hitArea = new Rectangle(0, -3, w, RIBBON_H + 6);
    this.on('pointertap', () => followGoal(this.game, this.goal));
    this.update(1);
  }

  /** Current goal (tests, the report). */
  get current(): Goal | null {
    return this.goal;
  }

  update(dt: number): void {
    this.t += dt;
    this.acc += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.acc >= 0.5) {
      this.acc = 0;
      this.goal = goalFor(this.game, this.where);
      const k = this.goal?.key ?? '';
      // A new goal arrives with a short shimmer.
      if (k !== this.key) {
        if (this.key) this.flash = 0.6;
        this.key = k;
      }
    }
    this.draw();
  }

  private draw(): void {
    const g = this.bg.clear();
    const w = this.w;
    const goal = this.goal;
    this.visible = !!goal;
    if (!goal) return;
    const hot = !!goal.hot;
    const pulse = hot && Math.floor(this.t * 2.5) % 2 === 0;
    g.rect(0, 0, w, RIBBON_H).fill(C.outline);
    g.rect(1, 1, w - 2, RIBBON_H - 2).fill(pulse ? 0x4a2030 : 0x24142e);
    const p = goal.progress;
    if (p !== null && p > 0) g.rect(1, 1, Math.max(1, Math.floor((w - 2) * Math.min(1, p))), RIBBON_H - 2).fill(hot ? 0x7a2a2a : 0x3c3016);
    if (this.flash > 0) g.rect(1, 1, w - 2, RIBBON_H - 2).fill({ color: 0xf4e8c1, alpha: this.flash * 0.5 });
    // Text: "GOAL ... DETAIL >", truncated to fit.
    const detail = `${goal.detail} >`;
    this.detail.set(detail, hot ? C.redText : C.goldText);
    const dw = this.detail.width;
    this.detail.position.set(w - dw - 2, 1);
    const maxChars = Math.max(4, Math.floor((w - dw - 8) / 4));
    const t = goal.text.length > maxChars ? `${goal.text.slice(0, maxChars - 2)}..` : goal.text;
    this.text.set(t, C.ink);
    this.text.position.set(3, 1);
  }
}
