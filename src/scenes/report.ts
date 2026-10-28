// Gobbo's offline report (specs/00 §5.3): it opens with how each department's Night Order went
// (core/orders.ts), then Tribute, Goods and the offline cap, and ends by handing the player one
// goal with a GO button (the Next Goal ribbon's pick, fun plan A3).
import { Container, Graphics } from 'pixi.js';
import type { DeptDef } from '../core/dept';
import type { Game } from '../core/game';
import type { DeptId } from '../core/types';
import { GOOD_ORDER, GOODS, type GoodId } from '../core/goods';
import { formatNum, formatTime } from '../core/format';
import { PixelText, wrap } from '../ui/font';
import { Button, C, drawPanel, drawSprite } from '../ui/widgets';
import { satchelLevel } from '../core/perks';
import { destroyTree } from '../ui/destroy';
import { outcomeText, type OrderOutcome } from '../core/orders';
import { followGoal, goalFor } from '../ui/ribbon';

export interface ReportLine {
  id: DeptId;
  def: DeptDef;
  amount: number;
  legend: boolean;
  infamy: number;
  /** The manager's report line (00 §5.4.7), or null. */
  flavor?: string | null;
  /** Affordable "Ready" buys (Gobbo's Satchel L1 lists them with a GO button). */
  ready?: { label: string; cost: number }[];
  /** What the Steward bought while away (Satchel L2-L3). */
  steward?: string[];
  /** How this department's Night Order went (absent for absences under a minute). */
  order?: OrderOutcome;
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

/** "The Cauldron" -> "CAULDRON", "Goblin Mines" -> "MINES": the department's last word. */
const NAMES_SHORT = (name: string) => {
  const w = name.toUpperCase().split(/\s+/);
  return w[w.length - 1] === 'PIT' ? 'WAR PIT' : w[w.length - 1];
};

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

export function showReport(game: Game, r: Report, onClose?: () => void): void {
  const L = game.layout;
  const notation = game.save.meta.settings.notation;
  const satchel = satchelLevel(game.save);

  if (r.elapsed < 600) {
    const parts = r.lines.filter((l) => l.amount > 0).map((l) => `+${formatNum(l.amount, notation)} ${l.def.currency}`);
    const goods = goodsGainedText(r.goods, notation);
    game.toast(`GOBBO: WHILE YOU WERE AWAY ${formatTime(r.elapsed)}: ${parts.join(', ')}, +${formatNum(r.tribute, notation)} TRIBUTE${goods ? `, GOODS ${goods}` : ''}`);
    onClose?.();
    return;
  }

  const root = new Container();
  const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.7 });
  dim.eventMode = 'static';
  root.addChild(dim);

  const w = L.w - L.safe.l - L.safe.r - 12;
  const goodsText = goodsGainedText(r.goods, notation);
  const goodsWrapped = goodsText ? wrap(`GOODS ${goodsText}`, w - 16) : '';
  const goodsH = goodsWrapped ? goodsWrapped.split('\n').length * 7 + 3 : 0;
  const fixedH = 70 + 10 + goodsH + 40;
  const avail = L.h - L.safe.t - L.safe.b - 8;
  // Flavour rows (portrait + one line) when they fit; dropped first on small screens.
  const withFlavor = r.lines.some((l) => l.flavor) && fixedH + r.lines.length * 31 <= avail;
  const lineH = withFlavor ? 31 : 17;
  const h = Math.min(avail, fixedH + r.lines.length * lineH);
  const x = L.safe.l + 6;
  const y = Math.max(L.safe.t + 4, Math.floor((L.h - h) / 2));
  const g = new Graphics();
  drawPanel(g, x, y, w, h, 0xe8dcb0, 0x8a6a3a);
  drawSprite(g, GOBBO, GOBBO_PAL, x + 6, y + 6, 2);
  root.addChild(g);

  const title = new PixelText("GOBBO'S REPORT", '#5a2a1a', null);
  title.position.set(x + 34, y + 8);
  const ordered = r.lines.some((l) => l.order);
  const sub = new PixelText(wrap(`GONE ${formatTime(r.elapsed)}. ${ordered ? 'HOW YOUR ORDERS WENT:' : 'THE EMPIRE KEPT WORKING.'}`, w - 40), '#5a4a3a', null);
  sub.position.set(x + 34, y + 18);
  root.addChild(title, sub);

  const close = () => {
    destroyTree(root);
    onClose?.();
  };
  const maxChars = Math.floor((w - 30) / 4);
  let ly = y + 40;
  const fmt = (n: number) => formatNum(n, notation);
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, Math.max(1, n - 2))}..` : t);
  for (const l of r.lines) {
    const goShown = satchel >= 1 && !!l.ready?.length;
    // Row 1: the department and the order the player left ("CAULDRON: BREW FOR BILE").
    const head = l.order?.label ? `${NAMES_SHORT(l.def.name)}: ${l.order.label}` : l.def.name.toUpperCase();
    const name = new PixelText(clip(head, maxChars - 10), '#2a1a3a', null);
    name.position.set(x + 8, ly);
    // Row 2: what it brought, and the order's result first.
    const stew = l.steward?.length ? ` STEWARD x${l.steward.length}` : '';
    const income = `+${fmt(l.amount)} ${l.def.currency.toUpperCase()}`;
    const res = l.order ? outcomeText(l.order, l.def.currency, fmt) : '';
    const second = res && l.order?.kind !== 'none' ? `${res}${l.order?.kind === 'income' ? '' : `  ${income}`}` : `${income}${stew}`;
    const good = l.order && (l.order.kind === 'gate' ? l.order.gateAfter >= 1 : l.order.kind === 'income' ? l.order.bonus > 0 : true);
    const amt = new PixelText(clip(second, maxChars - (goShown ? 9 : 0)), good ? '#3a6a1a' : '#6a5a3a', null);
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
    // Gobbo's Satchel L1: "N READY" with a GO button that enters the department.
    if (goShown && l.ready) {
      const id = l.id;
      const go = new Button({
        w: 34,
        h: 9,
        label: `${Math.min(99, l.ready.length)} GO`,
        onTap: () => {
          close();
          game.enter(id);
        },
      });
      go.position.set(x + w - 42, ly + 7);
      root.addChild(go);
    }
    if (withFlavor && l.flavor) {
      const m = l.def.manager;
      const pg = new Graphics();
      pg.rect(x + 7, ly + 15, 14, 14).fill(0x2a1a3a);
      drawSprite(pg, m.portrait[0], m.palette, x + 8, ly + 16, 1);
      const text = l.flavor.length > maxChars ? `${l.flavor.slice(0, maxChars - 2)}..` : l.flavor;
      const fl = new PixelText(text, '#6a4a2a', null);
      fl.position.set(x + 24, ly + 19);
      root.addChild(pg, fl);
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
  {
    // The offline cap (24 h base): how full it got.
    const cap = new PixelText(
      r.capped ? `CAP REACHED AT ${formatTime(r.cap)}` : `CAP ${Math.min(99, Math.floor((100 * r.elapsed) / r.cap))}% OF ${formatTime(r.cap)}`,
      r.capped ? '#a02020' : '#7a6a5a',
      null,
    );
    cap.position.set(x + 8, ly);
    root.addChild(cap);
    ly += 10;
  }

  // The report ends by handing over one goal: "NEXT: UNSEAL THE STYX 72%  [GO]".
  const goal = goalFor(game, 'throne');
  const canGo = !!goal && goal.go.kind !== 'none';
  if (goal) {
    const gt = new PixelText(clip(`NEXT: ${goal.text} ${goal.detail}`, maxChars + 4), goal.hot ? '#a02020' : '#5a2a1a', null);
    gt.position.set(x + 8, y + h - 37);
    root.addChild(gt);
  }
  const bw = canGo ? Math.floor((w - 24) / 2) : w - 20;
  const btn = new Button({ w: bw, h: 18, label: canGo ? 'COLLECT' : 'COLLECT ALL', onTap: close });
  btn.position.set(x + 10, y + h - 26);
  root.addChild(btn);
  if (canGo) {
    const go = new Button({
      w: bw,
      h: 18,
      label: 'GO >',
      color: C.red,
      shade: 0x7a2020,
      textColor: C.ink,
      onTap: () => {
        close();
        followGoal(game, goalFor(game, 'throne') ?? goal);
      },
    });
    go.position.set(x + 14 + bw, y + h - 26);
    root.addChild(go);
  }
  // A resize re-opens the report for the new layout, keeping its continuation (C-11).
  game.trackModal(root, { reopen: () => showReport(game, r, onClose) });
  game.modalLayer.addChild(root);
}
