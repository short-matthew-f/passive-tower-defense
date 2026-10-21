// Tear down a display tree without leaking GraphicsContexts (perf P-01).
// Pixi 8.22: Graphics.destroy(options) frees the context it created itself only when called with no
// arguments; Container.destroy({ children: true }) passes the options object down, so every plain
// `new Graphics()` in the tree left its GraphicsContext (and GPU buffers) behind until Pixi's 60 s
// GC. This walks the tree children-first and calls destroy() with no arguments on every node.
// Never pass { context: true } instead: it would also destroy shared contexts from the art caches.
import type { Container } from 'pixi.js';

export function destroyTree(node: Container | null | undefined): void {
  if (!node || node.destroyed) return;
  // Detach first so a 'destroyed' listener (modal dispose hooks) sees a node already off the stage.
  node.parent?.removeChild(node);
  const kids = node.children ? [...node.children] : [];
  for (const c of kids) destroyTree(c as Container);
  node.destroy();
}
