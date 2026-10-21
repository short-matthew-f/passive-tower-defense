// The department HUD strip: home, local bank and idle rate, Infamy (skill | economy) and the Legend button.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { DeptDef } from '../core/dept';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import { coreMult, econFloor, infamy } from '../core/economy';
import { formatNum } from '../core/format';
import { PixelText } from './font';
import { Button, C, drawBar } from './widgets';

export const HUD_H = 24;

export class DeptHud extends Container {
  private game: Game;
  private def: DeptDef;
  private d: DeptSave;
  private bg = new Graphics();
  private bank = new PixelText('');
  private rate = new PixelText('', '#9c8aa8');
  private bars = new Graphics();
  private infText = new PixelText('', '#9c8aa8');
  private tribute = new PixelText('', '#e8c04a');
  private dread = new PixelText('', '#c070e0');
  private legendBtn: Button;
  private infHit = new Container();
  private blink = 0;
  /** performance.now() of the last rate / Infamy refresh (~3 Hz, perf P-03). */
  private slowAt = -Infinity;
  private lastRate = 0;
  private inf = { value: 0, skill: 0, econ: 0 };

  constructor(game: Game, def: DeptDef, d: DeptSave) {
    super();
    this.game = game;
    this.def = def;
    this.d = d;
    const L = game.layout;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    this.position.set(0, L.safe.t);

    // Background extends up under the notch so the status bar area matches the HUD.
    this.bg.rect(0, -L.safe.t, L.w, HUD_H + L.safe.t).fill(0x1c1028);
    this.bg.rect(0, HUD_H - 1, L.w, 1).fill(C.outline);
    this.addChild(this.bg);

    const home = new Button({ w: 18, h: 17, label: '{up}', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => game.goThrone() });
    home.position.set(x0 + 2, 3);
    this.addChild(home);

    this.bank.position.set(x0 + 24, 4);
    this.rate.position.set(x0 + 24, 13);
    this.addChild(this.bank, this.rate);

    this.legendBtn = new Button({
      w: 50,
      h: 10,
      label: '{skull}LEGEND',
      color: C.red,
      shade: 0x7a2020,
      textColor: C.ink,
      hitPad: 3, // drawn 50x11, touched 56x17 (U-14)
      onTap: () => game.startFall(def.id),
    });
    this.legendBtn.position.set(x0 + w - 52, 12);

    this.addChild(this.legendBtn);

    this.addChild(this.bars, this.infText, this.tribute, this.dread);
    // Tapping the Infamy bar explains both gates.
    this.infHit.eventMode = 'static';
    this.infHit.hitArea = new Rectangle(x0 + w - 62, 0, 62, HUD_H);
    this.infHit.on('pointertap', () => (this.d.cycle.legendWaiting ? game.startFall(def.id) : this.explainInfamy()));
    this.addChild(this.infHit);
    this.update();
  }

  private explainInfamy(): void {
    const inf = infamy(this.def, this.d);
    const target = this.def.skillTarget(this.d.cycle.n);
    this.game.toast(
      `INFAMY ${Math.floor(inf.value)}%  SKILL: ${this.def.skillLabel(target)} (${Math.floor(inf.skill * 100)}%)  ECONOMY: EARN ${formatNum(
        econFloor(this.def, this.d.cycle.n),
      )} THIS CYCLE (${Math.floor(inf.econ * 100)}%)`,
    );
  }

  update(): void {
    const L = this.game.layout;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    const notation = this.game.save.meta.settings.notation;
    this.bank.set(`${formatNum(this.d.run.bank, notation)} ${this.def.currency}`, this.def.currencyColor);
    // The idle rate (a department may compute it expensively) and Infamy refresh at ~3 Hz, not
    // every frame (perf P-03); between refreshes the last known values show. A throwing or
    // non-finite rate keeps the last good one.
    const pnow = performance.now();
    if (pnow - this.slowAt >= 333) {
      this.slowAt = pnow;
      try {
        const r = this.def.idleRate(this.d) * coreMult(this.game.save, this.def.id, this.game.defs, Date.now());
        if (Number.isFinite(r)) this.lastRate = r;
      } catch {
        /* keep the last value */
      }
      try {
        this.inf = infamy(this.def, this.d);
      } catch {
        /* keep the last value */
      }
    }
    this.rate.set(`+${formatNum(this.lastRate, notation)}/S IDLE`);

    const inf = this.inf;
    const legend = this.d.cycle.legendWaiting;
    this.legendBtn.visible = legend;
    this.blink += 1;
    if (legend) this.legendBtn.alpha = Math.floor(this.blink / 30) % 2 ? 1 : 0.75;

    // Row 1 right: the empire's shared currencies, always visible.
    this.dread.set(`${formatNum(this.game.save.meta.dread, notation)} DREAD`);
    this.dread.position.set(x0 + w - this.dread.width - 2, 4);
    this.tribute.set(`{tribute}${formatNum(this.game.save.meta.tribute, notation)}`);
    this.tribute.position.set(this.dread.x - this.tribute.width - 5, 4);

    // Row 2 right: Infamy (skill | economy), replaced by the Legend button when one waits.
    const g = this.bars.clear();
    const bw = 17;
    const bx = x0 + w - (bw * 2 + 3);
    this.bars.visible = !legend;
    this.infText.visible = !legend;
    drawBar(g, bx, 13, bw, 5, inf.skill, C.green);
    drawBar(g, bx + bw + 1, 13, bw, 5, inf.econ, C.gold);
    this.infText.set(`INF ${Math.floor(inf.value)}%`);
    this.infText.position.set(bx - this.infText.width - 3, 13);
    // Generous target: the whole right half of row 2 (Infamy, or the Legend when one waits).
    this.infHit.hitArea = new Rectangle(x0 + w - 72, 11, 72, HUD_H - 11);
  }
}
