// The River Styx scene (specs/03): cast into the black river, read the nibble, set the hook on the
// plunge, then hold to reel while the line's colour and wobble show the tension. Imp netters and
// Pilk's skiff fish on their own; wisps skim the surface for a quick snatch.
// v1.1 (03 §15 "Later"): five depth bands (the view rescales as bands open), the Trophy Wall
// (KEEP a rare instead of selling it), Twin Hooks, the Lantern Eel, Ripper souls at Wrath 10,
// escaped-rare trails, CLEAN reels, the legendary zoom and Pilk's net-sorting return ritual.
// All numbers live in model.ts; art in art.ts. Pooled souls and particles, fixed PixelTexts.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, SayOpts, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure, wrap } from '../../ui/font';
import { Button, C, drawPanel, drawSprite } from '../../ui/widgets';
import * as M from './model';
import { BAIT_COLOR, EEL, EEL_PAL, IMP, IMP_PAL, JAR, OVERLORD, OVERLORD_PAL, PILK_IDLE, PILK_PAL, PLAQUE, soulArt, soulSize, soulTint } from './art';
import { sfx } from './sfx';
import { anyAffordable, buildGroups } from './upgrades';
import { destroyTree } from '../../ui/destroy';
import type { Juice } from '../../ui/juice';
import { sfx as coreSfx } from '../../core/audio';

const SURF = 48;
const CTRL = 90;
const MAX_SOULS = 16;
const PER_BAND = 3;
const MAX_PARTS = 160;
const MAX_RIPPLES = 14;
const MAX_WISPS = 3;
const RED = M.RED;
const START_TENSION = 25;
const KEEP_S = 5; // the KEEP / SELL offer for a trophy-worthy catch
const TRAIL_S = 60; // an escaped rare's glowing trail (03 §4)
const SCOUT_S = 240; // Night Order SCOUT A RARE: the spotted soul's trail
const RITUAL_S = 6;
const RITUAL_SOULS = 6;

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

interface Ripper {
  at: number; // reel progress at which the fin shows
  warn: number; // countdown to the crossing (< 0 = not yet shown)
  dir: number; // -1 = from the right, 1 = from the left
  after: number; // swim-off animation after the crossing
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
  red: boolean; // touched the red: no CLEAN bonus
  pair: boolean; // the Abyss Chorister's second thrash is due
  beat: number; // the Choirmaster's rhythm
  dived: boolean;
  rip: Ripper | null;
  zt: number; // seconds into the reel (the gold band's clock)
  zseed: number;
  zc: number; // the gold band's centre now (tension %)
  inZ: boolean; // holding with the tension inside it
  goldT: number; // seconds reeled in the gold
}

interface Fly {
  soul: Soul;
  x0: number;
  y0: number;
  t: number;
  value: number;
  first: boolean;
  clean: boolean;
  heft: number;
  stars: number;
  record: boolean;
}

/** The reveal card (Wave 1, research R3): name, stars, heft, NEW RECORD. */
interface Card {
  t: number;
  max: number;
  blink: boolean;
}

const STAR = ['..x..', 'xxxxx', '.xxx.', '.x.x.'];
const CARD_W = 120;
const CARD_H = 28;
const TIER_COL = [0, 0xb07040, 0xc8d0dc, 0xffd040];
const gaussRnd = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());

interface Pending {
  sp: M.Species;
  band: number;
  value: number;
  t: number;
}

interface Trail {
  sp: M.Species;
  band: number;
  x: number;
  d: number;
  t: number;
}

interface RitualSoul {
  g: Graphics;
  sp: M.Species;
  x: number;
  y: number;
  keeper: boolean;
  state: 'flop' | 'kept' | 'tossed';
  t: number;
  vx: number;
  vy: number;
}

interface Ritual {
  souls: RitualSoul[];
  t: number;
  keepers: number;
  kept: number;
  wrong: number;
  done: (score: number) => void;
}

const lerpColor = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

const BAND_COLS = [
  [0x1a2a3a, 0x16243a],
  [0x102a24, 0x0e241e],
  [0x14182a, 0x101424],
  [0x2a1018, 0x240c14],
  [0x24262e, 0x1e2028],
];
const BAND_ACCENT = [0x8a9cb0, 0x3ac08a, 0x6a7ac0, 0xe05050, 0xe8e8f0];
const LINE_NODES = new Set(['reel', 'line', 'steady', 'strike', 'barb']);
const BAND_LESSON = ['', 'murk', 'halls', 'choir', 'lethe'];

export class StyxScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.StyxRun;
  private per: M.StyxPersistent;
  private groups: UpgradeGroup[];

  // layers
  private world = new Container();
  private worldMask = new Graphics();
  private bg = new Graphics();
  private skiff = new Graphics();
  private raft = new Graphics();
  private soulLayer = new Container();
  private ritualLayer = new Container();
  private fog = new Graphics();
  private lineG = new Graphics();
  private fx = new Graphics();
  private over = new Graphics();
  private ui = new Container();
  private modal = new Container();
  private riverHit = new Container();
  private zoneHit = new Container();
  private aimText = new PixelText('', '#f4e8c1');
  private bannerText = new PixelText('', C.goldText);
  private ripG = new Graphics(soulArt('ripper', 0));
  // the reveal card (positioned on layout)
  private cardBox = new Container();
  private cardG = new Graphics();
  private cardIcon = new Graphics(soulArt('clerk', 0));
  private cardName = new PixelText('', C.ink);
  private cardSub = new PixelText('', C.inkDim);
  private cardStamp = new PixelText('', '#ff6050');
  private card: Card | null = null;

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
  private keepBtn!: Button;
  private sellBtn!: Button;
  private ownedG: Graphics[] = [];

  // layout
  private cx = 0;
  private cw = 0;
  private top = 0;
  private bottom = 0;
  private waterY = 0;
  private ctrlTop = 0;
  private k = 1;
  private shownBands = 3;
  private riverL = 0;
  private riverR = 0;
  private rodHand = { x: 0, y: 0 };
  private jar = { x: 0, y: 0 };
  private raftX = 0;
  private wallX = 0;
  private wallY = 0;

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
  private pending: Pending | null = null;
  private trail: Trail | null = null;
  private ritual: Ritual | null = null;
  private hooksLeft = 0;
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
  private zoom = 0;
  private heartT = 0;
  private flash = '';
  private flashT = 0;
  private slowT = 0;
  private flavorT = 90;
  private skiffX = 0.6;
  private skiffDir = 1;
  private clickT = 0;
  private lastNetters = -1;
  private lastBands = 0;
  private lastWall = '';
  private shownWrath = '';
  private shownBait = '';
  private shownCodex = '';
  private shownKeep = '';
  private codexOpen = false;
  private destroyed = false;
  private onSheet = () => (this.obStep() === 'hire' ? [...this.groups.filter((g) => g.name === 'Imps'), ...this.groups.filter((g) => g.name !== 'Imps')] : this.groups);

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.run = ctx.save.run as M.StyxRun;
    this.per = ctx.save.persistent as M.StyxPersistent;
    M.normalize(this.run, this.per);
    // Chum Barrel (D-styx-01): bait the netters used while this department was off screen.
    this.settleChum(Date.now(), 12 * 3600);
    this.groups = buildGroups(ctx, { onBuy: (id) => this.onBuy(id) });

    this.ownedG.push(this.bg, this.skiff, this.raft, this.fog, this.lineG, this.fx, this.over, this.worldMask);
    for (const d of [this.bg, this.skiff, this.raft, this.soulLayer, this.ritualLayer, this.fog, this.lineG, this.fx, this.aimText, this.over, this.bannerText, this.ripG]) d.eventMode = 'none';
    this.ripG.visible = false;
    this.world.addChild(this.bg, this.skiff, this.raft, this.soulLayer, this.ripG, this.fog, this.lineG, this.fx, this.ritualLayer, this.aimText);
    this.world.mask = this.worldMask;
    this.world.eventMode = 'none';
    this.cardBox.addChild(this.cardG, this.cardIcon, this.cardName, this.cardSub, this.cardStamp);
    this.cardBox.eventMode = 'none';
    this.cardBox.visible = false;
    this.ownedG.push(this.cardG);
    this.root.addChild(this.world, this.worldMask, this.riverHit, this.over, this.bannerText, this.cardBox, this.ui, this.modal);
    this.root.eventMode = 'static';

    this.riverHit.eventMode = 'static';
    this.riverHit.on('pointerdown', (e: FederatedPointerEvent) => this.riverDown(e));
    this.riverHit.on('globalpointermove', (e: FederatedPointerEvent) => this.riverMove(e));
    this.riverHit.on('pointerup', (e: FederatedPointerEvent) => this.riverUp(e));
    this.riverHit.on('pointerupoutside', (e: FederatedPointerEvent) => this.riverUp(e));

    this.buildLayout();
    for (let b = 0; b < this.run.bands; b++) for (let i = 0; i < PER_BAND; i++) this.spawnSoul(b, false);
    this.takeScout();
  }

  /** Night Order SCOUT A RARE: the soul Pilk spotted waits as a glowing trail (an escaped rare's
   * wake, 03 §4) for a few minutes; cast into it and it is keen to bite. */
  private takeScout(): void {
    const sc = this.per.scout;
    if (!sc) return;
    delete this.per.scout;
    const sp = M.SPECIES_BY_ID[sc.id];
    if (!sp || sc.band >= this.run.bands || this.tutorial) return;
    const x = this.riverL + (0.3 + 0.5 * Math.random()) * (this.riverR - this.riverL);
    this.trail = { sp, band: sc.band, x, d: sc.band * M.BAND_PX + M.BAND_PX / 2, t: SCOUT_S };
    this.showFlash(`PILK: ${sp.name.toUpperCase()} THERE! CAST!`);
    this.ctx.saveSoon();
  }

  private get W(): number {
    return this.run.wrath;
  }

  /** The shared juice kit (ui/juice.ts): shake, hit-stop, sized pops, coins to the bank. */
  private get juice(): Juice | undefined {
    return (this.ctx.game as { juice?: Juice }).juice;
  }

  /** A sized "+N" pop (the juice kit), or the plain float without it. */
  private popValue(amount: number, x: number, y: number, color: string, coins = 0): void {
    const j = this.juice;
    if (!j) {
      this.ctx.float(`+${formatNum(amount, this.notation)}`, x, y, color);
      return;
    }
    const tier = j.popValue(amount, x, y, { color: color === C.goldText ? undefined : color });
    if (coins > 0) j.coinFly(x, y + 6, coins + tier * 2);
  }

  private get vol(): number {
    return this.ctx.game.save.meta.settings.sfx ?? 0.6;
  }

  private get tutorial(): boolean {
    return this.run.stats.lands === 0;
  }

  private get notation() {
    return this.ctx.game.save.meta.settings.notation;
  }

  // ---------- layout ----------

  private depthY(d: number): number {
    return this.waterY + 3 + d * this.k;
  }

  private buildLayout(): void {
    const c = this.ctx.content();
    const L = this.ctx.layout;
    this.cx = c.x;
    this.cw = c.w;
    this.top = c.y;
    this.bottom = c.y + c.h;
    this.waterY = this.top + SURF;
    this.ctrlTop = this.bottom - CTRL;
    // The view holds the open bands plus the next locked one (at least three), so the river
    // rescales as bands open instead of scrolling (03 §5.1 bands 4-5).
    this.shownBands = Math.min(M.MAX_BANDS, Math.max(3, this.run.bands + 1));
    this.k = Math.max(0.4, (this.ctrlTop - this.waterY - 6) / (this.shownBands * M.BAND_PX));
    this.lastBands = this.run.bands;
    this.riverL = this.cx + 36;
    this.riverR = this.cx + this.cw - 10;
    this.rodHand = { x: this.cx + 21, y: this.waterY - 11 };
    this.jar = { x: this.cx + 3, y: this.waterY - 9 };
    this.raftX = this.cx + this.cw - 44;
    this.wallX = this.cx + 2;
    this.wallY = this.top + 4;
    this.riverHit.hitArea = new Rectangle(this.cx, this.top, this.cw, this.ctrlTop - this.top);
    this.worldMask.clear().rect(0, this.top, L.w, this.ctrlTop - this.top).fill(0xffffff);
    this.drawBackground();
    this.drawSkiff();
    this.lastNetters = -1;

    // ---- control bar ----
    this.ownedG = this.ownedG.filter((g) => g !== this.disk && g !== this.badge && g !== this.uiG);
    this.ui.removeChildren().forEach((ch) => destroyTree(ch));
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
    g.rect(0, y0, L.w, L.h - y0).fill(0x1a1420);
    g.rect(0, y0, L.w, 2).fill(0x5a4030);
    g.rect(0, y0 + 2, L.w, 1).fill(0x0a0410);
    this.zoneHit.hitArea = new Rectangle(this.cx, y0, this.cw, this.bottom - y0);

    this.status.position.set(x0, y0 + 5);
    const y1 = y0 + 14;
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    this.baitBtn = new Button({ w: 44, h: 18, label: 'BAIT', sub: 'WORM', ...dark, onTap: () => this.cycleBait() });
    this.baitBtn.position.set(x0, y1);
    this.codexBtn = new Button({ w: 44, h: 18, label: 'CODEX', sub: '0/16', ...dark, onTap: () => this.openCodex() });
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
    // KEEP / SELL for a trophy-worthy catch, over the REEL disk.
    const dcx = this.cx + Math.floor(this.cw / 2);
    this.keepBtn = new Button({ w: 30, h: 14, label: 'KEEP', color: C.gold, shade: 0x9a7a20, onTap: () => this.keepTrophy() });
    this.keepBtn.position.set(dcx - 31, y1 + 14);
    this.sellBtn = new Button({ w: 30, h: 14, label: 'SELL', ...dark, onTap: () => this.sellPending() });
    this.sellBtn.position.set(dcx + 1, y1 + 14);
    this.ui.addChild(this.baitBtn, this.codexBtn, this.wDown, this.wUp, this.wBuy, this.upgBtn, this.badge, this.keepBtn, this.sellBtn);
    this.ownedG.push(this.disk, this.badge, this.uiG);
    this.shownWrath = '';
    this.shownBait = '';
    this.shownCodex = '';
    this.shownKeep = '';
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

    // river bands (the view shows the open ones plus the next)
    for (let b = 0; b < this.shownBands; b++) {
      const y0 = Math.floor(this.depthY(b * M.BAND_PX)) - (b === 0 ? 3 : 0);
      const y1 = b === this.shownBands - 1 ? this.ctrlTop : Math.floor(this.depthY((b + 1) * M.BAND_PX));
      const [c0, c1] = BAND_COLS[b];
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
      if (b === 3) {
        // the red singing glow: soft bars of light
        for (let i = 0; i < 5; i++) {
          const x = Math.floor(rnd() * L.w);
          g.rect(x, y0 + 2, 1, hh - 4).fill({ color: 0xe05050, alpha: 0.12 });
          g.rect(x - 1, y0 + Math.floor(hh / 2), 3, 1).fill({ color: 0xff8080, alpha: 0.3 });
        }
      }
      if (b === 4) for (let i = 0; i < 24; i++) g.rect(Math.floor(rnd() * L.w), y0 + Math.floor(rnd() * hh), 1, 1).fill({ color: 0xffffff, alpha: 0.35 });
      // depth ruler on the right edge
      g.rect(this.cx + this.cw - 4, y0, 1, hh).fill({ color: BAND_ACCENT[b], alpha: 0.5 });
      for (let i = 1; i < 6; i++) g.rect(this.cx + this.cw - 6, y0 + Math.floor((hh * i) / 6), 2, 1).fill({ color: BAND_ACCENT[b], alpha: 0.4 });
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
    this.drawWall(g);
    this.drawBandLabels();
  }

  /** The Trophy Wall: a little board of plaques above the dock (03 §6.4), always visible. */
  private drawWall(g: Graphics): void {
    const slots = M.wallSlots(this.per);
    const w = slots * 6 + 3;
    const x = this.wallX;
    const y = this.wallY;
    g.rect(x, y, w, 9).fill(0x3a2818);
    g.rect(x, y, w, 1).fill(0x6a4a30);
    g.rect(x + 1, y + 9, 1, this.waterY - 15 - y - 9 > 0 ? this.waterY - 15 - y - 9 : 0).fill(0x3a2818);
    for (let i = 0; i < slots; i++) {
      const t = this.per.wall[i];
      const px = x + 2 + i * 6;
      if (!t) {
        g.rect(px + 1, y + 2, 3, 4).fill({ color: 0x0a0410, alpha: 0.6 });
        continue;
      }
      const leg = M.SPECIES_BY_ID[t.id]?.rarity === 'legendary';
      drawSprite(g, PLAQUE, { w: leg ? 0xffe070 : 0xc0a0ff, c: soulTint(t.id) }, px, y + 2);
    }
    this.lastWall = this.per.wall.map((t) => t.id + t.band).join() + slots;
  }

  private bandLabels: PixelText[] = [];
  private drawBandLabels(): void {
    for (const t of this.bandLabels) t.destroy();
    this.bandLabels = [];
    for (let b = 0; b < this.shownBands; b++) {
      const locked = b >= this.run.bands;
      const txt = locked
        ? b === this.run.bands
          ? `${M.BANDS[b].name}: ${formatNum(M.BANDS[b].cost, this.notation)} OBOLS`
          : `${M.BANDS[b].name}: LOCKED`
        : M.BANDS[b].name;
      const t = new PixelText(txt, locked ? '#7a6e80' : '#5a6a80', null);
      t.alpha = locked ? 1 : 0.7;
      t.position.set(this.cx + this.cw - 8 - t.width, Math.floor(this.depthY(b * M.BAND_PX)) + 2);
      t.eventMode = 'none';
      this.bandLabels.push(t);
      this.world.addChildAt(t, this.world.getChildIndex(this.bg) + 1);
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
    const key = n * 10 + this.run.lv.chum;
    if (key === this.lastNetters) return;
    this.lastNetters = key;
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
    if (this.run.lv.chum > 0) {
      // the Chum Barrel at the raft's stern
      g.rect(w, -5, 4, 5).fill(0x6a4a2a);
      g.rect(w, -3, 4, 1).fill(0x3a2818);
      g.rect(w + 1, -6, 2, 1).fill(0x8fd14f);
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
    if (this.ritual) {
      this.ritualTap(p.x, p.y);
      return;
    }
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
    if (this.ritual) return;
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
    if (this.codexOpen || this.ritual) return;
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
    this.sellPending();
    this.nib = null;
    this.hook = { x: Math.round(this.riverL + xFrac * (this.riverR - this.riverL)), d, cur: 0, jig: 0 };
    this.hooksLeft = M.hooksPerCast(this.run.lv.twin);
    this.run.aim = { x: xFrac, d };
    this.phase = 'sink';
    this.run.stats.casts++;
    const band = this.bandOf(d);
    if (band >= 1 && !this.ctx.seen(`styx.cast.${band}`)) this.ctx.markSeen(`styx.cast.${band}`);
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
    if (this.tutorial) return 1.2;
    return M.biteSample(M.biteWait(this.run.lv.lantern), Math.random());
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
      // An escaped rare's trail (03 §4): the same soul is twice as keen on a hook in its wake.
      const tr = this.trail;
      if (tr && tr.band === band && Math.abs(tr.x - this.hook.x) + Math.abs(tr.d - hy) < 44 && Math.random() < 0.5) {
        pick = this.spawnNear(tr.sp, band);
        this.trail = null;
      }
      // A rare+ swimming right by the hook gets first go: aiming at it pays.
      let best = Infinity;
      if (!pick) {
        for (const s of this.souls) {
          if (s.state !== 'swim' || s.wary > 0 || s.band !== band || !M.RARE_PLUS(s.sp.rarity)) continue;
          const dd = Math.abs(s.x - this.hook.x) + Math.abs(s.d - hy);
          if (dd < 34 && dd < best && Math.random() < 0.5) {
            best = dd;
            pick = s;
          }
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
    // A COUNT of fake dips (Wave 1): the real plunge comes by the 5th nibble at the latest.
    const fakes = this.tutorial ? 0 : M.fakeCount(this.W, s.sp.behavior === 'singer', Math.random());
    this.nib = { soul: s, fakes, step: 'nib', t: M.NIB_S[0] + Math.random() * M.NIB_S[1], twin: s.sp.behavior === 'twin' ? 1 : 0 };
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
      n.t = M.NIB_AFTER_S[0] + Math.random() * M.NIB_AFTER_S[1];
    } else {
      // Missed the window: the soul steals the nibble (the tutorial Clerk simply bites again).
      if (this.tutorial) {
        n.step = 'nib';
        n.t = 0.9;
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
    if (this.run.lv.eel > 0 && !this.ctx.seen('styx.eelHook')) this.ctx.markSeen('styx.eelHook');
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
    const rip: Ripper | null = !this.tutorial && Math.random() < M.ripperChance(this.W) ? { at: 0.25 + Math.random() * 0.45, warn: -1, dir: Math.random() < 0.5 ? 1 : -1, after: 0 } : null;
    this.reel = { soul: s, dist0, dist: dist0, tension: START_TENSION, over: 0, zero: 0, thrIdx: 0, thrN, tele: 0, thr: 0, teleported: false, sway: Math.random() * 6, red: false, pair: false, beat: 1.4, dived: false, rip, zt: 0, zseed: Math.random(), zc: 45, inZ: false, goldT: 0 };
    // The gold band's micro-lesson on the first reel after the tutorial catch.
    if (!this.tutorial && !this.ctx.seen('styx.goldLesson')) {
      this.ctx.markSeen('styx.goldLesson');
      this.ctx.lesson('gold');
    }
    this.showFlash(s.sp.rarity === 'legendary' ? "HERO'S ECHO!!" : 'HOOKED!');
    // HOOKED! (fun plan A2): a small shake and a beat of hit-stop; more for the big ones.
    const big = M.RARE_PLUS(s.sp.rarity);
    this.juice?.shake(big ? 2 : 1, { dur: big ? 0.25 : 0.12 });
    this.juice?.hitStop(big ? 80 : 40);
    sfx.thunk(this.vol);
    this.ctx.haptic(15);
    this.burst(this.hook.x, this.depthY(this.hook.d), 8, 0xfff0a0, 30, 0);
    if (s.sp.rarity === 'legendary') this.heartT = 0;
  }

  private beginTele(R: Reel): void {
    R.tele = this.tutorial ? 0.7 : M.teleS(R.soul.sp);
    sfx.warn(this.vol);
  }

  private updateReel(dt: number): void {
    const R = this.reel;
    if (!R) return;
    const sp = R.soul.sp;
    if (R.tele > 0) {
      R.tele -= dt;
      if (R.tele <= 0) {
        R.thr = M.thrashS(sp);
        sfx.creak(this.vol);
        this.ctx.haptic(15);
        this.burst(R.soul.x, this.depthY(R.soul.d), 5, 0xff6050, 25, 0);
      }
    } else if (R.thr > 0) {
      R.thr -= dt;
      // The Abyss Chorister thrashes in pairs: the second follows hard on the first.
      if (R.thr <= 0 && sp.behavior === 'canon' && !this.tutorial) {
        if (!R.pair) {
          R.pair = true;
          R.tele = 0.45;
          sfx.warn(this.vol);
        } else R.pair = false;
      }
    }
    const thrashing = R.thr > 0;
    const pullK = this.tutorial ? 0.5 : (sp.pull / 30) * M.wrathPull(this.W);
    const cap = M.lineCap(this.run.lv.line);
    // The gold band (Wave 1): the soul's comfort zone moves on the tension track.
    R.zt += dt;
    R.zc = this.tutorial ? 45 : M.zoneCenter(sp.behavior, R.zt, R.zseed, thrashing);
    R.inZ = false;
    if (this.holding) {
      const rise = M.REEL_RISE + (thrashing ? 2 * M.REEL_RISE * pullK : 0);
      R.tension += (rise / cap) * dt;
      if (R.tension < RED) {
        const slow = (sp.behavior === 'heavy' || sp.behavior === 'leviathan') && thrashing ? 0.6 : 1;
        R.inZ = M.inZone(R.tension, R.zc);
        const zk = this.tutorial ? 1 : R.inZ ? M.ZONE_IN : M.ZONE_OUT;
        if (R.inZ) {
          R.goldT += dt;
          if (R.goldT > 1.5 && !this.ctx.seen('styx.gold')) this.ctx.markSeen('styx.gold');
        }
        R.dist -= M.reelSpeed(this.run.lv.reel) * slow * zk * dt;
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
    if (R.tension >= RED) R.red = true;
    R.over = R.tension >= 100 ? R.over + dt : 0;
    R.zero = R.tension <= 0.01 ? R.zero + dt : 0;
    const prog = 1 - R.dist / R.dist0;
    if (sp.behavior === 'conductor' && !this.tutorial) {
      // The Choirmaster keeps time: a quick-telegraphed thrash every 1.6 s of the fight.
      if (R.tele <= 0 && R.thr <= 0) R.beat -= dt;
      if (R.thrIdx < R.thrN && R.beat <= 0 && R.tele <= 0 && R.thr <= 0) {
        R.thrIdx++;
        R.beat = 1.6;
        this.beginTele(R);
      }
    } else if (R.thrIdx < R.thrN && R.tele <= 0 && R.thr <= 0 && !R.pair && prog >= (R.thrIdx + 1) / (R.thrN + 1)) {
      R.thrIdx++;
      this.beginTele(R);
    }
    if (sp.behavior === 'teleport' && !R.teleported && prog >= 0.5) {
      R.teleported = true;
      this.burst(R.soul.x, this.depthY(R.soul.d), 10, 0xc8a0f0, 40, 0);
      R.dist = Math.min(R.dist0, R.dist + 0.3 * R.dist0);
      R.sway += 3;
      sfx.chime(this.vol);
      this.showFlash('SHE BLINKED AWAY!');
    }
    if (sp.behavior === 'leviathan' && !R.dived && prog >= 0.4) {
      R.dived = true;
      R.dist = Math.min(R.dist0, R.dist + 0.2 * R.dist0);
      R.tension = Math.min(110, R.tension + 12);
      this.burst(R.soul.x, this.depthY(R.soul.d), 12, 0xe8e8f0, 40, 0);
      sfx.creak(this.vol);
      this.showFlash('IT DIVES! HOLD ON!');
    }
    if (this.updateRipper(R, prog, dt)) return;
    if (R.over >= 0.4) {
      this.slip(thrashing);
      return;
    }
    if (R.zero > M.driftS(sp)) {
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

  /** A Ripper pass (W >= 10). Returns true if it cut the line. */
  private updateRipper(R: Reel, prog: number, dt: number): boolean {
    const rp = R.rip;
    if (!rp) return false;
    if (rp.warn < 0 && rp.after <= 0) {
      if (prog < rp.at) return false;
      rp.warn = M.RIPPER_WARN;
      sfx.whoosh(this.vol);
      this.showFlash('RIPPER! EASE OFF!');
      if (!this.ctx.seen('styx.ripperSeen')) {
        this.ctx.markSeen('styx.ripperSeen');
        this.ctx.lesson('ripper');
      }
      return false;
    }
    if (rp.warn >= 0) {
      rp.warn -= dt;
      if (rp.warn < 0) {
        rp.after = 0.6;
        if (R.tension > M.RIPPER_TAUT) {
          this.run.stats.cuts++;
          sfx.snap(this.vol);
          R.rip = null;
          this.ripG.visible = false;
          this.escape('A RIPPER CUT THE LINE!');
          this.say('ripperCut', { type: 'hazard_first', key: 'cut' });
          return true;
        }
        this.run.stats.rippers++;
        this.showFlash('IT SWAM PAST. PHEW');
      }
      return false;
    }
    rp.after -= dt;
    if (rp.after <= 0) R.rip = null;
    return false;
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
      this.say('hazardFirst', { type: 'hazard_first', key: 'snap' });
      return;
    }
    this.escape('THE LINE SLIPPED');
  }

  private escape(reason: string): void {
    const R = this.reel;
    this.reel = null;
    this.phase = 'idle';
    this.hooksLeft = 0; // the rig comes up with the escape
    this.ripG.visible = false;
    if (!R) return;
    const s = R.soul;
    if (M.RARE_PLUS(s.sp.rarity) && !this.tutorial) this.trail = { sp: s.sp, band: s.band, x: this.hook.x, d: this.hook.d, t: TRAIL_S };
    this.fleeSoul(s, true);
    this.run.combo = 0;
    this.run.stats.escapes++;
    if (this.W >= 1) {
      if (this.run.gate.w !== this.W) this.run.gate = { w: this.W, lands: 0, esc: 0, rare: 0 };
      this.run.gate.esc++;
    }
    this.showFlash(reason);
    sfx.plip(this.vol);
    if (Math.random() < 0.3) this.ctx.say('escape');
  }

  private land(): void {
    const R = this.reel!;
    this.reel = null;
    this.ripG.visible = false;
    const s = R.soul;
    const band = s.band;
    const r = this.run;
    const gilded = r.bait === 'gilded';
    const clean = !R.red && !this.tutorial;
    // The catch roll (Wave 1): Heft and stars (CLEAN +1 star), and the Codex records.
    const heft = M.rollHeft(gaussRnd());
    const stars = M.rollStars(Math.random(), clean, r.bait);
    const rec = M.recordCatch(this.per, s.sp.id, heft, stars);
    const value =
      M.catchMult(heft, stars) *
      M.soulBase(s.sp, band) *
      M.comboMult(r.combo) *
      M.wrathActive(this.W) *
      M.legendMult(r) *
      M.wallMult(this.per, band) *
      (clean ? M.CLEAN_MULT[s.sp.rarity] : 1) *
      (gilded ? M.gildedMult(this.ctx.save.imports?.potions ?? 0) : 1);
    const first = !(this.per.codex[s.sp.id] > 0);
    s.state = 'fly';
    this.fly = { soul: s, x0: s.x, y0: this.depthY(s.d), t: 0, value, first, clean, heft, stars, record: rec.heft || rec.stars };
    // A beat of hit-stop on the land (the juice kit), bigger for rares.
    this.juice?.hitStop(M.RARE_PLUS(s.sp.rarity) ? 90 : 40);
    this.nudge = 1;
    this.phase = 'land';
    this.addRipple(s.x, this.waterY, 0xc8d8f0);
    this.burst(s.x, this.waterY, 10, 0xa8c0e0, 50, 80);
    sfx.splash(this.vol);
    // Book-keeping now (the fly is just the animation).
    r.combo++;
    r.stats.lands++;
    r.stats.bestCombo = Math.max(r.stats.bestCombo, r.combo);
    if (clean) r.stats.cleans++;
    if (this.fogT > 0 && !this.ctx.seen('styx.fogLand')) this.ctx.markSeen('styx.fogLand');
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
    if (s.sp.rarity === 'legendary') this.say('legendary', { type: 'tier_reached', key: 'legendary' });
    else if (M.RARE_PLUS(s.sp.rarity)) this.say('rare', { type: 'tier_reached', key: 'rare' });
    else if (first && r.stats.lands > 1) this.ctx.say('codex', { vars: { name: s.sp.name.toUpperCase() } });
    if (clean && M.RARE_PLUS(s.sp.rarity) && !this.ctx.seen('styx.cleanRare')) {
      this.ctx.markSeen('styx.cleanRare');
      this.ctx.say('clean');
    }
    if (first || rec.heft || rec.stars) this.ctx.saveSoon();
    // Pilk's quips (research R3): a one-liner about a quarter of the time (Full chattiness).
    if (!first && !M.RARE_PLUS(s.sp.rarity) && Math.random() < 0.25) this.ctx.say(`quip.${s.sp.id}`);
  }

  private finishFly(): void {
    const f = this.fly;
    if (!f) return;
    this.fly = null;
    const s = f.soul;
    this.removeSoul(s);
    this.jarGlow = 0.6;
    this.burst(this.jar.x + 2, this.jar.y + 2, 12, 0xe8c04a, 50, 140);
    sfx.land(this.vol, this.run.combo);
    this.ctx.haptic(10);
    if (f.clean) sfx.clean(this.vol);
    this.showCard(s.sp, f.heft, f.stars, f.record ? 'NEW RECORD!' : f.first ? 'NEW!' : '', f.record ? 3.2 : 2.4);
    if (s.sp.rarity === 'legendary' || f.stars >= 3) coreSfx.bigWin();
    if (f.record) {
      sfx.fanfare(this.vol);
      this.juice?.shake(2, { dur: 0.25 });
      this.juice?.flash(this.cardX(), this.cardY(), CARD_W, CARD_H, 0xffe070, 0.3, 0.5);
      this.ctx.haptic(20);
      this.burst(this.cardX() + CARD_W - 18, this.cardY() + 8, 14, 0xff6050, 40, 0);
      if (!f.first && Math.random() < 0.5) this.ctx.say('record');
    }
    // A trophy-worthy catch waits on the dock: KEEP it for the Wall, or SELL it (03 §6.4).
    const tr = { id: s.sp.id, band: s.band };
    if (!this.tutorial && M.trophyWorthy(this.per, tr)) {
      this.sellPending();
      this.pending = { sp: s.sp, band: s.band, value: f.value, t: KEEP_S };
      this.showFlash(`KEEP THE ${s.sp.name.toUpperCase()}?`);
      if (!this.ctx.seen('styx.keepOffer')) {
        this.ctx.markSeen('styx.keepOffer');
        this.ctx.lesson('wall');
      }
    } else {
      const credited = this.ctx.earn(f.value);
      this.popValue(credited, this.jar.x + 3, this.jar.y - 8, C.goldText, 2);
      for (let i = 0; i < 4; i++) sfx.coin(this.vol, i);
      if (f.clean) this.showFlash(`CLEAN! X${M.CLEAN_MULT[s.sp.rarity].toFixed(2)}`);
    }
    if (f.first) {
      const bonus = this.ctx.earn(10 * M.soulBase(s.sp, s.band));
      sfx.fanfare(this.vol);
      this.showFlash(`NEW CODEX: ${s.sp.name.toUpperCase()}!`);
      this.ctx.float(`CODEX +${formatNum(bonus, this.notation)}`, this.cx + Math.floor(this.cw / 2), this.waterY - 4, '#8fd14f');
    }
    // Twin Hooks: after a clean land the next hook is already down and soaking.
    if (this.phase === 'land' && this.hooksLeft > 1 && !f.clean) {
      this.hooksLeft = 0;
      this.showFlash('SPARE HOOKS TANGLED. RECAST');
    }
    if (this.phase === 'land' && this.hooksLeft > 1) {
      this.hooksLeft--;
      this.run.stats.twinLands++;
      this.phase = 'wait';
      this.hook.cur = this.hook.d;
      this.biteT = this.sampleBite() * M.TWIN_WAIT;
      this.showFlash(`NEXT HOOK! ${this.hooksLeft} LEFT`);
    } else if (this.phase === 'land') this.phase = 'idle';
  }

  private keepTrophy(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    M.mountTrophy(this.per, { id: p.sp.id, band: p.band });
    this.run.stats.trophies++;
    sfx.mount(this.vol);
    this.ctx.haptic(15);
    this.burst(this.wallX + 10, this.wallY + 5, 14, 0xffe070, 40, 0);
    const bonus = M.trophyBonus({ id: p.sp.id, band: p.band });
    this.showFlash(`MOUNTED! ${M.BANDS[p.band].name} +${Math.round(bonus * 100)}%`);
    this.say('trophy', { type: 'tier_reached', key: 'trophy' });
    this.drawBackground();
    this.ctx.saveSoon();
  }

  private sellPending(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    const credited = this.ctx.earn(p.value);
    this.popValue(credited, this.jar.x + 3, this.jar.y - 8, C.goldText, 2);
    for (let i = 0; i < 4; i++) sfx.coin(this.vol, i);
    this.ctx.markSeen('styx.sold');
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

  private releaseG(g: Graphics): void {
    g.visible = false;
    g.parent?.removeChild(g);
    this.pool.push(g);
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
    this.releaseG(s.g);
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
      // The Forgotten are hard to see until hooked.
      const faint = s.sp.behavior === 'fader' && s.state !== 'hooked' && s.state !== 'fly' ? 0.35 + 0.15 * Math.sin(s.t * 2) : 0.92;
      g.alpha = (s.state === 'flee' ? 0.7 : faint) * s.fade;
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
    this.popValue(got, w.x, w.y - 8, '#a0f0f0');
    this.burst(w.x, w.y, 10, 0xa0f0f0, 50, 0);
    sfx.chime(this.vol);
    this.ctx.haptic(8);
  }

  private updateFog(dt: number): void {
    if (this.W < M.FOG_WRATH) {
      this.fogT = 0;
      return;
    }
    if (this.fogT > 0) this.fogT -= dt;
    else {
      this.fogCd -= dt;
      if (this.fogCd <= 0) {
        this.fogCd = 70 + Math.random() * 60;
        this.fogT = M.FOG_S;
        this.run.stats.fogs++;
        this.showFlash('FOG SURGE! WATCH THE BOBBER');
        if (!this.ctx.seen('styx.fogSeen')) {
          this.ctx.markSeen('styx.fogSeen');
          this.ctx.lesson('fog');
        }
      }
    }
  }

  /** Chum Barrel bait use since the last settle (wall clock, at most `maxS` seconds). */
  private settleChum(now: number, maxS: number): void {
    const at = this.run.chumAt;
    if (at != null && now > at) M.settleChum(this.run, this.per, Math.min(maxS, (now - at) / 1000));
    this.run.chumAt = now;
  }

  private updateIdle(dt: number): void {
    this.settleChum(Date.now(), dt + 1);
    const rate = M.idleObols(this.run, this.per);
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
        this.ctx.float(`+${formatNum(this.netShow, this.notation)}`, x, this.waterY - 22, '#c8b0e0');
        this.addRipple(x, this.waterY, 0x8a9cb0);
      }
      this.netShow = 0;
    }
  }

  // ---------- update ----------

  update(dt: number): void {
    if (this.destroyed) return;
    this.t += dt;
    this.twitchT = Math.max(0, this.twitchT - dt);
    this.twitchCd = Math.max(0, this.twitchCd - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.jarGlow = Math.max(0, this.jarGlow - dt);
    if (this.nudge > 0) this.nudge = Math.max(0, this.nudge - dt * 8);
    this.world.y = this.nudge > 0.5 ? 1 : 0;

    this.updateIdle(dt);
    this.updateSouls(dt);
    if (this.trail) {
      this.trail.t -= dt;
      if (this.trail.t <= 0 || this.trail.band >= this.run.bands) this.trail = null;
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) this.sellPending();
    }

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
    this.updateRitual(dt);
    this.updateZoom(dt);
    this.updateCard(dt);
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

  /** Legendary reel (03 §13): heartbeat bass, gold motes and a slow zoom onto the fight. */
  private updateZoom(dt: number): void {
    const R = this.reel;
    const leg = !!R && R.soul.sp.rarity === 'legendary';
    this.zoom = Math.max(0, Math.min(1, this.zoom + (leg ? dt / 1.2 : -dt / 0.5)));
    if (leg) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.9;
        sfx.heartbeat(this.vol);
      }
      if (Math.random() < dt * 10) this.burst(this.cx + Math.random() * this.cw, this.waterY + Math.random() * (this.ctrlTop - this.waterY), 1, 0xffe070, 8, -10);
    }
    const s = 1 + 0.35 * this.zoom * this.zoom;
    if (this.zoom <= 0) {
      this.world.scale.set(1);
      this.world.x = 0;
      return;
    }
    // Keep the hooked soul (or the river's middle) fixed on screen while scaling around it.
    const fx = R ? Math.max(this.cx + 30, Math.min(this.cx + this.cw - 30, R.soul.x)) : this.cx + this.cw / 2;
    const fy = R ? Math.max(this.waterY, Math.min(this.ctrlTop - 10, this.depthY(R.soul.d))) : (this.waterY + this.ctrlTop) / 2;
    this.world.scale.set(s);
    this.world.x = Math.round(fx * (1 - s));
    this.world.y += Math.round(fy * (1 - s));
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
    let bobY = this.waterY - 1;
    if (fishing) {
      // Line to the bobber, then a thin leader down to the hook.
      const n = this.nib;
      let by = this.waterY - 1;
      if (this.hook.jig > 0) by -= 1;
      // Wrath makes a fake dip look more like the plunge (M.fakeTell): 1 px bob -> 2 px dip.
      if (n?.step === 'dip') by += M.fakeTell(this.W) >= 0.5 ? 2 : 1;
      if (n?.step === 'plunge') by += 3;
      bobY = by;
      const pale = this.phase === 'nibble';
      this.plotLine(g, tipX, tipY, hx, by, 6, 0, pale ? 0xb8d0ff : 0xe8e8f0);
      const hy = this.depthY(this.hook.cur);
      for (let y = by + 2; y < hy; y += 1) g.rect(hx, y, 1, 1).fill({ color: 0xc8d0e0, alpha: 0.35 });
      g.rect(hx - 1, Math.round(hy), 1, 2).fill(0xe8dcc0);
      g.rect(hx, Math.round(hy) + 2, 1, 1).fill(0xe8dcc0);
      g.rect(hx + 1, Math.round(hy), 1, 2).fill(0xe8dcc0);
      // spare Twin Hooks on the leader
      for (let i = 1; i < this.hooksLeft; i++) {
        const sy = Math.round(hy) - 5 * i;
        if (sy > by + 3) g.rect(hx + 1, sy, 1, 2).fill({ color: 0xe8dcc0, alpha: 0.8 });
      }
      // bobber
      g.rect(hx - 1, by - 1, 3, 2).fill(0xe04040);
      g.rect(hx - 1, by + 1, 3, 1).fill(0xf4f4f4);
      if (n) {
        const lie = n.step === 'dip' && M.fakeTell(this.W) > 0.3 && Math.floor(this.t * 16) % 2 === 0;
        const ringC = n.step === 'plunge' ? (Math.floor(this.t * 16) % 2 ? 0xfff070 : 0xffffff) : lie ? 0xd8c080 : n.step === 'dip' ? 0x9aa0b4 : 0xb8c8f0;
        const rr = n.step === 'plunge' ? 6 : 4;
        this.ring(g, hx, by, rr, ringC, n.step === 'plunge' ? 1 : 0.6);
      }
      if (this.twitchT > 0) this.ring(g, hx, this.waterY, 3 + Math.floor((1.5 - this.twitchT) * 6), 0x9ab0d0, (this.twitchT / 1.5) * 0.6);
      // The Lantern Eel reads the bite: grey = a fake dip is next, gold = the real plunge.
      if (this.run.lv.eel > 0 && this.phase !== 'sink') {
        const ex = hx + 3;
        const ey = Math.round(hy) - 2 + Math.round(Math.sin(this.t * 3));
        let lamp = 0x6a9a8a;
        if (n) lamp = n.step === 'plunge' || (n.step === 'nib' && n.fakes === 0) ? (Math.floor(this.t * 10) % 2 ? 0xffe070 : 0xfff4c0) : 0x8a8a9a;
        drawSprite(g, EEL, { ...EEL_PAL, l: lamp }, ex, ey);
        if (n) g.rect(ex + 1, ey - 2, 3, 1).fill({ color: lamp, alpha: 0.5 });
      }
    } else if (R) {
      const sx = Math.round(R.soul.x);
      const sy = Math.round(this.depthY(R.soul.d)) - 3;
      const col = R.inZ && Math.floor(this.t * 8) % 2 ? 0xffe070 : this.tensionColor(tension);
      const sag = Math.max(0, (60 - tension) / 6);
      const wob = tension > 50 ? ((tension - 50) / 50) * 1.8 : 0;
      this.plotLine(g, tipX, tipY, sx, sy, sag, wob, col);
      if (tension >= RED && Math.floor(this.t * 12) % 2) this.ring(g, sx, sy + 3, 7, 0xe03030, 0.7);
      this.drawRipper(R, tipX, tipY, sx, sy);
    } else if (this.phase === 'land' && this.fly) {
      // the line flicks up after the catch
      this.plotLine(g, tipX, tipY, Math.round(this.fly.soul.g.x), Math.round(this.fly.soul.g.y), 2, 0, 0xe8e8f0, 0.6);
    } else {
      this.plotLine(g, tipX, tipY, tipX + 1, this.waterY - 1, 0, 0, 0xe8e8f0, 0.7);
    }
    void bobY;

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
      const a = Math.min(1, this.fogT, M.FOG_S - this.fogT) * 0.55;
      f.rect(0, this.waterY + 1, this.ctx.layout.w, this.ctrlTop - this.waterY - 1).fill({ color: 0x8a90a8, alpha: a });
      for (let i = 0; i < 6; i++) {
        const y = this.waterY + 10 + i * Math.floor((this.ctrlTop - this.waterY) / 6);
        const x = Math.round(((this.t * (6 + i * 2) + i * 40) % (this.cw + 60)) - 30 + this.cx);
        f.rect(x, y, 40, 4).fill({ color: 0xb0b8c8, alpha: a * 0.6 });
      }
    }

    // fx: ripples, particles, wisps, sparkles, tongues, trails, jar glow, ghost hint
    const x = this.fx.clear();
    for (const r of this.ripples) {
      if (r.life > r.max || r.life < 0) continue;
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
    if (this.trail) {
      // the escaped rare's glowing wake
      const tr = this.trail;
      const a = Math.min(1, tr.t / 10) * 0.6;
      const col = tr.sp.rarity === 'legendary' ? 0xffe070 : 0xc0a0ff;
      for (let i = 0; i < 6; i++) {
        const ox = Math.round(Math.sin(this.t * 1.5 + i * 1.7) * 12);
        const oy = Math.round(Math.cos(this.t * 1.1 + i * 2.3) * 4);
        x.rect(Math.round(tr.x) + ox, Math.round(this.depthY(tr.d)) + oy, 1, 1).fill({ color: col, alpha: a });
      }
    }
    for (const s of this.souls) {
      if (s.tongue > 0) x.rect(Math.round(s.x) + (s.vx < 0 ? 2 : -3), Math.round(this.depthY(s.d)) + 1, 2, 1).fill(0xf080a0);
      if (M.RARE_PLUS(s.sp.rarity) && s.state !== 'fly' && Math.floor(s.t * 5 + s.x) % 4 === 0) {
        const col = s.sp.rarity === 'legendary' ? 0xffe070 : 0xc0a0ff;
        x.rect(Math.round(s.x) + Math.round(Math.sin(s.t * 7) * 5), Math.round(this.depthY(s.d)) - 6, 1, 1).fill(col);
        if (s.state === 'flee') x.rect(Math.round(s.x) - Math.sign(s.vx) * 6, Math.round(this.depthY(s.d)), 3, 1).fill({ color: col, alpha: 0.6 });
      }
    }
    for (const p of this.parts) x.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill({ color: p.color, alpha: Math.min(1, (p.life / p.max) * 1.5) });
    if (this.jarGlow > 0) x.rect(this.jar.x - 1, this.jar.y - 1, 7, 7).fill({ color: 0xe8c04a, alpha: this.jarGlow * 0.5 });
    if (this.pending && Math.floor(this.t * 4) % 2) {
      // the kept-or-sold soul glows on the dock
      x.rect(this.jar.x - 1, this.jar.y - 3, 7, 1).fill(0xffe070);
    }
    this.soulLayer.alpha = this.ritual ? 0.25 : 1;
    if (this.ritual) {
      // Pilk's net, dumped across the shallows: a rope mesh under the flopping catch.
      const nx = this.riverL + 2;
      const ny = this.waterY + 14;
      const nw = this.riverR - this.riverL - 4;
      const nh = 54;
      x.rect(nx, ny, nw, nh).fill({ color: 0x1a120c, alpha: 0.75 });
      for (let gx = nx; gx <= nx + nw; gx += 6) x.rect(gx, ny, 1, nh).fill({ color: 0x8a6a3a, alpha: 0.6 });
      for (let gy = ny; gy <= ny + nh; gy += 6) x.rect(nx, gy, nw, 1).fill({ color: 0x8a6a3a, alpha: 0.6 });
      for (const rs of this.ritual.souls) {
        if (rs.state !== 'flop' || !rs.keeper) continue;
        const a = 0.5 + 0.4 * Math.sin(this.t * 8 + rs.x);
        this.ring(x, Math.round(rs.x), Math.round(rs.y) + 6, 8, 0xffe070, a);
      }
    }
    const step = this.obStep();
    if (step === 'wisp' && this.wisps.length) {
      const w = this.wisps[0];
      const u = (this.t % 1) / 1;
      x.circle(Math.round(w.x), Math.round(w.y + 12 - u * 12), 2).fill({ color: 0xffffff, alpha: 0.5 * (1 - u) });
    }
    this.drawOver();
  }

  /** The Ripper's fin, streaking from the bank toward the line. */
  private drawRipper(R: Reel, tipX: number, tipY: number, sx: number, sy: number): void {
    const rp = R.rip;
    if (!rp || (rp.warn < 0 && rp.after <= 0)) {
      this.ripG.visible = false;
      return;
    }
    // Where it crosses: a point on the line a little above the soul.
    const cxp = Math.round(sx + (tipX - sx) * 0.35);
    const cyp = Math.round(sy + (tipY - sy) * 0.35);
    const startX = rp.dir > 0 ? this.riverL - 10 : this.riverR + 10;
    let px: number;
    if (rp.warn >= 0) {
      const u = 1 - rp.warn / M.RIPPER_WARN;
      px = startX + (cxp - startX) * u;
    } else px = cxp + rp.dir * (1 - rp.after / 0.6) * 60;
    this.ripG.visible = true;
    this.ripG.context = soulArt('ripper', Math.floor(this.t * 12) & 1);
    this.ripG.scale.x = rp.dir;
    this.ripG.position.set(Math.round(px), Math.max(this.waterY + 4, cyp));
    if (rp.warn >= 0) {
      // the warning: a red tick on the crossing point, pulsing faster as it nears
      const on = Math.floor(this.t * (8 + 12 * (1 - rp.warn))) % 2 === 0;
      if (on) this.lineG.rect(cxp - 1, Math.max(this.waterY + 4, cyp) - 1, 3, 3).fill({ color: R.tension > M.RIPPER_TAUT ? 0xff3030 : 0x8fd14f, alpha: 0.8 });
    }
  }

  /** Over the world (not zoomed): the legendary vignette and the ritual's banner. */
  private drawOver(): void {
    const o = this.over.clear();
    this.bannerText.visible = false;
    if (this.zoom > 0) {
      const a = 0.55 * this.zoom;
      const L = this.ctx.layout;
      const h = this.ctrlTop - this.top;
      for (let i = 0; i < 6; i++) {
        const aa = a * (1 - i / 6);
        o.rect(0, this.top + i * 2, L.w, 2).fill({ color: 0x1a1000, alpha: aa });
        o.rect(0, this.ctrlTop - (i + 1) * 2, L.w, 2).fill({ color: 0x1a1000, alpha: aa });
        o.rect(this.cx + i * 2, this.top, 2, h).fill({ color: 0x1a1000, alpha: aa });
        o.rect(this.cx + this.cw - (i + 1) * 2, this.top, 2, h).fill({ color: 0x1a1000, alpha: aa });
      }
      o.rect(this.cx, this.top, this.cw, 1).fill({ color: 0xffe070, alpha: this.zoom * 0.8 });
      o.rect(this.cx, this.ctrlTop - 1, this.cw, 1).fill({ color: 0xffe070, alpha: this.zoom * 0.8 });
    }
    const rt = this.ritual;
    if (rt) {
      const left = Math.max(0, RITUAL_S - rt.t);
      const bw = this.cw - 20;
      o.rect(this.cx + 10, this.waterY + 3, bw, 3).fill(0x0a0410);
      o.rect(this.cx + 10, this.waterY + 3, Math.round((bw * left) / RITUAL_S), 3).fill(C.gold);
      this.bannerText.set(`SORT THE NET: ${rt.kept}/${rt.keepers} KEEPERS`);
      this.bannerText.position.set(this.cx + Math.floor((this.cw - this.bannerText.width) / 2), this.waterY + 8);
      this.bannerText.visible = true;
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
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (grav > 0 ? speed * 0.6 : 0), life, max: life, color, grav });
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

  // ---------- return ritual (03 §13, 00 §5.3) ----------

  /** Pilk dumps the night's net on the river: tap the glowing keepers before they slip away. */
  returnRitual(haul: number): Promise<number> {
    if (this.ritual || this.destroyed || !(haul > 0)) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      const known = M.SPECIES.filter((s) => (this.per.codex[s.id] ?? 0) > 0);
      const keeperPool = known.filter((s) => s.rarity !== 'common' && s.band < this.run.bands);
      const dudPool = known.filter((s) => s.rarity === 'common' && s.band < this.run.bands);
      const keepers = 2 + (Math.random() < 0.5 ? 1 : 0);
      const souls: RitualSoul[] = [];
      for (let i = 0; i < RITUAL_SOULS; i++) {
        const keeper = i < keepers;
        const pool = keeper ? keeperPool : dudPool;
        const sp = pool.length ? pool[Math.floor(Math.random() * pool.length)] : keeper ? M.SPECIES_BY_ID.tourist : M.SPECIES_BY_ID.clerk;
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = this.riverL + 14 + col * Math.floor((this.riverR - this.riverL - 28) / 2) + Math.round((Math.random() - 0.5) * 6);
        const y = this.waterY + 28 + row * 24 + Math.round((Math.random() - 0.5) * 4);
        const g = this.acquireG(sp.id);
        this.ritualLayer.addChild(g);
        g.position.set(x, y);
        souls.push({ g, sp, x, y, keeper, state: 'flop', t: Math.random() * 3, vx: 0, vy: 0 });
      }
      // shuffle positions so keepers aren't always first
      for (let i = souls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = souls[i];
        const b = souls[j];
        [a.x, b.x] = [b.x, a.x];
        [a.y, b.y] = [b.y, a.y];
      }
      this.ritual = { souls, t: 0, keepers, kept: 0, wrong: 0, done: resolve };
      this.netHighlight(haul);
      sfx.splash(this.vol);
      this.say('ritual', {});
      this.burst(this.cx + this.cw * this.skiffX, this.waterY, 12, 0xa8c0e0, 40, 60);
    });
  }

  /** Pilk's pick of the night (Wave 1, research R9): the haul opens with one highlighted soul,
   * rolled as the best of the netted catch (cosmetic: the haul itself is already credited). */
  private netHighlight(haul: number): void {
    const per = M.idleObols(this.run, this.per) / Math.max(1e-9, M.netRate(this.run)); // Obols per netted soul
    const n = Math.max(1, Math.min(60, Math.round(haul / Math.max(1e-9, per * this.ctx.mult()))));
    const { top, depth } = M.netWindow(this.run.bands, this.run.lv.poles);
    let pick: { sp: M.Species; band: number } | null = null;
    const rank: Record<M.Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
    for (let i = 0; i < n; i++) {
      const band = Math.max(0, Math.min(this.run.bands - 1, Math.floor((top + Math.random() * Math.max(1, depth)) / M.BAND_PX)));
      const sp = M.speciesFor(band, M.rollRarity(M.RARITY_W, Math.random()));
      if (!M.netKnows(this.per, sp)) continue;
      if (!pick || rank[sp.rarity] > rank[pick.sp.rarity]) pick = { sp, band };
    }
    if (!pick) pick = { sp: M.speciesFor(0, 'common'), band: 0 };
    const heft = Math.max(M.rollHeft(gaussRnd()), M.rollHeft(gaussRnd()), M.rollHeft(gaussRnd()));
    const stars = Math.max(M.rollStars(Math.random(), false), M.rollStars(Math.random(), false));
    this.showCard(pick.sp, heft, stars, '', 3.4, `PILK'S PICK TONIGHT`);
  }

  private ritualTap(x: number, y: number): void {
    const rt = this.ritual;
    if (!rt) return;
    let best: RitualSoul | null = null;
    let bd = 12;
    for (const s of rt.souls) {
      if (s.state !== 'flop') continue;
      const d = Math.max(Math.abs(s.x - x), Math.abs(s.y - y));
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return;
    if (best.keeper) {
      best.state = 'kept';
      rt.kept++;
      best.t = 0;
      sfx.mount(this.vol);
      this.ctx.haptic(10);
      // Sorted keepers go in the book (species already known: no first-catch bonus is taken).
      this.per.codex[best.sp.id] = (this.per.codex[best.sp.id] ?? 0) + 1;
      this.burst(best.x, best.y, 8, 0xffe070, 30, 0);
      if (rt.kept >= rt.keepers) rt.t = Math.max(rt.t, RITUAL_S - 0.6);
    } else {
      best.state = 'tossed';
      rt.wrong++;
      best.t = 0;
      sfx.plip(this.vol);
      this.addRipple(best.x, this.waterY, 0x9ab0d0);
    }
  }

  private updateRitual(dt: number): void {
    const rt = this.ritual;
    if (!rt) return;
    rt.t += dt;
    for (const s of rt.souls) {
      s.t += dt;
      if (s.state === 'flop') {
        const hop = Math.abs(Math.sin(s.t * 5)) * 3;
        s.g.position.set(Math.round(s.x), Math.round(s.y - hop));
        s.g.scale.set(Math.sin(s.t * 2.5) > 0 ? 1.5 : -1.5, 1.5);
        s.g.tint = s.keeper && Math.floor(s.t * 6) % 2 ? 0xfff0a0 : 0xffffff;
        s.g.alpha = 0.95;
      } else if (s.state === 'kept') {
        const p = Math.min(1, s.t / 0.5);
        s.g.position.set(Math.round(s.x + (this.wallX + 8 - s.x) * p), Math.round(s.y + (this.wallY + 4 - s.y) * p - Math.sin(p * Math.PI) * 16));
        s.g.scale.set(1.5 - p);
        s.g.tint = 0xfff0a0;
        if (p >= 1) s.g.visible = false;
      } else {
        s.g.position.set(Math.round(s.x), Math.round(s.y + s.t * 30));
        s.g.alpha = Math.max(0, 0.9 - s.t * 2);
      }
    }
    if (rt.t >= RITUAL_S) this.endRitual();
  }

  private endRitual(): void {
    const rt = this.ritual;
    if (!rt) return;
    this.ritual = null;
    for (const s of rt.souls) {
      s.g.scale.set(1);
      this.releaseG(s.g);
    }
    const score = Math.max(0, Math.min(1, rt.kept / Math.max(1, rt.keepers) - 0.25 * rt.wrong));
    if (!this.destroyed) {
      this.showFlash(score >= 0.99 ? 'A TIDY NET! PILK BEAMS' : score > 0 ? 'NET SORTED' : 'THE NET GOT AWAY');
      if (score > 0) sfx.fanfare(this.vol);
    }
    rt.done(score);
  }

  // ---------- the reveal card (Wave 1) ----------

  private cardX(): number {
    const w = this.riverR - this.riverL;
    return Math.round(this.riverL + Math.max(0, (w - CARD_W) / 2));
  }

  private cardY(): number {
    // In the dusk sky above the river: never over the hook or the reel.
    return Math.max(this.top + 4, this.waterY - CARD_H - 16);
  }

  /** Pops the reveal card: soul, name, stars, heft and a stamp ('NEW RECORD!', 'NEW!', a tag). */
  private showCard(sp: M.Species, heft: number, stars: number, stamp: string, dur: number, tag = ''): void {
    const g = this.cardG.clear();
    const w = Math.min(CARD_W, this.riverR - this.riverL + 20);
    const rcol = sp.rarity === 'legendary' ? 0xffe070 : sp.rarity === 'rare' ? 0xc0a0ff : sp.rarity === 'uncommon' ? 0x8fd14f : 0x8a9cb0;
    g.rect(0, 0, w, CARD_H).fill(0x0a0410);
    g.rect(1, 1, w - 2, CARD_H - 2).fill(0x1c2030);
    g.rect(1, 1, w - 2, 1).fill(rcol);
    g.rect(1, CARD_H - 2, w - 2, 1).fill({ color: rcol, alpha: 0.5 });
    // the soul on a little plinth
    g.rect(3, 4, 18, 20).fill(0x262e42);
    const tier = M.codexTier(this.per.codex[sp.id] ?? 0);
    if (tier > 0) {
      g.rect(3, 4, 18, 1).fill(TIER_COL[tier]);
      g.rect(3, 23, 18, 1).fill(TIER_COL[tier]);
      g.rect(3, 4, 1, 20).fill(TIER_COL[tier]);
      g.rect(20, 4, 1, 20).fill(TIER_COL[tier]);
    }
    this.cardIcon.context = soulArt(sp.id, 0);
    const sz = soulSize(sp.id);
    this.cardIcon.scale.set(sz.w > 14 || sz.h > 14 ? 1 : 1.5);
    this.cardIcon.position.set(12, 14);
    // stars: gold for earned, dim for the rest
    for (let i = 0; i < 3; i++) drawSprite(g, STAR, { x: i < stars ? 0xffd040 : 0x3a3448 }, w - 20 + i * 6 - 1, 5);
    this.cardName.set(sp.name.toUpperCase(), sp.rarity === 'legendary' ? '#ffe070' : sp.rarity === 'rare' ? '#c0a0ff' : sp.rarity === 'uncommon' ? '#8fd14f' : C.ink);
    this.cardName.position.set(24, 5);
    if (this.cardName.width > w - 46) this.cardName.set(sp.name.split(' ').slice(-1)[0].toUpperCase());
    const best = this.per.best?.[sp.id];
    const st = M.heftSt(sp, heft);
    this.cardSub.set(tag || `${st} ST ${M.STAR_NAMES[stars]}`, tag ? C.inkDim : C.ink);
    this.cardSub.position.set(24, 13);
    if (stamp) this.cardStamp.set(stamp, stamp === 'NEW RECORD!' ? '#ff6050' : '#8fd14f');
    else this.cardStamp.set(best ? `BEST ${M.heftSt(sp, best.h)} ST` : '', C.inkDim);
    this.cardStamp.position.set(24, 20);
    if (tag) {
      // a tagged card (Pilk's pick of the night) shows the heft on the third line
      this.cardStamp.set(`${st} ST ${M.STAR_NAMES[stars]}`, C.goldText);
    }
    this.cardBox.position.set(this.cardX(), this.cardY());
    this.card = { t: 0, max: dur, blink: !!stamp };
    this.cardBox.visible = true;
  }

  private updateCard(dt: number): void {
    const c = this.card;
    if (!c) return;
    c.t += dt;
    if (c.t >= c.max) {
      this.card = null;
      this.cardBox.visible = false;
      return;
    }
    // punch in, hold, fade out; the stamp blinks
    const k = c.t < 0.12 ? 1.25 - (c.t / 0.12) * 0.25 : 1;
    const w = this.cardG.width;
    this.cardBox.scale.set(k);
    this.cardBox.position.set(Math.round(this.cardX() - ((k - 1) * w) / 2), Math.round(this.cardY() - ((k - 1) * CARD_H) / 2));
    this.cardBox.alpha = Math.min(1, (c.max - c.t) / 0.35);
    this.cardStamp.visible = !c.blink || c.t < 0.5 || Math.floor(c.t * 5) % 3 !== 0;
  }

  // ---------- ui ----------

  private showFlash(text: string): void {
    this.flash = text;
    this.flashT = 1.6;
  }

  private statusLine(): string {
    if (this.ritual) return 'TAP THE GLOWING ONES!';
    if (this.flashT > 0) return this.flash;
    if (this.pending) return `KEEP FOR THE WALL, OR SELL? ${Math.ceil(this.pending.t)}`;
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
        if (R.rip && R.rip.warn >= 0) return R.tension > M.RIPPER_TAUT ? 'RIPPER! LET GO!' : 'SLACK... LET IT PASS';
        if (R.tension >= RED) return 'RED! EASE OFF!';
        if (R.tele > 0 || R.thr > 0) return 'THRASH! LET GO!';
        if (!this.holding) return R.tension < R.zc - M.ZONE_W / 2 ? 'HOLD! INTO THE GOLD' : 'HOLD TO REEL';
        if (R.inZ) return R.red ? 'IN THE GOLD!' : 'IN THE GOLD! CLEAN...';
        return R.tension > R.zc ? 'EASE OFF INTO THE GOLD' : 'MORE! INTO THE GOLD';
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
    const red = this.reel && (this.reel.tension >= RED || this.reel.tele > 0 || this.reel.thr > 0 || (this.reel.rip && this.reel.rip.warn >= 0));
    this.status.set(shown, hot || this.ritual ? '#fff070' : red ? '#e05050' : this.pending || (this.phase === 'reel' && this.reel?.inZ) ? C.goldText : C.ink);
    this.status.x = this.cx + Math.floor((this.cw - this.status.width) / 2);

    // REEL disk with the tension arc around it
    const d = this.disk.clear();
    const dcx = this.cx + Math.floor(this.cw / 2);
    const dcy = this.ctrlTop + 35;
    const r = 17;
    const pulse = Math.floor(this.t * 4) % 2 === 0;
    let fill = 0x3a2a4a;
    let label = 'CAST';
    let light = true;
    if (this.phase === 'nibble') {
      label = 'HOOK';
      fill = hot ? (pulse ? 0xfff070 : 0xe8c04a) : 0x6a6a8a;
      light = !hot;
    } else if (this.phase === 'reel') {
      label = 'REEL';
      fill = this.holding ? 0x8fd14f : pulse ? 0x6a9a3a : 0x4a7a22;
      light = false;
    } else if (this.phase === 'sink' || this.phase === 'wait') {
      label = 'WAIT';
      fill = 0x3a4a6a;
    } else if (this.phase === 'idle') {
      fill = this.run.aim ? 0x4a3a6a : 0x3a2a4a;
    } else if (this.phase === 'rerig') {
      label = '...';
    } else if (this.phase === 'land') {
      label = 'NICE';
      fill = 0x8fd14f;
      light = false;
    }
    d.circle(dcx, dcy, r + 1).fill(0x0a0410);
    d.circle(dcx, dcy + (this.holding ? 1 : 0), r - 1).fill(fill);
    d.circle(dcx - 4, dcy - 5 + (this.holding ? 1 : 0), 4).fill({ color: 0xffffff, alpha: 0.12 });
    const ten = this.reel ? this.reel.tension : 0;
    const segs = 48;
    const lit = Math.round((Math.min(100, ten) / 100) * segs);
    // The gold band on the arc (Wave 1): dim gold where it sits, bright where the line is in it.
    const zc = this.reel ? this.reel.zc : -100;
    const inZ = !!this.reel?.inZ;
    for (let i = 0; i < segs; i++) {
      const a = -Math.PI / 2 + (i / segs) * Math.PI * 2;
      const pct = ((i + 0.5) / segs) * 100;
      const gold = Math.abs(pct - zc) <= M.ZONE_W / 2;
      const col = i < lit ? (gold ? (inZ && pulse ? 0xfff4a0 : 0xffd040) : this.tensionColor((i / segs) * 100)) : gold ? 0x7a6020 : 0x2a2030;
      for (const rr of [r + 3, r + 4]) d.rect(Math.round(dcx + Math.cos(a) * rr), Math.round(dcy + Math.sin(a) * rr), 1, 1).fill(col);
      // an outer gold rim marks where the band sits, lit or not
      if (gold) d.rect(Math.round(dcx + Math.cos(a) * (r + 6)), Math.round(dcy + Math.sin(a) * (r + 6)), 1, 1).fill(inZ ? 0xfff4a0 : 0xd0a030);
    }
    // the red line on the arc
    const ra = -Math.PI / 2 + (RED / 100) * Math.PI * 2;
    d.rect(Math.round(dcx + Math.cos(ra) * (r + 5)), Math.round(dcy + Math.sin(ra) * (r + 5)), 1, 1).fill(0xe03030);
    this.diskText.set(label, light ? '#f4e8c1' : '#140c1c');
    this.diskText.position.set(dcx - Math.floor(this.diskText.width / 2), dcy - 2 + (this.holding ? 1 : 0));
    this.disk.visible = this.diskText.visible = !this.pending;

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
    const bait = this.run.bait;
    const bkey = `${bait}:${this.per.baits[bait] ?? 0}`;
    if (bkey !== this.shownBait) {
      this.shownBait = bkey;
      this.baitBtn.setLabel('BAIT', bait === 'worm' ? 'WORM' : `${M.BAITS[bait].short} ${this.per.baits[bait]}`);
      this.baitBtn.setColor(bait === 'worm' ? C.edge : BAIT_COLOR[bait], bait === 'worm' ? 0x3a2046 : 0x2a2a3a);
    }
    const cc = `${M.codexCount(this.per)}/${M.SPECIES.length} {skull}${this.per.wall.length}`;
    if (cc !== this.shownCodex) {
      this.shownCodex = cc;
      this.codexBtn.setLabel('CODEX', cc);
    }
    const kkey = this.pending ? 'y' : 'n';
    if (kkey !== this.shownKeep) {
      this.shownKeep = kkey;
      this.keepBtn.visible = this.sellBtn.visible = !!this.pending;
    }
    const open = this.run.bands >= 2 || this.run.wrathMax > 0;
    const max = this.run.wrathMax;
    const cost = max < M.WRATH_MAX ? M.wrathCost(max + 1) : 0;
    const affordable = this.run.bands >= 2 && max < M.WRATH_MAX && this.run.bank >= cost;
    const wkey = `${open}:${this.run.wrath}:${max}:${affordable}:${this.notation}:${this.run.bands >= 2}`;
    if (wkey !== this.shownWrath) {
      this.shownWrath = wkey;
      this.wDown.visible = this.wUp.visible = this.wBuy.visible = open;
      if (open) {
        this.wrathText.set(`WRATH ${this.run.wrath}/${max}`, '#e05050');
        this.wDown.setEnabled(this.run.wrath > 0);
        this.wUp.setEnabled(this.run.wrath < max);
        if (max >= M.WRATH_MAX) this.wBuy.setLabel('MAX').setEnabled(false);
        else if (this.run.bands < 2) this.wBuy.setLabel('MURK 1ST').setEnabled(false);
        else this.wBuy.setLabel(`+${max + 1} ${formatNum(cost, this.notation)}`).setEnabled(affordable);
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
    if (this.run.bait === 'worm' && M.PAID_BAITS.every((b) => !(this.per.baits[b] > 0))) {
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
    // 03 §18: Wrath runs its micro-lesson on the first level; every 5th level is a dial line.
    if (r.wrathMax === 1) this.say('wrath', { type: 'mechanic_unlocked' });
    else if (r.wrathMax % 5 === 0) this.say('dialRaised', { type: 'dial_raised', key: `w${r.wrathMax}` });
  }

  private onBuy(id: string): void {
    sfx.click(this.vol);
    if (LINE_NODES.has(id)) this.say('firstLine', { type: 'first_upgrade', key: 'line' });
    if (id === 'netter' && this.run.lv.netter === 5) this.say('firstHelper', { type: 'first_helper', key: 'netters5' });
    if (id === 'deeper') {
      this.onBandsChanged();
      this.ctx.saveSoon();
    }
    if (id === 'twin' && this.run.lv.twin === 1) this.say('twin', { type: 'mechanic_unlocked' });
    if (id === 'eel') this.say('eel', { type: 'mechanic_unlocked' });
    if (id === 'chum' && this.run.lv.chum === 1) this.say('chum', { type: 'first_upgrade', key: 'chum' });
    if (id.startsWith('bait.')) {
      const b = id.slice(5) as M.BaitId;
      if (this.run.bait === 'worm') this.run.bait = b;
      if (b === 'lock') this.say('lock', { type: 'mechanic_unlocked' });
      else this.say('bait', { type: 'mechanic_unlocked' });
    }
  }

  /** Bands changed (a purchase, or the Steward / a perk while the scene was open). */
  private onBandsChanged(): void {
    const b = this.run.bands;
    const firstTime = b > (this.per.maxBand ?? 1);
    this.per.maxBand = Math.max(this.per.maxBand ?? 1, b);
    this.buildLayout();
    for (let i = 0; i < PER_BAND; i++) this.spawnSoul(b - 1, false);
    const key = BAND_LESSON[b - 1];
    if (key) this.say(key, { type: 'mechanic_unlocked' });
    if (firstTime && b >= 3) this.say('deeper', { type: 'tier_reached', key: `band${b}` });
  }

  private say(trigger: string, opts: SayOpts): void {
    // Pilk chirps for a typed line the director hasn't shown before (its repeat key).
    if (opts.type && !this.ctx.save.seen[`mgr.${opts.type}.${opts.key ?? trigger}`]) sfx.pilk(this.vol, 3);
    this.ctx.say(trigger, opts);
  }

  private obStep(): string | null {
    const s = this.ctx.save;
    if (s.seen.onboardingDone || s.seen.onboardingSkipped) return null;
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
    // Something outside the scene changed the river (the Steward, a perk): redraw.
    if (this.run.bands !== this.lastBands) this.onBandsChanged();
    const wallKey = this.per.wall.map((t) => t.id + t.band).join() + M.wallSlots(this.per);
    if (wallKey !== this.lastWall) this.drawBackground();
    this.flavorT -= 0.5;
    if (this.flavorT <= 0 && !this.isIntense()) {
      this.flavorT = 90;
      this.ctx.say('flavor');
    }
    // keep the upgrade pulse on the netter during that onboarding step
    if (this.obStep() === 'hire') this.upgBtn.alpha = Math.floor(this.t * 3) % 2 ? 1 : 0.7;
    else this.upgBtn.alpha = 1;
  }

  // ---------- manager hooks ----------

  /** Toasts dodge the reveal card while it is up. */
  avoidRects(): Rect[] {
    return this.card ? [{ x: this.cardX(), y: this.cardY(), w: CARD_W, h: CARD_H }] : [];
  }

  isIntense(): boolean {
    return this.phase === 'nibble' || this.phase === 'reel' || !!this.ritual || (this.phase === 'land' && this.zoom > 0);
  }

  targetRect(id: string): Rect | null {
    const dcx = this.cx + Math.floor(this.cw / 2);
    const dcy = this.ctrlTop + 35;
    const btn = (b: Button | undefined): Rect | null => (b && b.visible ? { x: b.x, y: b.y, w: (b as any).opts?.w ?? b.width, h: (b as any).opts?.h ?? b.height } : null);
    switch (id) {
      case 'cast':
        return { x: this.riverL + 20, y: this.waterY + 4, w: 12, h: 12 };
      case 'cast.end':
        return { x: this.riverL + 20, y: Math.round(this.depthY(40)), w: 12, h: 12 };
      case 'river':
        return { x: this.riverL, y: this.waterY + 2, w: this.riverR - this.riverL, h: this.ctrlTop - this.waterY - 4 };
      case 'reel':
        return { x: dcx - 18, y: dcy - 18, w: 36, h: 36 };
      case 'reel.up':
        return { x: dcx - 6, y: dcy - 30, w: 12, h: 12 };
      case 'bobber':
        return this.phase === 'sink' || this.phase === 'wait' || this.phase === 'nibble' ? { x: this.hook.x - 6, y: this.waterY - 6, w: 13, h: 10 } : null;
      case 'upgrades':
        return btn(this.upgBtn);
      case 'bait':
        return btn(this.baitBtn);
      case 'codex':
        return btn(this.codexBtn);
      case 'wrath':
        return this.wBuy?.visible ? { x: this.wDown.x, y: this.wrathText.y - 1, w: 50, h: 40 } : null;
      case 'wrath.buy':
        return btn(this.wBuy);
      case 'keep':
        return btn(this.keepBtn);
      case 'wall': {
        const slots = M.wallSlots(this.per);
        return { x: this.wallX - 1, y: this.wallY - 1, w: slots * 6 + 5, h: 12 };
      }
      case 'wisp': {
        const w = this.wisps[0];
        return w ? { x: Math.round(w.x) - 6, y: w.y - 6, w: 13, h: 13 } : null;
      }
      case 'wisp.up': {
        const w = this.wisps[0];
        return w ? { x: Math.round(w.x) - 6, y: w.y - 22, w: 13, h: 13 } : null;
      }
      default:
        if (id.startsWith('band.')) {
          const b = Number(id.slice(5));
          if (!(b >= 0 && b < this.shownBands)) return null;
          const y0 = Math.round(this.depthY(b * M.BAND_PX));
          return { x: this.riverL + 20, y: y0 + 4, w: 12, h: 12 };
        }
        return null;
    }
  }

  // ---------- codex & wall ----------

  private openCodex(page = 0): void {
    if (this.codexOpen) this.closeCodex();
    this.codexOpen = true;
    sfx.click(this.vol);
    const L = this.ctx.layout;
    const m = this.modal;
    const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.7 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.closeCodex());
    m.addChild(dim);
    const rowH = 17;
    const w = this.cw - 6;
    const h = Math.max(120, this.bottom - this.top - 4);
    const x = this.cx + 3;
    const y = this.bottom - h - 2;
    const panel = new Graphics();
    drawPanel(panel, x, y, w, h, 0x1c2030, 0x4a5a7a);
    panel.eventMode = 'static';
    m.addChild(panel);
    const rows = Math.max(1, Math.floor((h - 44) / rowH));
    const pages = Math.ceil(M.SPECIES.length / rows);
    const wallPage = pages; // the last page is the Trophy Wall
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    const tabs: Button[] = [];
    const tabW = Math.floor((w - 12 - 28) / 2);
    tabs.push(new Button({ w: tabW, h: 13, label: page < wallPage ? `CODEX ${page + 1}/${pages}` : 'CODEX', ...(page < wallPage ? { color: C.gold, shade: 0x9a7a20 } : dark), onTap: () => this.openCodex(page < wallPage ? (page + 1) % pages : 0) }));
    tabs.push(new Button({ w: tabW, h: 13, label: `WALL ${this.per.wall.length}/${M.wallSlots(this.per)}`, ...(page === wallPage ? { color: C.gold, shade: 0x9a7a20 } : dark), onTap: () => this.openCodex(wallPage) }));
    tabs.push(new Button({ w: 24, h: 13, label: 'X', ...dark, onTap: () => this.closeCodex() }));
    tabs[0].position.set(x + 4, y + 4);
    tabs[1].position.set(x + 6 + tabW, y + 4);
    tabs[2].position.set(x + w - 28, y + 4);
    m.addChild(...tabs);
    const ty = y + 22;
    if (page < wallPage) {
      // The Codex as a map (Wave 1, research R4): silhouettes with rumoured hints for the gaps,
      // bests and bronze / silver / gold frames (1 / 10 / 50) for the souls you know, and which
      // ones the netters can bag (only souls landed by hand, plus the commons).
      const title = new PixelText(`SOUL CODEX ${M.codexCount(this.per)}/${M.SPECIES.length}  NETS KNOW ${M.netKnownCount(this.per)}`, C.goldText);
      title.position.set(x + 6, ty);
      m.addChild(title);
      const fit = (t: string, maxW: number) => (measure(t).w > maxW ? t.slice(0, Math.max(1, Math.floor((maxW + 1) / 4))) : t);
      M.SPECIES.slice(page * rows, page * rows + rows).forEach((sp, i) => {
        const ry = ty + 10 + i * rowH;
        const n = this.per.codex[sp.id] ?? 0;
        const bgr = new Graphics().rect(x + 3, ry, w - 6, rowH - 1).fill(i % 2 ? 0x22283a : 0x262e42);
        const tier = M.codexTier(n);
        if (tier > 0) {
          const fc = TIER_COL[tier];
          bgr.rect(x + 4, ry + 1, 14, 1).fill(fc).rect(x + 4, ry + rowH - 3, 14, 1).fill(fc).rect(x + 4, ry + 1, 1, rowH - 3).fill(fc).rect(x + 17, ry + 1, 1, rowH - 3).fill(fc);
        }
        const best = this.per.best?.[sp.id];
        if (n > 0 && best) for (let k = 0; k < 3; k++) drawSprite(bgr, STAR, { x: k < best.s ? 0xffd040 : 0x3a3448 }, x + w - 22 + k * 6, ry + 3);
        m.addChild(bgr);
        const sz = soulSize(sp.id);
        const icon = new Graphics(soulArt(sp.id, 0));
        icon.position.set(x + 11, ry + Math.floor(rowH / 2));
        if (sz.h > 11 || sz.w > 11) icon.scale.set(0.7);
        if (n <= 0) {
          icon.tint = 0x000000;
          icon.alpha = 0.75;
        }
        m.addChild(icon);
        const col = sp.rarity === 'legendary' ? '#ffe070' : sp.rarity === 'rare' ? '#c0a0ff' : sp.rarity === 'uncommon' ? '#8fd14f' : C.ink;
        const tw = w - 30 - (n > 0 && best ? 20 : 0);
        const t1 = new PixelText(fit(n > 0 ? `${sp.name.toUpperCase()} X${n}` : `??? ${sp.rarity.toUpperCase()}`, tw), n > 0 ? col : '#7a6e80');
        t1.position.set(x + 22, ry + 2);
        const line2 = n > 0 ? (best ? `BEST ${M.heftSt(sp, best.h)}ST ${sp.note}` : sp.note) : M.HINTS[sp.id] ?? '';
        const t2 = new PixelText(fit(line2, w - 30), n > 0 ? C.inkDim : '#8a7ea0');
        t2.position.set(x + 22, ry + 9);
        m.addChild(t1, t2);
      });
    } else {
      const slots = M.wallSlots(this.per);
      const title = new PixelText(`TROPHY WALL  ${this.per.wall.length}/${slots} SLOTS`, C.goldText);
      title.position.set(x + 6, ty);
      const sub = new PixelText(wrap('KEEP A RARE CATCH INSTEAD OF SELLING IT. +2% PER RARE, +10% PER LEGEND, FOR ITS DEPTH, FOREVER. +1 SLOT PER 5 CODEX SOULS.', w - 12), C.inkDim);
      sub.position.set(x + 6, ty + 9);
      m.addChild(title, sub);
      const sy = ty + 12 + sub.height;
      for (let i = 0; i < slots; i++) {
        const ry = sy + i * rowH;
        if (ry + rowH > y + h - 4) break;
        const tr = this.per.wall[i];
        const bgr = new Graphics().rect(x + 3, ry, w - 6, rowH - 1).fill(i % 2 ? 0x22283a : 0x262e42);
        m.addChild(bgr);
        if (!tr) {
          const t = new PixelText('EMPTY SLOT', '#7a6e80');
          t.position.set(x + 22, ry + 5);
          m.addChild(t);
          continue;
        }
        const sp = M.SPECIES_BY_ID[tr.id];
        const icon = new Graphics(soulArt(tr.id, 0));
        icon.position.set(x + 11, ry + Math.floor(rowH / 2));
        if (soulSize(tr.id).h > 11) icon.scale.set(0.7);
        m.addChild(icon);
        const t1 = new PixelText(sp.name.toUpperCase(), sp.rarity === 'legendary' ? '#ffe070' : '#c0a0ff');
        t1.position.set(x + 22, ry + 2);
        const t2 = new PixelText(`${M.BANDS[tr.band].name} +${Math.round(M.trophyBonus(tr) * 100)}%`, C.inkDim);
        t2.position.set(x + 22, ry + 9);
        m.addChild(t1, t2);
      }
      // per-band totals
      const parts: string[] = [];
      for (let b = 0; b < M.MAX_BANDS; b++) {
        const k = M.wallMult(this.per, b);
        if (k > 1) parts.push(`${M.BANDS[b].name.split(' ')[0]} X${k.toFixed(2)}`);
      }
      const tot = new PixelText(wrap(parts.length ? parts.join('  ') : 'NO TROPHIES YET', w - 12), C.greenText);
      tot.position.set(x + 6, y + h - 6 - tot.height);
      m.addChild(tot);
    }
  }

  private closeCodex(): void {
    if (!this.codexOpen) return;
    this.codexOpen = false;
    this.modal.removeChildren().forEach((c) => destroyTree(c));
  }

  // ---------- lifecycle ----------

  resize(_layout: Layout): void {
    this.closeCodex();
    this.buildLayout();
  }

  destroy(): void {
    this.destroyed = true;
    this.closeCodex();
    if (this.ritual) this.endRitual();
    this.sellPending();
    this.riverHit.removeAllListeners();
    this.zoneHit.removeAllListeners();
    for (const t of this.bandLabels) t.destroy();
    this.bandLabels = [];
    // Pooled soul graphics share cached contexts: detach them before destroying.
    for (const s of this.souls) this.pool.push(s.g);
    for (const g of [...this.pool, this.ripG, this.cardIcon]) {
      g.parent?.removeChild(g);
      g.destroy({ context: false });
    }
    this.pool = [];
    this.souls = [];
    this.world.mask = null;
    for (const g of this.ownedG) {
      g.parent?.removeChild(g);
      g.destroy();
    }
    destroyTree(this.root);
  }
}
