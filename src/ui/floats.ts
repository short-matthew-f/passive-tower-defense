// Floating "+12" style numbers that drift up and fade.
import { Container } from 'pixi.js';
import { PixelText } from './font';

interface Float {
  t: PixelText;
  life: number;
  vy: number;
}

export class FloatLayer extends Container {
  private items: Float[] = [];

  spawn(text: string, x: number, y: number, color = '#f4e8c1'): void {
    if (this.items.length > 60) {
      const old = this.items.shift()!;
      old.t.destroy();
    }
    const t = new PixelText(text, color);
    t.position.set(Math.round(x - t.width / 2), Math.round(y));
    this.addChild(t);
    this.items.push({ t, life: 0.9, vy: -18 });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      f.t.y += f.vy * dt;
      f.t.alpha = Math.min(1, f.life * 2.5);
      if (f.life <= 0) {
        f.t.destroy();
        this.items.splice(i, 1);
      }
    }
    // Keep pixels on the grid.
    for (const f of this.items) f.t.y = Math.round(f.t.y * 4) / 4;
  }
}
