// The Bridge's interactive Last Stand (00 §2.3, v0.7+): the Legend strolls across the bridge and
// three toll gates stand in his way. Tap to drop the next gate's arm as he passes under it; each
// bonk adds a third of the Crush (0-25%). About 7 s, one Graphics redrawn per frame, bounded.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { LastStandCtx } from '../../core/dept';
import { PixelText, wrap } from '../../ui/font';
import { drawTraveler, OUTLINE, TRAV_H, TRAV_W, WOOD, WOOD_D, WOOD_L } from './art';
import type { Look } from './model';

const WALK_S = 6.5;
const GATES = 3;
const ZONE = 9; // px either side of a gate that counts as "under it"
const LEGEND: Look = { hat: 'helm', body: 'armor', feet: 'steel', hand: 'sword', belt: 'none', pack: 'shield', aura: 'glow', cloak: 1, hair: 2, skin: 0, mark: 3 };

export function bridgeLastStand(ctx: LastStandCtx): Promise<number> {
  return new Promise<number>((resolve) => {
    const L = ctx.layout;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    const top = L.safe.t;
    const h = L.h - L.safe.t - L.safe.b;
    const deckY = top + Math.floor(h * 0.62);
    const px = h >= 360 && w >= 180 ? 2 : 1;

    const root = ctx.root;
    const bg = new Graphics();
    const g = new Graphics();
    const hero = new Graphics();
    const title = new PixelText(wrap('TOLL THE LEGEND! TAP AS HE WALKS UNDER A GATE', w - 16), '#f4e8c1', null);
    const result = new PixelText('', '#e8c04a');
    root.addChild(bg, hero, g, title, result);
    title.position.set(x0 + 8, top + 26);

    // Backdrop: night sky, river, the bridge deck.
    bg.rect(0, 0, L.w, L.h).fill(0x140c1c);
    bg.rect(0, top, L.w, deckY - top).fill(0x2a1a4a);
    bg.rect(0, deckY + 6, L.w, L.h - deckY - 6).fill(0x1e3a5a);
    for (let x = 0; x < L.w; x += 9) bg.rect(x, deckY + 14 + ((x / 9) % 3) * 6, 5, 1).fill(0x3a6a8a);
    bg.rect(0, deckY, L.w, 6).fill(WOOD_D);
    bg.rect(0, deckY, L.w, 1).fill(WOOD_L);
    for (let x = 2; x < L.w; x += 6) bg.rect(x, deckY + 1, 1, 5).fill(0x3a2010);
    bg.rect(0, deckY - 12, L.w, 2).fill(WOOD);

    const gx = Array.from({ length: GATES }, (_, i) => x0 + Math.round(w * (0.3 + 0.25 * i)));
    const dropped: (null | 'hit' | 'miss')[] = Array(GATES).fill(null);
    const dropT: number[] = Array(GATES).fill(0);
    let t = 0;
    let stumble = 0;
    let hits = 0;
    let ending = -1;
    let settled = false;
    const heroW = TRAV_W * px;
    const heroH = TRAV_H * px;
    const startX = x0 - heroW;
    const endX = x0 + w + 4;
    let hx = startX;
    drawTraveler(hero, LEGEND, 0, 0, { px, face: 'calm' });

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Math.max(0, Math.min(0.25, (0.25 * hits) / GATES)));
    };

    const hit = new Container();
    hit.eventMode = 'static';
    hit.hitArea = new Rectangle(0, 0, L.w, L.h);
    root.addChild(hit);
    hit.on('pointerdown', () => {
      if (ending >= 0) return;
      const i = dropped.findIndex((d) => d === null);
      if (i < 0) return;
      const cx = hx + heroW / 2;
      const ok = Math.abs(cx - gx[i]) <= ZONE * px;
      dropped[i] = ok ? 'hit' : 'miss';
      dropT[i] = t;
      if (ok) {
        hits++;
        stumble = 0.45;
        ctx.haptic(40);
      } else ctx.haptic(8);
    });

    ctx.onTick((dt) => {
      if (settled) return;
      t += dt;
      if (stumble > 0) stumble -= dt;
      else hx += ((endX - startX) / WALK_S) * dt;
      // Gates he has passed without a drop count as misses.
      for (let i = 0; i < GATES; i++) if (dropped[i] === null && hx + heroW / 2 > gx[i] + ZONE * px) dropped[i] = 'miss';
      const bob = stumble > 0 ? 0 : Math.floor(t * 8) % 2;
      hero.position.set(Math.round(hx), deckY - heroH - bob * px);

      const d = g.clear();
      for (let i = 0; i < GATES; i++) {
        const x = gx[i];
        const ph = Math.round(heroH * 0.75) + 3; // the arm pivots at the post top
        d.rect(x + 6, deckY - ph, 3, ph).fill(WOOD_D);
        d.rect(x + 5, deckY - ph - 2, 5, 3).fill(0x5a3a22);
        const down = dropped[i] !== null && t - dropT[i] > 0.06;
        const armY = deckY - Math.round(heroH * 0.75);
        if (down) for (let k = 0; k < 24; k += 4) d.rect(x + 6 - 24 + k, armY, 4, 3).fill(k % 8 === 0 ? 0xc03a3a : 0xf4e8c1);
        else for (let k = 0; k < 24; k += 4) d.rect(x + 6, armY - 24 + k, 3, 4).fill(k % 8 === 0 ? 0xc03a3a : 0xf4e8c1);
        // the zone glow while the gate still waits
        if (dropped[i] === null) d.rect(x - ZONE * px + 6, deckY - 2, ZONE * px * 2, 2).fill({ color: 0xfff08a, alpha: 0.35 + 0.25 * Math.sin(t * 10) });
        if (dropped[i] === 'hit' && t - dropT[i] < 0.9) {
          for (let k = 0; k < 3; k++) {
            const a = t * 6 + (k * Math.PI * 2) / 3;
            d.rect(Math.round(x + 6 + Math.cos(a) * 8), Math.round(armY - 8 + Math.sin(a) * 3), 2, 2).fill(0xfff08a);
          }
        }
      }
      // Bonk tally.
      for (let i = 0; i < GATES; i++) {
        const bx = x0 + w - 8 - (GATES - i) * 11;
        d.rect(bx, top + 8, 9, 9).fill(OUTLINE);
        d.rect(bx + 1, top + 9, 7, 7).fill(dropped[i] === 'hit' ? 0xe8c04a : dropped[i] === 'miss' ? 0x5a3a4a : 0x2a1a3a);
      }

      if (ending < 0 && (hx >= endX || dropped.every((x) => x !== null))) {
        ending = t;
        result.set(`${hits}/${GATES} BONKS! CRUSH +${Math.round((25 * hits) / GATES)}%`);
        result.position.set(x0 + Math.floor((w - result.width) / 2), deckY + 30);
      }
      if (ending >= 0 && t - ending > 1.4) finish();
    });
  });
}
