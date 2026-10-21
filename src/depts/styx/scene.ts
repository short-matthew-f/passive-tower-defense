// The River Styx scene (specs/03): cast into the black river, read the nibble, set the hook on the
// plunge, then hold to reel while the line's colour and wobble show the tension. Imp netters and
// Pilk's skiff fish on their own; wisps skim the surface for a quick snatch.
// All numbers live in model.ts; art in art.ts. Pooled souls and particles, fixed PixelTexts.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure, wrap } from '../../ui/font';
import { Button, C, drawPanel, drawSprite } from '../../ui/widgets';
import * as M from './model';
import { BAIT_COLOR, IMP, IMP_PAL, JAR, OVERLORD, OVERLORD_PAL, PILK_IDLE, PILK_PAL, soulArt, soulSize } from './art';
import { sfx } from './sfx';
import { anyAffordable, buildGroups } from './upgrades';

const SURF = 48;
const CTRL = 90;
const MAX_SOULS = 12;
const PER_BAND = 3;
const MAX_PARTS = 140;
const MAX_RIPPLES = 14;
const MAX_WISPS = 3;
const RED = 80;
const START_TENSION = 25;

type Phase = 'idle' | 'aim' | 'sink' | 'wait' | 'nibble' | 'reel' | 'land' | 'rerig';
type SoulState = 'swim' | 'seek' | 'nibble' | 'hooked' | 'flee' | 'fly';

interface Soul {
  sp: M.Species;
  band: number;
  x: number;
  d: number;
  baseD: number;
  vx: number;
  t: number;
  age: number;
  life: number;
  g: Graphics;
  state: SoulState;
  wary: number;
  fade: number; // 0..1 fade-in
  tongue: number;
  orbit: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  grav: number;
}

interface Ripple {
  x: number;
  y: number;
  life: number;
  max: number;
  color: number;
}

interface Wisp {
  x: number;
  y: number;
  vx: number;
  t: number;
}

interface Nibble {
  soul: Soul;
  fakes: number;
  step: 'nib' | 'dip' | 'plunge';
  t: number;
  twin: number;
}

interface Reel {
  soul: Soul;
  dist0: number;
  dist: number;
  tension: number;
  over: number;
  zero: number;
  thrIdx: number;
  thrN: number;
  tele: number;
  thr: number;
  teleported: boolean;
  sway: number;
}

interface Fly {
  soul: Soul;
  x0: number;
  y0: number;
  t: number;
  value: number;
  first: boolean;
}

const lerpColor = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export class StyxScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.StyxRun;
  private per: M.StyxPersistent;
  private groups: UpgradeGroup[];

  // layers
  private bg = new Graphics();
  private skiff = new Graphics();
  private raft = new Graphics();
  private soulLayer = new Container();
  private fog = new Graphics();
  private lineG = new Graphics();
  private fx = new Graphics();
  private ui = new Container();
  private modal = new Container();
  private riverHit = new Container();
  private zoneHit = new Container();
  private aimText = new PixelText('', '#f4e8c1');

  // ui (rebuilt on layout)
  private status = new PixelText('', C.ink);
  private comboText = new PixelText('', C.goldText);
  private gateText = new PixelText('', C.inkDim);
  private wrathText = new PixelText('', '#e05050');
  private diskText = new PixelText('', '#140c1c', null);
  private disk = new Graphics();
  private badge = new Graphics();
  private uiG = new Graphics();
  private baitBtn!: Button;
  private codexBtn!: Button;
  private upgBtn!: Button;
  private wDown!: Button;
  private wUp!: Button;
  private wBuy!: Button;
  private ownedG: Graphics[] = [];

  // layout
  private cx = 0;
  private cw = 0;
  private top = 0;
  private bottom = 0;
  private waterY = 0;
  private ctrlTop = 0;
  private k = 1;
  private riverL = 0;
  private riverR = 0;
  private rodHand = { x: 0, y: 0 };
  private jar = { x: 0, y: 0 };
  private raftX = 0;

  // state
  private t = 0;
  private phase: Phase = 'idle';
  private souls: Soul[] = [];
  private pool: Graphics[] = [];
  private parts: Part[] = [];
  private ripples: Ripple[] = [];
  private wisps: Wisp[] = [];
  private hook = { x: 0, d: 0, cur: 0, jig: 0 };
  private aim = { x: 0, d: 0, ok: false };
  private biteT = 0;
  private seeker: Soul | null = null;
  private nib: Nibble | null = null;
  private reel: Reel | null = null;
  private fly: Fly | null = null;
  private rerigT = 0;
  private holding = false;
  private press: { id: number; y0: number; t0: number; phase: Phase; twitched: boolean } | null = null;
  private twitchT = 0;
  private twitchCd = 0;
  private spawnT = 0;
  private wispT = 4;
  private wispPassed = 0;
  private fogT = 0;
  private fogCd = 60;
  private idleAcc = 0;
  private idleTick = 0;
  private netShow = 0;
  private netShowT = 0;
  private nudge = 0;
  private jarGlow = 0;
  private flash = '';
  private flashT = 0;
  private slowT = 0;
  private flavorT = 40;
  private skiffX = 0.6;
  private skiffDir = 1;
  private clickT = 0;
  private lastNetters = -1;
  private shownWrath = '';
  private shownBait = '';
  private shownCodex = '';
  private codexOpen = false;
  private onSheet = () => this.groups;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.run = ctx.save.run as M.StyxRun;
    this.per = ctx.save.persistent as M.StyxPersistent;
    M.normalize(this.run, this.per);
    this.groups = buildGroups(ctx, { onBuy: (id) => this.onBuy(id) });

    this.ownedG.push(this.bg, this.skiff, this.raft, this.fog, this.lineG, this.fx);
    for (const d of [this.bg, this.skiff, this.raft]) d.eventMode = 'none';
    this.root.addChild(this.bg, this.skiff, this.raft, this.soulLayer, this.fog, this.lineG, this.fx, this.aimText, this.riverHit, this.ui, this.modal);
    this.soulLayer.eventMode = 'none';
    this.fog.eventMode = 'none';
    this.lineG.eventMode = 'none';
    this.fx.eventMode = 'none';
    this.aimText.eventMode = 'none';
    this.root.eventMode = 'static';

    this.riverHit.eventMode = 'static';
    this.riverHit.on('pointerdown', (e: FederatedPointerEvent) => this.riverDown(e));
    this.riverHit.on('globalpointermove', (e: FederatedPointerEvent) => this.riverMove(e));
    this.riverHit.on('pointerup', (e: FederatedPointerEvent) => this.riverUp(e));
    this.riverHit.on('pointerupoutside', (e: FederatedPointerEvent) => this.riverUp(e));

    this.buildLayout();
    for (let b = 0; b < this.run.bands; b++) for (let i = 0; i < PER_BAND; i++) this.spawnSoul(b, false);
  }

  private get W(): number {
    return this.run.wrath;
  }

  private get vol(): number {
    return this.ctx.game.save.meta.settings.sfx ?? 0.6;
  }

  private get tutorial(): boolean {
    return this.run.stats.lands === 0;
  }

  // ---------- layout ----------

  private depthY(d: number): number {
    return this.waterY + 3 + d * this.k;
  }

  private buildLayout(): void {
    const c = this.ctx.content();
    this.cx = c.x;
    this.cw = c.w;
    this.top = c.y;
    this.bottom = c.y + c.h;
    this.waterY = this.top + SURF;
    this.ctrlTop = this.bottom - CTRL;
    this.k = Math.max(0.5, (this.ctrlTop - this.waterY - 6) / (M.MAX_BANDS * M.BAND_PX));
    this.riverL = this.cx + 36;
    this.riverR = this.cx + this.cw - 10;
    this.rodHand = { x: this.cx + 21, y: this.waterY - 11 };
    this.jar = { x: this.cx + 3, y: this.waterY - 9 };
    this.raftX = this.cx + this.cw - 44;
    this.riverHit.hitArea = new Rectangle(this.cx, this.top, this.cw, this.ctrlTop - this.top);
    this.drawBackground();
    this.drawSkiff();
    this.lastNetters = -1;

    // ---- control bar ----
    this.ownedG = this.ownedG.filter((g) => g !== this.disk && g !== this.badge && g !== this.uiG);
    this.ui.removeChildren().forEach((ch) => (ch instanceof Graphics ? ch.destroy() : ch.destroy({ children: true })));
    this.status = new PixelText('', C.ink);
    this.comboText = new PixelText('', C.goldText);
    this.gateText = new PixelText('', C.inkDim);
    this.wrathText = new PixelText('', '#e05050');
    this.diskText = new PixelText('', '#140c1c', null);
    this.disk = new Graphics();
    this.badge = new Graphics();
    this.uiG = new Graphics();
    this.zoneHit = this.makeZone();
    this.ui.addChild(this.uiG, this.zoneHit, this.disk, this.diskText, this.status, this.comboText, this.gateText, this.wrathText);
    for (const d of [this.uiG, this.disk, this.diskText, this.status, this.comboText, this.gateText, this.wrathText, this.badge]) d.eventMode = 'none';

    const y0 = this.ctrlTop;
    const x0 = this.cx + 3;
    const right = this.cx + this.cw - 3;
    const g = this.uiG;
    g.rect(0, y0, this.ctx.layout.w, this.ctx.layout.h - y0).fill(0x1a1420);
    g.rect(0, y0, this.ctx.layout.w, 2).fill(0x5a4030);
    g.rect(0, y0 + 2, this.ctx.layout.w, 1).fill(0x0a0410);
    this.zoneHit.hitArea = new Rectangle(this.cx, y0, this.cw, this.bottom - y0);

    this.status.position.set(x0, y0 + 5);
    const y1 = y0 + 14;
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    this.baitBtn = new Button({ w: 44, h: 18, label: 'BAIT', sub: 'WORM', ...dark, onTap: () => this.cycleBait() });
    this.baitBtn.position.set(x0, y1);
    this.codexBtn = new Button({ w: 44, h: 18, label: 'CODEX', sub: '0/10', ...dark, onTap: () => this.openCodex() });
    this.codexBtn.position.set(x0, y1 + 22);
    const wx = right - 50;
    this.wrathText.position.set(wx, y1 + 1);
    this.wDown = new Button({ w: 15, h: 12, label: '-', ...dark, onTap: () => this.setWrath(this.run.wrath - 1) });
    this.wDown.position.set(wx, y1 + 9);
    this.wUp = new Button({ w: 15, h: 12, label: '+', ...dark, onTap: () => this.setWrath(this.run.wrath + 1) });
    this.wUp.position.set(wx + 35, y1 + 9);
    this.wBuy = new Button({ w: 50, h: 15, label: 'BUY', color: C.red, shade: 0x7a2020, textColor: C.ink, onTap: () => this.buyWrath() });
    this.wBuy.position.set(wx, y1 + 25);
    this.upgBtn = new Button({ w: right - x0, h: 17, label: 'UPGRADES', onTap: () => this.ctx.openUpgrades(this.onSheet()) });
    this.upgBtn.position.set(x0, y0 + 69);
    this.badge.position.set(right - 10, y0 + 66);
    this.comboText.position.set(x0, y0 + 59);
    this.gateText.position.set(x0, y0 + 59);
    this.ui.addChild(this.baitBtn, this.codexBtn, this.wDown, this.wUp, this.wBuy, this.upgBtn, this.badge);
    this.ownedG.push(this.disk, this.badge, this.uiG);
    this.shownWrath = '';
    this.shownBait = '';
    this.shownCodex = '';
    this.refreshButtons();
  }

  private makeZone(): Container {
    const z = new Container();
    z.eventMode = 'static';
    z.on('pointerdown', (e: FederatedPointerEvent) => this.zoneDown(e));
    z.on('globalpointermove', (e: FederatedPointerEvent) => this.zoneMove(e));
    z.on('pointerup', (e: FederatedPointerEvent) => this.zoneUp(e));
    z.on('pointerupoutside', (e: FederatedPointerEvent) => this.zoneUp(e));
    return z;
  }

  private drawBackground(): void {
    const L = this.ctx.layout;
    const g = this.bg.clear();
    const top = this.top;
    // sky: dusk over the river of the dead
    const sky = [0x141020, 0x1a1428, 0x201a30, 0x262036];
    const skyH = this.waterY - top;
    for (let i = 0; i < sky.length; i++) g.rect(0, top + Math.floor((skyH * i) / sky.length), L.w, Math.ceil(skyH / sky.length) + 1).fill(sky[i]);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 14; i++) g.rect(Math.floor(rnd() * L.w), top + Math.floor(rnd() * skyH * 0.5), 1, 1).fill(0x6a6080);
    // far bank: dead trees and the gate of the underworld
    for (let x = 0; x < L.w; x++) {
      const h = Math.floor(4 + 2 * Math.sin(x / 9) + 2 * Math.sin(x / 3.7));
      g.rect(x, this.waterY - h, 1, h).fill(0x161220);
    }
    const gx = this.cx + Math.floor(this.cw * 0.55);
    g.rect(gx, this.waterY - 16, 2, 14).fill(0x161220);
    g.rect(gx + 12, this.waterY - 16, 2, 14).fill(0x161220);
    g.rect(gx - 1, this.waterY - 18, 16, 2).fill(0x161220);
    g.rect(gx + 6, this.waterY - 14, 2, 2).fill(0x3a8a6a);
    // fog band
    for (let i = 0; i < 6; i++) g.rect(Math.floor(rnd() * L.w) - 10, this.waterY - 8 + Math.floor(rnd() * 4), 20 + Math.floor(rnd() * 20), 2).fill({ color: 0x8a90a8, alpha: 0.18 });

    // river bands
    const bandCols = [
      [0x1a2a3a, 0x16243a],
      [0x102a24, 0x0e241e],
      [0x14182a, 0x101424],
    ];
    const accent = [0x8a9cb0, 0x3ac08a, 0x6a7ac0];
    for (let b = 0; b < M.MAX_BANDS; b++) {
      const y0 = Math.floor(this.depthY(b * M.BAND_PX)) - (b === 0 ? 3 : 0);
      const y1 = Math.floor(this.depthY((b + 1) * M.BAND_PX));
      const [c0, c1] = bandCols[b];
      const hh = y1 - y0;
      g.rect(0, y0, L.w, Math.ceil(hh / 2)).fill(c0);
      g.rect(0, y0 + Math.ceil(hh / 2), L.w, hh - Math.ceil(hh / 2)).fill(c1);
      if (b === 1) for (let i = 0; i < 18; i++) g.rect(Math.floor(rnd() * L.w), y0 + Math.floor(rnd() * hh), 1, 1).fill({ color: 0x3ac08a, alpha: 0.5 });
      if (b === 2) {
        // sunken columns
        for (let i = 0; i < 3; i++) {
          const x = this.cx + 40 + Math.floor(((this.cw - 60) * (i + 0.5)) / 3);
          const ch = Math.floor(hh * (0.5 + 0.3 * rnd()));
          g.rect(x, y1 - ch, 5, ch).fill(0x1c2236);
          g.rect(x - 1, y1 - ch, 7, 2).fill(0x232a40);
        }
      }
      // band label + depth ruler on the right edge
      g.rect(this.cx + this.cw - 4, y0, 1, hh).fill({ color: accent[b], alpha: 0.5 });
      for (let i = 1; i < 6; i++) g.rect(this.cx + this.cw - 6, y0 + Math.floor((hh * i) / 6), 2, 1).fill({ color: accent[b], alpha: 0.4 });
      if (b >= this.run.bands) {
        g.rect(0, y0, L.w, hh).fill({ color: 0x05030a, alpha: 0.72 });
        for (let x = (b * 7) % 9; x < L.w; x += 9) g.rect(x, y0 + 1, 4, 1).fill({ color: 0x5a4a6a, alpha: 0.5 });
      }
    }
    // water surface highlight
    g.rect(0, this.waterY, L.w, 1).fill({ color: 0x9ab0d0, alpha: 0.5 });
    // dock, the Overlord, the jar
    const dx = this.cx;
    g.rect(dx, this.waterY - 3, 32, 3).fill(0x5a3e28);
    g.rect(dx, this.waterY - 3, 32, 1).fill(0x7a5a3a);
    for (const px of [dx + 2, dx + 14, dx + 27]) g.rect(px, this.waterY, 2, 10).fill(0x3a2818);
    drawSprite(g, OVERLORD, OVERLORD_PAL, dx + 13, this.waterY - 15);
    drawSprite(g, JAR, { w: 0x9ac0d0 }, this.jar.x, this.jar.y);
    this.drawBandLabels();
  }

  private bandLabels: PixelText[] = [];
  private drawBandLabels(): void {
    for (const t of this.bandLabels) t.destroy();
    this.bandLabels = [];
    const notation = this.ctx.game.save.meta.settings.notation;
    for (let b = 0; b < M.MAX_BANDS; b++) {
      const locked = b >= this.run.bands;
      const txt = locked
        ? b === this.run.bands
          ? `${M.BANDS[b].name}: ${formatNum(M.BANDS[b].cost, notation)} OBOLS (UPGRADES)`
          : `${M.BANDS[b].name}: LOCKED`
        : M.BANDS[b].name;
      const t = new PixelText(txt, locked ? '#7a6e80' : '#5a6a80', null);
      t.alpha = locked ? 1 : 0.7;
      t.position.set(this.cx + this.cw - 8 - t.width, Math.floor(this.depthY(b * M.BAND_PX)) + 2);
      t.eventMode = 'none';
      this.bandLabels.push(t);
      this.root.addChildAt(t, this.root.getChildIndex(this.bg) + 1);
    }
  }

  private drawSkiff(): void {
    const g = this.skiff.clear();
    g.rect(-12, 0, 24, 3).fill(0x4a3424);
    g.rect(-10, 3, 20, 1).fill(0x2a1c14);
    g.rect(-12, 0, 24, 1).fill(0x6a4a30);
    drawSprite(g, PILK_IDLE, PILK_PAL, -6, -12);
    g.rect(7, -18, 1, 22).fill(0x8a6a3a);
  }

  private drawRaft(): void {
    const n = this.run.lv.netter;
    if (n === this.lastNetters) return;
    this.lastNetters = n;
    const g = this.raft.clear();
    if (n <= 0) return;
    const shown = Math.min(5, n);
    const w = shown * 7 + 4;
    g.rect(0, 0, w, 3).fill(0x5a4030);
    g.rect(0, 0, w, 1).fill(0x7a5a3a);
    for (let i = 0; i < shown; i++) {
      drawSprite(g, IMP, IMP_PAL, 2 + i * 7, -6);
      g.rect(6 + i * 7, -8, 1, 7).fill(0x8a6a3a);
    }
  }

  // ---------- input ----------

  private local(e: FederatedPointerEvent): { x: number; y: number } {
    return this.root.toLocal(e.global);
  }

  private trySnatch(x: number, y: number, r: number): boolean {
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (Math.abs(w.x - x) <= r && Math.abs(w.y - y) <= r + 2) {
        this.snatch(i);
        return true;
      }
    }
    return false;
  }

  private riverDown(e: FederatedPointerEvent): void {
    if (this.codexOpen) return;
    const p = this.local(e);
    if (this.trySnatch(p.x, p.y, 11)) return;
    if (this.phase === 'idle' || this.phase === 'sink' || this.phase === 'wait') {
      if (this.phase !== 'idle' && this.seeker && this.seeker.state === 'seek') return;
      this.prevPhase = this.phase;
      this.phase = 'aim';
      this.updateAim(p.x, p.y);
    }
  }

  private prevPhase: Phase = 'idle';

  private riverMove(e: FederatedPointerEvent): void {
    if (this.phase !== 'aim' && this.wisps.length === 0) return;
    const p = this.local(e);
    if (this.wisps.length && this.trySnatch(p.x, p.y, 7)) return;
    if (this.phase === 'aim') this.updateAim(p.x, p.y);
  }

  private riverUp(e: FederatedPointerEvent): void {
    if (this.phase !== 'aim') return;
    const p = this.local(e);
    this.updateAim(p.x, p.y);
    if (this.aim.ok) this.cast(this.aim.x, this.aim.d);
    else this.phase = this.prevPhase === 'aim' ? 'idle' : this.prevPhase;
  }

  private updateAim(x: number, y: number): void {
    const maxD = this.run.bands * M.BAND_PX - 4;
    const ax = Math.max(this.riverL, Math.min(this.riverR, x));
    const d = Math.max(6, Math.min(maxD, (y - this.waterY - 3) / this.k));
    this.aim = { x: (ax - this.riverL) / Math.max(1, this.riverR - this.riverL), d, ok: y > this.waterY - 10 };
  }

  private zoneDown(e: FederatedPointerEvent): void {
    if (this.codexOpen) return;
    this.press = { id: e.pointerId, y0: this.local(e).y, t0: this.t, phase: this.phase, twitched: false };
    this.holding = true;
    if (this.phase === 'nibble') this.tryHook();
  }

  private zoneMove(e: FederatedPointerEvent): void {
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    if (this.phase !== 'sink' && this.phase !== 'wait') return;
    const y = this.local(e).y;
    if (!pr.twitched && pr.y0 - y >= 4 && this.twitchCd <= 0) {
      pr.twitched = true;
      this.twitch();
    }
  }

  private zoneUp(e: FederatedPointerEvent): void {
    const pr = this.press;
    if (pr && pr.id !== e.pointerId) return;
    this.holding = false;
    this.press = null;
    if (pr && pr.phase === 'idle' && this.phase === 'idle' && this.t - pr.t0 < 0.4 && !pr.twitched && this.run.aim) {
      this.cast(this.run.aim.x, Math.min(this.run.aim.d, this.run.bands * M.BAND_PX - 4));
    }
  }

  // ---------- fishing ----------

  private cast(xFrac: number, d: number): void {
    this.releaseSeeker();
    this.nib = null;
    this.hook = { x: Math.round(this.riverL + xFrac * (this.riverR - this.riverL)), d, cur: 0, jig: 0 };
    this.run.aim = { x: xFrac, d };
    this.phase = 'sink';
    this.run.stats.casts++;
    this.addRipple(this.hook.x, this.waterY, 0xc8d8f0);
    this.burst(this.hook.x, this.waterY, 6, 0xa8c0e0, 30, 60);
    sfx.plop(this.vol);
  }

  private releaseSeeker(): void {
    if (this.seeker && (this.seeker.state === 'seek' || this.seeker.state === 'nibble')) {
      this.seeker.state = 'swim';
      this.seeker.wary = 2;
    }
    this.seeker = null;
  }

  private bandOf(d: number): number {
    return Math.max(0, Math.min(this.run.bands - 1, Math.floor(d / M.BAND_PX)));
  }

  private sampleBite(): number {
    const mean = M.biteWait(this.run.lv.lantern);
    if (this.tutorial) return 1.2;
    return Math.max(0.6, -Math.log(1 - Math.random() * 0.95) * mean);
  }

  private twitch(): void {
    if (this.seeker && this.seeker.state === 'nibble') return;
    this.twitchT = 1.5;
    this.twitchCd = 1;
    this.hook.jig = 0.3;
    this.run.stats.twitches++;
    this.addRipple(this.hook.x, this.waterY, 0x9ab0d0);
    sfx.dip(this.vol);
  }

  private weights(band: number): M.Weights {
    return M.rarityWeights(this.run.bait, band, this.run.lv.scent, this.W, this.ctx.save.imports?.potions ?? 0);
  }

  private chooseBiter(): void {
    const band = this.bandOf(this.hook.d);
    const hy = this.hook.d;
    let pick: Soul | null = null;
    if (this.tutorial) {
      pick = this.spawnNear(M.SPECIES_BY_ID.clerk, band);
    } else {
      // A rare+ swimming right by the hook gets first go: aiming at it pays.
      let best = Infinity;
      for (const s of this.souls) {
        if (s.state !== 'swim' || s.wary > 0 || s.band !== band || !M.RARE_PLUS(s.sp.rarity)) continue;
        const dd = Math.abs(s.x - this.hook.x) + Math.abs(s.d - hy);
        if (dd < 34 && dd < best && Math.random() < 0.5) {
          best = dd;
          pick = s;
        }
      }
      if (!pick) {
        const rar = M.rollRarity(this.weights(band), Math.random());
        best = Infinity;
        for (const s of this.souls) {
          if (s.state !== 'swim' || s.wary > 0 || s.band !== band || s.sp.rarity !== rar) continue;
          const dd = Math.abs(s.x - this.hook.x) + Math.abs(s.d - hy);
          if (dd < 70 && dd < best) {
            best = dd;
            pick = s;
          }
        }
        if (!pick) pick = this.spawnNear(M.speciesFor(band, rar), band);
      }
    }
    if (!pick) return;
    pick.state = 'seek';
    pick.orbit = pick.sp.behavior === 'circle' ? 1.6 : 0;
    this.seeker = pick;
  }

  private beginNibble(s: Soul): void {
    s.state = 'nibble';
    let fakes = 0;
    if (!this.tutorial) {
      const p = M.fakeChance(this.W);
      while (fakes < 2 && Math.random() < p) fakes++;
      if (s.sp.behavior === 'singer') fakes++;
    }
    this.nib = { soul: s, fakes, step: 'nib', t: 0.5 + Math.random() * 0.4, twin: s.sp.behavior === 'twin' ? 1 : 0 };
    this.phase = 'nibble';
    this.addRipple(this.hook.x, this.waterY, 0xd8e0f8);
  }

  private hookWindow(): number {
    const ms = M.hookWindowMs(this.run.lv.strike, this.W);
    return (this.tutorial ? Math.max(ms, 1100) : ms) / 1000;
  }

  private updateNibble(dt: number): void {
    const n = this.nib;
    if (!n) return;
    n.t -= dt;
    if (n.t > 0) return;
    if (n.step === 'nib') {
      if (n.fakes > 0) {
        n.fakes--;
        n.step = 'dip';
        n.t = 0.22;
        sfx.dip(this.vol);
        this.addRipple(this.hook.x, this.waterY, 0xb0c0e0);
      } else {
        n.step = 'plunge';
        n.t = this.hookWindow();
        sfx.thunk(this.vol);
        this.ctx.haptic(20);
        this.nudge = 1;
        for (let i = 0; i < 3; i++) this.addRipple(this.hook.x, this.waterY, 0xfff0a0, i * 0.12);
      }
    } else if (n.step === 'dip') {
      n.step = 'nib';
      n.t = 0.4 + Math.random() * 0.5;
    } else {
      // Missed the window: the soul steals the nibble (the tutorial Clerk simply bites again).
      if (this.tutorial) {
        n.step = 'nib';
        n.t = 0.9;
        this.say('missHint', false);
        this.showFlash('TOO SLOW! AGAIN...');
        return;
      }
      this.showFlash('MISSED! IT STOLE A NIBBLE');
      this.spook();
    }
  }

  private spook(): void {
    const s = this.nib?.soul;
    if (s) this.fleeSoul(s, false);
    this.nib = null;
    this.seeker = null;
    this.phase = 'wait';
    this.biteT = this.sampleBite();
  }

  private tryHook(): void {
    const n = this.nib;
    if (!n) return;
    if (n.step !== 'plunge') {
      this.showFlash(n.step === 'dip' ? 'FAKE-OUT! SPOOKED IT' : 'TOO EARLY! SPOOKED IT');
      sfx.plip(this.vol);
      if (this.tutorial) {
        n.step = 'nib';
        n.t = 0.8;
        return;
      }
      this.spook();
      return;
    }
    if (n.twin > 0) {
      n.twin--;
      n.step = 'nib';
      n.t = 0.35;
      n.fakes = 0;
      this.showFlash('ONE! NOW THE TWIN!');
      sfx.click(this.vol);
      return;
    }
    this.startReel(n.soul);
  }

  private startReel(s: Soul): void {
    this.nib = null;
    this.phase = 'reel';
    s.state = 'hooked';
    this.run.stats.hooks++;
    const dist0 = this.hook.d + 24;
    const thrN = this.tutorial ? 1 : s.sp.thrashes + M.wrathThrashes(this.W);
    this.reel = { soul: s, dist0, dist: dist0, tension: START_TENSION, over: 0, zero: 0, thrIdx: 0, thrN, tele: 0, thr: 0, teleported: false, sway: Math.random() * 6 };
    this.showFlash(s.sp.rarity === 'legendary' ? "HERO'S ECHO!!" : 'HOOKED!');
    sfx.thunk(this.vol);
    this.ctx.haptic(15);
    this.burst(this.hook.x, this.depthY(this.hook.d), 8, 0xfff0a0, 30, 0);
    if (M.RARE_PLUS(s.sp.rarity) && !this.ctx.seen('styx.rareBite')) {
      this.ctx.markSeen('styx.rareBite');
      this.say('rareBite', false);
    }
  }

  private thrashDur(sp: M.Species): number {
    return sp.behavior === 'king' ? 1.3 : sp.behavior === 'heavy' ? 1.1 : sp.behavior === 'echo' ? 1.0 : 0.75;
  }

  private updateReel(dt: number): void {
    const R = this.reel;
    if (!R) return;
    const sp = R.soul.sp;
    if (R.tele > 0) {
      R.tele -= dt;
      if (R.tele <= 0) {
        R.thr = this.thrashDur(sp);
        sfx.creak(this.vol);
        this.ctx.haptic(15);
        this.burst(R.soul.x, this.depthY(R.soul.d), 5, 0xff6050, 25, 0);
      }
    } else if (R.thr > 0) R.thr -= dt;
    const thrashing = R.thr > 0;
    const pullK = this.tutorial ? 0.5 : (sp.pull / 30) * M.wrathPull(this.W);
    const cap = M.lineCap(this.run.lv.line);
    if (this.holding) {
      const rise = M.REEL_RISE + (thrashing ? 2 * M.REEL_RISE * pullK : 0);
      R.tension += (rise / cap) * dt;
      if (R.tension < RED) {
        const slow = sp.behavior === 'heavy' && thrashing ? 0.6 : 1;
        R.dist -= M.reelSpeed(this.run.lv.reel) * slow * dt;
        this.clickT -= dt;
        if (this.clickT <= 0) {
          this.clickT = 0.09;
          sfx.click(this.vol);
        }
      }
    } else {
      R.tension -= M.drainRate(this.run.lv.steady) * (thrashing ? 0.5 : 1) * dt;
      if (sp.behavior === 'sinker' || thrashing) R.dist = Math.min(R.dist0, R.dist + (thrashing ? 4 : 6) * dt);
    }
    R.tension = Math.max(0, Math.min(110, R.tension));
    R.over = R.tension >= 100 ? R.over + dt : 0;
    R.zero = R.tension <= 0.01 ? R.zero + dt : 0;
    const prog = 1 - R.dist / R.dist0;
    if (R.thrIdx < R.thrN && R.tele <= 0 && R.thr <= 0 && prog >= (R.thrIdx + 1) / (R.thrN + 1)) {
      R.thrIdx++;
      R.tele = this.tutorial ? 0.7 : 0.3;
      sfx.warn(this.vol);
    }
    if (sp.behavior === 'teleport' && !R.teleported && prog >= 0.5) {
      R.teleported = true;
      this.burst(R.soul.x, this.depthY(R.soul.d), 10, 0xc8a0f0, 40, 0);
      R.dist = Math.min(R.dist0, R.dist + 0.3 * R.dist0);
      R.sway += 3;
      sfx.chime(this.vol);
      this.showFlash('SHE BLINKED AWAY!');
    }
    if (R.over >= 0.4) {
      this.slip(thrashing);
      return;
    }
    if (R.zero > 2.5) {
      this.escape('IT DRIFTED LOOSE');
      return;
    }
    if (R.dist <= 0) {
      this.land();
      return;
    }
    // Soul position along the line: from the hook up to the dock.
    const p = Math.max(0, Math.min(1, 1 - R.dist / R.dist0));
    const hx = this.hook.x;
    const hy = this.hook.d;
    const ex = this.rodHand.x + 14;
    R.soul.x = hx + (ex - hx) * p + Math.sin(this.t * 2 + R.sway) * 4 * (1 - p) + (thrashing ? (Math.random() - 0.5) * 3 : 0);
    R.soul.d = hy * (1 - p) + (thrashing ? (Math.random() - 0.5) * 2 : 0);
  }

  private slip(thrashing: boolean): void {
    const R = this.reel!;
    if (Math.random() < M.barbChance(this.run.lv.barb)) {
      this.showFlash('BARBED! IT HELD!');
      this.land();
      return;
    }
    if (R.soul.sp.rarity === 'legendary' && thrashing) {
      this.run.stats.snaps++;
      sfx.snap(this.vol);
      this.escape('LINE SNAPPED!');
      this.phase = 'rerig';
      this.rerigT = 5;
      if (!this.ctx.seen('styx.snap')) {
        this.ctx.markSeen('styx.snap');
        this.say('hazardFirst', true);
      }
      return;
    }
    this.escape('THE LINE SLIPPED');
  }

  private escape(reason: string): void {
    const R = this.reel;
    this.reel = null;
    this.phase = 'idle';
    if (!R) return;
    const s = R.soul;
    this.fleeSoul(s, true);
    this.run.combo = 0;
    this.run.stats.escapes++;
    if (this.W >= 1) {
      if (this.run.gate.w !== this.W) this.run.gate = { w: this.W, lands: 0, esc: 0, rare: 0 };
      this.run.gate.esc++;
    }
    this.showFlash(reason);
    sfx.plip(this.vol);
    if (Math.random() < 0.3) this.say('escape', false);
  }

  private land(): void {
    const R = this.reel!;
    this.reel = null;
    const s = R.soul;
    const band = s.band;
    const r = this.run;
    const gilded = r.bait === 'gilded';
    const value = M.soulBase(s.sp, band) * M.comboMult(r.combo) * M.wrathActive(this.W) * M.legendMult(r) * (gilded ? M.gildedMult(this.ctx.save.imports?.potions ?? 0) : 1);
    const first = !(this.per.codex[s.sp.id] > 0);
    s.state = 'fly';
    this.fly = { soul: s, x0: s.x, y0: this.depthY(s.d), t: 0, value, first };
    this.phase = 'land';
    this.addRipple(s.x, this.waterY, 0xc8d8f0);
    this.burst(s.x, this.waterY, 10, 0xa8c0e0, 50, 80);
    sfx.splash(this.vol);
    // Book-keeping now (the fly is just the animation).
    r.combo++;
    r.stats.lands++;
    r.stats.bestCombo = Math.max(r.stats.bestCombo, r.combo);
    this.per.codex[s.sp.id] = (this.per.codex[s.sp.id] ?? 0) + 1;
    if (r.bait !== 'worm') {
      this.per.baits[r.bait] = Math.max(0, (this.per.baits[r.bait] ?? 0) - 1);
      if (this.per.baits[r.bait] <= 0) r.bait = 'worm';
    }
    if (M.RARE_PLUS(s.sp.rarity)) r.stats.rares++;
    if (s.sp.rarity === 'legendary') r.stats.legendaries++;
    if (this.W >= 1) {
      if (r.gate.w !== this.W) r.gate = { w: this.W, lands: 0, esc: 0, rare: 0 };
      r.gate.lands++;
      if (M.RARE_PLUS(s.sp.rarity)) r.gate.rare++;
      const g = r.gate;
      if (g.lands >= M.GATE_LANDS && g.rare >= 1 && g.esc / (g.lands + g.esc) <= 0.3) {
        const before = this.ctx.save.cycle.heldLevel;
        this.ctx.raiseSkill(this.W);
        if (this.W > before) {
          this.showFlash(`INFAMY! WRATH ${this.W} MASTERED`);
          this.ctx.game.toast(`SKILL GATE: WRATH ${this.W} HELD`);
        }
        r.gate = { w: this.W, lands: 0, esc: 0, rare: 0 };
      }
    }
    if (s.sp.rarity === 'legendary' && !this.ctx.seen('styx.legendary')) {
      this.ctx.markSeen('styx.legendary');
      this.say('legendary', true);
    } else if (M.RARE_PLUS(s.sp.rarity) && !this.ctx.seen('styx.rare')) {
      this.ctx.markSeen('styx.rare');
      this.say('rare', true);
    } else if (first && r.stats.lands > 1) this.say('codex', false, { name: s.sp.name.toUpperCase() });
    if (first) this.ctx.saveSoon();
  }

  private finishFly(): void {
    const f = this.fly;
    if (!f) return;
    this.fly = null;
    const s = f.soul;
    this.removeSoul(s);
    const credited = this.ctx.earn(f.value);
    this.ctx.float(`+${formatNum(credited, this.ctx.game.save.meta.settings.notation)}`, this.jar.x + 3, this.jar.y - 8, C.goldText);
    this.jarGlow = 0.6;
    this.burst(this.jar.x + 2, this.jar.y + 2, 12, 0xe8c04a, 50, 140);
    sfx.land(this.vol, this.run.combo);
    for (let i = 0; i < 4; i++) sfx.coin(this.vol, i);
    this.ctx.haptic(10);
    if (f.first) {
      const bonus = this.ctx.earn(10 * M.soulBase(s.sp, s.band));
      sfx.fanfare(this.vol);
      this.showFlash(`NEW CODEX: ${s.sp.name.toUpperCase()}!`);
      this.ctx.float(`CODEX +${formatNum(bonus, this.ctx.game.save.meta.settings.notation)}`, this.cx + Math.floor(this.cw / 2), this.waterY - 4, '#8fd14f');
    }
    if (this.phase === 'land') this.phase = 'idle';
  }

  // ---------- souls ----------

  private acquireG(id: string): Graphics {
    const g = this.pool.pop() ?? new Graphics(soulArt(id, 0));
    g.context = soulArt(id, 0);
    g.visible = true;
    g.tint = 0xffffff;
    g.alpha = 1;
    g.scale.set(1, 1);
    this.soulLayer.addChild(g);
    return g;
  }

  private spawnSoul(band: number, fromEdge: boolean, sp?: M.Species): Soul | null {
    if (this.souls.length >= MAX_SOULS) return null;
    if (!sp) {
      const rar = this.tutorial ? 'common' : M.rollRarity(this.weights(band), Math.random());
      sp = M.speciesFor(band, rar);
    }
    const left = Math.random() < 0.5;
    const x = fromEdge ? (left ? this.riverL - 4 : this.riverR + 4) : this.riverL + Math.random() * (this.riverR - this.riverL);
    const d = band * M.BAND_PX + 10 + Math.random() * (M.BAND_PX - 20);
    const speed = sp.speed * (0.5 + Math.random() * 0.3);
    const s: Soul = {
      sp,
      band,
      x,
      d,
      baseD: d,
      vx: (fromEdge ? (left ? 1 : -1) : Math.random() < 0.5 ? 1 : -1) * speed,
      t: Math.random() * 10,
      age: 0,
      life: 25 + Math.random() * 25,
      g: this.acquireG(sp.id),
      state: 'swim',
      wary: 0,
      fade: fromEdge ? 0.3 : 0,
      tongue: 0,
      orbit: 0,
    };
    this.souls.push(s);
    return s;
  }

  private spawnNear(sp: M.Species, band: number): Soul | null {
    if (this.souls.length >= MAX_SOULS) {
      // Make room: drop the soul farthest from the hook.
      let far: Soul | null = null;
      let fd = -1;
      for (const s of this.souls) {
        if (s.state !== 'swim') continue;
        const dd = Math.abs(s.x - this.hook.x) + Math.abs(s.d - this.hook.d);
        if (dd > fd) {
          fd = dd;
          far = s;
        }
      }
      if (far) this.removeSoul(far);
    }
    const s = this.spawnSoul(band, false, sp);
    if (!s) return null;
    const side = this.hook.x - this.riverL > (this.riverR - this.riverL) / 2 ? -1 : 1;
    s.x = this.hook.x + side * (26 + Math.random() * 12);
    s.d = Math.max(band * M.BAND_PX + 6, Math.min(band * M.BAND_PX + M.BAND_PX - 6, this.hook.d + (Math.random() - 0.5) * 16));
    s.baseD = s.d;
    s.fade = 0;
    return s;
  }

  private removeSoul(s: Soul): void {
    const i = this.souls.indexOf(s);
    if (i >= 0) this.souls.splice(i, 1);
    if (this.seeker === s) this.seeker = null;
    s.g.visible = false;
    this.soulLayer.removeChild(s.g);
    this.pool.push(s.g);
  }

  private fleeSoul(s: Soul, tongue: boolean): void {
    s.state = 'flee';
    s.wary = 4;
    s.vx = (s.x < (this.riverL + this.riverR) / 2 ? -1 : 1) * 55;
    s.tongue = tongue ? 1.2 : 0;
    s.baseD = s.d;
  }

  private updateSouls(dt: number): void {
    // Keep each open band stocked.
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.5;
      for (let b = 0; b < this.run.bands; b++) {
        const n = this.souls.reduce((a, s) => a + (s.band === b && s.state !== 'fly' ? 1 : 0), 0);
        if (n < PER_BAND) {
          this.spawnSoul(b, true);
          break;
        }
      }
    }
    for (let i = this.souls.length - 1; i >= 0; i--) {
      const s = this.souls[i];
      s.t += dt;
      s.age += dt;
      s.wary = Math.max(0, s.wary - dt);
      s.tongue = Math.max(0, s.tongue - dt);
      if (s.fade < 1) s.fade = Math.min(1, s.fade + dt * 1.5);
      if (s.state === 'swim') {
        const zig = s.sp.behavior === 'zigzag' ? 5 : 1.5;
        s.x += s.vx * dt;
        s.d = s.baseD + Math.sin(s.t * (s.sp.behavior === 'zigzag' ? 3 : 1.3)) * zig;
        if (s.x < this.riverL - 6 || s.x > this.riverR + 6) {
          if (s.age > s.life) {
            this.removeSoul(s);
            continue;
          }
          s.vx = -s.vx;
          s.x = Math.max(this.riverL - 6, Math.min(this.riverR + 6, s.x));
        }
      } else if (s.state === 'seek') {
        const tx = this.hook.x - 5;
        const td = this.hook.cur;
        if (s.orbit > 0) {
          s.orbit -= dt;
          const a = s.t * 4;
          s.x += (tx + Math.cos(a) * 10 - s.x) * Math.min(1, dt * 3);
          s.d += (td + Math.sin(a) * 6 - s.d) * Math.min(1, dt * 3);
        } else {
          const dx = tx - s.x;
          const dd = (td - s.d) * this.k;
          const dist = Math.hypot(dx, dd);
          const sp = Math.max(28, s.sp.speed * 2);
          if (dist < 2) {
            s.x = tx;
            s.d = td;
            if (this.phase === 'wait' && this.hook.cur >= this.hook.d) this.beginNibble(s);
          } else {
            const step = Math.min(dist, sp * dt);
            s.x += (dx / dist) * step;
            s.d += ((dd / dist) * step) / this.k;
            s.vx = dx;
          }
        }
      } else if (s.state === 'nibble') {
        s.x = this.hook.x - 5 + Math.sin(s.t * 6) * 0.8;
        s.d = this.hook.cur;
        s.vx = 1;
      } else if (s.state === 'flee') {
        s.x += s.vx * dt;
        s.d = s.baseD + Math.sin(s.t * 5) * 2;
        if (s.wary < 2.5) {
          s.state = 'swim';
          s.vx = Math.sign(s.vx) * s.sp.speed * 0.6;
        }
        if (s.x < this.riverL - 12 || s.x > this.riverR + 12) {
          this.removeSoul(s);
          continue;
        }
      }
      // draw
      const g = s.g;
      g.context = soulArt(s.sp.id, Math.floor(s.t * (s.state === 'hooked' ? 8 : 4)) & 1);
      g.scale.x = s.vx < 0 ? -1 : 1;
      if (s.state !== 'fly') g.position.set(Math.round(s.x), Math.round(this.depthY(s.d)));
      const R = this.reel;
      const hot = R && R.soul === s && (R.tele > 0 || R.thr > 0);
      g.tint = hot ? (R!.tele > 0 && Math.floor(this.t * 20) % 2 ? 0xffffff : 0xff6050) : 0xffffff;
      g.alpha = (s.state === 'flee' ? 0.7 : 0.92) * s.fade;
    }
  }

  // ---------- wisps, fog, idle ----------

  private updateWisps(dt: number): void {
    this.wispT -= dt;
    const lesson = this.obStep() === 'wisp';
    if (this.wispT <= 0 && this.wisps.length < MAX_WISPS) {
      this.wispT = lesson ? 3 : M.wispEvery(this.run.lv.wispnet) * (0.7 + Math.random() * 0.6);
      this.wisps.push({ x: this.riverR + 6, y: this.waterY - 8, vx: -(16 + Math.random() * 8), t: Math.random() * 6 });
    }
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.t += dt;
      w.x += w.vx * dt;
      w.y = this.waterY - 8 + Math.round(Math.sin(w.t * 3) * 3);
      if (w.x < this.cx + 30) {
        this.wisps.splice(i, 1);
        if (lesson) {
          this.wispPassed++;
          if (this.wispPassed >= 2) this.ctx.markSeen('styx.wispPass');
        }
      }
    }
  }

  private snatch(i: number): void {
    const w = this.wisps[i];
    this.wisps.splice(i, 1);
    const band = this.run.bands - 1;
    const value = (M.COMMON_BASE[band] / 5) * M.wispMult(this.run.lv.wispnet) * M.wrathActive(this.W) * M.legendMult(this.run);
    const got = this.ctx.earn(value);
    this.run.stats.wisps++;
    this.ctx.float(`+${formatNum(got, this.ctx.game.save.meta.settings.notation)}`, w.x, w.y - 8, '#a0f0f0');
    this.burst(w.x, w.y, 10, 0xa0f0f0, 50, 0);
    sfx.chime(this.vol);
    this.ctx.haptic(8);
  }

  private updateFog(dt: number): void {
    if (this.W < 5) {
      this.fogT = 0;
      return;
    }
    if (this.fogT > 0) this.fogT -= dt;
    else {
      this.fogCd -= dt;
      if (this.fogCd <= 0) {
        this.fogCd = 70 + Math.random() * 60;
        this.fogT = 20;
        this.showFlash('FOG SURGE! WATCH THE BOBBER');
      }
    }
  }

  private updateIdle(dt: number): void {
    const rate = M.idleObols(this.run);
    this.idleAcc += rate * dt;
    this.idleTick += dt;
    if (this.idleTick >= 1) {
      this.idleTick = 0;
      if (this.idleAcc > 0) this.netShow += this.ctx.earn(this.idleAcc);
      this.idleAcc = 0;
    }
    this.netShowT += dt;
    if (this.netShowT >= 6) {
      this.netShowT = 0;
      if (this.netShow >= 1) {
        const x = this.run.lv.netter > 0 ? this.raftX + 10 : this.cx + this.cw * this.skiffX;
        this.ctx.float(`+${formatNum(this.netShow, this.ctx.game.save.meta.settings.notation)}`, x, this.waterY - 22, '#c8b0e0');
        this.addRipple(x, this.waterY, 0x8a9cb0);
      }
      this.netShow = 0;
    }
  }

  // ---------- update ----------

  update(dt: number): void {
    this.t += dt;
    this.twitchT = Math.max(0, this.twitchT - dt);
    this.twitchCd = Math.max(0, this.twitchCd - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.jarGlow = Math.max(0, this.jarGlow - dt);
    if (this.nudge > 0) this.nudge = Math.max(0, this.nudge - dt * 8);
    this.root.y = this.nudge > 0.5 ? 1 : 0;

    this.updateIdle(dt);
    this.updateSouls(dt);

    switch (this.phase) {
      case 'sink':
        this.hook.cur = Math.min(this.hook.d, this.hook.cur + M.SINK_PX_S * dt);
        if (this.hook.cur >= this.hook.d) {
          this.phase = 'wait';
          this.biteT = this.sampleBite();
        }
        break;
      case 'wait':
        if (!this.seeker) {
          this.biteT -= dt * (this.twitchT > 0 ? 1.25 : 1);
          if (this.biteT <= 0) this.chooseBiter();
        } else if (this.seeker.state !== 'seek' && this.seeker.state !== 'nibble') this.seeker = null;
        break;
      case 'nibble':
        this.updateNibble(dt);
        break;
      case 'reel':
        this.updateReel(dt);
        break;
      case 'land':
        break;
      case 'rerig':
        this.rerigT -= dt;
        if (this.rerigT <= 0) this.phase = 'idle';
        break;
    }
    if (this.hook.jig > 0) this.hook.jig = Math.max(0, this.hook.jig - dt);
    if (this.fly) {
      const f = this.fly;
      f.t += dt / 0.55;
      const p = Math.min(1, f.t);
      const x = f.x0 + (this.jar.x + 2 - f.x0) * p;
      const y = f.y0 + (this.jar.y - f.y0) * p - Math.sin(p * Math.PI) * 26;
      f.soul.g.position.set(Math.round(x), Math.round(y));
      f.soul.g.scale.set(1 - 0.4 * p, 1 - 0.4 * p);
      if (p >= 1) this.finishFly();
    }

    this.updateWisps(dt);
    this.updateFog(dt);
    this.updateParts(dt);
    this.skiffX += this.skiffDir * dt * 0.012;
    if (this.skiffX > 0.82 || this.skiffX < 0.42) this.skiffDir = -this.skiffDir;
    this.skiff.position.set(Math.round(this.cx + this.cw * this.skiffX), this.waterY - 2 + Math.round(Math.sin(this.t * 1.5) * 0.6));
    this.drawRaft();
    this.raft.position.set(this.raftX, this.waterY - 2 + (Math.floor(this.t * 2) % 2));
    this.raft.visible = this.run.lv.netter > 0;

    this.draw();
    this.updateUi();

    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 0.5;
      this.slowChecks();
    }
  }

  // ---------- drawing ----------

  private tensionColor(t: number): number {
    if (t < 45) return lerpColor(0xf4f4f4, 0xe8c04a, t / 45);
    return lerpColor(0xe8c04a, 0xe03030, (t - 45) / 40);
  }

  /** Plots a quadratic-bezier pixel line with sag and a perpendicular wobble. */
  private plotLine(g: Graphics, x0: number, y0: number, x1: number, y1: number, sag: number, wob: number, color: number, alpha = 1): void {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 + sag;
    const len = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    let lx = NaN;
    let ly = NaN;
    for (let i = 0; i <= len; i++) {
      const u = i / len;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      const w = wob ? Math.sin(u * Math.PI) * Math.sin(this.t * 40 + u * 12) * wob : 0;
      const px = Math.round(a * x0 + b * mx + c * x1 + nx * w);
      const py = Math.round(a * y0 + b * my + c * y1 + ny * w);
      if (px === lx && py === ly) continue;
      lx = px;
      ly = py;
      g.rect(px, py, 1, 1).fill({ color, alpha });
    }
  }

  private draw(): void {
    const g = this.lineG.clear();
    const R = this.reel;
    const tension = R ? R.tension : 0;
    // rod: bends with tension
    const bend = R ? Math.min(8, tension / 12) : this.phase === 'nibble' && this.nib?.step === 'plunge' ? 3 : 0;
    const tipX = this.rodHand.x + 14 - Math.round(bend * 0.4);
    const tipY = this.rodHand.y - 14 + Math.round(bend);
    this.plotLine(g, this.rodHand.x, this.rodHand.y, tipX, tipY, -2 + bend * 0.3, 0, 0x8a6a3a);

    const hx = this.hook.x;
    const fishing = this.phase === 'sink' || this.phase === 'wait' || this.phase === 'nibble';
    if (fishing) {
      // Line to the bobber, then a thin leader down to the hook.
      const n = this.nib;
      let by = this.waterY - 1;
      if (this.hook.jig > 0) by -= 1;
      if (n?.step === 'dip') by += 2;
      if (n?.step === 'plunge') by += 3;
      const pale = this.phase === 'nibble';
      this.plotLine(g, tipX, tipY, hx, by, 6, 0, pale ? 0xb8d0ff : 0xe8e8f0);
      const hy = this.depthY(this.hook.cur);
      for (let y = by + 2; y < hy; y += 1) g.rect(hx, y, 1, 1).fill({ color: 0xc8d0e0, alpha: 0.35 });
      g.rect(hx - 1, Math.round(hy), 1, 2).fill(0xe8dcc0);
      g.rect(hx, Math.round(hy) + 2, 1, 1).fill(0xe8dcc0);
      g.rect(hx + 1, Math.round(hy), 1, 2).fill(0xe8dcc0);
      // bobber
      g.rect(hx - 1, by - 1, 3, 2).fill(0xe04040);
      g.rect(hx - 1, by + 1, 3, 1).fill(0xf4f4f4);
      if (n) {
        const ringC = n.step === 'plunge' ? (Math.floor(this.t * 16) % 2 ? 0xfff070 : 0xffffff) : 0xb8c8f0;
        const rr = n.step === 'plunge' ? 6 : 4;
        this.ring(g, hx, by, rr, ringC, n.step === 'plunge' ? 1 : 0.6);
      }
      if (this.twitchT > 0) this.ring(g, hx, this.waterY, 3 + Math.floor((1.5 - this.twitchT) * 6), 0x9ab0d0, this.twitchT / 1.5 * 0.6);
    } else if (R) {
      const sx = Math.round(R.soul.x);
      const sy = Math.round(this.depthY(R.soul.d)) - 3;
      const col = this.tensionColor(tension);
      const sag = Math.max(0, (60 - tension) / 6);
      const wob = tension > 50 ? ((tension - 50) / 50) * 1.8 : 0;
      this.plotLine(g, tipX, tipY, sx, sy, sag, wob, col);
      if (tension >= RED && Math.floor(this.t * 12) % 2) this.ring(g, sx, sy + 3, 7, 0xe03030, 0.7);
    } else if (this.phase === 'land' && this.fly) {
      // the line flicks up after the catch
      this.plotLine(g, tipX, tipY, Math.round(this.fly.soul.g.x), Math.round(this.fly.soul.g.y), 2, 0, 0xe8e8f0, 0.6);
    } else {
      this.plotLine(g, tipX, tipY, tipX + 1, this.waterY - 1, 0, 0, 0xe8e8f0, 0.7);
    }

    // aim preview: dotted line to the entry point, then down to the depth
    this.aimText.visible = false;
    if (this.phase === 'aim') {
      const ax = Math.round(this.riverL + this.aim.x * (this.riverR - this.riverL));
      const ay = Math.round(this.depthY(this.aim.d));
      for (let i = 0; i < 10; i++) {
        const u = i / 10;
        const px = Math.round(tipX + (ax - tipX) * u);
        const py = Math.round(tipY + (this.waterY - tipY) * u - Math.sin(u * Math.PI) * 10);
        g.rect(px, py, 1, 1).fill(0xf4e8c1);
      }
      for (let y = this.waterY + 2; y < ay; y += 3) g.rect(ax, y, 1, 1).fill({ color: 0xf4e8c1, alpha: 0.8 });
      g.rect(ax - 2, ay, 5, 1).fill(0xfff070);
      g.rect(ax, ay - 2, 1, 5).fill(0xfff070);
      const b = this.bandOf(this.aim.d);
      this.aimText.set(M.BANDS[b].name);
      this.aimText.visible = true;
      const tx = ax + 5 + this.aimText.width > this.riverR ? ax - 5 - this.aimText.width : ax + 5;
      this.aimText.position.set(Math.round(tx), ay - 3);
    }

    // fog surge: over the souls, under the line and bobber
    const f = this.fog.clear();
    if (this.fogT > 0) {
      const a = Math.min(1, this.fogT, 20 - this.fogT) * 0.55;
      f.rect(0, this.waterY + 1, this.ctx.layout.w, this.ctrlTop - this.waterY - 1).fill({ color: 0x8a90a8, alpha: a });
      for (let i = 0; i < 6; i++) {
        const y = this.waterY + 10 + i * Math.floor((this.ctrlTop - this.waterY) / 6);
        const x = Math.round(((this.t * (6 + i * 2) + i * 40) % (this.cw + 60)) - 30 + this.cx);
        f.rect(x, y, 40, 4).fill({ color: 0xb0b8c8, alpha: a * 0.6 });
      }
    }

    // fx: ripples, particles, wisps, sparkles, tongues, jar glow, ghost hint
    const x = this.fx.clear();
    for (const r of this.ripples) {
      if (r.life > r.max) continue;
      const p = Math.max(0, r.life / r.max);
      const rad = Math.round(2 + p * 10);
      const a = (1 - p) * 0.8;
      x.rect(r.x - rad, r.y, rad * 2 + 1, 1).fill({ color: r.color, alpha: a * 0.4 });
      x.rect(r.x - rad - 1, r.y, 2, 1).fill({ color: r.color, alpha: a });
      x.rect(r.x + rad, r.y, 2, 1).fill({ color: r.color, alpha: a });
    }
    for (const w of this.wisps) {
      const wx = Math.round(w.x);
      x.rect(wx + 2, w.y, 4, 1).fill({ color: 0x60c0c0, alpha: 0.4 });
      x.rect(wx - 1, w.y - 1, 3, 3).fill({ color: 0xa0f0f0, alpha: 0.5 });
      x.rect(wx, w.y, 1, 1).fill(0xffffff);
      x.rect(wx, w.y - 2, 1, 1).fill({ color: 0xa0f0f0, alpha: 0.6 });
    }
    for (const s of this.souls) {
      if (s.tongue > 0) x.rect(Math.round(s.x) + (s.vx < 0 ? 2 : -3), Math.round(this.depthY(s.d)) + 1, 2, 1).fill(0xf080a0);
      if (M.RARE_PLUS(s.sp.rarity) && s.state !== 'fly' && Math.floor(s.t * 5 + s.x) % 4 === 0) {
        const col = s.sp.rarity === 'legendary' ? 0xffe070 : 0xc0a0ff;
        x.rect(Math.round(s.x) + Math.round(Math.sin(s.t * 7) * 5), Math.round(this.depthY(s.d)) - 6, 1, 1).fill(col);
        if (s.state === 'flee') x.rect(Math.round(s.x) - Math.sign(s.vx) * 6, Math.round(this.depthY(s.d)), 3, 1).fill({ color: col, alpha: 0.6 });
      }
    }
    for (const p of this.parts) x.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill({ color: p.color, alpha: Math.min(1, p.life / p.max * 1.5) });
    if (this.jarGlow > 0) x.rect(this.jar.x - 1, this.jar.y - 1, 7, 7).fill({ color: 0xe8c04a, alpha: this.jarGlow * 0.5 });
    const step = this.obStep();
    if (step === 'cast' && this.phase === 'idle') {
      const u = (this.t % 2) / 2;
      const gx = Math.round(this.riverL + 30);
      const gy = Math.round(this.waterY + 8 + u * 60);
      x.circle(gx, gy, 3).fill({ color: 0xffffff, alpha: 0.5 * (1 - u * 0.5) });
    }
    if (step === 'wisp' && this.wisps.length) {
      const w = this.wisps[0];
      const u = (this.t % 1) / 1;
      x.circle(Math.round(w.x), Math.round(w.y + 12 - u * 12), 2).fill({ color: 0xffffff, alpha: 0.5 * (1 - u) });
    }
  }

  private ring(g: Graphics, cx: number, cy: number, r: number, color: number, alpha: number): void {
    const n = Math.max(8, r * 5);
    let lx = NaN;
    let ly = NaN;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * r);
      const py = Math.round(cy + Math.sin(a) * r * 0.5);
      if (px === lx && py === ly) continue;
      lx = px;
      ly = py;
      g.rect(px, py, 1, 1).fill({ color, alpha });
    }
  }

  private addRipple(x: number, y: number, color: number, delay = 0): void {
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x: Math.round(x), y: Math.round(y), life: -delay, max: 0.8, color });
  }

  private burst(x: number, y: number, n: number, color: number, speed: number, grav: number): void {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 0.4 + Math.random() * 0.4;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (grav ? speed * 0.6 : 0), life, max: life, color, grav });
    }
  }

  private updateParts(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life += dt;
      if (r.life > r.max) this.ripples.splice(i, 1);
    }
  }

  // ---------- ui ----------

  private showFlash(text: string): void {
    this.flash = text;
    this.flashT = 1.6;
  }

  private statusLine(): string {
    if (this.flashT > 0) return this.flash;
    const R = this.reel;
    switch (this.phase) {
      case 'idle':
        return this.run.aim ? 'DRAG IN THE RIVER, OR TAP HERE TO RECAST' : 'DRAG DOWN IN THE RIVER TO CAST';
      case 'aim':
        return `LET GO TO CAST: ${M.BANDS[this.bandOf(this.aim.d)].name}`;
      case 'sink':
        return 'SINKING...';
      case 'wait':
        return this.twitchCd > 0 ? 'TWITCH! SOULS PERK UP...' : 'WAITING... FLICK UP HERE TO TWITCH';
      case 'nibble':
        return this.nib?.step === 'plunge' ? 'NOW! TAP!' : 'NIBBLE... WAIT FOR THE PLUNGE';
      case 'reel':
        if (!R) return '';
        if (R.tension >= RED) return 'RED! EASE OFF!';
        if (R.tele > 0 || R.thr > 0) return 'THRASH! LET GO!';
        return this.holding ? 'REELING...' : 'HOLD TO REEL';
      case 'land':
        return 'LANDED!';
      case 'rerig':
        return `LINE SNAPPED. IMP SPLICING... ${Math.ceil(this.rerigT)}`;
    }
  }

  private updateUi(): void {
    const line = this.statusLine();
    const maxW = this.cw - 6;
    const shown = measure(line).w > maxW ? line.slice(0, Math.floor((maxW + 1) / 4)) : line;
    const hot = this.phase === 'nibble' && this.nib?.step === 'plunge';
    const red = this.reel && (this.reel.tension >= RED || this.reel.tele > 0 || this.reel.thr > 0);
    this.status.set(shown, hot ? '#fff070' : red ? '#e05050' : C.ink);
    this.status.x = this.cx + Math.floor((this.cw - this.status.width) / 2);

    // REEL disk with the tension arc around it
    const d = this.disk.clear();
    const dcx = this.cx + Math.floor(this.cw / 2);
    const dcy = this.ctrlTop + 35;
    const r = 17;
    const pulse = Math.floor(this.t * 4) % 2 === 0;
    let fill = 0x3a2a4a;
    let label = 'CAST';
    if (this.phase === 'nibble') {
      label = 'HOOK';
      fill = hot ? (pulse ? 0xfff070 : 0xe8c04a) : 0x6a6a8a;
    } else if (this.phase === 'reel') {
      label = 'REEL';
      fill = this.holding ? 0x8fd14f : pulse ? 0x6a9a3a : 0x4a7a22;
    } else if (this.phase === 'sink' || this.phase === 'wait') {
      label = 'WAIT';
      fill = 0x3a4a6a;
    } else if (this.phase === 'idle') {
      label = this.run.aim ? 'CAST' : 'CAST';
      fill = this.run.aim ? 0x4a3a6a : 0x3a2a4a;
    } else if (this.phase === 'rerig') {
      label = '...';
    } else if (this.phase === 'land') label = 'NICE';
    d.circle(dcx, dcy, r + 1).fill(0x0a0410);
    d.circle(dcx, dcy + (this.holding ? 1 : 0), r - 1).fill(fill);
    d.circle(dcx - 4, dcy - 5 + (this.holding ? 1 : 0), 4).fill({ color: 0xffffff, alpha: 0.12 });
    const ten = this.reel ? this.reel.tension : 0;
    const segs = 48;
    const lit = Math.round((Math.min(100, ten) / 100) * segs);
    for (let i = 0; i < segs; i++) {
      const a = -Math.PI / 2 + (i / segs) * Math.PI * 2;
      const col = i < lit ? this.tensionColor((i / segs) * 100) : 0x2a2030;
      for (const rr of [r + 3, r + 4]) d.rect(Math.round(dcx + Math.cos(a) * rr), Math.round(dcy + Math.sin(a) * rr), 1, 1).fill(col);
    }
    this.diskText.set(label, fill === 0x3a2a4a || fill === 0x3a4a6a || fill === 0x4a3a6a || label === '...' ? '#f4e8c1' : '#140c1c');
    this.diskText.position.set(dcx - Math.floor(this.diskText.width / 2), dcy - 2 + (this.holding ? 1 : 0));

    // combo and gate
    const combo = this.run.combo;
    this.comboText.set(combo > 0 ? `COMBO ${combo} X${M.comboMult(combo).toFixed(2)}` : '');
    const target = this.ctx.def.skillTarget(this.ctx.save.cycle.n);
    if (this.run.bands >= 2) {
      const g = this.run.gate;
      const live = g.w === this.W && this.W >= 1;
      const lands = live ? g.lands : 0;
      const esc = live ? g.esc : 0;
      const pct = lands + esc > 0 ? Math.round((100 * esc) / (lands + esc)) : 0;
      const txt = this.W < 1 ? `GATE: SET WRATH ${target}` : `W${this.W} ${lands}/${M.GATE_LANDS} ESC${pct}% R${live && g.rare ? '+' : '-'}`;
      this.gateText.set(txt, this.W >= target ? (pct > 30 ? C.redText : C.greenText) : C.inkDim);
      this.gateText.x = this.cx + this.cw - 3 - this.gateText.width;
    } else this.gateText.set('');
    this.refreshButtons();
  }

  private refreshButtons(): void {
    const notation = this.ctx.game.save.meta.settings.notation;
    const bait = this.run.bait;
    const bkey = `${bait}:${this.per.baits[bait] ?? 0}`;
    if (bkey !== this.shownBait) {
      this.shownBait = bkey;
      this.baitBtn.setLabel('BAIT', bait === 'worm' ? 'WORM' : `${M.BAITS[bait].short} ${this.per.baits[bait]}`);
      this.baitBtn.setColor(bait === 'worm' ? C.edge : BAIT_COLOR[bait], bait === 'worm' ? 0x3a2046 : 0x2a2a3a);
    }
    const cc = `${M.codexCount(this.per)}`;
    if (cc !== this.shownCodex) {
      this.shownCodex = cc;
      this.codexBtn.setLabel('CODEX', `${cc}/${M.SPECIES.length}`);
    }
    const open = this.run.bands >= 2;
    const max = this.run.wrathMax;
    const cost = max < M.WRATH_MAX ? M.wrathCost(max + 1) : 0;
    const affordable = max < M.WRATH_MAX && this.run.bank >= cost;
    const wkey = `${open}:${this.run.wrath}:${max}:${affordable}:${notation}`;
    if (wkey !== this.shownWrath) {
      this.shownWrath = wkey;
      this.wDown.visible = this.wUp.visible = this.wBuy.visible = open;
      if (open) {
        this.wrathText.set(`WRATH ${this.run.wrath}/${max}`, '#e05050');
        this.wDown.setEnabled(this.run.wrath > 0);
        this.wUp.setEnabled(this.run.wrath < max);
        if (max >= M.WRATH_MAX) this.wBuy.setLabel('MAX').setEnabled(false);
        else this.wBuy.setLabel(`+${max + 1} ${formatNum(cost, notation)}`).setEnabled(affordable);
      } else this.wrathText.set('WRATH\nOPENS AT\nTHE MURK', '#7a6e80');
    }
  }

  private cycleBait(): void {
    const order = M.BAIT_ORDER;
    let i = order.indexOf(this.run.bait);
    for (let k = 0; k < order.length; k++) {
      i = (i + 1) % order.length;
      const id = order[i];
      if (id === 'worm' || (this.per.baits[id] ?? 0) > 0) {
        this.run.bait = id;
        break;
      }
    }
    sfx.click(this.vol);
    if (this.run.bait === 'worm' && M.BAIT_ORDER.every((b) => b === 'worm' || !(this.per.baits[b] > 0))) {
      this.showFlash('NO BAIT. CRAFT SOME: UPGRADES, BAIT');
    } else this.showFlash(`${M.BAITS[this.run.bait].name.toUpperCase()}`);
  }

  private setWrath(w: number): void {
    const v = Math.max(0, Math.min(this.run.wrathMax, w));
    if (v === this.run.wrath) return;
    this.run.wrath = v;
    sfx.click(this.vol);
  }

  private buyWrath(): void {
    const r = this.run;
    if (r.bands < 2 || r.wrathMax >= M.WRATH_MAX) return;
    const cost = M.wrathCost(r.wrathMax + 1);
    if (!this.ctx.spend(cost)) return;
    r.wrathMax++;
    r.wrath = r.wrathMax;
    sfx.warn(this.vol);
    this.burst(this.cx + this.cw - 28, this.ctrlTop + 20, 10, 0xe05050, 40, 0);
    this.ctx.saveSoon();
    if (r.wrathMax === 1) this.say('wrathLesson', true);
    else if (r.wrathMax % 5 === 0) this.say('dialRaised', true);
  }

  private onBuy(id: string): void {
    sfx.click(this.vol);
    if (id === 'netter' && this.run.lv.netter === 5) this.say('firstHelper', true);
    if (id === 'deeper') {
      this.drawBackground();
      for (let i = 0; i < PER_BAND; i++) this.spawnSoul(this.run.bands - 1, false);
      this.ctx.saveSoon();
      if (this.run.bands === 2) this.say('murk', true);
      if (this.run.bands === 3) this.say('halls', true);
    }
    if (id.startsWith('bait.') && this.run.stats.baitsCrafted === 1) {
      this.run.bait = id.slice(5) as M.BaitId;
      this.say('baitLesson', true);
    }
  }

  private say(trigger: string, milestone: boolean, vars?: Record<string, string | number>): void {
    if (milestone) sfx.pilk(this.vol, 3);
    this.ctx.say(trigger, { milestone, vars });
  }

  private obStep(): string | null {
    const s = this.ctx.save;
    if (s.seen.onboardingDone) return null;
    for (const st of this.ctx.def.onboarding) if (!s.seen[`ob.${st.id}`]) return st.id;
    return null;
  }

  private slowChecks(): void {
    const b = this.badge.clear();
    if (anyAffordable(this.groups)) {
      b.rect(0, 0, 9, 9).fill(0x0a0410);
      b.rect(1, 1, 7, 7).fill(C.red);
      b.rect(4, 2, 1, 3).fill(0xffffff);
      b.rect(4, 6, 1, 1).fill(0xffffff);
    }
    const intense = this.phase === 'nibble' || this.phase === 'reel' || this.phase === 'aim';
    this.flavorT -= 0.5;
    if (this.flavorT <= 0 && !intense) {
      this.flavorT = 50;
      this.ctx.say('flavor');
    }
    // keep the upgrade pulse on the netter during that onboarding step
    if (this.obStep() === 'hire') this.upgBtn.alpha = Math.floor(this.t * 3) % 2 ? 1 : 0.7;
    else this.upgBtn.alpha = 1;
  }

  // ---------- codex ----------

  private openCodex(): void {
    if (this.codexOpen) return;
    this.codexOpen = true;
    sfx.click(this.vol);
    const L = this.ctx.layout;
    const m = this.modal;
    const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.7 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.closeCodex());
    m.addChild(dim);
    const rowH = 19;
    const w = this.cw - 6;
    const h = Math.min(this.bottom - this.top - 4, 30 + M.SPECIES.length * rowH);
    const x = this.cx + 3;
    const y = this.bottom - h - 2;
    const panel = new Graphics();
    drawPanel(panel, x, y, w, h, 0x1c2030, 0x4a5a7a);
    panel.eventMode = 'static';
    panel.on('pointertap', () => this.closeCodex());
    m.addChild(panel);
    const title = new PixelText(`SOUL CODEX  ${M.codexCount(this.per)}/${M.SPECIES.length}`, C.goldText);
    title.position.set(x + 6, y + 6);
    const hint = new PixelText('TAP TO CLOSE', C.inkDim);
    hint.position.set(x + w - 6 - hint.width, y + 6);
    m.addChild(title, hint);
    const rows = Math.max(1, Math.floor((h - 22) / rowH));
    const notation = this.ctx.game.save.meta.settings.notation;
    M.SPECIES.slice(0, rows).forEach((sp, i) => {
      const ry = y + 18 + i * rowH;
      const n = this.per.codex[sp.id] ?? 0;
      const bgr = new Graphics().rect(x + 3, ry, w - 6, rowH - 1).fill(i % 2 ? 0x22283a : 0x262e42);
      m.addChild(bgr);
      const sz = soulSize(sp.id);
      const icon = new Graphics(soulArt(sp.id, 0));
      icon.position.set(x + 11, ry + Math.floor(rowH / 2));
      if (sz.h > 12) icon.scale.set(0.8);
      if (n <= 0) {
        icon.tint = 0x000000;
        icon.alpha = 0.6;
      }
      m.addChild(icon);
      const rar = sp.rarity.toUpperCase();
      const band = sp.band < 0 ? 'ANY' : M.BANDS[sp.band].name;
      const val = sp.band < 0 ? '50X' : formatNum(sp.base, notation);
      const col = sp.rarity === 'legendary' ? '#ffe070' : sp.rarity === 'rare' ? '#c0a0ff' : sp.rarity === 'uncommon' ? '#8fd14f' : C.ink;
      const t1 = new PixelText(n > 0 ? `${sp.name.toUpperCase()} X${n}` : '???', n > 0 ? col : '#7a6e80');
      t1.position.set(x + 22, ry + 2);
      const t2 = new PixelText(n > 0 ? wrap(`${sp.note}`, w - 30).split('\n')[0] : `${rar}, ${band}  {coin}${val}`, C.inkDim);
      t2.position.set(x + 22, ry + 10);
      m.addChild(t1, t2);
    });
  }

  private closeCodex(): void {
    if (!this.codexOpen) return;
    this.codexOpen = false;
    this.modal.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  // ---------- lifecycle ----------

  resize(_layout: Layout): void {
    this.closeCodex();
    this.buildLayout();
  }

  destroy(): void {
    this.closeCodex();
    this.riverHit.removeAllListeners();
    this.zoneHit.removeAllListeners();
    for (const t of this.bandLabels) t.destroy();
    this.bandLabels = [];
    // Pooled soul graphics share cached contexts: detach them before destroying.
    for (const s of this.souls) this.pool.push(s.g);
    for (const g of this.pool) {
      g.parent?.removeChild(g);
      g.destroy({ context: false });
    }
    this.pool = [];
    this.souls = [];
    for (const g of this.ownedG) {
      g.parent?.removeChild(g);
      g.destroy();
    }
    this.root.destroy({ children: true });
  }
}
