// The shared upgrade sheet: tabs per group, a drag-scrolled list of rows with buy buttons.
import { Container, Graphics, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import type { UpgradeEntry, UpgradeGroup } from '../core/dept';
import type { Game } from '../core/game';
import { formatNum } from '../core/format';
import { PixelText } from './font';
import { Button, C, drawPanel } from './widgets';

const ROW_H = 28;

interface Row {
  entry: UpgradeEntry;
  root: Container;
  name: PixelText;
  desc: PixelText;
  btn: Button;
}

export class UpgradeSheet extends Container {
  private game: Game;
  private bankText: () => { text: string; color: string };
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
  private box = { x: 0, y: 0, w: 0, h: 0, listY: 0, listH: 0 };
  private tickFn = (t: Ticker) => this.refresh(t);
  private onClose: () => void;

  constructor(game: Game, titleText: string, bankText: () => { text: string; color: string }, groups: UpgradeGroup[], onClose: () => void) {
    super();
    this.game = game;
    this.bankText = bankText;
    this.groups = groups;
    this.onClose = onClose;
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
    this.bank.position.set(x + 6, y + 15);
    this.addChild(title, this.bank);

    const close = new Button({ w: 16, h: 14, label: 'X', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.close() });
    close.position.set(x + w - 20, y + 5);
    this.addChild(close);

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
    game.app.ticker.add(this.tickFn);
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
    this.list.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.rows = [];
    this.scrollY = 0;
    this.list.y = 0;
    this.build();
  }

  private build(): void {
    const { x, w, listY } = this.box;
    const entries = this.groups[this.tab]?.entries.filter((e) => e.visible?.() ?? true) ?? [];
    entries.forEach((entry, i) => {
      const root = new Container();
      root.position.set(x + 4, listY + 2 + i * ROW_H);
      const bg = new Graphics();
      bg.rect(0, 0, w - 8, ROW_H - 2).fill(i % 2 ? 0x24162f : 0x2e1d3d);
      const name = new PixelText('');
      name.position.set(3, 4);
      const desc = new PixelText('', '#9c8aa8');
      desc.position.set(3, 14);
      const btn = new Button({
        w: 46,
        h: 21,
        label: 'BUY',
        repeat: true,
        onTap: () => {
          if (this.drag?.moved) return;
          if (entry.canAfford() && !entry.locked?.()) {
            entry.buy();
            this.game.saveSoon();
          }
        },
      });
      btn.position.set(w - 8 - 48, 2);
      root.addChild(bg, name, desc, btn);
      this.list.addChild(root);
      this.rows.push({ entry, root, name, desc, btn });
    });
    this.maxScroll = Math.max(0, entries.length * ROW_H + 4 - this.box.listH);
    this.refresh();
  }

  private refresh(_t?: Ticker): void {
    const notation = this.game.save.meta.settings.notation;
    const b = this.groups[this.tab]?.bank?.() ?? this.bankText();
    this.bank.set(b.text, b.color);
    const maxChars = Math.floor((this.box.w - 8 - 54) / 4);
    for (const r of this.rows) {
      const e = r.entry;
      const lvl = e.level();
      const maxed = lvl >= e.max;
      const lvlText = e.levelText ? e.levelText() : e.max === Infinity ? `LV${lvl}` : `${lvl}/${e.max}`;
      r.name.set(`${e.name.toUpperCase()} ${lvlText}`.slice(0, maxChars + 6));
      r.desc.set(e.desc().toUpperCase().slice(0, maxChars));
      const lock = e.locked?.() ?? null;
      if (maxed) {
        r.btn.setLabel('MAX').setEnabled(false);
      } else if (lock) {
        r.btn.setLabel('LOCKED', lock.toUpperCase().slice(0, 10)).setEnabled(false);
      } else {
        const cost = formatNum(e.cost(), notation);
        const unit = !e.currency ? '' : e.currency.startsWith('{') ? e.currency.slice(0, e.currency.indexOf('}') + 1) : e.currency[0];
        r.btn.setLabel(e.buyLabel ?? 'BUY', `${cost}${unit}`).setEnabled(e.canAfford());
      }
    }
  }

  close(): void {
    this.onClose();
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.game.app.ticker.remove(this.tickFn);
    super.destroy(options);
  }
}
