// Scratch balance bot for the Styx (not shipped): a greedy reference player on the pure model.
import * as M from '../src/depts/styx/model';

const OFF = 0.65;
type R = M.StyxRun;

function castStats(r: R, band: number, skill = 1) {
  const depth = band * M.BAND_PX + 35;
  const w = r.wrath;
  const win = M.hookWindowMs(r.lv.strike, w);
  const pHook = Math.min(0.95, (0.5 + win / 1800)) * skill;
  const fakes = M.fakeChance(w) * 1.5;
  const tCast = 1.0 + depth / M.SINK_PX_S;
  const tWait = M.biteWait(r.lv.lantern) * 0.85 + 1.2 + fakes * 0.8;
  const dist = depth + 20;
  const tReel = dist / (M.reelSpeed(r.lv.reel) * 0.62) + 0.3 * 2;
  const thr = 2 + M.wrathThrashes(w);
  const q = Math.min(0.5, (0.035 * M.wrathPull(w)) / M.lineCap(r.lv.line) / (1 + 0.02 * r.lv.steady) / skill);
  let pEsc = 1 - (1 - q) ** thr;
  pEsc *= 1 - M.barbChance(r.lv.barb);
  const pLand = pHook * (1 - pEsc);
  const tTotal = tCast + tWait + pHook * tReel + 0.8;
  const wt = M.rarityWeights(r.bait, band, r.lv.scent, w);
  const ev = M.bandEV(band, wt);
  const streak = Math.min(20, pLand / Math.max(0.02, 1 - pLand));
  const val = ev * M.comboMult(streak * 0.7) * M.wrathActive(w);
  const wispRate = (1 / M.wispEvery(r.lv.wispnet)) * 0.6 * (M.COMMON_BASE[band] / 5) * M.wispMult(r.lv.wispnet) * M.wrathActive(w);
  return { fish: (pLand * val) / tTotal, wisp: wispRate, perMin: (60 * pLand) / tTotal, pLand };
}
function bestBand(r: R) { let b = 0, best = 0; for (let i = 0; i < r.bands; i++) { const v = castStats(r, i).fish; if (v > best) { best = v; b = i; } } return b; }
function rate(r: R) { const c = castStats(r, bestBand(r)); return c.fish + c.wisp + M.idleObols(r); }

const r = M.defaultRun();
let bank = 0, earned = 0, t = 0, firstBuy = -1;
const NODE_IDS = Object.keys(M.NODES) as M.NodeId[];
const log: string[] = [];
let nextLog = 0;
const ratioSamples: number[] = [];
const codexBonus = new Set<string>();
const goalW = Number(process.argv[2] ?? 5);
while (t < 6 * 3600) {
  const dt = 1;
  const c = castStats(r, bestBand(r));
  let inc = (c.fish + c.wisp + M.idleObols(r)) * dt;
  // codex first-catch bonus (common/uncommon soon after a band opens)
  for (const sp of M.SPECIES) if (sp.band >= 0 && sp.band < r.bands && sp.rarity !== 'rare' && !codexBonus.has(sp.id) && t > 20) { codexBonus.add(sp.id); inc += 10 * sp.base; }
  bank += inc; earned += inc; t += dt;
  if (t > 1800) ratioSamples.push((c.fish + c.wisp + M.idleObols(r)) / M.idleObols(r));
  // shop
  for (let k = 0; k < 20; k++) {
    const base = rate(r);
    let best: (() => void) | null = null, bestScore = 0, bestCost = 0, bestName = '';
    for (const id of NODE_IDS) {
      if (r.lv[id] >= M.NODES[id].max) continue;
      const cost = M.nodeCost(id, r.lv[id]);
      r.lv[id]++; const d = rate(r) - base; r.lv[id]--;
      const s = d / cost; if (s > bestScore) { bestScore = s; best = () => r.lv[id]++; bestCost = cost; bestName = id; }
    }
    if (r.bands < M.MAX_BANDS) {
      const cost = M.BANDS[r.bands].cost; r.bands++; const d = rate(r) - base; r.bands--;
      const s = d / cost * 1.0; if (s > bestScore) { bestScore = s; best = () => r.bands++; bestCost = cost; bestName = 'band'; }
    }
    if (r.bands >= 2 && r.wrathMax < goalW) {
      const cost = M.wrathCost(r.wrathMax + 1); r.wrathMax++; r.wrath++; const d = rate(r) - base; r.wrathMax--; r.wrath--;
      const s = d / cost * 2; if (s > bestScore) { bestScore = s; best = () => { r.wrathMax++; r.wrath = r.wrathMax; }; bestCost = cost; bestName = 'wrath'; }
    }
    if (!best || bestCost > bank) break;
    bank -= bestCost; best(); if (firstBuy < 0) firstBuy = t;
    if (bestName === 'band' || bestName === 'wrath') log.push(`${(t/60).toFixed(1)}m ${bestName} -> bands ${r.bands} W ${r.wrathMax}`);
  }
  if (t >= nextLog) {
    nextLog += t < 1800 ? 300 : 1800;
    const idle = M.idleObols(r);
    log.push(`${(t/60).toFixed(0)}m earned ${earned.toExponential(2)} rate ${rate(r).toFixed(1)}/s idle ${idle.toFixed(1)} ratio ${(rate(r)/idle).toFixed(2)} catches/min ${c.perMin.toFixed(1)} pLand ${c.pLand.toFixed(2)} lv ${JSON.stringify(r.lv)} bands ${r.bands} W ${r.wrathMax}`);
  }
}
console.log(log.join('\n'));
const avg = ratioSamples.reduce((a, b) => a + b, 0) / ratioSamples.length;
console.log('first buy', firstBuy, 's; mean on-screen ratio (30m+)', avg.toFixed(2), 'offline ratio', (avg / OFF).toFixed(2));
