// The Cauldron's game logic without rendering: toadling pour, Ladles, Tosses, payouts, tickets
// and Batches. The scene drives it every frame; balance scripts drive it headless with a bot.
import {
  batchPayout,
  bucketMults,
  defaultRun,
  dropsPerSec,
  evPerDrop,
  goldCount,
  goldMult,
  heldMalice,
  ingValue,
  inZone,
  ladleCharges,
  ladleSecs,
  lvOf,
  newTicket,
  pickIngredient,
  rlvOf,
  rows,
  toadlings,
  tossCd,
  interval,
  type CPersistent,
  type CRun,
} from './econ';
import { Board, BOARD_W, COL_W, STEP, type Ball, type GoldPeg, type IngId, type Peg } from './sim';

export const MAX_BALLS = 60;
const CHARGE_S = 8;

export interface CoreHooks {
  earn(base: number): number;
  raiseSkill(level: number): void;
  land?(b: Ball, bucket: number, amount: number, mult: number): void;
  peg?(b: Ball, p: Peg): void;
  gold?(b: Ball, g: GoldPeg): void;
  ladle?(b: Ball, p: Peg): void;
  bump?(b: Ball, p: Peg): void;
  tick?(ing: IngId, bucket: number): void;
  batch?(payout: number, tokens: number): void;
  drop?(x: number, toadling: number): void;
  overflow?(amount: number): void;
}

export class CauldronCore {
  run: CRun;
  per: CPersistent;
  board: Board;
  hooks: CoreHooks;
  charges: number;
  chargeT = 0;
  tossT = 0;
  private acc = 0;
  private toadT: number[] = [];
  /** Where each toadling will tip its next ingredient (the scene walks them there). */
  toadX: number[] = [];
  private boardKey = '';
  private seed: number;
  private rnd: () => number;

  constructor(run: CRun, per: CPersistent, hooks: CoreHooks, seed = (Math.random() * 2 ** 31) | 0) {
    this.run = run;
    this.per = per;
    // Fill fields added after a save was written.
    const def = defaultRun();
    run.lv ??= {};
    run.stats = { ...def.stats, ...(run.stats ?? {}) };
    run.batchByMal ??= def.batchByMal;
    run.malice = Math.min(run.malice ?? 0, run.maliceBought ?? 0);
    per.rlv ??= {};
    per.tokens ??= 0;
    this.hooks = hooks;
    this.seed = seed;
    this.board = this.makeBoard();
    this.rnd = () => this.board.rand();
    this.charges = ladleCharges(run);
    if (!run.ticket) run.ticket = newTicket(run, this.rnd);
    if (!run.spoon || run.spoon.length < 2) run.spoon = [pickIngredient(run, this.rnd()), pickIngredient(run, this.rnd())];
    this.syncToadlings();
  }

  private key(): string {
    return `${rows(this.run)}|${this.run.malice}|${goldCount(this.run)}`;
  }

  private makeBoard(): Board {
    this.boardKey = this.key();
    return new Board({ rows: rows(this.run), malice: this.run.malice, gold: goldCount(this.run) }, this.seed++);
  }

  /** Rebuild the board after an upgrade or Malice change; balls in flight carry over. */
  refresh(): boolean {
    this.syncToadlings();
    this.charges = Math.min(this.charges, ladleCharges(this.run));
    if (this.key() === this.boardKey) return false;
    const old = this.board;
    this.board = this.makeBoard();
    this.board.balls = old.balls.filter((b) => b.alive);
    for (const b of this.board.balls) b.lastPeg = -1;
    this.board.t = old.t;
    return true;
  }

  private syncToadlings(): void {
    const n = toadlings(this.run);
    const iv = interval(lvOf(this.run, 'bribes'));
    while (this.toadT.length < n) {
      this.toadT.push((this.toadT.length / n) * iv + 0.3);
      this.toadX.push(3 + this.rnd() * (BOARD_W - 6));
    }
    this.toadT.length = n;
    this.toadX.length = n;
  }

  get tossCooldown(): number {
    return tossCd(rlvOf(this.per, 'quickToss'));
  }

  update(dt: number): void {
    // Ladle charges recharge one at a time.
    const maxC = ladleCharges(this.run);
    if (this.charges < maxC) {
      this.chargeT += dt;
      if (this.chargeT >= CHARGE_S) {
        this.chargeT = 0;
        this.charges++;
      }
    } else this.chargeT = 0;
    this.tossT = Math.max(0, this.tossT - dt);

    // Toadlings pour from random rail positions.
    const iv = interval(lvOf(this.run, 'bribes'));
    for (let i = 0; i < this.toadT.length; i++) {
      this.toadT[i] -= dt;
      if (this.toadT[i] <= 0) {
        this.toadT[i] += iv * (0.85 + this.rnd() * 0.3);
        this.toadlingDrop(i);
      }
    }

    this.acc += dt;
    const ev = {
      peg: (b: Ball, p: Peg) => this.hooks.peg?.(b, p),
      gold: (b: Ball, g: GoldPeg) => {
        this.run.stats.goldHits++;
        this.hooks.gold?.(b, g);
      },
      ladle: (b: Ball, p: Peg) => this.hooks.ladle?.(b, p),
      bump: (b: Ball, p: Peg) => this.hooks.bump?.(b, p),
      land: (b: Ball, k: number) => this.land(b, k),
    };
    let n = 0;
    while (this.acc >= STEP && n < 24) {
      this.acc -= STEP;
      this.board.step(ev);
      n++;
    }
    if (n >= 24) this.acc = 0;
  }

  private toadlingDrop(i: number): void {
    const ing = pickIngredient(this.run, this.rnd());
    if (this.board.balls.length >= MAX_BALLS) {
      // Over the cap: resolve instantly at the expected value.
      const amount = this.hooks.earn(evPerDrop(this.run));
      this.run.stats.drops++;
      this.hooks.overflow?.(amount);
      return;
    }
    const x = this.toadX[i];
    this.toadX[i] = 3 + this.rnd() * (BOARD_W - 6);
    this.board.drop(ing, x);
    this.hooks.drop?.(x, i);
  }

  /** Curse the nearest iron peg (board-local point) into a Ladle. */
  curse(p: Peg): boolean {
    if (this.charges <= 0 || p.kind !== 'iron') return false;
    if (p.ladleUntil > this.board.t) return false;
    this.charges--;
    p.ladleUntil = this.board.t + ladleSecs(this.run);
    this.run.stats.curses++;
    return true;
  }

  canToss(): boolean {
    return this.tossT <= 0;
  }

  /** Toss the spoon ingredient down chute k (0..8). */
  toss(k: number): IngId | null {
    if (!this.canToss()) return null;
    const ing = this.run.spoon[0];
    this.run.spoon = [this.run.spoon[1], pickIngredient(this.run, this.rnd())];
    this.tossT = this.tossCooldown;
    this.board.drop(ing, k * COL_W + COL_W / 2 + (this.rnd() - 0.5) * 2, true);
    return ing;
  }

  reroll(now: number): boolean {
    if (now < this.run.rerollAt) return false;
    this.run.ticket = newTicket(this.run, this.rnd);
    this.run.rerollAt = now + (60 - 10 * rlvOf(this.per, 'quickTix')) * 1000;
    return true;
  }

  private land(b: Ball, bucket: number): void {
    const run = this.run;
    const mults = bucketMults(run);
    const mult = mults[bucket] * (1 + (goldMult(run) - 1) * b.goldHits);
    const amount = this.hooks.earn(ingValue(run, b.ing) * mult);
    const s = run.stats;
    s.drops++;
    if (b.tossed) s.tossLands++;
    if (b.ladled && inZone(bucket, 1)) s.ladledLands++;
    if (b.goldHits >= 3) s.goldTriples++;
    if (bucket === 4) s.jackpots++;
    s.bestMult = Math.max(s.bestMult, mults[bucket]);
    this.hooks.land?.(b, bucket, amount, mult);

    const t = run.ticket;
    if (t && (b.tossed || b.ladled) && inZone(bucket, t.zone)) {
      const item = t.items.find((i) => i.ing === b.ing && i.got < i.n);
      if (item) {
        item.got++;
        s.ticks++;
        this.hooks.tick?.(b.ing, bucket);
        if (t.items.every((i) => i.got >= i.n)) this.completeBatch();
      }
    }
  }

  private completeBatch(): void {
    const run = this.run;
    const payout = this.hooks.earn(batchPayout(run, this.per));
    run.stats.batches++;
    run.batchByMal[run.malice] = (run.batchByMal[run.malice] ?? 0) + 1;
    this.per.tokens += 1;
    this.per.batchesLifetime += 1;
    this.hooks.raiseSkill(heldMalice(run));
    run.ticket = newTicket(run, this.rnd);
    this.hooks.batch?.(payout, 1);
  }

  /** Expected pour rate, for the HUD-like readouts. */
  get dropsPerSec(): number {
    return dropsPerSec(this.run);
  }
}
