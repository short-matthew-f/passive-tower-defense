// "Sacked & Avenged": the static Fall card with the one-tap Crush timing bar (specs/00 §2.3).
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { DeptDef, LastStandCtx } from '../core/dept';
import { legendsBane } from '../core/perks';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import { dreadPayout } from '../core/economy';
import { PixelText, measure, wrap } from '../ui/font';
import { Button, C, drawBar, drawPanel } from '../ui/widgets';
import { destroyTree } from '../ui/destroy';

/** A Last Stand that has not settled after this long falls back to the Crush bar (a department
 * whose promise never settles must not leave a ticker callback running forever). */
export const LAST_STAND_WATCHDOG_MS = 120_000;

export function showFallCard(game: Game, def: DeptDef, d: DeptSave, inf: number, onDone: (crush: number) => void): void {
  // Card state lives outside the display tree, so a resize can rebuild the card for the new layout
  // without losing the phase or the Crush (C-11). All ticker callbacks are released through the
  // card's dispose hook, which the game runs on teardown and on every other way the card goes away
  // (C-03).
  let phase: 'ask' | 'crush' | 'stand' | 'done' = 'ask';
  let t = 0;
  let crush = 0;
  let finished = false;

  const build = (): void => {
    if (finished) return;
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

    const add = (pt: PixelText, ty: number) => {
      pt.position.set(x + Math.floor((w - pt.width) / 2), ty);
      root.addChild(pt);
      return pt;
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
    const barY = y + h - 64;

    /** Ticker callbacks this build owns; all removed by dispose. */
    let standTick: ((tk: Ticker) => void) | null = null;
    let standLayer: Container | null = null;
    let watchdog = 0;
    let standFinish: ((value: number | null) => void) | null = null;
    let disposed = false;

    const close = () => {
      if (!root.destroyed) destroyTree(root); // runs dispose
    };

    const showCrush = () => {
      infoText.set(wrap('SACKED! NOW THE OVERLORD DESCENDS. TAP WHEN THE MARKER HITS THE CENTER.', w - 16));
      letIn.setLabel('CRUSH!');
      wait.visible = false;
      stand.visible = !!def.lastStand;
    };

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
          showCrush();
        } else if (phase === 'crush') {
          phase = 'done';
          stand.visible = false;
          const pos = (Math.sin(t * 3.2) + 1) / 2;
          crush = 0.25 * Math.max(0, 1 - Math.abs(pos - 0.5) * 2.5);
          avenged();
        } else if (phase === 'done') {
          finished = true;
          close();
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
        finished = true;
        close();
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
      wait.visible = false;
      stand.visible = false;
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
        phase = 'stand';
        root.visible = false;
        const layer = new Container();
        standLayer = layer;
        const ticks: ((dt: number) => void)[] = [];
        const tickFn = (tk: Ticker) => {
          if (layer.destroyed) return;
          const dt = Math.min(0.1, tk.deltaMS / 1000);
          for (const f of ticks) {
            try {
              f(dt);
            } catch (err) {
              console.error(err);
            }
          }
        };
        standTick = tickFn;
        game.app.ticker.add(tickFn);
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
        let settled = false;
        const finish = (value: number | null) => {
          if (settled) return;
          settled = true;
          standFinish = null;
          window.clearTimeout(watchdog);
          game.app.ticker.remove(tickFn);
          if (standTick === tickFn) standTick = null;
          if (standLayer === layer) standLayer = null;
          if (!layer.destroyed) destroyTree(layer);
          if (disposed || root.destroyed || phase !== 'stand') return;
          if (value === null) phase = 'crush'; // fall back to the static Crush bar
          else {
            phase = 'done';
            crush = Math.max(0, Math.min(0.25, Number.isFinite(value) ? value : 0));
          }
          // The layout may have changed while the stand ran (the card was kept as it was).
          if (builtFor !== game.layout) {
            close();
            build();
            return;
          }
          root.visible = true;
          stand.visible = false;
          if (phase === 'done') avenged();
        };
        standFinish = finish;
        // The stand's layer goes away with the card (teardown): settle as "no result".
        game.trackModal(layer, { keep: () => true, dispose: () => finish(null) });
        game.modalLayer.addChild(layer);
        watchdog = window.setTimeout(() => finish(null), LAST_STAND_WATCHDOG_MS);
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
      if (phase !== 'crush' || bar.destroyed) return;
      t += tk.deltaMS / 1000;
      const g = bar.clear();
      const bw = w - 24;
      drawBar(g, x + 12, barY, bw, 8, 0, C.red);
      g.rect(x + 12 + Math.floor(bw / 2) - 6, barY + 1, 12, 6).fill(C.gold);
      const pos = (Math.sin(t * 3.2) + 1) / 2;
      g.rect(x + 12 + Math.round(pos * (bw - 3)), barY - 2, 3, 12).fill(0xf4e8c1);
    };

    // Rebuilt mid-way (resize): show the phase we were in.
    if (phase === 'crush') showCrush();
    else if (phase === 'done') avenged();

    const builtFor = game.layout;
    game.app.ticker.add(tick);
    game.trackModal(root, {
      dispose: () => {
        disposed = true;
        // An interrupted Last Stand comes back as the Crush bar if the card is re-opened.
        if (phase === 'stand') phase = 'crush';
        game.app.ticker.remove(tick);
        if (standTick) game.app.ticker.remove(standTick);
        // A running Last Stand goes with the card.
        if (standFinish) standFinish(null);
        if (standLayer && !standLayer.destroyed) destroyTree(standLayer);
      },
      // A running Last Stand is never interrupted by a resize.
      keep: () => phase === 'stand',
      reopen: build,
    });
    game.modalLayer.addChild(root);
  };

  build();
}
