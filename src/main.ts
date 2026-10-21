import { Application, TextureSource } from 'pixi.js';
import './style.css';
import { Game } from './core/game';
import { computeLayout } from './core/layout';
import { initPwa } from './pwa';
import { DEPARTMENTS } from './depts';
import { exportSave, loadSave } from './core/save';

// Pixel art: nearest-neighbor everywhere, no smoothing.
TextureSource.defaultOptions.scaleMode = 'nearest';

/** The running game, once constructed: the fatal overlay exports its save (C-04). */
let gameRef: Game | null = null;

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
  gameRef = game;
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

  // A single throw inside a ticker callback stops Pixi's loop for good (no further frame is
  // requested), so the burst rule above never fires. Watch for frames instead: visible for 3 s
  // with no frame means the loop is dead; save and show the overlay (C-04).
  let lastFrame = performance.now();
  let visibleSince = performance.now();
  let lastErr: unknown = null;
  window.addEventListener('error', (e) => (lastErr = e.error ?? e.message));
  app.ticker.add(() => (lastFrame = performance.now()), undefined, -1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') visibleSince = lastFrame = performance.now();
  });
  window.setInterval(() => {
    const now = performance.now();
    if (document.visibilityState !== 'visible' || now - visibleSince < 3000) return;
    if (now - lastFrame > 3000 && app.ticker.started) {
      app.ticker.stop();
      game.persistSync();
      showFatal(lastErr ?? new Error('The game loop stopped.'));
    }
  }, 1000);
}

function showFatal(err: any): void {
  if (document.querySelector('.overlay.fatal')) return;
  console.error(err);
  const el = document.createElement('div');
  el.className = 'overlay fatal';
  const msg = String(err?.message ?? err).replace(/[<>&]/g, '');
  el.innerHTML = `<div class="box"><h2>THE MINIONS DROPPED SOMETHING</h2><p>Your empire is saved.</p><p style="font-size:11px;opacity:.6">${msg}</p><button data-a="reload">Reload</button> <button data-a="export" class="secondary">Export save</button><textarea readonly style="display:none;width:100%;height:80px;margin-top:8px;font-size:10px"></textarea></div>`;
  el.querySelector('[data-a="reload"]')!.addEventListener('click', () => location.reload());
  // Export works without the canvas, so a save that breaks boot can still be backed up.
  el.querySelector('[data-a="export"]')!.addEventListener('click', async () => {
    const io = el.querySelector('textarea')!;
    io.style.display = 'block';
    try {
      const save = gameRef?.save ?? (await loadSave());
      io.value = save ? exportSave(save) : 'No save found.';
    } catch (e) {
      io.value = `Could not export: ${String((e as Error)?.message ?? e)}`;
    }
    io.select();
    try {
      await navigator.clipboard.writeText(io.value);
    } catch {
      /* clipboard may be blocked; the text is selected for manual copy */
    }
  });
  document.body.appendChild(el);
}

boot().catch(showFatal);
