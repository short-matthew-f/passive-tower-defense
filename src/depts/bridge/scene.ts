// The Troll Bridge scene (specs/06): travelers queue on the bench, step up to the gate and
// state a Claim in icons. You read their parts for contradictions, name a toll on the Coin
// Stack (0.1x notches), and hold UNMASK or SEARCH for a verdict. Grumm growls it, gets bonked
// if you push a brute too far, and naps while the goons work the gate.
// All numbers live in model.ts; art in art.ts.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure, wrap } from '../../ui/font';
import { Button, C, drawPanel } from '../../ui/widgets';
import * as M from './model';
import { drawTraveler, goonArt, GOLD, grummArt, icon, OUTLINE, particle, TRAV_H, TRAV_W, WOOD, WOOD_D, WOOD_L, type GrummExpr } from './art';
import { sfx } from './sfx';
import { anyAffordable, buildGroups } from './upgrades';

const HOLD_S = 0.3;
const IDLE_GATE_S = 10;
const MAX_PARTS = 70;
const WALK_S = 0.9;
const RITUAL_S = 6;
const RITUAL_CRATES = 5;
/** Squint pointers: slot -> icon. */
const SLOT_ICON: Record<M.Slot, string> = { hat: 'hat', body: 'body', feet: 'boot', hand: 'hand', belt: 'belt', pack: 'pack', aura: 'glow' };
/** Rule card id of a scripted lesson traveler. */
const LESSON_CARD: Record<string, string> = Object.fromEntries(Object.entries(M.CARD_FORCE).map(([card, f]) => [f, card]));

type Phase = 'none' | 'walkIn' | 'wait' | 'counter' | 'search' | 'reveal' | 'leave';
type Face = 'calm' | 'shock' | 'angry' | 'happy';

interface Cur {
  t: M.Traveler;
  phase: Phase;
  timer: number;
  x: number;
  fromX: number;
  toX: number;
  h: M.Haggle;
  face: Face;
  revealed: boolean;
  lidOpen: boolean;
  searched: boolean;
  goonT: number;
  /** Looks (taps on the sprite) at this traveler; a shifter's Claim flickers on the second. */
  looks: number;
  shiftT: number;
}

interface Ritual {
  n: number;
  opened: number;
  t: number;
  done: boolean;
  resolve: (score: number) => void;
}

interface Part {
  g: Graphics;
  kind: 'arc' | 'ball';
  x: number;
  y: number;
  vx: number;
  vy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  life: number;
  grav: number;
  onLand?: () => void;
}

/** A press-and-hold verdict button with a fill bar that confirms (06 §11, D-05). */
class HoldButton extends Container {
  private g = new Graphics();
  private lbl: PixelText;
  private ic = new Graphics();
  private holding = false;
  private sub = '';
  prog = 0;
  enabled = true;
  glow = false;
  constructor(
    private w: number,
    private h: number,
    private text: string,
    iconName: string,
    private color: number,
    private shade: number,
    private onFire: () => void,
  ) {
    super();
    this.lbl = new PixelText(text, '#f4e8c1');
    this.ic.context = icon(iconName);
    this.addChild(this.g, this.ic, this.lbl);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-2, -2, w + 4, h + 4);
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this.enabled) return;
      this.holding = true;
      this.prog = 0;
      this.redraw();
    });
    const stop = () => {
      if (!this.holding) return;
      this.holding = false;
      this.prog = 0;
      this.redraw();
    };
    this.on('pointerup', stop);
    this.on('pointerupoutside', stop);
    this.on('pointerleave', stop);
    this.redraw();
  }
  get isHolding(): boolean {
    return this.holding;
  }
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.holding = false;
    this.prog = 0;
    this.redraw();
  }
  update(dt: number, ticked: (p: number) => void): void {
    if (!this.holding || !this.enabled) return;
    this.prog += dt / HOLD_S;
    ticked(this.prog);
    if (this.prog >= 1) {
      this.holding = false;
      this.prog = 0;
      this.redraw();
      this.onFire();
      return;
    }
    this.redraw();
  }
  redraw(): void {
    const { w, h } = this;
    const g = this.g.clear();
    const col = this.enabled ? this.color : C.disabled;
    const sh = this.enabled ? this.shade : 0x24202a;
    const off = this.holding ? 1 : 0;
    g.rect(0, 0, w, h + 1).fill(OUTLINE);
    g.rect(1, 1 + off, w - 2, h - 2).fill(sh);
    g.rect(1, 1 + off, w - 2, h - 3).fill(col);
    if (this.prog > 0) g.rect(1, 1 + off, Math.round((w - 2) * Math.min(1, this.prog)), h - 3).fill({ color: 0xfff0a0, alpha: 0.55 });
    g.rect(2, 2 + off, w - 4, 1).fill({ color: 0xffffff, alpha: 0.25 });
    this.ic.position.set(4, Math.floor((h - 9) / 2) + off);
    this.ic.alpha = this.enabled ? 1 : 0.4;
    const t = this.sub ? `${this.text}\n${this.sub}` : this.text;
    this.lbl.set(t, this.enabled ? '#f4e8c1' : '#7a6e80');
    this.lbl.position.set(16, Math.floor((h - measure(t).h) / 2) + off);
  }
  setSub(sub: string): void {
    if (sub === this.sub) return;
    this.sub = sub;
    this.redraw();
  }
}

export class BridgeScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: M.BridgeRun;
  private per: M.BridgePersistent;
  private groups: UpgradeGroup[];
  private poster: M.Poster;

  // layers
  private world = new Container();
  private bg = new Graphics();
  private water = new Graphics();
  private benchG = new Graphics();
  private posterC = new Container();
  private posterG = new Graphics();
  private signC = new Container();
  private signG = new Graphics();
  private signText = new PixelText('', '#e05050');
  private gateG = new Graphics();
  private goons: Graphics[] = [];
  private pileG = new Graphics();
  private grumm = new Graphics();
  private grummHit = new Container();
  private travG = new Graphics();
  private travHit = new Container();
  private claim = new Container();
  private claimBg = new Graphics();
  private claimIcons: Graphics[] = [];
  private gBub = new Container();
  private gBubBg = new Graphics();
  private gBubIcons: Graphics[] = [];
  private zoom = new Container();
  private zoomG = new Graphics();
  private fxG = new Graphics();
  private partLayer = new Container();
  private flash = new Graphics();
  private ui = new Container();
  private uiG = new Graphics();
  private modal = new Container();

  // ui
  private status = new PixelText('', C.inkDim);
  private statusR = new PixelText('', C.inkDim);
  private resp = new Container();
  private respBg = new Graphics();
  private respText = new PixelText('', '#2a1a3a', null);
  private readout = new PixelText('', '#f4e8c1');
  private coinsText = new PixelText('', '#e8c04a');
  private mood = new Graphics();
  private stack = new Container();
  private stackG = new Graphics();
  private tickLabels: PixelText[] = [];
  private unmaskBtn!: HoldButton;
  private searchBtn!: HoldButton;
  private waveBtn!: Button;
  private askBtn!: Button;
  private upgBtn!: Button;
  private downBtn!: Button;
  private upBtn!: Button;
  private buyBtn!: Button;
  private menaceText = new PixelText('', '#e05050');
  private badge = new Graphics();
  private napText = new PixelText('', '#fff08a');

  // geometry
  private cx = 0;
  private cw = 0;
  private top = 0;
  private sceneBottom = 0;
  private deckY = 0;
  private riverTop = 0;
  private travX = 0;
  private benchX = 0;
  private gateX = 0;
  private grummX = 0;
  /** Sprite scale: travelers and Grumm draw at 2x when the scene is tall enough. */
  private S = 1;
  private get tw(): number {
    return TRAV_W * this.S;
  }
  private get th(): number {
    return TRAV_H * this.S;
  }
  private pileX = 0;
  private stackX = 0;
  private stackY = 0;
  private stackH = 0;

  // state
  private bench: M.Traveler[] = [];
  private cur: Cur | null = null;
  private notch = 10;
  private dragging = false;
  private arriveT = 0;
  private napT = 0;
  private expr: GrummExpr = 'chew';
  private exprT = 0;
  private time = 0;
  private chewFrame = 0;
  private lastInput = performance.now();
  private parts: Part[] = [];
  private pool: Graphics[] = [];
  private shakeT = 0;
  private flashT = 0;
  private gBubT = 0;
  private zoomT = 0;
  private respT = 0;
  private respMsg = '';
  private respColor = '#2a1a3a';
  private falseInRow = 0;
  private showdownQueued = false;
  private gateOpen = 0;
  private slowT = 0;
  private shownBank = -1;
  private shownMenace = -1;
  private obStep: string | null = null;
  private benchKey = '';
  private travKey = '';
  private waterT = 0;
  private goonPop = -1;
  private goonPopT = 0;
  private shownGoons = -1;
  /** "Word gets around" (06 §4): false-accusation stamps (scene seconds) and the slowdown left. */
  private falseStamps: number[] = [];
  private wordT = 0;
  /** The Bard's song (+10% tolls) time left. */
  private songT = 0;
  /** Rule-card lesson travelers already sent this visit. */
  private lessonSent = new Set<string>();
  /** Return ritual (06 §13): goon crates by the gate. */
  private ritual: Ritual | null = null;
  private crateG = new Graphics();
  private crateKey = '';

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    M.normalize(ctx.save.run, ctx.save.persistent);
    this.run = ctx.save.run as M.BridgeRun;
    this.per = ctx.save.persistent as M.BridgePersistent;
    this.run.menace = Math.max(0, Math.min(this.run.menace, this.run.menaceMax));
    this.poster = M.posterFor(M.dayKey());
    this.groups = buildGroups(ctx, {
      onGoon: () => {
        if (this.run.lv.goons >= 3 && !ctx.seen('b.gang')) {
          ctx.markSeen('b.gang');
          ctx.say('firstHelper', { type: 'first_helper' });
        }
        this.layoutGoons();
      },
      onMenaceBought: (m) => this.onMenaceBought(m),
    });
    this.root.addChild(this.world, this.flash, this.ui, this.modal);
    this.world.addChild(
      this.bg,
      this.water,
      this.benchG,
      this.posterC,
      this.signC,
      this.pileG,
      this.crateG,
      this.grumm,
      this.grummHit,
      this.travG,
      this.travHit,
      this.gateG,
      this.claim,
      this.gBub,
      this.fxG,
      this.zoom,
      this.partLayer,
    );
    this.posterC.addChild(this.posterG);
    this.signC.addChild(this.signG, this.signText);
    this.claim.addChild(this.claimBg);
    for (let i = 0; i < 3; i++) {
      const g = new Graphics();
      this.claimIcons.push(g);
      this.claim.addChild(g);
      const b = new Graphics();
      this.gBubIcons.push(b);
    }
    this.gBub.addChild(this.gBubBg, ...this.gBubIcons);
    this.gBub.visible = false;
    this.zoom.addChild(this.zoomG);
    this.zoom.visible = false;
    this.zoom.eventMode = 'none';
    this.claim.eventMode = 'none';
    this.gBub.eventMode = 'none';
    this.partLayer.eventMode = 'none';
    this.fxG.eventMode = 'none';
    this.flash.eventMode = 'none';
    this.crateG.eventMode = 'none';

    this.root.eventMode = 'static';
    this.root.on('pointerdown', () => (this.lastInput = performance.now()));

    // Grumm: tap to wake him from a nap.
    this.grummHit.eventMode = 'static';
    this.grummHit.cursor = 'pointer';
    this.grummHit.on('pointertap', () => this.tapGrumm());
    // Traveler: tap to look closer (zoom at 1x, Squint pointers, a shifter's flicker).
    this.travHit.eventMode = 'static';
    this.travHit.cursor = 'pointer';
    this.travHit.on('pointertap', () => this.look());
    // Poster: tap to open the notice board.
    this.posterC.eventMode = 'static';
    this.posterC.cursor = 'pointer';
    this.posterC.on('pointertap', () => this.openBoard());

    this.buildLayout();
    // The bench starts full (06 §9: "process the 3 travelers on the bench").
    for (let i = 0; i < M.benchCap(this.run.lv.bench); i++) this.bench.push(this.gen());
    this.pullNext();
  }

  // ---------- layout ----------

  private buildLayout(): void {
    const c = this.ctx.content();
    const L = this.ctx.layout;
    this.cx = c.x;
    this.cw = c.w;
    this.top = c.y;
    const ctrlH = 117;
    this.sceneBottom = c.y + c.h - ctrlH;
    this.riverTop = this.sceneBottom - 18;
    this.deckY = this.riverTop - 6;
    this.S = this.sceneBottom - c.y >= 190 && c.w >= 180 ? 2 : 1;
    this.benchX = c.x + 3;
    if (this.S === 2) {
      this.travX = c.x + 36;
      this.grummX = c.x + c.w - 74;
      this.gateX = this.travX + this.tw + Math.floor((this.grummX - this.travX - this.tw) / 2) - 8;
      this.pileX = this.gateX + 8;
    } else {
      this.travX = c.x + Math.floor(c.w * 0.36) - 12;
      this.gateX = c.x + Math.floor(c.w * 0.6);
      this.grummX = c.x + c.w - 40;
      this.pileX = this.grummX - 14;
    }

    this.drawBackground(L.w, L.h);
    this.drawPoster();
    this.drawSign();
    this.drawGate();
    this.layoutGoons();
    this.grumm.scale.set(this.S);
    this.grumm.position.set(this.grummX, this.deckY - 40 * this.S);
    this.grummHit.hitArea = new Rectangle(this.grummX - 4, this.deckY - 40 * this.S - 4, 36 * this.S + 8, 40 * this.S + 8);
    this.travHit.hitArea = new Rectangle(this.travX - 4, this.deckY - this.th - 2, this.tw + 8, this.th + 4);

    // ---- controls ----
    this.ui.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    this.tickLabels = [];
    this.status = new PixelText('', C.inkDim);
    this.statusR = new PixelText('', C.inkDim);
    this.respText = new PixelText('', '#2a1a3a', null);
    this.readout = new PixelText('', '#f4e8c1');
    this.coinsText = new PixelText('', '#e8c04a');
    this.menaceText = new PixelText('', '#e05050');
    this.napText = new PixelText('', '#fff08a');
    this.respBg = new Graphics();
    this.resp = new Container();
    this.mood = new Graphics();
    this.stack = new Container();
    this.stackG = new Graphics();
    this.badge = new Graphics();
    this.uiG = new Graphics();
    this.ui.addChild(this.uiG, this.status, this.statusR);

    const x0 = c.x + 3;
    const right = c.x + c.w - 3;
    const statusY = this.sceneBottom + 2;
    const respY = statusY + 9;
    const thumbY = respY + 19;
    const rowY = thumbY + 67;
    this.status.position.set(x0, statusY);

    // Response bubble (tap to take a counter-offer).
    this.resp.addChild(this.respBg, this.respText);
    this.resp.position.set(x0, respY);
    this.resp.eventMode = 'static';
    this.resp.cursor = 'pointer';
    this.resp.hitArea = new Rectangle(0, -2, right - x0, 20);
    this.resp.on('pointertap', () => {
      if (this.cur?.phase === 'counter') this.takeCounter();
    });
    this.ui.addChild(this.resp);

    // Verdicts (left), Coin Stack (right): opposite sides so a drag can't fire a verdict.
    const vw = 56;
    this.unmaskBtn = new HoldButton(vw, 30, 'UNMASK', 'mask', 0x8a3a9a, 0x4a1a5a, () => this.unmask());
    this.unmaskBtn.position.set(x0, thumbY);
    this.searchBtn = new HoldButton(vw, 30, 'SEARCH', 'barrel', 0x3a6ea8, 0x1a3a6a, () => this.search());
    this.searchBtn.position.set(x0, thumbY + 34);
    this.ui.addChild(this.unmaskBtn, this.searchBtn);

    const sw = 30;
    this.stackX = right - sw;
    this.stackY = thumbY;
    this.stackH = 64;
    this.stack.position.set(this.stackX, this.stackY);
    this.stack.addChild(this.stackG);
    this.stack.eventMode = 'static';
    this.stack.cursor = 'ns-resize';
    this.stack.hitArea = new Rectangle(-8, -4, sw + 10, this.stackH + 8);
    this.stack.on('pointerdown', (e: FederatedPointerEvent) => this.stackDown(e));
    this.stack.on('globalpointermove', (e: FederatedPointerEvent) => this.stackMove(e));
    this.stack.on('pointerup', () => this.stackUp());
    this.stack.on('pointerupoutside', () => this.stackUp());
    this.ui.addChild(this.stack);
    for (const m of [1, 2, 3, 4]) {
      const t = new PixelText(`${m}X`, C.inkDim);
      t.position.set(this.stackX - 10, this.notchY(m * 10) - 2);
      this.tickLabels.push(t);
      this.ui.addChild(t);
    }

    const mx = x0 + vw + 4;
    const mw = this.stackX - 12 - mx;
    this.readout.scale.set(2);
    this.readout.position.set(mx, thumbY + 2);
    this.coinsText.position.set(mx, thumbY + 16);
    this.mood.position.set(mx + mw - 10, thumbY + 3);
    this.ui.addChild(this.readout, this.coinsText, this.mood);
    const bw = Math.floor((mw - 3) / 2);
    this.waveBtn = new Button({ w: bw, h: 29, label: 'WAVE', sub: 'FREE', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.waveOrTake() });
    this.waveBtn.position.set(mx, thumbY + 34);
    this.askBtn = new Button({ w: mw - bw - 3, h: 29, label: 'ASK', sub: '', color: C.gold, shade: 0x9a7a20, onTap: () => this.demand() });
    this.askBtn.position.set(mx + bw + 3, thumbY + 34);
    this.ui.addChild(this.waveBtn, this.askBtn);

    // Bottom row: Upgrades and the Menace dial.
    const dark = { color: C.edge, shade: 0x3a2046, textColor: C.ink };
    const total = right - x0;
    const upgW = Math.max(52, Math.floor(total * 0.32));
    this.upgBtn = new Button({ w: upgW, h: 16, label: 'UPGRADES', onTap: () => this.ctx.openUpgrades(this.groups) });
    this.upgBtn.position.set(x0, rowY);
    this.badge.position.set(x0 + upgW - 6, rowY - 3);
    const dx = x0 + upgW + 4;
    this.downBtn = new Button({ w: 14, h: 16, label: '-', ...dark, onTap: () => this.setMenace(this.run.menace - 1) });
    this.downBtn.position.set(dx, rowY);
    this.menaceText.position.set(dx + 17, rowY + 2);
    this.upBtn = new Button({ w: 14, h: 16, label: '+', ...dark, onTap: () => this.setMenace(this.run.menace + 1) });
    this.upBtn.position.set(dx + 42, rowY);
    const buyX = dx + 59;
    this.buyBtn = new Button({ w: right - buyX, h: 16, label: 'BUY', color: 0xc03a3a, shade: 0x7a2020, textColor: C.ink, onTap: () => this.buyMenace() });
    this.buyBtn.position.set(buyX, rowY);
    this.ui.addChild(this.upgBtn, this.downBtn, this.menaceText, this.upBtn, this.buyBtn, this.badge, this.napText);
    this.napText.position.set(this.grummX - 24, this.deckY - 40 * this.S - 10);
    this.shownMenace = -1;
    this.travKey = '';
    this.benchKey = '';
  }

  private drawBackground(w: number, h: number): void {
    const g = this.bg.clear();
    const top = this.top;
    const deck = this.deckY;
    // sky gradient bands
    const bands = [0x2a1a4a, 0x3a2456, 0x4a2e60, 0x5a3a66];
    const skyH = deck - top;
    for (let i = 0; i < bands.length; i++) g.rect(0, top + Math.floor((skyH * i) / bands.length), w, Math.ceil(skyH / bands.length) + 1).fill(bands[i]);
    // stars
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 30; i++) g.rect(Math.floor(rnd() * w), top + Math.floor(rnd() * skyH * 0.6), 1, 1).fill(rnd() < 0.3 ? 0xf4e8c1 : 0x9c8aa8);
    // moon
    g.circle(this.cx + Math.floor(this.cw * 0.5), top + 40, 7).fill(0xe8dcc0);
    g.circle(this.cx + Math.floor(this.cw * 0.5) + 3, top + 38, 6).fill(bands[0]);
    // far hills and the Overlord's castle on the horizon
    const hy = deck - 28;
    for (let x = 0; x < w; x++) {
      const hh = Math.floor(8 + 5 * Math.sin(x / 13) + 3 * Math.sin(x / 5.3));
      g.rect(x, hy - hh, 1, hh + 30).fill(0x24183a);
    }
    const kx = this.cx + this.cw - 70;
    g.rect(kx, hy - 26, 14, 26).fill(0x1a1028);
    g.rect(kx + 3, hy - 32, 8, 6).fill(0x1a1028);
    g.rect(kx - 4, hy - 18, 4, 18).fill(0x1a1028);
    g.rect(kx + 14, hy - 18, 4, 18).fill(0x1a1028);
    g.rect(kx + 6, hy - 22, 2, 3).fill(0xe8a040);
    g.rect(kx + 6, hy - 37, 1, 5).fill(0x1a1028);
    g.rect(kx + 7, hy - 37, 3, 2).fill(0xc03a3a);
    // river
    g.rect(0, this.riverTop, w, this.sceneBottom - this.riverTop).fill(0x1e3a5a);
    g.rect(0, this.riverTop, w, 1).fill(0x2a5a7a);
    // banks
    const lb = this.cx + 30;
    const rb = this.cx + this.cw - 48;
    g.rect(0, deck, lb, this.sceneBottom - deck).fill(0x3a2a1a);
    g.rect(0, deck, lb, 2).fill(0x4a6a2a);
    g.rect(rb, deck, w - rb, this.sceneBottom - deck).fill(0x3a2a1a);
    g.rect(rb, deck, w - rb, 2).fill(0x4a6a2a);
    for (let i = 0; i < 10; i++) g.rect(Math.floor(rnd() * lb), deck + 3 + Math.floor(rnd() * 10), 2, 1).fill(0x2a1a10);
    // bridge: deck planks, railing, pillars
    g.rect(lb - 4, deck, rb - lb + 8, 5).fill(WOOD_D);
    g.rect(lb - 4, deck, rb - lb + 8, 1).fill(WOOD_L);
    for (let x = lb - 2; x < rb + 4; x += 6) g.rect(x, deck + 1, 1, 4).fill(0x3a2010);
    for (const px of [lb + 6, Math.floor((lb + rb) / 2), rb - 8]) {
      g.rect(px, deck + 5, 4, this.sceneBottom - deck - 5).fill(WOOD_D);
      g.rect(px, deck + 5, 1, this.sceneBottom - deck - 5).fill(WOOD);
    }
    // back railing (behind travelers)
    g.rect(lb - 4, deck - 12, rb - lb + 8, 2).fill(WOOD);
    for (let x = lb - 4; x < rb + 4; x += 12) g.rect(x, deck - 12, 2, 12).fill(WOOD_D);
    // bench on the left bank
    g.rect(this.benchX, deck - 6, 30, 2).fill(WOOD);
    g.rect(this.benchX + 2, deck - 4, 2, 4).fill(WOOD_D);
    g.rect(this.benchX + 25, deck - 4, 2, 4).fill(WOOD_D);
    // backdrop for the controls
    g.rect(0, this.sceneBottom, w, h - this.sceneBottom).fill(0x1c1028);
    g.rect(0, this.sceneBottom, w, 1).fill(OUTLINE);
  }

  private drawPoster(): void {
    const g = this.posterG.clear();
    const x = this.cx + 3;
    const y = this.deckY - 50;
    g.rect(x + 11, y + 26, 2, this.deckY - y - 26).fill(WOOD_D);
    g.rect(x - 1, y - 1, 26, 29).fill(OUTLINE);
    g.rect(x, y, 24, 27).fill(0xe8d8a8);
    g.rect(x + 2, y + 2, 20, 4).fill(0x8a2a2a);
    // A tiny wanted face in the poster hero's colours.
    const p = this.poster;
    g.rect(x + 7, y + 8, 10, 10).fill(0xf0c8a0);
    g.rect(x + 7, y + 8, 10, 3).fill(M.HAIRS[p.hair]);
    g.rect(x + 9, y + 12, 1, 1).fill(OUTLINE);
    g.rect(x + 14, y + 12, 1, 1).fill(OUTLINE);
    if (p.shows.includes('mark')) {
      if (p.mark === 1) g.rect(x + 13, y + 11, 3, 3).fill(OUTLINE);
      else if (p.mark === 2) g.rect(x + 9, y + 15, 6, 1).fill(M.HAIRS[p.hair]);
      else g.rect(x + 9, y + 11, 1, 3).fill(0xc03a3a);
    }
    g.rect(x + 5, y + 18, 14, 6).fill(p.shows.includes('cloak') ? M.CLOAKS[p.cloak] : 0x8a7a6a);
    g.rect(x + 3, y + 3, 18, 1).fill(0xf4e8c1);
    this.posterC.hitArea = new Rectangle(x - 4, y - 4, 32, 36);
  }

  private drawSign(): void {
    const g = this.signG.clear();
    const x = this.cx + this.cw - 32;
    const y = this.deckY - 40 * this.S - 38;
    g.rect(x + 13, y + 14, 2, 22).fill(WOOD_D);
    g.rect(x, y, 28, 15).fill(OUTLINE);
    g.rect(x + 1, y + 1, 26, 13).fill(WOOD);
    g.rect(x + 1, y + 1, 26, 1).fill(WOOD_L);
    // skulls get added as Menace rises
    const m = this.run.menace;
    const sk = Math.min(5, Math.ceil(m / 4));
    for (let i = 0; i < sk; i++) {
      g.rect(x + 2 + i * 5, y - 4, 4, 3).fill(0xe8e0d0);
      g.rect(x + 3 + i * 5, y - 1, 2, 1).fill(0xe8e0d0);
    }
    this.signText.set(`M${m}`, m > 0 ? '#ff6040' : '#f4e8c1');
    this.signText.position.set(x + Math.floor((28 - this.signText.width) / 2), y + 5);
  }

  private drawGate(): void {
    const g = this.gateG.clear();
    const x = this.gateX;
    const y = this.deckY;
    const ph = this.S === 2 ? 40 : 26;
    const ay = this.S === 2 ? 14 : 20;
    g.rect(x, y - ph, 4, ph + 2).fill(WOOD_D);
    g.rect(x + 1, y - ph, 1, ph + 2).fill(WOOD_L);
    g.rect(x - 1, y - ph - 2, 6, 3).fill(0x5a3a22);
    if (this.gateOpen < 0.5) {
      // striped arm across the deck
      for (let i = 0; i < 26; i += 4) g.rect(x - 26 + i, y - ay, 4, 3).fill(i % 8 === 0 ? 0xc03a3a : 0xf4e8c1);
      g.rect(x - 26, y - ay, 26, 1).fill({ color: 0x000000, alpha: 0.2 });
    } else {
      for (let i = 0; i < 26; i += 4) g.rect(x, y - ph - 26 + i, 3, 4).fill(i % 8 === 0 ? 0xc03a3a : 0xf4e8c1);
    }
  }


  private layoutGoons(): void {
    const n = this.run.lv.goons;
    while (this.goons.length < n) {
      const g = new Graphics(goonArt(0));
      this.goons.push(g);
      this.world.addChildAt(g, this.world.getChildIndex(this.water) + 1);
    }
    const base = this.cx + Math.floor(this.cw * 0.3);
    this.goons.forEach((g, i) => {
      g.visible = i < n;
      g.position.set(base + i * 22, this.riverTop + 2);
    });
  }

  private notchY(n: number): number {
    const f = (n - M.NOTCH_MIN) / (M.NOTCH_MAX - M.NOTCH_MIN);
    return this.stackY + this.stackH - 3 - Math.round(f * (this.stackH - 6));
  }

  // ---------- travelers ----------

  private gen(force?: M.Force): M.Traveler {
    const r = this.run;
    return M.generate(r.seed, r.idx++, { menace: r.menace, booth: r.lv.booth, nose: r.lv.nose, sniffer: r.lv.sniffer, poster: this.poster, force });
  }

  private pendingStep(): string | null {
    const d = this.ctx.save;
    if (d.seen.onboardingDone) return null;
    const s = this.ctx.def.onboarding.find((st) => !d.seen[`ob.${st.id}`] && !st.done(d));
    return s?.id ?? null;
  }

  private pullNext(): void {
    if (this.cur) return;
    const step = this.pendingStep();
    const card = this.lessonCard();
    let t: M.Traveler | undefined;
    if ((step === 'look' || step === 'toll') && this.run.stats.travelers === 0) t = this.gen('merchant');
    else if (card) {
      this.lessonSent.add(card);
      t = this.gen(M.CARD_FORCE[card]);
    } else if (step === 'unmask') t = this.gen('heroLesson');
    else if (step === 'search') t = this.gen('smugglerLesson');
    else if (this.showdownQueued && Math.random() < 0.4) {
      this.showdownQueued = false;
      t = this.gen('showdown');
    } else t = this.bench.shift();
    if (!t) return;
    this.run.stats.travelers++;
    const fromX = this.benchX + 4;
    this.cur = {
      t,
      phase: 'walkIn',
      timer: 0,
      x: fromX,
      fromX,
      toX: this.travX,
      h: { round: 0, counter: 0, offended: false },
      face: 'calm',
      revealed: false,
      lidOpen: false,
      searched: false,
      goonT: 0,
      looks: 0,
      shiftT: 0,
    };
    this.notch = 10;
    this.gateOpen = 0;
    this.drawGate();
  }

  /** A rule-card lesson whose board beat is done and whose traveler hasn't come yet (06 §18). */
  private lessonCard(): string | null {
    const seen = this.ctx.save.seen;
    for (const rc of M.RULE_CARDS) {
      const id = `card_${rc.id}`;
      if (seen[`ls.${id}`] || !seen[`ls.${id}.board`] || seen[`b.lsv.${rc.id}`] || this.lessonSent.has(rc.id)) continue;
      return rc.id;
    }
    return null;
  }

  private leave(dir: 1 | -1, face: Face = 'calm'): void {
    const c = this.cur;
    if (!c) return;
    // A rule-card lesson traveler is done once it leaves, whatever the verdict.
    const card = LESSON_CARD[c.t.scripted];
    if (card && c.phase !== 'leave') this.ctx.markSeen(`b.lsv.${card}`);
    c.phase = 'leave';
    c.timer = 0;
    c.fromX = c.x;
    c.toX = dir > 0 ? this.ctx.layout.w + 4 : -this.tw - 4;
    c.face = face;
    if (dir > 0) {
      this.gateOpen = 1;
      this.drawGate();
    }
  }

  private heroSlipped(): void {
    const c = this.cur;
    if (!c?.t.hero) return;
    this.run.stats.slipped++;
    if (c.t.showdown) {
      this.run.whisper = 3;
      return;
    }
    this.run.whisper = Math.min(5, this.run.whisper + 1);
    if (this.run.whisper >= 5 && !this.showdownQueued) {
      this.showdownQueued = true;
      this.run.whisper = 0;
      this.grummSay(['poster', 'bang', 'mask'], 'squint');
      this.ctx.say('showdown', { type: 'tier_reached', key: 'showdown' });
    }
  }

  // ---------- actions ----------

  private canAct(): boolean {
    const c = this.cur;
    return !!c && (c.phase === 'wait' || c.phase === 'counter') && this.napT <= 0 && !this.modal.children.length;
  }

  private demand(): void {
    if (!this.canAct()) return;
    const c = this.cur!;
    const mult = this.notch / 10;
    const rep = M.reply(c.t, c.h, this.run, mult);
    if (rep.kind === 'pay') this.collect(mult);
    else if (rep.kind === 'counter') {
      c.h.round = 1;
      c.h.counter = rep.mult;
      c.phase = 'counter';
      c.face = 'angry';
      this.ctx.haptic(8);
      this.grummSay(['question'], 'squint');
      this.travKey = '';
    } else if (rep.kind === 'leave') {
      this.run.streak = 0;
      this.say(`TURNED BACK! TOO PRICEY`, '#c03a3a');
      this.ctx.float('NOPE', c.x + this.tw / 2, this.deckY - this.th - 6, C.redText);
      this.grummSay(['cross'], 'blush');
      sfx.sad(this.vol());
      this.leave(-1, 'angry');
    } else this.bonk();
  }

  private collect(mult: number): void {
    const c = this.cur!;
    const r = this.run;
    if (mult >= M.STREAK_MIN - 1e-6) r.streak = Math.min(10, r.streak + 1);
    r.stats.bestStreak = Math.max(r.stats.bestStreak, r.streak);
    const song = this.songT > 0 ? M.SONG_MULT : 1;
    const base = c.t.claimFare * mult * M.fareMult(r, this.skulls) * M.streakMult(r.streak) * song;
    const got = this.ctx.earn(base);
    r.stats.tolls++;
    if (c.t.kind === 'bard') {
      // Pays in song too (06 §5): +10% tolls for 30 s.
      this.songT = M.SONG_S;
      this.ctx.say('bard', { type: 'tier_reached', key: 'bard' });
    }
    this.coinBurst(c.x + this.tw / 2, this.deckY - this.th / 2, Math.min(8, 2 + Math.round(mult * 2)), got);
    this.say(`PAID ${mult.toFixed(1)}X${r.streak >= 2 ? `  STREAK ${r.streak}` : ''}`, '#2a6a1a');
    this.grummSay(['coin'], 'grin');
    sfx.clink(this.vol(), r.streak);
    this.ctx.haptic(10);
    this.heroSlipped();
    this.leave(1, 'happy');
  }

  private takeCounter(): void {
    if (!this.canAct() || this.cur!.phase !== 'counter') return;
    this.collect(this.cur!.h.counter);
  }

  /** Bribes card (Menace 15): the smuggler's offer stands until a search or a demand. */
  private bribeOpen(): boolean {
    const c = this.cur;
    return !!c && c.t.bribe > 0 && c.phase === 'wait' && !c.searched && c.h.round === 0;
  }

  private takeBribe(): void {
    if (!this.canAct() || !this.bribeOpen()) return;
    const c = this.cur!;
    this.run.stats.bribes++;
    this.grummSay(['coin', 'check'], 'grin');
    this.collect(c.t.bribe);
  }

  private waveOrTake(): void {
    if (!this.canAct()) return;
    const c = this.cur!;
    if (c.phase === 'counter') {
      this.takeCounter();
      return;
    }
    if (this.bribeOpen()) {
      this.takeBribe();
      return;
    }
    this.say('WAVED THROUGH, FREE', '#2a1a3a');
    this.grummSay(['check'], 'chew');
    this.heroSlipped();
    this.leave(1, 'happy');
  }

  /** Skulls on Posts (Bones import level). */
  private get skulls(): number {
    return this.ctx.save.imports?.bones ?? 0;
  }

  private unmask(): void {
    if (!this.canAct()) return;
    const c = this.cur!;
    const r = this.run;
    if (c.t.hero) {
      const ev = M.evidence(c.t);
      const mult = c.t.showdown ? 10 : M.bountyMult(ev);
      const got = this.ctx.earn(c.t.kindFare * M.unmaskPay(mult, this.ctx.save.imports?.captives ?? 0) * M.fareMult(r, this.skulls));
      r.stats.unmasks++;
      this.per.bountiesLife++;
      if (ev >= 2) {
        r.stats.evUnmasks++;
        const k = String(r.menace);
        r.ev[k] = (r.ev[k] ?? 0) + 1;
        const held = M.heldMenace(r.ev);
        if (held >= 0) this.ctx.raiseSkill(held);
      }
      if (mult >= 10) {
        r.stats.bounty10++;
        if (!this.ctx.seen('b.tier10')) {
          this.ctx.markSeen('b.tier10');
          this.ctx.say('tier10x', { type: 'tier_reached', key: 'bounty10' });
        }
      }
      r.whisper = Math.max(0, r.whisper - 1);
      this.falseInRow = 0;
      c.phase = 'reveal';
      c.timer = 0;
      c.revealed = true;
      c.face = 'shock';
      this.travKey = '';
      this.poof(c.x + this.tw / 2, this.deckY - this.th / 2);
      this.coinFountain(c.x + this.tw / 2, this.deckY - this.th * 0.7, mult >= 10 ? 14 : mult >= 5 ? 9 : 5, got);
      const proof = ev >= 2 ? (c.t.posterMatch ? 'WANTED!' : 'PROVEN') : ev === 1 ? 'HUNCH' : 'LUCKY';
      this.say(`A HERO! BOUNTY X${mult} (${proof})`, '#6a1a7a');
      this.ctx.float(`BOUNTY X${mult}!`, c.x + this.tw / 2, this.deckY - this.th - 12, mult >= 10 ? '#ffe060' : '#e8c04a');
      this.grummSay(mult >= 10 ? ['mask', 'coin', 'coin'] : ['mask', 'coin'], 'thump');
      sfx.poof(this.vol());
      this.ctx.haptic(30);
      this.shakeT = 0.15;
    } else {
      this.falseAccusation();
      this.falseInRow++;
      if (this.falseInRow >= 3) {
        // Struggle (06 §18): the offer opens the Poster board.
        this.falseInRow = 0;
        this.ctx.say('struggle', { type: 'struggle', offer: () => this.openBoard() });
      }
      this.say('NOT A HERO! STORMS OFF, NO TOLL', '#c03a3a');
      this.ctx.float('WRONG!', c.x + this.tw / 2, this.deckY - this.th - 6, C.redText);
      this.grummSay(['mask', 'cross', 'blush'], 'blush');
      sfx.sad(this.vol());
      this.ctx.haptic(20);
      this.leave(1, 'angry');
    }
  }

  /** A false Unmask or Search: the Streak breaks; 3 within 60 s and word gets around (06 §4). */
  private falseAccusation(): void {
    const r = this.run;
    r.streak = 0;
    r.stats.falseAcc++;
    if (M.falseAccusation(this.falseStamps, this.time)) {
      this.wordT = M.WORD_S;
      this.ctx.float('WORD GETS AROUND', this.cx + this.cw / 2 - 30, this.top + 20, C.redText);
      this.ctx.say('word', { type: 'hazard_first', key: 'word' });
    }
  }

  private search(): void {
    if (this.ritual && !this.ritual.done) {
      this.popCrate();
      return;
    }
    if (!this.canAct()) return;
    const c = this.cur!;
    if (c.searched || c.phase !== 'wait') return;
    c.searched = true;
    c.phase = 'search';
    c.timer = 0;
    this.grummSay(['eye', 'barrel'], 'squint');
    this.ctx.haptic(10);
  }

  private finishSearch(): void {
    const c = this.cur!;
    const r = this.run;
    if (c.t.smuggler) {
      c.lidOpen = true;
      this.travKey = '';
      const got = this.ctx.earn(c.t.kindFare * 4 * M.fareMult(r, this.skulls)); // 3x fare goods + 1x fine
      r.stats.confisc++;
      this.falseInRow = 0;
      this.eels(c.x + 3 * this.S, this.deckY - this.th * 0.7);
      this.coinBurst(c.x + this.tw / 2, this.deckY - this.th / 2, 5, got);
      this.say('CONTRABAND! SEIZED + FINE (4X)', '#2a6a1a');
      this.grummSay(['barrel', 'check'], 'grin');
      sfx.clink(this.vol(), 4);
      this.ctx.haptic(20);
      c.phase = 'reveal';
      c.timer = 0.3;
      c.face = 'shock';
    } else {
      // Innocent: offended. Wallet -20%, patience -50%, Streak breaks.
      c.h.offended = true;
      c.face = 'angry';
      this.travKey = '';
      this.falseAccusation();
      this.say('CLEAN! THEY ARE OFFENDED (PURSE -20%)', '#c03a3a');
      this.grummSay(['barrel', 'cross'], 'blush');
      sfx.sad(this.vol());
      c.phase = 'wait';
    }
  }

  private bonk(): void {
    const r = this.run;
    r.streak = 0;
    r.stats.bonks++;
    this.napT = M.napSeconds(r.lv.skull);
    this.flashT = 0.12;
    this.shakeT = 0.3;
    this.setExpr('nap', 999);
    this.say('BONK! GRUMM NAPS. GOONS TAKE THE GATE', '#c03a3a');
    this.ctx.float('BONK!', this.grummX + 18 * this.S, this.deckY - 40 * this.S - 10, '#fff08a');
    sfx.bonk(this.vol());
    this.ctx.haptic(60);
    if (!this.ctx.seen('b.bonk')) {
      this.ctx.markSeen('b.bonk');
      this.ctx.say('hazardFirst', { type: 'hazard_first', key: 'bonk' });
    }
    this.leave(1, 'angry');
  }

  private tapGrumm(): void {
    if (this.napT > 0) {
      this.napT = Math.max(0, this.napT - 1);
      this.ctx.haptic(6);
      this.ctx.float('!', this.grummX + 18 * this.S, this.deckY - 40 * this.S - 6, '#fff08a');
      return;
    }
    this.grummSay(['coin', 'point'], 'grin');
    sfx.grumm(this.vol(), 2);
  }

  /** The goons process the traveler at the gate (nap, idle gate, or bench overflow). */
  private goonPass(t: M.Traveler, atGate: boolean): void {
    const amount = M.goonToll(this.run, t, this.skulls);
    const i = this.goons.length ? Math.floor(Math.random() * Math.min(this.goons.length, this.run.lv.goons)) : -1;
    if (amount > 0) {
      const got = this.ctx.earn(amount);
      const x = atGate ? this.travX + 12 : this.benchX + 14;
      this.ctx.float(`+${formatNum(got)}`, x, this.deckY - (atGate ? 46 : 20), '#c8a050');
      if (i >= 0) {
        this.goonPop = i;
        this.goonPopT = 0.5;
      }
    }
    if (atGate) {
      if (t.hero) this.run.stats.slipped++;
      this.leave(1, 'calm');
    }
  }

  private setMenace(m: number): void {
    const v = Math.max(0, Math.min(this.run.menaceMax, m));
    if (v === this.run.menace) return;
    this.run.menace = v;
    this.ctx.haptic(5);
    this.drawSign();
  }

  private buyMenace(): void {
    const e = this.groups.find((g) => g.name === 'Menace')?.entries[0];
    if (!e || !e.canAfford()) return;
    e.buy();
    this.ctx.saveSoon();
  }

  private onMenaceBought(m: number): void {
    this.drawSign();
    this.ctx.haptic(25);
    this.grummSay(['sign', 'up', 'coin'], 'grin');
    sfx.grumm(this.vol(), 3);
    const card = M.cardAt(m);
    const seen = this.ctx.save.seen;
    const best = seen['b.mBest'] ?? 0;
    if (m > best) seen['b.mBest'] = m;
    if (card && !this.ctx.seen(`b.card.${card.id}`)) {
      // mechanic_unlocked: the director runs the card's micro-lesson (index.ts lessons).
      this.ctx.markSeen(`b.card.${card.id}`);
      this.ctx.say(`card_${card.id}`, { type: 'mechanic_unlocked' });
      this.ctx.game.toast(`NEW RULE: ${card.name}. ${card.desc}`);
    } else if (m === 1 || m % 5 === 0 || m > best) this.ctx.say('dialRaised', { type: 'dial_raised', key: `m${m}` });
  }

  // ---------- coin stack ----------

  private stackDown(e: FederatedPointerEvent): void {
    e.stopPropagation();
    if (!this.canAct()) return;
    this.dragging = true;
    this.stackMove(e);
  }

  private stackMove(e: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const p = e.getLocalPosition(this.ui);
    const f = (this.stackY + this.stackH - 3 - p.y) / (this.stackH - 6);
    const n = Math.max(M.NOTCH_MIN, Math.min(M.NOTCH_MAX, M.NOTCH_MIN + Math.round(f * (M.NOTCH_MAX - M.NOTCH_MIN))));
    if (n !== this.notch) {
      if (Math.floor(n / 5) !== Math.floor(this.notch / 5)) {
        this.ctx.haptic(5);
        sfx.tick(this.vol());
      }
      this.notch = n;
    }
  }

  private stackUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    // Releasing sends the demand (06 §11).
    this.demand();
  }

  // ---------- juice ----------

  private vol(): number {
    return this.ctx.game.save.meta.settings.sfx ?? 0.6;
  }

  private say(msg: string, color: string): void {
    this.respMsg = msg;
    this.respColor = color;
    this.respT = 2.2;
  }

  private setExpr(e: GrummExpr, dur = 1.2): void {
    if (this.napT > 0 && e !== 'nap') return;
    this.expr = e;
    this.exprT = dur;
  }

  /** Grumm's icon-only bubble rising from his sprite (06 §18 dock exception). */
  private grummSay(icons: string[], expr: GrummExpr): void {
    this.setExpr(expr);
    const n = Math.min(3, icons.length);
    const w = 6 + n * 11;
    const g = this.gBubBg.clear();
    g.rect(0, 0, w, 15).fill(OUTLINE);
    g.rect(1, 1, w - 2, 13).fill(0xf4e8c1);
    g.rect(w - 9, 15, 3, 2).fill(OUTLINE);
    g.rect(w - 8, 14, 1, 2).fill(0xf4e8c1);
    this.gBubIcons.forEach((ic, i) => {
      ic.visible = i < n;
      if (i < n) {
        ic.context = icon(icons[i]);
        ic.position.set(4 + i * 11, 3);
      }
    });
    this.gBub.position.set(this.grummX + 22 * this.S - w, this.deckY - 40 * this.S - 20);
    this.gBub.visible = true;
    this.gBubT = 1.6;
  }

  private spawn(kind: Parameters<typeof particle>[0]): Part | null {
    if (this.parts.length >= MAX_PARTS) return null;
    let g = this.pool.pop();
    if (!g) {
      g = new Graphics();
      this.partLayer.addChild(g);
    }
    g.context = particle(kind);
    g.visible = true;
    g.alpha = 1;
    const p: Part = { g, kind: 'ball', x: 0, y: 0, vx: 0, vy: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 0.5, life: 1, grav: 0 };
    this.parts.push(p);
    return p;
  }

  private coinBurst(x: number, y: number, n: number, got: number): void {
    const tx = this.pileX + 4;
    const ty = this.deckY - 6;
    for (let i = 0; i < n; i++) {
      const p = this.spawn('coin');
      if (!p) break;
      p.kind = 'arc';
      p.x0 = x + (Math.random() - 0.5) * 8;
      p.y0 = y;
      p.x1 = tx + (Math.random() - 0.5) * 6;
      p.y1 = ty;
      p.dur = 0.45 + i * 0.05;
      p.t = 0;
      if (i === n - 1) p.onLand = () => sfx.clink(this.vol(), this.run.streak + 2);
    }
    this.ctx.float(`+${formatNum(got)}`, x, y - 20, '#ffe060');
  }

  private coinFountain(x: number, y: number, n: number, got: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn('coin');
      if (!p) break;
      p.kind = 'ball';
      p.x = x;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 70;
      p.vy = -60 - Math.random() * 60;
      p.grav = 220;
      p.life = 0.9;
    }
    this.coinBurst(x, y, Math.min(5, n), got);
  }

  private poof(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const p = this.spawn(i % 3 === 0 ? 'cloth' : 'poof');
      if (!p) break;
      const a = (i / 10) * Math.PI * 2;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * 40;
      p.vy = Math.sin(a) * 30 - 10;
      p.grav = 30;
      p.life = 0.6;
    }
  }

  private eels(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this.spawn('eel');
      if (!p) break;
      p.x = x;
      p.y = y;
      p.vx = -30 + Math.random() * 70;
      p.vy = -70 - Math.random() * 40;
      p.grav = 240;
      p.life = 1.0;
    }
  }

  /** Tap on the traveler: look closer (06 §2 "zoom", §11 "squint"). At 1x the sprite zooms; with
   * Squint, Grumm points at up to L odd parts; a shifter's Claim flickers on the second look. */
  private look(): void {
    const c = this.cur;
    if (!c || c.phase === 'leave' || c.phase === 'walkIn') return;
    this.run.stats.looks++;
    c.looks++;
    if (this.S === 1) this.showZoom();
    if (c.t.shift && c.looks >= 2 && !c.revealed) {
      c.shiftT = 1.6;
      this.grummSay(['shift', c.t.who, 'bang'], 'squint');
      sfx.tick(this.vol());
      this.ctx.haptic(8);
      return;
    }
    const L = M.squintHints(this.run.lv.squint);
    const hints = M.oddParts(c.t).slice(0, L).map((sl) => SLOT_ICON[sl]);
    this.grummSay(['eye', ...(hints.length ? hints : [L > 0 ? 'check' : 'question'])], 'squint');
    this.ctx.haptic(4);
  }

  private showZoom(): void {
    const c = this.cur;
    if (!c || c.phase === 'leave' || c.phase === 'walkIn' || this.S > 1) return;
    const g = this.zoomG.clear();
    const px = 2;
    const w = TRAV_W * px + 6;
    const h = TRAV_H * px + 6;
    let x = this.travX + TRAV_W + 4;
    let y = Math.max(this.top + 2, this.deckY - h - 4);
    if (x + w > this.cx + this.cw - 2) x = this.cx + this.cw - 2 - w;
    g.rect(0, 0, w, h).fill(OUTLINE);
    g.rect(1, 1, w - 2, h - 2).fill(0x3a2a4a);
    drawTraveler(g, c.t.look, 3, 3, { px, face: c.face, revealed: c.revealed, lidOpen: c.lidOpen });
    this.zoom.position.set(x, y);
    this.zoom.visible = true;
    this.zoomT = 1.8;
  }

  // ---------- the notice board (Poster + look guide) ----------

  private openBoard(): void {
    if (this.modal.children.length) return;
    this.run.stats.posterOpens++;
    // Rule-card lessons: the card has been seen on the board.
    for (const rc of M.RULE_CARDS) if (this.run.menace >= rc.m) this.ctx.markSeen(`b.board.${rc.id}`);
    const c = this.ctx.content();
    const p = this.poster;
    const box = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, this.ctx.layout.w, this.ctx.layout.h).fill({ color: 0x000000, alpha: 0.6 });
    box.addChild(dim);
    const pw = c.w - 8;
    const px = c.x + 4;
    // Below the manager bubble (which sits on top of the scene layer).
    const py = c.y + Math.min(34, Math.max(4, c.h - 300));
    const panel = new Graphics();
    box.addChild(panel);
    const ink = '#2a1a1a';
    const txt = (s: string, x: number, y: number, col = ink, maxW = pw - 12) => {
      const t = new PixelText(wrap(s, maxW), col, null);
      t.position.set(x, y);
      box.addChild(t);
      return t;
    };
    let y = py + 5;
    txt(`WANTED: ${p.name}`, px + 6, y, '#8a1a1a');
    y += 9;
    // Hero portrait in the poster's colours.
    const hero = new Graphics();
    const look: M.Look = { hat: 'none', body: 'armor', feet: 'steel', hand: 'sword', belt: 'none', pack: 'none', aura: 'none', cloak: p.shows.includes('cloak') ? p.cloak : 5, hair: p.shows.includes('hair') ? p.hair : 1, skin: 0, mark: p.shows.includes('mark') ? p.mark : 0 };
    hero.rect(px + 5, y, 28, 46).fill(0xd8c898);
    drawTraveler(hero, look, px + 7, y + 2);
    box.addChild(hero);
    const feats: string[] = [];
    if (p.shows.includes('cloak')) feats.push(`${M.CLOAK_NAMES[p.cloak]} CLOTHES`);
    if (p.shows.includes('hair')) feats.push(M.HAIR_NAMES[p.hair]);
    if (p.shows.includes('mark')) feats.push(M.MARK_NAMES[p.mark]);
    txt(`${feats.join('\n')}\n\nMATCH 2+ = WANTED.\nUNMASK FOR X10!`, px + 38, y + 1, ink, pw - 44);
    y += 50;
    const m = this.run.menace;
    if (m >= 3) {
      const seal = new Graphics(icon('writ', p.seal));
      seal.position.set(px + 6, y - 1);
      box.addChild(seal);
      txt(`TRUE WRIT SEAL: ${M.SEAL_NAMES[p.seal]}`, px + 18, y + 1);
      y += 11;
    }
    if (m >= 9) {
      txt(`FAKE TELL TODAY: ${M.HERO_TELL_NAMES[p.fake]} (IGNORE)`, px + 6, y, '#8a1a1a');
      y += 9;
    }
    if (m >= 15) {
      const bl = m >= 18 ? 'BRIBE: TAKE IT, OR SEARCH. SHIFTER: TAP TWICE' : 'BRIBE: TAKE IT, OR SEARCH';
      txt(bl, px + 6, y, '#6a3a1a');
      y += measure(wrap(bl, pw - 12)).h + 3;
    }
    // Look guide: the normal look of each Claim.
    txt('WHO LOOKS LIKE WHAT', px + 6, y, '#6a3a1a');
    y += 8;
    const whos: M.Who[] = ['peasant', 'pilgrim', 'merchant', 'adventurer'];
    if (this.run.lv.booth >= 1) whos.push('noble');
    if (this.run.lv.booth >= 2) whos.push('bard');
    const slot = Math.floor((pw - 8) / whos.length);
    const guide = new Graphics();
    whos.forEach((w, i) => {
      const n = M.NORMAL[w];
      const l: M.Look = { hat: n.hat[0], body: n.body[0], feet: n.feet[0], hand: n.hand[0], belt: n.belt[0], pack: n.pack[0], aura: n.aura[0], cloak: 0, hair: 1, skin: 0, mark: 0 };
      const gx = px + 4 + i * slot + Math.floor((slot - TRAV_W) / 2);
      drawTraveler(guide, l, gx, y);
      const ic = new Graphics(icon(w));
      ic.position.set(gx + 2, y + TRAV_H + 1);
      const dst = new Graphics(icon(n.where[0]));
      dst.position.set(gx + 13, y + TRAV_H + 1);
      box.addChild(ic, dst);
    });
    box.addChildAt(guide, 2);
    y += TRAV_H + 12;
    txt('GOODS: BIG SACK, BARREL, SHINY NEW BOOTS' + (m >= 6 ? ', TALL HAT' : '') + ' = HOLD SEARCH', px + 6, y);
    y += measure(wrap('GOODS: BIG SACK, BARREL, SHINY NEW BOOTS' + (m >= 6 ? ', TALL HAT' : '') + ' = HOLD SEARCH', pw - 12)).h + 4;
    const heroLine = 'HERO: STEEL BOOTS, GLOW, HIDDEN HILT, SHIELD, ODD PLACE' + (m >= 3 ? ', WRONG SEAL' : '') + ' = HOLD UNMASK. 2+ CLUES = X10';
    txt(heroLine, px + 6, y, '#5a1a6a');
    y += measure(wrap(heroLine, pw - 12)).h + 4;
    const ok = 'ODD BUT OK: NO HAT, OLD BOOTS, FLIES, A STINGY MERCHANT IN PATCHES. MERCHANTS ALSO GO TO FORT + CASTLE';
    txt(ok, px + 6, y, '#5a4a3a');
    y += measure(wrap(ok, pw - 12)).h + 4;
    const cards = M.RULE_CARDS.map((rc) => (m >= rc.m ? `M${rc.m} ${rc.name}` : `M${rc.m} ???`)).join('  ');
    txt(cards, px + 6, y, '#6a3a1a');
    y += measure(wrap(cards, pw - 12)).h + 4;
    txt('TAP TO CLOSE', px + pw - 54, y, '#8a6a4a');
    const ph = Math.min(c.y + c.h - 2, y + 10) - py;
    drawPanel(panel, px, py, pw, ph, 0xe8d8a8, 0x8a5a2a);

    box.eventMode = 'static';
    box.hitArea = new Rectangle(0, 0, this.ctx.layout.w, this.ctx.layout.h);
    box.on('pointertap', () => this.closeBoard());
    this.modal.addChild(box);
  }

  private closeBoard(): void {
    this.modal.removeChildren().forEach((ch) => ch.destroy({ children: true }));
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.time += dt;
    const r = this.run;

    // Nap countdown.
    if (this.napT > 0) {
      this.napT -= dt;
      if (this.napT <= 0) {
        this.napT = 0;
        this.expr = 'chew';
        this.exprT = 0;
        this.grummSay(['bang'], 'chew');
      }
    } else if (this.exprT > 0) {
      this.exprT -= dt;
      if (this.exprT <= 0) this.expr = this.dragging ? 'squint' : 'chew';
    }
    if (this.dragging && this.napT <= 0) this.expr = 'squint';

    // Arrivals: one every 7 s (fewer while word gets around); bench overflow goes to the goons.
    if (this.wordT > 0) this.wordT = Math.max(0, this.wordT - dt);
    if (this.songT > 0) this.songT = Math.max(0, this.songT - dt);
    this.updateRitual(dt);
    this.arriveT += dt;
    const every = M.ARRIVE_S / (this.wordT > 0 ? M.WORD_TRAFFIC : 1);
    if (this.arriveT >= every) {
      this.arriveT -= every;
      const t = this.gen();
      if (this.bench.length < M.benchCap(r.lv.bench)) this.bench.push(t);
      else this.goonPass(t, false);
    }

    this.updateTraveler(dt);
    this.updateParts(dt);
    this.updateFx(dt);
    this.updateUi(dt);
    this.unmaskBtn.update(dt, () => {});
    this.searchBtn.update(dt, () => {});

    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 0.5;
      this.slowChecks();
    }
  }

  private updateTraveler(dt: number): void {
    const c = this.cur;
    if (!c) {
      this.pullNext();
      this.travG.visible = false;
      this.claim.visible = false;
      return;
    }
    c.timer += dt;
    if (c.shiftT > 0) c.shiftT -= dt;
    if (c.phase === 'walkIn' || c.phase === 'leave') {
      const f = Math.min(1, c.timer / WALK_S);
      c.x = Math.round(c.fromX + (c.toX - c.fromX) * f);
      if (f >= 1) {
        if (c.phase === 'walkIn') {
          c.phase = 'wait';
          c.timer = 0;
          this.grummSay([c.t.who as string, 'eye'], 'squint');
          // A scripted traveler at the gate opens its beat (OnboardingStep.waitFor in index.ts).
          const sc = c.t.scripted;
          if (sc === 'heroLesson') this.ctx.markSeen('b.obr.unmask');
          else if (sc === 'smugglerLesson') this.ctx.markSeen('b.obr.search');
          else if (LESSON_CARD[sc]) this.ctx.markSeen(`b.lsr.${LESSON_CARD[sc]}`);
        } else {
          this.cur = null;
          this.gateOpen = 0;
          this.drawGate();
          this.travG.visible = false;
          this.claim.visible = false;
          this.zoom.visible = false;
          return;
        }
      }
    } else if (c.phase === 'search') {
      if (c.timer >= 1.1) this.finishSearch();
    } else if (c.phase === 'reveal') {
      if (c.timer >= 1.3) this.leave(-1, 'shock');
    } else if (c.phase === 'wait' || c.phase === 'counter') {
      // Goons take the gate while Grumm naps, or after 10 s with no orders (06 §3).
      const idle = (performance.now() - this.lastInput) / 1000 > IDLE_GATE_S && !this.obStep && !this.lessonActive() && !this.modal.children.length;
      if (this.napT > 0 || (idle && this.run.lv.goons > 0)) {
        c.goonT += dt;
        if (c.goonT > 1.4) this.goonPass(c.t, true);
      } else c.goonT = 0;
    }

    // Redraw the sprite only when its look changes (bounded: one Graphics, cleared).
    const bob = c.phase === 'walkIn' || c.phase === 'leave' ? Math.floor(this.time * 8) % 2 : 0;
    const flip = c.phase === 'leave' && c.toX < c.x;
    const key = `${c.t.id}|${c.face}|${c.revealed}|${c.lidOpen}|${flip}`;
    if (key !== this.travKey) {
      this.travKey = key;
      const g = this.travG.clear();
      drawTraveler(g, c.t.look, 0, 0, { px: this.S, face: c.face, revealed: c.revealed, lidOpen: c.lidOpen, flip });
    }
    const shakeX = c.phase === 'search' ? (Math.floor(this.time * 20) % 2 ? 1 : -1) : 0;
    this.travG.position.set(c.x + shakeX, this.deckY - this.th - bob * this.S);
    this.travG.visible = true;

    // Claim bubble: [who] -> [where] (+ writ)
    const showClaim = c.phase === 'wait' || c.phase === 'counter' || c.phase === 'search';
    this.claim.visible = showClaim;
    if (showClaim) {
      const items: [string, number][] = [[c.t.who, -1], ['', -1], [c.t.where, -1]];
      const n = c.t.writ ? 3 : 2;
      const w = 6 + 9 + 5 + 9 + (n === 3 ? 11 : 0) + 2;
      const bg = this.claimBg.clear();
      bg.rect(0, 0, w, 14).fill(OUTLINE);
      bg.rect(1, 1, w - 2, 12).fill(0xf4e8c1);
      bg.rect(5, 14, 3, 2).fill(OUTLINE);
      bg.rect(6, 13, 1, 2).fill(0xf4e8c1);
      // arrow between who and where
      bg.rect(14, 7, 4, 1).fill(0x6a5a7a);
      bg.rect(17, 6, 1, 3).fill(0x6a5a7a);
      // A shifter's Claim flickers to the truth for a moment after a second look.
      const flick = c.shiftT > 0 && Math.floor(this.time * 8) % 2 === 0;
      this.claimIcons[0].context = icon(flick ? 'adventurer' : items[0][0]);
      this.claimIcons[0].position.set(3, 3);
      this.claimIcons[1].context = icon(items[2][0]);
      this.claimIcons[1].position.set(19, 3);
      this.claimIcons[2].visible = n === 3;
      if (n === 3) {
        const seal = c.t.writ === 1 ? this.poster.seal : (this.poster.seal + 1 + (c.t.id % 3)) % M.SEALS.length;
        this.claimIcons[2].context = icon('writ', seal);
        this.claimIcons[2].position.set(30, 3);
      }
      this.claim.position.set(c.x + 4 * this.S, this.deckY - this.th - 17);
    }
  }

  private updateParts(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      let dead = false;
      if (p.kind === 'arc') {
        p.t += dt / p.dur;
        const t = Math.min(1, p.t);
        p.x = p.x0 + (p.x1 - p.x0) * t;
        p.y = p.y0 + (p.y1 - p.y0) * t - Math.sin(Math.PI * t) * 22;
        if (t >= 1) {
          dead = true;
          p.onLand?.();
        }
      } else {
        p.life -= dt;
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.g.alpha = Math.min(1, p.life * 3);
        if (p.life <= 0) dead = true;
      }
      p.g.position.set(Math.round(p.x), Math.round(p.y));
      if (dead) {
        p.g.visible = false;
        p.onLand = undefined;
        this.pool.push(p.g);
        this.parts.splice(i, 1);
      }
    }
  }

  private updateFx(dt: number): void {
    // Grumm sprite (cached contexts: 6 expressions x 2 frames).
    this.chewFrame = Math.floor(this.time * (this.expr === 'nap' ? 1.5 : 3)) % 2;
    this.grumm.context = grummArt(this.napT > 0 ? 'nap' : this.expr, this.chewFrame);

    // Goons bob under the bridge; one pops up when it collects.
    if (this.goonPopT > 0) this.goonPopT -= dt;
    this.goons.forEach((g, i) => {
      g.context = goonArt(Math.floor(this.time * 2 + i) % 2);
      const pop = i === this.goonPop && this.goonPopT > 0 ? -5 : 0;
      g.y = this.riverTop + 2 + pop;
    });

    // Water shimmer (one Graphics, redrawn at 4 Hz).
    this.waterT -= dt;
    if (this.waterT <= 0) {
      this.waterT = 0.25;
      const w = this.water.clear();
      const L = this.ctx.layout;
      const off = Math.floor(this.time * 4) % 8;
      for (let y = this.riverTop + 4; y < this.sceneBottom - 1; y += 4)
        for (let x = ((y / 4) % 2) * 4 - off; x < L.w; x += 16) w.rect(x, y, 5, 1).fill(0x3a6a8a);
    }

    // Coin pile grows in tiers (sack, chest, hoard).
    const bank = this.run.bank;
    const tier = bank >= 1e7 ? 3 : bank >= 1e5 ? 2 : bank >= 1e3 ? 1 : 0;
    if (tier !== this.shownBank) {
      this.shownBank = tier;
      const g = this.pileG.clear();
      const x = this.pileX;
      const y = this.deckY;
      if (tier === 0) {
        g.rect(x, y - 3, 8, 3).fill(0xa07a20);
        g.rect(x + 1, y - 4, 5, 2).fill(GOLD);
      } else if (tier === 1) {
        g.rect(x - 1, y - 9, 11, 9).fill(0x8a6a3a);
        g.rect(x + 2, y - 11, 5, 2).fill(0x6a4a2a);
        g.rect(x + 2, y - 7, 5, 4).fill(GOLD);
      } else if (tier === 2) {
        g.rect(x - 2, y - 10, 13, 10).fill(WOOD_D);
        g.rect(x - 1, y - 9, 11, 8).fill(WOOD);
        g.rect(x - 2, y - 7, 13, 1).fill(GOLD);
        g.rect(x - 1, y - 12, 11, 3).fill(GOLD);
      } else {
        g.rect(x - 6, y - 8, 18, 8).fill(0xa07a20);
        g.rect(x - 4, y - 13, 14, 6).fill(GOLD);
        g.rect(x - 1, y - 16, 8, 4).fill(0xfff0a0);
      }
    }

    // Stars, zzz, flash, shake.
    const fx = this.fxG.clear();
    if (this.napT > 0) {
      const hx = this.grummX + 17 * this.S;
      const hy = this.deckY - 26 * this.S;
      for (let i = 0; i < 3; i++) {
        const a = this.time * 4 + (i * Math.PI * 2) / 3;
        fx.rect(Math.round(hx + Math.cos(a) * 12 * this.S), Math.round(hy + Math.sin(a) * 4 * this.S), 2, 2).fill(0xfff08a);
      }
      const zt = (this.time * 0.8) % 1;
      const zx = this.grummX + 28 * this.S + Math.round(zt * 6);
      const zy = this.deckY - 32 * this.S - Math.round(zt * 14);
      fx.rect(zx, zy, 4, 1).rect(zx + 2, zy + 1, 1, 1).rect(zx + 1, zy + 2, 1, 1).rect(zx, zy + 3, 4, 1).fill({ color: 0xf4e8c1, alpha: 1 - zt });
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const L = this.ctx.layout;
      this.flash.clear().rect(0, this.top, L.w, this.sceneBottom - this.top).fill({ color: 0xffffff, alpha: 0.8 });
      this.flash.visible = true;
    } else this.flash.visible = false;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.world.position.set(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
    } else this.world.position.set(0, 0);

    if (this.gBubT > 0) {
      this.gBubT -= dt;
      if (this.gBubT <= 0) this.gBub.visible = false;
    }
    if (this.zoomT > 0) {
      this.zoomT -= dt;
      if (this.zoomT <= 0) this.zoom.visible = false;
    }
  }

  private updateUi(dt: number): void {
    const r = this.run;
    const c = this.cur;
    const fm = (n: number) => formatNum(n, this.ctx.game.save.meta.settings.notation);
    const g = this.uiG.clear();
    const act = this.canAct();

    // Status row: streak (left), Infamy gate progress + Hero Whisper pips (right).
    const target = this.ctx.def.skillTarget(this.ctx.save.cycle.n);
    const gateN = Math.min(M.GATE_UNMASKS, M.evAtLeast(r.ev, target));
    const goonDuty = act && (performance.now() - this.lastInput) / 1000 > IDLE_GATE_S && r.lv.goons > 0 && !this.obStep && !this.lessonActive();
    const left =
      this.napT > 0
        ? 'GOONS ON GATE'
        : this.wordT > 0
          ? `WORD GOT OUT ${Math.ceil(this.wordT)}S`
          : goonDuty
            ? 'GOONS ON DUTY'
            : this.songT > 0
              ? `SONG +10% ${Math.ceil(this.songT)}S`
              : r.streak > 0
                ? `STREAK ${r.streak} +${r.streak * 5}%`
                : 'STREAK 0';
    this.status.set(left, this.wordT > 0 ? C.redText : r.streak >= 5 || this.songT > 0 ? '#e8c04a' : C.inkDim);
    this.statusR.set(`{skull}${gateN}/5 AT M${target}`, gateN >= 5 ? C.greenText : r.menace >= target ? '#e8c04a' : C.inkDim);
    const sx = this.cx + this.cw - 3 - this.statusR.width;
    this.statusR.position.set(sx, this.sceneBottom + 2);
    // whisper pips
    const px0 = sx - 6 * 5 - 4;
    for (let i = 0; i < 5; i++) {
      g.rect(px0 + i * 6, this.sceneBottom + 3, 4, 4).fill(OUTLINE);
      g.rect(px0 + i * 6 + 1, this.sceneBottom + 4, 2, 2).fill(i < r.whisper ? 0xe05050 : 0x3a2a3a);
    }

    // Response bubble.
    if (this.respT > 0) this.respT -= dt;
    let msg = '';
    let col = '#2a1a3a';
    const rit = this.ritual && !this.ritual.done ? this.ritual : null;
    if (this.respT > 0) {
      msg = this.respMsg;
      col = this.respColor;
    } else if (rit) {
      msg = `GOON CRATES! HOLD SEARCH ${rit.opened}/${rit.n}`;
      col = '#6a3a00';
    } else if (this.napT > 0) {
      msg = `GRUMM NAPS ${Math.ceil(this.napT)}S. TAP HIM TO WAKE`;
      col = '#6a4a1a';
    } else if (c?.phase === 'counter') {
      msg = `OFFERS ${c.h.counter.toFixed(1)}X = ${fm(c.t.claimFare * c.h.counter * M.fareMult(r, this.skulls) * M.streakMult(r.streak + (c.h.counter >= M.STREAK_MIN ? 1 : 0)))}. TAP TO TAKE`;
      col = '#6a3a00';
    } else if (c?.phase === 'wait' && this.bribeOpen()) {
      msg = `PSST: BRIBE ${c.t.bribe.toFixed(1)}X = ${fm(c.t.claimFare * c.t.bribe * M.fareMult(r, this.skulls))}. TAP TO TAKE`;
      col = '#6a3a00';
    } else if (c?.phase === 'wait') {
      msg = r.stats.tolls < 3 ? `FARE ${fm(c.t.claimFare * M.fareMult(r, this.skulls))}. DRAG COINS UP, LET GO` : `FARE ${fm(c.t.claimFare * M.fareMult(r, this.skulls))}{coin}`;
      if (c.t.sniff) msg = 'WOOF! THE DOG SMELLS SOMETHING';
    } else if (c?.phase === 'search') msg = 'SEARCHING...';
    else if (!c) msg = 'WAITING FOR TRAVELERS...';
    const rw = this.cw - 6;
    const bg = this.respBg.clear();
    const hot = (c?.phase === 'counter' || this.bribeOpen()) && this.respT <= 0;
    bg.rect(0, 0, rw, 16).fill(OUTLINE);
    bg.rect(1, 1, rw - 2, 14).fill(hot ? (Math.floor(this.time * 3) % 2 ? 0xfff0a0 : 0xf4e8c1) : 0xe8dcc0);
    this.respText.set(msg.slice(0, Math.floor((rw - 6) / 4)), col);
    this.respText.position.set(4, 5);

    // Readout + mood face + coin stack.
    const mult = this.notch / 10;
    const fare = c ? c.t.claimFare * M.fareMult(r, this.skulls) : 0;
    this.readout.set(`${mult.toFixed(1)}X`, act ? '#f4e8c1' : '#7a6e80');
    this.coinsText.set(c ? `= ${fm(fare * mult)}{coin}` : '');
    const band = c ? M.band(c.t, r.lv.sense, c.h.offended) : ([1, 1.3] as [number, number]);
    const moodName = !c ? 'moodHmm' : mult < band[0] ? 'moodHappy' : mult <= band[1] ? 'moodHmm' : mult <= band[1] * 1.25 ? 'moodAnnoyed' : 'moodFurious';
    this.mood.context = icon(moodName);

    const sg = this.stackG.clear();
    const sw = 30;
    sg.rect(0, 0, sw, this.stackH).fill(OUTLINE);
    sg.rect(1, 1, sw - 2, this.stackH - 2).fill(0x24162f);
    if (c) {
      // Wallet Sense band (where their purse probably tops out).
      const y0 = this.notchY(Math.min(M.NOTCH_MAX, Math.max(M.NOTCH_MIN, Math.round(band[1] * 10)))) - this.stackY;
      const y1 = this.notchY(Math.min(M.NOTCH_MAX, Math.max(M.NOTCH_MIN, Math.round(band[0] * 10)))) - this.stackY;
      if (y1 > y0) sg.rect(1, y0, sw - 2, y1 - y0 + 1).fill({ color: 0x8fd14f, alpha: 0.28 });
      if (c.phase === 'counter') {
        const cy = this.notchY(Math.round(c.h.counter * 10)) - this.stackY;
        sg.rect(1, cy, sw - 2, 1).fill(0xe08a3a);
      }
    }
    // coins up to the demand: one sliver per notch, a bigger coin every 0.5x
    for (let n = M.NOTCH_MIN; n <= this.notch; n++) {
      const y = this.notchY(n) - this.stackY;
      const big = n % 5 === 0;
      const w = big ? 18 : 14;
      const x = Math.floor((sw - w) / 2);
      sg.rect(x, y - 1, w, 2).fill(act ? (big ? 0xfff0a0 : GOLD) : 0x6a5a40);
      sg.rect(x, y + 1, w, 1).fill(act ? 0xa07a20 : 0x4a3a2a);
    }
    for (let m = 1; m <= 4; m++) sg.rect(sw - 4, this.notchY(m * 10) - this.stackY, 3, 1).fill(0x9c8aa8);
    const my = this.notchY(this.notch) - this.stackY;
    sg.rect(0, my - 1, 3, 3).fill(0xffffff);

    // Buttons.
    const waiting = c?.phase === 'wait' && act;
    this.unmaskBtn.setEnabled(!!waiting && !rit);
    this.searchBtn.setEnabled(!!rit || (!!waiting && !c?.searched));
    this.unmaskBtn.setSub('HOLD');
    this.searchBtn.setSub(rit ? 'CRATE' : c?.searched ? 'DONE' : 'HOLD');
    if (c?.phase === 'counter') this.waveBtn.setLabel('TAKE', `${c.h.counter.toFixed(1)}X`).setColor(0x8fd14f, 0x4a7a22);
    else if (this.bribeOpen()) this.waveBtn.setLabel('BRIBE', `${c!.t.bribe.toFixed(1)}X`).setColor(0x8fd14f, 0x4a7a22);
    else this.waveBtn.setLabel('WAVE', 'FREE').setColor(C.edge, 0x3a2046);
    this.waveBtn.setEnabled(act);
    this.askBtn.setLabel('ASK', `${mult.toFixed(1)}X`).setEnabled(act);

    // Menace dial.
    this.menaceText.set(`M${r.menace}`, r.menace > 0 ? '#ff6040' : C.ink);
    this.downBtn.setEnabled(r.menace > 0);
    this.upBtn.setEnabled(r.menace < r.menaceMax);
    if (r.menaceMax >= M.MENACE_MAX) this.buyBtn.setLabel('MENACE MAX').setEnabled(false);
    else {
      const cost = M.menaceCost(r.menaceMax + 1);
      this.buyBtn.setLabel(`BUY M${r.menaceMax + 1} ${fm(cost)}`).setEnabled(r.bank >= cost);
    }
    if (this.shownMenace !== r.menace) {
      this.shownMenace = r.menace;
      this.drawSign();
    }
    this.napText.set(this.napT > 0 ? `ZZZ ${Math.ceil(this.napT)}` : '');

    // Bench minis (redrawn only when the bench changes).
    const key = this.bench.map((t) => t.id).join(',') + `|${M.benchCap(r.lv.bench)}`;
    if (key !== this.benchKey) {
      this.benchKey = key;
      const bgr = this.benchG.clear();
      this.bench.forEach((t, i) => {
        const k = this.S === 2 && this.bench.length <= 4 ? 7 : 6;
        const x = this.benchX + 1 + i * k;
        const y = this.deckY - 16;
        const col = M.CLOAKS[t.look.cloak];
        bgr.rect(x, y + 4, 6, 9).fill(col);
        bgr.rect(x + 1, y, 4, 4).fill(M.SKINS[t.look.skin]);
        bgr.rect(x + 1, y, 4, 1).fill(M.HAIRS[t.look.hair]);
        bgr.rect(x + 1, y + 13, 1, 3).fill(0x2a1a14);
        bgr.rect(x + 4, y + 13, 1, 3).fill(0x2a1a14);
        if (t.look.pack === 'bulge' || t.look.pack === 'barrel') bgr.rect(x - 1, y + 1, 2, 7).fill(0x8a6a3a);
      });
    }
  }

  private slowChecks(): void {
    this.obStep = this.pendingStep();
    const b = this.badge.clear();
    if (anyAffordable(this.groups)) {
      b.rect(0, 0, 9, 9).fill(OUTLINE);
      b.rect(1, 1, 7, 7).fill(C.red);
      b.rect(4, 2, 1, 3).fill(0xffffff);
      b.rect(4, 6, 1, 1).fill(0xffffff);
    }
    // Goons bought elsewhere (the Steward, Head Start) show up on the bank.
    if (this.shownGoons !== this.run.lv.goons) {
      this.shownGoons = this.run.lv.goons;
      this.layoutGoons();
    }
  }

  /** True while the current traveler is a rule-card lesson's (the goons leave it alone). */
  private lessonActive(): boolean {
    return !!LESSON_CARD[this.cur?.t.scripted ?? ''];
  }

  // ---------- core hooks ----------

  /** 06 §18: a Coin Stack drag, a verdict hold, the Unmask or Search animation, a counter waiting
   * (and the return ritual). */
  isIntense(): boolean {
    const ph = this.cur?.phase;
    return (
      this.dragging ||
      this.unmaskBtn.isHolding ||
      this.searchBtn.isHolding ||
      ph === 'counter' ||
      ph === 'search' ||
      ph === 'reveal' ||
      this.bribeOpen() ||
      !!(this.ritual && !this.ritual.done)
    );
  }

  targetRect(id: string): Rect | null {
    const c = this.cur;
    const btn = (b: Container, w: number, h: number): Rect => ({ x: b.x, y: b.y, w, h });
    switch (id) {
      case 'traveler':
        if (!c || (c.phase !== 'wait' && c.phase !== 'counter')) return null;
        return { x: this.travX - 2, y: this.deckY - this.th - 2, w: this.tw + 4, h: this.th + 4 };
      case 'stack':
        return { x: this.stackX, y: this.stackY, w: 30, h: this.stackH };
      case 'stackGrab': {
        if (!c || c.phase !== 'wait') return null;
        const y = this.notchY(10) - 3;
        return { x: this.stackX, y, w: 30, h: this.stackY + this.stackH - y };
      }
      case 'stackBand': {
        if (!c) return null;
        const b = M.band(c.t, this.run.lv.sense, c.h.offended);
        const n = Math.max(M.NOTCH_MIN, Math.min(M.NOTCH_MAX, Math.round(b[0] * 10 + 1)));
        return { x: this.stackX, y: this.notchY(n) - 3, w: 30, h: 6 };
      }
      case 'upgrades':
        return btn(this.upgBtn, this.upgBtn.width, 16);
      case 'menace':
        return btn(this.buyBtn, this.buyBtn.width, 16);
      case 'unmask':
        return this.unmaskBtn.enabled ? btn(this.unmaskBtn, 56, 30) : null;
      case 'search':
        return this.searchBtn.enabled ? btn(this.searchBtn, 56, 30) : null;
      case 'ask':
        return btn(this.askBtn, this.askBtn.width, 29);
      case 'resp':
        return { x: this.resp.x, y: this.resp.y, w: this.cw - 6, h: 16 };
      case 'poster':
        return this.modal.children.length ? null : { x: this.cx + 2, y: this.deckY - 51, w: 26, h: 29 };
      case 'grumm':
        return { x: this.grummX, y: this.deckY - 40 * this.S, w: 36 * this.S, h: 40 * this.S };
      case 'crates':
        return this.ritual && !this.ritual.done ? this.crateRect() : null;
      default:
        return null;
    }
  }

  /** Return ritual (06 §13, 00 §5.3): goon crates stacked by the gate; hold SEARCH to pop each
   * open (eels, ore, potions). Score = crates opened / crates, within ~6 s. */
  returnRitual(haul: number): Promise<number> {
    if (this.ritual && !this.ritual.done) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      this.ritual = { n: RITUAL_CRATES, opened: 0, t: 0, done: false, resolve };
      this.crateKey = '';
      this.grummSay(['crate', 'goon', 'coin'], 'grin');
      void haul;
    });
  }

  private crateRect(): Rect {
    const x = this.gateX + 6;
    const w = Math.max(14, this.grummX - x - 2);
    return { x, y: this.deckY - 21, w, h: 21 };
  }

  private updateRitual(dt: number): void {
    const rit = this.ritual;
    if (!rit) return;
    if (!rit.done) {
      rit.t += dt;
      if (rit.opened >= rit.n || rit.t >= RITUAL_S) this.endRitual();
    }
    const key = rit.done ? 'done' : `${rit.opened}`;
    if (key === this.crateKey) return;
    this.crateKey = key;
    const g = this.crateG.clear();
    if (rit.done) return;
    const r = this.crateRect();
    for (let i = rit.opened; i < rit.n; i++) {
      // a little pyramid of 9x9 crates: 3 at the bottom, 2 on top
      const row = i < 3 ? 0 : 1;
      const col = i < 3 ? i : i - 3;
      const x = r.x + 1 + col * 10 + row * 5;
      const y = this.deckY - 9 - row * 9;
      g.rect(x - 1, y - 1, 11, 11).fill(OUTLINE);
      g.rect(x, y, 9, 9).fill(WOOD);
      g.rect(x + 1, y + 1, 7, 7).fill(WOOD_D);
      g.rect(x + 1, y + 4, 7, 1).fill(WOOD_L);
      g.rect(x + 4, y + 1, 1, 7).fill(WOOD_L);
    }
  }

  private popCrate(): void {
    const rit = this.ritual;
    if (!rit || rit.done || rit.opened >= rit.n) return;
    const i = rit.opened++;
    const r = this.crateRect();
    const row = i < 3 ? 0 : 1;
    const x = r.x + 5 + (i < 3 ? i : i - 3) * 10 + row * 5;
    const y = this.deckY - 6 - row * 9;
    this.eels(x, y);
    this.poof(x, y);
    sfx.clink(this.vol(), 2 + i);
    this.ctx.haptic(12);
  }

  private endRitual(): void {
    const rit = this.ritual;
    if (!rit || rit.done) return;
    rit.done = true;
    const score = rit.n > 0 ? rit.opened / rit.n : 0;
    if (score >= 1) this.grummSay(['crate', 'check', 'coin'], 'thump');
    rit.resolve(Math.max(0, Math.min(1, score)));
  }

  resize(_layout: Layout): void {
    this.closeBoard();
    this.buildLayout();
    this.shownBank = -1;
  }

  destroy(): void {
    this.endRitual();
    this.stack.removeAllListeners();
    this.root.destroy({ children: true });
  }
}
