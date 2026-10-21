# Adversarial review: War Pit (07) and its integration (revision 3)

Reviewer stance: hostile. Scope: `07-war-pit.md` in full, `00-advancement-and-economy.md` in full, `README.md` in full, 01–06 skimmed for integration. All arithmetic below uses the specs' own seed formulas. "Seed, the sim will fix it" is not accepted as a defence when the **structure** of a formula makes a band unreachable. The sim can tune coefficients. It cannot turn a linear curve into a geometric one.

Summary: 2 blockers, 15 major, 9 minor. The core loop (shop, merge, deterministic battles, gentle Runs) is sound and worth building. The economy wrapped around it is not. The Pit's Teeth income is essentially linear while its dial prices are geometric, and its idle-only multipliers outgrow active play. Integration is mostly clean, with one real Goods contradiction and a few stale counts.

---

## Blockers

### W-01 — blocker — 07 §7, §8; 00 §2.2 (War Pit row), §8 "Curves"
**Problem.** Stakes prices are geometric (`300 × 3^S`) but Teeth income has no compounding lever. `battleTeeth` tops out at round 10 (8 × 1.12^9 ≈ 22). `payout(S) = 1 + 0.25·S` is linear. The only local income nodes are additive: Tooth Pliers +6%/L (max +150%), Showman (run-end only) and Handlers (skirmish only). Warband strength never raises Teeth per battle. It only moves win rate.
- Reaching the first Infamy target (Stakes 4) means buying levels 1–4: 900 + 2,700 + 8,100 + 24,300 = **36,000 Teeth**. At roughly 30 Teeth/min (active, S0–3) × Late Recruit 2 × early Dread ~1.5 × payout ~1.4, you earn about 125/min, so that is **~5 h of Runs**. 07 §8 says "Stakes 4 by ~1.5 h".
- Fall #5's target (Stakes 14) costs about 2.15e9 cumulative Teeth. A generous late income: 30 × payout 4.5 × Pliers 2.5 × Banners 3.5 × Dread (Iron Fist ~×2, Ruinborn 20 = ×6) × Goods 1.18 ≈ **16,700/min**. That is **~89 days of continuous play** for one cycle. Stakes 20 (1.57e12) is unreachable.
- The step reward of `1 + 0.25·S` falls to ×1.07 by S = 10, below 00 §8's dial band (reward ×1.15–1.35 per step), while every step costs ×3.

**Why it matters.** It breaks hard bands: "Fall reachability #0–#5 inside the shipped dial range", "cycle 2 h – 5 days", and first Fall timing. No coefficient search fixes it, because the curve shapes don't match. The same `500 × 3^M` / `1 + 0.25·M` pair sits in 06 (Bridge). It may survive there only because the Bridge has other multiplicative terms (goons, traffic). It needs an audit too.

**Fix.**
1. Make the reward multiplicative: `payout(S) = 1.22^S` (inside the 1.15–1.35 band), with `heroStats ×= 1.12^S` to match.
2. Re-curve price to `300 × 2.2^S` (tunable range 1.8–2.6), keeping price growth above reward growth by a bounded margin.
3. Give Teeth one compounding tree lever, such as Tooth Pliers ×2 at every 10th level (like the Mines' Tap Damage ×2 per 25), so long cycles have exponential income.
4. Add a sim band to 07 §14.1: "the cost of Stakes level k+1 ≈ 25–60 min of income at level k for the reference bot."

### W-02 — blocker — 07 §3, §6C, §16; 00 §4 (Captives row)
**Problem.** Idle has three multipliers that active play never gets, and they compound:
- Skirmish Pace: 40 s → 15 s, ×2.67.
- Handlers: +250%, ×3.5.
- Drill Yard (+15/+15 on garrison units) plus stationing a Triumph warband against a **round 4–7** ladder. Win factor goes from ~0.74 to 1.0.

At max Kennels: `4/min × 0.35 × 13.4 × 3.5 × 1.0 ≈ 66 Teeth/min × payout`. A Run earns about 35/min × payout (07 §3's own seed). **On-screen idle beats active by ~1.9×.** Skirmishes pause during Runs, so playing *lowers* income.

Captives invert the same way. "1 per 20 skirmish wins" at a 15 s interval and ~100% wins gives **~12/h passive**, against ~10–12/h active (≈ 2 Triumphs/h × 5, plus the trickle, with skirmishes paused). 00 §4 claims "~15/h active, ~4/h passive".

**Why it matters.** It violates pillar 5 (active 3–5×), decision 15, the hard CI band and the user's brief ("faster/fun when played"). The 2.2–2.8× claim in 07 §3 holds only at the seed example (25 s, Handlers 6) and collapses as the Kennels tree is bought.

**Fix.**
1. Cap Skirmish Pace at 25 s (max 6 levels).
2. Recast Handlers as "+X% all Teeth" so it scales Runs equally, or drop it.
3. Define skirmish pay relative to active by construction: `skirmishTeeth = k_idle × refRunTeethPerBattle(r_k, S)`, with `k_idle` tunable and the 3–5× band enforced against the same bot.
4. Captives: 1 per **Run win at round ≥ 6** (active) and 1 per 60 skirmish wins (passive), with the passive rate capped at 1/3 of the active rate.
5. Add a hard sim check: "active : on-screen idle ≥ 1.8× at every Kennels level reachable by the idle-only profile".

---

## Major

### W-03 — major — 07 §2, §9, §7 Infamy; 00 §6 reference player
**Problem.** The reference player gets ~50 min/day active (3×10 + 1×20) across **seven** departments, so about 7 min/day per department. A Pit Run is 10–14 min. The skill gate needs 2 Triumphs at target, and with a 35–50% Triumph rate that is 4–6 Runs, or **50–80 min of Pit play per cycle**. That means a first Pit Fall about 1–2 weeks after unlock, while 00 §8.1 hard-bands cycles to ≤ 5 days and expects 1.5–3 days in weeks 2–4. A paused Run spans sessions, which helps attention but not total time.

**Why it matters.** Either the Pit misses its cycle band, or the sim "fixes" it by making Triumphs trivial, which kills the meaningful failure.

**Fix.** Pick one and band it:
- (a) Short format: Triumph at **8 wins**, Grit 4, shop target 15–30 s, with the Run target at 6–9 min.
- (b) Skill gate counts **Champion bouts**. Any Run that reaches round 10 at Stakes ≥ target may fight the Champion, and the gate needs 2 Champion wins (lose a bout and you keep the Run).

Add a band to 07 §14.1 for the reference profile: Pit skill gate met in ≤ 2.5 days of reference attention.

### W-04 — major — 07 §5.2, §7, §12 vs 01 §5.1, §7
**Problem.** The Pit is distinct from the Dungeon in **mechanics** but nearly identical in **fantasy and meta**:
- Same enemies (Squire, Rogue, Knight, Cleric, Wizard, Champion).
- Same "next party preview, then counter-build" loop (01's HUD shows the next two parties).
- Same boss cadence (a Champion every 10th party vs a Champion at battle 10).
- A near-identical signature event: Dungeon "slay 2 Champions at Lure ≥ T" vs Pit "2 Triumphs (Champion beaten) at Stakes ≥ S".

On the Throne report both read as "killed Champions". 07 §12 argues only the mechanics.

**Why it matters.** The brief's "departments must not feel samey" is judged by players on fantasy and goals first, and mechanics second.

**Fix.** Make Pit opponents **rival warbands**: other warlords' beast-tamers built from the same roster by a seeded "ghost drafter". This is also exactly what makes Super Auto Pets (SAP) what it is (W-05). Keep heroes only as the round-10 boss: a "Monster Hunter" Champion with anti-beast tricks. Rename the signature event "Pit Crowns" and the boss "the Huntmaster" to avoid the word Champion. Swap the Rogue/Knight/Cleric scouting row for rival beast icons.

### W-05 — major — 07 §2, §5.1–5.3
**Problem.** It is less SAP-like than it claims.
- **Asymmetric enemies.** SAP's depth comes from mirror matches: the opponent has the same economy, triggers and synergies, so reading their team is reading a build. Here the enemy vocabulary is 7 classes with one ability each, scaled by `×(1 + 0.15(r−1))`. By round 10 that is a ×2.35 multiplicative stat check (Champion ≈ 23/37 with armor 2 at S0), against additive unit growth (+1/+1 per merge or food). Late rounds become "out-stat the inflation", not "out-synergize the build".
- **Thin starting pool.** 14 units, with **no T5 units at all** (Hydra and Pit Dragon are both ★). T4 has only Manticore and Wyvern, so rounds 7–10 shops are highly repetitive. "A level-up adds a bonus unit of the next tier" does nothing from T4 until Crests are spent. SAP's base pack has ~10 per tier.

**Why it matters.** Replayability is the whole value of a roguelite drafter. Shallow enemy reading makes "counter-building is a skill" hollow.

**Fix.**
1. Ghost-drafted rival warbands (W-04) built by the same bot at a round-appropriate budget. That gives mirror depth for free, deterministically.
2. Starting pool of 18: add one T5 (e.g. a 6/6 "Bone Ogre", Faint: 2 Ratlings ×L) and one more T4 to the base pool. Move one T1 ★ to base, and put a ★ at T2 instead.
3. Enemy scaling additive per round (+1/+1 per 2 rounds to a party budget), not multiplicative.

### W-06 — major — 07 §3 (Skirmish Ladder)
**Problem.** The ladder is fixed at round budgets 4–7. Any warband that finished a Triumph (round-10 strength, L2–L3 merges, Hardy Stock, Brand) wins all 32 bouts, so `idleRate` saturates. After the first Triumph, stationing is a non-decision: Snarl's "old vs new Teeth/min" shows the same number. The Drill Yard (15 levels) buys nothing once win factor = 1. Cautious Stakes adds little because stronger stakes always pay more.

**Why it matters.** The idle game's only decisions (station, Kennels) go dead. The auto-battler's idle layer should reward a better warband continuously.

**Fix.** Use a **Gauntlet** instead of a flat ladder. Each skirmish cycle, the frozen warband fights seeded parties r1, r2, … r12 in sequence until it loses, and pays per round cleared (`Σ battleTeeth(r)` up to the loss, × `k_idle`). It stays deterministic and cheap (≤ 12 battles × 3 stakes), it is strictly monotone in warband strength, and Drill Yard and stationing always matter. `idleRate = (60 / interval) × mean over 8 seeded gauntlets`.

### W-07 — major — 07 §3, §6, §8; 00 §8 hard band
**Problem.** "First upgrade < 60 s" (hard band) fails on the seeds. The cheapest node is Skirmish Pace at 80 Teeth. Round-1 battleTeeth is 8 and a round takes ~30–60 s, so 80 Teeth means ~8 wins, or **5–8 min** (2.5–4 min with Late Recruit). Idle from the starter garrison against a round 4–7 ladder loses almost every bout: 1.5/min × 0.35 × 13.4 × 0.25 ≈ **1.8 Teeth/min**, so ~45 min. 07 §3 asserts "< 60 s".

**Fix.** Give Snarl's opening purse of 120 Teeth on unlock and after each Fall (as the Dungeon's starter kit does). Alternatively, set the first Skirmish Pace level to 10 Teeth. With W-06's Gauntlet, the starter garrison clears r1–r2 and earns meaningful idle immediately.

### W-08 — major — 07 §2 Battle rules, §5.2, §14; 00 §8.1 determinism tests
**Problem.** Determinism is asserted but underspecified.
- `heroStats = base × (1 + 0.15(r−1)) × (1 + 0.12S)`, Hardy Stock +4%, Brand +50% and Veterans ×1.5 all produce floats, yet the engine claims "integer stats". There is no rounding rule or rounding point.
- The RNG stream for **shop-phase** random triggers (Dung Beetle "2 random friends", Mimic "random held item" from which pool?) is unnamed. Battle RNG is seeded by `hash(team, party, round)`, and shops by `runSeed + round + rollIndex`, but buy and sell triggers fall between them.
- A `params.json` tuning change shipped mid-Run silently alters a paused Run's future shops and parties.
- `cache.hash` covers garrison/upgrades/Stakes but not `paramsVersion` or import levels.
- Champion retries: does the round counter advance (heroes keep growing 0.15/round) or stay at 10?

**Why it matters.** "Ladder = on-screen = offline = sim" is the department's main technical promise. Golden tests will flake on float drift and ordering ambiguity.

**Fix.** Add a §14.2 "Engine contract":
- All derived stats are computed once at battle start as `floor(x + 0.5)`, in this order: base → round → Stakes → Hardy → Brand → food.
- Three named mulberry32 streams: `shop(runSeed, round, roll)`, `shopTrigger(runSeed, round, actionIndex)`, `battle(hash(teamCanon, partyCanon, round, paramsVersion))`.
- Item pools for random items are listed explicitly.
- A paused Run snapshots `paramsVersion` and keeps it until the Run ends.
- `cache.hash` includes `paramsVersion` and `imports`.
- Champion retries stay at round 10.
- A total order for simultaneous triggers that includes heroes vs units with equal attack and equal slot.

### W-09 — major — 07 §2, §14.1
**Problem.** CI "fails or flags on any battle hitting the 200-exchange cap", but legal builds stall. Example: Gargoyle L3 (−3 dmg, min 1) stacked with Blood Puddings, against a Knight (armor 1) healed 2 per exchange by a Cleric. Your 3-attack front deals 2 net and gets healed 2, while taking 1 per hit, so it lasts as many exchanges as it has HP. Add Bog Leech HP steal and Hive Wasp Thorns and 200 is reachable. The draft bot will find it.

**Fix.** Add **Sudden Death**: from exchange 50, all damage +1 per 10 exchanges (deterministic). Keep the 200 cap as a pure safety net, and make the CI check "cap hits ≤ 0.01% of battles" rather than "any".

### W-10 — major — 01 §16 (line 238); 00 §11 revision-3 summary
**Problem.** The Goods graph contradicts itself. 01 says Bones are "Imported by the Mines **and the War Pit**", and 00 §11 repeats "01 … exports Bones to the Mines and the Pit". 00 §4's table, 06 §16 and 07 §16 say Bones go to the **Mines and the Bridge**, and the Pit imports Souls + Essence (Bone Barding is a "superseded draft"). As written, either Bones has three importers or the Bridge's Bones line has no source.

**Fix.** 01 §16: "Imported by the Mines and the Bridge (00 §4)." 00 §11: "exports Bones to the Mines and the Bridge". Add a CI lint that parses each spec's §16 export/import lines and checks 7 exporters, 14 links and exactly 2 importers per Good.

### W-11 — major — 07 §3 "Target ratio"; 00 §8 baseline, §7
**Problem.** 07 converts 2.2–2.8× on-screen into 3.7–4.7× offline using the **0.6** base factor. The Pit unlocks on day 6–8, when the reference player has 120–200 lifetime Dread and plausibly 2–4 Idle Hands levels, so the factor is 0.7–0.8. At the 00 §8 baseline ("Throne and Dread upgrades the reference player would own"), 2.2–2.8 ÷ 0.75 = **2.9–3.7×**. The low end fails the hard 3–5× band, and the "drifting to 2.5–3× late" allowance starts on day one for the Pit.

**Fix.** State the Pit's on-screen target as **≥ 2.6× on-screen idle at the reference offline factor at unlock (≈ 0.75)**, centred at 3.2×. Have the sim compute the baseline factor per department at its own unlock time, instead of assuming 0.6. Apply the same check to the Styx and Spire.

### W-12 — major — 07 §14.1; 00 §8.1 (bots, CI, tuning loop)
**Problem.** The draft bot is not buildable as specified, for four reasons:
1. **Compute.** "2-ply reorder look-ahead" is unbounded. With ~20 shop actions × 120 line orders × a battle sim (~0.1–0.2 ms), each round costs ~0.3–0.5 s. Nightly: 2,000 Runs × 21 Stakes × ~13 rounds ≈ **40–70 CPU-hours**. The fast tier's 200 Runs ≈ 15 min, against a 5-min budget. The tuning loop ("coordinate search" over ~40 unit stats plus coefficients) multiplies that by hundreds.
2. **Skill calibration.** The battle is deterministic and the next party is scouted, so a bot that simulates the actual fight has near-perfect information no human has. 00 says each bot has novice/reference/expert, but 07 defines no knobs. Tuning "Triumphs 35–50%" against a superhuman bot makes the game too hard for people.
3. **No telemetry.** GitHub Pages has no server, so there is no human data to anchor the bot. "Playtests move bands" has no data path.
4. **Time model.** "Run length 10–14 min of simulated play" and "active Teeth/min" need seconds per shop action, which the bot never spends.

**Why it matters.** The user asked to rely on simulation. If the Pit's sim is unbuildable or miscalibrated, all of its tuning is fiction.

**Fix.** Rewrite 07 §14.1 with:
- **Bot tiers:**
  - novice: greedy value, no battle look-ahead, 20% random buys.
  - reference: heuristic order (tanks front, start-of-battle damage back, Hurt units front), with at most **8 simulated candidate lines per shop**.
  - expert: 64 candidates.
- **Time model:** shop seconds = 8 + 3 × actions (novice ×1.5), battles at 1× for the first 3 rounds and then 2×.
- **Budgets:** engine ≤ 0.05 ms per battle (asserted in CI); fast tier = 100 Runs at the target Stakes with the reference bot; nightly = 2,000 Runs only at the Infamy target levels (4, 6, …, 14) and 200 elsewhere, sharded across workers.
- **Calibration:** a local "Export playtest log" in Settings (per-Run summary: wins, losses, Stakes, buys, minutes) appended to the save export. The reference bot's win rate is fitted to ≥ 5 playtesters' logs before v0.6 ships.
- **Tuning:** unit stats are tuned on a fast surrogate (per-unit win-rate-added from 50K random-team battles), not by full-Run coordinate search.
- **Unit-health metrics** under ≥ 2 bot policies (greedy and synergy-seeking), so pick rates don't just mirror one heuristic's biases.

### W-13 — major — 00 §8.1 Harness, CI fast tier
**Problem.** The fast tier ("reference profile over 30 days on 3 seeds, ≤ 5 min") runs every department's **live core**. That includes the Spire's headless Matter.js flask and the Dungeon's 20 Hz path sim for every active minute: ~25 h of active play × 3 seeds, which is millions of physics steps. That doesn't fit in 5 minutes. 00 never separates the meta sim from the local sims, so a developer can't actually build this harness.

**Fix.** Use two layers:
1. **Local sims** (live cores and bots) produce per-department `activeRate(state)` and `idleRate(state)` tables over a state grid. They run nightly and are cached as artifacts keyed by params hash.
2. The **meta sim** (30 days, 5 profiles) uses those tables as surrogates, with interpolation, plus the exact `idleRate` modules. Fast tier = meta sim on cached tables, plus local smoke runs only for departments whose code changed. Also state that "sim `idleRate` matches the game module" is trivially true for the same module, and replace it with "fixture saves from release N−1 produce identical `idleRate` under release N's code at the same `paramsVersion`".

### W-14 — major — 07 §10, §13, §11 (readability at 180×320)
**Problem.** A 34×40 card must show:
- a 24×24 sprite;
- attack/HP in a 3×5 font;
- level pips and XP;
- a held-item icon;
- the Brand crown;
- battle statuses (Armor from Sigils, Thorns, Shade, Gorgon skip-strikes);
- a ❄ freeze marker in the shop.

That doesn't fit legibly. The 12 px info line holds ~44 characters at 4 px each. "Manticore: Start of battle → 3 dmg to 2 highest-HP enemies" doesn't fit, and level-scaled numbers make it longer. "SHOP [u][u][u][u][u]" needs 170 px for five 34 px cards plus a label, in 180 px. The ❄ "tap under the slot" target is unsized and likely ~8 logical px. Trigger types (Faint, Hurt, Start, Sell, Buy, Knockout, End of shop, Friend ahead…) are only text, never iconified.

**Fix.**
- Define a card grid: sprite 24×20; stat bar 34×8 (attack left, HP right, 3×5 font with a 1 px outline); top-right 7×7 item; top-left 5×5 level pips; one 7×7 status slot that cycles statuses every 0.6 s; crown as a 1 px outline tint.
- An 8-glyph **trigger icon set** (7×7) stamped bottom-left on every card, so the trigger reads without text.
- The info line shows `[icon] → effect` using symbols: "⚔3 ×2 ♥max".
- Drop the "SHOP" label.
- Freeze moves to long-press-then-❄ or a 34×10 strip under each shop card (≥ 30 physical px at 3×).
- Add a hard rule: every tap target is ≥ 12 logical px (≥ 36 physical px at 3×).

### W-15 — major — 00 §4 Node 1 list; 01 §5.1; 06 §16
**Problem.** **Captives → Dungeon "Caged Bait": a captive in a Bait Chest makes Rogues detour too.** In 01 the Rogue's whole identity is "ignores Bait Chests, needs an Eye of Gloom" (01 §5.1, §6 "each new hero type is a puzzle"). An import that deletes a core counter-puzzle is not a "small mechanic". It also changes the Dungeon's 20 Hz offline sim and golden fixtures from a different release. Separately, **Pillory (+1 crop slot on hero travelers)** directly eases the Bridge's skill gate (evidence-backed Unmasks), which bends the "imports never raise Infamy" rule.

**Fix.**
- Caged Bait L1: Rogues pause 1 s at a baited loop's entrance (they glance but don't detour); L2–3: +10% chest purse.
- Pillory L1: unmasked heroes pay +1× fare as a pillory fine; L2–3: +5% bounty. Crop slots stay a Bridge-tree-only lever.

### W-16 — major — 00 §6.1 v0.6; 07 §15
**Problem.** "6–8 wks solo" for v0.6 is not credible. The list:
- a battle engine with ~25 distinct trigger behaviours and a total ordering;
- 20 units, 6 foods and 8 heroes, all with art (2-frame idles, palette shifts for levels);
- a shop with freeze, merge, level-up bonus and sell triggers;
- a pause-anywhere Run save;
- a Worker ladder with Cautious Stakes;
- stationing UI with a delta preview;
- 4 trees, plus a Bestiary with Pedigrees;
- 3 tactics cards;
- left-handed mirroring;
- 8 Commendations;
- **four** import nodes inside the shipped Dungeon and Bridge (with regression risk to their sims);
- **two** Pit import lines (4 nodes);
- the draft bot at three tiers with calibration.

The Spire (one physics loop) is budgeted at 6 weeks. Auto-battler balance is an iceberg: SAP's own patch history is mostly unit-stat churn.

**Fix.** Re-estimate at **10–12 weeks**, or cut the MVP to:
- 16 units (12 base + 4 ★), 4 foods, 5 hero/rival archetypes plus the boss;
- no tactics cards (keep the Stakes stat curve) and no Pedigrees;
- Node 1 only on all four Captives/Pit import lines (allowed by README OQ 11);
- left-handed mode deferred.

Ship the engine and the bot as a **v0.5.5 internal milestone** (engine + bot + golden tests, no UI) so tuning starts before the art does.

### W-17 — major — 07 §5.2, §14.1; consistency of local bands
**Problem.** The bands don't agree with each other. With independent battles, P(10 wins before 5 losses) is **17% at p = 0.55** and **58% at p = 0.70** (negative binomial). The 35–50% Triumph band needs p ≈ 0.63–0.68. A per-battle band of 55–70% therefore allows Triumph rates of 17–58%, and the two checks will fight the tuner. Win probability also isn't flat: it falls by round, and the Champion is harder.

**Fix.** Drop the per-battle band and keep "Triumph 35–50% at the target Stakes". Add "win rate rounds 1–5 ≥ 75%" (onboarding feel) and "Champion win rate given you reached round 10 at 50–70%".

---

## Minor

### W-18 — minor — 00 §5.2, §6; README decision 9; 00 §11; README Open questions
**Problem.** Stale or contradictory counts:
- Throne table "Seals … Max **6**" should be 7.
- 00 §6 "ships last among the **launch six**": "launch" is undefined now that seven ship.
- README decision 9 text still says "Six … three rare tokens". The amendment note fixes it, but it also omits Chow as an in-Run currency.
- 00 §11 says "Every §17 is now 'Decided'", but 07 §17 keeps four open items.
- README lists OQ 31–34 as "Open", although the user said the chosen defaults are "quite reasonable for now".

**Fix.** Seals max 7. Replace "launch six" with "the first six". Edit decision 9's wording in place. Move OQ 31–34 to Decided as "defaults adopted (provisional, 2026-10-21)" and change 07 §17 to match.

### W-19 — minor — 07 §16; 00 §4
**Problem.** "1 per hero beaten in a Triumph (5 per Triumph)" contradicts itself: a Triumph beats ~35 heroes across 10 battles. Pacing: the re-plan delays the Dungeon's and the Bridge's second import line from day 2 (Souls, revision 2) to day 6–8 (Captives), maxing around day 18–20. 00 §4's rationale glosses over this. Meanwhile the Pit arrives to a stockpile of Souls and Essence and can max both lines on day one, which breaks the "~12 days" band from the Pit's side.

**Fix.** Define Captives as "5 per Triumph (the final party)". Note the Dungeon/Bridge second-line delay as an accepted cost in 00 §4. Add a sim band that the Pit's lines max in no less than 5 days after unlock (e.g. node costs ×1.5 for lines whose Good predates the importer).

### W-20 — minor — 07 §3, §10
**Problem.** "Skirmishes pause while a Run is open on screen", but a paused Run sitting on the shop screen earns **nothing**: no Run progress and no skirmishes. The 10-minute no-input rule then counts it as offline. Does offline resume skirmishes? Also, "Each cycle starts with a starter garrison" reads as "each skirmish cycle".

**Fix.** Skirmishes run whenever no battle is animating, and pause only during the Fight step (so the shop is never dead air). Write "each Fall cycle".

### W-21 — minor — 07 §7
**Problem.** The MVP ships tactics cards 3/6/9 only, but Infamy targets reach 12–14 by Falls #4–#5. Late cycles add no new rules, only stat inflation, which is exactly the "noise not rules" problem D-03c fixed for the Bridge. Holy Smite ("your first-bought unit") is undefined for a frozen Standing Warband.

**Fix.** Ship card 12 in MVP, or cap the MVP target at `min(4 + 2N, 10)` with overflow from the economy gate (as 00 §2.2 allows). Define "first-bought" as slot order for skirmishes.

### W-22 — minor — 07 §6D
**Problem.** Crests: the whole Bestiary plus Pedigrees costs 45 Crests, about 9 h of good play. Triumphs pay 2 Crests at **any** Stakes, so experts farm them at Stakes 0. After that, Crests have no sink except 1-Crest cosmetic banners, and the "unique persistent system" goes dead in week 3.

**Fix.** Triumph Crests require Stakes ≥ target − 2. Add a repeatable sink: cosmetic beast skins, plus Pedigree ranks such as "+1 starting Chow per 10 Crests, max 3".

### W-23 — minor — 00 §8.1 profiles
**Problem.** The "Single-department main" profile is impossible for the Pit (and the Styx and Spire), which need lifetime Dread from other departments. The band "reaches first Fall within 1.5× reference" is undefined for them.

**Fix.** For departments 5–7, the single-department-main profile starts from a fixture save at unlock (reference state at that day) and then plays only that department.

### W-24 — minor — 07 §5.2; 00 §6 "arrive already familiar"
**Problem.** 00 says the Pit's enemies "arrive already familiar", but the Dungeon MVP ships only Squire, Rogue, Knight and Champion (Cleric and Wizard are "Later"). The Pit also adds Ranger and Paladin, which exist nowhere else.

**Fix.** Drop the familiarity argument, or resolve it via W-04 (rival warbands).

### W-25 — minor — 07 §10–11 (ergonomics)
**Problem.** Both fronts sit at the far-left column, so every clash, lunge and damage number happens at x ≈ 17 px, under the left thumb for left-handed players unless mirrored. The line row (y 96–152) is the second most-tapped zone and sits in the upper half on tall phones once 16:9 is letterboxed.

**Fix.** Consider fronts at the **centre-right** with the line growing leftward, or swap the hero row and your line so yours sits at y ≈ 110–150, nearer the shop. Validate thumb reach on a 6.7″ device mock in the v0.5.5 milestone.

### W-26 — minor — 07 §5.4, §3
**Problem.** The Royal Brand (+50% that tracks growth) persists into the Standing Warband, and Ember Hound "rest of Run" gains are baked into the snapshot. That's fine, but Owlbear (End of shop) and Piglet/Beetle (Sell/Buy) are **dead in skirmishes**, so idle silently favours battle-trigger units. Players will station a team and be surprised.

**Fix.** Show a "no effect in Skirmishes" badge on shop-only triggers in the Garrison tab, and fold the effect into Snarl's delta preview.

---

## Three things to keep

1. **One pure deterministic battle engine shared by the game, the ladder Worker and the Node sim** (07 §14, 00 §8.1). It is the cheapest exact offline model in the suite, it makes replays, Skip and golden tests trivial, and it's the right foundation for the simulation-first policy. Harden it per W-08 and keep it.
2. **The gentle-failure package** (07 §4): banked Teeth never at risk, Retreat and Forfeit bank everything plus the run-end bonus, Grit-free rounds 1–2, catch-up Chow after losses, one-tap "Drop Stakes by 2?". Failure costs only potential (a missed Triumph and its Crests), never progress. That is exactly the suite's rule, and it makes a roguelite fit an idle suite.
3. **The 14-link Goods re-plan that keeps two importers per Good** (00 §4), with the Pit last so both its lines are live on arrival. It preserves the per-line economics, the 2/h trickle and the +18% cap without special cases. Fix W-10's stale text and soften Caged Bait (W-15), but don't reopen the graph.

(Also worth keeping: the tap-tap placement with valid-target pulses, and Cautious Stakes as the idle floor. Both are cheap and player-friendly.)
