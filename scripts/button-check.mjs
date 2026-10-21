// Regression check: every visible Button has a hit area (Throne, Gobbo's report, each department).
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/passive-tower-defense/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game?.save);
const count = () =>
  page.evaluate(() => {
    let total = 0, dead = 0;
    const walk = (n) => {
      if (n.setLabel && n.setEnabled && n.visible) { total++; if (!n.hitArea) dead++; }
      for (const c of n.children ?? []) walk(c);
    };
    walk(window.__game.app.stage);
    return { total, dead };
  });
let bad = 0;
const report = async (where) => { const c = await count(); if (c.dead) bad++; console.log(where, JSON.stringify(c)); };
await report('throne');
await page.evaluate(() => { const g = window.__game; for (const id of g.built) g.unlock(id); g.applyOffline(2 * 3600, Date.now()); });
await page.waitForTimeout(400);
await report('report');
for (const id of await page.evaluate(() => window.__game.built)) {
  await page.evaluate((d) => window.__game.enter(d), id);
  await page.waitForTimeout(600);
  await report(id);
}
console.log('pageerrors:', errs.length, errs.slice(0, 2).join(' | '));
await browser.close();
process.exit(bad || errs.length ? 1 : 0);
