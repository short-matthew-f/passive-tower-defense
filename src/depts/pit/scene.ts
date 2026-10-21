// The War Pit scene (07 §10): the arena (rival row above, your line below, fronts on the left),
// the shop (5 units + 2 foods with freeze strips), the action row and, with no Run on screen,
// the live Skirmish over the Standing Warband with the Stakes panel and START RUN.
// Rendering: every CardView, PixelText and Button is created once and updated in place; one fx
// Graphics is redrawn per frame for a bounded particle pool; modal panels are built on open and
// destroyed on close.
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, SayOpts, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure, wrap } from '../../ui/font';
import { Button, C, drawPanel } from '../../ui/widgets';
import { PAL, beastTex, foodTex, statusTex } from './art';
import { CardView, CH, CW, STEP, type CardState } from './cards';
import {
  PLAYTEST_LOG_MAX,
  SKINS,
  SKIN_COST,
  buySkin,
  ownsSkin,
  skinOf,
  STAKES_MAX,
  TACTICS,
  crownsAtOrAbove,
  PIT_CROWNS,
  garrisonFighters,
  gauntletReport,
  heldCrownLevel,
  idleRateWith,
  lvOf,
  normalize,
  pitEcon,
  teethMult,
  runOpts,
  runGauntlet,
  runGauntletLog,
  importShade,
  importSigils,
  stakesCost,
  type PitPersistent,
  type PitRun,
  type PitSave,
} from './def';
import type { Fighter, Frame, Snap } from './engine';
import {
  SCAR_MAX,
  SCAR_STEP,
  WINS_TO_TRIUMPH,
  autoSlot,
  brand,
  buy,
  buyFood,
  fight,
  forfeit,
  lineCount,
  lvlOf,
  mergeLine,
  move,
  newRun,
  nextRival,
  roll,
  rollCost,
  runEndBonus,
  sell,
  sellValue,
  toggleFreeze,
  type FightOutcome,
  type Pet,
  type RivalInfo,
  type RunState,
} from './run';
import { sfx } from './sfx';
import { ARCHES, FOODS, UNITS, type UnitId } from './units';
import { anyAffordable, buildGroups } from './upgrades';

type Mode = 'home' | 'shop' | 'battle' | 'result' | 'summary';
type Group = 'shop' | 'food' | 'line' | 'rival';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

interface Play {
  frames: Frame[];
  i: number;
  t: number;
  dur: number;
  home: boolean;
  prev: Map<number, { side: 0 | 1; j: number; s: Snap }>;
  onDone: () => void;
}

const MAX_PARTICLES = 140;
/** Logical px a press must travel before it becomes a drag, and seconds before it is a hold. */
const DRAG_PX = 5;
const HOLD_S = 0.45;

interface Drag {
  g: Group;
  i: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  t: number; // press time (performance.now ms)
  moving: boolean;
}
const W178 = 5 * STEP - 2;

export class PitScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private save: PitSave;
  private run: PitRun;
  private per: PitPersistent;

  private arena = new Container();
  private bg = new Graphics();
  private fx = new Graphics();
  private ui = new Container();
  private shopLayer = new Container();
  private overlay: Container | null = null;

  private rivalCards: CardView[] = [];
  private lineCards: CardView[] = [];
  private shopCards: CardView[] = [];
  private foodCards: CardView[] = [];
  private strips: { c: Container; g: Graphics; t: PixelText; ice: Sprite; kind: 'unit' | 'food'; i: number }[] = [];

  private gritFull = new PixelText('', '#e05050');
  private gritEmpty = new PixelText('', '#5a3a4a');
  private runInfo = new PixelText('', '#f4e8c1');
  private rivalTag = new PixelText('', '#f4e8c1');
  private info = new PixelText('', '#f4e8c1');
  private chowIcon = new Sprite(foodTex('haunch'));
  private chowText = new PixelText('', '#e8c04a');
  private banner = new Container();
  private bannerBg = new Graphics();
  private bannerText = new PixelText('', '#f4e8c1');
  private bannerSub = new PixelText('', '#e8c04a');
  private stakesText = new PixelText('', '#f4e8c1');
  private crownText = new PixelText('', '#9c8aa8');
  private tacticG = new Graphics();
  private tacticBox = new Container();
  private homeHint = new PixelText('', '#9c8aa8');

  private rollBtn!: Button;
  private sellBtn!: Button;
  private fightBtn!: Button;
  private brandBtn!: Button;
  private pauseBtn!: Button;
  private speedBtn!: Button;
  private skipBtn!: Button;
  private startBtn!: Button;
  private forfeitBtn!: Button;
  private upBtn!: Button;
  private bandsBtn!: Button;
  private stakesDown!: Button;
  private stakesUp!: Button;
  private stakesBuy!: Button;
  private dropBtn!: Button;

  private mode: Mode = 'home';
  private sel: { g: Group; i: number } | null = null;
  private infoText = '';
  private infoHold = 0;
  private play: Play | null = null;
  private particles: Particle[] = [];
  private time = 0;
  private shake = 0;
  private sdTint = false;
  private bgKey = '';
  private idleAcc = 0;
  private idleT = 0;
  private resultT = 0;
  private resultNext: (() => void) | null = null;
  private lastOut: FightOutcome | null = null;
  private shown = { wins: 0, grit: 0, round: 1 };
  private scout: { key: string; info: RivalInfo } | null = null;
  private skirmish = { g: 0, r: 1, wait: 0.6 };
  private flavorT = 30;
  private groups: UpgradeGroup[];
  private upPulse = 0;
  // Drag and hold (07 §11), the sell bin's 2 s undo, the return ritual.
  private ghost = new Sprite();
  private drag: Drag | null = null;
  private eatTap = false;
  private undo: { snap: string; t: number } | null = null;
  private homeSel = -1;
  private summaryRects: Record<string, Rect> = {};
  private ritual: { t: number; end: number; tapped: number; resolve: (v: number) => void; btn: Button; label: PixelText; done: boolean; start?: () => void; finish?: () => void } | null = null;

  // Layout (stage px).
  private x0 = 0;
  private y0 = 0;
  private w = 0;
  private h = 0;
  private xL = 0;
  private T = 12;
  private yRival = 0;
  private yLine = 0;
  private yInfo = 0;
  private yShop = 0;
  private yFood = 0;
  private yAct = 0;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.save = ctx.save as PitSave;
    this.run = this.save.run;
    this.per = this.save.persistent;
    normalize(this.run, this.per);
    this.groups = buildGroups(ctx, { onBuy: (id) => this.onBuy(id) });

    // Tapping empty space clears the selection.
    const hit = new Container();
    hit.eventMode = 'static';
    hit.hitArea = new Rectangle(0, 0, 4000, 4000);
    hit.on('pointertap', () => this.clearSel());
    this.root.addChild(hit, this.arena, this.ui);
    this.ui.addChild(this.shopLayer);
    this.arena.addChild(this.bg);

    for (let i = 0; i < 5; i++) {
      const r = new CardView(() => this.tap('rival', i), i * 0.37, (e) => this.press('rival', i, e));
      const l = new CardView(() => this.tap('line', i), i * 0.53 + 0.2, (e) => this.press('line', i, e));
      this.rivalCards.push(r);
      this.lineCards.push(l);
      this.arena.addChild(r, l);
    }
    this.arena.addChild(this.fx);
    for (let i = 0; i < 6; i++) {
      const c = new CardView(() => this.tap('shop', i), i * 0.41, (e) => this.press('shop', i, e));
      this.shopCards.push(c);
      this.shopLayer.addChild(c);
      this.makeStrip('unit', i);
    }
    for (let i = 0; i < 2; i++) {
      const c = new CardView(() => this.tap('food', i), 0, (e) => this.press('food', i, e));
      this.foodCards.push(c);
      this.shopLayer.addChild(c);
      this.makeStrip('food', i);
    }
    this.ui.addChild(this.gritFull, this.gritEmpty, this.runInfo, this.rivalTag, this.info, this.chowIcon, this.chowText, this.stakesText, this.crownText, this.tacticBox, this.homeHint);
    this.tacticBox.addChild(this.tacticG);
    // The rival tag doubles as the scout button.
    this.rivalTag.eventMode = 'static';
    this.rivalTag.on('pointertap', (e) => {
      e.stopPropagation();
      this.explainRival();
    });
    this.stakesText.eventMode = 'static';
    this.stakesText.on('pointertap', (e) => {
      e.stopPropagation();
      this.explainStakes();
    });

    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    this.rollBtn = new Button({ w: 52, h: 20, label: 'ROLL', onTap: () => this.doRoll(), color: 0xc8a050, shade: 0x7a5a20 });
    this.sellBtn = new Button({ w: 46, h: 20, label: 'SELL', onTap: () => this.doSell(), color: 0xc05a3a, shade: 0x7a2a1a, textColor: C.ink });
    this.fightBtn = new Button({ w: 74, h: 20, label: 'FIGHT!', onTap: () => this.doFight() });
    this.brandBtn = new Button({ w: 50, h: 14, label: 'BRAND', onTap: () => this.doBrand(), color: C.gold, shade: 0x9a7a20 });
    this.pauseBtn = new Button({ w: 50, h: 14, label: 'PAUSE', onTap: () => this.pauseRun(), ...dark });
    this.speedBtn = new Button({ w: 52, h: 20, label: '1X', onTap: () => this.toggleSpeed(), ...dark });
    this.skipBtn = new Button({ w: 74, h: 20, label: 'SKIP', onTap: () => this.skipBattle(), ...dark });
    this.startBtn = new Button({ w: W178, h: 22, label: 'START RUN', onTap: () => this.startOrResume() });
    this.forfeitBtn = new Button({ w: 50, h: 22, label: 'FORFEIT', onTap: () => this.confirmForfeit(), color: C.red, shade: 0x7a2020, textColor: C.ink });
    this.upBtn = new Button({ w: 88, h: 18, label: 'UPGRADES', onTap: () => ctx.openUpgrades(this.groups), color: C.gold, shade: 0x9a7a20 });
    this.bandsBtn = new Button({ w: 88, h: 18, label: 'WARBANDS', onTap: () => this.openWarbands(), ...dark });
    this.stakesDown = new Button({ w: 16, h: 14, label: '-', onTap: () => this.setStakes(this.run.stakes - 1), ...dark });
    this.stakesUp = new Button({ w: 16, h: 14, label: '+', onTap: () => this.setStakes(this.run.stakes + 1), ...dark });
    this.stakesBuy = new Button({ w: 62, h: 14, label: 'BUY', onTap: () => this.buyStakes(), color: C.gold, shade: 0x9a7a20 });
    this.dropBtn = new Button({ w: 62, h: 14, label: 'DROP -2', onTap: () => this.setStakes(this.run.stakes - 2), color: 0x6ac8f0, shade: 0x2a6a8a });
    this.ui.addChild(this.rollBtn, this.sellBtn, this.fightBtn, this.brandBtn, this.pauseBtn, this.speedBtn, this.skipBtn, this.startBtn, this.forfeitBtn, this.upBtn, this.bandsBtn, this.stakesDown, this.stakesUp, this.stakesBuy, this.dropBtn);

    this.banner.addChild(this.bannerBg, this.bannerText, this.bannerSub);
    this.banner.visible = false;
    this.banner.eventMode = 'static';
    this.banner.on('pointertap', (e) => {
      e.stopPropagation();
      this.finishResult();
    });
    this.arena.addChild(this.banner);

    // Drag (07 §11 "drag works too") and hold-to-inspect follow the pointer at the root.
    this.ghost.visible = false;
    this.ghost.scale.set(2);
    this.ghost.alpha = 0.85;
    this.ghost.eventMode = 'none';
    this.root.addChild(this.ghost);
    this.root.eventMode = 'static';
    this.root.on('globalpointermove', (e) => this.dragMove(e));
    this.root.on('pointerup', () => this.release());
    this.root.on('pointerupoutside', () => this.release());
    this.tacticBox.eventMode = 'static';
    this.tacticBox.cursor = 'pointer';
    this.tacticBox.hitArea = new Rectangle(-2, -2, TACTICS.length * 18 + 2, 16);
    this.tacticBox.on('pointertap', (e) => {
      e.stopPropagation();
      this.explainCards();
    });
    this.crownText.eventMode = 'static';
    this.crownText.on('pointertap', (e) => {
      e.stopPropagation();
      this.explainCrowns();
    });

    this.layout();
    this.restore();
  }

  // ---------- setup ----------

  private makeStrip(kind: 'unit' | 'food', i: number): void {
    const c = new Container();
    const g = new Graphics();
    const t = new PixelText('', '#9c8aa8');
    const ice = new Sprite(statusTex('frozen'));
    c.addChild(g, t, ice);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new Rectangle(0, -1, 34, 12);
    c.on('pointertap', (e) => {
      e.stopPropagation();
      this.doFreeze(kind, i);
    });
    this.strips.push({ c, g, t, ice, kind, i });
    this.shopLayer.addChild(c);
  }

  /** Resume where the save left off: an ended Run's summary, a paused Run's shop, or home. */
  private restore(): void {
    const rs = this.run.cur;
    if (rs) {
      if (rs.pend) {
        this.creditBattle(rs);
      }
      if (rs.ended) {
        this.finalizeRun(rs);
        this.showSummary();
        return;
      }
      this.syncShown();
      this.setMode('shop');
    } else this.setMode('home');
  }

  private layout(): void {
    const c = this.ctx.content();
    this.x0 = c.x;
    this.y0 = c.y;
    this.w = c.w;
    this.h = c.h;
    this.xL = c.x + Math.max(0, Math.floor((c.w - W178) / 2));
    this.T = Math.max(12, Math.min(44, c.h - 258));
    const gx = Math.max(0, Math.min(64, c.h - (this.T + 245)));
    this.yRival = c.y + this.T + 9;
    this.yLine = this.yRival + 48 + gx;
    this.yInfo = this.yLine + 42;
    this.yShop = this.yInfo + 18;
    this.yFood = this.yShop + 52;
    this.yAct = this.yFood + 53;
    const xL = this.xL;
    for (let i = 0; i < 5; i++) {
      this.rivalCards[i].bx = xL + i * STEP;
      this.rivalCards[i].by = this.yRival;
      this.lineCards[i].bx = xL + i * STEP;
      this.lineCards[i].by = this.yLine;
    }
    for (let i = 0; i < 6; i++) {
      // Up to 5 slots in a row; a 6th (level-up bonus) squeezes in over the food row's right side.
      const cx = i < 5 ? xL + i * STEP : xL + 4 * STEP;
      const cy = i < 5 ? this.yShop : this.yFood;
      this.shopCards[i].bx = cx;
      this.shopCards[i].by = cy;
    }
    for (let i = 0; i < 2; i++) {
      this.foodCards[i].bx = xL + i * STEP;
      this.foodCards[i].by = this.yFood;
    }
    for (const s of this.strips) {
      const card = s.kind === 'unit' ? this.shopCards[s.i] : this.foodCards[s.i];
      s.c.position.set(card.bx, card.by + 41);
    }
    const yb = this.y0 + this.T - 10;
    this.gritFull.position.set(xL, yb);
    this.runInfo.position.set(xL + 40, yb);
    this.rivalTag.position.set(xL, this.yRival - 8);
    this.info.position.set(xL, this.yInfo + 1);
    this.chowIcon.position.set(xL + 74, this.yFood + 1);
    this.chowText.position.set(xL + 88, this.yFood + 3);
    this.brandBtn.position.set(xL + 74, this.yFood + 13);
    this.pauseBtn.position.set(xL + 128, this.yFood + 13);
    this.rollBtn.position.set(xL, this.yAct);
    this.sellBtn.position.set(xL + 56, this.yAct);
    this.fightBtn.position.set(xL + W178 - 74, this.yAct);
    this.speedBtn.position.set(xL, this.yAct);
    this.skipBtn.position.set(xL + W178 - 74, this.yAct);
    // Home panel.
    const ys = this.yShop;
    this.stakesText.position.set(xL + 2, ys + 4);
    this.stakesDown.position.set(xL + 60, ys);
    this.stakesUp.position.set(xL + 78, ys);
    this.stakesBuy.position.set(xL + W178 - 62, ys);
    this.dropBtn.position.set(xL + W178 - 62, ys + 17);
    this.tacticBox.position.set(xL, ys + 17);
    this.crownText.position.set(xL + 2, ys + 34);
    this.startBtn.position.set(xL, ys + 46);
    this.forfeitBtn.position.set(xL + W178 - 50, ys + 46);
    this.upBtn.position.set(xL, ys + 74);
    this.bandsBtn.position.set(xL + W178 - 88, ys + 74);
    this.homeHint.position.set(xL, ys + 96);
    this.bgKey = '';
  }

  private drawBg(): void {
    const key = `${this.mode}|${this.sdTint}|${this.w}|${this.h}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    const g = this.bg.clear();
    const { x0, y0, w, h } = this;
    const L = this.ctx.layout;
    // Full-bleed backdrop (under the side insets too).
    g.rect(0, y0, L.w, L.h - y0).fill(PAL.wall);
    // Cage bars in the top band.
    g.rect(0, y0, L.w, this.T).fill(PAL.bar);
    for (let x = x0 + 3; x < x0 + w; x += 8) g.rect(x, y0, 2, this.T).fill(PAL.iron);
    g.rect(0, y0 + this.T - 12, L.w, 12).fill({ color: PAL.bar, alpha: 0.85 });
    // Sand ring from the rival row to below your line.
    const sandTop = this.yRival - 10;
    const sandBot = this.yLine + 42;
    g.rect(0, sandTop, L.w, sandBot - sandTop).fill(this.sdTint ? PAL.sandRed : PAL.sand);
    for (let i = 0; i < 40; i++) {
      const sx = x0 + ((i * 53) % Math.max(1, w));
      const sy = sandTop + ((i * 29) % Math.max(1, sandBot - sandTop));
      g.rect(sx, sy, 2, 1).fill(i % 2 ? PAL.sandHi : PAL.sandLo);
    }
    g.rect(0, sandTop, L.w, 1).fill(PAL.sandHi);
    // Clash line.
    const mid = Math.floor((this.yRival + 40 + this.yLine) / 2);
    for (let x = this.xL; x < this.xL + W178; x += 6) g.rect(x, mid, 3, 1).fill(PAL.sandLo);
    // Shop counter (wood) below the info line.
    g.rect(0, this.yInfo - 1, L.w, L.h - this.yInfo + 1).fill(0x2a1a14);
    g.rect(0, this.yInfo - 1, L.w, 1).fill(0x5a3a24);
    g.rect(0, this.yShop - 2, L.w, 1).fill(0x3a2418);
    void h;
  }

  // ---------- modes ----------

  private setMode(m: Mode): void {
    this.mode = m;
    this.sel = null;
    if (m !== 'battle') {
      this.play = null;
      this.sdTint = false;
    }
    this.banner.visible = false;
    this.shopLayer.visible = m === 'shop';
    this.forfeitBtn.visible = false;
    this.dropBtn.visible = false;
    const run = m === 'shop' || m === 'battle' || m === 'result';
    const shopUi = m === 'shop';
    this.rollBtn.visible = this.sellBtn.visible = this.fightBtn.visible = shopUi;
    this.brandBtn.visible = this.pauseBtn.visible = shopUi;
    this.chowIcon.visible = this.chowText.visible = shopUi;
    this.speedBtn.visible = this.skipBtn.visible = m === 'battle' || m === 'result';
    const home = m === 'home';
    for (const b of [this.startBtn, this.upBtn, this.bandsBtn, this.stakesDown, this.stakesUp, this.stakesBuy]) b.visible = home;
    this.stakesText.visible = this.crownText.visible = this.tacticBox.visible = this.homeHint.visible = home;
    for (const c of this.shopCards) c.visible = run;
    for (const c of this.foodCards) c.visible = run;
    for (const s of this.strips) s.c.visible = shopUi;
    this.gritFull.visible = this.gritEmpty.visible = run;
    this.homeSel = -1;
    if (home) {
      this.skirmish.wait = 0.4;
      this.skirmishArch = undefined;
      if (this.per.crests >= SKIN_COST && this.run.garrison.length) this.ctx.lesson('skins');
    }
    if (m === 'shop') {
      this.scout = null;
      this.updateShop();
    }
    this.bgKey = '';
    this.refresh();
  }

  private syncShown(): void {
    const rs = this.run.cur;
    if (!rs) return;
    this.shown = { wins: rs.wins, grit: rs.grit, round: rs.round };
  }

  // ---------- home: Stakes, Skirmish, Run start ----------

  private startOrResume(): void {
    if (this.run.cur) {
      this.syncShown();
      this.setMode('shop');
      return;
    }
    const opts = runOpts(this.save);
    if (opts.carry) this.per.carry = null;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.run.cur = newRun(seed, this.run.stakes, opts, Date.now());
    this.run.cur.earned = 0;
    this.syncShown();
    sfx.whistle(this.vol());
    this.ctx.saveSoon();
    this.setMode('shop');
    if (this.run.stakes >= 1 && (this.run.cur.stakes ?? 0) >= 1) this.setInfo(`STAKES ${this.run.stakes}: PAY X${(1.22 ** this.run.stakes).toFixed(2)}, RIVALS TOUGHER`, 4);
  }

  private pauseRun(): void {
    sfx.tap(this.vol());
    this.ctx.saveSoon();
    this.setMode('home');
    this.setInfo('RUN PAUSED. RESUME ANY TIME.', 3);
  }

  private confirmForfeit(): void {
    const rs = this.run.cur;
    if (!rs) return;
    this.openPanel('FORFEIT?', ['ENDS THE RUN AS A RETREAT.', 'EVERYTHING IS BANKED, BONUS TOO.'], [
      { label: 'FORFEIT', color: C.red, onTap: () => {
        forfeit(rs);
        this.finalizeRun(rs);
        this.showSummary();
      } },
      { label: 'KEEP', onTap: () => this.closePanel() },
    ]);
  }

  private setStakes(s: number): void {
    const v = Math.max(0, Math.min(this.run.stakesBought, s));
    if (v === this.run.stakes) {
      sfx.deny(this.vol());
      return;
    }
    this.run.stakes = v;
    this.ctx.markSeen('pit.stakesSet');
    sfx.tap(this.vol());
    this.explainStakes();
    this.ctx.saveSoon();
  }

  /** Snarl's struggle offer (07 §4): "Drop Stakes by 2?" in one tap. Lowering is free. */
  private dropStakes(): void {
    if (this.run.cur && !this.run.cur.ended) return;
    this.setStakes(this.run.stakes - 2);
    this.run.stats.lowRetreats = 0;
  }

  private buyStakes(): void {
    const b = this.run.stakesBought;
    if (b >= STAKES_MAX) return;
    if (!this.ctx.spend(stakesCost(b))) {
      sfx.deny(this.vol());
      return;
    }
    this.run.stakesBought = b + 1;
    this.run.stakes = b + 1;
    sfx.levelUp(this.vol());
    this.ctx.haptic(15);
    const L = b + 1;
    // dial_raised (00 §5.4.3, 07 §18): level 1 runs the Stakes lesson, then every 3rd level (each
    // brings a tactics card) and every new all-time high; re-buying after a Fall stays silent.
    const best = this.ctx.game.save.depts.pit?.seen['pit.stakesMax'] ?? 0;
    if (L === 1) this.ctx.lesson('stakes');
    else if (L % 3 === 0) {
      this.say('dialRaised', { type: 'dial_raised', key: `stakes${L}` });
      if (L > 3) this.ctx.lesson('cards');
    } else if (L > best) this.say('stakesMax', { type: 'dial_raised', key: `max${L}` });
    if (L > best) this.save.seen['pit.stakesMax'] = L;
    this.explainStakes();
    this.ctx.saveSoon();
  }

  private explainCards(): void {
    const S = this.run.stakes;
    this.ctx.markSeen('pit.tactics');
    if (S >= 6 || this.run.stakesBought >= 6) this.ctx.markSeen('pit.tactics2');
    const lines = TACTICS.map((t) => `${S >= t.at ? '+' : '-'} ${t.at} ${t.name}: ${t.text}`);
    this.openPanel(`TACTICS CARDS (STAKES ${S})`, [...lines, 'ACTIVE AT OR ABOVE THEIR LEVEL.'], [{ label: 'GOT IT', onTap: () => this.closePanel() }]);
  }

  private explainCrowns(): void {
    const target = pitEcon.skillTarget(this.save.cycle.n);
    const sc = this.run.scars ?? 0;
    this.setInfo(`PIT CROWN: BEAT THE HUNTMASTER AT STAKES ${target}+.${sc ? ` HE CARRIES ${sc} SCAR${sc > 1 ? 'S' : ''}: -${Math.round(sc * SCAR_STEP * 100)}% HIS PARTY.` : ' EACH LOST BOUT THERE SCARS HIM.'}`, 6);
  }

  private explainStakes(): void {
    const S = this.run.stakes;
    const next = TACTICS.find((t) => t.at > S);
    const act = TACTICS.filter((t) => t.at <= S).map((t) => t.name).join(', ');
    this.setInfo(`STAKES ${S}: PAY X${(1.22 ** S).toFixed(2)}${act ? `. CARDS: ${act}` : ''}${next ? `. AT ${next.at}: ${next.name}` : ''}. TAP THE CARDS TO READ.`, 5);
  }

  private explainRival(): void {
    if (this.mode === 'home') {
      this.setInfo('SKIRMISH: YOUR STANDING WARBAND VS 12 ROUNDS OF RIVALS, NONSTOP.', 5);
      return;
    }
    const riv = this.scoutInfo();
    if (!riv) return;
    this.ctx.markSeen('pit.scout');
    if (riv.arch === 'hunt') {
      const sc = this.run.cur?.opts.scars ?? 0;
      const oath = (this.run.cur?.stakes ?? 0) >= 18 && (this.run.cur?.pv ?? 0) >= 3;
      this.setInfo(`THE HUNTMASTER: NETS YOUR TOP ATTACKER, HIS BEASTS +1 ATK. ARMOR 2.${oath ? ' OATH: REVIVES ONCE.' : ''}${sc ? ` SCARRED X${sc}: -${Math.round(sc * SCAR_STEP * 100)}%.` : ''}`, 6);
      return;
    }
    const a = ARCHES[riv.arch];
    const bias = a.bias.map((k) => UNITS[k].name.split(' ').pop()).join(', ');
    this.setInfo(`${a.name.toUpperCase()} TAMER: LIKES ${bias}.${lvOf(this.run, 'scout') ? '' : ' STATS: BUY SCOUTING.'}`, 6);
  }

  /** Teeth/min of the Standing Warband (on-screen idle, with core multipliers). */
  private idlePerMin(): number {
    return pitEcon.idleRate(this.save) * this.ctx.mult() * 60;
  }

  private openWarbands(): void {
    const hist = this.run.history;
    if (!hist.length) {
      this.setInfo('FINISH A RUN TO STATION ITS WARBAND HERE.', 4);
      return;
    }
    const lines = [`NOW: ${formatNum(this.idlePerMin())}/MIN`];
    const buttons = hist.map((band, i) => ({
      label: `#${i + 1} ${formatNum(idleRateWith(this.save, band) * this.ctx.mult() * 60)}/MIN`,
      icons: band.map((p) => p.k),
      onTap: () => {
        this.station(band);
        this.closePanel();
      },
    }));
    this.openPanel('WARBANDS', lines, [...buttons, { label: 'CLOSE', onTap: () => this.closePanel() }]);
  }

  private station(band: Pet[]): void {
    this.run.garrison = band.map((p) => ({ ...p }));
    this.per.guard = band.map((p) => ({ ...p })); // Old Guard (00 §2.5) keeps the last one
    this.run.stats.stations++;
    sfx.whistle(this.vol());
    this.skirmish = { g: 0, r: 1, wait: 0.5 };
    this.play = null;
    this.ctx.saveSoon();
  }

  // ---------- the shop ----------

  private scoutInfo(): RivalInfo | null {
    const rs = this.run.cur;
    if (!rs) return null;
    const key = `${rs.seed}|${rs.round}|${rs.wins}|${rs.stakes}|${rs.huntB}`;
    if (!this.scout || this.scout.key !== key) this.scout = { key, info: nextRival(rs) };
    return this.scout.info;
  }

  private tap(g: Group, i: number): void {
    if (this.eatTap) {
      this.eatTap = false;
      return;
    }
    if (this.overlay || this.ritual) return;
    if (this.mode === 'result') {
      this.finishResult();
      return;
    }
    if (this.mode === 'home' && g === 'line' && !this.play && this.run.garrison[i]) {
      // Standing Warband: tap to read, tap again for its skins (07 §6D Crest sink).
      if (this.homeSel === i) this.openSkins(this.run.garrison[i].k);
      else {
        this.homeSel = i;
        this.inspect(g, i);
        this.setInfo(`${this.infoText} TAP AGAIN: SKINS.`, 6);
      }
      return;
    }
    if (this.mode === 'home' || this.mode === 'battle') {
      this.inspect(g, i);
      return;
    }
    if (this.mode !== 'shop') return;
    const rs = this.run.cur!;
    const v = this.vol();
    const sel = this.sel;
    if (g === 'rival') {
      this.inspect(g, i);
      return;
    }
    if (g === 'shop') {
      const s = rs.shop[i];
      if (!s) return;
      if (sel && sel.g === 'shop' && sel.i === i) {
        // Second tap: quick buy into the first fitting slot.
        const slot = autoSlot(rs, s.k);
        if (slot < 0) {
          this.setInfo('LINE FULL. SELL ONE, OR TAP A TWIN TO MERGE.', 3);
          sfx.deny(v);
        } else this.doBuy(i, slot);
        return;
      }
      this.sel = { g: 'shop', i };
      sfx.tap(v);
      this.inspect(g, i);
      this.updateShop();
      return;
    }
    if (g === 'food') {
      const f = rs.food[i];
      if (!f) return;
      if (FOODS[f.f].all && sel && sel.g === 'food' && sel.i === i) {
        this.doFood(i, 0);
        return;
      }
      this.sel = { g: 'food', i };
      sfx.tap(v);
      this.inspect(g, i);
      this.updateShop();
      return;
    }
    // Line slot.
    if (sel?.g === 'shop') {
      this.doBuy(sel.i, i);
      return;
    }
    if (sel?.g === 'food') {
      this.doFood(sel.i, i);
      return;
    }
    if (sel?.g === 'line') {
      if (sel.i === i) {
        this.clearSel();
        return;
      }
      const a = rs.line[sel.i];
      const b = rs.line[i];
      if (a && b && a.k === b.k && b.xp < 5) {
        const lv = mergeLine(rs, sel.i, i);
        this.onMerged(i, lv > 0 ? lv : undefined);
      } else {
        this.undo = null;
        move(rs, sel.i, i);
        this.ctx.markSeen('pit.move');
        sfx.tap(v);
        this.lineCards[i].pop = 1;
        this.lineCards[sel.i].pop = 1;
      }
      this.sel = null;
      this.updateShop();
      this.ctx.saveSoon();
      return;
    }
    if (rs.line[i]) {
      this.sel = { g: 'line', i };
      sfx.tap(v);
      this.inspect(g, i);
      this.updateShop();
    }
  }

  private doBuy(shopI: number, slot: number): void {
    this.undo = null;
    const rs = this.run.cur!;
    const s = rs.shop[shopI];
    if (!s) return;
    if (rs.chow < 3) {
      this.setInfo('NOT ENOUGH CHOW. FIGHT FOR MORE NEXT ROUND.', 3);
      sfx.deny(this.vol());
      return;
    }
    const target = rs.line[slot];
    if (target && target.k !== s.k) {
      // Occupied by another beast: shuffle toward the nearest empty slot to make room.
      if (!this.makeRoom(rs, slot)) {
        this.setInfo('LINE FULL. SELL ONE FIRST.', 3);
        sfx.deny(this.vol());
        return;
      }
    }
    const res = buy(rs, shopI, slot);
    if (!res.ok) {
      sfx.deny(this.vol());
      return;
    }
    // A placement after the first buy counts as lining up (onboarding beat "line").
    if (this.ctx.seen('pit.buy') && (!target || target.k !== s.k)) this.ctx.markSeen('pit.move');
    this.ctx.markSeen('pit.buy');
    this.sel = null;
    const card = this.lineCards[slot];
    card.pop = 1;
    if (res.merged) this.onMerged(slot, res.levelUp);
    else {
      sfx.buy(this.vol());
      this.ctx.haptic(8);
    }
    for (const j of res.buffed ?? []) {
      this.lineCards[j].pulse = 1;
      this.ctx.float('+ATK', this.lineCards[j].bx + 17, this.yLine - 4, '#f0a040');
    }
    this.updateShop();
    this.ctx.saveSoon();
  }

  /** Shift line units from `slot` toward the nearest empty slot. */
  private makeRoom(rs: RunState, slot: number): boolean {
    let best = -1;
    for (let d = 1; d < 5 && best < 0; d++) {
      if (slot + d < 5 && !rs.line[slot + d]) best = slot + d;
      else if (slot - d >= 0 && !rs.line[slot - d]) best = slot - d;
    }
    if (best < 0) return false;
    const dir = best > slot ? 1 : -1;
    for (let j = best; j !== slot; j -= dir) rs.line[j] = rs.line[j - dir];
    rs.line[slot] = null;
    return true;
  }

  private onMerged(slot: number, levelUp: number | undefined): void {
    const rs = this.run.cur!;
    this.ctx.markSeen('pit.merge');
    const card = this.lineCards[slot];
    card.pulse = 1;
    this.burst(card.bx + 17, this.yLine + 16, 0xf4e8c1, 10);
    this.ctx.float('+1/+1', card.bx + 17, this.yLine - 6, '#8fd14f');
    if (levelUp) {
      sfx.levelUp(this.vol());
      this.ctx.haptic(25);
      this.burst(card.bx + 17, this.yLine + 16, PAL.gold, 22);
      this.ctx.float(`LEVEL ${levelUp}!`, card.bx + 17, this.yLine - 14, '#e8c04a');
      if (levelUp >= 3) {
        this.per.life.l3++;
        this.say('tierL3', { type: 'tier_reached', key: 'l3' });
      }
      this.setInfo('LEVEL UP! A BONUS BEAST JOINED THE SHOP.', 3);
    } else {
      sfx.merge(this.vol());
      this.ctx.haptic(12);
    }
    if (!this.ctx.seen('pit.mergeSaid')) {
      this.ctx.markSeen('pit.mergeSaid');
      this.say('merge');
    }
    void rs;
  }

  private doFood(foodI: number, slot: number): void {
    this.undo = null;
    const rs = this.run.cur!;
    const f = rs.food[foodI];
    if (!f) return;
    if (rs.chow < FOODS[f.f].cost) {
      this.setInfo('NOT ENOUGH CHOW.', 2);
      sfx.deny(this.vol());
      return;
    }
    if (!buyFood(rs, foodI, slot)) {
      sfx.deny(this.vol());
      return;
    }
    this.sel = null;
    sfx.buy(this.vol());
    this.ctx.haptic(8);
    const def = FOODS[f.f];
    const targets = def.all ? [0, 1, 2, 3, 4].filter((j) => rs.line[j]) : [slot];
    for (const j of targets) {
      this.lineCards[j].pulse = 1;
      this.burst(this.lineCards[j].bx + 17, this.yLine + 16, 0xe05050, 6);
    }
    this.setInfo(`${def.name.toUpperCase()}: ${def.text}`, 2.5);
    this.updateShop();
    this.ctx.saveSoon();
  }

  private doSell(): void {
    if (this.undo) {
      this.undoSell();
      return;
    }
    const rs = this.run.cur;
    if (!rs || this.sel?.g !== 'line') {
      this.setInfo('TAP ONE OF YOUR BEASTS, THEN SELL.', 2.5);
      return;
    }
    this.sellAt(this.sel.i);
  }

  /** Sells line slot i (button or sell-bin drag) with a 2 s undo (07 §11). */
  private sellAt(i: number): void {
    const rs = this.run.cur;
    const p = rs?.line[i];
    if (!rs || !p) return;
    this.undo = { snap: JSON.stringify(rs), t: 2 };
    const gain = sell(rs, i);
    sfx.sell(this.vol());
    this.ctx.float(`+${gain} CHOW`, this.lineCards[i].bx + 17, this.yLine + 8, '#e8c04a');
    this.burst(this.lineCards[i].bx + 17, this.yLine + 16, 0x9c8aa8, 8);
    this.sel = null;
    this.updateShop();
    this.ctx.saveSoon();
  }

  private undoSell(): void {
    const rs = this.run.cur;
    const u = this.undo;
    this.undo = null;
    if (!rs || !u || this.mode !== 'shop') return;
    Object.assign(rs, JSON.parse(u.snap));
    sfx.tap(this.vol());
    this.setInfo('SALE UNDONE.', 1.5);
    this.updateShop();
    this.ctx.saveSoon();
  }

  private doRoll(): void {
    this.undo = null;
    const rs = this.run.cur;
    if (!rs) return;
    if (!roll(rs)) {
      this.setInfo('NO CHOW TO ROLL.', 2);
      sfx.deny(this.vol());
      return;
    }
    sfx.roll(this.vol());
    if (!this.ctx.seen('pit.frozen')) this.ctx.lesson('freeze');
    this.sel = null;
    for (const c of this.shopCards) c.pop = 1;
    this.updateShop();
    this.ctx.saveSoon();
  }

  private doFreeze(kind: 'unit' | 'food', i: number): void {
    const rs = this.run.cur;
    if (!rs || this.mode !== 'shop') return;
    toggleFreeze(rs, kind, i);
    this.ctx.markSeen('pit.frozen');
    sfx.freeze(this.vol());
    const s = kind === 'unit' ? rs.shop[i] : rs.food[i];
    if (s) this.setInfo(s.fz ? 'FROZEN: STAYS THROUGH ROLLS AND ROUNDS.' : 'UNFROZEN.', 2);
    this.updateShop();
  }

  private doBrand(): void {
    this.undo = null;
    const rs = this.run.cur;
    if (!rs) return;
    if (rs.brandUsed) {
      this.setInfo('ROYAL BRAND ALREADY USED THIS RUN.', 2);
      return;
    }
    if (this.sel?.g !== 'line' || !rs.line[this.sel.i]) {
      this.setInfo('ROYAL BRAND: TAP A BEAST, THEN BRAND. +50% ATK & HP. ONCE PER RUN.', 4);
      return;
    }
    const i = this.sel.i;
    brand(rs, i);
    this.ctx.markSeen('pit.branded');
    sfx.levelUp(this.vol());
    this.ctx.haptic(20);
    this.burst(this.lineCards[i].bx + 17, this.yLine + 16, PAL.gold, 18);
    this.ctx.float('BRANDED!', this.lineCards[i].bx + 17, this.yLine - 8, '#e8c04a');
    this.sel = null;
    this.updateShop();
    this.ctx.saveSoon();
  }

  private clearSel(): void {
    if (this.sel) {
      this.sel = null;
      this.updateShop();
    }
  }

  private inspect(g: Group, i: number): void {
    const rs = this.run.cur;
    let text = '';
    if (g === 'shop' && rs?.shop[i]) {
      const s = rs.shop[i]!;
      const d = UNITS[s.k];
      text = `${d.name} T${d.tier} ${s.a}/${s.h}: ${d.text(1)}${d.shopOnly ? ' (NOT IN SKIRMISHES)' : ''}. TAP AGAIN TO BUY, OR TAP A SLOT.`;
    } else if (g === 'food' && rs?.food[i]) {
      const f = FOODS[rs.food[i]!.f];
      text = `${f.name} (${f.cost}): ${f.text}. ${f.all ? 'TAP AGAIN TO FEED ALL.' : 'TAP A BEAST TO FEED.'}`;
    } else if (g === 'line') {
      const st = this.lineCards[i].state;
      if (st?.k) {
        const d = UNITS[st.k];
        const L = st.lvl ?? 1;
        const p = rs && this.mode === 'shop' ? rs.line[i] : null;
        text = `${d.name} L${L} ${st.a}/${st.h}: ${d.text(L)}${p ? `. SELL +${sellValue(p) + (p.k === 'piglet' ? L : 0)}` : ''}`;
      }
    } else if (g === 'rival') {
      const st = this.rivalCards[i].state;
      if (st?.k) {
        const d = UNITS[st.k];
        text = `${d.name}${st.hide ? '' : ` L${st.lvl ?? 1} ${st.a}/${st.h}`}: ${d.text(st.hide ? 1 : (st.lvl ?? 1))}`;
      }
    }
    if (text) this.setInfo(text, 6);
  }

  private setInfo(text: string, hold: number): void {
    this.infoText = text;
    this.infoHold = hold;
    this.info.set(wrap(text.toUpperCase(), W178) || ' ', '#f4e8c1');
  }

  // ---------- fighting ----------

  private doFight(): void {
    this.undo = null;
    const rs = this.run.cur;
    if (!rs || this.mode !== 'shop') return;
    if (!lineCount(rs)) {
      this.setInfo('NO BEASTS IN YOUR LINE. BUY ONE FIRST.', 3);
      sfx.deny(this.vol());
      return;
    }
    this.syncShown();
    const out = fight(rs, true);
    rs.pend = (rs.pend ?? 0) + out.teeth;
    this.lastOut = out;
    this.ctx.saveSoon();
    sfx.whistle(this.vol());
    this.setMode('battle');
    this.setInfo(out.hunt ? 'THE HUNTMASTER BOUT!' : `ROUND ${out.round}: FIGHT!`, 99);
    this.startPlay(out.result.frames, false, () => this.endBattle());
  }

  private startPlay(frames: Frame[], home: boolean, onDone: () => void): void {
    this.play = { frames, i: -1, t: 0, dur: 0, home, prev: new Map(), onDone };
    this.sdTint = false;
    this.advance();
  }

  private speed(): number {
    return this.run.speed ?? 1;
  }

  private toggleSpeed(): void {
    this.run.speed = this.speed() === 1 ? 2 : this.speed() === 2 ? 4 : 1;
    this.speedBtn.setLabel(`${this.run.speed}X`);
  }

  private skipBattle(): void {
    if (this.mode === 'result') {
      this.finishResult();
      return;
    }
    const p = this.play;
    if (!p || p.home) return;
    if (p.i >= p.frames.length - 2) return;
    p.i = p.frames.length - 2;
    p.t = 0;
    this.advance(true);
  }

  private advance(quiet = false): void {
    const p = this.play;
    if (!p) return;
    p.i++;
    p.t = 0;
    if (p.i >= p.frames.length) {
      const done = p.onDone;
      this.play = null;
      done();
      return;
    }
    const f = p.frames[p.i];
    this.applyFrame(f, p, quiet || p.i === 0);
    p.dur = f.e === 'hit' ? 0.55 : f.e === 'faint' ? 0.3 : f.e === 'trig' ? 0.4 : f.e === 'end' ? 0.6 : 0.4;
  }

  private applyFrame(f: Frame, p: Play, quiet: boolean): void {
    const views: [CardView[], CardView[]] = [this.lineCards, this.rivalCards];
    const ys = [this.yLine, this.yRival];
    const now = new Map<number, { side: 0 | 1; j: number; s: Snap }>();
    ([0, 1] as const).forEach((side) => f.lines[side].forEach((s, j) => now.set(s.u, { side, j, s })));
    const v = this.vol() * (p.home ? 0.35 : 1);
    if (!quiet) {
      for (const [uid, old] of p.prev) {
        if (!now.has(uid)) {
          const x = this.xL + old.j * STEP + 17;
          this.burst(x, ys[old.side] + 18, 0xc8b8a0, 12);
          if (!p.home) sfx.faint(v);
        }
      }
    }
    for (const side of [0, 1] as const) {
      for (let j = 0; j < 5; j++) {
        const card = views[side][j];
        const s = f.lines[side][j];
        if (!s) {
          card.setState(null);
          continue;
        }
        const old = p.prev.get(s.u);
        if (!quiet) {
          if (old && old.j !== j) card.offX = (old.j - j) * STEP;
          if (!old && p.i > 0) {
            card.pop = 1;
            card.offX = 0;
          }
          if (old && !p.home) {
            const dh = s.h - old.s.h;
            const da = s.a - old.s.a;
            const x = this.xL + j * STEP + 17;
            if (dh < 0) this.ctx.float(`${dh}`, x, ys[side] + 10, '#ff6a5a');
            else if (dh > 0) this.ctx.float(`+${dh}`, x, ys[side] + 10, '#8fd14f');
            if (da > 0) this.ctx.float(`+${da}A`, x, ys[side] - 2, '#f0a040');
            else if (da < 0) this.ctx.float(`${da}A`, x, ys[side] - 2, '#c0a0a0');
          }
        }
        card.setState(this.snapState(s, side));
      }
    }
    if (!quiet) {
      if (f.e === 'hit' && f.hit) {
        let big = false;
        for (const uid of f.hit) {
          const e = now.get(uid) ?? p.prev.get(uid);
          if (!e) continue;
          const c = views[e.side][e.j];
          c.offY = e.side === 0 ? -7 : 7;
          views[e.side === 0 ? 1 : 0][0].flash = 1;
          if (e.s.a >= 6) big = true;
        }
        if (big && !p.home) this.shake = 0.15;
        sfx.hit(v, big);
      } else if (f.e === 'trig' && f.src !== undefined) {
        const e = now.get(f.src) ?? p.prev.get(f.src);
        if (e) views[e.side][e.j].pulse = 1;
        if (!p.home) sfx.trig(v);
      }
    }
    if (this.ritual && this.ritual.end < 0 && f.lines[1].length === 0) this.ritual.end = this.ritual.t;
    if (f.ex >= 50 && !this.sdTint) {
      this.sdTint = true;
      this.bgKey = '';
    }
    p.prev = now;
  }

  private snapState(s: Snap, side: 0 | 1): CardState {
    const arch = this.play?.home ? this.skirmishArch : this.lastOut?.rival.arch;
    const rival = side === 1 ? (arch && arch !== 'hunt' ? ARCHES[arch].color : 0xe04040) : undefined;
    return { k: s.k, a: s.a, h: Math.max(0, s.h), lvl: s.l, it: s.it, brand: s.b, armor: s.ar, thorns: s.th, skip: s.sk, rival, skin: side === 0 ? skinOf(this.per, s.k) : 0 };
  }

  private endBattle(): void {
    const rs = this.run.cur;
    const out = this.lastOut;
    if (!rs || !out) {
      this.setMode('home');
      return;
    }
    const teeth = this.creditBattle(rs);
    const v = this.vol();
    let title = '';
    let color = '#f4e8c1';
    if (out.outcome === 1) {
      title = out.hunt ? 'HUNTMASTER DOWN!' : 'WIN!';
      color = '#8fd14f';
      sfx.win(v);
      this.ctx.haptic(20);
      this.per.life.battlesWon++;
      this.run.stats.battlesWon++;
      for (const c of this.lineCards) if (c.state) c.pulse = 0.8;
    } else if (out.outcome === 0) {
      title = 'DRAW';
      sfx.tap(v);
    } else {
      title = out.gritLost ? 'LOSS  -1 GRIT' : 'LOSS (FREE)';
      color = '#e05050';
      sfx.lose(v);
    }
    this.showBanner(title, `+${formatNum(teeth)} TEETH`, color);
    this.ctx.markSeen('pit.fight');
    this.mode = 'result';
    this.resultT = out.ended ? 2.2 : 1.6;
    this.resultNext = () => {
      if (rs.ended) {
        this.finalizeRun(rs);
        this.showSummary();
      } else {
        this.syncShown();
        this.prepRound(rs);
        this.setMode('shop');
        if (out.outcome === 1 && Math.random() < 0.3) this.ctx.say('win');
        if (out.outcome === -1 && Math.random() < 0.4) this.ctx.say('loss');
      }
    };
    this.refresh();
  }

  /** Round-start beats: the scripted onboarding duplicate, the Brand lesson, the Huntmaster. */
  private prepRound(rs: RunState): void {
    if (rs.round === 2 && !this.ctx.seen('pit.merge') && !this.ctx.seen('pit.dupe')) {
      this.ctx.markSeen('pit.dupe');
      const p = rs.line.find((x) => x && x.xp < 5);
      if (p && rs.shop.length) rs.shop[0] = { k: p.k, a: UNITS[p.k].atk, h: UNITS[p.k].hp };
    }
    if (rs.round === 3 && !rs.brandUsed) this.ctx.lesson('brand');
    if (rs.wins === WINS_TO_TRIUMPH - 1) {
      this.say('hunt', { milestone: true });
      if ((rs.opts.scars ?? 0) > 0) this.ctx.lesson('scars');
    }
  }

  private creditBattle(rs: RunState): number {
    const base = rs.pend ?? 0;
    rs.pend = 0;
    if (base <= 0) return 0;
    const got = this.ctx.earn(base * teethMult(this.run));
    rs.earned = (rs.earned ?? 0) + got;
    return got;
  }

  private showBanner(title: string, sub: string, color: string): void {
    this.bannerText.set(title, color);
    this.bannerSub.set(sub);
    const w = Math.max(measure(title).w, measure(sub).w) + 16;
    const h = 24;
    const g = this.bannerBg.clear();
    drawPanel(g, 0, 0, w, h, 0x1c1028, C.gold);
    this.bannerText.position.set(Math.floor((w - measure(title).w) / 2), 5);
    this.bannerSub.position.set(Math.floor((w - measure(sub).w) / 2), 14);
    const mid = Math.floor((this.yRival + 40 + this.yLine) / 2);
    this.banner.position.set(this.xL + Math.floor((W178 - w) / 2), mid - 12);
    this.banner.hitArea = new Rectangle(-20, -20, w + 40, h + 40);
    this.banner.visible = true;
  }

  private finishResult(): void {
    if (this.mode !== 'result') return;
    this.banner.visible = false;
    const next = this.resultNext;
    this.resultNext = null;
    next?.();
  }

  // ---------- Run end ----------

  /** Pays the run-end bonus, Crests and Pit Crowns once (idempotent across app closes). */
  private finalizeRun(rs: RunState): void {
    if (rs.paid) return;
    rs.paid = true;
    this.creditBattle(rs);
    const run = this.run;
    const per = this.per;
    rs.bonus = this.ctx.earn(runEndBonus(rs, lvOf(run, 'showman')) * teethMult(run));
    run.stats.runs++;
    run.stats.bestWins = Math.max(run.stats.bestWins, rs.wins);
    // Captives (Goods): the Huntmaster and two handlers on a Triumph, one prisoner at 6+ wins.
    run.stats.captives = (run.stats.captives ?? 0) + (rs.ended === 'triumph' ? 3 : rs.wins >= 6 ? 1 : 0);
    const target = pitEcon.skillTarget(this.save.cycle.n);
    let crests = 0;
    if (rs.ended === 'triumph') {
      run.stats.triumphs++;
      run.stats.lowRetreats = 0;
      per.life.triumphs++;
      per.life.crownsEver++;
      per.life.bestStakesCrown = Math.max(per.life.bestStakesCrown, rs.stakes);
      run.crowns[rs.stakes] = (run.crowns[rs.stakes] ?? 0) + 1;
      rs.crown = true;
      const held = heldCrownLevel(run.crowns);
      if (held >= 0) this.ctx.raiseSkill(held);
      if (rs.stakes >= target - 2) crests = 2;
      if (rs.stakes >= target) run.scars = 0;
    } else {
      run.stats.retreats++;
      run.stats.lowRetreats = rs.wins < 3 ? run.stats.lowRetreats + 1 : 0;
      if (rs.wins >= 6 && rs.stakes >= 3) crests = 1;
      // Huntmaster scars (run.ts SCAR_STEP): a lost bout at the target scars him for the cycle.
      if (rs.stakes >= target && rs.huntB > 0 && (run.scars ?? 0) < SCAR_MAX) {
        run.scars = (run.scars ?? 0) + 1;
        rs.scarred = true;
      }
    }
    // Export playtest log (07 §14.1): a per-Run summary, kept locally with the save.
    per.log.push({ at: Date.now(), s: rs.stakes, w: rs.wins, l: rs.losses, tri: rs.ended === 'triumph' ? 1 : 0, buys: rs.buys, min: Math.round(rs.playMs / 6000) / 10, pv: rs.pv });
    if (per.log.length > PLAYTEST_LOG_MAX) per.log.splice(0, per.log.length - PLAYTEST_LOG_MAX);
    rs.crestsWon = crests;
    per.crests += crests;
    per.crestsEver += crests;
    // Remember the warband (last 3) and the Cold Cage carry.
    const band = rs.line.filter((p): p is Pet => !!p).map((p) => ({ ...p }));
    if (band.length) {
      run.history.unshift(band);
      run.history.length = Math.min(3, run.history.length);
    }
    if ((per.ped.carry ?? 0) > 0) {
      const fz = rs.shop.find((s) => s && s.fz);
      per.carry = fz ? { k: fz.k, a: fz.a, h: fz.h } : null;
    }
    this.ctx.saveSoon();
  }

  private showSummary(): void {
    const rs = this.run.cur;
    if (!rs) {
      this.setMode('home');
      return;
    }
    this.mode = 'summary';
    this.setModeVisuals();
    const tri = rs.ended === 'triumph';
    const v = this.vol();
    if (tri) {
      sfx.triumph(v);
      this.ctx.haptic(40);
      for (let i = 0; i < 4; i++) this.burst(this.xL + 20 + i * 45, this.yLine, PAL.gold, 16);
    } else sfx.lose(v);
    const target = pitEcon.skillTarget(this.save.cycle.n);
    const lines = [
      `WINS ${rs.wins}/${WINS_TO_TRIUMPH}   ROUNDS ${rs.round}   STAKES ${rs.stakes}`,
      `BATTLES  +${formatNum(rs.earned ?? 0)} TEETH`,
      `RUN BONUS  +${formatNum(rs.bonus ?? 0)} TEETH${tri ? ' (X2)' : ''}`,
    ];
    if (rs.crestsWon) lines.push(`CRESTS +${rs.crestsWon}  (NOW ${this.per.crests})`);
    if (rs.crown) lines.push(`PIT CROWN! ${Math.min(PIT_CROWNS, crownsAtOrAbove(this.run.crowns, target))}/${PIT_CROWNS} AT STAKES ${target}+`);
    else if (rs.scarred) lines.push(`HUNTMASTER SCARRED (${this.run.scars}/${SCAR_MAX}): -${Math.round((this.run.scars ?? 0) * SCAR_STEP * 100)}% NEXT TIME`);
    const band = rs.line.filter((p): p is Pet => !!p);
    const now = this.idlePerMin();
    const next = band.length ? idleRateWith(this.save, band) * this.ctx.mult() * 60 : 0;
    const shopOnly = band.some((p) => UNITS[p.k].shopOnly);
    if (shopOnly) lines.push('(SHOP TRIGGERS DO NOTHING IN SKIRMISHES)');
    const done = (stationIt: boolean) => {
      if (stationIt && band.length) this.station(band);
      this.run.cur = null;
      this.closePanel();
      this.setMode('home');
      this.afterRunLines(rs);
      this.ctx.saveSoon();
    };
    const better = next > now * 1.001;
    const rects = this.openPanel(tri ? 'TRIUMPH!' : 'RETREAT', lines, [
      {
        label: `SKIRMISH ${formatNum(now)} > ${formatNum(next)}/MIN`,
        color: 0x2a1a3a,
        text: '#e8c04a',
        onTap: () => {
          this.ctx.markSeen('pit.cmp');
          this.ctx.game.toast(`SKIRMISH PAY NOW ${formatNum(now)}/MIN, WITH THIS WARBAND ${formatNum(next)}/MIN.`);
        },
      },
      { label: better ? 'STATION' : 'STATION ANYWAY', color: better ? C.green : C.edge, onTap: () => done(true) },
      { label: 'KEEP OLD', onTap: () => done(false) },
    ], tri ? '#e8c04a' : '#e05050');
    this.summaryRects = { 'summary.rate': rects[0], station: rects[1] };
    // Stationing micro-lesson (07 §18) on the first finished Run: mechanic_unlocked.
    this.ctx.lesson('station');
  }

  private afterRunLines(rs: RunState): void {
    const target = pitEcon.skillTarget(this.save.cycle.n);
    if (rs.ended === 'triumph') {
      // tier_reached (07 §18): the first Triumph, then a Crown at each new Infamy target.
      if (rs.crown && rs.stakes >= target) this.say('crown', { type: 'tier_reached', key: `crown${target}` });
      if (this.per.life.triumphs <= 1) this.say('triumph', { type: 'tier_reached', key: 'triumph' });
      else if (Math.random() < 0.5) this.say('win');
    } else if (this.run.stats.lowRetreats >= 3 && this.run.stakes > 0) {
      // struggle (00 §5.4.3): Snarl's one-tap "Drop Stakes by 2?" on the bubble's check chip.
      this.say('struggle', { type: 'struggle', offer: () => this.dropStakes() });
    } else {
      this.say('hazardFirst', { type: 'hazard_first', key: 'retreat' });
      if (rs.scarred) this.say('scar');
    }
  }

  /** Fires a manager line with Snarl's gravel-bark voice blips (07 §18) when chatter is on. */
  private say(key: string, opts?: SayOpts): void {
    this.ctx.say(key, opts);
    if (this.ctx.game.save.meta.settings.chatter !== 'off' && opts?.type !== 'first_upgrade') {
      if (key === 'triumph' || key === 'crown' || key === 'win') sfx.cackle(this.vol());
      else if (key === 'dialRaised' || key === 'stakesMax') sfx.whistle(this.vol(), 0.1);
      else sfx.snarl(this.vol(), 2 + Math.floor(Math.random() * 2));
    }
  }

  // ---------- overlay panels ----------

  private openPanel(
    title: string,
    lines: string[],
    buttons: { label: string; color?: number; icons?: UnitId[]; skin?: number; text?: string; onTap: () => void }[],
    titleColor = '#e8c04a',
  ): Rect[] {
    const rects: Rect[] = [];
    this.closePanel();
    const L = this.ctx.layout;
    const o = new Container();
    const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.55 });
    dim.eventMode = 'static';
    o.addChild(dim);
    const w = Math.min(this.w - 6, 190);
    const x = this.x0 + Math.floor((this.w - w) / 2);
    const wrapped = lines.map((l) => wrap(l, w - 12)).join('\n');
    const th = measure(wrapped).h;
    const bh = buttons.length * 20;
    const h = 22 + th + 8 + bh + 4;
    const y = Math.max(this.y0 + 4, this.yLine - Math.floor(h / 2) + 10);
    const g = new Graphics();
    drawPanel(g, x, y, w, h, 0x1c1028, C.gold);
    g.eventMode = 'static';
    o.addChild(g);
    const t = new PixelText(title, titleColor);
    t.position.set(x + Math.floor((w - t.width) / 2), y + 6);
    const body = new PixelText(wrapped, '#f4e8c1');
    body.position.set(x + 6, y + 18);
    o.addChild(t, body);
    buttons.forEach((b, i) => {
      const btn = new Button({ w: w - 12, h: 16, label: b.label, color: b.color ?? C.edge, shade: 0x2a1a3a, textColor: b.text ?? (b.color && b.color !== C.edge ? '#140c1c' : C.ink), onTap: b.onTap });
      btn.position.set(x + 6, y + 22 + th + 6 + i * 20);
      rects.push({ x: x + 6, y: y + 22 + th + 6 + i * 20, w: w - 12, h: 16 });
      o.addChild(btn);
      if (b.icons) {
        b.icons.slice(0, 5).forEach((k, j) => {
          const s = new Sprite(beastTex(k, b.skin ?? skinOf(this.per, k)));
          s.position.set(x + 9 + j * 13, y + 22 + th + 9 + i * 20);
          s.eventMode = 'none';
          o.addChild(s);
        });
        btn.setLabel(`${' '.repeat(16)}${b.label}`);
      }
    });
    this.overlay = o;
    this.root.addChild(o);
    return rects;
  }

  private closePanel(): void {
    this.summaryRects = {};
    if (this.overlay) {
      this.overlay.destroy({ children: true });
      this.overlay = null;
    }
  }

  // ---------- upgrades ----------

  private onBuy(id: string): void {
    sfx.buy(this.vol());
    this.ctx.haptic(10);
    if (id === 'drill' && lvOf(this.run, 'drill') === 1) this.say('firstHelper', { type: 'first_helper' });
    if (id === 'pliers' && lvOf(this.run, 'pliers') === 1) this.say('firstPliers', { type: 'first_upgrade', key: 'pliers' });
    if (id.startsWith('skin')) this.ctx.markSeen('pit.skins');
    this.skirmish.wait = Math.min(this.skirmish.wait, 0.3);
  }

  // ---------- per-frame ----------

  private vol(): number {
    return this.ctx.game.save.meta.settings.sfx;
  }

  private skirmishArch: RivalInfo['arch'] | undefined;

  /** Plays the visible Skirmish: the same 8 Gauntlets the idle formula uses, in order. */
  private nextSkirmish(): void {
    const team = garrisonFighters(this.run);
    if (!team.length) return;
    const rep = gauntletReport(this.save);
    const { g, r } = this.skirmish;
    const out = runGauntletLog(this.save, team, g, r, rep.stakes);
    this.skirmishArch = out.arch;
    this.rivalTag.set(`SKIRMISH ${g + 1}/8  ROUND ${r}${rep.stakes !== this.run.stakes ? `  (CAUTIOUS S${rep.stakes})` : ''}`, '#9c8aa8');
    this.startPlay(out.frames, true, () => {
      if (out.outcome === 1 && r < 12) this.skirmish = { g, r: r + 1, wait: 0.5 };
      else this.skirmish = { g: (g + 1) % 8, r: 1, wait: 1.2 };
    });
  }

  update(dt: number): void {
    this.time += dt;
    const rs = this.run.cur;
    if (rs && (this.mode === 'shop' || this.mode === 'battle')) rs.playMs += dt * 1000;
    // Skirmishes pay only when no Run is on screen (07 §3, decided OQ 31).
    if (this.mode === 'home') {
      this.idleAcc += pitEcon.idleRate(this.save) * dt;
      this.idleT += dt;
      if (this.idleT >= 1) {
        this.idleT = 0;
        if (this.idleAcc > 0) this.ctx.earn(this.idleAcc);
        this.idleAcc = 0;
      }
      if (!this.play && !this.overlay && !this.ritual) {
        this.skirmish.wait -= dt;
        if (this.skirmish.wait <= 0) this.nextSkirmish();
      }
    }
    // Battle playback.
    if (this.ritual) {
      this.ritual.t += dt;
      if (this.ritual.t > 15) this.ritual.finish?.();
      else if (this.ritual.start && this.ritual.t >= 1.2) {
        const go = this.ritual.start;
        this.ritual.start = undefined;
        go();
      }
    }
    if (this.undo) {
      this.undo.t -= dt;
      if (this.undo.t <= 0) this.undo = null;
    }
    // Hold to inspect (a press that neither moved nor lifted).
    const d = this.drag;
    if (d && !d.moving) {
      // Wall clock, not frame dt: a hold is a hold even on a slow frame rate.
      if (performance.now() - d.t >= HOLD_S * 1000) {
        this.drag = null;
        this.eatTap = true;
        this.showFullCard(d.g, d.i);
      }
    }
    const p = this.play;
    if (p) {
      const sp = this.ritual ? 1 : p.home ? 2 : this.speed();
      p.t += dt * sp;
      if (p.t >= p.dur) this.advance();
    }
    if (this.mode === 'result') {
      this.resultT -= dt;
      if (this.resultT <= 0) this.finishResult();
    }
    // Info line falls back to a contextual hint.
    if (this.infoHold > 0) {
      this.infoHold -= dt;
      if (this.infoHold <= 0) this.infoText = '';
    }
    if (!this.infoText) this.info.set(wrap(this.hint(), W178) || ' ', '#9c8aa8');
    // Flavor lines only when calm.
    this.flavorT -= dt;
    if (this.flavorT <= 0) {
      this.flavorT = 45;
      if (this.mode === 'home' || this.mode === 'shop') this.ctx.say('flavor');
    }
    this.refresh();
    // Cards and fx.
    const t = this.time;
    for (const c of this.rivalCards) c.tick(dt, t);
    for (const c of this.lineCards) c.tick(dt, t);
    for (const c of this.shopCards) c.tick(dt, t);
    for (const c of this.foodCards) c.tick(dt, t);
    this.drawBg();
    this.updateFx(dt);
    if (this.shake > 0) {
      this.shake -= dt;
      this.arena.position.set(Math.round(Math.sin(t * 90)), 0);
    } else this.arena.position.set(0, 0);
    this.upPulse += dt;
  }

  private hint(): string {
    const rs = this.run.cur;
    switch (this.mode) {
      case 'home': {
        const rep = gauntletReport(this.save);
        return `STANDING WARBAND: +${formatNum(this.idlePerMin())} TEETH/MIN. CLEARS ${rep.meanRounds.toFixed(1)} ROUNDS ON AVERAGE (BEST ${rep.best}).`;
      }
      case 'shop': {
        if (!rs) return '';
        if (!lineCount(rs)) return 'TAP A SHOP BEAST, THEN A SLOT. FRONT = LEFT.';
        if (rs.wins === WINS_TO_TRIUMPH - 1) return 'NEXT: THE HUNTMASTER. BEAT HIM FOR THE TRIUMPH.';
        return 'TAP OR DRAG BEASTS. HOLD ONE TO READ IT. 3 COPIES = LEVEL 2. TOP ROW: SCOUT.';
      }
      case 'battle':
      case 'result':
        return 'HANDS OFF. WATCH EM WORK.';
      default:
        return '';
    }
  }

  private updateShop(): void {
    const rs = this.run.cur;
    if (!rs) return;
    const sel = this.sel;
    const selShop = sel?.g === 'shop' ? rs.shop[sel.i] : null;
    const selFood = sel?.g === 'food' ? rs.food[sel.i] : null;
    const selLine = sel?.g === 'line' ? rs.line[sel.i] : null;
    for (let i = 0; i < 5; i++) {
      const p = rs.line[i];
      let target = false;
      if (selShop) target = !p || (p.k === selShop.k && p.xp < 5) || rs.line.some((x) => !x);
      if (selFood && p && !FOODS[selFood.f].all) target = true;
      if (selLine && sel!.i !== i) target = !p || p.k !== selLine.k || p.xp < 5;
      if (!p) this.lineCards[i].setState({ empty: true, target });
      else this.lineCards[i].setState({ ...this.petState(p, rs), sel: sel?.g === 'line' && sel.i === i, target: target && !!selShop && p.k === selShop.k });
    }
    for (let i = 0; i < 6; i++) {
      const s = rs.shop[i];
      const card = this.shopCards[i];
      card.visible = !!s;
      if (!s) card.setState(null);
      else card.setState({ k: s.k, a: s.a, h: s.h, lvl: 1, sel: sel?.g === 'shop' && sel.i === i, dim: rs.chow < 3 });
    }
    for (let i = 0; i < 2; i++) {
      const f = rs.food[i];
      this.foodCards[i].visible = i < rs.food.length;
      this.foodCards[i].setState(f ? { food: f.f, sel: sel?.g === 'food' && sel.i === i, dim: rs.chow < FOODS[f.f].cost } : { empty: true });
    }
    // The 6th shop card sits over the food row's right side; hide the chow/brand cluster under it.
    const sixth = !!rs.shop[5];
    for (const s of this.strips) {
      const item = s.kind === 'unit' ? rs.shop[s.i] : rs.food[s.i];
      const showStrip = !!item && this.mode === 'shop' && (s.kind === 'food' ? s.i < rs.food.length : true);
      s.c.visible = showStrip;
      if (!item) continue;
      const fz = !!item.fz;
      const g = s.g.clear();
      g.rect(0, 0, 34, 10).fill(fz ? 0x2a5a7a : 0x1c1024);
      g.rect(0, 0, 34, 1).fill(fz ? 0x6ac8f0 : 0x3a2a40);
      s.t.set(fz ? 'FROZEN' : 'FREEZE', fz ? '#d8f4ff' : '#6a5a78');
      s.t.position.set(1, 3);
      s.ice.position.set(27, 2);
      s.ice.visible = fz;
      if (s.kind === 'unit' && s.i === 5) s.c.visible = false;
    }
    this.brandBtn.visible = this.mode === 'shop' && !sixth;
    this.pauseBtn.visible = this.mode === 'shop' && !sixth;
    // Scouted rival on the top row.
    const riv = this.scoutInfo();
    const scout = lvOf(this.run, 'scout');
    for (let i = 0; i < 5; i++) {
      const f = riv?.line[i];
      const col = riv && riv.arch !== 'hunt' ? ARCHES[riv.arch].color : 0xe04040;
      this.rivalCards[i].setState(f ? this.fighterState(f, scout < 1 && f.kind !== 'hunt', col, scout >= 2) : null);
    }
    this.refresh();
  }

  private petState(p: Pet, rs: RunState): CardState {
    void rs;
    const hm = 1 + 0.04 * lvOf(this.run, 'hardy');
    const bm = p.br ? 1.5 : 1;
    const r5 = (x: number) => Math.floor(x + 0.5);
    return { k: p.k, a: r5(r5(p.a * hm) * bm), h: r5(r5(p.h * hm) * bm), lvl: lvlOf(p.xp), xp: p.xp, it: p.it, brand: !!p.br, skin: skinOf(this.per, p.k) };
  }

  private fighterState(f: Fighter, hide: boolean, rival: number | undefined, full = true): CardState {
    return { k: f.kind, a: f.atk, h: f.hp, lvl: full || !rival ? f.lvl : 1, it: full || !rival ? (f.item ?? null) : null, brand: f.brand, armor: f.armor, hide, rival, skin: rival === undefined ? skinOf(this.per, f.kind) : 0 };
  }

  private setModeVisuals(): void {
    for (const b of [this.rollBtn, this.sellBtn, this.fightBtn, this.brandBtn, this.pauseBtn, this.speedBtn, this.skipBtn, this.startBtn, this.forfeitBtn, this.upBtn, this.bandsBtn, this.stakesDown, this.stakesUp, this.stakesBuy, this.dropBtn]) b.visible = false;
    for (const s of this.strips) s.c.visible = false;
  }

  /** Per-frame text and button state (PixelText.set is a no-op when unchanged). */
  private refresh(): void {
    const rs = this.run.cur;
    const m = this.mode;
    const notation = this.ctx.game.save.meta.settings.notation;
    if (m === 'shop' || m === 'battle' || m === 'result') {
      if (!rs) return;
      const sh = m === 'shop' ? { wins: rs.wins, grit: rs.grit, round: rs.round } : this.shown;
      const full = Math.max(0, sh.grit);
      this.gritFull.set('{heart}'.repeat(full) || ' ');
      this.gritEmpty.set('{heart}'.repeat(Math.max(0, rs.gritMax - full)) || ' ');
      this.gritEmpty.position.set(this.gritFull.x + full * 4, this.gritFull.y);
      this.runInfo.set(`WINS ${sh.wins}/${WINS_TO_TRIUMPH}  RD ${sh.round}  S${rs.stakes}`);
      this.runInfo.position.set(this.xL + rs.gritMax * 4 + 6, this.gritFull.y);
      this.chowText.set(`${rs.chow} CHOW`);
      if (m === 'shop') {
        const riv = this.scoutInfo();
        if (riv) {
          const sc = rs.opts.scars ?? 0;
          const name = riv.arch === 'hunt' ? `THE HUNTMASTER!${sc ? ` SCARS ${sc}` : ''}` : `${ARCHES[riv.arch].name.toUpperCase()} TAMER`;
          this.rivalTag.set(`VS ${name}  (TAP TO SCOUT)`, riv.arch === 'hunt' ? '#ff6a5a' : '#f4e8c1');
        }
        const rc = rollCost(rs);
        this.rollBtn.setLabel(rc ? 'ROLL 1' : 'ROLL FREE').setEnabled(rs.chow >= rc);
        const selP = this.sel?.g === 'line' ? rs.line[this.sel.i] : null;
        if (this.undo) this.sellBtn.setLabel('UNDO').setEnabled(true);
        else this.sellBtn.setLabel(selP ? `SELL +${sellValue(selP) + (selP.k === 'piglet' ? lvlOf(selP.xp) : 0)}` : this.drag?.g === 'line' && this.drag.moving ? 'BIN' : 'SELL').setEnabled(!!selP || (this.drag?.g === 'line' && this.drag.moving));
        this.brandBtn.setEnabled(!rs.brandUsed);
        this.brandBtn.setLabel(rs.brandUsed ? 'BRANDED' : 'BRAND');
        this.fightBtn.setLabel(rs.wins === WINS_TO_TRIUMPH - 1 ? 'HUNT!' : 'FIGHT!').setEnabled(lineCount(rs) > 0);
      } else {
        this.speedBtn.setLabel(`${this.speed()}X`);
        this.skipBtn.setLabel(m === 'result' ? 'NEXT' : 'SKIP');
      }
    } else if (m === 'home') {
      this.runInfo.position.set(this.xL, this.y0 + this.T - 10);
      if (this.ritual) {
        for (const b of [this.startBtn, this.forfeitBtn, this.upBtn, this.bandsBtn, this.stakesDown, this.stakesUp, this.stakesBuy, this.dropBtn]) b.visible = false;
        this.stakesText.visible = this.crownText.visible = this.tacticBox.visible = false;
        return;
      }
      for (const b of [this.upBtn, this.bandsBtn, this.stakesDown, this.stakesUp, this.stakesBuy]) b.visible = true;
      this.stakesText.visible = this.crownText.visible = this.tacticBox.visible = true;
      this.runInfo.set(`CRESTS ${this.per.crests}   TRIUMPHS ${this.run.stats.triumphs}   RUNS ${this.run.stats.runs}`);
      const S = this.run.stakes;
      const B = this.run.stakesBought;
      this.stakesText.set(`STAKES ${S}/${B}`, S > 0 ? '#e8c04a' : '#f4e8c1');
      this.stakesDown.setEnabled(S > 0);
      this.stakesUp.setEnabled(S < B);
      if (B >= STAKES_MAX) this.stakesBuy.setLabel('MAX').setEnabled(false);
      else this.stakesBuy.setLabel(`S${B + 1} ${formatNum(stakesCost(B), notation)}`).setEnabled(this.run.bank >= stakesCost(B));
      const showDrop = this.run.stats.lowRetreats >= 3 && S > 0;
      this.dropBtn.visible = showDrop;
      // Tactics chips: 3 / 6 / 9.
      const g = this.tacticG.clear();
      TACTICS.forEach((tc, i) => {
        const on = S >= tc.at;
        const owned = this.run.stakesBought >= tc.at;
        g.rect(i * 18, 0, 16, 12).fill(on ? 0x7a2a2a : owned ? 0x3a2a3a : 0x2a1a2a);
        g.rect(i * 18, 0, 16, 1).fill(on ? 0xe05050 : 0x4a3450);
      });
      if (!this.tacticLabels) {
        this.tacticLabels = TACTICS.map((tc) => new PixelText(`${tc.at}`, '#f4e8c1'));
        this.tacticLabels.forEach((t, i) => {
          t.position.set(i * 18 + Math.floor((16 - measure(`${TACTICS[i].at}`).w) / 2), 4);
          this.tacticBox.addChild(t);
        });
      }
      this.tacticLabels.forEach((t, i) => t.set(`${TACTICS[i].at}`, S >= TACTICS[i].at ? '#ffd0c0' : '#6a5a78'));
      const target = pitEcon.skillTarget(this.save.cycle.n);
      const sc = this.run.scars ?? 0;
      this.crownText.set(`PIT CROWNS ${Math.min(PIT_CROWNS, crownsAtOrAbove(this.run.crowns, target))}/${PIT_CROWNS} AT STAKES ${target}+${sc ? `  SCARS ${sc}` : ''}`);
      const cur = this.run.cur;
      this.startBtn.setLabel(cur ? `RESUME RUN (RD ${cur.round}, ${cur.wins}W)` : 'START RUN');
      this.startBtn.visible = true;
      this.forfeitBtn.visible = !!cur;
      if (cur) this.startBtnWidth(W178 - 54);
      else this.startBtnWidth(W178);
      this.homeHint.set(' ');
      // UPGRADES pulses when something is affordable.
      const any = anyAffordable(this.groups);
      this.upBtn.setLabel(any && Math.floor(this.upPulse * 2) % 2 === 0 ? 'UPGRADES!' : 'UPGRADES');
      this.showHomeRows();
    }
  }

  private tacticLabels: PixelText[] | null = null;
  private startW = W178;

  private startBtnWidth(w: number): void {
    if (this.startW === w) return;
    this.startW = w;
    const label = this.run.cur ? `RESUME RUN (RD ${this.run.cur.round}, ${this.run.cur.wins}W)` : 'START RUN';
    this.startBtn.destroy({ children: true });
    this.startBtn = new Button({ w, h: 22, label, onTap: () => this.startOrResume() });
    this.startBtn.position.set(this.xL, this.yShop + 46);
    this.ui.addChild(this.startBtn);
  }

  /** Home rows when no Skirmish battle is animating: the Standing Warband, rival row empty. */
  private showHomeRows(): void {
    if (this.play) return;
    const team = garrisonFighters(this.run);
    for (let i = 0; i < 5; i++) {
      const f = team[i];
      this.lineCards[i].setState(f ? { ...this.fighterState(f, false, undefined), sel: this.homeSel === i } : { empty: true });
      if (!this.skirmishArch) this.rivalCards[i].setState(null);
    }
    if (!team.length) this.rivalTag.set('NO STANDING WARBAND', '#9c8aa8');
  }


  // ---------- drag, hold and the sell bin (07 §11) ----------

  private press(g: Group, i: number, e: FederatedPointerEvent): void {
    this.eatTap = false;
    if (this.overlay || this.ritual) return;
    const p = this.root.toLocal(e.global);
    this.drag = { g, i, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), moving: false };
  }

  private canDrag(g: Group, i: number): boolean {
    const rs = this.run.cur;
    if (this.mode !== 'shop' || !rs) return false;
    return (g === 'shop' && !!rs.shop[i]) || (g === 'food' && !!rs.food[i]) || (g === 'line' && !!rs.line[i]);
  }

  private viewOf(g: Group, i: number): CardView {
    return g === 'shop' ? this.shopCards[i] : g === 'food' ? this.foodCards[i] : g === 'line' ? this.lineCards[i] : this.rivalCards[i];
  }

  private dragMove(e: FederatedPointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = this.root.toLocal(e.global);
    d.x = p.x;
    d.y = p.y;
    if (!d.moving) {
      if (Math.hypot(p.x - d.sx, p.y - d.sy) < DRAG_PX) return;
      if (!this.canDrag(d.g, d.i)) {
        this.drag = null; // a scroll-ish swipe over a card: neither a tap-hold nor a drag
        return;
      }
      d.moving = true;
      const rs = this.run.cur!;
      this.sel = { g: d.g, i: d.i };
      if (d.g === 'food') this.ghost.texture = foodTex(rs.food[d.i]!.f);
      else {
        const k = d.g === 'shop' ? rs.shop[d.i]!.k : rs.line[d.i]!.k;
        this.ghost.texture = beastTex(k, skinOf(this.per, k));
      }
      this.ghost.visible = true;
      this.viewOf(d.g, d.i).alpha = 0.35;
      sfx.tap(this.vol());
      this.updateShop();
    }
    this.ghost.position.set(Math.round(p.x - 12), Math.round(p.y - 14));
  }

  /** The line slot under (x, y), with a little slack, or -1. */
  private slotAt(x: number, y: number): number {
    if (y < this.yLine - 6 || y > this.yLine + CH + 6) return -1;
    const j = Math.floor((x - this.xL + 1) / STEP);
    return j >= 0 && j < 5 ? j : -1;
  }

  private overSell(x: number, y: number): boolean {
    const b = this.sellBtn;
    return b.visible && x >= b.x - 4 && x < b.x + 50 && y >= b.y - 6 && y < b.y + 26;
  }

  private release(): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moving) return;
    this.eatTap = true;
    this.ghost.visible = false;
    const view = this.viewOf(d.g, d.i);
    view.alpha = view.state?.dim ? 0.45 : 1;
    const rs = this.run.cur;
    if (!rs || this.mode !== 'shop') return;
    const slot = this.slotAt(d.x, d.y);
    this.sel = null;
    if (d.g === 'shop' && slot >= 0) this.doBuy(d.i, slot);
    else if (d.g === 'food' && rs.food[d.i] && (slot >= 0 || FOODS[rs.food[d.i]!.f].all && d.y < this.yInfo)) this.doFood(d.i, Math.max(0, slot));
    else if (d.g === 'line' && this.overSell(d.x, d.y)) this.sellAt(d.i);
    else if (d.g === 'line' && slot >= 0 && slot !== d.i) this.lineDrop(d.i, slot);
    this.updateShop();
  }

  /** Line unit `from` dropped on slot `to`: merge onto a twin, else move/swap. */
  private lineDrop(from: number, to: number): void {
    const rs = this.run.cur!;
    const a = rs.line[from];
    const b = rs.line[to];
    this.undo = null;
    if (a && b && a.k === b.k && b.xp < 5) {
      const lv = mergeLine(rs, from, to);
      this.onMerged(to, lv > 0 ? lv : undefined);
    } else {
      move(rs, from, to);
      this.ctx.markSeen('pit.move');
      sfx.tap(this.vol());
      this.lineCards[to].pop = 1;
      this.lineCards[from].pop = 1;
    }
    this.ctx.saveSoon();
  }

  /** Hold any unit for its full card: numbers and ability at each level (07 §11). */
  private showFullCard(g: Group, i: number): void {
    const rs = this.run.cur;
    let k: UnitId | undefined;
    let stats = '';
    if (g === 'food') {
      const f = rs?.food[i];
      if (!f) return;
      const d = FOODS[f.f];
      this.openPanel(d.name.toUpperCase(), [`TIER ${d.tier}   COST ${d.cost} CHOW`, d.text, d.held ? 'ONE HELD ITEM PER BEAST; A NEW ONE REPLACES IT.' : ''], [{ label: 'CLOSE', onTap: () => this.closePanel() }]);
      return;
    }
    const st = this.viewOf(g, i).state;
    if (g === 'shop' && rs?.shop[i]) k = rs.shop[i]!.k;
    else if (st?.k) k = st.k;
    if (!k) return;
    if (st?.a !== undefined && !st.hide) stats = `NOW ${st.a}/${st.h}  L${st.lvl ?? 1}`;
    const d = UNITS[k];
    const lines = [`TIER ${d.tier}   BASE ${d.atk}/${d.hp}${stats ? `   ${stats}` : ''}`];
    if (d.token) lines.push(d.text(1));
    else for (let L = 1; L <= 3; L++) lines.push(`L${L}: ${d.text(L)}`);
    if (d.shopOnly) lines.push('SHOP TRIGGER: NO EFFECT IN SKIRMISHES.');
    if (d.crests) lines.push(`BESTIARY BEAST (${d.crests} CRESTS).`);
    this.openPanel(d.name.toUpperCase(), lines, [{ label: 'CLOSE', onTap: () => this.closePanel() }]);
    sfx.tap(this.vol());
  }

  // ---------- beast skins (07 §6D Crest sink) ----------

  private openSkins(k: UnitId): void {
    this.ctx.markSeen('pit.skins');
    const per = this.per;
    const worn = skinOf(per, k);
    const buttons = SKINS.map((name, i) => {
      const owned = ownsSkin(per, k, i);
      return {
        label: `${name}  ${i === worn ? 'WORN' : owned ? 'WEAR' : `${SKIN_COST} CRESTS`}`,
        icons: [k],
        skin: i,
        color: i === worn ? C.gold : owned ? C.edge : per.crests >= SKIN_COST ? C.green : 0x3a2a40,
        text: !owned && i !== worn && per.crests < SKIN_COST ? '#9c8aa8' : undefined,
        onTap: () => {
          if (owned) per.wear[k] = i;
          else if (!buySkin(per, k, i)) {
            sfx.deny(this.vol());
            this.ctx.game.toast(`A COAT COSTS ${SKIN_COST} CRESTS. TRIUMPH NEAR THE TARGET STAKES FOR MORE.`);
            return;
          } else {
            sfx.levelUp(this.vol());
            this.ctx.haptic(15);
          }
          this.ctx.saveSoon();
          this.openSkins(k);
        },
      };
    });
    this.openPanel(`${UNITS[k].name.toUpperCase()} COATS`, [`CRESTS ${per.crests}. COSMETIC ONLY.`], [...buttons, { label: 'CLOSE', onTap: () => this.closePanel() }]);
  }

  // ---------- core hooks: targets, calm, the return ritual ----------

  private btnRect(b: Button, w: number, h: number): Rect | null {
    return b.visible && !b.destroyed ? { x: b.x, y: b.y, w, h } : null;
  }

  private cardRect(c: CardView): Rect | null {
    return c.visible && c.state ? { x: c.bx, y: c.by, w: CW, h: CH } : null;
  }

  /** Onboarding targets (00 §5.4.2); null while hidden. */
  targetRect(id: string): Rect | null {
    if (this.overlay && this.summaryRects[id]) return this.summaryRects[id];
    if (this.overlay) return null;
    const rs = this.run.cur;
    const home = this.mode === 'home';
    const shop = this.mode === 'shop' && !!rs;
    const [kind, arg] = id.split('.');
    const n = Number(arg);
    switch (id) {
      case 'upgrades':
        return home ? this.btnRect(this.upBtn, 88, 18) : null;
      case 'warbands':
        return home ? this.btnRect(this.bandsBtn, 88, 18) : null;
      case 'start':
        return home ? this.btnRect(this.startBtn, this.startW, 22) : null;
      case 'stakes':
        return home ? { x: this.xL, y: this.yShop - 1, w: 96, h: 16 } : null;
      case 'stakes.buy':
        return home ? this.btnRect(this.stakesBuy, 62, 14) : null;
      case 'tactics':
        return home ? { x: this.tacticBox.x - 1, y: this.tacticBox.y - 1, w: TACTICS.length * 18, h: 14 } : null;
      case 'fight':
        return shop ? this.btnRect(this.fightBtn, 74, 20) : null;
      case 'roll':
        return shop ? this.btnRect(this.rollBtn, 52, 20) : null;
      case 'sell':
        return shop ? this.btnRect(this.sellBtn, 46, 20) : null;
      case 'brand':
        return shop ? this.btnRect(this.brandBtn, 50, 14) : null;
      case 'rival':
        return shop ? { x: this.xL, y: this.yRival - 9, w: W178, h: 49 } : null;
      case 'shop.twin':
      case 'line.twin': {
        if (!shop) return null;
        for (let j = 0; j < rs!.shop.length; j++) {
          const u = rs!.shop[j];
          const slot = u ? rs!.line.findIndex((p) => p && p.k === u.k && p.xp < 5) : -1;
          if (slot >= 0) return this.cardRect(kind === 'shop' ? this.shopCards[j] : this.lineCards[slot]);
        }
        return null;
      }
      case 'line.last': {
        if (!shop) return null;
        let last = 0;
        rs!.line.forEach((p, j) => p && (last = j));
        return this.cardRect(this.lineCards[last]);
      }
      case 'line.best': {
        if (!shop) return null;
        let best = -1;
        let bv = -1;
        rs!.line.forEach((p, j) => {
          if (p && p.a + p.h > bv) {
            bv = p.a + p.h;
            best = j;
          }
        });
        return best >= 0 ? this.cardRect(this.lineCards[best]) : null;
      }
    }
    if (!(n >= 0)) return null;
    if (kind === 'shop' && shop) return this.cardRect(this.shopCards[n]);
    if (kind === 'food' && shop) return this.cardRect(this.foodCards[n]);
    if (kind === 'line' && (shop || home)) {
      const c = this.lineCards[n];
      return c.visible ? { x: c.bx, y: c.by, w: CW, h: CH } : null;
    }
    if (kind === 'freeze' && shop) {
      const st = this.strips.find((x) => x.kind === 'unit' && x.i === n);
      return st?.c.visible ? { x: st.c.x, y: st.c.y - 1, w: 34, h: 12 } : null;
    }
    return null;
  }

  /** 07 §18: a battle animating, a drag in progress, or the return ritual. */
  isIntense(): boolean {
    return !!(this.play && !this.play.home) || !!this.drag?.moving || !!this.ritual;
  }

  /**
   * Return ritual (07 §13, 00 §5.3): Snarl replays the best Gauntlet's last won bout; tap
   * THUMBS DOWN as the last rival falls. Score 1 within 0.25 s, fading to 0 at 1.25 s off.
   */
  returnRitual(_haul: number): Promise<number> {
    return new Promise<number>((resolve) => {
      try {
        const team = garrisonFighters(this.run);
        if (!team.length || this.mode === 'summary' || this.mode === 'battle' || this.mode === 'result') return resolve(0);
        const rep = gauntletReport(this.save);
        const S = rep.stakes;
        const opts = { sigils: importSigils(this.save), shade: importShade(this.save) };
        let bestG = -1;
        let bestR = 0;
        for (let g = 0; g < 8; g++) {
          const r = runGauntlet(team, this.save.cycle.n, g, S, opts).rounds;
          if (r > bestR) {
            bestR = r;
            bestG = g;
          }
        }
        if (bestG < 0) return resolve(0);
        const log = runGauntletLog(this.save, team, bestG, bestR, S);
        const resume = !!this.run.cur && !this.run.cur.ended;
        if (this.mode !== 'home') this.setMode('home');
        const btn = new Button({ w: W178, h: 22, label: 'THUMBS DOWN!', color: C.red, shade: 0x7a2020, textColor: C.ink, onTap: () => {
          const rt = this.ritual;
          if (!rt || rt.tapped >= 0) return;
          rt.tapped = rt.t;
          sfx.whistle(this.vol());
          this.ctx.haptic(15);
          btn.setEnabled(false);
        } });
        btn.position.set(this.xL, this.yShop + 46);
        const label = new PixelText(wrap("SNARL'S REPLAY: TAP AS THE LAST RIVAL FALLS.", W178), '#e8c04a');
        label.position.set(this.xL, this.yShop + 30);
        this.ui.addChild(btn, label);
        const finish = () => {
          const rt = this.ritual;
          if (!rt || rt.done) return;
          rt.done = true;
          if (this.root.destroyed) return rt.resolve(0);
          let score = 0;
          if (rt.tapped >= 0 && rt.end >= 0) {
            const off = Math.abs(rt.tapped - rt.end);
            score = off <= 0.25 ? 1 : Math.max(0, 1 - (off - 0.25));
          }
          this.ctx.float(score >= 1 ? 'PERFECT! *TWEET*' : score > 0 ? 'CLOSE ENOUGH' : 'MISSED', this.xL + W178 / 2, this.yRival + 20, score > 0 ? '#e8c04a' : '#9c8aa8');
          if (score > 0) sfx.cackle(this.vol());
          btn.destroy({ children: true });
          label.destroy();
          this.ritual = null;
          this.play = null;
          this.skirmish = { g: 0, r: 1, wait: 1 };
          if (resume && this.run.cur && !this.run.cur.ended) this.setMode('shop');
          else this.setMode('home');
          rt.resolve(score);
        };
        this.ritual = { t: 0, end: -1, tapped: -1, resolve, btn, label, done: false };
        this.skirmishArch = log.arch;
        this.rivalTag.set(`REPLAY: GAUNTLET ${bestG + 1}, ROUND ${bestR}`, '#e8c04a');
        const frames = log.frames.slice(Math.max(0, log.frames.length - 12));
        // A 1.2 s lead-in (the bout's cards settle, the prompt reads), then ~4 s of the finish.
        this.ritual.start = () =>
          this.startPlay(frames, true, () => {
            const rt = this.ritual;
            if (rt && rt.end < 0) rt.end = rt.t;
            window.setTimeout(finish, 900);
          });
        this.applyFrame(frames[0], { frames, i: 0, t: 0, dur: 0, home: true, prev: new Map(), onDone: () => {} }, true);
        this.ritual.finish = finish; // safety in update(): never hang (game time, not wall time)
      } catch (err) {
        console.error(err);
        resolve(0);
      }
    });
  }

  // ---------- fx ----------

  private burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 50;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 25, life: 0.4 + Math.random() * 0.4, color });
    }
  }

  private updateFx(dt: number): void {
    const g = this.fx.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 120 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      g.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill({ color: p.color, alpha: Math.min(1, p.life * 3) });
    }
  }

  resize(_layout: Layout): void {
    this.layout();
    this.updateShop();
  }

  destroy(): void {
    // Never lose pay: credit Skirmish change and any battle Teeth still pending.
    if (this.idleAcc > 0) this.ctx.earn(this.idleAcc);
    this.idleAcc = 0;
    const rs = this.run.cur;
    if (rs && rs.pend) this.creditBattle(rs);
    this.closePanel();
    this.root.destroy({ children: true });
  }
}
