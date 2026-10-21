// The shared upgrade sheet: tabs per group, a drag-scrolled list of rows with buy buttons, and a
// sheet-wide Buy x1 / x10 / MAX mode (meta.settings.buyMode) for levelled rows.
import { Container, Graphics, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import type { Rect, UpgradeEntry, UpgradeGroup } from '../core/dept';
import type { Game } from '../core/game';
import { formatNum } from '../core/format';
import { PixelText, wrap } from './font';
import { Button, C, drawPanel } from './widgets';
import { destroyTree } from './destroy';

const ROW_H = 28;
const HEADER_H = 12;
const BTN_W = 46;
const MODES = ['X1', 'X10', 'MAX'] as const;
/** MAX never plans more than this many levels in one tap. */
const MAX_BULK = 1000;
/** Bulk plans are re-priced at most this often (MAX searches the price curve). */
const PLAN_EVERY_S = 0.2;

interface Plan {
  /** Levels the tap buys (>= 1 while not maxed). */
  n: number;
  /** Their total price (exact with costFor; the next level's price otherwise). */
  cost: number;
  /** True when `cost` is the exact total and `afford` is known. */
  exact: boolean;
  afford: boolean;
}

interface Row {
  entry: UpgradeEntry;
  root: Container;
  name: PixelText;
  desc: PixelText;
  btn: Button | null;
  plan: Plan | null;
  planKey: string;
  planAge: number;
}

/** Plain levelled rows take the bulk mode unless they opt out (UpgradeEntry.bulk). */
/** Whether holding a row's button repeats the buy (UpgradeEntry.repeat). Toggle and cycle rows
 * (a custom buyLabel or costText, or a single level) never repeat. Pure (exported for tests). */
export function rowRepeats(e: UpgradeEntry): boolean {
  if (e.repeat !== undefined) return e.repeat && !e.header;
  return !e.header && !e.costText && !e.buyLabel && e.max > 1;
}

/** One line of at most `max` characters, ending ".." when cut (never mid-word silently). */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, Math.max(1, max - 2));
  // Never cut through an icon token such as {coin}.
  const open = cut.lastIndexOf('{');
  if (open > cut.lastIndexOf('}')) cut = cut.slice(0, open);
  return `${cut.trimEnd()}..`;
}

/** Up to two word-wrapped lines of `max` characters each; the second ends ".." when there is
 * more (U-08: descriptions used to be cut mid-word on one line). Pure (exported for tests). */
export function twoLines(text: string, max: number): string {
  const lines = wrap(text, max * 4).split('\n');
  if (lines.length <= 2) return lines.map((l) => clip(l, max)).join('\n');
  // More than fits: end the second line on a whole word, then "..".
  let second = '';
  for (const w of `${lines[1]} ${lines.slice(2).join(' ')}`.split(' ')) {
    const next = second ? `${second} ${w}` : w;
    if (next.length + 2 > max) break;
    second = next;
  }
  return `${clip(lines[0], max)}\n${second ? `${second}..` : clip(lines[1], max)}`;
}

export function bulkable(e: UpgradeEntry): boolean {
  if (e.bulk !== undefined) return e.bulk && !e.header;
  return !e.header && !e.costText && !e.buyLabel && !e.levelText && e.max > 1;
}

/**
 * The price and size of one tap in `mode` (0 = x1, 1 = x10, 2 = MAX). Pure (exported for tests):
 * with `costFor` and a wallet the total is exact (MAX: the most levels the wallet covers, at least
 * one to show the next price); otherwise the next level's price, bought repeatedly.
 */
export function planBuy(e: UpgradeEntry, mode: number, wallet: number | null): Plan {
  const left = e.max - e.level();
  const next = e.cost();
  if (left <= 0 || mode === 0 || !bulkable(e)) return { n: 1, cost: next, exact: true, afford: e.canAfford() };
  const cap = Math.min(left, mode === 1 ? 10 : MAX_BULK);
  const priced = !!e.costFor && wallet !== null && Number.isFinite(wallet);
  if (!priced) return { n: cap, cost: next, exact: false, afford: e.canAfford() };
  const cf = (k: number) => {
    const c = e.costFor!(k);
    return Number.isFinite(c) ? c : Infinity;
  };
  if (mode === 1) {
    const c = cf(cap);
    return { n: cap, cost: c, exact: true, afford: e.canAfford() && wallet! + 1e-9 >= c };
  }
  // MAX: double, then binary-search the largest affordable k (costFor is monotone in k).
  if (!(wallet! + 1e-9 >= next)) return { n: 1, cost: next, exact: true, afford: false };
  let lo = 1;
  let hi = 1;
  while (hi < cap && cf(Math.min(cap, hi * 2)) <= wallet! + 1e-9) {
    lo = Math.min(cap, hi * 2);
    hi = lo;
  }
  if (hi < cap) {
    let top = Math.min(cap, hi * 2);
    while (top - lo > 1) {
      const mid = (lo + top) >> 1;
      if (cf(mid) <= wallet! + 1e-9) lo = mid;
      else top = mid;
    }
  }
  return { n: lo, cost: lo === 1 ? next : cf(lo), exact: true, afford: e.canAfford() };
}

/** Buys up to n levels: buyMany when the row has it, else buy() while it stays affordable and
 * its level keeps rising. Returns the levels bought. */
export function buyLevels(e: UpgradeEntry, n: number): number {
  if (n <= 1) {
    const before = e.level();
    e.buy();
    return e.level() > before ? 1 : 0;
  }
  if (e.buyMany) return Math.max(0, e.buyMany(n) | 0);
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!e.canAfford() || e.locked?.() || e.level() >= e.max) break;
    const before = e.level();
    e.buy();
    if (e.level() <= before) break;
    got++;
  }
  return got;
}

export class UpgradeSheet extends Container {
  private game: Game;
  private bankText: () => { text: string; color: string };
  private wallet: (() => number) | null;
  private groups: UpgradeGroup[];
  private tab = 0;
  private list = new Container();
  private listMask = new Graphics();
  private rows: Row[] = [];
  private bank = new PixelText('');
  private scrollY = 0;
  private maxScroll = 0;
  private drag: { y: number; start: number; moved: boolean } | null = null;
  private tabs: Button[] = [];
  private modeBtns: Button[] = [];
  private box = { x: 0, y: 0, w: 0, h: 0, listY: 0, listH: 0 };
  private tickFn = (t: Ticker) => this.refresh(t);
  private onClose: () => void;
  private lh: boolean;

  constructor(
    game: Game,
    titleText: string,
    bankText: () => { text: string; color: string },
    groups: UpgradeGroup[],
    onClose: () => void,
    wallet?: () => number,
  ) {
    super();
    this.game = game;
    this.bankText = bankText;
    this.groups = groups;
    this.onClose = onClose;
    this.wallet = wallet ?? null;
    this.lh = !!game.save.meta.settings.leftHanded;
    const L = game.layout;

    // Dim the scene; tapping outside the sheet closes it.
    const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.6 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.close());
    this.addChild(dim);

    const w = L.w - L.safe.l - L.safe.r - 4;
    const h = Math.min(L.h - L.safe.t - L.safe.b - 30, 250);
    const x = L.safe.l + 2;
    const y = L.h - L.safe.b - h - 2;
    const panel = new Graphics();
    drawPanel(panel, x, y, w, h);
    panel.eventMode = 'static';
    this.addChild(panel);

    const title = new PixelText(titleText, C.goldText);
    title.position.set(x + 6, y + 6);
    this.bank.position.set(x + 6, y + 17);
    this.addChild(title, this.bank);

    const close = new Button({ w: 16, h: 14, label: 'X', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.close() });
    close.position.set(x + w - 20, y + 5);
    this.addChild(close);

    // Buy amount: X1 / X10 / MAX, left of the close button (shown while the tab has bulk rows).
    const mw = [14, 18, 18];
    let mx = x + w - 22;
    for (let i = MODES.length - 1; i >= 0; i--) {
      mx -= mw[i] + 1;
      const b = new Button({ w: mw[i], h: 11, label: MODES[i], onTap: () => this.setMode(i as 0 | 1 | 2) });
      b.position.set(mx, y + 4);
      this.modeBtns[i] = b;
      this.addChild(b);
    }

    let tx = x + 4;
    const tabW = Math.floor((w - 8 - (groups.length - 1) * 2) / Math.max(1, groups.length));
    groups.forEach((gr, i) => {
      const b = new Button({ w: tabW, h: 13, label: gr.name.toUpperCase().slice(0, Math.floor((tabW - 4) / 4)), onTap: () => this.selectTab(i) });
      b.position.set(tx, y + 25);
      tx += tabW + 2;
      this.tabs.push(b);
      this.addChild(b);
    });

    const listY = y + 42;
    const listH = h - 46;
    this.box = { x, y, w, h, listY, listH };
    this.listMask.rect(x + 3, listY, w - 6, listH).fill(0xffffff);
    this.list.mask = this.listMask;
    this.addChild(this.list, this.listMask);

    panel.on('pointerdown', (e: FederatedPointerEvent) => this.dragStart(e));
    panel.on('globalpointermove', (e: FederatedPointerEvent) => this.dragMove(e));
    panel.on('pointerup', () => (this.drag = null));
    panel.on('pointerupoutside', () => (this.drag = null));
    this.list.eventMode = 'static';
    this.list.on('pointerdown', (e: FederatedPointerEvent) => this.dragStart(e));
    this.list.on('globalpointermove', (e: FederatedPointerEvent) => this.dragMove(e));
    this.list.on('pointerup', () => (this.drag = null));
    this.list.on('pointerupoutside', () => (this.drag = null));

    this.selectTab(0);
    this.paintModes();
    game.app.ticker.add(this.tickFn);
  }

  private get mode(): 0 | 1 | 2 {
    const m = this.game.save.meta.settings.buyMode;
    return m === 1 || m === 2 ? m : 0;
  }

  private setMode(m: 0 | 1 | 2): void {
    this.game.save.meta.settings.buyMode = m;
    for (const r of this.rows) r.planKey = '';
    this.paintModes();
    this.refresh();
  }

  private paintModes(): void {
    const show = this.rows.some((r) => r.btn && bulkable(r.entry));
    this.modeBtns.forEach((b, i) => {
      b.visible = show;
      b.setColor(i === this.mode ? C.gold : C.edge, i === this.mode ? 0x9a7a20 : 0x3a2046);
    });
  }

  private dragStart(e: FederatedPointerEvent): void {
    const p = this.toLocal(e.global);
    if (p.y < this.box.listY || p.y > this.box.listY + this.box.listH) return;
    this.drag = { y: p.y, start: this.scrollY, moved: false };
  }

  private dragMove(e: FederatedPointerEvent): void {
    if (!this.drag) return;
    const p = this.toLocal(e.global);
    const dy = p.y - this.drag.y;
    if (Math.abs(dy) > 3) this.drag.moved = true;
    this.scrollY = Math.max(0, Math.min(this.maxScroll, this.drag.start - dy));
    this.list.y = -Math.round(this.scrollY);
  }

  private selectTab(i: number): void {
    this.tab = i;
    this.tabs.forEach((b, j) => b.setColor(j === i ? C.gold : C.edge, j === i ? 0x9a7a20 : 0x3a2046));
    this.list.removeChildren().forEach((c) => destroyTree(c));
    this.rows = [];
    this.scrollY = 0;
    this.list.y = 0;
    this.build();
    this.paintModes();
  }

  private build(): void {
    const { x, w, listY } = this.box;
    const entries = this.groups[this.tab]?.entries.filter((e) => safe(() => e.visible?.() ?? true, true)) ?? [];
    // Left-handed: the BUY column sits on the left (thumb side), text to its right.
    const btnX = this.lh ? 2 : w - 8 - (BTN_W + 2);
    const textX = this.lh ? BTN_W + 6 : 3;
    let ry = listY + 2;
    entries.forEach((entry, i) => {
      const root = new Container();
      root.position.set(x + 4, ry);
      if (entry.header) {
        ry += HEADER_H;
        const name = new PixelText(entry.name.toUpperCase(), C.goldText);
        name.position.set(2, 4);
        const line = new Graphics().rect(0, HEADER_H - 2, w - 8, 1).fill(C.edge);
        root.addChild(line, name);
        this.list.addChild(root);
        this.rows.push({ entry, root, name, desc: name, btn: null, plan: null, planKey: '', planAge: 0 });
        return;
      }
      ry += ROW_H;
      const bg = new Graphics();
      bg.rect(0, 0, w - 8, ROW_H - 2).fill(i % 2 ? 0x24162f : 0x2e1d3d);
      const name = new PixelText('');
      name.position.set(textX, 4);
      const desc = new PixelText('', '#9c8aa8');
      desc.position.set(textX, 14);
      const row: Row = { entry, root, name, desc, btn: null, plan: null, planKey: '', planAge: 0 };
      const btn = new Button({
        w: BTN_W,
        h: 21,
        label: 'BUY',
        repeat: rowRepeats(entry),
        onTap: () => {
          if (this.drag?.moved) return;
          this.buy(row);
        },
      });
      row.btn = btn;
      btn.position.set(btnX, 2);
      root.addChild(bg, name, desc, btn);
      this.list.addChild(root);
      this.rows.push(row);
    });
    this.maxScroll = Math.max(0, ry - (listY + 2) + 4 - this.box.listH);
    this.refresh();
  }

  private buy(row: Row): void {
    const e = row.entry;
    try {
      if (e.locked?.() || e.level() >= e.max) return;
      const plan = this.planFor(row, true);
      if (!plan.afford || !e.canAfford()) return;
      if (buyLevels(e, plan.n) > 0) this.game.saveSoon();
    } catch (err) {
      console.error(err);
    }
    row.planKey = '';
  }

  private walletNow(e: UpgradeEntry): number | null {
    if (e.wallet) return safe(() => e.wallet!(), null);
    if (e.currency || !this.wallet) return null;
    return safe(() => this.wallet!(), null);
  }

  /** The row's current bulk plan, re-priced when its level or the mode changes, else every 0.2 s. */
  private planFor(row: Row, fresh = false, dt = 0): Plan {
    const e = row.entry;
    const mode = this.mode;
    const key = `${mode}|${e.level()}`;
    row.planAge += dt;
    if (fresh || !row.plan || key !== row.planKey || (mode !== 0 && row.planAge >= PLAN_EVERY_S) || mode === 0) {
      row.plan = planBuy(e, mode, mode === 0 ? null : this.walletNow(e));
      row.planKey = key;
      row.planAge = 0;
    }
    return row.plan;
  }

  private refresh(t?: Ticker): void {
    const dt = t ? t.deltaMS / 1000 : 0;
    const notation = this.game.save.meta.settings.notation;
    const b = this.groups[this.tab]?.bank?.() ?? this.bankText();
    this.bank.set(b.text, b.color);
    const maxChars = Math.floor((this.box.w - 8 - 54) / 4);
    for (const r of this.rows) {
      const e = r.entry;
      if (!r.btn) continue;
      try {
        const lvl = e.level();
        const maxed = lvl >= e.max;
        const lvlText = e.levelText ? e.levelText() : e.max === Infinity ? `LV${lvl}` : `${lvl}/${e.max}`;
        r.name.set(clip(`${e.name.toUpperCase()} ${lvlText}`, maxChars + 6));
        const lock = e.locked?.() ?? null;
        const plan = maxed || lock ? null : this.planFor(r, false, dt);
        const many = !!plan && plan.n > 1;
        const desc = many && e.descFor ? e.descFor(plan!.n) : e.desc();
        r.desc.set(twoLines(desc.toUpperCase(), maxChars));
        if (maxed) {
          r.btn.setLabel(e.maxLabel ?? 'MAX').setEnabled(false);
        } else if (lock) {
          r.btn.setLabel('LOCKED', lock.toUpperCase().slice(0, 10)).setEnabled(false);
        } else {
          // Tribute shows its own crown mark, never a bare 'T' (Batch Tokens use T, U-13).
          const unit = !e.currency ? '' : e.currency === 'Tribute' ? '{tribute}' : e.currency.startsWith('{') ? e.currency.slice(0, e.currency.indexOf('}') + 1) : e.currency[0];
          const cost = `${formatNum(plan!.cost, notation)}${unit}`;
          // Exact bulk: "+n" over the total. Repeated-buy fallback: the mode over the next price.
          const label = !many ? (e.buyLabel ?? 'BUY') : plan!.exact ? `+${plan!.n}` : this.mode === 1 ? 'X10' : 'MAX';
          r.btn.setLabel(label, e.costText ? e.costText() : cost).setEnabled(plan!.afford);
        }
      } catch (err) {
        // A row that throws shows as unavailable rather than breaking the sheet.
        r.btn.setLabel('...').setEnabled(false);
        void err;
      }
    }
  }

  /**
   * Onboarding target inside the sheet (OnboardingStep.sheetTarget): the entry's BUY button in
   * logical screen px, or its tab while another tab is open; null when scrolled out of view.
   */
  targetRect(entryId: string): Rect | null {
    const row = this.rows.find((r) => r.entry.id === entryId && r.btn);
    if (row?.btn) {
      const y = row.root.y + this.list.y + row.btn.y;
      const bx = row.root.x + row.btn.x;
      if (y < this.box.listY - 2 || y + 22 > this.box.listY + this.box.listH + 2) return null;
      return { x: bx, y, w: BTN_W, h: 22 };
    }
    const tab = this.groups.findIndex((g) => g.entries.some((e) => e.id === entryId && !e.header));
    if (tab < 0 || tab === this.tab) return null;
    const b = this.tabs[tab];
    return { x: b.x, y: b.y, w: b.width, h: 14 };
  }

  close(): void {
    this.onClose();
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.game.app.ticker.remove(this.tickFn);
    super.destroy(options);
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
