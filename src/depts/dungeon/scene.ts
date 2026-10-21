// The Dungeon scene (specs/01): an 11x13 floor with one winding path and two side loops. Tap a
// tray piece, then a glowing tile, to build; tap a piece to upgrade, branch, move or sell it.
// Tap near a visitor to Glare, ring the Gong to call the next party, drop the Trapdoor under a
// runner. The simulation lives in sim.ts (shared with idleRate); this file renders and handles input.
import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure } from '../../ui/font';
import { Button, C } from '../../ui/widgets';
import * as M from './model';
import { COLS, HOARD, ENTRY, LOOPS, MAP, ROWS, SUGGESTED_TILE, STARTER_SLITS, TILE, isRuneTile, isWalkable, lairPost, tileKind } from './map';
import { Sim, STEP, type SimEvent, type SimHero } from './sim';
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

const BOARD_W = COLS * TILE;
const BOARD_H = ROWS * TILE;
const TRAY_H = 40;
const ABIL_H = 19;
const TOP_H = 22;
const MAX_COINS = 40;
const MAX_PARTS = 150;
const MAX_TRACERS = 40;

const CHAMP_NAMES = [
  'SIR REGINALD THE MILDLY BRAVE',
  'DAME OSWYN OF THE OVERDUE LOAN',
  'SIR PERCIVAL THE PUNCTUAL',
  'LADY BRISK OF BRIGHTWATER',
  'SIR GARETH THE GOLD-CURIOUS',
  'BARON THADDEUS THE TAXED',
];

type Armed = M.PieceKind | 'chest' | null;
type Sel = { t: 'piece'; id: number } | { t: 'chest'; i: number } | { t: 'ghost'; i: number } | null;

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
  kind: 'arrow' | 'ballista' | 'clerk' | 'glare';
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
const fm = (n: number) => formatNum(n);

export class DungeonScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.DungeonRun;
  private per: M.DungeonPersistent;
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
  private hit = new Container();
  private ui = new Container();
  private uiG!: Graphics;
  private bannerG = new Graphics();
  private banner = new PixelText('', '#e8c04a');

  // views
  private pieceViews = new Map<number, PieceView>();
  private chestViews: Graphics[] = [];
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
  private slots: { kind: M.PieceKind | 'chest'; btn: Button }[] = [];
  private slotBox!: Container;
  private panel!: Container;
  private panelTitle!: PixelText;
  private panelInfo!: PixelText;
  private pUp!: Button;
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
  private lastStruggle = -1e9;
  private struggleGlow = 0;
  private champName = '';
  private hoardLevel = -1;
  private glowTarget: Button | null = null;
  private glowTile: [number, number] | null = null;
  private coinLife = M.COIN_LIFE;
  private revDirty = -1;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    M.normalize(ctx.save.run, ctx.save.persistent);
    this.run = ctx.save.run as M.DungeonRun;
    this.per = ctx.save.persistent as M.DungeonPersistent;
    this.run.lure = Math.max(0, Math.min(this.run.lure, this.run.lureMax));
    this.applyStarterKit();
    this.sim = new Sim({
      pieces: this.run.pieces,
      chests: this.run.chests,
      ws: this.run.ws,
      lure: this.run.lure,
      party: this.run.party,
      seed: (Date.now() & 0x7fffffff) ^ 0x5bd1e995,
      live: true,
    });
    this.sim.stealFn = (h) => this.steal(h);
    this.groups = buildGroups(ctx, {
      changed: () => this.layoutChanged(),
      lureBought: () => this.onLureBought(),
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
      this.bannerG,
      this.banner,
      this.ui,
      this.hit,
    );
    this.buildLayout();
    this.syncPieces();
    this.updateBlueprint();
    ctx.raiseSkill(M.heldLure(this.run));
  }

  // ---------- cycle start ----------

  /** After a Fall: last cycle's layout becomes ghosts and the kit adds 10% of its value (01 §4, §7). */
  private applyStarterKit(): void {
    const n = this.ctx.save.cycle.n;
    const bp = this.per.bp;
    if (bp.cycle >= n) return;
    const starter = (g: M.Ghost) => STARTER_SLITS.some(([x, y]) => g.x === x && g.y === y && g.k === 'arrow');
    const fresh = bp.pieces.filter((g) => !starter(g));
    const keep = this.per.ghosts.filter((g) => !fresh.some((f) => f.x === g.x && f.y === g.y));
    this.per.ghosts = [...fresh, ...keep];
    if (bp.value > 0) this.run.bank += 0.1 * bp.value;
    this.per.bp = { cycle: n, pieces: [], value: 0 };
    this.ctx.saveSoon();
  }

  private updateBlueprint(): void {
    this.per.bp = {
      cycle: this.ctx.save.cycle.n,
      pieces: this.run.pieces.map((p) => ({ k: p.k, x: p.x, y: p.y })),
      value: M.layoutValue(this.run),
    };
  }

  // ---------- layout ----------

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

    // Fixed board art: Ledger-Bones and the Hoard.
    this.hoard.position.set(this.bx + HOARD[0] * TILE, this.by + HOARD[1] * TILE);
    this.clerk.position.set(this.bx + HOARD[0] * TILE - 3, this.by + HOARD[1] * TILE + 15);
    this.pieceLayer.addChild(this.hoard, this.clerk);
    this.clerk.context = clerkArt(0);

    // Chest spots.
    this.chestViews.forEach((g) => g.destroy());
    this.chestViews = LOOPS.map((l) => {
      const g = new Graphics(chestArt(false, false));
      g.position.set(this.bx + l.chest[0] * TILE, this.by + l.chest[1] * TILE);
      this.pieceLayer.addChild(g);
      return g;
    });

    // UI.
    this.ui.removeChildren().forEach((ch) => ch.destroy({ children: true }));
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

    // Tray: 8 build slots in two rows.
    this.slots = [];
    const kinds: (M.PieceKind | 'chest')[] = ['arrow', 'brazier', 'ballista', 'crypt', 'ogre', 'mire', 'spikes', 'chest'];
    const sw = Math.floor((this.uw - gap * 3) / 4);
    kinds.forEach((k, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const w = col === 3 ? this.uw - (sw + gap) * 3 : sw;
      const btn = mk(
        { w, h: 18, label: k === 'chest' ? 'CHEST' : M.PIECES[k].short, sub: '', ...this.slotColor(k), onTap: () => this.arm(k) },
        x0 + col * (sw + gap),
        this.trayY + row * 21,
        this.slotBox,
      );
      this.slots.push({ kind: k, btn });
    });

    // Selected-piece panel.
    const py = this.trayY;
    this.panelTitle.position.set(x0, py + 1);
    this.panelInfo.position.set(x0, py + 9);
    const bw = Math.floor((this.uw - gap * 3) / 4);
    this.pUp = mk({ w: bw * 2 + gap, h: 20, label: 'UPGRADE', sub: '', onTap: () => this.panelAction('up') }, x0, py + 18, this.panel);
    this.pA = mk({ w: bw, h: 20, label: 'A', sub: '', color: 0x5a9ad8, shade: 0x2a5a8a, onTap: () => this.panelAction('a') }, x0, py + 18, this.panel);
    this.pB = mk({ w: bw, h: 20, label: 'B', sub: '', color: 0x5a9ad8, shade: 0x2a5a8a, onTap: () => this.panelAction('b') }, x0 + bw + gap, py + 18, this.panel);
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
    this.hit.on('pointerupoutside', () => (this.aim = null));
    this.overlayDirty = true;
  }

  private slotColor(k: M.PieceKind | 'chest'): { color: number; shade: number; textColor: string } {
    if (k === 'chest') return { color: 0xc8a040, shade: 0x8a6a20, textColor: '#140c1c' };
    const slot = M.PIECES[k].slot;
    if (slot === 'wall') return { color: 0x8fb04f, shade: 0x4a6a22, textColor: '#140c1c' };
    if (slot === 'chamber') return { color: 0x5a9ad8, shade: 0x2a5a8a, textColor: '#140c1c' };
    return { color: 0x9a6ad0, shade: 0x5a3a8a, textColor: '#140c1c' };
  }

  private drawBackground(): void {
    const c = this.ctx.content();
    const L = this.ctx.layout;
    this.bg.cacheAsTexture(false);
    const g = this.bg.clear();
    g.rect(0, c.y, L.w, L.h - c.y).fill(PAL.rock);
    let seed = 777;
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
    if (zone > 44) {
      for (const fx of [0.18, 0.82]) {
        const x = Math.round(c.x + c.w * fx);
        const len = Math.min(zone - 16, 14 + Math.floor(zone * 0.3));
        for (let y = c.y; y < c.y + len; y += 3) g.rect(x, y, 1, 2).fill(0x4a4458);
        const ly = c.y + len;
        g.rect(x - 3, ly, 7, 9).fill(OUTLINE).rect(x - 2, ly + 1, 5, 7).fill(0x3a3440).rect(x - 1, ly + 2, 3, 5).fill(0x6ad08a).rect(x, ly + 3, 1, 2).fill(0xd0ffd8);
        g.circle(x, ly + 4, 14).fill({ color: 0x6ad08a, alpha: 0.05 });
        g.circle(x, ly + 4, 8).fill({ color: 0x6ad08a, alpha: 0.07 });
      }
    }
    // Board frame.
    const { bx, by } = this;
    g.rect(bx - 2, by - 2, BOARD_W + 4, BOARD_H + 4).fill(OUTLINE);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const px = bx + x * TILE;
        const py = by + y * TILE;
        const k = tileKind(x, y);
        const ch = MAP[y][x];
        const loop = ch === 'a' || ch === 'b' || ch === 'A' || ch === 'B';
        if (k === 'rock') {
          g.rect(px, py, TILE, TILE).fill(PAL.rock);
          if (r() < 0.6) g.rect(px + Math.floor(r() * 12), py + Math.floor(r() * 12), 3, 2).fill(PAL.rockSpeck);
        } else if (k === 'wall') {
          g.rect(px, py, TILE, TILE).fill(PAL.wallDark);
          // Bricks.
          for (let row = 0; row < 4; row++) {
            const off = row % 2 ? 4 : 0;
            for (let col = -1; col < 2; col++) {
              const bx0 = px + off + col * 8;
              const x0 = Math.max(px, bx0 + 1);
              const x1 = Math.min(px + TILE, bx0 + 8);
              if (x1 - x0 <= 0) continue;
              g.rect(x0, py + row * 4 + 1, x1 - x0, 3).fill(PAL.wall);
              g.rect(x0, py + row * 4 + 1, x1 - x0, 1).fill(PAL.wallLight);
            }
          }
        } else if (k === 'chamber') {
          g.rect(px, py, TILE, TILE).fill(PAL.chamber);
          g.rect(px + 1, py + 1, TILE - 2, TILE - 2).fill(PAL.chamberLight);
          g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill(PAL.chamber);
          for (let i = 0; i < 3; i++) g.rect(px + 3 + Math.floor(r() * 9), py + 3 + Math.floor(r() * 9), 1, 1).fill(0x3a5a3a);
        } else {
          const base = loop ? PAL.loop : PAL.path;
          const light = loop ? PAL.loopLight : PAL.pathLight;
          g.rect(px, py, TILE, TILE).fill(base);
          // Flagstones.
          g.rect(px + 1, py + 1, 6, 6).fill(light).rect(px + 9, py + 2, 6, 5).fill(light).rect(px + 2, py + 9, 5, 6).fill(light).rect(px + 8, py + 9, 7, 6).fill(light);
          g.rect(px + 1, py + 6, 6, 1).fill(PAL.pathDark).rect(px + 9, py + 6, 6, 1).fill(PAL.pathDark);
        }
      }
    // Path edges: a dark lip where floor meets wall, so the corridor reads.
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!isWalkable(x, y)) continue;
        const px = bx + x * TILE;
        const py = by + y * TILE;
        if (!isWalkable(x, y - 1)) g.rect(px, py, TILE, 1).fill(OUTLINE);
        if (!isWalkable(x, y + 1)) g.rect(px, py + TILE - 1, TILE, 1).fill(0x2a2030);
        if (!isWalkable(x - 1, y)) g.rect(px, py, 1, TILE).fill(OUTLINE);
        if (!isWalkable(x + 1, y)) g.rect(px + TILE - 1, py, 1, TILE).fill(0x2a2030);
      }
    // Entry archway.
    const ex = bx + ENTRY[0] * TILE;
    const ey = by + ENTRY[1] * TILE;
    g.rect(ex + 1, ey, 14, 9).fill(OUTLINE);
    g.rect(ex + 2, ey, 12, 1).fill(0x6a5a7a);
    for (let i = 3; i < 14; i += 3) g.rect(ex + i, ey + 1, 1, 7).fill(0x4a4458);
    g.rect(ex + 1, ey + 3, 14, 1).fill(0x4a4458);
    // Loop letters on the chest spots' sides are drawn by the chests themselves.
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
      const key = `${p.k}.${p.l}.${p.b}.${p.x}.${p.y}`;
      if (key !== v.key) {
        v.key = key;
        v.g.context = pieceArt(p.k, this.tierOf(p.l), p.b, 0);
        v.g.position.set(this.bx + p.x * TILE, this.by + p.y * TILE);
        // Level pips along the bottom edge (one per level past 1, max 9).
        const pg = v.pips.clear();
        const n = p.l - 1;
        if (n > 0) {
          const w = Math.min(n, 9) * 2 - 1;
          pg.rect(-1, -1, w + 2, 3).fill(OUTLINE);
          for (let i = 0; i < Math.min(n, 9); i++) pg.rect(i * 2, 0, 1, 1).fill(i >= 8 ? GOLD : i >= 3 ? 0x6ac0d0 : 0xd8d0b0);
          v.pips.position.set(this.bx + p.x * TILE + Math.floor((TILE - w) / 2), this.by + p.y * TILE + TILE - 2);
        }
      }
    }
    // Ghost blueprints and chests.
    const g = this.ghostG.clear();
    this.ghostLayer.removeChildren().forEach((c) => c.destroy());
    for (const gh of this.per.ghosts) {
      if (this.pieceAt(gh.x, gh.y)) continue;
      const sil = new Graphics(pieceArt(gh.k, 0, 0, 0));
      sil.position.set(this.bx + gh.x * TILE, this.by + gh.y * TILE);
      sil.alpha = 0.3;
      this.ghostLayer.addChild(sil);
      const px = this.bx + gh.x * TILE;
      const py = this.by + gh.y * TILE;
      g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill({ color: 0x6ac0d0, alpha: 0.18 });
      g.rect(px + 2, py + 2, TILE - 4, 1).fill({ color: 0x6ac0d0, alpha: 0.6 });
      g.rect(px + 2, py + TILE - 3, TILE - 4, 1).fill({ color: 0x6ac0d0, alpha: 0.6 });
      g.rect(px + 2, py + 2, 1, TILE - 4).fill({ color: 0x6ac0d0, alpha: 0.6 });
      g.rect(px + TILE - 3, py + 2, 1, TILE - 4).fill({ color: 0x6ac0d0, alpha: 0.6 });
    }
    this.chestViews.forEach((cv, i) => (cv.context = chestArt(!!this.run.chests[i], false)));
    this.overlayDirty = true;
  }

  private pieceAt(x: number, y: number): M.PieceSave | undefined {
    return this.run.pieces.find((p) => p.x === x && p.y === y);
  }

  private ghostAt(x: number, y: number): number {
    return this.per.ghosts.findIndex((g) => g.x === x && g.y === y && !this.pieceAt(x, y));
  }

  private validTile(k: M.PieceKind, x: number, y: number): boolean {
    if (this.pieceAt(x, y)) return false;
    const slot = M.PIECES[k].slot;
    const kind = tileKind(x, y);
    if (slot === 'wall') return kind === 'wall';
    if (slot === 'chamber') return kind === 'chamber' && !!lairPost(x, y);
    return isRuneTile(x, y);
  }

  /** The idle sim reruns when run.rev changes; bump it 1.5 s after the last edit (01 §3 debounce). */
  private touch(): void {
    this.revDirty = this.time;
  }

  /** Called after every change the sim depends on. */
  private layoutChanged(): void {
    this.touch();
    const settle = new Map<number, number>();
    for (const [id, until] of this.settleUntil) {
      const left = until - this.time;
      if (left > 0) settle.set(id, left);
      else this.settleUntil.delete(id);
    }
    this.sim.setLayout(this.run.pieces, this.run.chests, this.run.ws, settle);
    this.syncPieces();
    this.updateBlueprint();
    this.run.stats.bestPieces = Math.max(this.run.stats.bestPieces, this.run.pieces.length);
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
    const p: M.PieceSave = { id: this.run.nextId++, k, x, y, l: 1, b: 0, inv: cost };
    this.run.pieces.push(p);
    this.run.stats.placed++;
    this.placedAt.set(p.id, this.time);
    const gi = this.per.ghosts.findIndex((g) => g.x === x && g.y === y);
    if (gi >= 0) this.per.ghosts.splice(gi, 1);
    this.layoutChanged();
    this.puff(x + 0.5, y + 0.5, 0xd8d0b0, 6);
    this.ctx.haptic(8);
    if (k === 'ballista' && !this.ctx.seen('d.ballista')) {
      this.ctx.markSeen('d.ballista');
      this.ctx.say('firstBallista', { milestone: true });
    }
    return true;
  }

  private upgrade(p: M.PieceSave, branch: 0 | 1 | 2): void {
    if (p.l >= M.MAX_LEVEL) return;
    const needBranch = p.l + 1 === M.BRANCH_LEVEL;
    if (needBranch && !branch) return;
    const cost = M.levelCost(p.k, p.l);
    if (!this.ctx.spend(cost)) return;
    p.l++;
    p.inv += cost;
    this.run.stats.upgrades++;
    if (needBranch) {
      p.b = branch;
      this.run.stats.branches++;
      if (!this.ctx.seen('d.branch')) {
        this.ctx.markSeen('d.branch');
        this.ctx.say('firstBranch', { milestone: true });
      }
    }
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
    if (!this.validTile(p.k, x, y)) return false;
    this.puff(p.x + 0.5, p.y + 0.5, 0x8a7a9a, 5);
    p.x = x;
    p.y = y;
    this.settleUntil.set(p.id, this.time + M.SETTLE_S);
    this.layoutChanged();
    this.puff(x + 0.5, y + 0.5, 0xd8d0b0, 5);
    return true;
  }

  private buyChest(i: number): void {
    if (this.run.chests[i]) return;
    const cost = M.chestCost(this.run);
    if (!this.ctx.spend(cost)) {
      this.floatAt(LOOPS[i].chest[0] + 0.5, LOOPS[i].chest[1], `NEED ${fm(cost)}`, '#e05050');
      return;
    }
    this.run.chests[i] = 1;
    this.layoutChanged();
    this.sparkle(LOOPS[i].chest[0] + 0.5, LOOPS[i].chest[1] + 0.5);
    this.ctx.haptic(12);
    if (!this.ctx.seen('d.chestBought')) {
      this.ctx.markSeen('d.chestBought');
      this.ctx.say('chestPlaced', { milestone: true });
    }
  }

  private sellChest(i: number): void {
    if (!this.run.chests[i]) return;
    const refund = M.chestRefund(this.run);
    this.run.chests[i] = 0;
    this.run.bank += refund;
    this.layoutChanged();
    this.floatAt(LOOPS[i].chest[0] + 0.5, LOOPS[i].chest[1], `+${fm(refund)}`, C.goldText);
    this.select(null);
  }

  private rebuildGhost(i: number): boolean {
    const g = this.per.ghosts[i];
    if (!g) return false;
    if (this.pieceAt(g.x, g.y)) {
      this.per.ghosts.splice(i, 1);
      return false;
    }
    return this.place(g.k, g.x, g.y);
  }

  private rebuildAll(): void {
    let built = 0;
    for (let guard = 0; guard < 80; guard++) {
      const i = this.per.ghosts.findIndex((g) => !this.pieceAt(g.x, g.y) && this.run.bank >= M.placeCost(this.run, g.k) && (M.PIECES[g.k].slot !== 'path' || M.runeCount(this.run) < M.runeSlots(this.run)));
      if (i < 0 || !this.rebuildGhost(i)) break;
      built++;
    }
    if (built) this.ctx.game.toast(`REBUILT ${built} FROM BLUEPRINTS.`);
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
    this.run.lure = T;
    this.touch();
    this.sim.setLure(T);
  }

  private onLureBought(): void {
    const r = this.run;
    this.sim.setLure(r.lure);
    this.touch();
    this.ctx.haptic(15);
    const T = r.lureMax;
    const newMax = T > this.per.bestLure;
    if (newMax) this.per.bestLure = T;
    if (T === M.KNIGHT_LURE && !this.ctx.seen('d.knights')) {
      this.ctx.markSeen('d.knights');
      this.ctx.say('knights', { milestone: true });
    } else if (T === M.ROGUE_LURE && !this.ctx.seen('d.rogues')) {
      this.ctx.markSeen('d.rogues');
      this.ctx.say('rogues', { milestone: true });
    } else if (T === 1 && !this.ctx.seen('d.lure1')) {
      this.ctx.markSeen('d.lure1');
      this.ctx.say('lureFirst', { milestone: true });
    } else if (newMax && T % 5 === 0) {
      this.ctx.say('dialRaised', { milestone: true, vars: { n: T } });
    }
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
    this.floatAt(ENTRY[0] + 0.5, ENTRY[1] + 1, `GONG! +${Math.round(this.sim.gongStack * M.GONG_STEP * 100)}%`, C.goldText);
    if (this.sim.gongStack >= 5 && !this.ctx.seen('d.perfect')) {
      this.ctx.markSeen('d.perfect');
      this.ctx.say('perfect', { milestone: true });
    }
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

  /** Highest-priority hero near a point: sack carriers, then Champions, then the nearest. */
  private snap(px: number, py: number, radius: number): SimHero | null {
    let best: SimHero | null = null;
    let bestScore = Infinity;
    for (const h of this.sim.heroes) {
      if (h.dead || h.gone) continue;
      const hx = this.bx + h.x * TILE;
      const hy = this.by + h.y * TILE - 3;
      const d = Math.hypot(hx - px, hy - py);
      if (d > radius) continue;
      const score = d - (h.sack > 0 ? 1000 : 0) - (h.type === 'champ' ? 500 : 0);
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

  private arm(k: M.PieceKind | 'chest'): void {
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
      else if (a === 'a') this.upgrade(p, 1);
      else if (a === 'b') this.upgrade(p, 2);
      else if (a === 'move') {
        this.moving = !this.moving;
        this.overlayDirty = true;
      } else if (a === 'sell') this.sell(p);
    } else if (s.t === 'chest') {
      if (a === 'up') this.buyChest(s.i);
      else if (a === 'sell') this.sellChest(s.i);
    } else if (s.t === 'ghost') {
      if (a === 'up') {
        if (this.rebuildGhost(s.i)) this.select(null);
      } else if (a === 'sell') this.rebuildAll();
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

  private local(e: FederatedPointerEvent): { x: number; y: number; tx: number; ty: number } {
    const p = this.root.toLocal(e.global);
    const tx = Math.floor((p.x - this.bx) / TILE);
    const ty = Math.floor((p.y - this.by) / TILE);
    return { x: p.x, y: p.y, tx, ty };
  }

  private onDown(e: FederatedPointerEvent): void {
    const { x, y, tx, ty } = this.local(e);
    const inB = tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS;

    // 1. Coins (a greedy grab beats everything; they sit on top).
    const coin = this.coins.find((c) => c.fly <= 0 && Math.abs(c.x - x) <= 7 && Math.abs(c.y - y) <= 7);
    if (coin) {
      this.collect(coin, true);
      return;
    }
    if (!inB) return;

    // 2. Moving a piece.
    const sp = this.selectedPiece();
    if (this.moving && sp) {
      if (!this.moveTo(sp, tx, ty)) this.ctx.game.toast('MOVE: TAP A GLOWING TILE.');
      this.moving = false;
      this.overlayDirty = true;
      return;
    }

    // 3. Trapdoor.
    if (this.trapArmed) {
      if (isWalkable(tx, ty) && tileKind(tx, ty) !== 'entry' && tileKind(tx, ty) !== 'hoard') {
        if (this.sim.openTrap(tx, ty)) this.ctx.haptic(12);
      }
      this.trapArmed = false;
      return;
    }

    // 4. Building.
    if (this.armed) {
      if (this.armed === 'chest') {
        const i = LOOPS.findIndex((l) => l.chest[0] === tx && l.chest[1] === ty);
        if (i >= 0) {
          this.buyChest(i);
          this.armed = null;
          this.refreshTray();
          this.overlayDirty = true;
          return;
        }
      } else if (this.validTile(this.armed, tx, ty)) {
        if (this.place(this.armed, tx, ty) && this.run.bank < M.placeCost(this.run, this.armed)) {
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

    // 6. Selection.
    const p = this.pieceAt(tx, ty);
    if (p) {
      const cur = this.sel;
      this.select(cur?.t === 'piece' && cur.id === p.id ? null : { t: 'piece', id: p.id });
      return;
    }
    const ci = LOOPS.findIndex((l) => l.chest[0] === tx && l.chest[1] === ty);
    if (ci >= 0) {
      this.select({ t: 'chest', i: ci });
      return;
    }
    const gi = this.ghostAt(tx, ty);
    if (gi >= 0) {
      this.select({ t: 'ghost', i: gi });
      return;
    }
    this.select(null);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.aim) return;
    const { x, y } = this.local(e);
    const h = this.snap(x, y, 20);
    if (h) this.aim.h = h;
  }

  private onUp(_e: FederatedPointerEvent): void {
    const a = this.aim;
    this.aim = null;
    if (a?.h) this.fireGlare(a.h);
  }

  // ---------- coins and juice ----------

  private collect(c: Coin, grab: boolean): void {
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
        if (e.sack > 0) {
          this.run.bank += e.sack;
          const bonus = this.ctx.earn(e.sack * M.RECOVER_BONUS);
          s.recovered++;
          this.floatAt(e.x, e.y - 1.6, `SACK +${fm(e.sack + bonus)}`, '#fff0a0');
          this.sparkle(e.x, e.y);
          this.ctx.haptic(25);
          if (!this.ctx.seen('d.recovered')) {
            this.ctx.markSeen('d.recovered');
            this.ctx.say('recovered', { milestone: true });
          }
        }
        if (e.hero === 'champ') this.onChampSlain();
        break;
      }
      case 'leak':
        s.thieves++;
        this.floatAt(e.x, e.y - 1, e.sack > 0 ? `-${fm(e.sack)}` : 'GRAB!', '#e05050');
        this.ctx.haptic(30);
        if (!this.ctx.seen('d.thief')) {
          this.ctx.markSeen('d.thief');
          this.ctx.say('thief', { milestone: true });
        }
        break;
      case 'escape':
        s.escaped++;
        this.floatAt(ENTRY[0] + 0.5, ENTRY[1] + 0.6, e.sack > 0 ? 'ESCAPED!' : 'FLED', '#e05050');
        break;
      case 'rune':
        if (e.kind === 'spikes') this.puff(e.x + 0.5, e.y + 0.5, 0xe0e0f0, 3);
        else this.puff(e.x + 0.5, e.y + 0.7, 0x6ac04a, 3);
        break;
      case 'trapped':
        s.traps++;
        this.floatAt(e.x, e.y - 1, 'AAAA!', C.ink);
        this.puff(e.x, e.y, 0x3a2a1a, 6);
        this.ctx.haptic(15);
        break;
      case 'party':
        if (e.champ) {
          this.champName = CHAMP_NAMES[Math.floor(rand() * CHAMP_NAMES.length)];
          this.showBanner(this.champName);
          this.ctx.haptic(30);
          if (!this.ctx.seen('d.champion')) {
            this.ctx.markSeen('d.champion');
            this.ctx.say('champion', { milestone: true });
          }
        }
        this.run.party = this.sim.partyN;
        break;
      case 'partyDone':
        this.checkStruggle();
        break;
      case 'minionDown':
        this.puff(e.x, e.y, 0xe8e0c8, 6);
        break;
      case 'loot':
        s.detours++;
        if (!this.ctx.seen('d.detour')) {
          this.ctx.markSeen('d.detour');
          this.ctx.say('detour', { milestone: true });
        }
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
    if (!this.ctx.seen('d.champSlain')) {
      this.ctx.markSeen('d.champSlain');
      this.ctx.say('champSlain', { milestone: true });
    }
    this.ctx.saveSoon();
  }

  private checkStruggle(): void {
    if (this.sim.history.length < 20 || this.run.lure === 0) return;
    const leak = this.sim.leakFrac();
    if (leak <= 0.3 || this.time - this.lastStruggle < 30 * 60) return;
    this.lastStruggle = this.time;
    this.struggleGlow = this.time + 15;
    this.ctx.say('struggle', { milestone: true, vars: { n: Math.round(leak * 100) } });
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
    if (this.overlayDirty) this.drawOverlay();
    this.overlayG.alpha = 0.65 + 0.35 * Math.sin(this.time * 6);
    this.updateUi();
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
      v.g.alpha = h.slowT > 0 ? 0.85 : 1;
      const top = h.type === 'champ' ? 13 : h.type === 'knight' ? 10 : 9;
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
      const off = m.kind === 'ogre' ? [0, 0] : [[-4, -3], [4, 3], [0, -5]][m.n] ?? [0, 0];
      g.position.set(Math.round(this.bx + m.px * TILE + off[0]), Math.round(this.by + m.py * TILE + 5 + off[1]));
      const p = this.run.pieces.find((q) => q.id === m.id);
      const swing = m.blocked.length > 0 && Math.floor(this.time * 4) % 2 === 0 ? 1 : 0;
      g.context = minionArt(m.kind, swing, p ? this.tierOf(p.l) : 0);
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
      if (tw.kind === 'brazier') {
        const p = this.run.pieces.find((q) => q.id === tw.id);
        if (p) v.g.context = pieceArt('brazier', this.tierOf(p.l), p.b, tw.active ? fr : 0);
      }
    }
    for (const r of this.sim.runes) {
      const v = this.pieceViews.get(r.id);
      if (!v) continue;
      const p = this.run.pieces.find((q) => q.id === r.id);
      if (r.kind === 'spikes' && p) v.g.context = pieceArt('spikes', this.tierOf(p.l), p.b, r.charges >= 1 ? 0 : 1);
      v.g.alpha = r.settle > 0 ? 0.5 : r.flash > 0 ? 1 : 0.9;
    }
    for (const m of this.sim.minions) {
      const v = this.pieceViews.get(m.id);
      if (v) v.g.alpha = !m.alive && m.respawnT > m.respawn - 0.1 ? 0.6 : 1;
    }
    // Chests glint every 2 s.
    const glint = this.time % 2 < 0.2;
    this.chestViews.forEach((cv, i) => {
      if (this.run.chests[i]) cv.context = chestArt(true, glint);
    });
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
    // Brazier embers.
    for (const tw of this.sim.towers) {
      if (tw.kind !== 'brazier' || !tw.active) continue;
      const cx = this.bx + tw.x * TILE;
      const cy = this.by + tw.y * TILE;
      const r = tw.range * TILE;
      for (let k = 0; k < 3; k++) {
        const ang = this.time * 2 + k * 2.1 + tw.id;
        g.rect(Math.round(cx + Math.cos(ang) * r * 0.7), Math.round(cy + Math.sin(ang) * r * 0.7), 1, 1).fill(k % 2 ? 0xf07a20 : 0xffd040);
      }
    }
    // Trapdoor.
    const tr = this.sim.trap;
    if (tr) {
      const px = this.bx + tr.x * TILE;
      const py = this.by + tr.y * TILE;
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

  /** Placement glow, selection ring, onboarding highlight. Redrawn only when state changes. */
  private drawOverlay(): void {
    this.overlayDirty = false;
    const g = this.overlayG.clear();
    const tileGlow = (x: number, y: number, color: number) => {
      const px = this.bx + x * TILE;
      const py = this.by + y * TILE;
      g.rect(px + 1, py + 1, TILE - 2, TILE - 2).fill({ color, alpha: 0.18 });
      g.rect(px, py, TILE, 1).rect(px, py + TILE - 1, TILE, 1).rect(px, py + 1, 1, TILE - 2).rect(px + TILE - 1, py + 1, 1, TILE - 2).fill(color);
    };
    const sp = this.selectedPiece();
    const kind: M.PieceKind | null = this.moving && sp ? sp.k : this.armed && this.armed !== 'chest' ? this.armed : null;
    if (kind) {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.validTile(kind, x, y)) tileGlow(x, y, this.moving ? 0x6ac0d0 : 0xfff0a0);
    }
    if (this.armed === 'chest') LOOPS.forEach((l, i) => !this.run.chests[i] && tileGlow(l.chest[0], l.chest[1], GOLD));
    const s = this.sel;
    if (sp) {
      tileGlow(sp.x, sp.y, 0xffffff);
      const tw = this.sim.towers.find((t) => t.id === sp.id);
      if (tw) g.circle(this.bx + tw.x * TILE, this.by + tw.y * TILE, tw.range * TILE).stroke({ width: 1, color: 0xfff0a0, alpha: 0.8 });
      const post = M.PIECES[sp.k].slot === 'chamber' ? lairPost(sp.x, sp.y) : null;
      if (post) tileGlow(post[0], post[1], 0x6ac0d0);
    } else if (s?.t === 'chest') tileGlow(LOOPS[s.i].chest[0], LOOPS[s.i].chest[1], GOLD);
    else if (s?.t === 'ghost') {
      const gh = this.per.ghosts[s.i];
      if (gh) tileGlow(gh.x, gh.y, 0x6ac0d0);
    }
    if (this.glowTile && !kind) tileGlow(this.glowTile[0], this.glowTile[1], 0xfff0a0);
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
    if (this.trapArmed) hint = 'TAP THE PATH UNDER A VISITOR';
    else if (this.glareArmed) hint = 'TAP NEAR A VISITOR TO GLARE';
    else if (this.moving) hint = 'TAP A GLOWING TILE TO MOVE';
    else if (this.armed === 'chest') hint = 'TAP A GLOWING LOOP END';
    else if (this.armed) hint = `TAP A GLOWING ${M.PIECES[this.armed].slot === 'wall' ? 'WALL' : M.PIECES[this.armed].slot === 'chamber' ? 'CHAMBER' : 'PATH TILE'}`;
    if (hint) this.status.set(hint, C.goldText);
    else {
      const gong = sim.gongStack > 0 ? `  GONG+${sim.gongStack * 10}%` : '';
      this.status.set(`P${sim.partyN} LEAK ${leak}%${gong}  {skull}${Math.min(2, champs)}/2@L${target}`, leak >= 20 ? C.redText : C.inkDim);
    }

    // Ability row.
    const nextBonus = Math.min(M.GONG_MAX, sim.gongStack + 1) * 10;
    const wait = Math.ceil(sim.partyTimer - (M.PARTY_EVERY - M.GONG_GAP));
    this.setBtn(this.gongBtn, 'GONG', sim.gongReady ? `+${nextBonus}%` : sim.spawnQ.length ? 'WAIT' : `${wait}S`, sim.gongReady);
    this.setBtn(this.glareBtn, this.glareArmed ? 'AIM!' : 'GLARE', this.glareCd > 0 ? `${Math.ceil(this.glareCd)}S` : 'READY', this.glareCd <= 0);
    this.setBtn(this.trapBtn, this.trapArmed ? 'AIM!' : 'TRAP', sim.trap ? 'OPEN' : `${sim.trapCharges}/1`, sim.trapCharges > 0);
    this.setBtn(this.shopBtn, 'WORKSHOP', undefined, true);

    // Tray or panel.
    if (this.sel) this.updatePanel();
    else {
      for (const { kind, btn } of this.slots) {
        if (kind === 'chest') {
          const full = r.chests[0] && r.chests[1];
          const cost = M.chestCost(r);
          this.setBtn(btn, 'CHEST', full ? 'PLACED' : fm(cost), !full && r.bank >= cost);
        } else {
          const cost = M.placeCost(r, kind);
          const full = M.PIECES[kind].slot === 'path' && M.runeCount(r) >= M.runeSlots(r);
          this.setBtn(btn, M.PIECES[kind].short, full ? 'FULL' : fm(cost), !full && r.bank >= cost);
        }
        const isArmed = this.armed === kind;
        const ck = `armed.${isArmed}`;
        if ((btn as any)._armedKey !== ck) {
          (btn as any)._armedKey = ck;
          const sc = this.slotColor(kind);
          if (isArmed) btn.setColor(0xfff0a0, 0xc0a040);
          else btn.setColor(sc.color, sc.shade);
        }
      }
    }

    // Onboarding / lesson glow around a button.
    const b = this.glowTarget;
    if (b && b.visible && b.parent?.visible !== false && Math.floor(this.time * 3) % 2 === 0) {
      const gx = b.x;
      const gy = b.y;
      const bw = b.width;
      const bh = b.height;
      pg.rect(gx - 2, gy - 2, bw + 4, 1).rect(gx - 2, gy + bh + 1, bw + 4, 1).rect(gx - 2, gy - 1, 1, bh + 2).rect(gx + bw + 1, gy - 1, 1, bh + 2);
      pg.fill(0xfff0a0);
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
      for (const t of ['squire', 'rogue', 'knight', 'champ'] as M.HeroType[]) {
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
    if (s.t === 'piece') {
      const p = this.selectedPiece();
      if (!p) return this.select(null);
      const d = M.PIECES[p.k];
      const br = p.b ? ` ${d.branches[p.b - 1].toUpperCase()}` : '';
      this.panelTitle.set(`${d.name.toUpperCase()} L${p.l}${br}`, C.ink);
      this.panelInfo.set(this.moving ? 'TAP A GLOWING TILE. SETTLES 3S.' : this.pieceInfo(p), this.moving ? C.goldText : C.inkDim);
      const placed = this.placedAt.get(p.id);
      const undo = placed !== undefined && this.time - placed < M.UNDO_S;
      const refund = undo ? p.inv : p.inv * M.SELL_REFUND;
      this.setBtn(this.pSell, undo ? 'UNDO' : 'SELL', `+${fm(refund)}`, true, SELL_COL);
      this.setBtn(this.pMove, this.moving ? 'CANCEL' : 'MOVE', undefined, true);
      if (p.l >= M.MAX_LEVEL) {
        hide(this.pA, this.pB);
        this.setBtn(this.pUp, 'MAX LEVEL', undefined, false);
      } else if (p.l + 1 === M.BRANCH_LEVEL) {
        const cost = M.levelCost(p.k, p.l);
        this.pUp.visible = false;
        this.setBtn(this.pA, d.branches[0].toUpperCase().slice(0, 10), fm(cost), r.bank >= cost);
        this.setBtn(this.pB, d.branches[1].toUpperCase().slice(0, 10), fm(cost), r.bank >= cost);
        if (!this.moving) this.panelInfo.set(`L5: ${d.branchDesc[0]} / ${d.branchDesc[1]}`.slice(0, Math.floor(this.uw / 4)), C.inkDim);
      } else {
        hide(this.pA, this.pB);
        const cost = M.levelCost(p.k, p.l);
        this.setBtn(this.pUp, `UPGRADE L${p.l + 1}`, fm(cost), r.bank >= cost);
      }
    } else if (s.t === 'chest') {
      const owned = !!r.chests[s.i];
      this.panelTitle.set(`BAIT CHEST, LOOP ${LOOPS[s.i].name}`, C.goldText);
      this.panelInfo.set(owned ? 'NON-ROGUES DETOUR THROUGH HERE' : 'PULLS PARTIES DOWN THIS LOOP', C.inkDim);
      hide(this.pA, this.pB, this.pMove);
      if (owned) {
        this.pUp.visible = false;
        this.setBtn(this.pSell, 'SELL', `+${fm(M.chestRefund(r))}`, true, SELL_COL);
      } else {
        const cost = M.chestCost(r);
        this.setBtn(this.pUp, 'PLACE CHEST', fm(cost), r.bank >= cost);
        this.pSell.visible = false;
      }
    } else {
      const gh = this.per.ghosts[s.i];
      if (!gh || this.pieceAt(gh.x, gh.y)) return this.select(null);
      this.panelTitle.set(`BLUEPRINT: ${M.PIECES[gh.k].name.toUpperCase()}`, '#6ac0d0');
      this.panelInfo.set(`${this.per.ghosts.length} GHOSTS FROM YOUR LAST DUNGEON`, C.inkDim);
      hide(this.pA, this.pB, this.pMove);
      const cost = M.placeCost(r, gh.k);
      this.setBtn(this.pUp, 'REBUILD', fm(cost), r.bank >= cost);
      this.setBtn(this.pSell, 'ALL', undefined, true, [0x6ac0d0, 0x2a6a7a]);
    }
  }

  private pieceInfo(p: M.PieceSave): string {
    const f1 = (n: number) => (n < 10 ? (Math.round(n * 10) / 10).toString() : fm(n));
    const tw = this.sim.towers.find((t) => t.id === p.id);
    if (tw) {
      if (tw.kind === 'brazier') return `BURN ${f1(tw.dps)}/S  RANGE ${f1(tw.range)}`;
      if (tw.kind === 'ballista') return `${f1(tw.dmg)} DMG  PIERCE ${tw.pierce}  R${f1(tw.range)}`;
      return `${f1(tw.dmg)} DMG ${f1(tw.rate)}/S R${f1(tw.range)}${tw.bleed ? ' BLEED' : ''}`;
    }
    const ms = this.sim.minions.filter((m) => m.id === p.id);
    if (ms.length) return `${ms.length}X ${f1(ms[0].maxHp)}HP ${f1(ms[0].dps)}DPS BLOCK ${ms[0].cap}`;
    const ru = this.sim.runes.find((x) => x.id === p.id);
    if (ru) return ru.kind === 'mire' ? `SLOW ${Math.round(ru.slow * 100)}% FOR ${f1(ru.slowDur)}S${ru.stun ? ' +TRAP' : ''}` : `${f1(ru.dmg)} DMG  ${ru.charges}/${ru.maxCharges} CHARGES`;
    return '';
  }

  // ---------- slow checks: lessons, onboarding glow, flavour ----------

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
    // Onboarding highlights.
    const step = this.obStep();
    this.coinLife = step === 'coin' ? 4 : M.COIN_LIFE;
    let glow: Button | null = null;
    let tile: [number, number] | null = null;
    const slot = (k: M.PieceKind | 'chest') => this.slots.find((s) => s.kind === k)?.btn ?? null;
    if (step === 'place') {
      glow = this.armed === 'arrow' ? null : slot('arrow');
      if (!this.pieceAt(...SUGGESTED_TILE)) tile = SUGGESTED_TILE;
    } else if (step === 'glare') glow = this.glareBtn;
    else if (step === 'upgrade') {
      if (this.sel?.t === 'piece') glow = this.pUp.visible ? this.pUp : this.pA;
      else {
        const p = r.pieces.find((q) => q.k === 'arrow');
        if (p) tile = [p.x, p.y];
      }
    } else if (step === 'trap') glow = this.trapBtn;
    else if (step === 'gong') glow = this.gongBtn;
    // Micro-lesson: Bait Chests once affordable (01 §18).
    if (!step && !r.chests[0] && !r.chests[1] && r.bank >= M.chestCost(r) && !this.ctx.seen('d.chestLesson')) {
      this.ctx.markSeen('d.chestLesson');
      this.ctx.say('chestLesson', { milestone: true });
    }
    if (!step && this.ctx.seen('d.chestLesson') && !this.ctx.seen('d.chestBought')) glow = slot('chest');
    if (this.time < this.struggleGlow && this.run.lure > 0) glow = this.lureDown;
    if (tile?.[0] !== this.glowTile?.[0] || tile?.[1] !== this.glowTile?.[1]) {
      this.glowTile = tile;
      this.overlayDirty = true;
    }
    this.glowTarget = glow;
    // Flavour (the core rate-limits non-milestone lines); never during intense moments.
    this.flavorT -= 0.5;
    const intense = this.sim.champOnField || this.sim.heroes.some((h) => h.sack > 0) || this.aim !== null || this.trapArmed;
    if (this.flavorT <= 0 && !intense) {
      this.flavorT = 45;
      this.ctx.say('flavor');
    }
  }

  resize(_layout: Layout): void {
    this.pieceViews.forEach((v) => {
      v.g.destroy();
      v.pips.destroy();
    });
    this.pieceViews.clear();
    this.buildLayout();
    this.syncPieces();
  }

  destroy(): void {
    if (this.revDirty >= 0) this.run.rev++;
    this.hit.removeAllListeners();
    this.coinPool.forEach((g) => g.destroy());
    this.coinPool = [];
    this.root.destroy({ children: true });
  }
}
