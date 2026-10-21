// The Mines' interactive Last Stand (00 §2.3): Sir Augustin Drillwright's steam drill bores down
// the shaft and the Overlord smashes it apart. Glowing rivets pop up on the drill; each one the
// gauntlet cracks before it cools is a hit. ~7 s; Crush = hits / HITS_FOR_MAX x 0.25.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText, measure } from '../../ui/font';
import { gauntletArt, OUTLINE } from './art';

const DURATION = 7;
const HITS_FOR_MAX = 8;
const RIVET_LIFE = 0.9;
const MAX_RIVETS = 3;

interface Rivet {
  x: number; // offset from the drill centre
  y: number;
  life: number;
}

export function minesLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const root = ctx.root;
    const bg = new Graphics();
    const drillG = new Graphics();
    const fx = new Graphics();
    const fist = new Graphics(gauntletArt(true));
    fist.visible = false;
    const title = new PixelText('SMASH THE DRILL!', '#ffe060');
    const count = new PixelText('');
    const hint = new PixelText('TAP THE GLOWING RIVETS', '#ff9a30');
    const hitLayer = new Container();
    root.addChild(bg, drillG, fx, fist, title, hint, count, hitLayer);

    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    const top = L.safe.t + 30;
    const h = L.h - L.safe.b - top - 20;
    const cx = x0 + Math.floor(w / 2);
    title.position.set(cx - Math.floor(measure('SMASH THE DRILL!').w / 2), L.safe.t + 12);
    hint.position.set(cx - Math.floor(measure('TAP THE GLOWING RIVETS').w / 2), L.safe.t + 21);

    // Shaft backdrop (drawn once).
    bg.rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.92 });
    bg.rect(cx - 50, top, 100, h).fill(0x22222a);
    for (let i = 0; i < 40; i++) {
      const y = top + ((i * 37) % h);
      bg.rect(cx - 50 + ((i * 53) % 96), y, 3 + (i % 5), 1).fill(0x16161c);
    }
    bg.rect(cx - 52, top, 2, h).fill(0x6a4428).rect(cx + 50, top, 2, h).fill(0x6a4428);

    let t = 0;
    let hits = 0;
    let drillY = top - 40; // the drill tip's y
    let spawn = 0.4;
    let shake = 0;
    let fistT = 0;
    let done = false;
    const rivets: Rivet[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;

    hitLayer.eventMode = 'static';
    hitLayer.hitArea = new Rectangle(0, 0, L.w, L.h);
    hitLayer.on('pointerdown', (e: FederatedPointerEvent) => {
      if (done) return;
      const p = root.toLocal(e.global);
      fist.position.set(Math.round(p.x), Math.round(p.y - 6));
      fist.visible = true;
      fistT = 0.12;
      const sx = Math.round(shake ? (rnd() - 0.5) * 2 : 0);
      for (let i = rivets.length - 1; i >= 0; i--) {
        const r = rivets[i];
        const rx = cx + r.x + sx;
        const ry = drillY - 40 + r.y;
        // Touch target: 16 px around a 6 px rivet.
        if (Math.abs(p.x - rx) <= 8 && Math.abs(p.y - ry) <= 8) {
          rivets.splice(i, 1);
          hits++;
          shake = 0.15;
          drillY -= 4; // the drill recoils
          ctx.haptic(25);
          fx.rect(rx - 6, ry - 6, 12, 12).fill({ color: 0xffe060, alpha: 0.9 });
          return;
        }
      }
      ctx.haptic(5);
    });

    const finish = () => {
      if (done) return;
      done = true;
      hint.set('');
      const crush = Math.min(1, hits / HITS_FOR_MAX) * 0.25;
      title.set(hits >= HITS_FOR_MAX ? 'DRILL WRECKED!' : `${hits} RIVETS CRACKED`, '#ffe060');
      title.position.set(cx - Math.floor(measure(title.text).w / 2), L.safe.t + 12);
      setTimeout(() => resolve(crush), 700);
    };

    ctx.onTick((dt) => {
      if (done) return;
      t += dt;
      if (t >= DURATION || hits >= HITS_FOR_MAX + 4) {
        finish();
        return;
      }
      // The drill bores down steadily.
      drillY = Math.min(top + h - 10, drillY + dt * (h / DURATION) * 0.9);
      spawn -= dt;
      if (spawn <= 0 && rivets.length < MAX_RIVETS) {
        spawn = 0.35 + rnd() * 0.3;
        rivets.push({ x: Math.round((rnd() - 0.5) * 28), y: Math.round(rnd() * 40 - 30), life: RIVET_LIFE });
      }
      for (let i = rivets.length - 1; i >= 0; i--) if ((rivets[i].life -= dt) <= 0) rivets.splice(i, 1);
      if (shake > 0) shake -= dt;
      if (fistT > 0 && (fistT -= dt) <= 0) fist.visible = false;

      // Draw the drill: a brass housing with a spiral bit, steam puffs and the rivets.
      const sx = Math.round(shake > 0 ? (rnd() - 0.5) * 3 : 0);
      const g = drillG.clear();
      const by = Math.round(drillY);
      g.rect(cx - 20 + sx, top - 60, 40, by - 40 - (top - 60)).fill(OUTLINE);
      g.rect(cx - 19 + sx, top - 60, 38, by - 41 - (top - 60)).fill(0x8a6a3a);
      g.rect(cx - 19 + sx, top - 60, 4, by - 41 - (top - 60)).fill(0xb08a50);
      g.rect(cx - 22 + sx, by - 44, 44, 6).fill(OUTLINE).rect(cx - 21 + sx, by - 43, 42, 4).fill(0x5a5460);
      // the spinning bit
      const spin = Math.floor(t * 20) % 4;
      for (let k = 0; k < 36; k++) {
        const half = Math.max(1, Math.round(16 * (1 - k / 36)));
        g.rect(cx - half + sx, by - 38 + k, half * 2, 1).fill((k + spin) % 4 < 2 ? 0xa8a8b2 : 0x5e5e6a);
      }
      // steam
      for (let k = 0; k < 3; k++) {
        const py = top - 10 - ((t * 30 + k * 20) % 50);
        g.rect(cx + 22 + sx + k * 3, py, 4, 3).fill({ color: 0xf4f0e0, alpha: 0.35 });
      }
      for (const r of rivets) {
        const on = r.life > 0.25 || Math.floor(t * 16) % 2 === 0;
        const rx = cx + r.x + sx;
        const ry = by - 40 + r.y;
        g.rect(rx - 3, ry - 3, 6, 6).fill(OUTLINE);
        if (on) g.rect(rx - 2, ry - 2, 4, 4).fill(0xff7a2a).rect(rx - 1, ry - 1, 2, 2).fill(0xffe060);
      }
      fx.alpha = Math.max(0, fx.alpha - dt * 6);
      if (fx.alpha <= 0) {
        fx.clear();
        fx.alpha = 1;
      }
      count.set(`CRUSH ${Math.round(Math.min(1, hits / HITS_FOR_MAX) * 25)}%  ${Math.max(0, DURATION - t).toFixed(1)}S`, '#f4e8c1');
      count.position.set(cx - Math.floor(measure(count.text).w / 2), L.h - L.safe.b - 14);
    });
  });
}
