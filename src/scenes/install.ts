// Save safety prompts (specs/00 §9): iOS Safari may evict website storage after 7 days without a
// visit unless the app is installed. Before the first Fall we show, once, how to Add to Home
// Screen; when not installed, a weekly reminder to Export. Both are dismissible and never nag.
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../core/game';
import { installPrompt } from '../pwa';
import { PixelText, measure, wrap } from '../ui/font';
import { Button, C, drawPanel } from '../ui/widgets';
import { openSettings } from './settings';
import { destroyTree } from '../ui/destroy';

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function isStandalone(): boolean {
  try {
    return !!(navigator as any).standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * Before the first Fall, once: on iOS outside the installed app (or when Chrome offers an install),
 * explain Add to Home Screen. Returns true if it opened (call `then` to continue afterwards).
 */
export function maybeShowA2hs(game: Game, then: () => void): boolean {
  const seen = game.save.meta.seen;
  if (seen.a2hs || game.save.meta.dreadLifetime > 0 || isStandalone()) return false;
  if (!isIOS() && !installPrompt()) return false;
  seen.a2hs = Date.now();
  game.saveSoon();
  showA2hs(game, then);
  return true;
}

/** The pixel modal with the Share -> Add to Home Screen steps. */
export function showA2hs(game: Game, then?: () => void): void {
  const L = game.layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.8 });
  dim.eventMode = 'static';
  root.addChild(dim);
  const w = L.w - L.safe.l - L.safe.r - 12;
  const x = L.safe.l + 6;
  const install = isIOS() ? null : installPrompt();
  const intro = wrap(
    'SAFARI MAY FORGET A WEBSITE AFTER 7 DAYS AWAY. INSTALL OVERLORD ON YOUR HOME SCREEN AND YOUR EMPIRE STAYS PUT.',
    w - 16,
  );
  const introH = measure(intro).h;
  const steps: [string, (g: Graphics, x: number, y: number) => void][] = install
    ? [['TAP INSTALL BELOW', drawPlus]]
    : [
        ['TAP SHARE IN SAFARI', drawShare],
        ['ADD TO HOME SCREEN', drawPlus],
        ['OPEN OVERLORD FROM THERE', drawCrown],
      ];
  const h = 34 + introH + steps.length * 18 + 52;
  const y = Math.max(L.safe.t + 4, Math.floor((L.h - h) / 2));
  const g = new Graphics();
  drawPanel(g, x, y, w, h, 0x2a1a3a, C.gold);
  root.addChild(g);
  const title = new PixelText('KEEP YOUR EMPIRE SAFE', C.goldText);
  title.position.set(x + Math.floor((w - title.width) / 2), y + 7);
  const body = new PixelText(intro, '#c8b8d0');
  body.position.set(x + 8, y + 19);
  root.addChild(title, body);
  let sy = y + 26 + introH;
  steps.forEach(([label, icon], i) => {
    const row = new Graphics();
    row.rect(x + 6, sy, w - 12, 15).fill(0x1c1028);
    icon(row, x + 9, sy + 2);
    const t = new PixelText(`${i + 1}. ${label}`);
    t.position.set(x + 26, sy + 5);
    root.addChild(row, t);
    sy += 18;
  });
  const close = () => {
    destroyTree(root);
    then?.();
  };
  const ok = new Button({
    w: w - 24,
    h: 18,
    label: install ? 'INSTALL' : 'GOT IT',
    onTap: () => {
      install?.();
      close();
    },
  });
  ok.position.set(x + 12, y + h - 44);
  const later = new Button({ w: w - 24, h: 14, label: 'NOT NOW', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: close });
  later.position.set(x + 12, y + h - 22);
  root.addChild(ok, later);
  // A resize re-opens it with its continuation (the Fall the player started), C-11.
  game.trackModal(root, { reopen: () => showA2hs(game, then) });
  game.modalLayer.addChild(root);
}

/** Weekly "Export a backup" reminder when the app is not installed (00 §9). */
export function maybeExportNag(game: Game, now = Date.now()): boolean {
  const s = game.save;
  if (game.readOnly || isStandalone()) return false;
  const seen = s.meta.seen;
  if (!seen.exportNagAt) {
    seen.exportNagAt = now; // first week counts from the first run
    return false;
  }
  const last = Math.max(seen.exportNagAt, seen.exportAt ?? 0);
  const progressed = Object.keys(s.depts).length > 1 || s.meta.dreadLifetime > 0;
  if (!progressed || now - last < WEEK_MS) return false;
  if (game.modalLayer.children.length > 0) return false; // never stack on the report
  seen.exportNagAt = now;
  game.saveSoon();
  showExportNag(game);
  return true;
}

export function showExportNag(game: Game): void {
  const L = game.layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.7 });
  dim.eventMode = 'static';
  root.addChild(dim);
  const w = L.w - L.safe.l - L.safe.r - 12;
  const x = L.safe.l + 6;
  const text = wrap(
    "GOBBO SAYS: THE BROWSER CAN LOSE YOUR EMPIRE IF IT ISN'T INSTALLED. COPY A BACKUP (SETTINGS > EXPORT) AND KEEP IT SOMEWHERE SAFE.",
    w - 16,
  );
  const th = measure(text).h;
  const h = 24 + th + 48;
  const y = Math.floor((L.h - h) / 2);
  const g = new Graphics();
  drawPanel(g, x, y, w, h, 0xe8dcb0, 0x8a6a3a);
  root.addChild(g);
  const title = new PixelText('WEEKLY BACKUP', '#5a2a1a', null);
  title.position.set(x + 8, y + 7);
  const body = new PixelText(text, '#2a1a3a', null);
  body.position.set(x + 8, y + 18);
  root.addChild(title, body);
  const close = () => destroyTree(root);
  const exp = new Button({
    w: w - 24,
    h: 16,
    label: 'EXPORT NOW',
    onTap: () => {
      close();
      openSettings(game);
    },
  });
  exp.position.set(x + 12, y + h - 40);
  const later = new Button({ w: w - 24, h: 14, label: 'LATER', color: 0x8a6a3a, shade: 0x5a4a2a, textColor: C.ink, onTap: close });
  later.position.set(x + 12, y + h - 20);
  root.addChild(exp, later);
  game.trackModal(root, { reopen: () => showExportNag(game) });
  game.modalLayer.addChild(root);
}

// 11x11 pixel icons.
function drawShare(g: Graphics, x: number, y: number): void {
  g.rect(x + 1, y + 4, 9, 7).fill(0x6aa8e8);
  g.rect(x + 2, y + 5, 7, 5).fill(0x1c1028);
  g.rect(x + 4, y + 4, 3, 1).fill(0x1c1028);
  g.rect(x + 5, y, 1, 7).fill(0x6aa8e8);
  g.rect(x + 4, y + 1, 3, 1).fill(0x6aa8e8);
  g.rect(x + 3, y + 2, 1, 1).fill(0x6aa8e8);
  g.rect(x + 7, y + 2, 1, 1).fill(0x6aa8e8);
}
function drawPlus(g: Graphics, x: number, y: number): void {
  g.rect(x + 1, y + 1, 9, 9).fill(0xf4e8c1);
  g.rect(x + 2, y + 2, 7, 7).fill(0x1c1028);
  g.rect(x + 5, y + 3, 1, 5).fill(0xf4e8c1);
  g.rect(x + 3, y + 5, 5, 1).fill(0xf4e8c1);
}
function drawCrown(g: Graphics, x: number, y: number): void {
  g.rect(x + 1, y + 7, 9, 3).fill(C.gold);
  g.rect(x + 1, y + 3, 1, 4).fill(C.gold);
  g.rect(x + 5, y + 2, 1, 5).fill(C.gold);
  g.rect(x + 9, y + 3, 1, 4).fill(C.gold);
  g.rect(x + 3, y + 5, 1, 2).fill(C.gold);
  g.rect(x + 7, y + 5, 1, 2).fill(C.gold);
  g.rect(x + 5, y + 8, 1, 1).fill(C.red);
}
