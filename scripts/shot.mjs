// Screenshot helper for agents and humans: drives the game in an iPhone-sized headless Chromium.
// Usage: node scripts/shot.mjs <out.png> [--url http://localhost:5173/passive-tower-defense/]
//          [--tap x,y] (logical game px) [--hold x,y,ms] [--wait ms] [--eval "js"] [--enter dept] ...
// Steps run in order. A fresh browser profile is used each run (empty save) unless --eval sets state.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const out = args.shift();
let url = 'http://localhost:5173/passive-tower-defense/';
const steps = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--url') url = args[++i];
  else steps.push([a.slice(2), args[++i]]);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__game?.save, null, { timeout: 15000 });
await page.waitForTimeout(500);

const toCss = async (x, y) =>
  page.evaluate(([x, y]) => {
    const g = window.__game;
    const c = g.app.canvas.getBoundingClientRect();
    const k = g.layout.scale / g.layout.device.dpr;
    return [c.left + x * k + k / 2, c.top + y * k + k / 2];
  }, [x, y]);

for (const [kind, val] of steps) {
  if (kind === 'wait') await page.waitForTimeout(Number(val));
  else if (kind === 'eval') await page.evaluate(val);
  else if (kind === 'enter') await page.evaluate((d) => window.__game.enter(d), val);
  else if (kind === 'tap') {
    const [x, y] = val.split(',').map(Number);
    const [cx, cy] = await toCss(x, y);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(80);
  } else if (kind === 'hold') {
    const [x, y, ms] = val.split(',').map(Number);
    const [cx, cy] = await toCss(x, y);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }
}
await page.screenshot({ path: out });
const layout = await page.evaluate(() => {
  const L = window.__game.layout;
  return { w: L.w, h: L.h, scale: L.scale, safe: L.safe };
});
console.log('layout', JSON.stringify(layout));
for (const l of logs) console.log(l);
await browser.close();
