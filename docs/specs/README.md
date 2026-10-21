# Overlord — Design Specs (revision 4)

## Overview

**Overlord** (working title) is a mobile-first, portrait PWA (PixiJS v8 + Vite, ~180×320 pixel art, integer-scaled, hosted on GitHub Pages). It's a suite of seven passive/active incremental sub-games. The player is an evil Overlord, and each sub-game is a **department** of the empire that reports to the **Throne Room** hub: the Cauldron (idle plinko), the Goblin Mines (a tap-to-mine clicker whose war-drum rhythm is an upgrade), the Dungeon (tower defense), the Troll Bridge (lie-spotting and haggling), the River Styx (soul fishing), the Sorcerer's Spire (Suika-style merging) and the War Pit (a Super Auto Pets-style auto-battler against rival beast warbands, added in revision 3). Every department keeps progressing when ignored, plays 3–5× faster when played, and only ever fails gently. Departments pay **Tribute** to the throne (spent on unlocks and hub upgrades). Each department has its own prestige moment, the **Fall**: a waiting Legendary Hero sacks it, the Overlord captures the hero, and the department resets for **Dread**, one shared prestige currency that strengthens every department. From v0.3, each department also exports one **Good** that two partners import for small bonuses. Each department is run by a **manager** (Granny, Gritch, Ledger-Bones, Grumm, Pilk, the Head Sorcerer, Snarl) who shows the player around on unlock and chimes in at milestones. No department ever depends on another. **Every number in the specs is a starting point.** Fine-tuning belongs to a headless balance simulation that runs in CI (00 §8.1), and the specs commit to target bands.

**Revision 4 (2026-10-21):** applies two user decisions. (A) **Goblin Mines rhythm:** plain tap-to-mine is now the Mines' core verb, and the war-drum beat is an upgrade, the **Doom Drum** branch with levels and companion nodes (02 rewritten; 00 §4, §6 and §8.1 touched). (B) **Department managers:** the department heads become managers with a shared onboarding, milestone and chattiness system (00 §5.4, save model in 00 §9), and every spec 01–07 gains a §18 "Manager" section. Decision 23 is reworded in place (marked ‡). Decisions 43–52 are new and listed below for ratification. Every other decision, decided question and open question is unchanged. An adversarial review of the revision 4 edits (`review-rev4.md`, R4-01…R4-23) followed and has been applied: 19 fixed and 4 rejected; decisions 43, 47, 49 and 51 are worded to match.

**Revision 3 (2026-10-21):** adds the War Pit (07), re-plans Goods for seven departments, adopts simulation-driven tuning, and records every open question so far (OQ 1–34) as decided with its recommended default (you accepted them). It then applies the War Pit's adversarial review (`review-war-pit.md`, W-01…W-26): 07 is now at its own revision 3, and 00, 01, 03, 04 and 06 are updated to match. Decisions 31–36 (revised by that review) and 37–42 (new) are listed below for ratification. Decisions 1–30 that the seventh department touched are now worded for seven departments in place (marked †).

## Spec index

| File | One line |
|---|---|
| `00-advancement-and-economy.md` | The meta layer: Infamy/Fall/Dread prestige, currency map and multiplier stacking, Goods, Throne Room, **department managers (§5.4)**, unlock order, build phases, offline rules, two-layer simulation-driven tuning (§8.1), save model. |
| `01-dungeon.md` | Tower defense with Bait Chests, Lure dial, Glare/Trapdoor/Gong, thief-chase leaks, blueprints that survive Falls. |
| `02-goblin-mines.md` | Tap-to-mine a 5×5 rock wall with crits, kegs and vein-hunting; the **Doom Drum** upgrade branch adds the beat (Beat Hits, Frenzy, drummer goblins); goblin crew, Dig Deeper depth dial, Gems and Infernal Engineering. Manager: Gritch. |
| `03-river-styx.md` | Cast → nibble → hook → reel soul fishing with tension on the line, Wrath dial, Codex and Trophy Wall. |
| `04-sorcerers-spire.md` | Drag-aim Suika merging to a Void Star and Singularity, Volatility dial, a separate Apprentice Flask for idle, Tomes. |
| `05-cauldron.md` | **Starter / first build.** Idle plinko where you steer a continuous flow with cursed Ladle pegs and chute Tosses, Malice dial, recipe Batches. |
| `06-troll-bridge.md` | Catch contradictions between a traveler's Claim and their look, haggle in 0.1× notches, unmask heroes, Menace adds rule cards. |
| `07-war-pit.md` | **New (v0.5.5 engine milestone, v0.6 release).** Super Auto Pets-style auto-battler: shop/roll/freeze/merge a 5-beast line against scouted, ghost-drafted rival warbands; deterministic battles under an engine contract; 8-win Runs end in Triumph (beat the Huntmaster) or Retreat, both banking everything; idle Skirmish Gauntlets computed exactly; multiplicative Stakes dial with tactics cards; Pit Crowns for Infamy. |
| `review-design.md` | Adversarial review: design and fun (D-01…D-26). |
| `review-economy-scope.md` | Adversarial review: economy, balance and scope (B1–B4, M1–M9, m1–m13). |
| `review-war-pit.md` | Adversarial review: the War Pit and its integration (W-01…W-26). |
| `review-rev4.md` | Adversarial review of revision 4: the Mines' Doom Drum and the department managers (R4-01…R4-23). |

## Key decisions to ratify

Approve or reject by number. Decisions 1–30 are carried from revision 2; those marked † are reworded in place for seven departments (intent unchanged). Decisions 31–36 are new in revision 3 and were revised by the War Pit review. Decisions 37–42 are new from that review. Decisions 43–52 are new in revision 4 (the user's Mines rhythm and manager decisions); decision 23, marked ‡, is reworded to match.

**Prestige structure**
1. **Rolling Falls:** each department has its own Infamy meter, Legendary Hero and reset, all paying one shared prestige currency (Dread), with a single prestige layer at launch.
2. Falls are **opt-in**: the Legend waits indefinitely, and Infamy can overflow to 200%, which always means "the next Fall's requirements are already met".
3. Infamy needs **two gates**: a department-signature skill event at the dial target (on-screen play only) **and** a cycle-earnings floor that grows ×3 per Fall, so Dread can't be farmed.
4. † Every difficulty dial level (Malice, Depth, Lure, Menace, Wrath, Volatility, Stakes) is **bought with local currency each cycle and resets on Fall**. Within bought levels the dial is always free to set.
5. Dread payout is `10 × (1 + 0.5N) × (Infamy/100)^1.5 × FreshBlood(×2 first Fall) × (1 + Crush 0–25%)`, so a first Fall pays 20–56 Dread.
6. The Fall's fiction is **"Sacked & Avenged"**: the hero razes the department (the reset), then the Overlord captures the hero with one timed tap (the Dread). MVP is a static card.
7. A Fall resets the bulk currency, its trees and the dial levels, and keeps rare tokens, collections and layouts. Throne upgrades, Dread perks, Tribute and Goods never reset.
8. The launch Dread tree is Iron Fist, Tithe Collector, Long Reach, Idle Hands and per-department Ruinborn. Head Start, Legend's Bane, Signatures and Swift Rebuild come later, and Cataclysm is out of scope.

**Currency map**
9. † Seven **non-convertible** local currencies (Bile, Nuggets, Plunder, Tollpence, Obols, Arcana, Teeth), plus four rare persistent tokens (Batch Tokens, Gems, Grimoire Pages, Crests), plus the War Pit's in-Run Chow (never saved outside a Run), plus three shared currencies: Tribute (hub), Dread (prestige) and Goods (cross-links).
10. Every unlocked department pays Tribute continuously based on a **log-normalized Rank** of its idle rate (×1.5 while on screen, × the offline factor while closed), so big-number and small-number games weigh the same.
11. There's one canonical multiplier formula: local, Throne, Dread, Goods and temporary groups multiply; members of a group add; Rebuild Rush and Late Recruit never stack.

**Cross-links**
12. † Each department exports one Good and imports two (14 thematic links across seven departments; each Good has exactly two importers). Goods ship in **v0.3**, once at least 4 departments exist.
13. Cross-link strength is capped at **+18% income plus small mechanics**, never gates content, has a 2/h guaranteed trickle per exporter, and is backstopped by a Tribute Black Market.

**Offline**
14. One shared offline factor of **0.6× on-screen idle**, upgradable to a **hard cap of 0.9**. No department has local offline-cap or efficiency nodes. The offline cap is 8 h base, up to 24 h via Throne Curfew Bells and Dread Long Reach.
15. † **Active ≈ 3–5× offline** at baseline in every department, measured by the headless balance simulation (decisions 35–36), which fails CI when it's out of range.
16. Infamy's skill gate **never advances offline**. An ignored department keeps earning (and fills its economy gate) but never Falls by itself.

**Unlock order**
17. † Unlock order is **Cauldron → Mines → Dungeon → Bridge → Styx → Spire → War Pit**. Seals cost Tribute, and the Styx, Spire and War Pit also need lifetime Dread ≥ 10, ≥ 60 and ≥ 150.
18. Catch-up multipliers: Late Recruit (×2 for a newly opened department) and Rebuild Rush (×3 for 30 min after a Fall). They don't stack.

**MVP scope and tech**
19. † Phased build: **v0.1** shared core + Throne + Cauldron + Mines + Falls; **v0.2** Dungeon; **v0.3** Bridge + Goods; **v0.4** Styx; **v0.5** Spire; **v0.5.5** War Pit engine milestone (internal); **v0.6** War Pit; **v0.7+** extras.
20. Cut from launch: Steward auto-buy, Edicts, Trophy Hall bonus, interactive Last Stands, wing perks beyond Ruinborn, return rituals, Cataclysm and the Decimal library.
21. † Tech: plain JS numbers everywhere; one save module (IndexedDB + synchronous localStorage mirror + Web Locks single-writer + Add-to-Home-Screen prompt); the headless balance simulation in CI from v0.1 (decisions 35–36).

**Per-game core choices**
22. **Cauldron:** toadlings pour a constant flow, and the player **steers** it by cursing pegs into Ladles and Tossing choice ingredients down 9 chute keys. There's no drag-aim (so it doesn't play like the Spire). Infamy comes from recipe Batches at the Malice target.
23. ‡ **Mines:** **plain tap-to-mine** is the core verb (crits, kegs and vein-hunting give the active edge), and **percussion on a beat is an upgrade**: the Doom Drum branch adds a drum tempo with contracting rings, Beat Hits (×2, levelled to ×3), and Frenzy from Beat Hits (decisions 43–45). The rake is a cleanup tool only. Offline is bounded by rock regrowth.
24. **Dungeon:** fixed-path TD plus **Bait Chests** that pull parties through side loops, with Glare (snapping), Trapdoor and perfect-wave Gong as active verbs. Path-carving "Dungeon Keeper" mode comes after the MVP. Infamy = Champions slain at the Lure target.
25. **Bridge:** **contradiction-based deduction** (each traveler's Claim vs large-part tells, a daily Wanted Poster, Menace adds rule cards), 0.1× haggle notches, hold-to-confirm verdict buttons, and bounties that scale with evidence.
26. **Styx:** cast → nibble → hook → reel with tension drawn on the line. The twitch is a drag (so it can't be confused with the hook tap). Wrath ships in the MVP.
27. **Spire:** drag-aim Suika at a calm 25–35 drops/min, radii re-curved so a Void Star is 46% of the flask width, apprentices working a separate cosmetic flask, and Resonance from cascade depth rather than speed.
28. † **Theme:** the player is always the Overlord acting through a department head (Granny, Gritch, Ledger-Bones, Grumm, Pilk, the Head Sorcerer, Snarl), with a unique minion species per department (the War Pit's are kennel gnolls). Gobbo is the only cross-department goblin. (Revision 4 promotes the heads to managers, decision 46.)
29. **Return rituals:** each department gets an optional ~5 s tactile ritual on return, worth +5% of the haul and never required (v1.1).
30. † **Throne doors:** seven (six doors in a 2×3 grid plus the War Pit's iron gate behind the throne), each showing only the Infamy ring plus one priority badge. Details are on long-press.

**Seventh department and simulation (new in revision 3, revised by the War Pit review)**
31. **The War Pit (07)** is the seventh department: a Super Auto Pets-style auto-battler run by Snarl and his kennel gnolls. Its currencies are Teeth (local), Chow (in-Run only) and Crests (rare, persistent). Battles are deterministic and seeded. A Run ends at **8 wins (Triumph, by beating the Huntmaster)** or at 0 of 4 Grit (Retreat), targets 6–9 min, and both endings bank everything plus a bonus (W-03). Idle Skirmishes pause while a Run is on screen.
32. **The Pit's dial is Stakes 0–20**, bought per cycle (seed `300 × 2.2^S` Teeth), paying a **multiplicative** `1.22^S` and adding Menace-style tactics cards (W-01). Infamy needs **2 Pit Crowns** (Triumphs at Stakes ≥ target) with target `min(4 + 2N, 10)` in MVP, rising to a cap of 20 when cards 12–18 ship (W-21), plus the economy gate. A Fall resets Teeth, trees A–C, Stakes and the garrison, and keeps Crests, the Bestiary and Pedigrees.
33. **Unlock and phase:** the War Pit is **Seal #7** (seed 600K Tribute) with **lifetime Dread ≥ 150** (reference: day 6–8). Its engine and draft bot ship first as the internal **v0.5.5 milestone**, and the department ships in **v0.6** at **10–12 weeks** solo (W-16), with Node 1 only on its four related import lines. Extras move to **v0.7+**. It goes last because it pays off for meta-literate players, keeps the two strategy departments apart, has both its imports live on arrival, and leaves Seals 1–6 untouched (00 §6).
34. **Goods re-planned for seven departments:** 14 links, every department exports one Good and imports two, and each Good has exactly two importers. **Captives** (Pit) go to the Dungeon and the Bridge, the Pit imports **Souls and Essence**, the Dungeon drops Souls and the Bridge drops Essence. The +18% cap, the 2/h trickle and node costs are unchanged. The Captives imports are **softened** so neither touches a skill puzzle: Caged Bait makes Rogues pause, never detour; Pillory adds a fine, never crop slots (W-15). Accepted cost: the Dungeon's and Bridge's second line opens on day 6–8 (W-19).
35. **Simulation-driven tuning:** every number in specs 00–07 is a starting point, and the specs commit to **targets and bands**. The headless balance simulation is the **authority** for constants, which live in one `balance/params.json`. A tuning change is a params diff plus a sim report, never a spec edit. Playtests move bands, and the sim moves numbers. `npm run tune` proposes changes and a human merges them.
36. **Simulation coverage and CI:** the sim has **two layers** (W-13): local sims (each department's live core and bots) build cached `activeRate`/`idleRate` tables nightly, and the 30-day, 5-profile meta sim runs on those tables plus the exact `idleRate` modules. Every department ships an active bot (novice/reference/expert) and an idle buyer. Hard bands fail the build: active:offline 3–5×, offline factor ≤ 0.9, first Fall 3–4 h, cycle 2 h–5 days, income share ≤ 35% at day 7 and ≤ 30% at day 30, Dread 120–200 at day 7, Falls reachable, and the Goods-graph lint. The fast tier (≤ 5 min) runs the meta sim plus smoke runs for changed departments on every PR; the full tier runs nightly (00 §8.1).

**War Pit review (new decisions)**
37. **Rival warbands, not heroes** (W-04, W-05, W-24): Pit opponents are other warlords' beast-tamers, ghost-drafted by the novice bot from the same 23-unit roster under 5 tamer archetypes, growing additively per round and ×1.12^S with Stakes. The only human is the final boss, the **Huntmaster**. The base pool grows to 17 units (adds Bog Leech, Sabre Cat and a T5 Bone Ogre) plus 6 Bestiary units.
38. **Idle is a Gauntlet paid relative to active** (W-02, W-06, W-07): each Skirmish runs the Standing Warband through rivals r1–r12 until it loses, paying `k_idle × Σ battleTeeth`. Skirmish Pace stops at 25 s, the idle-only Handlers node is removed, and each cycle opens with a 120-Teeth purse. Bands: active ≥ 2.6× on-screen idle (centre 3.2×), with a hard floor of 1.8× at every Kennels level. Captives' passive rate is capped at 1/3 of active.
39. **Dial rewards are multiplicative suite-wide** (W-01): every dial must pay ×1.15–1.35 per step, and the sim holds each dial to a **step-cost band** (level k+1 ≈ 25–60 min of income at level k). The band is hard for the Pit now. It's soft elsewhere until each department is audited, starting with the Bridge's linear `payout_mult` (fallback `1.2^M`). The Pit's Tooth Pliers doubles at every 10th level, so long cycles compound.
40. **War Pit engine contract** (W-08, W-09): integer stats rounded once at battle start in a fixed order, three named RNG streams (shop, shop triggers, battle), a total trigger order, Huntmaster retries at a fixed budget, paused Runs pinned to their `paramsVersion`, cache hashes covering imports and `paramsVersion`, and **Sudden Death** from exchange 50 so legal stall builds always end.
41. **Bot tiers, time model and calibration** (W-12, W-17): the draft bot runs at 0/8/64 simulated candidate lines per shop (novice/reference/expert), with a shop-seconds model and per-battle engine budgets. Unit stats are tuned on a fast per-unit surrogate. With no server, a local **Export playtest log** is how bots get anchored to humans. Pit bands: Triumph 35–50%, rounds 1–5 ≥ 75%, Huntmaster 50–70% once reached, Runs 6–9 min, skill gate within 2.5 days of reference attention.
42. **Per-unlock offline baseline** (W-11, W-23): each department's "active : offline" target uses the reference offline factor at *its own* unlock (≈ 0.6 / 0.65 / 0.7 / 0.75 for departments 1–4 / Styx / Spire / Pit), computed by the sim. The single-department-main profile starts departments 5–7 from a fixture save at unlock.

**Revision 4 (new decisions, from the user's Mines and manager decisions)**
43. **Mines rhythm is an upgrade** (user decision): the Mines start as plain tap-to-mine. The **Doom Drum** (8 Gems + depth 6, ≈ 20–30 min in; kept through Falls like Infernal Engineering) unlocks the beat: visible tempo, contracting rings and Beat Hits ×2. Each beat judges **one tap**, the first after the previous beat's midpoint, so mashing can't fish for Beat Hits, and every other tap still does full damage (R4-01). Its levels (**Drumhead** ×2 → ×3, **Wide Swing** window 60 → 120 ms, later **Tempo Lever** options) and companions (**Goblin Frenzy**, **Frenzy Fuse**, **Drummer Goblins** +8% crew DPS each in `idleRate`, **Steady Hands** streak protection, later **Gritch's Whip**, **Thunder Beat** and **Encore**) only appear once the drum is owned (02 §6E). Off-beat taps always do full damage, and an owned drum can be switched off; the switch, Tempo Lever and Thunder Beat survive Falls (R4-05, R4-17).
44. **The Mines' active edge without the drum** comes from tap power (6 taps/s ≈ 0.8–1.0× crew DPS), crits, target focus (Keen Eye), player-lit kegs and any-tap Chain Lightning, with an 8 taps/s soft cap so that multi-touch stays bounded (OQ 21's 15 hits/s cap kept). The sim holds **two hard bands**: before the drum 1.8–2.5× on-screen idle (3.0–4.2× offline), also checked in later cycles with the drum switched off (R4-08), and with it 2.4–3.0× (4.0–5.0× offline). Crit caps bound the crit bonus at +200% (R4-02). Stamina Stew (Potions → Mines) becomes a guaranteed crit every 30/25/20 taps.
45. **The Mines' Infamy gate never needs the drum.** The drum is reachable long before the first Fall, but the gate stays "50 rocks at depth `30 + 5N`" for drum-off, Steady Drum and hold-to-auto-hit players alike. The drum only shortens it.
46. **Department managers** (user decision): the seven heads are promoted to managers who introduce their department and react to milestones, under one shared system (00 §5.4). Managers advise and never act for the player. Gobbo stays the only cross-department character and isn't a manager.
47. **Onboarding:** each department's first session is a 4–6 beat guided script (45–90 s), one mechanic per beat, taught by doing (highlight, ghost-finger, a player action completes each beat). It runs in the live game with no free grants, reaches the first upgrade in < 60 s (new hard sim band), and is skippable, resumable and replayable from Settings → Managers. A beat whose action isn't possible yet waits off screen (`waitFor`) instead of highlighting a greyed button (R4-06). Later mechanics, such as the Doom Drum, get 1–3 beat micro-lessons. The Cauldron's onboarding is the game's tutorial.
48. **Milestone triggers:** a fixed set of trigger types (first upgrade, helpers, new tier, mechanic unlocked, dial raised, first hazard, struggle, Commendation, Infamy 50/100%, Legend, Fall, return after a Fall, long absence, Goods link, report, ambient) feeds one pure `ManagerDirector`. Each spec's §18 maps 8–12 of them with example lines.
49. **Presentation:** a 32×32 portrait with 5–6 expressions in a 160×32 strip docked over the HUD (never over the play field). The whole strip, bubble included, is pass-through: a touch under it reaches the game and collapses the bubble to the portrait; only small Skip and ✓ chips take taps (R4-03, R4-15). Every line has 1–3 icons and a per-manager **gibberish voice** (no voice-over). Readable text is a ≤ 32-character line, consistent with OQ 15. **Grumm stays icon-only** per OQ 27, speaks from his in-scene sprite, and Gobbo translates him.
50. **Rate limiting and chattiness:** unprompted lines are capped at 1 per 3 min per department and 1 per 90 s suite-wide (ambient at 1 per 10 min), and they wait for each department's `isIntense` to be false for 2 s. Queued high-priority lines move to Gobbo's report. Chattiness is **Full** (default) / **Milestones only** / **Off**. Off still offers onboarding as a "Show me / Skip" prompt and keeps the report's flavour line (OQ 15).
51. **Data and save:** lines and scripts are data (`content/managers/<dept>.json`, lint-checked: ≤ 32 characters, 1–3 icons, no text on Grumm's lines). `DeptSave.manager` (onboarding state, pending tips, seen flags, per-cycle flags, greeting state, a carried report line, log) survives Falls, and `meta.managerClock` holds the suite-wide rate limit (R4-05).
52. **Report and Throne:** Gobbo's one line per department comes from the manager's report pool and is replaced by a missed high-priority line when there is one. In the Throne Room, a manager's head peeks out of its door for pending big events (a Legend, 100% Infamy, the Doom Drum ready) and gives one daily line, and the manager appears on the Fall card. Managers ship with each department's MVP (Granny and Gritch in v0.1).

## Decided questions

Ratified 2026-10-21: you accepted every recommended default. OQ 1–30 are applied in the specs (00 §2.3, §2.6, §4, §5.2–5.3, §6, §10, and each department's §17). OQ 31–34 (the War Pit's first questions) are adopted as provisional defaults (2026-10-21) and applied in 07 §17, adapted where the review changed the design.

| # | Question | Decision |
|---|---|---|
| 1 | Monetization: permanently none, or cosmetic-only later (throne skins)? | **None.** Nothing in the design depends on it. |
| 2 | Cataclysm (a second, global prestige layer after 5 Falls per department): plan for it now or leave it out? | **Leave it out** until players actually reach 5 Falls everywhere. |
| 3 | Last Stand: interactive per-department mini-events, or a static card? | **Static card with one-tap Crush** through every department MVP (now through v0.6, since the War Pit takes v0.6); interactive Last Stands in **v0.7+**. |
| 4 | Steward auto-buy: welcome QoL, or too much agency removed? | **Ship later as opt-in per department**, with a player-set reserve and smart ranking. |
| 5 | Push notifications ("Legend at the gate", "offline cap full")? | **No for launch** (iOS PWA limits). Use the in-app Gobbo report. |
| 6 | Gate departments 5–6 on lifetime Dread, or Tribute alone? | **Keep the Dread gate**, now for departments 5–7 (Styx ≥ 10, Spire ≥ 60, War Pit ≥ 150). |
| 7 | Build order: Dungeon in v0.2 (the flagship; matches unlock order) or the Bridge in v0.2 (cheaper; the scope reviewer's pick)? | **Dungeon v0.2.** |
| 8 | Cauldron verb: "steer the flow" (Ladle pegs + chute Tosses) or classic drag-to-aim plinko? Plinko itself is your decision and is kept either way. | **Steer the flow**, which fixes the Cauldron/Spire sameness (D-01). |
| 9 | Infamy and absence: skill gate on-screen only, or let offline fill Infamy to 50%? | **Skill gate on-screen only**; the economy gate fills offline. |
| 10 | Commit to "Dungeon Keeper" mode (path-carving Dig + greedy hero routing) as the Dungeon's post-MVP direction? | **Yes**, once Bait Chests prove fun in the MVP. |
| 11 | Goods import Node 2: author 12 more mechanics in v0.3, or ship Node 1 only? | **Author them in v0.3**; if scope is tight, ship Node 1 only (lines then max +4.5% each). |
| 12 | Styx: confirm cast/bite/reel instead of tap-to-snatch (snatch kept for wisps)? | **Confirm.** |
| 13 | Styx Trophy Wall in the MVP, or deferred? | **Defer to v1.1**; the Codex covers collection at launch. |
| 14 | Haptics (Styx thrash, Bridge notches, Spire merges; iOS PWAs ignore vibration)? | **Yes**, with a settings toggle. |
| 15 | Department heads' dialogue in Gobbo's report (Pilk, Granny, Gritch…), or silent? | **One flavor line each.** |
| 16 | Dungeon: idle auto-Glare upgrade, or Glare active-only forever? | **Active-only.** |
| 17 | Dungeon: discrete parties or a continuous trickle? | **Discrete.** |
| 18 | Dungeon: one floor active at a time, or several in parallel? | **One at a time.** |
| 19 | Mines: hold-to-auto-hit from the start, or unlocked? | **From the start**, in settings. |
| 20 | Mines: goblin "squads" stacking past 12 visible goblins? | **No.** |
| 21 | Mines: allow multi-touch (up to 3 fingers)? | **Allow**, with the 15 hits/s cap. |
| 22 | Spire: T11 + Singularity ceiling, or endless tiers? | **T11 + Singularity.** |
| 23 | Spire: random next orb, or a smarter bag (no 3 T1s in a row)? | **Smarter bag.** |
| 24 | Spire: vented orbs salvageable as something besides Arcana? | **No.** |
| 25 | Cauldron: is the "Hero's Sock" joke OK, or a grimmer tone? | **Keep it** (comic-evil tone). |
| 26 | Cauldron: Bucket Shift (rearrange multipliers), too much agency? | **Keep as Later content.** |
| 27 | Bridge: readable text or icon bubbles + gibberish voice? | **Icons + gibberish.** |
| 28 | Bridge: give goons a skill-based offline bonus? | **No, flat.** |
| 29 | Bridge: is "Grumm" OK, or should the troll be customizable? | **Keep Grumm.** |
| 30 | Minion renames for identity: Cauldron imps → Toadlings, Spire apprentices drawn as homunculi, Dungeon clerk → skeleton Ledger-Bones? | **Accept.** |
| 31 | War Pit: Skirmishes at a reduced rate while a Run is on screen? | **No, they pause** (provisional, 2026-10-21). A Run idle for 10 min counts as offline time, so Skirmishes accrue at the offline factor. |
| 32 | War Pit: is free scouting too much information? | **Archetype and beast icons free, stats behind Scouting** (provisional; adapted from "classes" to rival warbands). |
| 33 | War Pit: async PvP against other players' warbands? | **No** (GitHub Pages has no server; provisional). Ghost-drafted rivals give mirror matches offline; share codes and a weekly seed come later. |
| 34 | War Pit: 5 line slots on 180 px? | **5** at 34 px with 2 px gaps (provisional); a 6th later as a deep Bestiary unlock. |

Revision 4 keeps every answer above. OQ 15 (one flavour line each) and OQ 27 (icons + gibberish) now also govern the manager system (decision 49). OQ 19–21 still hold for the Mines: hold-to-auto-hit stays in settings and never lands on-beat, and multi-touch keeps the 15 hits/s cap with the new 8/s soft cap (decision 44).

## Open questions

New from the War Pit review (07 §17). Each has a recommended default that applies if you don't answer.

| # | Question | Recommended default |
|---|---|---|
| 35 | War Pit: should Skirmishes also run during the shop phase of an open Run, pausing only while a battle animates (W-20)? This would reverse decided OQ 31. | **No.** Keep OQ 31 (pause while a Run is on screen), so active pay stays separate from idle pay. A Run left untouched for 10 min already accrues offline Skirmishes. |
| 36 | War Pit: should the Infamy skill gate need 2 Pit Crowns or 1 (W-03)? | **2.** If the sim can't meet the "skill gate within 2.5 days of reference attention" band with Triumphs at the top of the 35–50% band, drop to **1 Crown at Stakes ≥ target**. |
| 37 | War Pit: can at least 5 playtesters send exported playtest logs before v0.6, so the bots can be calibrated (W-12)? | **Yes** (friends and family, via Settings → Export playtest log). If not, fit the reference bot to the designer's own logs plus the novice tier, and widen the Triumph band to 30–55% until real logs arrive. |

## Review changelog

**Revision 4 review (2026-10-21):** all 23 findings from `review-rev4.md` were resolved: 19 fixed and 4 rejected with reasons. No finding required changing one of your decisions; decisions 43, 47, 49 and 51 are worded to match (decision 45, a drum-free Infamy gate, was re-examined and kept).

| ID | Severity | Outcome | Notes / reason |
|---|---|---|---|
| R4-01 | High | Fixed | Mashing hit the 60 ms window by chance (three fingers on almost every beat), and fast tapping broke the streak. Now one judged tap per beat (the first after the previous midpoint) and the streak counts only judged taps; other taps do full damage. A masher bot must earn ≤ 85% of the reference bot. |
| R4-02 | High | Fixed | The crit caps (30%, ×15) gave +420% and broke the pre-drum band. Now 25% and ×9, which cap the bonus at +200%. |
| R4-03 | High | Fixed | The bubble took taps and covered the Mines' depth lever and the Cauldron's [≡]. The strip is now fully pass-through, a touch collapses the bubble to the portrait, and only the chips take taps. |
| R4-04 | Medium | Fixed | 00 §2.4 and §3 now list the Drum Circle, the Doom Drum, Tempo Lever and Thunder Beat. |
| R4-05 | Medium | Fixed | `drumOn` moves to `persistent`. Settings gain latency, Steady Drum and hold-to-auto-hit. `ManagerSave` gains `pendingTips`, `lastEnteredAt`, `greetPending` and `reportCarry`. The queue is memory-only. |
| R4-06 | Medium | Fixed | The Mines intro ran ~100 s with highlights on unaffordable buttons. Now 5 beats with `waitFor`, and kegs get a 1-beat micro-lesson. Micro-lessons are 1–3 beats suite-wide. |
| R4-07 | Medium | Fixed | Frenzy pips empty when Frenzy starts and don't fill during it, so uptime is bounded at ≈ 40–55%. |
| R4-08 | Medium | Fixed | The pre-drum band now also covers later cycles with the drum switched off and drummers owned. The drum-off bot must meet `E0_mines` within 1.5×. |
| R4-09 | Medium | Fixed | `dial_raised` fires for level 1 and every 5th level (every 3rd for short dials), once per save, and never on a `tier_reached` level. Gritch speaks at depths 5, 15, 25… |
| R4-10 | Medium | Fixed | Grumm's bubble moved off the Claim and Mood Face to over the river (x 116–176, y 168–196). |
| R4-11 | Low | Fixed | Unique currency icons (Plunder 💰, Tollpence 🪙, Batch Tokens 🎫, Arcana ✺, Gems ✦), with a lint rule. |
| R4-12 | Low | Fixed | Grumm is proud rather than greedy. Granny knits instead of napping. |
| R4-13 | Low | Fixed | The Frenzy line is now past tense. Cave-ins are no longer in the Mines' `isIntense`. Lines are written for when they land. |
| R4-14 | Low | Fixed | No double greeting after a long absence. Gritch's "Pay us?" was removed. |
| R4-15 | Low | Fixed | Struggle offers sit on a ✓ chip. |
| R4-16 | Low | Fixed | Drum timing: ~16–18 min if every Gem is saved, ~25–30 min with Chain Lightning first. |
| R4-17 | Low | Fixed | Tempo Lever costs Gems and is kept through Falls. |
| R4-18 | Low | Fixed | Five text fixes: Frenzy wording, a no-drum return line, an expression, Encore's requirement, Ballista as `first_upgrade`. |
| R4-19 | Low | Fixed | The historical D-06 row and the 00 §11 row are annotated as superseded. No live beat-as-default text remains. |
| R4-20 | Low | Rejected | Ledger-Bones and Snarl differ in register, address and voice. |
| R4-21 | Low | Rejected | The four drum announcements each fire once and are deliberate. |
| R4-22 | Low | Rejected | Fast tappers rarely hearing Gritch is the intended "never block play" trade. Important lines carry to the report. |
| R4-23 | Low | Rejected | The drum stays optional for Infamy (decision 45). Buying it for drummers needs no rhythm. |

**Revision 4, user decisions (2026-10-21):** applied first, then reviewed in `review-rev4.md` (above). (A) 02 rewritten to revision 4: tap-to-mine core, Drum Circle branch (§6E), two-state ratio band (§3), drum-free Infamy gate (§7), new layout states and a 5-tab drawer (§9), session shapes for both states (§14), MVP list (§15), Stamina Stew (§16); 00 §4, §6, §8.1 and §11 follow. (B) 00 §5.4 Department managers added, with §5.3, §6.1, §8.1 (onboarding band) and §9 (`ManagerSave`, chattiness setting); a §18 "Manager" section in 01–07, plus status lines. The "Mines = beat-tapping" contrast lines in 01, 03, 04, 05 and 06 were updated, and 07's later "War Drums" card is marked as unrelated to the Doom Drum.

**Revision 3, War Pit review (2026-10-21):** all 26 findings from `review-war-pit.md` were applied: 23 fixed and 3 partial, with none rejected outright. No finding required changing one of your decisions. W-20's shop-phase proposal would have reversed an accepted default (OQ 31), so it is open question 35. Where two findings conflicted, the resolution is noted below.

| ID | Outcome | Notes / reason |
|---|---|---|
| W-01 | Fixed | Stakes payout `1.22^S`, rivals ×1.12^S, price `300 × 2.2^S` (tunable 1.8–2.6). Tooth Pliers is uncapped and doubles at every 10th level. Step-cost band (25–60 min) added to 07 §14.1 and suite-wide to 00 §8.1. Multiplicative dial reward written into 00 §8. Bridge `payout_mult` flagged for audit in 06 §7, with `1.2^M` as the fallback (decision 39). |
| W-02 | Fixed | Skirmish Pace capped at 25 s (6 levels). **Handlers removed rather than recast**: recast as "+% all Teeth" it would duplicate Pliers. Idle pay is `k_idle ×` active battle pay by construction. Captives: 1 per 6-win Run, passive 1 per 60 Gauntlet rounds capped at 1/3 of active. Hard floor of 1.8× active : on-screen idle at every Kennels level. |
| W-03 | Fixed | Took option (a): 8-win Triumph, 4 Grit, 15–30 s shops, Runs 6–9 min. Added the "skill gate within 2.5 days of reference attention" band. Even so, 2 Crowns may miss the band, so the 2-vs-1 Crown choice is open question 36. |
| W-04 | Fixed | Opponents are rival beast-tamers' warbands; the only human is the Huntmaster boss; the signature event is the **Pit Crown**; the scout shows the archetype and beast icons (decision 37). |
| W-05 | Fixed | Ghost-drafted rivals give mirror depth, with additive per-round growth. The base pool is 17: Bog Leech moved to base, Sabre Cat (T4) and Bone Ogre (T5) added, and the new Grave Bat is the T2 ★. That is exactly the review's list (its "18" counts one more than it names). Stakes scaling stays multiplicative because the dial needs it (W-01). |
| W-06 | Fixed | The flat ladder is replaced by 8 seeded Gauntlets (r1–r12, stop at the first loss), which are strictly monotone in warband strength, with Cautious Stakes kept. |
| W-07 | Fixed | 120-Teeth opening purse on unlock and after each Fall. Skirmish Pace starts at 60 Teeth. |
| W-08 | Fixed | New 07 §14.2 engine contract: rounding order, three named streams, a total trigger order, an explicit item pool, `paramsVersion` pinning, the cache hash and Huntmaster retries. |
| W-09 | Fixed | Sudden Death from exchange 50. The cap is a safety net, with a band of ≤ 0.01% cap hits. |
| W-10 | Fixed | 01 §16 and 00 §11 now send Bones to the Mines and the Bridge. Goods-graph lint added as a hard CI band. |
| W-11 | Fixed | Pit target ≥ 2.6× on-screen (centre 3.2×) at a 0.75 unlock factor. 00 §8 baseline is now per department at its own unlock, and the Styx and Spire targets are restated (4.3× and 4.0× offline) (decision 42). |
| W-12 | Fixed | 07 §14.1 rewritten: 0/8/64-candidate bot tiers, a time model, engine and CI budgets, a per-unit surrogate for unit tuning, two bot policies for unit health, and calibration through Export playtest log. The playtester supply is open question 37. |
| W-13 | Fixed | Two-layer harness (cached local tables plus the meta sim). The fast tier only smoke-tests changed departments. The "sim matches game" test is replaced with a release N−1 fixture check. |
| W-14 | Fixed | 34×40 card grid, an 8-glyph trigger icon set, a symbolic info line, the SHOP label dropped, 34×10 freeze strips, and a hard ≥ 12 logical px tap-target rule. |
| W-15 | Fixed | Caged Bait L1: Rogues pause 1 s, never detour. Pillory L1: +1× fare fine, no crop slots. Applied in 00 §4, 01 §16, 06 §16 and 07 §16. |
| W-16 | Partial | Adopted the v0.6 re-estimate to **10–12 weeks**, the **v0.5.5** engine milestone, Node 1 only on the four Pit-related lines, and 5 rival archetypes. **Rejected**: cutting to 16 units (it conflicts with W-05's depth fix, and rivals reuse beast sprites, so art falls anyway); dropping tactics cards (Stakes must add rules, per D-03c and W-21); dropping Pedigrees (they're the Crest sink W-22 needs); deferring left-handed mode (it's a mirror transform on an existing suite setting, and W-25 relies on it). |
| W-17 | Fixed | Per-battle band dropped. Bands are now Triumph 35–50%, rounds 1–5 ≥ 75%, and Huntmaster 50–70% once reached. |
| W-18 | Fixed | Seals max 7. "launch six" → "first six". Decision 9 and the other amended decisions (4, 12, 15, 17, 19, 21, 28, 30) are reworded in place. OQ 31–34 moved to Decided (provisional). 00 §11 and §12 corrected. |
| W-19 | Fixed | Captives defined consistently (1 per 6-win Run, 3 per Triumph; the review's "5 per Triumph" would push the active rate past ~15/h). The Dungeon/Bridge second-line delay is recorded as an accepted cost in 00 §4. New soft band: the Pit's lines max no sooner than 5 days after unlock. |
| W-20 | Partial | "Each Fall cycle" wording fixed. A Run left with no input for 10 min now explicitly accrues offline Skirmishes (07 §3, 00 §7). Running Skirmishes during the shop would reverse accepted OQ 31, so it is open question 35. |
| W-21 | Fixed | MVP Infamy target capped at `min(4 + 2N, 10)`, rising to 20 when cards 12–18 ship. Cards re-themed for rivals. Marked Prey (card 15) uses slot 1 for a Standing Warband. |
| W-22 | Fixed | Triumph Crests need Stakes ≥ target − 2. Repeatable sinks: Deep Larder Pedigree ranks and cosmetic beast skins. |
| W-23 | Fixed | The single-department-main profile starts departments 5–7 from a fixture save at unlock (00 §8.1). |
| W-24 | Fixed | Resolved by W-04. The "arrive already familiar" argument is removed from 00 §6. |
| W-25 | Partial | Kept the front on the left (mirrored in left-handed mode). Thumb reach is validated on a 6.7″ mock during v0.5.5. **Rejected centre-right fronts**: they move every clash under right-handed thumbs, and the player's line already sits at y 96–136, next to the shop. |
| W-26 | Fixed | "No effect in Skirmishes" badge on shop-only triggers. Snarl's station preview includes the effect. |

**Revision 3 (2026-10-21), integration:** War Pit integrated (00 §2.2–2.5, §3, §4, §5, §6, §6.1, §7, §9). The Goods graph was re-planned (01, 03, 04, 06 and 07 §16 updated). The simulation-driven tuning policy was added (00 §8.1), and every "balance script" reference now points to it. The 30 revision-2 open questions were moved to Decided.

**Revision 2:**

"Fixed" means applied in the specs. "Partial" means the core of the finding was applied and part of the proposed fix was rejected, with the reason given. No finding required changing one of your decisions. The Cauldron stays first and stays plinko; the one reviewer fix that touches it (D-01) is surfaced as open question 8.

| ID | Outcome | Notes / reason |
|---|---|---|
| D-01 | Partial | The Cauldron's main verb is now "steer the flow" (Ladle pegs + chute Tosses, toadlings pour constantly), with diverged cooldown and preview. Plinko is kept (your decision). Rejected the paddles and drag-the-gold-pegs alternatives: too pinball, and gold pegs are the timing target. See OQ 8. |
| D-02 | Fixed | Radii re-curved (T11 = 46% of width). A Matter.js prototype gate is added, with "Void Star absorbs 3 Abyssal Eyes" as the fallback. |
| D-03 | Partial | Claims vs tells, Wanted Poster, Menace rule cards, evidence-scaled bounty, streak break on false accusation, and crops instead of icons are all adopted. **Rejected (e) "false accusation adds a Hero Whisper pip"**: pips lead to a Showdown reward, so this would reward failure (conflicts with m8). |
| D-04 | Fixed | 0.1× notches, haptic every 0.5×, Wallet Sense band, worked example corrected. |
| D-05 | Fixed | Verdicts are two hold-to-confirm buttons (250 ms) on the opposite side from the Coin Stack. Swipe-anywhere removed. |
| D-06 | Fixed | Beat mechanic (drum tempo, on-beat ×2, Frenzy from 8 Beat Hits), rake at 25% for cleanup, Frenzy Fuse widens the window. *Superseded in part by revision 4: the beat and Frenzy now live in the Doom Drum upgrade branch (02 §6E), Frenzy Fuse extends Frenzy, and Wide Swing widens the window.* |
| D-07 | Fixed | Apprentices work a separate cosmetic Apprentice Flask and never touch the player's flask. |
| D-08 | Fixed | 5×5 px minimum ingredient sprites with distinct colours, 18 px peg spacing, ticket ticks pop on the ticket. Kept 9 buckets (they fit at 18 px). |
| D-09 | Fixed | Dregs capped at 60% of the lowest inner bucket. Lined Dregs became Lined Buckets (all non-center). |
| D-10 | Fixed | Merged with B2: Infamy from 5 Batches at Malice ≥ target, Malice bought with Bile, plus the economy gate. |
| D-11 | Fixed | Twitch is a drag, visible nibble state disables twitch, active rate recomputed at ~6/min. |
| D-12 | Partial | MVP: Bait Chests + side loops (a spatial "baiting" verb). Full path-carving + greedy A* is Later (OQ 10) because of v0.2 scope. |
| D-13 | Fixed | Preview moved to a HUD row with 8×8 icons and counts. Glare snaps to priority targets within 12 px, ring on press, fire on release. |
| D-14 | Fixed | Local offline-cap/efficiency nodes removed suite-wide (moved to the Throne). A unique persistent system is named per department. Infamy uses each department's signature event. Duplicate node names are gone. |
| D-15 | Partial | Visible-milestone rule adopted suite-wide. The import "+1%" node was cut in favour of mechanic nodes (each level also gives +1.5% income). **Rejected collapsing the Dungeon's Workshop damage nodes into per-piece levels**: global research is the sink that survives re-layouts and blueprints. It's capped at 25 levels with visible milestones instead. |
| D-16 | Fixed | One ~5 s return ritual per department, worth +5% and never required; v1.1. |
| D-17 | Fixed | The Fall is reframed as "Sacked & Avenged", with the one-tap Crush as the +0–25% Last Stand bonus. |
| D-18 | Fixed | Spire target 25–35 drops/min, Resonance from cascade depth, drag-to-aim default. |
| D-19 | Fixed | The trajectory line is replaced by per-chute bucket probability glow (Scrying Ladle). |
| D-20 | Fixed | Edge-swipe navigation removed; ⌂ only. |
| D-21 | Fixed | Trapdoor (one per party) and the perfect-wave Gong stack up to +100%. |
| D-22 | Fixed | Reel/hook input confined to y ≥ 200; tension drawn on the line (colour + vibration). |
| D-23 | Fixed | The player is always the Overlord acting through a department head; each department names an Overlord power. |
| D-24 | Fixed | Cauldron imps → Toadlings; imps are unique to the Styx; Spire homunculi; skeleton Dungeon clerk; Gobbo is the only cross-department goblin. |
| D-25 | Fixed | Doors show the Infamy ring + one priority badge; income/s on long-press. |
| D-26 | Fixed | Tells limited to large parts; facial details only in the zoom, as a bonus. |
| B1 | Partial | Adopted: dial levels bought per cycle (1), the economy floor ×3 per Fall (2), the Spire Feat snapshot rule (3), lifetime bounties no longer unlocking Menace. **Rejected (4) Dread ∝ log(cycle earnings)**: the earnings floor already ties payout to work, and a magnitude term would break the "Dread depends on Infamy %, not income" anti-domination rule. |
| B2 | Fixed | Single center-bucket table, explicit `p_center`, Malice exponent solved by the balance script, Infamy from Batches, overflow defined suite-wide, offline jackpot ambiguity removed (Infamy is never offline). |
| B3 | Fixed | Sharper Picks growth 1.5 with max 40, regrowth ceiling in both live and idle formulas, Dig Deeper 1.21, Tap Damage ×2 every 25 levels without limit, Infamy step +5 depth. |
| B4 | Partial | Phased plan v0.1–v0.5 adopted, along with the cut list. **Deviations:** the Dungeon is v0.2 rather than the Bridge (flagship, matches unlock order; OQ 7); Idle Hands stays in v0.1 (it's the only path toward the 0.9 offline cap); Goods launch with mechanic nodes rather than "+1% only" (resolves the conflict with D-15). |
| M1 | Fixed | All MVP dial ranges cover Falls #0–#5 + overflow: Lure 0–40, Menace 0–20, Malice 0–10, Volatility 0–10, Wrath 0–20 in MVP, Mines depth 1–60. Targets are capped, with overflow then coming from the economy gate. |
| M2 | Fixed | Shared offline factor with a 0.9 hard cap in the core; Spire EV formula corrected (97.2 at T7), apprentice drops capped at 12/min, double penalty removed; Bridge Wider Planks removed (fixed traffic + queue); Styx idle 1.10^W vs active 1.12^W; active ratio measured by the script. |
| M3 | Partial | Rule stated explicitly: the skill gate is on-screen only, the economy gate counts offline. **Rejected the `infamyOffline` interface term and the "offline Infamy up to 50%" option**: both would let a department Fall without being played, which undercuts the Fall as a play reward. |
| M4 | Fixed | Overflow = progress toward the next Fall's targets; exponent 1.5 (2.8× at 200%); Head Start redefined as free dial levels. |
| M5 | Fixed | Canonical stacking formula in 00 §3.1; Trophy bonus capped at +25%. |
| M6 | Fixed | 2/h guaranteed trickle per exporter, goon crates `max(1, sniffer)`, import costs re-derived (lines for a Good max in ~12 days). |
| M7 | Fixed | Dungeon starter kit each cycle: Plunder 100 + 10% of the blueprint value, 2 free Arrow Slits, a 1 dps clerk. |
| M8 | Fixed | localStorage mirror on pagehide, Web Locks single-writer, A2HS prompt and Export nag, `peakRank` moved to `DeptSave.lifetime`, one save module for all specs. |
| M9 | Fixed | Common random numbers with 20K fixed tuples; random-x and aimed EVs separate. The exact transfer matrix is noted as a future option only: particle velocity state makes a 1-D x-transfer matrix inexact. |
| m1 | Fixed | Decimal libraries dropped; plain `number` everywhere. |
| m2 | Fixed | One suffix scheme (K M B T aa…) via the shared `formatNum`. |
| m3 | Fixed | Stale offline-cap text removed from all specs; duplicate Night Shift / Long Shift nodes deleted. |
| m4 | Fixed | 10+ min present without input counts as offline time against the cap. |
| m5 | Fixed | Steward rules: rank by Δ idle rate / cost, exclude consumables, spatial items and dials, honour a reserve. (Steward itself is deferred.) |
| m6 | Fixed | `ref_d` is a fixed scripted state per department in the balance sim. |
| m7 | Fixed | Dungeon sim at 20 Hz, 3 seeds from the layout hash, recomputed on layout/upgrade/Lure change, never on hide. |
| m8 | Fixed | Showdown is 10× fare and fills only from on-screen play. |
| m9 | Fixed | Tribute accrues offline at the offline factor; Seal prices marked provisional (balance script); Dread is the deliberate gate for departments 5–6; Tribute's active-blindness stated as deliberate. |
| m10 | Fixed | Gem pacing re-derived: Geode 0.5%, ~1 Gem per 2 min early. |
| m11 | Fixed | Bridge Infamy is now "5 evidence-backed Unmasks", no longer the undefined "correct verdicts". Express Lift uses `maxDepthEver`. |
| m12 | Fixed | 04 §12 now describes the Cauldron correctly. |
| m13 | Fixed | Cauldron Infamy is a held, ratcheting state (Batches at Malice), no longer a cumulative jackpot count. |
