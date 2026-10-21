import { Application, TextureSource } from 'pixi.js';
import './style.css';
import { Game } from './core/game';
import { computeLayout } from './core/layout';
import { initPwa } from './pwa';
import { DEPARTMENTS } from './depts';

// Pixel art: nearest-neighbor everywhere, no smoothing.
TextureSource.defaultOptions.scaleMode = 'nearest';

async function boot(): Promise<void> {
  const layout = computeLayout();
  const app = new Application();
  await app.init({
    width: layout.device.w,
    height: layout.device.h,
    background: '#140c1c',
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
    preference: 'webgl',
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const game = new Game(app, layout);
  for (const def of DEPARTMENTS) game.register(def);
  // Size the canvas before the first scene is built.
  game.layout = layout;
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.width = `${layout.device.cssW}px`;
  canvas.style.height = `${layout.device.cssH}px`;
  canvas.style.left = `${Math.floor((window.innerWidth - layout.device.cssW) / 2)}px`;
  canvas.style.top = `${Math.floor((window.innerHeight - layout.device.cssH) / 2)}px`;
  app.stage.scale.set(layout.scale);
  app.stage.hitArea = { contains: () => true };

  await game.start();
  initPwa(() => game.persistSync());

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const next = computeLayout();
      const L = game.layout;
      if (next.w !== L.w || next.h !== L.h || next.scale !== L.scale || next.safe.t !== L.safe.t || next.safe.b !== L.safe.b) game.resize();
    }, 150);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // Block pinch-zoom and double-tap zoom gestures that iOS still allows in some modes.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  (window as any).__game = game;

  // iOS may drop the WebGL context (memory pressure, long background). Save and reload cleanly
  // rather than leaving a black canvas.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    game.persistSync();
    setTimeout(() => location.reload(), 300);
  });

  // Errors that escape the game loop (e.g. inside rendering) repeat every frame; after a burst,
  // save and offer a reload instead of a frozen or black screen.
  let burst: number[] = [];
  const onError = (err: unknown) => {
    const now = performance.now();
    burst = burst.filter((t) => now - t < 2000);
    burst.push(now);
    if (burst.length >= 3) {
      app.ticker.stop();
      game.persistSync();
      showFatal(err);
    }
  };
  window.addEventListener('error', (e) => onError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => onError(e.reason));
}

function showFatal(err: any): void {
  if (document.querySelector('.overlay.fatal')) return;
  console.error(err);
  const el = document.createElement('div');
  el.className = 'overlay fatal';
  const msg = String(err?.message ?? err).replace(/[<>&]/g, '');
  el.innerHTML = `<div class="box"><h2>THE MINIONS DROPPED SOMETHING</h2><p>Your empire is saved.</p><p style="font-size:11px;opacity:.6">${msg}</p><button onclick="location.reload()">Reload</button></div>`;
  document.body.appendChild(el);
}

boot().catch(showFatal);
