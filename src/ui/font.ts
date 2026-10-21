// A tiny 3x5 pixel font, rendered to cached textures so text stays crisp at any integer scale.
import { CanvasSource, Sprite, Texture } from 'pixi.js';

const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000',
  '!': '010010010000010', '?': '110001010000010', '-': '000000111000000', '+': '000010111010000',
  '/': '001001010100100', '%': '101001010100101', '(': '010100100100010', ')': '010001001001010',
  "'": '010010000000000', '"': '101101000000000', '=': '000111000111000', '<': '001010100010001',
  '>': '100010001010100', '*': '000101010101000', '#': '101111101111101', '$': '011110010011110',
  '_': '000000000000111', '&': '010101010101011', '[': '110100100100110', ']': '011001001001011',
  '^': '010101000000000', '~': '000011110000000', '@': '010101111100011', '|': '010010010010010',
  // Icons, addressed with {name} in text strings.
  '\u0001': '010111111111010', // {coin}
  '\u0002': '101111111011001', // {heart}
  '\u0003': '010111010111101', // {skull}: crude but readable at 3x5
  '\u0004': '010010111010010', // {up}
  '\u0005': '111101111101111', // {gem}
  '\u0006': '010111010010000', // {arrow-up}
  '\u0007': '010010010111010', // {arrow-down}
  '\u0008': '101010101010101', // {dread}
};

const ICONS: Record<string, string> = {
  coin: '\u0001', heart: '\u0002', skull: '\u0003', up: '\u0004', gem: '\u0005',
  uarr: '\u0006', darr: '\u0007', dread: '\u0008',
};

export const LINE_H = 7; // 5px glyph + 2px leading
export const ADV = 4; // 3px glyph + 1px spacing

function expand(text: string): string {
  return text.toUpperCase().replace(/\{([a-z]+)\}/gi, (_, n: string) => ICONS[n.toLowerCase()] ?? '');
}

export function measure(text: string): { w: number; h: number } {
  const lines = expand(text).split('\n');
  const w = Math.max(...lines.map((l) => l.length)) * ADV - 1;
  return { w: Math.max(0, w), h: lines.length * LINE_H - 2 };
}

/** Wraps text to a pixel width, honoring explicit newlines. */
export function wrap(text: string, maxW: number): string {
  const maxChars = Math.max(1, Math.floor((maxW + 1) / ADV));
  return text
    .split('\n')
    .map((para) => {
      const words = para.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (expand(next).length > maxChars && cur) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      }
      lines.push(cur);
      return lines.join('\n');
    })
    .join('\n');
}

function drawText(ctx: CanvasRenderingContext2D, src: string, color: string, shadow: string | null): void {
  const draw = (fill: string, ox: number, oy: number) => {
    ctx.fillStyle = fill;
    src.split('\n').forEach((line, li) => {
      [...line].forEach((ch, ci) => {
        const g = GLYPHS[ch] ?? GLYPHS['?'];
        for (let i = 0; i < 15; i++) {
          if (g[i] === '1') ctx.fillRect(ci * ADV + (i % 3) + ox, li * LINE_H + Math.floor(i / 3) + oy, 1, 1);
        }
      });
    });
  };
  if (shadow) draw(shadow, 1, 1);
  draw(color, 0, 0);
}

/**
 * A sprite showing pixel text. Each instance owns one canvas texture and redraws it in place
 * when the text changes, so memory stays bounded and no texture is ever freed while on screen.
 */
export class PixelText extends Sprite {
  private _text = '';
  private _color: string;
  private _shadow: string | null;
  private canvas: HTMLCanvasElement | null = null;
  private owned: Texture | null = null;

  constructor(text = '', color = '#f4e8c1', shadow: string | null = '#0a0410') {
    super(Texture.EMPTY);
    this._color = color;
    this._shadow = shadow;
    this.roundPixels = true;
    this.set(text);
  }

  set(text: string, color?: string): this {
    if (text === this._text && (color === undefined || color === this._color)) return this;
    this._text = text;
    if (color) this._color = color;
    if (!text) {
      this.texture = Texture.EMPTY;
      return this;
    }
    const src = expand(text);
    const { w, h } = measure(text);
    const sh = this._shadow ? 1 : 0;
    const cw = Math.max(1, w + sh);
    const ch = Math.max(1, h + sh);
    if (!this.canvas || !this.owned || this.canvas.width !== cw || this.canvas.height !== ch) {
      // Size changed: replace our own texture (never shared, so freeing it is safe).
      const old = this.owned;
      this.canvas = document.createElement('canvas');
      this.canvas.width = cw;
      this.canvas.height = ch;
      drawText(this.canvas.getContext('2d')!, src, this._color, this._shadow);
      this.owned = new Texture({ source: new CanvasSource({ resource: this.canvas, scaleMode: 'nearest' }) });
      this.texture = this.owned;
      old?.destroy(true);
    } else {
      const ctx = this.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, cw, ch);
      drawText(ctx, src, this._color, this._shadow);
      this.owned.source.update();
    }
    return this;
  }

  get text(): string {
    return this._text;
  }

  override destroy(options?: Parameters<Sprite['destroy']>[0]): void {
    const owned = this.owned;
    this.owned = null;
    this.canvas = null;
    // Detach first so a destroy({ texture: true }) never frees our texture twice.
    this.texture = Texture.EMPTY;
    super.destroy(options);
    owned?.destroy(true);
  }
}
