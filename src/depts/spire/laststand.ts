// The Spire's Last Stand (04 §7 "the Legend dives into the flask as an unmergeable heavy body",
// 00 §2.3): a ~10 s mini-flask. Brother Quell plunges in and shoves about; the Overlord drags and
// releases orbs to bury him. Each orb that lands on him and each merge add Crush; 12 Crush is the
// full +25%. Runs on the Spire's own circle physics; every object is created once and pooled.
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText } from '../../ui/font';
import { canMerge, LEGEND_BODY, orbR } from './def';
import { orbColor, orbLight, orbTexture, PAL } from './art';
import { Flask, STEP } from './physics';
import { sfx } from './sfx';

const FW = 96;
const FH = 150;
const PLAY_S = 9;
const CRUSH_FULL = 12;
const MAX_BODIES = 22;
const COOLDOWN = 0.3;

export function spireLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const root = ctx.root;
    const vol = () => ctx.game.save.meta.settings.sfx ?? 0.6;
    const cw = L.w - L.safe.l - L.safe.r;
    const cx = L.safe.l + Math.floor(cw / 2);
    const top = L.safe.t + 40;
    const mouthY = Math.min(L.h - L.safe.b - FH - 26, top + 58); // room above for the dropper orb (r <= 18)
    const left = cx - FW / 2;

    const bg = new Graphics();
    const dyn = new Graphics();
    const orbLayer = new Container();
    const title = new PixelText('BROTHER QUELL DIVES IN!', '#e05050');
    const hint = new PixelText('DRAG + RELEASE: BURY HIM!', '#f4e8c1');
    const score = new PixelText('', '#e8c04a');
    root.addChild(bg, dyn, orbLayer, title, hint, score);
    const pool: Sprite[] = [];
    for (let i = 0; i < MAX_BODIES + 1; i++) {
      const s = new Sprite(orbTexture(1));
      s.visible = false;
      s.roundPixels = true;
      pool.push(s);
      orbLayer.addChild(s);
    }
    title.position.set(cx - Math.floor(title.width / 2), top);
    hint.position.set(cx - Math.floor(hint.width / 2), top + 9);

    // Static: dim the world, draw the flask.
    bg.rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.94 });
    bg.rect(left, mouthY, FW, FH).fill(PAL.glassIn);
    bg.rect(left - 2, mouthY - 2, 2, FH + 4).fill(PAL.glass);
    bg.rect(left + FW, mouthY - 2, 2, FH + 4).fill(PAL.glass);
    bg.rect(left - 2, mouthY + FH, FW + 4, 2).fill(PAL.glass);
    bg.rect(left - 6, mouthY + FH + 2, FW + 12, 5).fill(PAL.brassLo);
    bg.rect(left - 6, mouthY + FH + 2, FW + 12, 1).fill(PAL.brass);

    const flask = new Flask(FW, FH, orbR, MAX_BODIES);
    flask.top = -60;
    flask.mergeable = canMerge;
    flask.mass = (o) => (o.tier === LEGEND_BODY ? 30 * 30 : o.r * o.r);
    let crush = 0;
    const hitIds = new Set<number>();
    const pops: { x: number; y: number; t: number; c: number }[] = [];
    flask.onMerge = (e) => {
      crush += 1;
      if (legend.alive && Math.hypot(e.x - legend.x, e.y - legend.y) < 40) crush += 1;
      sfx.bloop(vol(), e.into ? e.into.tier : 11, Math.min(8, Math.floor(crush)));
      ctx.haptic(10);
      if (pops.length < 12) pops.push({ x: e.x, y: e.y, t: 0.35, c: e.into ? orbLight(e.into.tier) : 0xffffff });
    };
    // A few orbs already in the flask, and the hero diving in from above.
    for (let i = 0; i < 6; i++) flask.add(3 + (i % 3), -FW / 2 + 10 + i * 15, FH - 10 - (i % 2) * 12);
    const legend = flask.add(LEGEND_BODY, 0, -40, 0, 260)!;
    legend.landed = true;

    const bag = [5, 5, 6, 6, 4, 4, 7, 7, 5, 5, 6, 6, 8, 8, 4, 4, 7, 7];
    let bagI = 0;
    let aimX = 0;
    let cool = 0.8;
    let t = 0;
    let acc = 0;
    let struggle = 1.2;
    let done = false;
    let outro = -1;

    root.eventMode = 'static';
    root.hitArea = new Rectangle(0, 0, L.w, L.h);
    const clampAim = (x: number) => {
      const r = orbR(bag[bagI % bag.length]);
      return Math.max(-FW / 2 + r, Math.min(FW / 2 - r, x));
    };
    let down = false;
    root.on('pointerdown', (e: FederatedPointerEvent) => {
      down = true;
      aimX = clampAim(e.getLocalPosition(root).x - cx);
    });
    root.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (down) aimX = clampAim(e.getLocalPosition(root).x - cx);
    });
    const release = (e: FederatedPointerEvent) => {
      if (!down) return;
      down = false;
      aimX = clampAim(e.getLocalPosition(root).x - cx);
      if (cool > 0 || outro >= 0 || flask.count >= MAX_BODIES) return;
      const tier = bag[bagI++ % bag.length];
      const o = flask.add(tier, aimX, -orbR(tier) - 4, 0, 60);
      if (o) {
        cool = COOLDOWN;
        sfx.drop(vol());
      }
    };
    root.on('pointerup', release);
    root.on('pointerupoutside', release);

    const finish = () => {
      if (done) return;
      done = true;
      resolve(Math.min(0.25, (crush / CRUSH_FULL) * 0.25));
    };

    ctx.onTick((dt) => {
      if (done) return;
      t += dt;
      cool = Math.max(0, cool - dt);
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        acc -= STEP;
        steps++;
        flask.step();
        // Crush: each orb that comes to rest on the hero (from above) counts once.
        for (const o of flask.orbs) {
          if (o === legend || hitIds.has(o.id) || o.y >= legend.y) continue;
          if (Math.hypot(o.x - legend.x, o.y - legend.y) < o.r + legend.r + 0.8) {
            hitIds.add(o.id);
            crush += 1;
            ctx.haptic(8);
            if (pops.length < 12) pops.push({ x: o.x, y: o.y + o.r, t: 0.35, c: 0xe8c04a });
          }
        }
      }
      if (acc > STEP) acc = 0;
      // He struggles: a sideways shove every ~1.3 s while there's play time left.
      struggle -= dt;
      if (struggle <= 0 && outro < 0) {
        struggle = 1.1 + Math.random() * 0.5;
        legend.vx += (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 60);
        legend.vy -= 70;
      }
      if (outro < 0 && (t >= PLAY_S || crush >= CRUSH_FULL)) {
        outro = 0;
        title.set(crush >= CRUSH_FULL ? 'HE IS BURIED! CRUSHED!' : 'HE GIVES UP. CRUSHED!', '#e8c04a');
        title.position.set(cx - Math.floor(title.width / 2), top);
        hint.visible = false;
        sfx.chord(vol());
        ctx.haptic(30);
      }
      if (outro >= 0) {
        outro += dt;
        if (outro >= 1.2) finish();
      }

      // Draw.
      let i = 0;
      for (const o of flask.orbs) {
        const s = pool[i++];
        if (!s) break;
        const tex = orbTexture(o.tier);
        if (s.texture !== tex) s.texture = tex;
        s.scale.set(o.r / o.rt);
        s.position.set(Math.round(cx + o.x - o.r), Math.round(mouthY + o.y - o.r));
        s.visible = mouthY + o.y + o.r > top + 16;
      }
      for (; i < pool.length; i++) pool[i].visible = false;
      const g = dyn.clear();
      const pct = Math.round(Math.min(1, crush / CRUSH_FULL) * 25);
      score.set(`CRUSH +${pct}%   ${Math.max(0, Math.ceil(PLAY_S - t))}S`);
      score.position.set(cx - Math.floor(score.width / 2), mouthY + FH + 10);
      // Crush bar.
      const bw = FW;
      g.rect(left, mouthY + FH + 18, bw, 4).fill(0x2a1a2a);
      g.rect(left, mouthY + FH + 18, Math.round(bw * Math.min(1, crush / CRUSH_FULL)), 4).fill(0xe8c04a);
      // The next orb in the dropper, and a dotted guide.
      if (outro < 0) {
        const nt = bag[bagI % bag.length];
        const r = orbR(nt);
        const ax = Math.round(cx + aimX);
        g.circle(ax, mouthY - r - 4, r).fill({ color: orbColor(nt), alpha: cool > 0 ? 0.4 : 1 });
        if (down) for (let y = mouthY + 2; y < mouthY + FH - 4; y += 5) g.rect(ax, y, 1, 2).fill({ color: 0xffffff, alpha: 0.3 });
      }
      for (let k = pops.length - 1; k >= 0; k--) {
        const p = pops[k];
        p.t -= dt;
        if (p.t <= 0) {
          pops.splice(k, 1);
          continue;
        }
        const rr = Math.round(4 + (0.35 - p.t) * 30);
        g.circle(Math.round(cx + p.x), Math.round(mouthY + p.y), rr).stroke({ color: p.c, width: 1, alpha: p.t * 2.5 });
      }
    });
  });
}
