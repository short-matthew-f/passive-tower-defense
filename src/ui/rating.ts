// The once-a-day "how fun was today?" 1-10 prompt (Wave 0 playtest log, core/playtest.ts).
// Shown at a calm moment only: in the Throne Room, with no other modal open, at most once per
// local day (core/playtest.ts shouldPromptRating decides when). One tap answers; NOT NOW dismisses
// for the day. Never nags: no repeat, no badge, no penalty.
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../core/game';
import { playtestOf, ptDismiss, ptPrompted, ptRate, shouldPromptRating } from '../core/playtest';
import { PixelText, wrap } from './font';
import { Button, C, drawPanel } from './widgets';
import { destroyTree } from './destroy';

/** Called at 1 Hz by the Game: opens the prompt when it is due and the moment is calm. */
export function maybeRatingPrompt(game: Game, now: number): void {
  if (game.readOnly || game.current !== 'throne' || game.modalLayer.children.length > 0) return;
  if (now - game.lastInputAt > 60_000) return; // nobody looking
  const st = playtestOf(game.save);
  if (!shouldPromptRating(st, now)) return;
  ptPrompted(st, now);
  showRatingPrompt(game);
}

export function showRatingPrompt(game: Game): void {
  const L = game.layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.6 });
  dim.eventMode = 'static';
  root.addChild(dim);
  const w = Math.min(L.w - L.safe.l - L.safe.r - 12, 168);
  const h = 104;
  const x = L.safe.l + Math.floor((L.w - L.safe.l - L.safe.r - w) / 2);
  const y = Math.floor((L.h - h) / 2);
  const panel = new Graphics();
  drawPanel(panel, x, y, w, h, 0x221428, C.gold);
  panel.eventMode = 'static';
  root.addChild(panel);
  const title = new PixelText('HOW FUN WAS TODAY?', C.goldText);
  title.position.set(x + Math.floor((w - title.width) / 2), y + 8);
  const sub = new PixelText(wrap('ONE TAP. IT STAYS ON THIS PHONE, IN THE PLAYTEST LOG.', w - 14), '#9c8aa8');
  sub.position.set(x + 7, y + 19);
  root.addChild(title, sub);

  const close = () => {
    if (!root.destroyed) destroyTree(root);
  };
  const gap = 2;
  const bw = Math.floor((w - 12 - gap * 4) / 5);
  const colors = [0x7a2020, 0x8a3a20, 0x9a5a20, 0x9a7a20, 0x8a8a20, 0x6a8a20, 0x5a9a2a, 0x4a9a3a, 0x3aa04a, 0x2aa85a];
  for (let i = 0; i < 10; i++) {
    const score = i + 1;
    const b = new Button({
      w: bw,
      h: 16,
      label: String(score),
      color: colors[i],
      shade: 0x2a1418,
      textColor: C.ink,
      onTap: () => {
        ptRate(playtestOf(game.save), Date.now(), score);
        game.saveSoon();
        close();
        game.toast(score >= 7 ? `${score}/10. THE OVERLORD IS PLEASED. NOTED.` : `${score}/10. NOTED. THE MINIONS WILL DO BETTER.`);
      },
    });
    b.position.set(x + 6 + (i % 5) * (bw + gap), y + 40 + Math.floor(i / 5) * 19);
    root.addChild(b);
  }
  const later = new Button({
    w: w - 12,
    h: 14,
    label: 'NOT NOW',
    color: C.edge,
    shade: 0x3a2046,
    textColor: C.ink,
    onTap: () => {
      ptDismiss(playtestOf(game.save), Date.now());
      game.saveSoon();
      close();
    },
  });
  later.position.set(x + 6, y + h - 22);
  root.addChild(later);
  game.trackModal(root, { reopen: () => showRatingPrompt(game) });
  game.modalLayer.addChild(root);
}
