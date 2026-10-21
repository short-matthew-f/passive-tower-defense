// The Cauldron's game logic without rendering: toadling pour, Ladles, Tosses, payouts, tickets
// and Batches. The scene drives it every frame; balance scripts drive it headless with a bot.
import {
  allFactor,
  batchPayout,
  bestChute,
  boardConfig,
  boneFrac,
  bucketMults,
  dropsPerSec,
  evPerDrop,
  fillRun,
  goldCount,
  goldMult,
  heldMalice,
  ingValue,
  inZone,
  interval,
  ladleCharges,
  ladleSecs,
  lvOf,
  newTicket,
  pickIngredient,
  rlvOf,
  rows,
  SLOP_MULT,
  taughtShare,
  ticketsOf,
  tiersOf,
  toadlings,
  tossCd,
  type CPersistent,
  type CRun,
  type Ticket,
} from './econ';
import { Board, BOARD_W, BUCKETS, COL_W, RUNE_MULT, SPECIALS, STEP, type Ball, type GoldPeg, type IngId, type Peg } from './sim';

export const MAX_BALLS = 60;
/** Live pieces including Splitroot / thorn halves and the Hopper rain (render pool size). */
export const MAX_LIVE = 96;
export const CHARGE_S = 8;
/** Pumpkin Hex: a hexed bucket pays double for this long (seasonal, 05 §15). */
export const HEX_S = 5;

/** Halloween week (Oct 24 - Nov 7): Granny's spoon may hold a Pumpkin Hex. */
export function pumpkinSeason(ms: number): boolean {
  const d = new Date(ms);
  const m = d.getMonth();
  const day = d.getDate();
  return (m === 9 && day >= 24) || (m === 10 && day <= 7);
}

export interface CoreHooks {
  earn(base: number): number;
  raiseSkill(level: number): void;
  land?(b: Ball, bucket: number, amount: number, mult: number): void;
  peg?(b: Ball, p: Peg): void;
  gold?(b: Ball, g: GoldPeg): void;
  ladle?(b: Ball, p: Peg): void;
  bump?(b: Ball, p: Peg): void;
  bone?(b: Ball, p: Peg, amount: number): void;
  rune?(b: Ball, p: Peg): void;
  split?(b: Ball, parts: Ball[]): void;
  boom?(b: Ball, lit: GoldPeg[]): void;
  spill?(b: Ball, side: number, amount: number): void;
  tick?(ing: IngId, bucket: number, ticket: number): void;
  batch?(payout: number, tokens: number, sock: boolean): void;
  drop?(x: number, toadling: number): void;
  overflow?(amount: number): void;
  hopper?(bucket: number): void;
  /** Wall clock (ms) for seasonal content. Absent (the balance sim) = no seasonal content. */
  now?(): number;
  /** DeptSave.imports (Goods, 00 §4): read live, so a purchase applies at once. */
  imports?: Record<string, number>;
}

export class CauldronCore {
  run: CRun;
  per: CPersistent;
  board: Board;
  hooks: CoreHooks;
  charges: number;
  chargeT = 0;
  tossT = 0;
  /** Pumpkin Hex: sim time until which each bucket pays double. */
  hexUntil = new Array(BUCKETS).fill(0);
  private acc = 0;
  private toadT: number[] = [];
  /** Where each toadling will tip its next ingredient (the scene walks them there). */
  toadX: number[] = [];
  private boardKey = '';
  private seed: number;
  private rnd: () => number;
  private aimChute = 4;

  constructor(run: CRun, per: CPersistent, hooks: CoreHooks, seed = (Math.random() * 2 ** 31) | 0) {
    this.run = run;
    this.per = per;
    // Fill fields added after a save was written.
    fillRun(run, per);
    if (!run.layout && per.layout) run.layout = per.layout;
    this.hooks = hooks;
    this.seed = seed;
    this.board = this.makeBoard();
    this.rnd = () => this.board.rand();
    this.charges = ladleCharges(run, this.sigils);
    if (!run.ticket) run.ticket = newTicket(run, this.rnd);
    if (ticketsOf(per) > 1 && !run.ticket2) run.ticket2 = newTicket(run, this.rnd);
    if (!run.spoon || run.spoon.length < 2) run.spoon = [this.pickSpoon(), this.pickSpoon()];
    this.syncToadlings();
    this.aimChute = lvOf(run, 'taught') > 0 ? bestChute(run) : 4;
  }

  /** Contraband import level (Smuggled Spice). */
  get exotic(): number {
    return this.hooks.imports?.contraband ?? 0;
  }

  /** Essence import level (Ladle Sigils). */
  get sigils(): number {
    return this.hooks.imports?.essence ?? 0;
  }

  get maxCharges(): number {
    return ladleCharges(this.run, this.sigils);
  }

  /** Every ticket on screen (1, or 2 with Double Order). */
  tickets(): Ticket[] {
    const out: Ticket[] = [];
    if (this.run.ticket) out.push(this.run.ticket);
    if (ticketsOf(this.per) > 1) {
      if (!this.run.ticket2) this.run.ticket2 = newTicket(this.run, this.rnd);
      out.push(this.run.ticket2);
    }
    return out;
  }

  private key(): string {
    const c = boardConfig(this.run);
    return `${c.rows}|${c.malice}|${c.gold}|${c.bone}|${c.rune}|${c.thorn}|${c.layout}|${c.goalX}`;
  }

  private makeBoard(): Board {
    this.boardKey = this.key();
    return new Board(boardConfig(this.run), this.seed++);
  }

  /** Rebuild the board after an upgrade or Malice change; balls in flight carry over. */
  refresh(): boolean {
    this.syncToadlings();
    this.charges = Math.min(this.charges, this.maxCharges);
    if (ticketsOf(this.per) > 1 && !this.run.ticket2) this.run.ticket2 = newTicket(this.run, this.rnd);
    if (this.key() === this.boardKey) return false;
    const old = this.board;
    this.board = this.makeBoard();
    this.board.balls = old.balls.filter((b) => b.alive);
    for (const b of this.board.balls) b.lastPeg = -1;
    this.board.t = old.t;
    this.aimChute = lvOf(this.run, 'taught') > 0 ? bestChute(this.run) : 4;
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

  private pickSpoon(): IngId {
    const now = this.hooks.now?.();
    if (now !== undefined && pumpkinSeason(now) && this.rnd() < 0.08) return 'pumpkin';
    return pickIngredient(this.run, this.rnd(), this.exotic);
  }

  update(dt: number): void {
    // Ladle charges recharge one at a time.
    const maxC = this.maxCharges;
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
        if (!b.hopper) this.run.stats.goldHits++;
        this.hooks.gold?.(b, g);
      },
      ladle: (b: Ball, p: Peg) => this.hooks.ladle?.(b, p),
      bump: (b: Ball, p: Peg) => this.hooks.bump?.(b, p),
      bone: (b: Ball, p: Peg) => this.bone(b, p),
      rune: (b: Ball, p: Peg) => this.hooks.rune?.(b, p),
      split: (b: Ball, parts: Ball[]) => this.hooks.split?.(b, parts),
      boom: (b: Ball, lit: GoldPeg[]) => this.hooks.boom?.(b, lit),
      spill: (b: Ball, side: number) => this.spill(b, side),
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
    const ing = pickIngredient(this.run, this.rnd(), this.exotic);
    if (this.board.balls.length >= MAX_BALLS) {
      // Over the cap: resolve instantly at the expected value.
      const amount = this.hooks.earn(evPerDrop(this.run, this.exotic));
      this.run.stats.drops++;
      this.hooks.overflow?.(amount);
      return;
    }
    let x = this.toadX[i];
    // Taught Toadlings: a share of drops aim at the best chute +-1 (05 §5).
    const a = taughtShare(this.run);
    if (a > 0 && this.rnd() < a) {
      const k = Math.max(0, Math.min(BUCKETS - 1, this.aimChute + Math.floor(this.rnd() * 3) - 1));
      x = k * COL_W + COL_W / 2 + (this.rnd() - 0.5) * 2;
    }
    this.toadX[i] = 3 + this.rnd() * (BOARD_W - 6);
    this.board.drop(ing, x);
    this.hooks.drop?.(x, i);
  }

  /** Curse a peg (board-local) into a Ladle. */
  curse(p: Peg): boolean {
    if (this.charges <= 0 || (p.kind !== 'iron' && p.kind !== 'bone')) return false;
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
    this.run.spoon = [this.run.spoon[1], this.pickSpoon()];
    this.tossT = this.tossCooldown;
    this.board.drop(ing, k * COL_W + COL_W / 2 + (this.rnd() - 0.5) * 2, true);
    return ing;
  }

  /** Free swap of the spoon's current and next ingredient (once per ticket, 05 §11). */
  swapSpoon(): boolean {
    const s = this.run.spoon;
    if (s.length < 2 || s[0] === s[1]) return false;
    this.run.spoon = [s[1], s[0]];
    return true;
  }

  /** Hopper ritual rain (05 §13): ingredients that land for the ritual score only. */
  hopperDrop(x: number): Ball | null {
    if (this.board.balls.length >= MAX_LIVE - 8) return null;
    const b = this.board.drop(pickIngredient(this.run, this.rnd(), this.exotic), x);
    b.hopper = true;
    return b;
  }

  /** New ticket on slot i (0 or 1) if the free reroll is ready. */
  reroll(now: number, i = 0): boolean {
    if (now < this.run.rerollAt) return false;
    const t = newTicket(this.run, this.rnd);
    if (i === 1 && ticketsOf(this.per) > 1) this.run.ticket2 = t;
    else this.run.ticket = t;
    this.run.rerollAt = now + (60 - 10 * rlvOf(this.per, 'quickTix')) * 1000;
    return true;
  }

  private bone(b: Ball, p: Peg): void {
    if (b.hopper) return;
    const amount = this.hooks.earn(ingValue(this.run, b.ing) * b.scale * boneFrac(lvOf(this.run, 'bone')));
    this.run.stats.boneHits++;
    this.hooks.bone?.(b, p, amount);
  }

  private spill(b: Ball, side: number): void {
    if (b.hopper) return;
    const amount = this.hooks.earn(ingValue(this.run, b.ing) * b.scale * SLOP_MULT * allFactor(this.run));
    this.run.stats.spills++;
    this.run.stats.drops++;
    this.hooks.spill?.(b, side, amount);
  }

  private land(b: Ball, bucket: number): void {
    if (b.hopper) {
      this.hooks.hopper?.(bucket);
      return;
    }
    const run = this.run;
    const mults = bucketMults(run);
    const tiers = tiersOf(run);
    const hex = this.hexUntil[bucket] > this.board.t ? 2 : 1;
    const mult = mults[bucket] * (1 + (goldMult(run) - 1) * b.goldHits) * (b.rune ? RUNE_MULT : 1) * hex;
    const amount = this.hooks.earn(ingValue(run, b.ing) * b.scale * mult);
    const s = run.stats;
    s.drops++;
    if (b.tossed) s.tossLands++;
    const inner = inZone(bucket, 1, tiers);
    if (b.ladled && inner) {
      s.ladledLands++;
      if (run.malice >= 1) s.ladledMal++;
    }
    if (b.goldHits >= 3) s.goldTriples++;
    if (tiers[bucket] === 4) s.jackpots++;
    if (SPECIALS.includes(b.ing) && b.ing !== 'mandrake') s.specials++;
    s.bestMult = Math.max(s.bestMult, mults[bucket]);
    if (b.ing === 'pumpkin') this.hexUntil[bucket] = this.board.t + HEX_S;
    this.hooks.land?.(b, bucket, amount, mult);

    if (!(b.tossed || b.ladled) || b.group?.ticked) return;
    const list = this.tickets();
    for (let ti = 0; ti < list.length; ti++) {
      const t = list[ti];
      if (!inZone(bucket, t.zone, tiers)) continue;
      if (b.ing === 'sock') {
        // The Sock doubles the Batch it goes into (05 §5); it fills no line itself.
        if (!t.sock) {
          t.sock = true;
          s.socks++;
          this.hooks.tick?.(b.ing, bucket, ti);
          return;
        }
        continue;
      }
      const item = t.items.find((i) => i.ing === b.ing && i.got < i.n);
      if (!item) continue;
      if (b.group) b.group.ticked = true;
      item.got++;
      s.ticks++;
      this.hooks.tick?.(b.ing, bucket, ti);
      if (t.items.every((i) => i.got >= i.n)) this.completeBatch(ti);
      return;
    }
  }

  private completeBatch(slot: number): void {
    const run = this.run;
    const t = slot === 1 ? run.ticket2 : run.ticket;
    const sock = !!t?.sock;
    const payout = this.hooks.earn(batchPayout(run, this.per, this.exotic, sock));
    run.stats.batches++;
    run.batchByMal[run.malice] = (run.batchByMal[run.malice] ?? 0) + 1;
    this.per.tokens += 1;
    this.per.batchesLifetime += 1;
    this.hooks.raiseSkill(heldMalice(run));
    const next = newTicket(run, this.rnd);
    if (slot === 1) run.ticket2 = next;
    else run.ticket = next;
    this.hooks.batch?.(payout, 1, sock);
  }

  /** Expected pour rate, for the HUD-like readouts. */
  get dropsPerSec(): number {
    return dropsPerSec(this.run);
  }

  /** Board state that changes the cached EV (for the scene's redraw check). */
  get boardHash(): string {
    return `${rows(this.run)}|${goldCount(this.run)}|${this.boardKey}`;
  }
}
