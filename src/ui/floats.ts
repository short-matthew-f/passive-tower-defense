// Floating "+12" style numbers that drift up and fade. PixelTexts are pooled (perf P-05): a float
// reuses a finished one (and its canvas) instead of allocating a new canvas and texture each time.
import { Container } from 'pixi.js';
import { PixelText } from './font';

interface Float {
  t: PixelText;
  life: number;
  vy: number;
}

const MAX_LIVE = 60;
const MAX_POOL = 16;

export class FloatLayer extends Container {
  private items: Float[] = [];
  private pool: PixelText[] = [];

  spawn(text: string, x: number, y: number, color = '#f4e8c1'): void {
    if (this.items.length > MAX_LIVE) this.release(this.items.shift()!.t);
    const t = this.pool.pop() ?? new PixelText();
    t.set(text, color);
    t.alpha = 1;
    t.visible = true;
    t.position.set(Math.round(x - t.width / 2), Math.round(y));
    this.addChild(t);
    this.items.push({ t, life: 0.9, vy: -18 });
  }

  private release(t: PixelText): void {
    if (t.destroyed) return;
    if (this.pool.length >= MAX_POOL) {
      t.destroy();
      return;
    }
    this.removeChild(t);
    this.pool.push(t);
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      f.t.y += f.vy * dt;
      f.t.alpha = Math.min(1, f.life * 2.5);
      if (f.life <= 0) {
        this.release(f.t);
        this.items.splice(i, 1);
      }
    }
    // Keep pixels on the grid.
    for (const f of this.items) f.t.y = Math.round(f.t.y * 4) / 4;
  }
}
