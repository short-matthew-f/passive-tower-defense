# Idle / incremental meta: what keeps players coming back, and what that means for Overlord

Research brief for the Overlord meta (Throne Room, Tribute, Dread/Falls, Goods, Edicts, managers, Gobbo's report). It targets the user's complaint, "I kinda forget to play or care about it" (4/10). It was written after reading `/home/user/fun-review/proposal.md` and `raw/retention.md`, `raw/pacing.md`, `raw/meta.md`, plus spec 00 §1 (pillars) and §7 (offline rules).

**How to read this.** The fun-review proposal already covers a lot: the Next Goal ribbon, report CTA, Legend rosters, Dawn Ambush, Shifts/Reputation, Raven Post push, Today's Focus, relic drafts and the living lair. This document (a) checks those ideas against the genre and the literature, and (b) looks for what the proposal **doesn't** cover yet. Recommendations in §5 say whether each one is *new*, *extends* a proposal item, or *endorses* one.

**Source note.** Sources are cited inline as URLs. The web-search budget ran out partway through, so some per-game details (Trimps, Leaf Blower Revolution, Unnamed Space Idle, Revolution Idle, and some specifics of Antimatter Dimensions, NGU Idle and Idleon) come from general genre knowledge, not from a page fetched for this brief. Those are marked **[gk]**. Treat them as well-known community facts, not as citations.

---

## 0. The short version

1. **The best idle games end every session with a plan the player chose, and the game holds that plan.** Idleon assigns each character an AFK job, Melvor has one skill running, Egg Inc sends rockets on 4-72 h missions, and NGU lets you pick your rebirth length. Coming back means "see how my plan went". Overlord has no "what should happen while I'm away" decision. Things just accrue. This is the biggest gap the proposal doesn't name. (Alharthi et al., CHI 2018: idle games "move players from playing to planning".)
2. **Prestige that matters changes *how* you play.** It automates the old chore, opens a new verb or system, or makes you choose a style (Antimatter Dimensions' Active/Passive/Idle study paths, Realm Grinder factions). It doesn't just multiply.
3. **Unfolding beats showing everything.** A Dark Room, Paperclips and Kittens hide the UI and reveal systems as "paradigm shifts". Designers describe each shift as a story beat (Spiel et al., CHI PLAY 2019). Overlord shows six locked doors with prices, 15 currencies and the "INF %" jargon from minute one.
4. **Return hooks that work are anticipation you can see, not obligation.** Sugar lumps, seasons, contract timers and silhouettes all qualify. Short offline caps are a known cause of churn (Pecorella on Egg Inc's 2 h cap).
5. **Hubs make many systems feel like one game when the outputs of the parts feed one visible shared thing,** such as Idleon's characters, Melvor's Township, Rhythm Heaven's remixes or Egg Inc's rockets. A sheet of +% rows doesn't do it.
6. **On iOS, re-engagement only reaches an installed home-screen PWA, and every timed ping needs a server.** **Declarative Web Push (iOS 18.4+)** is new and makes the proposal's B2 simpler: the push payload can carry `app_badge`, so the stale-badge problem goes away, and no service-worker push handler is required.

---

## 1. Game-by-game notes

For each game: return hooks · how prestige changes play · how it unfolds · next-goal visibility · fantasy · hub/connection · why people stop.

### Cookie Clicker (Orteil, 2013-)
- **Return hooks.** *Sugar lumps* form over about 24 h once you've baked 1 billion cookies. They level buildings, and spending one on certain buildings unlocks a minigame (https://en.wikipedia.org/wiki/Cookie_Clicker). That's a once-a-day reason to look that never punishes you, because a ripe lump drops on its own and you don't have to be there **[gk]**. *Seasons* run on real dates (Halloween, Christmas, Valentine's, Easter, Business Day). They add collectible cookies and upgrades, and you can only finish the set across years or with a paid season switcher **[gk; seasons existence: Wikipedia]**.
- **Presence reward.** *Golden cookies* appear at random, fade in seconds, and grant a temporary boost (Wikipedia). It's a variable reward for watching. It also teaches you that being present sometimes pays a lot.
- **Prestige.** Ascension trades a run for heavenly chips: +1% per prestige level plus a tree of upgrades. Many of those upgrades are qualitative (keep a % of golden cookie upgrades, unlock seasons permanently, start with buildings) **[gk]**. The next prestige level costs the cube of the current level (Wikipedia), so each ascension takes longer, and that's what pushes you into the minigames.
- **Unfolding.** Minigames (Garden, Pantheon, Grimoire, Stock Market) are gated behind lumps. New *kinds* of play arrive late, at about the point the base loop goes stale.
- **Next goal.** Building and upgrade tooltips show cost and time to afford. IGN praised how it "builds anticipation for each major milestone" (Wikipedia).
- **Why people stop.** Number blindness once growth gets absurd, and achievements left that depend on luck. Deterding calls what keeps people going "enlightened existential spite" (Wikipedia).

### Antimatter Dimensions (Hevipelle, 2016-; Reality update 2021) [mostly gk]
- **Prestige changes play, layer after layer.** Dimension Boosts, then Galaxies, then **Infinity** at 1.8e308 antimatter, then **Eternity** at 1.8e308 IP (https://antimatterdimensions.wiki.gg/wiki/Eternity), then **Reality**, then the Celestials. Each layer adds a new currency, a new tab and a new reset rule, and keeps some progress (https://antimatterdimensions.wiki.gg/wiki/Eternity, https://antimatterdimensions.wiki.gg/wiki/Replicanti).
- **Automation is a prestige reward.** Infinity challenges unlock autobuyers. Eternity milestones keep those autobuyers and automate Infinity crunches. Reality adds a scripting Automator. Every new layer **takes the last layer's chores away** and gives you new decisions in their place. That's why a reset feels like a promotion, not a rerun.
- **Choices of style.** The Time Study tree has mutually exclusive paths, including *Active / Passive / Idle* branches. You pick a build that suits how you play this week. Reality draws **Glyphs**, random equipment with a pick-1-of-N choice at each Reality.
- **Unfolding and narrative.** Tabs appear only when they're relevant. The Celestials are characters with dialogue, each a themed restricted run that tells a small story.
- **Next goal.** A persistent progress bar to the next reset ("to Infinity: x%"), with challenge goals listed.
- **Why people stop.** Long late-game walls, where "wait days for a number" can take a week. The community answers with guides and patience. Casual players often stop at Eternity or Reality.

### Universal Paperclips (Frank Lantz, 2017)
- **Unfolding as story.** It starts with one button, then automation, then the reveal that you're an AI, then market domination, then Earth conversion, then space probes and Drifters. New mechanics appear at milestones, and an activity log carries "occasional unsettling AI thoughts" (https://en.wikipedia.org/wiki/Universal_Paperclips).
- **Three acts with a defined ending.** Lantz: "I wanted it to be complete in that sense… a start, a middle and an end and have a dramatic arc and then at the end, it's done and it lets you go." Each act is "delineated by a complete shift in interface paradigms" (Spiel et al., CHI PLAY '19, https://par.nsf.gov/biblio/10174274).
- **Rhythm and twist.** Lantz: "you establish a rhythm, establish a pattern and you throw in a twist and then you're just doing variations on that" (same paper). Naomi Clark compares its bursts of acceleration to a bingeable TV show (https://gamesbeat.com/this-clicker-game-lets-you-take-over-the-world-with-paper-clips/).
- **Why people stop.** Some players drift once it feels aimless. One essay wanted "to win the game", not "gain paperclips without a purpose" (https://criticalvideogamestudies.com/at-what-point-do-we-stop-playing-idle-games/). The ending answers that.

### A Dark Room (Michael Townsend, 2013; iOS by Amir Rajan)
- **Unfolding.** "The fire is dead. The room is freezing." You start with one action, tending the fire, and the game then opens gathering, a stranger, a village, then a world map (https://en.wikipedia.org/wiki/A_Dark_Room). The interface stays spare, and new elements appear as you gain experience. Combat starts as punching and adds weapons later (https://informit.com/articles/article.aspx?p=2228802).
- **Fantasy.** Its story is told through environmental cues, not exposition (Wikipedia). Critics argue its incremental systems *are* the narrative progression, so every action reads as meaningful (https://mechanicsofmagic.com/2026/05/13/critical-play-a-dark-room/). The New Yorker called it "a puzzle composed of deconstructed to-do lists" (Wikipedia).
- **Ending.** A surprise ending (Engadget, via Wikipedia). Its weakness is that minimalism can feel empty over time (Mechanics of Magic).

### Kittens Game (bloodrizer, 2014-)
- **Layering.** Lantz on Kittens: "the layering on of new systems. You're learning a thing… and then they introduce a whole new system… how this new system fits into the existing economy… should change my decision making" (Spiel et al.). bloodrizer on revelation: "That initial surprise of finding a first presence of something looming and big… 'OH MY GOD, YOU GOTTA BE KIDDING ME' is pure gold" (same paper).
- **Cognitive offloading.** Tooltips say how long until something is affordable (Alharthi et al., CHI 2018, https://par.nsf.gov/biblio/10061230). That's the evidence behind Overlord's proposed Next Goal ribbon.
- **Prestige.** Reset for paragon and Metaphysics upgrades. Later resets open whole systems (religion, space, time) **[gk]**.

### Melvor Idle (Games by Malcs, 2019-)
- **The plan is the session.** You run one skill (or combat) at a time **[gk]**, so closing the app is a decision: "Woodcutting Yew overnight". Offline progress is simulated tick by tick, up to about 24 h (player report, https://steamcommunity.com/app/1267910/discussions/0/591762563949134719).
- **Offline report.** An itemised "while you were away" summary of items and XP/levels gained **[gk]**. Every line is a small win (also noted in raw/retention.md P3).
- **Hub of skills.** Skills feed each other: logs go to Firemaking and Fletching, ore to Smithing, fish to Cooking, all of it to combat and Township. A 24-skill suite feels like one economy because the outputs are *inputs elsewhere that you want*.
- **Pacing.** Players praise it as "a very slow burn" with an endgame payoff (r/incremental_games thread, https://libreddit.neb.cx/r/incremental_games/comments/1epowcl/what_makes_an_idle_game_fun/lhnbro9/?context=3).

### Legends of Idleon (LavaFlame2, 2021-)
- **Persistent characters are what you care about.** You get more character slots as you level, and you split characters into roles across worlds. The game "progresses even when you're not playing, and accelerates when you are" (https://www.gsmgotech.com/2025/12/the-idle-mmo-phenomenon-how-legends-of.html). One fan: "Can't wait to check in again tomorrow" (https://mein-mmo.de/legends-of-idleon-auf-steam/).
- **Many timers that finish.** AFK gains per character, refinery cycles, crops, and arcade balls that build up **[gk]**. Every check-in has something done and a decision attached, which is the "unfinished business" pull.
- **Worlds as a hub.** Each world adds a new skill and system that consumes earlier worlds' outputs **[gk]**.
- **Why people stop.** A steep learning curve and "a user interface that can feel cluttered once you're managing a dozen or more characters" (gsmgotech). Breadth turns into overload, the same risk Overlord's seven departments carry.

### Egg, Inc. (Auxbrain, 2016-)
- **Felt offline window.** Grain silos let the farm run alone for longer (https://en.wikipedia.org/wiki/Egg,_Inc.). Away time is a *visible structure* you upgrade (https://egg-inc.fandom.com/wiki/Grain_Silo).
- **A known churn cause.** Pecorella (who produced AdVenture Capitalist mobile) calls Egg Inc's two-hour offline cap "a probable mistake… a major reason he stopped playing" (Quest for Progress, GDC Europe 2016, https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507).
- **Random presence rewards.** A delivery truck and drones flying across the screen pay money or golden eggs when tapped (Wikipedia).
- **Timers you choose.** Rockets go on missions of hours to days and return with artifacts **[gk]**. Contracts give time-limited egg goals, solo or co-op, with standard and elite tiers (https://egg-inc.fandom.com/wiki/Contracts?oldid=9822). The appointment is one *you* started.
- **Prestige.** Soul eggs come from farm value, with permanent epic research. A new egg type means a new farm look and higher value (Wikipedia).
- **Why people stop.** Co-op pressure ("joining groups of tryhard players every time there is a contract", https://lr.eu.psf.lt/r/EggsInc/comments/1ibyulr/im_disappointed) and the short early offline window.

### AdVenture Capitalist (Hyper Hippo / Kongregate, 2014-)
- It popularised offline earnings: "the player continues to progress even when they are completely offline… the longer you're away from the game, the greater your incentive to return" (Pecorella, https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play; also https://en.wikipedia.org/wiki/Incremental_game).
- **Managers** automate businesses: automation is the early reward. **Angel** prestige multiplies everything. Moon and Mars are new economies, which make prestige feel like new places. Limited-time **events** with their own themed economy and a countdown **[gk]** create novelty in a fixed window.
- **Why people stop.** Pure multiplier prestige: once the loop is solved, each reset is the same, minus the novelty of events.

### Realm Grinder (Divine Games, 2015-)
- **Prestige changes play.** You pick a faction for each abdication (good, evil or neutral alignments, each with its own buildings, spells and upgrades). Players report "new mechanics every other Reincarnation: at R2 Challenges, at R3 Mercs, then Research, Bloodlines, Dragons" (https://steamcommunity.com/app/610080/discussions/0/1696040635906323199). Research opens around R16 and is capped by your Reincarnations (https://realm-grinder.fandom.com/wiki/Research). There are three nested prestige layers: abdicate, reincarnate, ascend (https://en.wikipedia.org/wiki/Incremental_game).
- **Lesson.** The choice at reset ("this cycle I'm Undead") makes each run different, and the drip of new systems across resets keeps a long tail interesting.

### NGU Idle (4G, 2018-) [mostly gk]
- **Unfolding.** It's built as one long reveal of joke-named systems (Adventure, Augments, Time Machine, Blood Magic, Wandoos, NGUs, Yggdrasil, Beards, Diggers, Hacks, Wishes). The next system always shows as a locked tab with its requirement.
- **Return hooks.** A *daily spin* (seeded; one missed spin banks for free, more with a purchase) (https://steamcommunity.com/app/1147690/discussions/0/3074244288342873968). *Yggdrasil fruits* ripen on long timers and reward periodic harvests.
- **You choose the cycle length.** Rebirths can be 3 minutes or 3 days. You fit the reset rhythm to your life.

### Clicker Heroes (Playsaurus, 2014)
- Offline progress has "no strict time limit" and runs until idle DPS stalls (https://blog.clickerheroes.com/offline-progression-in-clicker-heroes/). Active and idle builds are separate valid strategies chosen through Ancients **[gk]**. It was an early pioneer of mobile prestige (Wikipedia, Incremental game).

### Idle Slayer, Leaf Blower Revolution, Trimps, Unnamed Space Idle, Revolution Idle [gk]
- **Idle Slayer.** An auto-runner with random *chest hunts* and *bonus stages* triggered by in-run pickups, daily and weekly quests, and ascension trees. A presence reward plus a daily structure.
- **Leaf Blower Revolution.** Content-dense, with dozens of currencies and secret areas. Discovery itself is the reward, and scheduled community events add limited cosmetics.
- **Trimps.** A slow story of a stranded survivor with map runs and prestige "portals". Challenge runs (prestige with a rule twist) carry the late game.
- **Unnamed Space Idle and Revolution Idle.** Modern mobile/Steam idles built on short loops and visible milestone lists. Revolution Idle's whole screen is a list of next milestones and their multipliers, so the next goal is always on screen.

### Multi-minigame hubs: Rhythm Heaven and WarioWare
- **Rhythm Heaven.** Sets of 4-6 one- to two-minute games, each set closed by a **Remix that combines the set's games** into one run. Later remixes pull from the whole collection. A *Superb* earns a medal, and **Perfect Campaigns** are drawn at random from your Superb stages, with three attempts and a gift (https://en.wikipedia.org/wiki/Rhythm_Heaven). Variety connects when a mode *uses all the parts together* and when mastery in one part gets called back later.
- **WarioWare.** Microgames are grouped by host character, and each stage ends in a longer **boss microgame** that restores a life. Tempo rises as you go, and late stages remix earlier games (https://en.wikipedia.org/wiki/WarioWare). Characters give each group its identity. The mixed stages make the parts feel like one game.

---

## 2. Design literature and practitioner consensus

| Source | Key point | Relevance to Overlord |
|---|---|---|
| Pecorella, *Idle Games: The Mechanics and Monetization of Self-Playing Games*, GDC 2015 (https://gdcvault.com/play/1022065/Idle-Games-The-Mechanics-and) and press (https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play) | "Constant positive growth and feedback". A "quick check-in… allows you to advance much more quickly by shifting up the growth curve". It's a "natural energy system without the need for an energy currency". | Overlord's check-ins don't visibly shift the curve (~3% of a cycle per 10 min, per pacing.md P3). |
| Pecorella, *Quest for Progress*, GDC Europe 2016 (https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507) | Reset when the gain is about +50-200% in prestige currency. Early progress after a reset should be fast, and each cycle should go "noticeably farther". Active skills on 5 min to multi-hour cooldowns shape rhythm. Idle players are driven mainly by **completion and power** (Quantic Foundry). Egg Inc's 2 h cap was "a major reason he stopped". | Supports A4 (24 h cap), A7 (a collection to complete), and a cooldown "Overlord power" as a return rhythm (R11). |
| Kongregate, *The Math of Idle Games* I-III (https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii) | Costs outgrow value, so multipliers provide "bumps and local victories". Keep old generators relevant. | Milestone bumps inside a cycle answer the 85-99% Infamy plateau. |
| Alharthi et al., *Playing to Wait: A Taxonomy of Idle Games*, CHI 2018 (https://par.nsf.gov/biblio/10061230) | Idle games balance "rules that encourage players to leave… and rules that reward them for returning". They "move players from playing to planning". Players "must remember plans between sessions"; **queuing mechanics** and time-to-afford tooltips offload that. Idlers "do not penalize the player by demanding attention". | Overlord has no plan to make at close and nothing queued (R1, R2). Pillar 3 ("nothing banked is lost") fits the genre. |
| Spiel et al., *"It Started as a Joke": On the Design of Idle Games*, CHI PLAY 2019 (https://par.nsf.gov/biblio/10174274) | Six designers interviewed (Lantz, bloodrizer, Fredricksen, Bogost and others). Progress is a **narrative told through "paradigm shifts"**, and every system change is "a new beat". Rising costs create "systemic suspense". Several designers want **endings** that let players stop: "it's okay, you can stop playing now" (Jake Hollands). Designers worry about addiction and favour care over exploitation. | Supports unfolding (R6), a finite campaign (R7), and the proposal's no-streak-guilt stance. |
| r/incremental_games, "what makes an idle game fun" (2024, https://libreddit.neb.cx/r/incremental_games/comments/1epowcl/what_makes_an_idle_game_fun/lhnbro9/?context=3) | Players dislike returning to a "huge stockpile of upgrade currency" that turns the session into "a chore of catching up". They like setting goals "hours or days away". Don't add things "just for the sake of it". | Gobbo's report should turn the pile into 1-3 decisions, not 30 buys (proposal A3). |
| Goal-gradient effect (Kivetz, Urminsky & Zheng 2006, *J. Marketing Research*, https://doi.org/10.1509/jmkr.43.1.39) | Effort speeds up as a goal gets closer, and an illusion of progress helps too. | The log-scaled Infamy bar does the opposite: it crawls near the goal (proposal A5 fixes it). |

**Practitioner consensus, distilled** (the sources above, plus long-running r/incremental_games norms **[gk]**):
- Reveal new *kinds* of things regularly. A new number isn't content.
- Give offline progress generously (8 h feels stingy; 24 h is the norm in Melvor-like games). Don't punish absence, but do reward presence a little.
- Let the player *set up* their next session: queues, assignments, timers.
- Make prestige fast to recover from and qualitatively new, and automate what came before.
- Always show the next goal and roughly when it lands.
- Give the player an ending or a destination, and respect their time (no FOMO streaks).

---

## 3. Why players forget idle games, and how the best ones prevent it

| Why they forget | What the best games do | Overlord today |
|---|---|---|
| **No plan held over.** The player closes the app with no intention and no stake in what happens next. | Melvor (one skill running), Idleon (each character assigned), Egg Inc (rocket ETA), NGU (a chosen rebirth length). The player leaves *with* an outcome to check. | Departments accrue on their own and the player makes no choice at close. |
| **The return is the same every time.** Nothing is different, so there's no curiosity. | Melvor's itemised loot, golden cookies, Egg Inc drones and gifts, NGU spin. | Identical 10 h and 3-day reports (retention.md P2). Sack and headline are proposed (A3). |
| **Absence wastes value silently.** A short cap trains "why bother". | Melvor ~24 h, Clicker Heroes uncapped. Egg Inc's 2 h cap drove Pecorella away. | 8 h base cap, and Infamy never advances offline, so a forgetful player gets 0 Falls in 7 days (pacing.md). |
| **No visible next horizon.** | Locked tabs with requirements (NGU, AD), silhouettes, AD's progress-to-Infinity bar, Revolution Idle's milestone list. | Black doors and a log bar. Proposed: ribbon, rosters, road (A3, A7). |
| **Prestige is a rerun.** | AD, Realm Grinder, Cookie Clicker: each reset brings automation, choice or a new system. | Falls buy +% rows and the same Legend comes back (proposed B5). |
| **Overload and chores.** Too many parallel timers feel like an inbox. | Idleon's main criticism is clutter. Melvor runs one thing at a time. Rhythm Heaven groups games into sets. | Seven templated departments (proposed B3 Today's Focus). |
| **No destination, no story.** | Paperclips and A Dark Room end, AD's Celestials have arcs, Hollands wants "an ending as a milestone". | No arc. Aurelia is "later" in the proposal. |
| **Nothing outside the app.** | Native idles push ("silos full", "contract ending"). Cookie Clicker on web relies on habit and seasons. | No push, badge or scheduled hook. The PWA could, once installed (B2). |

The best ones have one thing in common: **the player's own decision is what's waiting for them.** A notification or badge only works if it points at something the player set up and cares about. Otherwise it gets switched off, which is the proposal skeptic's point too ("push alone just reminds you about a 4/10 game").

---

## 4. iOS PWA re-engagement: what exists and its limits

| Tool | Status on iOS | Limits |
|---|---|---|
| **Web Push** | iOS/iPadOS 16.4+, **Home Screen web apps only**. The manifest needs `display: standalone` or `fullscreen` (https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). | Permission must come from a **direct user tap** inside the installed app. Notifications follow Focus modes, which sync by manifest `id`. Uses APNs, so the server must allow `*.push.apple.com`. No developer account needed. |
| **Declarative Web Push** (new) | iOS/iPadOS **18.4+** Home Screen web apps, plus macOS Safari 18.5 (https://webkit.org/blog/16535/meet-declarative-web-push/, https://webkit.org/blog/16574/). | The payload is JSON with `"web_push": 8030`, a `notification` with a required `title`, and a required `navigate` URL. An optional `"app_badge": "N"` sets the icon badge. **No service worker is needed to display it.** A SW can still modify the notification and falls back to the declarative content if its script fails. It's always user-visible (no silent push). Subscriptions survive ITP removing the SW. `window.pushManager.subscribe({userVisibleOnly:true, applicationServerKey})`. |
| **Badging API** (`navigator.setAppBadge`) | iOS 16.4+ Home Screen apps. Permission comes with notification permission (WebKit 13878). | Can be set in the foreground or inside a push event. Nothing updates it while the app is closed, **unless** a push arrives. With Declarative Push, the `app_badge` field updates it from the server. |
| **Local scheduled notifications** | **None.** The Notification Triggers API was abandoned after a Chrome origin trial, and Safari doesn't support Periodic Background Sync **[gk]**. | Every timed ping needs a server (cron + subscription store + VAPID). |
| **EU** | In early 2024 Apple announced it would remove Home Screen web apps in the EU under the DMA, then reversed that in March 2024 **[gk]**. | Worth knowing; it's not a current blocker. |

**What this changes in the proposal's B2 (Raven Post).** B2 says to switch `vite-plugin-pwa` to `injectManifest` so the SW can handle `push` and `notificationclick`, and to let the SW set the badge. On iOS 18.4+, a **declarative payload** (title, body, `navigate: "/?src=push&evt=legend"`, `app_badge`) displays and badges with **no SW push code**. Keep a small `push` handler only for Android and Chrome, which need it, or keep `generateSW` and add a tiny `importScripts` push handler. The server half (Cloudflare Worker + cron + KV + VAPID + payload encryption) is unchanged: Declarative Push removes client work, not the need to schedule.

---

## 5. Recommendations for Overlord's meta (11)

Ordered by impact on "forget to play / don't care". Costs: S ≈ ≤2 days, M ≈ ≤1-2 weeks, L ≈ more.

### R1. Night Orders: leave with a plan (new; the biggest gap)
- **What.** When the app is hidden, or from a "Before you go…" button in the Throne Room, each open department's manager offers **2-3 orders for while you're away**. For example, Cauldron: *Brew Goods* (more Goods), *Hoard Bile* (more local currency), or *Bait the Legend* (offline earnings count toward the economy gate). Mines: *Dig deep* (rare-find rolls) or *Haul* (income). The default is the last order, so it takes zero taps. Gobbo's report then opens with **the results of your orders** ("You told Gritch to dig deep: 2 Moon Opals, a Legend's footprint").
- **Why.** Alharthi et al.: idle games move players "from playing to planning", and the game should hold the plan (queuing). Melvor, Idleon and NGU all make closing the app a decision. That's the Hook model's "investment" step, which is missing from the proposal. It also gives forgetful players a legitimate way into Falls without breaking pillar 7: *Bait the Legend* is an explicit choice, not passive absence.
- **Source games.** Melvor (one active skill), Idleon (character assignments), Egg Inc (choose boosts before leaving).
- **Cost.** S-M. It's a per-department enum that shifts existing `idleRate` weights and offline gate credit. The report line comes from data.

### R2. Gobbo's Expeditions: timers the player starts (new; gives Goods a purpose)
- **What.** In the Throne Room, send Gobbo's raiders to a Kingdom village on a **1 h / 4 h / 8 h / 24 h** expedition. The cost is Goods: crates are physically loaded, using the porters from B4. They return with a Legend lead (reveals the next silhouette's name), a relic shard, a cosmetic, Tribute, or Goods of another type. Longer trips pay better per hour, so the bedtime 8 h trip is the natural choice. Show the ETA on the door and in the Next Goal ribbon. It's also the best push trigger: "Gobbo's back from Millbrook with loot."
- **Why.** The proposal plans to cut the Goods import sheet and leave Goods as Decree rewards. An expedition gives the cross-department output a **visible, wanted sink** (the Melvor/Township principle), and it creates an appointment the player chose. That kind lands as service, not nag (Egg Inc rockets).
- **Source games.** Egg Inc rockets, Idleon AFK/refinery, Melvor Township, AdCap events.
- **Cost.** M (a timer model, a loot table, a hub UI, porter art optional).

### R3. Falls automate the chore and open a verb (extends B5)
- **What.** Give each department a fixed **Fall track** next to the relic draft. Fall 1 automates that department's lowest-decision chore permanently: auto-collect, auto-buy the cheapest +% rows (the Steward, scoped to *one* department), auto-raise the dial to the last-beaten level. Fall 2 opens a new verb or rule (the proposal's "THE SECOND CHUTE"). Fall 3 opens a challenge Shift variant with a twist rule. Announce the next track item on the Legend card ("Defeat her: Granny buys her own ladles").
- **Why.** Antimatter Dimensions and AdCap make each reset feel like a promotion by **taking chores away and adding decisions**. Overlord's Falls rebuy the same tree. The proposal cuts the Steward because it "automates the only decisions left". Granting automation as a Fall reward, for the *boring* rows only, keeps the decisions and removes busywork.
- **Source games.** Antimatter Dimensions (milestones, autobuyers), AdCap (managers), Realm Grinder (a new system every other reincarnation).
- **Cost.** S-M (data per department, reusing Steward code).

### R4. Choose a style at each Fall: Doctrine (extends B5)
- **What.** When a Fall is taken, pick one of three **Doctrines** for that department's next cycle: *Tyrant* (active play pays x2, idle x0.8), *Schemer* (offline pays x1.3 and Night Orders get a 3rd slot) or *Zealot* (double Legend odds and relic choice, slower economy). It's a lighter cousin of the relic draft, and it ships for all seven departments because it's numbers only.
- **Why.** AD's Active/Passive/Idle study paths and Clicker Heroes' idle vs active builds let the player **fit the game to this week's life**. A busy week calls for Schemer, and the game no longer punishes it. Realm Grinder's faction choice makes each cycle different with no new content.
- **Source games.** Antimatter Dimensions, Realm Grinder, Clicker Heroes.
- **Cost.** S.

### R5. Progressive disclosure: unfold the hub (new)
- **What.** Hide what isn't relevant yet. Locked doors become **boarded silhouettes with a rumour** ("something drips behind these boards…"), not prices. Show a department's currency only once that department is open. Hide "Dread", "Goods" and "Edicts" UI until each is first earned, and announce each with a manager cameo and one sentence. Script **one "paradigm shift" beat per early session**: the first Fall reveals the Styx, the first Goods reveals porters, the first Edict reveals the Board.
- **Why.** A Dark Room, Paperclips and Kittens make each system change a story beat (Spiel et al.: "a new beat in the narrative unfolds"). bloodrizer: the revelation of "something looming and big" is "pure gold". Today's first screen is "a store with nothing in it" (meta.md P9) and shows the whole map, so there's nothing left to discover.
- **Source games.** A Dark Room, Universal Paperclips, Kittens Game, NGU (locked tabs with requirements).
- **Cost.** S (visibility flags plus copy).

### R6. A campaign with an ending: Aurelia's twelve champions (endorses and promotes the proposal's "later" Aurelia arc)
- **What.** A visible 12-step campaign on a small realm map. Each Legend you capture is one of Aurelia's champions, and each Fall burns a village. At 12 (about day 10-14 for a 20 min/day player), Aurelia assaults the Throne Room in a cross-department finale. Then **"You've won. The realm is yours."** End with a credits-style moment and an *optional* Cataclysm/NG+ with new rules.
- **Why.** Destinations beat treadmills. Designers explicitly want an ending "as a milestone to say 'it's okay, you can stop playing now'" (Hollands, in Spiel et al.), and Lantz wanted Paperclips to have "a dramatic arc". Players drift when it "felt aimless" (criticalvideogamestudies). A known finish line also powers the goal gradient across the whole game, not just one bar.
- **Source games.** Universal Paperclips, A Dark Room, Antimatter Dimensions Celestials.
- **Cost.** M-L (the map and finale are new; the champions reuse A7 rosters).

### R7. The Ember: a once-a-day ripening resource (new)
- **What.** A black candle on the throne grows an **Ember** over about 20 h. It's ripe at 20 h, and at 24 h it drops on its own and is banked, so absence never loses it. Harvesting early (before 20 h) is a coin flip. Spend Embers on department **Sigils**, permanent qualitative unlocks: Bridge night travellers, a Cauldron second spout, a Pit extra shop slot. These are exactly the "unlock a mode" upgrades the proposal wants but has no currency for. Occasionally an Ember is "Blood" (worth 2) or "Twin".
- **Why.** Cookie Clicker's sugar lumps give a daily reason to look in, unlock new play (minigames) rather than %, and never punish absence. They're the opposite of streak guilt, which the proposal rightly cut.
- **Source games.** Cookie Clicker (sugar lumps), NGU (Yggdrasil fruits).
- **Cost.** S (one timer and a small Sigil table; Sigils can ship gradually).

### R8. Throne Omens: a reward for checking the hub (new; complements Gobbo's Sack)
- **What.** While the Throne Room is open, every 1-4 min a random **omen** crosses it: a fleeing herald, a crow carrying a scroll, a lost knight. Tap it for a short boost in one department ("x3 Bridge tolls for 90 s"), a Goods crate or a Legend clue, then jump straight into that department. At most one at a time, and it fades after 8 s.
- **Why.** Golden cookies and Egg Inc drones make *presence* occasionally pay big and send attention somewhere specific. Gobbo's Sack (A3) rewards *coming back*. Omens reward *being in the hub*, which makes the hub a place rather than a menu (meta.md P2).
- **Source games.** Cookie Clicker, Egg Inc, Idle Slayer chests.
- **Cost.** S.

### R9. Siege Night: a remix that uses every department (new; later)
- **What.** When a **Siege meter** is full (fed by Goods and Falls, about every 3-4 days, shown on the throne), a 2-3 min **Siege Night** chains 30-second slices of the flagship Shifts against one invading champion. Tolls at the Bridge, then a Raid wave, then a Flask drop, then a Pit clash. It's scored 0-3 skulls, and the reward is a big Tribute, Dread and trophy payout. Stocked imported Goods give each slice a visible edge (potions fuel the Pit, ingots armour the Dungeon).
- **Why.** Rhythm Heaven's Remixes and WarioWare's mixed stages make a collection feel like **one game** by using the parts together. It also makes Goods links *felt*. Pillar 1 holds: it's never a gate, only the best payout.
- **Source games.** Rhythm Heaven (Remix, Perfect Campaign), WarioWare.
- **Cost.** L. Only after at least two Shifts exist (B1's rollout gate).

### R10. Generous offline, felt loss (endorses A4, plus one change)
- **What.** As in A4: a 24 h base cap and offline progress that can fill the economy gate up to 90%. **Add:** draw the fill on the doors (the proposal's M2 vaults) and show "FULL 06:10" on the doors, in the ribbon and as the Raven Post trigger. Consider letting *Night Orders: Bait the Legend* reach 100%, so a forgetful-but-planful player gets Falls.
- **Why.** Pecorella left Egg Inc partly because of its 2 h cap. Melvor and Clicker Heroes offer about 24 h or no cap. Alharthi et al.: idle games "do not penalize the player by demanding attention".
- **Source games.** Melvor, Clicker Heroes, Egg Inc (cautionary).
- **Cost.** S.

### R11. Raven Post on Declarative Web Push, reporting only the player's own plans (modifies B2)
- **What.** Build B2, but (a) on iOS 18.4+ send **declarative payloads** with `navigate` (`?src=push&evt=…`) and `app_badge`, so no SW push code is needed and the badge stays correct from the server; (b) limit push *content* to things the player set up or is waiting for: an expedition return (R2), a Night Order result (R1), the Ember ripe (R7), a Legend arrived or Dawn Ambush (A7), the cap full (R10). No generic "come back!" pings. At most 2 a day, toggles per type, and a permission prompt in-fiction after the first expedition, not just after the first Fall.
- **Why.** WebKit docs (above). Pushes that close a loop the player opened read as service. The skeptic notes that generic reminders get turned off. Prompting after the first expedition ties the request to a concrete benefit ("Gobbo will send a raven when he's back").
- **Source games.** Egg Inc and Idleon (pushes for timers the player started).
- **Cost.** M (server unchanged; client simpler than B2).

### Not recommended (from the research)
- **Daily login calendars and streaks with escalating rewards** (Egg Inc's daily calendar, Electric Rubber-style returning bonuses). The proposal already cut streaks. The designer interviews (Spiel et al.) back that "care" stance for a solo hobby game.
- **Co-op or competitive time pressure** (Egg Inc contracts). It's a known churn and stress source, and it doesn't apply to a single player.
- **More parallel timers in every department** (the Idleon clutter failure). Keep new timers at hub level (expeditions, Ember, Siege), not seven of each.

---

## 6. Suggested slotting into the proposal's build order

- **Wave 1 (S):** R5 unfolding, R7 Ember, R8 Omens, R10 vault drawing, R4 Doctrines. They're cheap and add anticipation and discovery with no server.
- **Wave 2:** R1 Night Orders (pairs with B1 Reputation: orders change how the buff spends overnight), R3 Fall tracks, R11 (B2 on Declarative Push).
- **Wave 3:** R2 Expeditions (with B4 porters), R6 campaign map.
- **Later:** R9 Siege Night, once two or more Shifts are proven fun.

**Measure with the proposal's playlog.** Add `order_set`, `expedition_start` / `expedition_return`, `ember_harvest`, `omen_tap` and `push_opened{evt}`. The key test for R1, R2 and R7 is whether **median gap between sessions** and **days active out of 7** improve *without* the fun rating falling (a sign of chore creep).

---

## Sources

- Pecorella, *Idle Games: The Mechanics and Monetization of Self-Playing Games*, GDC 2015: https://gdcvault.com/play/1022065/Idle-Games-The-Mechanics-and
- Pecorella, *Quest for Progress: The Math and Design of Idle Games*, GDC Europe 2016: https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507 · https://www.gdcvault.com/play/1023863
- Game Developer, "The rise of games you mostly don't play": https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play
- Kongregate, "The Math of Idle Games, Part II": https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii
- Alharthi et al., *Playing to Wait: A Taxonomy of Idle Games*, CHI 2018: https://par.nsf.gov/biblio/10061230 · https://doi.org/10.1145/3173574.3174195
- Spiel et al., *"It Started as a Joke": On the Design of Idle Games*, CHI PLAY 2019: https://par.nsf.gov/biblio/10174274
- Kivetz, Urminsky & Zheng (2006), goal-gradient: https://doi.org/10.1509/jmkr.43.1.39
- WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit, Meet Declarative Web Push: https://webkit.org/blog/16535/meet-declarative-web-push/ · Safari 18.4 features: https://webkit.org/blog/16574/ · https://progressier.com/pwa-capabilities/declarative-web-push
- Wikipedia: Cookie Clicker https://en.wikipedia.org/wiki/Cookie_Clicker · Incremental game https://en.wikipedia.org/wiki/Incremental_game · Universal Paperclips https://en.wikipedia.org/wiki/Universal_Paperclips · A Dark Room https://en.wikipedia.org/wiki/A_Dark_Room · Egg, Inc. https://en.wikipedia.org/wiki/Egg,_Inc. · Rhythm Heaven https://en.wikipedia.org/wiki/Rhythm_Heaven · WarioWare https://en.wikipedia.org/wiki/WarioWare
- Informit, "Interface Lessons from A Dark Room": https://informit.com/articles/article.aspx?p=2228802
- Mechanics of Magic, "Critical Play: A Dark Room": https://mechanicsofmagic.com/2026/05/13/critical-play-a-dark-room/
- GamesBeat on Paperclips: https://gamesbeat.com/this-clicker-game-lets-you-take-over-the-world-with-paper-clips/
- Antimatter Dimensions wiki: https://antimatterdimensions.wiki.gg/wiki/Eternity · https://antimatterdimensions.wiki.gg/wiki/Replicanti
- Realm Grinder: https://steamcommunity.com/app/610080/discussions/0/1696040635906323199 · https://realm-grinder.fandom.com/wiki/Research
- NGU Idle daily spin: https://steamcommunity.com/app/1147690/discussions/0/3074244288342873968
- Melvor offline: https://steamcommunity.com/app/1267910/discussions/0/591762563949134719
- Idleon: https://www.gsmgotech.com/2025/12/the-idle-mmo-phenomenon-how-legends-of.html · https://mein-mmo.de/legends-of-idleon-auf-steam/
- Egg Inc: https://egg-inc.fandom.com/wiki/Grain_Silo · https://egg-inc.fandom.com/wiki/Contracts?oldid=9822 · https://lr.eu.psf.lt/r/EggsInc/comments/1ibyulr/im_disappointed
- Clicker Heroes offline: https://blog.clickerheroes.com/offline-progression-in-clicker-heroes/
- r/incremental_games, "What makes an idle game fun" (2024): https://libreddit.neb.cx/r/incremental_games/comments/1epowcl/what_makes_an_idle_game_fun/lhnbro9/?context=3
- "At what point do we stop playing idle games": https://criticalvideogamestudies.com/at-what-point-do-we-stop-playing-idle-games/
