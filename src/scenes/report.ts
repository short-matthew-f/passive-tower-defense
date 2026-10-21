// Gobbo's offline report (specs/00 §5.3): one line per department, Tribute, cap warnings, Collect All.
import { Container, Graphics } from 'pixi.js';
import type { DeptDef } from '../core/dept';
import type { Game } from '../core/game';
import type { DeptId } from '../core/types';
import { GOOD_ORDER, GOODS, type GoodId } from '../core/goods';
import { formatNum, formatTime } from '../core/format';
import { PixelText, wrap } from '../ui/font';
import { Button, drawPanel, drawSprite } from '../ui/widgets';

export interface ReportLine {
  id: DeptId;
  def: DeptDef;
  amount: number;
  legend: boolean;
  infamy: number;
}

export interface Report {
  elapsed: number;
  capped: boolean;
  cap: number;
  lines: ReportLine[];
  tribute: number;
  /** Goods gained while away (00 §5.3). */
  goods?: Partial<Record<GoodId, number>>;
}

/** "+12{potion} +6{bone}" for the whole Goods gained (empty when none reached a whole unit). */
export function goodsGainedText(goods: Partial<Record<GoodId, number>> | undefined, notation: 'suffix' | 'sci' = 'suffix'): string {
  if (!goods) return '';
  return GOOD_ORDER.filter((g) => Math.floor(goods[g] ?? 0) >= 1)
    .map((g) => `+${formatNum(Math.floor(goods[g] ?? 0), notation)}${GOODS[g].icon}`)
    .join(' ');
}

const GOBBO = [
  '....GG..GG..',
  '...GGGGGGGG.',
  '..GGGGGGGGGG',
  '..GGWKGGWKGG',
  '..GGGGGGGGGG',
  '...GGRRRRGG.',
  '....GGGGGG..',
  '...BBBBBBBB.',
  '..BBBBYBBBBB',
  '..BBBBBBBBBB',
  '...BB....BB.',
  '...BB....BB.',
];
const GOBBO_PAL = { G: '#6aa84f', W: '#ffffff', K: '#0a0410', R: '#8a2a2a', B: '#6e4a2e', Y: '#e8c04a' };

export function showReport(game: Game, r: Report): void {
  const L = game.layout;
  const notation = game.save.meta.settings.notation;

  if (r.elapsed < 600) {
    const parts = r.lines.filter((l) => l.amount > 0).map((l) => `+${formatNum(l.amount, notation)} ${l.def.currency}`);
    const goods = goodsGainedText(r.goods, notation);
    game.toast(`GOBBO: WHILE YOU WERE AWAY ${formatTime(r.elapsed)}: ${parts.join(', ')}, +${formatNum(r.tribute, notation)} TRIBUTE${goods ? `, GOODS ${goods}` : ''}`);
    return;
  }

  const root = new Container();
  const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.7 });
  dim.eventMode = 'static';
  root.addChild(dim);

  const w = L.w - L.safe.l - L.safe.r - 12;
  const lineH = 18;
  const goodsText = goodsGainedText(r.goods, notation);
  const goodsWrapped = goodsText ? wrap(`GOODS ${goodsText}`, w - 16) : '';
  const goodsH = goodsWrapped ? goodsWrapped.split('\n').length * 7 + 3 : 0;
  const h = 70 + r.lines.length * lineH + (r.capped ? 10 : 0) + goodsH + 30;
  const x = L.safe.l + 6;
  const y = Math.max(L.safe.t + 4, Math.floor((L.h - h) / 2));
  const g = new Graphics();
  drawPanel(g, x, y, w, h, 0xe8dcb0, 0x8a6a3a);
  drawSprite(g, GOBBO, GOBBO_PAL, x + 6, y + 6, 2);
  root.addChild(g);

  const title = new PixelText("GOBBO'S REPORT", '#5a2a1a', null);
  title.position.set(x + 34, y + 8);
  const sub = new PixelText(wrap(`YOU WERE GONE ${formatTime(r.elapsed)}. THE EMPIRE KEPT WORKING.`, w - 40), '#5a4a3a', null);
  sub.position.set(x + 34, y + 18);
  root.addChild(title, sub);

  let ly = y + 40;
  for (const l of r.lines) {
    const name = new PixelText(l.def.name.toUpperCase(), '#2a1a3a', null);
    name.position.set(x + 8, ly);
    const amt = new PixelText(`+${formatNum(l.amount, notation)} ${l.def.currency.toUpperCase()}`, '#3a6a1a', null);
    amt.position.set(x + 8, ly + 8);
    root.addChild(name, amt);
    if (l.legend) {
      const warn = new PixelText('{skull}LEGEND!', '#a02020', null);
      warn.position.set(x + w - warn.width - 8, ly);
      root.addChild(warn);
    } else {
      const inf = new PixelText(`INFAMY ${Math.floor(l.infamy)}%`, '#7a5a4a', null);
      inf.position.set(x + w - inf.width - 8, ly);
      root.addChild(inf);
    }
    ly += lineH;
  }
  const trib = new PixelText(`+${formatNum(r.tribute, notation)} TRIBUTE TO THE THRONE`, '#8a5a10', null);
  trib.position.set(x + 8, ly + 2);
  root.addChild(trib);
  ly += 12;
  if (goodsWrapped) {
    const gt = new PixelText(goodsWrapped, '#5a3a7a', null);
    gt.position.set(x + 8, ly);
    root.addChild(gt);
    ly += goodsH;
  }
  if (r.capped) {
    const cap = new PixelText(`CAP REACHED AT ${formatTime(r.cap)}`, '#a02020', null);
    cap.position.set(x + 8, ly);
    root.addChild(cap);
    ly += 10;
  }

  const btn = new Button({
    w: w - 20,
    h: 18,
    label: 'COLLECT ALL',
    onTap: () => root.destroy({ children: true }),
  });
  btn.position.set(x + 10, y + h - 26);
  root.addChild(btn);
  game.modalLayer.addChild(root);
}
