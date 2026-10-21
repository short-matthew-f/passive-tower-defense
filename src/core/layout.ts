// Pixel-perfect integer scaling. The logical canvas is at least 180x320 and grows to fill the
// screen, so there are no letterbox bars; scenes anchor to edges and the safe-area insets.

export const BASE_W = 180;
export const BASE_H = 320;
const TOP_GUARD_CSS = 28;

export interface Layout {
  /** Logical size in game pixels. */
  w: number;
  h: number;
  /** Device pixels per game pixel (integer). */
  scale: number;
  /** Safe-area insets in game pixels (notch, home indicator). */
  safe: { t: number; r: number; b: number; l: number };
  /** Device-pixel canvas size and CSS size. */
  device: { w: number; h: number; cssW: number; cssH: number; dpr: number };
}

function readSafeInsets(): { t: number; r: number; b: number; l: number } {
  const probe = document.getElementById('safe-probe');
  if (!probe) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(probe);
  return {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0,
  };
}

export function computeLayout(): Layout {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const devW = Math.round(cssW * dpr);
  const devH = Math.round(cssH * dpr);
  const scale = Math.max(1, Math.floor(Math.min(devW / BASE_W, devH / BASE_H)));
  const w = Math.floor(devW / scale);
  const h = Math.floor(devH / scale);
  const ins = readSafeInsets();
  const toGame = (css: number) => Math.ceil((css * dpr) / scale);
  // iOS 26 blurs web content for ~25pt below the status bar (the "scroll edge" haze). On notched
  // devices, keep UI out of that band; the HUD paints a solid color there so the blur is invisible.
  const topGuard = ins.t > 20 ? TOP_GUARD_CSS : 0;
  return {
    w,
    h,
    scale,
    safe: { t: toGame(ins.t + topGuard), r: toGame(ins.r), b: toGame(ins.b), l: toGame(ins.l) },
    device: { w: w * scale, h: h * scale, cssW: (w * scale) / dpr, cssH: (h * scale) / dpr, dpr },
  };
}
