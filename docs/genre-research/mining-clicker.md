# Genre research: tap/clicker, mining and rhythm-tap games, for The Goblin Mines

Prepared 2026-10-28 for the designer of *The Goblin Mines* (Overlord). Inputs I skimmed first: spec `docs/specs/02-goblin-mines.md` (rev 4), code in `src/depts/mines/`, the fun audit `fun-review/raw/depts-a.md` (findings M1-M3, X1-X5), and `fun-review/proposal.md` (Mines row: "Fury, not a penalty" + "Drum on day one").

**The gaps this research targets** (from the audit):
- **M1:** you tap 25 identical rocks and have no decision to make. 90% of rocks are commons, and Tap Damage grows +1 flat while HP grows x1.17-1.25 per depth.
- **M2:** the Doom Drum is locked behind 8 Gems and depth 6, has no music, and judges a ±60 ms window on iOS touch.
- **M3:** depth is a HUD button, not a journey. Strata are a tint, and stratum behaviours appear on 5% of rocks.
- **X1:** active play earns only about 2.2-2.7x idle, so attention barely pays.
- **X5:** nothing sets an appointment to come back.
- The 8 taps/s soft cap punishes enthusiasm.

**Source quality note.** Few clicker developers publish postmortems. The strongest sources here are the Kolibri (Idle Miner Tycoon) GDC/GameAnalytics material, the Game Developer deep dive on SteamWorld Dig, Pecorella's GDC idle-math talk, the CHI 2018 idle-game taxonomy, the Rhythm Quest latency devlog and Sakurai's hit-stop column. Wikis and reviews fill in the rest. Exact numbers taken from fan wikis are flagged. My web-search budget ran out before I could pull a citation for Fortnite's harvesting weak-point, so that example is uncited (it is well known).

---

## Part 1: Game-by-game notes

### 1. Cookie Clicker (Orteil, 2013)
- **Satisfying tap:** the big backlit cookie swells on hover and invites the first click with no tutorial. The first minutes are packed with positive feedback, and later rewards shift toward a sense of accomplishment ([Game Developer, "The Recipe Behind Cookie Clicker"](https://www.gamedeveloper.com/design/the-recipe-behind-cookie-clicker)).
- **Active vs idle:** buildings produce passively. Active value comes from **Golden Cookies**, which spawn at random every ~2-10 min:
  - Frenzy: production x7 for 77 s.
  - Click Frenzy: x777 click power for 13 s, ~3.5-4% of outcomes.
  - Lucky: a lump sum.
  - Stacking them (a Click Frenzy inside a Frenzy) is the expert play ([Cookie Clicker Wiki, Golden Cookie](https://cookieclicker.fandom.com/wiki/Golden_Cookie?oldid=6162); [JHU Science of Learning note on Click Frenzy](https://scienceoflearning.jhu.edu/tof/click-frenzy-cookie-clicker)).
- **Lesson:** nobody clicks for the click. They click to catch a rare, short, huge, *stackable* spike. Active play is worth 10-1000x for seconds at a time, not 2x all the time.
- **Discovery and humour:** ever more absurd building tiers, a news ticker, hidden achievements, and Wrath cookies as risk/reward.
- **Retention:** golden-cookie hunting in the short term. Heavenly-chip prestige, seasonal events and minigames (Grimoire's "Force the Hand of Fate", which summons a golden cookie on demand) in the long term.

### 2. Clicker Heroes (Playsaurus)
- **Escalation:** each zone has 10 monsters. Bosses come every 5 zones with a **30 s timer**, and Primal bosses are harder walls. Failing a boss bounces you back to farm, a soft failure that gives you a goal.
- **Active vs idle:** the developers frame two build families:
  - Active builds (click damage, skills, crits) "burst down bosses during their timers".
  - Idle builds farm consistently but "miss the short bursts of rapid growth" ([Clicker Heroes blog](https://blog.clickerheroes.com/?p=2253), [blog](https://blog.clickerheroes.com/?p=2530), [blog](https://blog.clickerheroes.com/?p=1643)).
- **Mode switching:** idle bonuses switch on after ~60 s with no input, and click combo bonuses last while you keep clicking. The game *rewards whichever mode you're in* instead of punishing idling ([Steam discussion](https://steamcommunity.com/app/363970/discussions/0/490124466468680800)).
- **Skills:** Clickstorm, Powersurge and Lucky Strikes are short active buffs on long cooldowns. Players line them up before a boss, and that timing is the skill.
- **Lesson:** a timed boss turns tapping from a chore into a test, and the choice of build (idle or active) is itself a meaningful decision.

### 3. Tap Titans / Tap Titans 2 (Game Hive)
- **Loop:** a tap deals damage, and kills drop gold ([Game World Observer deconstruction](https://gameworldobserver.com/2016/07/12/tap-titans-deconstruct)).
- **Bosses:** every 10th monster is a timed boss, and every 5th boss is stronger. "Companions cannot do it alone; you have to tap along and use active skills."
- **Skills:** six active skills last a few seconds and then go on long cooldowns. Some work automatically, others need you to keep tapping.
- **Prestige:** relics scale with how far you pushed, so pushing further pays more. Artifacts are bought at random with relics, which makes every prestige a discovery.
- **Social:** tournaments start after the first prestige.
- **Skill-tree identity:** the Warlord tree is "for players that like to play as an idle game without the clicker part" ([BlueStacks TT2 guide](https://www.bluestacks.com/blog/game-guides/tap-titans-2/tt2-skill-tree-guide-en.html)). The idle path is an explicit, legitimate choice.
- **Lesson:** the companions' stats boost *tap* damage, which ties idle investment back to active payoff. A random artifact pull on prestige gives each reset a "what will I get?"

### 4. Idle Miner Tycoon (Kolibri Games)
- **Core loop visible on one screen:** mine, transport, sell. Choke points between the stages set the pace of progress and create the upgrade decisions ([GameAnalytics, 8 lessons from Kolibri](https://www.gameanalytics.com/blog/making-a-hit-idle-game-eight-lessons-from-kolibri-games)).
- **Retention:** the minimal prototype reached **D1 retention of 63-81%**. The team made D1 the foundation and added features only afterwards ([wnhub summary](https://wnhub.io/news/other/item-16505)).
- **Visual progression:** the team attacked the problem that "idle games feel the same after several prestiges" with **new visual mines** you open in parallel, without being forced to prestige. Limited-time **event mines** lifted engagement and revenue ([Mobile Free to Play, GDC 2019 deconstruction](https://mobilefreetoplay.com/gdc-2019-deconstructing-idle-miner-tycoon/)).
- **Cadence:** about 160 updates (roughly weekly) and ~10-minute sessions.
- **Lesson:** a new *place* is the strongest long-term hook in a mining idle. Upgrades should read as strategy, not as bigger numbers.

### 5. Deep Town (Rockbite)
- **Structure:** a vertical shaft. Each depth band has its own resource mix, and the deeper bands feed production chains (smelting, crafting, chemistry, jewelry, greenhouse). More than 10 zones are explored with "spells", and rockets go to asteroids ([App Store listing](https://apps.apple.com/us/app/idle-mining-factory-deep-town/id1202240058)).
- **Lesson:** depth matters because *what* you find changes, not only how much. Each layer brings a new noun.

### 6. Mr. Mine (Playsaurus, 2012; Steam remaster ~91% positive)
- **Depth milestones open whole systems:**
  - 300 km: the Underground City, with combat.
  - 700 km: the chest compressor.
  - 1000 km: the Moon, then Titan ([Mr. Mine blog, Strange Discoveries](https://blog.mrmine.com/?p=2688); [Steam](https://store.steampowered.com/app/1397920/MrMine/)).
- **Random discoveries:** caverns, chests and scientists' timed excavations yield **relics**, rare permanent boosts in rarity tiers. There are also odd one-off encounters (broken robots, the Orange Fish).
- **Pitfall:** players complain that opening chests to grind building materials is "the most tedious thing" ([Steam thread](https://steamcommunity.com/app/1397920/discussions/0/3112531165380621397)). Clickable rewards must not turn into busywork.
- **Lesson:** landmark depths should *unlock a new system or a new place*, and relic rarity gives every chest a slot-machine beat.

### 7. Motherload / Super Motherload (XGen)
- **Tension:** dig Mars before your fuel runs out, then haul the ore up to sell it. You can't dig upward, and falls hurt you ([Game Informer preview](https://gameinformer.com/games/super_motherload/b/ps3/archive/2013/03/27/mining-mars-is-better-with-friends); [Wikipedia](https://en.wikipedia.org/wiki/Super_Motherload)).
- **Discovery:** deeper means rarer ore plus story fragments (radio chatter).
- **Critique of the sequel:**
  - Reviewers found the explosive puzzles not worth doing "because better rewards were always deeper down".
  - Upgrades "pennies-per-trip grindy".
  - The fuel round trips tedious ([Game Informer review](https://gameinformer.com/games/super_motherload/b/playstation4/archive/2013/11/22/digging-deep-shallow-play); [GamesRadar](https://www.gamesradar.com/super-motherload-review); [Push Square](https://pushsquare.com/reviews/ps4/super_motherload)).
- **Lesson:** a side activity must beat "just go deeper", or players skip it. Constraints (fuel, a timer) give digging stakes.

### 8. Dome Keeper (Bippinbits / Raw Fury)
- **Structure:** mine underground between monster waves. A Hostile Proximity Meter shows when the next wave arrives, so every dig is a time bet ("I couldn't leave that last lump of iron behind", [PC Gamer](https://pcgamer.com/dome-keeper-review)).
- **Rewards:** relics behind switches reward exploration. Carrying resources slows you down ([Retro Style Games analysis](https://retrostylegames.com/blog/why-dome-keeper-so-good/); [wiki](https://domekeeper.wiki.gg/wiki/Dome_Keeper)).
- **Feel:** reviewers call each round "a sprint: a few seconds of rest, then go again" and say digging becomes "an engineering problem where every last second counts" ([Shacknews](https://www.shacknews.com/article/132448/dome-keeper-review)).
- **Lesson:** a visible countdown turns mining into decisions, and a *rhythm of sprint and rest* stops fatigue.

### 9. SteamWorld Dig (Image & Form)
- **Design deep dive:** Olle Håkansson's deep dive on the digging mechanic covers:
  - Tension comes from "a constant risk of getting stuck". The aim was for players "to be wary of it", not actually stuck.
  - Early testers dug straight down and had a bad time. Tutorials couldn't fix it; giving players a movement tool (the wall jump) did ([Game Developer deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-the-digging-mechanic-in-i-steamworld-dig-i-)).
- **Reviews:** they praise "the strangely satisfying sound of a drill boring through a cluster of precious minerals" and the Metroid-like progression around repetitive mining ([Game Informer](https://gameinformer.com/games/steamworld_dig/b/pc/archive/2013/12/06/game-informer-steamworld-dig-review)).
- **Lesson:** the *sound of the payout* (ore) should differ from the sound of the work (dirt). Rewarding a route or plan beats raw volume.

### 10. Idle Slayer (Pablo Leban)
- **Structure:** an auto-runner idle with optional active layers. Players jump to bump boxes and coins, call Rage Mode (worth ~6x soul gain), and play minigame Bonus Stages (silver boxes, Chest Hunt with Mimics, Grapple Run).
- **Expert play:** timing Rage inside another bonus window ([Idle Slayer Wiki, Endgame](https://idleslayer.fandom.com/wiki/Endgame_Strategy); [Steam page](https://store.steampowered.com/app/1353300/Idle_Slayer); [Steam thread](https://steamcommunity.com/app/1353300/discussions/0/3035978213232537410)).
- **Pitfall:** players argue it "isn't really idle", because active play dominates so much. Rated 4.8 from 26K ratings, so the active-heavy approach is popular, but it confuses idle-first players.
- **Lesson:** *stacking windows* (save Rage for a bonus) is the skill ceiling. Short, optional minigames break up monotony.

### 11. Egg, Inc. (Auxbrain): active-spike reference
- **Drones:** they fly over the farm, even when you're in menus. Tap one and it crashes with a payout scaled to your farm's income, sometimes Golden Eggs. Rare fast drones pay more. Late game, drones matter more than tap-to-hatch ([Android Central](https://www.androidcentral.com/tips-and-tricks-egg-inc); [Patashu guide](https://lr.eu.psf.lt/r/EggsInc/wiki/patashu_guide)).
- **Lesson:** a moving target that pays a share of your income stays relevant all game without rebalancing.

### 12. Melvor Idle: the pure idle contrast
- **Mining skill:** actions take 3 s, sped up by pickaxe tiers. Mastery raises rock HP and the chance of double ore. Mastery pool checkpoints cut node respawn time. Gems drop as a side roll on mining ([Melvor wiki mirror, Mining](https://dcmpx.remotevs.com/com/melvoridle/wiki/PL/w/Mining)).
- **Offline:** simulated "with perfect accuracy" and as fast as active play. Active play matters mainly in combat ([Steam](https://steamcommunity.com/app/1267910/discussions/0/3199243752768164004)).
- **Lesson:** a purely idle skill works when the *decisions* (which rock, which mastery, which gear) are the game. Melvor makes no attempt at tap satisfaction. If the Mines keep active play at only about 2x, they compete with Melvor, but without its depth of decisions.

### 13. Minecraft / Terraria: the reference for mining feel
- **Minecraft:** breaking a block means a swing, a repeated thump, crack stages that cover the block, then a pop and the drop. Tool tiers gate the harder ores ([Minecraft Wiki, Breaking](https://minecraft.gamepedia.com/Break)). Players say the swing must match the break, one swing per break ([MC-160995](https://bugs-legacy.mojang.com/browse/MC-160995)).
- **Terraria:** ores read distinctly on the map. The Spelunker Potion makes ore and treasure glow for 5 minutes, turning a whole cave into "where's the good stuff" ([Terraria wiki](https://terraria.wiki.gg/wiki/Spelunker_Potion)).
- **Lesson:** progressive cracks show HP without a bar. A *temporary sight buff* is a satisfying burst of discovery.

### 14. Rhythm references for the Doom Drum

**Crypt of the NecroDancer**
- Every move is on the beat. Missing a beat rarely hurts you directly, but it **resets the Groove Chain coin multiplier** ([Wikipedia](https://en.wikipedia.org/wiki/Crypt_of_the_NecroDancer); [wiki UI](https://crypt-of-the-necrodancer.fandom.com/wiki/File:NecrodancerUI.png)).
- Ryan Clark's fairness rule: a death "should always be your own fault" ([Gameranx interview](https://gameranx.com/features/id/17305/article/crypt-of-the-necrodancer-interview-an-accidental-roguelike-rhythm-game/)).
- Readable enemy patterns (many enemies move every 2nd beat) give room to respond.
- The rhythm came from shortening turn timers until they "felt musical".

**Cadence of Hyrule**
- **Fixed-Beat Mode** removes the beat entirely: enemies move only when you move. Reviewers praise it as an accessibility option for deaf players and for people who struggle with rhythm ([MSPoweruser](https://mspoweruser.com/cadence-of-hyrule-has-a-fixed-beat-mode-for-those-who-lack-rhythm/); [GameSpot](https://gamespot.com/reviews/cadence-of-hyrule-review-groove-is-in-the-heart/1900-6417165/)).

**Hi-Fi Rush (Tango)**
- Every input works however far off the beat it is. Animations are subtly stretched so that hits *land* on the beat anyway. Good timing adds damage and knockback.
- The whole world pulses to the track (plants, pipes, platforms), so the beat is seen everywhere, not only on one UI widget.
- An optional timing gauge is available ([VGC review](https://videogameschronicle.com/review/hi-fi-rush); [TechRadar making-of](https://www.techradar.com/gaming/the-making-of-hi-fi-rush-with-director-john-johanas); [DSOGaming](https://www.dsogaming.com/news/hi-fi-rush-is-a-new-action-game-where-the-world-syncs-to-the-music-from-the-creators-of-evil-within-ghostwire-tokyo/)).
- **This is the most important model for the Doom Drum:** quantize the feel, reward precision, never punish.

**Rhythm Doctor / Rhythm Quest (calibration)**
- Rhythm Doctor calibrates in two phases: first audio/video sync, then a tap test that "mirrors actual gameplay".
- Rhythm Quest's notes:
  - Audio latency is the biggest term, especially on Android. A tap test can't separate input latency from audio or video latency.
  - Schedule audio ahead of time, and don't play sounds on calibration taps.
  - Keep calibration short (a 16-tap test takes ~1 min, which is too long) ([Rhythm Quest devlog 10](https://rhythmquestgame.com/devlog/10.html)).

**Touch rhythm windows (fan-wiki figures, unverified)**
- Arcaea grades MAX PURE ≤25 ms, PURE ≤50 ms, FAR ≤100 ms, then LOST ([Moegirl](https://zh.moegirl.org.cn/en/Arcaea)). The *outer, still-counts* window on a touch-only hardcore game is about ±100 ms.
- A forgiving indie rhythm shooter uses Good = ±30% of the beat interval and Perfect = ±6% ([itch.io dev reply](https://itch.io/post/12021668)).
- Assist options that widen the hit window are now common (Steam app 1585220 discussion).
- **The Mines' ±60 ms base is stricter than Arcaea's FAR window**, on a non-rhythm-game audience, through a PWA.

**Web Audio specifics**
- Schedule beats on `AudioContext.currentTime` (the "tale of two clocks" lookahead pattern) and add `outputLatency` when judging. iOS Safari's output-timestamp APIs have been unreliable, so test on devices ([web.dev](https://web.dev/articles/audio-scheduling); [MDN outputLatency](https://www-igm.univ-mlv.fr/~forax/MDN/developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency.html); [Apple forum](https://developer.apple.com/forums/thread/696356)).

### 15. Game-feel ("juice") references
- **Juice It or Lose It** (Jonasson & Purho, 2012): flash, shake, floating text, sound and particles turned a dull Breakout into a fun one ([summary](https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/); [Bayreuth handout](https://medienwissenschaft.uni-bayreuth.de/wp-content/uploads/GxD-10-Game-Feel.pdf)).
- **Sakurai on hit-stop:** freeze on big hits. Vary the shake and its direction, scale by camera distance, and add a longer "boss stop" on a final blow ([Source Gaming translation](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/); [Nintendo Wire](https://nintendowire.com/news/2022/12/12/this-week-in-sakurai-12-5-12-11-fine-tuning-hit-stop-and-cheating-the-system/)).
- **Practitioner value:** about 50-100 ms of hit-stop.

### Idle-genre theory
- **Pecorella (Kongregate, GDC):** player actions mainly *speed up* growth. Quick check-ins should give a "celebratory moment", and a longer absence should build a stronger pull to return ([Game Developer](https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play); [GDC Europe 2016 slides](https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507)).
- **Alharthi et al., CHI 2018 (66 idle games):** idle games move players "from playing to planning" ([Monash](https://research.monash.edu/en/publications/playing-to-wait-a-taxonomy-of-idle-games/)).

---

## Part 2: Synthesis

### 2.1 Strongest genre best practices

1. **Active value comes in spikes, not as a flat multiplier.** Cookie Clicker's golden cookies (x7 for 77 s, x777 clicks for 13 s), Egg Inc.'s drones, Idle Slayer's Rage (~6x) and Tap Titans' skills all work the same way: the baseline is idle, and rare windows make attention worth 10-1000x. Stacking windows is where skill shows. The Mines' 2.2-2.7x is a flat multiplier, which is the audit's X1 finding.
2. **Timed tests turn a motor task into a challenge.** Clicker Heroes and Tap Titans bosses run on 30 s timers, and failing just bounces you back to farm. Dome Keeper's wave meter makes every dig a bet.
3. **Rocks must differ, and the differences must matter.** SteamWorld Dig, Motherload and Minecraft have ore that *looks and sounds* different from dirt. Terraria's Spelunker turns a scan into a hunt. Picking a target is only a decision when the targets differ (audit M1).
4. **Depth is a journey of new nouns.** Mr. Mine opens whole systems at 300, 700 and 1000 km. Idle Miner Tycoon found that new visual mines fix "every prestige feels the same". Deep Town gives each layer a different resource mix.
5. **Rare finds with rarity tiers and a collection log.** Mr. Mine relics, Tap Titans artifacts and Dome Keeper relics turn every break into a lottery ticket. The collection gives a long-term goal.
6. **Layered juice that escalates.** Cracks show HP, then hit-stop, shake, particles and floating text. The payout sound (ore) differs from the work sound (dirt). Crits and big moments get a longer freeze (Sakurai's "boss stop").
7. **Reward whichever mode the player is in.** Clicker Heroes' combo bonus applies while clicking and its idle bonus applies after ~60 s without input. Tap Titans' Warlord tree is a legitimate idle path. Never punish either mode.
8. **Rhythm that is generous and quantized, with an off switch.** Hi-Fi Rush lets every input work and rewards precision. NecroDancer resets only the bonus multiplier. Cadence offers Fixed-Beat. Rhythm Doctor and Rhythm Quest calibrate quickly with taps that mimic gameplay. Touch games still give ~±100 ms credit.
9. **Sprint and rest.** Dome Keeper calls a round "a few seconds of rest, then go again". Golden-cookie bursts last seconds and arrive every few minutes. Short peaks avoid tap fatigue far better than limiting taps.
10. **Appointments and events.** Idle Miner Tycoon's limited-time event mines and weekly updates. Cookie Clicker's seasons. Pecorella's "the longer away, the stronger the pull to return".

### 2.2 Pitfalls that make clickers boring

- **Identical targets:** when every rock is the same, tapping is pure motor work. Fatigue sets in within ~30 s.
- **Flat percentage upgrades** ("+3.6% damage") that change nothing you do or see. The textbook wall is linear tap growth against exponential HP.
- **Punishing enthusiasm:** soft caps such as the Mines' 8 taps/s at 50% damage feel like the game saying "stop". Cap the *reward*, not the *verb*, and steer players to *spikes* instead.
- **Side activities worth less than the main line:** Super Motherload's puzzles were skipped "because better rewards were always deeper down".
- **Clickable rewards that become chores:** Mr. Mine's chest-opening grind.
- **The best mechanic locked behind the most boring grind:** the Doom Drum behind 0.5% Geode Gems (audit M2).
- **Rhythm without music or with tight windows:** a metronome test. At ±60 ms through PWA touch latency, many players will register as "random". Players feel punished even when the code doesn't punish them.
- **Depth as a number:** without landmarks, depth is just a spreadsheet column.
- **Silence:** idle screens with no sound read as "nothing is happening".
- **Hidden identity:** active players and idle players get the same flat experience, so neither feels served. Idle Slayer shows the opposite failure, where idle-first players feel forced to stay active.

---

## Part 3: Recommendations for The Goblin Mines

All of these fit the 180x320 portrait layout: the 160x160 wall at y 56-216, the 12 px status bar, and HUD/lever rows at 16-48. None of them stops continuous idle progress. They add spikes on top of the idle base, and none of them can be missed or failed in a way that costs banked progress. Costs: S = days, M = 1-2 weeks, L = more.

### R1. The Gold Goblin: a rare clickable spike (Cookie Clicker golden cookie + Egg Inc. drone). Cost: S
- **What it is:**
  - Every 2-6 min while the Mines are on screen, a glinting goblin thief (an 8x10 px sprite) scampers along a ledge, or pops out of a socket carrying a sack, for about 6 s. Tap him to roll an outcome:
    - **Lucky Sack** (60%): lump sum = 90 s of income.
    - **Gold Rush** (30%): rocks drop x7 Nuggets for 20 s, with the wall tinted gold.
    - **Overlord's Fist** (8%): tap damage x77 for 8 s. Every tap one-shots.
    - **Gem Pouch** (2%): 1-2 Gems.
  - Outcomes **stack**, which builds in the Cookie Clicker combo skill.
  - Offline, no goblins spawn. On the return screen, one guaranteed Gold Goblin is waiting.
- **Why:** it fixes X1 with *spikes* rather than a flat multiplier, gives the eye a reason to watch the wall, and creates "save the keg for the Gold Rush" decisions. One sprite, one RNG table, one `earn()` multiplier.
- **Tuning:** spend the sim's "active ratio" budget here. Average uptime stays modest, but the peaks are memorable.

### R2. Fury replaces the soft cap, and taps chain into combos (Clicker Heroes combo, NecroDancer groove chain). Cost: S
- **What it is:**
  - Remove the 8 taps/s half-damage cap, which the proposal already plans. Keep the 15 hits/s hard cap.
  - **Fury meter:** fast taps fill it. At full it unleashes 3 s of x2 with a red tint and a goblin war-shriek.
  - **Break Chain:** breaking a rock within 1.2 s of the last break raises a visible chain counter in the 12 px status bar (x1.1, x1.2 ... up to x2 on Nuggets). The chain decays by one step per idle second; it doesn't reset. The pitch of the break sound rises a semitone per chain step.
- **Why:** it rewards enthusiasm instead of punishing it, and gives a *route* skill. Pick cracked and low-HP rocks to keep the chain alive, which makes the goblin-cracked rocks a real target choice (audit M1).

### R3. Rocks you can read and choose between (SteamWorld Dig / Minecraft / Terraria; Fortnite's harvesting weak-point, uncited). Cost: S-M
- **What it is:** make about a third of the wall "interesting" at any moment, not 10%.
  - **Weak spot:** each rock above 3 taps shows a 3x3 px glint at a random corner, which moves after each hit. A tap that lands on it is a "CRACK!" for x3. This is a precision-tap skill that doesn't need rhythm. Size the hitbox generously, at the whole quadrant of the 32 px tile.
  - **Raise special-rock density by depth:** Veins 8% → 15%, add **Fragile clusters** (rocks that break together when one breaks), and bring the stratum behaviours (magnet, mirror, hot, hollow) up from 5% to 15-20%.
  - **Distinct sounds:** each special rock gets its own break sound. Ore should "ching", while dirt "thuds" (SteamWorld Dig's satisfying drill-on-ore sound).
  - **Progressive crack sprites:** 3 stages, so HP reads without a bar (Minecraft).
- **Why:** it answers M1 directly. "Which rock?" becomes a real question, and tapping gains an aim component that fits a thumb on a 32 px tile.

### R4. Doom Drum on day one, done like Hi-Fi Rush. Cost: S-M
- **What it is:** this extends the proposal's Q3 with the evidence above.
  - **Grant it free at depth 3.** Keep the Gem nodes as later upgrades.
  - **Music bed per stratum:** a 4-bar war-chant loop scheduled on `AudioContext.currentTime` with lookahead. The drum hit *is* the beat.
  - **Graded windows:** Perfect ±50 ms (x2.5), Good ±120 ms (x2), and anything outside counts as a normal tap. That is about Arcaea's FAR tolerance, which suits a casual audience. Wide Swing widens Good to ±160 ms.
  - **Quantized feel (Hi-Fi Rush):** an off-beat tap's crack and shake are delayed to the next 1/8 subdivision when that is under 60 ms away, so the wall always *looks* in time.
  - **Silent auto-calibration:** keep a running median of signed offsets over the last 16 judged taps, and nudge the offset by 25% of that median per beat, clamped to ±150 ms. Rhythm Doctor and Rhythm Quest suggest a one-screen tap test under 10 s as a manual override. Never play a tap sound in calibration.
  - **Early/Late hint (Arcaea):** a 1 px tick left or right of the beat lamp.
  - **Streak, NecroDancer-style but softer:** a miss drops the streak multiplier by one tier rather than to zero, which matches the spec's "nothing lost" ethos.
  - **The whole cave pulses (Hi-Fi Rush):** torches flicker, goblins bob, and dust falls on the beat. The cue is the world, not only thin rings.
  - **Accessibility:** keep Steady Drum. Add a Fixed-Beat-style "Drum follows you" mode (Cadence): the beat lands on your tap if you are within ±250 ms, for deaf players and players without rhythm.
- **Why:** the department's one original idea becomes its first-hour signature (M2). Test on real iPhones, because iOS PWA audio latency varies.

### R5. Depth landmarks: a Heartstone boss every 5 depths, and a shaft reveal (Clicker Heroes/Tap Titans bosses, Mr. Mine milestones, Idle Miner new mines). Cost: M
- **What it is:**
  - **The boss:** on reaching a depth that is a multiple of 5, the wall clears and a 2x2 **Heartstone**, the spec's Motherlode rock, spawns with a 30 s timer and a bar in the status row. Goblins swarm it. If you beat it, max depth unlocks, along with a chest (R6) and a burst of Nuggets. If time runs out, it crumbles to rubble and you can retry right away. Nothing is lost.
  - **Offline/idle:** idle progress never depends on it. Below the landmark, depth progress pauses while above it continues, which is the Clicker Heroes bounce-back.
  - **Stratum transitions every 10 depths:** a 1.5 s vertical "shaft drop", where the wall scrolls up and the new stratum's palette slides in from below. Add a one-line arrival card ("IRON DEEPS: magnet rocks pull lightning") and a new music layer.
  - **One new system per stratum** (Mr. Mine pattern), e.g. Stone: Sappers; Iron: Gold Goblin rarity up; Crystal: the Gem Forge; Magma: hot-rock chains; Abyss: relic excavations.
- **Why:** it fixes M3. "DIG D15" becomes "beat the Stone Heart", and a timed test gives tapping stakes without punishment.

### R6. Relics and a Finds Codex: rare discoveries with rarity tiers (Mr. Mine relics, Tap Titans artifacts, Dome Keeper relics). Cost: M
- **What it is:**
  - Any break has a tiny chance (about 1 in 400, raised by a Prospector or a Spelunker-style "Lantern Flare" active skill) to pop a **Find**.
  - Finds are stratum-specific, about 6 per stratum: a fossil, a dead hero's helmet, a goblin idol and so on. Each gets a 16x16 px sprite on a reveal card with a rarity colour.
  - Each Find gives a small *permanent* behavioural perk: "Kegs blast 4x4", "Gold Goblin stays 2 s longer", "Weak spot is bigger".
  - Duplicates level the Find up.
  - Finds persist through the Fall, in a Codex that shows the outlines of unfound items.
- **Why:** variable reward at the moment of reveal, a long-term collection goal, and upgrades that change what you *do* (audit X2). The perks give each Fall cycle new combinations.

### R7. Juice pass: the gauntlet should feel heavy (Juice It or Lose It, Sakurai's hit-stop, SteamWorld Dig sound). Cost: S
- **What it is:**
  - **Hit-stop:** 2 frames (~33 ms) on a normal break, 4-5 frames on a crit or weak-spot hit, 8 frames plus a white flash on a Heartstone kill ("boss stop").
  - **Shake:** 1 px screen shake on crits only, so it keeps its meaning. Shake direction follows the tap position.
  - **Pickup:** Nuggets arc to the HUD counter with a rising pitch when collected quickly.
  - **Haptics:** crunchy taps on crits, using the proposal's iOS touch-handler haptic trick.
  - **Idle sound:** goblin breaks make quiet "tik" sounds, so the idle screen isn't silent (audit X3).
  - **Break sound:** pitched by rock type (R3) and chain level (R2).
- **Why:** cheap, and it multiplies every other change. At 180x320 the feedback has to come from 1-2 px motion, palette flashes and sound rather than big particles.

### R8. Gauntlet milestones that change a verb, not just a number (Tap Titans skills, Clicker Heroes build identity). Cost: S-M
- **What it is:** every 25 Tap Damage levels, the existing sprite milestone, offers a pick of 1 from 2 **gauntlet mods** for this cycle:
  - Pierce: a tap also hits the rock behind, in the same column.
  - Shockwave: a break deals 20% damage to neighbours.
  - Magnet Fist: Nuggets from adjacent breaks double.
  - Keg Kicker: tapping a lit keg throws it to the rock you tap next.
  - Tempo Fist: Beat Hits chain lightning.
  - Idle Crown: goblins get +30%, while taps get nothing extra. This is the idle player's pick, like Tap Titans' Warlord path.
- **Why:** this is a meaningful choice that changes play, gives "let me try it" curiosity after a purchase (X2), and serves active and idle players explicitly.

### R9. Appointments: the Overnight Seam and event shafts (Idle Miner Tycoon event mines, Pecorella's return pull). Cost: S (Seam) / M (events)
- **What it is:**
  - **Overnight Seam:** while you're away, goblins "uncover" a seam that scales with time away. Below 1 h it's a single vein. At 4 h it's a Heartstone-lite with a 20 s smash minigame. At 8 h it's a full-wall Motherlode plus a guaranteed Find roll. This differentiates 2 h from 8 h returns (audit X5), and the return payoff is a moment of *play*, not just a toast.
  - **Later:** a weekend "Cursed Shaft" event, a seeded short mine with its own Finds (Idle Miner Tycoon event mines).
- **Why:** it creates reasons to come back at a specific time. The celebratory check-in becomes active and tactile.

### Suggested order
1. R7 (juice), R2 (Fury/chain) and R1 (Gold Goblin): all S, and they change the feel of the first minute.
2. R4 (Drum day one) and R3 (readable rocks).
3. R5 (landmarks) and R6 (Finds).
4. R8 and R9.

Re-band the sim's active:idle target toward *peak* windows (spikes worth 7-77x for seconds) rather than raising the flat average.
