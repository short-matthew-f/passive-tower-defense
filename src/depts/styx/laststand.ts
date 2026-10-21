// The Styx's interactive Last Stand (00 §2.3): Dame Brinella the Drainer swings her very large
// bucket over the river. Hold to reel your line onto it and keep the tension in the gold band
// while she yanks; a full bar hooks the bucket. ~8 s, resolves with a Crush bonus in [0, 0.25].
import { Graphics, Rectangle } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText } from '../../ui/font';
import { C, drawSprite } from '../../ui/widgets';
import { BUCKET, BUCKET_PAL, OVERLORD, OVERLORD_PAL } from './art';
import { sfx } from './sfx';

const DURATION = 8;
const ZONE_LO = 45;
const ZONE_HI = 75;
const FILL_S = 4.2; // seconds in the gold band for a full bar

export function styxLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const root = ctx.root;
    const vol = ctx.game.save.meta.settings.sfx ?? 0.6;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    const top = L.safe.t + 8;
    const bottom = L.h - L.safe.b - 8;
    const g = new Graphics();
    g.eventMode = 'none';
    const title = new PixelText('LAST STAND: HOOK THE BUCKET!', C.goldText);
    const hint = new PixelText('HOLD TO REEL. KEEP IT GOLD.', C.ink);
    const info = new PixelText('', C.inkDim);
    for (const t of [title, hint, info]) t.eventMode = 'none';
    root.addChild(g, title, hint, info);
    root.eventMode = 'static';
    root.hitArea = new Rectangle(0, 0, L.w, L.h);

    let holding = false;
    root.on('pointerdown', () => (holding = true));
    root.on('pointerup', () => (holding = false));
    root.on('pointerupoutside', () => (holding = false));

    let t = 0;
    let tension = 30;
    let progress = 0;
    let yankIn = 1.2;
    let tele = 0;
    let yank = 0;
    let slipFlash = 0;
    let done = false;
    let clickT = 0;

    const finish = () => {
      if (done) return;
      done = true;
      root.removeAllListeners();
      resolve(Math.max(0, Math.min(0.25, 0.25 * progress)));
    };

    const waterY = Math.round(top + (bottom - top) * 0.45);
    const gaugeY = bottom - 34;

    ctx.onTick((dt) => {
      if (done) return;
      t += dt;
      // Brinella's yanks: a red flash, then a hard pull.
      if (tele > 0) {
        tele -= dt;
        if (tele <= 0) {
          yank = 0.6;
          sfx.creak(vol);
          ctx.haptic(15);
        }
      } else if (yank > 0) yank -= dt;
      else {
        yankIn -= dt;
        if (yankIn <= 0) {
          yankIn = 0.9 + Math.random() * 0.8;
          tele = 0.35;
          sfx.warn(vol);
        }
      }
      const pull = yank > 0 ? (holding ? 120 : 30) : 0;
      tension += ((holding ? 48 : -70) + pull) * dt;
      tension = Math.max(0, Math.min(110, tension));
      if (tension >= 100) {
        progress = Math.max(0, progress - 0.15);
        tension = 50;
        slipFlash = 0.8;
        sfx.plip(vol);
      }
      slipFlash = Math.max(0, slipFlash - dt);
      const inZone = tension >= ZONE_LO && tension <= ZONE_HI;
      if (inZone && holding) {
        progress = Math.min(1, progress + dt / FILL_S);
        clickT -= dt;
        if (clickT <= 0) {
          clickT = 0.1;
          sfx.click(vol);
        }
      }

      // ---- draw ----
      g.clear();
      g.rect(0, 0, L.w, L.h).fill({ color: 0x0a0814, alpha: 0.96 });
      g.rect(0, waterY, L.w, bottom - waterY).fill(0x14203a);
      g.rect(0, waterY, L.w, 1).fill({ color: 0x9ab0d0, alpha: 0.6 });
      // the river drains: the waterline sinks as time runs out
      const drain = Math.round((t / DURATION) * 10);
      g.rect(0, waterY, L.w, drain).fill(0x0a0814);
      // the bucket swings
      const swing = Math.sin(t * 1.7) * (w * 0.22);
      const bx = Math.round(x0 + w / 2 + swing - 14);
      const by = Math.round(top + 26 + (1 - progress) * 4);
      g.rect(bx + 13, top + 10, 2, by - top - 10).fill(0x8a8a9a);
      drawSprite(g, BUCKET, tele > 0 && Math.floor(t * 20) % 2 ? { ...BUCKET_PAL, r: 0xe03030 } : BUCKET_PAL, bx, by, 2);
      // the Overlord's line from the bottom
      const ox = Math.round(x0 + w / 2 - 4);
      const oy = gaugeY - 30;
      drawSprite(g, OVERLORD, OVERLORD_PAL, ox, oy);
      const col = tension < ZONE_LO ? 0xf4f4f4 : tension <= ZONE_HI ? 0xe8c04a : 0xe03030;
      const tx = ox + 8;
      const ty = oy - 2;
      const hx = bx + 14;
      const hy = by + 22;
      const steps = Math.max(8, Math.ceil(Math.hypot(hx - tx, hy - ty)));
      const wob = tension > ZONE_HI ? 1.5 : 0;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const sag = (1 - tension / 110) * 14 * Math.sin(u * Math.PI);
        const px = Math.round(tx + (hx - tx) * u + Math.sin(t * 40 + u * 10) * wob);
        const py = Math.round(ty + (hy - ty) * u + sag);
        g.rect(px, py, 1, 1).fill(col);
      }
      // tension gauge with the gold band
      const gx = x0 + 10;
      const gw = w - 20;
      g.rect(gx - 1, gaugeY - 1, gw + 2, 8).fill(0x0a0410);
      g.rect(gx, gaugeY, gw, 6).fill(0x2a2030);
      g.rect(gx + Math.round((gw * ZONE_LO) / 100), gaugeY, Math.round((gw * (ZONE_HI - ZONE_LO)) / 100), 6).fill({ color: C.gold, alpha: 0.45 });
      g.rect(gx + Math.round((gw * Math.min(100, tension)) / 100) - 1, gaugeY - 2, 3, 10).fill(col);
      // progress bar
      g.rect(gx - 1, gaugeY + 13, gw + 2, 6).fill(0x0a0410);
      g.rect(gx, gaugeY + 14, Math.round(gw * progress), 4).fill(C.green);
      // time left
      g.rect(gx, gaugeY + 22, Math.round(gw * Math.max(0, 1 - t / DURATION)), 1).fill(0x9c8aa8);

      title.position.set(x0 + Math.floor((w - title.width) / 2), top);
      hint.set(slipFlash > 0 ? 'SLIPPED! EASE OFF ON THE RED' : tele > 0 ? 'SHE YANKS! LET GO!' : 'HOLD TO REEL. KEEP IT GOLD.', slipFlash > 0 || tele > 0 ? C.redText : C.ink);
      hint.position.set(x0 + Math.floor((w - hint.width) / 2), gaugeY - 12);
      info.set(`HOOKED ${Math.round(progress * 100)}%  CRUSH +${Math.round(progress * 25)}%`);
      info.position.set(x0 + Math.floor((w - info.width) / 2), gaugeY + 26);

      if (progress >= 1) {
        sfx.fanfare(vol);
        finish();
      } else if (t >= DURATION) finish();
    });
  });
}
