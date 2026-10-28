// Small Legend displays other screens mount (A7): the "next Legend" badge for Trophy wall rows,
// and a self-updating Legend road for a HUD row. Both read core/legends.ts legendPreview().
import { Container, Graphics, type Ticker } from 'pixi.js';
import type { Game } from '../core/game';
import type { DeptId } from '../core/types';
import { legendMini, legendPreview, type LegendPreview } from '../core/legends';
import { formatTime } from '../core/format';
import { PixelText } from './font';
import { LegendRoad, ROAD_H, drawSprite } from './widgets';

/** The department's next-Legend preview (null while locked). Never throws. */
export function previewFor(game: Game, id: DeptId): LegendPreview | null {
  try {
    return legendPreview(game.save, id, game.defs[id], game.defs, Date.now());
  } catch {
    return null;
  }
}

/** One-line road label: "??? THE TALLER SISTER", "... ARRIVES AT DAWN", "... AT THE GATE". */
export function roadLabel(p: LegendPreview): string {
  if (p.waiting) return p.dawn.phase === 'camping' ? `${p.label} CAMPS TILL DAWN` : p.dawn.phase === 'ambush' ? `DAWN AMBUSH! ${p.label}` : `${p.label} AT THE GATE`;
  if (p.dawnForecast) return `${p.label} ARRIVES AT DAWN`;
  if (p.etaS !== null && p.etaS > 0) return `${p.label} ~${formatTime(p.etaS)}`;
  return p.label;
}

/**
 * A Trophy wall row badge: the next Legend's tiny silhouette and "NEXT ??? THE TALLER SISTER
 * 2/6", clipped to `maxW` px. Static (drawn once).
 */
export function legendNextBadge(game: Game, id: DeptId, x: number, y: number, maxW: number): Container {
  const c = new Container();
  const p = previewFor(game, id);
  if (!p) return c;
  const fig = new Graphics();
  const color = p.waiting ? 0xc03a3a : p.known ? 0x9c8aa8 : 0x120a1a;
  drawSprite(fig, legendMini(p.legend, 0), { x: color, o: p.waiting ? 0xffe27a : 0x6a4a80 });
  // The figure stands at the right end of the text line, inside the row (rows are 20 px).
  fig.position.set(x + maxW - 12, y - 8);
  const chars = Math.max(4, Math.floor((maxW - 14) / 4));
  let text = `NEXT ${p.label} ${p.legend.index + 1}/${p.legend.total}`;
  if (text.length > chars) text = `${text.slice(0, chars - 2)}..`;
  const t = new PixelText(text, p.waiting ? '#e05050' : '#c8b8d0');
  t.position.set(x, y);
  c.addChild(fig, t);
  return c;
}

/**
 * A self-updating Legend road for a HUD row: the road (ui/widgets.ts LegendRoad) plus its label,
 * refreshed at ~2 Hz from legendPreview. Owns one ticker callback, removed on destroy. Height
 * ROAD_H + 7 (label above the road); `w` px wide.
 */
export class LegendRoadView extends Container {
  private road: LegendRoad;
  private caption = new PixelText('', '#9c8aa8');
  private acc = 1;
  private tickFn = (tk: Ticker) => this.update(Math.min(0.1, tk.deltaMS / 1000));

  constructor(
    private game: Game,
    private id: DeptId,
    w: number,
    private showLabel = true,
  ) {
    super();
    this.road = new LegendRoad(w);
    this.road.y = showLabel ? 7 : 0;
    this.addChild(this.road);
    if (showLabel) this.addChild(this.caption);
    game.app.ticker.add(this.tickFn);
    this.update(0);
  }

  get h(): number {
    return ROAD_H + (this.showLabel ? 7 : 0);
  }

  update(dt: number): void {
    if (this.destroyed) return;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.acc = 0;
      const p = previewFor(this.game, this.id);
      if (p) {
        this.road.setState(p.legend, p.known, p.approach, p.waiting);
        if (this.showLabel) {
          const max = Math.floor((this.road.w + 1) / 4);
          const txt = roadLabel(p);
          this.caption.set(txt.length > max ? `${txt.slice(0, max - 2)}..` : txt, p.waiting ? '#e05050' : '#9c8aa8');
        }
      }
    }
    this.road.update(dt);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.game.app.ticker.remove(this.tickFn);
    super.destroy(options);
  }
}
