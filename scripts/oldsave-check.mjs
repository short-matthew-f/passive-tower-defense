// Loads a pre-Goods save shape through the real game and checks it boots into every unlocked department.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/passive-tower-defense/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game?.save);
// Build an old-style save: unlock everything, then strip fields added later.
await page.evaluate(() => {
  const g = window.__game;
  for (const id of g.built) g.unlock(id);
  const s = JSON.parse(JSON.stringify(g.save));
  delete s.meta.goods; delete s.meta.market;
  for (const d of Object.values(s.depts)) delete d.imports;
  s.lastSeen = Date.now() - 3 * 3600 * 1000;
  g.replaceSave(s);
});
await page.reload();
await page.waitForFunction(() => window.__game?.save);
for (const id of await page.evaluate(() => window.__game.built)) {
  await page.evaluate((d) => window.__game.enter(d), id);
  await page.waitForTimeout(700);
}
await page.evaluate(() => window.__game.goThrone());
await page.waitForTimeout(400);
console.log('pageerrors:', errs.length, errs.slice(0, 3).join(' | ').slice(0, 300));
await browser.close();
