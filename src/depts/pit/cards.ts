// The 34x40 unit card (07 §13 card grid): sprite, level pips and merge XP, held item, trigger
// glyph, status slot and the attack | HP stat bar. One CardView per slot, created once; it only
// redraws its Graphics when its state key changes, and every PixelText is reused with .set().
import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import { PixelText, measure } from '../../ui/font';
import { PAL, TIER_COL, beastTex, foodTex, itemTex, statusTex, trigTex } from './art';
import { xpPips } from './run';
import { FOODS, UNITS, type FoodId, type ItemId, type UnitId } from './units';

export const CW = 34;
export const CH = 40;
export const STEP = 36;

export interface CardState {
  k?: UnitId;
  food?: FoodId;
  a?: number;
  h?: number;
  lvl?: number;
  xp?: number; // show merge pips when set
  it?: ItemId | null;
  brand?: boolean;
  armor?: number;
  thorns?: number;
  skip?: number;
  /** Rival collar colour (rival cards). */
  rival?: number;
  /** Hide stats ('?') when not scouted. */
  hide?: boolean;
  sel?: boolean;
  target?: boolean;
  empty?: boolean;
  dim?: boolean;
  cost?: number;
  /** Beast skin (SKINS index) for your own beasts. */
  skin?: number;
}

function keyOf(s: CardState | null): string {
  if (!s) return '-';
  return [s.k, s.food, s.a, s.h, s.lvl, s.xp, s.it, s.brand ? 1 : 0, s.armor, s.thorns, s.skip, s.rival, s.hide ? 1 : 0, s.sel ? 1 : 0, s.target ? 1 : 0, s.empty ? 1 : 0, s.dim ? 1 : 0, s.cost, s.skin ?? 0].join('|');
}

export class CardView extends Container {
  private g = new Graphics();
  private spr = new Sprite();
  private trig = new Sprite();
  private item = new Sprite();
  private status = new Sprite();
  private hl = new Graphics();
  private fl = new Graphics();
  private atkT = new PixelText('', '#fff4e0');
  private hpT = new PixelText('', '#fff4e0');
  private key = '';
  state: CardState | null = null;
  bx = 0;
  by = 0;
  offX = 0;
  offY = 0;
  pulse = 0;
  flash = 0;
  pop = 0;
  private statuses: Texture[] = [];
  private statusT = 0;
  private bob = 0;

  constructor(onTap: () => void, bobPhase = 0, onDown?: (e: FederatedPointerEvent) => void) {
    super();
    this.spr.scale.set(2);
    this.spr.position.set(5, 4);
    this.trig.position.set(2, 23);
    this.item.position.set(25, 2);
    this.status.position.set(25, 23);
    this.hl.rect(0, 0, CW, 1).rect(0, CH - 1, CW, 1).rect(0, 0, 1, CH).rect(CW - 1, 0, 1, CH).fill(0xfff2a0);
    this.hl.rect(1, 1, CW - 2, 1).rect(1, CH - 2, CW - 2, 1).rect(1, 1, 1, CH - 2).rect(CW - 2, 1, 1, CH - 2).fill(0xfff2a0);
    this.hl.alpha = 0;
    this.fl.rect(1, 1, CW - 2, CH - 2).fill(0xffffff);
    this.fl.alpha = 0;
    this.addChild(this.g, this.spr, this.trig, this.item, this.status, this.atkT, this.hpT, this.fl, this.hl);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-1, -1, CW + 2, CH + 2);
    this.on('pointertap', (e) => {
      e.stopPropagation();
      onTap();
    });
    // Drag and hold start here; the scene follows the pointer (tap-tap still works).
    if (onDown) this.on('pointerdown', (e) => onDown(e));
    this.bob = bobPhase;
  }

  setState(s: CardState | null): void {
    this.state = s;
    const key = keyOf(s);
    if (key === this.key) return;
    this.key = key;
    this.redraw();
  }

  private redraw(): void {
    const s = this.state;
    const g = this.g.clear();
    this.spr.visible = this.trig.visible = this.item.visible = this.status.visible = false;
    this.atkT.set(' ');
    this.hpT.set(' ');
    this.statuses = [];
    if (!s) return;
    if (s.empty || (!s.k && !s.food)) {
      g.rect(0, 0, CW, CH).fill({ color: 0x0a0410, alpha: 0.35 });
      const c = s.target ? 0xfff2a0 : 0x4a3450;
      for (let x = 1; x < CW - 1; x += 3) g.rect(x, 0, 2, 1).rect(x, CH - 1, 2, 1);
      for (let y = 1; y < CH - 1; y += 3) g.rect(0, y, 1, 2).rect(CW - 1, y, 1, 2);
      g.fill(c);
      return;
    }
    const tier = s.k ? UNITS[s.k].tier : s.food ? FOODS[s.food].tier : 1;
    const l3 = (s.lvl ?? 1) >= 3;
    const edge = s.sel ? PAL.sel : s.target ? 0xfff2a0 : l3 ? PAL.gold : (s.rival ?? TIER_COL[Math.min(6, tier)]);
    g.rect(0, 0, CW, CH).fill(PAL.ink);
    g.rect(1, 1, CW - 2, CH - 2).fill(edge);
    g.rect(2, 2, CW - 4, CH - 4).fill(s.rival !== undefined ? PAL.cardRival : s.food ? 0x24202c : PAL.card);
    if (s.brand) {
      g.rect(2, 2, CW - 4, 1).rect(2, CH - 3, CW - 4, 1).rect(2, 2, 1, CH - 4).rect(CW - 3, 2, 1, CH - 4).fill(PAL.gold);
    }
    // Ground shadow under the sprite.
    g.rect(8, 22, 18, 2).fill({ color: 0x000000, alpha: 0.3 });
    if (s.food) {
      this.spr.texture = foodTex(s.food);
      this.spr.visible = true;
      this.spr.position.set(5, 6);
      g.rect(1, 31, CW - 2, 8).fill(0x3a2a1a);
      const t = `${s.cost ?? FOODS[s.food].cost}`;
      this.atkT.set(t, '#e8c04a');
      this.atkT.position.set(Math.floor((CW - measure(t).w) / 2), 33);
      if (FOODS[s.food].held) {
        this.trig.texture = itemTex(s.food as ItemId);
        this.trig.visible = true;
      }
      this.alpha = s.dim ? 0.45 : 1;
      return;
    }
    const k = s.k!;
    this.spr.texture = beastTex(k, s.rival === undefined ? (s.skin ?? 0) : 0);
    this.spr.position.set(5, 4);
    this.spr.visible = true;
    // Level pips (top-left) and merge XP dots under them.
    const lvl = s.lvl ?? 1;
    if (!s.hide || s.xp !== undefined) {
      for (let i = 0; i < 3; i++) g.rect(3 + i * 4, 3, 3, 3).fill(i < lvl ? PAL.gold : 0x4a3a50);
      if (s.xp !== undefined && lvl < 3) {
        const p = xpPips(s.xp);
        for (let i = 0; i < p.need; i++) g.rect(3 + i * 3, 7, 2, 1).fill(i < p.have ? 0x8fd14f : 0x4a3a50);
      }
    }
    const tt = trigTex(UNITS[k].trig);
    if (tt) {
      this.trig.texture = tt;
      this.trig.visible = true;
    }
    if (s.it && !s.hide) {
      this.item.texture = itemTex(s.it);
      this.item.visible = true;
    }
    if (s.brand) this.statuses.push(statusTex('crown'));
    if (s.armor) this.statuses.push(statusTex('armor'));
    if (s.thorns) this.statuses.push(statusTex('thorns'));
    if (s.skip) this.statuses.push(statusTex('net'));
    if (this.statuses.length) {
      this.status.texture = this.statuses[0];
      this.status.visible = true;
    }
    // Stat bar: attack (left) | HP (right).
    g.rect(1, 31, 16, 8).fill(PAL.atk);
    g.rect(17, 31, 16, 8).fill(PAL.hp);
    g.rect(1, 31, 32, 1).fill({ color: 0xffffff, alpha: 0.2 });
    const at = s.hide ? '?' : `${s.a ?? 0}`;
    const ht = s.hide ? '?' : `${s.h ?? 0}`;
    this.atkT.set(at, '#fff4e0');
    this.hpT.set(ht, '#fff4e0');
    this.atkT.position.set(1 + Math.floor((16 - measure(at).w) / 2), 33);
    this.hpT.position.set(17 + Math.floor((16 - measure(ht).w) / 2), 33);
    this.alpha = s.dim ? 0.45 : 1;
  }

  tick(dt: number, t: number): void {
    const k = Math.exp(-14 * dt);
    this.offX *= k;
    this.offY *= Math.exp(-10 * dt);
    if (Math.abs(this.offX) < 0.3) this.offX = 0;
    if (Math.abs(this.offY) < 0.3) this.offY = 0;
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.pop = Math.max(0, this.pop - dt * 4);
    this.hl.alpha = this.pulse > 0 ? Math.min(1, this.pulse * 1.5) : this.state?.target ? 0.35 + 0.35 * Math.sin(t * 8) : 0;
    this.fl.alpha = this.flash * 0.8;
    this.x = Math.round(this.bx + this.offX);
    // Two-frame idle: a 1 px bob of the sprite.
    const bobUp = this.state?.k && Math.floor(t * 2 + this.bob) % 2 === 0 ? 1 : 0;
    this.spr.y = (this.state?.food ? 6 : 4) - bobUp;
    this.y = Math.round(this.by + this.offY - (this.pop > 0 ? Math.round(this.pop * 4) : 0));
    if (this.statuses.length > 1) {
      this.statusT += dt;
      this.status.texture = this.statuses[Math.floor(this.statusT / 0.6) % this.statuses.length];
    }
  }
}
