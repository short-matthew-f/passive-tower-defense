// The Cauldron scene: the plinko board, toadling rail, buckets, pot, ticket and chute keys.
// Rendering is a few reusable Graphics plus a pooled Sprite per live ingredient.
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure } from '../../ui/font';
import { Button, C, drawPanel } from '../../ui/widgets';
import { BUCKET_COL, ING_COLOR, ingTexture, PAL, PEG_PAL } from './art';
import {
  bucketMults,
  chuteStats,
  boardConfig,
  heldMalice,
  HOPPER_DROPS,
  inZone,
  ladleSecs,
  layoutOf,
  layoutsOpen,
  lvOf,
  MALICE_MAX,
  maliceCost,
  rlvOf,
  rows,
  SHIFT_MS,
  tierMults,
  tiersOf,
  toadlings,
  UPGRADES,
  upLocked,
  upCost,
  type CPersistent,
  type CRun,
  type Ticket,
  type UpDef,
} from './econ';
import { CauldronCore, CHARGE_S, MAX_LIVE } from './logic';
import { sfx } from './sfx';
import { BOARD_W, BUCKETS, COL_W, LAYOUTS, ROW_H, ROW_SLOTS, SPECIALS, type Ball, type IngId } from './sim';
import { destroyTree } from '../../ui/destroy';

const RAIL_H = 12;
const BOARD_H = 10 + (ROW_SLOTS - 1) * ROW_H + 12; // rail bottom -> landing line
const BUCKET_H = 16;
const POT_H = 32;
const CHUTE_H = 15;
const BTN_H = 15;
const TICKET_W = 58;
const MAL_W = 34;
const SCRY_HOLD = 0.4;
const SHIFT_HOLD = 0.45;
const MAX_PARTICLES = 160;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  life: number;
}

interface Hopper {
  phase: 'wait' | 'rain' | 'settle';
  t: number;
  left: number;
  spawnT: number;
  landed: number;
  inner: number;
  resolve: (score: number) => void;
}

function fmtMult(m: number): string {
  if (m >= 1000) return formatNum(m);
  if (m >= 10) return `X${Math.floor(m)}`;
  const t = Math.floor(m * 10) / 10;
  // Four glyphs crowd an 18px bucket, so long decimals drop the X.
  return t % 1 === 0 ? `X${t.toFixed(0)}` : t.toFixed(1);
}

const hexColor = (c: string) => parseInt(c.slice(1), 16);

export class CauldronScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: CRun;
  private per: CPersistent;
  private core: CauldronCore;

  private bgG = new Graphics();
  private pegG = new Graphics();
  private dynG = new Graphics();
  private balls = new Container();
  private fxG = new Graphics();
  private pool: Sprite[] = [];
  private bucketText: PixelText[] = [];
  private maliceText = new PixelText('', '#f4e8c1');
  private maliceLabel = new PixelText('MALICE', '#e05050');
  private ticketHead = new PixelText('', '#7a2a2a', null);
  private ticketItems: { icon: Sprite; text: PixelText }[] = [];
  private ticketFoot = new PixelText('', '#9c8aa8', null);
  private spoonNow = new Sprite();
  private spoonNext = new Sprite();
  private nextText = new PixelText('NEXT', '#1c3008', null);
  private brewText = new PixelText('', '#9ad43a');
  private tokenText = new PixelText('', '#e8c04a');
  private overflowText = new PixelText('', '#9ad43a');
  private hopperText = new PixelText('', '#fff2a0');
  private chutes: Button[] = [];
  private upBtn!: Button;
  private malDown!: Button;
  private malUp!: Button;
  private boardHit = new Container();
  private ticketHit = new Container();
  private spoonHit = new Container();
  private bucketHit = new Container();
  private hopperHit = new Container();

  // Layout (stage px).
  private bx = 0;
  private railY = 0;
  private boardTop = 0;
  private landY = 0;
  private potY = 0;
  private chuteY = 0;
  private btnY = 0;
  private pegTop = 0;

  private particles: Particle[] = [];
  private bubbles: Bubble[] = [];
  private bucketFlash = new Array(BUCKETS).fill(0);
  private toadPos: number[] = [];
  private toadTip: number[] = [];
  private shake = 0;
  private slowmo = 0;
  private floatBudget = 6;
  private brewAcc = 0;
  private brewRate = 0;
  private brewT = 0;
  private overflowAcc = 0;
  private overflowShow = 0;
  private ticketPulse = 0;
  private chuteFlash = new Array(BUCKETS).fill(0);
  private stateKey = '';
  private checkT = 0;
  private time = 0;
  private lastTicketKey = '';
  private intenseUntil = 0;
  private byeT = -1;
  // Scrying Ladle (hold a chute key) and Bucket Shift (hold a bucket).
  private holdK = -1;
  private holdT = 0;
  private scryK = -1;
  private pressK = -1;
  private pressT = 0;
  private selK = -1;
  private hopper: Hopper | null = null;
  // Sound rate limits (seconds until the next one may play).
  private sndPeg = 0;
  private sndGold = 0;
  private sndPlop = 0;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.run = ctx.save.run as CRun;
    this.per = ctx.save.persistent as CPersistent;
    this.core = new CauldronCore(this.run, this.per, {
      earn: (b) => ctx.earn(b),
      raiseSkill: (l) => ctx.raiseSkill(l),
      land: (b, k, amount, mult) => this.onLand(b, k, amount, mult),
      peg: (b) => this.onPeg(b),
      gold: (b, g) => this.onGold(b, g.x, g.y),
      ladle: (b) => this.spark(b.x, b.y, PAL.ladleHi, 3),
      bump: (b) => this.spark(b.x, b.y, PAL.bumperHi, 3),
      bone: (b, _p, amount) => this.onBone(b, amount),
      rune: (b) => {
        this.spark(b.x, b.y, PEG_PAL.runeHi, 5);
        if (b.tossed || b.ladled) sfx.rune(this.vol);
      },
      split: (b) => {
        this.spark(b.x, b.y, hexColor(ING_COLOR[b.ing]), 4);
        if (b.tossed || b.ladled) sfx.split(this.vol);
      },
      boom: (b) => this.onBoom(b),
      spill: (b, side, amount) => this.onSpill(b, side, amount),
      tick: (ing, _k, ti) => this.onTick(ing, ti),
      batch: (p, t, sock) => this.onBatch(p, t, sock),
      drop: (_x, i) => (this.toadTip[i] = 0.25),
      overflow: (a) => (this.overflowAcc += a),
      hopper: (k) => this.onHopperLand(k),
      now: () => Date.now(),
      imports: ctx.save.imports,
    });
    // Hold the skill gate even after a reload.
    ctx.raiseSkill(heldMalice(this.run));

    this.root.addChild(this.bgG, this.pegG, this.dynG, this.balls, this.fxG);
    for (let k = 0; k < BUCKETS; k++) {
      const t = new PixelText('', '#f4e8c1');
      this.bucketText.push(t);
      this.root.addChild(t);
    }
    for (let i = 0; i < 4; i++) {
      const icon = new Sprite();
      icon.visible = false;
      const text = new PixelText('', '#2a1a3a', null);
      text.visible = false;
      this.ticketItems.push({ icon, text });
      this.root.addChild(icon, text);
    }
    this.root.addChild(
      this.maliceLabel,
      this.maliceText,
      this.ticketHead,
      this.ticketFoot,
      this.spoonNow,
      this.spoonNext,
      this.nextText,
      this.brewText,
      this.tokenText,
      this.overflowText,
      this.hopperText,
    );
    this.hopperText.visible = false;

    // Input: tap a peg to curse it.
    this.boardHit.eventMode = 'static';
    this.boardHit.on('pointerdown', (e: FederatedPointerEvent) => this.onBoardTap(e));
    this.ticketHit.eventMode = 'static';
    this.ticketHit.cursor = 'pointer';
    this.ticketHit.on('pointertap', (e: FederatedPointerEvent) => this.onTicketTap(e));
    this.spoonHit.eventMode = 'static';
    this.spoonHit.cursor = 'pointer';
    this.spoonHit.on('pointertap', () => this.onSpoonTap());
    this.bucketHit.eventMode = 'static';
    this.bucketHit.on('pointerdown', (e: FederatedPointerEvent) => this.onBucketDown(e));
    this.bucketHit.on('pointerup', () => (this.pressK = -1));
    this.bucketHit.on('pointerupoutside', () => (this.pressK = -1));
    this.hopperHit.eventMode = 'none';
    this.hopperHit.cursor = 'pointer';
    this.hopperHit.on('pointertap', () => this.tipHopper());
    this.root.addChild(this.boardHit, this.ticketHit, this.spoonHit, this.bucketHit);

    for (let k = 0; k < BUCKETS; k++) {
      const b = new Button({
        w: COL_W - 1,
        h: CHUTE_H - 1,
        label: `${k + 1}`,
        color: 0x6a4a8a,
        shade: 0x3a2850,
        textColor: C.ink,
        onTap: () => this.onToss(k),
      });
      // Scrying Ladle: holding a key shows where that chute lands (05 §11).
      b.on('pointerdown', () => {
        this.holdK = k;
        this.holdT = 0;
      });
      const end = () => {
        if (this.holdK === k) this.holdK = -1;
        if (this.scryK === k) this.scryK = -1;
      };
      b.on('pointerup', end);
      b.on('pointerupoutside', end);
      b.on('pointerleave', end);
      this.chutes.push(b);
      this.root.addChild(b);
    }
    this.upBtn = new Button({ w: 72, h: BTN_H - 1, label: 'UPGRADES', color: C.gold, shade: 0x9a7a20, onTap: () => ctx.openUpgrades(this.groups()) });
    this.malDown = new Button({ w: 14, h: 11, label: '-', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.setMalice(this.run.malice - 1) });
    this.malUp = new Button({ w: 14, h: 11, label: '+', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.setMalice(this.run.malice + 1) });
    this.root.addChild(this.upBtn, this.malDown, this.malUp, this.hopperHit);

    const tex = ingTexture(ctx.game.app.renderer, 'newt');
    for (let i = 0; i < MAX_LIVE; i++) {
      const s = new Sprite(tex);
      s.visible = false;
      s.roundPixels = true;
      this.pool.push(s);
      this.balls.addChild(s);
    }
    this.resize(ctx.layout);
  }

  private get vol(): number {
    return this.ctx.game.save.meta.settings.sfx ?? 0.6;
  }

  // ---------- layout and static drawing ----------

  resize(_layout: Layout): void {
    const c = this.ctx.content();
    this.bx = c.x + Math.floor((c.w - BOARD_W) / 2);
    const fixed = RAIL_H + BOARD_H + BUCKET_H + POT_H + CHUTE_H + BTN_H + 6 + 4;
    let extra = Math.max(0, c.h - fixed);
    // Gaps between the bottom sections grow a little; the rest goes on top (clear of the bubble).
    const gap = Math.min(6, Math.floor(extra / 8));
    extra -= gap * 3;
    const top = c.y + extra;
    this.railY = top;
    this.boardTop = top + RAIL_H;
    this.landY = this.boardTop + BOARD_H;
    this.potY = this.landY + BUCKET_H + 2 + gap;
    this.chuteY = this.potY + POT_H + 2 + gap;
    this.btnY = this.chuteY + CHUTE_H + 2 + gap;
    this.boardHit.hitArea = new Rectangle(this.bx - 6, this.boardTop, BOARD_W + 12, BOARD_H);
    this.bucketHit.hitArea = new Rectangle(this.bx, this.landY, BOARD_W, BUCKET_H);
    this.ticketHit.hitArea = new Rectangle(this.bx + BOARD_W - TICKET_W, this.potY, TICKET_W, POT_H);
    this.spoonHit.hitArea = new Rectangle(this.bx + MAL_W + 3, this.potY, 46, 18);
    this.hopperHit.hitArea = new Rectangle(this.bx + BOARD_W / 2 - 16, this.boardTop - 2, 32, 24);
    this.chutes.forEach((b, k) => b.position.set(this.bx + k * COL_W, this.chuteY));
    this.upBtn.position.set(this.bx, this.btnY);
    this.malDown.position.set(this.bx + 2, this.potY + 19);
    this.malUp.position.set(this.bx + 18, this.potY + 19);
    this.maliceLabel.position.set(this.bx + 4, this.potY + 3);
    this.maliceText.position.set(this.bx + 4, this.potY + 11);
    this.brewText.position.set(this.bx + 78, this.btnY);
    this.tokenText.position.set(this.bx + 78, this.btnY + 8);
    this.drawStatic();
  }

  private drawStatic(): void {
    const g = this.bgG.clear();
    const c = this.ctx.content();
    const L = this.ctx.layout;
    const bx = this.bx;
    g.rect(0, 0, L.w, L.h).fill(PAL.bg);
    // Kitchen wall bricks behind the board.
    for (let y = c.y; y < this.landY; y += 8) {
      const off = ((y - c.y) / 8) % 2 ? 6 : 0;
      for (let x = c.x - 12 + off; x < c.x + c.w; x += 12) g.rect(x, y, 11, 7).fill(0x1c1228);
    }
    // A shelf of jars fills spare height above the rail (it's under the bubble on short screens).
    if (this.railY - c.y >= 30) {
      const sy = this.railY - 12;
      g.rect(bx - 4, sy + 8, BOARD_W + 8, 3).fill(PAL.rail);
      g.rect(bx - 4, sy + 8, BOARD_W + 8, 1).fill(PAL.railTop);
      g.rect(bx + 6, sy + 11, 2, 4).fill(PAL.rail);
      g.rect(bx + BOARD_W - 8, sy + 11, 2, 4).fill(PAL.rail);
      const jars = [0x9ad43a, 0xb070f0, 0xf0d040, 0xc03a3a, 0x6ac048, 0xf08a30, 0x4ac0c0, 0x9ad43a, 0xb070f0, 0xe0e0e0];
      for (let i = 0; i < jars.length; i++) {
        const jx = bx + 4 + i * 16 + ((i * 7) % 5);
        const jh = 5 + ((i * 3) % 4);
        g.rect(jx, sy + 8 - jh, 7, jh).fill(PAL.ink);
        g.rect(jx + 1, sy + 9 - jh, 5, jh - 1).fill(jars[i]);
        g.rect(jx + 1, sy + 9 - jh, 1, jh - 2).fill({ color: 0xffffff, alpha: 0.35 });
        g.rect(jx + 2, sy + 7 - jh, 3, 2).fill(0x7a5636);
      }
    }
    // Board panel.
    g.rect(bx - 4, this.boardTop - 1, BOARD_W + 8, BOARD_H + 2).fill(PAL.boardEdge);
    g.rect(bx - 3, this.boardTop, BOARD_W + 6, BOARD_H).fill(PAL.ink);
    g.rect(bx, this.boardTop, BOARD_W, BOARD_H).fill(PAL.board);
    // Rail with chute mouths.
    g.rect(bx - 4, this.railY, BOARD_W + 8, RAIL_H).fill(PAL.rail);
    g.rect(bx - 4, this.railY, BOARD_W + 8, 2).fill(PAL.railTop);
    g.rect(bx - 4, this.railY + RAIL_H - 1, BOARD_W + 8, 1).fill(PAL.ink);
    for (let k = 0; k < BUCKETS; k++) g.rect(bx + k * COL_W + 6, this.railY + RAIL_H - 3, 6, 2).fill(PAL.ink);
    // Slop Pails (05 §4) hang off both sides of the board, low down.
    const py = this.landY - 26;
    for (const px of [bx - 9, bx + BOARD_W + 4]) {
      g.rect(px, py, 6, 7).fill(PAL.ink);
      g.rect(px + 1, py + 1, 4, 5).fill(PEG_PAL.slop);
      g.rect(px + 1, py + 1, 4, 1).fill(0x8a7a4a);
    }

    // Cauldron: copper body behind the buckets and pot row.
    const potTop = this.landY - 2;
    const potBot = this.potY + POT_H;
    g.rect(bx - 6, potTop, BOARD_W + 12, potBot - potTop).fill(PAL.ink);
    g.rect(bx - 5, potTop + 1, BOARD_W + 10, potBot - potTop - 2).fill(PAL.copper);
    g.rect(bx - 5, potTop + 1, BOARD_W + 10, 2).fill(PAL.copperHi);
    g.rect(bx - 5, potBot - 4, BOARD_W + 10, 3).fill(PAL.copperLo);
    // Feet.
    g.rect(bx + 10, potBot, 8, 2).fill(PAL.copperLo);
    g.rect(bx + BOARD_W - 18, potBot, 8, 2).fill(PAL.copperLo);

    // Buckets.
    const mults = bucketMults(this.run);
    const tiers = tiersOf(this.run);
    for (let k = 0; k < BUCKETS; k++) {
      const x = bx + k * COL_W;
      const tier = tiers[k];
      g.rect(x, this.landY, COL_W, BUCKET_H).fill(PAL.ink);
      g.rect(x + 1, this.landY, COL_W - 2, BUCKET_H - 1).fill(BUCKET_COL[tier]);
      g.rect(x + 1, this.landY + BUCKET_H - 4, COL_W - 2, 3).fill({ color: 0x000000, alpha: 0.25 });
      const t = this.bucketText[k];
      t.set(fmtMult(mults[k]), tier === 4 ? '#fff2a0' : '#f4e8c1');
      t.position.set(x + Math.floor((COL_W - t.width) / 2) + 1, this.landY + 5);
    }
    // Pot well in the middle (spoon + ladles), Malice panel left, ticket right.
    drawPanel(g, bx, this.potY, MAL_W, POT_H, 0x2a1a3a, 0x7a2a2a);
    const wx = bx + MAL_W + 3;
    const ww = BOARD_W - MAL_W - 3 - TICKET_W - 3;
    g.rect(wx, this.potY, ww, POT_H).fill(PAL.ink);
    g.rect(wx + 1, this.potY + 1, ww - 2, POT_H - 2).fill(PAL.bileLo);
    g.rect(wx + 1, this.potY + 1, ww - 2, 3).fill(PAL.bile);
    drawPanel(g, bx + BOARD_W - TICKET_W, this.potY, TICKET_W, POT_H, 0xe8dcb0, 0x8a6a3a);

    this.spoonNow.position.set(wx + 5, this.potY + 7);
    this.nextText.position.set(wx + 16, this.potY + 8);
    this.spoonNext.position.set(wx + 33, this.potY + 7);
    this.overflowText.position.set(bx + BOARD_W - 30, this.railY - 8);
    this.lastTicketKey = '';
    this.drawPegs();
  }

  private drawPegs(): void {
    const g = this.pegG.clear();
    const R = rows(this.run);
    this.pegTop = this.boardTop + 10 + (ROW_SLOTS - R) * ROW_H;
    for (const p of this.core.board.pegs) {
      const x = this.bx + p.x;
      const y = this.pegTop + p.y;
      switch (p.kind) {
        case 'bumper':
          g.rect(x - 2, y - 2, 5, 5).fill(PAL.ink);
          g.rect(x - 1, y - 2, 3, 5).fill(PAL.bumper);
          g.rect(x - 2, y - 1, 5, 3).fill(PAL.bumper);
          g.rect(x - 1, y - 1, 1, 1).fill(PAL.bumperHi);
          g.rect(x - 3, y, 1, 1).fill(PAL.bumper);
          g.rect(x + 3, y, 1, 1).fill(PAL.bumper);
          break;
        case 'wall':
          g.rect(x - 1, y - 1, 3, 3).fill(PEG_PAL.wall);
          g.rect(x - 1, y - 1, 1, 1).fill(PEG_PAL.wallHi);
          break;
        case 'bone':
          g.rect(x - 2, y - 1, 5, 3).fill(PAL.ink);
          g.rect(x - 1, y - 2, 3, 5).fill(PAL.ink);
          g.rect(x - 1, y - 1, 3, 3).fill(PEG_PAL.bone);
          g.rect(x - 2, y - 2, 1, 1).fill(PEG_PAL.bone);
          g.rect(x + 2, y + 2, 1, 1).fill(PEG_PAL.bone);
          g.rect(x, y, 1, 1).fill(PEG_PAL.boneLo);
          break;
        case 'rune':
          g.rect(x, y - 3, 1, 7).fill(PAL.ink);
          g.rect(x - 3, y, 7, 1).fill(PAL.ink);
          g.rect(x - 1, y - 2, 3, 5).fill(PEG_PAL.rune);
          g.rect(x - 2, y - 1, 5, 3).fill(PEG_PAL.rune);
          g.rect(x, y - 1, 1, 1).fill(PEG_PAL.runeHi);
          break;
        case 'thorn':
          g.rect(x - 1, y - 1, 3, 3).fill(PEG_PAL.thorn);
          g.rect(x, y - 3, 1, 2).fill(PEG_PAL.thornHi);
          g.rect(x, y + 2, 1, 2).fill(PEG_PAL.thornHi);
          g.rect(x - 3, y, 2, 1).fill(PEG_PAL.thornHi);
          g.rect(x + 2, y, 2, 1).fill(PEG_PAL.thornHi);
          break;
        default:
          g.rect(x - 1, y - 2, 3, 5).fill(PAL.ironLo);
          g.rect(x - 2, y - 1, 5, 3).fill(PAL.ironLo);
          g.rect(x - 1, y - 1, 3, 3).fill(PAL.iron);
          g.rect(x - 1, y - 1, 1, 1).fill(PAL.ironHi);
      }
    }
  }

  // ---------- upgrades ----------

  private entry(u: UpDef): UpgradeEntry {
    const run = this.run;
    const per = this.per;
    const level = () => (u.tokens ? rlvOf(per, u.id) : lvOf(run, u.id));
    const si = SPECIALS.indexOf(u.id as IngId);
    return {
      id: u.id,
      name: u.name,
      desc: () => u.desc(level()),
      level,
      max: u.max,
      cost: () => upCost(u, level()),
      // U-13: the token glyph, never a bare "T" (T reads as Tribute in the Throne sheets).
      currency: u.tokens ? '{coin}Tokens' : undefined,
      locked: () => upLocked(u, this.ctx.save.cycle.n),
      // Specials show one at a time: the next one appears once the one before is in the flow.
      visible: si > 0 ? () => lvOf(run, SPECIALS[si - 1]) > 0 || lvOf(run, u.id) > 0 : u.id === 'odds' ? () => lvOf(run, 'mandrake') > 0 : undefined,
      canAfford: () => (u.tokens ? per.tokens >= upCost(u, level()) : run.bank >= upCost(u, level())),
      buy: () => {
        const l = level();
        if (l >= u.max) return;
        const cost = upCost(u, l);
        if (u.tokens) {
          if (per.tokens < cost) return;
          per.tokens -= cost;
          per.rlv[u.id] = l + 1;
        } else {
          if (!this.ctx.spend(cost)) return;
          run.lv[u.id] = l + 1;
        }
        this.afterBuy(u.id);
      },
    };
  }

  private header(id: string, name: string): UpgradeEntry {
    return { id, name, header: true, desc: () => '', level: () => 0, max: 0, cost: () => 0, canAfford: () => false, buy: () => {} };
  }

  private maliceEntry(): UpgradeEntry {
    const run = this.run;
    return {
      id: 'malice',
      name: 'Board Malice',
      desc: () => {
        const n = run.maliceBought + 1;
        return n > MALICE_MAX ? 'The nastiest board there is' : `Malice ${n}: bumper, mid x${(1.2 ** n).toFixed(2)}`;
      },
      level: () => run.maliceBought,
      max: MALICE_MAX,
      cost: () => maliceCost(run.maliceBought),
      canAfford: () => run.bank >= maliceCost(run.maliceBought),
      buy: () => {
        if (run.maliceBought >= MALICE_MAX) return;
        if (!this.ctx.spend(maliceCost(run.maliceBought))) return;
        run.maliceBought++;
        run.malice = run.maliceBought;
        run.layoutLock = true;
        this.afterBuy('malice');
      },
    };
  }

  private layoutEntry(): UpgradeEntry {
    const run = this.run;
    const open = () => layoutsOpen(this.ctx.save.lifetime?.falls ?? 0);
    const next = () => {
      const o = open();
      return o[(o.indexOf(layoutOf(run)) + 1) % o.length];
    };
    return {
      id: 'layout',
      name: 'Rack',
      levelText: () => LAYOUTS[layoutOf(run)].name.toUpperCase(),
      desc: () => (open().length > 1 ? `Next: ${LAYOUTS[next()].name}. ${LAYOUTS[next()].blurb}` : 'More racks after a Fall'),
      level: () => 0,
      max: 1,
      buyLabel: 'NEXT',
      costText: () => 'FREE',
      cost: () => 0,
      canAfford: () => open().length > 1 && !run.layoutLock,
      locked: () => (open().length <= 1 ? 'FALL 1' : run.layoutLock ? 'SET' : null),
      buy: () => {
        if (open().length <= 1 || run.layoutLock) return;
        const l = next();
        run.layout = l;
        this.per.layout = l;
        delete run.tiers;
        this.ctx.markSeen('cl.layoutPicked');
        this.syncState(true);
        this.ctx.saveSoon();
      },
    };
  }

  private groups(): UpgradeGroup[] {
    const by = (b: string) => UPGRADES.filter((u) => u.branch === b).map((u) => this.entry(u));
    const bank = () => ({
      text: `${formatNum(this.run.bank, this.ctx.game.save.meta.settings.notation)} BILE {coin}${formatNum(this.per.tokens)}`,
      color: this.ctx.def.currencyColor,
    });
    // Four short tabs (+ Goods) so every name fits at 180 px.
    return [
      { name: 'Kitchen', entries: [this.header('h.toads', 'Toadlings'), ...by('kitchen'), this.header('h.recipes', 'Recipes ({coin} tokens)'), ...by('recipes')], bank },
      { name: 'Pantry', entries: by('pantry') },
      { name: 'Board', entries: by('board') },
      { name: 'Pot', entries: [this.maliceEntry(), this.header('h.buckets', 'Buckets'), ...by('buckets'), this.header('h.rack', 'Rack (locks at Malice)'), this.layoutEntry()] },
    ];
  }

  private afterBuy(id: string): void {
    this.syncState();
    this.ctx.saveSoon();
    const say = this.ctx.say.bind(this.ctx);
    if (id === 'jackpot' && lvOf(this.run, 'jackpot') === 1) say('jackpot1', { type: 'first_upgrade', key: 'jackpot' });
    if (id === 'hire' && toadlings(this.run) >= 4) say('fourToads', { type: 'first_helper', key: 'toads4' });
    if (SPECIALS.includes(id as IngId)) say(id, { type: 'tier_reached', key: id });
    if (id === 'malice') {
      const m = this.run.maliceBought;
      if (m >= 1) this.ctx.lesson('malice');
      if (m === 5) say('malice5', { type: 'dial_raised', key: 'malice5' });
      if (m === 10) say('malice10', { type: 'dial_raised', key: 'malice10' });
    }
    if (id === 'scry') this.ctx.lesson('scry');
    if (id === 'shift') this.ctx.lesson('shift');
    if (id === 'double') {
      this.core.refresh();
      this.ctx.lesson('double');
    }
  }

  /** Re-read upgrade state: rebuild the board and labels when anything visible changed. */
  private syncState(force = false): void {
    const key = `${JSON.stringify(this.run.lv)}|${this.run.malice}|${this.run.maliceBought}|${layoutOf(this.run)}|${tiersOf(this.run).join('')}|${rlvOf(this.per, 'double')}`;
    if (key === this.stateKey && !force) return;
    this.stateKey = key;
    this.core.refresh();
    this.drawStatic();
  }

  private setMalice(v: number): void {
    const n = Math.max(0, Math.min(this.run.maliceBought, v));
    if (n === this.run.malice) {
      if (v > this.run.maliceBought) {
        sfx.nope(this.vol);
        this.ctx.float(
          this.run.maliceBought >= MALICE_MAX ? 'MAXED' : `POT TAB: ${formatNum(maliceCost(this.run.maliceBought))}`,
          this.bx + 40,
          this.potY - 8,
          '#e05050',
        );
      }
      return;
    }
    this.run.malice = n;
    this.syncState();
    this.ctx.saveSoon();
    this.ctx.float(`MALICE ${n}`, this.bx + 17, this.potY - 6, '#e05050');
    if (n >= 1) this.ctx.lesson('malice');
  }

  // ---------- input ----------

  private onBoardTap(e: FederatedPointerEvent): void {
    const p = e.getLocalPosition(this.root);
    const peg = this.core.board.pegAt(p.x - this.bx, p.y - this.pegTop, 10);
    if (!peg) return;
    if (this.core.charges <= 0) {
      this.ctx.float('NO LADLES', p.x, p.y - 8, '#9c8aa8');
      sfx.nope(this.vol);
      return;
    }
    if (this.core.curse(peg)) {
      this.spark(peg.x, peg.y, PAL.ladle, 6);
      this.ctx.haptic(8);
      sfx.curse(this.vol);
      this.intenseUntil = this.time + 1.5;
      if (this.run.malice >= 1) this.ctx.markSeen('cl.malCurse');
      if ((this.ctx.save.imports?.essence ?? 0) > 0) this.ctx.markSeen('cl.sigilCurse');
    }
  }

  private onToss(k: number): void {
    const ing = this.core.toss(k);
    if (!ing) return;
    this.chuteFlash[k] = 1;
    this.intenseUntil = this.time + 1.5;
    this.ctx.haptic(5);
    sfx.toss(this.vol);
  }

  private onTicketTap(e: FederatedPointerEvent): void {
    const p = e.getLocalPosition(this.root);
    const slot = this.core.tickets().length > 1 && p.y >= this.potY + 12 ? 1 : 0;
    if (this.core.reroll(Date.now(), slot)) {
      this.ctx.float('NEW ORDER', this.bx + BOARD_W - 29, this.potY - 6, C.goldText);
      this.lastTicketKey = '';
    }
  }

  private onSpoonTap(): void {
    const t = this.run.ticket;
    if (!t) return;
    if (t.swapped) {
      this.ctx.float('1 SWAP/ORDER', this.bx + MAL_W + 24, this.potY - 6, '#9c8aa8');
      return;
    }
    if (this.core.swapSpoon()) {
      t.swapped = true;
      this.ctx.markSeen('cl.swapped');
      sfx.toss(this.vol * 0.6);
      this.ctx.float('SWAP!', this.bx + MAL_W + 24, this.potY - 6, '#d2f27a');
    }
  }

  private onBucketDown(e: FederatedPointerEvent): void {
    const p = e.getLocalPosition(this.root);
    const k = Math.max(0, Math.min(BUCKETS - 1, Math.floor((p.x - this.bx) / COL_W)));
    if (this.selK >= 0) {
      if (Math.abs(k - this.selK) === 1) this.swapBuckets(this.selK, k);
      this.selK = -1;
      return;
    }
    if (lvOf(this.run, 'shift') > 0) {
      this.pressK = k;
      this.pressT = 0;
    }
  }

  private swapBuckets(a: number, b: number): void {
    const now = Date.now();
    if (now < (this.run.shiftAt ?? 0)) return;
    const t = [...tiersOf(this.run)];
    [t[a], t[b]] = [t[b], t[a]];
    this.run.tiers = t;
    this.run.shiftAt = now + SHIFT_MS;
    this.ctx.markSeen('cl.shifted');
    this.syncState(true);
    this.ctx.saveSoon();
    sfx.split(this.vol);
    this.ctx.float('SWAPPED', this.bx + Math.min(a, b) * COL_W + COL_W, this.landY - 6, C.goldText);
  }

  // ---------- sim hooks (juice) ----------

  private onPeg(b: Ball): void {
    if (!(b.tossed || b.ladled) || b.hopper || this.sndPeg > 0) return;
    this.sndPeg = 0.05;
    sfx.tink(this.vol, b.hits);
  }

  private onLand(b: Ball, k: number, amount: number, mult: number): void {
    this.bucketFlash[k] = 1;
    this.brewAcc += amount;
    const sx = this.bx + k * COL_W + COL_W / 2;
    const color = hexColor(ING_COLOR[b.ing]);
    for (let i = 0; i < 3; i++) this.particle(this.bx + b.x, this.landY, (Math.random() - 0.5) * 40, -20 - Math.random() * 30, 0.4, color);
    const player = b.tossed || b.ladled;
    const big = mult >= 5;
    const tier = tiersOf(this.run)[k];
    if (player && this.sndPlop <= 0) {
      this.sndPlop = 0.08;
      sfx.plop(this.vol, tier);
    }
    if ((player || big) && this.floatBudget >= 1) {
      this.floatBudget -= 1;
      this.ctx.float(`+${formatNum(amount)}`, sx, this.landY - 8, big ? '#fff2a0' : ING_COLOR[b.ing]);
    }
    if (player && big) {
      this.shake = 0.06;
      for (let i = 0; i < 8; i++) this.particle(sx, this.landY, (Math.random() - 0.5) * 30, -40 - Math.random() * 40, 0.7, PAL.bileHi);
      sfx.cackle(this.vol);
      if (mult >= 10) {
        this.slowmo = 0.12;
        this.ctx.haptic(25);
        if (!this.ctx.seen('m.bigWin')) {
          this.ctx.markSeen('m.bigWin');
          this.ctx.say('bigWin');
        }
      }
    }
    if (this.run.stats.goldTriples === 1 && !this.ctx.seen('m.goldTriple')) {
      this.ctx.markSeen('m.goldTriple');
      this.ctx.say('goldTriple');
    }
  }

  private onGold(b: Ball, x: number, y: number): void {
    this.spark(x, y, PAL.goldHi, 4);
    if (this.sndGold <= 0 && (b.tossed || b.ladled || Math.random() < 0.3)) {
      this.sndGold = 0.08;
      sfx.ding(this.vol * (b.tossed || b.ladled ? 1 : 0.4));
    }
    if (b.tossed && this.floatBudget >= 1) {
      this.floatBudget -= 0.5;
      this.ctx.float(`X${(1.5 + 0.1 * lvOf(this.run, 'polish')).toFixed(1)}`, this.bx + x, this.pegTop + y - 8, C.goldText);
    }
  }

  private onBone(b: Ball, amount: number): void {
    this.spark(b.x, b.y, PEG_PAL.bone, 2);
    if ((b.tossed || b.ladled) && this.floatBudget >= 1) {
      this.floatBudget -= 0.5;
      this.ctx.float(`+${formatNum(amount)}`, this.bx + b.x, this.pegTop + b.y - 6, '#e8dcc0');
    }
  }

  private onBoom(b: Ball): void {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.particle(this.bx + b.x, this.pegTop + b.y, Math.cos(a) * 60, Math.sin(a) * 60, 0.35, i % 2 ? PEG_PAL.boom : PAL.goldHi);
    }
    sfx.boom(this.vol * 0.8);
    this.shake = Math.max(this.shake, 0.05);
  }

  private onSpill(b: Ball, side: number, amount: number): void {
    // The ingredient arcs into the Slop Pail on that side.
    const tx = side < 0 ? this.bx - 6 : this.bx + BOARD_W + 7;
    const x0 = this.bx + b.x;
    const y0 = this.pegTop + b.y;
    for (let i = 0; i < 5; i++) this.particle(x0, y0, (tx - x0) * 2 + (Math.random() - 0.5) * 10, -30 - Math.random() * 20, 0.5, hexColor(ING_COLOR[b.ing]));
    if (this.floatBudget >= 1) {
      this.floatBudget -= 1;
      this.ctx.float(`SLOP +${formatNum(amount)}`, tx, this.landY - 34, '#b0a070');
    }
    sfx.spill(this.vol * 0.7);
    this.ctx.say('slop', { type: 'hazard_first', key: 'slop' });
  }

  private onTick(ing: IngId, ti: number): void {
    this.ticketPulse = 1;
    this.lastTicketKey = '';
    sfx.tick(this.vol);
    if (ti === 1) this.ctx.markSeen('cl.t2tick');
    this.ctx.float(ing === 'sock' ? 'SOCK X2!' : '{up}', this.bx + BOARD_W - 29, this.potY - 4, ing === 'sock' ? '#ffffff' : '#8fd14f');
  }

  private onBatch(payout: number, tokens: number, sock: boolean): void {
    const cx = this.bx + MAL_W + 3 + Math.floor((BOARD_W - MAL_W - TICKET_W - 6) / 2);
    this.ctx.float(`${sock ? 'SOCK ' : ''}BATCH! +${formatNum(payout)}`, cx, this.potY - 14, '#fff2a0');
    this.ctx.float(`+${tokens} TOKEN`, cx, this.potY - 4, C.goldText);
    this.ctx.haptic(30);
    sfx.batch(this.vol);
    this.shake = 0.1;
    this.intenseUntil = Math.max(this.intenseUntil, this.time + 1.2);
    for (let i = 0; i < 20; i++) this.particle(cx + (Math.random() - 0.5) * 20, this.potY + 4, (Math.random() - 0.5) * 50, -50 - Math.random() * 60, 0.9, i % 3 ? PAL.bileHi : PAL.bile);
    this.lastTicketKey = '';
    const batches = this.run.stats.batches;
    this.ctx.say('firstBatch', { type: 'mechanic_unlocked', key: 'batch' });
    if (batches >= 1) this.ctx.lesson('tokens');
    if (batches >= 3) this.ctx.lesson('swap');
    if (batches > 1) this.ctx.say('batch');
    this.ctx.saveSoon();
  }

  private particle(x: number, y: number, vx: number, vy: number, life: number, color: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, vx, vy, life, color });
  }

  private spark(bx: number, by: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 25;
      this.particle(this.bx + bx, this.pegTop + by, Math.cos(a) * v, Math.sin(a) * v, 0.3, color);
    }
  }

  // ---------- the Hopper return ritual (05 §13, 00 §5.3) ----------

  returnRitual(_haul: number): Promise<number> {
    if (this.hopper) return Promise.resolve(0);
    return new Promise<number>((resolve) => {
      this.hopper = { phase: 'wait', t: 0, left: HOPPER_DROPS, spawnT: 0, landed: 0, inner: 0, resolve };
      this.hopperHit.eventMode = 'static';
      this.hopperText.visible = true;
    });
  }

  private tipHopper(): void {
    const h = this.hopper;
    if (!h || h.phase !== 'wait') return;
    h.phase = 'rain';
    h.t = 0;
    this.hopperHit.eventMode = 'none';
    this.ctx.haptic(20);
    sfx.batch(this.vol * 0.6);
    this.intenseUntil = this.time + 4;
  }

  private onHopperLand(k: number): void {
    const h = this.hopper;
    if (!h) return;
    h.landed++;
    if (inZone(k, 1, tiersOf(this.run))) h.inner++;
  }

  private updateHopper(dt: number): void {
    const h = this.hopper;
    if (!h) return;
    h.t += dt;
    if (h.phase === 'wait') {
      this.hopperText.set(Math.floor(this.time * 3) % 2 ? 'TIP THE HOPPER!' : 'TAP THE HOPPER!');
      this.hopperText.position.set(this.bx + Math.floor((BOARD_W - this.hopperText.width) / 2), this.boardTop + 26);
      // Never required: it quietly empties itself after a while (score 0).
      if (h.t > 14) this.endHopper(0);
      return;
    }
    if (h.phase === 'rain') {
      // A 3 s cascade from the hopper mouth across the board.
      h.spawnT -= dt;
      while (h.left > 0 && h.spawnT <= 0) {
        h.spawnT += 3 / HOPPER_DROPS;
        h.left--;
        const x = BOARD_W / 2 + (Math.random() - 0.5) * BOARD_W * Math.min(1, 0.3 + h.t / 2);
        if (!this.core.hopperDrop(x)) h.landed++;
      }
      this.hopperText.set(`STEER IT IN! ${h.inner}/${HOPPER_DROPS}`);
      this.hopperText.position.set(this.bx + Math.floor((BOARD_W - this.hopperText.width) / 2), this.boardTop + 26);
      if (h.left <= 0) h.phase = 'settle';
      return;
    }
    if (h.landed >= HOPPER_DROPS || h.t > 9) {
      // Tipping it pays half; steering the rain into the inner buckets pays the rest.
      const score = Math.min(1, 0.4 + 0.6 * Math.min(1, (h.inner / HOPPER_DROPS) * 2));
      this.ctx.float(`HOPPER ${Math.round(score * 100)}%`, this.bx + BOARD_W / 2, this.boardTop + 20, '#fff2a0');
      this.endHopper(score);
    }
  }

  private endHopper(score: number): void {
    const h = this.hopper;
    if (!h) return;
    this.hopper = null;
    this.hopperText.visible = false;
    this.hopperHit.eventMode = 'none';
    h.resolve(score);
  }

  // ---------- core hooks: manager targets and calm ----------

  isIntense(): boolean {
    return this.time < this.intenseUntil;
  }

  targetRect(id: string): Rect | null {
    const bx = this.bx;
    switch (id) {
      case 'peg': {
        const board = this.core.board;
        const R = rows(this.run);
        const row = board.rowPegs[Math.max(0, Math.floor(R / 2) - 1)];
        const p = row?.find((q) => (q.kind === 'iron' || q.kind === 'bone') && q.x < BOARD_W / 2 - 20 && q.x > BOARD_W / 2 - 40) ?? row?.[1];
        return p ? { x: bx + p.x - 4, y: this.pegTop + p.y - 4, w: 9, h: 9 } : null;
      }
      case 'upgrades':
        return { x: this.upBtn.x, y: this.upBtn.y, w: 72, h: BTN_H };
      case 'chute5':
        return { x: bx + 4 * COL_W, y: this.chuteY, w: COL_W - 1, h: CHUTE_H };
      case 'ticket':
        return { x: bx + BOARD_W - TICKET_W, y: this.potY, w: TICKET_W, h: POT_H };
      case 'gold': {
        const gp = this.core.board.gold[0];
        return gp ? { x: Math.round(bx + gp.x) - 4, y: Math.round(this.pegTop + gp.y) - 4, w: 9, h: 9 } : null;
      }
      case 'board':
        return { x: bx, y: this.boardTop, w: BOARD_W, h: BOARD_H };
      case 'malice':
        return { x: bx, y: this.potY, w: MAL_W, h: POT_H };
      case 'ladles':
        return { x: bx + MAL_W + 3, y: this.potY + 18, w: BOARD_W - MAL_W - TICKET_W - 6, h: 9 };
      case 'buckets':
        return { x: bx, y: this.landY, w: BOARD_W, h: BUCKET_H };
      case 'spoon':
        return { x: bx + MAL_W + 4, y: this.potY + 4, w: 44, h: 13 };
      default:
        return null;
    }
  }

  onImports(): void {
    this.core.refresh();
    if ((this.ctx.save.imports?.essence ?? 0) > 0) this.ctx.lesson('sigils');
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.time += dt;
    this.floatBudget = Math.min(6, this.floatBudget + dt * 5);
    this.sndPeg -= dt;
    this.sndGold -= dt;
    this.sndPlop -= dt;
    let simDt = dt;
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      simDt = dt * 0.25;
    }
    this.core.update(simDt);
    this.updateHopper(dt);
    this.updateHolds(dt);

    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      this.syncState();
      this.checkMilestones();
    }
    if (this.byeT >= 0) {
      this.byeT += dt;
      if (this.byeT > 4) {
        this.byeT = -1;
        this.ctx.markSeen('cl.bye');
      }
    }

    // Brewing rate readout (EMA over ~3 s).
    this.brewT += dt;
    if (this.brewT >= 0.5) {
      const inst = this.brewAcc / this.brewT;
      this.brewRate = this.brewRate * 0.8 + inst * 0.2;
      this.brewAcc = 0;
      this.brewT = 0;
      this.brewText.set(`BREW ${formatNum(this.brewRate)}/S`);
    }
    this.tokenText.set(`{coin}${formatNum(this.per.tokens)} BATCH TOKENS`);
    if (this.overflowAcc > 0) {
      this.overflowText.set(`+${formatNum(this.overflowAcc)}`);
      this.overflowShow = 0.8;
      this.overflowAcc = 0;
    }
    this.overflowShow -= dt;
    this.overflowText.visible = this.overflowShow > 0;

    this.updateParticles(dt);
    this.drawDynamic(dt);
    this.drawBalls();
    this.updatePotUi();

    if (this.shake > 0) {
      this.shake -= dt;
      this.root.position.set(Math.random() < 0.5 ? -1 : 1, 0);
    } else this.root.position.set(0, 0);
  }

  private updateHolds(dt: number): void {
    if (this.holdK >= 0 && lvOf(this.run, 'scry') > 0) {
      this.holdT += dt;
      if (this.holdT >= SCRY_HOLD && this.scryK !== this.holdK) {
        this.scryK = this.holdK;
        this.ctx.markSeen('cl.scried');
      }
    }
    if (this.pressK >= 0) {
      this.pressT += dt;
      if (this.pressT >= SHIFT_HOLD) {
        const wait = (this.run.shiftAt ?? 0) - Date.now();
        if (wait > 0) {
          const s = Math.ceil(wait / 1000);
          this.ctx.float(`SHIFT IN ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, this.bx + this.pressK * COL_W + 9, this.landY - 6, '#9c8aa8');
        } else {
          this.selK = this.pressK;
          this.ctx.haptic(10);
        }
        this.pressK = -1;
      }
    }
  }

  private checkMilestones(): void {
    const s = this.ctx.save.seen;
    if (s['ob.gold'] && !s['cl.bye'] && this.byeT < 0) this.byeT = 0;
    const game = this.ctx.game;
    const meta = game.save.meta;
    if (!game.save.depts.mines && meta.tribute >= game.sealCost('mines') && meta.dreadLifetime >= game.sealDread('mines')) {
      this.ctx.say('minesSeal', { type: 'mechanic_unlocked', key: 'minesSeal' });
    }
    if (layoutsOpen(this.ctx.save.lifetime?.falls ?? 0).length > 1 && !this.run.layoutLock) this.ctx.lesson('layouts');
    if ((this.ctx.save.imports?.essence ?? 0) > 0) this.ctx.lesson('sigils');
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }
    for (let k = 0; k < BUCKETS; k++) {
      this.bucketFlash[k] = Math.max(0, this.bucketFlash[k] - dt * 5);
      this.chuteFlash[k] = Math.max(0, this.chuteFlash[k] - dt * 3);
    }
    this.ticketPulse = Math.max(0, this.ticketPulse - dt * 3);
  }

  private drawDynamic(dt: number): void {
    const g = this.dynG.clear();
    const f = this.fxG.clear();
    const bx = this.bx;
    const board = this.core.board;
    const t = board.t;
    const pulse = Math.floor(this.time * 4) % 2 === 0;

    // Toadlings walk the rail to where they'll tip next.
    const n = toadlings(this.run);
    while (this.toadPos.length < n) {
      this.toadPos.push(BOARD_W / 2);
      this.toadTip.push(0);
    }
    for (let i = 0; i < n; i++) {
      const target = this.core.toadX[i] ?? BOARD_W / 2;
      const d = target - this.toadPos[i];
      this.toadPos[i] += Math.sign(d) * Math.min(Math.abs(d), 120 * dt);
      this.toadTip[i] = Math.max(0, this.toadTip[i] - dt);
      const x = Math.round(bx + this.toadPos[i]) - 3;
      const tip = this.toadTip[i] > 0;
      const hop = Math.abs(d) > 1 && Math.floor(this.time * 10 + i) % 2 === 0 ? 1 : 0;
      const y = this.railY + 1 - hop;
      g.rect(x, y + 2, 7, 4).fill(PAL.ink);
      g.rect(x + 1, y + 2, 5, 3).fill(PAL.toad);
      g.rect(x, y + 1, 3, 2).fill(PAL.ink);
      g.rect(x + 4, y + 1, 3, 2).fill(PAL.ink);
      g.rect(x + 1, y + 1, 1, 1).fill(0xf0f0c0);
      g.rect(x + 5, y + 1, 1, 1).fill(0xf0f0c0);
      if (tip) g.rect(x + 2, y + 6, 3, 2).fill(0x9a6a3a); // tipping the bucket
    }

    // The Hopper (return ritual): a wooden bin on the rail, brimming with the backlog.
    const h = this.hopper;
    if (h) {
      const hx = Math.round(bx + BOARD_W / 2) - 9;
      const hy = this.boardTop + 2; // just under the rail, clear of the manager strip
      const tipped = h.phase !== 'wait';
      const fill = tipped ? Math.max(0, h.left / HOPPER_DROPS) : 1;
      g.rect(hx, hy, 18, 12).fill(PAL.ink);
      g.rect(hx + 1, hy + 1, 16, 10).fill(0x7a5636);
      g.rect(hx + 1, hy + 1, 16, 1).fill(0xa8784a);
      g.rect(hx + 3, hy + 11, 12, 3).fill(PAL.ink);
      g.rect(hx + 4, hy + 11, 10, 2).fill(0x5a3a26);
      const fh = Math.round(8 * fill);
      if (fh > 0) g.rect(hx + 2, hy + 10 - fh, 14, fh).fill(PAL.bile);
      if (fh > 0) for (let i = 0; i < 4; i++) g.rect(hx + 3 + i * 4, hy + 10 - fh - (i % 2), 2, 2).fill(hexColor(ING_COLOR[(['newt', 'toad', 'bat', 'mandrake'] as IngId[])[i]]));
      if (!tipped && pulse) f.rect(hx - 2, hy - 2, 22, 1).rect(hx - 2, hy + 15, 22, 1).rect(hx - 2, hy - 2, 1, 18).rect(hx + 19, hy - 2, 1, 18).fill(C.gold);
    }

    // Peg flashes, Ladles, gold pegs.
    const ls = ladleSecs(this.run);
    for (const p of board.pegs) {
      const x = bx + p.x;
      const y = this.pegTop + p.y;
      if (p.ladleUntil > t) {
        const left = p.ladleUntil - t;
        const frac = left / ls;
        g.rect(x - 3, y - 3, 7, 7).fill({ color: PAL.ladle, alpha: 0.25 });
        g.rect(x - 2, y - 2, 5, 5).fill(PAL.ink);
        g.rect(x - 1, y - 2, 3, 5).fill(PAL.ladle);
        g.rect(x - 2, y - 1, 5, 3).fill(PAL.ladle);
        g.rect(x - 1, y - 1, 1, 1).fill(PAL.ladleHi);
        // Countdown pips above (one per second left, max 8).
        const pips = Math.ceil(left);
        for (let i = 0; i < Math.min(8, pips); i++) g.rect(x - 4 + i, y - 5, 1, 1).fill(left < 1 && pulse ? PAL.ink : PAL.ladleHi);
        if (frac < 0.25 && pulse) g.rect(x - 1, y - 1, 3, 3).fill(PAL.ladleHi);
      }
      if (p.flash > 0) {
        p.flash = Math.max(0, p.flash - dt * 12);
        f.rect(x - 1, y - 1, 3, 3).fill(0xffffff);
      }
    }
    for (const gp of board.gold) {
      const x = Math.round(bx + gp.x);
      const y = Math.round(this.pegTop + gp.y);
      const hit = gp.flash > 0;
      gp.flash = Math.max(0, gp.flash - dt * 6);
      if (gp.boostUntil > t) g.rect(x - 4, y - 4, 9, 9).fill({ color: PEG_PAL.boom, alpha: pulse ? 0.55 : 0.3 });
      g.rect(x - 1, y - 3, 3, 7).fill(PAL.ink);
      g.rect(x - 3, y - 1, 7, 3).fill(PAL.ink);
      g.rect(x - 2, y - 2, 5, 5).fill(PAL.ink);
      g.rect(x, y - 2, 1, 5).fill(hit ? 0xffffff : PAL.gold);
      g.rect(x - 2, y, 5, 1).fill(hit ? 0xffffff : PAL.gold);
      g.rect(x - 1, y - 1, 3, 3).fill(hit ? 0xffffff : PAL.gold);
      g.rect(x - 1, y - 1, 1, 1).fill(PAL.goldHi);
    }

    // Bucket flashes, Pumpkin Hex glow, Bucket Shift selection.
    for (let k = 0; k < BUCKETS; k++) {
      const x = bx + k * COL_W;
      if (this.core.hexUntil[k] > t) g.rect(x + 1, this.landY, COL_W - 2, BUCKET_H - 1).fill({ color: 0xf07a20, alpha: pulse ? 0.5 : 0.3 });
      if (this.bucketFlash[k] > 0) g.rect(x + 1, this.landY, COL_W - 2, BUCKET_H - 1).fill({ color: 0xffffff, alpha: this.bucketFlash[k] * 0.45 });
    }
    if (this.selK >= 0) {
      const x = bx + this.selK * COL_W;
      f.rect(x, this.landY - 1, COL_W, 1).rect(x, this.landY + BUCKET_H - 1, COL_W, 1).rect(x, this.landY - 1, 1, BUCKET_H).rect(x + COL_W - 1, this.landY - 1, 1, BUCKET_H).fill(C.gold);
      // Arrows on the neighbours it can swap with.
      for (const nk of [this.selK - 1, this.selK + 1]) {
        if (nk < 0 || nk >= BUCKETS || !pulse) continue;
        const ax = bx + nk * COL_W + 7;
        const dir = nk < this.selK ? -1 : 1;
        f.rect(ax + (dir < 0 ? 0 : 2), this.landY - 5, 2, 3).fill(C.gold);
        f.rect(ax + (dir < 0 ? 2 : 0), this.landY - 4, 2, 1).fill(C.gold);
      }
    }
    // Scrying Ladle: the buckets glow by landing odds for the held chute.
    if (this.scryK >= 0) {
      const st = chuteStats(boardConfig(this.run), this.scryK);
      const top = Math.max(1e-6, ...st.dist);
      for (let k = 0; k < BUCKETS; k++) {
        const p = st.dist[k] / top;
        if (p < 0.02) continue;
        const hh = Math.max(1, Math.round((BUCKET_H - 2) * p));
        g.rect(bx + k * COL_W + 2, this.landY + BUCKET_H - 1 - hh, COL_W - 4, hh).fill({ color: PAL.goldHi, alpha: 0.35 + 0.45 * p });
      }
      g.rect(bx + this.scryK * COL_W + COL_W / 2, this.boardTop, 1, BOARD_H).fill({ color: PAL.goldHi, alpha: 0.25 });
    }

    // Pot well: bubbling bile, faster when brewing more.
    const wx = bx + MAL_W + 3;
    const ww = BOARD_W - MAL_W - TICKET_W - 6;
    const rate = Math.min(12, 1 + Math.log10(1 + this.brewRate) * 2);
    if (Math.random() < rate * dt && this.bubbles.length < 14) {
      this.bubbles.push({ x: wx + 3 + Math.random() * (ww - 6), y: this.potY + POT_H - 4, r: 1 + Math.floor(Math.random() * 2), life: 0.6 + Math.random() * 0.6 });
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= dt;
      b.y -= 14 * dt;
      if (b.life <= 0 || b.y < this.potY + 3) {
        this.bubbles.splice(i, 1);
        continue;
      }
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      g.rect(x - b.r, y - b.r, b.r * 2 + 1, b.r * 2 + 1).fill(PAL.bile);
      g.rect(x - b.r, y - b.r, 1, 1).fill(PAL.bileHi);
    }
    // Spoon backdrop + Ladle charges as little ladle icons (up to 9 with Ladle Sigils).
    g.rect(wx + 3, this.potY + 5, 11, 11).fill({ color: 0x000000, alpha: 0.35 });
    const maxC = this.core.maxCharges;
    const step = Math.max(5, Math.min(7, Math.floor((ww - 6) / Math.max(1, maxC))));
    const ly = this.potY + 21;
    for (let i = 0; i < maxC; i++) {
      const x = wx + 3 + i * step;
      const full = i < this.core.charges;
      const col = full ? PAL.ladleHi : 0x3a5a1a;
      g.rect(x, ly, 4, 3).fill(PAL.ink);
      g.rect(x + 1, ly, 2, 2).fill(col);
      g.rect(x + 4, ly - 2, 1, 3).fill(full ? PAL.ironHi : PAL.ironLo);
      if (!full && i === this.core.charges) {
        const fr = this.core.chargeT / CHARGE_S;
        g.rect(x, ly + 4, Math.round(5 * fr), 1).fill(PAL.ladle);
      }
    }

    // Toss cooldown bar across the chute keys, and chute mouth flashes.
    const cd = this.core.tossT / this.core.tossCooldown;
    if (cd > 0) g.rect(bx, this.chuteY - 2, Math.round(BOARD_W * (1 - cd)), 1).fill(PAL.ladle);
    else g.rect(bx, this.chuteY - 2, BOARD_W, 1).fill(PAL.bileHi);
    for (let k = 0; k < BUCKETS; k++) {
      if (this.chuteFlash[k] <= 0) continue;
      g.rect(bx + k * COL_W + 5, this.railY + RAIL_H - 4, 8, 4).fill({ color: PAL.goldHi, alpha: this.chuteFlash[k] });
      g.rect(bx + k * COL_W + 1, this.chuteY - 1, COL_W - 3, 1).fill({ color: PAL.goldHi, alpha: this.chuteFlash[k] });
    }

    // Ticket pulse outline, and the zone pips of a double order.
    const tx = bx + BOARD_W - TICKET_W;
    if (this.ticketPulse > 0) {
      f.rect(tx - 1, this.potY - 1, TICKET_W + 2, 1).fill(PAL.goldHi);
      f.rect(tx - 1, this.potY + POT_H, TICKET_W + 2, 1).fill(PAL.goldHi);
      f.rect(tx - 1, this.potY - 1, 1, POT_H + 2).fill(PAL.goldHi);
      f.rect(tx + TICKET_W, this.potY - 1, 1, POT_H + 2).fill(PAL.goldHi);
    }
    const tks = this.core.tickets();
    if (tks.length > 1) {
      tks.forEach((tk, i) => {
        const y = this.potY + 3 + i * 10;
        g.rect(tx + 3, y, 3, 7).fill(tk.sock ? 0xffffff : BUCKET_COL[4 - tk.zone]);
      });
      g.rect(tx + 3, this.potY + 12, TICKET_W - 6, 1).fill(0xc8b890);
    }

    // Particles.
    for (const p of this.particles) f.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill(p.color);
  }

  private drawBalls(): void {
    const balls = this.core.board.balls;
    const renderer = this.ctx.game.app.renderer;
    let i = 0;
    for (const b of balls) {
      if (!b.alive || i >= this.pool.length) continue;
      const s = this.pool[i++];
      const tex = ingTexture(renderer, b.ing);
      if (s.texture !== tex) s.texture = tex;
      s.position.set(Math.round(this.bx + b.x) - 3, Math.round(this.pegTop + b.y) - 3);
      s.visible = true;
      s.tint = b.ladled ? 0xd8ffb0 : b.rune ? 0xe8c8ff : 0xffffff;
      s.alpha = b.hopper ? 0.85 : 1;
      s.scale.set(b.scale < 1 ? 0.72 : 1);
    }
    for (; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private updatePotUi(): void {
    const run = this.run;
    const renderer = this.ctx.game.app.renderer;
    this.maliceText.set(`${run.malice} OF ${run.maliceBought}`);
    this.malDown.setEnabled(run.malice > 0);
    this.malUp.setEnabled(run.malice < run.maliceBought || run.maliceBought < MALICE_MAX);
    const now = this.spoonNow;
    const nt = ingTexture(renderer, run.spoon[0]);
    if (now.texture !== nt) now.texture = nt;
    const xt = ingTexture(renderer, run.spoon[1]);
    if (this.spoonNext.texture !== xt) this.spoonNext.texture = xt;
    this.spoonNext.alpha = 0.7;

    // Ticket(s).
    const tks = this.core.tickets();
    const ready = Date.now() >= run.rerollAt;
    const wait = Math.ceil((run.rerollAt - Date.now()) / 1000);
    const key = `${tks.map((tk) => `${tk.zone}${tk.sock ? 's' : ''}|${tk.items.map((i) => `${i.ing}${i.got}/${i.n}`).join(',')}`).join(';')}|${ready ? 'r' : wait}|${run.malice}|${this.stateKey}`;
    if (key === this.lastTicketKey) return;
    this.lastTicketKey = key;
    const tx = this.bx + BOARD_W - TICKET_W;
    const tm = tierMults(run);
    const slots = this.ticketItems;
    for (const s of slots) {
      s.icon.visible = false;
      s.text.visible = false;
    }
    const place = (tk: Ticket, base: number, x0: number, y: number) => {
      tk.items.slice(0, 2).forEach((it, i) => {
        const slot = slots[base + i];
        slot.icon.texture = ingTexture(renderer, it.ing);
        slot.icon.visible = true;
        slot.icon.position.set(x0 + i * 24, y - 1);
        const done = it.got >= it.n;
        slot.text.set(`${it.got}/${it.n}`, done ? '#3a7a28' : '#2a1a3a');
        slot.text.visible = true;
        slot.text.position.set(x0 + 9 + i * 24, y);
      });
    };
    if (tks.length > 1) {
      this.ticketHead.visible = false;
      tks.forEach((tk, i) => place(tk, i * 2, tx + 9, this.potY + 4 + i * 10));
      this.ticketFoot.position.set(tx + 4, this.potY + 23);
    } else if (tks[0]) {
      const tk = tks[0];
      const zoneLabel = tk.zone === 0 ? 'JACKPOT' : `${fmtMult(tm[4 - tk.zone])}+`;
      this.ticketHead.visible = true;
      this.ticketHead.set(tk.sock ? `SOCK! ${zoneLabel}` : `ORDER ${zoneLabel}`, tk.sock ? '#2a6a9a' : '#7a2a2a');
      this.ticketHead.position.set(tx + 4, this.potY + 4);
      place(tk, 0, tx + 4, this.potY + 13);
      this.ticketFoot.position.set(tx + 4, this.potY + 22);
    }
    this.ticketFoot.set(ready ? 'TAP: NEW' : `NEW IN ${wait}S`, ready ? '#7a5a2a' : '#a08a6a');
    if (measure(this.ticketFoot.text).w > TICKET_W - 8) this.ticketFoot.set(`${wait}S`);
  }

  destroy(): void {
    // A ritual still waiting resolves with nothing (never required).
    this.endHopper(0);
    destroyTree(this.root);
  }
}
