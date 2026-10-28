// The Goblin Mines scene: renders the headless Wall (wall.ts) - the 5x5 rock wall you smash, the
// goblin crew that chips beside you, the depth lever, and (once bought) the Doom Drum's beat - and
// feeds it taps, holds and rakes. All rules live in wall.ts and every number in model.ts; this
// file owns input, juice, sound, the manager hooks, the keg return ritual and drum calibration.
import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { offlineCapSeconds, offlineFactor } from '../../core/economy';
import { PixelText, measure } from '../../ui/font';
import { Button, C } from '../../ui/widgets';
import * as M from './model';
import {
  crackArt,
  drumArt,
  drummerArt,
  flashArt,
  gasArt,
  gauntletArt,
  glintArt,
  goblinArt,
  goldGoblinArt,
  GOLD,
  OUTLINE,
  rockArt,
  STRATA_PAL,
  torchArt,
  type ArtKind,
} from './art';
import { audioNow, sfx } from './sfx';
import { anyAffordable, buildGroups, maxDepthEver } from './upgrades';
import { U, Wall, type By, type Tile } from './wall';
import { destroyTree } from '../../ui/destroy';

// Wave 1: the 8 taps/s half-damage soft cap is gone (fast taps fill the Fury meter instead); the
// 15 hits/s hard cap stays as an input-flood guard.
const HARD_CAP = 15;
/** Gold Goblin tap radius in screen px (generous: he is small and moving). */
const GOLD_HIT = 13;
/** Hit-stop on a rock you break yourself (Sakurai: ~2 frames). */
const BREAK_STOP = 0.033;
const RAKE_MAX = 8;
const HOLD_DELAY = 0.35;
const MAX_FX = 12;
const CALIB_TAPS = 8;
const RITUAL_WAIT = 8;

interface TileView {
  cont: Container;
  body: Graphics;
  crack: Graphics;
  flash: Graphics;
  over: Graphics; // gas cloud / glint
  flashT: number;
  squashT: number;
  variant: number;
  shownKey: string;
  overKey: string;
}

interface GobView {
  g: Graphics;
  cheer: number;
  frame: number;
}

interface Particle {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  grav: number;
  home: boolean;
}

interface Fx {
  kind: 'zap' | 'blast';
  t: number;
  max: number;
  pts?: number[];
  x?: number;
  y?: number;
  w?: number;
  color?: number;
}

interface Ptr {
  tile: number;
  raked: number;
  hold: number;
  auto: number;
}

interface Ritual {
  t: number;
  kegs: number[];
  lit: number; // index into kegs where the chain started, or -1 while waiting
  next: number[]; // blast order once lit
  chainT: number;
  score: number;
  resolve: (score: number) => void;
  doneT: number;
}

interface Calib {
  t: number;
  period: number;
  offsets: number[];
  lastBeat: number;
  sched: number;
}

const rand = Math.random;
const GOLD_DIM = 0xb08a30;

export class MinesScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.MinesRun;
  private per: M.MinesPersistent;
  private groups: UpgradeGroup[];
  private wall: Wall;

  // layout
  private T = 32;
  private s = 30;
  private k = 1; // screen px per wall unit (T / U)
  private wallX = 0;
  private wallY = 0;
  private ledgeY = 0;
  private statusY = 0;

  // layers
  private bg = new Graphics();
  private wallLayer = new Container();
  private ringG = new Graphics();
  private gobLayer = new Container();
  private fxG = new Graphics();
  private partLayer = new Container();
  private ritualLayer = new Container();
  private ritualG = new Graphics();
  private calibLayer = new Container();
  private calibG = new Graphics();
  private calibText = new PixelText('');
  private ritualText = new PixelText('', '#ffe060');
  private edgeG = new Graphics();
  private ui = new Container();
  private uiG = new Graphics();
  private hit = new Container();
  private drum = new Graphics();
  private drummers: Graphics[] = [];
  private torches: Graphics[] = [];
  private fist = new Graphics();
  private kegViews: Graphics[] = [];

  // state
  private views: TileView[] = [];
  private gobViews: GobView[] = [];
  private parts: Particle[] = [];
  private pool: Sprite[] = [];
  private fx: Fx[] = [];
  private time = 0;
  private frameWall = performance.now();
  private hitStop = 0;
  private shakeT = 0;
  private shakeMag = 0;
  private fistT = 0;
  private shownDepth = 0;
  private tapTimes: number[] = [];
  private pointers = new Map<number, Ptr>();
  private lastBeatIdx = -1;
  private schedBeat = -1;
  private beatPulse = 0;
  private slowTick = 0;
  private maxParts = 160;
  private slowFrames = 0;
  private obTile = 12;
  private lastBeatHitK = Number.NaN;
  private ritual: Ritual | null = null;
  private calib: Calib | null = null;
  private calibPending = false;
  /** Signed beat offsets of recent judged taps, for silent auto-calibration. */
  private autoCal: number[] = [];
  private autoCalN = 0;
  private tikT = 0;
  /** Early/late hint for the last judged tap (Arcaea): signed offset and seconds left to show. */
  private hintOff = 0;
  private hintT = 0;
  private goldView = new Graphics();
  private goldFx = new Graphics();
  private btnCache = new Map<Button, string>();

  // ui widgets
  private status = new PixelText('');
  private statusR = new PixelText('');
  private depthText = new PixelText('');
  private hintText = new PixelText('', C.inkDim);
  private downBtn!: Button;
  private upBtn!: Button;
  private digBtn!: Button;
  private upgBtn!: Button;
  private hireBtn!: Button;
  private drumBtn!: Button;
  private badge = new Graphics();

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    M.normalize(ctx.save.run, ctx.save.persistent);
    this.run = ctx.save.run as M.MinesRun;
    this.per = ctx.save.persistent as M.MinesPersistent;
    this.run.depth = Math.max(1, Math.min(this.run.depth, this.run.maxDepth));
    const precracked = this.per.precrack;
    this.groups = buildGroups(ctx, {
      onDig: () => this.onDig(),
      onDrum: () => this.onDrumBought(),
      onBuy: (id) => this.onBuy(id),
    });
    this.wall = new Wall(ctx.save, {
      earn: (b) => ctx.earn(b),
      steady: () => this.opt('steady'),
      raiseSkill: (l) => ctx.raiseSkill(l),
      rnd: rand,
      forceKind: (_t, tiles) => this.forceKind(tiles),
      onHit: (t, d, by) => this.onHit(t, d, by),
      onBreak: (t, kind, by, got, gems) => this.onBreak(t, kind, by, got, gems),
      onShell: (t, got) => this.onShell(t, got),
      onBlast: (t, auto) => this.onBlast(t, auto),
      onZap: (path, by) => this.onZap(path, by),
      onCaveIn: (ts) => this.onCaveIn(ts),
      onGas: (t) => this.onGas(t),
      onSpawn: (t) => this.onSpawn(t),
      onPlant: (t) => (this.view(t).squashT = 0.1),
      onClink: (t) => this.onClink(t),
      onFrenzy: (start) => this.onFrenzy(start),
      onFury: (start) => this.onFury(start),
      onGold: (ev) => this.onGold(ev),
      onGoldEnd: (kind) => this.onGoldEnd(kind),
    });
    this.root.addChild(
      this.bg,
      this.wallLayer,
      this.ringG,
      this.drum,
      this.gobLayer,
      this.goldFx,
      this.goldView,
      this.fxG,
      this.partLayer,
      this.ritualLayer,
      this.fist,
      this.edgeG,
      this.ui,
      this.calibLayer,
      this.hit,
    );
    this.fist.visible = false;
    this.ritualLayer.addChild(this.ritualG);
    for (let i = 0; i < M.GRID; i++) {
      const g = new Graphics();
      this.kegViews.push(g);
      this.ritualLayer.addChild(g);
    }
    this.ritualLayer.addChild(this.ritualText);
    this.ritualLayer.visible = false;
    this.calibLayer.addChild(this.calibG, this.calibText);
    this.calibLayer.visible = false;
    for (let i = 0; i < M.TILES; i++) {
      const cont = new Container();
      const body = new Graphics();
      const crack = new Graphics();
      const flash = new Graphics();
      const over = new Graphics();
      flash.visible = false;
      cont.addChild(body, crack, flash, over);
      this.wallLayer.addChild(cont);
      this.views.push({ cont, body, crack, flash, over, flashT: 0, squashT: 0, variant: (i * 7 + Math.floor(i / 5)) % 3, shownKey: '', overKey: '' });
    }
    this.buildLayout();
    this.placeTiles();
    this.shownDepth = this.run.depth;
    this.drawBackground();
    this.updateMaxDepthEver();
    // Onboarding beat 1: a rock already cracked, pulsing under the ghost finger (02 §18).
    if (!ctx.seen('ob.smash') && !ctx.save.seen.onboardingDone) {
      const t = this.wall.tiles[this.obTile];
      t.kind = 'common';
      t.maxHp = M.H(this.run.depth);
      t.hp = t.maxHp * 0.3;
    }
    // A return after an absence finds a Gold Goblin waiting (genre-research R1).
    const away = this.per.gemAt > 0 ? (Date.now() - this.per.gemAt) / 1000 : 0;
    if (away >= M.GOLD_AWAY_S && this.run.stats.rocks >= M.GOLD_ROCKS) this.wall.queueGold(3);
    this.goldView.visible = false;
    if (precracked) {
      const c = ctx.content();
      ctx.float('WALL PRE-CRACKED! CHAIN IT!', c.x + c.w / 2, this.wallY - 18, '#ffd070');
    }
    this.creditOfflineGems();
    this.showGemAway();
  }

  /** Suite settings for the Mines (index.ts `settings`): hold-to-auto-hit, Steady Drum. */
  private opt(key: 'holdAuto' | 'steady'): boolean {
    return !!this.ctx.setting<boolean>(key);
  }

  /** Touch-to-beat latency in seconds (Settings -> Goblin Mines -> Calibrate). */
  private latency(): number {
    const v = this.ctx.setting<number>('latency');
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(M.LATENCY_MAX, v)) : M.BEAT_LATENCY;
  }

  /** Settings -> Goblin Mines -> Calibrate: runs once any sheet is closed. */
  onSettingAction(key: string): void {
    if (key === 'calibrate' && this.per.drum) this.calibPending = true;
  }

  // ---------- layout ----------

  private buildLayout(): void {
    const c = this.ctx.content();
    this.T = c.w >= 172 ? 32 : Math.max(24, Math.floor((c.w - 12) / 5));
    this.s = this.T - 2;
    this.k = this.T / U;
    const wallW = this.T * M.GRID;
    this.wallX = c.x + Math.floor((c.w - wallW) / 2);
    const btnY = c.y + c.h - 4 - 21;
    const depthY = btnY - 5 - 16;
    this.statusY = depthY - 4 - 7;
    this.wallY = Math.max(c.y + 30, this.statusY - 5 - wallW);
    this.ledgeY = this.wallY - 4;

    // UI
    const x0 = c.x + 4;
    const right = c.x + c.w - 4;
    this.btnCache.clear();
    this.ui.removeChildren().forEach((ch) => {
      if (ch !== this.uiG && ch !== this.status && ch !== this.statusR && ch !== this.depthText && ch !== this.hintText && ch !== this.badge) destroyTree(ch);
    });
    this.ui.addChild(this.uiG, this.status, this.statusR, this.depthText, this.hintText);
    this.status.position.set(x0, this.statusY);

    const mk = (o: ConstructorParameters<typeof Button>[0], x: number, y: number) => {
      const b = new Button(o);
      b.position.set(x, y);
      this.ui.addChild(b);
      return b;
    };
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    // The manager strip docks over the HUD rows at the top (02 §18), far from this row, so the
    // lever keeps the thumb-friendly left edge.
    this.downBtn = mk({ w: 15, h: 15, label: '{darr}', ...dark, onTap: () => this.setDepth(this.run.depth - 1) }, x0, depthY);
    this.depthText.position.set(x0 + 19, depthY + 5);
    this.upBtn = mk({ w: 15, h: 15, label: '{uarr}', ...dark, onTap: () => this.setDepth(this.run.depth + 1) }, x0 + 67, depthY);
    this.hintText.position.set(x0 + 86, depthY + 5);
    const digW = 50;
    // U-11: 19 px tall (rising 4 px into the gap under the status line) so its two-line label
    // clears the button's top highlight.
    this.digBtn = mk({ w: digW, h: 19, label: 'DIG', color: C.gold, shade: 0x9a7a20, onTap: () => this.buyDig() }, right - digW, depthY - 4);

    const total = right - x0;
    const drumW = this.per.drum ? 36 : 0;
    const gap = 3;
    const upgW = Math.floor((total - drumW - gap * (drumW ? 2 : 1)) * 0.55);
    const hireW = total - drumW - upgW - gap * (drumW ? 2 : 1);
    this.upgBtn = mk({ w: upgW, h: 20, label: 'UPGRADES', onTap: () => {
          this.ctx.markSeen('m.sheet');
          this.ctx.openUpgrades(this.groups);
        },
      }, x0, btnY);
    this.hireBtn = mk({ w: hireW, h: 20, label: 'HIRE', sub: '', color: 0x5a9ad8, shade: 0x2a5a8a, onTap: () => this.quickHire() }, x0 + upgW + gap, btnY);
    this.drumBtn = mk(
      { w: Math.max(1, drumW), h: 20, label: 'DRUM', sub: 'ON', color: 0xc05a3a, shade: 0x7a2a1a, textColor: C.ink, onTap: () => this.toggleDrum() },
      right - drumW,
      btnY,
    );
    this.drumBtn.visible = this.per.drum;
    this.badge.position.set(x0 + upgW - 7, btnY - 3);
    this.ui.addChild(this.badge);

    // Hit area over the wall.
    this.hit.removeAllListeners();
    this.hit.eventMode = 'static';
    this.hit.hitArea = new Rectangle(this.wallX, this.wallY, wallW, wallW);
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.hit.on('pointerup', (e: FederatedPointerEvent) => this.pointers.delete(e.pointerId));
    this.hit.on('pointerupoutside', (e: FederatedPointerEvent) => this.pointers.delete(e.pointerId));

    // Drum and drummers on the ledge.
    const cx = this.wallX + Math.floor(wallW / 2);
    this.drum.position.set(cx, this.ledgeY);
    this.drummers.forEach((d) => d.destroy());
    this.drummers = [];
    for (let i = 0; i < M.DRUMMERS_MAX; i++) {
      const g = new Graphics(drummerArt(0));
      const side = i % 2 === 0 ? -1 : 1;
      const kk = Math.floor(i / 2);
      g.position.set(cx + side * (20 + kk * 14), this.ledgeY);
      if (side > 0) g.scale.x = -1;
      g.visible = false;
      this.drummers.push(g);
      this.root.addChildAt(g, this.root.getChildIndex(this.drum));
    }
    this.torches.forEach((t) => t.destroy());
    this.torches = [];
    for (const tx of [this.wallX - 1, this.wallX + wallW + 1]) {
      const t = new Graphics(torchArt(0, false));
      t.position.set(tx, this.ledgeY - 6);
      this.torches.push(t);
      this.root.addChildAt(t, this.root.getChildIndex(this.drum));
    }
  }

  private placeTiles(): void {
    for (const t of this.wall.tiles) {
      const v = this.views[t.i];
      v.cont.position.set(this.tx(t) + 1, this.ty(t) + 1);
      v.shownKey = '';
      v.overKey = '';
    }
  }

  private tx(t: Tile): number {
    return this.wallX + t.col * this.T;
  }
  private ty(t: Tile): number {
    return this.wallY + t.row * this.T;
  }
  private view(t: Tile): TileView {
    return this.views[t.i];
  }

  private drawBackground(): void {
    const c = this.ctx.content();
    const L = this.ctx.layout;
    const st = M.stratumOf(this.run.depth);
    const pal = STRATA_PAL[st];
    const g = this.bg.clear();
    g.rect(0, c.y, L.w, L.h - c.y).fill(pal.bg);
    // Cave texture: deterministic blotches.
    let seed = 1234 + st * 77;
    const r = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 70; i++) {
      const w = 3 + Math.floor(r() * 10);
      g.rect(Math.floor(r() * L.w), c.y + Math.floor(r() * c.h), w, 1 + Math.floor(r() * 3)).fill(pal.bgDark);
    }
    for (let i = 0; i < 25; i++) g.rect(Math.floor(r() * L.w), c.y + Math.floor(r() * c.h), 2, 1).fill(pal.dark);
    // Stalactites along the top.
    for (let x = 0; x < L.w; x += 7 + Math.floor(r() * 9)) {
      const h = 3 + Math.floor(r() * 9);
      for (let kk = 0; kk < h; kk++) {
        const w = Math.max(1, Math.round(4 * (1 - kk / h)));
        g.rect(x + Math.floor((4 - w) / 2), c.y + kk, w, 1).fill(pal.bgDark);
      }
    }
    this.drawScenery(g, r, pal);
    // Wall frame: sockets, posts, the ledge beam and the sill.
    const W = this.T * M.GRID;
    g.rect(this.wallX - 3, this.wallY - 3, W + 6, W + 6).fill(OUTLINE);
    g.rect(this.wallX - 2, this.wallY - 2, W + 4, W + 4).fill(pal.bgDark);
    for (const t of this.wall.tiles) {
      g.rect(this.tx(t) + 3, this.ty(t) + 3, this.T - 6, this.T - 6).fill(0x08040a);
      g.rect(this.tx(t) + 4, this.ty(t) + this.T - 5, this.T - 8, 1).fill(pal.bg);
    }
    const wood = 0x6a4428;
    const woodL = 0x8a5a34;
    const woodD = 0x3e2614;
    const postW = 4;
    for (const px of [this.wallX - 3 - postW, this.wallX + W + 3]) {
      if (px < c.x - 2 || px + postW > c.x + c.w + 2) continue;
      g.rect(px, this.ledgeY, postW, W + 10).fill(woodD);
      g.rect(px + 1, this.ledgeY, postW - 2, W + 10).fill(wood);
      g.rect(px + 1, this.ledgeY, 1, W + 10).fill(woodL);
    }
    const beamX = Math.max(c.x, this.wallX - 10);
    const beamW = Math.min(c.x + c.w, this.wallX + W + 10) - beamX;
    g.rect(beamX, this.ledgeY - 1, beamW, 5).fill(woodD);
    g.rect(beamX, this.ledgeY, beamW, 3).fill(wood);
    g.rect(beamX, this.ledgeY, beamW, 1).fill(woodL);
    g.rect(beamX, this.wallY + W + 2, beamW, 3).fill(woodD);
    g.rect(beamX, this.wallY + W + 2, beamW, 1).fill(wood);
    // Bottom control strip.
    const stripY = this.statusY - 3;
    g.rect(0, stripY, L.w, L.h - stripY).fill(0x1c1028);
    g.rect(0, stripY, L.w, 1).fill(OUTLINE);
  }

  /** Fills the cave above the wall: ore seams, hanging lanterns, a rail with a mine cart. */
  private drawScenery(g: Graphics, r: () => number, pal: (typeof STRATA_PAL)[number]): void {
    const c = this.ctx.content();
    const L = this.ctx.layout;
    const top = c.y + 14;
    const bottom = this.ledgeY - 38;
    const zone = bottom - top;
    if (zone < 20) return;
    // Ore seams and crystals embedded in the cave wall.
    for (let i = 0; i < Math.floor(zone / 14); i++) {
      const x = 4 + Math.floor(r() * (L.w - 12));
      const y = top + Math.floor(r() * zone);
      const crystal = r() < 0.35;
      if (crystal) {
        g.rect(x, y + 2, 2, 4).fill(pal.speck);
        g.rect(x + 2, y, 2, 6).fill(pal.light);
        g.rect(x + 4, y + 3, 2, 3).fill(pal.speck);
        g.rect(x + 2, y, 1, 1).fill(0xffffff);
      } else {
        g.rect(x, y, 6, 1).fill(pal.dark);
        g.rect(x + 2, y - 1, 2, 1).fill(GOLD_DIM);
        g.rect(x + 5, y + 1, 1, 1).fill(GOLD_DIM);
      }
    }
    // Hanging lanterns on chains.
    for (const fx of [0.22, 0.78]) {
      const x = Math.round(c.x + c.w * fx);
      const len = Math.min(zone - 6, 18 + Math.floor(zone * 0.25));
      for (let y = c.y; y < c.y + len; y += 3) g.rect(x, y, 1, 2).fill(0x4a4450);
      const ly = c.y + len;
      g.rect(x - 3, ly, 7, 9).fill(OUTLINE);
      g.rect(x - 2, ly + 1, 5, 7).fill(0x3a3440);
      g.rect(x - 1, ly + 2, 3, 5).fill(0xf0a030);
      g.rect(x, ly + 3, 1, 2).fill(0xfff0a0);
      g.circle(x, ly + 4, 14).fill({ color: 0xf0a030, alpha: 0.06 });
      g.circle(x, ly + 4, 8).fill({ color: 0xf0a030, alpha: 0.08 });
    }
    // Rail and mine cart at the bottom of the open cave, just above the drum ledge.
    if (zone > 50) {
      const ry = bottom + 8;
      g.rect(0, ry, L.w, 1).fill(0x5a5460);
      g.rect(0, ry + 1, L.w, 1).fill(0x2a2430);
      for (let x = 2; x < L.w; x += 8) g.rect(x, ry + 2, 4, 2).fill(0x4a3020);
      const cx = c.x + 10;
      const cy = ry - 12;
      g.rect(cx, cy, 26, 11).fill(OUTLINE);
      g.rect(cx + 1, cy + 1, 24, 9).fill(0x5a5460);
      g.rect(cx + 1, cy + 1, 24, 1).fill(0x8a8494);
      g.rect(cx + 3, cy + 4, 20, 1).fill(0x3a3440);
      for (const [nx, ny] of [[4, -3], [9, -4], [14, -3], [18, -2], [7, -1], [12, -1]]) {
        g.rect(cx + nx, cy + ny, 3, 3).fill(GOLD);
        g.rect(cx + nx, cy + ny, 1, 1).fill(0xfff0a0);
      }
      g.rect(cx + 4, cy + 10, 4, 3).fill(OUTLINE);
      g.rect(cx + 18, cy + 10, 4, 3).fill(OUTLINE);
    }
  }

  // ---------- wall events (juice) ----------

  private vol(): number {
    return this.ctx.game.save.meta.settings.sfx ?? 0.6;
  }

  private forceKind(tiles: readonly Tile[]): M.RockKind | null {
    // Onboarding beat 4: once a goblin is hired, make sure a vein shows up to teach "shiny first".
    // P-02: the Wall calls this from its own constructor (before this.wall is set), so it passes
    // its tiles in.
    if (this.ctx.seen('ob.hire') && !this.ctx.seen('ob.vein') && !tiles.some((o) => o.kind === 'vein' || o.next === 'vein')) return 'vein';
    return null;
  }

  private onHit(t: Tile, _dmg: number, _by: By): void {
    const v = this.view(t);
    v.flashT = 0.05;
    v.squashT = 0.06;
  }

  private onBreak(t: Tile, kind: M.RockKind, by: By, got: number, gems: number): void {
    const cx = this.tx(t) + this.T / 2;
    const cy = this.ty(t) + this.T / 2;
    const pal = STRATA_PAL[M.stratumOf(this.run.depth)];
    this.view(t).flashT = 0;
    if (kind === 'rubble') {
      this.burst(cx, cy, 4, 0x6a6a74);
      this.ctx.markSeen('m.raked');
      return;
    }
    if (kind === 'bedrock') {
      this.burst(cx, cy, 10, 0x4a4458);
      if (gems) {
        this.ctx.float(`+${gems}{gem}`, cx, cy - 10, '#d090ff');
        sfx.gem(this.vol());
        this.ctx.saveSoon();
      } else this.ctx.float('CRACK!', cx, cy - 10, '#8a8494');
      return;
    }
    const big = kind === 'vein' || kind === 'mother';
    this.ctx.float(`+${formatNum(got, this.notation())}`, cx, cy - (big ? 8 : 6), big ? '#ffe060' : by === 'gob' ? '#c8a050' : '#e8c04a');
    if (kind === 'vein' && rand() < 0.2) this.ctx.say('vein');
    if (kind === 'mother') {
      this.ctx.float(`+${M.MOTHER_INGOTS}{ingot} MOTHERLODE!`, cx, cy - 18, '#ffe060');
      this.shake(3, 0.2);
      this.ctx.haptic(30);
      this.ctx.say('mother', { type: 'mechanic_unlocked', key: 'mother' });
      for (const gv of this.gobViews) gv.cheer = 1;
    }
    if (gems) {
      this.ctx.float(`+${gems}{gem}`, cx, cy - 16, '#d090ff');
      this.ctx.say('gem');
      sfx.gem(this.vol());
      this.ctx.saveSoon();
    }
    this.burst(cx, cy, by === 'gob' ? 6 : big ? 14 : 10, kind === 'mother' ? GOLD : kind === 'soft' ? 0xd8c8a0 : pal.chip);
    this.nuggets(cx, cy, (kind === 'mother' ? 10 : kind === 'vein' ? 5 : 2) * (this.wall.rushT > 0 ? 2 : 1));
    if (by === 'tap') {
      this.shake(1, 0.06);
      this.ctx.haptic(8);
      this.hitStop = Math.max(this.hitStop, big ? 0.06 : BREAK_STOP);
      sfx.break(this.vol(), kind, this.wall.chainN);
      const ch = this.wall.chainN;
      if (ch >= 2) this.ctx.float(`CHAIN X${M.chainMult(ch).toFixed(1)}`, cx, cy + 8, ch >= M.CHAIN_STEPS ? '#ff9a30' : '#ffd070');
    } else if (by === 'gob') {
      // Quiet ticks from the crew (at most ~5 a second), so an idle wall is never silent.
      if (this.tikT <= 0) {
        this.tikT = 0.2;
        sfx.tik(this.vol(), big);
      }
    } else {
      this.shake(1, 0.06);
      sfx.break(this.vol(), kind);
    }
  }

  private onShell(t: Tile, got: number): void {
    const cx = this.tx(t) + this.T / 2;
    const cy = this.ty(t) + this.T / 2;
    this.burst(cx, cy, 8, STRATA_PAL[M.stratumOf(this.run.depth)].speck);
    this.ctx.float(`+${formatNum(got, this.notation())}`, cx, cy - 6, '#c8a050');
    this.view(t).squashT = 0.1;
  }

  private onBlast(t: Tile, auto: boolean): void {
    const cx = this.tx(t) + this.T / 2;
    const cy = this.ty(t) + this.T / 2;
    this.pushFx({ kind: 'blast', t: 0, max: 0.25, x: this.tx(t) - this.T, y: this.ty(t) - this.T, w: this.T * 3 });
    this.burst(cx, cy, 16, 0xff9a30);
    this.shake(3, 0.18);
    this.ctx.haptic(35);
    sfx.blast(this.vol());
    for (const g of this.gobViews) g.cheer = 0.8;
    if (auto && !this.ctx.seen('m.kegLit') && !this.ctx.seen('m.kegAuto')) {
      this.ctx.markSeen('m.kegAuto');
      this.ctx.say('kegAuto', { type: 'hazard_first', key: 'kegAuto' });
    }
  }

  private onZap(path: number[], by: 'tap' | 'shock' | 'thunder'): void {
    const pts: number[] = [];
    for (const i of path) {
      const t = this.wall.tiles[i];
      pts.push(this.tx(t) + this.T / 2, this.ty(t) + this.T / 2);
      if (i !== path[0]) this.view(t).flashT = 0.08;
    }
    this.pushFx({ kind: 'zap', t: 0, max: by === 'thunder' ? 0.25 : 0.15, pts, color: by === 'thunder' ? 0xffe060 : 0x7af0ff });
    sfx.zap(this.vol());
  }

  private onCaveIn(ts: Tile[]): void {
    for (const t of ts) {
      this.view(t).squashT = 0.1;
      this.burst(this.tx(t) + this.T / 2, this.ty(t) + 4, 3, 0x6a6a74);
    }
    this.shake(3, 0.25);
    this.ctx.haptic(30);
    // hazard_first (02 §18): the rake micro-lesson lands while the Rubble is still there (R4-13).
    if (!this.ctx.seen('m.caveIn')) {
      this.ctx.markSeen('m.caveIn');
      if (!this.ctx.lesson('caveIn')) this.ctx.say('caveIn', { type: 'hazard_first', key: 'caveIn' });
    }
  }

  private onGas(t: Tile): void {
    this.burst(this.tx(t) + this.T / 2, this.ty(t) + this.T / 2, 6, 0x9ad050);
    if (!this.ctx.seen('m.gas')) {
      this.ctx.markSeen('m.gas');
      if (!this.ctx.lesson('gas')) this.ctx.say('gas', { type: 'hazard_first', key: 'gas' });
    }
  }

  private onSpawn(t: Tile): void {
    const v = this.view(t);
    v.squashT = 0.08;
    v.variant = Math.floor(rand() * 3);
    if (t.kind === 'keg' && this.ctx.seen('ob.smash') && !this.ctx.seen('m.kegLesson')) {
      this.ctx.markSeen('m.kegLesson');
      this.ctx.lesson('keg');
    }
    if (t.kind === 'bedrock' && !this.ctx.seen('m.bedrock')) {
      this.ctx.markSeen('m.bedrock');
      this.ctx.say('bedrock', { type: 'hazard_first', key: 'bedrock' });
    }
  }

  private onClink(t: Tile): void {
    sfx.clink(this.vol());
    this.view(t).squashT = 0.04;
    this.ctx.float('CLINK', this.tx(t) + this.T / 2, this.ty(t) + 4, '#8a8494');
  }

  private onFury(start: boolean): void {
    const c = this.ctx.content();
    if (start) {
      this.ctx.game.juice.shake(1);
      this.ctx.haptic(30);
      sfx.fury(this.vol());
      this.ctx.float('FURY! X2', c.x + c.w / 2, this.wallY + 30, '#ff4030');
      for (const gv of this.gobViews) gv.cheer = 0.6;
      if (!this.ctx.seen('m.fury')) {
        this.ctx.markSeen('m.fury');
        this.ctx.say('fury');
      }
    }
  }

  private onGold(ev: 'spawn' | 'escape'): void {
    const g = this.wall.gold;
    if (ev === 'spawn') {
      sfx.goldIn(this.vol());
      if (g) this.goldSparkle(g.x, g.y, 6);
      if (!this.ctx.seen('m.gold')) {
        this.ctx.markSeen('m.gold');
        this.ctx.say('gold');
      }
    } else {
      sfx.goldEscape(this.vol());
      this.goldView.visible = false;
    }
  }

  private onGoldEnd(kind: 'rush' | 'fist'): void {
    const c = this.ctx.content();
    this.ctx.float(kind === 'rush' ? 'GOLD RUSH OVER' : 'FIST FADES', c.x + c.w / 2, this.wallY + 40, '#c8a050');
  }

  /** Sparkles around the Gold Goblin (wall units). */
  private goldSparkle(wx: number, wy: number, n: number): void {
    const x = this.wallX + wx * this.k;
    const y = this.wallY + wy * this.k;
    for (let i = 0; i < n; i++) this.spawnPart(x + (rand() - 0.5) * 14, y + (rand() - 0.5) * 14, i % 2 ? 0xfff0a0 : GOLD, 1, (rand() - 0.5) * 30, -20 - rand() * 30, 0.5, 40);
  }

  /** Taps the Gold Goblin if the point is on him; true when caught. */
  private tryGold(px: number, py: number): boolean {
    const g = this.wall.gold;
    if (!g) return false;
    const gx = this.wallX + g.x * this.k;
    const gy = this.wallY + g.y * this.k;
    if (Math.abs(px - gx) > GOLD_HIT || Math.abs(py - gy) > GOLD_HIT) return false;
    const res = this.wall.catchGold();
    if (!res) return false;
    this.goldView.visible = false;
    const v = this.vol();
    const c = this.ctx.content();
    const big = res.kind !== 'sack';
    sfx.goldCatch(v, big);
    this.ctx.haptic(big ? 50 : 30);
    this.goldSparkle(res.x, res.y, 16);
    for (const gv of this.gobViews) gv.cheer = 1;
    const mid = c.x + c.w / 2;
    const ty = this.wallY + 34;
    // The shared juice kit (ui/juice.ts): a boss-stop, a tiered pop and coins to the bank.
    const j = this.ctx.game.juice;
    j.hitStop(big ? 100 : 70);
    j.shake(big ? 2 : 1);
    j.flash(this.wallX, this.wallY, this.T * M.GRID, this.T * M.GRID, res.kind === 'fist' ? 0xffffff : 0xffe060, 0.3, 0.35);
    if (res.kind === 'sack') {
      j.pop('LUCKY SACK!', mid, ty - 12, { tier: 1, color: '#ffe060' });
      j.popValue(res.got, mid, ty, { prefix: '+', tier: 2 });
      j.coinFly(gx, gy, 8);
    } else if (res.kind === 'rush') j.pop(`GOLD RUSH X${M.GOLD_RUSH_MULT}!`, mid, ty, { tier: 2, color: '#ffe060' });
    else if (res.kind === 'fist') j.pop(`OVERLORD'S FIST X${M.GOLD_FIST_MULT}!`, mid, ty, { tier: 2, color: '#ff6040' });
    else {
      j.pop(`GEM POUCH +${res.gems}{gem}`, mid, ty, { tier: 2, color: '#d090ff' });
      sfx.gem(v);
    }
    if (rand() < 0.5) this.ctx.say('goldCaught');
    this.ctx.saveSoon();
    return true;
  }

  private onFrenzy(start: boolean): void {
    if (start) {
      this.shake(2, 0.2);
      this.ctx.haptic(40);
      const c = this.ctx.content();
      this.ctx.float('FRENZY!', c.x + c.w / 2, this.wallY + 40, '#ff6040');
    } else if (!this.ctx.seen('m.firstFrenzy')) {
      // Written in the past tense: it lands once the Frenzy has calmed (00 §5.4.4).
      this.ctx.markSeen('m.firstFrenzy');
      this.ctx.say('firstFrenzy', { type: 'mechanic_unlocked', key: 'frenzy' });
    }
  }

  // ---------- input ----------

  private tileAt(gx: number, gy: number): number {
    const lx = gx - this.wallX;
    const ly = gy - this.wallY;
    if (lx < 0 || ly < 0) return -1;
    const col = Math.floor(lx / this.T);
    const row = Math.floor(ly / this.T);
    if (col >= M.GRID || row >= M.GRID) return -1;
    return row * M.GRID + col;
  }

  private onDown(e: FederatedPointerEvent): void {
    const p = this.root.toLocal(e.global);
    const ti = this.tileAt(p.x, p.y);
    this.pointers.set(e.pointerId, { tile: ti, raked: 0, hold: 0, auto: 0 });
    if (ti < 0) return;
    if (this.calib) {
      this.calibTap();
      return;
    }
    if (this.ritual && this.ritual.lit < 0 && this.ritual.kegs.includes(ti)) {
      this.lightRitual(this.ritual.kegs.indexOf(ti));
      return;
    }
    if (this.tryGold(p.x, p.y)) {
      // A catch is not a rock tap: no hold auto-hits from this finger.
      this.pointers.delete(e.pointerId);
      return;
    }
    this.playerTap(ti, p.x, p.y, false);
  }

  private onMove(e: FederatedPointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr || this.calib) return;
    const p = this.root.toLocal(e.global);
    const ti = this.tileAt(p.x, p.y);
    if (ti < 0 || ti === ptr.tile) return;
    ptr.tile = ti;
    ptr.hold = 0;
    if (ptr.raked >= RAKE_MAX) return;
    ptr.raked++;
    const t = this.wall.tiles[ti];
    if (this.wall.rake(ti)) {
      this.chips(this.tx(t) + this.T / 2, this.ty(t) + this.T / 2, 2);
      this.view(t).squashT = 0.04;
    }
  }

  private drumActive(): boolean {
    return this.per.drum && this.per.drumOn;
  }

  /** Seconds on the beat clock right now, including time since the last frame. */
  private beatNow(): number {
    return this.wall.clock + (performance.now() - this.frameWall) / 1000;
  }

  /** One player hit on tile ti: a tap (judged by the drum) or a hold auto-hit (never judged). */
  private playerTap(ti: number, px: number, py: number, auto: boolean): void {
    const now = performance.now();
    while (this.tapTimes.length && now - this.tapTimes[0] >= 1000) this.tapTimes.shift();
    if (this.tapTimes.length >= HARD_CAP) return;
    this.tapTimes.push(now);
    let beat = null;
    if (this.drumActive() && !auto) {
      const p = this.wall.period;
      const tb = this.beatNow() - this.latency();
      const k = Math.round(tb / p);
      const off = tb - k * p;
      const w = this.wall.window;
      beat = { k, inWindow: Math.abs(off) <= w, perfect: Math.abs(off) <= w * M.PERFECT_FRAC };
      if (k !== this.wall.lastJudged) {
        this.autoCalibrate(off, p);
        this.hintOff = off;
        this.hintT = 0.6;
      }
    }
    const t = this.wall.tiles[ti];
    const kind = t.kind;
    if (t.gas > 0) this.ctx.markSeen('m.wafted');
    const res = this.wall.tap(ti, beat, { auto });
    if (kind === 'keg' && res.hit) this.ctx.markSeen('m.kegLit');
    if (!res.hit) return;
    this.showFist(px, py, res.crit);
    const v = this.vol();
    const cx = this.tx(t) + this.T / 2;
    if (res.crit) {
      this.hitStop = 0.05;
      this.shake(2, 0.08);
      this.ctx.haptic(15);
      this.ctx.float('CRUNCH!', cx, this.ty(t) - 2, '#ffe060');
      sfx.crunch(v);
    } else sfx.tock(v, kind);
    if (res.beatHit) {
      this.lastBeatHitK = beat!.k;
      const st = this.wall.streak;
      const tag = res.perfect ? 'PERFECT' : 'GOOD';
      this.ctx.float(st > 1 ? `${tag} X${st}` : tag, cx + 6, this.ty(t) + 2, res.perfect ? '#ffe060' : '#c8a050');
      sfx.beatHit(v, st, res.perfect);
      if (res.thunder) this.ctx.float('THUNDER!', cx, this.ty(t) - 10, '#ffe060');
    } else if (!res.judged && beat && beat.k === this.lastBeatHitK) {
      // A follow-up after a boom: a plain chip, nothing lost (drum lesson beat 3, "BOOM-ta-ta").
      this.ctx.markSeen('m.followup');
    }
    if (kind !== 'keg' && kind !== 'rubble') this.chips(px, py, res.crit ? 6 : 3);
  }

  /** Silent auto-calibration (Rhythm Quest / Rhythm Doctor, genre-research R4): a running median
   * of the signed offsets of the last 16 judged taps nudges the latency by 25% of it. Offsets more
   * than 35% of a beat away are ignored (that is a free tap, not an attempt at the beat). Saved to
   * the suite setting every 8 judged taps. */
  private autoCalibrate(off: number, period: number): void {
    if (Math.abs(off) > period * 0.35) return;
    this.autoCal.push(off);
    if (this.autoCal.length > M.AUTO_CAL_N) this.autoCal.shift();
    if (this.autoCal.length < 8) return;
    const sorted = [...this.autoCal].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    if (Math.abs(med) < 0.008) return;
    const lat = Math.max(0, Math.min(M.LATENCY_MAX, this.latency() + med * M.AUTO_CAL_RATE));
    // Shift the stored offsets too, so one median isn't applied again and again.
    for (let i = 0; i < this.autoCal.length; i++) this.autoCal[i] -= med * M.AUTO_CAL_RATE;
    if (++this.autoCalN % 8 === 0 || Math.abs(lat - this.latency()) > 0.004) this.ctx.setSetting('latency', lat);
  }

  /** The Gold Goblin's sprite: scampering, glinting, blinking in his last 2 s. */
  private renderGold(): void {
    const g = this.wall.gold;
    const fx = this.goldFx.clear();
    if (!g) {
      this.goldView.visible = false;
      return;
    }
    const frame = Math.floor(this.time * 8) % 2;
    const art = goldGoblinArt(frame, Math.floor(this.time * 4) % 3 === 0);
    if (this.goldView.context !== art) this.goldView.context = art;
    const x = Math.round(this.wallX + g.x * this.k);
    const hopLift = Math.round(Math.sin(Math.min(1, g.hopT / M.GOLD_HOP) * Math.PI) * 4);
    const y = Math.round(this.wallY + g.y * this.k) - hopLift;
    this.goldView.position.set(x, y);
    this.goldView.scale.x = g.face;
    this.goldView.visible = g.life > 2 || Math.floor(this.time * 10) % 2 === 0;
    // A soft halo so he reads against busy rocks.
    fx.circle(x, y, 10).fill({ color: 0xffe060, alpha: 0.18 + 0.08 * Math.sin(this.time * 10) });
    if (rand() < 0.25) this.goldSparkle(g.x, g.y, 1);
  }

  // ---------- particles ----------

  private spawnPart(x: number, y: number, color: number, size: number, vx: number, vy: number, life: number, grav: number, home = false): void {
    if (this.parts.length >= this.maxParts) {
      const old = this.parts.shift()!;
      old.s.visible = false;
      this.pool.push(old.s);
    }
    let s = this.pool.pop();
    if (!s) {
      s = new Sprite(Texture.WHITE);
      this.partLayer.addChild(s);
    }
    s.visible = true;
    s.tint = color;
    s.width = size;
    s.height = size;
    s.alpha = 1;
    this.parts.push({ s, x, y, vx, vy, life, grav, home });
  }

  private chips(x: number, y: number, n: number): void {
    const pal = STRATA_PAL[M.stratumOf(this.run.depth)];
    for (let i = 0; i < n; i++) this.spawnPart(x, y, i % 2 ? pal.light : pal.chip, 1 + (i % 2), (rand() - 0.5) * 70, -30 - rand() * 50, 0.35 + rand() * 0.2, 260);
  }

  private burst(x: number, y: number, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const v = 30 + rand() * 70;
      this.spawnPart(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 12, i % 3 === 0 ? 0x2a1a20 : color, 2 + (i % 2), Math.cos(a) * v, Math.sin(a) * v - 40, 0.5 + rand() * 0.3, 300);
    }
  }

  private nuggets(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) this.spawnPart(x, y, i % 2 ? GOLD : 0xfff0a0, 2, (rand() - 0.5) * 60, -60 - rand() * 40, 0.8, 0, true);
  }

  private updateParticles(dt: number): void {
    const L = this.ctx.layout;
    const tx = L.safe.l + 30;
    const ty = L.safe.t + 6;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.home) {
        // Arc toward the HUD bank counter.
        const kk = Math.min(1, dt * 5);
        p.vx += (tx - p.x) * kk * 2.2;
        p.vy += (ty - p.y) * kk * 2.2;
        p.vx *= 0.9;
        p.vy *= 0.9;
        if (p.y < L.safe.t + 20) p.life = 0;
      } else p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.pool.push(p.s);
        this.parts.splice(i, 1);
        continue;
      }
      p.s.position.set(Math.round(p.x), Math.round(p.y));
      if (p.life < 0.15) p.s.alpha = p.life / 0.15;
    }
  }

  private pushFx(f: Fx): void {
    if (this.fx.length >= MAX_FX) this.fx.shift();
    this.fx.push(f);
  }

  private showFist(x: number, y: number, heavy: boolean): void {
    this.fist.context = gauntletArt(heavy, Math.floor(this.run.tap / 25));
    this.fist.visible = true;
    this.fist.position.set(Math.round(x), Math.round(y - 6));
    this.fistT = heavy ? 0.14 : 0.09;
  }

  private shake(mag: number, t: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // ---------- upgrades and controls ----------

  private notation() {
    return this.ctx.game.save.meta.settings.notation;
  }

  private setDepth(d: number): void {
    const nd = Math.max(1, Math.min(this.run.maxDepth, d));
    if (nd === this.run.depth) return;
    this.run.depth = nd;
  }

  private entry(id: string) {
    for (const g of this.groups) for (const e of g.entries) if (e.id === id) return e;
    return null;
  }

  private buyDig(): void {
    const e = this.entry('dig');
    if (!e) return;
    // The quick DIG button always opens one depth, whatever the sheet's buy mode.
    const cost = M.digCost(this.run.maxDepth);
    if (this.run.maxDepth >= M.MAX_DEPTH || !this.ctx.spend(cost)) return;
    this.run.maxDepth++;
    this.run.depth = this.run.maxDepth;
    this.onDig();
    this.ctx.saveSoon();
  }

  /** Goblins on the wall, Bone Miners included (they take crew slots). */
  private crewNow(): number {
    return M.crewSize(this.run, this.ctx.save.imports?.bones ?? 0);
  }

  private quickHire(): void {
    const r = this.run;
    if (this.crewNow() < M.MAX_GOBLINS) {
      if (!this.ctx.spend(M.hireCost(r))) return;
      r.grunts++;
      this.onBuy('hire');
    } else if (r.picks < M.PICKS_MAX) {
      if (!this.ctx.spend(M.picksCost(r.picks))) return;
      r.picks++;
    } else return;
    this.ctx.saveSoon();
  }

  private toggleDrum(): void {
    this.per.drumOn = !this.per.drumOn;
    this.wall.streak = 0;
    this.ctx.saveSoon();
  }

  private onBuy(id: string): void {
    const r = this.run;
    if (id === 'critC') this.ctx.say('critBuy', { type: 'first_upgrade', key: 'critC' });
    else if (id === 'chain') this.ctx.lesson('chain');
    else if (id === 'hire' || id === 'sapper' || id === 'shocker' || id === 'prospector') {
      const n = M.goblins(r);
      if (n >= 1) this.ctx.say('firstGoblin', { type: 'first_helper', key: 'g1' });
      if (n >= 4) this.ctx.say('fourGoblins', { type: 'first_helper', key: 'g4' });
      if (id === 'shocker') this.ctx.say('shocker', { type: 'first_helper', key: 'shocker' });
      if (id === 'prospector') this.ctx.say('prospector', { type: 'first_helper', key: 'prospector' });
    } else if (id === 'drummers') this.ctx.say('drummer', { type: 'first_helper', key: 'drummer' });
  }

  private onDig(): void {
    const before = this.ctx.save.lifetime.best.maxDepth ?? 1;
    this.updateMaxDepthEver();
    const ever = this.ctx.save.lifetime.best.maxDepth ?? 1;
    if (ever <= before) return; // re-buying a depth after a Fall is silent (R4-09)
    for (let d = before + 1; d <= ever; d++) {
      // Stratum entries belong to tier_reached; the mid-stratum depths 5, 15, 25... to dial_raised.
      if (d > 1 && (d - 1) % 10 === 0) {
        const st = M.stratumOf(d);
        this.ctx.say('stratum', { type: 'tier_reached', key: `st${st}`, vars: { name: M.STRATA[st] } });
      } else if (d % 10 === 5) this.ctx.say('dialRaised', { type: 'dial_raised', key: `d${d}` });
    }
    if (ever >= 2 && !this.ctx.seen('m.drumWink') && !this.per.drum) {
      this.ctx.markSeen('m.drumWink');
      this.ctx.say('drumWink');
    }
  }

  private onDrumBought(): void {
    this.ctx.markSeen('m.drumBought');
    // mechanic_unlocked with a lesson runs the Doom Drum micro-lesson (02 §18).
    this.ctx.say('drum', { type: 'mechanic_unlocked', key: 'drum' });
    this.shake(3, 0.3);
    this.ctx.haptic(50);
    sfx.boom(this.vol(), 0, true);
    this.wall.clock = 0;
    this.lastBeatIdx = -1;
    this.schedBeat = -1;
    // Rebuild the controls so the DRUM toggle appears.
    this.buildLayout();
    this.drawBackground();
  }

  private updateMaxDepthEver(): void {
    const b = this.ctx.save.lifetime.best;
    b.maxDepth = Math.max(b.maxDepth ?? 1, this.run.maxDepth);
  }

  /** Offline Gems (02 §3: gemRate = rocksPerSec x gemChance) for the time since the wall was last
   * on screen, at the suite's offline factor and cap. App-closed time is credited by the core's
   * offline hook (index.ts onOffline, which moves gemAt); this covers time spent in other
   * departments with the app open. */
  private creditOfflineGems(): void {
    const p = this.per;
    const now = Date.now();
    if (p.gemAt > 0 && now > p.gemAt) {
      const root = this.ctx.game.save;
      const away = Math.min(offlineCapSeconds(root), (now - p.gemAt) / 1000);
      const g = (p.gemFrac || 0) + M.offlineGems(this.run, p, this.ctx.save.imports?.bones ?? 0, offlineFactor(root, 'mines'), away);
      const whole = Math.floor(Math.max(0, g));
      p.gemFrac = Math.max(0, g - whole);
      if (whole > 0) {
        p.gems += whole;
        p.gemsEver += whole;
        p.gemAway = (p.gemAway || 0) + whole;
        this.ctx.saveSoon();
      }
    }
    p.gemAt = now;
  }

  /** Floats the Gems credited while away (entry, or a return with the wall open). */
  private showGemAway(): void {
    const n = Math.floor(this.per.gemAway || 0);
    if (n <= 0) return;
    this.per.gemAway = 0;
    const c = this.ctx.content();
    this.ctx.float(`+${n}{gem} WHILE AWAY`, c.x + c.w / 2, this.wallY - 10, '#d090ff');
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.frameWall = performance.now();
    this.time += dt;
    // Frame-time guard: drop the particle cap when frames run long (02 §13).
    this.slowFrames = dt > 0.02 ? Math.min(60, this.slowFrames + 1) : Math.max(0, this.slowFrames - 1);
    this.maxParts = this.slowFrames > 30 ? 120 : 160;

    if (this.run.depth !== this.shownDepth) {
      const newStratum = M.stratumOf(this.run.depth) !== M.stratumOf(this.shownDepth);
      this.shownDepth = this.run.depth;
      if (newStratum) this.drawBackground();
    }

    const frozen = this.hitStop > 0;
    if (frozen) this.hitStop -= dt;
    else if (!this.calib) this.wall.step(dt);
    this.stepHolds(dt);
    this.updateGoblins(dt);
    this.updateParticles(dt);
    this.updateFx(dt);
    this.updateDrum(dt);
    this.renderTiles(dt);
    this.renderGold();
    if (this.tikT > 0) this.tikT -= dt;
    if (this.hintT > 0) this.hintT -= dt;
    this.updateRitual(dt);
    this.updateCalib(dt);
    this.updateUi();

    // Shake by offsetting the whole scene (integer px).
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = Math.round(this.shakeMag);
      this.root.position.set(Math.round((rand() * 2 - 1) * m), Math.round((rand() * 2 - 1) * m));
      if (this.shakeT <= 0) {
        this.shakeMag = 0;
        this.root.position.set(0, 0);
      }
    }
    if (this.fistT > 0) {
      this.fistT -= dt;
      this.fist.y += dt * 30;
      if (this.fistT <= 0) this.fist.visible = false;
    }

    this.slowTick += dt;
    if (this.slowTick >= 0.5) {
      this.slowTick = 0;
      this.slowChecks();
    }
  }

  /** Hold to auto-hit (02 §10): a finger resting on one rock hits it 4x a second, off-beat. */
  private stepHolds(dt: number): void {
    if (!this.opt('holdAuto') || this.calib || !this.pointers.size) return;
    for (const ptr of this.pointers.values()) {
      if (ptr.tile < 0) continue;
      ptr.hold += dt;
      if (ptr.hold < HOLD_DELAY) continue;
      ptr.auto += dt * M.HOLD_RATE;
      while (ptr.auto >= 1) {
        ptr.auto -= 1;
        const t = this.wall.tiles[ptr.tile];
        if (this.ritual && this.ritual.lit < 0 && this.ritual.kegs.includes(ptr.tile)) continue;
        this.playerTap(ptr.tile, this.tx(t) + this.T / 2 + (rand() - 0.5) * 8, this.ty(t) + this.T / 2 + (rand() - 0.5) * 8, true);
      }
    }
  }

  private updateGoblins(dt: number): void {
    const gobs = this.wall.gobs;
    while (this.gobViews.length < gobs.length) {
      const g = new Graphics(goblinArt(0, 'grunt'));
      this.gobLayer.addChild(g);
      this.gobViews.push({ g, cheer: 0, frame: 0 });
    }
    while (this.gobViews.length > gobs.length) this.gobViews.pop()!.g.destroy();
    const pick = Math.floor(this.run.picks / 10);
    const k = this.k;
    gobs.forEach((g, i) => {
      const v = this.gobViews[i];
      if (v.cheer > 0) v.cheer -= dt;
      let frame = 0;
      let lift = 0;
      if (g.hop) {
        frame = 2;
        const kk = Math.min(1, g.hop.t / g.hop.dur);
        lift = Math.sin(kk * Math.PI) * 9;
      } else if (g.tile >= 0) {
        const ph = g.swing % 0.5;
        frame = ph < 0.32 ? 0 : 1;
        if (frame === 1 && v.frame !== 1) {
          const t = this.wall.tiles[g.tile];
          this.view(t).squashT = 0.05;
          this.chips(this.tx(t) + this.T / 2 + (g.face > 0 ? -6 : 6), this.ty(t) + this.T - 8, 1);
        }
      } else frame = v.cheer > 0 ? 2 : 0;
      v.frame = frame;
      const cheer = v.cheer > 0 && !g.hop;
      const art = goblinArt(cheer ? 2 : frame, g.kind, pick);
      if (v.g.context !== art) v.g.context = art;
      v.g.tint = g.kind === 'bone' ? 0xd8d0b8 : 0xffffff;
      v.g.scale.x = g.face;
      v.g.position.set(Math.round(this.wallX + g.x * k), Math.round(this.wallY + g.y * k - lift - (cheer ? 2 : 0)));
    });
  }

  private renderTiles(dt: number): void {
    const st = M.stratumOf(this.run.depth);
    const keen = this.run.keen > 0;
    for (const t of this.wall.tiles) {
      const v = this.view(t);
      if (v.flashT > 0) v.flashT -= dt;
      if (v.squashT > 0) v.squashT -= dt;
      // Body.
      let key: string;
      let stage = 0;
      if (t.kind === null) key = t.regrow < 0.3 ? `sprout.${st}.${v.variant}` : 'empty';
      else {
        const frac = t.hp / t.maxHp;
        stage = t.kind === 'keg' || t.kind === 'rubble' || t.kind === 'bedrock' ? 0 : frac <= 0.34 ? 2 : frac <= 0.67 ? 1 : 0;
        const art = t.kind === 'hollow' && t.shell <= 1 ? 'hollowCore' : t.kind;
        key = `${art}.${st}.${v.variant}.${stage}`;
      }
      if (key !== v.shownKey) {
        v.shownKey = key;
        if (t.kind === null) {
          v.crack.visible = false;
          v.body.visible = key !== 'empty';
          if (v.body.visible) v.body.context = rockArt('sprout', st, v.variant, this.s);
        } else {
          const art: ArtKind = t.kind === 'hollow' && t.shell <= 1 ? 'hollowCore' : t.kind;
          v.body.visible = true;
          v.body.context = rockArt(art, st, v.variant, this.s);
          v.crack.visible = stage > 0;
          if (stage > 0) v.crack.context = crackArt(stage, v.variant, this.s);
          v.flash.context = flashArt(v.variant, this.s);
        }
      }
      // Flash: white on a hit; blinking for a lit or ageing keg; an orange flicker while burning.
      let flash = v.flashT > 0 && t.kind !== null;
      let tint = 0xffffff;
      let oy = v.squashT > 0 ? 1 : 0;
      if (t.kind === 'keg' && t.fuse >= 0) {
        flash = Math.floor(this.time * 16) % 2 === 0;
        oy = 0;
        if (rand() < 0.6) this.spawnPart(this.tx(t) + this.T / 2 + 1, this.ty(t) + 6, rand() < 0.5 ? 0xffe060 : 0xff6020, 1, (rand() - 0.5) * 40, -30 - rand() * 30, 0.25, 100);
      } else if (t.kind === 'keg' && t.kegAge > 6) flash = Math.floor(this.time * 8) % 2 === 0;
      else if (!flash && t.burnT > 0 && t.kind !== null && Math.floor(this.time * 10 + t.i) % 3 === 0) {
        flash = true;
        tint = 0xff7a2a;
      }
      v.flash.visible = flash;
      v.flash.tint = tint;
      v.flash.alpha = tint === 0xffffff ? 1 : 0.45;
      // Sparkles on veins and Motherlodes.
      if ((t.kind === 'vein' || t.kind === 'mother') && rand() < (t.kind === 'mother' ? 0.12 : 0.03)) {
        this.spawnPart(this.tx(t) + 6 + rand() * (this.T - 12), this.ty(t) + 6 + rand() * (this.T - 12), 0xfff0a0, 1, 0, -6, 0.4, 0);
      }
      // Overlay: a gas cloud, or Keen Eye's glint on a shiny rock about to regrow.
      let over = '';
      if (t.gas > 0) over = `gas.${Math.floor(this.time * 3) % 2}`;
      else if (keen && t.kind === null && (t.next === 'vein' || t.next === 'geode' || t.next === 'mother')) over = `glint.${Math.floor(this.time * 6) % 2}.${t.next === 'geode'}`;
      if (over !== v.overKey) {
        v.overKey = over;
        v.over.visible = !!over;
        if (over.startsWith('gas')) v.over.context = gasArt(this.s, Number(over.split('.')[1]));
        else if (over) v.over.context = glintArt(this.s, Number(over.split('.')[1]), over.endsWith('true'));
      }
      if (t.gas > 0) v.over.alpha = Math.min(1, t.gas / 2);
      else v.over.alpha = 1;
      v.cont.position.set(this.tx(t) + 1, this.ty(t) + 1 + oy);
    }
  }

  private updateFx(dt: number): void {
    const g = this.fxG.clear();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.max) {
        this.fx.splice(i, 1);
        continue;
      }
      if (f.kind === 'zap' && f.pts) {
        const pts = f.pts;
        for (let kk = 0; kk + 3 < pts.length; kk += 2) {
          // Jagged 1px polyline in a few segments.
          let x = pts[kk];
          let y = pts[kk + 1];
          const steps = 5;
          for (let s = 1; s <= steps; s++) {
            const nx = pts[kk] + ((pts[kk + 2] - pts[kk]) * s) / steps + (s < steps ? (rand() - 0.5) * 8 : 0);
            const ny = pts[kk + 1] + ((pts[kk + 3] - pts[kk + 1]) * s) / steps + (s < steps ? (rand() - 0.5) * 8 : 0);
            g.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5).lineTo(Math.round(nx) + 0.5, Math.round(ny) + 0.5);
            x = nx;
            y = ny;
          }
        }
        g.stroke({ width: 1, color: f.color ?? 0x7af0ff });
      } else if (f.kind === 'blast') {
        const kk = f.t / f.max;
        const inset = Math.round(kk * 10);
        const w = f.w! - inset * 2;
        if (w > 0) g.rect(f.x! + inset, f.y! + inset, w, w).fill({ color: kk < 0.3 ? 0xfff0a0 : 0xff8a30, alpha: 0.55 * (1 - kk) });
      }
    }
  }

  private updateDrum(dt: number): void {
    const owned = this.per.drum;
    const active = this.drumActive();
    const p = this.wall.period;
    let onBeat = false;
    if (active) {
      const kk = Math.floor(this.wall.clock / p);
      if (kk !== this.lastBeatIdx) {
        this.lastBeatIdx = kk;
        this.beatPulse = 0.12;
      }
      // Schedule the boom slightly ahead on the audio clock so it lands on the beat.
      const an = audioNow();
      const next = kk + 1;
      const toNext = next * p - this.wall.clock;
      if (an !== null && next > this.schedBeat && toNext < 0.1) {
        this.schedBeat = next;
        sfx.boom(this.vol() * 0.8, an + toNext, this.per.thunder > 0 && next % M.THUNDER_EVERY === 0);
      }
    }
    if (this.beatPulse > 0) {
      this.beatPulse -= dt;
      onBeat = true;
    }
    const skin = this.run.drumhead >= 10 ? 2 : this.run.drumhead >= 5 ? 1 : 0;
    const art = drumArt(owned, onBeat, skin);
    if (this.drum.context !== art) this.drum.context = art;
    this.drum.y = this.ledgeY + (onBeat ? 1 : 0);
    this.drummers.forEach((d, i) => {
      d.visible = owned && i < this.run.drummers;
      const a = drummerArt(onBeat ? 1 : 0);
      if (d.context !== a) d.context = a;
    });
    const big = this.wall.frenzyT > 0 || this.wall.furyT > 0;
    const tf = Math.floor(this.time * (big ? 12 : 6)) % 2;
    for (const t of this.torches) {
      const a = torchArt(tf, big);
      if (t.context !== a) t.context = a;
    }

    const g = this.ringG.clear();
    const W = this.T * M.GRID;
    if (this.wall.frenzyT > 0 || this.wall.encoreT > 0) {
      // Frenzy: a pulsing hot frame around the whole wall (Encore: a dimmer one).
      const m = onBeat ? 3 : 2;
      g.rect(this.wallX - m - 1, this.wallY - m - 1, W + 2 * m + 2, m).rect(this.wallX - m - 1, this.wallY + W + 1, W + 2 * m + 2, m);
      g.rect(this.wallX - m - 1, this.wallY - 1, m, W + 2).rect(this.wallX + W + 1, this.wallY - 1, m, W + 2);
      const hot = this.wall.frenzyT > 0;
      g.fill({ color: Math.floor(this.time * 8) % 2 ? 0xff6040 : 0xffb030, alpha: hot ? 0.9 : 0.4 });
    }
    // Gold Rush: a gold frame just inside the Frenzy one. Fury: the wall glows red.
    if (this.wall.rushT > 0) {
      const blink = this.wall.rushT < 3 && Math.floor(this.time * 8) % 2 === 0;
      if (!blink) {
        g.rect(this.wallX - 1, this.wallY - 1, W + 2, 1).rect(this.wallX - 1, this.wallY + W, W + 2, 1);
        g.rect(this.wallX - 1, this.wallY, 1, W).rect(this.wallX + W, this.wallY, 1, W);
        g.fill({ color: Math.floor(this.time * 6) % 2 ? 0xffe060 : 0xfff0a0, alpha: 1 });
        g.rect(this.wallX, this.wallY, W, W).fill({ color: 0xffd040, alpha: 0.08 });
      }
    }
    if (this.wall.furyT > 0) g.rect(this.wallX, this.wallY, W, W).fill({ color: 0xff2010, alpha: 0.1 + 0.05 * Math.sin(this.time * 20) });
    if (this.wall.fistT > 0) g.rect(this.wallX, this.wallY, W, W).fill({ color: 0xffffff, alpha: 0.05 + 0.04 * Math.sin(this.time * 14) });
    // The Fury meter: the sill under the wall fills orange as you tap, then burns red.
    const sillY = this.wallY + W + 2;
    const fw = this.wall.furyT > 0 ? Math.round((W * this.wall.furyT) / M.FURY_DUR) : Math.round(W * this.wall.fury);
    if (fw > 0) {
      const hot = this.wall.furyT > 0;
      g.rect(this.wallX, sillY, fw, 2).fill({ color: hot ? (Math.floor(this.time * 12) % 2 ? 0xff3020 : 0xffb030) : this.wall.fury > 0.8 ? 0xff7030 : 0xe08a30, alpha: 1 });
    }
    // Steady Drum: a screen-edge pulse on every beat (02 §6E accessibility).
    const e = this.edgeG.clear();
    if (active && this.opt('steady') && onBeat) {
      const L = this.ctx.layout;
      const c = this.ctx.content();
      e.rect(0, c.y, 2, c.h).rect(L.w - 2, c.y, 2, c.h).fill({ color: 0xffe060, alpha: 0.8 });
    }
    if (!active || this.calib) return;
    // Contracting beat rings on every rock: corner brackets that close on the beat.
    const tb = this.wall.clock;
    const kk = Math.round(tb / p);
    const off = tb - kk * p; // signed distance to the nearest beat
    const inWindow = Math.abs(off) <= this.wall.window;
    const toNext = ((p - (tb % p)) % p) / p; // 1 just after a beat -> 0 at the next
    if (!inWindow && toNext > 0.7) return;
    const nextK = inWindow ? kk : Math.floor(tb / p) + 1;
    const thunder = this.per.thunder > 0 && nextK % M.THUNDER_EVERY === 0;
    const gap = inWindow ? 0 : Math.round(toNext * 9);
    const color = thunder ? 0xffd040 : inWindow ? 0xffe060 : 0xe8c04a;
    const alpha = inWindow ? 1 : 0.25 + 0.6 * (1 - toNext / 0.7);
    for (const t of this.wall.tiles) {
      if (t.kind === null || t.kind === 'rubble' || t.kind === 'bedrock') continue;
      const x = this.tx(t) + 1 - gap;
      const y = this.ty(t) + 1 - gap;
      const w = this.s + gap * 2;
      const a = thunder ? 10 : inWindow ? 8 : 5;
      g.rect(x, y, a, 1).rect(x, y + 1, 1, a - 1);
      g.rect(x + w - a, y, a, 1).rect(x + w - 1, y + 1, 1, a - 1);
      g.rect(x, y + w - 1, a, 1).rect(x, y + w - a, 1, a - 1);
      g.rect(x + w - a, y + w - 1, a, 1).rect(x + w - 1, y + w - a, 1, a - 1);
      if (thunder) g.rect(x - 1, y - 1, 2, 2).rect(x + w - 1, y + w - 1, 2, 2);
    }
    g.fill({ color, alpha });
  }

  private label(b: Button, label: string, sub: string | undefined, enabled: boolean): void {
    const key = `${label}|${sub ?? ''}|${enabled}`;
    if (this.btnCache.get(b) === key) return;
    this.btnCache.set(b, key);
    b.setLabel(label, sub).setEnabled(enabled);
  }

  private updateUi(): void {
    const r = this.run;
    const fm = (n: number) => formatNum(n, this.notation());
    const c = this.ctx.content();
    const g = this.uiG.clear();
    const w = this.wall;

    // Status line: crit / zap / crew, or Frenzy pips once Goblin Frenzy is owned.
    const streak = this.drumActive() && w.streak > 1 ? `X${w.streak} ` : '';
    const gemsTxt = `${streak}${fm(this.per.gems)} GEM${this.per.gems === 1 ? '' : 'S'}`;
    this.statusR.set(gemsTxt, '#d090ff');
    this.statusR.position.set(c.x + c.w - 4 - measure(gemsTxt).w, this.statusY);
    // Wave 1 windows take the status line while they run: Fist, Gold Rush, Fury, then the chain.
    const live: string[] = [];
    if (w.fistT > 0) live.push(`FIST ${Math.ceil(w.fistT)}`);
    if (w.rushT > 0) live.push(`RUSH ${Math.ceil(w.rushT)}`);
    if (w.furyT > 0) live.push(`FURY ${Math.ceil(w.furyT)}`);
    if (w.frenzyT > 0 && live.length) live.push(`FRENZY ${Math.ceil(w.frenzyT)}`);
    if (w.chainN >= 2) live.push(`CHAIN X${M.chainMult(w.chainN).toFixed(1)}`);
    const burst = w.fistT > 0 || w.rushT > 0 || w.furyT > 0;
    if (burst || (w.chainN >= 2 && w.frenzyT <= 0)) {
      const hot = w.fistT > 0 || w.furyT > 0;
      // Drop the lowest-priority tokens until the line clears the Gems counter (180 px wide).
      const room = c.w - 12 - measure(gemsTxt).w;
      while (live.length > 1 && measure(live.join(' ')).w > room) live.pop();
      this.status.set(live.join(' '), hot ? (Math.floor(this.time * 8) % 2 ? '#ff6040' : '#ffe060') : w.rushT > 0 ? '#ffe060' : '#ffd070');
      // Frenzy pips stay visible to the right when there is room (drum owners).
      if (this.drumActive() && r.frenzy > 0 && w.frenzyT <= 0 && w.encoreT <= 0 && live.length === 1 && w.chainN >= 2) {
        const need = M.frenzyPips(r.frenzy);
        for (let i = 0; i < need; i++) {
          const x = c.x + 56 + i * 6;
          g.rect(x, this.statusY, 5, 5).fill(OUTLINE);
          g.rect(x + 1, this.statusY + 1, 3, 3).fill(i < w.pips ? 0xff6040 : 0x3a2a3a);
        }
      }
    } else if (this.drumActive() && r.frenzy > 0) {
      const need = M.frenzyPips(r.frenzy);
      if (w.frenzyT > 0) {
        this.status.set(`FRENZY ${w.frenzyT.toFixed(1)}S`, Math.floor(this.time * 8) % 2 ? '#ff6040' : '#ffe060');
      } else {
        this.status.set(w.encoreT > 0 ? `ENCORE ${w.encoreT.toFixed(0)}S` : 'FRENZY', w.encoreT > 0 ? '#ffb030' : C.inkDim);
        if (w.encoreT <= 0)
          for (let i = 0; i < need; i++) {
            const x = c.x + 30 + i * 6;
            g.rect(x, this.statusY, 5, 5).fill(OUTLINE);
            g.rect(x + 1, this.statusY + 1, 3, 3).fill(i < w.pips ? 0xff6040 : 0x3a2a3a);
          }
      }
    } else {
      const zap = this.per.chain > 0 ? ` ZAP ${Math.round(M.chainChance(this.per.chain) * 100)}%` : '';
      this.status.set(`CRIT ${Math.round(M.critChance(r.critC) * 100)}%${zap} CREW ${this.crewNow()}/${M.MAX_GOBLINS}`, C.inkDim);
    }

    // Depth row.
    const target = this.ctx.def.skillTarget(this.ctx.save.cycle.n);
    this.depthText.set(`D${r.depth} ${M.STRATA[M.stratumOf(r.depth)]}`, C.ink);
    this.downBtn.setEnabled(r.depth > 1);
    this.upBtn.setEnabled(r.depth < r.maxDepth);
    if (r.depth >= target) {
      const n = Math.min(M.GATE_ROCKS, r.gate[String(r.depth)] ?? 0);
      this.hintText.set(`{skull}${n}/${M.GATE_ROCKS}`, n >= M.GATE_ROCKS ? C.greenText : '#e05050');
    } else {
      const tpr = M.tapsPerRock(r, r.depth, this.per);
      // Overdepth (crew past its Pick Tier) blinks a warning in place of the taps hint.
      if (M.overdepth(r) < 1 && Math.floor(this.time * 1.5) % 2 === 0) this.hintText.set('CREW SLOW', C.redText);
      else this.hintText.set(`${tpr > 99 ? '99+' : tpr} TAP${tpr === 1 ? '' : 'S'}`, C.inkDim);
    }
    if (r.maxDepth >= M.MAX_DEPTH) this.label(this.digBtn, 'DIG', 'MAX', false);
    else {
      const cost = M.digCost(r.maxDepth);
      this.label(this.digBtn, `DIG D${r.maxDepth + 1}`, fm(cost), r.bank >= cost);
    }
    // Beat lamp: a small square left of the DIG button (gold on the beat).
    if (this.drumActive()) {
      const lx = this.digBtn.x - 8;
      const ly = this.digBtn.y + 9;
      g.rect(lx, ly, 5, 5).fill(OUTLINE);
      g.rect(lx + 1, ly + 1, 3, 3).fill(this.beatPulse > 0 ? 0xffe060 : 0x5a3a20);
      // Early/late tick: a 1 px mark left (early) or right (late) of the lamp after a judged tap;
      // none when it was Perfect.
      if (this.hintT > 0 && Math.abs(this.hintOff) > this.wall.window * M.PERFECT_FRAC) {
        const col = Math.abs(this.hintOff) <= this.wall.window ? 0xffe060 : 0xff6040;
        g.rect(this.hintOff < 0 ? lx - 2 : lx + 6, ly, 1, 5).fill(col);
      }
    }

    // Buttons.
    if (this.crewNow() < M.MAX_GOBLINS) {
      const cost = M.hireCost(r);
      this.label(this.hireBtn, 'HIRE GOBLIN', fm(cost), r.bank >= cost);
    } else if (r.picks < M.PICKS_MAX) {
      const cost = M.picksCost(r.picks);
      this.label(this.hireBtn, 'SHARPER PICKS', fm(cost), r.bank >= cost);
    } else this.label(this.hireBtn, 'CREW MAXED', undefined, false);
    if (this.per.drum) this.label(this.drumBtn, 'DRUM', this.per.drumOn ? 'ON' : 'OFF', true);
  }

  private slowChecks(): void {
    // Upgrade badge.
    const b = this.badge.clear();
    if (anyAffordable(this.groups)) {
      b.rect(0, 0, 9, 9).fill(OUTLINE);
      b.rect(1, 1, 7, 7).fill(C.red);
      b.rect(4, 2, 1, 3).fill(0xffffff);
      b.rect(4, 6, 1, 1).fill(0xffffff);
    }
    // Drum ready (mechanic_unlocked: affordable).
    if (!this.per.drum && this.per.gems >= M.DRUM_GEMS && maxDepthEver(this.ctx) >= M.DRUM_DEPTH) {
      this.ctx.say('drumReady', { type: 'mechanic_unlocked', key: 'drumReady' });
    }
    this.showGemAway();
    // Calibration waits for the upgrade sheet to close.
    if (this.calibPending && this.ctx.game.modalLayer.children.length === 0 && !this.ritual) {
      this.calibPending = false;
      this.startCalib();
    }
    // The gas lesson never waits on a cloud that has already blown away.
    if (this.ctx.seen('m.gas') && !this.ctx.seen('m.wafted') && !this.wall.tiles.some((t) => t.gas > 0)) this.ctx.markSeen('m.wafted');
    this.per.gemAt = Date.now();
  }

  // ---------- return ritual: the keg pile (02 §12, 00 §5.3) ----------

  returnRitual(_haul: number): Promise<number> {
    if (this.ritual) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      const row = 2;
      const kegs: number[] = [];
      for (let c = 0; c < M.GRID; c++) kegs.push(row * M.GRID + c);
      this.ritual = { t: 0, kegs, lit: -1, next: [], chainT: 0, score: 0, resolve, doneT: -1 };
      this.ritualLayer.visible = true;
      kegs.forEach((ti, i) => {
        const t = this.wall.tiles[ti];
        const g = this.kegViews[i];
        g.context = rockArt('keg', 0, 0, this.s);
        g.position.set(this.tx(t) + 1, this.ty(t) + 1);
        g.visible = true;
      });
      this.ctx.say('ritual');
    });
  }

  private lightRitual(i: number): void {
    const rt = this.ritual;
    if (!rt || rt.lit >= 0) return;
    rt.lit = i;
    // Faster is better: a full score inside 3 s, easing to 0.6 by the end of the wait.
    rt.score = rt.t <= 3 ? 1 : Math.max(0.6, 1 - ((rt.t - 3) / (RITUAL_WAIT - 3)) * 0.4);
    // Blast order: outward from the lit keg.
    const order: number[] = [i];
    for (let d = 1; d < M.GRID; d++) {
      if (i - d >= 0) order.push(i - d);
      if (i + d < M.GRID) order.push(i + d);
    }
    rt.next = order;
    rt.chainT = 0;
    this.ctx.haptic(20);
  }

  private updateRitual(dt: number): void {
    const rt = this.ritual;
    if (!rt) return;
    rt.t += dt;
    const g = this.ritualG.clear();
    if (rt.lit < 0) {
      // Waiting: a fuse line along the pile and a pulsing prompt.
      const t0 = this.wall.tiles[rt.kegs[0]];
      const y = this.ty(t0) + 4;
      g.rect(this.wallX + 4, y, this.T * M.GRID - 8, 1).fill(0x3a2a20);
      const on = Math.floor(rt.t * 4) % 2 === 0;
      this.ritualText.set(on ? 'TAP THE KEGS!' : 'KEG PILE!', on ? '#ffe060' : '#ff9a30');
      this.ritualText.position.set(this.wallX + Math.floor((this.T * M.GRID - measure('TAP THE KEGS!').w) / 2), this.ty(t0) - 9);
      if (rt.t >= RITUAL_WAIT) {
        // Nobody lit it: the goblins do, for a small share (gentle, never a loss).
        this.lightRitual(Math.floor(M.GRID / 2));
        rt.score = 0.3;
      }
      return;
    }
    this.ritualText.set('');
    if (rt.next.length) {
      rt.chainT -= dt;
      if (rt.chainT <= 0) {
        rt.chainT = 0.12;
        const i = rt.next.shift()!;
        const ti = rt.kegs[i];
        const t = this.wall.tiles[ti];
        this.kegViews[i].visible = false;
        // Each keg blasts its 3x3 for a tap-lit keg's damage.
        const dmg = M.fistDamage(this.run) * M.blastMult(this.per.powder);
        for (const o of this.wall.around(t, true)) {
          if (o.kind === 'keg') continue;
          if (o.kind === 'rubble' || o.kind === 'bedrock') this.wall.breakRock(o, 'blast');
          else this.wall.damage(o, dmg, 'blast');
        }
        this.onBlast(t, false);
      }
      return;
    }
    if (rt.doneT < 0) {
      rt.doneT = 0.4;
      return;
    }
    rt.doneT -= dt;
    if (rt.doneT <= 0) this.endRitual(rt.score);
  }

  private endRitual(score: number): void {
    const rt = this.ritual;
    if (!rt) return;
    this.ritual = null;
    this.ritualLayer.visible = false;
    for (const g of this.kegViews) g.visible = false;
    try {
      rt.resolve(Math.max(0, Math.min(1, score)));
    } catch {
      /* the core handles its own errors */
    }
  }

  // ---------- drum calibration (02 §13: "Tap with the boom x8") ----------

  private startCalib(): void {
    if (!this.per.drum) return;
    this.calib = { t: 0, period: 0.7, offsets: [], lastBeat: -1, sched: -1 };
    this.calibLayer.visible = true;
    this.pointers.clear();
  }

  private calibTap(): void {
    const c = this.calib;
    if (!c) return;
    const tnow = c.t + (performance.now() - this.frameWall) / 1000 - 1; // beats start after a 1 s lead-in
    if (tnow < -c.period / 2) return;
    const kk = Math.round(tnow / c.period);
    const off = tnow - kk * c.period;
    if (Math.abs(off) < c.period * 0.4) c.offsets.push(off);
    this.ctx.haptic(6);
    if (c.offsets.length >= CALIB_TAPS) this.endCalib(true);
  }

  private updateCalib(dt: number): void {
    const c = this.calib;
    if (!c) return;
    c.t += dt;
    const tb = c.t - 1;
    const kk = Math.floor(tb / c.period);
    const an = audioNow();
    const next = kk + 1;
    const toNext = next * c.period - tb;
    if (an !== null && next > c.sched && toNext < 0.1 && next >= 0) {
      c.sched = next;
      sfx.boom(this.vol(), an + toNext);
    }
    const pulse = tb >= 0 && tb - kk * c.period < 0.1;
    const W = this.T * M.GRID;
    const g = this.calibG.clear();
    g.rect(this.wallX, this.wallY, W, W).fill({ color: 0x0a0410, alpha: 0.75 });
    const cx = this.wallX + W / 2;
    const cy = this.wallY + W / 2;
    const ph = tb < 0 ? 1 : ((c.period - (tb % c.period)) % c.period) / c.period;
    const rad = 10 + Math.round(ph * 30);
    g.rect(cx - rad, cy - rad, rad * 2, 1).rect(cx - rad, cy + rad, rad * 2, 1).rect(cx - rad, cy - rad, 1, rad * 2).rect(cx + rad, cy - rad, 1, rad * 2 + 1);
    g.fill({ color: 0xe8c04a, alpha: 0.8 });
    g.rect(cx - 8, cy - 8, 16, 16).fill(pulse ? 0xffe060 : 0x5a3a20);
    const txt = `TAP WITH THE BOOM ${c.offsets.length}/${CALIB_TAPS}`;
    this.calibText.set(txt, '#ffe060');
    this.calibText.position.set(Math.round(cx - measure(txt).w / 2), this.wallY + 12);
    if (c.t > 25) this.endCalib(false);
  }

  private endCalib(ok: boolean): void {
    const c = this.calib;
    this.calib = null;
    this.calibLayer.visible = false;
    this.calibG.clear();
    if (!c || !ok || c.offsets.length < 4) return;
    const s = [...c.offsets].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const lat = Math.max(0, Math.min(M.LATENCY_MAX, med));
    this.ctx.setSetting('latency', lat);
    this.ctx.setSetting('calibrated', true);
    const cc = this.ctx.content();
    this.ctx.float(`LATENCY ${Math.round(lat * 1000)}MS`, cc.x + cc.w / 2, this.wallY + 20, '#ffe060');
    this.ctx.saveSoon();
  }

  // ---------- manager hooks ----------

  /** Intense moments (02 §18): Frenzy, a lit keg, >= 5 taps in the last second (and the ritual or
   * calibration). A cave-in is deliberately not intense, so its tip lands while the Rubble is there. */
  isIntense(): boolean {
    if (this.wall.frenzyT > 0 || this.ritual || this.calib) return true;
    const now = performance.now();
    let n = 0;
    for (let i = this.tapTimes.length - 1; i >= 0 && now - this.tapTimes[i] < 1000; i--) n++;
    return n >= 5 || this.wall.kegLit();
  }

  private tileRect(t: Tile | undefined | null): Rect | null {
    return t ? { x: this.tx(t), y: this.ty(t), w: this.T, h: this.T } : null;
  }

  private btnRect(b: Button | undefined): Rect | null {
    if (!b || !b.visible || b.destroyed) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  targetRect(id: string): Rect | null {
    const tiles = this.wall.tiles;
    const alive = (t: Tile) => t.kind !== null && t.kind !== 'keg' && t.kind !== 'rubble' && t.kind !== 'bedrock';
    const centre = () => {
      let best: Tile | null = null;
      let bd = Infinity;
      for (const t of tiles) {
        if (!alive(t)) continue;
        const d = Math.abs(t.col - 2) + Math.abs(t.row - 2);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return best;
    };
    switch (id) {
      case 'rock.cracked': {
        const t = tiles[this.obTile];
        return this.tileRect(alive(t) ? t : centre());
      }
      case 'rock':
      case 'rock.any':
        return this.tileRect(centre());
      case 'rock.vein':
        return this.tileRect(tiles.find((t) => t.kind === 'vein'));
      case 'keg':
        return this.tileRect(tiles.find((t) => t.kind === 'keg'));
      case 'gas':
        return this.tileRect(tiles.find((t) => t.gas > 0));
      case 'rubble': {
        const rs = tiles.filter((t) => t.kind === 'rubble');
        if (!rs.length) return null;
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const t of rs) {
          x0 = Math.min(x0, this.tx(t));
          y0 = Math.min(y0, this.ty(t));
          x1 = Math.max(x1, this.tx(t) + this.T);
          y1 = Math.max(y1, this.ty(t) + this.T);
        }
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      case 'wall':
        return { x: this.wallX, y: this.wallY, w: this.T * M.GRID, h: this.T * M.GRID };
      case 'btn.upgrades':
        return this.btnRect(this.upgBtn);
      case 'btn.hire':
        return this.btnRect(this.hireBtn);
      case 'btn.dig':
        return this.btnRect(this.digBtn);
      case 'btn.drum':
        return this.btnRect(this.drumBtn);
      case 'lever': {
        const a = this.btnRect(this.downBtn);
        const b = this.btnRect(this.upBtn);
        return a && b ? { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h } : null;
      }
      default:
        return null;
    }
  }

  resize(_layout: Layout): void {
    this.buildLayout();
    this.placeTiles();
    this.drawBackground();
    for (const g of this.gobViews) g.g.destroy();
    this.gobViews = [];
  }

  destroy(): void {
    this.per.gemAt = Date.now();
    if (this.ritual) this.endRitual(0);
    this.calib = null;
    this.hit.removeAllListeners();
    destroyTree(this.root);
  }
}
