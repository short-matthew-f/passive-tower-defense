// "Sacked & Avenged": the static Fall card with the one-tap Crush timing bar (specs/00 §2.3).
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { DeptDef, LastStandCtx } from '../core/dept';
import { legendsBane } from '../core/perks';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import { dreadPayout } from '../core/economy';
import { PixelText, measure, wrap } from '../ui/font';
import { Button, C, drawBar, drawPanel } from '../ui/widgets';

export function showFallCard(game: Game, def: DeptDef, d: DeptSave, inf: number, onDone: (crush: number) => void): void {
  const L = game.layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.8 });
  dim.eventMode = 'static';
  root.addChild(dim);

  const w = L.w - L.safe.l - L.safe.r - 12;
  const h = 196;
  const x = L.safe.l + 6;
  const y = Math.floor((L.h - h) / 2);
  const panel = new Graphics();
  drawPanel(panel, x, y, w, h, 0x2a1418, C.red);
  root.addChild(panel);

  const add = (t: PixelText, ty: number) => {
    t.position.set(x + Math.floor((w - t.width) / 2), ty);
    root.addChild(t);
    return t;
  };

  add(new PixelText('A LEGEND AT THE GATE', C.redText), y + 8);
  add(new PixelText(def.legend.name.toUpperCase(), C.goldText), y + 20);
  const flavor = wrap(def.legend.line, w - 16);
  add(new PixelText(flavor, '#c8b8d0'), y + 32);
  const fh = measure(flavor).h;

  const bane = legendsBane(game.save, def.id);
  const base = dreadPayout(d, inf, 0, bane);
  const info = wrap(
    `INFAMY ${Math.floor(inf)}%. LETTING THEM IN RESETS ${def.name.toUpperCase()} (${def.currency.toUpperCase()} AND UPGRADES). YOU KEEP RARE FINDS. THEN YOU CRUSH THEM FOR ${base}+ DREAD.`,
    w - 16,
  );
  const infoText = add(new PixelText(info), y + 38 + fh);

  const bar = new Graphics();
  root.addChild(bar);
  const crushLabel = new PixelText('');
  root.addChild(crushLabel);

  let phase: 'ask' | 'crush' | 'stand' | 'done' = 'ask';
  let t = 0;
  let crush = 0;
  const barY = y + h - 64;

  const letIn = new Button({
    w: w - 24,
    h: 20,
    label: 'LET THEM COME',
    color: C.red,
    shade: 0x7a2020,
    textColor: C.ink,
    onTap: () => {
      if (phase === 'ask') {
        phase = 'crush';
        infoText.set(wrap('SACKED! NOW THE OVERLORD DESCENDS. TAP WHEN THE MARKER HITS THE CENTER.', w - 16));
        letIn.setLabel('CRUSH!');
        wait.visible = false;
        stand.visible = !!def.lastStand;
      } else if (phase === 'crush') {
        phase = 'done';
        stand.visible = false;
        const pos = (Math.sin(t * 3.2) + 1) / 2;
        crush = 0.25 * Math.max(0, 1 - Math.abs(pos - 0.5) * 2.5);
        avenged();
      } else {
        game.app.ticker.remove(tick);
        root.destroy({ children: true });
        onDone(crush);
      }
    },
  });
  letIn.position.set(x + 12, y + h - 48);
  root.addChild(letIn);

  const wait = new Button({
    w: w - 24,
    h: 16,
    label: 'NOT YET (KEEP PUSHING)',
    color: C.edge,
    shade: 0x3a2046,
    textColor: C.ink,
    onTap: () => {
      game.app.ticker.remove(tick);
      root.destroy({ children: true });
    },
  });
  wait.position.set(x + 12, y + h - 24);
  root.addChild(wait);

  const avenged = () => {
    const total = dreadPayout(d, inf, crush, bane);
    infoText.set(wrap(`AVENGED! ${def.legend.name.toUpperCase()} IS CAPTURED. WORD SPREADS.`, w - 16));
    crushLabel.set(`CRUSH +${Math.round(crush * 100)}%  =  ${total} DREAD`, C.goldText);
    crushLabel.position.set(x + Math.floor((w - crushLabel.width) / 2), barY + 12);
    letIn.setLabel('REBUILD, BIGGER AND MEANER');
    game.haptic(30);
  };

  // Interactive Last Stand (00 §2.3): the department's own mini-scene instead of the Crush bar.
  const stand = new Button({
    w: w - 24,
    h: 16,
    label: '{skull}LAST STAND',
    color: C.gold,
    shade: 0x9a7a20,
    onTap: () => {
      if (phase !== 'crush' || !def.lastStand) return;
      phase = 'stand' as typeof phase;
      root.visible = false;
      const layer = new Container();
      const ticks: ((dt: number) => void)[] = [];
      const standTick = (tk: Ticker) => {
        const dt = Math.min(0.1, tk.deltaMS / 1000);
        for (const f of ticks) {
          try {
            f(dt);
          } catch (err) {
            console.error(err);
          }
        }
      };
      game.app.ticker.add(standTick);
      game.modalLayer.addChild(layer);
      const ctx: LastStandCtx = {
        game,
        def,
        save: d,
        layout: game.layout,
        infamy: inf,
        root: layer,
        onTick: (fn) => ticks.push(fn),
        haptic: (ms = 10) => game.haptic(ms),
      };
      const finish = (value: number | null) => {
        game.app.ticker.remove(standTick);
        layer.destroy({ children: true });
        if (root.destroyed) return;
        root.visible = true;
        stand.visible = false;
        if (value === null) {
          phase = 'crush'; // fall back to the static Crush bar
          return;
        }
        phase = 'done';
        crush = Math.max(0, Math.min(0.25, Number.isFinite(value) ? value : 0));
        avenged();
      };
      let p: Promise<number>;
      try {
        p = def.lastStand(ctx);
      } catch (err) {
        console.error(err);
        finish(null);
        return;
      }
      Promise.resolve(p).then(
        (v) => finish(v),
        (err) => {
          console.error(err);
          finish(null);
        },
      );
    },
  });
  stand.position.set(x + 12, y + h - 24);
  stand.visible = false;
  root.addChild(stand);

  const tick = (tk: Ticker) => {
    if (phase !== 'crush') return;
    t += tk.deltaMS / 1000;
    const g = bar.clear();
    const bw = w - 24;
    drawBar(g, x + 12, barY, bw, 8, 0, C.red);
    g.rect(x + 12 + Math.floor(bw / 2) - 6, barY + 1, 12, 6).fill(C.gold);
    const pos = (Math.sin(t * 3.2) + 1) / 2;
    g.rect(x + 12 + Math.round(pos * (bw - 3)), barY - 2, 3, 12).fill(0xf4e8c1);
  };
  game.app.ticker.add(tick);
  game.modalLayer.addChild(root);
}
