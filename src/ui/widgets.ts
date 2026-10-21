// Shared pixel UI widgets: panels, buttons, bars. Everything is drawn with Graphics at 1px.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { PixelText, measure } from './font';

export const C = {
  bg: 0x140c1c,
  ink: '#f4e8c1',
  inkDim: '#9c8aa8',
  outline: 0x0a0410,
  panel: 0x2a1a3a,
  panelLight: 0x3c2650,
  edge: 0x5c3a6e,
  green: 0x8fd14f,
  greenDark: 0x4a7a22,
  red: 0xc03a3a,
  gold: 0xe8c04a,
  goldText: '#e8c04a',
  greenText: '#8fd14f',
  redText: '#e05050',
  disabled: 0x3a3040,
};

/** A bevelled pixel panel. */
export function drawPanel(g: Graphics, x: number, y: number, w: number, h: number, fill = C.panel, edge = C.edge): Graphics {
  g.rect(x, y, w, h).fill(C.outline);
  g.rect(x + 1, y + 1, w - 2, h - 2).fill(edge);
  g.rect(x + 2, y + 2, w - 4, h - 4).fill(fill);
  return g;
}

export interface ButtonOpts {
  w: number;
  h: number;
  label: string;
  sub?: string;
  color?: number;
  shade?: number;
  textColor?: string;
  onTap: () => void;
  /** Hold to repeat (for buying many levels). */
  repeat?: boolean;
}

/** A chunky pressable button with a 1px drop "lip". */
export class Button extends Container {
  private g = new Graphics();
  private labelText: PixelText;
  private subText: PixelText;
  private opts: ButtonOpts;
  private pressed = false;
  private enabledState = true;
  private repeatTimer: number | null = null;

  constructor(opts: ButtonOpts) {
    super();
    this.opts = opts;
    this.labelText = new PixelText('', opts.textColor ?? '#140c1c', null);
    this.subText = new PixelText('', opts.textColor ?? '#140c1c', null);
    this.addChild(this.g, this.labelText, this.subText);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', this.down, this);
    this.on('pointerup', this.up, this);
    this.on('pointerupoutside', this.cancel, this);
    this.on('pointerleave', this.cancel, this);
    this.setLabel(opts.label, opts.sub);
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  setEnabled(on: boolean): this {
    if (on !== this.enabledState) {
      this.enabledState = on;
      this.redraw();
    }
    return this;
  }

  setLabel(label: string, sub?: string): this {
    if (label === this.opts.label && sub === this.opts.sub) return this;
    this.opts.label = label;
    this.opts.sub = sub;
    this.redraw();
    return this;
  }

  setColor(color: number, shade?: number): this {
    this.opts.color = color;
    this.opts.shade = shade;
    this.redraw();
    return this;
  }

  private redraw(): void {
    const { w, h } = this.opts;
    const color = this.enabledState ? (this.opts.color ?? C.green) : C.disabled;
    const shade = this.enabledState ? (this.opts.shade ?? C.greenDark) : 0x24202a;
    const off = this.pressed ? 1 : 0;
    const g = this.g.clear();
    g.rect(0, 0, w, h + 1).fill(C.outline);
    g.rect(1, 1 + off, w - 2, h - 2).fill(shade);
    g.rect(1, 1 + off, w - 2, h - 3).fill(color);
    g.rect(2, 2 + off, w - 4, 1).fill({ color: 0xffffff, alpha: 0.25 });
    const tc = this.enabledState ? (this.opts.textColor ?? '#140c1c') : '#7a6e80';
    this.labelText.set(this.opts.label, tc);
    this.subText.set(this.opts.sub ?? '', tc);
    const lm = measure(this.opts.label);
    const hasSub = !!this.opts.sub;
    const sm = measure(this.opts.sub ?? '');
    const total = lm.h + (hasSub ? sm.h + 2 : 0);
    const top = Math.floor((h - 1 - total) / 2) + off;
    this.labelText.position.set(Math.floor((w - lm.w) / 2), top);
    this.subText.position.set(Math.floor((w - sm.w) / 2), top + lm.h + 2);
    this.hitArea = new Rectangle(0, 0, w, h + 1);
  }

  private down(e: FederatedPointerEvent): void {
    e.stopPropagation();
    this.pressed = true;
    this.redraw();
    if (this.opts.repeat && this.enabledState) {
      let delay = 350;
      const tick = () => {
        if (!this.pressed) return;
        if (this.enabledState) this.opts.onTap();
        delay = Math.max(60, delay * 0.8);
        this.repeatTimer = window.setTimeout(tick, delay);
      };
      this.repeatTimer = window.setTimeout(tick, delay);
    }
  }

  private up(e: FederatedPointerEvent): void {
    e.stopPropagation();
    if (!this.pressed) return;
    this.pressed = false;
    this.clearRepeat();
    this.redraw();
    if (this.enabledState) this.opts.onTap();
  }

  private cancel(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.clearRepeat();
    this.redraw();
  }

  private clearRepeat(): void {
    if (this.repeatTimer !== null) window.clearTimeout(this.repeatTimer);
    this.repeatTimer = null;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.clearRepeat();
    super.destroy(options);
  }
}

/** A horizontal fill bar. */
export function drawBar(g: Graphics, x: number, y: number, w: number, h: number, frac: number, color: number, back = 0x1c1024): void {
  g.rect(x, y, w, h).fill(C.outline);
  g.rect(x + 1, y + 1, w - 2, h - 2).fill(back);
  const fw = Math.round((w - 2) * Math.max(0, Math.min(1, frac)));
  if (fw > 0) g.rect(x + 1, y + 1, fw, h - 2).fill(color);
}

/** Builds a pixel sprite into a Graphics from rows of palette keys. */
export function drawSprite(g: Graphics, rows: string[], palette: Record<string, string | number>, x = 0, y = 0, px = 1): Graphics {
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const c = palette[row[rx]];
      if (c === undefined || row[rx] === '.') continue;
      g.rect(x + rx * px, y + ry * px, px, px).fill(c);
    }
  });
  return g;
}
