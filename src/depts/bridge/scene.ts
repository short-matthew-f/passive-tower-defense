// The Troll Bridge scene (specs/06): travelers queue on the bench, step up to the gate and
// state a Claim in icons. You read their parts against today's Decree (the sky strip: today's
// tells, unlabeled), name a toll with one of four price tiers and read their mood, and hold UNMASK
// or SEARCH for a verdict. Grumm growls it, gets bonked if you push a brute too far, and naps
// while the goons work the gate. Wave 1: the Decree and Codex replace the printed answer key, the
// mood haggle (faces, Patience pips, Glower) replaces the wallet-revealing counter, and both kinds
// of mistake cost after two free ones. All numbers live in model.ts; art in art.ts.
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure, wrap } from '../../ui/font';
import { Button, C, drawPanel } from '../../ui/widgets';
import * as M from './model';
import { drawDecreePart, drawTraveler, goonArt, GOLD, grummArt, icon, OUTLINE, particle, TRAV_H, TRAV_W, WOOD, WOOD_D, WOOD_L, type GrummExpr } from './art';
import { sfx } from './sfx';
import { anyAffordable, buildGroups } from './upgrades';
import { destroyTree } from '../../ui/destroy';
import { sfx as coreSfx } from '../../core/audio';

const HOLD_S = 0.3;
const IDLE_GATE_S = 10;
const MAX_PARTS = 70;
const WALK_S = 0.9;
const RITUAL_S = 6;
const RITUAL_CRATES = 5;
/** Squint pointers: slot -> icon. */
const SLOT_ICON: Record<M.Slot, string> = { hat: 'hat', body: 'body', feet: 'boot', hand: 'hand', belt: 'belt', pack: 'pack', aura: 'glow' };
/** Mood face icon per Moonlighter mood, and its word. */
const MOOD_ICON: Record<M.Mood, string> = { delighted: 'moodHappy', content: 'moodHmm', grudging: 'moodAnnoyed', furious: 'moodFurious' };
/** Decree strip cell size (a 24x42 mannequin plus a 1 px frame). */
const CELL_W = 26;
const CELL_H = 44;
const DECREE_H = M.DECREE_HERO;
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
    private onStart?: () => void,
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
      this.onStart?.();
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
  private respFace = new Graphics();
  private unmaskBtn!: HoldButton;
  private searchBtn!: HoldButton;
  private waveBtn!: Button;
  /** Wave 1 price tiers (FAIR, STEEP, GOUGE, ROB) with a mood preview face on each. */
  private priceBtns: Button[] = [];
  private priceFaces: Graphics[] = [];
  private glowerText = new PixelText('', '#e05050');
  private glowerDim = new PixelText('', '#5a3a4a');
  private oopsText = new PixelText('', C.inkDim);
  private panelX = 0;
  private panelY = 0;
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
  /** Decree strip (sky) and the price grid rects. */
  private decreeC = new Container();
  private decreeG = new Graphics();
  private decreeTitle = new PixelText('', '#8a1a1a');
  private decreeX = 0;
  private decreeY = 0;
  private decreeW = 0;
  private gridX = 0;
  private gridY = 0;
  private gridW = 0;

  // state
  private bench: M.Traveler[] = [];
  private cur: Cur | null = null;
  /** The last reply's face in the response bubble, and how long it stays. */
  private moodFace: M.Mood | null = null;
  private waveMode = '';
  private moodT = 0;
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
      this.decreeC,
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
    // The Decree strip in the sky: tap for the board (Codex, Wanted, ledger, look guide).
    this.decreeC.addChild(this.decreeG, this.decreeTitle);
    this.decreeC.eventMode = 'static';
    this.decreeC.cursor = 'pointer';
    this.decreeC.on('pointertap', () => this.openBoard());
    // A long gap since the last visit starts a new session (Glower refills, free mistakes back).
    M.session(this.run, Date.now());
    M.ledgerFor(this.run, this.poster.decree.day);

    this.buildLayout();
    // D-bridge-02: the bench and the traveler at the gate are saved in the run, so leaving and
    // coming back finds the same travelers (no free reroll of a hard read).
    const cap = M.benchCap(this.run.lv.bench);
    if (Array.isArray(this.run.bench)) this.bench = this.run.bench.slice(0, cap);
    else {
      // The bench starts full (06 §9: "process the 3 travelers on the bench").
      for (let i = 0; i < cap; i++) this.bench.push(this.gen());
    }
    this.run.bench = this.bench;
    const g = this.run.gate;
    if (g?.t) this.startTraveler(g.t, { ...g.h }, !!g.searched, g.looks ?? 0);
    else this.pullNext();
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
    this.ui.removeChildren().forEach((ch) => destroyTree(ch));
    this.status = new PixelText('', C.inkDim);
    this.statusR = new PixelText('', C.inkDim);
    this.respText = new PixelText('', '#2a1a3a', null);
    this.respFace = new Graphics();
    this.menaceText = new PixelText('', '#e05050');
    this.napText = new PixelText('', '#fff08a');
    this.glowerText = new PixelText('', '#e05050');
    this.glowerDim = new PixelText('', '#5a3a4a');
    this.oopsText = new PixelText('', C.inkDim);
    this.respBg = new Graphics();
    this.resp = new Container();
    this.badge = new Graphics();
    this.uiG = new Graphics();
    this.priceBtns = [];
    this.priceFaces = [];
    this.waveMode = '';
    this.ui.addChild(this.uiG, this.status, this.statusR);

    const x0 = c.x + 3;
    const right = c.x + c.w - 3;
    const statusY = this.sceneBottom + 2;
    const respY = statusY + 9;
    const thumbY = respY + 19;
    const rowY = thumbY + 67;
    this.status.position.set(x0, statusY);

    // Response bubble (mood face + message; tap to take a counter-offer).
    this.resp.addChild(this.respBg, this.respFace, this.respText);
    this.resp.position.set(x0, respY);
    this.resp.eventMode = 'static';
    this.resp.cursor = 'pointer';
    this.resp.hitArea = new Rectangle(0, -2, right - x0, 20);
    this.resp.on('pointertap', () => {
      if (this.cur?.phase === 'counter') this.takeCounter();
      else if (this.bribeOpen()) this.takeBribe();
    });
    this.ui.addChild(this.resp);

    // Verdicts (left), price tiers (right): opposite sides so a price tap can't fire a verdict.
    const vw = 56;
    const squint = () => this.grummSay(['eye', 'question'], 'squint');
    this.unmaskBtn = new HoldButton(vw, 30, 'UNMASK', 'mask', 0x8a3a9a, 0x4a1a5a, () => this.unmask(), squint);
    this.unmaskBtn.position.set(x0, thumbY);
    this.searchBtn = new HoldButton(vw, 30, 'SEARCH', 'barrel', 0x3a6ea8, 0x1a3a6a, () => this.search(), squint);
    this.searchBtn.position.set(x0, thumbY + 34);
    this.ui.addChild(this.unmaskBtn, this.searchBtn);

    // 2x2 price grid: GOUGE / ROB on top (they spend Glower), FAIR / STEEP under the thumb.
    const mx = x0 + vw + 4;
    const mw = right - mx;
    const bw = Math.floor((mw - 3) / 2);
    this.gridX = mx;
    this.gridY = thumbY;
    this.gridW = mw;
    const spot = [
      [0, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ];
    M.PRICE_TIERS.forEach((tier, i) => {
      const hot = tier.glower > 0;
      const b = new Button({
        w: i % 2 ? mw - bw - 3 : bw,
        h: 20,
        label: tier.name,
        sub: `${tier.mult}X`,
        color: hot ? 0xd0802a : C.gold,
        shade: hot ? 0x8a4a1a : 0x9a7a20,
        onTap: () => this.ask(i),
      });
      b.position.set(mx + spot[i][0] * (bw + 3), thumbY + spot[i][1] * 22);
      const face = new Graphics();
      face.position.set(b.x + (i % 2 ? mw - bw - 3 : bw) - 11, b.y + 5);
      face.eventMode = 'none';
      this.priceBtns.push(b);
      this.priceFaces.push(face);
      this.ui.addChild(b, face);
    });
    this.waveBtn = new Button({ w: bw, h: 20, label: 'WAVE', sub: 'FREE', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.waveOrTake() });
    this.waveBtn.position.set(mx, thumbY + 44);
    this.ui.addChild(this.waveBtn);
    // Glower budget and the free-mistake count, beside WAVE.
    this.panelX = mx + bw + 3;
    this.panelY = thumbY + 44;
    this.glowerText.position.set(this.panelX + 2, this.panelY + 3);
    this.glowerDim.position.set(this.panelX + 2, this.panelY + 3);
    this.oopsText.position.set(this.panelX + 2, this.panelY + 12);
    this.ui.addChild(this.glowerDim, this.glowerText, this.oopsText);

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
    this.drawDecree();
  }

  /** The Decree strip in the sky (wave 1, deduction.md R1): today's tells as pictures, no labels.
   * The newest tell wears a NEW tag. Hidden when the sky is too short to hold it. */
  private drawDecree(): void {
    const g = this.decreeG.clear();
    const dec = this.poster.decree;
    const parts = [...dec.hero, ...dec.smug];
    // Hero and smuggler tells interleaved, so the strip's order gives nothing away.
    const order = [parts[0], parts[DECREE_H], parts[1], parts[DECREE_H + 1]].filter(Boolean).concat(parts.slice(DECREE_H * 2));
    const w = order.length * (CELL_W + 2) + 4;
    const h = CELL_H + 13;
    const x = this.cx + 3;
    // Under the manager strip when the sky allows; else at the top (the strip covers it briefly).
    const claimTop = this.deckY - this.th - 19;
    const y = claimTop - (this.top + 32) >= h ? this.top + 32 : this.top + 3;
    this.decreeC.visible = claimTop - y >= h;
    this.decreeX = x;
    this.decreeY = y;
    this.decreeW = w;
    if (!this.decreeC.visible) return;
    g.rect(x - 1, y - 1, w + 2, h + 2).fill(OUTLINE);
    g.rect(x, y, w, h).fill(0xe8d8a8);
    g.rect(x + 1, y + 1, w - 2, 8).fill(0x8a2a2a);
    this.decreeTitle.set('DECREE', '#f4e8c1');
    this.decreeTitle.position.set(x + 3, y + 2);
    order.forEach(([slot, part], i) => {
      const cx = x + 3 + i * (CELL_W + 2);
      const cy = y + 11;
      g.rect(cx, cy, CELL_W, CELL_H).fill(0xd8c898);
      drawDecreePart(g, slot, part, cx + 1, cy + 1);
      if (part === dec.added) {
        // NEW tag: a red corner flag.
        g.rect(cx + CELL_W - 7, cy, 7, 4).fill(0xc03a3a);
        g.rect(cx + CELL_W - 6, cy + 1, 5, 2).fill(0xff8a6a);
      }
    });
    this.decreeC.hitArea = new Rectangle(x - 3, y - 3, w + 6, h + 6);
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
    // moon (top right: the Decree strip has the top left)
    g.circle(this.cx + this.cw - 22, top + 44, 7).fill(0xe8dcc0);
    g.circle(this.cx + this.cw - 19, top + 42, 6).fill(bands[0]);
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
    else if (this.run.showdown && Math.random() < 0.4) {
      // D-bridge-01: the queued Showdown is saved (run.showdown) until its traveler comes.
      this.run.showdown = false;
      t = this.gen('showdown');
    } else t = this.bench.shift();
    if (!t) return;
    this.run.stats.travelers++;
    this.startTraveler(t, { round: 0, counter: 0, offended: false }, false, 0);
  }

  private startTraveler(t: M.Traveler, h: M.Haggle, searched: boolean, looks: number): void {
    const fromX = this.benchX + 4;
    this.cur = {
      t,
      phase: 'walkIn',
      timer: 0,
      x: fromX,
      fromX,
      toX: this.travX,
      h,
      face: h.offended ? 'angry' : 'calm',
      revealed: false,
      lidOpen: false,
      searched,
      goonT: 0,
      looks,
      shiftT: 0,
    };
    this.syncGate();
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

  /** A traveler went through on a toll, a wave or a bribe. A liar who showed a tell is a mistake
   * (the second kind: letting one through); one who showed nothing slips by unfined. */
  private liarPassed(bribed = false): void {
    const c = this.cur;
    if (!c) return;
    const t = c.t;
    if (t.hero) this.heroSlipped();
    if ((!t.hero && !t.smuggler) || (t.smuggler && bribed)) return;
    const msg = t.hero ? 'A HERO SLIPPED BY!' : 'SMUGGLED GOODS GOT BY!';
    if (t.tells.length > 0 || t.posterMatch) {
      this.run.stats.missed++;
      this.mistake(msg);
    } else this.ctx.float(t.hero ? 'A HERO SLIPPED BY' : 'EELS SLIPPED BY', this.gateX - 30, this.deckY - this.th - 22, '#9c8aa8');
  }

  /** Wave 1 two-sided stakes (Papers, Please citations): FREE_MISTAKES per session, then a fine
   * from this session's takings, never the bank you arrived with. */
  private mistake(msg: string): void {
    const r = this.run;
    const ses = this.sess();
    const fine = M.mistakeFine(ses, r.bank);
    r.stats.mistakes++;
    r.streak = 0;
    const fm = (n: number) => formatNum(n, this.ctx.game.save.meta.settings.notation);
    if (fine > 0 && this.ctx.spend(fine)) {
      r.stats.fines += fine;
      this.say(`${msg} FINE -${fm(fine)}`, '#c03a3a');
      this.ctx.game.juice.pop(`FINE -${fm(fine)}`, this.cx + this.cw / 2 - 20, this.sceneBottom - 14, { tier: 2, color: C.redText, shake: false });
      this.ctx.game.juice.shake(1);
    } else {
      const left = Math.max(0, M.FREE_MISTAKES - ses.mistakes);
      this.say(`${msg} ${left ? `${left} FREE OOPS LEFT` : 'NEXT ONE: FINED'}`, '#c03a3a');
    }
    coreSfx.error();
    this.ctx.haptic(25);
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
    if (this.run.whisper >= 5 && !this.run.showdown) {
      this.run.showdown = true;
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

  /** The active session (Glower, mistakes, purse); renewed after a long gap. */
  private sess(): M.Session {
    return M.session(this.run, Date.now());
  }

  /** Credits hand-earned Tollpence and adds it to the session purse (the fine base). */
  private earnActive(base: number): number {
    const got = this.ctx.earn(base);
    const ses = this.sess();
    ses.purse += got;
    ses.paid++;
    return got;
  }

  /** Shows a mood face in the response bubble for a moment. */
  private showMood(m: M.Mood): void {
    this.moodFace = m;
    this.moodT = 2.4;
  }

  /** Price tier i (wave 1): FAIR, STEEP, GOUGE, ROB. The traveler answers with a face. */
  private ask(i: number): void {
    if (!this.canAct()) return;
    const c = this.cur!;
    const tier = M.PRICE_TIERS[i];
    const ses = this.sess();
    if (ses.glower + 1e-6 < tier.glower) {
      this.say('NO GLOWER LEFT! FAIR OR STEEP', '#c03a3a');
      this.grummSay(['eye', 'zzz'], 'blush');
      return;
    }
    ses.glower = Math.max(0, ses.glower - tier.glower);
    const mult = tier.mult;
    const rep = M.reply(c.t, c.h, this.run, mult);
    c.h.round++;
    const led = M.ledgerFor(this.run, this.poster.decree.day);
    if (rep.kind !== 'pay') led.over[c.t.who] = Math.min(led.over[c.t.who] ?? 99, mult);
    if (rep.kind === 'pay') {
      led.best[c.t.who] = Math.max(led.best[c.t.who] ?? 0, mult);
      this.showMood(rep.mood);
      this.collect(mult, rep.mood);
    } else if (rep.kind === 'counter') {
      c.h.counter = rep.mult;
      c.h.pips = rep.pips;
      c.phase = 'counter';
      c.face = 'angry';
      this.showMood('grudging');
      this.ctx.haptic(8);
      this.grummSay(['question'], 'squint');
      sfx.tick(this.vol());
      this.travKey = '';
    } else if (rep.kind === 'refuse') {
      c.h.pips = rep.pips;
      c.face = 'angry';
      this.showMood('furious');
      this.say('FURIOUS! -2 PATIENCE. ASK LOWER', '#c03a3a');
      this.ctx.haptic(14);
      this.grummSay(['cross', 'bang'], 'blush');
      sfx.sad(this.vol());
      this.travKey = '';
    } else if (rep.kind === 'leave') {
      this.run.streak = 0;
      this.showMood('furious');
      this.say('OUT OF PATIENCE! TURNED BACK', '#c03a3a');
      this.ctx.float('NOPE', c.x + this.tw / 2, this.deckY - this.th - 6, C.redText);
      this.grummSay(['cross'], 'blush');
      sfx.sad(this.vol());
      this.leave(-1, 'angry');
    } else this.bonk();
  }

  private collect(mult: number, mood: M.Mood = 'content'): void {
    const c = this.cur!;
    const r = this.run;
    if (mult >= M.STREAK_MIN - 1e-6) r.streak = Math.min(10, r.streak + 1);
    r.stats.bestStreak = Math.max(r.stats.bestStreak, r.streak);
    // Shop Titans: a FAIR toll gives half a Glower charge back.
    if (mult <= 1 + 1e-6) {
      const ses = this.sess();
      ses.glower = Math.min(M.GLOWER_MAX, ses.glower + M.GLOWER_FAIR_REFUND);
    }
    const song = this.songT > 0 ? M.SONG_MULT : 1;
    const base = c.t.claimFare * mult * M.fareMult(r, this.skulls) * M.streakMult(r.streak) * song;
    const got = this.earnActive(base);
    r.stats.tolls++;
    if (c.t.kind === 'bard') {
      // Pays in song too (06 §5): +10% tolls for 30 s.
      this.songT = M.SONG_S;
      this.ctx.say('bard', { type: 'tier_reached', key: 'bard' });
    }
    this.coinBurst(c.x + this.tw / 2, this.deckY - this.th / 2, Math.min(8, 2 + Math.round(mult * 2)), got);
    const how = mood === 'delighted' ? 'DELIGHTED: TOO CHEAP!' : r.streak >= 2 ? `STREAK ${r.streak}` : 'CONTENT';
    this.say(`PAID ${mult.toFixed(1)}X  ${how}`, mood === 'delighted' ? '#6a5a1a' : '#2a6a1a');
    this.grummSay(mood === 'delighted' ? ['coin', 'question'] : ['coin'], 'grin');
    sfx.clink(this.vol(), r.streak);
    this.ctx.haptic(10);
    this.liarPassed();
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
    this.collectBribe(c.t.bribe);
  }

  /** A taken bribe: paid like a toll, but the smuggler is let through on purpose (no mistake). */
  private collectBribe(mult: number): void {
    const c = this.cur!;
    const r = this.run;
    const got = this.earnActive(c.t.claimFare * mult * M.fareMult(r, this.skulls));
    r.stats.tolls++;
    this.coinBurst(c.x + this.tw / 2, this.deckY - this.th / 2, 5, got);
    this.say(`BRIBE ${mult.toFixed(1)}X TAKEN. THEY PASS`, '#6a3a00');
    sfx.clink(this.vol(), 3);
    this.ctx.haptic(10);
    this.liarPassed(true);
    this.leave(1, 'happy');
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
    this.liarPassed();
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
      const got = this.earnActive(c.t.kindFare * M.unmaskPay(mult, this.ctx.save.imports?.captives ?? 0) * M.fareMult(r, this.skulls));
      r.stats.unmasks++;
      this.noteCodex(c.t);
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
      // Shared juice kit: a boss-stop on the reveal, bigger for a X10.
      this.ctx.game.juice.hitStop(mult >= 10 ? 90 : 50);
      this.ctx.game.juice.shake(mult >= 10 ? 3 : 2);
      if (mult >= 10) coreSfx.bigWin();
    } else {
      this.falseInRow++;
      if (this.falseInRow >= 3) {
        // Struggle (06 §18): the offer opens the Decree board.
        this.falseInRow = 0;
        this.ctx.say('struggle', { type: 'struggle', offer: () => this.openBoard() });
      }
      this.falseAccusation('NOT A HERO! NO TOLL.');
      this.ctx.float('WRONG!', c.x + this.tw / 2, this.deckY - this.th - 6, C.redText);
      this.grummSay(['mask', 'cross', 'blush'], 'blush');
      sfx.sad(this.vol());
      this.ctx.haptic(20);
      this.leave(1, 'angry');
    }
  }

  /** Codex breadcrumb (deduction.md R9): a caught liar's showing tells are written down; a new
   * entry floats up so the player learns what the unlabeled Decree pictures mean. */
  private noteCodex(t: M.Traveler): void {
    const fresh = M.codexNote(this.per, t);
    if (!fresh.length) return;
    const name = fresh.map((k) => M.PART_NAMES[k] ?? (k === 'where' ? 'ODD ROAD' : k === 'writ' ? 'BAD SEAL' : 'SHIFTY CLAIM')).join(', ');
    this.ctx.float(`CODEX: ${name} = ${t.hero ? 'HERO' : 'GOODS'}`, this.cx + 4, this.deckY - this.th - 34, '#ffe060');
  }

  /** A false Unmask or Search: a mistake (the first kind), the Streak breaks; 3 within 60 s and
   * word gets around (06 §4). */
  private falseAccusation(msg: string): void {
    const r = this.run;
    r.streak = 0;
    r.stats.falseAcc++;
    this.mistake(msg);
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
      const got = this.earnActive(c.t.kindFare * M.SEIZE_MULT * M.fareMult(r, this.skulls)); // goods + a fine
      r.stats.confisc++;
      this.noteCodex(c.t);
      this.falseInRow = 0;
      this.eels(c.x + 3 * this.S, this.deckY - this.th * 0.7);
      this.coinBurst(c.x + this.tw / 2, this.deckY - this.th / 2, 5, got);
      this.say('CONTRABAND! SEIZED + FINE (4X)', '#2a6a1a');
      this.grummSay(['barrel', 'check'], 'grin');
      sfx.clink(this.vol(), 4);
      this.ctx.haptic(20);
      this.ctx.game.juice.hitStop(40);
      this.ctx.game.juice.shake(1);
      c.phase = 'reveal';
      c.timer = 0.3;
      c.face = 'shock';
    } else {
      // Innocent: offended. Wallet -20%, patience -50%, Streak breaks.
      c.h.offended = true;
      c.face = 'angry';
      c.h.pips = Math.max(1, M.pipsLeft(c.t, { ...c.h, offended: false }) - 1);
      this.travKey = '';
      this.falseAccusation('CLEAN! OFFENDED.');
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

  // ---------- the notice board (Decree, Codex, Wanted, ledger, look guide) ----------

  private openBoard(): void {
    if (this.modal.children.length) return;
    this.run.stats.posterOpens++;
    // Rule-card lessons: the card has been seen on the board.
    for (const rc of M.RULE_CARDS) if (this.run.menace >= rc.m) this.ctx.markSeen(`b.board.${rc.id}`);
    const c = this.ctx.content();
    const p = this.poster;
    const dec = p.decree;
    const m = this.run.menace;
    const box = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, this.ctx.layout.w, this.ctx.layout.h).fill({ color: 0x000000, alpha: 0.6 });
    box.addChild(dim);
    const pw = c.w - 8;
    const px = c.x + 4;
    // Below the manager bubble (which sits on top of the scene layer).
    const py = c.y + Math.min(34, Math.max(4, c.h - 330));
    const panel = new Graphics();
    const art = new Graphics();
    box.addChild(panel, art);
    const ink = '#2a1a1a';
    const txt = (s: string, x: number, y: number, col = ink, maxW = pw - 12) => {
      const t = new PixelText(wrap(s, maxW), col, null);
      t.position.set(x, y);
      box.addChild(t);
      return measure(wrap(s, maxW)).h;
    };
    const mark = (key: string, x: number, y: number) => {
      const k = M.codexKind(this.per, key);
      const ic = new Graphics(icon(k === 'hero' ? 'mask' : k === 'smug' ? 'barrel' : 'question'));
      ic.position.set(x, y);
      box.addChild(ic);
    };
    let y = py + 5;
    txt("TODAY'S DECREE: THESE MARK A LIAR", px + 6, y, '#8a1a1a');
    y += 9;
    // Today's tells (interleaved, unlabeled) and yesterday's, now harmless (crossed out).
    const parts = [dec.hero[0], dec.smug[0], dec.hero[1], dec.smug[1]].filter(Boolean);
    const exp = [...M.HERO_POOL, ...M.SMUG_POOL].find(([, q]) => q === dec.expired);
    const cells: [M.Slot, string, boolean][] = parts.map(([sl, q]) => [sl, q, false]);
    if (exp) cells.push([exp[0], exp[1], true]);
    const cw = Math.min(CELL_W + 4, Math.floor((pw - 8) / cells.length));
    cells.forEach(([sl, q, old], i) => {
      const cx = px + 5 + i * cw;
      art.rect(cx, y, CELL_W, CELL_H).fill(old ? 0xc8b890 : 0xd8c898);
      drawDecreePart(art, sl, q, cx + 1, y + 1);
      if (old) {
        for (let k = 0; k < CELL_W - 2; k++) art.rect(cx + 1 + k, y + 1 + Math.round((k * (CELL_H - 3)) / (CELL_W - 3)), 1, 1).fill(0xc03a3a);
        txt('OLD', cx + 7, y + CELL_H + 2, '#8a6a4a');
      } else {
        if (q === dec.added) txt('NEW', cx + 1, y + CELL_H + 2, '#c03a3a');
        mark(q, cx + 16, y + CELL_H + 1);
      }
    });
    y += CELL_H + 12;
    y += txt('ODD FOR THE CLAIM + ON THE DECREE = LIAR. OTHER ODD PARTS: FASHION.', px + 6, y) + 3;
    y += txt('MARKS = YOUR CODEX: {mask} HERO {barrel} SMUGGLER ? NOT YET', px + 6, y, '#5a4a3a') + 3;
    txt('ODD ROAD', px + 6, y + 1, '#5a4a3a');
    mark('where', px + 42, y);
    let lx = px + 56;
    if (m >= 3) {
      const seal = new Graphics(icon('writ', p.seal));
      seal.position.set(lx, y);
      box.addChild(seal);
      txt(`TRUE SEAL: ${M.SEAL_NAMES[p.seal]}`, lx + 11, y + 1);
      lx += 70;
    }
    y += 11;
    if (m >= 9) y += txt(`FAKE TELL TODAY: ${M.PART_NAMES[p.fake]} (IGNORE IT)`, px + 6, y, '#8a1a1a') + 3;
    if (m >= 15) y += txt(m >= 18 ? 'BRIBE: TAKE IT, OR SEARCH. SHIFTER: TAP TWICE' : 'BRIBE: TAKE IT, OR SEARCH', px + 6, y, '#6a3a1a') + 3;
    // Wanted poster.
    const look: M.Look = { hat: 'none', body: 'armor', feet: 'steel', hand: 'sword', belt: 'none', pack: 'none', aura: 'none', cloak: p.shows.includes('cloak') ? p.cloak : 5, hair: p.shows.includes('hair') ? p.hair : 1, skin: 0, mark: p.shows.includes('mark') ? p.mark : 0 };
    art.rect(px + 5, y, 26, 44).fill(0xd8c898);
    drawTraveler(art, look, px + 6, y + 1);
    const feats: string[] = [];
    if (p.shows.includes('cloak')) feats.push(`${M.CLOAK_NAMES[p.cloak]} CLOTHES`);
    if (p.shows.includes('hair')) feats.push(M.HAIR_NAMES[p.hair]);
    if (p.shows.includes('mark')) feats.push(M.MARK_NAMES[p.mark]);
    txt(`WANTED: ${p.name}\n${feats.join('\n')}\nMATCH 2+ = UNMASK X10`, px + 36, y + 2, '#8a1a1a', pw - 42);
    y += 48;
    // Today's ledger: the best price each Claim paid (wallets drift daily).
    const led = this.run.ledger?.day === dec.day ? this.run.ledger : null;
    const whos: M.Who[] = ['peasant', 'pilgrim', 'merchant', 'adventurer'];
    if (this.run.lv.booth >= 1) whos.push('noble');
    if (this.run.lv.booth >= 2) whos.push('bard');
    txt('LEDGER TODAY: BEST PRICE PAID', px + 6, y, '#6a3a1a');
    y += 8;
    const slot = Math.floor((pw - 8) / whos.length);
    whos.forEach((w, i) => {
      const gx = px + 4 + i * slot;
      const ic = new Graphics(icon(w));
      ic.position.set(gx, y);
      box.addChild(ic);
      const b = led?.best[w];
      txt(b ? `${b}X` : '-', gx + 11, y + 2, b ? '#2a6a1a' : '#8a7a6a', slot - 11);
    });
    y += 12;
    // Look guide: the normal look of each Claim.
    txt('WHO LOOKS LIKE WHAT', px + 6, y, '#6a3a1a');
    y += 8;
    whos.forEach((w, i) => {
      const n = M.NORMAL[w];
      const l: M.Look = { hat: n.hat[0], body: n.body[0], feet: n.feet[0], hand: n.hand[0], belt: n.belt[0], pack: n.pack[0], aura: n.aura[0], cloak: 0, hair: 1, skin: 0, mark: 0 };
      const gx = px + 4 + i * slot + Math.floor((slot - TRAV_W) / 2);
      drawTraveler(art, l, gx, y);
      const ic = new Graphics(icon(w));
      ic.position.set(gx + 2, y + TRAV_H + 1);
      const dst = new Graphics(icon(n.where[0]));
      dst.position.set(gx + 13, y + TRAV_H + 1);
      box.addChild(ic, dst);
    });
    y += TRAV_H + 12;
    const cards = M.RULE_CARDS.map((rc) => (m >= rc.m ? `M${rc.m} ${rc.name}` : `M${rc.m} ???`)).join('  ');
    y += txt(cards, px + 6, y, '#6a3a1a') + 3;
    txt('TAP TO CLOSE', px + pw - 54, y, '#8a6a4a');
    const ph = Math.min(c.y + c.h - 2, y + 10) - py;
    drawPanel(panel, px, py, pw, ph, 0xe8d8a8, 0x8a5a2a);

    box.eventMode = 'static';
    box.hitArea = new Rectangle(0, 0, this.ctx.layout.w, this.ctx.layout.h);
    box.on('pointertap', () => this.closeBoard());
    this.modal.addChild(box);
  }

  private closeBoard(): void {
    this.modal.removeChildren().forEach((ch) => destroyTree(ch));
  }

  // ---------- frame ----------

  /** D-bridge-02: the traveler at the gate, saved until its outcome is settled (reveal, leave). A
   * search in progress is saved as not searched (its result hasn't landed yet). */
  private syncGate(): void {
    const c = this.cur;
    const open = c && (c.phase === 'walkIn' || c.phase === 'wait' || c.phase === 'counter' || c.phase === 'search');
    if (!open) {
      if (this.run.gate) this.run.gate = null;
      return;
    }
    const g = this.run.gate;
    const searched = c.phase === 'search' ? false : c.searched;
    if (g && g.t === c.t && g.h === c.h && g.searched === searched && g.looks === c.looks) return;
    this.run.gate = { t: c.t, h: c.h, searched, looks: c.looks };
  }

  update(dt: number): void {
    this.time += dt;
    const r = this.run;
    this.syncGate();

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
      if (this.exprT <= 0) this.expr = 'chew';
    }
    // Session upkeep: still here (the gap clock), and Glower trickles back.
    const ses = this.sess();
    ses.at = Date.now();
    if (ses.glower < M.GLOWER_MAX) ses.glower = Math.min(M.GLOWER_MAX, ses.glower + dt / M.GLOWER_REGEN_S);

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
      // Patience pips (wave 1): red = left, dark = spent. Over-asks spend them.
      const maxP = c.t.pips ?? 3;
      const left = M.pipsLeft(c.t, c.h);
      for (let i = 0; i < maxP; i++) {
        bg.rect(w + 2 + i * 5, 4, 4, 6).fill(OUTLINE);
        bg.rect(w + 3 + i * 5, 5, 2, 4).fill(i < left ? 0xe05050 : 0x3a2a3a);
      }
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

    // Response bubble: the last reply's mood face, then the message.
    if (this.respT > 0) this.respT -= dt;
    if (this.moodT > 0) this.moodT -= dt;
    let msg = '';
    let col = '#2a1a3a';
    const rit = this.ritual && !this.ritual.done ? this.ritual : null;
    const fare = c ? c.t.claimFare * M.fareMult(r, this.skulls) : 0;
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
      msg = `GRUDGING: OFFERS ${c.h.counter.toFixed(1)}X = ${fm(fare * c.h.counter * M.streakMult(r.streak + (c.h.counter >= M.STREAK_MIN ? 1 : 0)))}. TAKE?`;
      col = '#6a3a00';
    } else if (c?.phase === 'wait' && this.bribeOpen()) {
      msg = `PSST: BRIBE ${c.t.bribe.toFixed(1)}X = ${fm(fare * c.t.bribe)}. TAP TO TAKE`;
      col = '#6a3a00';
    } else if (c?.phase === 'wait') {
      const best = r.ledger?.day === this.poster.decree.day ? r.ledger.best[c.t.who] : undefined;
      msg = r.stats.tolls < 3 ? `FARE ${fm(fare)}{coin}. TAP A PRICE, READ THE FACE` : `FARE ${fm(fare)}{coin}${best ? `  LEDGER: PAID ${best}X` : ''}`;
      if (c.t.sniff) msg = 'WOOF! THE DOG SMELLS SOMETHING';
    } else if (c?.phase === 'search') msg = 'SEARCHING...';
    else if (!c) msg = 'WAITING FOR TRAVELERS...';
    const rw = this.cw - 6;
    const bg = this.respBg.clear();
    const hot = (c?.phase === 'counter' || this.bribeOpen()) && this.respT <= 0;
    bg.rect(0, 0, rw, 16).fill(OUTLINE);
    bg.rect(1, 1, rw - 2, 14).fill(hot ? (Math.floor(this.time * 3) % 2 ? 0xfff0a0 : 0xf4e8c1) : 0xe8dcc0);
    const face = this.moodT > 0 && this.moodFace ? this.moodFace : c?.phase === 'counter' ? 'grudging' : null;
    this.respFace.visible = !!face;
    if (face) {
      this.respFace.context = icon(MOOD_ICON[face]);
      this.respFace.position.set(3, 3);
    }
    const tx = face ? 14 : 4;
    this.respText.set(msg.slice(0, Math.floor((rw - tx - 2) / 4)), col);
    this.respText.position.set(tx, 5);

    // Price tiers: each shows the face its price would likely get (read from the Wallet Sense
    // band, a hint, never the wallet). GOUGE and ROB need a Glower charge.
    const ses = this.sess();
    const band = c ? M.band(c.t, r.lv.sense, c.h.offended) : ([1, 1.3] as [number, number]);
    M.PRICE_TIERS.forEach((tier, i) => {
      const b = this.priceBtns[i];
      const ok = act && ses.glower + 1e-6 >= tier.glower;
      b.setEnabled(ok);
      const f = this.priceFaces[i];
      f.visible = !!c && act;
      if (f.visible) f.context = icon(MOOD_ICON[M.previewMood(band, tier.mult)]);
      f.alpha = ok ? 1 : 0.4;
    });
    // Glower eyes (bright = charges left) and the free mistakes left.
    const gl = Math.floor(ses.glower + 1e-6);
    this.glowerText.set('GLOWER ' + '{eye}'.repeat(gl), '#e05050');
    this.glowerDim.set(' '.repeat(7 + gl) + '{eye}'.repeat(Math.max(0, M.GLOWER_MAX - gl)), '#5a3a4a');
    const free = Math.max(0, M.FREE_MISTAKES - ses.mistakes);
    const nt = M.fineTolls(ses.mistakes + 1);
    this.oopsText.set(free > 0 ? `FREE OOPS ${free}` : `FINE ${nt} TOLL${nt > 1 ? 'S' : ''}`, free > 0 ? C.inkDim : C.redText);
    g.rect(this.panelX, this.panelY, this.gridX + this.gridW - this.panelX, 21).fill(OUTLINE);
    g.rect(this.panelX + 1, this.panelY + 1, this.gridX + this.gridW - this.panelX - 2, 19).fill(0x24162f);

    // Buttons.
    const waiting = c?.phase === 'wait' && act;
    this.unmaskBtn.setEnabled(!!waiting && !rit);
    this.searchBtn.setEnabled(!!rit || (!!waiting && !c?.searched));
    this.unmaskBtn.setSub('HOLD');
    this.searchBtn.setSub(rit ? 'CRATE' : c?.searched ? 'DONE' : 'HOLD');
    const wave = c?.phase === 'counter' ? 'take' : this.bribeOpen() ? 'bribe' : 'wave';
    if (wave !== this.waveMode) {
      this.waveMode = wave;
      if (wave === 'wave') this.waveBtn.setColor(C.edge, 0x3a2046);
      else this.waveBtn.setColor(0x8fd14f, 0x4a7a22);
    }
    if (wave === 'take') this.waveBtn.setLabel('TAKE', `${c!.h.counter.toFixed(1)}X`);
    else if (wave === 'bribe') this.waveBtn.setLabel('BRIBE', `${c!.t.bribe.toFixed(1)}X`);
    else this.waveBtn.setLabel('WAVE', 'FREE');
    this.waveBtn.setEnabled(act);

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
      this.unmaskBtn.isHolding ||
      this.searchBtn.isHolding ||
      ph === 'counter' ||
      ph === 'search' ||
      ph === 'reveal' ||
      this.bribeOpen() ||
      !!(this.ritual && !this.ritual.done)
    );
  }

  /** The Decree strip, the Wanted poster and the price grid: toasts and the intro line keep off. */
  avoidRects(): Rect[] {
    const out: Rect[] = [];
    const poster = this.targetRect('wanted');
    if (poster) out.push({ x: poster.x - 4, y: poster.y - 4, w: poster.w + 8, h: poster.h + 8 });
    const dec = this.targetRect('decree');
    if (dec) out.push(dec);
    out.push({ x: this.gridX, y: this.gridY, w: this.gridW, h: 64 });
    return out;
  }

  targetRect(id: string): Rect | null {
    const c = this.cur;
    const btn = (b: Container, w: number, h: number): Rect => ({ x: b.x, y: b.y, w, h });
    switch (id) {
      case 'traveler':
        if (!c || (c.phase !== 'wait' && c.phase !== 'counter')) return null;
        return { x: this.travX - 2, y: this.deckY - this.th - 2, w: this.tw + 4, h: this.th + 4 };
      case 'prices':
      case 'stack':
        return { x: this.gridX, y: this.gridY, w: this.gridW, h: 42 };
      case 'fair':
      case 'stackGrab':
      case 'ask': {
        if (!c || (c.phase !== 'wait' && c.phase !== 'counter')) return null;
        const b = this.priceBtns[0];
        return btn(b, b.width, 20);
      }
      case 'steep':
      case 'stackBand': {
        const b = this.priceBtns[1];
        return btn(b, b.width, 20);
      }
      case 'upgrades':
        return btn(this.upgBtn, this.upgBtn.width, 16);
      case 'menace':
        return btn(this.buyBtn, this.buyBtn.width, 16);
      case 'unmask':
        return this.unmaskBtn.enabled ? btn(this.unmaskBtn, 56, 30) : null;
      case 'search':
        return this.searchBtn.enabled ? btn(this.searchBtn, 56, 30) : null;
      case 'resp':
        return { x: this.resp.x, y: this.resp.y, w: this.cw - 6, h: 16 };
      case 'poster':
      case 'decree':
        if (this.modal.children.length) return null;
        if (!this.decreeC.visible) return { x: this.cx + 2, y: this.deckY - 51, w: 26, h: 29 };
        return { x: this.decreeX - 2, y: this.decreeY - 2, w: this.decreeW + 4, h: CELL_H + 17 };
      case 'wanted':
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
    destroyTree(this.root);
  }
}
