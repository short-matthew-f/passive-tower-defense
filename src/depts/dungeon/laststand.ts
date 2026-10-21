// The Dungeon's interactive Last Stand (00 §2.3): the Legend strolls down one last corridor over
// five trapdoors. Tap while he is over one to drop it: each drop is +5% Crush (max +25%). ~8 s.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText } from '../../ui/font';
import { C } from '../../ui/widgets';
import { GOLD, heroArt, OUTLINE, PAL } from './art';

const DOORS = 5;
const WALK_S = 7.5;
const WINDOW = 7; // px either side of a trapdoor centre

export function dungeonLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const root = ctx.root;
    const w = L.w;
    const left = L.safe.l + 8;
    const right = w - L.safe.r - 8;
    const midY = Math.round(L.safe.t + (L.h - L.safe.t - L.safe.b) / 2);
    const bg = new Graphics();
    const fx = new Graphics();
    const legend = new Graphics(heroArt('champ', 0));
    legend.scale.set(2);
    const title = new PixelText('THE LEGEND WALKS', C.goldText);
    const hint = new PixelText('TAP WHEN HE IS OVER A TRAPDOOR', C.ink);
    const score = new PixelText('CRUSH +0%', C.goldText);
    const box = new Container();
    box.addChild(bg, fx, legend, title, hint, score);
    root.addChild(box);
    title.position.set(Math.round(w / 2 - title.width / 2), midY - 48);
    hint.position.set(Math.round(w / 2 - hint.width / 2), midY - 38);
    score.position.set(Math.round(w / 2 - score.width / 2), midY + 30);

    const span = right - left;
    const doors = Array.from({ length: DOORS }, (_, i) => ({ x: Math.round(left + span * ((i + 1) / (DOORS + 1))), state: 0 as 0 | 1 | 2, t: 0 }));
    // Static corridor.
    bg.rect(0, 0, w, L.h).fill({ color: 0x0a0410, alpha: 0.92 });
    bg.rect(left - 4, midY - 12, span + 8, 24).fill(OUTLINE);
    for (let x = left; x < right; x += 16) {
      bg.rect(x, midY - 10, Math.min(16, right - x), 20).fill(PAL.path);
      if (right - x >= 16) bg.rect(x + 1, midY - 9, 6, 7).fill(PAL.pathLight).rect(x + 9, midY + 1, 6, 7).fill(PAL.pathLight);
    }
    bg.rect(left - 4, midY - 20, span + 8, 8).fill(PAL.wall).rect(left - 4, midY + 12, span + 8, 8).fill(PAL.wall);

    let t = 0;
    let x = left;
    let stun = 0;
    let hits = 0;
    let done = false;
    let exitT = 0;
    const finish = () => {
      if (done) return;
      done = true;
      box.eventMode = 'none';
      resolve(Math.min(0.25, hits * 0.05));
    };
    box.eventMode = 'static';
    box.hitArea = new Rectangle(0, 0, w, L.h);
    box.on('pointerdown', () => {
      if (done || exitT > 0) return;
      const d = doors.find((k) => k.state === 0 && Math.abs(k.x - x) <= WINDOW);
      const near = doors.find((k) => k.state === 0 && k.x > x - WINDOW);
      if (d) {
        d.state = 1;
        d.t = 0.5;
        hits++;
        stun = 0.45;
        ctx.haptic(25);
        score.set(`CRUSH +${hits * 5}%`);
        score.position.set(Math.round(w / 2 - score.width / 2), midY + 30);
      } else if (near) {
        near.state = 2; // swung too early: that trapdoor is spent
        near.t = 0.5;
        ctx.haptic(5);
      }
    });

    ctx.onTick((dt) => {
      if (done) return;
      t += dt;
      if (stun > 0) stun -= dt;
      else x += (span / WALK_S) * dt;
      // Doors he walked past without a tap are spent.
      for (const d of doors) {
        if (d.state === 0 && x > d.x + WINDOW) d.state = 2;
        if (d.t > 0) d.t -= dt;
      }
      legend.position.set(Math.round(x), midY + 6 + (stun > 0 ? 4 : 0));
      legend.context = heroArt('champ', Math.floor(t * 6) % 2, stun > 0.3);
      const g = fx.clear();
      for (const d of doors) {
        const open = d.state === 1 && d.t > 0;
        g.rect(d.x - 7, midY - 7, 14, 14).fill(OUTLINE);
        g.rect(d.x - 6, midY - 6, 12, 12).fill(open ? 0x000000 : d.state === 2 ? 0x3a2a1a : 0x6a4a2a);
        if (d.state === 0) g.rect(d.x - 6, midY - 1, 12, 1).fill(0x8a6a3a);
        if (d.state === 1) g.rect(d.x - 2, midY - 16, 4, 3).fill(GOLD);
      }
      if (x >= right) {
        exitT += dt;
        if (exitT > 0.6) finish();
      }
      if (t > WALK_S + 6) finish(); // safety
    });
  });
}
