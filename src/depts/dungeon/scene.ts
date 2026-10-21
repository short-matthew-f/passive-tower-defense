// The Dungeon scene (specs/01): an 11x13 floor with one winding path and side loops. Drag a tray
// piece onto a glowing tile (or tap the piece, then the tile) to build; tap a piece to upgrade,
// branch, swap, move or sell it; hold a piece and drag it to move it. Tap near a visitor to Glare,
// ring the Gong to call the next party, drop the Trapdoor under a runner. DIG carves new walls,
// chambers and corridors (heroes route by greed: chest by chest, then the Hoard). The simulation
// lives in sim.ts (shared with idleRate); this file renders and handles input.
import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure } from '../../ui/font';
import { Button, C, drawBar } from '../../ui/widgets';
import * as M from './model';
import { COLS, FLOORS, ROWS, TILE, canDig, idx, isWalkable, lairPost, tileKind, K_ROCK, type Grid } from './map';
import { dungeonImports, Sim, STEP, type SimEvent, type SimHero } from './sim';
import {
  chestArt,
  clerkArt,
  coinArt,
  GOLD,
  heroArt,
  heroIcon,
  hoardArt,
  minionArt,
  OUTLINE,
  PAL,
  pieceArt,
  sackArt,
} from './art';
import { anyAffordable, buildGroups } from './upgrades';
import { destroyTree } from '../../ui/destroy';

const BOARD_W = COLS * TILE;
const BOARD_H = ROWS * TILE;
const TRAY_H = 40;
const ABIL_H = 19;
const TOP_H = 22;
const MAX_COINS = 40;
const MAX_PARTS = 150;
const MAX_TRACERS = 40;
const DRAG_PX = 6;

const CHAMP_NAMES = [
  'SIR REGINALD THE MILDLY BRAVE',
  'DAME OSWYN OF THE OVERDUE LOAN',
  'SIR PERCIVAL THE PUNCTUAL',
  'LADY BRISK OF BRIGHTWATER',
  'SIR GARETH THE GOLD-CURIOUS',
  'BARON THADDEUS THE TAXED',
];

const PREVIEW_ORDER: M.HeroType[] = ['squire', 'rogue', 'knight', 'cleric', 'wizard', 'champ'];

/** Live floor state for onboarding / lesson `waitFor` and `done` checks (they only get the save). */
export const live = {
  heroes: 0,
  on: { squire: false, rogue: false, knight: false, cleric: false, wizard: false, champ: false } as Record<M.HeroType, boolean>,
  gongReady: false,
  trapReady: false,
  glareReady: false,
  coins: 0,
  /** A party has entered at Lure >= 1 since the scene opened (Lure lesson beat 2). */
  lureParty: false,
};

type Armed = M.PieceKind | M.TrayExtra | null;
type Sel = { t: 'piece'; id: number } | { t: 'chest'; spot: number } | { t: 'ghost'; i: number } | { t: 'dug'; i: number } | null;

interface HeroView {
  g: Graphics;
  sack: Graphics;
  hpBg: Sprite;
  hp: Sprite;
}

interface PieceView {
  g: Graphics;
  pips: Graphics;
  key: string;
  k: M.PieceKind;
}

interface Coin {
  g: Graphics;
  x: number;
  y: number;
  vy: number;
  ground: number;
  t: number;
  amount: number;
  fly: number; // > 0 while flying to the bank
  fx: number;
  fy: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
  size: number;
}

interface Tracer {
  kind: 'arrow' | 'ballista' | 'clerk' | 'glare' | 'dispel';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  max: number;
  miss: boolean;
}

const rand = Math.random;
const SELL_COL: [number, number] = [C.red, 0x7a2020];
const SWAP_COL: [number, number] = [0x5a9ad8, 0x2a5a8a];
const fm = (n: number) => formatNum(n);
const EXTRA_LABEL: Record<M.TrayExtra, string> = { chest: 'CHEST', 'dig.w': 'WALL', 'dig.c': 'ROOM', 'dig.p': 'CARVE' };
const isPiece = (k: Armed): k is M.PieceKind => !!k && k in M.PIECES;
const digKind = (k: Armed): 'w' | 'c' | 'p' | null => (k === 'dig.w' ? 'w' : k === 'dig.c' ? 'c' : k === 'dig.p' ? 'p' : null);

export class DungeonScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.DungeonRun;
  private per: M.DungeonPersistent;
  private grid: Grid;
  private sim: Sim;
  private groups: UpgradeGroup[];

  // layout
  private bx = 0;
  private by = 0;
  private topY = 0;
  private abilY = 0;
  private trayY = 0;
  private x0 = 0;
  private uw = 0;

  // layers
  private bg = new Graphics();
  private ghostG = new Graphics();
  private ghostLayer = new Container();
  private overlayG = new Graphics();
  private pieceLayer = new Container();
  private minionLayer = new Container();
  private heroLayer = new Container();
  private coinLayer = new Container();
  private fxG = new Graphics();
  private dragG = new Graphics();
  private hit = new Container();
  private ui = new Container();
  private uiG!: Graphics;
  private bannerG = new Graphics();
  private banner = new PixelText('', '#e8c04a');
  private ritualLayer = new Container();

  // views
  private pieceViews = new Map<number, PieceView>();
  private chestViews = new Map<number, Graphics>();
  private heroViews: HeroView[] = [];
  private minionViews: Graphics[] = [];
  private clerk = new Graphics();
  private hoard = new Graphics();
  private coins: Coin[] = [];
  private coinPool: Graphics[] = [];
  private parts: Part[] = [];
  private tracers: Tracer[] = [];

  // ui
  private previewG!: Graphics;
  private previewIcons: Graphics[] = [];
  private previewTexts: PixelText[] = [];
  private previewKey = '';
  private nextLabel!: PixelText;
  private lureText!: PixelText;
  private status!: PixelText;
  private lureDown!: Button;
  private lureUp!: Button;
  private gongBtn!: Button;
  private glareBtn!: Button;
  private trapBtn!: Button;
  private shopBtn!: Button;
  private tab = 0;
  private tabBtns: Button[] = [];
  private slotBtns: Button[] = [];
  private slotBox!: Container;
  private panel!: Container;
  private panelTitle!: PixelText;
  private panelInfo!: PixelText;
  private pUp!: Button;
  private pUp1!: Button;
  private pA!: Button;
  private pB!: Button;
  private pMove!: Button;
  private pSell!: Button;
  private btnCache = new Map<Button, string>();
  private badge!: Graphics;

  // state
  private acc = 0;
  private time = 0;
  private armed: Armed = null;
  private sel: Sel = null;
  private moving = false;
  private trapArmed = false;
  private glareArmed = false;
  private glareCd = 0;
  private aim: { h: SimHero | null } | null = null;
  private placedAt = new Map<number, number>();
  private settleUntil = new Map<number, number>();
  private shakeT = 0;
  private bannerT = 0;
  private overlayDirty = true;
  private slowT = 0;
  private flavorT = 40;
  private champName = '';
  private hoardLevel = -1;
  private coinLife = M.COIN_LIFE;
  private revDirty = -1;
  /** Pointer gestures: a press on a piece (hold to drag), a drag from the tray. */
  private press: { id: number; x: number; y: number; t: number } | null = null;
  private dragPiece: number | null = null;
  private trayDrag: { kind: Armed; x: number; y: number; active: boolean } | null = null;
  private hover: [number, number] | null = null;
  private justDropped = -1;
  private ritual: { done: (score: number) => void } | null = null;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    M.normalize(ctx.save.run, ctx.save.persistent);
    this.run = ctx.save.run as M.DungeonRun;
    this.per = ctx.save.persistent as M.DungeonPersistent;
    this.run.lure = Math.max(0, Math.min(this.run.lure, this.run.lureMax));
    if (this.run.floor >= (this.per.floors ?? 1)) M.switchFloor(this.run, 0);
    // Cycle start (01 §4): last cycle's layout becomes ghosts; Master Mason rebuilds what it can.
    if (M.startCycle(this.run, this.per, ctx.save.cycle.n)) ctx.saveSoon();
    if (this.per.mason) M.masonRebuild(this.run, this.per);
    this.grid = M.gridOf(this.run, this.per);
    this.sim = new Sim({
      pieces: this.run.pieces,
      bait: this.run.bait,
      ws: this.run.ws,
      lure: this.run.lure,
      party: this.run.party,
      grid: this.grid,
      seed: (Date.now() & 0x7fffffff) ^ 0x5bd1e995,
      live: true,
      ...dungeonImports(ctx.save.imports),
    });
    this.sim.stealFn = (h) => this.steal(h);
    this.groups = buildGroups(ctx, {
      changed: () => this.layoutChanged(),
      lureBought: () => this.onLureBought(),
      floor: (f) => this.travel(f),
    });
    this.root.addChild(
      this.bg,
      this.ghostG,
      this.ghostLayer,
      this.overlayG,
      this.pieceLayer,
      this.minionLayer,
      this.heroLayer,
      this.fxG,
      this.coinLayer,
      this.dragG,
      this.bannerG,
      this.banner,
      this.ui,
      this.hit,
      this.ritualLayer,
    );
    live.lureParty = false;
    this.buildLayout();
    this.syncPieces();
    this.updateBlueprint();
    ctx.raiseSkill(M.heldLure(this.run));
  }

  private updateBlueprint(): void {
    this.per.bp = M.blueprint(this.run, this.ctx.save.cycle.n);
  }

  // ---------- layout ----------

  private tx(x: number): number {
    return this.bx + x * TILE;
  }

  private ty(y: number): number {
    return this.by + y * TILE;
  }

  private buildLayout(): void {
    const c = this.ctx.content();
    this.x0 = c.x + 4;
    this.uw = c.w - 8;
    this.trayY = c.y + c.h - 2 - TRAY_H;
    this.abilY = this.trayY - 2 - ABIL_H;
    this.by = this.abilY - 2 - BOARD_H;
    this.bx = c.x + Math.floor((c.w - BOARD_W) / 2);
    this.topY = Math.max(c.y + 1, this.by - TOP_H);

    this.drawBackground();
    this.placeBoardArt();

    // UI.
    this.ui.removeChildren().forEach((ch) => destroyTree(ch));
    this.btnCache.clear();
    this.previewTexts = [];
    this.previewIcons = [];
    this.previewKey = '';
    this.nextLabel = new PixelText('NEXT', C.inkDim);
    this.lureText = new PixelText('');
    this.status = new PixelText('', C.inkDim);
    this.panelTitle = new PixelText('');
    this.panelInfo = new PixelText('', C.inkDim);
    this.previewG = new Graphics();
    this.uiG = new Graphics();
    this.badge = new Graphics();
    this.slotBox = new Container();
    this.panel = new Container();
    this.ui.addChild(this.previewG, this.nextLabel, this.lureText, this.status);

    const x0 = this.x0;
    const right = x0 + this.uw;
    const mk = (o: ConstructorParameters<typeof Button>[0], x: number, y: number, parent: Container = this.ui) => {
      const b = new Button(o);
      b.position.set(x, y);
      parent.addChild(b);
      return b;
    };
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };

    // Top row: party preview (left), Lure dial (right).
    const ty = this.topY;
    this.nextLabel.position.set(x0, ty + 4);
    for (let i = 0; i < 8; i++) {
      const t = new PixelText('', C.ink);
      const ig = new Graphics();
      ig.visible = false;
      this.previewTexts.push(t);
      this.previewIcons.push(ig);
      this.ui.addChild(ig, t);
    }
    this.lureUp = mk({ w: 30, h: 12, label: '+', ...dark, onTap: () => this.lureStep(1) }, right - 30, ty);
    this.lureDown = mk({ w: 13, h: 12, label: '-', ...dark, onTap: () => this.lureStep(-1) }, right - 30 - 2 - 28 - 2 - 13, ty);
    this.lureText.position.set(right - 30 - 2 - 28, ty + 4);
    this.status.position.set(x0, ty + 15);

    // Ability row.
    const ay = this.abilY;
    const gap = 2;
    const aw = Math.floor((this.uw - gap * 3) / 4);
    this.gongBtn = mk({ w: aw, h: ABIL_H - 1, label: 'GONG', sub: '', color: 0xc08a3a, shade: 0x7a5420, onTap: () => this.ringGong() }, x0, ay);
    this.glareBtn = mk({ w: aw, h: ABIL_H - 1, label: 'GLARE', sub: '', color: 0xc04a6a, shade: 0x7a2a40, textColor: C.ink, onTap: () => this.armGlare() }, x0 + aw + gap, ay);
    this.trapBtn = mk({ w: aw, h: ABIL_H - 1, label: 'TRAP', sub: '', color: 0x8a6a4a, shade: 0x5a4028, textColor: C.ink, onTap: () => this.armTrap() }, x0 + (aw + gap) * 2, ay);
    this.shopBtn = mk({ w: this.uw - (aw + gap) * 3, h: ABIL_H - 1, label: 'WORKSHOP', sub: '', ...dark, onTap: () => this.openShop() }, x0 + (aw + gap) * 3, ay);
    this.badge.position.set(this.shopBtn.x + this.shopBtn.width - 7, ay - 3);

    // Tray: a tab row (TOWER LAIR RUNE DIG) over four build slots (01 §10).
    const sw = Math.floor((this.uw - gap * 3) / 4);
    this.tabBtns = M.TABS.map((t, i) => {
      const w = i === 3 ? this.uw - (sw + gap) * 3 : sw;
      return mk({ w, h: 12, label: t.label, ...dark, onTap: () => this.setTab(i) }, x0 + i * (sw + gap), this.trayY, this.slotBox);
    });
    this.slotBtns = [0, 1, 2, 3].map((i) => {
      const w = i === 3 ? this.uw - (sw + gap) * 3 : sw;
      const b = mk({ w, h: 22, label: '', sub: '', onTap: () => this.tapSlot(i) }, x0 + i * (sw + gap), this.trayY + 15, this.slotBox);
      b.on('pointerdown', (e: FederatedPointerEvent) => this.trayDown(i, e));
      b.on('pointerupoutside', (e: FederatedPointerEvent) => this.trayUp(e));
      return b;
    });

    // Selected-piece panel.
    const py = this.trayY;
    this.panelTitle.position.set(x0, py + 1);
    this.panelInfo.position.set(x0, py + 9);
    const bw = sw;
    this.pUp = mk({ w: bw * 2 + gap, h: 20, label: 'UPGRADE', sub: '', onTap: () => this.panelAction('up') }, x0, py + 18, this.panel);
    this.pUp1 = mk({ w: bw, h: 20, label: 'UP', sub: '', onTap: () => this.panelAction('up') }, x0, py + 18, this.panel);
    this.pA = mk({ w: bw, h: 20, label: 'A', sub: '', color: SWAP_COL[0], shade: SWAP_COL[1], onTap: () => this.panelAction('a') }, x0, py + 18, this.panel);
    this.pB = mk({ w: bw, h: 20, label: 'B', sub: '', color: SWAP_COL[0], shade: SWAP_COL[1], onTap: () => this.panelAction('b') }, x0 + bw + gap, py + 18, this.panel);
    this.pMove = mk({ w: bw, h: 20, label: 'MOVE', ...dark, onTap: () => this.panelAction('move') }, x0 + (bw + gap) * 2, py + 18, this.panel);
    this.pSell = mk({ w: this.uw - (bw + gap) * 3, h: 20, label: 'SELL', sub: '', color: C.red, shade: 0x7a2020, textColor: C.ink, onTap: () => this.panelAction('sell') }, x0 + (bw + gap) * 3, py + 18, this.panel);
    mk({ w: 16, h: 13, label: 'X', ...dark, onTap: () => this.select(null) }, right - 16, py, this.panel);
    this.panel.addChild(this.panelTitle, this.panelInfo);

    this.ui.addChild(this.slotBox, this.panel, this.badge, this.uiG);
    this.refreshTray();

    // Champion banner.
    this.banner.visible = false;
    this.bannerG.visible = false;

    // Board input.
    this.hit.removeAllListeners();
    this.hit.eventMode = 'static';
    this.hit.hitArea = new Rectangle(this.bx, this.by, BOARD_W, BOARD_H);
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.hit.on('pointerup', (e: FederatedPointerEvent) => this.onUp(e));
    this.hit.on('pointerupoutside', (e: FederatedPointerEvent) => this.onUpOutside(e));
    this.overlayDirty = true;
  }

  /** Hoard, Ledger-Bones and the Bait Chest spots (after a layout or grid change). */
  private placeBoardArt(): void {
    const [hx, hy] = this.grid.hoard;
    this.hoard.position.set(this.tx(hx), this.ty(hy));
    this.clerk.position.set(this.tx(hx) - 3, this.ty(hy) + 15);
    if (!this.hoard.parent) this.pieceLayer.addChild(this.hoard, this.clerk);
    this.clerk.context = clerkArt(0);
    this.hoardLevel = -1;
    for (const [, g] of this.chestViews) g.destroy();
    this.chestViews.clear();
    for (const spot of this.grid.spots) {
      const g = new Graphics(chestArt(this.run.bait.includes(spot), false));
      g.position.set(this.tx(spot % COLS), this.ty(Math.floor(spot / COLS)));
      this.pieceLayer.addChild(g);
      this.chestViews.set(spot, g);
    }
  }

  private slotColor(k: Armed): { color: number; shade: number; textColor: string } {
    if (k === 'chest') return { color: 0xc8a040, shade: 0x8a6a20, textColor: '#140c1c' };
    if (digKind(k)) return { color: 0xa08a6a, shade: 0x6a5a40, textColor: '#140c1c' };
    if (!isPiece(k)) return { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    const slot = M.PIECES[k].slot;
    if (slot === 'wall') return { color: 0x8fb04f, shade: 0x4a6a22, textColor: '#140c1c' };
    if (slot === 'chamber') return { color: 0x5a9ad8, shade: 0x2a5a8a, textColor: '#140c1c' };
    return { color: 0x9a6ad0, shade: 0x5a3a8a, textColor: '#140c1c' };
  }

  private drawBackground(): void {
    const c = this.ctx.content();
    const L = this.ctx.layout;
    const G = this.grid;
    this.bg.cacheAsTexture(false);
    const g = this.bg.clear();
    g.rect(0, c.y, L.w, L.h - c.y).fill(PAL.rock);
    let seed = 777 + G.f * 31;
    const r = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 90; i++) g.rect(Math.floor(r() * L.w), c.y + Math.floor(r() * c.h), 2 + Math.floor(r() * 6), 1).fill(PAL.rockSpeck);
    // Cave ceiling above the board: stalactites, and chains with lanterns when there is room.
    const zone = this.topY - c.y;
    for (let x = 0; x < L.w; x += 6 + Math.floor(r() * 9)) {
      const h = Math.min(Math.max(2, zone - 4), 3 + Math.floor(r() * 10));
      for (let k = 0; k < h; k++) {
        const w = Math.max(1, Math.round(4 * (1 - k / h)));
        g.rect(x + Math.floor((4 - w) / 2), c.y + k, w, 1).fill(PAL.rockSpeck);
      }
    }
    const lamp = G.f === 2 ? 0x6ab0d0 : G.f === 1 ? 0xd0c08a : 0x6ad08a;
    if (zone > 44) {
      for (const fx of [0.18, 0.82]) {
        const x = Math.round(c.x + c.w * fx);
        const len = Math.min(zone - 16, 14 + Math.floor(zone * 0.3));
        for (let y = c.y; y < c.y + len; y += 3) g.rect(x, y, 1, 2).fill(0x4a4458);
        const ly = c.y + len;
        g.rect(x - 3, ly, 7, 9).fill(OUTLINE).rect(x - 2, ly + 1, 5, 7).fill(0x3a3440).rect(x - 1, ly + 2, 3, 5).fill(lamp).rect(x, ly + 3, 1, 2).fill(0xd0ffd8);
        g.circle(x, ly + 4, 14).fill({ color: lamp, alpha: 0.05 });
        g.circle(x, ly + 4, 8).fill({ color: lamp, alpha: 0.07 });
      }
    }
    // Board frame.
    const { bx, by } = this;
    g.rect(bx - 2, by - 2, BOARD_W + 4, BOARD_H + 4).fill(OUTLINE);
    const wallC = G.f === 1 ? [0x3a3a40, 0x4c4c54, 0x2a2a30] : G.f === 2 ? [0x2d3a4a, 0x3c4d5e, 0x1f2a37] : [PAL.wall, PAL.wallLight, PAL.wallDark];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const px = bx + x * TILE;
        const py = by + y * TILE;
        const k = tileKind(G, x, y);
        const i = idx(x, y);
        const loop = G.loop[i] === 1;
        if (k === 'rock') {
          g.rect(px, py, TILE, TILE).fill(PAL.rock);
          if (r() < 0.6) g.rect(px + Math.floor(r() * 12), py + Math.floor(r() * 12), 3, 2).fill(PAL.rockSpeck);
          // Diggable: a faint pick-mark grid so the player sees where DIG works.
          g.rect(px + 7, py + 7, 2, 2).fill(0x2a1f37);
        } else if (k === 'wall') {
          g.rect(px, py, TILE, TILE).fill(wallC[2]);
          for (let row = 0; row < 4; row++) {
            const off = row % 2 ? 4 : 0;
            for (let col = -1; col < 2; col++) {
              const bx0 = px + off + col * 8;
              const xa = Math.max(px, bx0 + 1);
              const xb = Math.min(px + TILE, bx0 + 8);
              if (xb - xa <= 0) continue;
              g.rect(xa, py + row * 4 + 1, xb - xa, 3).fill(wallC[0]);
              g.rect(xa, py + row * 4 + 1, xb - xa, 1).fill(wallC[1]);
            }
          }
          if (G.dug[i]) g.rect(px, py, TILE, 1).fill(0x8a7a5a);
        } else if (k === 'chamber') {
          g.rect(px, py, TILE, TILE).fill(PAL.chamber);
          g.rect(px + 1, py + 1, TILE - 2, TILE - 2).fill(PAL.chamberLight);
          g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill(PAL.chamber);
          for (let n = 0; n < 3; n++) g.rect(px + 3 + Math.floor(r() * 9), py + 3 + Math.floor(r() * 9), 1, 1).fill(0x3a5a3a);
          if (G.dug[i]) g.rect(px, py, TILE, 1).fill(0x8a7a5a);
        } else {
          const water = G.water[i] === 1;
          const base = water ? 0x2a4a6a : loop ? PAL.loop : PAL.path;
          const light = water ? 0x3a6a8a : loop ? PAL.loopLight : PAL.pathLight;
          g.rect(px, py, TILE, TILE).fill(base);
          if (water) {
            g.rect(px + 1, py + 4, 5, 1).fill(light).rect(px + 8, py + 9, 6, 1).fill(light).rect(px + 3, py + 13, 4, 1).fill(light);
          } else {
            g.rect(px + 1, py + 1, 6, 6).fill(light).rect(px + 9, py + 2, 6, 5).fill(light).rect(px + 2, py + 9, 5, 6).fill(light).rect(px + 8, py + 9, 7, 6).fill(light);
            g.rect(px + 1, py + 6, 6, 1).fill(PAL.pathDark).rect(px + 9, py + 6, 6, 1).fill(PAL.pathDark);
          }
        }
      }
    // Path edges: a dark lip where floor meets wall, so the corridor reads.
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!isWalkable(G, x, y)) continue;
        const px = bx + x * TILE;
        const py = by + y * TILE;
        if (!isWalkable(G, x, y - 1)) g.rect(px, py, TILE, 1).fill(OUTLINE);
        if (!isWalkable(G, x, y + 1)) g.rect(px, py + TILE - 1, TILE, 1).fill(0x2a2030);
        if (!isWalkable(G, x - 1, y)) g.rect(px, py, 1, TILE).fill(OUTLINE);
        if (!isWalkable(G, x + 1, y)) g.rect(px + TILE - 1, py, 1, TILE).fill(0x2a2030);
      }
    // Entry archway.
    const ex = this.tx(G.entry[0]);
    const ey = this.ty(G.entry[1]);
    g.rect(ex + 1, ey, 14, 9).fill(OUTLINE);
    g.rect(ex + 2, ey, 12, 1).fill(0x6a5a7a);
    for (let i = 3; i < 14; i += 3) g.rect(ex + i, ey + 1, 1, 7).fill(0x4a4458);
    g.rect(ex + 1, ey + 3, 14, 1).fill(0x4a4458);
    // Bottom control strip.
    const stripY = this.abilY - 2;
    g.rect(0, stripY, L.w, L.h - stripY).fill(0x1c1028);
    g.rect(0, stripY, L.w, 1).fill(OUTLINE);
    // ~1.5K static rects: bake them once so the GPU draws one quad per frame.
    this.bg.cacheAsTexture({ resolution: 1, antialias: false });
  }

  // ---------- pieces ----------

  private tierOf(l: number): number {
    return l >= 10 ? 2 : l >= M.BRANCH_LEVEL ? 1 : 0;
  }

  private syncPieces(): void {
    const ids = new Set(this.run.pieces.map((p) => p.id));
    for (const [id, v] of this.pieceViews) {
      if (ids.has(id)) continue;
      v.g.destroy();
      v.pips.destroy();
      this.pieceViews.delete(id);
    }
    for (const p of this.run.pieces) {
      let v = this.pieceViews.get(p.id);
      if (!v) {
        const g = new Graphics();
        const pips = new Graphics();
        // Runes sit under everything else (they are floor carvings).
        if (M.PIECES[p.k].slot === 'path') this.pieceLayer.addChildAt(g, 0);
        else this.pieceLayer.addChild(g);
        this.pieceLayer.addChild(pips);
        v = { g, pips, key: '', k: p.k };
        this.pieceViews.set(p.id, v);
      }
      const key = `${p.k}.${p.l}.${p.b}.${p.b2 ?? 0}.${p.x}.${p.y}`;
      if (key !== v.key) {
        v.key = key;
        v.g.context = pieceArt(p.k, this.tierOf(p.l), p.b, 0);
        v.g.position.set(this.tx(p.x), this.ty(p.y));
        // Level pips along the bottom edge (one per level past 1, max 9).
        const pg = v.pips.clear();
        const n = p.l - 1;
        if (n > 0) {
          const w = Math.min(n, 9) * 2 - 1;
          pg.rect(-1, -1, w + 2, 3).fill(OUTLINE);
          for (let i = 0; i < Math.min(n, 9); i++) pg.rect(i * 2, 0, 1, 1).fill(i >= 8 ? GOLD : i >= 3 ? 0x6ac0d0 : 0xd8d0b0);
          v.pips.position.set(this.tx(p.x) + Math.floor((TILE - w) / 2), this.ty(p.y) + TILE - 2);
        }
      }
    }
    // Ghost blueprints (this floor's).
    const g = this.ghostG.clear();
    this.ghostLayer.removeChildren().forEach((c) => c.destroy());
    let shown = 0;
    for (const gh of this.per.ghosts) {
      if ((gh.f ?? 0) !== this.run.floor || M.pieceAt(this.run, gh.x, gh.y) || shown >= 80) continue;
      shown++;
      const sil = new Graphics(pieceArt(gh.k, 0, 0, 0));
      sil.position.set(this.tx(gh.x), this.ty(gh.y));
      sil.alpha = 0.3;
      this.ghostLayer.addChild(sil);
      const px = this.tx(gh.x);
      const py = this.ty(gh.y);
      g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill({ color: 0x6ac0d0, alpha: 0.18 });
      g.rect(px + 2, py + 2, TILE - 4, 1).rect(px + 2, py + TILE - 3, TILE - 4, 1).rect(px + 2, py + 2, 1, TILE - 4).rect(px + TILE - 3, py + 2, 1, TILE - 4).fill({ color: 0x6ac0d0, alpha: 0.6 });
    }
    for (const [spot, cv] of this.chestViews) cv.context = chestArt(this.run.bait.includes(spot), false);
    this.overlayDirty = true;
  }

  private ghostAt(x: number, y: number): number {
    return this.per.ghosts.findIndex((g) => g.x === x && g.y === y && (g.f ?? 0) === this.run.floor && !M.pieceAt(this.run, x, y));
  }

  private validTile(k: M.PieceKind, x: number, y: number): boolean {
    return M.validTile(this.grid, this.run, k, x, y);
  }

  private canDigAt(k: 'w' | 'c' | 'p', x: number, y: number): boolean {
    return canDig(this.grid, x, y, k) && !M.pieceAt(this.run, x, y);
  }

  /** The idle sim reruns when run.rev changes; bump it 1.5 s after the last edit (01 §3 debounce). */
  private touch(): void {
    this.revDirty = this.time;
  }

  private settleMap(): Map<number, number> {
    const settle = new Map<number, number>();
    for (const [id, until] of this.settleUntil) {
      const left = until - this.time;
      if (left > 0) settle.set(id, left);
      else this.settleUntil.delete(id);
    }
    return settle;
  }

  /** Called after every change the sim depends on. */
  private layoutChanged(): void {
    this.touch();
    this.sim.setLayout(this.run.pieces, this.run.bait, this.run.ws, this.settleMap());
    this.syncPieces();
    this.updateBlueprint();
    this.run.stats.bestPieces = Math.max(this.run.stats.bestPieces, this.run.pieces.length);
  }

  /** Dig or a floor switch changed the grid: re-route, redraw the floor. */
  private regrid(): void {
    this.grid = M.gridOf(this.run, this.per);
    this.touch();
    this.sim.setLayout(this.run.pieces, this.run.bait, this.run.ws, this.settleMap(), this.grid);
    this.drawBackground();
    this.placeBoardArt();
    this.syncPieces();
    this.updateBlueprint();
  }

  private place(k: M.PieceKind, x: number, y: number): boolean {
    if (!this.validTile(k, x, y)) return false;
    if (M.PIECES[k].slot === 'path' && M.runeCount(this.run) >= M.runeSlots(this.run)) {
      this.ctx.game.toast('RUNE SLOTS FULL. BUY MORE IN THE WORKSHOP.');
      return false;
    }
    const cost = M.placeCost(this.run, k);
    if (!this.ctx.spend(cost)) {
      this.floatAt(x + 0.5, y + 0.2, `NEED ${fm(cost)}`, '#e05050');
      return false;
    }
    const p: M.PieceSave = { id: this.run.nextId++, k, x, y, l: 1, b: 0, b2: 0, inv: cost };
    this.run.pieces.push(p);
    this.run.stats.placed++;
    this.placedAt.set(p.id, this.time);
    const gi = this.ghostAt(x, y);
    if (gi >= 0) this.per.ghosts.splice(gi, 1);
    this.layoutChanged();
    this.puff(x + 0.5, y + 0.5, 0xd8d0b0, 6);
    this.ctx.haptic(8);
    if (k === 'ballista') this.ctx.say('firstBallista', { type: 'first_upgrade', key: 'ballista' });
    return true;
  }

  private upgrade(p: M.PieceSave, branch: 0 | 1 | 2): void {
    if (p.l >= M.MAX_LEVEL) return;
    const needBranch = M.branchAt(p.l);
    if (needBranch && !branch) return;
    const cost = M.levelCost(p.k, p.l);
    if (!this.ctx.spend(cost)) return;
    p.l++;
    p.inv += cost;
    this.run.stats.upgrades++;
    if (needBranch) {
      if (p.l === M.BRANCH_LEVEL2) p.b2 = branch;
      else p.b = branch;
      this.run.stats.branches++;
      this.ctx.say('firstBranch', { type: 'first_upgrade', key: 'branch' });
    }
    this.layoutChanged();
    this.sparkle(p.x + 0.5, p.y + 0.5);
    this.ctx.haptic(10);
  }

  /** Swap a chosen branch for the other one (50% of that level's price; 01 §6A). Free for an old
   * save's L10 piece that never had an L10 branch to choose. */
  private swap(p: M.PieceSave, which: 1 | 2, to?: 1 | 2): void {
    const cur = which === 1 ? p.b : (p.b2 ?? 0);
    const next: 1 | 2 = to ?? (cur === 1 ? 2 : 1);
    if (cur === next) return;
    const free = which === 2 && !cur;
    const cost = free ? 0 : M.swapCost(p.k, which);
    if (cost > 0 && !this.ctx.spend(cost)) return;
    if (which === 1) p.b = next;
    else p.b2 = next;
    p.inv += cost;
    this.layoutChanged();
    this.sparkle(p.x + 0.5, p.y + 0.5);
    this.ctx.haptic(10);
  }

  private sell(p: M.PieceSave): void {
    const placed = this.placedAt.get(p.id);
    const undo = placed !== undefined && this.time - placed < M.UNDO_S;
    const refund = undo ? p.inv : p.inv * M.SELL_REFUND;
    this.run.bank += refund;
    this.run.pieces = this.run.pieces.filter((q) => q !== p);
    this.placedAt.delete(p.id);
    this.settleUntil.delete(p.id);
    this.layoutChanged();
    this.puff(p.x + 0.5, p.y + 0.5, 0x8a7a9a, 8);
    if (refund > 0) this.floatAt(p.x + 0.5, p.y, `+${fm(refund)}`, C.goldText);
    this.select(null);
  }

  private moveTo(p: M.PieceSave, x: number, y: number): boolean {
    if (p.x === x && p.y === y) return false;
    if (!this.validTile(p.k, x, y)) return false;
    this.puff(p.x + 0.5, p.y + 0.5, 0x8a7a9a, 5);
    p.x = x;
    p.y = y;
    this.settleUntil.set(p.id, this.time + M.SETTLE_S);
    this.run.stats.moved++;
    this.layoutChanged();
    this.puff(x + 0.5, y + 0.5, 0xd8d0b0, 5);
    this.ctx.haptic(8);
    return true;
  }

  private buyChest(spot: number): void {
    if (this.run.bait.includes(spot) || !this.grid.spots.includes(spot)) return;
    if (this.sim.runes.some((r) => idx(r.x, r.y) === spot)) {
      this.ctx.game.toast('A RUNE SITS THERE. SELL IT FIRST.');
      return;
    }
    const x = spot % COLS;
    const y = Math.floor(spot / COLS);
    const cost = M.chestCost(this.run);
    if (!this.ctx.spend(cost)) {
      this.floatAt(x + 0.5, y, `NEED ${fm(cost)}`, '#e05050');
      return;
    }
    this.run.bait.push(spot);
    this.layoutChanged();
    this.sparkle(x + 0.5, y + 0.5);
    this.ctx.haptic(12);
    if (this.run.bait.length === 1) this.ctx.say('chestPlaced', { type: 'first_upgrade', key: 'chest' });
  }

  private sellChest(spot: number): void {
    if (!this.run.bait.includes(spot)) return;
    const refund = M.chestRefund(this.run);
    this.run.bait = this.run.bait.filter((b) => b !== spot);
    this.run.bank += refund;
    this.layoutChanged();
    this.floatAt((spot % COLS) + 0.5, Math.floor(spot / COLS), `+${fm(refund)}`, C.goldText);
    this.select(null);
  }

  private dugList(): import('./map').DugTile[] {
    const f = this.run.floor;
    return (this.per.dug[f] ??= []);
  }

  /** Dig (01 §6D): rock -> wall / chamber; rock or wall -> corridor next to a walkable tile. */
  private dig(k: 'w' | 'c' | 'p', x: number, y: number): boolean {
    if (!this.canDigAt(k, x, y)) return false;
    const list = this.dugList();
    const cost = M.digCost(list.length);
    if (!this.ctx.spend(cost)) {
      this.floatAt(x + 0.5, y + 0.2, `NEED ${fm(cost)}`, '#e05050');
      return false;
    }
    const i = idx(x, y);
    const old = list.findIndex((d) => d.i === i);
    if (old >= 0) list.splice(old, 1);
    list.push({ i, k });
    this.run.stats.dug++;
    this.regrid();
    this.puff(x + 0.5, y + 0.5, 0x8a7a5a, 10);
    this.shakeT = 0.12;
    this.ctx.haptic(12);
    this.ctx.saveSoon();
    if (k === 'p' && this.grid.spots.includes(i)) this.floatAt(x + 0.5, y, 'CHEST SPOT!', C.goldText);
    return true;
  }

  /** Fill a dug tile back in (free, no refund): gentle undo for a bad carve. */
  private fill(i: number): void {
    const list = this.dugList();
    const k = list.findIndex((d) => d.i === i);
    if (k < 0) return;
    const x = i % COLS;
    const y = Math.floor(i / COLS);
    if (M.pieceAt(this.run, x, y)) {
      this.ctx.game.toast('SELL THE PIECE ON IT FIRST.');
      return;
    }
    if (this.run.bait.includes(i)) this.sellChest(i);
    list.splice(k, 1);
    this.regrid();
    this.puff(x + 0.5, y + 0.5, 0x3a2f48, 8);
    this.select(null);
    this.ctx.saveSoon();
  }

  /** Travel to floor f (each floor keeps its own layout; 01 §6D). */
  private travel(f: number): void {
    if (f === this.run.floor || f >= (this.per.floors ?? 1)) return;
    M.switchFloor(this.run, f);
    this.grid = M.gridOf(this.run, this.per);
    this.sim = new Sim({
      pieces: this.run.pieces,
      bait: this.run.bait,
      ws: this.run.ws,
      lure: this.run.lure,
      party: this.run.party,
      grid: this.grid,
      seed: (Date.now() & 0x7fffffff) ^ 0x2545f491,
      live: true,
      ...dungeonImports(this.ctx.save.imports),
    });
    this.sim.stealFn = (h) => this.steal(h);
    for (const c of this.coins) this.collect(c, false);
    this.placedAt.clear();
    this.settleUntil.clear();
    this.select(null);
    this.touch();
    this.drawBackground();
    this.placeBoardArt();
    this.syncPieces();
    this.updateBlueprint();
    this.showBanner(FLOORS[f].name.toUpperCase());
    if (f > 0) this.ctx.say(`floor${f}`, { type: 'tier_reached', key: `floor${f}` });
    this.ctx.saveSoon();
  }

  private rebuildAll(): void {
    let built = 0;
    for (let guard = 0; guard < 80; guard++) {
      const i = M.rebuildable(this.run, this.per).find((j) => this.run.bank >= M.placeCost(this.run, this.per.ghosts[j].k));
      if (i === undefined) break;
      const p = M.rebuildGhost(this.run, this.per, i);
      if (!p) break;
      this.placedAt.set(p.id, this.time);
      built++;
    }
    if (built) {
      this.layoutChanged();
      this.ctx.game.toast(`REBUILT ${built} FROM BLUEPRINTS.`);
    }
    this.select(null);
  }

  // ---------- Lure ----------

  private lureStep(d: number): void {
    const r = this.run;
    if (d < 0) {
      if (r.lure > 0) this.setLure(r.lure - 1);
      return;
    }
    if (r.lure < r.lureMax) {
      this.setLure(r.lure + 1);
      return;
    }
    if (r.lureMax >= M.MAX_LURE) return;
    const cost = M.lureCost(r.lureMax + 1);
    if (!this.ctx.spend(cost)) {
      this.ctx.game.toast(`LURE ${r.lureMax + 1} COSTS ${fm(cost)} PLUNDER. STRONGER HEROES, RICHER BOUNTIES.`);
      return;
    }
    r.lureMax++;
    r.lure = r.lureMax;
    this.onLureBought();
  }

  private setLure(T: number): void {
    this.run.lure = Math.max(0, Math.min(T, this.run.lureMax));
    this.touch();
    this.sim.setLure(this.run.lure);
  }

  private onLureBought(): void {
    const r = this.run;
    this.sim.setLure(r.lure);
    this.touch();
    this.ctx.haptic(15);
    const T = r.lureMax;
    const newMax = T > this.per.bestLure;
    if (newMax) this.per.bestLure = T;
    const hero = M.NEW_HERO_AT[T];
    if (hero) {
      // New hero type (tier_reached), with its micro-lesson.
      this.ctx.say(`hero.${hero}`, { type: 'tier_reached', key: `hero.${hero}` });
      this.ctx.lesson(`${hero}s`);
    } else if (T === 1) this.ctx.lesson('lure');
    else if (newMax && T % 5 === 0) this.ctx.say('dialRaised', { type: 'dial_raised', key: `lure${T}`, vars: { n: T } });
    this.ctx.saveSoon();
  }

  // ---------- active verbs ----------

  private ringGong(): void {
    if (!this.sim.gong()) {
      this.ctx.game.toast(`THE GONG NEEDS ${M.GONG_GAP}S BETWEEN PARTIES, AND A CLEAR DOOR.`);
      return;
    }
    const s = this.run.stats;
    s.gongs++;
    s.bestGong = Math.max(s.bestGong, this.sim.gongStack);
    this.shakeT = 0.25;
    this.ctx.haptic(20);
    const [ex, ey] = this.grid.entry;
    this.floatAt(ex + 0.5, ey + 1, `GONG! +${Math.round(this.sim.gongStack * M.GONG_STEP * 100)}%`, C.goldText);
    if (s.gongs === 1) this.ctx.say('gongTip', { type: 'first_upgrade', key: 'gong' });
    if (this.sim.gongStack >= M.GONG_MAX) this.ctx.say('perfect', { type: 'first_upgrade', key: 'perfect' });
  }

  private armGlare(): void {
    if (this.glareCd > 0) return;
    this.glareArmed = !this.glareArmed;
    this.trapArmed = false;
    this.disarmBuild();
  }

  private armTrap(): void {
    if (this.sim.trapCharges <= 0) {
      this.ctx.game.toast('ONE TRAPDOOR PER PARTY. IT RESETS WHEN THE NEXT PARTY ARRIVES.');
      return;
    }
    this.trapArmed = !this.trapArmed;
    this.glareArmed = false;
    this.disarmBuild();
  }

  private disarmBuild(): void {
    this.armed = null;
    this.moving = false;
    this.sel = null;
    this.refreshTray();
    this.overlayDirty = true;
  }

  /** Glare snapping (01 §5.3): sack carriers, then Cleric > Wizard > Champion > nearest. */
  private snap(px: number, py: number, radius: number): SimHero | null {
    let best: SimHero | null = null;
    let bestScore = Infinity;
    for (const h of this.sim.heroes) {
      if (h.dead || h.gone) continue;
      const hx = this.bx + h.x * TILE;
      const hy = this.by + h.y * TILE - 3;
      const d = Math.hypot(hx - px, hy - py);
      if (d > radius) continue;
      const pri = h.sack > 0 ? 4000 : h.type === 'cleric' ? 3000 : h.type === 'wizard' ? 2000 : h.type === 'champ' ? 1000 : 0;
      const score = d - pri;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  private fireGlare(h: SimHero): void {
    if (h.dead || h.gone || this.glareCd > 0) return;
    const dmg = M.glareDamage(this.run.ws, this.sim.lure);
    this.sim.smite(h, dmg);
    this.glareCd = M.glareCooldown(this.run.ws);
    this.glareArmed = false;
    this.run.stats.glares++;
    if (h.dead) this.run.stats.glareKills++;
    this.addTracer({ kind: 'glare', x1: this.bx + BOARD_W / 2, y1: this.by - 2, x2: this.bx + h.x * TILE, y2: this.by + h.y * TILE - 3, life: 0.3, max: 0.3, miss: false });
    this.floatAt(h.x, h.y - 0.9, `-${fm(dmg)}`, '#ff7090');
    this.ctx.haptic(15);
  }

  private steal(h: SimHero): number {
    const want = M.stealBase(h.type, h.bounty);
    const amount = Math.max(0, Math.min(want, 0.02 * this.run.bank));
    this.run.bank -= amount;
    return amount;
  }

  // ---------- selection & tray ----------

  private slotKind(i: number): Armed {
    return (M.TABS[this.tab]?.kinds[i] as Armed) ?? null;
  }

  private setTab(i: number): void {
    if (i === this.tab) return;
    this.tab = i;
    if (this.armed && !M.TABS[i].kinds.includes(this.armed as M.PieceKind)) this.armed = null;
    this.btnCache.clear();
    this.overlayDirty = true;
  }

  private tapSlot(i: number): void {
    const wasDrag = this.trayDrag?.active;
    this.trayDrag = null;
    if (wasDrag) return;
    if (this.justDropped >= 0 && this.time - this.justDropped < 0.15) return;
    const k = this.slotKind(i);
    if (k) this.arm(k);
  }

  private arm(k: Armed): void {
    this.trapArmed = false;
    this.glareArmed = false;
    this.moving = false;
    this.sel = null;
    this.armed = this.armed === k ? null : k;
    this.refreshTray();
    this.overlayDirty = true;
  }

  private select(s: Sel): void {
    this.sel = s;
    this.moving = false;
    this.armed = null;
    this.refreshTray();
    this.overlayDirty = true;
  }

  private refreshTray(): void {
    const showPanel = this.sel !== null;
    this.slotBox.visible = !showPanel;
    this.panel.visible = showPanel;
    this.btnCache.clear();
  }

  private selectedPiece(): M.PieceSave | undefined {
    const s = this.sel;
    return s?.t === 'piece' ? this.run.pieces.find((p) => p.id === s.id) : undefined;
  }

  private panelAction(a: 'up' | 'a' | 'b' | 'move' | 'sell'): void {
    const s = this.sel;
    if (!s) return;
    if (s.t === 'piece') {
      const p = this.selectedPiece();
      if (!p) return this.select(null);
      if (a === 'up') this.upgrade(p, 0);
      else if (a === 'a' || a === 'b') {
        const pick: 1 | 2 = a === 'a' ? 1 : 2;
        if (M.branchAt(p.l)) this.upgrade(p, pick);
        else if (p.l >= M.MAX_LEVEL && !p.b2) this.swap(p, 2, pick);
        else if (p.l >= M.MAX_LEVEL) this.swap(p, a === 'a' ? 1 : 2);
        else if (a === 'b' && p.l >= M.BRANCH_LEVEL) this.swap(p, 1);
      } else if (a === 'move') {
        this.moving = !this.moving;
        this.overlayDirty = true;
      } else if (a === 'sell') this.sell(p);
    } else if (s.t === 'chest') {
      if (a === 'up') this.buyChest(s.spot);
      else if (a === 'sell') this.sellChest(s.spot);
    } else if (s.t === 'ghost') {
      if (a === 'up') {
        const p = M.rebuildGhost(this.run, this.per, s.i);
        if (p) {
          this.placedAt.set(p.id, this.time);
          this.layoutChanged();
          this.select(null);
        } else this.ctx.game.toast('NOT ENOUGH PLUNDER (OR NO RUNE SLOT).');
      } else if (a === 'sell') this.rebuildAll();
    } else if (s.t === 'dug') {
      if (a === 'sell') this.fill(s.i);
    }
  }

  private setBtn(b: Button, label: string, sub: string | undefined, enabled: boolean, color?: [number, number]): void {
    b.visible = true;
    const key = `${label}|${sub ?? ''}|${enabled}|${color?.[0] ?? ''}`;
    if (this.btnCache.get(b) === key) return;
    this.btnCache.set(b, key);
    if (color) b.setColor(color[0], color[1]);
    b.setLabel(label, sub).setEnabled(enabled);
  }

  private openShop(): void {
    this.disarmBuild();
    this.ctx.openUpgrades(this.groups);
  }

  // ---------- input ----------

  private localXY(gx: number, gy: number): { x: number; y: number; tx: number; ty: number } {
    const p = this.root.toLocal({ x: gx, y: gy });
    return { x: p.x, y: p.y, tx: Math.floor((p.x - this.bx) / TILE), ty: Math.floor((p.y - this.by) / TILE) };
  }

  private local(e: FederatedPointerEvent): { x: number; y: number; tx: number; ty: number } {
    return this.localXY(e.global.x, e.global.y);
  }

  private inBoard(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;
  }

  private onDown(e: FederatedPointerEvent): void {
    this.trayDrag = null;
    if (this.ritual) return;
    const { x, y, tx, ty } = this.local(e);
    const inB = this.inBoard(tx, ty);

    // 1. Coins (a greedy grab beats everything; they sit on top).
    const coin = this.coins.find((c) => c.fly <= 0 && Math.abs(c.x - x) <= 7 && Math.abs(c.y - y) <= 7);
    if (coin) {
      this.collect(coin, true);
      return;
    }
    if (!inB) return;

    // 2. Moving a piece (MOVE button).
    const sp = this.selectedPiece();
    if (this.moving && sp) {
      if (!this.moveTo(sp, tx, ty)) this.ctx.game.toast('MOVE: TAP A GLOWING TILE.');
      this.moving = false;
      this.overlayDirty = true;
      return;
    }

    // 3. Trapdoor.
    if (this.trapArmed) {
      const k = tileKind(this.grid, tx, ty);
      if (isWalkable(this.grid, tx, ty) && k !== 'entry' && k !== 'hoard') {
        if (this.sim.openTrap(tx, ty)) this.ctx.haptic(12);
      }
      this.trapArmed = false;
      return;
    }

    // 4. Building and digging.
    if (this.armed) {
      const a = this.armed;
      const dk = digKind(a);
      if (a === 'chest') {
        const spot = idx(tx, ty);
        if (this.grid.spots.includes(spot) && !this.run.bait.includes(spot)) {
          this.buyChest(spot);
          if (this.run.bank < M.chestCost(this.run) || this.run.bait.length >= this.grid.spots.length) this.armed = null;
          this.overlayDirty = true;
          return;
        }
      } else if (dk) {
        if (this.canDigAt(dk, tx, ty)) {
          if (this.dig(dk, tx, ty) && this.run.bank < M.digCost(this.dugList().length)) this.armed = null;
          this.overlayDirty = true;
          return;
        }
      } else if (isPiece(a) && this.validTile(a, tx, ty)) {
        if (this.place(a, tx, ty) && this.run.bank < M.placeCost(this.run, a)) {
          this.armed = null;
          this.overlayDirty = true;
        }
        return;
      }
      // Tapped elsewhere: fall through to selection with the build cancelled.
      this.armed = null;
      this.overlayDirty = true;
    }

    // 5. Glare: ready, and a visitor near the touch.
    if (this.glareCd <= 0) {
      const h = this.snap(x, y, this.glareArmed ? 28 : M.GLARE_SNAP);
      if (h) {
        this.aim = { h };
        return;
      }
    }
    this.glareArmed = false;

    // 6. A piece: tap selects (on release), hold drags (01 §11).
    const p = M.pieceAt(this.run, tx, ty);
    if (p) {
      this.press = { id: p.id, x, y, t: this.time };
      return;
    }
    this.tapSelect(tx, ty);
  }

  /** Selection of a chest spot, a ghost or a dug tile (pieces select on release). */
  private tapSelect(tx: number, ty: number): void {
    const i = idx(tx, ty);
    if (this.grid.spots.includes(i)) {
      const cur = this.sel;
      this.select(cur?.t === 'chest' && cur.spot === i ? null : { t: 'chest', spot: i });
      return;
    }
    const gi = this.ghostAt(tx, ty);
    if (gi >= 0) {
      this.select({ t: 'ghost', i: gi });
      return;
    }
    if (this.grid.dug[i]) {
      this.select({ t: 'dug', i });
      return;
    }
    this.select(null);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (this.aim) {
      const { x, y } = this.local(e);
      const h = this.snap(x, y, 20);
      if (h) this.aim.h = h;
      return;
    }
    const { x, y, tx, ty } = this.local(e);
    if (this.press && this.dragPiece === null) {
      const far = Math.hypot(x - this.press.x, y - this.press.y) > DRAG_PX;
      if (far && this.time - this.press.t < M.HOLD_MS / 1000) this.press = null; // a swipe, not a hold
      else if (far || this.time - this.press.t >= M.HOLD_MS / 1000) this.startPieceDrag();
    }
    const td = this.trayDrag;
    if (td && !td.active && (Math.hypot(x - td.x, y - td.y) > DRAG_PX || this.inBoard(tx, ty))) {
      td.active = true;
      this.armed = td.kind;
      this.sel = null;
      this.moving = false;
      this.refreshTray();
      this.overlayDirty = true;
    }
    if (this.dragPiece !== null || td?.active) {
      const h: [number, number] | null = this.inBoard(tx, ty) ? [tx, ty] : null;
      if (h?.[0] !== this.hover?.[0] || h?.[1] !== this.hover?.[1]) this.hover = h;
    }
  }

  private startPieceDrag(): void {
    if (!this.press) return;
    const p = this.run.pieces.find((q) => q.id === this.press!.id);
    this.press = null;
    if (!p) return;
    this.dragPiece = p.id;
    this.hover = [p.x, p.y];
    this.sel = { t: 'piece', id: p.id };
    this.moving = true;
    this.armed = null;
    this.refreshTray();
    this.overlayDirty = true;
    this.ctx.haptic(10);
  }

  private onUp(e: FederatedPointerEvent): void {
    if (this.trayDrag) {
      this.trayUp(e);
      return;
    }
    const a = this.aim;
    this.aim = null;
    if (a?.h) {
      this.fireGlare(a.h);
      return;
    }
    if (this.dragPiece !== null) {
      this.dropPiece(e);
      return;
    }
    const pr = this.press;
    this.press = null;
    if (pr) {
      const cur = this.sel;
      this.select(cur?.t === 'piece' && cur.id === pr.id ? null : { t: 'piece', id: pr.id });
    }
  }

  private onUpOutside(e: FederatedPointerEvent): void {
    this.aim = null;
    this.press = null;
    if (this.dragPiece !== null) this.dropPiece(e);
  }

  private dropPiece(e: FederatedPointerEvent): void {
    const id = this.dragPiece;
    this.dragPiece = null;
    this.hover = null;
    this.moving = false;
    this.overlayDirty = true;
    const p = this.run.pieces.find((q) => q.id === id);
    if (!p) return;
    const { tx, ty } = this.local(e);
    if (this.inBoard(tx, ty) && !(tx === p.x && ty === p.y)) {
      if (!this.moveTo(p, tx, ty)) this.ctx.game.toast('MOVE: DROP IT ON A GLOWING TILE.');
    }
    this.sel = { t: 'piece', id: p.id };
    this.refreshTray();
  }

  /** A press on a tray slot: a drag from it builds where it lands (01 §11). */
  private trayDown(i: number, e: FederatedPointerEvent): void {
    const k = this.slotKind(i);
    if (!k) return;
    const { x, y } = this.local(e);
    this.trayDrag = { kind: k, x, y, active: false };
  }

  private trayUp(e: FederatedPointerEvent): void {
    const td = this.trayDrag;
    this.trayDrag = null;
    this.hover = null;
    if (!td?.active) return;
    this.justDropped = this.time;
    const { tx, ty } = this.local(e);
    const k = td.kind;
    let ok = false;
    if (this.inBoard(tx, ty)) {
      const dk = digKind(k);
      if (k === 'chest') {
        const spot = idx(tx, ty);
        if (this.grid.spots.includes(spot) && !this.run.bait.includes(spot)) {
          this.buyChest(spot);
          ok = true;
        }
      } else if (dk) ok = this.dig(dk, tx, ty);
      else if (isPiece(k)) ok = this.place(k, tx, ty);
    }
    this.armed = null;
    this.overlayDirty = true;
    if (!ok && this.inBoard(tx, ty)) this.ctx.game.toast('DROP IT ON A GLOWING TILE.');
  }

  // ---------- coins and juice ----------

  private collect(c: Coin, grab: boolean): void {
    if (c.fly > 0) return;
    const amount = c.amount * (grab ? 1 + M.GRAB_BONUS : 1);
    this.ctx.earn(amount);
    if (grab) {
      this.run.stats.grabs++;
      this.ctx.float(`+${fm(amount)}`, c.x, c.y - 8, C.goldText);
      this.ctx.haptic(6);
    }
    const L = this.ctx.layout;
    c.fly = 0.35;
    c.fx = L.safe.l + 26;
    c.fy = L.safe.t + 6;
  }

  private spawnCoin(x: number, y: number, amount: number): void {
    if (this.coins.length >= MAX_COINS) {
      this.ctx.earn(amount);
      return;
    }
    const g = this.coinPool.pop() ?? new Graphics(coinArt());
    g.visible = true;
    this.coinLayer.addChild(g);
    this.coins.push({ g, x, y: y - 4, vy: -30, ground: y, t: 0, amount, fly: 0, fx: 0, fy: 0 });
  }

  private puff(tx: number, ty: number, color: number, n: number): void {
    for (let i = 0; i < n && this.parts.length < MAX_PARTS; i++) {
      const a = rand() * Math.PI * 2;
      const s = 10 + rand() * 25;
      this.parts.push({ x: this.bx + tx * TILE, y: this.by + ty * TILE, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: 0.35 + rand() * 0.3, color, size: rand() < 0.3 ? 2 : 1 });
    }
  }

  private sparkle(tx: number, ty: number): void {
    for (let i = 0; i < 10 && this.parts.length < MAX_PARTS; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.parts.push({ x: this.bx + tx * TILE, y: this.by + ty * TILE, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.4, color: i % 2 ? GOLD : 0xfff0a0, size: 1 });
    }
  }

  private addTracer(t: Tracer): void {
    if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
    this.tracers.push(t);
  }

  private floatAt(tx: number, ty: number, text: string, color: string): void {
    this.ctx.float(text, this.bx + tx * TILE, this.by + ty * TILE, color);
  }

  // ---------- sim events ----------

  private handleEvents(): void {
    const ev = this.sim.events;
    for (const e of ev) this.onEvent(e);
    ev.length = 0;
  }

  private onEvent(e: SimEvent): void {
    const s = this.run.stats;
    switch (e.t) {
      case 'shot': {
        const T = TILE;
        if (e.kind === 'clerk') this.clerk.context = clerkArt(1);
        this.addTracer({ kind: e.kind, x1: this.bx + e.x1 * T, y1: this.by + e.y1 * T - 3, x2: this.bx + e.x2 * T, y2: this.by + e.y2 * T - 3, life: e.kind === 'ballista' ? 0.22 : 0.15, max: e.kind === 'ballista' ? 0.22 : 0.15, miss: e.miss });
        break;
      }
      case 'kill': {
        s.kills++;
        this.puff(e.x, e.y - 0.2, e.hero === 'champ' ? GOLD : 0xc8c0d0, e.hero === 'champ' ? 16 : 7);
        if (e.amount > 0) {
          this.spawnCoin(this.bx + e.x * TILE, this.by + e.y * TILE, e.amount);
          this.floatAt(e.x, e.y - 1, `+${fm(e.amount)}`, C.goldText);
        }
        if (e.greed) {
          s.greedKills++;
          this.sparkle(e.x, e.y - 0.3);
        }
        // D-dungeon-01: the recovery bonus is a share of the bounty (the kill paid the rest).
        const bonus = e.recover > 0 ? this.ctx.earn(e.recover) : 0;
        if (e.sack > 0) {
          this.run.bank += e.sack;
          s.recovered++;
          this.floatAt(e.x, e.y - 1.6, `SACK +${fm(e.sack + bonus)}`, '#fff0a0');
          this.sparkle(e.x, e.y);
          this.ctx.haptic(25);
          this.ctx.say('recovered', { type: 'hazard_first', key: 'recovered' });
        }
        if (e.hero === 'champ') this.onChampSlain();
        break;
      }
      case 'leak':
        s.thieves++;
        this.floatAt(e.x, e.y - 1, e.sack > 0 ? `-${fm(e.sack)}` : 'GRAB!', '#e05050');
        this.ctx.haptic(30);
        this.ctx.say('thief', { type: 'hazard_first', key: 'thief' });
        break;
      case 'escape':
        s.escaped++;
        this.floatAt(this.grid.entry[0] + 0.5, this.grid.entry[1] + 0.6, e.sack > 0 ? 'ESCAPED!' : 'FLED', '#e05050');
        break;
      case 'rune':
        if (e.kind === 'spikes') this.puff(e.x + 0.5, e.y + 0.5, 0xe0e0f0, 3);
        else if (e.kind === 'confusion') {
          this.puff(e.x + 0.5, e.y + 0.5, 0xd060e0, 5);
          this.floatAt(e.x + 0.5, e.y - 0.2, '?', '#e080ff');
        } else this.puff(e.x + 0.5, e.y + 0.7, 0x6ac04a, 3);
        break;
      case 'trapped':
        s.traps++;
        s.captured++;
        this.floatAt(e.x, e.y - 1, 'AAAA!', C.ink);
        this.puff(e.x, e.y, 0x3a2a1a, 6);
        this.ctx.haptic(15);
        break;
      case 'sunk':
        s.captured++;
        this.floatAt(e.x, e.y - 1, 'GLORP', '#8ad06a');
        break;
      case 'dispel':
        s.dispels++;
        this.addTracer({ kind: 'dispel', x1: this.bx + e.x * TILE, y1: this.by + e.y * TILE - 6, x2: this.tx(e.rx) + 8, y2: this.ty(e.ry) + 8, life: 0.4, max: 0.4, miss: false });
        this.floatAt(e.rx + 0.5, e.ry, 'DISPEL', '#b080ff');
        this.ctx.say('dispel', { type: 'hazard_first', key: 'dispel' });
        break;
      case 'party':
        if (e.champ) {
          this.champName = CHAMP_NAMES[Math.floor(rand() * CHAMP_NAMES.length)];
          this.showBanner(this.champName);
          this.ctx.haptic(30);
          this.ctx.say('champion', { type: 'hazard_first', key: 'champion' });
        }
        if (this.sim.lure >= 1) live.lureParty = true;
        this.run.party = this.sim.partyN;
        break;
      case 'partyDone':
        this.checkStruggle();
        break;
      case 'minionDown':
        this.puff(e.x, e.y, e.split ? 0x5ad06a : 0xe8e0c8, e.split ? 9 : 6);
        break;
      case 'loot':
        s.detours++;
        break;
    }
  }

  private onChampSlain(): void {
    const r = this.run;
    r.stats.champs++;
    this.shakeT = 0.35;
    this.ctx.haptic(40);
    this.showBanner('CHAMPION SLAIN!');
    const leak = this.sim.leakFrac();
    if (leak < 0.2 && this.sim.lure >= M.CHAMP_LURE) {
      M.recordChamp(r, this.sim.lure);
      this.ctx.raiseSkill(M.heldLure(r));
    }
    this.ctx.say('champSlain', { type: 'tier_reached', key: 'champSlain' });
    this.ctx.saveSoon();
  }

  /** Struggle (01 §4): leaks > 30% over 20 parties -> "Lower Lure?" with a one-tap offer. */
  private checkStruggle(): void {
    if (this.sim.history.length < 20 || this.run.lure === 0) return;
    const leak = this.sim.leakFrac();
    if (leak <= 0.3) return;
    this.ctx.say('struggle', {
      type: 'struggle',
      vars: { n: Math.round(leak * 100) },
      offer: () => {
        if (this.run.lure > 0) {
          this.setLure(this.run.lure - 1);
          this.sim.history.length = 0;
          this.ctx.game.toast(`LURE ${this.run.lure}. BOUGHT TIERS STAY BOUGHT.`);
        }
      },
    });
  }

  private showBanner(text: string): void {
    this.banner.set(text);
    const w = this.banner.width + 8;
    const x = this.bx + Math.floor((BOARD_W - w) / 2);
    const y = this.by + 22;
    this.bannerG.clear().rect(x, y, w, 12).fill(OUTLINE).rect(x + 1, y + 1, w - 2, 10).fill(0x5a1a2a).rect(x + 1, y + 1, w - 2, 1).fill(GOLD);
    this.banner.position.set(x + 4, y + 3);
    this.banner.visible = true;
    this.bannerG.visible = true;
    this.bannerT = 2.5;
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.time += dt;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 6) {
      this.sim.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= 6) this.acc = 0;
    this.handleEvents();
    if (this.revDirty >= 0 && this.time - this.revDirty > 1.5) {
      this.revDirty = -1;
      this.run.rev++;
    }
    if (this.press && this.dragPiece === null && this.time - this.press.t >= M.HOLD_MS / 1000) this.startPieceDrag();
    if (this.glareCd > 0) this.glareCd = Math.max(0, this.glareCd - dt);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.root.position.set(this.shakeT > 0 ? Math.round((rand() - 0.5) * 4) : 0, this.shakeT > 0 ? Math.round((rand() - 0.5) * 4) : 0);
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.banner.visible = false;
        this.bannerG.visible = false;
      }
    }
    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 0.5;
      this.slowChecks();
    }
    const a = Math.min(1, this.acc / STEP);
    this.renderHeroes(a);
    this.renderMinions();
    this.renderPieces();
    this.renderCoins(dt);
    this.renderFx(dt);
    this.renderDrag();
    if (this.overlayDirty) this.drawOverlay();
    this.overlayG.alpha = 0.65 + 0.35 * Math.sin(this.time * 6);
    this.updateUi();
    this.updateLive();
  }

  private updateLive(): void {
    const on = live.on;
    for (const k of PREVIEW_ORDER) on[k] = false;
    for (const h of this.sim.heroes) if (!h.dead && !h.gone) on[h.type] = true;
    live.heroes = this.sim.heroes.length;
    live.gongReady = this.sim.gongReady;
    live.trapReady = this.sim.trapCharges > 0;
    live.glareReady = this.glareCd <= 0;
    live.coins = this.coins.length;
  }

  private renderHeroes(a: number): void {
    const hs = this.sim.heroes;
    while (this.heroViews.length < hs.length) {
      const g = new Graphics();
      const sack = new Graphics(sackArt());
      const hpBg = new Sprite(Texture.WHITE);
      const hp = new Sprite(Texture.WHITE);
      hpBg.tint = OUTLINE;
      hp.tint = 0x8fd14f;
      hpBg.height = 2;
      hp.height = 1;
      this.heroLayer.addChild(g, sack, hpBg, hp);
      this.heroViews.push({ g, sack, hpBg, hp });
    }
    const frameT = Math.floor(this.time * 8);
    for (let i = 0; i < this.heroViews.length; i++) {
      const v = this.heroViews[i];
      const h = hs[i];
      if (!h || h.dead || h.gone) {
        v.g.visible = v.sack.visible = v.hpBg.visible = v.hp.visible = false;
        continue;
      }
      const jx = ((h.id * 7) % 5) - 2;
      const jy = ((h.id * 3) % 3) - 1;
      const x = Math.round(this.bx + (h.px + (h.x - h.px) * a) * TILE + jx);
      const y = Math.round(this.by + (h.py + (h.y - h.py) * a) * TILE + 4 + jy);
      v.g.visible = true;
      v.g.position.set(x, y);
      const dx = h.x - h.px;
      if (Math.abs(dx) > 1e-4) v.g.scale.x = dx > 0 ? 1 : -1;
      const moving = !h.blocked && h.stunT <= 0;
      v.g.context = heroArt(h.type, moving ? (frameT + h.id) % 2 : 0, h.flash > 0);
      v.g.alpha = h.slowT > 0 || h.gloomF > 0 ? 0.85 : 1;
      const top = h.type === 'champ' ? 13 : h.type === 'knight' || h.type === 'wizard' ? 10 : 9;
      v.sack.visible = h.sack > 0;
      if (h.sack > 0) v.sack.position.set(x, y - top - 4);
      const showHp = h.hp < h.maxHp;
      v.hpBg.visible = v.hp.visible = showHp;
      if (showHp) {
        const w = h.type === 'champ' ? 12 : 8;
        v.hpBg.position.set(x - w / 2 - 1, y - top - 2);
        v.hpBg.width = w + 2;
        v.hp.position.set(x - w / 2, y - top - 2);
        v.hp.width = Math.max(1, Math.round((w * h.hp) / h.maxHp));
        v.hp.tint = h.type === 'champ' ? 0xe05050 : 0x8fd14f;
      }
    }
  }

  private renderMinions(): void {
    const ms = this.sim.minions;
    while (this.minionViews.length < ms.length) {
      const g = new Graphics();
      this.minionLayer.addChild(g);
      this.minionViews.push(g);
    }
    for (let i = 0; i < this.minionViews.length; i++) {
      const g = this.minionViews[i];
      const m = ms[i];
      if (!m || !m.alive) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const off = m.kind === 'ogre' || (m.kind === 'slime' && !m.split) ? [0, 0] : m.kind === 'slime' ? ([[-4, -2], [4, 2], [0, -5]][m.n - 1] ?? [0, 0]) : ([[-4, -3], [4, 3], [0, -5], [-1, 4]][m.n] ?? [0, 0]);
      g.position.set(Math.round(this.bx + m.px * TILE + off[0]), Math.round(this.by + m.py * TILE + 5 + off[1]));
      const p = this.run.pieces.find((q) => q.id === m.id);
      const swing = m.blocked.length > 0 && Math.floor(this.time * 4) % 2 === 0 ? 1 : 0;
      g.context = minionArt(m.kind, swing, p ? this.tierOf(p.l) : 0, m.split);
      g.alpha = m.hp < m.maxHp * 0.35 ? 0.7 : 1;
    }
  }

  private renderPieces(): void {
    const fr = Math.floor(this.time * 6) % 2;
    for (const tw of this.sim.towers) {
      if (tw.kind === 'clerk') continue;
      const v = this.pieceViews.get(tw.id);
      if (!v) continue;
      const settling = tw.settle > 0;
      v.g.alpha = settling ? (Math.floor(this.time * 6) % 2 ? 0.4 : 0.8) : 1;
      if (tw.kind === 'brazier' || tw.kind === 'eye') {
        const p = this.run.pieces.find((q) => q.id === tw.id);
        if (p) v.g.context = pieceArt(tw.kind, this.tierOf(p.l), p.b, tw.active ? fr : 0);
        if (tw.kind === 'eye') tw.active = false;
      }
    }
    for (const r of this.sim.runes) {
      const v = this.pieceViews.get(r.id);
      if (!v) continue;
      const p = this.run.pieces.find((q) => q.id === r.id);
      if ((r.kind === 'spikes' || r.kind === 'confusion') && p) {
        const spent = r.kind === 'spikes' ? r.charges < 1 : r.coolT > 0;
        v.g.context = pieceArt(r.kind, this.tierOf(p.l), p.b, spent ? 1 : 0);
      }
      v.g.alpha = r.off > 0 ? 0.3 : r.settle > 0 ? 0.5 : r.flash > 0 ? 1 : 0.9;
    }
    for (const m of this.sim.minions) {
      if (m.split) continue;
      const v = this.pieceViews.get(m.id);
      if (v) v.g.alpha = !m.alive && m.respawnT > m.respawn - 0.1 ? 0.6 : 1;
    }
    // Chests glint every 2 s.
    const glint = this.time % 2 < 0.2;
    for (const [spot, cv] of this.chestViews) if (this.run.bait.includes(spot)) cv.context = chestArt(true, glint);
    // Ledger-Bones settles back after a throw.
    if (Math.floor(this.time * 4) % 3 === 0) this.clerk.context = clerkArt(0);
    // Hoard pile grows with the bank.
    const lvl = Math.max(0, Math.min(8, Math.floor(Math.log10(Math.max(1, this.run.bank)) * 1.5)));
    if (lvl !== this.hoardLevel) {
      this.hoardLevel = lvl;
      this.hoard.context = hoardArt(lvl);
    }
  }

  private renderCoins(dt: number): void {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      if (c.fly > 0) {
        const k = Math.min(1, dt / c.fly);
        c.x += (c.fx - c.x) * k;
        c.y += (c.fy - c.y) * k;
        c.fly -= dt;
        if (c.fly <= 0) {
          c.g.visible = false;
          this.coinLayer.removeChild(c.g);
          this.coinPool.push(c.g);
          this.coins.splice(i, 1);
          continue;
        }
      } else {
        c.vy += 120 * dt;
        c.y += c.vy * dt;
        if (c.y > c.ground) {
          c.y = c.ground;
          c.vy = -c.vy * 0.35;
        }
        if (c.t >= this.coinLife) this.collect(c, false);
      }
      c.g.position.set(Math.round(c.x), Math.round(c.y));
      c.g.alpha = c.fly <= 0 && c.t > this.coinLife - 0.4 && Math.floor(c.t * 12) % 2 ? 0.6 : 1;
    }
  }

  private renderFx(dt: number): void {
    const g = this.fxG.clear();
    // Brazier embers, Eye of Gloom haze.
    for (const tw of this.sim.towers) {
      if (tw.kind === 'eye' && tw.settle <= 0) {
        g.circle(this.bx + tw.x * TILE, this.by + tw.y * TILE, tw.range * TILE).fill({ color: 0x6a3ab0, alpha: 0.06 });
        continue;
      }
      if (tw.kind !== 'brazier' || !tw.active) continue;
      const cx = this.bx + tw.x * TILE;
      const cy = this.by + tw.y * TILE;
      const r = tw.range * TILE;
      for (let k = 0; k < 3; k++) {
        const ang = this.time * 2 + k * 2.1 + tw.id;
        g.rect(Math.round(cx + Math.cos(ang) * r * 0.7), Math.round(cy + Math.sin(ang) * r * 0.7), 1, 1).fill(k % 2 ? 0xf07a20 : 0xffd040);
      }
    }
    // Clerics' healing glow.
    for (const h of this.sim.heroes) {
      if (h.type !== 'cleric' || h.dead || h.gone) continue;
      g.circle(Math.round(this.bx + h.x * TILE), Math.round(this.by + h.y * TILE), M.CLERIC_RANGE * TILE).fill({ color: 0xfff0a0, alpha: 0.07 });
      if (Math.floor(this.time * 3 + h.id) % 3 === 0) g.rect(Math.round(this.bx + h.x * TILE) + 5, Math.round(this.by + h.y * TILE) - 12, 1, 3).rect(Math.round(this.bx + h.x * TILE) + 4, Math.round(this.by + h.y * TILE) - 11, 3, 1).fill(0x8fd14f);
    }
    // Trapdoor.
    const tr = this.sim.trap;
    if (tr) {
      const px = this.tx(tr.x);
      const py = this.ty(tr.y);
      g.rect(px + 1, py + 1, TILE - 2, TILE - 2).fill(OUTLINE);
      g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill(0x000000);
      const swing = tr.t > M.TRAP_OPEN - 0.15 ? 6 : 2;
      g.rect(px + 1, py + 1, TILE - 2, swing).fill(0x6a4a2a);
    }
    // Tracers.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      const f = 1 - t.life / t.max;
      if (t.kind === 'arrow' || t.kind === 'clerk') {
        const x = Math.round(t.x1 + (t.x2 - t.x1) * f);
        const y = Math.round(t.y1 + (t.y2 - t.y1) * f - (t.kind === 'clerk' ? Math.sin(f * Math.PI) * 6 : 0));
        g.rect(x, y, 2, t.kind === 'clerk' ? 2 : 1).fill(t.kind === 'clerk' ? 0xe8e0c8 : t.miss ? 0x8a8a9a : 0xf4e8c1);
      } else if (t.kind === 'ballista') {
        g.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: 0xe8e0c8, alpha: t.life / t.max });
      } else if (t.kind === 'dispel') {
        g.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: 0xb080ff, alpha: t.life / t.max });
        g.circle(t.x2, t.y2, 3 + f * 6).stroke({ width: 1, color: 0xb080ff, alpha: t.life / t.max });
      } else {
        const al = t.life / t.max;
        g.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 3, color: 0xc0306a, alpha: al });
        g.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: 0xffa0c0, alpha: al });
        g.circle(t.x2, t.y2, 4 + f * 8).stroke({ width: 1, color: 0xff7090, alpha: al });
      }
    }
    // Particles.
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += 60 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      g.rect(Math.round(p.x), Math.round(p.y), p.size, p.size).fill(p.color);
    }
    // Glare aim ring (press shows, release fires).
    const aim = this.aim?.h;
    if (aim && !aim.dead) {
      const x = Math.round(this.bx + aim.x * TILE);
      const y = Math.round(this.by + aim.y * TILE - 3);
      const r = 7 + Math.round(Math.sin(this.time * 12));
      g.circle(x, y, r).stroke({ width: 1, color: 0xff4070 });
      g.rect(x - r - 2, y, 3, 1).fill(0xff4070).rect(x + r, y, 3, 1).fill(0xff4070).rect(x, y - r - 2, 1, 3).fill(0xff4070).rect(x, y + r, 1, 3).fill(0xff4070);
    }
  }

  /** The piece under a drag (from the tray or a held piece), at the hovered tile. */
  private renderDrag(): void {
    const g = this.dragG.clear();
    const hv = this.hover;
    if (!hv) return;
    let k: M.PieceKind | null = null;
    let ok = false;
    if (this.dragPiece !== null) {
      const p = this.run.pieces.find((q) => q.id === this.dragPiece);
      if (!p) return;
      k = p.k;
      ok = (hv[0] === p.x && hv[1] === p.y) || this.validTile(p.k, hv[0], hv[1]);
    } else if (this.trayDrag?.active) {
      const a = this.trayDrag.kind;
      const dk = digKind(a);
      if (isPiece(a)) {
        k = a;
        ok = this.validTile(a, hv[0], hv[1]);
      } else if (dk) ok = this.canDigAt(dk, hv[0], hv[1]);
      else ok = this.grid.spots.includes(idx(hv[0], hv[1])) && !this.run.bait.includes(idx(hv[0], hv[1]));
    }
    const px = this.tx(hv[0]);
    const py = this.ty(hv[1]);
    const col = ok ? 0xfff0a0 : 0xe05050;
    g.rect(px, py, TILE, 1).rect(px, py + TILE - 1, TILE, 1).rect(px, py + 1, 1, TILE - 2).rect(px + TILE - 1, py + 1, 1, TILE - 2).fill(col);
    if (k && ok && M.PIECES[k].slot === 'wall') {
      const range = k === 'arrow' ? 3 : k === 'ballista' ? 5 : k === 'eye' ? 2 : 1.5;
      g.circle(px + 8, py + 8, range * TILE).stroke({ width: 1, color: 0xfff0a0, alpha: 0.6 });
    }
  }

  /** Placement glow, selection ring. Redrawn only when state changes. */
  private drawOverlay(): void {
    this.overlayDirty = false;
    const g = this.overlayG.clear();
    const tileGlow = (x: number, y: number, color: number) => {
      const px = this.tx(x);
      const py = this.ty(y);
      g.rect(px + 1, py + 1, TILE - 2, TILE - 2).fill({ color, alpha: 0.18 });
      g.rect(px, py, TILE, 1).rect(px, py + TILE - 1, TILE, 1).rect(px, py + 1, 1, TILE - 2).rect(px + TILE - 1, py + 1, 1, TILE - 2).fill(color);
    };
    const sp = this.selectedPiece();
    const kind: M.PieceKind | null = this.moving && sp ? sp.k : isPiece(this.armed) ? this.armed : null;
    if (kind) {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.validTile(kind, x, y)) tileGlow(x, y, this.moving ? 0x6ac0d0 : 0xfff0a0);
    }
    const dk = digKind(this.armed);
    if (dk) for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.canDigAt(dk, x, y)) tileGlow(x, y, 0xc0a070);
    if (this.armed === 'chest') for (const spot of this.grid.spots) if (!this.run.bait.includes(spot)) tileGlow(spot % COLS, Math.floor(spot / COLS), GOLD);
    const s = this.sel;
    if (sp) {
      tileGlow(sp.x, sp.y, 0xffffff);
      const tw = this.sim.towers.find((t) => t.id === sp.id);
      if (tw) g.circle(this.bx + tw.x * TILE, this.by + tw.y * TILE, tw.range * TILE).stroke({ width: 1, color: 0xfff0a0, alpha: 0.8 });
      const ru = this.sim.runes.find((r) => r.id === sp.id);
      if (ru?.kind === 'greed') g.circle(this.tx(ru.x) + 8, this.ty(ru.y) + 8, ru.radius * TILE).stroke({ width: 1, color: GOLD, alpha: 0.8 });
      const post = M.PIECES[sp.k].slot === 'chamber' ? lairPost(this.grid, sp.x, sp.y) : null;
      if (post) tileGlow(post[0], post[1], 0x6ac0d0);
    } else if (s?.t === 'chest') tileGlow(s.spot % COLS, Math.floor(s.spot / COLS), GOLD);
    else if (s?.t === 'dug') tileGlow(s.i % COLS, Math.floor(s.i / COLS), 0xc0a070);
    else if (s?.t === 'ghost') {
      const gh = this.per.ghosts[s.i];
      if (gh) tileGlow(gh.x, gh.y, 0x6ac0d0);
    }
  }

  // ---------- UI ----------

  private updateUi(): void {
    const r = this.run;
    const sim = this.sim;
    const x0 = this.x0;

    // Party preview.
    const q = sim.queue;
    const key = q.map((p) => p.join(',')).join('|') + `|${this.sim.partyN}`;
    if (key !== this.previewKey) this.drawPreview(key);
    const pg = this.uiG.clear();
    const frac = 1 - Math.max(0, sim.partyTimer) / M.PARTY_EVERY;
    pg.rect(x0, this.topY + 11, 17, 2).fill(OUTLINE);
    pg.rect(x0, this.topY + 11, Math.round(17 * frac), 1).fill(0xc08a3a);

    // Lure dial.
    this.lureText.set(`LURE ${r.lure}`, r.lure < r.lureMax ? C.ink : C.goldText);
    this.setBtn(this.lureDown, '-', undefined, r.lure > 0);
    if (r.lure < r.lureMax) this.setBtn(this.lureUp, '+', undefined, true);
    else if (r.lureMax >= M.MAX_LURE) this.setBtn(this.lureUp, 'MAX', undefined, false);
    else {
      const cost = M.lureCost(r.lureMax + 1);
      this.setBtn(this.lureUp, `+${fm(cost)}`, undefined, r.bank >= cost);
    }

    // Status / hint row.
    const leak = Math.round(sim.leakFrac() * 100);
    const target = this.ctx.def.skillTarget(this.ctx.save.cycle.n);
    const champs = r.champs.filter((t) => t >= target).length;
    let hint = '';
    const a = this.armed;
    if (this.trapArmed) hint = 'TAP THE PATH UNDER A VISITOR';
    else if (this.glareArmed) hint = 'TAP NEAR A VISITOR TO GLARE';
    else if (this.dragPiece !== null) hint = 'DROP ON A GLOWING TILE. 3S SETTLE';
    else if (this.moving) hint = 'TAP A GLOWING TILE TO MOVE';
    else if (a === 'chest') hint = 'TAP A GLOWING LOOP END';
    else if (a === 'dig.p') hint = `CARVE A CORRIDOR: ${fm(M.digCost(this.dugList().length))}`;
    else if (a === 'dig.w' || a === 'dig.c') hint = `DIG ROCK INTO A ${a === 'dig.w' ? 'WALL' : 'CHAMBER'}: ${fm(M.digCost(this.dugList().length))}`;
    else if (isPiece(a)) hint = `${M.PIECES[a].role}`;
    if (hint) this.status.set(hint, C.goldText);
    else {
      const gong = sim.gongStack > 0 ? `  GONG+${Math.round(sim.gongStack * M.GONG_STEP * 100)}%` : '';
      this.status.set(`P${sim.partyN} LEAK ${leak}%${gong}  {skull}${Math.min(2, champs)}/2@L${target}`, leak >= 20 ? C.redText : C.inkDim);
    }

    // Ability row.
    const nextBonus = Math.round(Math.min(M.GONG_MAX, sim.gongStack + 1) * M.GONG_STEP * 100);
    const wait = Math.ceil(sim.partyTimer - (M.PARTY_EVERY - M.GONG_GAP));
    this.setBtn(this.gongBtn, 'GONG', sim.gongReady ? `+${nextBonus}%` : sim.spawnQ.length ? 'WAIT' : `${wait}S`, sim.gongReady);
    this.setBtn(this.glareBtn, this.glareArmed ? 'AIM!' : 'GLARE', this.glareCd > 0 ? `${Math.ceil(this.glareCd)}S` : 'READY', this.glareCd <= 0);
    this.setBtn(this.trapBtn, this.trapArmed ? 'AIM!' : 'TRAP', sim.trap ? 'OPEN' : `${sim.trapCharges}/1`, sim.trapCharges > 0);
    this.setBtn(this.shopBtn, 'WORKSHOP', undefined, true);

    // Tray or panel.
    if (this.sel) this.updatePanel();
    else {
      this.tabBtns.forEach((b, i) => {
        const on = i === this.tab;
        this.setBtn(b, M.TABS[i].label, undefined, true, on ? [0xa06ad0, 0x6a3a8a] : [0x3a2a4a, 0x241830]);
      });
      this.slotBtns.forEach((btn, i) => {
        const kind = this.slotKind(i);
        if (!kind) {
          btn.visible = false;
          return;
        }
        let label = '';
        let sub = '';
        let ok = false;
        if (kind === 'chest') {
          const full = r.bait.length >= this.grid.spots.length;
          const cost = M.chestCost(r);
          label = 'CHEST';
          sub = full ? 'ALL SET' : fm(cost);
          ok = !full && r.bank >= cost;
        } else if (digKind(kind)) {
          const cost = M.digCost(this.dugList().length);
          label = EXTRA_LABEL[kind as M.TrayExtra];
          sub = fm(cost);
          ok = r.bank >= cost;
        } else if (isPiece(kind)) {
          const cost = M.placeCost(r, kind);
          const full = M.PIECES[kind].slot === 'path' && M.runeCount(r) >= M.runeSlots(r);
          label = M.PIECES[kind].short;
          sub = full ? 'FULL' : fm(cost);
          ok = !full && r.bank >= cost;
        }
        const isArmed = this.armed === kind;
        const sc = this.slotColor(kind);
        this.setBtn(btn, label, sub, ok || isArmed, isArmed ? [0xfff0a0, 0xc0a040] : [sc.color, sc.shade]);
      });
    }
  }

  private drawPreview(key: string): void {
    this.previewKey = key;
    const g = this.previewG.clear();
    const q = this.sim.queue;
    let x = this.x0 + 19;
    const y = this.topY + 3;
    let ti = 0;
    const maxX = this.lureDown.x - 4;
    q.forEach((party, pi) => {
      const counts = new Map<M.HeroType, number>();
      for (const t of party) counts.set(t, (counts.get(t) ?? 0) + 1);
      if (pi === 1) {
        if (x + 6 > maxX) return;
        g.rect(x, y + 2, 2, 1).fill(0x5a4a6a);
        x += 5;
      }
      for (const t of PREVIEW_ORDER) {
        const n = counts.get(t);
        if (!n || ti >= this.previewTexts.length) continue;
        const label = `${n}`;
        const w = 6 + measure(label).w + 3;
        if (x + w > maxX) break;
        const ig = this.previewIcons[ti];
        ig.context = heroIcon(t);
        ig.position.set(x, y);
        ig.alpha = pi === 1 ? 0.55 : 1;
        ig.visible = true;
        const txt = this.previewTexts[ti++];
        txt.set(label, pi === 1 ? C.inkDim : C.ink);
        txt.position.set(x + 7, y);
        x += w;
      }
    });
    for (; ti < this.previewTexts.length; ti++) {
      this.previewTexts[ti].set('');
      this.previewIcons[ti].visible = false;
    }
  }

  private updatePanel(): void {
    const r = this.run;
    const s = this.sel!;
    const hide = (...bs: Button[]) => bs.forEach((b) => (b.visible = false));
    const maxInfo = Math.floor(this.uw / 4);
    if (s.t === 'piece') {
      const p = this.selectedPiece();
      if (!p) return this.select(null);
      const d = M.PIECES[p.k];
      const br = p.b ? ` ${d.branches[p.b - 1].toUpperCase()}` : '';
      const br2 = p.b2 && p.l >= M.BRANCH_LEVEL2 ? `+${d.branches2[p.b2 - 1].toUpperCase()}` : '';
      this.panelTitle.set(`${d.short} L${p.l}${br}${br2}`.slice(0, maxInfo - 5), C.ink);
      this.panelInfo.set((this.moving ? 'TAP OR DRAG TO A GLOWING TILE' : this.pieceInfo(p)).slice(0, maxInfo), this.moving ? C.goldText : C.inkDim);
      const placed = this.placedAt.get(p.id);
      const undo = placed !== undefined && this.time - placed < M.UNDO_S;
      const refund = undo ? p.inv : p.inv * M.SELL_REFUND;
      this.setBtn(this.pSell, undo ? 'UNDO' : 'SELL', `+${fm(refund)}`, true, SELL_COL);
      this.setBtn(this.pMove, this.moving ? 'CANCEL' : 'MOVE', undefined, true);
      const cost = M.levelCost(p.k, p.l);
      if (M.branchAt(p.l)) {
        // Branch level (L5 or L10): pick one of two.
        const names = p.l + 1 === M.BRANCH_LEVEL2 ? d.branches2 : d.branches;
        const descs = p.l + 1 === M.BRANCH_LEVEL2 ? d.branchDesc2 : d.branchDesc;
        hide(this.pUp, this.pUp1);
        this.setBtn(this.pA, names[0].toUpperCase().slice(0, 9), fm(cost), r.bank >= cost, SWAP_COL);
        this.setBtn(this.pB, names[1].toUpperCase().slice(0, 9), fm(cost), r.bank >= cost, SWAP_COL);
        if (!this.moving) this.panelInfo.set(`L${p.l + 1}: ${descs[0]} / ${descs[1]}`.slice(0, maxInfo), C.inkDim);
      } else if (p.l >= M.MAX_LEVEL) {
        hide(this.pUp, this.pUp1);
        if (!p.b2) {
          // An older save's L10 piece: the L10 branch is a free pick.
          this.setBtn(this.pA, d.branches2[0].toUpperCase().slice(0, 9), 'FREE', true, SWAP_COL);
          this.setBtn(this.pB, d.branches2[1].toUpperCase().slice(0, 9), 'FREE', true, SWAP_COL);
        } else {
          const c1 = M.swapCost(p.k, 1);
          const c2 = M.swapCost(p.k, 2);
          this.setBtn(this.pA, `L5>${d.branches[p.b === 1 ? 1 : 0].toUpperCase().slice(0, 6)}`, fm(c1), r.bank >= c1, SWAP_COL);
          this.setBtn(this.pB, `L10>${d.branches2[p.b2 === 1 ? 1 : 0].toUpperCase().slice(0, 5)}`, fm(c2), r.bank >= c2, SWAP_COL);
        }
      } else if (p.l >= M.BRANCH_LEVEL) {
        // L5-9: upgrade (one slot) and swap the L5 branch.
        hide(this.pUp, this.pA);
        this.setBtn(this.pUp1, `L${p.l + 1}`, fm(cost), r.bank >= cost);
        const c1 = M.swapCost(p.k, 1);
        this.setBtn(this.pB, `>${d.branches[p.b === 1 ? 1 : 0].toUpperCase().slice(0, 8)}`, fm(c1), r.bank >= c1, SWAP_COL);
      } else {
        hide(this.pA, this.pB, this.pUp1);
        this.setBtn(this.pUp, `UPGRADE L${p.l + 1}`, fm(cost), r.bank >= cost);
      }
    } else if (s.t === 'chest') {
      const owned = r.bait.includes(s.spot);
      const carved = s.spot >= 0 && this.grid.dug[s.spot] === 1;
      this.panelTitle.set(carved ? 'BAIT CHEST, CARVED POCKET' : 'BAIT CHEST, LOOP END', C.goldText);
      this.panelInfo.set(owned ? 'NON-ROGUES DETOUR THROUGH HERE' : 'PULLS PARTIES DOWN TO HERE', C.inkDim);
      hide(this.pA, this.pB, this.pMove, this.pUp1);
      if (owned) {
        this.pUp.visible = false;
        this.setBtn(this.pSell, 'SELL', `+${fm(M.chestRefund(r))}`, true, SELL_COL);
      } else {
        const cost = M.chestCost(r);
        this.setBtn(this.pUp, 'PLACE CHEST', fm(cost), r.bank >= cost);
        if (carved) this.setBtn(this.pSell, 'FILL', 'FREE', true, [0x8a7a5a, 0x5a4a30]);
        else this.pSell.visible = false;
      }
    } else if (s.t === 'dug') {
      if (!this.grid.dug[s.i]) return this.select(null);
      const k = tileKind(this.grid, s.i % COLS, Math.floor(s.i / COLS));
      this.panelTitle.set(`DUG ${k === 'path' ? 'CORRIDOR' : k.toUpperCase()}`, '#c0a070');
      this.panelInfo.set(k === 'path' ? 'HEROES TAKE THE SHORTEST WAY' : 'BUILD ON IT, OR FILL IT IN', C.inkDim);
      hide(this.pA, this.pB, this.pMove, this.pUp, this.pUp1);
      this.setBtn(this.pSell, 'FILL', 'FREE', true, [0x8a7a5a, 0x5a4a30]);
    } else {
      const gh = this.per.ghosts[s.i];
      if (!gh || M.pieceAt(r, gh.x, gh.y)) return this.select(null);
      this.panelTitle.set(`BLUEPRINT: ${M.PIECES[gh.k].name.toUpperCase()}`, '#6ac0d0');
      this.panelInfo.set(this.per.mason ? 'MASTER MASON REBUILDS THESE' : 'GHOSTS FROM YOUR LAST DUNGEON', C.inkDim);
      hide(this.pA, this.pB, this.pMove, this.pUp1);
      const cost = M.placeCost(r, gh.k);
      this.setBtn(this.pUp, 'REBUILD', fm(cost), r.bank >= cost);
      this.setBtn(this.pSell, 'ALL', undefined, true, [0x6ac0d0, 0x2a6a7a]);
    }
  }

  private pieceInfo(p: M.PieceSave): string {
    const f1 = (n: number) => (n < 10 ? (Math.round(n * 10) / 10).toString() : fm(n));
    const tw = this.sim.towers.find((t) => t.id === p.id);
    if (tw) {
      if (tw.kind === 'brazier') return `BURN ${f1(tw.dps)}/S R${f1(tw.range)}${tw.slow ? ' SLOW' : ''}`;
      if (tw.kind === 'ballista') return `${f1(tw.dmg)} DMG PIERCE ${tw.pierce} R${f1(tw.range)}`;
      if (tw.kind === 'eye') return `SLOW ${Math.round(tw.slow * 100)}% R${f1(tw.range)}${tw.vuln ? ' +20% DMG' : ''}`;
      return `${f1(tw.dmg)} DMG ${f1(tw.rate)}/S R${f1(tw.range)}${tw.bleed ? ' BLEED' : ''}${tw.pierceArmor ? ' AP' : ''}`;
    }
    const ms = this.sim.minions.filter((m) => m.id === p.id && !m.split);
    if (ms.length) {
      const extra = p.k === 'slime' ? ` SPLIT ${this.sim.minions.filter((m) => m.id === p.id && m.split).length}` : ` BLOCK ${ms[0].cap}`;
      return `${ms.length}X ${f1(ms[0].maxHp)}HP ${f1(ms[0].dps)}DPS${extra}`;
    }
    const ru = this.sim.runes.find((x) => x.id === p.id);
    if (ru) {
      const off = ru.off > 0 ? ' DISPELLED' : '';
      if (ru.kind === 'mire') return `SLOW ${Math.round(ru.slow * 100)}% ${f1(ru.slowDur)}S${ru.stun ? ' +TRAP' : ''}${off}`;
      if (ru.kind === 'spikes') return `${f1(ru.dmg)} DMG ${ru.charges}/${ru.maxCharges} CHARGES${off}`;
      if (ru.kind === 'greed') return `KILLS +${Math.round(ru.bonus * 100)}% R${f1(ru.radius)}${off}`;
      return `BACKWARD ${f1(ru.confuse)}S, CD ${f1(ru.cool)}S${off}`;
    }
    return '';
  }

  // ---------- slow checks: lessons, Master Mason, flavour ----------

  private obStep(): string | null {
    const d = this.ctx.save;
    if (d.seen.onboardingDone) return null;
    const step = this.ctx.def.onboarding.find((s) => !d.seen[`ob.${s.id}`]);
    return step?.id ?? null;
  }

  private slowChecks(): void {
    const r = this.run;
    // Workshop badge.
    const b = this.badge.clear();
    if (anyAffordable(this.groups)) {
      b.rect(0, 0, 9, 9).fill(OUTLINE);
      b.rect(1, 1, 7, 7).fill(C.red);
      b.rect(4, 2, 1, 3).fill(0xffffff);
      b.rect(4, 6, 1, 1).fill(0xffffff);
    }
    const step = this.obStep();
    this.coinLife = step === 'coin' ? 4 : M.COIN_LIFE;
    if (step === 'place' && this.tab !== 0 && !this.armed) this.setTab(0);
    // Master Mason (00 §2.5): rebuild affordable blueprints at L1.
    if (this.per.mason && !this.ritual) {
      const before = r.pieces.length;
      const built = M.masonRebuild(r, this.per, 4);
      if (built) {
        for (const p of r.pieces.slice(before)) this.placedAt.set(p.id, this.time);
        this.layoutChanged();
        this.ctx.float(`MASON +${built}`, this.bx + BOARD_W / 2, this.by + 12, '#6ac0d0');
      }
    }
    // Micro-lessons as mechanics come within reach (01 §18; the core runs each once).
    if (!step) {
      if (!r.bait.length && r.bank >= M.chestCost(r)) this.ctx.lesson('chests');
      else if (r.lureMax === 0 && r.bank >= M.lureCost(1) && r.stats.placed >= 1) this.ctx.lesson('lure');
      else if (r.stats.upgrades === 0 && r.pieces.some((p) => r.bank >= M.levelCost(p.k, p.l))) this.ctx.lesson('levels');
      else if (M.runeCount(r) === 0 && r.bank >= M.placeCost(r, 'mire') && r.stats.placed >= 3) this.ctx.lesson('runes');
      else if (r.stats.branches === 0 && r.pieces.some((p) => p.l + 1 === M.BRANCH_LEVEL && r.bank >= M.levelCost(p.k, p.l))) this.ctx.lesson('branch');
      else if ((this.per.floors ?? 1) < 2 && r.bank >= FLOORS[1].cost) this.ctx.lesson('floors');
      else if (r.stats.dug === 0 && r.bait.length >= 1 && r.lureMax >= 6 && r.bank >= 4 * M.digCost(this.dugList().length)) this.ctx.lesson('dig');
    }
    // Flavour (the core rate-limits non-milestone lines); never during intense moments.
    this.flavorT -= 0.5;
    if (this.flavorT <= 0 && !this.isIntense()) {
      this.flavorT = 45;
      this.ctx.say('flavor');
    }
  }

  // ---------- core hooks ----------

  /** 01 §18: a Champion on the field, a thief carrying a sack, a Glare or Trapdoor being aimed, a
   * party within 4 tiles of the Hoard, or the 3 s before a party enters (the preview is changing). */
  /** U-09: the top row (NEXT party preview, the Lure dial) and the status line under it. The
   * manager strip folds instead of covering them on short screens. */
  avoidRects(): Rect[] {
    return [{ x: this.x0, y: this.topY - 1, w: this.uw, h: 23 }];
  }

  isIntense(): boolean {
    if (this.aim || this.trapArmed || this.glareArmed || this.dragPiece !== null || this.ritual) return true;
    if (this.sim.partyTimer < 3) return true;
    for (const h of this.sim.heroes) {
      if (h.dead || h.gone) continue;
      if (h.type === 'champ' || h.sack > 0) return true;
      if (h.dir > 0 && h.route.len - h.dist < 4) return true;
    }
    return false;
  }

  private btnRect(b: Button | undefined | null): Rect | null {
    if (!b || !b.visible || b.parent?.visible === false) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  private tileRect(x: number, y: number): Rect {
    return { x: this.tx(x), y: this.ty(y), w: TILE, h: TILE };
  }

  private heroRect(h: SimHero | undefined): Rect | null {
    if (!h) return null;
    return { x: Math.round(this.bx + h.x * TILE) - 6, y: Math.round(this.by + h.y * TILE) - 8, w: 12, h: 13 };
  }

  /** The forward hero closest to the Hoard. */
  private leadHero(type?: M.HeroType): SimHero | undefined {
    let best: SimHero | undefined;
    for (const h of this.sim.heroes) {
      if (h.dead || h.gone || h.dir < 0 || (type && h.type !== type)) continue;
      if (!best || h.dist / h.route.len > best.dist / best.route.len) best = h;
    }
    return best;
  }

  private slotRect(kind: Armed): Rect | null {
    if (this.sel) return null;
    const ti = M.TABS.findIndex((t) => t.kinds.includes(kind as M.PieceKind));
    if (ti < 0) return null;
    if (ti !== this.tab) return this.btnRect(this.tabBtns[ti]);
    const si = M.TABS[ti].kinds.indexOf(kind as M.PieceKind);
    return this.btnRect(this.slotBtns[si]);
  }

  /** Onboarding / lesson targets (OnboardingStep.target). */
  targetRect(id: string): Rect | null {
    const r = this.run;
    switch (id) {
      case 'coin': {
        const c = this.coins.find((k) => k.fly <= 0);
        return c ? { x: Math.round(c.x) - 4, y: Math.round(c.y) - 4, w: 8, h: 8 } : null;
      }
      case 'tile.suggested': {
        const [x, y] = FLOORS[r.floor].suggested;
        return M.pieceAt(r, x, y) ? null : this.tileRect(x, y);
      }
      case 'glare':
        return this.glareCd <= 0 ? (this.heroRect(this.leadHero()) ?? this.btnRect(this.glareBtn)) : this.btnRect(this.glareBtn);
      case 'trap': {
        if (!this.trapArmed) return this.btnRect(this.trapBtn);
        const h = this.leadHero();
        return h ? this.tileRect(Math.floor(h.x), Math.floor(h.y)) : null;
      }
      case 'btn.gong':
        return this.btnRect(this.gongBtn);
      case 'btn.glare':
        return this.btnRect(this.glareBtn);
      case 'btn.trap':
        return this.btnRect(this.trapBtn);
      case 'workshop':
        return this.btnRect(this.shopBtn);
      case 'lure.up':
        return this.btnRect(this.lureUp);
      case 'lure.down':
        return this.btnRect(this.lureDown);
      case 'preview':
        return { x: this.x0, y: this.topY, w: Math.max(20, this.lureDown.x - 4 - this.x0), h: 12 };
      case 'chest.flow': {
        if (this.armed !== 'chest') return this.slotRect('chest');
        const spot = this.grid.spots.find((s) => !r.bait.includes(s));
        return spot === undefined ? null : this.tileRect(spot % COLS, Math.floor(spot / COLS));
      }
      case 'chest.placed': {
        const spot = r.bait[0];
        return spot === undefined ? null : this.tileRect(spot % COLS, Math.floor(spot / COLS));
      }
      case 'piece.upgrade': {
        if (this.sel?.t === 'piece') return this.btnRect(this.pUp.visible ? this.pUp : this.pUp1.visible ? this.pUp1 : this.pA);
        const p = r.pieces.find((q) => r.bank >= M.levelCost(q.k, q.l) && !M.branchAt(q.l)) ?? r.pieces[0];
        return p ? this.tileRect(p.x, p.y) : null;
      }
      case 'piece.branch': {
        if (this.sel?.t === 'piece') return this.btnRect(this.pA);
        const p = r.pieces.find((q) => q.l + 1 === M.BRANCH_LEVEL);
        return p ? this.tileRect(p.x, p.y) : null;
      }
      case 'dig.flow': {
        if (this.armed !== 'dig.p') return this.slotRect('dig.p');
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.canDigAt('p', x, y) && this.grid.kind[idx(x, y)] === K_ROCK) return this.tileRect(x, y);
        return null;
      }
      default:
        if (id.startsWith('slot.')) return this.slotRect(id.slice(5) as Armed);
        if (id.startsWith('hero.')) return this.heroRect(this.leadHero(id.slice(5) as M.HeroType));
        if (id.startsWith('tab.')) return this.btnRect(this.tabBtns[M.TABS.findIndex((t) => t.id === id.slice(4))]);
        return null;
    }
  }

  /**
   * Return ritual (01 §13, 00 §5.3): the visitors your Trapdoors and Sinkholes caught while you
   * were away sit in a cell. Tap each to ransom them; score = share ransomed within 6 s.
   */
  returnRitual(haul: number): Promise<number> {
    if (this.ritual || !(haul > 0)) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      const layer = this.ritualLayer;
      const n = Math.max(3, Math.min(6, 2 + Math.floor(Math.log10(Math.max(10, haul)))));
      const types: M.HeroType[] = ['squire', 'rogue', 'knight', 'cleric', 'wizard', 'squire'];
      const cx = this.bx + BOARD_W / 2;
      const cy = this.by + BOARD_H / 2;
      const w = Math.min(BOARD_W - 8, 20 * n + 16);
      const box = { x: Math.round(cx - w / 2), y: Math.round(cy - 30), w, h: 60 };
      const g = new Graphics();
      const title = new PixelText('CAPTIVES! TAP TO RANSOM', C.goldText);
      const sub = new PixelText(`+5% OF ${fm(haul)} PLUNDER`, C.inkDim);
      layer.addChild(g, title, sub);
      title.position.set(Math.round(cx - title.width / 2), box.y + 4);
      sub.position.set(Math.round(cx - sub.width / 2), box.y + 12);
      const captives = Array.from({ length: n }, (_, i) => {
        const v = new Graphics(heroArt(types[i % types.length], 0));
        const x = box.x + 16 + i * Math.floor((w - 32) / Math.max(1, n - 1));
        v.position.set(x, box.y + 44);
        layer.addChild(v);
        return { v, x, y: box.y + 38, freed: false };
      });
      let t = 0;
      const T = 6;
      let freed = 0;
      layer.eventMode = 'static';
      layer.hitArea = new Rectangle(this.bx, this.by, BOARD_W, BOARD_H);
      const finish = (score: number) => {
        if (!this.ritual) return;
        this.ritual = null;
        layer.removeAllListeners();
        layer.eventMode = 'none';
        layer.removeChildren().forEach((c) => c.destroy());
        resolve(Math.max(0, Math.min(1, score)));
      };
      layer.on('pointerdown', (e: FederatedPointerEvent) => {
        const { x, y } = this.local(e);
        const c = captives.find((k) => !k.freed && Math.abs(k.x - x) <= 10 && Math.abs(k.y - y) <= 12);
        if (!c) return;
        c.freed = true;
        freed++;
        c.v.alpha = 0.25;
        this.ctx.float('RANSOM!', c.x, c.y - 12, C.goldText);
        this.ctx.haptic(10);
        this.sparkle((c.x - this.bx) / TILE, (c.y - this.by) / TILE);
        if (freed >= n) finish(1);
      });
      const draw = () => {
        g.clear();
        g.rect(box.x - 1, box.y - 1, box.w + 2, box.h + 2).fill(OUTLINE).rect(box.x, box.y, box.w, box.h).fill({ color: 0x1a0e24, alpha: 0.95 });
        g.rect(box.x, box.y, box.w, 1).fill(GOLD);
        // Cell bars over the captives.
        for (let x = box.x + 6; x < box.x + box.w - 4; x += 6) if (!captives.some((c) => c.freed && Math.abs(c.x - x) < 6)) g.rect(x, box.y + 22, 1, 30).fill(0x6a6a7a);
        g.rect(box.x + 4, box.y + 22, box.w - 8, 1).fill(0x8a8a9a).rect(box.x + 4, box.y + 51, box.w - 8, 1).fill(0x8a8a9a);
        drawBar(g, box.x + 4, box.y + box.h - 6, box.w - 8, 4, 1 - t / T, GOLD);
      };
      this.ritual = {
        done: (score) => finish(score),
      };
      let last = performance.now();
      const tick = () => {
        if (!this.ritual) return;
        const now = performance.now();
        t += Math.min(0.1, (now - last) / 1000);
        last = now;
        draw();
        if (t >= T) finish(freed / n);
        else requestAnimationFrame(tick);
      };
      draw();
      requestAnimationFrame(tick);
    });
  }

  resize(_layout: Layout): void {
    this.pieceViews.forEach((v) => {
      v.g.destroy();
      v.pips.destroy();
    });
    this.pieceViews.clear();
    this.ritual?.done(0);
    this.buildLayout();
    this.syncPieces();
  }

  /** A Goods import was bought: Iron-shod Towers and Caged Bait apply to the live floor at once. */
  onImports(): void {
    const imp = dungeonImports(this.ctx.save.imports);
    this.sim.ap = imp.ap;
    this.sim.caged = imp.caged;
  }

  destroy(): void {
    if (this.revDirty >= 0) this.run.rev++;
    this.ritual?.done(0);
    this.hit.removeAllListeners();
    this.coinPool.forEach((g) => g.destroy());
    this.coinPool = [];
    destroyTree(this.root);
  }
}
