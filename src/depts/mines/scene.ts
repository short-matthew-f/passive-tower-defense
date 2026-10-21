// The Goblin Mines scene: a 5x5 rock wall you smash, a goblin crew that chips beside you,
// the depth lever, and (once bought) the Doom Drum's beat. Logic and rendering live together
// here; all numbers come from model.ts.
import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure } from '../../ui/font';
import { Button, C } from '../../ui/widgets';
import * as M from './model';
import {
  crackArt,
  drumArt,
  drummerArt,
  flashArt,
  gauntletArt,
  goblinArt,
  GOLD,
  OUTLINE,
  rockArt,
  STRATA_PAL,
  torchArt,
} from './art';
import { anyAffordable, buildGroups, maxDepthEver } from './upgrades';

/** Touch-to-screen latency we assume when judging the beat (no calibration in this build). */
const BEAT_LATENCY = 0.04;
const KEG_FUSE = 1.2;
const KEG_AUTO = 8;
const SAPPER_PLANT = 20;
const MAX_PARTICLES = 160;
const SOFT_CAP = 8;
const HARD_CAP = 15;
const RAKE_MAX = 8;

interface Tile {
  i: number;
  col: number;
  row: number;
  x: number;
  y: number;
  kind: M.RockKind | null;
  hp: number;
  maxHp: number;
  regrow: number;
  variant: number;
  stage: number;
  cont: Container;
  body: Graphics;
  crack: Graphics;
  flash: Graphics;
  flashT: number;
  squashT: number;
  fuse: number; // keg: < 0 unlit, else seconds to blast
  kegAge: number;
  sparkle: number;
  shownKey: string;
}

interface Gob {
  g: Graphics;
  sapper: boolean;
  tile: number;
  x: number;
  y: number;
  hop: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null;
  swing: number;
  frame: number;
  face: number;
  plant: number;
  cheer: number;
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
}

const rand = Math.random;
const GOLD_DIM = 0xb08a30;

export class MinesScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.MinesRun;
  private per: M.MinesPersistent;
  private groups: UpgradeGroup[];

  // layout
  private T = 32;
  private s = 30;
  private wallX = 0;
  private wallY = 0;
  private ledgeY = 0;

  // layers
  private bg = new Graphics();
  private wallLayer = new Container();
  private ringG = new Graphics();
  private gobLayer = new Container();
  private fxG = new Graphics();
  private partLayer = new Container();
  private ui = new Container();
  private uiG = new Graphics();
  private hit = new Container();
  private drum = new Graphics();
  private drummers: Graphics[] = [];
  private torches: Graphics[] = [];
  private fist = new Graphics();

  // state
  private tiles: Tile[] = [];
  private gobs: Gob[] = [];
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
  private pointers = new Map<number, { tile: number; raked: number }>();
  private beatClock = 0;
  private lastJudged = -1;
  private streak = 0;
  private pips = 0;
  private pipDecay = 0;
  private frenzyT = 0;
  private lastBeatIdx = -1;
  private beatPulse = 0;
  private slowTick = 0;
  private flavorT = 30;
  private lessonHits = 0;
  private recentTaps = 0;

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
  private glowTarget: Button | null = null;
  private statusY = 0;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    M.normalize(ctx.save.run, ctx.save.persistent);
    this.run = ctx.save.run as M.MinesRun;
    this.per = ctx.save.persistent as M.MinesPersistent;
    this.run.depth = Math.max(1, Math.min(this.run.depth, this.run.maxDepth));
    this.groups = buildGroups(ctx, {
      onDig: () => this.onDig(),
      onDrum: () => this.onDrumBought(),
    });
    this.root.addChild(this.bg, this.wallLayer, this.ringG, this.drum, this.gobLayer, this.fxG, this.partLayer, this.fist, this.ui, this.hit);
    this.fist.visible = false;
    this.buildLayout();
    this.buildWall(true);
    this.syncGoblins(true);
    this.updateMaxDepthEver();
  }

  // ---------- layout ----------

  private buildLayout(): void {
    const c = this.ctx.content();
    this.T = c.w >= 172 ? 32 : Math.max(24, Math.floor((c.w - 12) / 5));
    this.s = this.T - 2;
    const wallW = this.T * M.GRID;
    this.wallX = c.x + Math.floor((c.w - wallW) / 2);
    const btnY = c.y + c.h - 4 - 21;
    const depthY = btnY - 5 - 16;
    this.statusY = depthY - 4 - 7;
    this.wallY = this.statusY - 5 - wallW;
    this.ledgeY = this.wallY - 4;

    // UI
    const x0 = c.x + 4;
    const right = c.x + c.w - 4;
    this.ui.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    this.ui.addChild(this.uiG, this.status, this.statusR, this.depthText, this.hintText);
    this.status.position.set(x0, this.statusY);

    const mk = (o: ConstructorParameters<typeof Button>[0], x: number, y: number) => {
      const b = new Button(o);
      b.position.set(x, y);
      this.ui.addChild(b);
      return b;
    };
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    this.downBtn = mk({ w: 15, h: 15, label: '{darr}', ...dark, onTap: () => this.setDepth(this.run.depth - 1) }, x0, depthY);
    this.depthText.position.set(x0 + 19, depthY + 5);
    this.upBtn = mk({ w: 15, h: 15, label: '{uarr}', ...dark, onTap: () => this.setDepth(this.run.depth + 1) }, x0 + 67, depthY);
    this.hintText.position.set(x0 + 86, depthY + 5);
    const digW = 50;
    this.digBtn = mk({ w: digW, h: 15, label: 'DIG', color: C.gold, shade: 0x9a7a20, onTap: () => this.buyDig() }, right - digW, depthY);

    const total = right - x0;
    const drumW = this.per.drum ? 36 : 0;
    const gap = 3;
    const upgW = Math.floor((total - drumW - gap * (drumW ? 2 : 1)) * 0.55);
    const hireW = total - drumW - upgW - gap * (drumW ? 2 : 1);
    this.upgBtn = mk({ w: upgW, h: 20, label: 'UPGRADES', onTap: () => this.ctx.openUpgrades(this.groups) }, x0, btnY);
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
      const k = Math.floor(i / 2);
      g.position.set(cx + side * (20 + k * 14), this.ledgeY);
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
      for (let k = 0; k < h; k++) {
        const w = Math.max(1, Math.round(4 * (1 - k / h)));
        g.rect(x + Math.floor((4 - w) / 2), c.y + k, w, 1).fill(pal.bgDark);
      }
    }
    this.drawScenery(g, r, pal);
    // Wall frame: sockets, posts, the ledge beam and the sill.
    const W = this.T * M.GRID;
    g.rect(this.wallX - 3, this.wallY - 3, W + 6, W + 6).fill(OUTLINE);
    g.rect(this.wallX - 2, this.wallY - 2, W + 4, W + 4).fill(pal.bgDark);
    for (const t of this.tiles) {
      g.rect(t.x + 3, t.y + 3, this.T - 6, this.T - 6).fill(0x08040a);
      g.rect(t.x + 4, t.y + this.T - 5, this.T - 8, 1).fill(pal.bg);
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
      // soft glow
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

  // ---------- wall ----------

  private buildWall(first: boolean): void {
    if (!this.tiles.length) {
      for (let i = 0; i < M.TILES; i++) {
        const col = i % M.GRID;
        const row = Math.floor(i / M.GRID);
        const cont = new Container();
        const body = new Graphics();
        const crack = new Graphics();
        const flash = new Graphics();
        flash.visible = false;
        cont.addChild(body, crack, flash);
        this.wallLayer.addChild(cont);
        this.tiles.push({
          i,
          col,
          row,
          x: 0,
          y: 0,
          kind: null,
          hp: 0,
          maxHp: 0,
          regrow: 0,
          variant: (i * 7 + row) % 3,
          stage: 0,
          cont,
          body,
          crack,
          flash,
          flashT: 0,
          squashT: 0,
          fuse: -1,
          kegAge: 0,
          sparkle: rand(),
          shownKey: '',
        });
      }
    }
    for (const t of this.tiles) {
      t.x = this.wallX + t.col * this.T;
      t.y = this.wallY + t.row * this.T;
      t.cont.position.set(t.x + 1, t.y + 1);
      if (first) this.spawnRock(t, true);
      else {
        t.kind = null;
        t.regrow = 0.05 + rand() * 0.35;
      }
      t.shownKey = '';
    }
    this.shownDepth = this.run.depth;
    this.drawBackground();
  }

  private spawnRock(t: Tile, initial = false): void {
    const d = this.run.depth;
    let kind: M.RockKind = 'common';
    const r = rand();
    const kp = initial ? 0 : M.kegP(this.per.powder);
    if (r < kp) kind = 'keg';
    else if (r < kp + M.GEODE_P) kind = 'geode';
    else if (r < kp + M.GEODE_P + M.VEIN_P) kind = 'vein';
    // Onboarding: once a goblin is hired, make sure a vein shows up to teach "shiny first".
    if (this.ctx.seen('ob.hire') && !this.ctx.seen('ob.vein') && !this.tiles.some((o) => o.kind === 'vein')) kind = 'vein';
    t.kind = kind;
    t.maxHp = kind === 'keg' ? 1 : M.H(d) * M.KIND_HP[kind];
    t.hp = t.maxHp;
    t.fuse = -1;
    t.kegAge = 0;
    t.variant = Math.floor(rand() * 3);
    t.stage = 0;
    t.squashT = 0.08;
    if (kind === 'keg' && this.ctx.seen('ob.smash') && !this.ctx.seen('m.kegLesson')) {
      this.ctx.markSeen('m.kegLesson');
      this.ctx.say('kegLesson', { milestone: true });
    }
  }

  private alive(t: Tile): boolean {
    return t.kind !== null;
  }

  private mineable(t: Tile): boolean {
    return t.kind !== null && t.kind !== 'keg';
  }

  private refreshTile(t: Tile): void {
    const st = M.stratumOf(this.run.depth);
    let key: string;
    if (t.kind === null) {
      key = t.regrow < 0.3 ? `sprout.${st}.${t.variant}` : 'empty';
    } else {
      const frac = t.hp / t.maxHp;
      t.stage = t.kind === 'keg' || t.kind === 'rubble' ? 0 : frac <= 0.34 ? 2 : frac <= 0.67 ? 1 : 0;
      key = `${t.kind}.${st}.${t.variant}.${t.stage}`;
    }
    if (key === t.shownKey) return;
    t.shownKey = key;
    if (t.kind === null) {
      t.crack.visible = false;
      if (key === 'empty') t.body.visible = false;
      else {
        t.body.visible = true;
        t.body.context = rockArt('sprout', st, t.variant, this.s);
      }
      return;
    }
    t.body.visible = true;
    t.body.context = rockArt(t.kind, st, t.variant, this.s);
    t.crack.visible = t.stage > 0;
    if (t.stage > 0) t.crack.context = crackArt(t.stage, t.variant, this.s);
    t.flash.context = flashArt(t.variant, this.s);
  }

  // ---------- goblins ----------

  private syncGoblins(initial: boolean): void {
    const want = M.goblins(this.run);
    while (this.gobs.length < want) {
      const i = this.gobs.length;
      const sapper = i >= this.run.grunts;
      const g = new Graphics(goblinArt(0, sapper));
      const side = i % 2 === 0 ? -1 : 1;
      const x = side < 0 ? this.wallX - 8 : this.wallX + this.T * M.GRID + 8;
      const y = this.wallY + this.T * M.GRID;
      const gob: Gob = { g, sapper, tile: -1, x, y, hop: null, swing: rand(), frame: 0, face: side < 0 ? 1 : -1, plant: SAPPER_PLANT * rand(), cheer: 0 };
      if (initial) {
        const t = this.tiles[Math.floor(rand() * M.TILES)];
        gob.x = t.x + 6;
        gob.y = t.y + this.T - 2;
      }
      this.gobs.push(gob);
      this.gobLayer.addChild(g);
      if (!initial) {
        if (want === 1 && !this.ctx.seen('m.firstGoblin')) {
          this.ctx.markSeen('m.firstGoblin');
          this.ctx.say('firstGoblin', { milestone: true });
        } else if (want === 4 && !this.ctx.seen('m.fourGoblins')) {
          this.ctx.markSeen('m.fourGoblins');
          this.ctx.say('fourGoblins', { milestone: true });
        }
      }
    }
  }

  private standPos(t: Tile, gi: number): { x: number; y: number; face: number } {
    const left = gi % 2 === 0;
    return { x: t.x + (left ? 7 : this.T - 7), y: t.y + this.T - 2, face: left ? 1 : -1 };
  }

  private pickTarget(g: Gob, gi: number): number {
    let best = -1;
    let bestScore = Infinity;
    for (const t of this.tiles) {
      if (!this.mineable(t)) continue;
      let crowd = 0;
      for (const o of this.gobs) if (o !== g && o.tile === t.i) crowd++;
      const p = this.standPos(t, gi);
      const score = Math.hypot(p.x - g.x, p.y - g.y) + crowd * 60;
      if (score < bestScore) {
        bestScore = score;
        best = t.i;
      }
    }
    return best;
  }

  private updateGoblins(dt: number): void {
    const frenzy = this.frenzyT > 0 ? M.FRENZY_GOBLIN_MULT : 1;
    this.gobs.forEach((g, gi) => {
      if (g.cheer > 0) g.cheer -= dt;
      if (g.hop) {
        g.hop.t += dt;
        const k = Math.min(1, g.hop.t / g.hop.dur);
        g.x = g.hop.fx + (g.hop.tx - g.hop.fx) * k;
        g.y = g.hop.fy + (g.hop.ty - g.hop.fy) * k - Math.sin(k * Math.PI) * 9;
        if (k >= 1) g.hop = null;
        g.frame = 2;
      } else {
        const t = g.tile >= 0 ? this.tiles[g.tile] : null;
        if (!t || !this.mineable(t)) {
          g.tile = this.pickTarget(g, gi);
          if (g.tile >= 0) {
            const p = this.standPos(this.tiles[g.tile], gi);
            const dist = Math.hypot(p.x - g.x, p.y - g.y);
            g.hop = { fx: g.x, fy: g.y, tx: p.x, ty: p.y, t: 0, dur: Math.min(0.5, 0.18 + dist / 400) };
            g.face = p.x >= g.x ? 1 : -1;
            if (Math.abs(p.x - g.x) < 4) g.face = p.face;
          } else g.frame = g.cheer > 0 ? 2 : 0;
        } else {
          g.face = this.standPos(t, gi).face;
          const dps = M.goblinDps(g.sapper ? M.SAPPER_DPS : M.GRUNT_DPS, this.run, this.per) * frenzy;
          g.swing += dt * (frenzy > 1 ? 1.6 : 1);
          const ph = g.swing % 0.5;
          const frame = ph < 0.32 ? 0 : 1;
          if (frame === 1 && g.frame !== 1) {
            t.squashT = 0.05;
            this.chips(t.x + this.T / 2 + (g.face > 0 ? -6 : 6), t.y + this.T - 8, 1);
          }
          g.frame = frame;
          this.damage(t, dps * dt, 'gob');
        }
      }
      if (g.sapper && M.goblins(this.run) > 0) {
        g.plant -= dt;
        if (g.plant <= 0) {
          g.plant = SAPPER_PLANT;
          const commons = this.tiles.filter((t) => t.kind === 'common');
          const t = commons[Math.floor(rand() * commons.length)];
          if (t) {
            t.kind = 'keg';
            t.maxHp = 1;
            t.hp = 1;
            t.fuse = -1;
            t.kegAge = 0;
            t.squashT = 0.1;
          }
        }
      }
      const art = goblinArt(g.cheer > 0 && !g.hop ? 2 : g.frame, g.sapper);
      if (g.g.context !== art) g.g.context = art;
      g.g.scale.x = g.face;
      g.g.position.set(Math.round(g.x), Math.round(g.y - (g.cheer > 0 && !g.hop ? 2 : 0)));
    });
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
    this.pointers.set(e.pointerId, { tile: ti, raked: 0 });
    if (ti >= 0) this.tap(this.tiles[ti], p.x, p.y);
  }

  private onMove(e: FederatedPointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    const p = this.root.toLocal(e.global);
    const ti = this.tileAt(p.x, p.y);
    if (ti < 0 || ti === ptr.tile) return;
    ptr.tile = ti;
    if (ptr.raked >= RAKE_MAX) return;
    ptr.raked++;
    this.rake(this.tiles[ti]);
  }

  /** Seconds on the beat clock right now, including time since the last frame. */
  private beatNow(): number {
    return this.beatClock + (performance.now() - this.frameWall) / 1000;
  }

  private drumActive(): boolean {
    return this.per.drum && this.per.drumOn;
  }

  private tap(t: Tile, px: number, py: number): void {
    const now = performance.now();
    this.tapTimes = this.tapTimes.filter((x) => now - x < 1000);
    if (this.tapTimes.length >= HARD_CAP) return;
    this.tapTimes.push(now);
    const soft = this.tapTimes.length > SOFT_CAP ? 0.5 : 1;
    this.recentTaps++;
    this.run.stats.taps++;
    this.showFist(px, py, false);

    // Beat judgement: one judged tap per beat, from the previous beat's midpoint (02 §6E, R4-01).
    let beatHit = false;
    if (this.drumActive()) {
      const p = M.beatPeriod(this.run.depth);
      const tb = this.beatNow() - BEAT_LATENCY;
      const k = Math.round(tb / p);
      if (k !== this.lastJudged) {
        this.lastJudged = k;
        if (Math.abs(tb - k * p) <= M.beatWindow(this.run.wide)) beatHit = true;
        else this.streak = 0;
      }
    }

    if (t.kind === null) return;
    if (t.kind === 'keg') {
      if (t.fuse < 0) {
        t.fuse = KEG_FUSE;
        t.squashT = 0.08;
        this.ctx.markSeen('m.kegLit');
      }
      return;
    }
    if (t.kind === 'rubble') {
      this.breakRock(t, 'tap');
      return;
    }

    let dmg = M.tapDamage(this.run.tap) * soft;
    const crit = rand() < M.critChance(this.run.critC);
    if (crit) dmg *= M.critMult(this.run.critP);
    if (beatHit) {
      this.streak++;
      this.run.stats.beatHits++;
      this.run.stats.bestStreak = Math.max(this.run.stats.bestStreak, this.streak);
      dmg *= M.beatMult(this.run.drumhead) * M.streakBonus(this.streak);
      this.onBeatHit();
    }
    if (this.frenzyT > 0) dmg *= M.frenzyTapMult(this.run.frenzy);

    const cx = t.x + this.T / 2;
    if (crit) {
      this.run.stats.crits++;
      this.hitStop = 0.05;
      this.shake(2, 0.08);
      this.ctx.haptic(15);
      this.ctx.float('CRUNCH!', cx, t.y - 2, '#ffe060');
      this.showFist(px, py, true);
    }
    if (beatHit) this.ctx.float(this.streak > 1 ? `!X${this.streak}` : '!', cx + 9, t.y + 2, '#e8c04a');
    t.flashT = 0.05;
    t.squashT = 0.06;
    this.chips(px, py, crit ? 6 : 3);

    // Chain Lightning: any tap can proc it; Beat Hits proc at double chance.
    const chance = M.chainChance(this.per.chain) * (beatHit ? 2 : 1);
    if (chance > 0 && rand() < chance) this.chain(t, dmg * 0.5);

    this.damage(t, dmg, 'tap');
  }

  private rake(t: Tile): void {
    if (t.kind === null || t.kind === 'keg') return;
    if (t.kind === 'rubble') {
      this.breakRock(t, 'tap');
      return;
    }
    this.chips(t.x + this.T / 2, t.y + this.T / 2, 2);
    t.squashT = 0.04;
    this.damage(t, M.tapDamage(this.run.tap) * 0.25, 'tap');
  }

  private onBeatHit(): void {
    this.pipDecay = 0;
    if (this.run.frenzy > 0) {
      if (this.frenzyT > 0) this.frenzyT = Math.min(M.frenzyCap(this.run.fuse), this.frenzyT + 0.25);
      else {
        this.pips++;
        if (this.pips >= M.frenzyPips(this.run.frenzy)) this.startFrenzy();
      }
    }
    if (this.ctx.seen('m.drumBought') && !this.ctx.seen('m.drumLesson')) {
      this.lessonHits++;
      if (this.lessonHits >= 4) {
        this.ctx.markSeen('m.drumLesson');
        this.ctx.say('drumLesson', { milestone: true });
      }
    }
  }

  private startFrenzy(): void {
    this.pips = 0;
    this.frenzyT = M.frenzyBase(this.run.fuse);
    this.run.stats.frenzies++;
    this.shake(2, 0.2);
    this.ctx.haptic(40);
    const c = this.ctx.content();
    this.ctx.float('FRENZY!', c.x + c.w / 2, this.wallY + 40, '#ff6040');
  }

  // ---------- damage, breaks, effects ----------

  private damage(t: Tile, amount: number, by: 'tap' | 'gob' | 'blast' | 'zap'): void {
    if (!this.mineable(t) || amount <= 0) return;
    t.hp -= amount;
    if (t.hp <= 0) this.breakRock(t, by);
  }

  private breakRock(t: Tile, by: 'tap' | 'gob' | 'blast' | 'zap'): void {
    const kind = t.kind;
    if (kind === null) return;
    const cx = t.x + this.T / 2;
    const cy = t.y + this.T / 2;
    const pal = STRATA_PAL[M.stratumOf(this.run.depth)];
    t.kind = null;
    t.regrow = M.regrowTime(this.run.regrow);
    t.flashT = 0;
    for (const g of this.gobs) if (g.tile === t.i) g.tile = -1;
    if (kind === 'rubble') {
      this.burst(cx, cy, 4, 0x6a6a74);
      return;
    }
    let reward = M.R(this.run.depth) * M.KIND_REWARD[kind];
    if (by === 'tap' && (kind === 'vein' || kind === 'geode')) reward *= 1 + 0.1 * this.run.keen;
    const got = this.ctx.earn(reward);
    const st = this.run.stats;
    st.rocks++;
    if (kind === 'vein') {
      st.veins++;
      this.ctx.float(`+${formatNum(got)}`, cx, cy - 8, '#ffe060');
      if (rand() < 0.2) this.ctx.say('vein');
    } else this.ctx.float(`+${formatNum(got)}`, cx, cy - 6, by === 'gob' ? '#c8a050' : '#e8c04a');
    let gems = 0;
    if (kind === 'geode') {
      gems++;
      st.geodes++;
    }
    if (this.per.lucky > 0 && rand() < 0.001 * this.per.lucky) gems++;
    if (gems) {
      this.per.gems += gems;
      this.per.gemsEver += gems;
      this.ctx.float(`+${gems}{gem}`, cx, cy - 16, '#d090ff');
      this.ctx.say('gem');
      this.ctx.saveSoon();
    }
    // Infamy skill gate: 50 rocks at a depth, on screen (this scene only runs on screen).
    const key = String(this.run.depth);
    const n = (this.run.gate[key] = (this.run.gate[key] ?? 0) + 1);
    if (n >= M.GATE_ROCKS) this.ctx.raiseSkill(this.run.depth);

    this.burst(cx, cy, by === 'gob' ? 6 : 10, pal.chip);
    this.nuggets(cx, cy, kind === 'vein' ? 5 : 2);
    if (by !== 'gob') {
      this.shake(1, 0.06);
      this.ctx.haptic(8);
    }
    if (rand() < M.caveInChance(this.run)) this.caveIn();
  }

  private caveIn(): void {
    const n = 3 + Math.floor(rand() * 3);
    const cands = this.tiles.filter((t) => t.kind !== 'keg');
    for (let k = 0; k < n && cands.length; k++) {
      const t = cands.splice(Math.floor(rand() * cands.length), 1)[0];
      t.kind = 'rubble';
      t.maxHp = 1;
      t.hp = 1;
      t.squashT = 0.1;
      this.burst(t.x + this.T / 2, t.y + 4, 3, 0x6a6a74);
      for (const g of this.gobs) if (g.tile === t.i) g.tile = -1;
    }
    this.shake(3, 0.25);
    this.ctx.haptic(30);
    if (!this.ctx.seen('m.caveIn')) {
      this.ctx.markSeen('m.caveIn');
      this.ctx.say('caveIn', { milestone: true });
    }
  }

  private explode(t: Tile, auto: boolean): void {
    const cx = t.x + this.T / 2;
    const cy = t.y + this.T / 2;
    t.kind = null;
    t.regrow = M.regrowTime(this.run.regrow);
    t.fuse = -1;
    this.run.stats.kegs++;
    const dmg = M.tapDamage(this.run.tap) * M.blastMult(this.per.powder) * (auto ? 0.5 : 1);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = t.col + dx;
        const r = t.row + dy;
        if (c < 0 || r < 0 || c >= M.GRID || r >= M.GRID) continue;
        const o = this.tiles[r * M.GRID + c];
        if (o === t) continue;
        if (o.kind === 'keg') {
          if (o.fuse < 0 || o.fuse > 0.15) o.fuse = 0.15;
        } else if (o.kind === 'rubble') this.breakRock(o, 'blast');
        else this.damage(o, dmg, 'blast');
      }
    this.fx.push({ kind: 'blast', t: 0, max: 0.25, x: t.x - this.T, y: t.y - this.T, w: this.T * 3 });
    this.burst(cx, cy, 16, 0xff9a30);
    this.shake(3, 0.18);
    this.ctx.haptic(35);
    for (const g of this.gobs) g.cheer = 0.8;
    if (auto && !this.ctx.seen('m.kegLit') && !this.ctx.seen('m.kegAuto')) {
      this.ctx.markSeen('m.kegAuto');
      this.ctx.say('kegAuto', { milestone: true });
    }
  }

  private chain(from: Tile, dmg: number): void {
    const jumps = M.chainJumps(this.per.chain);
    const pts = [from.x + this.T / 2, from.y + this.T / 2];
    const hitSet = new Set([from.i]);
    let cur = from;
    for (let j = 0; j < jumps; j++) {
      let best: Tile | null = null;
      let bd = Infinity;
      for (const t of this.tiles) {
        if (hitSet.has(t.i) || !this.mineable(t)) continue;
        const d = Math.abs(t.col - cur.col) + Math.abs(t.row - cur.row) + rand() * 0.5;
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) break;
      hitSet.add(best.i);
      pts.push(best.x + this.T / 2, best.y + this.T / 2);
      best.flashT = 0.08;
      this.damage(best, dmg, 'zap');
      cur = best;
    }
    if (pts.length > 2) {
      this.run.stats.lightning++;
      this.fx.push({ kind: 'zap', t: 0, max: 0.15, pts });
    }
  }

  private showFist(x: number, y: number, heavy: boolean): void {
    this.fist.context = gauntletArt(heavy);
    this.fist.visible = true;
    this.fist.position.set(Math.round(x), Math.round(y - 6));
    this.fistT = heavy ? 0.14 : 0.09;
  }

  private shake(mag: number, t: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // ---------- particles ----------

  private spawn(x: number, y: number, color: number, size: number, vx: number, vy: number, life: number, grav: number, home = false): void {
    if (this.parts.length >= MAX_PARTICLES) {
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
    for (let i = 0; i < n; i++) this.spawn(x, y, i % 2 ? pal.light : pal.chip, 1 + (i % 2), (rand() - 0.5) * 70, -30 - rand() * 50, 0.35 + rand() * 0.2, 260);
  }

  private burst(x: number, y: number, n: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const v = 30 + rand() * 70;
      this.spawn(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 12, i % 3 === 0 ? 0x2a1a20 : color, 2 + (i % 2), Math.cos(a) * v, Math.sin(a) * v - 40, 0.5 + rand() * 0.3, 300);
    }
  }

  private nuggets(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) this.spawn(x, y, i % 2 ? GOLD : 0xfff0a0, 2, (rand() - 0.5) * 60, -60 - rand() * 40, 0.8, 0, true);
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
        const k = Math.min(1, dt * 5);
        p.vx += (tx - p.x) * k * 2.2;
        p.vy += (ty - p.y) * k * 2.2;
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

  // ---------- upgrades and controls ----------

  private setDepth(d: number): void {
    const nd = Math.max(1, Math.min(this.run.maxDepth, d));
    if (nd === this.run.depth) return;
    this.run.depth = nd;
  }

  private buyDig(): void {
    const e = this.groups[2].entries[0];
    if (e.canAfford() && e.level() < e.max) {
      e.buy();
      this.ctx.saveSoon();
    }
  }

  private quickHire(): void {
    const crew = this.groups[1].entries;
    const e = M.goblins(this.run) < M.MAX_GOBLINS ? crew[0] : crew[2];
    if (e.canAfford() && e.level() < e.max) {
      e.buy();
      this.ctx.saveSoon();
    }
  }

  private toggleDrum(): void {
    this.per.drumOn = !this.per.drumOn;
    this.streak = 0;
    this.ctx.saveSoon();
  }

  private onDig(): void {
    this.updateMaxDepthEver();
    const ever = this.ctx.save.lifetime.best.maxDepth;
    if (ever % 10 === 5 && !this.ctx.seen(`m.dial.${ever}`)) {
      this.ctx.markSeen(`m.dial.${ever}`);
      this.ctx.say('dialRaised', { milestone: true });
    }
  }

  private onDrumBought(): void {
    this.ctx.markSeen('m.drumBought');
    this.lessonHits = 0;
    this.ctx.say('drumBought', { milestone: true });
    this.shake(3, 0.3);
    this.ctx.haptic(50);
    // Rebuild the controls so the DRUM toggle appears.
    this.buildLayout();
    this.drawBackground();
  }

  private updateMaxDepthEver(): void {
    const b = this.ctx.save.lifetime.best;
    b.maxDepth = Math.max(b.maxDepth ?? 1, this.run.maxDepth);
  }

  private obStep(): string | null {
    const seen = this.ctx.save.seen;
    if (seen.onboardingDone) return null;
    for (const id of ['smash', 'tap', 'hire', 'vein', 'dig']) if (!seen[`ob.${id}`]) return id;
    return null;
  }

  // ---------- frame ----------

  update(dtIn: number): void {
    const dt = dtIn;
    this.frameWall = performance.now();
    this.time += dt;
    if (this.drumActive()) this.beatClock += dt;

    if (this.run.depth !== this.shownDepth) {
      const newStratum = M.stratumOf(this.run.depth) !== M.stratumOf(this.shownDepth);
      this.buildWall(false);
      if (newStratum) this.drawBackground();
      const st = M.stratumOf(this.run.depth);
      if (st > 0 && !this.ctx.seen(`m.stratum.${st}`)) {
        this.ctx.markSeen(`m.stratum.${st}`);
        this.ctx.say('stratum', { milestone: true, vars: { name: M.STRATA[st] } });
      }
    }
    if (M.goblins(this.run) !== this.gobs.length) this.syncGoblins(false);

    const frozen = this.hitStop > 0;
    if (frozen) this.hitStop -= dt;
    else {
      this.updateTiles(dt);
      this.updateGoblins(dt);
      this.updateFrenzy(dt);
    }
    this.updateParticles(dt);
    this.updateFx(dt);
    this.updateDrum(dt);
    this.renderTiles();
    this.updateUi(dt);

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

  private updateTiles(dt: number): void {
    for (const t of this.tiles) {
      if (t.flashT > 0) t.flashT -= dt;
      if (t.squashT > 0) t.squashT -= dt;
      if (t.kind === null) {
        t.regrow -= dt;
        if (t.regrow <= 0) this.spawnRock(t);
      } else if (t.kind === 'keg') {
        if (t.fuse >= 0) {
          t.fuse -= dt;
          if (rand() < 0.6) this.spawn(t.x + this.T / 2 + 1, t.y + 6, rand() < 0.5 ? 0xffe060 : 0xff6020, 1, (rand() - 0.5) * 40, -30 - rand() * 30, 0.25, 100);
          if (t.fuse <= 0) this.explode(t, false);
        } else {
          t.kegAge += dt;
          if (t.kegAge >= KEG_AUTO) this.explode(t, true);
        }
      } else if (t.kind === 'vein') {
        t.sparkle += dt;
        if (t.sparkle > 1) {
          t.sparkle = rand() * 0.3;
          this.spawn(t.x + 6 + rand() * (this.T - 12), t.y + 6 + rand() * (this.T - 12), 0xfff0a0, 1, 0, -6, 0.4, 0);
        }
      }
    }
  }

  private renderTiles(): void {
    for (const t of this.tiles) {
      this.refreshTile(t);
      t.flash.visible = t.flashT > 0 && t.kind !== null;
      let oy = t.squashT > 0 ? 1 : 0;
      if (t.kind === 'keg' && t.fuse >= 0) {
        t.flash.visible = Math.floor(this.time * 16) % 2 === 0;
        oy = 0;
      } else if (t.kind === 'keg' && t.kegAge > KEG_AUTO - 2) {
        t.flash.visible = Math.floor(this.time * 8) % 2 === 0;
      }
      t.cont.position.set(t.x + 1, t.y + 1 + oy);
    }
  }

  private updateFrenzy(dt: number): void {
    if (this.frenzyT > 0) {
      this.frenzyT -= dt;
      if (this.frenzyT <= 0) {
        this.frenzyT = 0;
        if (!this.ctx.seen('m.firstFrenzy')) {
          this.ctx.markSeen('m.firstFrenzy');
          this.ctx.say('firstFrenzy', { milestone: true });
        }
      }
    } else if (this.pips > 0) {
      this.pipDecay += dt;
      if (this.pipDecay >= 3) {
        this.pipDecay = 0;
        this.pips--;
      }
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
        for (let k = 0; k + 3 < pts.length; k += 2) {
          // Jagged 1px polyline in a few segments.
          let x = pts[k];
          let y = pts[k + 1];
          const steps = 5;
          for (let s = 1; s <= steps; s++) {
            const nx = pts[k] + ((pts[k + 2] - pts[k]) * s) / steps + (s < steps ? (rand() - 0.5) * 8 : 0);
            const ny = pts[k + 1] + ((pts[k + 3] - pts[k + 1]) * s) / steps + (s < steps ? (rand() - 0.5) * 8 : 0);
            g.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5).lineTo(Math.round(nx) + 0.5, Math.round(ny) + 0.5);
            x = nx;
            y = ny;
          }
        }
        g.stroke({ width: 1, color: 0x7af0ff });
      } else if (f.kind === 'blast') {
        const k = f.t / f.max;
        const inset = Math.round(k * 10);
        const w = f.w! - inset * 2;
        if (w > 0) {
          g.rect(f.x! + inset, f.y! + inset, w, w).fill({ color: k < 0.3 ? 0xfff0a0 : 0xff8a30, alpha: 0.55 * (1 - k) });
        }
      }
    }
  }

  private updateDrum(dt: number): void {
    const owned = this.per.drum;
    const active = this.drumActive();
    const p = M.beatPeriod(this.run.depth);
    let onBeat = false;
    if (active) {
      const k = Math.floor(this.beatClock / p);
      if (k !== this.lastBeatIdx) {
        this.lastBeatIdx = k;
        this.beatPulse = 0.12;
        for (const d of this.drummers) if (d.visible) d.y = this.ledgeY;
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
    const big = this.frenzyT > 0;
    const tf = Math.floor(this.time * (big ? 12 : 6)) % 2;
    for (const t of this.torches) {
      const a = torchArt(tf, big);
      if (t.context !== a) t.context = a;
    }

    // Contracting beat rings on every rock.
    const g = this.ringG.clear();
    if (this.frenzyT > 0) {
      // Frenzy: a pulsing hot frame around the whole wall.
      const W = this.T * M.GRID;
      const m = onBeat ? 3 : 2;
      g.rect(this.wallX - m - 1, this.wallY - m - 1, W + 2 * m + 2, m).rect(this.wallX - m - 1, this.wallY + W + 1, W + 2 * m + 2, m);
      g.rect(this.wallX - m - 1, this.wallY - 1, m, W + 2).rect(this.wallX + W + 1, this.wallY - 1, m, W + 2);
      g.fill({ color: Math.floor(this.time * 8) % 2 ? 0xff6040 : 0xffb030, alpha: 0.9 });
    }
    if (!active) return;
    const tb = this.beatClock;
    const k = Math.round(tb / p);
    const off = tb - k * p; // signed distance to the nearest beat
    const inWindow = Math.abs(off) <= M.beatWindow(this.run.wide);
    const toNext = ((p - (tb % p)) % p) / p; // 1 just after a beat -> 0 at the next
    if (!inWindow && toNext > 0.7) return;
    const gap = inWindow ? 0 : Math.round(toNext * 9);
    const color = inWindow ? 0xffe060 : 0xe8c04a;
    const alpha = inWindow ? 1 : 0.25 + 0.6 * (1 - toNext / 0.7);
    for (const t of this.tiles) {
      if (!this.alive(t) || t.kind === 'rubble') continue;
      const x = t.x + 1 - gap;
      const y = t.y + 1 - gap;
      const w = this.s + gap * 2;
      // Corner brackets (a full square would merge into a lattice with the neighbours).
      const a = inWindow ? 8 : 5;
      g.rect(x, y, a, 1).rect(x, y + 1, 1, a - 1);
      g.rect(x + w - a, y, a, 1).rect(x + w - 1, y + 1, 1, a - 1);
      g.rect(x, y + w - 1, a, 1).rect(x, y + w - a, 1, a - 1);
      g.rect(x + w - a, y + w - 1, a, 1).rect(x + w - 1, y + w - a, 1, a - 1);
    }
    g.fill({ color, alpha });
  }

  private updateUi(_dt: number): void {
    const r = this.run;
    const notation = this.ctx.game.save.meta.settings.notation;
    const fm = (n: number) => formatNum(n, notation);
    const c = this.ctx.content();
    const g = this.uiG.clear();

    // Status line: crit / zap / gems, or Frenzy pips once Goblin Frenzy is owned.
    const streak = this.drumActive() && this.streak > 1 ? `X${this.streak} ` : '';
    const gemsTxt = `${streak}${fm(this.per.gems)} GEM${this.per.gems === 1 ? '' : 'S'}`;
    this.statusR.set(gemsTxt, '#d090ff');
    this.statusR.position.set(c.x + c.w - 4 - measure(gemsTxt).w, this.statusY);
    if (this.drumActive() && r.frenzy > 0) {
      const need = M.frenzyPips(r.frenzy);
      if (this.frenzyT > 0) {
        this.status.set(`FRENZY ${this.frenzyT.toFixed(1)}S`, Math.floor(this.time * 8) % 2 ? '#ff6040' : '#ffe060');
      } else {
        this.status.set('FRENZY', C.inkDim);
        for (let i = 0; i < need; i++) {
          const x = c.x + 30 + i * 6;
          g.rect(x, this.statusY, 5, 5).fill(OUTLINE);
          g.rect(x + 1, this.statusY + 1, 3, 3).fill(i < this.pips ? 0xff6040 : 0x3a2a3a);
        }
      }
    } else {
      const zap = this.per.chain > 0 ? `  ZAP ${Math.round(M.chainChance(this.per.chain) * 100)}%` : '';
      this.status.set(`CRIT ${Math.round(M.critChance(r.critC) * 100)}% X${M.critMult(r.critP)}${zap}  CREW ${M.goblins(r)}/${M.MAX_GOBLINS}`, C.inkDim);
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
    if (r.maxDepth >= M.MAX_DEPTH) this.digBtn.setLabel('DIG', 'MAX').setEnabled(false);
    else {
      const cost = M.digCost(r.maxDepth);
      this.digBtn.setLabel(`DIG D${r.maxDepth + 1}`, fm(cost)).setEnabled(r.bank >= cost);
    }
    // Beat lamp: a small square left of the DIG button.
    if (this.drumActive()) {
      const lx = this.digBtn.x - 8;
      const ly = this.digBtn.y + 5;
      g.rect(lx, ly, 5, 5).fill(OUTLINE);
      g.rect(lx + 1, ly + 1, 3, 3).fill(this.beatPulse > 0 ? 0xffe060 : 0x5a3a20);
    }

    // Buttons.
    if (M.goblins(r) < M.MAX_GOBLINS) {
      const cost = M.hireCost(r);
      this.hireBtn.setLabel('HIRE GOBLIN', fm(cost)).setEnabled(r.bank >= cost);
    } else if (r.picks < M.PICKS_MAX) {
      const cost = M.picksCost(r.picks);
      this.hireBtn.setLabel('SHARPER PICKS', fm(cost)).setEnabled(r.bank >= cost);
    } else this.hireBtn.setLabel('CREW MAXED').setEnabled(false);
    if (this.per.drum) this.drumBtn.setLabel('DRUM', this.per.drumOn ? 'ON' : 'OFF');

    // "!" badge on UPGRADES when something is affordable (checked on the slow tick).
    // Onboarding glow on the button the current step needs.
    if (this.glowTarget && Math.floor(this.time * 3) % 2 === 0) {
      const b = this.glowTarget;
      const bw = b.width;
      const bh = b.height;
      g.rect(b.x - 2, b.y - 2, bw + 4, 1).rect(b.x - 2, b.y + bh + 1, bw + 4, 1).rect(b.x - 2, b.y - 1, 1, bh + 2).rect(b.x + bw + 1, b.y - 1, 1, bh + 2);
      g.fill(0xfff0a0);
    }
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
    // Onboarding glow.
    const step = this.obStep();
    this.glowTarget = step === 'tap' ? this.upgBtn : step === 'hire' ? this.hireBtn : step === 'dig' ? this.digBtn : null;
    // Drum ready.
    if (!this.per.drum && this.per.gems >= M.DRUM_GEMS && maxDepthEver(this.ctx) >= M.DRUM_DEPTH && !this.ctx.seen('m.drumReady')) {
      this.ctx.markSeen('m.drumReady');
      this.ctx.say('drumReady', { milestone: true });
    }
    // Ambient flavour (the core rate-limits non-milestone lines).
    this.flavorT -= 0.5;
    const intense = this.frenzyT > 0 || this.recentTaps >= 3 || this.tiles.some((t) => t.kind === 'keg' && t.fuse >= 0);
    this.recentTaps = 0;
    if (this.flavorT <= 0 && !intense) {
      this.flavorT = 40;
      this.ctx.say(this.per.drum && this.per.drumOn ? (rand() < 0.5 ? 'flavor' : 'flavorDrum') : 'flavor');
    }
  }

  resize(_layout: Layout): void {
    this.buildLayout();
    this.buildWall(false);
  }

  destroy(): void {
    this.hit.removeAllListeners();
    this.root.destroy({ children: true });
  }
}
