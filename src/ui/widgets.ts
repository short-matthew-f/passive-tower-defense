// Shared pixel UI widgets: panels, buttons, bars. Everything is drawn with Graphics at 1px.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { PixelText, measure } from './font';
import { sfx } from '../core/audio';
import { tapHaptic } from '../core/haptics';
import { legendMini, legendPortrait, SILHOUETTE_PAL, type LegendInfo } from '../core/legends';

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
  /** Extra touch margin around the drawn button, in game pixels (small buttons, U-14). */
  hitPad?: number;
  /** Tap feedback (A1): 'tap' (default) plays the shared soft click and an iOS haptic tick;
   * 'none' leaves feedback to onTap (e.g. a buy that plays its own ka-ching). */
  feedback?: 'tap' | 'none';
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
    // Draw now: setLabel() skips a label equal to the current one, which opts.label already is (U-01).
    this.redraw();
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
    const p = this.opts.hitPad ?? 0;
    this.hitArea = new Rectangle(-p, -p, w + 2 * p, h + 1 + 2 * p);
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
    if (this.enabledState) {
      // Synchronously inside the pointer event: the iOS haptic only fires within a gesture.
      if (this.opts.feedback !== 'none') {
        sfx.tap();
        tapHaptic();
      }
      this.opts.onTap();
    }
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

/**
 * A Legend's 24x24 portrait (core/legends.ts), drawn once per set() at an integer scale; as a
 * silhouette (dark fill, light rim) while the Legend is still unknown.
 */
export class LegendSprite extends Container {
  private g = new Graphics();
  private key = '';

  constructor(info?: LegendInfo, scale = 2, silhouette = false) {
    super();
    this.addChild(this.g);
    if (info) this.set(info, scale, silhouette);
  }

  set(info: LegendInfo, scale = 2, silhouette = false): this {
    const key = `${info.seed}|${scale}|${silhouette}`;
    if (key === this.key) return this;
    this.key = key;
    const p = legendPortrait(info);
    const pal: Record<string, string> = silhouette ? silhouettePalette(p.palette) : p.palette;
    drawSprite(this.g.clear(), p.rows, pal, 0, 0, scale);
    return this;
  }
}

function silhouettePalette(pal: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(pal)) out[k] = SILHOUETTE_PAL.fill;
  out.o = SILHOUETTE_PAL.rim;
  return out;
}

/**
 * The Legend on the road (A7): a strip `w` px wide with a door at the right end and the next
 * Legend's tiny figure walking toward it as Infamy rises (`approach` 0..1). Silhouetted until the
 * Legend is known; at the door (waiting) it shows in red and bobs. Mount it anywhere (HUD row,
 * Trophy wall, Fall card); call update(dt) from a ticker, setState() when the state changes.
 * Height ROAD_H. No per-frame allocation: the two walk frames are drawn once into two Graphics.
 */
export const ROAD_H = 14;

export class LegendRoad extends Container {
  private road = new Graphics();
  private frames: [Graphics, Graphics] = [new Graphics(), new Graphics()];
  private walker = new Container();
  private t = 0;
  private approach = 0;
  private shown = 0;
  private waiting = false;
  private infoKey = '';
  readonly w: number;

  constructor(w: number) {
    super();
    this.w = Math.max(30, Math.floor(w));
    this.walker.addChild(this.frames[0], this.frames[1]);
    this.addChild(this.road, this.walker);
    const g = this.road;
    // Road: dotted path, then the door (an arch) at the right end.
    for (let x = 0; x < this.w - 10; x += 3) g.rect(x, ROAD_H - 2, 2, 1).fill(0x3c2650);
    const dx = this.w - 9;
    g.rect(dx, 2, 9, ROAD_H - 2).fill(0x0a0410);
    g.rect(dx + 1, 3, 7, ROAD_H - 4).fill(0x5c3a6e);
    g.rect(dx + 2, 4, 5, ROAD_H - 5).fill(0x2a1418);
    g.rect(dx + 5, 8, 1, 1).fill(0xe8c04a);
  }

  /** Legend look, how known it is, progress 0..1 and whether it waits at the door. */
  setState(info: LegendInfo, known: boolean, approach: number, waiting: boolean): this {
    const key = `${info.seed}|${known}|${waiting}`;
    if (key !== this.infoKey) {
      this.infoKey = key;
      const color = waiting ? 0xc03a3a : known ? 0x9c8aa8 : 0x120a1a;
      const rim = waiting ? 0xffe27a : 0x6a4a80;
      for (let f = 0; f < 2; f++) {
        const rows = legendMini(info, f);
        drawSprite(this.frames[f].clear(), rows, { x: color, o: rim });
      }
    }
    this.approach = Math.max(0, Math.min(1, Number.isFinite(approach) ? approach : 0));
    this.waiting = waiting;
    return this;
  }

  update(dt: number): void {
    this.t += dt;
    // Ease toward the target so a jump in Infamy reads as walking, not teleporting.
    this.shown += (this.approach - this.shown) * Math.min(1, dt * 2);
    const span = this.w - 9 - 10;
    const x = Math.round(this.shown * span);
    const moving = Math.abs(this.approach - this.shown) > 0.002 || this.waiting;
    const f = moving ? Math.floor(this.t * 4) % 2 : 0;
    this.frames[0].visible = f === 0;
    this.frames[1].visible = f === 1;
    this.walker.position.set(x, this.waiting ? (Math.floor(this.t * 3) % 2 ? 0 : 1) : 1);
  }
}
