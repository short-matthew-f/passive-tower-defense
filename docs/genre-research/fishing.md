# Fishing games and fishing minigames: genre research for "The River Styx"

Prepared for the Overlord designer. Inputs I read first: the spec (`docs/specs/03-river-styx.md`), the Styx code (`src/depts/styx/model.ts`, `scene.ts`, `laststand.ts`), the fun audit (`fun-review/raw/depts-a.md` §S1–S4) and the proposal (`fun-review/proposal.md`, Styx row in §C).

**Research caveat.** Few fishing games have published design postmortems. Vlambeer's GDC Europe 2013 talk on Ridiculous Fishing exists but has no public transcript, so most of the mechanics below come from wikis (community-documented numbers), reviews, and a handful of developer interviews (Black Salt Games, Bungie and ZeniMax designers quoted in Kotaku). The session's web-search budget ran out before I could add Fishing Planet, Breath of the Wild and community threads on Stardew's difficulty. Those games are covered from general knowledge only, and are marked as such.

---

## 0. Where the Styx stands today (the problem in one paragraph)

The loop has the full genre skeleton: cast to a depth, read nibbles and fake-outs, hook, reel against tension, species with behaviours, a Codex, a Trophy Wall, netters and baits. It also has good details: escaped-rare trails, CLEAN reels, combo, and named species behaviours ("SHE BLINKED AWAY!"). The audit's diagnosis is still right, though:

- **Dead time.** Sink at 40 px/s, a 4.5 s base bite wait, and 30–60% fake-outs (`fakeChance`) give 10–25 s cycles. One audited cast went 38 s with no hook.
- **A solvable fight.** A two-line threshold bot ("hold while tension < 65") landed 4/4 casts.
- **No reveal variance.** Value is fixed per species, with no size, quality or record. The Codex is only a count per species (`codex: Record<string, number>`).
- **No appointments.** There are no clock-tied or weather-tied spawns.

Every great fishing game below solves at least two of these four.

---

## 1. Game-by-game notes

### 1.1 Ridiculous Fishing (Vlambeer, 2013, iOS): the fishing loop with no waiting
- **Loop.** There are three chained phases and no bite wait. (1) **Descent:** the lure sinks automatically, you tilt to *dodge* fish, and the first fish you touch ends the descent. A boost speeds the drop but raises collision risk. (2) **Ascent:** you now try to *touch* as many fish as possible, avoiding jellyfish. (3) **Shoot:** the haul is flung into the sky and you tap to shoot each fish. Any fish you miss is lost money. [PocketGamer guide](https://www.pocketgamer.com/articles/049184/r/), [Wikipedia](https://en.wikipedia.org/wiki/Ridiculous_Fishing)
- **Why it works.** "Performance in one minigame leads to a more rewarding experience in the next" ([Wikipedia](https://en.wikipedia.org/wiki/Ridiculous_Fishing)). A good dodge means a deeper line, deeper fish and a bigger haul to shoot. Brandon Boyer calls it a "one-two-three punch" where each part engages a different part of the brain ([Killscreen oral history](https://www.killscreen.com/the-indie-talks-an-indie-dream-team-goes-for-gold-in/)). The anticipation phase is itself a skill phase.
- **Upgrades open water.** Line length sets your maximum depth. Lures change the descent and ascent, guns change the shoot. Each area needs a longer line to reach its bottom ([PocketGamer](https://www.pocketgamer.com/articles/049184/r/)).
- **Codex.** The Fish-o-pedia on Billy's phone tracks catches per species, gives hints, and gates new levels on catch counts ([Wikipedia](https://en.wikipedia.org/wiki/Ridiculous_Fishing)). Each area has its own rare fish.
- **Design intent.** Keep "everything good" from habit-forming browser games without artificially stretching length. It has no IAP.
- **Weakness.** Once the gear is maxed, "it effectively becomes an endless runner" ([PocketGamer review](https://www.pocketgamer.com/ridiculous-fishing/review/)). The innovation is front-loaded.
- **GDC talk.** "Cloned at Birth: The Story of Ridiculous Fishing," GDC Europe 2013 ([Game Developer](https://www.gamedeveloper.com/business/gdc-europe-s-indie-summit-adds-i-ridiculous-fishing-i-i-badland-i-postmortems)). It is mostly about the clone saga, not the mechanics.

### 1.2 Stardew Valley (ConcernedApe, 2016): the moving target
- **Reel.** You hold to raise a green bar and release to let it fall. The bar has *momentum*, so overshoot is the core skill. A catch meter fills while the fish icon is inside the bar and drains while it is outside ([wiki: Fishing](https://stardewvalleywiki.com/Fishing)).
- **Species are behaviours.** Five movement types: Mixed, Smooth, Sinker, Floater, and Dart (erratic, with amplitude scaling with difficulty) ([wiki: Fish](https://stardewvalleywiki.com/Fish)). Experienced players can identify the hooked fish from how it moves, before the reveal. That is a skill and a form of knowledge in one.
- **Hidden identity, then a reveal.** The minigame doesn't show which species you hooked. Legendaries wear a crown, and the Sonar Bobber reveals the type ([wiki](https://wiki.stardewvalley.net/Fish)).
- **Side objective inside the fight.** A treasure chest can appear 1–3 s into the fight (15% base) with its own progress bar. Lose the fish and you lose the chest too ([wiki: Fishing](https://stardewvalleywiki.com/Fishing)). This is a risk/greed decision inside the reel.
- **Variance at the reveal.** Size rolls set quality (Normal/Silver/Gold). A **perfect catch** (the fish never leaves the bar) bumps quality one grade and gives ×2.4 XP. Iridium quality needs a perfect catch or a Quality Bobber.
- **Collection.** The Collections tab records each species and your **record length**, shows "First catch!", and has achievements at 10/24/all species.
- **Spawns.** Spawns depend on season, weather, location and time of day. **Fish Frenzies** (bubbles) halve bite time and lock the spot to one species. The legendaries are one-off catches tied to specific tiles and conditions.
- **Bite wait.** The bite wait is 0.6–30 s at base and is shortened heavily by bait, spinners and level, with bubbles making bites 4× faster. Waiting is a stat you upgrade away.
- **Idle.** Crab pots are a separate passive layer you check daily.
- **Pitfall.** The early game is hard. Black Salt Games explicitly called Stardew's fishing "too finicky," something they set out to avoid ([Game Developer, Dredge postmortem](https://www.gamedeveloper.com/design/trawling-in-the-deep-how-black-salt-games-made-spooky-fishing-rpg-i-dredge-i-)). Aversa's taxonomy also notes the threshold fight "is hard until better tools are available" ([Aversa](https://www.davideaversa.it/blog/game-design-taxonomy-fishing-mini-games/)).

### 1.3 Dredge (Black Salt Games, 2023): time as the resource, mistakes cost time, not fish
- **Reel.** Several timing minigames by gear and fish: Radial (a sweeping needle over green/yellow zones), Pendulum, Diamond, Ball Catcher, and the Iron Rig's Spiral ([Dredge wiki: Minigames](https://dredge.wiki.gg/wiki/Minigames)). Mistimed inputs only slow the catch, because "the fish are caught automatically, player input only helps or hinders" ([Game Developer](https://www.gamedeveloper.com/design/trawling-in-the-deep-how-black-salt-games-made-spooky-fishing-rpg-i-dredge-i-)). An accessibility toggle removes even that penalty ([80.lv](https://80.lv/articles/black-salt-games-on-the-development-of-dredge-the-pale-reach-dlc/)).
- **Why that's not boring.** Time is *the* resource: the day/night clock advances as you fish, and night is dangerous. A fast, skilful catch buys daylight. Skill converts into a resource, not into whether you get the fish.
- **Designers on repetition.** They call the minigames "really quite simple." They added the spatial (Tetris) hold specifically to keep players engaged "even when the fishing itself might be wearing a little thin," and they playtested for eight-hour fatigue ([80.lv](https://80.lv/articles/black-salt-games-on-the-development-of-dredge-the-pale-reach-dlc/)). A *second* decision layer after the catch keeps a simple catch fresh.
- **Aberrations.** Every species has a mutated variant, worth "considerably more" and logged separately in the encyclopedia (84 of 151 base-game fish) ([wiki: Aberrations](https://dredge.wiki.gg/wiki/Aberrations)). The odds are visible and steerable:
  - glowing "disturbed water" adds +35%, or 100% on the last stock;
  - night fishing adds +3%;
  - some rods add bonuses;
  - a **hidden pity streak** adds +0.5% per normal catch, capped at 35%, and resets on an aberration.
- **Encyclopedia.** It is a grid with entries for location, day or night, and gear type (rod, trawl, pot). The empty slots are a to-do list.
- **New waters.** Upgrades and abilities (for example dynamite) reopen old zones ("abilities useful across the whole map").

### 1.4 Animal Crossing (Nintendo, New Horizons 2020): the shadow, the nibble, the quip
- **Approach.** A visible shadow, sized Tiny to Huge, with a fin for sharks, tells you *roughly* what is there before you cast. You cast in front of it, and a big shadow can be worth recasting for ([Nintendo Wire](https://nintendowire.com/guides/animal-crossing-new-horizons/fishing/), [AC wiki: Shadow](https://animalcrossing.fandom.com/wiki/Shadow)).
- **Bite.** The fish nibbles one or more times (usually two) before the real bite. Per Nookipedia, the 5th nibble is a guaranteed bite. Rare and finned fish give a shorter reaction window ([Nintendo Wire](https://nintendowire.com/guides/animal-crossing-new-horizons/fishing/)). The fake-out count is **bounded**, so the anticipation never turns into an indefinite wait.
- **Reveal and comedy.** A held-aloft pose and a pun quip ("I caught a sea bass! No, wait—it's at least a C+!"). Comedy is a payoff. A Kotaku-quoted designer calls humour "an underrated part of a good fishing minigame" ([Kotaku](https://kotaku.com/stardew-valley-destiny-2-fishing-minigames-2000723185)).
- **Spawns.** Spawns depend on month, hour, location (river, pond, cliff, mouth, pier, sea) and weather. The coelacanth appears only in rain, with a 100-catch gate ([Nookipedia: Coelacanth](https://nookipedia.com/wiki/coelacanth), [Nintendo Life](https://nintendolife.com/guides/animal-crossing-new-horizons-coelacanth-where-when-and-how-to-catch-the-rare-coelacanth)). The Critterpedia flags species "leaving this month," which produces a whole genre of monthly guides ([Nintendo Everything](https://nintendoeverything.com/animal-crossing-new-horizons-bugs-fish-and-sea-creatures-leaving-in-october)). The scarcity is real-clock appointment design.
- **Collection.** You donate to the museum, Blathers gives a short lore talk, and the fish appears in a living exhibit. Completion is visible and social.

### 1.5 Webfishing (lamedeveloper, 2024): sizes and quality on every catch
- **Bite.** A roll every 2–3 s whose chance *rises with each failed roll* (+0.05 per fail, a built-in pity) and with rain or a recent reel twitch ([wiki: Fishing](https://webfishing.wiki.gg/wiki/Fishing)).
- **Reel.** Hold to fill a meter. Each fish has 1–5 "yank spots," and a red failure bar gives you a head start. Generous timing: "only… truly difficult with the rarer fish" ([The Tartan review](https://the-tartan.org/2024/11/25/webfishing-review-maybe-fishing-can-be-fun/)).
- **Variance.** Each catch rolls a **size** (normal distribution around the species average) *and* a **quality** tier: Normal, Shining ★, Glistening ★★, Opulent ★★★, Radiant ★★★★, Alpha ★★★★★. Quality multiplies worth by 1/1.8/4/6/10/15 and raises difficulty ([wiki: Money](https://webfishing.wiki.gg/wiki/Money)). Bait caps the quality you can roll, and lures bias the roll (largest size, smallest size, highest tier). Every catch of a common fish can still be a jackpot.
- **Reception.** 97% positive on about 70k reviews. Low pressure, hidden secrets, social sharing ([Inverse](https://www.inverse.com/gaming/steam-webfishing-cozy-chatroom-game-animal-crossing), [Wikipedia](https://en.wikipedia.org/wiki/Webfishing)).

### 1.6 Cast n Chill (Wombat Brawler, 2025): the closest analogue, a semi-idle pixel fisher
- **Idle mode.** The character rows to a spot, casts, catches and sells by itself. It works as a second-screen companion, and a toggle stops it switching your rod or bait so you can farm one spot ([Shacknews 9/10](https://www.shacknews.com/article/144913/cast-n-chill-review-score), [Aywren](https://aywren.com/2026/03/18/steam-gaming-cast-n-chill-semi-idle-cozy-fishing-game)).
- **Active.** A split above/below-water view shows which fish are near your bait. Hold to reel, release to give line. A fish too big for your rod *gets off and may bite again soon* instead of snapping the line, so failure becomes a second chance.
- **Logbook.** 50 species, each with catch count, maximum size, location, the bait that works, and your biggest catch. Completing a fishing hole's set prompts the shopkeeper to reveal secret locations. Licences open new waters.
- **Reception.** "Overwhelmingly Positive" (about 8.4k reviews), OpenCritic 86. The main criticism is "little to do after completing the logbook" ([WellPlayed](https://www.well-played.com.au/cast-n-chill-review), [OpenCritic](https://opencritic.com/game/18729/view/reviews)). Fish were sometimes hard to read in pixel art, which is a warning for 180×320.

### 1.7 Cat Goes Fishing (Cat5Games, 2015): steer the bait through a cutaway
- **Loop.** A side-view cutaway. You lower bait and **steer it around unwanted fish** toward the one you want ([SRF review](https://www.srf.ch/radio-srf-3/games-review-cat-goes-fishing-oder-ueber-das-angeln)). It has line tension, day/night, boats and radar ([Steam](https://store.steampowered.com/app/343780)).
- **Lesson.** The sink is a steering phase, as in Ridiculous Fishing.
- **Pitfall.** Players complain about fish "escaping or breaking the line" and tedious quests ([Vaporlens summary](https://vaporlens.app/app/343780/cat_goes_fishing)). Harsh failure in a casual game breeds frustration.

### 1.8 Tiny Fishing and mobile idle fishers: the idle baseline
- **Upgrades.** Three: **Max Depth** (+1 m per level), **Max Fishes** (+1 fish per cast), and **Offline Earnings**. "You hit a new depth and suddenly the fish you pull up are worth double" ([CrazyGames listing](https://crazygames.it.com/game/tiny-fishing-idle-fishing-game)). There is also an aquarium you collect from every few minutes, and a tap-tiles bonus minigame.
- **Others.** Hooked Inc. and similar titles pitch "crew keep catching fish while you're away" plus daily tournaments ([AppFollow](https://apps.appfollow.io/ios/hooked-inc-fishing-games/1436213906?country=it)).
- **Lesson.** Depth-as-progress and a multi-catch per cast keep each active cast juicy. The idle side is a number, and these games rarely have a soul.

### 1.9 Sea of Thieves (Rare, Hunter's Call 2018): read the pull direction, variants per species
- **Reel.** You aim the rod *opposite* the fish's swim direction. Pulling the wrong way shakes the camera, gives a splintering-wood sound and can snap the line. You can reel in when the fish changes direction or tires ([SoT wiki: Fishing](https://seaofthieves.wiki.gg/wiki/Fishing)). It is a two-axis read (direction plus timing), not one.
- **Variety.** 10 species × 5 variants, including a rare variant and a night variant (for example, Devilfish: Ashen, Seashell, Lava, Forsaken (rarest, about 10× value) and Firelight (night)). About a third of catches are Trophy size. Some fish only appear near events: Battlegills at skeleton fights, Stormfish in storms ([SoT wiki: Fish](https://seaofthieves.wiki.gg/wiki/Fish), [Shacknews](https://shacknews.com/article/111735/fish-types-baits-and-locations-sea-of-thieves)).
- **Lesson.** Event- and weather-bound species make the world's state matter.

### 1.10 Final Fantasy XV (Square Enix, 2016): tension plus direction
- **Reel.** Hold R2 to reel in bursts. The fish swims in a direction and changes course abruptly, and you tilt toward it or tension builds and the line breaks. A red flash means stop reeling and steer ([RPG Site](https://www.rpgsite.net/feature/5109-final-fantasy-xv-fishing-guide-how-to-fish-properly-to-raise-your-fishing-level-and-earn-ap-quickly), [Inverse](https://www.inverse.com/article/25057-final-fantasy-xv)).
- **Lesson.** Tension alone is one-dimensional. Adding a *second* readable axis (direction, position or a timing tell) makes the fight masterable.
- **Related (general knowledge, not sourced).** Breath of the Wild has no rod: you grab fish by hand or with bombs. Its lesson is that fishing can be a world-interaction rather than a minigame.

### 1.11 Dave the Diver (Mintrocket, 2023): fishing feeds a second loop
- Harpoon smaller fish freely, while large fish trigger a short minigame. Reviewers called the larger-fish minigames (button mashing) "pretty dull after the first couple of times" ([Destructoid](https://destructoid.com/reviews/review-dave-the-diver)). Later **nets and drones** automate the haul ([allthings.how](https://allthings.how/dave-the-diver-explained-the-game-the-character-and-where-to-play/)), and VIP customers send you back for specific fish ([Push Square](https://www.pushsquare.com/reviews/ps5/dave-the-diver)).
- **Lessons.** Mash minigames tire fast. Requests ("bring me X") give a catch purpose beyond coin.

### 1.12 Short notes
- **Moonglow Bay (2021).** After the bite, press the direction the fish is escaping, a reaction read that reviewers say "absolutely nails" the feel ([Thumb Culture](https://www.thumbculture.co.uk/moonglow-bay-review)). It has a 151-species journal with *rumoured* fish names before you catch them. The game overall scored 5/10 at [Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/moonglow-bay).
- **Fishing Clash (Ten Square Games).** About $10M a month. Mobile players "log in more often but for shorter periods," and the game is driven by events and clans ([TSG interview](https://tensquaregames.com/2021/12/14/we-engage-by-showing-the-world-an-interview-with-the-designers-of-ten-square-games/)). Its pay-to-win gating of new locations is the most-cited complaint ([Kimola report](https://kimola.com/reports/unlock-insights-fishing-clash-customer-feedback-report-app-store-us-144588)).
- **Legend of the River King (1990s).** A fishing RPG built on NPC fish requests and a "Guardian fish" goal, with a raise-a-fish tank mode ([MobyGames](https://mobygames.com/game/6516/legend-of-the-river-king-gb)). It is the earliest "fish for a purpose" structure.
- **Destiny 2 and ESO (designer quotes).** Corey Willis (Bungie) frames fishing as Preparation, Performance, Payoff and Prestige, wanted real failure states, and designed drops "to feel like loot." Chris Balser (ESO) built fishing as a collection system with rarer fish at contested spots ([Kotaku](https://kotaku.com/stardew-valley-destiny-2-fishing-minigames-2000723185)).
- **Fishing Planet (general knowledge, not sourced).** A sim with real drag, line-test and fish-weight limits. It is too sim-heavy for a phone idle, but its "weight versus line test" upgrade framing maps to Braided Sinew.

---

## 2. Genre best practices (synthesis)

1. **Every phase is either short or interactive.** Ridiculous Fishing replaces the bite wait with a dodge, and Cat Goes Fishing with steering. Stardew and Webfishing let you *upgrade the wait away* and add a pity ramp (Webfishing +0.05 per failed roll, AC's guaranteed 5th nibble). Anticipation is good for about 1–3 s. After that it reads as dead air.
2. **The fight has two readable axes.**
   - Stardew: bar momentum against fish position.
   - Sea of Thieves and FFXV: tension against direction.
   - Moonglow Bay: direction reaction.
   - Dredge: needle against a zone that changes per fish.

   A single tension threshold is bot-solvable. That is exactly the audit's S1.
3. **The species is the behaviour.** Stardew's Dart, Sinker and Floater, and SoT's direction changes, make the fish identifiable from the fight. That turns knowledge into skill and makes each species feel different in the hand, not just on the label. (May Gardens in Kotaku: "expressive fish behavior makes a system feel real.")
4. **Variance at the reveal.** Size (Stardew, Webfishing, Cast n Chill), quality stars (Webfishing's six tiers, Stardew's Silver/Gold/Iridium), variants (SoT ×5, Dredge aberrations), and "NEW RECORD" in the codex. The 30th common catch can still surprise.
5. **Skill buys quality, not access.** Stardew's perfect catch gives +1 grade. Dredge converts skill into time and doesn't gate the catch. Webfishing is generous except on rares. Casual players always land something, and experts land *better* things. This suits an idle game.
6. **The codex is a map of what's missing.** Silhouettes and rumoured names (Moonglow Bay), conditions per entry (Dredge: location, day/night, gear; Cast n Chill: bait, location, best size), per-entry records, set rewards (Cast n Chill's secret spots, Ridiculous Fishing's level gates), and lore or comedy (Blathers, AC quips).
7. **The real clock and the world state set spawns.** AC's months and hours, the rain-only coelacanth, Stardew's seasons and weather, SoT's Stormfish and Battlegills, Dredge's night aberrations. These create appointments, which idle games need most.
8. **Hotspots you can see.** Stardew bubbles and frenzies, Dredge's glowing disturbed water, AC's shadows. They give a reason to aim and a short burst of high value.
9. **Steerable rarity with pity.** Dredge's +0.5% hidden streak, glow +35% and night +3%. Webfishing's bait caps quality and lures bias the roll. Rarity can be worked toward instead of purely gambled.
10. **Gentle failure that becomes a second chance.** Cast n Chill's "gets off, may bite again," Stardew's tutorial catch that can't fail, Dredge's no-gate accessibility. The Styx already does this with escaped-rare trails, which is good.
11. **A second decision layer after the catch.** Dredge's cargo Tetris, Dave the Diver's restaurant, Stardew's chests. They refresh a simple catch.
12. **Comedy and juice at the land.** AC quips, Ridiculous Fishing's sky-shooting spectacle.

## 3. Pitfalls

- **Waiting without agency.** Long sinks, long bite waits and unbounded fake-outs. In the Styx, a 30–60% fake chance with no cap allows 38 s casts. AC bounds nibbles, Webfishing ramps the odds, Ridiculous Fishing removes the wait entirely.
- **One-dimensional reels.** Tension-only, or mashing. Dave the Diver's mash minigames went "dull after the first couple of times," and the Styx's hold/release is bot-solvable.
- **Too finicky, too early.** Stardew's early bar is cited by Dredge's devs as the thing to avoid. Cat Goes Fishing's line-breaks draw frustration. Raise difficulty with Wrath and rarity, not at baseline.
- **Opaque rarity.** If players can't tell *why* a rare appeared or how to get more, rarity feels arbitrary. Dredge shows the levers (glow, night, rods). AC shows shadows. The Styx's "souls in a band look alike" problem is this pitfall.
- **Deterministic value.** No size or quality roll means every catch of a species feels identical (audit S3).
- **Front-loaded novelty and logbook exhaustion.** Ridiculous Fishing "becomes an endless runner," and Cast n Chill has "little to do after the logbook." Variants, records and rotating conditions extend the long tail.
- **Locations gated by payment** (Fishing Clash). Open new waters with play-earned currency, as the Styx already does.
- **Illegible pixel fish** (the Cast n Chill review). At 180×320, species need distinct silhouettes and colours, not just tint.

---

## 4. Recommendations for The River Styx

These are ordered by impact per cost. Each one respects the 180×320 portrait canvas, the control bar at y ≥ 200, and continuous idle income. Costs: S = under 1 day, M = 2–5 days, L = more than a week.

### R1. Cut the dead time and bound the fake-outs (S)
- **What:**
  - Raise `SINK_PX_S` from 40 to 90, as the proposal says.
  - Lower base `biteWait` from 4.5 s to about 2 s.
  - Replace the *probabilistic* `fakeChance` (30% + 5% per Wrath, up to 60%) with a **nibble count**: 0–2 fake dips (Wrath raises it to at most 3), and the next dip is always real (AC's guaranteed bite).
  - Make Wrath change the *subtlety* of the fake tell instead of the count. For example, at Wrath 0 a fake dip is a 1-px bob with a grey ring and a real bite is a 3-px plunge, a gold ring flash and a "thunk." At high Wrath, fakes also flash.
  - Add a Webfishing-style pity: each idle second raises bite odds.
- **Why:** this addresses audit S2 directly. A cycle drops from 10–25 s to about 6–9 s, back to the spec's ~6 catches a minute. Bounded fakes keep the "read" skill but remove the 38 s outliers.
- **Sources:** Animal Crossing (guaranteed 5th nibble), Webfishing (failed-roll ramp), Stardew (wait as an upgradable stat).

### R2. A moving-target reel: a soul zone on the tension track (M)
- **What:**
  - Fold the Last Stand's gold band (`laststand.ts`, ZONE 45–75) into every reel, but make the band **move**.
  - Draw a vertical 6×90 px tension gauge at the right edge of the control bar, or keep it on the line as now and add a band marker on the REEL arc.
  - The soul's "comfort zone" drifts according to its behaviour, using Stardew's archetypes:
    - `drift` → Smooth
    - `zigzag` → Dart
    - `sinker` (Sunken Bishop) → Sinker
    - `teleport` → the band jumps
    - `canon` → paired thrashes
    - `leviathan` → one long dive
  - Distance closes only while tension sits *inside* the band. Above it, you risk a slip. Below it, the soul drifts loose.
  - Thrash telegraphs stay. They now move the band sharply.
- **Why:** this fixes audit S1. The threshold bot fails, because the right tension changes moment to moment. The species behaviours (the best content in the audit) become something you *feel*, and expert play becomes visible. It reuses existing code, since the Last Stand already has the band logic.
- **Sources:** Stardew (moving bar, five behaviour types), Sea of Thieves and FFXV (a second axis).

### R3. Size, quality stars, and a reveal beat (S–M)
- **What:**
  - **Size roll.** Each landed soul rolls a "Heft" (normal distribution, about ±40%, shown as "1.7 st" or as a pixel bar) that scales Obols.
  - **Quality roll.** Each soul also rolls a 0–3 ★ quality ("Faint / Bright / Radiant / Damned"?), weighted by bait.
  - **Skill bumps quality.** A **CLEAN reel** (already in code, `CLEAN_MULT`) bumps quality +1★, like Stardew's perfect catch.
  - **Reveal beat.** On land, the soul's silhouette holds for about 0.4 s with hit-stop (proposal A2's juice pack), then a 120×28 name card pops: name, ★, Heft, and a **"NEW RECORD!"** stamp if it beats the Codex best.
  - **Pilk quip.** Pilk gives a one-line pun about a quarter of the time ("A Wailing Clerk! He's filing a complaint.").
  - **Idle catches** use the EV of size and quality, so idle balance is unaffected.
- **Why:** this fixes audit S3. Variable reward lands at the moment of reveal, and the 30th Clerk can be a 3★ record.
- **Sources:** Webfishing (six quality tiers, size distribution, bait caps quality), Stardew (record length, perfect catch +1 grade), Animal Crossing (quips).

### R4. The Codex as a map: silhouettes, conditions, records, tiers (S)
- **What:**
  - **Unseen species** show as dark silhouettes plus a rumoured hint ("SOMETHING SINGS IN THE CHOIR AFTER DARK"), as in Moonglow Bay's rumoured fish.
  - **Each entry** lists band, best bait, active hours or conditions, count, best Heft, and best ★ (the Cast n Chill logbook).
  - **Per-species tiers** at 1 / 10 / 50 catches add a bronze, silver or gold frame, each with a tiny permanent bonus.
  - **Completing a band's row** makes Pilk reveal a secret (a hotspot, a recipe, or the band's variant).
  - This extends `codex: Record<string, number>` to `{n, bestHeft, bestStars, variants}`.
- **Why:** it turns the Codex from a counter into a goal list. Completion psychology needs visible gaps, and this also persists through Falls.
- **Sources:** Dredge encyclopedia, Cast n Chill logbook and Rusty's secrets, Ridiculous Fishing's Fish-o-pedia gates.

### R5. Real-clock and river-weather spawns, announced by Pilk (M)
- **What:**
  - **Clock-tied species.** Tag species with real local-time windows, as the proposal suggests (Moon Witch 20:00–02:00, Choirboy Shade at dawn).
  - **Daily River Mood.** A daily seeded mood: Fog (already in code), Blood Tide (more rares, more thrashes), Lethe Calm (bite wait halved, no fakes), Storm (an exclusive "Stormsoul").
  - **Display.** A 1-line banner and a tint on the water.
  - **Push-ready.** Wire these to proposal B2's Raven Post ("Pilk: the Moon Witch is rising").
  - **Netters.** Offline netters also catch condition species at their EV, so idle never loses value.
- **Why:** this fixes audit X5, the lack of appointments. It is the cheapest reason in the genre to open the app at a specific time, and it makes the Codex a long tail.
- **Sources:** Animal Crossing (months, hours, the rain-only coelacanth), Stardew (season and weather), Sea of Thieves (Stormfish, Battlegills).

### R6. Visible hotspots: Soul Eddies (S–M)
- **What:**
  - Every 60–90 s, a glowing 16 px eddy (pixel ripple, band-coloured) appears somewhere in the visible river for 20 s.
  - A cast landing within it gets bite wait ×0.5, a guaranteed no-fake first bite, and +35% variant chance (R7).
  - This restores the aim decision the "tap to recast" button removed (audit S4). Recast still works, but the eddy rewards dragging.
- **Why:** it adds a decision during play, a short burst of value, and the audit's missing "chase."
- **Sources:** Stardew bubbles and Fish Frenzy (bite time halved), Dredge's disturbed water (+35% aberration).

### R7. "Damned" variants per species, with a pity streak (M)
- **What:**
  - Each species gets one variant: a palette swap plus one extra behaviour twist. For example, a Damned Clerk thrashes in pairs.
  - Variants are worth ×5 and get their own Codex slot. Mounting one on the Trophy Wall gives a higher bonus than the base species.
  - **Chance:** 1% base, +eddy, +night hours, +Wrath, plus a hidden **+0.5% per normal catch, reset on hit** (Dredge's streak).
  - **Art cost:** 15 palette swaps and no new sprites, because the variant reuses the existing `soulArt`/`soulTint` setup.
- **Why:** this doubles collection depth cheaply. Rarity becomes something you can steer, and the Trophy Wall gets real decisions. It addresses the "logbook exhaustion" pitfall.
- **Sources:** Dredge aberrations (every species, mechanics for raising the odds), Sea of Thieves (five variants, rare and night).

### R8. Make the sink a steering moment: Snag Souls (M)
- **What:**
  - While the hook sinks (now about 1–3 s after R1), a horizontal drag steers it ±30 px.
  - Grey "snag" souls drift across the column. Touching one stops the hook early at that depth. Weaving past them reaches the target depth or a visible rare.
  - **Optional expert extra:** a soul you *thread past* within 4 px gives +5% to that cast's quality roll.
- **Why:** this turns the remaining wait into Ridiculous Fishing's dodge phase, so anticipation becomes skill. The verbs stay clean: the cast is a drag, steering is a horizontal drag while sinking, the hook is a tap, and the reel is a hold.
- **Sources:** Ridiculous Fishing (descent dodge), Cat Goes Fishing (steer bait past unwanted fish).

### R9. Netter hauls with one highlight, and netters gated by your Codex (S)
- **What:**
  - Netters can only catch species you've landed **by hand** at least once, and gain +5% efficiency per Codex gold frame.
  - On return, Pilk's net-dump (the existing ritual) leads with **one rolled highlight**: the best soul of the haul, with full R3 reveal, Heft and stars, plus "+N Codex progress." The rest arrives as a number.
- **Why:** active play now *improves* idle play (a fix for audit X1), and every return has a "what did I get?" moment instead of a +5% chore. Idle progress stays continuous.
- **Sources:** Cast n Chill (idle mode fishes for you, logbook drives targets), Tiny Fishing (aquarium collection), Dave the Diver (nets automate a hand-learned haul).

### R10. Wrath as named river conditions with exclusive souls (S–M)
- **What:**
  - Each Wrath tier adds one *visible*, named modifier instead of only raising numbers:
    - "Undertow": the R2 band moves faster.
    - "Siren Chorus": fake-dip tells shimmer.
    - "Thin Sinew": slip threshold 0.25 s.
    - "Fog Surge": the existing fog.
  - Show them as icons on the Wrath dial.
  - At Wrath 5, 10 and 15, unlock a Wrath-only species per band, so raising the dial opens Codex slots.
- **Why:** a dial is a decision only when you can see the danger and want the reward. Here the reward is collectible, not +12%. This mirrors the audit's critique of the Cauldron's invisible Malice.
- **Sources:** Sea of Thieves (event-bound species), Dredge (night risk for aberrations), and Hades Heat (by analogy, from the audit).

### Suggested order
1. **Week 1:** R1, R3, R4 and R9. All are S, and together they fix waiting, reveal and idle meaning.
2. **Next:** R2, the core skill fix. It reuses the Last Stand code.
3. **Then:** R6 and R7 together, since eddies feed variants.
4. **Later:** R5 (pairs with push), R8 and R10.

### 180×320 notes
- **Name card:** 120×28 at y≈80. It must not cover the hook.
- **Tension band:** draw it on the existing REEL arc, about 20 px, plus the line colour. Don't add a new panel.
- **Silhouettes:** at least 12×8 px, with distinct outlines per species and band so they stay readable (the Cast n Chill warning). Make variants palette-plus-outline swaps, not tint-only.
- **Eddies and snag souls:** these live inside the about 130 px visible river and need no new UI chrome.

---

## Sources (consolidated)
- Ridiculous Fishing: [Wikipedia](https://en.wikipedia.org/wiki/Ridiculous_Fishing) · [PocketGamer guide](https://www.pocketgamer.com/articles/049184/r/) · [PocketGamer review](https://www.pocketgamer.com/ridiculous-fishing/review/) · [Killscreen oral history](https://www.killscreen.com/the-indie-talks-an-indie-dream-team-goes-for-gold-in/) · [GDC Europe 2013 listing](https://www.gamedeveloper.com/business/gdc-europe-s-indie-summit-adds-i-ridiculous-fishing-i-i-badland-i-postmortems)
- Stardew Valley: [Fishing wiki](https://stardewvalleywiki.com/Fishing) · [Fish wiki](https://stardewvalleywiki.com/Fish) · [Legendary Fish](https://stardewvalleywiki.com/Legendary_Fish) · [Fish Frenzies](https://www.stardewvalleywiki.com/Fish_Frenzies)
- Dredge: [Game Developer postmortem](https://www.gamedeveloper.com/design/trawling-in-the-deep-how-black-salt-games-made-spooky-fishing-rpg-i-dredge-i-) · [80.lv interview](https://80.lv/articles/black-salt-games-on-the-development-of-dredge-the-pale-reach-dlc/) · [Minigames wiki](https://dredge.wiki.gg/wiki/Minigames) · [Aberrations wiki](https://dredge.wiki.gg/wiki/Aberrations)
- Animal Crossing: [Nintendo Wire guide](https://nintendowire.com/guides/animal-crossing-new-horizons/fishing/) · [AC wiki: Shadow](https://animalcrossing.fandom.com/wiki/Shadow) · [Nookipedia: Fishing](https://nookipedia.com/wiki/Fishing) · [Nookipedia: Coelacanth](https://nookipedia.com/wiki/coelacanth) · [Nintendo Everything: leaving in October](https://nintendoeverything.com/animal-crossing-new-horizons-bugs-fish-and-sea-creatures-leaving-in-october)
- Webfishing: [Fishing wiki](https://webfishing.wiki.gg/wiki/Fishing) · [Money wiki](https://webfishing.wiki.gg/wiki/Money) · [The Tartan](https://the-tartan.org/2024/11/25/webfishing-review-maybe-fishing-can-be-fun/) · [Inverse](https://www.inverse.com/gaming/steam-webfishing-cozy-chatroom-game-animal-crossing) · [Wikipedia](https://en.wikipedia.org/wiki/Webfishing)
- Cast n Chill: [Shacknews](https://www.shacknews.com/article/144913/cast-n-chill-review-score) · [Aywren](https://aywren.com/2026/03/18/steam-gaming-cast-n-chill-semi-idle-cozy-fishing-game) · [WellPlayed](https://www.well-played.com.au/cast-n-chill-review) · [OpenCritic](https://opencritic.com/game/18729/view/reviews)
- Cat Goes Fishing: [Steam](https://store.steampowered.com/app/343780) · [SRF](https://www.srf.ch/radio-srf-3/games-review-cat-goes-fishing-oder-ueber-das-angeln) · [Vaporlens](https://vaporlens.app/app/343780/cat_goes_fishing)
- Tiny Fishing and idle fishers: [CrazyGames listing](https://crazygames.it.com/game/tiny-fishing-idle-fishing-game) · [Hooked Inc](https://apps.appfollow.io/ios/hooked-inc-fishing-games/1436213906?country=it)
- Sea of Thieves: [Fishing wiki](https://seaofthieves.wiki.gg/wiki/Fishing) · [Fish wiki](https://seaofthieves.wiki.gg/wiki/Fish) · [Shacknews](https://shacknews.com/article/111735/fish-types-baits-and-locations-sea-of-thieves)
- Final Fantasy XV: [RPG Site](https://www.rpgsite.net/feature/5109-final-fantasy-xv-fishing-guide-how-to-fish-properly-to-raise-your-fishing-level-and-earn-ap-quickly) · [Inverse](https://www.inverse.com/article/25057-final-fantasy-xv)
- Dave the Diver: [Destructoid](https://destructoid.com/reviews/review-dave-the-diver) · [Push Square](https://www.pushsquare.com/reviews/ps5/dave-the-diver) · [allthings.how](https://allthings.how/dave-the-diver-explained-the-game-the-character-and-where-to-play/)
- Moonglow Bay: [Thumb Culture](https://www.thumbculture.co.uk/moonglow-bay-review) · [Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/moonglow-bay)
- Fishing Clash: [Ten Square Games interview](https://tensquaregames.com/2021/12/14/we-engage-by-showing-the-world-an-interview-with-the-designers-of-ten-square-games/) · [Kimola report](https://kimola.com/reports/unlock-insights-fishing-clash-customer-feedback-report-app-store-us-144588)
- Legend of the River King: [MobyGames](https://mobygames.com/game/6516/legend-of-the-river-king-gb) · [Nintendo Life](https://www.nintendolife.com/reviews/3ds-eshop/legend_of_the_river_king_2_gbc)
- Design essays: [Aversa, Taxonomy of Fishing Mini-games](https://www.davideaversa.it/blog/game-design-taxonomy-fishing-mini-games/) · [Game Dev's Guide to Fishing Minigames](https://gamedevsjourney.substack.com/p/the-game-devs-guide-to-fishing-minigames) · [Kotaku: everyone loves fishing (Bungie, ZeniMax designers)](https://kotaku.com/stardew-valley-destiny-2-fishing-minigames-2000723185)
