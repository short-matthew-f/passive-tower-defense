// The Spire scene: the flask on its brazier, the dropper and preview queue, the Volatility knob
// and the Head Sorcerer in the left gutter, the Apprentice Flask in the right gutter.
// Rendering: a few reusable Graphics redrawn per frame plus pooled orb Sprites; every PixelText
// is created once and updated with .set().
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, Rect, SayOpts, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { sfx as kit } from '../../core/audio';
import { PixelText } from '../../ui/font';
import { Button, C, drawSprite } from '../../ui/widgets';
import { ICON_PAL, ICON_QUICK, ICON_TREMOR, ICON_VENT, ORB_COL, orbColor, orbLight, orbTexture, PAL, SORC_IDLE_FRAME, SORC_PAL, type SorcMood } from './art';
import {
  apprenticeDropsPerMin,
  apprentices,
  arcanaMult,
  CATALYST,
  distillCeiling,
  FLASK_H,
  heldVol,
  HEX,
  idleRateOf,
  lvOf,
  MAX_TIER,
  orbR,
  QUICK,
  QUICK_CD,
  studyMultOf,
  TIERS,
  TREMOR_CD,
  VENT_NOW_CD,
  tomeOf,
  UPGRADES,
  upCost,
  upLocked,
  VOL_MAX,
  volCost,
  type SpirePersistent,
  type SpireRun,
  type UpDef,
} from './def';
import { MAX_ORBS, SpireCore } from './logic';
import type { MergeEvent, Orb } from './physics';
import { sfx } from './sfx';
import { ToolBtn } from './toolbtn';
import { destroyTree } from '../../ui/destroy';

const BAR_H = 16;
const BRAZIER_H = 7;
const WALL = 2;
const DROP_ZONE = 24;
const QUEUE_H = 11;
const MAX_PARTICLES = 160;
const MAX_RINGS = 12;
const MAX_FLYERS = 24;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
  size: number;
  grav: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  life: number;
  color: number;
}

interface Flyer {
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface ApprDrop {
  x: number;
  y: number;
  vy: number;
  tier: number;
}

/** Points on a pixel circle outline (cached per radius). */
const ringCache = new Map<number, [number, number][]>();
function ringPts(r: number): [number, number][] {
  let pts = ringCache.get(r);
  if (!pts) {
    pts = [];
    const seen = new Set<string>();
    const n = Math.max(8, Math.ceil(r * 6.3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      const k = `${x},${y}`;
      if (!seen.has(k)) {
        seen.add(k);
        pts.push([x, y]);
      }
    }
    if (ringCache.size < 64) ringCache.set(r, pts);
  }
  return pts;
}

export class SpireScene implements DeptScene {
  root = new Container();
  private ctx: DeptCtx;
  private run: SpireRun;
  private per: SpirePersistent;
  private core: SpireCore;

  private bgG = new Graphics();
  private dynG = new Graphics();
  private orbLayer = new Container();
  private fxG = new Graphics();
  private pool: Sprite[] = [];
  private flyPool: Sprite[] = [];
  private held = new Sprite();

  private nextText = new PixelText('NEXT', '#9c8aa8');
  private resText = new PixelText('', '#c070ff');
  private chainText = new PixelText('', '#fff2a0');
  private volLabel = new PixelText('VOL', '#e05050');
  private volOf = new PixelText('', '#9c8aa8');
  private featText = new PixelText('', '#9c8aa8');
  private apprText = new PixelText('', '#9c8aa8');
  private ceilText = new PixelText('', '#9c8aa8');
  private zzz = new PixelText('Z', '#9c8aa8');
  private pagesText = new PixelText('', '#e8c04a');
  private warnText = new PixelText('BRIM!', '#e05050');
  /** Flask score line above the dropper ("FLASK 4.2K  BEST 6.0K") and the vent tally. */
  private scoreText = new PixelText('', '#c8b8d8');
  private tallyText = new PixelText('', '#fff2a0');
  private tallySub = new PixelText('', '#e8c04a');
  private studyText = new PixelText('', '#e8c04a');
  private upBtn!: Button;
  private volUp!: Button;
  private volDown!: Button;
  private ventBtn: ToolBtn;
  private tremorBtn: ToolBtn;
  private quickBtn: ToolBtn;
  private aimHit = new Container();

  // Layout (stage px).
  private cx = 0; // flask center line
  private mouthY = 0; // interior top
  private botY = 0; // interior bottom
  private queueY = 0;
  /** Short screens: the preview queue and Resonance sit in the right gutter, clear of the manager
   * strip (04 §18 dock: the strip ends above the dropper and the preview). */
  private queueSide = false;
  private barY = 0;
  private lgX = 0; // left gutter
  private lgW = 0;
  private rgX = 0; // right gutter
  private rgW = 0;
  private apW = 0;
  private apH = 0;
  private apX = 0;
  private apY = 0;
  private flaskWDrawn = 0;

  // Input.
  private aiming = false;
  private pending = false;
  private pointerId = -1;
  private downY = 0;
  private downT = 0;

  // Return ritual (04 §13): the apprentices' sealed gift orb.
  private ritual: { tier: number; resolve: (score: number) => void; t: number; orbId: number; dropped: boolean } | null = null;
  private seenCatalyst = false;
  private seenHex = false;

  // Juice.
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private flyers: Flyer[] = [];
  private apprDrops: ApprDrop[] = [];
  private apprBubbles: { x: number; y: number; t: number; c: number }[] = [];
  private apprT = 0;
  private apprTurn = 0;
  private apprToss: number[] = [0, 0, 0, 0];
  private idleAcc = 0;
  private idleT = 0;
  private time = 0;
  private shake = 0;
  private freeze = 0;
  private whiteout = 0;
  private chainShow = 0;
  private resPulse = 0;
  private floatBudget = 5;
  private heartT = 0;
  private ventPuff = 0;
  private sorcMood: SorcMood = 'calm';
  private moodT = 0;
  private persistT = 0;
  private checkT = 0;
  private stateKey = '';
  private sayCooldown = 0;
  private recentVents: number[] = [];
  /** The vent tally (R1 groundwork): the finished flask's score counts up, then NEW BEST or the gap. */
  private tally: { score: number; prev: number; t: number; ticks: number; done: boolean } | null = null;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.run = ctx.save.run as SpireRun;
    this.per = ctx.save.persistent as SpirePersistent;
    this.core = new SpireCore(this.run, this.per, {
      earn: (b) => ctx.earn(b),
      raiseSkill: (l) => ctx.raiseSkill(l),
      merge: (e, amount, depth, res) => this.onMerge(e, amount, depth, res),
      singularity: (x, y, amount) => this.onSingularity(x, y, amount),
      vent: (out, refund, manual) => this.onVent(out, refund, manual),
      drop: (o) => this.onDrop(o),
      newTier: (t) => this.onNewTier(t),
      page: (n, why) => this.onPage(n, why),
      shatter: (stones, amount) => this.onShatter(stones, amount),
      devour: (v, o, amount) => this.onDevour(v, o, amount),
      fizz: (o) => this.onFizz(o),
      tremor: () => this.onTremor(),
      flaskEnd: (score, prev) => this.onFlaskEnd(score, prev),
      rescue: (kind) => this.onRescue(kind),
      volApplied: (v) => this.ctx.float(`VOLATILITY ${v}`, this.cx, this.mouthY + 16, '#e05050'),
      imports: ctx.save.imports,
    });
    // Hold the skill gate after a reload.
    ctx.raiseSkill(this.run.featBest);

    this.root.addChild(this.bgG, this.dynG, this.orbLayer, this.fxG);
    for (let i = 0; i < MAX_ORBS + 2; i++) {
      const s = new Sprite(orbTexture(1));
      s.visible = false;
      s.roundPixels = true;
      this.pool.push(s);
      this.orbLayer.addChild(s);
    }
    for (let i = 0; i < MAX_FLYERS; i++) {
      const s = new Sprite(orbTexture(1));
      s.visible = false;
      s.roundPixels = true;
      this.flyPool.push(s);
      this.orbLayer.addChild(s);
    }
    this.held.roundPixels = true;
    this.orbLayer.addChild(this.held);
    this.root.addChild(
      this.nextText,
      this.resText,
      this.volLabel,
      this.volOf,
      this.featText,
      this.apprText,
      this.ceilText,
      this.zzz,
      this.pagesText,
      this.warnText,
      this.chainText,
      this.scoreText,
      this.studyText,
      this.tallyText,
      this.tallySub,
    );

    // Aim: drag anywhere in the flask column; release drops.
    this.aimHit.eventMode = 'static';
    this.aimHit.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.aimHit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.aimHit.on('pointerup', (e: FederatedPointerEvent) => this.onUp(e));
    this.aimHit.on('pointerupoutside', (e: FederatedPointerEvent) => this.onUp(e));
    this.root.addChild(this.aimHit);

    this.upBtn = new Button({ w: 70, h: BAR_H - 1, label: 'UPGRADES', color: C.gold, shade: 0x9a7a20, onTap: () => this.openUpgrades() });
    this.volUp = new Button({ w: 16, h: 13, label: '+', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.stepVol(1) });
    this.volDown = new Button({ w: 16, h: 13, label: '-', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.stepVol(-1) });
    this.ventBtn = new ToolBtn('VENT', ICON_VENT, ICON_PAL, () => this.useVentNow());
    this.tremorBtn = new ToolBtn('SHAKE', ICON_TREMOR, ICON_PAL, () => this.useTremor());
    this.quickBtn = new ToolBtn('QS', ICON_QUICK, ICON_PAL, () => this.useQuick());
    this.root.addChild(this.upBtn, this.volUp, this.volDown, this.ventBtn, this.tremorBtn, this.quickBtn);
    this.seenCatalyst = !!ctx.save.seen['ls.catalyst'];
    this.seenHex = !!ctx.save.seen['ls.hex'];
    this.resize(ctx.layout);
  }

  private vol(): number {
    return this.ctx.game.save.meta.settings.sfx ?? 0.6;
  }

  // ---------- layout ----------

  resize(_layout: Layout): void {
    const c = this.ctx.content();
    const W = this.core.flask.w;
    this.cx = c.x + Math.floor(c.w / 2);
    this.barY = c.y + c.h - BAR_H - 1;
    this.botY = this.barY - 2 - BRAZIER_H - WALL;
    this.mouthY = this.botY - FLASK_H;
    this.queueY = Math.max(c.y + 1, this.mouthY - DROP_ZONE - QUEUE_H);
    // The manager strip covers c.y .. c.y + ~34 (portrait 24 + margins): keep the preview out of it.
    this.queueSide = this.queueY < c.y + 34;
    const left = this.cx - W / 2 - WALL;
    const right = this.cx + W / 2 + WALL;
    this.lgX = c.x + 2;
    this.lgW = Math.max(14, left - 2 - this.lgX);
    this.rgX = right + 2;
    this.rgW = Math.max(14, c.x + c.w - 2 - this.rgX);
    this.apW = Math.max(12, Math.min(24, this.rgW - 2));
    this.apH = Math.min(120, FLASK_H - 40);
    this.apX = this.rgX + Math.floor((this.rgW - this.apW) / 2);
    this.apY = this.botY - this.apH;

    this.aimHit.hitArea = new Rectangle(left - 3, this.queueY, W + 2 * WALL + 6, this.botY - this.queueY + 2);
    const bw = Math.min(16, this.lgW);
    this.volUp.position.set(this.lgX + Math.floor((this.lgW - bw) / 2), this.mouthY + 10);
    this.volDown.position.set(this.lgX + Math.floor((this.lgW - bw) / 2), this.mouthY + 48);
    this.upBtn.position.set(c.x + 3, this.barY);
    if (this.queueSide) this.nextText.position.set(this.rgX + Math.floor((this.rgW - this.nextText.width) / 2), this.mouthY + 2);
    else this.nextText.position.set(left, this.queueY + 2);
    this.nextText.visible = !this.queueSide || this.rgW >= 16;
    this.volLabel.position.set(this.lgX + Math.floor((this.lgW - 11) / 2), this.mouthY + 2);
    this.warnText.position.set(this.cx - 9, this.mouthY + 3);
    this.chainText.position.set(this.cx, this.mouthY + 30);
    // Tools in the left gutter under the knob (04 §10: Vent Now there; Tremor and Quicksilver
    // join it), stacked down towards the Head Sorcerer.
    let ty = this.mouthY + 92;
    for (const b of [this.ventBtn, this.tremorBtn, this.quickBtn]) {
      b.fit(this.lgW);
      b.position.set(this.lgX + Math.floor((this.lgW - b.bw) / 2), ty);
      ty += b.bh + 4;
    }
    this.flaskWDrawn = W;
    this.drawStatic();
  }

  private drawStatic(): void {
    const g = this.bgG.clear();
    const L = this.ctx.layout;
    const c = this.ctx.content();
    g.rect(0, 0, L.w, L.h).fill(PAL.bg);
    // Lab wall bricks.
    for (let y = c.y; y < this.barY - 2; y += 8) {
      const off = ((y - c.y) / 8) % 2 ? 6 : 0;
      for (let x = c.x - 12 + off; x < c.x + c.w; x += 12) g.rect(x, y, 11, 7).fill(PAL.brick);
    }
    const W = this.core.flask.w;
    const left = this.cx - W / 2;
    // Flask: dark interior, glass walls with a highlight, a lip at the mouth.
    g.rect(left, this.mouthY, W, FLASK_H).fill(PAL.glassIn);
    g.rect(left - WALL, this.mouthY - 2, WALL, FLASK_H + 2 + WALL).fill(PAL.glass);
    g.rect(left + W, this.mouthY - 2, WALL, FLASK_H + 2 + WALL).fill(PAL.glass);
    g.rect(left - WALL, this.botY, W + 2 * WALL, WALL).fill(PAL.glass);
    g.rect(left - WALL - 1, this.mouthY - 3, 1, FLASK_H + 4 + WALL).fill(PAL.ink);
    g.rect(left + W + WALL, this.mouthY - 3, 1, FLASK_H + 4 + WALL).fill(PAL.ink);
    g.rect(left - WALL - 1, this.botY + WALL, W + 2 * WALL + 2, 1).fill(PAL.ink);
    g.rect(left - 1, this.mouthY, 1, FLASK_H).fill(PAL.glassLo);
    g.rect(left + W, this.mouthY, 1, FLASK_H).fill(PAL.glassLo);
    // Lips.
    g.rect(left - WALL - 2, this.mouthY - 4, WALL + 3, 2).fill(PAL.glass);
    g.rect(left + W - 1, this.mouthY - 4, WALL + 3, 2).fill(PAL.glass);
    // Glass glints.
    g.rect(left + 3, this.mouthY + 10, 1, 30).fill({ color: 0xffffff, alpha: 0.12 });
    g.rect(left + 5, this.mouthY + 14, 1, 10).fill({ color: 0xffffff, alpha: 0.08 });
    // Measurement ticks on the right wall.
    for (let y = this.botY - 20; y > this.mouthY + 10; y -= 20) g.rect(left + W - 4, y, 3, 1).fill({ color: PAL.glass, alpha: 0.25 });
    // Brazier.
    const by = this.botY + WALL + 1;
    g.rect(left - 4, by, W + 8, BRAZIER_H).fill(PAL.brassLo);
    g.rect(left - 4, by, W + 8, 2).fill(PAL.brass);
    g.rect(left - 4, by, W + 8, 1).fill(PAL.brassHi);
    g.rect(left + 6, by + BRAZIER_H, 4, 2).fill(PAL.brassLo);
    g.rect(left + W - 10, by + BRAZIER_H, 4, 2).fill(PAL.brassLo);
    // Dropper rail across the mouth.
    const ry = this.mouthY - DROP_ZONE + 1;
    g.rect(left - 4, ry, W + 8, 2).fill(PAL.brass);
    g.rect(left - 4, ry, W + 8, 1).fill(PAL.brassHi);
    g.rect(left - 4, ry + 2, W + 8, 1).fill(PAL.ink);
    // Left gutter shelf panel for the knob.
    const kx = this.lgX;
    g.rect(kx, this.mouthY, this.lgW, 66).fill(0x1a1028);
    g.rect(kx, this.mouthY, this.lgW, 1).fill(0x3a2850);
    // Apprentice flask: outline, neck and a tiny ladder.
    const ax = this.apX;
    const ay = this.apY;
    g.rect(ax, ay, this.apW, this.apH).fill(PAL.glassIn);
    g.rect(ax - 1, ay - 2, 1, this.apH + 3).fill(PAL.glass);
    g.rect(ax + this.apW, ay - 2, 1, this.apH + 3).fill(PAL.glass);
    g.rect(ax - 1, ay + this.apH, this.apW + 2, 1).fill(PAL.glass);
    g.rect(ax - 2, ay - 3, 3, 1).fill(PAL.glass);
    g.rect(ax + this.apW - 1, ay - 3, 3, 1).fill(PAL.glass);
    g.rect(ax - 2, ay + this.apH + 1, this.apW + 4, 3).fill(PAL.brassLo);
    g.rect(ax - 2, ay + this.apH + 1, this.apW + 4, 1).fill(PAL.brass);
    // Pages icon in the bottom bar.
    const px = c.x + c.w - 8;
    g.rect(px - 1, this.barY + 3, 7, 9).fill(PAL.ink);
    g.rect(px, this.barY + 4, 5, 7).fill(0xe8dcb0);
    g.rect(px + 1, this.barY + 6, 3, 1).fill(0x8a6a3a);
    g.rect(px + 1, this.barY + 8, 3, 1).fill(0x8a6a3a);
  }

  // ---------- upgrades ----------

  private entry(u: UpDef): UpgradeEntry {
    const run = this.run;
    const per = this.per;
    const level = () => (u.pages ? tomeOf(per, u.id) : lvOf(run, u.id));
    return {
      id: u.id,
      name: u.name,
      desc: () => u.desc(level()),
      level,
      max: u.max,
      cost: () => upCost(u, level()),
      currency: u.pages ? 'Pages' : undefined,
      locked: () => upLocked(u, this.ctx.save.cycle.n),
      canAfford: () => (u.pages ? per.pages >= upCost(u, level()) : run.bank >= upCost(u, level())),
      buy: () => {
        const l = level();
        if (l >= u.max) return;
        const cost = upCost(u, l);
        if (u.pages) {
          if (per.pages < cost) return;
          per.pages -= cost;
          per.tomes[u.id] = l + 1;
        } else {
          if (!this.ctx.spend(cost)) return;
          run.lv[u.id] = l + 1;
        }
        this.afterBuy(u.id);
      },
    };
  }

  private volEntry(): UpgradeEntry {
    const run = this.run;
    return {
      id: 'volatility',
      name: 'Volatility',
      desc: () => {
        const n = run.volBought + 1;
        return n > VOL_MAX ? 'The dial is maxed' : `Unlock V${n}: Arcana x${arcanaMult(n).toFixed(2)}, hexes ${n * 3}%`;
      },
      level: () => run.volBought,
      max: VOL_MAX,
      cost: () => volCost(run.volBought),
      canAfford: () => run.bank >= volCost(run.volBought),
      buy: () => {
        if (run.volBought >= VOL_MAX) return;
        if (!this.ctx.spend(volCost(run.volBought))) return;
        const before = run.volBought;
        run.volBought++;
        // The knob follows a new level only when it already sat at the old top (the first level is
        // turned by hand: the Volatility lesson).
        if (before > 0 && this.core.volTarget === before) this.core.setVol(run.volBought);
        this.afterBuy('volatility');
      },
    };
  }

  private groups(): UpgradeGroup[] {
    const by = (b: string) => UPGRADES.filter((u) => u.branch === b).map((u) => this.entry(u));
    const pagesLine = () => ({ text: `${formatNum(this.per.pages)} GRIMOIRE PAGES`, color: '#e8c04a' });
    return [
      { name: 'Alchemy', entries: by('alchemy') },
      { name: 'Apparatus', entries: [this.volEntry(), ...by('apparatus')] },
      { name: 'Apprent', entries: by('apprentices') },
      { name: 'Tomes', entries: by('tomes'), bank: pagesLine },
    ];
  }

  private openUpgrades(): void {
    this.aiming = false;
    this.pending = false;
    if (this.per.pages > 0 || this.per.pagesEver > 0) this.ctx.save.seen['sp.sheetPages'] = 1;
    this.ctx.openUpgrades(this.groups());
  }

  /** A manager line plus the in-scene sprite's matching expression (04 §18). */
  private say(key: string, opts: SayOpts, mood?: SorcMood, t = 3): void {
    // The strip portrait wears the same expression (ManagerDef.expressions, sorcerer.ts).
    this.ctx.say(key, mood && mood !== 'calm' ? { ...opts, expression: mood } : opts);
    if (mood) this.mood(mood, t);
  }

  private afterBuy(id: string): void {
    this.ctx.saveSoon();
    this.syncState();
    if (id === 'hire') {
      this.say('firstHelper', { type: 'first_helper' }, 'lecture');
      this.ctx.lesson('apprentices');
    }
    if (id === 'tremor' || id === 'quick' || id === 'settle') this.ctx.say(id, { type: 'mechanic_unlocked' });
    if (id === 'volatility') {
      const b = this.run.volBought;
      const best = this.ctx.save.lifetime.best.spireVol ?? 0;
      if (b === 1) this.ctx.say('volatility', { type: 'mechanic_unlocked' });
      else if (b % 3 === 0 || b > best) this.say('dialRaised', { type: 'dial_raised', key: `vol${b}` }, 'calm');
      this.ctx.save.lifetime.best.spireVol = Math.max(best, b);
    }
  }

  /** Re-read upgrade state: rebuild geometry when the flask or brim changed. */
  private syncState(): void {
    const key = `${this.run.vol}`;
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.core.refresh();
    if (this.core.flask.w !== this.flaskWDrawn) this.resize(this.ctx.layout);
  }

  private stepVol(d: number): void {
    const run = this.run;
    const want = this.core.volTarget + d;
    if (want < 0) return;
    if (want > run.volBought) {
      const msg = run.volBought >= VOL_MAX ? 'MAXED' : `V${run.volBought + 1}: ${formatNum(volCost(run.volBought))} IN UPGRADES`;
      this.ctx.float(msg, this.cx, this.mouthY + 16, '#e05050');
      sfx.deny(this.vol());
      return;
    }
    if (this.core.setVol(want)) {
      this.ctx.saveSoon();
      if (run.volPending >= 0) this.ctx.float(`V${run.volPending} IN 30S OR NEXT VENT`, this.cx, this.mouthY + 16, '#e8c04a');
      else this.ctx.float(`VOLATILITY ${run.vol}`, this.cx, this.mouthY + 16, '#e05050');
      this.syncState();
    }
  }

  // ---------- input ----------

  private localX(e: FederatedPointerEvent): number {
    return e.getLocalPosition(this.root).x - this.cx;
  }

  private onDown(e: FederatedPointerEvent): void {
    this.core.noteInput();
    this.aiming = true;
    this.pointerId = e.pointerId;
    this.downY = e.getLocalPosition(this.root).y;
    this.downT = this.time;
    this.core.aimX = this.core.clampAim(this.localX(e));
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.aiming || e.pointerId !== this.pointerId) return;
    this.core.aimX = this.core.clampAim(this.localX(e));
  }

  private onUp(e: FederatedPointerEvent): void {
    if (!this.aiming || e.pointerId !== this.pointerId) return;
    this.aiming = false;
    // A quick upward flick is the Overlord's Tremor (04 §11), not a drop.
    const dy = this.downY - e.getLocalPosition(this.root).y;
    if (this.core.hasTremor && dy > 22 && this.time - this.downT < 0.35) {
      this.useTremor();
      return;
    }
    this.core.aimX = this.core.clampAim(this.localX(e));
    if (this.core.canDrop()) this.doDrop();
    else this.pending = true; // drops as soon as the valve is ready
  }

  private doDrop(): void {
    this.pending = false;
    const o = this.core.drop();
    if (!o) {
      if (this.core.flask.count >= MAX_ORBS) this.ctx.float('FLASK FULL', this.cx, this.mouthY + 16, '#e05050');
      return;
    }
    this.ctx.haptic(5);
  }

  private onDrop(o: Orb): void {
    sfx.drop(this.vol());
    const r = this.ritual;
    if (r && !r.dropped && o.tier === r.tier) {
      r.dropped = true;
      r.orbId = o.id;
      r.t = 0;
      o.sealed = true;
    }
  }

  // ---------- tools ----------

  private useTremor(): void {
    if (!this.core.tremor()) {
      if (this.core.hasTremor) sfx.deny(this.vol());
      return;
    }
    this.ctx.saveSoon();
  }

  private useQuick(): void {
    if (!this.core.quick()) {
      sfx.deny(this.vol());
      return;
    }
    this.ctx.float('QUICKSILVER!', this.cx, this.mouthY + 16, '#c8d0dc');
    sfx.page(this.vol());
  }

  private useVentNow(): void {
    if (this.core.ventable() === 0 && this.core.ventNowCool <= 0) {
      this.ctx.float('NOTHING TO VENT', this.cx, this.mouthY + 16, '#a8f0b0');
      sfx.deny(this.vol());
      return;
    }
    if (!this.core.ventNow()) sfx.deny(this.vol());
  }

  // ---------- sim hooks (juice) ----------

  private sx(x: number): number {
    return this.cx + x;
  }

  private sy(y: number): number {
    return this.mouthY + y;
  }

  private onMerge(e: MergeEvent, amount: number, depth: number, res: number): void {
    const t = e.into ? e.into.tier : 12;
    if (this.ritual?.dropped && (e.a.sealed || e.b.sealed)) this.endRitual(1);
    if (e.catalyst) this.ctx.float('CATALYZED!', this.sx(e.x), this.sy(e.y) - orbR(t) - 14, '#f0f0ff');
    const x = this.sx(e.x);
    const y = this.sy(e.y);
    const r = TIERS[Math.min(MAX_TIER, t)].r;
    this.addRing(x, y, r + 2, r + 8 + t, orbLight(t));
    const n = Math.min(20, 6 + t * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 25 + Math.random() * (20 + t * 6);
      this.addParticle(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.25, i % 3 ? orbColor(t) : orbLight(t), 1, 60);
    }
    if (this.floatBudget >= 1 || t >= 6) {
      this.floatBudget -= 1;
      // Shared juice kit: the pop's size follows the amount (relative to ~5 s of idle).
      this.ctx.game.juice.popValue(amount, x, y - r - 8, { color: t >= 6 ? undefined : ORB_COL[t][1] });
    }
    if (depth >= 2) {
      // R5: geometric chains, shown Balatro-style (the multiplier punches up each step).
      this.chainText.set(`CHAIN ${depth}  X${Math.round(res)}`, depth >= 4 ? '#fff2a0' : '#c070ff');
      this.chainText.scale.set(res >= 4 ? 2 : 1);
      this.chainShow = 1.4;
      this.resPulse = 1;
      if (depth === 4 && this.sayCooldown <= 0) {
        this.say('bigChain', {}, 'happy');
        this.sayCooldown = 8;
      }
    }
    sfx.bloop(this.vol(), t, depth - 1);
    if (t >= 5) this.ctx.haptic(10);
    if (t >= 10) {
      this.ctx.game.juice.shake(2);
      this.ctx.game.juice.hitStop(50);
    } else if (t >= 8) this.ctx.game.juice.shake(1);
  }

  private onSingularity(x: number, y: number, amount: number): void {
    const X = this.sx(x);
    const Y = this.sy(y);
    this.whiteout = 0.35;
    this.ctx.game.juice.shake(3);
    this.ctx.game.juice.hitStop(100);
    for (let i = 0; i < 3; i++) this.addRing(X, Y, 4 + i * 8, 70 + i * 10, i % 2 ? 0xffffff : PAL.rune);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 30;
      this.addParticle(X + Math.cos(a) * d, Y + Math.sin(a) * d, -Math.cos(a) * 60, -Math.sin(a) * 60, 0.6, i % 2 ? 0xffffff : PAL.rune, 1, 0);
    }
    this.ctx.game.juice.popValue(amount, X, Y - 20, { tier: 3, prefix: 'SINGULARITY! +', color: '#ffffff' });
    this.ctx.haptic(30);
    sfx.chord(this.vol());
    if (this.ritual?.dropped && !this.core.flask.orbs.some((o) => o.sealed)) this.endRitual(1);
    this.mood('happy', 4);
    // First Singularity: a mechanic (its micro-lesson points at the new Page); later ones get the line.
    if (!this.ctx.seen('ls.singularity')) this.ctx.say('singularity', { type: 'mechanic_unlocked' });
    else this.say('singularity', {}, 'happy');
    this.ctx.saveSoon();
  }

  private onVent(out: Orb[], refund: number, manual: boolean): void {
    this.ventPuff = 1;
    for (const o of out) {
      if (this.flyers.length >= MAX_FLYERS) break;
      const side = o.x < 0 ? -1 : 1;
      this.flyers.push({ tier: o.tier, x: this.sx(o.x), y: this.sy(o.y), vx: side * (40 + Math.random() * 50), vy: -90 - Math.random() * 60, life: 1.2 });
    }
    const y = this.sy(this.core.brimY);
    for (let i = 0; i < 30; i++) {
      this.addParticle(this.cx + (Math.random() - 0.5) * this.core.flask.w, y + Math.random() * 20, (Math.random() - 0.5) * 50, -30 - Math.random() * 40, 0.8 + Math.random() * 0.5, i % 3 ? PAL.steam : 0xffffff, 2, -10);
    }
    if (refund > 0) this.ctx.float(`FUMES +${formatNum(refund)}`, this.cx, y - 14, '#a8f0b0');
    this.ctx.haptic(30);
    sfx.vent(this.vol());
    this.pending = false;
    this.ctx.saveSoon();
    // The sealed gift was vented: the apprentices still count the thought.
    const r = this.ritual;
    if (r && r.dropped && !this.core.flask.orbs.some((o) => o.sealed)) this.endRitual(0.4);
    if (manual) {
      this.mood('relieved', 2);
      return;
    }
    this.mood('singed', 4);
    const now = this.time;
    this.recentVents = this.recentVents.filter((t) => now - t < 300);
    this.recentVents.push(now);
    if (this.run.stats.vents <= 1 || !this.ctx.seen('ls.vents')) {
      this.say('hazardFirst', { type: 'hazard_first' }, 'singed', 4);
      this.ctx.lesson('vents');
    } else if (this.recentVents.length >= 3 && this.core.volTarget > 0) {
      // Struggle (04 §18): 3 vents in 5 min; the one-tap offer turns the knob down one step.
      this.say('struggle', { type: 'struggle', offer: () => this.stepVol(-1) }, 'singed', 4);
      this.recentVents.length = 0;
    }
  }

  /** A real overflow finished the flask: count its score up in the emptied top of the flask. */
  private onFlaskEnd(score: number, prev: number): void {
    if (!(score > 0)) return;
    this.tally = { score, prev, t: 0, ticks: 0, done: false };
    if (!this.ctx.seen('sp.study')) {
      this.ctx.markSeen('sp.study');
      this.say('study', { milestone: true }, 'lecture');
    }
  }

  private updateTally(dt: number): void {
    const k = this.tally;
    this.tallyText.visible = this.tallySub.visible = !!k;
    if (!k) return;
    k.t += dt;
    const COUNT_S = 1.2;
    const f = Math.min(1, k.t / COUNT_S);
    const shown = Math.round(k.score * (1 - (1 - f) ** 2));
    // A rising tick per step of the count (the shared kit's count-up tick).
    if (!k.done && k.t >= k.ticks * 0.08) {
      kit.tick(k.ticks++);
    }
    this.tallyText.set(`FLASK ${formatNum(shown)}`, '#fff2a0');
    this.tallyText.scale.set(2);
    if (f >= 1 && !k.done) {
      k.done = true;
      if (k.score > k.prev) {
        this.tallySub.set(k.prev > 0 ? 'NEW BEST!' : 'FIRST FLASK!', '#e8c04a');
        kit.bigWin();
        this.ctx.game.juice.shake(1);
        this.mood('happy', 3);
        if (k.prev > 0 && this.sayCooldown <= 0) {
          this.say('newBest', {}, 'happy');
          this.sayCooldown = 8;
        }
      } else this.tallySub.set(`${formatNum(k.prev - k.score)} SHORT OF BEST`, '#c8b8d8');
    }
    if (!k.done) this.tallySub.set('', '#e8c04a');
    const y = this.sy(this.core.brimY) + 16;
    this.tallyText.position.set(Math.round(this.cx - this.tallyText.width / 2), y);
    this.tallySub.position.set(Math.round(this.cx - this.tallySub.width / 2), y + 13);
    const a = k.t > 3 ? Math.max(0, 1 - (k.t - 3) * 2) : 1;
    this.tallyText.alpha = this.tallySub.alpha = a;
    if (a <= 0) this.tally = null;
  }

  /** R9 rescues: a chain earned a Catalyst, or the brim handed over a Quicksilver bead. */
  private onRescue(kind: 'catalyst' | 'quick'): void {
    if (kind === 'catalyst') {
      this.ctx.float('CHAIN! CATALYST NEXT', this.cx, this.mouthY + 40, '#f0f0ff');
      sfx.page(this.vol());
    } else {
      this.ctx.float('QUICKSILVER! NUDGE IT', this.cx, this.mouthY + 40, '#c8d0dc');
      sfx.page(this.vol());
      this.ctx.haptic(15);
    }
  }

  private onShatter(stones: Orb[], amount: number): void {
    let x = 0;
    let y = 0;
    for (const o of stones) {
      x += o.x;
      y += o.y;
      const X = this.sx(o.x);
      const Y = this.sy(o.y);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        this.addParticle(X, Y, Math.cos(a) * 50, Math.sin(a) * 50 - 20, 0.5, i % 2 ? 0x6a6470 : PAL.rune, 1, 120);
      }
    }
    x = this.sx(x / stones.length);
    y = this.sy(y / stones.length);
    this.addRing(x, y, 4, 20, PAL.rune);
    this.ctx.float(`HEX POP +${formatNum(amount)}`, x, y - 10, '#c070ff');
    sfx.bloop(this.vol(), 3, 4);
    this.ctx.haptic(10);
    if (this.run.stats.hexShatters === 1) this.say('hexShatter', {}, 'relieved');
  }

  private onDevour(v: Orb, o: Orb, amount: number): void {
    const X = this.sx(o.x);
    const Y = this.sy(o.y);
    for (let i = 0; i < 5; i++) this.addParticle(X, Y, (this.sx(v.x) - X) * 2, (this.sy(v.y) - Y) * 2, 0.4, orbColor(o.tier), 1, 0);
    if (this.floatBudget >= 1) {
      this.floatBudget -= 1;
      this.ctx.float(`+${formatNum(amount)}`, X, Y - 6, '#c070ff');
    }
  }

  private onFizz(o: Orb): void {
    const X = this.sx(o.x);
    const Y = this.sy(o.y);
    for (let i = 0; i < 6; i++) this.addParticle(X, Y, (Math.random() - 0.5) * 30, -20 - Math.random() * 20, 0.6, 0xc8d0dc, 1, -10);
  }

  private onTremor(): void {
    this.shake = Math.max(this.shake, 0.25);
    this.ctx.haptic(20);
    sfx.vent(this.vol() * 0.5);
    this.mood('scared', 0.8);
  }

  private onNewTier(t: number): void {
    const best = this.ctx.save.lifetime.best;
    const isNew = t > (best.spireTier ?? 0);
    best.spireTier = Math.max(best.spireTier ?? 0, t);
    if (t >= 6) this.mood('happy', 3);
    if (!isNew || t < 6) return;
    if (t === MAX_TIER) this.say('voidStar', { type: 'tier_reached', key: 'tier11' }, 'happy');
    else this.say('tierNew', { type: 'tier_reached', key: `tier${t}`, vars: { name: TIERS[t].name.toUpperCase() } }, 'happy');
  }

  private onPage(n: number, why: string): void {
    this.ctx.float(`+${n} GRIMOIRE PAGE (${why})`, this.cx, this.mouthY + 40, '#e8c04a');
    sfx.page(this.vol());
    this.ctx.lesson('tomes');
  }

  private mood(m: SorcMood, t: number): void {
    this.sorcMood = m;
    this.moodT = t;
  }

  private addParticle(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number, grav: number): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, color, size, grav });
  }

  private addRing(x: number, y: number, r: number, max: number, color: number): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, r, max, life: 0.35, color });
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.time += dt;
    this.sayCooldown -= dt;
    this.floatBudget = Math.min(5, this.floatBudget + dt * 4);
    if (this.freeze > 0) this.freeze -= dt;
    else this.core.update(dt);
    if (this.pending && this.core.canDrop()) this.doDrop();

    // Apprentices distill while you watch (the idle rate, credited once a second).
    this.idleT += dt;
    if (this.idleT >= 1) {
      const rate = idleRateOf(this.run, this.per, this.ctx.save.imports?.souls ?? 0);
      this.idleAcc += rate * this.idleT;
      this.idleT = 0;
      if (this.idleAcc > 0) {
        this.ctx.earn(this.idleAcc);
        this.idleAcc = 0;
      }
    }

    this.persistT -= dt;
    if (this.persistT <= 0) {
      this.persistT = 2;
      this.core.persist();
    }
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      this.syncState();
      this.checkMilestones();
    }

    // Brim warning: heartbeat and a scared sorcerer.
    if (this.core.brimWarn) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.6;
        sfx.heartbeat(this.vol());
      }
      if (this.sorcMood !== 'singed') this.mood('scared', 0.5);
    } else this.heartT = 0;
    this.updateRitual(dt);
    this.updateTally(dt);
    this.updateTools();
    this.moodT -= dt;
    if (this.moodT <= 0) this.sorcMood = 'calm';

    this.chainShow -= dt;
    this.resPulse = Math.max(0, this.resPulse - dt * 2);
    this.ventPuff = Math.max(0, this.ventPuff - dt);
    this.whiteout = Math.max(0, this.whiteout - dt);

    this.updateParticles(dt);
    this.updateApprentices(dt);
    this.drawOrbs();
    this.drawDynamic();
    this.updateTexts();

    if (this.shake > 0) {
      this.shake -= dt;
      const m = this.whiteout > 0 ? 3 : 1;
      this.root.position.set(Math.round((Math.random() - 0.5) * 2 * m), Math.round((Math.random() - 0.5) * 2 * m));
    } else this.root.position.set(0, 0);

  }

  /** Tool buttons: visible once bought, dimmed while cooling down. */
  private updateTools(): void {
    const c = this.core;
    const set = (b: ToolBtn, owned: boolean, cool: number, cd: number, extra = true) => {
      b.visible = owned;
      if (!owned) return;
      b.cool = cool > 0 ? cool / cd : 0;
      b.ready = cool <= 0 && extra;
      b.redraw();
    };
    set(this.ventBtn, c.hasVentNow, c.ventNowCool, VENT_NOW_CD, c.lock <= 0 && c.ventable() > 0);
    set(this.tremorBtn, c.hasTremor, c.tremorCool, TREMOR_CD, c.flask.count > 0);
    set(this.quickBtn, c.hasQuick, c.quickCool, QUICK_CD, c.current !== QUICK);
    // First Catalyst / Hex Stone in hand: a one-beat lesson.
    const cur = c.current;
    if (cur === CATALYST && !this.seenCatalyst) {
      this.seenCatalyst = true;
      this.ctx.lesson('catalyst');
    } else if (cur === HEX && !this.seenHex) {
      this.seenHex = true;
      this.ctx.lesson('hex');
    }
  }

  // ---------- return ritual (04 §13, 00 §5.3) ----------

  /** The apprentices hand over one sealed orb (Distill Ceiling - 3) to drop yourself; merging it
   * scores 1, dropping it 0.6, a vent 0.4, and letting them keep it 0.25. */
  returnRitual(haul: number): Promise<number> {
    if (!(haul > 0) || this.ritual) return Promise.resolve(0);
    const tier = Math.max(2, Math.min(8, distillCeiling(this.run, this.per) - 3));
    return new Promise<number>((resolve) => {
      this.ritual = { tier, resolve, t: 0, orbId: -1, dropped: false };
      this.core.pushFront(tier);
      this.ctx.float('A SEALED GIFT! DROP IT', this.cx, this.mouthY + 24, '#e8c04a');
      this.mood('relieved', 3);
      sfx.page(this.vol());
    });
  }

  private updateRitual(dt: number): void {
    const r = this.ritual;
    if (!r) return;
    r.t += dt;
    if (!r.dropped) {
      // Not dropped in 25 s: the apprentices keep it for their own flask.
      if (r.t >= 25) {
        const i = this.run.queue.indexOf(r.tier);
        if (i >= 0) this.run.queue.splice(i, 1);
        while (this.run.queue.length < 3) this.run.queue.push(1);
        this.endRitual(0.25);
      }
    } else if (r.t >= 20) this.endRitual(0.6); // dropped, never merged in 20 s
  }

  private endRitual(score: number): void {
    const r = this.ritual;
    if (!r) return;
    this.ritual = null;
    for (const o of this.core.flask.orbs) o.sealed = false;
    if (score >= 1) this.mood('happy', 2);
    r.resolve(score);
  }

  private checkMilestones(): void {
    const s = this.ctx.save.seen;
    if (s.onboardingDone && !s['m.farewell'] && s['ob.line']) {
      s['m.farewell'] = 1;
      this.ctx.say('farewell', { milestone: true });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r += (r.max - r.r) * Math.min(1, dt * 10);
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.life -= dt;
      f.vy += 260 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.life <= 0) {
        // Coins fall where it lands.
        for (let k = 0; k < 3; k++) this.addParticle(f.x, f.y, (Math.random() - 0.5) * 30, -40, 0.5, PAL.brassHi, 1, 200);
        this.flyers.splice(i, 1);
      }
    }
  }

  /** The cosmetic Apprentice Flask: homunculi toss orbs at the apprentice drop rate. */
  private updateApprentices(dt: number): void {
    const n = apprentices(this.run);
    const dpm = apprenticeDropsPerMin(this.run, this.ctx.save.imports?.souls ?? 0);
    if (n > 0 && dpm > 0) {
      this.apprT += dt;
      const every = 60 / dpm;
      if (this.apprT >= every) {
        this.apprT -= every;
        const who = this.apprTurn++ % n;
        this.apprToss[who] = 0.3;
        if (this.apprDrops.length < 6) {
          const tier = 1 + Math.floor(Math.random() * 3);
          const slot = this.homX(who);
          this.apprDrops.push({ x: slot + 2, y: this.apY - 6, vy: 10, tier });
        }
      }
    }
    for (let i = 0; i < 4; i++) this.apprToss[i] = Math.max(0, this.apprToss[i] - dt);
    const level = this.apY + this.apH - this.liquidH();
    for (let i = this.apprDrops.length - 1; i >= 0; i--) {
      const d = this.apprDrops[i];
      d.vy += 200 * dt;
      d.y += d.vy * dt;
      if (d.y >= level) {
        this.apprDrops.splice(i, 1);
        if (this.apprBubbles.length < 12) {
          for (let k = 0; k < 2; k++) {
            const bx = this.apX + 2 + Math.floor(Math.random() * Math.max(1, this.apW - 4));
            this.apprBubbles.push({ x: bx, y: this.apY + this.apH - 2 - k * 3, t: 3, c: orbColor(d.tier) });
          }
        }
      }
    }
    for (let i = this.apprBubbles.length - 1; i >= 0; i--) {
      const b = this.apprBubbles[i];
      b.t -= dt;
      b.y -= 10 * dt;
      if (b.t <= 0 || b.y < level) this.apprBubbles.splice(i, 1);
    }
  }

  private liquidH(): number {
    const ceil = distillCeiling(this.run, this.per);
    return Math.max(4, Math.min(this.apH - 10, 6 + ceil * 8));
  }

  private homX(i: number): number {
    // Up to four homunculi share the rim of the tiny flask.
    const n = Math.max(1, apprentices(this.run));
    const span = Math.max(1, this.apW - 4);
    return this.apX + Math.round((i + 0.5) * (span / n)) - 2;
  }

  private drawOrbs(): void {
    const orbs = this.core.flask.orbs;
    let i = 0;
    for (const o of orbs) {
      if (i >= this.pool.length) break;
      const s = this.pool[i++];
      const blink = o.tier === 10 && (this.time + o.id * 0.7) % 3.3 < 0.14;
      const tex = orbTexture(o.tier, blink);
      if (s.texture !== tex) s.texture = tex;
      const k = o.r / o.rt;
      s.scale.set(k);
      s.position.set(Math.round(this.cx + o.x - o.r), Math.round(this.mouthY + o.y - o.r));
      s.visible = true;
    }
    for (; i < this.pool.length; i++) this.pool[i].visible = false;
    let j = 0;
    for (const f of this.flyers) {
      const s = this.flyPool[j++];
      const r = orbR(f.tier);
      const tex = orbTexture(f.tier);
      if (s.texture !== tex) s.texture = tex;
      s.position.set(Math.round(f.x - r), Math.round(f.y - r));
      s.alpha = Math.min(1, f.life * 2);
      s.visible = true;
    }
    for (; j < this.flyPool.length; j++) this.flyPool[j].visible = false;
    // The orb in the dropper.
    const cur = this.core.current;
    const r = orbR(cur);
    const tex = orbTexture(cur);
    if (this.held.texture !== tex) this.held.texture = tex;
    const ready = this.core.canDrop();
    this.held.visible = ready || this.core.lock <= 0;
    this.held.alpha = ready ? 1 : 0.45;
    this.held.position.set(Math.round(this.cx + this.core.aimX - r), Math.round(this.mouthY + this.core.dropY() - r));
  }

  private drawDynamic(): void {
    const g = this.dynG.clear();
    const f = this.fxG.clear();
    const W = this.core.flask.w;
    const left = this.cx - W / 2;
    const pulse = Math.floor(this.time * 4) % 2 === 0;
    const core = this.core;

    // Resonance glow on the glass, runes orbiting at x3+.
    if (core.res >= 2) {
      const a = core.res >= 3 ? 0.5 : 0.3;
      g.rect(left - WALL - 2, this.mouthY - 2, 1, FLASK_H + 4).fill({ color: PAL.rune, alpha: a });
      g.rect(left + W + WALL + 1, this.mouthY - 2, 1, FLASK_H + 4).fill({ color: PAL.rune, alpha: a });
    }
    if (core.res >= 3) {
      const per = 2 * (W + FLASK_H);
      for (let k = 0; k < 6; k++) {
        let d = ((this.time * 60 + (k * per) / 6) % per + per) % per;
        let x: number;
        let y: number;
        if (d < W) [x, y] = [left + d, this.mouthY - 6];
        else if ((d -= W) < FLASK_H) [x, y] = [left + W + 4, this.mouthY + d];
        else if ((d -= FLASK_H) < W) [x, y] = [left + W - d, this.botY + 4];
        else [x, y] = [left - 5, this.botY - (d - W)];
        f.rect(Math.round(x), Math.round(y), 2, 2).fill(PAL.rune);
      }
    }

    // Brazier fire flicker.
    const by = this.botY + WALL + 1;
    for (let k = 0; k < Math.floor(W / 8); k++) {
      const fx = left + 4 + k * 8 + ((k * 5) % 3);
      const h = 2 + ((Math.floor(this.time * 8) + k * 3) % 3);
      g.rect(fx, by - h + 1, 3, h).fill(PAL.fire);
      g.rect(fx + 1, by - h + 2, 1, h - 1).fill(PAL.fireHi);
    }

    // Brim Line (dashed), shimmering red during the warning; the vent line faintly below.
    const brimY = this.sy(core.brimY);
    const warn = core.brimWarn;
    const brimCol = warn ? (pulse ? PAL.warn : 0xffa0a0) : PAL.brim;
    const dashOff = Math.floor(this.time * 6) % 6;
    for (let x = left + dashOff - 6; x < left + W; x += 6) {
      const x0 = Math.max(left, x);
      const x1 = Math.min(left + W, x + 3);
      if (x1 > x0) g.rect(x0, brimY, x1 - x0, 1).fill({ color: brimCol, alpha: warn ? 1 : 0.7 });
    }
    if (core.brimT > 0) {
      // Fill meter on the left wall: time until the vent.
      const h = Math.round(core.brimFrac * 20);
      g.rect(left + 1, brimY + 2, 2, h).fill(PAL.warn);
    }
    this.warnText.visible = warn && pulse;
    this.warnText.position.set(this.cx - 9, Math.max(this.mouthY + 2, brimY - 8));

    // Dropper claw at the aim, and the aim guide.
    const ax = Math.round(this.cx + core.aimX);
    const ry = this.mouthY - DROP_ZONE + 1;
    g.rect(ax - 3, ry - 1, 7, 4).fill(PAL.brassLo);
    g.rect(ax - 2, ry, 5, 2).fill(PAL.brassHi);
    g.rect(ax - 1, ry + 3, 1, 2).fill(PAL.brass);
    g.rect(ax + 1, ry + 3, 1, 2).fill(PAL.brass);
    if (this.aiming || this.pending) {
      // Dotted landing guide straight down to the first orb or the floor.
      const cur = core.current;
      const rd = orbR(cur);
      let stop = this.botY;
      for (const o of core.flask.orbs) {
        if (Math.abs(o.x - core.aimX) < o.r + rd) stop = Math.min(stop, this.sy(o.y - Math.sqrt(Math.max(0, (o.r + rd) ** 2 - (o.x - core.aimX) ** 2))) + rd);
      }
      for (let y = this.mouthY + 2; y < stop - rd; y += 4) g.rect(ax, y, 1, 2).fill({ color: 0xffffff, alpha: 0.35 });
    }
    // Valve cooldown pip under the rail.
    if (core.cool > 0 || core.lock > 0) {
      const frac = core.lock > 0 ? core.lock / 1.5 : core.cool / 0.6;
      g.rect(left, ry + 3, Math.round(W * (1 - Math.min(1, frac))), 1).fill(core.lock > 0 ? PAL.steam : PAL.brassHi);
    }

    // Queue previews: next 2 (3 with the Mirror) as small pixel discs, in a row above the flask or
    // stacked at the top of the right gutter on short screens.
    const shown = tomeOf(this.per, 'mirror') > 0 ? 3 : 2;
    let qx = left + 20;
    const qcx = this.rgX + Math.floor(this.rgW / 2);
    for (let i = 1; i <= shown; i++) {
      const t = this.run.queue[i] ?? 1;
      const r = Math.min(4, orbR(t) - 1);
      if (this.queueSide) {
        const cy = this.mouthY + 14 + (i - 1) * 10;
        for (const [dx, dy] of discPts(r)) g.rect(qcx + dx, cy + dy, 1, 1).fill(orbColor(t));
        g.rect(qcx - 1, cy - 1, 1, 1).fill(orbLight(t));
        continue;
      }
      const cy = this.queueY + 4;
      for (const [dx, dy] of discPts(r)) g.rect(qx + r + dx, cy + dy, 1, 1).fill(orbColor(t));
      g.rect(qx + r - 1, cy - 1, 1, 1).fill(orbLight(t));
      qx += r * 2 + 4;
    }

    // Volatility knob (a brass dial) in the left gutter.
    const kx = this.lgX + Math.floor(this.lgW / 2);
    const ky = this.mouthY + 33;
    for (const [dx, dy] of discPts(6)) g.rect(kx + dx, ky + dy, 1, 1).fill(PAL.brassLo);
    for (const [dx, dy] of discPts(5)) g.rect(kx + dx, ky + dy, 1, 1).fill(PAL.brass);
    const ang = -Math.PI * 1.25 + (this.run.vol / VOL_MAX) * Math.PI * 1.5;
    for (let k = 1; k <= 4; k++) g.rect(Math.round(kx + Math.cos(ang) * k), Math.round(ky + Math.sin(ang) * k), 1, 1).fill(PAL.warn);
    // Bought levels as pips under the knob.
    for (let v = 0; v < VOL_MAX; v++) {
      const px = this.lgX + 1 + Math.floor((v * (this.lgW - 2)) / VOL_MAX);
      const tgt = this.core.volTarget;
      const col = v < tgt ? PAL.warn : v < this.run.vol ? (pulse ? 0xe8c04a : 0x7a3a3a) : v < this.run.volBought ? 0x7a3a3a : 0x2a1a2a;
      g.rect(px, this.mouthY + 63, Math.max(1, Math.floor((this.lgW - 2) / VOL_MAX) - 1), 2).fill(col);
    }

    // The Head Sorcerer's sprite at the bottom of the left gutter (mirrors his mood).
    const sx = this.lgX + Math.floor((this.lgW - 12) / 2);
    const syBase = this.botY - 14;
    const jitter = this.sorcMood === 'scared' ? (pulse ? 1 : -1) : 0;
    const hop = this.sorcMood === 'happy' ? (Math.floor(this.time * 6) % 2) : 0;
    drawSprite(g, SORC_IDLE_FRAME(this.sorcMood), SORC_PAL, sx + jitter, syBase - hop);
    if (this.sorcMood === 'singed' || this.ventPuff > 0) {
      const t = this.time * 3;
      for (let k = 0; k < 3; k++) {
        const py = syBase - 3 - ((t + k * 0.33) % 1) * 10;
        g.rect(sx + 4 + k * 2, Math.round(py), 2, 2).fill({ color: 0x8a8a8a, alpha: 0.7 });
      }
    }

    // Apprentice Flask: liquid, bubbles, homunculi on the rim, falling orbs.
    const n = apprentices(this.run);
    const lh = this.liquidH();
    const ceil = distillCeiling(this.run, this.per);
    const liqC = ceil >= 2 ? orbColor(ceil) : 0x2a3a4a;
    if (n > 0) {
      const ly = this.apY + this.apH - lh;
      g.rect(this.apX, ly, this.apW, lh).fill({ color: liqC, alpha: 0.55 });
      g.rect(this.apX, ly, this.apW, 1).fill({ color: orbLight(Math.max(1, ceil)), alpha: 0.8 });
      for (const b of this.apprBubbles) g.rect(Math.round(b.x), Math.round(b.y), 1, 1).fill(b.c);
      for (const d of this.apprDrops) g.rect(Math.round(d.x), Math.round(d.y), 2, 2).fill(orbColor(d.tier));
      const napping = n * 4 * (1 + 0.08 * lvOf(this.run, 'diligence')) > 12.01;
      for (let i = 0; i < n; i++) {
        const hx = this.homX(i);
        const toss = this.apprToss[i] > 0;
        const bob = Math.floor(this.time * 3 + i) % 2;
        const hy = this.apY - 9 + (toss ? 0 : bob);
        // 5x6 homunculus: clay body, big head, glowing eyes; arms up when tossing.
        g.rect(hx, hy + 2, 5, 4).fill(0x8a5a3a);
        g.rect(hx + 1, hy, 3, 3).fill(0xb07a50);
        g.rect(hx + 1, hy + 1, 1, 1).fill(0xfff070);
        g.rect(hx + 3, hy + 1, 1, 1).fill(0xfff070);
        if (toss) {
          g.rect(hx - 1, hy - 1, 1, 2).fill(0x8a5a3a);
          g.rect(hx + 5, hy - 1, 1, 2).fill(0x8a5a3a);
        }
        if (napping && i === n - 1) {
          this.zzz.visible = true;
          this.zzz.position.set(hx + 4, hy - 7 - (Math.floor(this.time) % 2));
        }
      }
      if (!napping) this.zzz.visible = false;
    } else {
      this.zzz.visible = false;
      g.rect(this.apX, this.apY + this.apH - 4, this.apW, 4).fill({ color: 0x2a3a4a, alpha: 0.5 });
    }

    // The sealed return gift: a gold ring that winks around it (in the dropper and in the flask).
    if (this.ritual && pulse) {
      const ring = (x: number, y: number, r: number) => {
        for (const [dx, dy] of ringPts(r + 2)) f.rect(x + dx, y + dy, 1, 1).fill(0xe8c04a);
      };
      if (!this.ritual.dropped && core.current === this.ritual.tier) ring(ax, Math.round(this.mouthY + core.dropY()), orbR(core.current));
      for (const o of core.flask.orbs) if (o.sealed) ring(Math.round(this.cx + o.x), Math.round(this.mouthY + o.y), Math.round(o.r));
    }
    // Quicksilver beads shimmer as they melt (last 5 s).
    for (const o of core.flask.orbs) {
      if (o.tier !== QUICK || o.age < 15 || !pulse) continue;
      f.rect(Math.round(this.cx + o.x) - 1, Math.round(this.mouthY + o.y - o.r) - 2, 2, 1).fill(0xffffff);
    }

    // Rings, particles, whiteout.
    for (const r of this.rings) {
      const rr = Math.round(r.r);
      const col = r.life > 0.2 ? 0xffffff : r.color;
      for (const [dx, dy] of ringPts(rr)) f.rect(Math.round(r.x) + dx, Math.round(r.y) + dy, 1, 1).fill({ color: col, alpha: Math.min(1, r.life * 4) });
    }
    for (const o of core.flask.orbs) {
      if (o.flash <= 0) continue;
      // Merge flash: a white disc that shrinks over 4 frames.
      const rr = Math.max(1, Math.round(o.r * (o.flash / 0.2)));
      for (const [dx, dy] of discPts(Math.min(rr, 12))) f.rect(Math.round(this.cx + o.x) + dx, Math.round(this.mouthY + o.y) + dy, 1, 1).fill({ color: 0xffffff, alpha: 0.7 });
    }
    for (const p of this.particles) f.rect(Math.round(p.x), Math.round(p.y), p.size, p.size).fill({ color: p.color, alpha: Math.min(1, p.life * 3) });
    if (this.whiteout > 0) {
      const L = this.ctx.layout;
      f.rect(0, 0, L.w, L.h).fill({ color: 0xffffff, alpha: Math.min(0.85, this.whiteout * 3) });
    }
  }

  private updateTexts(): void {
    const run = this.run;
    const W = this.core.flask.w;
    const left = this.cx - W / 2;
    const res = this.core.res;
    const resCol = res >= 4 ? '#fff2a0' : res > 1 ? '#c070ff' : '#6a5a7a';
    const lift = this.resPulse > 0.5 ? 1 : 0;
    if (this.queueSide) {
      this.resText.set(`CHAIN\nX${Math.round(res)}`, resCol);
      this.resText.position.set(this.rgX + Math.floor((this.rgW - this.resText.width) / 2), this.mouthY + 46 - lift);
    } else {
      this.resText.set(`CHAIN X${Math.round(res)}`, resCol);
      this.resText.position.set(left + W - this.resText.width, this.queueY + 2 - lift);
    }
    this.chainText.visible = this.chainShow > 0;
    this.chainText.position.set(Math.round(this.cx - this.chainText.width / 2), this.mouthY + 24);
    // A lowered setting waits (04 §7): "5>3" until the next vent or 30 s.
    this.volOf.set(run.volPending >= 0 ? `${run.vol}>${run.volPending}` : `${run.vol}/${run.volBought}`, run.volPending >= 0 ? '#e8c04a' : '#9c8aa8');
    this.volOf.position.set(this.lgX + Math.floor((this.lgW - this.volOf.width) / 2), this.mouthY + 64 - 8 + 15);
    const held = heldVol(run);
    this.featText.set(`F${run.featBest}`, '#9c8aa8');
    this.featText.position.set(this.lgX + Math.floor((this.lgW - this.featText.width) / 2), this.mouthY + 82);
    this.featText.alpha = held < run.vol ? 0.6 : 1;
    const n = apprentices(run);
    const ceil = distillCeiling(run, this.per);
    this.apprText.set(n > 0 ? `X${n}` : 'HIRE');
    this.apprText.position.set(this.rgX + Math.floor((this.rgW - this.apprText.width) / 2), this.apY - 20);
    this.ceilText.set(ceil >= 2 ? `T${ceil}` : '');
    this.ceilText.position.set(this.rgX + Math.floor((this.rgW - this.ceilText.width) / 2), this.apY + this.apH + 6);
    // R6: the apprentices copy your best flask: their output modifier over the little flask.
    const study = studyMultOf(run, this.per);
    const pctTxt = `${study >= 1 ? '+' : '-'}${Math.round(Math.abs(study - 1) * 100)}%`;
    this.studyText.set(n > 0 ? pctTxt : '', study >= 1 ? '#e8c04a' : '#9c8aa8');
    this.studyText.position.set(this.rgX + Math.floor((this.rgW - this.studyText.width) / 2), this.apY - 28);
    // The flask score: above the dropper on tall screens, else tucked into the flask's neck.
    const best = run.flaskBest ?? 0;
    this.scoreText.set(best > 0 ? `FLASK ${formatNum(run.flaskScore)}  BEST ${formatNum(best)}` : `FLASK ${formatNum(run.flaskScore)}`, '#c8b8d8');
    const top = this.ctx.content().y + 36;
    const sy = this.queueSide || this.queueY - 9 < top ? this.mouthY + 3 : this.queueY - 9;
    this.scoreText.position.set(Math.round(this.cx - this.scoreText.width / 2), sy);
    this.scoreText.visible = !this.tally;
    this.pagesText.set(`${formatNum(this.per.pages)} PAGES`);
    const c = this.ctx.content();
    this.pagesText.position.set(c.x + c.w - 11 - this.pagesText.width, this.barY + 5);
    this.volUp.setEnabled(this.core.volTarget < run.volBought || run.volBought < VOL_MAX);
    this.volDown.setEnabled(this.core.volTarget > 0);
  }

  // ---------- manager hooks (00 §5.4) ----------

  /** 04 §18: a cascade (a merge in the last 1.5 s), the brim filling, or the 0.6 s after a drop. */
  isIntense(): boolean {
    return this.core.intense;
  }

  /** The dropper rail and the next-orb queue: toasts and the intro line keep off them. */
  avoidRects(): Rect[] {
    const W = this.core.flask.w;
    const left = this.cx - W / 2;
    const railY = this.mouthY - DROP_ZONE;
    const out: Rect[] = [{ x: left - 4, y: railY - 4, w: W + 8, h: DROP_ZONE + 6 }];
    const q = this.targetRect('queue');
    if (q) out.push(q);
    return out;
  }

  /** Beat targets (logical px). 'aim' spans the dropper and the flask column, so a beat that
   * points at it starts with the bubble collapsed whenever the strip would cover the dropper. */
  targetRect(id: string): Rect | null {
    const W = this.core.flask.w;
    const left = this.cx - W / 2;
    const railY = this.mouthY - DROP_ZONE;
    const brimY = this.sy(this.core.brimY);
    switch (id) {
      case 'aim':
        return { x: left, y: railY - 2, w: W, h: this.botY - railY + 2 };
      case 'aim.left':
      case 'aim.right': {
        const y = Math.round((railY + this.botY) / 2);
        return { x: id === 'aim.left' ? left + 6 : left + W - 18, y, w: 12, h: 4 };
      }
      case 'flask':
        return { x: left, y: this.mouthY, w: W, h: FLASK_H };
      case 'dropper':
        return { x: this.cx + this.core.aimX - 8, y: railY - 2, w: 16, h: DROP_ZONE };
      case 'queue':
        return this.queueSide ? { x: this.rgX, y: this.mouthY, w: this.rgW, h: 44 } : { x: left, y: this.queueY, w: W, h: QUEUE_H };
      case 'res':
        return { x: this.resText.x - 1, y: this.resText.y - 1, w: this.resText.width + 2, h: this.resText.height + 1 };
      case 'brim':
        return { x: left, y: brimY - 1, w: W, h: 3 };
      case 'brimZone':
        return { x: left, y: railY - 2, w: W, h: brimY - railY + 4 };
      case 'btn.upgrades':
        return { x: this.upBtn.x, y: this.upBtn.y, w: 70, h: BAR_H };
      case 'knob':
        return { x: this.lgX, y: this.mouthY, w: this.lgW, h: 66 };
      case 'vol.up':
        return { x: this.volUp.x, y: this.volUp.y, w: 16, h: 13 };
      case 'feat':
        return { x: this.featText.x - 1, y: this.featText.y - 1, w: this.featText.width + 2, h: 7 };
      case 'appr':
        return { x: this.apX - 2, y: this.apY - 12, w: this.apW + 4, h: this.apH + 14 };
      case 'pages':
        return { x: this.pagesText.x - 1, y: this.barY + 2, w: this.ctx.content().x + this.ctx.content().w - this.pagesText.x - 1, h: BAR_H - 3 };
      case 'btn.vent':
        return this.ventBtn.visible ? this.ventBtn.rect() : null;
      case 'btn.tremor':
        return this.tremorBtn.visible ? this.tremorBtn.rect() : null;
      case 'btn.quick':
        return this.quickBtn.visible ? this.quickBtn.rect() : null;
      default:
        return null;
    }
  }

  /** Tempered Glass bought: widen the flask now (the frame loop redraws when the width changes). */
  onImports(): void {
    this.core.refresh();
    if (this.core.flask.w !== this.flaskWDrawn) this.resize(this.ctx.layout);
  }

  destroy(): void {
    this.endRitual(this.ritual?.dropped ? 0.6 : 0);
    this.core.persist();
    destroyTree(this.root);
  }
}

/** Filled pixel-disc offsets (cached per radius). */
const discCache = new Map<number, [number, number][]>();
function discPts(r: number): [number, number][] {
  let pts = discCache.get(r);
  if (!pts) {
    pts = [];
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) pts.push([x, y]);
    if (discCache.size < 32) discCache.set(r, pts);
  }
  return pts;
}
