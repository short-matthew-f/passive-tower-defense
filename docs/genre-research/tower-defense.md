# Tower defense: genre research for "The Dungeon"

Prepared 2026-10-28 for the designer of *The Dungeon* (Overlord, `src/depts/dungeon`, spec `docs/specs/01-dungeon.md`). Research targets the gaps named in `fun-review/raw/depts-b.md` (D1-D6) and `fun-review/proposal.md` (B1 Raids/Reputation, Greedy Gong, relics).

**Sourcing note.** Every claim with a link was checked against that source during this pass. Several wiki and press sites blocked fetching (403/402), and the shared web-search budget ran out partway through. Claims marked **[GK]** come from general genre knowledge and were not re-verified this pass. Treat them as well-known, but check before quoting them as fact.

---

## 0. The gaps this research targets

From the critique and the spec, The Dungeon's specific problems are:

| Gap | Evidence (internal) |
|---|---|
| **G1. Placement is coverage, not a puzzle.** About 60 valid wall tiles on one authored path. A greedy "path coverage" bot solves it. | depts-b D1 |
| **G2. No stakes.** No lives. A leak steals at most 2% of *unspent* Plunder. Cautious Mode means idle never bleeds. | spec §4, depts-b S2 |
| **G3. Active verbs are "tap when lit".** Gong, Glare and coin taps are always correct, so they are chores, not decisions. | depts-b D3 |
| **G4. Upgrades are +X% spreadsheets.** L5/L10 branches are stat flips. | depts-b D4 |
| **G5. Slow, flat start, and the dial is uneventful.** 3 Squires every 12 s for about 15 min. New rules only at Lure 3/5/8/12. | depts-b D2, D5 |
| **G6. Idle does about 97% of the work.** First Fall takes 19 AE-hours, of which 0.58 h is on screen. | depts-b S1, proposal #2 |

What The Dungeon already does well, by genre standards:

- **Two-party preview.** This matches Defender's Quest's "total information" rule.
- **Counter-enemies.** Rogues ignore bait, Wizards dispel runes, Clerics demand focus fire.
- **Thief carry-back with recovery.** This is close to Defense Grid's cores and Cursed Treasure's gems.
- **Trapdoor.** Close to Dungeon Warfare's push/abyss traps.
- **Bait loops.** A light version of routing control.

These are good bones. What's missing is *scarcity, consequence and interaction*.

---

## 1. Game-by-game notes

### 1.1 Kingdom Rush series (Ironhide, 2011-)
- **Placement.** Fixed **build spots** along authored paths **[GK]**. There are few of them, so each spot is a real choice of which of 4 tower families goes at which bend. Barracks soldiers *block* enemies on the road, which creates kill zones for the ranged towers. This is the same role as The Dungeon's summons.
- **Active play was the founding thesis.** Co-founder Álvaro Azofra said most TDs ask you to plan and watch. Ironhide "wanted to make the player feel involved, busy, and wanted the stage to feel like a battle was going on". That "more action" goal "led to many of the concepts and mechanics of the game" ([Kodeco interview](https://www.kodeco.com/2769-making-a-hit-tower-defense-game-a-top-app-dev-interview)). The resulting verbs are a hero you move around, Rain of Fire (an AoE spell) and Reinforcements (temporary blockers).
- **Calling waves early is a priced gamble.** You get bonus gold *and* reduced spell cooldowns, scaled by how early you call. Guides warn that "calling enemies early without the proper defenses could cost you a star" ([ayumilove guide](https://ayumilove.net/kingdom-rush-walkthrough-guide/), [LaunchBox](https://gamesdb.launchbox-app.com/games/details/68390-kingdom-rush), [Steam discussion](https://steamcommunity.com/app/816340/discussions/0/1734342161871096889)). This is exactly the decision The Dungeon's Gong lacks: KR's early call couples greed with risk to a scarce resource (lives).
- **Failure and stars.** You start with 20 lives. 3 stars for 18-20 left, 2 stars for 6-17, 1 star for 1-5. Clearing campaign unlocks **Heroic** (elite waves, 1 life) and **Iron** (one long wave, only 1-2 tower types allowed, wave sizes hidden, 1 life) challenges, each worth +1 star ([KR wiki: Iron Challenge](https://kingdomrushtd.fandom.com/wiki/Iron_Challenge), [wikily game modes](https://wikily.gg/kingdom-rush/game-modes)). Later entries soften Heroic to 3 lives.
- **Retention.** Stars buy a persistent upgrade tree, plus hero levelling and an encyclopedia of enemies and towers **[GK]**. The challenge modes reuse the same maps under new constraints, which is cheap content.
- **Lesson.** Scarce sockets, blockers plus ranged, lives that convert to a grade, and constrained re-runs of the same map.

### 1.2 Bloons TD 6 (Ninja Kiwi, 2018-)
- **Upgrades change behavior.** Each tower has 3 paths, and only 2 can be taken (one capped at tier 2). Tier 5 is a dramatic new ability, and community understanding is that only one tower per path can hold a given tier 5. **Paragons** need all three tier-5s on the map ([BloonsWiki BTD6](https://bloonswiki.com/Bloons_TD_6), [Steam thread](https://steamcommunity.com/app/960090/discussions/0/3485249057149532997)). Players remember "a 0-0-5", not "+22%".
- **Enemy properties force composition.** Camo bloons can only be hit by towers with detection. Lead resists sharp damage. DDTs combine camo, lead and speed. MOAB-class enemies have huge HP ([BloonsWiki Camo](https://www.bloonswiki.com/Camo_Bloon_(BTD6)), [Bloons Wiki: Bloon](https://bloons.fandom.com/wiki/Bloon)). Any single tower type has a known hole, so you need a team.
- **Stakes as an opt-in mode.** **CHIMPS** means No Continues, Hearts lost, Income (bonus), Monkey Knowledge, Powers or Selling. You get 1 life, rounds 6-100, and you unlock it by beating Impoppable ([BloonsWiki CHIMPS](https://www.bloonswiki.com/CHIMPS), [PocketGamer](https://www.pocketgamer.com/bloons-td-6/chimps-mode-best-strategy)). "No selling" is notable because it makes each placement permanent.
- **Live ops ladder.** A **Daily Challenge** comes from the community Challenge Editor ([BloonsWiki](https://www.bloonswiki.com/Daily_Challenge_(BTD6))). **Boss Events** have 5 boss tiers (rounds 40-120). The Elite version needs a Normal clear, and ranked leaderboards score by **Fastest Time, Least Cash or Least Tiers** ([BloonsWiki Boss Bloon Event](https://www.bloonswiki.com/Boss_Bloon_Event)). There are also **Odysseys** (multi-map runs with shared rules) and **Contested Territory** (team tile war) ([App Store](https://apps.apple.com/app/id1118115766)).
- **Lesson.** Behavior-changing top tiers with scarcity. Enemy properties with *several* answers. Stakes as an opt-in mode. Leaderboards that score *efficiency* ("least cash"), which turns over-defending into a cost.

### 1.3 Plants vs. Zombies (PopCap, 2009)
- **Placement.** A 5-lane grid where each lane is its own fight. The economy plant (Sunflower) competes for the same tiles as defense **[GK]**.
- **Teaching.** George Fan's GDC 2012 talk gives 10 rules ([notes](https://notes.hamatti.org/Sources/Talks/How-I-got-my-mom-to-play-through-Plants-vs.-Zombies)):
  - Blend the tutorial into play.
  - Introduce about 1 new thing every few levels.
  - Get the player to act once.
  - Use few words, and use passive messages that wait until the player is ready.
  - Show **adaptive hints** only when the player is struggling.
  - Avoid noise: no achievement pop-ups mid-play.
  - Make function readable from the sprite (peashooter spout, screen-door shield).
  - In Fan's words: "Games stop being fun once you've figured everything out."
- **Fresh constraints on the same toolset.** Mini-games include Last Stand (fixed budget, no income), Wall-nut Bowling, Conveyor levels and **I, Zombie**. I, Zombie is the inverse role: you place zombies against cardboard plants with a finite sun budget ([PvZ wiki: I, Zombie](https://plantsvszombies.wiki.gg/wiki/I,_Zombie)).
- **Lesson.** Steady drip of new rules. Every mechanic readable at sprite size. Hints only on struggle. Cheap mode variants that reuse assets.

### 1.4 Defense Grid: The Awakening (Hidden Path, 2008)
- **Cores and carry-back.** Aliens reach the generator, grab cores and walk them to an exit. A killed carrier drops the core, which floats slowly home, and *another alien can pick it up*. The game is lost only when all cores are gone ([Wikipedia](https://en.wikipedia.org/wiki/Defense_Grid:_The_Awakening), [wurb](https://wurb.com/stack/?p=1958)). Out-and-back routes mean "locations creeps will run through twice" ([Wayward Strategy retrospective](https://waywardstrategy.com/2018/09/07/defense-grid-the-awaking-retrospective-review/)).
- **Interest on unspent money,** scaled by the number of cores still at base. This creates a tension to "spend as little as possible early" against the need to defend, which the blogger calls a drive for "maximal efficiency" ([wurb](https://www.wurb.com/stack/?p=1964)). DG2 kept a post-wave interest bonus ([Game Informer](https://gameinformer.com/games/defense_grid_2/b/pc/archive/2014/04/14/defense-grid-2-reminds-us-why-we-love-tower-defense)).
- **Placement.** Many maps let towers maze the creeps. Upgraded towers go offline while upgrading, so upgrading costs coverage ([wurb](https://www.wurb.com/stack/?p=1964)).
- **Lesson.** The Dungeon's Gold Sack is already Defense Grid's core, minus the stakes. DG makes it tense because sacks are **finite**, a dropped sack can be **re-stolen**, and your **income depends on what's still home**.

### 1.5 Dungeon Keeper (Bullfrog, 1997) / War for the Overworld (Brightrock, 2015)
- **Fantasy.** Molyneux's pitch grew from an obsession with "bad guys never succeed". Heroes raid *your* dungeon, and the Horned Reaper was as much a danger to you as the heroes were ([Epic interview](https://store.epicgames.com/news/dungeon-keeper-rise-and-fall-interview-peter-molyneux?lang=sv), [Galaxus](https://www.galaxus.ch/en/page/25-years-of-dungeon-keeper-this-is-how-it-was-created-thats-why-a-sequel-is-out-of-the-question-23815)).
- **Mechanics [GK].** You dig the dungeon yourself, rooms attract creatures, and the hand of evil slaps minions and picks up heroes. Heroes path toward your heart and treasure. Doors and traps are crafted. WftO keeps the formula: excavate, build rooms, and use spells and rituals on trespassing heroes ([Fanatical listing](https://www.fanatical.com/en/game/war-for-the-overworld)). Its reception is Very Positive on Steam and 68 on OpenCritic ([RAWG](https://rawg.io/games/war-for-the-overworld/reviews)).
- **Lesson.** The thrill is *authorship of the space* (dig, shape, choose what the heroes see) plus a cheeky, evil hands-on verb. The Dungeon's Dig and Dungeon Keeper mode (spec §14) point here, but they currently convert rock to more build tiles, which adds coverage instead of choices.

### 1.6 Dungeons (Realmforge/Kalypso, 2011)
- **Twist.** You lure heroes, then **keep them happy** (gold, books, equipment) so they yield more soul energy when you finally kill them ([Gaming Nexus](https://gamingnexus.com/News/20924/How-to-fatten-up-heroes-with-happiness-to-reap-their-souls-in-Dungeons)). Reviews were mixed: "more than enough strategy and humor" but rough pacing ([Armchair General](https://armchairgeneral.com/dungeons-pc-game-review.htm), [Blogcritics](https://blogcritics.org/pc-review-dungeons/)).
- **Lesson.** "Fatten before the kill" is a natural verb for The Dungeon's Bait Chests and Greed rune. Letting heroes loot first raises their bounty, but the loot is real if they escape. That is a greed-versus-risk decision that fits the villain fantasy.

### 1.7 Dungeon Warfare 1-2 (Valsar, 2015/2019)
- **Placement.** Floor and wall traps on dungeon corridors. **Barricades change enemy paths** ([TouchArcade DW2 review](https://toucharcade.com/?p=251204)). The original had 26 traps with 3 tiers each, grouped by "how they hurt versus how they throw enemies around" ([eShop](https://ec.nintendo.com/apps/0100F8900E878000/AT)). Spring, Harpoon and Push traps fling enemies into chasms, and carts knock enemies into pits ([Steam forum](https://steamcommunity.com/app/355980/discussions/0/1762482479184448605)).
- **Combos are the skill.** A cold dart sets up Deep Freeze/Shatter. Knockback helps chokepoints early ([Steam discussion](https://steamcommunity.com/app/698540/discussions/0/1642041106360628021)). DW2 has 33 traps with 8 traits each ([Steam](https://store.steampowered.com/app/698540)).
- **Anti-maze enemies.** Battering rams, diggers and fliers that disrupt mazes are called "annoying/overpowered" by players ([Vaporlens summary](https://vaporlens.app/app/698540/dungeon_warfare_2)). Counters that delete your plan feel bad. Counters that *stress* your plan feel good.
- **Complaints.** Item-management tedium and grind in meta-progression ([Vaporlens](https://vaporlens.app/app/698540/dungeon_warfare_2)).
- **Lesson.** This is the closest genre sibling to The Dungeon. Its fun comes from **trap interactions** (slow, then push into hazard, then burn) and from **displacement** (knockback into pits).

### 1.8 Orcs Must Die! (Robot Entertainment, 2011-)
- **Placement.** Floor, wall and ceiling traps in corridors. Tar slows, Wall Blades kill but reset slowly ([Giant Bomb](https://giantbomb.com/wiki/Games/Orcs_Must_Die)).
- **Stakes.** The Rift has points, each leaker drains some, and you lose at 0 ([Techgage review](https://techgage.com/print/orcs_must_die_review)).
- **Combo scoring.** "If orcs are slowed in a tar trap while a wall trap fires arrows at them, and you then shoot them, you earn combo points" ([Engadget preview](https://www.engadget.com/2011-06-10-orcs-must-die-preview-pleasure-in-panic.html)). Skull ratings per level fund the trap upgrades **[GK]**.
- **Lesson.** Score the *interaction* between traps and your own verbs, so active play earns visible combo credit instead of a flat +10%.

### 1.9 Cursed Treasure 1-2 (IriySoft)
- **You are the evil overlord.** Heroes steal gems and run back to the map edge. The Crypt tower can push gem carriers backward ([Tropedia](https://tropedia.fandom.com/wiki/Cursed_Treasure:_Don%27t_Touch_my_Gems!)).
- **Placement.** Only 3 base towers, each restricted to a **terrain type** (Crypts on snow, Dens on grass, Temples on dirt). GameSkinny calls terrain the main strategic hook. There are spells (Meteor, Frenzy) and a 33-skill tree ([GameSkinny](https://www.gameskinny.com/reviews/cursed-treasure-don-t-touch-my-gems-an-awesomely-addictive-tower-defense-game/), [App Store](https://apps.apple.com/app/id1438612228)).
- **Failure and grading.** Three tiers of victory: keep at least one gem, keep all gems, or let *no hero touch* the gems ([Le Chic Geek](https://lechicgeek.boardingarea.com/cursed-treasure-app-great-for-flights-even-without-wifi/)). Players replay for top ratings ([GameSkinny](https://www.gameskinny.com/reviews/cursed-treasure-don-t-touch-my-gems-an-awesomely-addictive-tower-defense-game/)).
- **Lesson.** The Dungeon's exact fantasy in a proven mobile form. Socket *type* scarcity creates choices from a tiny tower roster, and a 3-tier grade comes from "how much of the hoard was touched".

### 1.10 Thronefall (Grizzly Games, 2023)
- **Placement.** Buildings sit on **predesigned blueprints**, each map caps the count, and economy buildings (houses) compete with defense. A destroyed building stops producing for that night ([GameLuster](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/), [Sixth Axis](https://www.thesixthaxis.com/?p=442518)).
- **Difficulty.** Players pick **optional mutators** before a map starts, which multiply score. Up to 5 perks. 86 Top Critic Average on OpenCritic ([search summary of reviews](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/)).
- **Pitfall.** Maps "blur together" apart from one new building or boss each, and a final boss that one-shots everything feels unfair ([GameLuster](https://gameluster.com/thronefall-review-holding-on-for-one-last-night/)).
- **Lesson.** Few slots plus an economy/defense trade plus self-chosen mutators equals depth with minimal UI. That fits a 180x320 screen.

### 1.11 Rogue Tower (Die of Death, 2022) and Dungeon Maker (GameCoaster, 2018)
- **Rogue Tower.** The path grows one tile per wave, and at crossroads *you* choose the direction, steering it past existing towers to build killboxes. Elevation boosts damage. On multi-path modes, you can expand only one path per round and neglected paths get tougher. Cards and XP unlock new towers ([Steam](https://store.steampowered.com/app/1843760/Rogue_Tower), [Indie Hell Zone](https://indiehellzone.com/2022/02/21/rogue-tower/)). The critique is that hour-long runs are hard to drop and there's no fast-forward or save ([Indie Hell Zone](https://indiehellzone.com/2022/02/21/rogue-tower/)).
- **Dungeon Maker: Dark Lord.** A mobile "you are the dungeon" roguelite. The grid dungeon starts at 3x3 and holds battle rooms (monsters), traps and function panels (buffs to neighbours). Panels can be *overwritten but not removed*. The Dark Lord's HP persists between battles, and every 20th day is a boss. Relics come from elite fights, and you choose rewards from 3 options ([Gigazine review](https://www.gigazine.net/gsc_news/en/20180528-dungeon-maker-review), [App Store](https://apps.apple.com/app/id1359652100)). It is rated 4.7 from about 39K ratings.
- **Lesson.** Path *authorship as a reward*: each expansion is a meaningful fork. Dungeon Maker shows that **adjacency buff panels** plus **commitment** (no free removal) plus **persistent HP** produce tension on a phone.

### 1.12 The Tower: Idle Tower Defense (Tech Tree Games, 2021) — the idle-TD reference
- **Loop.** One auto-firing tower in the centre. Cash buys in-run upgrades that reset on death. When the tower dies, you get Coins for permanent Workshop upgrades: "fight, upgrade, die, evolve, repeat" ([BlueStacks guide](https://www.bluestacks.com/blog/game-guides/the-tower-idle-tower-defense/ttitd-beginners-guide-en.html)).
- **Tiers.** Tiers unlock at wave milestones. They are tougher and faster but multiply coins, so players **farm a comfortable tier** and **push** higher for records ([BlueStacks](https://www.bluestacks.com/blog/game-guides/the-tower-idle-tower-defense/ttitd-beginners-guide-en.html)).
- **Long-term layers.**
  - **Labs** run real-time research while you're idle or playing.
  - **Cards** and Card Mastery add effects.
  - Perks are offered every N waves, with "Trade-Off" perks such as -50% enemy damage *and* -50% your damage ([Oslink guide](https://www.oslink.io/blog/guide/The-tower-idle-tower-defense-upgrade-strategies-guide.html)).
  - Elite enemies (Ray, Vampire, Scatter) ignore some of your effects, and Fleets spawn more at higher tiers. Bosses come every 10 waves, and **Battle Conditions** modify high tiers ([community wiki summary](https://the-tower.notion.site/1bf91383b93f80b39962d0d6d4cd07a7)).
  - **Live tournaments** against other players are the *only* way to unlock Ultimate Weapons ([App Store](https://apps.apple.com/app/1575590830)).
- **Why it matters for Overlord.** The Tower proves that idle TD keeps stakes: **runs end in death**, and death converts to permanent currency. Idle is "farm the tier you can hold". Active and competitive is "push your best wave". The Dungeon's Cautious Mode already models "farm the tier you can hold". What it lacks is a scored, losable *push*.

### 1.13 Others, briefly
- **Arknights.** Deployment points regenerate about 1/s. Each operator has a block count. Some enemies are unblockable, and others count as several units when blocked. Redeploy timers make retreat-and-redeploy a tactical verb ([Arknights wiki: Team building](https://arknights.wiki.gg/wiki/Team_building)). **Lesson:** blockers with *block counts* and enemies that break blocking. The Dungeon's Ogre (blocks 2) and Champion (50% from blockers) already gesture at this.
- **Legion TD 2.** You send mercenaries that attack your opponent *and* raise your income. Power mercs pay less income than income mercs ([LTD2 wiki: Mercenary](https://legiontd2.wiki.gg/wiki/Mercenary)). **Lesson:** offense-for-income is a greed gamble, a model for a Gong or Lure that hurts now and pays later.
- **Mindustry.** Factory logistics feed turret ammo, and some players build a defense and let it run for very long wave counts ([Quarter to Three thread](https://forum.quartertothree.com/t/mindustry-tower-defense-meets-factorio/144003?page=5)). **Lesson:** long-run AFK defense is fine *if* building it was the puzzle.
- **Defender's Quest (design essay).** Let the player focus. Give total information. Make failure feel self-inflicted. Avoid lock-and-key counters: "Enemies should have several viable counters". Make choices "Different, Balanced, Limited, and Clear". "You're making Tower Defense, not FarmVille", so no clicking chores. Mazing was skipped to limit simultaneous choices ([Game Developer / Fortress of Doors](https://www.fortressofdoors.com/optimizing-tower-defense-for-focus-and-thinking-defenders-quest/)).
- **Mazing theory.** Time-on-target is the metric. A switchback gives about 6x the fire of a straight lane at the same cost. Hairpins are prime because one tower hits the path twice. "Juggling" (re-opening exits) is contested as an exploit, and anti-block rules keep a legal path ([Maul Tactics](https://maultactics.gg/articles/mazing-guide)).
- **The "watching" critique.** "If the player is only performing actions once every 30 seconds, the game will likely feel boring". The proposed fixes are creep variety that forces different counters, plus things to do. A Whitevale Defender dev blames the kill-money snowball and proposes fixed income per wave (as summarized from [Stardock dev journal](https://www.stardock.com/games/article/495008/siege-of-centauri-dev-journal-what-makes-a-good-tower-defense-game) and [ModDB](https://www.moddb.com/features/the-one-problem-with-all-tower-defense-games)).

---

## 2. Synthesis: strongest genre best practices

1. **Scarcity makes placement a decision.**
   - Kingdom Rush build spots, Thronefall blueprints, Cursed Treasure terrain-locked towers and Dungeon Maker's 3x3 grid all limit *where*. The puzzle is "which piece goes in *this* spot", not "fill everything".
   - Where space is free (mazing TDs), the cost is that towers double as walls, and anti-block rules bound it.
   - Either way, a greedy coverage heuristic should *not* solve it.
2. **Interactions beat stats.**
   - Dungeon Warfare's slow, then push, then burn chains. OMD's combo points. BTD6 support towers (villages giving camo detection). Dungeon Maker's buff panels.
   - The best moments in TD are emergent combos that the player feels they invented.
3. **Upgrades should change behavior and look.**
   - BTD6 tier 5s and Paragons, and KR's late tower abilities **[GK]**.
   - Scarcity on top tiers (one tier 5 per path) forces specialization across pieces.
4. **Enemy properties should force composition, with several answers per threat.**
   - BTD6 camo/lead/MOAB, The Tower's elites, DW2's diggers and fliers.
   - Defender's Quest warns against single-answer lock-and-key, which tests memory, not thinking.
   - Anti-plan enemies should *stress* a layout, not invalidate it.
5. **Finite, legible stakes with a grade.**
   - KR's 20 lives map to 3 stars. Cursed Treasure grades how much of the hoard was touched. OMD's Rift points. Defense Grid's cores. The Tower's run death.
   - Failure is bounded (a replayable level, or a run that converts to meta currency) but *real inside the session*.
6. **Opt-in difficulty with a multiplier.**
   - KR Heroic and Iron, BTD6 CHIMPS, Thronefall mutators, The Tower tiers and Battle Conditions.
   - Players choose a constraint and get status or reward for it. Constraints (no selling, 2 tower types) create more novelty than raw HP scaling.
7. **Active verbs are priced gambles, not taxes.**
   - KR's early call trades bonus gold and cooldowns against lives.
   - Legion TD's sends trade income against breaking the opponent.
   - KR's spells are scarce cooldowns saved for crises ("save Rain of Fire for the last wave").
8. **Greed-for-risk economies.**
   - Defense Grid's interest scaled by cores at home. Dungeons' "fatten heroes first". Thronefall houses that can burn.
   - The economy itself becomes a placement decision.
9. **Readable at a glance, teach with play.**
   - PvZ: one new thing at a time, function readable from the sprite, adaptive hints, no mid-play noise.
   - Defender's Quest: total information, failure feels self-inflicted.
10. **Retention layers.**
    - *Short term:* stars, dailies, weekly bosses with efficiency leaderboards (BTD6), streaks.
    - *Mid term:* challenge re-runs of known maps (KR Heroic/Iron, PvZ mini-games).
    - *Long term:* behavior unlocks, collections (heroes, cards, relics), real-time research (The Tower Labs), competitive-only rewards (The Tower tournaments).

---

## 3. Pitfalls that make TD boring

| Pitfall | Seen in | The Dungeon's exposure |
|---|---|---|
| **Solved layouts.** One dominant build, or a greedy fill. | Critiques of open maps; Thronefall maps "blur together" | **High.** G1: the coverage bot plays fine. |
| **No failure.** Nothing to fear, so nothing to earn. | Defender's Quest: failure must feel self-inflicted, *but must exist* | **High.** G2: no lives, a 2% steal, Cautious Mode. |
| **Watch-only stretches.** Acting less than once every 30 s. | Stardock dev journal | **High** at Lure 0-5 (G5). |
| **Chore buttons.** Always-correct taps. | Defender's Quest's "not FarmVille" | **High.** G3: Gong, coin taps, Glare snap. |
| **Lock-and-key counters.** One answer per enemy. | Defender's Quest; DW2 rams and diggers | **Medium.** Rogue is answered only by the Eye of Gloom. |
| **+X% upgrades.** No new toy. | BTD6 by contrast | **High.** G4. |
| **Snowball and dead-zones.** Kill-money spirals. Flat stretches, then spikes. | ModDB/Whitevale; itch comments | **Medium.** The Lure step is cheap (7.9 min) and uneventful. |
| **Runs too long, no save or speed.** | Rogue Tower critique | **Low.** Parties every 12 s; a Raid should stay at 3 min or less. |
| **Anti-plan enemies that delete layouts.** | DW2 player complaints | Watch out when adding Wizards or diggers. |
| **Unfair bosses.** One-shot everything. | Thronefall final boss | Champion design (P8). |
| **Pure AFK with no ceiling to push.** | Generic idle TDs vs The Tower's tier push | **High.** G6. |

---

## 4. Recommendations for The Dungeon

Constraints respected: portrait 180x320 pixel art, 16 px tiles, one-thumb controls in the bottom 80 px, continuous idle progress (the `idleRate` headless sim, Cautious Mode), and the proposal's direction (B1 Raids/Reputation, Greedy Gong, relics). Costs: **S** is under 1 week, **M** is 1-3 weeks, **L** is more than 3 weeks.

### R1. Raids: a losable "push" with Hoard sacks as lives, graded 0-3 Seals [M]
- **What.**
  - Keep idle exactly as is: Cautious Mode, the farm tier, no lives.
  - Add an on-demand **Raid** of 5 parties at Lure +3 plus a Champion, against a Hoard holding **5 visible Gold Sacks** (lives). A leaker carries a sack out, and recovering it restores the life.
  - Grade like Cursed Treasure: 3 Seals if no hero touched the Hoard, 2 if every sack is home at the end, 1 if at least one sack is left.
  - Stake and Reputation buff per proposal B1.
  - Per Defense Grid, a dropped sack drifts back slowly and **another hero can grab it**, which turns leaks into frantic Glare and Trapdoor moments.
- **Why.** Fixes G2 and G6 without breaking idle. This is The Tower's farm/push split: idle farms a tier, the Raid pushes it. A Raid is the natural home for Glare and Trapdoor as *saves*.
- **Source.** The Tower (run death, tiers), Kingdom Rush (lives to stars), Cursed Treasure (gem-touch grading), Defense Grid (re-stealable cores).
- **Note.** The sack sprite and recovery logic already exist (`model.ts`, spec §4). What's new is the finite count, the re-steal and the grade.

### R2. Scarce Sockets and adjacency combos [M-L]
- **What.**
  - Replace about 60 interchangeable wall tiles with about 12-16 marked **sockets** per floor, typed like Cursed Treasure's terrain: *Murder-hole* (towers), *Alcove* (lairs), *Glyph-stone* (runes).
  - Dig creates new sockets at rising cost, so Dig becomes "where do I want my next choice", not more coverage.
  - Neighbouring pieces form named combos, shown as a gold label on placement and drawn as a pixel link line:
    - Brazier next to a Mire rune makes **Burning Tar**.
    - A Crypt beside a Spikes rune makes **Shove**: skeletons knock heroes back onto the spikes.
    - An Eye beside a Ballista gives crits on slowed heroes.
    - Two facing Arrow Slits make **Crossfire**.
  - Combos feed the sim, so idle rewards clever layouts.
- **Why.** Fixes G1 and G4. A coverage bot can no longer solve it, because it must evaluate pairs.
- **Source.** Kingdom Rush build spots, Thronefall blueprints, Cursed Treasure terrain, Dungeon Maker buff panels, Dungeon Warfare and OMD trap combos.
- **Cost driver.** Re-authoring floor maps and adding pair evaluation to `sim.ts`. The UI is cheap (a glow and a label).

### R3. Displacement is the Overlord's signature [S-M]
- **What.**
  - Make *moving heroes* a central mechanic.
  - Add Spring and Push runes that fling heroes back along the route, or into a **pit tile**: a hazard socket that kills or ransoms them.
  - Add a Ballista **Harpoon** branch that drags its target back 2 tiles.
  - Let the Ogre throw heroes into the previous corridor.
  - Trapdoor stays the active version of the same idea.
  - Since heroes store `distanceAlongRoute` (spec §14), displacement is just subtracting distance, which is cheap and deterministic for the sim.
- **Why.** Fixes G4 (behavior, not stats). It also creates the slow, then push, then burn chains that are Dungeon Warfare's whole fun, and it fits the "you are the dungeon" fantasy.
- **Source.** Dungeon Warfare 1-2 (abyss traps, carts into chasms), Cursed Treasure (Crypt pushes gem carriers back), Defense Grid (out-and-back routes hit twice).

### R4. Behavior branches with one "Signature" per floor [M]
- **What.**
  - Turn L5/L10 stat flips into BTD6-style behavior forks:
    - Arrow: Ricochet / Pin.
    - Brazier: Pyre (leaves burning floor) / Smoke (blinds, so heroes walk past a chest without looting).
    - Crypt: Bone Legion / Grave Knights that **block 2**.
    - Mire: Tar Pit / Sinkhole that captures.
  - Add an **L15 Signature** with a distinct sprite (e.g. Ballista becomes "Dragon-Bone Siege"). **Only one Signature per tower type per floor**, which forces specialization across pieces like BTD6's single tier 5.
  - Collapse the Workshop's 7 +% rows into 3 tracks with visible milestones.
- **Why.** Fixes G4. It gives the 5- and 30-minute sessions a new toy to plan around.
- **Source.** BTD6 (crosspaths, tier 5 scarcity, Paragons). Kingdom Rush late-tower abilities **[GK]**.

### R5. Gong becomes Kingdom Rush's early call, priced in sacks [S]
- **What.**
  - Remove the 8 s gap and the coin-tap bonus.
  - Gong is available any time. The bonus scales with *how early* you ring (the remaining timer). Ringing also **cuts Glare and Trapdoor cooldowns** by the same fraction, and the next party overlaps the current one.
  - In Raids, overlapping parties make each leak cost a sack, so greed is priced in lives.
  - Keep the perfect-wave stack, and show it as gong rings.
- **Why.** Fixes G3. The Gong turns from a chore into "how greedy can my layout take?". Linking cooldowns means aggressive players get more active verbs, which raises active-play skill expression.
- **Source.** Kingdom Rush (early call = bonus gold + spell cooldown; "could cost you a star"). Legion TD 2 (risk now for income later). This matches proposal P7.

### R6. Lure tiers add Rules, not just HP: "Rumor Cards" [S-M]
- **What.**
  - Every 3rd Lure tier, the Rumor Mill offers 1 of 2 **Rumor Cards**: a hero modifier with a bounty multiplier. You can decline it and stay at plain HP scaling.
  - Examples:
    - *Torchbearers*: parties carry light, so Rogues are visible but runes trigger only once.
    - *Paladin escort*: Clerics shield the Champion.
    - *Sappers*: one hero per party disarms a rune.
    - *Treasure-mad*: Bait Chest detours double, but looters carry the purse out.
  - Every card must have **at least two counters** (no lock-and-key).
  - Also give Rogues a second answer, e.g. Brazier aura reveals them, or Mire reveals them on step.
- **Why.** Fixes G5 (an uneventful dial) and the Rogue lock-and-key. New rules arrive every few minutes like PvZ's drip, not every few hours. The sim already handles parties, so cards are data.
- **Source.** The Tower (Battle Conditions, Trade-Off perks), Thronefall (opt-in mutators), BTD6 (bloon properties), Defender's Quest (several counters per threat), PvZ (one new thing at a time).

### R7. "Fatten, then feast": loot-before-kill greed on Bait Chests [S]
- **What.**
  - Heroes who loot a Bait Chest gain a visible gold-bag pip. Each pip multiplies their bounty (e.g. x1.5 per chest), but a looter who escapes takes the purse *and* steals extra.
  - The Greed rune pays more on looters.
  - This turns chest placement into a risk/reward placement decision: deep loop (safe, lower yield) or chest right before your killbox (high yield, risk of escape).
- **Why.** Fixes G1 and G3. It adds a second meaning to bait beyond a longer path, and it plays to the villain fantasy.
- **Source.** Dungeons (Kalypso: keep heroes happy before the soul harvest), Defense Grid (interest/economy tied to what's at home), Thronefall (economy buildings at risk).

### R8. Daily Seeded Raid and weekly named-Champion event with efficiency leaderboards [M]
- **What.**
  - **Daily Raid.** The same seed, Rumor Card and fixed starting kit (no Workshop) for everyone. You get 3 attempts, and it is graded 0-3 Seals.
  - **Weekly Champion.** A named Champion with one unique mechanic, e.g. "Sir Reginald teleports past the first rune each lap". Each week's leaderboard scores **one** of: Least Plunder spent, Fewest pieces, or Fastest clear.
  - With no server, ghost scores from the player's own history or friends' share codes work as a stand-in.
  - Rewards are cosmetic tile skins or relics (proposal B4/B5), never the core economy.
- **Why.** Retention (G6), plus "least Plunder" punishes the over-defended solved layout. It reuses Raid code. It gives Raven Post (proposal B2) content: "Sir Reginald camps at your door this week."
- **Source.** BTD6 (Daily Challenge, Boss Events with Least Cash / Least Tiers / Fastest Time ranked boards), The Tower (tournaments gate unique rewards), Kingdom Rush (Iron challenge's restricted towers).

### R9. Dig carves the path, Rogue-Tower style, with anti-block [L, post-MVP]
- **What.**
  - When the Dungeon Keeper mode arrives (spec §14), skip free-form A* mazing at first.
  - Each Floor expansion or Dig session offers **2-3 path forks** and the player picks one, Rogue Tower style. Plus a small budget of **Barricades** (Dungeon Warfare) that reroute within one corridor, with an anti-block rule so a legal path always exists.
  - Hairpin sockets become prime real estate (Maul Tactics: one tower hits the path twice).
  - Cap juggling: moving a barricade has a long settle and no refund.
- **Why.** Fixes G1 at the deepest level and delivers the Dungeon Keeper authorship fantasy. Bounded choices keep it legible on an 11x13 grid and computable for the deterministic sim.
- **Source.** Rogue Tower (choose path direction), Dungeon Warfare 2 (barricades reroute), Defender's Quest (limit simultaneous choices), Dungeon Keeper and WftO (dig the dungeon).

### R10. Make it readable and quiet: teach by play, grade every party [S]
- **What.**
  - **Per-party receipt.** Ledger-Bones stamps a 1.2 s receipt after each party (proposal P6), with a PERFECT streak.
  - Show bounty as "% of the next Lure step".
  - **Telegraph function in sprites.** Wizard staff glows before a dispel, a rune shows a crack countdown, the Cleric heal radius is a 1 px ring.
  - **Adaptive hints only.** Show a hint only after a struggle signal (2 leaks in a row), never stuck lesson lines. The critique saw "CHESTS. VISITORS LOVE CHESTS." pinned for a whole session.
  - Never block board taps with ritual overlays.
  - Add a 2x/3x speed toggle during Raids' safe build phase.
- **Why.** G5 and D6. PvZ shows that readability and gentle teaching are the multipliers on everything above.
- **Source.** PvZ (George Fan's 10 rules), Defender's Quest (total information, speed-up "keeps boredom at bay"), Rogue Tower critique (no speed control), OMD (combo credit is visible score).

### Suggested order
1. **S quick wins:** R5 Gong, R10 receipts and hints, R7 fatten/feast. Together these make active play decision-heavy within a week.
2. **M core:** R1 Raids (also delivers proposal B1), then R6 Rumor Cards, R3 displacement and R4 branches.
3. **M-L depth:** R2 sockets and combos, then R8 events.
4. **L later:** R9 path-carving Dig.

Validate with the existing greedy bot. **A recommendation succeeds if the bot's score falls measurably behind a human or a smarter search on the same budget.** That is the operational definition of "placement is a puzzle again".

---

## 5. Sources

Kodeco/Ray Wenderlich, Kingdom Rush interview: https://www.kodeco.com/2769-making-a-hit-tower-defense-game-a-top-app-dev-interview · Enter.co interview (ES): https://www.enter.co/especiales/videojuegos/la-ciencia-y-el-arte-detras-de-un-buen-tower-defense-entrevista/ · KR Iron Challenge: https://kingdomrushtd.fandom.com/wiki/Iron_Challenge · KR modes: https://wikily.gg/kingdom-rush/game-modes · KR early call: https://ayumilove.net/kingdom-rush-walkthrough-guide/ , https://gamesdb.launchbox-app.com/games/details/68390-kingdom-rush , https://steamcommunity.com/app/816340/discussions/0/1734342161871096889 · BTD6: https://bloonswiki.com/Bloons_TD_6 , https://www.bloonswiki.com/CHIMPS , https://www.bloonswiki.com/Boss_Bloon_Event , https://www.bloonswiki.com/Daily_Challenge_(BTD6) , https://www.bloonswiki.com/Camo_Bloon_(BTD6) , https://steamcommunity.com/app/960090/discussions/0/3485249057149532997 , https://www.pocketgamer.com/bloons-td-6/chimps-mode-best-strategy , https://apps.apple.com/app/id1118115766 · PvZ GDC 2012 notes: https://notes.hamatti.org/Sources/Talks/How-I-got-my-mom-to-play-through-Plants-vs.-Zombies · I, Zombie: https://plantsvszombies.wiki.gg/wiki/I,_Zombie · Defense Grid: https://en.wikipedia.org/wiki/Defense_Grid:_The_Awakening , https://wurb.com/stack/?p=1958 , https://www.wurb.com/stack/?p=1964 , https://waywardstrategy.com/2018/09/07/defense-grid-the-awaking-retrospective-review/ , https://gameinformer.com/games/defense_grid_2/b/pc/archive/2014/04/14/defense-grid-2-reminds-us-why-we-love-tower-defense · Dungeon Keeper: https://store.epicgames.com/news/dungeon-keeper-rise-and-fall-interview-peter-molyneux?lang=sv , https://www.galaxus.ch/en/page/25-years-of-dungeon-keeper-this-is-how-it-was-created-thats-why-a-sequel-is-out-of-the-question-23815 · WftO: https://www.fanatical.com/en/game/war-for-the-overworld , https://rawg.io/games/war-for-the-overworld/reviews · Dungeons: https://gamingnexus.com/News/20924/How-to-fatten-up-heroes-with-happiness-to-reap-their-souls-in-Dungeons , https://armchairgeneral.com/dungeons-pc-game-review.htm , https://blogcritics.org/pc-review-dungeons/ · Dungeon Warfare: https://toucharcade.com/?p=251204 , https://store.steampowered.com/app/698540 , https://steamcommunity.com/app/698540/discussions/0/1642041106360628021 , https://steamcommunity.com/app/355980/discussions/0/1762482479184448605 , https://vaporlens.app/app/698540/dungeon_warfare_2 , https://ec.nintendo.com/apps/0100F8900E878000/AT , https://en.wikipedia.org/wiki/Dungeon_Warfare_2 · OMD: https://www.engadget.com/2011-06-10-orcs-must-die-preview-pleasure-in-panic.html , https://techgage.com/print/orcs_must_die_review , https://giantbomb.com/wiki/Games/Orcs_Must_Die · Cursed Treasure: https://tropedia.fandom.com/wiki/Cursed_Treasure:_Don%27t_Touch_my_Gems! , https://www.gameskinny.com/reviews/cursed-treasure-don-t-touch-my-gems-an-awesomely-addictive-tower-defense-game/ , https://lechicgeek.boardingarea.com/cursed-treasure-app-great-for-flights-even-without-wifi/ , https://apps.apple.com/app/id1438612228 · Thronefall: https://gameluster.com/thronefall-review-holding-on-for-one-last-night/ , https://www.thesixthaxis.com/?p=442518 · Rogue Tower: https://store.steampowered.com/app/1843760/Rogue_Tower , https://indiehellzone.com/2022/02/21/rogue-tower/ · Dungeon Maker: https://www.gigazine.net/gsc_news/en/20180528-dungeon-maker-review , https://apps.apple.com/app/id1359652100 · The Tower: https://www.bluestacks.com/blog/game-guides/the-tower-idle-tower-defense/ttitd-beginners-guide-en.html , https://www.oslink.io/blog/guide/The-tower-idle-tower-defense-upgrade-strategies-guide.html , https://the-tower.notion.site/1bf91383b93f80b39962d0d6d4cd07a7 , https://apps.apple.com/app/1575590830 · Arknights: https://arknights.wiki.gg/wiki/Team_building · Legion TD 2: https://legiontd2.wiki.gg/wiki/Mercenary · Mindustry: https://forum.quartertothree.com/t/mindustry-tower-defense-meets-factorio/144003?page=5 · Defender's Quest essay: https://www.fortressofdoors.com/optimizing-tower-defense-for-focus-and-thinking-defenders-quest/ · Mazing: https://maultactics.gg/articles/mazing-guide · Watching critique: https://www.stardock.com/games/article/495008/siege-of-centauri-dev-journal-what-makes-a-good-tower-defense-game , https://www.moddb.com/features/the-one-problem-with-all-tower-defense-games

*Gaps.* No primary Ninja Kiwi, Ironhide or Tech Tree Games design talk was reachable this pass. The web-search budget was exhausted, and several wikis returned 403/402. A follow-up pass could target the GDC Vault (Kingdom Rush/Ironhide talks, Defense Grid) and The Tower's developer posts on Labs and tournament economics.
