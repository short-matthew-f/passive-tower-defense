# Adversarial Review: Economy, Balance & Scope

Reviewer lens: economy, balance, offline determinism, save model, scope. Files reviewed in full: 00 through 06.
Severity scale: **blocker** means it breaks the game or the build plan as written. **major** means it will visibly hurt the game or need rework later. **minor** means it's a real inconsistency but cheap to fix.

**Verdict:** the meta *architecture* in 00 (rolling Falls, one Dread, Tribute normalized by Rank, a pure `offlineRate`) is sound. The *numbers and Infamy inputs* plugged into it are not. Four of the six Infamy dials can be reset and re-maxed in minutes, so Dread can be farmed without limit. The Mines' cost curves run away. The starter department's Fall is undefined. The offline ratios that 00 promises (3–5×) are off by an order of magnitude in two departments. The scope is also far beyond a solo or small-team PWA. All of these can be fixed, but they have to be fixed before any implementation starts, and especially before the Cauldron, which is the first build.

---

## Blockers

### B1: Falls with free dials can be farmed for unlimited Dread
- **Where:** 00 §2.2–2.4 (Infamy table, "ratchets", Keeps column); 06 §7 (Menace unlocks by lifetime bounties); 05 §7; 03 §7; 04 §7.
- **Problem:** In four departments, Infamy is a *skill check on a free slider*. It is not an economic milestone, so a Fall resets almost nothing that matters for reaching the next one.
  - **Bridge:** Menace unlocks are *kept* through Falls (00 §2.4). The check is "20 consecutive travelers at Menace M with ≥ 70% correct". Upgrades barely affect it. After the first Fall, a skilled player sets Menace to 8 and plays about 3 minutes (20 travelers at about 8/min), and the Legend appears. Fall again and repeat. Once Menace caps at 20 (N ≥ 7), the target stops rising but the payout `10 × (1 + 0.5N)` keeps growing: N=7 pays 45, N=20 pays 110 Dread, every ~3 minutes.
  - **Cauldron:** Malice has no price anywhere in 05. 00 says "Malice unlocks" reset, but nothing defines what an unlock costs. Twenty center landings happen in minutes (see B2).
  - **Styx:** Wrath is a free slider. Its only gate is Murk at 500 Obols, which is a few minutes of play. "Land 20 souls at W with ≤ 30% escapes" rests mostly on reflexes.
  - **Spire:** Volatility is free to *raise* instantly. The Feat score is a single event, not a held state. A player builds two T6 orbs at V0, cranks the knob to V10 just before they touch, and scores T7 + V10 = 17 in one merge. That covers Falls #0 through #4.
- **Why it matters:** The design targets about 1,500 Dread by day 30 (00 §6). A Bridge farmer passes that on day 3. Every Dread perk is global (Iron Fist, Idle Hands), so a single exploited department inflates all six. The "Rebuild targets" rule in 00 §2.4 can't even be evaluated when a cycle lasts 3 minutes.
- **Fix:** Every Fall needs an *economic* gate that resets with `run`, on top of the skill gate:
  1. Make each dial level a **one-time purchase in the local currency that resets on Fall**, the way the Dungeon's Lure already works (`lureCost = 40 × 1.45^T`). For example, Malice `2k × 5^M`, Menace `500 × 3^M`, Wrath `1k × 3^W`, Volatility `5k × 4^V`. Remove "Menace unlocks persist". The persistent lifetime-bounties counter can unlock *traveler types* or the Codex instead.
  2. Add a **minimum cycle earnings floor**: the Legend only appears when this cycle's lifetime local earnings are at least `E0_d × g^N`.
  3. Spire: a Feat counts only if Volatility was ≥ V for the **whole time since the last vent, or the last 60 drops**. Apply the "lowering is delayed" rule to raising as well, or snapshot V when the stack began.
  4. Consider `Dread ∝ log10(cycleEarnings / threshold)` in place of the linear `(1 + 0.5N)` term, so payout is tied to work done rather than to a count of Falls.

### B2: The starter department's (Cauldron) Infamy and Fall are undefined, and too fast as written
- **Where:** 00 §2.2 Cauldron row; 00 §6 ("first Fall about 3–4 h"); 05 §7, §15.
- **Problem:**
  - The rule is "20 jackpots (center-bucket landings) at Malice ≥ 4". It doesn't say whether imp drops count. If they do: random drops on an 11-row board land in the center bucket roughly 8–20% of the time. Two imps make 40 drops/min, which is 3–8 jackpots/min, so Infamy hits 100% in 3–7 minutes after Malice 4 is reached.
  - Malice is unlocked at about 20 minutes (05 §6) and costs nothing to raise. So the first Fall lands at about **25–40 minutes, not 3–4 hours**.
  - Overflow ("+10% per jackpot beyond target") means 200% is just 10 more jackpots, about 2 more minutes. The first Fall therefore pays the maximum of 80 Dread, enough for Styx (≥ 10) and Spire (≥ 60) on day 1.
  - Offline jackpot accrual is undefined, because offline is E[mult] only with no landings. If offline counts expected jackpots, Infamy fills overnight by itself. If it doesn't, 00 §6's "Cauldron Infamy 60–90% by bedtime" can't be computed.
  - 05 also contradicts itself about the center bucket: the bucket list shows ×1 with ×5/×10 later, Center Jackpot says it starts at ×3, and the layout drawing shows ×10. At M10 it also claims "mean ≈ 2.1×" while the center pays 15 × 1.35^10 ≈ **×301**. Those two numbers only agree if the center hit rate is below about 0.4%, which the board geometry doesn't describe.
- **Why it matters:** This is the first department being built ("Plinko it is"). Its prestige loop has to be the template, and right now it can't be implemented without guessing.
- **Fix:**
  - Infamy input = highest Malice at which you completed **K Batches** (recipe tickets; active play, aimed). Alternatively, use "Bile/min held at Malice M for 3 minutes".
  - Malice levels are bought with Bile (see B1) and reset on Fall.
  - Overflow is +10% per Malice level above target only, not per jackpot.
  - Define a single center-bucket table: base ×3, Jackpot upgrades to ×5/×7/×10/×15. Then set Malice's `1.35^M` so the simulated mean actually matches the 1.08^M target. The center probability needs to be an explicit design parameter.

### B3: The Mines' economy runs away, and its offline formula exceeds the live game
- **Where:** 02 §3 (offline formula), §5 (regrowth 1.5 s), §6B (Sharper Picks), §6A (Tap Damage), §6D (Dig Deeper); 00 §2.2 (depth 30 + 10N).
- **Problems (three linked ones):**
  1. **Sharper Picks** cost growth is 1.12, its effect is ×1.15 per level, and it has no max. Each level gets *cheaper relative to the power it adds*, so time per level shrinks (∝ 0.974^L). L60 costs about 90K Nuggets for ×4,384 DPS. Eight goblins then one-shot depth-30 rocks (950 HP), and a pass through the wall is limited only by **rock regrowth**: 25 tiles / 1.5 s = 16.7 rocks/s, or 41.7/s at the 0.6 s minimum.
  2. The **offline formula ignores that regrowth ceiling**: `rocksPerSec = goblinDPS / avgHP`. At Picks L80 (×72K), offline computes about 600 rocks/s at depth 30 while the live wall can't exceed 41.7. Offline pays **15–40× more than watching**, which inverts the whole active/offline premise.
  3. **Dig Deeper grows at 1.32 against a reward growth of 1.19**, so the rocks needed per depth level rise 1.109× per depth. At the regrowth cap, one depth level takes about 32 s at d30, **1.6 h at d80, 12.6 h at d100, and about 12 days at d130** (before multipliers). Fall targets climb 10 depths per Fall, which is 2.8× more work per cycle. Dread perks (Ruinborn, Iron Fist) are additive, so they can't keep pace. The Mines' cycle passes 00's "≤ 5 days" limit at around Fall 7–9 (weeks 3–4).
  - On top of that, **Tap Damage** is `1 + L` with doublings only at 25/50/100/200. At L300 it does about 5K × crit ≈ 26K, while rocks at d80 have 2.4M HP. So the Mines' core verb, tapping, becomes irrelevant by cycle 5, and the "percussion game" turns into a goblin idler.
- **Fix:**
  - Change Sharper Picks to cost growth ≥ 1.25 with effect +15% *additive* (or ×1.15 with growth 1.5 and a max of 40).
  - Put `rocksPerSec = min(goblinDPS / avgHP, tiles / regrowTime) × overkillEff` in **both** the live tick and `offlineRate`.
  - Set Dig Deeper growth to 1.20–1.22, so the wall comes from HP, which is what the "taps/rock" lever is supposed to express.
  - Have Tap Damage scale multiplicatively, for example ×1.07 per level with growth 1.10, or ×2 every 25 levels with no upper limit.
  - Shrink the Infamy step to +5 depth per Fall, or define the target as "cost-equivalent depth".

### B4: The scope can't be built by a solo developer or small team
- **Where:** all specs; 00 §5, §11.
- **Problem:** The "MVP" adds up to six complete games, each with 4–5 upgrade trees and its own offline model. On top of that come:
  - two Web Workers (the Dungeon sim and the Cauldron Monte Carlo) and Matter.js;
  - 6 Legendary Hero Last Stands and 120 hand-tuned Commendations;
  - 12 import lines with **12 unique flavor mechanics**, each touching another department's code;
  - a 6 + 24-node Dread tree and a Throne tree with Edicts, Steward auto-buyer, Black Market and Trophy Hall;
  - a traveler part-sprite system (~60 parts), 15 soul species, 11 orb tiers, a tileset and 6 heroes;
  - offline reports written in 6 character voices, and a CI balance simulator.

  Realistic solo estimates: Dungeon MVP 2–3 months; Bridge 1.5–2 months (clue authoring and tuning dominate); Spire 1.5 months (Matter.js merge edge cases); Cauldron, Mines and Styx about 1 month each; meta 1.5–2 months. That totals **10–14 months before polish**, and art roughly doubles it for a single person.
- **Fix:** ship in phases and don't let meta systems precede the games that use them.
  - **v0.1 (8–10 weeks):** Throne Room with Tribute, Seals, Dark Banners and the Gobbo report. **Cauldron + Mines** at their spec MVPs, using fixed numbers (B2, B3). Falls with the Empire branch only (Iron Fist, Tithe Collector, Long Reach) plus each department's Ruinborn. Last Stand is a static card. 8 Commendations per department.
  - **v0.2:** Troll Bridge (tweens only, cheap to render, and it validates the "judgment" verb).
  - **v0.3:** Dungeon.
  - **v0.4:** Styx.
  - **v0.5:** Spire.
  - **Cut from launch entirely:** Goods/Requisitions and the Black Market (add them once at least 4 departments exist, starting with the +1% income node only and no flavor mechanics), Steward, Edicts, Trophy Hall bonus, interactive Last Stands, Signature perks, Head Start, Legend's Bane, Cataclysm, and the Decimal library (see m1).
  - **Keep:** the headless balance script. It's cheap and catches B1–B3-class bugs.

---

## Major

### M1: The MVP dial ranges can't reach the Fall targets 00 sets
- **Where:** 00 §2.2 against the MVP sections of each spec.
- **Problem:**
  - Dungeon MVP caps Lure at 20. Fall #2 needs Lure 25 (15 + 5·2), and overflow beyond Fall #1 is impossible.
  - Bridge MVP caps Menace at 10. Fall #3 needs 12.
  - Cauldron MVP caps Malice at 5. Fall #2 needs 6.
  - Spire MVP caps Volatility at 5, and 00's own example uses V6. The highest MVP Feat score is T12 + V5 = 17, so Fall #5 is unreachable.
  - Styx lists Wrath as "Later" (03 §15), but it is the Styx's Infamy input. 00 §11 mentions this, but 03 was never updated.
- **Why it matters:** Players of the shipped MVP hit a hard prestige wall after 2–3 Falls per department, which is the opposite of the claimed weeks 2–4 cadence.
- **Fix:** Every MVP dial must cover the targets for at least Falls #0 through #5 plus 50% overflow. Either ship Lure 0–40, Menace 0–20, Malice 0–10 and Volatility 0–10, or cap N in the target formulas and switch to the earnings-floor gate from B1 after that point.

### M2: Offline factors can exceed on-screen idle, and the "active 3–5×" pillar isn't met
- **Where:** 00 §1.5, §2.5 (Idle Hands), §5.2 (Iron Discipline), §11; 02 §6B; 05 §6D; 04 §4, §6C; 06 §3, §6C; 03 §7.
- **Problems:**
  - **Factors over 1.0:** Mines 0.8 + Lunch Breaks (to 1.0) + Idle Hands 0.3 + Iron Discipline 0.1 = **1.4**. Cauldron 0.8 + Night Shift 0.2 + 0.4 = **1.4**. Spire idleEfficiency 0.9 + 0.3 = **1.2**. Closing the app then beats watching it, so the reward for keeping the app open disappears.
  - **Spire:** apprentices drop 6/min while an active player drops 70/min, with Resonance ~1.6 against a combined offline factor of 0.6 × 0.5. That makes the ratio **about 60× at the start**, not 5×. Late game flips the other way: 5 apprentices × 6 × (1 + 0.08 × 50) = **150 drops/min offline**, against 70 active.
  - **Spire's EV formula is wrong** (04 §4). The written formula divides the whole sum by `2^(ceiling−t)`, which gives EV ≈ 60 at ceiling T7. The correct per-merge share, `Σ_k V_k / 2^(k−t)`, gives **EV ≈ 97**. The spec's example says **7.8**. Since every Spire offline number derives from this, it's off by about 10×.
  - **Bridge:** Wider Planks raises traffic to 0.275/s (one traveler per 3.6 s). A human needs 6–8 s per traveler. Late game, goons (1.2× fare, 16.5 travelers/min) roughly match active play (3.2× fare, 7.5/min), so the ratio is about **1.2×**. It's also unspecified whether travelers queue up or are lost while the player is reading one.
  - **Styx:** active rewards scale with 1.15^W and idle with 1.05^W. At the Fall-#4 target of W = 18, that adds another ×5.1 on top of the base 4.7×, giving **about 24×**.
- **Fix:**
  - Hard-cap the effective offline factor at **0.9 × on-screen idle** in the shared core, and define Idle Hands and Iron Discipline as raising the factor toward that cap.
  - Normalize each department with a measured `activeMult(state)` in the balance script, not with per-spec prose.
  - Spire: rewrite the EV formula, cap apprentices so offline drops/min ≤ 40% of active cadence, and remove the double penalty (chainDepthFactor × idleEfficiency).
  - Bridge: Wider Planks should raise *fare*, not traffic. Alternatively, run goons in a parallel lane while the player handles their own traveler, so active play = goon rate + player rate.
  - Styx: idle Wrath scaling 1.10^W, or cap the Wrath target.

### M3: Infamy can't progress while a department is ignored in 4 of 6 departments
- **Where:** 00 §2.2, §7; project brief ("each can be ignored and still progresses").
- **Problem:** Bridge, Styx and Spire Infamy are defined by active verdicts, lands and merges. Cauldron offline jackpots are undefined. Only the Mines (rocks broken offline) and perhaps the Dungeon (if Cautious Mode's sim counts as "held") can progress offline. The spec never says whether that's intended.
- **Why it matters:** An ignored department keeps earning Tribute but never reaches prestige. That may be fine, but it has to be a deliberate, stated rule, and the rule has to be applied to all six departments the same way. Right now it depends on how each Infamy input happened to be defined.
- **Fix:** State the rule explicitly: "Infamy advances only from on-screen play (active or idle); offline never raises Infamy." Then make each input achievable through on-screen idle at a slow rate. Alternatively, let offline Infamy accrue to at most 50%. Either way, add a `infamyOffline(state, dt)` term to the required interface.

### M4: Overflow costs differ by department, and Dread grows quadratically with overflow, so the cheapest department dominates Dread
- **Where:** 00 §2.2 "Overflow" column, §2.3 formula.
- **Problem:** `(Infamy/100)²` makes 200% worth **4× the Dread of 100%**, so pushing is always correct. The cost of the push varies wildly:
  - Cauldron: 10 jackpots, about 2 minutes.
  - Mines: +10 depth, about 2.8× the whole cycle's effort.
  - Bridge: +5 Menace levels, and impossible once Menace caps at 20.
  - Spire: +10 Feat points, impossible beyond the cap.
  - The Bridge and Spire caps also create a dead zone where overflow is zero.
- **Also:** Head Start ("dial tier 1 + 2L") does nothing in the four free-dial departments, so 4 of the 6 wings carry a useless perk.
- **Fix:** Express overflow as "fraction of the *next* target's cost", so 200% means the next Fall's 100% requirement has been met in every department. Use a gentler exponent, e.g. `(Infamy/100)^1.5`, which pays 2.8× at 200%. Make Head Start start the department with N free dial-level purchases (meaningful once B1's purchasable dials exist).

### M5: Multiplier stacking is undefined
- **Where:** 00 §2.5, §4, §5.2, §6.
- **Problem:** Each of these modifiers is called "additive" or "×", but the spec never says what it's added to:
  - Iron Fist (+10% additive, ∞)
  - Ruinborn (+25% additive, ×20)
  - Dark Banners (+10% additive, ×25)
  - Imports (+20%)
  - Rebuild Rush ×3, Late Recruit ×2
  - Trophy Hall (+1% Tribute per Legend, unbounded)
  - Tithe Collector, Dark Tithe

  Treated as one additive pool, late-game Banners (+250%) and Ruinborn (+500%) dwarf every local upgrade. Treated as separate multiplicative groups, they compound to about ×30.
- **Fix:** Define a single canonical formula in 00, for example:
  `income = base × (1 + ΣlocalAdd) × (1 + ΣthroneAdd) × (1 + ΣdreadAdd) × (1 + importAdd) × temporaryMult`
  with explicit groups. Cap Trophy Hall at +25%. The balance script must use exactly this formula.

### M6: The Goods timeline arithmetic is off by about 2×, and some passive rates are zero
- **Where:** 00 §4.
- **Problem:**
  - Each Good feeds **two** import lines. Demand per Good is therefore 2 × ~1,990 = about 4,000. At roughly 130/day per Good (15/h active × 0.8 h plus ~5/h passive × ~23 h), the lines max out in **about 30 days, not 10–14**. Styx and Spire unlock late (day 2, day 4–5), which pushes Souls and Essence later still.
  - **Contraband passive is 0** until Sniffer Dog is bought (`floor(hours × 0.2 × sniffer_level)`), and Sniffer Dog resets on every Bridge Fall.
  - Bones and Ingots are also **0** for a department that has never been played: a Dungeon with no towers has no kills, and a Mines with no goblins breaks no rocks. That contradicts "a department you never play still supplies its partners".
- **Fix:**
  - Either halve the node costs or state 25–30 days as the target.
  - Give each Good a guaranteed base trickle once the department is unlocked (e.g. 2/h), independent of local upgrades.
  - Make goon crates use `max(1, sniffer_level)`.

### M7: Every Dungeon Fall starts with no income
- **Where:** 01 §4, §6; 00 §2.4 (Plunder and placeables reset).
- **Problem:** Nothing defines a starting Plunder balance or a free tower. After a Fall, Plunder = 0 and the board is empty. Every hero leaks, sacks steal 2% of 0, Cautious Mode finds no tier with leak < 20%, and `offlineRate = 0`. The only way out is active Glare: 40 damage every 20 s for 3 Plunder, so the first Arrow Slit (25) takes about 3 minutes of tapping. Blueprints "rebuild when affordable", which never happens offline. Master Mason (40 Dread) only rebuilds at L1 "as Plunder allows". This also breaks the 00 §8 hard target "first upgrade in any new department < 60 s" on a first visit.
- **Fix:** Each cycle starts with Plunder = 100 + 10% of the previous cycle's blueprint value, plus 2 free Arrow Slits at fixed spots. Alternatively, the Hoard's goblin clerk throws rocks for a 1 dps baseline so offline income is never 0.

### M8: The save model has real data-loss and double-credit holes
- **Where:** 00 §9, §7; 03 §14 and 04 §14 (localStorage).
- **Problems:**
  1. **iOS Safari deletes script-writable storage after 7 days without use** for sites that aren't installed to the Home Screen (ITP). An idle-game player who comes back after 8 days loses everything. `navigator.storage.persist()` doesn't prevent this on iOS.
  2. **IndexedDB writes are async.** On iOS a `visibilitychange: hidden` write often doesn't commit before suspension, so the last 10 s of progress, or a Fall, is lost.
  3. **Two tabs or windows** each autosave to A/B. Both credit offline time, and they overwrite each other's progress.
  4. `peakRank` sits inside `cycle` (00 §9). If `cycle` is reset on a Fall, the "a Fall never tanks Tribute" floor (`0.6 × peakRank`) disappears.
  5. Specs 03 and 04 still say localStorage; 01, 02 and 00 disagree on Decimal libraries.
- **Fix:**
  - Prompt "Add to Home Screen" before the first Fall, and nag for an Export when the app isn't installed.
  - Write a synchronous localStorage mirror of `SaveRoot` on `pagehide` and `visibilitychange`. It's under 60 KB, so it fits. On load, use whichever of the IndexedDB and localStorage copies is newest and valid.
  - Take a Web Locks API (`navigator.locks.request('overlord-save')`) lock or a BroadcastChannel leader election. Secondary tabs show "Open in another tab".
  - Move `peakRank` to `DeptSave.lifetime`.
  - One save module, one storage backend, and every department spec updated to match.

### M9: The Cauldron's offline rate (and Rank) depends on a noisy 2,000-drop Monte Carlo
- **Where:** 05 §3, §14; 00 §5.1 (Rank uses offlineRate).
- **Problem:** At high Malice, E[mult] is dominated by a rare center hit worth ×20–300. With p ≈ 0.5–2%, 2,000 samples give 10–40 hits, which is a **±15–30% standard error**. Buying one small upgrade changes the board hash, and the displayed "expected value" and offline rate can jump *down* after a purchase. Moving gold pegs make the board depend on time, but how the sim samples their phase isn't specified. Imps are "uniform random", while Taught Imps aim at "best ±1", a separate distribution that also has to be estimated.
- **Fix:** Use common random numbers: the same 2,000 (x, jitter, phase) tuples on every rerun, so only the board changes. Raise the count to 10–20K. It still runs in under 100 ms in a worker, or can be spread over idle frames. Better still, compute bucket probabilities with a discretized transfer matrix (x positions in 1 px bins row by row), which is exact, deterministic and fast. Compute random-x and aimed EVs separately.

---

## Minor

- **m1 (Decimal library is unnecessary).** 00 §8 says local currencies stay below 1e30 per cycle, and the Dungeon spec notes floats are fine below 1e300. The 00 §8 note that Mines HP reaches 1e15 at depth ~220 is fine as a double. Drop `break_infinity` and `break_eternity` and use plain `number` everywhere. Doubles cover the spec's own stated range with plenty of room, and dropping the library removes a dependency, string serialization, and a whole class of bugs. Separately, 02 (break_eternity), 00 (break_infinity) and 01 (floats) disagree about which library.
- **m2 (Suffix notation inconsistent).** 00 uses K M B T aa. 01 uses "K, M, B, then aa" with no T. Unify on 00.
- **m3 (Offline-cap text in the specs is stale).** 01 says 4 → 20 h, 03 says 8 → 24 h, 06 says 4 → 12 h. 00 overrides all three but the specs weren't edited. Upgrade names also collide: Night Shift appears in both Styx and Cauldron, and Long Shift in both Mines and Bridge, which gets confusing in a shared Gobbo report. Rename them.
- **m4 (No cap is consumed while the app is open).** 00 §7 says no cap is consumed while the player is present. Leaving the app open on the Throne Room, for example on a charger, removes every offline cap. That makes Long Reach, Treasury Vaults and the Long Shift nodes pointless for those players and drains battery. Count present-but-no-input time beyond 10 minutes as offline time against the cap.
- **m5 (Steward buys the cheapest upgrade).** The Steward (Gobbo's Satchel L2) buys the *cheapest* upgrade. That means endless 1.08-growth Tap Damage, consumable baits, Dig tiles and Lure tiers, and it spends a balance the player was saving for Floor 2. Rank candidates by Δ`offlineRate`/cost, exclude consumables, spatial items and dial purchases, and don't spend below a "reserved" amount the player sets.
- **m6 (Rank reference rate is undefined for the Dungeon).** Rank's `ref_d` is "offline rate after first helper purchase", but the Dungeon has no helpers. Define ref_d per department as the offlineRate at a fixed scripted state in the balance sim.
- **m7 (Dungeon offline sim details).** It runs at 10 Hz while the live game runs at 20 Hz (01 §3 against §14). Blocking, projectile timing and runes will diverge, so offline won't match what the player saw. Worse, running the sim on `visibilitychange` happens exactly when iOS freezes workers. A fixed seed also lets a player tune a layout to that one seed. Fixes: run at the same 20 Hz; compute only on layout, upgrade or Lure change (00 already says this, so remove the on-hide run from 01); use 3 seeds derived from the layout hash and average them; recompute on *any* upgrade purchase, not just layout changes.
- **m8 (Showdown rewards failure).** 00 §11 creates a Bridge "Showdown" worth 25× fare that fills from heroes slipping through. Offline goons always let heroes through, so every return has a free Showdown waiting. This rewards failure, which 00 explicitly tries to avoid for prestige. Make it 10× fare and fill it only from on-screen play.
- **m9 (Tribute stops gating after day 1).** Tribute accrues at 100% while away. With roughly Ranks 35/25/15/5 at the end of day 1, one 8 h night yields **about 100K Tribute**, so the 25K and 150K Seals cost effectively nothing and Dread is the only real gate for departments 5–6. Either drop the Tribute price for those Seals or apply a 0.5 offline factor to Tribute. It's also worth stating that Tribute is nearly blind to active play, since Rank is built from `offlineRate`. That may be fine, but it should be a deliberate choice.
- **m10 (Gem pacing contradicts the drop rates).** 02 §8 says about 1 Gem per 1.5 minutes. Geodes (1%) plus Lucky Rocks (0.5%) at about 5 rocks/s gives about 4–5 Gems/min. Re-derive one number from the other.
- **m11 (Undefined terms).** The Bridge's Infamy says "≥ 70% correct verdicts", but no one defines what a correct verdict is for toll pricing; only unmask and search are binary. The Mines' Express Lift says "max depth − 15", but max depth resets on a Fall. Store a lifetime `maxDepthEver` and use that.
- **m12 (Stale Cauldron description in 04).** 04 §12 still says the Cauldron uses "canned paths, no aim". 00 §11 notes the fix, but 04 wasn't edited.
- **m13 (Cauldron Infamy isn't a held value).** It's a cumulative count, while the other five "held" inputs are states. That inconsistency makes 00's "ratchets" language misleading for the Cauldron. B2's fix addresses it.

---

## Sanity-check numbers (worked)

| Check | Spec claim | Computed | Verdict |
|---|---|---|---|
| Dread, 1st Fall at 200% | — | 10 × 1 × 4 × 2 = **80** | Unlocks both Styx and Spire gates in one Fall |
| Bridge Dread at N=20, Menace capped | — | 10 × 11 × 1 = **110 per ~3-min Fall** | Unlimited farming (B1) |
| Cauldron first Fall | 3–4 h | **~25–40 min** (Malice 4 at ~20 min, then 20 jackpots at 3–8/min) | B2 |
| Mines total Dig cost to depth 30 | — | Σ100 × 1.32^d ≈ **1.29M**; rocks at d30: 950 HP / 310 reward | OK for the first Fall |
| Mines time per depth level at the regrowth cap (41.7 rocks/s, ×1) | cycles ≤ 5 days | d30: 32 s · d80: **1.6 h** · d100: **12.6 h** · d130: **~12 days** | Fails at Fall ~7–9 (B3) |
| Mines Sharper Picks L60 | — | cost 90K, DPS ×4,384 | Runaway (B3) |
| Spire EV per drop, ceiling T7 | 7.8 | formula as written: **59.7**; correct: **97.2** | Off by ~10× (M2) |
| Spire active : offline | 5:1 | early **~60:1**, late **< 1:1** | M2 |
| Dungeon Lure cost Σ to T15 / T25 | — | 33.8K / **1.39M** | Reasonable, but Fall #2 needs T25 when MVP caps at 20 (M1) |
| Goods per import line | ~1,900 | 1,991 (✓). The Good is shared by 2 lines, so ~4K per Good, about **30 days** | M6 |
| Overnight Tribute end of day 1 (Ranks 35/25/15/5, 8 h) | — | **~102K** | Seals 5–6 cost effectively nothing (m9) |
| Cauldron center mult at M10 | mean ~2.1× | fully upgraded center ×15 × 1.35^10 = **×301** | Needs p_center < 0.4% (B2) |
| Tribute Rank 40 to 44 | +15% | (45/41)^1.5 = 1.15 ✓ | OK |

---

## Three strongest things to keep

1. **Rolling, opt-in per-department Falls paying one shared Dread, with the Legend waiting indefinitely.** Each game gets its own prestige moment and identity, the reward compounds across the suite, no reset ever wipes six games, and the "fall now or push" choice is a gentle decision. Combined with the `run` / `persistent` split in `DeptSave`, a Fall becomes a one-line, bug-resistant operation. Fix the inputs (B1, B2), not the structure.
2. **Non-convertible local currencies plus log-normalized Tribute Rank with a peak floor.** This is the right anti-domination design. 1e15 Nuggets and 1e7 Tollpence weigh the same, spreading attention pays off through diminishing returns rather than requirements, and a Fall never tanks the hub. Keep it, and move `peakRank` to lifetime storage (M8).
3. **A pure `offlineRate(state)` per department, closed-form background accrual with no off-screen simulation, and a headless 30-day balance script in CI.** This is what makes six games manageable for a small team. It's also the tool that would have caught B1–B3, M2 and M6 automatically. Make it the first thing built, alongside the Cauldron, and fail the build on: offline factor > 0.9 of idle, active:offline outside 3–5×, any cycle < 2 h or > 5 days, and any department contributing > 35% of Dread.
