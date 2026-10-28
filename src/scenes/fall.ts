// "Sacked & Avenged": the Fall as a celebration (specs/00 §2.3, fun plan A8). The card opens with
// the Legend's portrait and what you gain; LET THEM COME plays a short sequence (the Legend sacks
// the department, the Overlord descends and slams), then the Crush (the department's interactive
// Last Stand as the main button when it has one, else the one-tap timing bar), then the capture:
// a cage, the Dread counting up with ticks, and the helm flying to the Trophy wall.
//
// Guarantees kept from the static card: state lives outside the display tree, so a resize rebuilds
// the card in the same phase (a running sequence skips to the Crush); every ticker callback is
// released through the trackModal dispose hook; a running Last Stand is never interrupted by a
// resize, settles as "no result" on teardown, and falls back to the Crush bar after a watchdog.
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { DeptDef, LastStandCtx } from '../core/dept';
import { legendsBane } from '../core/perks';
import type { Game } from '../core/game';
import type { DeptSave } from '../core/types';
import { dreadPayout } from '../core/economy';
import { dawnLine, dawnMult, dawnPhase, legendFor } from '../core/legends';
import { sfx } from '../core/audio';
import { PixelText, measure, wrap } from '../ui/font';
import { Button, C, LegendSprite, drawBar, drawPanel, drawSprite } from '../ui/widgets';
import { destroyTree } from '../ui/destroy';

/** A Last Stand that has not settled after this long falls back to the Crush bar (a department
 * whose promise never settles must not leave a ticker callback running forever). */
export const LAST_STAND_WATCHDOG_MS = 120_000;

/** Sequence timing (seconds): the sack, then the Overlord's drop and slam. */
const SACK_S = 1.5;
const DROP_S = 0.55;
const SETTLE_S = 0.35;
const SEQ_S = SACK_S + DROP_S + SETTLE_S;
/** Capture: Dread count-up, then the helm's flight to the wall. */
const COUNT_S = 1.1;
const HELM_S = 0.7;

const LORD = [
  '..C..........C..',
  '..CC........CC..',
  '...CKKKKKKKKC...',
  '...KhhhRRhhhK...',
  '..KhHHHHHHHHhK..',
  '..KHKKKKKKKKHK..',
  '..KHKGGKKGGKHK..',
  '..KHKKKKKKKKHK..',
  '...KHHHKKHHHK...',
  '.PPPKKKKKKKKPPP.',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPRRPPPPPPP',
  'PP.PPPPPPPPPP.PP',
  'P..PPPPPPPPPP..P',
  '...PPPP..PPPP...',
  '...KKK....KKK...',
];
const LORD_PAL = { C: '#e8d08a', K: '#0a0410', H: '#5c3a6e', h: '#8a5c9e', R: '#c03a3a', G: '#8fd14f', P: '#3a1a4e' };

type Phase = 'ask' | 'seq' | 'crush' | 'stand' | 'done';

export function showFallCard(game: Game, def: DeptDef, d: DeptSave, inf: number, onDone: (crush: number) => void): void {
  let phase: Phase = 'ask';
  let t = 0; // Crush bar clock
  let seqT = 0; // sequence clock
  let capT = 0; // capture clock
  let crush = 0;
  let finished = false;
  let infoOpen = false;
  /** With a Last Stand, the crush phase offers it first; 'bar' = the timing bar instead. */
  let crushMode: 'offer' | 'bar' = def.lastStand ? 'offer' : 'bar';

  const legend = legendFor(def, d.cycle.n);
  const caughtBefore = game.save.meta.trophies.filter((x) => x.dept === def.id).length;
  sfx.legend();

  const build = (): void => {
    if (finished) return;
    const L = game.layout;
    const root = new Container();
    const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.82 });
    dim.eventMode = 'static';
    // A tap anywhere during the sequence skips to the Crush.
    dim.on('pointertap', () => skipSeq());
    root.addChild(dim);

    const w = L.w - L.safe.l - L.safe.r - 12;
    const h = Math.min(236, L.h - L.safe.t - L.safe.b - 4);
    const x = L.safe.l + 6;
    const y = Math.max(L.safe.t + 2, Math.floor((L.h - L.safe.t - L.safe.b - h) / 2) + L.safe.t);
    const panel = new Graphics();
    drawPanel(panel, x, y, w, h, 0x2a1418, C.red);
    panel.eventMode = 'static';
    panel.on('pointertap', () => skipSeq());
    root.addChild(panel);

    const center = (pt: PixelText, ty: number) => {
      pt.position.set(x + Math.floor((w - pt.width) / 2), ty);
      return pt;
    };

    const header = new PixelText('A LEGEND AT THE GATE', C.redText);
    root.addChild(center(header, y + 6));

    // ---- the stage: the department's gate, the Legend, the Overlord ----
    const sx = x + 4;
    const sy = y + 15;
    const sw = w - 8;
    const sh = 62;
    const stage = new Container();
    const stageMask = new Graphics().rect(sx, sy, sw, sh).fill(0xffffff);
    stage.mask = stageMask;
    const sky = new Graphics();
    sky.rect(sx, sy, sw, sh).fill(0x1a0c22);
    sky.rect(sx, sy + sh - 8, sw, 8).fill(0x2e1d3d);
    sky.rect(sx, sy + sh - 8, sw, 1).fill(0x5c3a6e);
    for (let i = 0; i < 9; i++) sky.rect(sx + ((i * 37) % sw), sy + 3 + ((i * 13) % 20), 1, 1).fill(0x6a5a80);
    stage.addChild(sky);
    const gate = new Graphics();
    const gateX = sx + 6;
    const gateY = sy + sh - 8 - 34;
    const drawGate = (broken: boolean) => {
      const g = gate.clear();
      g.rect(gateX - 2, gateY - 4, 30, 38).fill(0x3a2a40);
      g.rect(gateX - 2, gateY - 4, 30, 2).fill(0x5c4a60);
      for (let i = 0; i < 4; i++) g.rect(gateX - 2 + i * 8, gateY - 7, 5, 3).fill(0x3a2a40);
      if (!broken) {
        g.rect(gateX + 4, gateY + 6, 18, 28).fill(def.doorColor);
        g.rect(gateX + 12, gateY + 6, 1, 28).fill(0x0a0410);
        g.rect(gateX + 16, gateY + 20, 2, 2).fill(0xe8c04a);
      } else {
        g.rect(gateX + 4, gateY + 6, 18, 28).fill(0x0a0410);
        g.rect(gateX + 2, gateY + 26, 9, 4).fill(def.doorColor);
        g.rect(gateX + 13, gateY + 30, 10, 3).fill(def.doorColor);
        g.rect(gateX + 20, gateY + 10, 3, 6).fill(def.doorColor);
      }
    };
    drawGate(phase !== 'ask');
    stage.addChild(gate);
    const debris = new Graphics();
    stage.addChild(debris);
    const scale = sw >= 150 ? 2 : 1;
    const knight = new LegendSprite(legend, scale, false);
    const kSize = 24 * scale;
    const kHome = { x: sx + sw - kSize - 10, y: sy + sh - 8 - kSize + 2 };
    knight.position.set(kHome.x, kHome.y);
    stage.addChild(knight);
    const cage = new Graphics();
    stage.addChild(cage);
    const lord = new Graphics();
    drawSprite(lord, LORD, LORD_PAL, 0, 0, 2);
    const lordHome = { x: sx + Math.floor(sw / 2) - 22, y: sy + sh - 8 - 32 + 1 };
    lord.position.set(lordHome.x, phase === 'ask' ? sy - 40 : lordHome.y);
    lord.visible = phase !== 'ask';
    stage.addChild(lord);
    const stageFlash = new Graphics().rect(sx, sy, sw, sh).fill(0xffffff);
    stageFlash.alpha = 0;
    stage.addChild(stageFlash);
    root.addChild(stage, stageMask);
    // The Trophy wall marker (where the helm flies at the capture).
    const wallLabel = new PixelText(`HELMS ${caughtBefore}/${legend.total}`, '#9c8aa8');
    wallLabel.position.set(sx + 3, sy + 3);
    root.addChild(wallLabel);
    const helm = new Graphics();
    helm.visible = false;
    drawHelmIcon(helm, def.doorColor);
    root.addChild(helm);

    // ---- text: who, what you gain, the appointment ----
    const ty0 = sy + sh + 4;
    const nameText = new PixelText(wrap(legend.full.toUpperCase(), w - 12), C.goldText);
    root.addChild(center(nameText, ty0));
    const nameH = measure(nameText.text).h;
    const body = new PixelText('', '#c8b8d0');
    body.position.set(x + 7, ty0 + nameH + 4);
    root.addChild(body);

    const bane = legendsBane(game.save, def.id);
    const dawnK = () => dawnMult(game.save, def.id, Date.now());
    const base = () => Math.floor(dreadPayout(d, inf, 0, bane) * dawnK());
    const total = () => Math.floor(dreadPayout(d, inf, crush, bane) * dawnK());
    const dawnText = () => {
      const ph = dawnPhase(game.save, def.id, Date.now());
      return dawnLine(legend, ph.phase, ph.at);
    };
    const rules = () =>
      `INFAMY ${Math.floor(inf)}%. LETTING THEM IN RESETS ${def.name.toUpperCase()} (${def.currency.toUpperCase()} AND UPGRADES). YOU KEEP RARE FINDS, PERKS AND DREAD. THEN YOU CRUSH THEM FOR ${base()}+ DREAD.`;
    const askBody = () => {
      const dawn = dawnText();
      const gain = `CAPTURE: ${base()}+ DREAD AND THEIR HELM FOR YOUR WALL (${caughtBefore + 1}/${legend.total}).`;
      return `"${legend.taunt.toUpperCase()}"\n${gain}${dawn ? `\n${dawn}` : ''}`;
    };
    const setBody = (text: string) => body.set(wrap(text, w - 14));

    const bar = new Graphics();
    root.addChild(bar);
    const crushLabel = new PixelText('');
    root.addChild(crushLabel);
    const barY = y + h - 62;

    /** Ticker callbacks this build owns; all removed by dispose. */
    let standTick: ((tk: Ticker) => void) | null = null;
    let standLayer: Container | null = null;
    let watchdog = 0;
    let standFinish: ((value: number | null) => void) | null = null;
    let disposed = false;

    const close = () => {
      if (!root.destroyed) destroyTree(root); // runs dispose
    };

    const info = new Button({
      w: 11,
      h: 10,
      label: '?',
      color: C.edge,
      shade: 0x3a2046,
      textColor: C.ink,
      hitPad: 3,
      onTap: () => {
        infoOpen = !infoOpen;
        refreshText();
      },
    });
    info.position.set(x + w - 15, y + 4);
    root.addChild(info);

    const main = new Button({ w: w - 24, h: 20, label: 'LET THEM COME', color: C.red, shade: 0x7a2020, textColor: C.ink, onTap: () => onMain() });
    main.position.set(x + 12, y + h - 46);
    root.addChild(main);
    const second = new Button({
      w: w - 24,
      h: 16,
      label: 'NOT YET (KEEP PUSHING)',
      color: C.edge,
      shade: 0x3a2046,
      textColor: C.ink,
      onTap: () => onSecond(),
    });
    second.position.set(x + 12, y + h - 24);
    root.addChild(second);

    const refreshText = () => {
      if (infoOpen) return setBody(rules());
      if (phase === 'ask') setBody(askBody());
      else if (phase === 'seq') setBody('SACKED! THE GATE FALLS...');
      else if (phase === 'crush' || phase === 'stand')
        setBody(
          crushMode === 'offer'
            ? `THE OVERLORD DESCENDS. MAKE YOUR LAST STAND: A BETTER STAND, A BIGGER CRUSH (UP TO +25%).${dawnText() ? `\n${dawnText()}` : ''}`
            : 'THE OVERLORD DESCENDS. TAP CRUSH WHEN THE MARKER HITS THE CENTER.',
        );
      else if (phase === 'done') setBody(`AVENGED! ${legend.name.toUpperCase()} IS CAPTURED. WORD SPREADS.`);
    };

    const layoutButtons = () => {
      main.visible = phase !== 'seq';
      second.visible = phase === 'ask' || (phase === 'crush' && !!def.lastStand);
      if (phase === 'ask') {
        main.setLabel('LET THEM COME');
        second.setLabel('NOT YET (KEEP PUSHING)');
      } else if (phase === 'crush') {
        if (crushMode === 'offer') {
          main.setLabel('{skull}LAST STAND');
          second.setLabel('QUICK CRUSH INSTEAD');
        } else {
          main.setLabel('CRUSH!');
          second.setLabel(def.lastStand ? '{skull}LAST STAND INSTEAD' : '');
          second.visible = !!def.lastStand;
        }
      } else if (phase === 'done') {
        main.setLabel('REBUILD, BIGGER AND MEANER');
      }
      header.set(
        phase === 'ask' ? 'A LEGEND AT THE GATE' : phase === 'seq' ? 'SACKED!' : phase === 'done' ? 'AVENGED!' : 'THE OVERLORD DESCENDS',
        phase === 'done' ? C.goldText : C.redText,
      );
      center(header, y + 6);
    };

    const enterCrush = () => {
      phase = 'crush';
      seqT = SEQ_S;
      drawGate(true);
      lord.visible = true;
      lord.position.set(lordHome.x, lordHome.y);
      knight.position.set(kHome.x, kHome.y);
      debris.clear();
      layoutButtons();
      refreshText();
    };

    const skipSeq = () => {
      if (phase === 'seq') enterCrush();
      else if (phase === 'done' && capT < COUNT_S + HELM_S) capT = COUNT_S + HELM_S - 0.01;
    };

    const onMain = () => {
      if (phase === 'ask') {
        phase = 'seq';
        seqT = 0;
        infoOpen = false;
        sfx.fall();
        game.juice.shake(2, { modal: true });
        layoutButtons();
        refreshText();
      } else if (phase === 'crush') {
        if (crushMode === 'offer') startStand();
        else {
          const pos = (Math.sin(t * 3.2) + 1) / 2;
          crush = 0.25 * Math.max(0, 1 - Math.abs(pos - 0.5) * 2.5);
          avenged(true);
        }
      } else if (phase === 'done') {
        finished = true;
        close();
        onDone(crush);
      }
    };

    const onSecond = () => {
      if (phase === 'ask') {
        finished = true;
        close();
      } else if (phase === 'crush' && def.lastStand) {
        crushMode = crushMode === 'offer' ? 'bar' : 'offer';
        layoutButtons();
        refreshText();
      }
    };

    /** The capture. `fresh`: play the count-up (false when rebuilt after a resize). */
    const avenged = (fresh: boolean) => {
      phase = 'done';
      bar.clear();
      if (fresh) {
        capT = 0;
        sfx.slam();
        game.juice.shake(3, { modal: true });
        game.haptic(30);
      } else capT = Math.max(capT, COUNT_S + HELM_S);
      drawCage();
      layoutButtons();
      refreshText();
      paintCount();
    };

    const drawCage = () => {
      const g = cage.clear();
      const cx = kHome.x - 3;
      const cy = kHome.y - 4;
      const cw = kSize + 6;
      const ch = kSize + 4;
      g.rect(cx, cy, cw, 2).fill(0x5a5a6e);
      g.rect(cx, cy + ch - 2, cw, 2).fill(0x5a5a6e);
      for (let bx = 0; bx <= cw - 2; bx += Math.max(4, Math.floor(cw / 7))) g.rect(cx + bx, cy, 2, ch).fill(0x8a8aa0);
      g.rect(cx + cw - 2, cy, 2, ch).fill(0x8a8aa0);
    };

    let lastShown = -1;
    const paintCount = () => {
      const tot = total();
      const k = Math.min(1, capT / COUNT_S);
      const shown = Math.floor(tot * k * (2 - k));
      if (shown !== lastShown) {
        if (lastShown >= 0 && shown > lastShown) sfx.tick(Math.floor(k * 20));
        lastShown = shown;
        const bonus = dawnK() > 1 ? '  DAWN +50%' : '';
        crushLabel.set(`CRUSH +${Math.round(crush * 100)}%  =  ${shown} DREAD${bonus}`, C.goldText);
        crushLabel.position.set(x + Math.floor((w - crushLabel.width) / 2), barY + 4);
      }
    };

    let landed = false;
    let helmDone = false;
    let gateBroken = phase !== 'ask';
    const tick = (tk: Ticker) => {
      if (root.destroyed) return;
      const dt = Math.min(0.1, tk.deltaMS / 1000);
      if (phase === 'ask') {
        // The Legend's idle bob while waiting at the gate.
        seqT += dt;
        knight.y = kHome.y - (Math.floor(seqT * 2.5) % 2);
      } else if (phase === 'seq') {
        seqT += dt;
        if (seqT < SACK_S) {
          // The Legend charges the gate and back, twice; the gate breaks on the first hit.
          const k = (seqT / SACK_S) * 2;
          const hop = Math.abs(Math.sin(k * Math.PI));
          knight.x = Math.round(kHome.x - hop * (kHome.x - (gateX + 30)));
          knight.y = Math.round(kHome.y - Math.abs(Math.sin(k * Math.PI * 2)) * 4);
          if (k > 0.45 && !gateBroken) {
            gateBroken = true;
            drawGate(true);
            game.juice.shake(2, { modal: true });
            sfx.slam();
          }
          if (gateBroken) {
            const g = debris.clear();
            const a = seqT - SACK_S * 0.22;
            for (let i = 0; i < 7; i++) {
              const px = gateX + 10 + i * 4 + a * (8 + i * 6);
              const py = gateY + 10 + a * a * 120 - (i % 3) * 6 * a * 10 + i;
              if (py < sy + sh - 8) g.rect(Math.round(px), Math.round(py), 2, 2).fill(i % 2 ? def.doorColor : 0x5c4a60);
            }
          }
        } else if (seqT < SACK_S + DROP_S) {
          // The Overlord drops from the sky.
          debris.clear();
          knight.position.set(kHome.x, kHome.y);
          lord.visible = true;
          const k = (seqT - SACK_S) / DROP_S;
          lord.y = Math.round(sy - 40 + (lordHome.y - (sy - 40)) * k * k);
        } else {
          if (!landed) {
            landed = true;
            lord.y = lordHome.y;
            stageFlash.alpha = 0.8;
            sfx.slam();
            game.juice.shake(3, { modal: true });
            game.juice.hitStop(80);
          }
          stageFlash.alpha = Math.max(0, stageFlash.alpha - dt * 3);
          if (seqT >= SEQ_S) enterCrush();
        }
      } else if (phase === 'crush') {
        stageFlash.alpha = Math.max(0, stageFlash.alpha - dt * 3);
        lord.y = lordHome.y - (Math.floor((t * 2) % 2) ? 1 : 0);
        if (crushMode === 'bar') {
          t += dt;
          const g = bar.clear();
          const bw = w - 24;
          drawBar(g, x + 12, barY, bw, 8, 0, C.red);
          g.rect(x + 12 + Math.floor(bw / 2) - 6, barY + 1, 12, 6).fill(C.gold);
          const pos = (Math.sin(t * 3.2) + 1) / 2;
          g.rect(x + 12 + Math.round(pos * (bw - 3)), barY - 2, 3, 12).fill(0xf4e8c1);
        } else {
          t += dt;
          bar.clear();
        }
      } else if (phase === 'done') {
        stageFlash.alpha = Math.max(0, stageFlash.alpha - dt * 3);
        capT += dt;
        paintCount();
        if (capT >= COUNT_S && !helmDone) {
          // The helm flies to the wall marker.
          const k = Math.min(1, (capT - COUNT_S) / HELM_S);
          helm.visible = k < 1;
          const hx0 = kHome.x + kSize / 2 - 4;
          const hy0 = kHome.y;
          const hx1 = wallLabel.x + wallLabel.width + 3;
          const hy1 = wallLabel.y - 2;
          const e = k * k * (3 - 2 * k);
          helm.position.set(Math.round(hx0 + (hx1 - hx0) * e), Math.round(hy0 + (hy1 - hy0) * e - Math.sin(k * Math.PI) * 18));
          if (k >= 1) {
            helmDone = true;
            wallLabel.set(`HELMS ${caughtBefore + 1}/${legend.total}  NEW!`, C.goldText);
            sfx.capture();
            game.juice.pop(`+${total()} DREAD`, x + w / 2, barY, { tier: 3, color: '#c070e0', shake: false });
          }
        }
      }
    };
    // Rebuilt mid-way (resize): show the phase we were in (a running sequence skips ahead).
    if (phase === 'seq') enterCrush();
    else if (phase === 'done') {
      helmDone = true;
      wallLabel.set(`HELMS ${caughtBefore + 1}/${legend.total}  NEW!`, C.goldText);
      avenged(false);
    }
    layoutButtons();
    refreshText();

    // Interactive Last Stand (00 §2.3): the department's own mini-scene instead of the Crush bar.
    const startStand = () => {
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
        if (value === null) {
          phase = 'crush'; // fall back to the static Crush bar
          crushMode = 'bar';
        } else {
          phase = 'done';
          crush = Math.max(0, Math.min(0.25, Number.isFinite(value) ? value : 0));
        }
        // The layout may have changed while the stand ran (the card was kept as it was).
        if (builtFor !== game.layout) {
          close();
          if (phase === 'done') capT = 0;
          build();
          return;
        }
        root.visible = true;
        if (phase === 'done') avenged(true);
        else {
          layoutButtons();
          refreshText();
        }
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
    };

    const builtFor = game.layout;
    game.app.ticker.add(tick);
    game.trackModal(root, {
      dispose: () => {
        disposed = true;
        // An interrupted Last Stand comes back as the Crush bar if the card is re-opened.
        if (phase === 'stand') {
          phase = 'crush';
          crushMode = 'bar';
        }
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

/** A 9x9 helm icon (the trophy that flies to the wall). */
function drawHelmIcon(g: Graphics, plume: number): void {
  g.rect(1, 2, 7, 1).fill(0x0a0410);
  g.rect(0, 3, 9, 7).fill(0x0a0410);
  g.rect(1, 3, 7, 6).fill(0xd8d8e0);
  g.rect(1, 5, 7, 1).fill(0x2a1a3a);
  g.rect(4, 6, 1, 3).fill(0x2a1a3a);
  g.rect(3, 0, 3, 3).fill(plume);
}
