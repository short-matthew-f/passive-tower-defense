import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type()==='warning' && /pixi|texture|WebGL/i.test(m.text()) && !/GPU stall/.test(m.text())) errs.push('[console] ' + m.text()); });
await page.goto('http://localhost:5173/passive-tower-defense/');
await page.waitForFunction(() => window.__game?.save);
const dept = process.argv[2];
await page.evaluate((d) => { const g = window.__game; g.unlock('mines'); for (const k of ['cauldron','mines']) { g.save.depts[k].seen.onboardingDone=1; g.save.depts[k].run.bank = 1e12; } g.enter(d); }, dept);
for (let i = 0; i < 60; i++) {
  await page.evaluate((d) => {
    const g = window.__game;
    // Click every visible button-ish thing via its onTap by simulating taps at random content points.
    const c = g.app.canvas.getBoundingClientRect();
  }, dept);
  const L = await page.evaluate(() => window.__game.layout);
  const k = L.scale / L.device.dpr;
  for (let t = 0; t < 10; t++) {
    const x = Math.random() * L.w, y = L.safe.t + 26 + Math.random() * (L.h - L.safe.t - 26 - L.safe.b);
    await page.mouse.click(x * k, y * k);
  }
  await page.waitForTimeout(100);
}
const shot = await page.screenshot({ path: `/tmp/claude-0/qa/stress-${dept}.png` });
console.log('errors:', errs.length); for (const e of errs.slice(0, 8)) console.log(e.slice(0, 600));
await browser.close();
