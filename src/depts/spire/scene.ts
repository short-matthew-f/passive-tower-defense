// The Spire scene: the flask on its brazier, the dropper and preview queue, the Volatility knob
// and the Head Sorcerer in the left gutter, the Apprentice Flask in the right gutter.
// Rendering: a few reusable Graphics redrawn per frame plus pooled orb Sprites; every PixelText
// is created once and updated with .set().
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText } from '../../ui/font';
import { Button, C, drawSprite } from '../../ui/widgets';
import { ORB_COL, orbColor, orbLight, orbTexture, PAL, SORC_IDLE_FRAME, SORC_PAL } from './art';
import {
  apprenticeDropsPerMin,
  apprentices,
  arcanaMult,
  distillCeiling,
  FLASK_H,
  heldVol,
  idleRateOf,
  lvOf,
  MAX_TIER,
  TIERS,
  tomeOf,
  UPGRADES,
  upCost,
  VOL_MAX,
  volCost,
  type SpirePersistent,
  type SpireRun,
  type UpDef,
} from './def';
import { MAX_ORBS, SpireCore } from './logic';
import type { MergeEvent, Orb } from './physics';
import { sfx } from './sfx';

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
  private upBtn!: Button;
  private volUp!: Button;
  private volDown!: Button;
  private aimHit = new Container();

  // Layout (stage px).
  private cx = 0; // flask center line
  private mouthY = 0; // interior top
  private botY = 0; // interior bottom
  private queueY = 0;
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
  private sorcMood: 'calm' | 'scared' | 'singed' | 'happy' = 'calm';
  private moodT = 0;
  private persistT = 0;
  private checkT = 0;
  private stateKey = '';
  private sayCooldown = 0;
  private recentVents: number[] = [];

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.run = ctx.save.run as SpireRun;
    this.per = ctx.save.persistent as SpirePersistent;
    this.core = new SpireCore(this.run, this.per, {
      earn: (b) => ctx.earn(b),
      raiseSkill: (l) => ctx.raiseSkill(l),
      merge: (e, amount, depth, res) => this.onMerge(e, amount, depth, res),
      singularity: (x, y, amount) => this.onSingularity(x, y, amount),
      vent: (out, refund) => this.onVent(out, refund),
      drop: () => sfx.drop(this.vol()),
      newTier: (t) => this.onNewTier(t),
      page: (n, why) => this.onPage(n, why),
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
    this.root.addChild(this.upBtn, this.volUp, this.volDown);
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
    this.nextText.position.set(left, this.queueY + 2);
    this.volLabel.position.set(this.lgX + Math.floor((this.lgW - 11) / 2), this.mouthY + 2);
    this.warnText.position.set(this.cx - 9, this.mouthY + 3);
    this.chainText.position.set(this.cx, this.mouthY + 30);
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
        return n > VOL_MAX ? 'The dial is maxed' : `Unlock V${n}: Arcana x${arcanaMult(n).toFixed(2)}, lower brim`;
      },
      level: () => run.volBought,
      max: VOL_MAX,
      cost: () => volCost(run.volBought),
      canAfford: () => run.bank >= volCost(run.volBought),
      buy: () => {
        if (run.volBought >= VOL_MAX) return;
        if (!this.ctx.spend(volCost(run.volBought))) return;
        run.volBought++;
        this.core.setVol(run.volBought);
        this.afterBuy('volatility');
      },
    };
  }

  private groups(): UpgradeGroup[] {
    const by = (b: string) => UPGRADES.filter((u) => u.branch === b).map((u) => this.entry(u));
    return [
      { name: 'Alchemy', entries: by('alchemy') },
      { name: 'Apparatus', entries: [this.volEntry(), ...by('apparatus')] },
      { name: 'Apprent', entries: by('apprentices') },
      { name: 'Tomes', entries: by('tomes') },
    ];
  }

  private openUpgrades(): void {
    this.aiming = false;
    this.pending = false;
    this.ctx.openUpgrades(this.groups());
  }

  private afterBuy(id: string): void {
    this.ctx.saveSoon();
    this.syncState();
    const once = (key: string, trigger = key) => {
      if (!this.ctx.seen(`m.${key}`)) {
        this.ctx.markSeen(`m.${key}`);
        this.ctx.say(trigger, { milestone: true });
        return true;
      }
      return false;
    };
    if (id === 'wider') once('firstWider');
    if (id === 'hire') {
      if (!once('firstHelper')) once('apprLesson');
    }
    if (id === 'volatility') {
      const b = this.run.volBought;
      if (!once('volLesson')) {
        const best = this.ctx.save.lifetime.best.spireVol ?? 0;
        if (b % 3 === 0 || b > best) this.ctx.say('dialRaised', { milestone: true });
      }
      this.ctx.save.lifetime.best.spireVol = Math.max(this.ctx.save.lifetime.best.spireVol ?? 0, b);
    }
  }

  /** Re-read upgrade state: rebuild geometry when the flask or brim changed. */
  private syncState(): void {
    const key = `${lvOf(this.run, 'wider')}|${this.run.vol}|${lvOf(this.run, 'neck')}`;
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.core.refresh();
    if (this.core.flask.w !== this.flaskWDrawn) this.resize(this.ctx.layout);
  }

  private stepVol(d: number): void {
    const run = this.run;
    const want = run.vol + d;
    if (want > run.volBought) {
      const msg = run.volBought >= VOL_MAX ? 'MAXED' : `V${run.volBought + 1}: ${formatNum(volCost(run.volBought))} IN UPGRADES`;
      this.ctx.float(msg, this.cx, this.mouthY + 16, '#e05050');
      sfx.deny(this.vol());
      return;
    }
    if (this.core.setVol(want)) {
      this.ctx.saveSoon();
      this.ctx.float(`VOLATILITY ${run.vol}`, this.cx, this.mouthY + 16, '#e05050');
      this.syncState();
    }
  }

  // ---------- input ----------

  private localX(e: FederatedPointerEvent): number {
    return e.getLocalPosition(this.root).x - this.cx;
  }

  private onDown(e: FederatedPointerEvent): void {
    this.aiming = true;
    this.pointerId = e.pointerId;
    this.core.aimX = this.core.clampAim(this.localX(e));
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.aiming || e.pointerId !== this.pointerId) return;
    this.core.aimX = this.core.clampAim(this.localX(e));
  }

  private onUp(e: FederatedPointerEvent): void {
    if (!this.aiming || e.pointerId !== this.pointerId) return;
    this.aiming = false;
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

  // ---------- sim hooks (juice) ----------

  private sx(x: number): number {
    return this.cx + x;
  }

  private sy(y: number): number {
    return this.mouthY + y;
  }

  private onMerge(e: MergeEvent, amount: number, depth: number, res: number): void {
    const t = e.into ? e.into.tier : 12;
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
      this.ctx.float(`+${formatNum(amount)}`, x, y - r - 8, t >= 6 ? '#fff2a0' : ORB_COL[t][1]);
    }
    if (depth >= 2) {
      this.chainText.set(`CHAIN X${depth}  X${res.toFixed(2)}`, depth >= 5 ? '#fff2a0' : '#c070ff');
      this.chainShow = 1.4;
      this.resPulse = 1;
      if (depth === 5 && this.sayCooldown <= 0) {
        this.ctx.say('bigChain');
        this.sayCooldown = 8;
      }
    }
    sfx.bloop(this.vol(), t, depth - 1);
    if (t >= 5) this.ctx.haptic(10);
    if (t >= 8) this.shake = Math.max(this.shake, 0.08);
  }

  private onSingularity(x: number, y: number, amount: number): void {
    const X = this.sx(x);
    const Y = this.sy(y);
    this.freeze = 0.3;
    this.whiteout = 0.35;
    this.shake = 0.4;
    for (let i = 0; i < 3; i++) this.addRing(X, Y, 4 + i * 8, 70 + i * 10, i % 2 ? 0xffffff : PAL.rune);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 30;
      this.addParticle(X + Math.cos(a) * d, Y + Math.sin(a) * d, -Math.cos(a) * 60, -Math.sin(a) * 60, 0.6, i % 2 ? 0xffffff : PAL.rune, 1, 0);
    }
    this.ctx.float(`SINGULARITY! +${formatNum(amount)}`, X, Y - 20, '#ffffff');
    this.ctx.haptic(30);
    sfx.chord(this.vol());
    this.mood('happy', 4);
    this.ctx.say('singularity', { milestone: true });
    this.ctx.saveSoon();
  }

  private onVent(out: Orb[], refund: number): void {
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
    this.mood('singed', 4);
    const now = this.time;
    this.recentVents = this.recentVents.filter((t) => now - t < 300);
    this.recentVents.push(now);
    if (!this.ctx.seen('m.hazardFirst')) {
      this.ctx.markSeen('m.hazardFirst');
      this.ctx.say('hazardFirst', { milestone: true });
    } else if (this.recentVents.length >= 3 && !this.ctx.seen(`m.struggle.${Math.floor(Date.now() / 1.8e6)}`)) {
      this.ctx.markSeen(`m.struggle.${Math.floor(Date.now() / 1.8e6)}`);
      this.ctx.say('struggle', { milestone: true });
    }
    this.pending = false;
    this.ctx.saveSoon();
  }

  private onNewTier(t: number): void {
    const best = this.ctx.save.lifetime.best;
    const isNew = t > (best.spireTier ?? 0);
    best.spireTier = Math.max(best.spireTier ?? 0, t);
    if (t >= 6) this.mood('happy', 3);
    if (t === MAX_TIER && !this.ctx.seen('m.voidStar')) {
      this.ctx.markSeen('m.voidStar');
      this.ctx.say('voidStar', { milestone: true });
    } else if (t >= 6 && isNew) {
      this.ctx.say('tierNew', { milestone: true, vars: { name: TIERS[t].name } });
    }
  }

  private onPage(n: number, why: string): void {
    this.ctx.float(`+${n} GRIMOIRE PAGE (${why})`, this.cx, this.mouthY + 40, '#e8c04a');
    sfx.page(this.vol());
    if (!this.ctx.seen('m.page')) {
      this.ctx.markSeen('m.page');
      this.ctx.say('page', { milestone: true });
    }
  }

  private mood(m: 'calm' | 'scared' | 'singed' | 'happy', t: number): void {
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
      if (!this.ctx.seen('m.brim')) {
        this.ctx.markSeen('m.brim');
        this.ctx.say('brim', { milestone: true });
      }
    } else this.heartT = 0;
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

    if (!this.core.intense && this.sayCooldown <= 0 && Math.random() < dt / 70) {
      this.ctx.say('ambient');
      this.sayCooldown = 20;
    }
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
      const r = TIERS[f.tier].r;
      const tex = orbTexture(f.tier);
      if (s.texture !== tex) s.texture = tex;
      s.position.set(Math.round(f.x - r), Math.round(f.y - r));
      s.alpha = Math.min(1, f.life * 2);
      s.visible = true;
    }
    for (; j < this.flyPool.length; j++) this.flyPool[j].visible = false;
    // The orb in the dropper.
    const cur = this.core.current;
    const r = TIERS[cur].r;
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
      const rd = TIERS[cur].r;
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

    // Queue previews: next 2 (3 with the Mirror) as small pixel discs.
    const shown = tomeOf(this.per, 'mirror') > 0 ? 3 : 2;
    let qx = left + 20;
    for (let i = 1; i <= shown; i++) {
      const t = this.run.queue[i] ?? 1;
      const r = Math.min(4, TIERS[t].r - 1);
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
      const col = v < this.run.vol ? PAL.warn : v < this.run.volBought ? 0x7a3a3a : 0x2a1a2a;
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

    // Onboarding highlight: a pulsing outline on what to do next.
    const step = this.onboardingStep();
    if (step && pulse) {
      const hl = (x: number, y: number, w: number, h: number) => {
        f.rect(x - 2, y - 2, w + 4, 1).fill(0xffffff);
        f.rect(x - 2, y + h + 1, w + 4, 1).fill(0xffffff);
        f.rect(x - 2, y - 2, 1, h + 4).fill(0xffffff);
        f.rect(x + w + 1, y - 2, 1, h + 4).fill(0xffffff);
      };
      if (step === 'upgrade') hl(this.upBtn.x, this.upBtn.y, 70, BAR_H);
      else if (step === 'chains') hl(this.resText.x - 1, this.resText.y - 1, this.resText.width + 2, 7);
      else if (step === 'line') hl(left, brimY - 1, W, 2);
    }
    if (step === 'aim' || step === 'merge') {
      // A ghost finger sweeping across the flask column.
      const t = (this.time % 2.4) / 2.4;
      const gx = Math.round(this.cx + Math.sin(t * Math.PI * 2) * (W / 3));
      const gy = this.mouthY + 70;
      f.rect(gx - 1, gy, 3, 6).fill({ color: 0xffffff, alpha: 0.5 });
      f.rect(gx - 2, gy + 4, 5, 4).fill({ color: 0xffffff, alpha: 0.5 });
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

  private onboardingStep(): string | null {
    const s = this.ctx.save.seen;
    if (s.onboardingDone) return null;
    for (const id of ['aim', 'merge', 'upgrade', 'chains', 'line']) if (!s[`ob.${id}`]) return id;
    return null;
  }

  private updateTexts(): void {
    const run = this.run;
    const W = this.core.flask.w;
    const left = this.cx - W / 2;
    const res = this.core.res;
    this.resText.set(`RES X${res.toFixed(2)}`, res >= 2 ? '#fff2a0' : res > 1 ? '#c070ff' : '#6a5a7a');
    this.resText.position.set(left + W - this.resText.width, this.queueY + 2 - (this.resPulse > 0.5 ? 1 : 0));
    this.chainText.visible = this.chainShow > 0;
    this.chainText.position.set(Math.round(this.cx - this.chainText.width / 2), this.mouthY + 24);
    this.volOf.set(`${run.vol}/${run.volBought}`);
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
    this.pagesText.set(`${formatNum(this.per.pages)} PAGES`);
    const c = this.ctx.content();
    this.pagesText.position.set(c.x + c.w - 11 - this.pagesText.width, this.barY + 5);
    this.volUp.setEnabled(run.vol < run.volBought || run.volBought < VOL_MAX);
    this.volDown.setEnabled(run.vol > 0);
  }

  /** Tempered Glass bought: widen the flask now (the frame loop redraws when the width changes). */
  onImports(): void {
    this.core.refresh();
    if (this.core.flask.w !== this.flaskWDrawn) this.resize(this.ctx.layout);
  }

  destroy(): void {
    this.core.persist();
    this.root.destroy({ children: true });
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
