// The Cauldron scene: the plinko board, toadling rail, buckets, pot, ticket and chute keys.
// Rendering is a few reusable Graphics plus a pooled Sprite per live ingredient.
import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { DeptCtx, DeptScene, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import type { Layout } from '../../core/layout';
import { formatNum } from '../../core/format';
import { PixelText, measure } from '../../ui/font';
import { Button, C, drawPanel } from '../../ui/widgets';
import { BUCKET_COL, ING_COLOR, ingTexture, PAL } from './art';
import {
  bucketMults,
  heldMalice,
  ladleSecs,
  lvOf,
  MALICE_MAX,
  maliceCost,
  rlvOf,
  rows,
  toadlings,
  UPGRADES,
  upLocked,
  upCost,
  type CPersistent,
  type CRun,
  type UpDef,
} from './econ';
import { CauldronCore, MAX_BALLS } from './logic';
import { BOARD_W, BUCKETS, COL_W, ROW_H, ROW_SLOTS, type IngId } from './sim';

const RAIL_H = 12;
const BOARD_H = 10 + (ROW_SLOTS - 1) * ROW_H + 12; // rail bottom -> landing line
const BUCKET_H = 16;
const POT_H = 32;
const CHUTE_H = 15;
const BTN_H = 15;

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

function fmtMult(m: number): string {
  if (m >= 1000) return formatNum(m);
  if (m >= 10) return `X${Math.floor(m)}`;
  const t = Math.floor(m * 10) / 10;
  // Four glyphs crowd an 18px bucket, so long decimals drop the X.
  return t % 1 === 0 ? `X${t.toFixed(0)}` : t.toFixed(1);
}

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
  private chutes: Button[] = [];
  private upBtn!: Button;
  private malDown!: Button;
  private malUp!: Button;
  private boardHit = new Container();
  private ticketHit = new Container();

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
  private sayCooldown = 0;

  constructor(ctx: DeptCtx) {
    this.ctx = ctx;
    this.run = ctx.save.run as CRun;
    this.per = ctx.save.persistent as CPersistent;
    this.core = new CauldronCore(this.run, this.per, {
      earn: (b) => ctx.earn(b),
      raiseSkill: (l) => ctx.raiseSkill(l),
      land: (b, k, amount, mult) => this.onLand(b.ing, b.tossed, b.ladled, b.x, k, amount, mult),
      gold: (b, g) => this.onGold(b.tossed, g.x, g.y),
      ladle: (b) => this.spark(b.x, b.y, PAL.ladleHi, 3),
      bump: (b) => this.spark(b.x, b.y, PAL.bumperHi, 3),
      tick: () => this.onTick(),
      batch: (p, t) => this.onBatch(p, t),
      drop: (_x, i) => (this.toadTip[i] = 0.25),
      overflow: (a) => (this.overflowAcc += a),
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
    for (let i = 0; i < 2; i++) {
      const icon = new Sprite();
      const text = new PixelText('', '#2a1a3a', null);
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
    );

    // Input: tap a peg to curse it.
    this.boardHit.eventMode = 'static';
    this.boardHit.on('pointerdown', (e: FederatedPointerEvent) => this.onBoardTap(e));
    this.root.addChild(this.boardHit);
    this.ticketHit.eventMode = 'static';
    this.ticketHit.cursor = 'pointer';
    this.ticketHit.on('pointertap', () => this.onTicketTap());
    this.root.addChild(this.ticketHit);

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
      this.chutes.push(b);
      this.root.addChild(b);
    }
    this.upBtn = new Button({ w: 72, h: BTN_H - 1, label: 'UPGRADES', color: C.gold, shade: 0x9a7a20, onTap: () => ctx.openUpgrades(this.groups()) });
    this.malDown = new Button({ w: 13, h: 10, label: '-', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.setMalice(this.run.malice - 1) });
    this.malUp = new Button({ w: 13, h: 10, label: '+', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => this.setMalice(this.run.malice + 1) });
    this.root.addChild(this.upBtn, this.malDown, this.malUp);

    const tex = ingTexture(ctx.game.app.renderer, 'newt');
    for (let i = 0; i < MAX_BALLS + 4; i++) {
      const s = new Sprite(tex);
      s.visible = false;
      s.roundPixels = true;
      this.pool.push(s);
      this.balls.addChild(s);
    }
    this.resize(ctx.layout);
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
    this.ticketHit.hitArea = new Rectangle(this.bx + BOARD_W - 58, this.potY, 58, POT_H);
    this.chutes.forEach((b, k) => b.position.set(this.bx + k * COL_W, this.chuteY));
    this.upBtn.position.set(this.bx, this.btnY);
    this.malDown.position.set(this.bx + 3, this.potY + 19);
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
    for (let k = 0; k < BUCKETS; k++) {
      const x = bx + k * COL_W;
      const tier = 4 - Math.abs(k - 4);
      g.rect(x, this.landY, COL_W, BUCKET_H).fill(PAL.ink);
      g.rect(x + 1, this.landY, COL_W - 2, BUCKET_H - 1).fill(BUCKET_COL[tier]);
      g.rect(x + 1, this.landY + BUCKET_H - 4, COL_W - 2, 3).fill({ color: 0x000000, alpha: 0.25 });
      const t = this.bucketText[k];
      t.set(fmtMult(mults[k]), tier === 4 ? '#fff2a0' : '#f4e8c1');
      t.position.set(x + Math.floor((COL_W - t.width) / 2) + 1, this.landY + 5);
    }
    // Pot well in the middle (spoon + ladles), Malice panel left, ticket right.
    drawPanel(g, bx, this.potY, 34, POT_H, 0x2a1a3a, 0x7a2a2a);
    const wx = bx + 37;
    const ww = BOARD_W - 37 - 61;
    g.rect(wx, this.potY, ww, POT_H).fill(PAL.ink);
    g.rect(wx + 1, this.potY + 1, ww - 2, POT_H - 2).fill(PAL.bileLo);
    g.rect(wx + 1, this.potY + 1, ww - 2, 3).fill(PAL.bile);
    drawPanel(g, bx + BOARD_W - 58, this.potY, 58, POT_H, 0xe8dcb0, 0x8a6a3a);

    this.spoonNow.position.set(wx + 5, this.potY + 7);
    this.nextText.position.set(wx + 16, this.potY + 8);
    this.spoonNext.position.set(wx + 33, this.potY + 7);
    this.overflowText.position.set(bx + BOARD_W - 30, this.railY - 8);
    this.drawPegs();
  }

  private drawPegs(): void {
    const g = this.pegG.clear();
    const R = rows(this.run);
    this.pegTop = this.boardTop + 10 + (ROW_SLOTS - R) * ROW_H;
    for (const p of this.core.board.pegs) {
      const x = this.bx + p.x;
      const y = this.pegTop + p.y;
      if (p.kind === 'bumper') {
        g.rect(x - 2, y - 2, 5, 5).fill(PAL.ink);
        g.rect(x - 1, y - 2, 3, 5).fill(PAL.bumper);
        g.rect(x - 2, y - 1, 5, 3).fill(PAL.bumper);
        g.rect(x - 1, y - 1, 1, 1).fill(PAL.bumperHi);
        g.rect(x - 3, y, 1, 1).fill(PAL.bumper);
        g.rect(x + 3, y, 1, 1).fill(PAL.bumper);
      } else {
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
    return {
      id: u.id,
      name: u.name,
      desc: () => u.desc(level()),
      level,
      max: u.max,
      cost: () => upCost(u, level()),
      currency: u.tokens ? 'Tokens' : undefined,
      locked: () => upLocked(u, this.ctx.save.cycle.n),
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

  private maliceEntry(): UpgradeEntry {
    const run = this.run;
    return {
      id: 'malice',
      name: 'Board Malice',
      desc: () => {
        const n = run.maliceBought + 1;
        return n > MALICE_MAX ? 'The nastiest board there is' : `Unlock Malice ${n}: bumper, center x${(1.2 ** n).toFixed(2)}`;
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
        this.afterBuy('malice');
      },
    };
  }

  private groups(): UpgradeGroup[] {
    const by = (b: string) => UPGRADES.filter((u) => u.branch === b).map((u) => this.entry(u));
    return [
      { name: 'Toads', entries: by('kitchen') },
      { name: 'Pantry', entries: by('pantry') },
      { name: 'Buckets', entries: by('buckets') },
      { name: 'Board', entries: [this.maliceEntry(), ...by('board')] },
      { name: 'Recipes', entries: by('recipes') },
    ];
  }

  private afterBuy(id: string): void {
    this.syncState();
    this.ctx.saveSoon();
    const say = (key: string, trigger = key) => {
      if (!this.ctx.seen(`m.${key}`)) {
        this.ctx.markSeen(`m.${key}`);
        this.ctx.say(trigger, { milestone: true });
      }
    };
    if (id === 'jackpot') say('jackpot1');
    if (id === 'hire' && toadlings(this.run) >= 4) say('fourToads');
    if (id === 'mandrake') say('mandrake');
    if (id === 'malice') {
      if (this.run.maliceBought >= 1) say('malice1');
      if (this.run.maliceBought >= 5) say('malice5');
      if (this.run.maliceBought >= 10) say('malice10');
    }
  }

  /** Re-read upgrade state: rebuild the board and labels when anything visible changed. */
  private syncState(): void {
    const key = `${JSON.stringify(this.run.lv)}|${this.run.malice}|${this.run.maliceBought}`;
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.core.refresh();
    this.drawStatic();
  }

  private setMalice(v: number): void {
    const n = Math.max(0, Math.min(this.run.maliceBought, v));
    if (n === this.run.malice) {
      if (v > this.run.maliceBought) {
        this.ctx.float(
          this.run.maliceBought >= MALICE_MAX ? 'MAXED' : `BUY IN UPGRADES: ${formatNum(maliceCost(this.run.maliceBought))}`,
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
  }

  // ---------- input ----------

  private onBoardTap(e: FederatedPointerEvent): void {
    const p = e.getLocalPosition(this.root);
    const peg = this.core.board.pegAt(p.x - this.bx, p.y - this.pegTop, 10);
    if (!peg) return;
    if (this.core.charges <= 0) {
      this.ctx.float('NO LADLES', p.x, p.y - 8, '#9c8aa8');
      return;
    }
    if (this.core.curse(peg)) {
      this.spark(peg.x, peg.y, PAL.ladle, 6);
      this.ctx.haptic(8);
      this.sayCooldown = 1.5;
    }
  }

  private onToss(k: number): void {
    const ing = this.core.toss(k);
    if (!ing) return;
    this.chuteFlash[k] = 1;
    this.sayCooldown = 1.5;
    this.ctx.haptic(5);
  }

  private onTicketTap(): void {
    if (this.core.reroll(Date.now())) {
      this.ctx.float('NEW ORDER', this.bx + BOARD_W - 29, this.potY - 6, C.goldText);
      this.lastTicketKey = '';
    }
  }

  // ---------- sim hooks (juice) ----------

  private onLand(ing: IngId, tossed: boolean, ladled: boolean, x: number, k: number, amount: number, mult: number): void {
    this.bucketFlash[k] = 1;
    this.brewAcc += amount;
    const sx = this.bx + k * COL_W + COL_W / 2;
    const color = parseInt(ING_COLOR[ing].slice(1), 16);
    for (let i = 0; i < 3; i++) {
      this.particles.push({ x: this.bx + x, y: this.landY, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.4, color });
    }
    const player = tossed || ladled;
    const big = mult >= 5;
    if ((player || big) && this.floatBudget >= 1) {
      this.floatBudget -= 1;
      this.ctx.float(`+${formatNum(amount)}`, sx, this.landY - 8, big ? '#fff2a0' : ING_COLOR[ing]);
    }
    if (player && big) {
      this.shake = 0.06;
      for (let i = 0; i < 8; i++) {
        this.particles.push({ x: sx, y: this.landY, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: 0.7, color: PAL.bileHi });
      }
      if (mult >= 10) {
        this.slowmo = 0.12;
        this.ctx.haptic(25);
        if (!this.ctx.seen('m.bigWin')) {
          this.ctx.markSeen('m.bigWin');
          this.ctx.say('bigWin', { milestone: true });
        }
      }
      if (k === 4 && this.sayCooldown <= 0) this.ctx.say('jackpot');
    }
    if (tossed && (k === 0 || k === 8) && Math.random() < 0.2) this.ctx.say('dregs');
    if (this.run.stats.goldTriples === 1 && !this.ctx.seen('m.goldTriple')) {
      this.ctx.markSeen('m.goldTriple');
      this.ctx.say('goldTriple', { milestone: true });
    }
  }

  private onGold(tossed: boolean, x: number, y: number): void {
    this.spark(x, y, PAL.goldHi, 4);
    if (tossed && this.floatBudget >= 1) {
      this.floatBudget -= 0.5;
      this.ctx.float(`+${50 + 10 * lvOf(this.run, 'polish')}%`, this.bx + x, this.pegTop + y - 8, C.goldText);
    }
  }

  private onTick(): void {
    this.ticketPulse = 1;
    this.lastTicketKey = '';
    this.ctx.float('{up}', this.bx + BOARD_W - 29, this.potY - 4, '#8fd14f');
  }

  private onBatch(payout: number, tokens: number): void {
    const cx = this.bx + 37 + Math.floor((BOARD_W - 98) / 2);
    this.ctx.float(`BATCH! +${formatNum(payout)}`, cx, this.potY - 14, '#fff2a0');
    this.ctx.float(`+${tokens} TOKEN`, cx, this.potY - 4, C.goldText);
    this.ctx.haptic(30);
    this.shake = 0.1;
    for (let i = 0; i < 20; i++) {
      this.particles.push({ x: cx + (Math.random() - 0.5) * 20, y: this.potY + 4, vx: (Math.random() - 0.5) * 50, vy: -50 - Math.random() * 60, life: 0.9, color: i % 3 ? PAL.bileHi : PAL.bile });
    }
    this.lastTicketKey = '';
    if (!this.ctx.seen('m.firstBatch')) {
      this.ctx.markSeen('m.firstBatch');
      this.ctx.say('firstBatch', { milestone: true });
    } else if (this.per.tokens >= 2 && !this.ctx.seen('m.tokens')) {
      this.ctx.markSeen('m.tokens');
      this.ctx.say('tokens', { milestone: true });
    } else this.ctx.say('batch');
    this.ctx.saveSoon();
  }

  private spark(bx: number, by: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 25;
      this.particles.push({ x: this.bx + bx, y: this.pegTop + by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3, color });
    }
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.time += dt;
    this.sayCooldown -= dt;
    this.floatBudget = Math.min(6, this.floatBudget + dt * 5);
    let simDt = dt;
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      simDt = dt * 0.25;
    }
    this.core.update(simDt);

    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      this.syncState();
      this.checkMilestones();
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

    if (this.sayCooldown <= 0 && Math.random() < dt / 60) this.ctx.say('ambient');
  }

  private checkMilestones(): void {
    const s = this.ctx.save.seen;
    if (s['ob.gold'] && !s['m.farewell']) {
      s['m.farewell'] = 1;
      this.ctx.say('farewell', { milestone: true });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
    for (let k = 0; k < BUCKETS; k++) {
      this.bucketFlash[k] = Math.max(0, this.bucketFlash[k] - dt * 5);
      this.chuteFlash[k] = Math.max(0, this.chuteFlash[k] - dt * 3);
    }
    this.ticketPulse = Math.max(0, this.ticketPulse - dt * 3);
  }

  private onboardingStep(): string | null {
    const s = this.ctx.save.seen;
    if (s.onboardingDone) return null;
    for (const id of ['curse', 'upgrade', 'toss', 'ticket', 'gold']) if (!s[`ob.${id}`]) return id;
    return null;
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

    // Peg flashes, Ladles, gold pegs.
    for (const p of board.pegs) {
      const x = bx + p.x;
      const y = this.pegTop + p.y;
      if (p.ladleUntil > t) {
        const left = p.ladleUntil - t;
        const frac = left / ladleSecs(this.run);
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
      g.rect(x - 1, y - 3, 3, 7).fill(PAL.ink);
      g.rect(x - 3, y - 1, 7, 3).fill(PAL.ink);
      g.rect(x - 2, y - 2, 5, 5).fill(PAL.ink);
      g.rect(x, y - 2, 1, 5).fill(hit ? 0xffffff : PAL.gold);
      g.rect(x - 2, y, 5, 1).fill(hit ? 0xffffff : PAL.gold);
      g.rect(x - 1, y - 1, 3, 3).fill(hit ? 0xffffff : PAL.gold);
      g.rect(x - 1, y - 1, 1, 1).fill(PAL.goldHi);
    }

    // Bucket flashes.
    for (let k = 0; k < BUCKETS; k++) {
      if (this.bucketFlash[k] <= 0) continue;
      g.rect(bx + k * COL_W + 1, this.landY, COL_W - 2, BUCKET_H - 1).fill({ color: 0xffffff, alpha: this.bucketFlash[k] * 0.45 });
    }

    // Pot well: bubbling bile, faster when brewing more.
    const wx = bx + 37;
    const ww = BOARD_W - 98;
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
    // Spoon backdrop + Ladle charges as little ladle icons.
    g.rect(wx + 3, this.potY + 5, 11, 11).fill({ color: 0x000000, alpha: 0.35 });
    const maxC = this.core.maxCharges;
    const ly = this.potY + 21;
    for (let i = 0; i < maxC; i++) {
      const x = wx + 4 + i * 7;
      const full = i < this.core.charges;
      const col = full ? PAL.ladleHi : 0x3a5a1a;
      g.rect(x, ly, 4, 3).fill(PAL.ink);
      g.rect(x + 1, ly, 2, 2).fill(col);
      g.rect(x + 4, ly - 2, 1, 3).fill(full ? PAL.ironHi : PAL.ironLo);
      if (!full && i === this.core.charges) {
        const fr = this.core.chargeT / 8;
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

    // Ticket pulse outline.
    if (this.ticketPulse > 0) {
      const tx = bx + BOARD_W - 58;
      f.rect(tx - 1, this.potY - 1, 60, 1).fill(PAL.goldHi);
      f.rect(tx - 1, this.potY + POT_H, 60, 1).fill(PAL.goldHi);
      f.rect(tx - 1, this.potY - 1, 1, POT_H + 2).fill(PAL.goldHi);
      f.rect(tx + 58, this.potY - 1, 1, POT_H + 2).fill(PAL.goldHi);
    }

    // Onboarding highlight: a pulsing 1px outline on the thing to tap.
    const step = this.onboardingStep();
    if (step && pulse) {
      const hl = (x: number, y: number, w: number, h: number) => {
        f.rect(x - 2, y - 2, w + 4, 1).fill(0xffffff);
        f.rect(x - 2, y + h + 1, w + 4, 1).fill(0xffffff);
        f.rect(x - 2, y - 2, 1, h + 4).fill(0xffffff);
        f.rect(x + w + 1, y - 2, 1, h + 4).fill(0xffffff);
      };
      if (step === 'curse') {
        const R = rows(this.run);
        const row = board.rowPegs[Math.floor(R / 2) - 1];
        const p = row?.find((q) => q.x < BOARD_W / 2 - 20 && q.x > BOARD_W / 2 - 40) ?? row?.[1];
        if (p && p.ladleUntil <= t) hl(bx + p.x - 3, this.pegTop + p.y - 3, 7, 7);
      } else if (step === 'upgrade') hl(this.upBtn.x, this.upBtn.y, 72, BTN_H);
      else if (step === 'toss') hl(this.bx + 4 * COL_W, this.chuteY, COL_W - 1, CHUTE_H);
      else if (step === 'ticket') hl(bx + BOARD_W - 58, this.potY, 58, POT_H);
    }

    // Particles.
    for (const p of this.particles) {
      f.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill(p.color);
    }
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
      s.tint = b.ladled ? 0xd8ffb0 : 0xffffff;
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

    // Ticket.
    const tk = run.ticket;
    const ready = Date.now() >= run.rerollAt;
    const wait = Math.ceil((run.rerollAt - Date.now()) / 1000);
    const key = tk ? `${tk.zone}|${tk.items.map((i) => `${i.ing}${i.got}/${i.n}`).join(',')}|${ready ? 'r' : wait}|${run.malice}|${this.stateKey}` : '';
    if (key === this.lastTicketKey) return;
    this.lastTicketKey = key;
    const tx = this.bx + BOARD_W - 58;
    if (!tk) return;
    const mults = bucketMults(run);
    const zoneLabel = tk.zone === 0 ? 'CENTER' : `${fmtMult(mults[4 - tk.zone])}+`;
    this.ticketHead.set(`ORDER ${zoneLabel}`, '#7a2a2a');
    this.ticketHead.position.set(tx + 4, this.potY + 4);
    tk.items.forEach((it, i) => {
      const slot = this.ticketItems[i];
      if (!slot) return;
      slot.icon.texture = ingTexture(renderer, it.ing);
      slot.icon.visible = true;
      slot.icon.position.set(tx + 4 + i * 27, this.potY + 12);
      const done = it.got >= it.n;
      slot.text.set(`${it.got}/${it.n}`, done ? '#3a7a28' : '#2a1a3a');
      slot.text.visible = true;
      slot.text.position.set(tx + 13 + i * 27, this.potY + 13);
    });
    for (let i = tk.items.length; i < this.ticketItems.length; i++) {
      this.ticketItems[i].icon.visible = false;
      this.ticketItems[i].text.visible = false;
    }
    this.ticketFoot.set(ready ? 'TAP: NEW' : `NEW IN ${wait}S`, ready ? '#7a5a2a' : '#a08a6a');
    this.ticketFoot.position.set(tx + 4, this.potY + 22);
    const m = measure(this.ticketFoot.text);
    if (m.w > 50) this.ticketFoot.set(`${wait}S`);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
