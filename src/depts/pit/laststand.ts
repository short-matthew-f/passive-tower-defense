// The War Pit's interactive Last Stand (00 §2.3): "Release the hounds!" The Legend has beaten
// every beast barehanded and stands in the ring; five cages rattle along the bottom and light up
// in turn. Tap a lit cage to loose its beast at him. Each hound that lands adds to the Crush
// (0-0.25). Missed taps cost nothing (gentle failure). ~7 s, then it resolves.
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText, measure } from '../../ui/font';
import { beastTex } from './art';
import { sfx } from './sfx';
import type { UnitId } from './units';

const DURATION = 7;
const NEED = 9; // hounds for the full +25%
const HOUNDS: UnitId[] = ['wolf', 'boar', 'sabre', 'ember', 'manticore', 'ogre', 'wyvern', 'gargoyle'];

interface Flyer {
  s: Sprite;
  x: number;
  y: number;
  t: number;
}

export function pitLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const vol = ctx.game.save.meta.settings.sfx;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    const top = L.safe.t;
    const h = L.h - L.safe.t - L.safe.b;
    const root = new Container();
    ctx.root.addChild(root);
    const bg = new Graphics();
    bg.rect(0, 0, L.w, L.h).fill(0x1a0e10);
    bg.rect(0, top + Math.floor(h * 0.2), L.w, Math.floor(h * 0.45)).fill(0x6a4a2a);
    for (let i = 0; i < 50; i++) bg.rect(x0 + ((i * 37) % w), top + Math.floor(h * 0.2) + ((i * 23) % Math.floor(h * 0.45)), 2, 1).fill(i % 2 ? 0x8a6438 : 0x4a3018);
    root.addChild(bg);
    const title = new PixelText('RELEASE THE HOUNDS!', '#e8c04a');
    title.position.set(x0 + Math.floor((w - measure('RELEASE THE HOUNDS!').w) / 2), top + 6);
    const sub = new PixelText('TAP THE LIT CAGES', '#f4e8c1');
    sub.position.set(x0 + Math.floor((w - measure('TAP THE LIT CAGES').w) / 2), top + 15);
    root.addChild(title, sub);
    // The Legend: the Huntmaster's sprite as a barehanded brute, scaled up, with a health bar.
    const legend = new Sprite(beastTex('hunt'));
    legend.scale.set(4);
    const lx = x0 + Math.floor(w / 2) - 24;
    const ly = top + Math.floor(h * 0.25);
    legend.position.set(lx, ly);
    root.addChild(legend);
    const bar = new Graphics();
    root.addChild(bar);
    const fx = new Graphics();
    root.addChild(fx);
    const timer = new PixelText('', '#f4e8c1');
    root.addChild(timer);
    // Five cages along the bottom, each >= 28 px wide.
    const cw = Math.max(28, Math.min(34, Math.floor((w - 12) / 5) - 2));
    const gap = Math.floor((w - 5 * cw) / 6);
    const cy = top + h - 64;
    const cages: { g: Graphics; c: Container; lit: number; k: UnitId; spr: Sprite }[] = [];
    let hits = 0;
    let t = 0;
    let next = 0.4;
    let done = false;
    let shake = 0;
    const flyers: Flyer[] = [];
    const drawCage = (i: number) => {
      const cg = cages[i];
      const g = cg.g.clear();
      const lit = cg.lit > 0;
      g.rect(0, 0, cw, 40).fill({ color: lit ? 0xe8c04a : 0x000000, alpha: lit ? 0.25 : 0.35 });
      for (let x = 3; x < cw - 1; x += 5) g.rect(x, 0, 2, 40).fill(lit ? 0xe8c04a : 0x5a5060);
      g.rect(0, 0, cw, 2).fill(0x8a8090);
      g.rect(0, 38, cw, 2).fill(0x8a8090);
    };
    for (let i = 0; i < 5; i++) {
      const c = new Container();
      const g = new Graphics();
      const back = new Graphics().rect(0, 0, cw, 40).fill(0x24181c);
      const beast = new Sprite(beastTex(HOUNDS[i]));
      beast.scale.set(2);
      beast.position.set(Math.floor(cw / 2) - 12, 12);
      c.addChild(back, beast, g);
      c.position.set(x0 + gap + i * (cw + gap), cy);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.hitArea = new Rectangle(-2, -4, cw + 4, 48);
      const cg = { g, c, lit: 0, k: HOUNDS[i], spr: beast };
      c.on('pointerdown', () => {
        if (done) return;
        if (cg.lit > 0) {
          cg.lit = 0;
          drawCage(i);
          const s = new Sprite(beastTex(cg.k));
          s.scale.set(2);
          root.addChild(s);
          flyers.push({ s, x: c.x + cw / 2 - 12, y: cy, t: 0 });
          sfx.trig(vol);
          ctx.haptic(8);
          cg.k = HOUNDS[(HOUNDS.indexOf(cg.k) + 3 + i) % HOUNDS.length];
          cg.spr.texture = beastTex(cg.k);
        } else sfx.deny(vol * 0.5);
      });
      cages.push(cg);
      root.addChild(c);
      drawCage(i);
    }
    const finish = () => {
      if (done) return;
      done = true;
      sfx.whistle(vol);
      resolve(0.25 * Math.min(1, hits / NEED));
    };
    ctx.onTick((dt) => {
      if (done) return;
      t += dt;
      // Light cages faster as time runs on; each stays lit ~0.9 s.
      next -= dt;
      if (next <= 0) {
        const idle = cages.map((c, i) => (c.lit > 0 ? -1 : i)).filter((i) => i >= 0);
        if (idle.length) {
          const i = idle[Math.floor(Math.random() * idle.length)];
          cages[i].lit = 0.95;
          drawCage(i);
          sfx.tap(vol * 0.6);
        }
        next = Math.max(0.28, 0.6 - t * 0.04);
      }
      for (let i = 0; i < 5; i++) {
        const cg = cages[i];
        if (cg.lit > 0) {
          cg.lit -= dt;
          if (cg.lit <= 0) drawCage(i);
        }
      }
      // Hounds fly at the Legend; each that lands is a hit.
      for (let j = flyers.length - 1; j >= 0; j--) {
        const f = flyers[j];
        f.t += dt * 3.2;
        const k = Math.min(1, f.t);
        f.s.position.set(Math.round(f.x + (lx + 12 - f.x) * k), Math.round(f.y + (ly + 16 - f.y) * k - Math.sin(k * Math.PI) * 30));
        if (k >= 1) {
          hits++;
          shake = 0.15;
          sfx.hit(vol, hits % 3 === 0);
          f.s.destroy();
          flyers.splice(j, 1);
        }
      }
      shake = Math.max(0, shake - dt);
      legend.x = lx + (shake > 0 ? Math.round(Math.sin(t * 80) * 2) : 0);
      legend.tint = shake > 0 ? 0xff8080 : 0xffffff;
      const frac = Math.min(1, hits / NEED);
      const bw = Math.min(140, w - 20);
      const bx = x0 + Math.floor((w - bw) / 2);
      const by = ly - 10;
      const g = bar.clear();
      g.rect(bx - 1, by - 1, bw + 2, 6).fill(0x0a0410);
      g.rect(bx, by, bw, 4).fill(0x3a1a1a);
      g.rect(bx, by, Math.round(bw * (1 - frac)), 4).fill(0xe05050);
      const left = Math.max(0, DURATION - t);
      const ts = `CRUSH +${Math.round(25 * frac)}%   ${left.toFixed(1)}S`;
      timer.set(ts);
      timer.position.set(x0 + Math.floor((w - measure(ts).w) / 2), cy - 14);
      fx.clear();
      if (t >= DURATION && !flyers.length) finish();
    });
  });
}
