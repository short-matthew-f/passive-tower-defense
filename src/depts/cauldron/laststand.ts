// The Cauldron's interactive Last Stand (00 §2.3): Dame Brightjaw wades through the peg board
// toward the pot, and the Overlord pelts her with Lead Hearts. Tap above her to drop one; each
// hit on the hero adds Crush. ~8 s, resolves 0-0.25. Reuses the real peg physics (sim.ts).
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText, wrap } from '../../ui/font';
import { drawSprite } from '../../ui/widgets';
import { BRIGHTJAW, BRIGHTJAW_PAL, ING_COLOR, PAL } from './art';
import { sfx } from './sfx';
import { Board, BOARD_W, COL_W } from './sim';

const ROWS = 7;
const PLAY_S = 8;
const CRUSH_PER_HIT = 0.025;
const DROP_CD = 0.2;
const MAX_LIVE = 24;
const HERO_HALF = 6;

export function cauldronLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const vol = ctx.game.save.meta.settings.sfx ?? 0.6;
    const root = new Container();
    ctx.root.addChild(root);
    const bg = new Graphics();
    const pegs = new Graphics();
    const dyn = new Graphics();
    const title = new PixelText('{skull}LAST STAND', '#e05050');
    const sub = new PixelText('', '#f4e8c1');
    const info = new PixelText('', '#fff2a0');
    const bonk = new PixelText('BONK!', '#fff2a0');
    bonk.visible = false;
    root.addChild(bg, pegs, dyn, title, sub, info, bonk);

    const w = L.w - L.safe.l - L.safe.r;
    const bx = L.safe.l + Math.floor((w - BOARD_W) / 2);
    const top = L.safe.t + 8;
    title.position.set(L.safe.l + Math.floor((w - title.width) / 2), top);
    sub.set(wrap('PELT HER WITH LEAD HEARTS! TAP ABOVE HER', w - 12));
    sub.position.set(L.safe.l + Math.floor((w - sub.width) / 2), top + 10);
    const y0 = top + 46; // board row 0
    const board = new Board({ rows: ROWS, malice: 0, gold: 0 }, (Math.random() * 1e9) | 0);
    const floorY = y0 + board.bucketY;

    bg.rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.94 });
    bg.rect(bx - 3, y0 - 22, BOARD_W + 6, board.bucketY + 40).fill(PAL.boardEdge);
    bg.rect(bx - 2, y0 - 21, BOARD_W + 4, board.bucketY + 38).fill(PAL.board);
    bg.rect(bx - 3, floorY + 14, BOARD_W + 6, 4).fill(PAL.copper);
    bg.rect(bx - 3, floorY + 14, BOARD_W + 6, 1).fill(PAL.copperHi);
    for (const p of board.pegs) {
      pegs.rect(bx + p.x - 1, y0 + p.y - 1, 3, 3).fill(PAL.iron);
      pegs.rect(bx + p.x - 1, y0 + p.y - 1, 1, 1).fill(PAL.ironHi);
    }

    let t = 0;
    let cd = 0;
    let hits = 0;
    let heroX = BOARD_W / 2;
    let heroDir = 1;
    let heroFlash = 0;
    let bonkT = 0;
    let ended = false;
    let endT = 0;

    root.eventMode = 'static';
    root.hitArea = new Rectangle(0, 0, L.w, L.h);
    root.on('pointerdown', (e: FederatedPointerEvent) => {
      if (t >= PLAY_S || cd > 0 || board.balls.length >= MAX_LIVE) return;
      const p = e.getLocalPosition(root);
      const x = Math.max(3, Math.min(BOARD_W - 3, p.x - bx));
      const b = board.drop('leadheart', x, true);
      b.y = -14;
      cd = DROP_CD;
      sfx.toss(vol);
      ctx.haptic(5);
    });

    const ev = {
      land: (b: { x: number }) => {
        if (Math.abs(b.x - heroX) <= HERO_HALF + 2) {
          hits++;
          heroFlash = 0.25;
          bonkT = 0.5;
          bonk.position.set(Math.round(bx + heroX) - 10, floorY - 24);
          sfx.bonk(vol);
          ctx.haptic(15);
        }
      },
    };

    ctx.onTick((dt) => {
      if (ended) return;
      t += dt;
      cd = Math.max(0, cd - dt);
      heroFlash = Math.max(0, heroFlash - dt);
      bonkT = Math.max(0, bonkT - dt);
      bonk.visible = bonkT > 0;
      // The hero strides back and forth, faster as she gets angrier.
      if (t < PLAY_S) {
        heroX += heroDir * (24 + hits * 3) * dt;
        if (heroX < 10 || heroX > BOARD_W - 10 || Math.random() < dt * 0.4) heroDir = heroX < 10 ? 1 : heroX > BOARD_W - 10 ? -1 : -heroDir;
      }
      let steps = Math.min(24, Math.round(dt * 120));
      while (steps-- > 0) board.step(ev);

      const crush = Math.min(0.25, hits * CRUSH_PER_HIT);
      if (t < PLAY_S) info.set(`HITS ${hits}  CRUSH +${Math.round(crush * 100)}%`);
      else info.set(`CRUSH +${Math.round(crush * 100)}%!`);
      info.position.set(L.safe.l + Math.floor((w - info.width) / 2), floorY + 24);

      const g = dyn.clear();
      // Timer bar.
      const frac = Math.max(0, 1 - t / PLAY_S);
      g.rect(bx, y0 - 30, BOARD_W, 4).fill(PAL.ink);
      g.rect(bx + 1, y0 - 29, Math.round((BOARD_W - 2) * frac), 2).fill(frac < 0.25 ? PAL.bumper : PAL.bile);
      // Drop column guides.
      for (let k = 1; k < 9; k++) g.rect(bx + k * COL_W, y0 - 20, 1, 2).fill(PAL.boardEdge);
      // Hero.
      const hx = Math.round(bx + heroX) - 3;
      const hy = floorY - 1;
      if (heroFlash > 0) g.rect(hx - 1, hy - 1, 9, 16).fill(0xffffff);
      drawSprite(g, BRIGHTJAW, BRIGHTJAW_PAL, hx, hy);
      // A sword that wobbles as she walks.
      const sw = Math.floor(t * 6) % 2;
      g.rect(hx + 7, hy + 2 + sw, 1, 7).fill(0xd8d8e8);
      g.rect(hx + 6, hy + 8 + sw, 3, 1).fill(0xe8c04a);
      // Lead Hearts.
      for (const b of board.balls) {
        const x = Math.round(bx + b.x);
        const y = Math.round(y0 + b.y);
        g.rect(x - 2, y - 2, 5, 5).fill(PAL.ink);
        g.rect(x - 1, y - 1, 3, 3).fill(parseInt(ING_COLOR.leadheart.slice(1), 16));
      }

      if (t >= PLAY_S && (board.balls.length === 0 || t > PLAY_S + 3)) {
        endT += dt;
        if (endT > 1.2) {
          ended = true;
          resolve(crush);
        }
      }
    });
  });
}
