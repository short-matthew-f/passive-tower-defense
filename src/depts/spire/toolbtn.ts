// A small gutter button for the Spire's active tools (Vent Now, Tremor, Quicksilver): a 7x7 pixel
// icon, an optional label when the gutter is wide enough, and a cooldown bar. Redraws only when
// its state changes; the label is one PixelText updated with .set().
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { measure, PixelText } from '../../ui/font';
import { drawSprite } from '../../ui/widgets';

export class ToolBtn extends Container {
  private g = new Graphics();
  private text: PixelText;
  private tag: string;
  private icon: string[];
  private pal: Record<string, string>;
  private onTap: () => void;
  bw = 16;
  bh = 16;
  private key = '';
  private pressed = false;
  /** Cooldown left as a fraction (0 = ready). */
  cool = 0;
  ready = true;

  constructor(label: string, icon: string[], pal: Record<string, string>, onTap: () => void) {
    super();
    this.tag = label;
    this.icon = icon;
    this.pal = pal;
    this.onTap = onTap;
    this.text = new PixelText(label, '#f4e8c1');
    this.addChild(this.g, this.text);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.pressed = true;
      this.redraw();
    });
    this.on('pointerup', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this.pressed) return;
      this.pressed = false;
      this.redraw();
      this.onTap();
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.redraw();
    });
  }

  /** Width available in the gutter; the label shows only when it fits. */
  fit(w: number): void {
    const lw = measure(this.tag).w + 4;
    this.bw = Math.max(14, Math.min(26, w));
    const withLabel = this.bw >= lw;
    this.bh = withLabel ? 19 : 14;
    this.text.visible = withLabel;
    this.key = '';
    this.redraw();
  }

  redraw(): void {
    const coolPx = Math.round(this.cool * (this.bw - 4));
    const key = `${this.bw}|${this.bh}|${coolPx}|${this.ready}|${this.pressed}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.g.clear();
    const off = this.pressed ? 1 : 0;
    const face = this.ready ? 0x5c3a6e : 0x2e2236;
    g.rect(0, 0, this.bw, this.bh + 1).fill(0x0a0410);
    g.rect(1, 1 + off, this.bw - 2, this.bh - 2).fill(this.ready ? 0x3a2046 : 0x1e1626);
    g.rect(1, 1 + off, this.bw - 2, this.bh - 3).fill(face);
    g.rect(2, 2 + off, this.bw - 4, 1).fill({ color: 0xffffff, alpha: this.ready ? 0.25 : 0.08 });
    const ix = Math.floor((this.bw - 7) / 2);
    drawSprite(g, this.icon, this.pal, ix, 3 + off);
    if (!this.ready) g.rect(ix, 3 + off, 7, 7).fill({ color: 0x0a0410, alpha: 0.45 });
    if (coolPx > 0) g.rect(2, this.bh - 3 + off, coolPx, 1).fill(0xe8c04a);
    this.text.set(this.tag, this.ready ? '#f4e8c1' : '#7a6e80');
    this.text.position.set(Math.floor((this.bw - this.text.width) / 2), 11 + off);
    this.hitArea = new Rectangle(-2, -2, this.bw + 4, this.bh + 4);
  }

  /** Screen rect (stage coordinates). */
  rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.bw, h: this.bh };
  }
}
