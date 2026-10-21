# 06 — Troll Bridge (design spec)

Status: **revision 2**, after adversarial review; **revision 4** (2026-10-21) adds the department manager, Grumm (§18; shared system in 00 §5.4), icon-only per decided OQ 27. Ships in **v0.3**.

## 1. Fantasy & pitch
**One line:** *Size up every traveler who reaches your bridge, catch the lie in their story, squeeze them for exactly as much as they'll bear, and unmask the heroes sneaking into the empire.*

The only road into the Overlord's realm crosses a single rickety bridge. Under it lives **Grumm**, the Overlord's Bridge Troll: dim, proud, very fond of shiny coins. He's the empire's border control *and* its customs office. **The player is the Overlord, giving Grumm his orders:** you name the price and the verdict, and Grumm growls it at the traveler. Grumm drops the take, **Tollpence**, into the throne's coffers. Tone: Papers Please-lite, played for laughs. Nobody dies; the worst thing that happens is Grumm gets bonked and has a nap.

## 2. Core loop (active)

Review finding D-03 showed that probability noise turned deduction into a coin flip. The Bridge now runs on **contradictions**: every traveler tells a story, and the evidence is where the story and the sprite disagree.

1. **Arrive (about 1 s).** A traveler walks in and stops at the toll gate. A speech bubble shows their **Claim** as two icons: *who* (Pilgrim, Merchant, Peasant, Adventurer…) and *where to* (Shrine, Market, Farm, Fort…).
2. **Read (2–6 s).** The **Clue Strip** shows 3 **zoomed pixel crops** (16×16) of the traveler's sprite (4–5 slots once upgraded). They are crops, not interpreted icons, so you still have to read them (D-03f). Tells are only **large parts**: hat, cloak, boots, held item, pack, aura (D-26). Each tell either **fits** the Claim or **contradicts** it:
   - A "Pilgrim to the Shrine" with clean boots is suspicious, *because pilgrims walk barefoot*.
   - A "Peasant to the Farm" with a bulging pack and new boots might be a smuggler.
   - Tap a crop to zoom for 1.5 s. Zoom also shows small facial details as a bonus hint, with Grumm's thought bubble ("Shiny boots... on a pilgrim?").
   - **Red herrings** are tells that *look* odd but fit the Claim (a "Merchant" in a patched cloak is just stingy).
3. **Name a toll (1–3 s).** Drag the **Coin Stack** on the right edge. Each notch is **0.1× base fare**, with a haptic tick and a bigger coin every 0.5× (D-04), so about 30 notches fill the drag height. A **Mood Face** shifts from happy to annoyed to furious. Wallet Sense shows a shaded **band** on the Coin Stack where the traveler's Wallet probably lies; it narrows as the upgrade levels.
4. **Haggle (0–2 rounds).** Let go to demand. The traveler then does one of these:
   - **Pays.** The toll is at or under their *Wallet*.
   - **Counter-offers.** The toll is above Wallet but within Patience. The counter shows in the speech bubble: tap it to accept, or drag again to push.
   - **Turns back.** Patience runs out. You get no toll and a 2 s walk-off.
   - **Bonks Grumm.** Patience runs out *and* the traveler is the Brawny type. Grumm naps (see §4).
5. **Judge (optional).** Before naming a toll, **press and hold** one of two verdict buttons (250 ms fill ring confirms; D-05):
   - **SEARCH** (smuggler check, 2 s). Contraband: confiscate the goods (+3× fare) plus a fine. Innocent: they're offended, Patience −50% and Wallet −20%.
   - **UNMASK** (hero check). The **Bounty scales with evidence**: 0 contradictions visible = 2× fare, 1 = 5×, 2 or more (or a Wanted Poster match) = **10×**. If you're wrong, the traveler storms off for free, Grumm blushes, and your **Streak breaks**.
6. **Next.** Travelers arrive every **7 s** and **queue** (up to 3 on the bench) while you read, so none are lost to slow reading. Overflow beyond the bench is waved through by the goons at the goon rate.

**Daily Wanted Poster (D-03b):** each real day, the board by the gate shows one named hero with 2–3 features (e.g. "Sir Pellam: red plume, oak shield, limps"). A traveler matching ≥ 2 Poster features counts as 2+ evidence. It's a rotating rule set that keeps veteran play fresh.

**Example.** A traveler claims *Pilgrim → Shrine*. The crops show a patched robe (fits), *very* clean boots (contradicts: pilgrims go barefoot) and a faint glow at the hem (contradicts: pilgrims don't glow). That's two contradictions. You hold UNMASK: "A PALADIN!" They flee and you bank 10× fare. Next, a merchant claims *Merchant → Market*, base fare 12, Wallet 1.5–2.5×. Wallet Sense shades 1.8–2.6×. You drag to 3.0× (36). The face turns annoyed and they counter at 2.6× (31). You push to 2.8× (34), and they grumble and pay. Then a scrawny "Peasant → Farm" arrives with a barrel 3× their size. You hold SEARCH: contraband pickled eels, +3× fare and a fine.

## 3. Passive / idle
When Grumm isn't being directed (you're elsewhere, the app is closed, or 10 s without input on screen), the **Goon Trolls** work the gate. They charge a flat toll, don't read clues, don't haggle and never unmask anyone.

```
idleRate     = traffic_rate × avg_base_fare × goon_flat_mult × goon_efficiency × payout_mult(M_set)
traffic_rate = 1/7 per s (fixed; Wider Planks removed, M2)
goon_efficiency = min(1, goons_hired × 0.05 / traffic_rate)      // 3 goons cover base traffic
```
- `goon_flat_mult` starts at **1.0**, and Goon Pricing raises it to 1.4. Goons never overcharge.
- Smugglers pass untouched and heroes get through. Heroes passing while you're away **do not** add Hero Whisper pips (m8).
- Contraband crates are rolled per offline hour: `confiscated = floor(hours × 0.2 × max(1, sniffer_level))`, each worth 3× fare (M6).
- Offline: the shared core applies the suite offline factor and cap (00 §7). There's no local cap node.
- **Target ratio:** skilled active play averages ~3.2× fare per traveler (overcharge, evidence bounties, confiscations, streak), so active ≈ 2.3–3.2× on-screen idle and **≈ 3.5–5× offline** at baseline. Late game drifts to ~2.5×. The balance simulation verifies this.

The report line reads: "Goons collected 4,210 Tollpence and waved through 2 suspicious pilgrims. 1 eel barrel seized."

## 4. Gentle failure modes
| Failure | Trigger | Consequence | Recovery |
|---|---|---|---|
| **Turn-back** | Toll > Wallet + Patience slack | Lose that traveler's fare | The next traveler is already on the bench |
| **Bonk & Nap** | Brawny traveler pushed past Patience | Grumm sleeps **20 s** (Thick Skull cuts it to a 6 s minimum). Goons take over at the idle rate. | Tap Grumm to wake him early: each tap removes 1 s |
| **False accusation** | Unmask or Search an innocent traveler | Lose that fare and **break the Streak**. Search also costs 2 s. 3 false accusations in 60 s drops goon-lane traffic −20% for 30 s ("word gets around"). | Time |
| **Hero slips through** | You let a disguised hero pass while on screen | +1 **Hero Whisper** pip (§7). Nothing is taken from you. | Unmask the next hero to remove a pip |

Nothing ever drains banked Tollpence, and nothing can ever stop the bridge from earning.

## 5. Entities
Each traveler has a **Claim**, a set of **tells** (parts), and hidden stats: **Wallet** (the most they'll pay without arguing, a multiplier on fare), **Patience** (extra overcharge they'll tolerate), **Brawn** (chance they bonk), plus a contraband flag and a hero flag. Truthful travelers' tells always fit their Claim, apart from red herrings. Liars' tells always include contradictions, but only some of them land in the visible crop slots. The uncertainty comes from **limited slots and rule complexity, not random clue suppression.**

| Traveler | Spawn % (Menace 0) | Base fare | Wallet | Patience | Brawn | Tells (large parts) |
|---|---|---|---|---|---|---|
| Peasant | 30 | 4 | 1.0–1.3× | +0.3× | 5% | patched cloak, bare feet, hoe |
| Pilgrim | 15 | 6 | 1.1–1.5× | +0.5× | 0% | robe, bare feet, staff, beads |
| Merchant | 20 | 12 | 1.5–2.5× | +0.4× | 10% | rings, fat purse, fancy boots |
| Noble *(Toll Booth)* | 5 | 30 | 2.0–3.5× | +0.2× | 0% (guard bonks: 40%) | feather hat, perfume cloud |
| Adventurer (honest) | 10 | 10 | 1.2–1.8× | +0.3× | 60% | open sword, scarred armor |
| Smuggler (lying) | 12 | 8 | 1.0–1.6× | +0.6× | 20% | claims Peasant or Pilgrim; bulging pack, new boots, heavy barrel |
| Hero (lying) | 7 | 10 | 1.0× | +0.1× | 80% | claims Pilgrim, Peasant or Merchant; 2–3 of: hidden hilt, holy glow, too-clean boots, shield-shaped pack |
| Bard *(later)* | – | 5 | 0.8× | +1.0× | 0% | lute; pays in song (+10% for 30 s) |
| Tax Collector *(later)* | – | 0 | – | – | – | Collects from *you* unless bribed. A comedic sink. |

**Red herrings:** 10% of truthful travelers show one odd-but-consistent tell. This is constant; Menace doesn't scale it.

**Grumm** (department head): Intimidation (Patience slack), Eye (crop slots), Skull (nap length).

**Goon Troll (hired):** each handles 0.05 travelers/s at `goon_flat_mult`. They're visible as little trolls on the bank, nodding and pointing.

## 6. Upgrade tree (all costs in Tollpence)
`cost = base × growth^level`. Nodes over 10 levels follow the visible-milestone rule (00 §8): e.g. Fancy Signage gets a new sign sprite every 10 levels.

**A. Grumm (active power)**
| Node | Base | Growth | Max | Effect |
|---|---|---|---|---|
| Intimidating Glare | 50 | 1.15 | 50 | Patience slack ×(1 + 0.04·L) |
| Haggler's Tongue | 80 | 1.18 | 30 | Counter-offers land +2%·L closer to your demand |
| Thick Skull | 120 | 1.25 | 14 | Nap = max(6, 20 − L) s |
| Big Fists | 200 | 1.3 | 10 | Brawn chance ×(1 − 0.05·L) |

**B. Eye for Lies (reading)**
| Node | Base | Growth | Max | Effect |
|---|---|---|---|---|
| Squint | 150 | 2.5 | 2 | +1 crop slot per level (3 → 5) |
| Wallet Sense | 100 | 1.2 | 25 | The Wallet band on the Coin Stack narrows: ±(30 − L)% |
| Hero Nose | 300 | 1.35 | 10 | +10%·L chance a liar's contradiction is placed in a visible slot |
| Sniffer Dog | 250 | 1.3 | 10 | Smugglers show a sniff crop with p = 0.1·L. Also improves offline crates. |

**C. Bridge (fares and flow)**
| Node | Base | Growth | Max | Effect |
|---|---|---|---|---|
| Fancy Signage | 200 | 1.22 | 40 | All base fares ×(1 + 0.05·L) |
| Waiting Bench | 500 | 2.5 | 2 | Bench holds +1 traveler (3 → 5) |
| Toll Booth | 1,000 | 3.0 | 5 | Unlocks a traveler type (Noble, Bard, …) and +10% rich spawn weight |

**D. Goon Squad (idle)**
| Node | Base | Growth | Max | Effect |
|---|---|---|---|---|
| Hire Goon | 75 | 1.6 | 6 | +1 goon (0.05 travelers/s) |
| Goon Pricing | 150 | 1.2 | 20 | goon_flat_mult = 1.0 + 0.02·L (max 1.4) |

(Long Shift was removed, since offline caps are suite-level now.)

## 7. The dial: **Menace**, and the Fall
Grumm puts up scarier signs to demand more, and the empire's enemies respond with cleverer disguises. **Each Menace level is bought once per cycle** (`500 × 3^M` Tollpence) and resets on Fall. Once bought, Menace is free to set anywhere at or below your highest level (B1). Lifetime bounties no longer unlock Menace; they unlock **traveler types and Codex pages** instead.

**Menace adds rules, not noise (D-03c):**
```
payout_mult   = 1 + 0.25·M           // fares, bounties, confiscations (seed; under audit, see below)
hero_share    = 7% + 0.5%·M          // capped at 17%
patience_mult = 1 − 0.02·M
```
**Audit (W-01):** `payout_mult` is linear while Menace prices are geometric, the same shape that broke the War Pit's Stakes. The Bridge may survive it through its other multiplicative terms (goons, traffic), but the sim must show the dial step-cost band (00 §8.1: each level ≈ 25–60 min of income at the previous one). If it fails, the fallback is `payout_mult = 1.2^M`.

| Menace | New rule card (stays active above this level) |
|---|---|
| 3 | **Writs of Passage:** some travelers carry a writ. Heroes forge them, and the seal colour must match the day's Poster. |
| 6 | **Hat Smuggling:** smugglers may hide goods in hats. A hat that's too tall for the Claim is a contradiction. |
| 9 | **Disguise Kits:** one hero tell per day is "fake" (the Poster says which) and must be ignored. |
| 12 | **Travelling Pairs:** two travelers arrive together with one Claim; one of them is lying. |
| 15 | **Bribes:** smugglers may offer a bribe. Taking it waves them through (a fare now vs a confiscation). |
| 18 | **Shapeshifters:** a hero's Claim changes if you zoom twice. |

**Infamy (00 §2.2):**
- **Skill gate:** **5 evidence-backed Unmasks** (≥ 2 visible contradictions or a Poster match) at Menace ≥ `min(4 + 2N, 20)` this cycle. This replaces "≥ 70% correct verdicts", which nobody had defined (m11).
- **Economy gate:** this cycle's Tollpence ≥ `E0_bridge × 3^N`.
- **Fall:** the Legend simply... walks across. It resets Tollpence, all four trees and Menace levels. **Kept:** the traveler Codex and lifetime bounties.

**Hero Whisper (local mini-meter, not Infamy):** each hero who slips through **while you're on screen** adds a pip. Unmasking a hero removes one. At 5 pips a named hero sends a taunting letter and arrives as a **Showdown** traveler with a harder disguise, worth **10× fare** if correctly unmasked (m8). Offline heroes never add pips.

## 8. Local currency: **Tollpence**
- **Earned** from tolls (base fare × accepted multiplier × payout_mult), Bounties (2–10× fare), confiscations (3× fare + fine) and goon income.
- **Spent** on the §6 tree and Menace levels.
- **Display:** shared `formatNum`. A jingling coin pile next to Grumm grows in visible tiers (a sack at 1K, a chest at 100K, a hoard at 10M).
- **Streak:** each consecutive accepted toll at ≥ 1.3× fare adds +5% payout (max +50%). It resets on any turn-back or false accusation.

## 9. Session shapes
- **30 s.** Open the app and read the goon haul. Process the 3 travelers on the bench, buy 1 upgrade, leave.
- **5 min.** About 40 travelers, with 2–3 heroes and 4–5 smugglers. Check today's Poster, buy the next Menace level, and try for a 10-traveler Streak. Buy 3–5 upgrades.
- **30 min.** About 240 travelers. Push Menace into a new rule card, hunt evidence-backed Unmasks for the Infamy gate, unlock a traveler type, top up the goon squad before logging off.

## 10. Screen layout (180×320 logical, portrait)
```
y=0   +----------------------------------+
      | safe-top pad (0-24px by device)  |
y=24  | Tollpence 12.3K  Menace 4 ▮▮░ [⌂]|  HUD bar (16px) + Infamy bar
y=40  |----------------------------------|
      | Crops: [■boot][■hem][■pack] 📜   |  (20px) tap = zoom; 📜 = Poster
y=60  |----------------------------------|
      |   sky / far bank / goons idling  |
      |   (Claim: 🙏→⛪)  (Mood Face)     |
      |   ~~~~ [TRAVELER]  [GATE] GRUMM  |  Bridge scene (140px)
      |   ===========================    |  bench queue at left edge
      |      ~ river ~   ~  ~            |
y=200 |----------------------------------|
      |  speech bubble / counter-offer   |  (24px) tap = accept
y=224 |----------------------------------|
      |  [UNMASK]          |Coin |       |  Thumb zone (72px)
      |  (hold)            |Stack|       |  verdict buttons 32×24, left
      |  [SEARCH]          | ▒▒▒ |       |  Coin Stack right edge, with
      |  (hold)            |     |       |  Wallet band (mirrors if LH)
y=296 |  [Upgrades]   streak x7  [Bridge]|  tab bar (16px)
y=312 | safe-bottom pad (8px+)           |
y=320 +----------------------------------+
```
Every interactive element sits below y=200, apart from crop taps and the Poster, which are read-only conveniences. The verdict buttons and the Coin Stack sit on opposite sides, so a price drag can't fire a verdict.

## 11. Controls (one-handed)
- **Drag (vertical) on the Coin Stack** sets the toll in 0.1× notches. There's a haptic tick every 0.5× (`navigator.vibrate(5)` where supported). Releasing sends the demand.
- **Tap the speech bubble** to accept a counter-offer.
- **Press and hold UNMASK or SEARCH** for 250 ms (a fill ring confirms) to give a verdict. There's no swipe-anywhere gesture.
- **Tap a crop** to zoom on it. **Hold the traveler** for a 1 s "squint" that outlines all visible tells.
- **Tap the Poster** to view today's Wanted features.
- **Tap a sleeping Grumm** to wake him faster.
- A left-handed option mirrors the thumb zone.

## 12. What makes it DIFFERENT
None of the other six departments is a **social deduction / negotiation** game. Dungeon is placement and mazing, Mines is tap-to-mine (rhythm as an upgrade), Styx is cast-and-tension timing, Spire is physics stacking, Cauldron is steering a flow, War Pit is drafting a warband for hands-off battles. Troll Bridge is about **catching lies and pricing risk**: a judgment call on every traveler. Its verbs (drag a price, hold a verdict) and pacing (discrete beats, a turn-based feel) don't show up anywhere else. Success comes from reasoning about contradictions and today's rules, not dexterity. It also has **rule-card progression** as its unique structure (D-14), and characters who talk back, so it carries the suite's comedy.

## 13. Pixel art & juice
- Travelers are 24×40 px sprites built from swappable large parts: body, hat, cloak, boots, held item, pack, aura. That gives hundreds of combinations from about 60 part sprites, and every clue is a part swap. Faces are just expression variants. Tells never depend on facial pixels.
- Grumm is 40×48 px with an idle chew, a squint, a greedy grin and a nap pose with snore bubbles.
- **Pay:** coins arc into the pile with a 3-frame sparkle and a pitch-stepped "clink" that rises with the streak.
- **Unmask:** the disguise rips off with a cloth-tear sound, a 4-frame freeze on the hero's shocked face, "BOUNTY ×10!" pixel text scaled by the evidence tier, and a coin fountain.
- **Search:** the barrel lid pops and eels flop out.
- **Bonk:** a 2-frame white flash and a 4 px screen shake, stars orbit Grumm, then a "zzz" loop.
- **Return ritual (v1.1, 00 §5.3):** goon crates are stacked by the gate. Hold SEARCH on them to pop them open (eels, ore, potions) for +5% of the offline haul.

## 14. Technical notes (PixiJS v8)
- **No physics needed.** All motion is tweens, using a tiny custom tween helper.
- Render to a 180×320 base with `roundPixels: true`, `antialias: false`, `scaleMode = 'nearest'`.
- **Single spritesheet atlas** (≤ 1024²) for all traveler parts. Each traveler is a `Container` of about 7 `Sprite`s. Pool up to 6 (bench + current + leaving).
- **Crops:** render the traveler once into a small RenderTexture and show 16×16 sub-rectangles in the Clue Strip, scaled ×1 (they're already big at 16 px).
- **Logic is separate from rendering.** A traveler (Claim, parts, stats) is generated from a seeded RNG (`seed = runSeed + travelerIndex`). The daily Poster is seeded by the date, so travelers are reproducible and testable.
- `idleRate` is the closed form in §3. Shared save module, shared `formatNum`.
- Perf is trivial (< 60 draw objects). This is the department to use for low-end phone testing.

## 15. MVP vs later (ships in v0.3)
**MVP:** Grumm plus 6 traveler types (Peasant, Pilgrim, Merchant, Adventurer, Smuggler, Hero), Claims and contradiction tells, 3 crop slots, the daily Wanted Poster, Coin Stack haggling in 0.1× notches with one counter round, hold-to-confirm Unmask and Search, evidence-scaled bounties, Bonk & Nap, **Menace 0–20 bought per level** with rule cards 3/6/9, the bench queue, the 4 upgrade categories (Toll Booth only unlocks Noble), goons, the streak, Infamy gates and Fall.

**Later:** rule cards 12/15/18, Noble with guard, Bard, Tax Collector, multi-round haggling, named recurring heroes, Hero Week events, weather that changes the traffic mix, the crate return ritual, cosmetics for Grumm.

## 16. Meta-economy hooks (per 00)
- **Tribute:** via Rank from `idleRate`.
- **Export (v0.3):** **Contraband**: each confiscation = 1, goon crates, plus the 2/h base trickle.
- **Imports:** Bones → Skulls on posts (+5% fare; v0.3). Captives → Pillory: unmasked heroes pay +1× fare as a pillory fine (L1); +5% Unmask bounty (L2–3, later). Crop slots stay a Bridge-tree lever, so the import never eases the Unmask skill gate. This line is hidden until the War Pit unlocks (v0.6) and ships Node 1 only. 2 mechanic nodes per line (00 §4). The revision-2 Essence → Truth Rune line was retired in the seven-department re-plan.
- **Infamy and Fall:** §7.

## 17. Decided questions (department-local; ratified 2026-10-21 with the recommended defaults, see README)

1. Should Grumm talk in readable text, or in pixel gibberish with icon-only bubbles? **Decided:** Icon-only Claims and bubbles, gibberish voice; easier to localize and readable at 180 px. (README OQ 27) Revision 4 keeps this for Grumm's manager bubbles too; Gobbo translates him in the report (§18).
2. Should goons get a skill-based offline bonus (e.g. a share of your recent accuracy)? **Decided:** No, stay flat. (OQ 28)
3. Is "Grumm" OK as the name, or should the troll be customizable? **Decided:** Keep Grumm. (OQ 29)

## 18. Manager: Grumm

**Grumm**, troll, keeper of the Bridge. Revision 4 promotes him from department head to the department's **manager** under the shared system (00 §5.4). He's the suite's one **icon-only** manager: per decided README OQ 27, his bubbles are icons plus gibberish, never readable text. Gobbo translates him in the report and in the Manager log.

- **Personality and voice:** dim, proud and loyal, above all proud of *his* bridge: he polishes the railings, counts coins badly and shows every coin to the Overlord like a cat bringing a mouse. Greed belongs to Gritch (02 §18); Grumm's coins are about pride, not wanting more. He talks in icon "sentences" of 1–3 symbols, punctuated by chest-thumps, and he points at things. He calls the Overlord with a **pointing-claw icon** (☝) and a bow. He's easily delighted, blushes when wrong and sulks briefly. His gibberish voice is deep rumbles, with a chewing pop between "words" and a snort for laughter.
- **Portrait expressions (his 40×48 in-scene sprite, plus a 32×32 portrait for the report and the Throne Room):** *chew* (default), *squint* (suspicion, clues), *greedy grin* (coins, bounties), *blush* (false accusations, the Legend walking past), *nap* (bonks, long absence), *chest-thump* (milestones, Unmasks).
- **Dock (Bridge exception):** no slide-in strip. Grumm is already on screen, so his bubble rises **from his sprite** and settles over the river on the right of the bridge scene (x 116–176, y 168–196), clear of the traveler's Claim bubble and Mood Face at the top of the scene (y 60–100, which the first draft overlapped, R4-10), the speech-bubble row (y 200–224), the clue strip and the thumb zone. In the report and the Throne Room he uses the standard mini-portrait.
- **`isIntense`:** a Coin Stack drag, a verdict hold, the Unmask or Search animation, or a counter-offer waiting.
- **Icons he uses:** 🪙 Tollpence, ☝ (you), traveler-type and destination icons from the Claims, crop/eye, boot, aura, 📜 Poster, mask (Unmask), barrel (Search), goon, ✓/✗, 💤.

**Onboarding script (first entry after the Seal; ~85 s; taught entirely by icons, ghost-finger and highlights):**
1. **Look.** A scripted Merchant arrives. Bubble: [eye][crop]. A ghost taps the first crop. Done when the player zooms any crop.
2. **Price.** Bubble: [🪙][⬆][😊]. A ghost drags the Coin Stack up to inside the Wallet Sense band. Done when any toll is paid.
3. **First upgrade.** The Upgrades tab pulses on Hire Goon. Bubble: [goon][🪙]. Done on purchase (inside the 60 s band).
4. **Catch the lie.** A scripted "Pilgrim → Shrine" with clean boots and a glowing hem. Bubble: [pilgrim][boot][✗], then [mask]. A ghost holds UNMASK. Done on the Unmask (guaranteed correct, bounty ×10). Grumm chest-thumps.
5. **Search.** A scripted "Peasant → Farm" with a huge barrel. Bubble: [barrel][?]. A ghost holds SEARCH. Done when the eels flop out.
6. **The Poster.** The Wanted Poster pulses. Bubble: [📜][eye][☝]. Done when the player opens it. Grumm points at the gate and settles in.

**Rule-card micro-lesson** (`mechanic_unlocked` on each new rule card; 2 beats): (1) the card appears on the Poster board, and Grumm points at it: [📜][card icon]; (2) a scripted traveler shows the new rule's tell (a writ with the wrong seal, a too-tall hat…), and the beat is done on a correct verdict or after one traveler.

**Milestone triggers and example lines** (bubble icons; the translation is what Gobbo writes in the log and report):

| Trigger (00 §5.4) | Condition | Expression | Bubble | Gobbo's translation |
|---|---|---|---|---|
| `first_upgrade` | first Wallet Sense level | squint | [eye][🪙][✓] | "Grumm sees purses now." |
| `first_helper` | 3 goons (base traffic covered) | chest-thump | [goon][goon][goon] | "Grumm has a gang." |
| `tier_reached` | first 10× evidence bounty | greedy grin | [mask][🪙][🪙] | "Big hero, big coins." |
| `mechanic_unlocked` | new rule card (Menace 3/6/9…; runs the micro-lesson) | squint | [📜][card][eye] | "New rule. Grumm watches." |
| `dial_raised` | Menace bought: first, every 5th, new max | greedy grin | [sign][⬆][🪙] | "Scarier sign. More coins." |
| `hazard_first` | first Bonk | nap | [💥][💤] | "Grumm bonked. Nap." |
| `struggle` | 3 false Unmasks in a row | blush | [mask][✗][😳] | "Grumm wrong. Grumm sad." |
| `infamy_50` | Infamy ≥ 50% | chest-thump | [☝][⬆] | "Boss famous. Grumm proud." |
| `legend_arrives` | the Legend at the gate | blush | [hero][⚔][😟] | "Big one coming. Walks over." |
| `return_after_fall` | first entry after a Fall | chew | [bridge][🔨][✓] | "Bridge fixed. Grumm ready." |
| `return_long_absence` | ≥ 8 h away | nap | [💤][goon][🪙] | "Goons worked. Grumm slept." |
| `goods_link` | Bones or Captives line opened | greedy grin | [skull][post] | "Skulls on posts! Pretty." |
