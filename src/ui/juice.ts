// The shared juice kit (fun plan A2): number pops sized by magnitude, the purchase "ka-ching",
// tiered screen shake, hit-stop and coins that fly to the HUD. One instance lives on the Game
// (`game.juice`), drawn in its own layer above modals (so pops show over the upgrade sheet).
//
// Performance rules: everything is pooled (PixelTexts, flash rects, coins); nothing allocates per
// frame; a PixelText is created once and re-used with .set(); the layer is torn down with
// destroyTree. Coins share one GraphicsContext that is never destroyed.
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { Game } from '../core/game';
import { coreMult, safeIdleRate } from '../core/economy';
import { formatNum } from '../core/format';
import { sfx } from '../core/audio';
import { PixelText } from './font';
import { destroyTree } from './destroy';

/** 0 small, 1 medium, 2 big, 3 huge. */
export type PopTier = 0 | 1 | 2 | 3;

/** Pixel scale per tier (integer, so text stays crisp). */
export const TIER_SCALE = [1, 1, 2, 3] as const;
const TIER_LIFE = [0.8, 1.0, 1.25, 1.6];
const TIER_COLOR = ['#f4e8c1', '#ffe27a', '#ffcf3a', '#ffffff'];

/**
 * A pop's tier from its size relative to a reference (typically ~5 s of the department's idle
 * income): under 1x small, under 5x medium, under 50x big, else huge. Pure (tested).
 */
export function popTier(amount: number, ref: number): PopTier {
  if (!(amount > 0) || !Number.isFinite(amount)) return 0;
  if (!(ref > 0) || !Number.isFinite(ref)) return 0;
  const r = amount / ref;
  if (r < 1) return 0;
  if (r < 5) return 1;
  if (r < 50) return 2;
  return 3;
}

/** Shake amplitude in logical px per tier (1-3). */
export const SHAKE_PX = [0, 2, 4, 6] as const;
const SHAKE_DUR = [0, 0.15, 0.25, 0.4];
export const HIT_STOP_MAX_MS = 120;

interface Pop {
  t: PixelText;
  life: number;
  max: number;
  vy: number;
  scale: number;
  x: number;
  y: number;
}

interface Flash {
  g: Graphics;
  life: number;
  max: number;
  peak: number;
}

interface Coin {
  g: Graphics;
  t: number;
  dur: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  step: number;
  onLand: (() => void) | null;
}

const MAX_POPS = 40;
const MAX_FLASH = 8;
const MAX_COINS = 24;

let coinCtx: GraphicsContext | null = null;
/** One shared 4x4 coin shape (never destroyed: destroyTree leaves external contexts alone). */
function coinContext(): GraphicsContext {
  if (!coinCtx) {
    coinCtx = new GraphicsContext()
      .rect(-2, -1, 4, 2)
      .fill(0xe8c04a)
      .rect(-1, -2, 2, 4)
      .fill(0xe8c04a)
      .rect(-1, -1, 1, 1)
      .fill(0xfff4b0)
      .rect(1, 0, 1, 1)
      .fill(0xa07a20);
  }
  return coinCtx;
}

export interface PopOpts {
  /** Force a tier; else from `amount` / `ref`. */
  tier?: PopTier;
  color?: string;
  /** Magnitude for the tier (popValue sets it). */
  amount?: number;
  /** Reference for the tier (default ~5 s of the open department's idle income). */
  ref?: number;
  /** Auto-shake on huge pops (default true). */
  shake?: boolean;
}

export class Juice {
  readonly layer = new Container();
  private game: Game;
  private pops: Pop[] = [];
  private popPool: PixelText[] = [];
  private flashes: Flash[] = [];
  private flashPool: Graphics[] = [];
  private coins: Coin[] = [];
  private coinPool: Graphics[] = [];
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeDur = 0;
  private shakeModal = false;
  private shaking = false;
  private freezeUntil = 0;
  private buyStep = 0;
  private buyAt = 0;
  private refRate = 0;
  private refAt = -Infinity;
  /** 0..1, set to 1 when a flying coin lands and decaying: a HUD can pulse its bank with it. */
  bankPulse = 0;
  /** Where coins fly by default (logical px); the HUD may set its bank position here. */
  coinTarget: { x: number; y: number } | null = null;
  private reduced = false;

  constructor(game: Game) {
    this.game = game;
    this.layer.eventMode = 'none';
    try {
      this.reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      this.reduced = false;
    }
  }

  // ---------- number pops ----------

  /** ~5 s of the open department's idle income (refreshed at 2 Hz), the default pop reference. */
  private ref(): number {
    const now = performance.now();
    if (now - this.refAt > 500) {
      this.refAt = now;
      const g = this.game;
      const id = g.current;
      const def = id !== 'throne' ? g.defs[id] : undefined;
      const d = id !== 'throne' ? g.save?.depts[id] : undefined;
      this.refRate = def && d ? safeIdleRate(def, d) * coreMult(g.save, id as never, g.defs, Date.now()) : 0;
    }
    return this.refRate * 5;
  }

  /** A floating number/label at (x, y) logical px, sized by tier. Returns the tier used. */
  pop(text: string, x: number, y: number, opts: PopOpts = {}): PopTier {
    const tier: PopTier = opts.tier ?? (opts.amount !== undefined ? popTier(opts.amount, opts.ref ?? this.ref()) : 0);
    if (this.pops.length >= MAX_POPS) this.releasePop(0);
    const t = this.popPool.pop() ?? new PixelText();
    t.set(text, opts.color ?? TIER_COLOR[tier]);
    t.anchor.set(0.5, 1);
    t.alpha = 1;
    t.visible = true;
    const scale = TIER_SCALE[tier];
    // Punch in: one size up for the first frames.
    t.scale.set(scale + (tier > 0 ? 1 : 0));
    const L = this.game.layout;
    const half = (t.texture.frame.width * scale) / 2;
    const px = Math.max(L.safe.l + half + 1, Math.min(L.w - L.safe.r - half - 1, x));
    t.position.set(Math.round(px), Math.round(y));
    this.layer.addChild(t);
    this.pops.push({ t, life: TIER_LIFE[tier], max: TIER_LIFE[tier], vy: -(14 + tier * 6), scale, x: px, y });
    if (tier === 3 && opts.shake !== false) this.shake(1);
    return tier;
  }

  /** A "+1.2K" pop for an amount, tier from its size relative to `ref` (default: 5 s of idle). */
  popValue(amount: number, x: number, y: number, opts: Omit<PopOpts, 'amount'> & { prefix?: string; suffix?: string } = {}): PopTier {
    const notation = this.game.save?.meta.settings.notation ?? 'suffix';
    const text = `${opts.prefix ?? '+'}${formatNum(amount, notation)}${opts.suffix ?? ''}`;
    return this.pop(text, x, y, { ...opts, amount });
  }

  private releasePop(i: number): void {
    const p = this.pops[i];
    this.pops[i] = this.pops[this.pops.length - 1];
    this.pops.pop();
    if (p.t.destroyed) return;
    if (this.popPool.length >= 16) {
      destroyTree(p.t);
      return;
    }
    p.t.visible = false;
    this.layer.removeChild(p.t);
    this.popPool.push(p.t);
  }

  // ---------- flashes ----------

  /** A white (or colored) rectangle flash that fades out over `dur` seconds. */
  flash(x: number, y: number, w: number, h: number, color = 0xffffff, dur = 0.25, peak = 0.6): void {
    if (this.flashes.length >= MAX_FLASH) {
      const f = this.flashes.shift()!;
      this.recycleFlash(f.g);
    }
    const g = this.flashPool.pop() ?? new Graphics();
    g.clear().rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill(color);
    g.alpha = peak;
    g.visible = true;
    this.layer.addChildAt(g, 0);
    this.flashes.push({ g, life: dur, max: dur, peak });
  }

  private recycleFlash(g: Graphics): void {
    if (g.destroyed) return;
    g.visible = false;
    this.layer.removeChild(g);
    if (this.flashPool.length < MAX_FLASH) this.flashPool.push(g);
    else destroyTree(g);
  }

  // ---------- purchase ----------

  /**
   * The purchase "ka-ching": a flash over the bought row / button, a pop, a rising-pitch chime
   * (consecutive buys climb a ladder) and a haptic tick (works on iOS when called from the tap).
   * `levels` = levels bought in this tap; 10+ is a medium pop, a MAX of 25+ big.
   */
  kaChing(x: number, y: number, w: number, h: number, text: string, levels = 1): void {
    const now = performance.now();
    this.buyStep = now - this.buyAt < 1500 ? this.buyStep + 1 : 0;
    this.buyAt = now;
    const tier: PopTier = levels >= 25 ? 2 : levels >= 10 ? 1 : 0;
    this.flash(x, y, w, h, 0xfff4b0, 0.22, 0.55);
    this.pop(text, x + w / 2, y, { tier, color: tier ? undefined : '#8fd14f' });
    if (tier >= 2) sfx.bigWin();
    else sfx.buy(this.buyStep);
    this.game.haptic(tier >= 2 ? 25 : 12);
    if (tier >= 2) this.shake(1);
  }

  // ---------- shake and hit-stop ----------

  /** Decaying 2D screen shake: tier 1-3 = 2/4/6 px (or `px` exactly). `modal` also shakes the
   * modal layer (Fall card); by default the scene, HUD and floats shake and sheets stay still. */
  shake(tier: 1 | 2 | 3, opts: { px?: number; dur?: number; modal?: boolean } = {}): void {
    let amp = opts.px ?? SHAKE_PX[tier];
    if (this.reduced) amp = Math.min(amp, 1);
    const dur = opts.dur ?? SHAKE_DUR[tier];
    // A stronger shake replaces a weaker one; a weaker one never cuts a stronger one short.
    const left = this.shakeDur > 0 ? this.shakeAmp * (1 - this.shakeT / this.shakeDur) : 0;
    if (amp < left) return;
    this.shakeAmp = amp;
    this.shakeDur = dur;
    this.shakeT = 0;
    this.shakeModal = !!opts.modal;
  }

  /** Freeze the open scene's update for `ms` (max 120): the "boss stop" on big hits. */
  hitStop(ms: number): void {
    const until = performance.now() + Math.max(0, Math.min(HIT_STOP_MAX_MS, ms));
    if (until > this.freezeUntil) this.freezeUntil = until;
  }

  /** True while a hit-stop holds (the Game skips the scene update). */
  frozen(): boolean {
    return this.freezeUntil > 0 && performance.now() < this.freezeUntil;
  }

  // ---------- coins ----------

  /**
   * `n` coins burst from (x, y) and arc to the HUD bank (or `to`), each landing with a coin tick
   * and a bank pulse; `onLand` runs once when the first coin lands.
   */
  coinFly(x: number, y: number, n = 5, opts: { to?: { x: number; y: number }; onLand?: () => void } = {}): void {
    const L = this.game.layout;
    const to = opts.to ?? this.coinTarget ?? { x: L.safe.l + 34, y: L.safe.t + 7 };
    const count = Math.max(1, Math.min(12, Math.floor(n)));
    let first = opts.onLand ?? null;
    for (let i = 0; i < count; i++) {
      if (this.coins.length >= MAX_COINS) break;
      const g = this.coinPool.pop() ?? new Graphics(coinContext());
      g.visible = true;
      g.position.set(x, y);
      this.layer.addChild(g);
      const spread = (i - (count - 1) / 2) * 6;
      this.coins.push({
        g,
        t: -i * 0.04,
        dur: 0.55 + Math.random() * 0.15,
        x0: x,
        y0: y,
        cx: x + spread + (Math.random() * 2 - 1) * 10,
        cy: Math.min(y, to.y) - 24 - Math.random() * 16,
        x1: to.x,
        y1: to.y,
        step: i,
        onLand: first,
      });
      first = null;
    }
  }

  private recycleCoin(i: number): void {
    const c = this.coins[i];
    this.coins[i] = this.coins[this.coins.length - 1];
    this.coins.pop();
    if (c.g.destroyed) return;
    c.g.visible = false;
    this.layer.removeChild(c.g);
    if (this.coinPool.length < MAX_COINS) this.coinPool.push(c.g);
    else destroyTree(c.g);
  }

  // ---------- frame ----------

  update(dt: number): void {
    // Pops: drift up, settle the punch, fade.
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt;
      if (p.life <= 0 || p.t.destroyed) {
        this.releasePop(i);
        continue;
      }
      const age = p.max - p.life;
      if (age > 0.08 && p.t.scale.x !== p.scale) p.t.scale.set(p.scale);
      p.y += p.vy * dt;
      p.vy *= 0.94;
      p.t.y = Math.round(p.y);
      p.t.alpha = Math.min(1, p.life * 3);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0 || f.g.destroyed) {
        this.flashes.splice(i, 1);
        this.recycleFlash(f.g);
        continue;
      }
      f.g.alpha = f.peak * (f.life / f.max);
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      if (c.t < 0) {
        c.g.visible = false;
        continue;
      }
      c.g.visible = true;
      const k = Math.min(1, c.t / c.dur);
      const e = k * k * (3 - 2 * k);
      const u = 1 - e;
      c.g.x = Math.round(u * u * c.x0 + 2 * u * e * c.cx + e * e * c.x1);
      c.g.y = Math.round(u * u * c.y0 + 2 * u * e * c.cy + e * e * c.y1);
      if (k >= 1) {
        sfx.coin(c.step);
        this.bankPulse = 1;
        const cb = c.onLand;
        this.recycleCoin(i);
        if (cb) {
          try {
            cb();
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
    if (this.bankPulse > 0) this.bankPulse = Math.max(0, this.bankPulse - dt * 4);
    this.applyShake(dt);
  }

  private shakeTargets(): Container[] {
    const g = this.game;
    return this.shakeModal ? [g.sceneLayer, g.hudLayer, g.floatLayer, g.modalLayer] : [g.sceneLayer, g.hudLayer, g.floatLayer];
  }

  private applyShake(dt: number): void {
    if (this.shakeDur <= 0) {
      if (this.shaking) this.resetShake();
      return;
    }
    this.shakeT += dt;
    if (this.shakeT >= this.shakeDur) {
      this.shakeDur = 0;
      this.resetShake();
      return;
    }
    const k = 1 - this.shakeT / this.shakeDur;
    const a = this.shakeAmp * k * k;
    const ox = Math.round((Math.random() * 2 - 1) * a);
    const oy = Math.round((Math.random() * 2 - 1) * a);
    for (const c of this.shakeTargets()) c.position.set(ox, oy);
    this.shaking = true;
  }

  private resetShake(): void {
    const g = this.game;
    for (const c of [g.sceneLayer, g.hudLayer, g.floatLayer, g.modalLayer]) c.position.set(0, 0);
    this.shaking = false;
  }

  /** Drops everything in flight (scene change keeps pops; this is for teardown of the game). */
  clear(): void {
    while (this.pops.length) this.releasePop(this.pops.length - 1);
    while (this.coins.length) this.recycleCoin(this.coins.length - 1);
    for (const f of this.flashes) this.recycleFlash(f.g);
    this.flashes.length = 0;
    this.shakeDur = 0;
    this.resetShake();
    this.freezeUntil = 0;
  }

  destroy(): void {
    this.clear();
    for (const t of this.popPool) destroyTree(t);
    for (const g of this.flashPool) destroyTree(g);
    for (const g of this.coinPool) destroyTree(g);
    this.popPool.length = 0;
    this.flashPool.length = 0;
    this.coinPool.length = 0;
    destroyTree(this.layer);
  }
}
