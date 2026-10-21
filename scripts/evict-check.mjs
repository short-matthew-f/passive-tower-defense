// Regression check: flood the pixel-font with unique strings, then confirm the game still renders.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.argv[2] ?? 'http://localhost:5173/passive-tower-defense/');
await page.waitForFunction(() => window.__game?.save);
await page.evaluate(() => { const g = window.__game; g.save.depts.cauldron.seen.onboardingDone = 1; g.enter('cauldron'); });
await page.waitForTimeout(500);
// Simulate minutes of changing counters: thousands of distinct numbers through the toast/float paths.
await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 3000; i++) { g.floatLayer.spawn(`+${i}.${i % 7}`, 50, 100); if (i % 100 === 0) await new Promise((r) => requestAnimationFrame(r)); }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/claude-0/qa/evict.png' });
console.log('pageerrors:', errs.length, errs.slice(0, 3).join(' | ').slice(0, 400));
await browser.close();
