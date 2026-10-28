# Drop-and-merge and merge games: genre research for The Sorcerer's Spire

Prepared 2026-10-28 for the Spire designer. Inputs read first: `docs/specs/04-sorcerers-spire.md`, `src/depts/spire/def.ts`, `/home/user/fun-review/raw/depts-c.md` (S1-S6) and `/home/user/fun-review/proposal.md` (B1 "Flask Run", the Spire table row, the Daily Flask).

**Research note.** The shared web-search budget ran out partway through. After that I fetched only known pages (Wikipedia, Game Developer, Asher Vollmer's Threes emails, Puyo Nexus, GMTK, Naavik, the Famicast). Coverage of Travel Town, Bubble Witch and Merge Dragons is therefore thinner and relies on secondary sources and general genre knowledge, and I mark those claims. Every URL in the source list was fetched or returned by search.

---

## 0. The Spire's problem in one paragraph

The core verb is right. The audit found it is the best verb in the suite. But three structural facts remove the genre's engine.

- **The box is too big for the orbs.** The flask interior is 112x216 px. Spawned orbs are r4-8 px, so the largest spawn is about 14% of the width. Wider Flask and Taller Neck add slack.
- **Late merges free a lot of space.** The radius curve runs from 4 to 26 (6.5x in diameter, about 42x in area over 10 tiers). The area ratio between neighbouring tiers falls from about 1.56 at the low tiers to **1.17 at T10 to T11**. Two orbs merging into one barely bigger orb frees almost a whole orb of space. Every high merge is a large decompression.
- **Failure costs nothing.** A vent removes only the top band and refunds 25%. The run never ends, so there is nothing to score against, and the apprentices out-earn a novice (3.87K/s idle against about 2.2K/s active in the audit).

Each game below solves one of these problems.

---

## 1. Game-by-game

### 1.1 Suika Game (Aladdin X, 2021) and its origin, Merge Big Watermelon (2021)
- **Origin.** *Merge Big Watermelon* (合成大西瓜) was a January 2021 Chinese browser game by the marketing firm Meadow Science. It went viral in China and then Japan. Aladdin X cloned it as a bonus app for the popIn Aladdin ceiling projector (April 2021) and released it on the Japanese Switch eShop in December 2021. It stayed niche until Japanese VTubers and streamers picked it up in 2023. The worldwide release followed (October 2023), and it reached 10M+ downloads by June 2024. ([Wikipedia](https://en.wikipedia.org/wiki/Suika_Game), [Automaton](https://automaton-media.com/en/news/20231023-22458/))
- **Rules.** There are 11 fruits. Only the 5 smallest can be dropped. One fruit of preview. No timer. You lose when fruit crosses the top line. Two watermelons merging vanish. Merges can *eject* fruit and end your game. ([Wikipedia](https://en.wikipedia.org/wiki/Suika_Game))
- **Why the loop works.**
  - **Physics unpredictability.** A Japanese review quoted on Wikipedia calls the controls simple but says the physics "cause unexpected outcomes", giving it a gentle premise and a steep difficulty curve. Drops roll, bump and wedge, so no two runs are the same. That is why a script can't solve it the way it solves 2048.
  - **Wrong-orb pressure.** Only the next fruit is shown, and the draw is random. The puzzle is "where do I bury this unwanted fruit", not "where does the right fruit go".
  - **Chain reactions.** Reviewers single out the cascade combo as the peak moment. A cascade is also *relief*, because it lowers the pile.
  - **The top line.** The run can end. Every drop near the line is a held breath. Streamer culture made the near-death moment the content.
- **High score and runs.** A run lasts minutes. It has a single number, daily/monthly/all-time leaderboards, and a community target ("3,000 points") that works as a goal without the designer setting one. ([Wikipedia](https://en.wikipedia.org/wiki/Suika_Game))
- **Meta.** Almost none in the original: themes and, later, versus modes (DLC: Time Limit and Attack). The loop carries the game on its own.
- **Juice and sound.** Cute art and a soft "pop" on each merge. The developer credits "cute art and simple rules" for its success.

### 1.2 Suika Game Planet (2025-26)
- **Changes.** A round planet with gravity toward the centre. Fruit that floats past the edge gets a **5-second window** to be pulled back. A **Super Evolution gauge** fills with merges and opens a timed window of boosted scoring that merges can extend. Unlocks come from achievements. Rankings are daily, monthly and all-time. ([Famicast review](https://www.thefamicast.com/2025/12/suika-game-planet-review-nintendo.html), [Saiganak preview](https://saiganak.com/en/review/suikagame-planet-pre-experience/))
- **Lessons.**
  - The reviewer calls the near-loss "frantic, yet fun". Super Evolution is "the main source of urgency in a game that is otherwise pretty laid back".
  - The criticism is "not really too much content": achievements alone don't hold players.
  - A *grace window* on failure, plus a *fever meter* driven by merges, adds stakes and spikes without cluttering the field.

### 1.3 Threes! (Sirvo, 2014): the best-documented design in the genre
- **Process.** Development took 14 months. The team tried themes such as sushi, chess and monsters before returning to numbers. ([Wikipedia](https://en.wikipedia.org/wiki/Threes)) Vollmer's published emails are the best primary source in the genre. ([Threemails](https://asherv.com/threes/threemails/))
- **Key lessons from the emails.**
  - **They rejected plain doubling merges as too easy.** They beat 1024/2048-style rules on their first tries and noted that "an automated script" could beat them, which they called "broken". The goal was "simple to learn, impossible to master". This is the Spire's audit finding exactly: a dumb bot thrives.
  - **One very direct lose condition** (Greg Wohlwend), not several soft ones.
  - **Losing must feel rewarding.** When the board dies, the cards flip and the points tick up, giving a "what'd I get?!" moment. Records and badges come after the count.
  - **The score rises during play** so players don't "putz around".
  - **Earned rescues, not bought ones.** They discussed undos earned through spectacular plays and worried that an undo could cheapen a big merge.
  - **Randomness as tension.** The new tile slides in only *after* you commit, so the randomness stays tense. Greg also warned that pure random spawning feels "unfair, swimming upstream" unless players get tools to manage it.
  - **Readability.** The "squint test" for tiles. A highlight on the highest card gives a clear goal. Higher tiers get more impressive characters.
  - **Sound and animation carry the personality.** Merge "bongs", creature squeaks, blinking and idle animations.
- **The bag.** Spawns come from a renewable 12-tile bucket (four each of 1, 2 and 3), so floods of one tile are bounded. The next tile is shown, and later it is a hint between 2 or 3 candidates. ([Game Developer, Costiuc](https://www.gamedeveloper.com/game-platforms/threes-puzzle-elegance))
- **Ending.** Two 6,144s merging reveal a hidden 13th tile that ends the game. Nobody did it until 2017. That is a near-unreachable aspiration, the same role as the Spire's Singularity.

### 1.4 2048 (Gabriele Cirulli, 2014)
- Written in a weekend and loosely based on 1024/Threes. It drew 4M visitors in a week. ([Wikipedia](https://en.wikipedia.org/wiki/2048_(video_game)))
- **Why it's compelling anyway.** Instant readability, a nameable goal (the 2048 tile) and "keep going" after the win.
- **Why it's the cautionary tale.** A simple corner heuristic ("up, right, repeat, left when stuck") reaches 512 most of the time. Expectimax AIs reach 16,384 99.9% of the time. ([Wikipedia](https://en.wikipedia.org/wiki/2048_(video_game)), [Daily Dot](https://dailydot.com/2048-game-strategy-tips-cheat-high-score)) A solvable heuristic flattens the skill ceiling. The Threes team called the mechanic "too easy".
- **Lesson.** If a greedy bot can play well, the player learns the game is a chore. The Spire's spirebot reached T10 with zero vents.

### 1.5 Drop7 (Area/Code, 2009)
- A 7x7 grid with no timer. Numbered discs clear when their number matches the length of their row or column run. Grey discs crack after two hits. **Every N turns a full row of grey discs pushes up from the bottom**, and the level count shortens that gap. ([Wikipedia](https://en.wikipedia.org/wiki/Drop7))
- **Stakes without a clock.** Kill Screen describes the rising grey row as "an inverted coin pusher shoving you toward a game over". ([Kill Screen](https://killscreen.com/numerological-approach-pains-drop7)) The pressure is scheduled and visible, so a calm, untimed game still has rising danger.
- **Modes as structure.** Normal, Blitz, and **Sequence (everyone gets the same disc order)**, which is the ancestor of the "Daily seed". There is also a 70,000-point all-clear bonus. Edge later gave it 10/10.
- **Lesson for the Spire.** Hex Stones could act like Drop7's grey discs: *scheduled, escalating junk* that makes each run harder over time, rather than a flat per-drop chance.

### 1.6 Puyo Puyo (Compile, 1991)
- **Chains.** One pop makes Puyo fall, which sets off another pop. Chain power escalates geometrically. In Tsu the multipliers are 1, 8, 16, 32, 64, 96, 128 and so on, so a 5-chain pays about 64x a single pop. ([Puyo Nexus chain table](https://puyonexus.com/wiki/Chain_Power_Table), [Basic rules](https://puyonexus.com/wiki/Basic_rules))
- **Stakes.** Garbage (Ojama) can't be matched directly. It is cleared only by popping next to it, and it waits above the field until the attacker's chain ends. A loss is a single specific cell (the X). ([Wikipedia](https://en.wikipedia.org/wiki/Puyo_Puyo), [Intro to competitive Puyo](https://www.puyonexus.com/wiki/Introduction_to_Competitive_Puyo_Puyo))
- **Fever** (2003) adds a gauge that opens a burst of pre-built chains, much like Suika Planet's Super Evolution.
- **Lessons.**
  - Chain rewards must grow *super-linearly* or nobody builds for them. The Spire's Resonance adds +0.25 per step (x1.0 to x3.0), and the audit saw x1.00 to x1.25 in almost every screenshot.
  - Junk that clears by adjacency to *good play* turns punishment into opportunity.

### 1.7 Tetris 99 (Arika/Nintendo, 2019) and Tetris Effect (Monstars/Resonair, 2018)
- **Tetris 99: stakes from other people.** You lose by overflow. KOs earn badges that raise your garbage output by up to 100%, but badges make you a target. ([Wikipedia](https://en.wikipedia.org/wiki/Tetris_99), [Destructoid](https://destructoid.com/?p=235066), [Sixth Axis](https://www.thesixthaxis.com/2019/02/15/tetris-99-is-the-craziest-battle-royale-yet-and-its-brilliant/)) Weekend Maximus Cup events and unlockable themes give long-term goals. Critics: "the massive player count really ups the intensity".
- **Lesson.** Power that also raises risk (badges) is the cleanest form of a risk dial. Volatility should feel like this, not like a gate you must buy.
- **Tetris Effect: juice as the product.** Mizuguchi's goal was to make playing Tetris "feel better than before", with music, visuals and input in sync. The **Zone** mechanic (freeze time, stack lines, cash out) took repeated prototyping. ([GamesBeat](https://gamesbeat.com/tetsuya-mizuguchi-interview-taking-tetris-on-a-ps-vr-acid-trip/), [Nintendo Life](https://nintendolife.com/reviews/switch-eshop/tetris-effect-connected))
- **Lesson.** Audio that rises with the player's actions (each merge a note in a scale) turns a calm puzzle into flow.

### 1.8 Triple Town (Spry Fox, 2010)
- **Rules.** A 6x6 grid. Three or more alike merge on the last tile placed: grass, bush, tree, hut and up. The **Storehouse** holds one tile. **Bears** wander and block, and trapped bears become gravestones. Three gravestones make a church and three churches make a cathedral, so **the threat becomes a resource**. Crystals are wildcards, and an Imperial Bot deletes a tile. The game ends when the board is full. ([Wikipedia](https://en.wikipedia.org/wiki/Triple_Town), [MobyGames](https://www.mobygames.com/game/61443))
- **Daniel Cook's lessons.** "Evergreen designs aren't puzzles". Reinvent genres from the root. Building beats destroying. He also found that sets of 3 and 4 opened deep strategy. ([Lost Garden](https://lostgarden.com/2010/10/15/triple-town-released-for-the-amazon-kindle/), [PocketGamer.biz making-of](https://www.pocketgamer.biz/feature/40406/colonisation-cloning-and-rethinking-genre-the-making-of-triple-town/))
- **Business lesson.** Edery (GDC 2016) said it "didn't make very much money" because "there's almost no meta-game". A great core alone doesn't retain or monetise. ([PocketGamer.biz](https://www.pocketgamer.biz/feature/40406/colonisation-cloning-and-rethinking-genre-the-making-of-triple-town/))
- **For the Spire.** The Storehouse is the cheapest "choice without clutter" in the genre: one slot, one decision per drop. Hex Stones should become a gravestone-to-church conversion: junk you *want* to herd.

### 1.9 Merge-meta: Merge Mansion (Metacore), Merge Dragons (Gram/Zynga), Travel Town (Magmatic)
- **Merge Mansion.** Merge-2, a fixed-size board that doesn't grow, and **orders/tasks** that pull items toward story goals. About 33 minutes a day, against about 70 for Merge Dragons and Evermerge. Naavik credits the fixed board and merge-2 for a lighter, less hoard-prone game, and calls Merge Dragons' growing maps and 5-merge bonuses "a crowded map and a hoarding of objects". ([Naavik](https://naavik.co/deep-dives/merge-mansion-future-of-merge/))
- **Merge Dragons.** Merge-3, with a bonus for merging 5 at once (a known community rule; the wiki was paywalled during this research). There is a GDC talk on its design philosophy. ([GDC Vault](https://gdcvault.com/play/1026075/Design-Philosophies-and-Lessons-from))
- **Travel Town.** Same family: generators, energy and orders on a fixed board, with a travel-story meta. *Thin evidence: I couldn't fetch a design source after the search budget ran out.*
- **Lessons.**
  - **Board space is the tension.** A fixed board plus orders creates "what do I keep" decisions. Expanding the board (like Wider Flask) removes them.
  - **Orders give direction without new verbs.** Choice comes from goals layered on the same merge, not from extra UI.
  - These are energy-gated session games. Don't copy the energy timers into an idle game that already has offline income.

### 1.10 Dorfromantik (Toukana, 2021): calm puzzle with real stakes
- **Rules.** Draw from a stack of about 40 tiles with the top 3 visible. **The run ends when the stack runs out. Completing quests and perfect placements add tiles**, so good play buys more play. ([Wikipedia](https://en.wikipedia.org/wiki/Dorfromantik))
- **Designer quotes.** "The interaction the player does the most has to feel as satisfying as possible". Strategy is present but "not punishing for relaxed players". The high score and rising difficulty supply the extrinsic pull. Quests became "demands" placed on the board (a deer wants a forest of N trees), and completing challenges unlocks biomes, tiles and skins. ([Game Developer IGF interview](https://www.gamedeveloper.com/disciplines/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i-))
- **Lesson.** A calm game can have a hard ending if *goals extend the run*. That is the softest possible way to give the Spire a fail state. Critics did call it "relatively shallow in the long run", with no middle ground between casual and optimising play.

### 1.11 Balatro (LocalThunk, 2024): run scoring and juice
- **Run structure.** Ante, then Small, Big and Boss Blind. You must beat a rising required score. Shops sit between rounds. Win at ante 8, with endless mode after. Completing runs unlocks decks and **stakes** (stacked difficulty modifiers). ([Wikipedia](https://en.wikipedia.org/wiki/Balatro))
- **Scoring tension.** LocalThunk deliberately **hides the final score preview**. "Set up your Rube Goldberg machine and watch it go" before knowing whether you win. Cards and jokers step forward one by one while numbers climb with rising sound. ([GMTK](https://gmtk.substack.com/p/balatros-cursed-design-problem)) In his words, the core metastrategy is "mitigating risk". ([Rogueliker interview](https://rogueliker.com/balatro-interview/))
- **Lesson.**
  - The *tally* is the reward cinema, even though it's just arithmetic.
  - Stakes are opt-in difficulty that *unlock* after a win, not a tax you must pay to progress.
  - Chips x Mult makes a multiplier readout legible on a tiny screen.

### 1.12 Bubble Witch Saga (King, 2011)
- An aim-and-shoot bubble matcher. King replaced endless play with **levels that set specific goals within a limited number of shots**, sold boosters and lives, and passed 10M players by January 2012. ([Wikipedia](https://en.wikipedia.org/wiki/Bubble_Witch_Saga))
- **Lesson.** The aim line, plus a *goal under a budget* ("free the 3 ghosts in 30 shots"), turns aimed physics into short, authored puzzles. The Spire's Orders can borrow this form ("Eclipse within 60 drops"). *Thin evidence: no design interview was fetched.*

### 1.13 Idle-genre reference: Cookie Clicker and Kongregate's idle math
- **Golden Cookies.** They appear at random and fade in seconds. Clicking one grants a temporary production boost, so being present multiplies idle. ([Wikipedia](https://en.wikipedia.org/wiki/Cookie_Clicker)) Bogost's critique: a game "for a computer to play while a human watches (or doesn't)". That is the Spire's failure mode if idle wins.
- **Pecorella.** Exponential costs against polynomial production. Milestone multipliers and prestige push production back toward cost. Rotating which generator is most efficient keeps choices meaningful. ([Game Developer](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i))

---

## 2. Synthesis

### 2.1 Strongest genre best practices
1. **A single, visible, real lose condition.** Suika's line, Drop7's rising row, Puyo's X and Threes' full board. Greg Wohlwend asked for "one very direct lose condition". Soft penalties don't create the held breath.
2. **The container must be tight relative to the pieces.** Pressure is geometry: spawn sizes, area growth per tier and box size. Suika spawns 5 sizes into a box where the top fruit is about 45% of the width. Merge Mansion keeps a fixed board. Growing the space (Merge Dragons) breeds hoarding and long, low-tension sessions.
3. **Wrong-piece pressure with bounded randomness.** One or two pieces of preview. Draws from a bag (Threes' 12-tile bucket) so streaks are bounded and feel fair. The next piece is revealed *after* you commit (Threes).
4. **Chains pay super-linearly and double as relief.** Puyo's 1, 8, 16, 32, 64. Suika's cascades lower the pile. A chain should be the moment you are both rich and saved.
5. **The run ends in a reward ceremony.** Threes' card flip and count-up. Balatro's step-by-step tally. Score, Best, highest tier, then badges. Losing is the payout screen.
6. **Escalating, scheduled pressure inside a run.** Drop7's grey rows on a shrinking interval, Puyo garbage, Tetris 99 targeting. Late game is harder *because of the run's own progress*, not because of a menu setting.
7. **Risk dials that also pay.** Tetris 99 badges raise output *and* aggro. Balatro stakes multiply challenge after you've proven yourself. The choice is made per run, not bought once.
8. **Choices without clutter = one slot or one goal.** Triple Town's Storehouse. Merge Mansion's orders. Dorfromantik's on-board "demands". Threes highlighting the highest card. No new buttons in the play area.
9. **Threats that become resources.** Triple Town's bears turn into gravestones, then churches, then cathedrals. Puyo garbage clears next to your chains. Junk is a puzzle with a payout.
10. **Juice on the most frequent action, escalating with stakes.** Dorfromantik: "the interaction the player does the most has to feel as satisfying as possible". Tetris Effect: audio keyed to input. Threes: squeaks and blinking. A pitch that rises per chain step.
11. **Daily shared seeds and simple long goals.** Drop7 Sequence, Suika's daily board, Tetris 99 weekend cups, Suika's community "3,000" target.
12. **A meta that layers goals but doesn't loosen the core.** Edery's warning: no meta means no retention. Suika Planet: achievements alone are "not too much content". But the meta should never make the box bigger.

### 2.2 Pitfalls (each one observed in the Spire)
- **No failure.** The Spire vents 0 times in 500 drops. A vent removes a band and refunds 25%, and the run continues forever. 2048 is the genre's example: once a heuristic beats it, it loses its depth (Threes notes).
- **Upgrades that remove the puzzle.** Wider Flask, Taller Neck and the decompressing late-tier radius curve each make the box roomier. No successful drop-merge game sells a bigger box. Merge Dragons' growing map is the cautionary tale (Naavik).
- **No scoring tension.** There is no score, no Best and no end tally, and income is a continuous drip. Balatro and Threes show that the *count-up* is the emotional peak.
- **Idle out-earning active.** The apprentices make 3.87K/s while a novice makes about 2.2K/s. When skill doesn't beat absence, the game becomes something "a computer plays while a human watches" (Bogost on Cookie Clicker).
- **Linear chain reward.** +0.25 per step can't compete with the pull to just drop again. Puyo makes chains geometric.
- **Flat, unscheduled junk.** Hex Stones appear only via a Volatility chance the player can avoid. Drop7 and Puyo make junk an unavoidable, escalating clock.
- **Gate-dials.** Volatility levels are bought once and raising them is "always right" (proposal #3). A dial must be a per-run gamble with real downside, as in Tetris 99 badges and Balatro stakes.
- **Clutter as depth.** The temptation is more orb types, more buttons and more gutters. Merge Mansion's lighter merge-2 design halves session time against Merge Dragons with no loss of appeal.

---

## 3. Recommendations for The Sorcerer's Spire

These respect the 180x320 portrait pixel layout (HUD y16-34, queue y34-50, flask x34-146) and keep idle income continuous and offline-safe. Costs: S under 2 days, M up to about 1 week, L longer.

### R1. Flask Run: the vent ends the flask and pays a ceremony (S-M)
- **What.**
  - The main flask becomes a scored run: score = merge values earned this flask, with **Best** and **highest tier** shown in the existing queue row ("4,210 / BEST 6,004").
  - A vent (top-out held for 2.5 s) **cracks the flask**. Orbs freeze, then pop one by one from top to bottom. Each pop adds to a ticking tally with a rising note, Threes-style.
  - The tally ends on "Distill Bonus = score x (1 + 0.1 x highest tier)" banked as Arcana, then NEW BEST or a near-miss line ("312 short of Best").
  - The flask resets empty. Apprentices never stop.
  - Keep Vent Now as "end run early and cash out", the Settle Charm reworked.
- **Why.** It is the genre's one indispensable ingredient: one direct lose condition, with losing as the reward (Wohlwend). It fixes S1, S4 and X1, and it is already proposal B1.
- **Source games.** Suika (top-out), Threes (count-up at death), Balatro (tally cinema).
- **Pixel note.** The tally floats inside the flask's own 112 px width. One big 2x number and the Head Sorcerer's ecstatic or singed face in his strip.

### R2. Re-cut the geometry so a flask fills in 3 to 6 minutes (S, numbers only)
- **What.** Three changes:
  - **Box.** Shrink the interior to about 112x160 and use the empty brick band above it. Turn Wider Flask and Taller Neck into non-slack nodes, such as orb-friction control or a landing guide, or cap them at +4 px total.
  - **Pieces.** Scale radii about x1.3 so the biggest spawn is about 18-20% of the width. Then fix the late curve so the area ratio between tiers stays around 1.4-1.6 all the way up, instead of the current 1.17 for T10 to T11. Late merges should not empty the jar.
  - **Validation.** Use the existing spirebot as the gate. A *dumb* bot should vent in roughly 60-150 drops. The reference bot's median flask should run about 150-250 drops and reach T8-T9, with a Void Star rare and a Singularity a bragging-rights event, like Threes' 13th tile.
- **Why.** Pressure is geometry. Suika's box is tight relative to its fruit, and Merge Mansion fixes the board size. Shrinking alone isn't enough while high merges decompress the flask.
- **Source games.** Suika, Merge Mansion (fixed board), 2048 (a bot-solvable game loses its depth).

### R3. Make Volatility a per-flask wager, like Tetris 99 badges and Balatro stakes (M)
- **What.** At flask start, the knob sets this flask's Volatility, locked until the vent. It raises the score multiplier (`arcanaMult`) **and** the run's pressure: a lower Brim Line, more Hex Stones, faster gravity.
  - Levels unlock by **reaching a score target at the level below**, the way stakes unlock, instead of being bought with `5000x4^V`.
  - Feats then fall out naturally ("T9 at V5", with no 60-drop bookkeeping), because the setting is fixed for the whole flask.
- **Why.** The proposal flags dials that are "gates you must raise". A wager made before the run creates the Balatro/Tetris 99 feeling that power costs safety. It also keeps the 10-minute vIdle rule simple: idle uses the last flask's V.
- **Source games.** Tetris 99 (badges), Balatro (stakes).

### R4. Scheduled pressure: Hex Stones as Drop7's rising row, cleared Triple Town-style (S)
- **What.**
  - Replace the flat `hexChance(V)` with a **pressure clock**: every N drops (N shrinking with flask age and Volatility), a Hex Stone drops in on its own from a random x. Show it as a cracking crust on the flask mouth so it is telegraphed a few drops ahead.
  - Keep the triple-shatter. Add Puyo's rule that **a Hex Stone touching a merge of T5+ crumbles**, so good chains clean junk.
  - Shatters pay into the run score, so herding junk is a strategy.
- **Why.** It gives the late flask its own escalation (Drop7) and turns the threat into a resource (Triple Town's bears and churches, Puyo garbage). It guarantees that even a perfect player eventually vents, so runs end.
- **Source games.** Drop7, Puyo Puyo, Triple Town.

### R5. Geometric chain reward and a "Resonance" fever window (S)
- **What.**
  - Replace +0.25 per cascade step with a Puyo-like ramp: x1, x2, x4, x6, x8 and up, capped by Resonant Glass.
  - Show it Balatro-style as a big "x4" in the queue row that punches up on each step. Each merge note climbs a scale (the spec's semitone rule already exists).
  - Optional: big merges fill a small rune ring on the rim. When full, it opens a 10 s **Resonance surge** (x2 score) that more merges extend.
- **Why.** The audit saw x1.00 to x1.25 in almost every frame, so a linear bonus doesn't change behaviour. Super-linear chains reward *setting up*, which is the skill the Spire claims to be about.
- **Source games.** Puyo Puyo (chain power), Suika Game Planet (Super Evolution), Balatro (multiplier readout), Tetris Effect (audio keyed to play).

### R6. Tie idle to active skill: "the apprentices copy your Best" (S)
- **What.**
  - Apprentice output scales with **your best Flask Run score in the last 24 h** (or the last 3 flasks), building on the existing Distill Ceiling idea.
  - Concretely, `idleRate = base x f(bestRecentScore)`. Show it as the apprentices' little flask tinted to your best tier, plus a label: "Apprentices study your 6,004 flask: +60%". This fits the proposal's Reputation stars.
  - Retune `IDLE_TUNE` so a **novice's active rate is at least 2x on-screen idle** and a skilled player's is 3-4x. Lower idle's floor, raise its ceiling via your Best.
  - Add a Golden Cookie-style touch: the apprentices occasionally hand a **sealed orb** into the *main* queue while you play. It is a gift, never junk.
- **Why.** It fixes S3 directly. Playing well makes leaving more profitable, so active play and idle stop competing and support each other. Offline stays continuous and deterministic, since the rate is computed from a saved number, and apprentices still never touch the main flask (D-07).
- **Source games.** Cookie Clicker (presence multiplies idle), Pecorella (milestone multipliers), the proposal's Reputation design.

### R7. One-slot Stash (Triple Town Storehouse) replacing a preview slot (S)
- **What.**
  - A single **Stash** slot at the right of the queue row. Tap it to swap the current orb in or out, with a 1-drop cooldown.
  - Cut the preview to **1 next orb** (Suika). The Tome of the Mirror becomes "+1 preview", so the reward is information.
  - Draw spawns from a **Threes-style bag** (for example 12 entries matching the spawn table) instead of rerolling T1 streaks.
- **Why.** It adds the genre's cheapest real decision ("bury it now or save it") with zero new playfield clutter, and the bag keeps "wrong orb" pressure fair. With R2 making the flask tight, the Stash becomes a lifeline.
- **Source games.** Triple Town (Storehouse), Suika (1 preview), Threes (bag).

### R8. Orders that extend the run: Dorfromantik's "demands" in the Head Sorcerer's voice (M)
- **What.**
  - Two active Orders show as icon strips in the manager dock, never over the flask: "Soulfire within 40 drops", "a x4 chain", "shatter 3 Hex".
  - Completing one pays Arcana plus a **Grimoire Page shard**, and **cools the flask**: the Brim Line rises 6 px for this flask, or one free Catalyst arrives.
  - One Order refreshes on each new flask. A daily Order also exists.
- **Why.** Orders give direction without new verbs (Merge Mansion) and short budgeted goals (Bubble Witch). Dorfromantik's insight is that **goals which buy more play** make a hard ending feel fair and calm. It also fixes the problem that Pages are gated behind 45-minute Singularities.
- **Source games.** Dorfromantik, Merge Mansion, Bubble Witch Saga.

### R9. Special orbs as earned rescues, not loose drops (S)
- **What.**
  - The **Catalyst** is no longer a fixed "every 60 drops" spawn. It is *earned*: a x4+ chain or an Order puts one in the Stash.
  - **Quicksilver** becomes the danger tool: offered when the brim warning first fires in a flask, at most once per flask.
  - This also keeps the playfield readable on a 112 px flask.
- **Why.** Threes discussed undos earned by spectacular plays and warned that rescues cheapen big moments if they are free. Triple Town's crystals and bots are scarce. Rescues tied to danger create near-miss stories ("Quicksilver nudged the Eclipse in with 0.3 s left").
- **Source games.** Threes, Triple Town, Suika Game Planet (5 s float-back grace).

### R10. The Daily Flask: a shared seed and a personal history (M, after R1 proves out)
- **What.** One seeded bag per day (same Hex clock, same Orders) in a separate flask that doesn't touch the main economy. Show "Yesterday 41,200 / Today —" and a 7-day sparkline of your own scores. The reward is Dread or Tribute by percentile against *your own* last 7 days, so no server is needed.
- **Why.** It is the genre's proven "come back tomorrow" hook and fixes X1. It is gated on R1, as the proposal already says.
- **Source games.** Drop7 (Sequence mode), Suika (daily leaderboard), Tetris 99 (weekend cups).

### Suggested order
- **R2 + R1 + R6 first.** They are mostly numbers and one end screen, and together they create a lose state, a score and a reason to play over idling.
- **Then R5, R7, R4 and R9.** These are S-sized feel and decision passes.
- **Then R3 and R8, and R10 last.**
- Re-run spirebot after each step. Success looks like this: a dumb bot vents within 150 drops, a reference bot's active rate is 3x idle or more, and the median flask lasts 3-6 minutes.

---

## Sources
- Suika Game: https://en.wikipedia.org/wiki/Suika_Game ; https://automaton-media.com/en/news/20231023-22458/ ; https://giantbomb.com/wiki/Games/Suika_Game
- Suika Game Planet: https://www.thefamicast.com/2025/12/suika-game-planet-review-nintendo.html ; https://saiganak.com/en/review/suikagame-planet-pre-experience/ ; https://www.gematsu.com/games/suika-game-planet
- Threes: https://asherv.com/threes/threemails/ (primary design emails) ; https://en.wikipedia.org/wiki/Threes ; https://www.gamedeveloper.com/game-platforms/threes-puzzle-elegance ; https://www.pocketgamer.com/articles/058578/r/
- 2048: https://en.wikipedia.org/wiki/2048_(video_game) ; https://dailydot.com/2048-game-strategy-tips-cheat-high-score ; https://dailydot.com/threes-2048-app-strategy-history
- Drop7: https://en.wikipedia.org/wiki/Drop7 ; https://killscreen.com/numerological-approach-pains-drop7
- Puyo Puyo: https://en.wikipedia.org/wiki/Puyo_Puyo ; https://puyonexus.com/wiki/Chain_Power_Table ; https://puyonexus.com/wiki/Basic_rules ; https://www.puyonexus.com/wiki/Introduction_to_Competitive_Puyo_Puyo
- Tetris 99 and Tetris Effect: https://en.wikipedia.org/wiki/Tetris_99 ; https://destructoid.com/?p=235066 ; https://www.thesixthaxis.com/2019/02/15/tetris-99-is-the-craziest-battle-royale-yet-and-its-brilliant/ ; https://gamesbeat.com/tetsuya-mizuguchi-interview-taking-tetris-on-a-ps-vr-acid-trip/ ; https://wccftech.com/interview-tetsuya-mizuguchi-synesthesia-tetris-effect-rez-lumines/amp/ ; https://nintendolife.com/reviews/switch-eshop/tetris-effect-connected
- Triple Town: https://en.wikipedia.org/wiki/Triple_Town ; https://lostgarden.com/2010/10/15/triple-town-released-for-the-amazon-kindle/ ; https://www.pocketgamer.biz/feature/40406/colonisation-cloning-and-rethinking-genre-the-making-of-triple-town/ ; https://www.gamedeveloper.com/design/-em-triple-town-em-a-social-game-design-analysis ; https://www.mobygames.com/game/61443
- Merge meta: https://naavik.co/deep-dives/merge-mansion-future-of-merge/ ; https://gdcvault.com/play/1026075/Design-Philosophies-and-Lessons-from
- Dorfromantik: https://en.wikipedia.org/wiki/Dorfromantik ; https://www.gamedeveloper.com/disciplines/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i- ; https://gog.com/news/binterview_toukana_interactive_tells_us_more_about_dorfromantikb
- Balatro: https://en.wikipedia.org/wiki/Balatro ; https://gmtk.substack.com/p/balatros-cursed-design-problem ; https://rogueliker.com/balatro-interview/
- Bubble Witch Saga: https://en.wikipedia.org/wiki/Bubble_Witch_Saga
- Idle and juice: https://en.wikipedia.org/wiki/Cookie_Clicker ; https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i ; https://en.wikipedia.org/wiki/Game_feel (Swink; Jonasson & Purho, "Juice it or lose it", 2012)
