// The department HUD strip: home, local bank and idle rate, Infamy (skill | economy) and the Legend button.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { DeptDef } from '../core/dept';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import { coreMult, infamy } from '../core/economy';
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
  private legendBtn: Button;
  private infHit = new Container();
  private blink = 0;

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
      w: 44,
      h: 17,
      label: '{skull}LEGEND',
      color: C.red,
      shade: 0x7a2020,
      textColor: C.ink,
      onTap: () => game.startFall(def.id),
    });
    this.legendBtn.position.set(x0 + w - 46, 3);
    this.addChild(this.legendBtn);

    this.addChild(this.bars, this.infText);
    // Tapping the Infamy bar explains both gates.
    this.infHit.eventMode = 'static';
    this.infHit.hitArea = new Rectangle(x0 + w - 62, 0, 62, HUD_H);
    this.infHit.on('pointertap', () => this.explainInfamy());
    this.addChild(this.infHit);
    this.update();
  }

  private explainInfamy(): void {
    const inf = infamy(this.def, this.d);
    const target = this.def.skillTarget(this.d.cycle.n);
    this.game.toast(
      `INFAMY ${Math.floor(inf.value)}%  SKILL: ${this.def.skillLabel(target)} (${Math.floor(inf.skill * 100)}%)  ECONOMY: EARN ${formatNum(
        this.def.econBase * 3 ** this.d.cycle.n,
      )} THIS CYCLE (${Math.floor(inf.econ * 100)}%)`,
    );
  }

  update(): void {
    const L = this.game.layout;
    const x0 = L.safe.l;
    const w = L.w - L.safe.l - L.safe.r;
    const notation = this.game.save.meta.settings.notation;
    this.bank.set(`${formatNum(this.d.run.bank, notation)} ${this.def.currency}`, this.def.currencyColor);
    const r = this.def.idleRate(this.d) * coreMult(this.game.save, this.def.id, this.game.defs, Date.now());
    this.rate.set(`+${formatNum(r, notation)}/S IDLE`);

    const inf = infamy(this.def, this.d);
    const legend = this.d.cycle.legendWaiting;
    this.legendBtn.visible = legend;
    this.blink += 1;
    if (legend) this.legendBtn.alpha = Math.floor(this.blink / 30) % 2 ? 1 : 0.75;

    const g = this.bars.clear();
    const bx = legend ? x0 + w - 98 : x0 + w - 52;
    const bw = 24;
    drawBar(g, bx, 12, bw, 5, inf.skill, C.green);
    drawBar(g, bx + bw + 1, 12, bw, 5, inf.econ, C.gold);
    this.infText.set(`INFAMY ${Math.floor(inf.value)}%`);
    this.infText.position.set(bx, 4);
    this.infHit.hitArea = new Rectangle(bx, 0, bw * 2 + 2, HUD_H);
  }
}
