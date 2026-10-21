# Adversarial Review: Game Design & Fun

Reviewer lens: are the games different, fun active, satisfying on return, gently but meaningfully failable, playable one-handed at 180x320, and on-theme?
Scope: 00 through 06, all read in full. No spec files were edited.

**Verdict:** The verbs are mostly distinct on paper. But two of the six games share one control scheme. One game's core physics can't reach its own ceiling. One game's deduction collapses into a lookup table. Under the different verbs, every department is built on the same upgrade skeleton. There are 3 blockers, 14 majors and 9 minors. Most fixes are local.

---

## Blockers

### D-01: The Cauldron and the Spire are the same game to the thumb
- **Severity:** blocker
- **Where:** 05 §2, §5 Imps, §11; 04 §2, §4, §11
- **Problem:**
  - Both games use a dropper at the top of the screen. You drag horizontally from below, then release or tap to drop.
  - Both have a 0.6 s cooldown, upgradeable to 0.25 s. The numbers are identical.
  - Both show the current piece plus a 2-item preview.
  - Both have auto-droppers that pick random x positions: imps in one, apprentices in the other.
  - Both add a hold gesture that shows a dotted landing guide (05 "Scrying Ladle", 04 "landing guide").
  - The only real difference is what happens after the piece lands (bucket vs stack). The input, rhythm and hand posture are identical.
- **Why it matters:** The brief says games must NOT feel samey. The Cauldron is the starter and the Spire unlocks last, around day 4–5. By then the player has made thousands of Cauldron drops. The Spire's opening minutes will feel like "plinko but stuff stays," which wastes the suite's most proven loop (Suika).
- **Fix:** Change the Cauldron's active verb, and leave the Spire's alone, since Suika aiming is canonical.
  - Imps always pour a steady stream of ingredients. This makes the starter idle-native from second one.
  - The player plays the board, not the drop. Tap a peg to make it a **Ladle peg** that kicks ingredients toward the center for 3 s, with 3 charges.
  - Alternatively, drag the gold pegs directly, or flip two pinball-style **Paddles** above the buckets with left and right thumb taps.
  - Recipes then become "route 3 Newts into ×3+" by steering a rain of ingredients. The new verb is *steer a flow*, which no other department has.
  - Keep a slow, manual "Granny's Toss" for specials (Mandrake, Hero's Sock) so aiming still exists, but make it a rare, high-value act and not the main loop.
  - If this is rejected, at minimum change the Cauldron's input to "tap a rail slot" (9 fixed slots, no drag). Also make the cooldown numbers and the preview shelf diverge from the Spire's.

### D-02: Spire orb sizes make the Void Star and the Singularity physically unreachable
- **Severity:** blocker
- **Where:** 04 §3 (radius table), §6B (Wider Flask), §7; 00 §2.2 (Spire Infamy: "Singularity counts as tier 12", cap 22)
- **Problem:** The flask interior is 112 x 184 px.
  - A Void Star has radius 42, so it is **84 px wide, 75% of the flask's width**.
  - An Abyssal Eye is 72 px wide.
  - A Singularity needs two Void Stars touching. Two of them cannot sit side by side, because 168 px is more than 112 px, and even maxed Wider Flask only gives 142 px. Stacked vertically they take 168 of 184 px. That leaves 16 px of headroom, while the Brim Line sits 14 px below the mouth and Volatility lowers it a further 2 px per level.
  - Building a second T11 means fitting a T10 (72 px) beside a resting T11. That is impossible.
  - In real Suika the largest fruit is about 45% of the container's width.
- **Why it matters:** These all depend on Singularities, so they are dead content:
  - Grimoire Pages and all four Tomes
  - the Volatility milestones
  - Infamy points above 20
  - the "Seeded Flask" signature's value
  - the T9/T10 offline Distill Ceiling is also questionable

  Players will also hit constant vents from T9 upward (60 px), because one Eclipse takes over half the width.
- **Fix:**
  - Re-curve the radii so T11 is about 45% of the base width: 4, 5, 6, 8, 10, 12, 15, 18, 21, 24, 26 px (T11 = 52 px across, 46%).
  - Keep the tiers visually distinct with silhouettes, which 04 §13 already does.
  - Prototype the Singularity path in Matter.js before locking the Spire's Infamy table.
  - Alternatively, redefine Singularity as "a Void Star absorbs 3 Abyssal Eyes" so it never needs two giants in one flask.

### D-03: Troll Bridge deduction is a static lookup table plus noise, and Menace makes it luckier, not deeper
- **Severity:** blocker (for "deep enough to last")
- **Where:** 06 §2, §5 (clue reliability), §7 (Menace formulas), §4 (false accusation); 00 §2.2 (Menace target 6 + 2N, up to 20)
- **Problem:** Each traveler has a fixed tell list: heroes show "2 of 5" tells, smugglers show 3. Clues appear as **icons in the Clue Strip** (06 §2.2, §10), so the player reads icons, not sprites. After about 30 travelers the player has memorized the table.

  Menace adds no new reasoning. It only lowers `true_clue_p` (0.7 → 0.5) and raises `red_herring_p` (0.15 → 0.5). At high Menace a tell is close to a coin flip, so verdicts become guesses. The Infamy push therefore turns "skill" into gambling exactly when the player commits to it.

  **Blind Unmask becomes the dominant income strategy:**
  - At Menace 14, `hero_share` = 21%.
  - The Bounty is 10× fare, so unmasking everyone pays an expected 2.1× fare.
  - The penalty for 3 false accusations in 60 s is −20% traffic for 30 s. You would hit that permanently, so the real figure is 2.1 × 0.8 = 1.68× fare.
  - An expert reading clues makes about 1.6× fare per toll (06 §3).
  - Only the "≥ 70% correct verdicts" Infamy gate in 00 stops this, and it protects Infamy, not income.

  Thirty minutes is 240 travelers (06 §9) drawn from 6 archetypes.
- **Why it matters:** This department is the suite's only judgment game and its comedy carrier. If the reasoning stops evolving after day 1, it becomes a chore you just tolerate.
- **Fix:** Replace probability noise with **contradiction-based deduction**, the Papers Please lesson.
  - (a) Each traveler states a **claim** in an icon bubble, e.g. "Pilgrim, going to shrine". Tells either support or contradict the claim, and a contradiction is the evidence. A clean-booted "pilgrim" is suspicious *because* pilgrims walk barefoot.
  - (b) Add a daily **Wanted Poster** with 2–3 features of a specific named hero. Matching it is an additional, rotating rule set.
  - (c) Menace adds **rules**, not noise. Examples: heroes now forge Writs of Passage (check the seal colour), smugglers hide goods in hats, and a hero tell becomes "fake" on Tuesdays per the Poster.
  - (d) Make the Bounty scale with **evidence**: unmasking with 0 matching tells pays 2× fare, with 2+ tells it pays 10×.
  - (e) Make a false accusation also break the Streak and add a Hero Whisper pip, so blind spam costs something.
  - (f) Show *zoomed crops* in the Clue Strip, not interpreted icons, so the player still has to read them.

---

## Major

### D-04: The haggle has almost no granularity
- **Where:** 06 §2.3 (each notch = 1 pinch = 1× base fare), §5 Wallet ranges
- **Problem:**
  - Wallets range from 1.0× to 3.5× fare, and Patience adds 0.1×–1.0×.
  - With whole-fare notches, a Peasant (Wallet 1.0–1.3, Patience +0.3) can only answer 1 or 2. A Merchant can only answer 2 or 3.
  - The worked example contradicts itself. A Merchant's base fare is 12, yet "4 pinches = 40" and counters land at 32 and 36. Neither value is a multiple of 12.
  - The "skilled active ≈ 1.6× fare" economy (§3) can't be expressed in integer notches.
- **Why it matters:** The haggle is half the core loop. With 2–3 real choices it's binary, and the Mood Face hint and Wallet Sense upgrades have nothing to refine.
- **Fix:** Use 0.1× notches with a haptic tick every 0.5×, which gives about 30 notches over the drag height. Make Wallet Sense narrow a *visible band* on the Coin Stack. Fix the example's numbers.

### D-05: The Bridge's price drag and verdict swipes share one zone and one axis
- **Where:** 06 §10 (thumb zone y 224–296, Coin Stack on the right edge), §11
- **Problem:**
  - The Coin Stack is a **vertical drag**.
  - Unmask is a **swipe up anywhere in the thumb zone**, and Search is a swipe down. Both need only a 24 px threshold.
  - A quick upward price drag that starts slightly off the Stack fires an irreversible Unmask.
- **Why it matters:** False accusations cost the fare and pile toward the traffic penalty. A misfire from a control conflict reads as the game cheating, which is the opposite of gentle.
- **Fix:**
  - Make the Coin Stack a horizontal slider, or keep it vertical but move the verdicts to two dedicated 32 x 24 buttons ("UNMASK" / "SEARCH"), each needing a 250 ms hold-to-confirm with a filling ring.
  - Remove "swipe anywhere."

### D-06: Mines percussion collapses into raking, and Frenzy is permanently on
- **Where:** 02 §2 (Frenzy: 10 taps in 2 s), §6A (Frenzy Fuse), §10 (rake = 1 hit per tile, up to 8 per swipe; cap 15 hits/s)
- **Problem:**
  - Raking back and forth at about 2 swipes/s produces 16 hits/s, which hits the 15/s cap with no precision and no rhythm. It dominates tapping, which the spec puts at 6–8/s.
  - Frenzy triggers at 5 taps/s, so any engaged player has it on 100% of the time. Frenzy Fuse, which lowers the threshold, is a dead purchase.
  - "Percussion" (§11) ends up meaning "wipe the screen."
- **Why it matters:** The Mines' only claim to a distinct verb is rhythm. Without it, this is the most generic clicker in the genre, and mashing for 5 minutes one-handed is tiring.
- **Fix:**
  - Rake deals 25% damage per tile and fully clears Rubble only.
  - Turn Frenzy into a **beat mechanic**. A rock pulses (a ring contracts on a 0.5–0.7 s tempo that speeds up with depth), and taps on the beat crit and build a Frenzy meter. Off-beat taps do normal damage, never less.
  - The music's drum layer becomes the metronome.
  - Frenzy Fuse becomes a wider on-beat window (60 → 140 ms).
  - The result is a real rhythm verb that is less tiring than mashing and can't be confused with any other department.

### D-07: The Spire's on-screen idle mode sabotages the player's own flask
- **Where:** 04 §4 ("idle > 10 s: apprentices take over the dropper", random x, Skill 20%), §5 ("Apprentices also trigger vents")
- **Problem:**
  - Suika is a *think-before-you-drop* game. Pausing for 10 s to plan a drop around a T8 is normal play.
  - At that point apprentices start dropping random orbs onto the carefully built stack. With 80% random placement, a 112 px flask overflows within about a minute, and the resulting vent ejects the top 25% at a 25% refund.
  - Separately, a physics stack that "idles" by random drops is not a stable equilibrium. The on-screen idle view will be a permanent vent cycle.
- **Why it matters:** This punishes thinking, the opposite of the Spire's "calm, puzzle-brained" identity (§12). It also makes on-screen idle look broken.
- **Fix:**
  - Apprentices work a **second, small "Apprentice Flask"** in the right gutter: a 40 px wide, simplified, rate-driven animation that is fed by the offline formula.
  - They never touch the player's flask.
  - Optionally, the player can "Hand Over" the main flask with an explicit toggle.
  - This also answers "does Suika idle make sense physically?" The answer becomes *yes*, because the idle flask is cosmetic and the math is the closed-form EV.

### D-08: Cauldron ingredients and recipes are unreadable at 2–3 px
- **Where:** 05 §5 (Newt 2 px, Bat Wing 2 px, Toad 3 px), §2.5 (ticket "3 Newt + 1 Bat Wing in ×3+"), §13 ("3–5 px sprites")
- **Problem:**
  - Sizes disagree: 2–3 px in §5 vs 3–5 px in §13.
  - At 5–6× scale, a 2 px sprite is 10–12 physical px, about 1.7 mm.
  - A Newt Eye and a Bat Wing are both 2 px, so they are indistinguishable while falling among up to 150 particles.
  - Recipes ask the player to track *which* ingredient lands *where*.
- **Why it matters:** This is the starter, and its main active hook is the recipe. If players can't tell what they're dropping, aiming for tickets is noise.
- **Fix:**
  - Set the minimum ingredient sprite to 5 x 5 px, with a distinct colour per type (Newt yellow, Toad green, Bat purple, Mandrake orange).
  - Raise peg spacing to 18–20 px, or reduce the buckets to 7.
  - Have the ticket count the matching ingredient with a pop on the ticket itself, so feedback doesn't depend on tracking the particle.

### D-09: Cauldron edge buckets overtake the center (inverted board)
- **Where:** 05 §6C (Lined Dregs: Dregs ×0.5 → ×1.5), §7 (Dregs × (1 + 0.04M)), §5 (×1 buckets at positions 2 and 8)
- **Problem:**
  - Maxed Lined Dregs puts the edge at ×1.5, above the ×1 buckets. At Malice 10 the edge reaches ×2.1.
  - Lead Heart "falls straight; easy to aim," and Bumpers kick ingredients toward the Dregs.
  - The result is that high-Malice optimal play is aiming at the walls, which is the opposite of the fiction ("Dregs" = failure).
- **Why it matters:** The gentle floor stops being a floor and becomes a strategy. Malice's "thin safe paths" lose their meaning.
- **Fix:**
  - Cap Dregs at 60% of the lowest inner bucket, and apply Malice's +4% only up to that cap.
  - Make Lined Dregs scale every *non-center* bucket a little, not only the edges.

### D-10: Cauldron Infamy is luck-paced and trivially fast
- **Where:** 00 §2.2 (20 jackpots at Malice 4 + N); 05 §5 (9 buckets, center ~20% of a binomial spread)
- **Problem:**
  - Roughly 15–20% of drops land in the center.
  - At 70 player drops/min plus imp drops, 20 jackpots take **about 2 minutes** once Malice 4 is reached.
  - The real gate is the Malice purchase cost, which neither spec defines.
  - A jackpot is also mostly chance, so the Infamy push in the starter teaches "keep dropping," not "get better."
- **Why it matters:** The first Fall is the suite's most important teaching moment (00 §6). As written, it is either instant or controlled by an unspecified cost.
- **Fix:**
  - Count "jackpots *from aimed drops in a single ticket*", or use a streak: "5 jackpots within 20 consecutive player drops at Malice ≥ M".
  - Define the Malice unlock costs in 05 §7.
  - Use the ~3–4 h target as the tuning anchor.

### D-11: The Styx's bait twitch fights the fake-out rule
- **Where:** 03 §2.2 (tap = twitch, +25% bite chance), §2.3 (tapping early on a fake-out spooks the soul), §11 (tap anywhere does both)
- **Problem:**
  - The spec encourages twitching while waiting. The same tap during a fake-out dip counts as an early hook-set and spooks the soul.
  - The two optional verbs punish each other, and the player can't tell which one a tap counted as.
  - The cycle math is also off. Sink time of 1–4 s, bite wait of 3–8 s, hook, and a 3–5 s reel give 8–15 s per catch, which is 4–7 catches/min, not the stated "10/min." 5-min sessions claim 25–40 catches, which is 5–8/min. The 4–5× active ratio is inflated.
- **Why it matters:** The core fishing feel is anticipation, then a decisive strike. An ambiguous tap ruins exactly that moment.
- **Fix:**
  - Twitch becomes a small *drag* on the line (pull up 4–8 px), and hook-set stays a tap.
  - Alternatively, disable twitch while a soul is nibbling, and show it with a visible "nibbling" state.
  - Recompute the active rate with a realistic 6/min.

### D-12: The Dungeon's fixed path makes "the only spatial-planning game" shallow and generic
- **Where:** 01 §6D (Dig only converts rock into build tiles), §12, §14 ("fixed polyline path, no pathfinding")
- **Problem:**
  - Heroes walk a fixed path, so placement means picking from fixed sockets along it, which is standard Kingdom Rush.
  - The counters are genre staples: invisible Rogue, healer Cleric, armored Knight. The Wizard is the most novel.
  - The distinct elements are the Lure dial and the thief chase. Both are economy wrappers, not spatial ideas.
- **Why it matters:** This is the flagship department, and "what is distinct from generic TD" has no spatial answer. Thirty-minute theorycraft sessions (§9) top out once each socket has its best piece.
- **Fix:** Lean into *Dungeon Keeper*: you build the dungeon, not the defenses around a road.
  - Let **Dig carve path tiles**. Heroes route by greed: they path-find toward the visible treasure that is richest per step.
  - Let the player place **Bait Chests**, small Plunder lures, that pull parties into kill corridors.
  - This keeps a deterministic sim (A* on a 11 x 13 grid, recomputed on layout change, cached exactly like the current offline sim).
  - It turns placement into *mazing and baiting*, which fits the evil-architect fantasy and no other department touches it.
  - MVP can ship with fixed paths plus Bait Chests that cause a single detour.

### D-13: Dungeon readability: the preview strip and hero targeting are too small
- **Where:** 01 §10 ("preview strip, 2 parties, 4 px wide icons overlay"), §5.1 (party size up to 12), §11 (Glare: tap a hero)
- **Problem:**
  - 4 px icons can't separate Squire, Cleric and Wizard. The "read the preview and respond" loop that the example minute is built on is unreadable.
  - Parties of 12 overlap on a 16 px-wide path, so tapping *the Cleric* with Glare is a coin flip.
  - The strip also overlays the playfield's right-hand column.
- **Fix:**
  - Move the preview to the HUD row as 8 x 8 icons, compressed to type counts ("2×Sq 1×Cl 1×Wz").
  - Glare snaps to the highest-priority hero (Cleric > Wizard > Champion) within 12 px of the tap, with a target ring shown on press and fired on release.

### D-14: Six different verbs on one identical upgrade skeleton
- **Where:** 01 §6, 02 §6, 03 §6, 04 §6, 05 §6, 06 §6; 00 §2.2
- **Problem:** Every department has:
  - (a) an active-power tab
  - (b) an economy tab
  - (c) a helper tab: Hire X (goblins, imps, netters, apprentices, goons), +% helper speed, **offline cap +1–2 h**, and **offline efficiency +0.05**
  - (d) a free difficulty dial whose reward grows about ×1.15–1.35 per step
  - (e) Infamy = "hold the dial at X for 20 events"

  The names even repeat: *Night Shift* in both the Cauldron and the Styx, and *Long Shift* in both the Mines and the Bridge. After the third department the player will predict every tab before opening it. The Falls all reset the same way, with only the names changed.
- **Why it matters:** Fun-variety is a stated pillar. Players experience the *meta-loop* as much as the verb. "Every game is the same spreadsheet" is the top complaint about incremental suites.
- **Fix:**
  - Move all offline-cap and offline-efficiency nodes out of the departments into the Throne (Treasury, Long Reach). This removes 6 duplicate nodes.
  - Give each department one structurally unique progression system:
    - Dungeon: blueprints and Floors (already present)
    - Styx: Codex and Trophy Wall (already present)
    - Spire: Tomes
    - Bridge: rule-set unlocks (see D-03)
    - Mines: strata with new rock *behaviours*, not just tint
    - Cauldron: board *layouts* (hex, spiral; currently listed under "Later") as the main progression
  - Vary the Infamy *shape* per department: Bridge = heroes unmasked with evidence, Styx = Hero's Echoes landed, Dungeon = named Champions slain, Mines = depth, Spire = tier, Cauldron = jackpot streaks. Infamy then tracks the department's signature event, not a generic dial.
  - Rename the duplicate nodes.

### D-15: Boring "+X%" upgrades dominate every tree
- **Where:**
  - 00 §4 (import Node 1: **+1% income per level × 10**), §2.5 (Iron Fist, Ruinborn), §5.2 (Dark Banners)
  - 01 §6B (Whetstones +5%, Necromancy +8%, Inscription +6%, Ledger +4%, each up to 40–50 levels)
  - 03 §6 (Reel Speed +8%, Bigger Nets +10%)
  - 04 §6 (Potent Mana +10% × 100, Diligence +8% × 50)
  - 05 §6 (Fresher Stock, Deeper Pot ∞)
  - 06 §6 (Wider Planks +3%, Fancy Signage +5%)
- **Problem:** About 60% of all nodes across the specs are percent sliders with 20–100 levels.
  - The import node is the worst: 10 purchases of +1% each, paid in a scarce cross-department good. It's the most boring possible use of the suite's most interesting system.
- **Fix:**
  - Rule: any node with more than 10 levels must change something *visible* every 5 or 10 levels. Examples: Whetstones 10 makes towers spark on crit, Potent Mana 25 adds a new merge particle tier, Wider Planks 10 adds a second lane of travelers.
  - Cut import Node 1 entirely, and give each import line 3–4 *mechanic* nodes like the existing good ones (bone miners, Truth Rune, tempered glass).
  - Collapse the Dungeon Workshop's 3 damage nodes into the per-piece levels.

### D-16: Returning after idle feels identical in all six departments
- **Where:** each spec's §9 "30 s" session; 00 §5.3 (Gobbo report, Steward auto-spend)
- **Problem:** Every 30 s session reads "read report → collect → buy Ready → leave," and the Steward (00 §5.2) even does the buying. Only the Styx (a Poisson rare catch) has a *distinct* return moment.
- **Why it matters:** "Satisfying to return to" is half the brief. A number in a scroll is not satisfying six times over.
- **Fix:** Give each department one tactile return ritual worth about 5 seconds:
  - Styx: Pilk's net is dumped on the dock, and you tap to sort keepers onto the Trophy Wall.
  - Bridge: goon crates are stacked, and you swipe to Search them (eels, ore, potions) for a small payout.
  - Mines: kegs pile up at the seam, and one tap sets off a chain blast of the backlog.
  - Cauldron: an imp backlog fills a **Hopper**, and you tip it for a cascading 3 s rain on the board.
  - Dungeon: a 5 s replay of the best kill streak, plus captured heroes in a cell that you "ransom" for Plunder.
  - Spire: the apprentice flask from D-07 hands you one sealed high-tier orb to drop.

  Keep the totals in the report and make the ritual cosmetic-plus-small. It must never be required to collect.

### D-17: The Fall's fiction contradicts itself and its reward
- **Where:** 00 §2.3 ("the department **always falls**"; the hero's helm/skull is mounted in the Trophy Hall; the Overlord gains Dread)
- **Problem:** The hero wins, and the Overlord is somehow rewarded with fear and keeps the winner's helm. Players will ask why losing pays out, and why you have his skull if he won.
- **Why it matters:** The Fall is the emotional peak of every cycle, and it should feel like villain triumph.
- **Fix:** Reframe it as **"Sacked & Avenged."**
  - The Legend breaks in and *razes* the department, which is the reset.
  - Then the Overlord personally descends. A short beat in which the player taps once to Glare/crush gives the Last Stand +0–25%.
  - The hero ends up captured: the skull goes on the wall, and word spreads, which is the Dread.
  - The department is rebuilt "bigger and meaner," which is the next Infamy step.
  - All mechanics stay the same, and the story now matches the payout.

---

## Minor

### D-18: Spire speed target fights its own identity
- **Where:** 04 §2 (~70 drops/min; tap-to-drop "quick mode"), §12 ("calm, puzzle-brained")
- **Problem:** Resonance rewards speed, and 70 drops/min fills a 112 x 184 flask in seconds.
- **Fix:** Target about 25–35 drops/min. Make Resonance trigger off chain *depth* within one drop, not off drop speed. Make drag-to-aim the default (04 Q4).

### D-19: Cauldron trajectory preview lies
- **Where:** 05 §11 (3-bounce dotted preview), §5 (±8% jitter per bounce)
- **Problem:** With jitter, the preview is wrong after the first bounce.
- **Fix:** Show a fan or probability cone over the buckets (bucket highlight intensity) instead of a single line.

### D-20: The Spire's right-edge swipe collides with the Android back gesture
- **Where:** 04 §11; 00 §5 (kept "as an extra")
- **Fix:** Drop it. Use ⌂ only.

### D-21: Dungeon active play barely beats watching
- **Where:** 01 §3 (active is 1.05–1.4× the open-idle sim)
- **Problem:** The real active value is re-layout, which also raises idle income, so the 5-minute session is mostly watching.
- **Fix:** Add a skill-expressive active-only verb, for example a 2 s **Trapdoor** that the player drops on a tile (one charge per party), or tie the Gong stack to a "perfect wave" (no leaks) at up to +100%.

### D-22: Styx thumb occlusion
- **Where:** 03 §11 ("hold anywhere below y = 70" to reel)
- **Problem:** The thumb covers the soul whose red thrash telegraph (300 ms, on an 8 px sprite) is the key cue. The tension arc sits around the REEL button, away from where you're looking.
- **Fix:** Limit the hold zone to y ≥ 200, and draw tension on the line itself (colour plus vibration amplitude).

### D-23: The player's point of view drifts
- **Problem:** Who the player is changes from department to department:
  - Mines: the Overlord's gauntlet
  - Dungeon: the Overlord's Glare
  - Styx: "the Angler"
  - Bridge: you *are* Grumm
  - Cauldron and Spire: unspecified
- **Fix:** Use one rule: the player is always the Overlord, acting through the department head ("the Overlord's Hand"). Grumm, Pilk and Granny are the department heads who carry out your will. Give each department one Overlord-flavoured active power, as the Glare and the gauntlet already are.

### D-24: Creature reuse blurs department identity
- **Problem:** Imps appear in the Cauldron (helpers) and the Styx (Pilk and the Imp Netters). Goblins appear in the Mines, as the messenger, and as the Dungeon clerk.
- **Fix:** Give each department a unique minion species:
  - Cauldron: toadlings
  - Styx: drowned ghouls or imps (one of the two, not both)
  - Spire: homunculi
  - Bridge: goon trolls (already unique)
  - Mines: goblins
  - Gobbo stays as the only cross-department goblin.

### D-25: The Throne door tiles are overloaded
- **Where:** 00 §5 (2 x 3 doors in 180 px, each showing income/s, Infamy ring, Ready pip and skull)
- **Problem:** Each door is about 50 px wide and has to show 4 indicators.
- **Fix:** On the door, show only the Infamy ring plus one priority badge (skull > Ready). Move income/s to a long-press tooltip.

### D-26: The Bridge's "suspicious smile" vs "heroic chin" sits on an 8 px face
- **Where:** 06 §5 tells, §13 (24 x 40 sprites)
- **Problem:** Facial tells are unreadable at this size.
- **Fix:** Limit tells to large parts (hat, cloak, boots, held item, aura). Facial tells appear only in the 1.5 s zoom.

---

## The 3 strongest things to keep

1. **Rolling per-department Falls with a waiting Legend, a ratcheting Infamy and one shared Dread** (00 §2):
   - The prestige moment is small, opt-in and staggered.
   - "Fall now or push to 200%" is a real decision.
   - Ratcheting keeps every dial free.
   - This answers the user's questions cleanly, and should survive every other change.
2. **The Dungeon's Lure dial plus the thief-chase leak** (01 §4, §7, Cautious Mode in §3):
   - A leak becomes an exciting second chance, which is the best gentle failure in the suite.
   - Advertising for stronger heroes because they carry more gold is the most on-theme mechanic in the docs.
   - Cautious Mode means offline never bleeds.
3. **The Styx's cast → bite → reel with escape trails and bait consumed only on land** (03 §2, §4):
   - It really feels like fishing: anticipation, strike, tension.
   - Failure costs only the catch and turns into a second chance.
   - The Codex and Trophy Wall give it a collection spine that none of the other departments has.
