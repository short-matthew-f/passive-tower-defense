# Auto-battler genre research for The War Pit

Prepared 2026-10-28 for the designer of **The War Pit** (Overlord, department 07). The War Pit's design: shop, roll, freeze and merge beasts into a 5-slot line; deterministic battles against ghost-drafted rival warbands; the Huntmaster boss; 8-win Runs with 4 Grit hearts; tactics cards that unlock through the Stakes dial; and a Standing Warband that earns idle Skirmish income.

Inputs I read first: spec `passive-tower-defense/docs/specs/07-war-pit.md` (rev. 3/4), code `src/depts/pit/*` (23 units plus tokens, 6 foods, 5 tamer archetypes, Huntmaster 14/30 Armor 2 in `run.ts`), the audit `fun-review/raw/depts-c.md` (P1–P7) and `fun-review/proposal.md` (War Pit row, B4–B6).

The audit's verdict, to keep in mind throughout: *"the depth of a SAP demo"*. Its findings:

- Cards have no names or text.
- Rounds 3–7 are won without suspense.
- The Huntmaster is a deterministic wall.
- Battles are static and spread out.
- Idle income is invisible.
- There is no build identity and no reason to come back tomorrow.

Constraints that shape every recommendation:

- 180x320 portrait pixel art.
- Idle progress must stay continuous (Skirmishes, offline).
- No server, since the game is hosted on GitHub Pages (spec §17.5). Async PvP is therefore only possible through local ghosts or share codes.
- Deterministic engine.

**Source caveat.** Dev-authored material is scarce for several of these games. Team Wood Games publishes almost no design writing, Game River has given no design interviews I could find, and Backpack Battles has no design postmortem. Where no developer source exists, I used wikis, patch notes, reviews and community threads and labelled them as such. Two sources could not be read in this session: `game.info.intel.com` (the HS Battlegrounds making-of article) is not in the session's allowed network domains, and mobalytics.gg returned 403.

---

## Part 1: Game-by-game notes

### 1. Super Auto Pets (Team Wood Games, 2021–)

The closest reference: the War Pit is explicitly "in the vein of SAP".

- **Core rules.** Per the official wiki:
  - 10 gold per turn. Pets and food cost 3 each; a roll costs 1.
  - **One free roll at the start of each shop phase.**
  - Freeze keeps an item in its slot through rolls, but a frozen item takes up a shop slot.
  - Max level 3: L2 at 2 XP, L3 at 3 more XP. Each level-up gives +1/+1.
  - **Levelling up lets you choose 1 of 2 pets from the next tier.**
  - Shop tiers rise on odd turns (T1 on turn 1 up to T6 on turn 11+).
  - Lines are 5 pets.
  - Arena gives 5 lives on Normal and 7 on Easy. You lose 1 per loss. **On turn 3 you regain a life if you've lost any**, "because turns 1 and 2 are highly random". A draw costs nothing.
  - Ten trophies wins the Run.

  Sources: [SAP Wiki: The Basics](https://superautopets.wiki.gg/wiki/The_Basics), [Wikipedia](https://en.wikipedia.org/wiki/Super_Auto_Pets).
- **Ghost opponents.** Arena is asynchronous and untimed. The opponent comes "from a database of teams built by other players on the same turn" ([wiki](https://superautopets.wiki.gg/wiki/The_Basics)). Matchmaking tries to pair players with "a similar ratio of battles / wins / remaining lives", and falls back to AI teams when no player team exists ([community guide](https://twoaveragegamers.com/super-auto-pets-win-more-consistently-with-this-ultimate-guide/), [Steam discussion](https://steamcommunity.com/app/1714040/discussions/0/4361242944248887133)). So **rival difficulty tracks your record, not just the turn number.** A 2-loss player meets other strugglers. This is the main source of SAP's "every fight could go either way" feeling.
- **What makes drafting interesting.**
  - Short, explicit trigger text (Faint, Hurt, Start of battle, Sell, Buy, Friend ahead...).
  - Cheap pets that become great next to a specific partner. Pocket Gamer cites Horse buffing summons alongside Rooster's death-spawn ([review](https://ee.pocketgamer.com/articles/084151/super-auto-pets-review-chill-auto-chess-game-with-deep-strategic-gameplay/)).
  - Sell-economy pets that trade tempo now for gold.
  - Level-up tier rewards that create "aim for a merge" turns.

  Packs give each ruleset a *theme mechanic*:
  - **Turtle:** the original.
  - **Puppy:** reworked around Toys.
  - **Star:** strawberries and pushing.
  - **Golden:** trumpets, a team resource that summons a Golden Retriever when you run out of pets.
  - **Unicorn:** mana and ailments.
  - **Danger:** jump attacks and transform.

  Sources: [Wikipedia](https://en.wikipedia.org/wiki/Super_Auto_Pets), [Highland Cow](https://superautopets.wiki.gg/wiki/Highland_Cow), [Saiga Antelope](https://superautopets.wiki.gg/wiki/Saiga_Antelope).
- **Rotating content.** **Weekly packs are generated every Monday: a random set of pets for everyone, with their own leaderboard that resets weekly.** Custom packs let players build their own ([Wikipedia](https://en.wikipedia.org/wiki/Super_Auto_Pets), [App Store listing](https://apps.apple.com/app/id1597449908)). The weekly pack mixes default, expansion and new pets ([Rubicon review](https://www.rubiconline.com/?p=71188)). This gives near-zero-art freshness, because the same pets meet in new contexts.
- **Readability on phones.**
  - Big cute sprites; only two stat numbers per pet.
  - One trigger keyword per pet; a single horizontal line.
  - Battles where front pets visibly collide and projectiles fly.

  PocketGamer praises "simplicity both in its gameplay mechanics and in its visuals". Review aggregators repeatedly cite "easy to learn, hard to master" and suitability for "short bursts... on mobile" ([Vaporlens summary](https://vaporlens.app/app/1714040/super_auto_pets)).
- **Losses.** Losing is framed as motivating: "The more times I lost, the more I felt like I needed to get back in the game" ([PocketGamer](https://ee.pocketgamer.com/articles/084151/super-auto-pets-review-chill-auto-chess-game-with-deep-strategic-gameplay/)). A French review argues it rewards "creativity and reflection rather than simple luck" ([iPhoneSoft](https://iphonesoft.fr/2026/07/04/super-auto-pets-auto-battler-gratuit-plus-mignon-addictif-moment?AMP=1)).
- **Meta and monetization.** Packs are paid ($4.99 to $9.99) but not required for progress. Cosmetics include hats and backgrounds ([Adapty paywall library](https://adapty.io/paywall-library/super-auto-pets/)). Growth came from streamers Northernlion and Ludwig ([Wikipedia](https://en.wikipedia.org/wiki/Super_Auto_Pets)).
- **Criticism.** It can feel "repetitive quickly, with limited long-term replayability" for some players ([Vaporlens](https://vaporlens.app/app/1714040/super_auto_pets)). The weekly pack exists to counter exactly this.

### 2. Teamfight Tactics (Riot, 2019–)

- **Design lessons from GDC 2020 (David Abecassis)** ([Pocket Tactics writeup](https://www.pockettactics.com/teamfight-tactics-design), [GDC](https://gdconf.com/news/get-key-game-design-insights-riots-teamfight-tactics-gdc-2020)):
  - **Juggling.** Riot cut auto-chess micromanagement so the game rewards "tough choices, not touch execution".
  - **Matchmaking.** Cloned armies preserved isolation, but Riot chose shared experiences.
  - **Items.** Riot simplified items so any two components combine, and said to "always embrace extreme outcomes".
  - Abecassis praised the genre's "relaxed pace", "non-confrontational play" and "roguelike arc" toward a perfect roster.
- **Drafting.**
  - Traits and classes with breakpoints (2/4/6) turn every shop into "value now vs. the badge later".
  - Interest (1 gold per 10 banked, max 5) creates the tempo-vs-greed decision ([Tacter econ guide](https://tacter.com/tft/guides/three-fundamental-strategies-to-help-manage-economy-in-teamfight-tactics-c526092e), [Bamboo Gaming](https://www.bamboogaming.net/tft/economy)). Spending early is right "if it protects a streak, saves HP".
- **Freshness.**
  - Full sets rotate every few months.
  - **Augments** (Set 6+) were adopted as a core mechanic to keep "each game feeling fresh" ([Breakflip interview, FR](https://www.breakflip.com/actualites/combat-tactique/interview-de-geoffrey-virtue-producteur-executif-de-tft-sur-le-set-7-et-l-avenir-du-jeu-36876)).
  - Mortdog has said that Set 5's shadow items "frustrated core players" and showed that not everyone wants deep systems ([MeinMMO](https://mein-mmo.de/entwickler-uber-die-zukunft-von-teamfight-tactics/)).
- **Short-mode lesson.** Hyper Roll (about 15-minute games, 20 HP, no interest) was retired in 2025 at about 2% of playtime. Whalen said it "requires players to have a deep understanding of TFT, making it stressful for newcomers" ([esports.gg roadmap](https://esports.gg/news/teamfight-tactics/tft-roadmap-2025-no-more-hyper-roll-pengus-party-returns-and-new-set-revival), [Looper](https://www.looper.com/380586/teamfight-tactics-labs-and-hyper-roll-mode-explained)). **Shortening a run does not make it simpler.** Compressed formats punish mistakes harder, which matters for the Pit's 8-win, 4-Grit format.

### 3. Dota Underlords (Valve, 2019–2020)

- **Drafting.** Alliances: each hero has at least two, with bonuses at thresholds. 3-of-a-kind merges. Item drops. After round 10 you pick one of four "Lords" with a battlefield power ([Wikipedia](https://en.wikipedia.org/wiki/Dota_Underlords), [Peer Mag](https://peermag.org/articles/video-game-review-dota-underlords/)).
- **Readability.**
  - IGN called it the easiest auto battler for novices "largely because of its interface".
  - Valve shipped a Mobile/PC UI toggle ([Inven](https://www.invenglobal.com/articles/8439/valve-has-changed-dota-underlords-ui-to-look-less-like-a-mobile-port)).
  - One review said the layout was justified on mobile, but the models are so large they overlap in adjacent cells.
- **Why it declined.**
  - It peaked at about 111–200k concurrent players, then fell.
  - The October 2019 "Big Update" (prison, Underlords with talents, a hype resource) "frustrated more players than they excited" ([Inven](https://invenglobal.com/articles/8925/dota-underlords-is-rapidly-losing-players-if-the-game-wants-to-succeed-it-must-solve-its-identity-crisis), [PCGamesN](https://www.pcgamesn.com/dota-underlords/player-count-drop)).
  - The meta stagnated, and there were no updates after 2020 ([PCGamesN](https://www.pcgamesn.com/dota-underlords/valve-time)).
- **Lessons.** Added complexity does not equal freshness, and a stagnant meta kills retention. Destructoid notes the frozen game now has a small "stress-free" niche ([Destructoid](https://www.destructoid.com/i-cant-believe-this-abandoned-valve-game-still-has-players-and-is-fun-4-years-later/)).

### 4. Hearthstone Battlegrounds (Blizzard, 2019–)

- **Design intent.** Ayala: losing should "feel really really good when you win, but doesn't feel that bad when you lose... you're out early, re-queue, and it's okay" ([Game Developer](https://gamedeveloper.com/design/why-the-i-hearthstone-i-devs-wanted-to-make-an-auto-battler)).
- **Tribes per lobby.** Blizzard planned to rotate tribes, but playtests found five tribes better than four. They moved to **per-game minion pools: a subset of tribes active in each lobby** ([Out of Games, patch notes](https://outof.games/news/1432-hearthstones-battlegrounds-implements-shifting-minion-pools/)). Today about 5 of 10 tribes are banned each game ([esports.gg](https://esports.gg/guides/hearthstone/tea-master-theotar-battlegrounds-build-identify-the-best-theo-targets)). Players say "finding combinations of randomly drawn tribes" is a big part of the fun ([Blizzard forums](https://us.forums.blizzard.com/en/hearthstone/t/battleground-changes/55849)).
- **Economy.** Every minion costs 3 and sells for 1. There is no interest or streaks. Tavern-tier upgrades have **a price that falls each turn you delay**, a clean tempo-vs-greed lever ([Upcomer](https://upcomer.com/3-big-differences-between-hearthstone-battlegrounds-and-other-autobattlers)).
- **Information.** You see your next opponent in advance, and order matters (leftmost attacks first; Taunt and Deathrattle). The War Pit's Scout is already this.
- **Seasonal rule layers.** One layer runs per season, then rotates:
  - Anomalies: one match-wide rule shown before hero select ([Blizzard Watch](https://blizzardwatch.com/2023/09/12/anomalies-hearthstone-battlegrounds-season-5/)).
  - Quests, Buddies, Tavern Spells ([Fantasy Warden](https://fantasywarden.com/?p=5212)).
  - **Trinkets:** a passive bought on turns 6 and 9. Season 13 mixed 73 new and 149 returning trinkets ([30.2 notes](https://hearthstone.blizzard.com/en-us/news/24122902/30-2-patch-notes), [35.2 notes](https://hearthstone.blizzard.com/en-us/news/24271853/352-patch-notes)).
- **Criticism.**
  - "A lot of options but not a lot of choices": the hero often dictates the minions ([Upcomer](https://upcomer.com/3-big-differences-between-hearthstone-battlegrounds-and-other-autobattlers)).
  - Players complain that stacking quests, buddies and anomalies adds "orders of randomization" ([forum](https://us.forums.blizzard.com/en/hearthstone/t/new-battlegrounds-gimmick-is-the-worst-yet/112255)).

  The lesson: **one rotating rule layer at a time.**

### 5. The Bazaar (Tempo Storm, beta 2024, launch Aug 2025)

- **Structure.**
  - Async PvP against **ghosts**: snapshots of other players' builds from hours earlier. Ghosts avoid the queueing and quitting problems of live lobbies.
  - The goal is **10 wins** before Prestige (an HP bar) runs out.
  - Each in-game day has shop and event stops, one PvE monster and one PvP ghost.
  - Rewards scale at 4, 7 and 10 wins, so a partial run still pays.

  Sources: [Know Your Meme overview](https://knowyourmeme.com/memes/the-bazaar), [Mobalytics](https://mobalytics.gg/the-bazaar/guides/what-is-the-bazaar).
- **Drafting.**
  - Strong hero identities: Vanessa (weapons, burn and poison), Dooley (machine chain reactions), Pygmalien and Mak ([PCGamesN](https://www.pcgamesn.com/the-bazaar/open-beta-release-date)).
  - Items on cooldown timers, with sizes and enchantments; the game is built on high-roll builds.
  - Seasons bring new encounters and neutral items ([Mobalytics patch notes](https://mobalytics.gg/the-bazaar/guides/patch-notes)).
  - QoL patches added right-click views of monster loadouts and item base stats: **inspectability is a recurring fix**.
- **Pitfalls.**
  - The launch monetization backlash. It was fixed by removing the paid season pass and granting expansion packs for free ([Yahoo/GamesRadar](https://tech.yahoo.com/gaming/articles/back-month-spent-strangling-itself-161941715.html)).
  - **"Ghost opponents have no matchmaking, so new players often face experienced, optimised builds."** This is the main ghost-design pitfall.

### 6. Backpack Battles (PlayWithFurcifer, 2024; mobile 2025)

- **Structure.** **10 wins before 5 losses.** Opponents are "semi-randomly chosen from other players' runs" (snapshots). After 10 wins you may continue in **Survival Mode** to round 18 for extra rank, at the risk of losing it ([Wikipedia](https://en.wikipedia.org/wiki/Backpack_Battles), [Steam discussion](https://steamcommunity.com/app/2427700/discussions/0/6770657417430301203)). Runs resume without penalty after you leave ([Steam](https://steamcommunity.com/app/2427700/discussions/0/4290313152625938174)).
- **Drafting.**
  - Spatial adjacency: the Pan hits harder next to food.
  - Post-battle recipes: Hero Sword plus 2 Whetstones becomes a Longsword.
  - Four classes with two starting bags each.
  - Battles last 10–20 s.
- **Reception.**
  - 640k copies sold in its first month.
  - Players liked that it removes "the stress of real-time battles" ([Vaporlens](https://vaporlens.app/app/2427700/backpack_battles.md)).
  - IGN 6/10: "too few items for varied runs".
  - Shop RNG "withholds the item you want".
  - At high rank the ghost pool fills with winning builds and feels lopsided ([Steam](https://steamcommunity.com/app/2427700/discussions/0/6770657417430301203)).
- **Mobile.** Praised for its "really tactile feel" of packing ([PocketGamer](https://www.pocketgamer.com/backpack-battles/official-launch-android-ios)).

### 7. Mechabellum (Game River, 2023/2024)

- **Structure.** 1v1 rounds: buy and place units, which then can't be moved. Spend supply on unit tech upgrades. Winning a round damages the opponent's tower HP ([Wikipedia](https://en.wikipedia.org/wiki/Mechabellum)).
- **Why it works.**
  - **Readability** invites counterplay: "Because the game makes outcomes so readable, it invites you to respond intelligently" ([FinalBoss](https://finalboss.io/most-strategy-fans-are-sleeping-on-mechabellum-the)).
  - Units have "very distinct strengths and weaknesses" ([Quarter to Three](https://forum.quartertothree.com/t/mechabellum-tactical-autobattler-against-other-people/167835)).
  - Hard counters that can be flipped by upgrades ([TL.net](https://tl.net/forum/games/613085-mechabellum)).
  - Cheap swarm builds act as a "pressure valve" on the meta.
- **Lesson.** Visible, legible counters turn a watched battle into information for the next shop.

### 8. Storybook Brawl (Good Luck Games, 2021–2023)

- **Design.** Heroes with passives, treasures and spells, and a **two-row board of up to 7**.
- **Reception.** Screen Rant credited the extra depth with replayability. PC Gamer called it "crowded", with random elements that make games "vary wildly" ([Wikipedia](https://en.wikipedia.org/wiki/Storybook_Brawl)).
- **Shutdown.** It closed in May 2023 after its owner FTX went bankrupt ([Decrypt](https://decrypt.co/137875/ftx-sam-bankman-fried-storybook-brawl-video-game-shutting-down)).
- **Lesson.** Each added layer (rows, treasures, spells) costs readability. On a small screen, one row plus one layer of modifiers is the limit.

### 9. Despot's Game (Konfa Games / tinyBuild, 2022)

- **Design.**
  - Roguelike dungeon of rooms; food costs per move.
  - Weapons assign classes, and class-count bonuses unlock.
  - Mutations can change a class's role.
  - The "King of the Hill" async leaderboard pits your boss-beating team against other players' teams ([SuperJump](https://www.superjumpmagazine.com/despots-game-review/), [But Why Tho](https://butwhytho.net/2022/10/09/review-despots-game-dystopian-army-builder-brings-rogue-lite-to-auto-battlers-pc/)).
- **Pitfalls named by reviewers.**
  - About 40-unit brawls with **no damage numbers or post-battle stats**, so players "can't easily judge which units are effective". The reviewer asks for a recap.
  - Uncapped unit counts mean there is little reason to commit to a class.
  - Runs over an hour with no save ([OpenCritic](https://opencritic.com/game/13662/view)).
- **Lesson.** Synergy only matters with a hard slot cap. The battle must explain itself afterwards.

### 10. Clash Mini (Supercell, 2021–2024)

- A mobile chibi auto-battler from the Clash IP. It was ended after about 2.5 years in beta because it "never reached the standard needed". It had about 700k downloads in 2023, against 35M for Clash Royale ([Game World Observer](https://gameworldobserver.com/2024/03/15/clash-mini-shutdown-supercell-no-new-games-in-five-years), [PocketGamer.biz](https://www.pocketgamer.biz/supercell-axes-clash-mini-as-bold-changes-get-underway-but-theres-still-hope)). Its "essence" was to be folded into Clash Royale.
- **Lesson.** Even with top-tier art and IP, a pure auto-battler as a standalone mobile product struggled to keep players. Auto-battlers work best as a *mode inside* something larger (HS Battlegrounds inside Hearthstone, TFT inside the League ecosystem), which is the War Pit's position inside Overlord.

### 11. Idle hero battlers: AFK Arena, Hero Wars

- **AFK Arena.**
  - 5v5 automated battles with factions that grant bonuses when grouped ([Udonis](https://blog.udonis.co/mobile-marketing/mobile-games/afk-arena-analysis)).
  - The **idle chest caps at 12 h**, which nudges about two sessions a day.
  - Campaign has no energy gate, and **boss fights every 5 levels** create skill-check difficulty peaks.
  - Bounties run up to 12 h ([Game Developer: Flexible time session design in AFK Arena](https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena)).
- **Hero Wars.** Partially automated battles where the player times skills; faction and role composition ([GameWith](https://gamewith.net/herowars-alliance/60014), [VC Gamers](https://www.vcgamers.com/news/en/how-to-assemble-team-hero-wars)).
- **How idle and drafting coexist.**
  - Drafting is slow and persistent (roster and formation), not per-run.
  - Idle income is a function of your *best formation*.
  - The active play is pushing the next wall.

  The War Pit's Standing Warband is the same idea: a stationed snapshot whose strength sets idle pay. The genre's lesson is that idle pay must be **visible and meaningful** (the chest), and that a wall should be a **readable skill check that you eventually pass by improving**, not a re-run.

### 12. Legion TD 2 (AutoAttack Games)

- **Design.**
  - A wave-defence auto-battler.
  - **Mercenary sends both pressure the opponent and raise your income**, while "power mercs" hit harder but pay less income.
  - Upgrading the King is the safe economic play ([Legion TD 2 wiki: Mercenaries](https://legiontd2.wiki.gg/wiki/Mercenaries)).
- **Reception.** Send choice and timing are "by far the biggest choices"; the economy takes 10–15 of a 20–30 minute match to pay off ([TechRaptor](https://techraptor.net/gaming/reviews/legion-td-2-review)).
- **Lesson.** The most interesting auto-battler economy decisions are **explicit greed-vs-pressure toggles**, each tied to a visible risk.

---

## Part 2: Synthesis

### (1) The strongest genre practices

1. **The shop is the game, and the fight is the payoff.** TFT's "tough choices, not touch execution", SAP's 3/3/1 economy and Battlegrounds' flat 3-gold economy all keep the decision surface small and repeated about 10 times per run. Fights are 5–20 s, readable, and skippable but worth watching (SAP, Backpack Battles).
2. **Synergy you can see at shop time.** Several systems serve this:
   - TFT and Underlords traits with breakpoints.
   - Battlegrounds tribes.
   - Backpack Battles adjacency and recipes.
   - AFK Arena factions.
   - SAP's partner pets (a summoner next to a summon buffer).

   What matters is **a cheap card that becomes great next to another**, signalled before you buy. It is the "aha" the audit says the Pit lacks.
3. **Explicit tempo-vs-greed levers**, at least one per game:
   - TFT interest.
   - Battlegrounds' falling tavern-tier price.
   - Legion TD 2's income vs. power sends.
   - SAP's sell pets and level-up tier rewards.
4. **Rivals scaled to the player's record, not the clock.** SAP matches on wins and lives. Backpack Battles and Bazaar ghosts are drawn from other runs at the same point. The Bazaar's main complaint is ghosts *without* matchmaking. Close fights come from matching, not from raw stat growth.
5. **Forgiving early losses, escalating stakes late.** SAP refunds a life on turn 3 because turns 1–2 are random. Partial runs pay at milestones (Bazaar chests at 4/7/10 wins). After the goal you may push on (Backpack Battles Survival Mode). Losing should "not feel that bad" (Ayala).
6. **One rotating rule layer for freshness, shared by everyone.** Examples: the SAP weekly pack (random pet subset plus a weekly leaderboard), HS Battlegrounds per-lobby tribes, anomalies and trinkets, TFT augments, Bazaar seasons. Recombining existing content is the cheapest way to make it new. Stacking layers backfires (HS forum complaints, Storybook Brawl "crowded", Underlords' Big Update).
7. **Inspectability everywhere.** The Bazaar added right-click loadouts in its anniversary patch. Underlords won its "easiest for novices" praise through its UI. Mechabellum's readability makes counterplay possible. Despot's Game is criticised for having no damage stats.
8. **Bosses as readable skill checks with telegraphs.** AFK Arena puts a boss every 5 stages. Battlegrounds shows your next opponent. Bosses work when the player can see *why* they lost and *what to change*.
9. **Auto-battler as a mode inside a bigger game.** HS Battlegrounds and TFT sit inside larger games; Clash Mini failed standalone. This supports the War Pit's role as a flagship department rather than a separate game.

### (2) Pitfalls

| Pitfall | Example | War Pit status |
|---|---|---|
| **Solved draft / no build identity** | Backpack Battles "too few items" (IGN). SAP turning "repetitive" without the weekly pack. Underlords' stagnant meta. | **Present.** 17 starting units. The audit bot always ends on Boar/Ogre/Rust/Gorgon. |
| **No visible synergy** | Despot's uncapped classes leave little reason to commit. | **Present.** Archetypes exist only for rivals, so the player has no tribe badges. |
| **Unreadable battles** | Despot's 40-unit brawls with no damage numbers. Underlords' overlapping models. | **Present.** Lines sit 70 px apart, cards blink, and there are no lunges or recap (audit P6). |
| **Cards that don't explain themselves** | The Bazaar needed patches to add inspection. | **Present.** No names, long-press modal (P5). Partly fixed in code: `units.ts` has `text`. |
| **Repetitive or unmatched rivals** | Bazaar ghosts with no matchmaking. Backpack Battles' top-rank pool. | **Present in reverse.** Rivals are too weak in r3–7 (P4) because they scale with round, not record. |
| **Wall bosses / deterministic re-runs** | AFK Arena walls are paced so that progress elsewhere lets you pass. | **Present.** The Huntmaster's budget is frozen and the battle deterministic, so the same loss replays (P3). |
| **Layer stacking** | HS quests + buddies + anomalies. Storybook Brawl. Underlords' Big Update. | Risk. The tactics cards, Brand, foods and held items are already a lot on 180x320. |
| **Short format punishes newcomers** | TFT Hyper Roll retired at 2% of playtime. | Risk: 8 wins / 4 Grit. Mitigated by free r1–2 losses. |
| **Invisible idle** | AFK Arena fixes this with a big chest. | **Present.** 0.4 Teeth/min (P1). |

### (3) Recommendations for The War Pit

These are ordered by impact per cost. They respect 180x320 portrait pixel art, the deterministic engine, the no-server constraint and continuous idle progress. Several sharpen items already in `proposal.md` (Q4–Q7, B4–B6).

#### R1. Rivals scaled to your record, plus a flagged "Tough" bout (S)

- **What.**
  - Pick each rival's draft budget from the player's **wins, Grit left and round**, the way SAP matches on wins and lives, not from round alone.
  - Players who are winning easily meet rivals drafted 1–2 rounds ahead, with a smarter bot and full growth. Players who are struggling meet rivals at the current round.
  - Once per Run (r3–6), show a **"TOUGH: +Teeth x2"** badge on the Scout. Winning pays double; losing costs the normal Grit.
- **Why.** It restores "every Fight could go either way", which audit P4 says is missing in rounds 3–7. The Bazaar shows the cost of ghosts without matchmaking. It is deterministic and needs no server, since it only changes `rival(r, S, seed)` inputs. Teach the Gauntlet to ignore the record term so `idleRate` stays monotone.
- **Source.** SAP Arena matchmaking; Bazaar criticism.

#### R2. Readable battle cinema and a one-line post-battle recap (S–M)

- **What.**
  - The two lines face each other across a 12 px gap, centred.
  - Fronts lunge into the gap with a 2-frame impact, a 2 px shake and 30–60 ms hit-stop from the shared `juice.ts`.
  - Damage numbers use the 5x7 font at 2x.
  - On faint, the card flips and flies off.
  - Ability triggers fire a small projectile or icon pop from the source card so cause and effect connect.
  - After the fight, the info line shows **MVP and recap**: "BOAR 14 DMG · RUST -4 ATK · YOU LOST TO: MANTICORE OPENER". On a loss, also show one hint naming the counter archetype.
- **Why.** The fight is the payoff (SAP, Backpack Battles). Despot's Game is criticised precisely for having no damage numbers or recap, and Mechabellum shows legible outcomes create counterplay. The recap turns a watched or skipped loss into information for the next shop, which also fixes the Huntmaster's "no new information".
- **Source.** SAP, Mechabellum, Despot's Game (negative example).

#### R3. Cards that teach: names, one-tap text and "combo glow" in the shop (S)

- **What.**
  - Show 3–4 letter names under sprites.
  - A single tap writes the full `text` into the info line (no modal).
  - **Combo glow:** a shop card gets a 1 px pulsing outline when its trigger interacts with something in your line. Examples: Carrion Crow behind a Faint unit; Dire Wolf behind your front; Owlbear behind your Brand.
  - Duplicates that would merge show a "+1" pip.
  - Add SAP's **level-up reward choice**: when a unit hits L2 or L3, choose 1 of 2 next-tier units into the shop. Today a single unit is added automatically.
- **Why.** The audit's core finding is that "the aha when two cards combine" is missing (P5). SAP signals partnerships through short trigger text, and Underlords' UI made it the "easiest for novices". The 1-of-2 choice makes merging a planned decision. Cheap, with no new art.
- **Source.** SAP (text, tier reward); Underlords / The Bazaar (inspectability).

#### R4. Four tribes with line badges, and 3 of 4 active per Run (M)

- **What.**
  - Tag the 23 existing units into 4 tribes, all already latent in the roster and archetypes:
    - **Vermin:** Rat, Spider, Crow, Leech, Ogre, Hydra. Faint chains.
    - **Hounds:** Wolf, Ember, Boar, Sabre, Piglet. Attack growth.
    - **Wings:** Stirge, Bat, Wasp, Manticore, Wyvern, Dragon. Snipers.
    - **Stoneblood:** Rust, Gorgon, Gargoyle, Mimic, Owlbear, Dung. Tanks and hexes.
  - **2 / 4 of a tribe in the 5-slot line lights a badge** (an 8x8 icon plus count in the HUD strip). Examples:
    - Vermin 2: summons +1/+1. Vermin 4: summons enter at L2.
    - Wings 2: Start-of-battle damage +1.
    - Hounds 2: first strike +2.
    - Stoneblood 2: front unit Armor 1.
  - Each Run (and each Gauntlet seed), **one tribe sits out of the shop**, shown on the Run start card. Rival archetypes map onto tribes, so the Scout reads as "Wings rival", which is easier to read than the current tamer badges.
- **Why.** Draft decisions become "chase the badge or take value" (TFT, Underlords, AFK Arena factions). The 5-slot cap makes breakpoints meaningful, unlike Despot's uncapped classes. Battlegrounds' per-lobby tribe pool is the cheapest known way to make a fixed roster feel different each run, and it breaks the solved Boar/Ogre/Rust/Gorgon core. Only small icons are needed, which suits 180x320. This supersedes B4's "15 more units" as a first step; add units later.
- **Source.** HS Battlegrounds (tribes per lobby); TFT and Underlords (breakpoints).

#### R5. Huntmaster as a rotating, telegraphed skill check (S)

- **What.**
  - The Huntmaster draws **one of 4–6 named "hunts"** from the seed, shown on the Scout from 6 wins. Examples:
    - *Net-Thrower*: nets your top attacker.
    - *Trapper*: your front starts at -3 HP.
    - *Falconer's Eagle*: 2 dmg to your back two.
    - *Beast-Bane*: +2 dmg vs. your majority tribe.
  - His beasts are drafted to *counter your tribe*.
  - **On a loss, the retry re-rolls his hunt and beasts** (keep the budget, change the seed). This is already proposed in Q6.
  - Show the recap from R2.
  - Bring HUNT_ATK/HP back toward the spec's 8/14 and let difficulty come from the counter-draft.
  - Reaching him pays the run-end bonus as if the Run were won; beating him doubles it.
- **Why.** The audit found 7-0 followed by four identical losses, the worst possible peak-end (P3). AFK Arena's boss every 5 stages and Battlegrounds' visible next opponent both show that bosses work as **telegraphed, readable checks you adapt to**. A frozen, deterministic re-run gives the player nothing new to adapt to.
- **Source.** AFK Arena boss pacing; Battlegrounds opponent preview; Bazaar milestone rewards.

#### R6. "Pit Bill of the Week": a seeded weekly ruleset with a local best (M)

- **What.**
  - Each Monday (UTC) a deterministic seed from the date picks:
    - a restricted roster of 12–14 units (always at least 2 tribes viable);
    - one **Pit Rule**: one anomaly-style modifier, never more than one;
    - a fixed rival sequence.
  - Example rules:
    - *Blood Moon*: Faint triggers fire twice.
    - *Short Rations*: 8 Chow, rolls free.
    - *Big Beasts*: 4-slot line, all units +2/+2.
    - *Frenzy*: Sudden Death from exchange 20.
  - Every player in the world gets the same week, with no server needed.
  - Track **best wins and fewest losses** locally, show a weekly tooth-trophy cosmetic, and allow export as a **share code** (the line plus the week seed) so friends can fight your ghost.
  - The Standing Warband may be stationed from a Bill run.
- **Why.**
  - The SAP weekly pack and HS Battlegrounds anomalies are the genre's proven zero-art freshness tools.
  - Weekly cadence suits an idle game better than daily.
  - It answers the audit's "no reason to come back tomorrow".
  - It uses the existing deterministic engine. Share codes are spec §15's "Later" item and B6.
  - It keeps to *one* rule layer, avoiding HS's stacking complaints.
- **Source.** SAP weekly packs; HS Battlegrounds anomalies; Backpack Battles modifier runs (kept out of ranked).

#### R7. A local ghost pool made from your own past lines (M)

- **What.**
  - At the end of every round, record your line (≤ 40 bytes) into a rolling local pool of about 200 entries, keyed by round and wins.
  - Rival generation then mixes **30–50% ghosts from your own past Runs** (re-skinned under a rival tamer name and tribe colour) with bot drafts.
  - Pasted share codes from friends join the pool too.
  - The Huntmaster can occasionally field your *best-ever* line ("he's been studying you").
- **Why.** Real-player snapshots are why SAP, Backpack Battles and Bazaar rivals feel human and varied. With no server, your own history and friends' codes are the only human-built source. Rivals stop feeling like one bot's taste, and over time the pool tracks your skill (a self-matchmaking effect). Gauntlets keep using fixed bot seeds so `idleRate` stays exact.
- **Source.** SAP, Backpack Battles and Bazaar ghosts; spec OQ 33.

#### R8. Economy lever and post-goal push: "Bank a Chow" and the Encore (S)

- **What.**
  - **Bank:** unspent Chow carries over, 1 per 3 unspent (max +2). This creates a TFT- or Legion-style greed vs. tempo choice inside SAP's simple economy.
  - Port **SAP's turn-3 heart** (regain 1 Grit at r3 if you lost one) in place of, or as well as, the current "r1–2 losses cost no Grit".
  - **Encore:** after a Triumph, offer "one more bout" against a rival at budget r10, with escalating Teeth and Crests. You may Retreat at any time with your winnings. Losing costs the Encore bonus, not the Triumph.
- **Why.** Gives the player a visible greed lever (interest, power sends, tavern price). Backpack Battles' Survival Mode gives strong players a skill outlet without lengthening the base run. Cheap numeric changes.
- **Source.** TFT interest; Legion TD 2 sends; SAP turn-3 life; Backpack Battles Survival Mode.

#### R9. Idle that you can see and that depends on your drafting (S)

- **What.**
  - Apply the audit's Q5 numbers (battle Teeth x5, `K_IDLE` x5).
  - Present Skirmishes as an **AFK-style "Gauntlet purse"** that visibly fills on the Pit door and in the Pit header (a tooth jar sprite plus "best: round 9").
  - Add a station-time preview: "this line clears r7 avg (+42 T/min) vs r4 now".
  - Keep the tribe badges (R4) active in Skirmishes so the Standing Warband's identity matters to idle pay.
  - Optional: the Weekly Bill line can be stationed with a +10% "crowd favourite" bonus while that week lasts.
- **Why.** AFK Arena's idle chest is the genre's model of idle income worth visiting for. Idle pay must be a function of your best drafting, so active play feeds idle pay.
- **Source.** AFK Arena idle chest and formation.

#### R10 (later). Menageries: unlockable themed packs as the Crest meta (L)

- **What.**
  - Grow the Bestiary into SAP-style **packs**, each a 20–24-unit roster built around one theme mechanic. Examples:
    - **Swamp Menagerie:** poison counters.
    - **Sky Menagerie:** push and swap.
    - **Bone Menagerie:** a Revive resource, like Golden's trumpets.
  - Crests unlock packs and their pedigrees. The Weekly Bill draws from all owned packs.
  - Ship one pack per major update.
- **Why.** SAP's long-term freshness comes from themed packs, each with one mechanic, rather than a bigger single roster. Battlegrounds' trinkets and TFT's sets show the same pattern at larger scale. It gives Crests a meaningful long-term sink beyond 6 stars and skins.
- **Source.** SAP Turtle, Puppy, Star, Golden, Unicorn and Danger packs; TFT sets.

**Suggested order:** R3 + R2 + R5 + R9 (all S, fixing the audit's critical items), then R1 + R8, then R4 → R6 → R7, then R10.

**Avoid:**

- A second rule layer on top of the tactics cards and Weekly Rule. One layer at a time: the HS stacking complaints, Storybook Brawl "crowded", Underlords' Big Update.
- A two-row board.
- Shortening Runs further: Hyper Roll showed short formats are harsher, not easier.

---

## Sources (consolidated)

- SAP: [Wikipedia](https://en.wikipedia.org/wiki/Super_Auto_Pets) · [Wiki: The Basics](https://superautopets.wiki.gg/wiki/The_Basics) · [Highland Cow](https://superautopets.wiki.gg/wiki/Highland_Cow) · [Saiga Antelope](https://superautopets.wiki.gg/wiki/Saiga_Antelope) · [App Store](https://apps.apple.com/app/id1597449908) · [PocketGamer review](https://ee.pocketgamer.com/articles/084151/super-auto-pets-review-chill-auto-chess-game-with-deep-strategic-gameplay/) · [Vaporlens](https://vaporlens.app/app/1714040/super_auto_pets) · [iPhoneSoft](https://iphonesoft.fr/2026/07/04/super-auto-pets-auto-battler-gratuit-plus-mignon-addictif-moment?AMP=1) · [Rubicon](https://www.rubiconline.com/?p=71188) · [matchmaking guide](https://twoaveragegamers.com/super-auto-pets-win-more-consistently-with-this-ultimate-guide/) · [Steam thread](https://steamcommunity.com/app/1714040/discussions/0/4361242944248887133) · [Adapty](https://adapty.io/paywall-library/super-auto-pets/)
- TFT: [Pocket Tactics GDC writeup](https://www.pockettactics.com/teamfight-tactics-design) · [GDC](https://gdconf.com/news/get-key-game-design-insights-riots-teamfight-tactics-gdc-2020) · [Tacter econ](https://tacter.com/tft/guides/three-fundamental-strategies-to-help-manage-economy-in-teamfight-tactics-c526092e) · [Breakflip](https://www.breakflip.com/actualites/combat-tactique/interview-de-geoffrey-virtue-producteur-executif-de-tft-sur-le-set-7-et-l-avenir-du-jeu-36876) · [MeinMMO](https://mein-mmo.de/entwickler-uber-die-zukunft-von-teamfight-tactics/) · [esports.gg Hyper Roll](https://esports.gg/news/teamfight-tactics/tft-roadmap-2025-no-more-hyper-roll-pengus-party-returns-and-new-set-revival) · [Looper](https://www.looper.com/380586/teamfight-tactics-labs-and-hyper-roll-mode-explained)
- Underlords: [Wikipedia](https://en.wikipedia.org/wiki/Dota_Underlords) · [Inven identity crisis](https://invenglobal.com/articles/8925/dota-underlords-is-rapidly-losing-players-if-the-game-wants-to-succeed-it-must-solve-its-identity-crisis) · [Inven UI](https://www.invenglobal.com/articles/8439/valve-has-changed-dota-underlords-ui-to-look-less-like-a-mobile-port) · [PCGamesN](https://www.pcgamesn.com/dota-underlords/player-count-drop) · [Destructoid](https://www.destructoid.com/i-cant-believe-this-abandoned-valve-game-still-has-players-and-is-fun-4-years-later/) · [Peer Mag](https://peermag.org/articles/video-game-review-dota-underlords/)
- HS Battlegrounds: [Game Developer](https://gamedeveloper.com/design/why-the-i-hearthstone-i-devs-wanted-to-make-an-auto-battler) · [Out of Games: shifting pools](https://outof.games/news/1432-hearthstones-battlegrounds-implements-shifting-minion-pools/) · [Upcomer](https://upcomer.com/3-big-differences-between-hearthstone-battlegrounds-and-other-autobattlers) · [Blizzard Watch anomalies](https://blizzardwatch.com/2023/09/12/anomalies-hearthstone-battlegrounds-season-5/) · [30.2 notes](https://hearthstone.blizzard.com/en-us/news/24122902/30-2-patch-notes) · [35.2 notes](https://hearthstone.blizzard.com/en-us/news/24271853/352-patch-notes) · [forum](https://us.forums.blizzard.com/en/hearthstone/t/new-battlegrounds-gimmick-is-the-worst-yet/112255) · [esports.gg](https://esports.gg/guides/hearthstone/tea-master-theotar-battlegrounds-build-identify-the-best-theo-targets)
- The Bazaar: [Know Your Meme](https://knowyourmeme.com/memes/the-bazaar) · [Mobalytics: what is](https://mobalytics.gg/the-bazaar/guides/what-is-the-bazaar) · [Mobalytics patch notes](https://mobalytics.gg/the-bazaar/guides/patch-notes) · [PCGamesN](https://www.pcgamesn.com/the-bazaar/open-beta-release-date) · [Yahoo/GamesRadar](https://tech.yahoo.com/gaming/articles/back-month-spent-strangling-itself-161941715.html)
- Backpack Battles: [Wikipedia](https://en.wikipedia.org/wiki/Backpack_Battles) · [Steam 1](https://steamcommunity.com/app/2427700/discussions/0/6770657417430301203) · [Steam 2](https://steamcommunity.com/app/2427700/discussions/0/4290313152625938174) · [Vaporlens](https://vaporlens.app/app/2427700/backpack_battles.md) · [PocketGamer](https://www.pocketgamer.com/backpack-battles/official-launch-android-ios)
- Mechabellum: [Wikipedia](https://en.wikipedia.org/wiki/Mechabellum) · [FinalBoss](https://finalboss.io/most-strategy-fans-are-sleeping-on-mechabellum-the) · [Quarter to Three](https://forum.quartertothree.com/t/mechabellum-tactical-autobattler-against-other-people/167835) · [TL.net](https://tl.net/forum/games/613085-mechabellum)
- Storybook Brawl: [Wikipedia](https://en.wikipedia.org/wiki/Storybook_Brawl) · [Decrypt](https://decrypt.co/137875/ftx-sam-bankman-fried-storybook-brawl-video-game-shutting-down)
- Despot's Game: [SuperJump](https://www.superjumpmagazine.com/despots-game-review/) · [But Why Tho](https://butwhytho.net/2022/10/09/review-despots-game-dystopian-army-builder-brings-rogue-lite-to-auto-battlers-pc/) · [OpenCritic](https://opencritic.com/game/13662/view)
- Clash Mini: [Game World Observer](https://gameworldobserver.com/2024/03/15/clash-mini-shutdown-supercell-no-new-games-in-five-years) · [PocketGamer.biz](https://www.pocketgamer.biz/supercell-axes-clash-mini-as-bold-changes-get-underway-but-theres-still-hope)
- Idle battlers: [Game Developer: AFK Arena sessions](https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena) · [Udonis AFK Arena](https://blog.udonis.co/mobile-marketing/mobile-games/afk-arena-analysis) · [GameWith Hero Wars](https://gamewith.net/herowars-alliance/60014) · [VC Gamers](https://www.vcgamers.com/news/en/how-to-assemble-team-hero-wars)
- Legion TD 2: [Wiki: Mercenaries](https://legiontd2.wiki.gg/wiki/Mercenaries) · [TechRaptor review](https://techraptor.net/gaming/reviews/legion-td-2-review)
