# Plinko / Pachinko / Peg-board: genre research for The Cauldron

Prepared 2026-10-28 for the Overlord designer. I read the inputs first: spec `docs/specs/05-cauldron.md`, `src/depts/cauldron/*` (`logic.ts` MAX_BALLS=60 and CHARGE_S=8, `econ.ts` Hire growth 7, `scene.ts:713` silent idle pegs), `fun-review/raw/depts-a.md` (C1 to C4, X1 to X5) and `fun-review/proposal.md` (Cauldron is "S fixes, then stays idle-first"; Golden Spoon and board-builder parked as "later"). The research below targets those gaps.

**About the sources.** The session's web-search budget ran out partway through. Claims with a URL were checked against that page this session. Claims marked *(memory)* are well-known genre facts I could not re-verify this session. Check those before quoting exact numbers.

---

## 1. Game-by-game notes

### 1.1 Peggle (PopCap, 2007): the template
- **Moment to moment:** you get 10 balls per level, and you must clear 25 random orange pegs out of ~100. One random peg turns purple each turn and pays bonus points. Two green pegs fire the Master's power. A moving catcher at the bottom gives the ball back. Clearing oranges raises a score multiplier up to 10x. ([Wikipedia](https://en.wikipedia.org/wiki/Peggle))
- **Skill vs luck:** designer Sukhbir Sidhu started from pachinko but judged it "mostly luck-based" and a poor fit for a video game. The team cut spinning crosses because you couldn't anticipate the bounce, and settled on a static peg field so shots are predictable. ([Wikipedia](https://en.wikipedia.org/wiki/Peggle), [PC Gamer, The Making of Peggle](https://www.pcgamer.com/uk/the-making-of-peggle)) Reviewers still call it "quite a bit of luck", with enough skill left to plan shots, so it feels masterable. ([earnthis.net](https://earnthis.net/dans-top-100-everything-47-peggle/))
- **Juice:** each peg hit plays a tone that gets "higher and higher pitched as you hit more and more pegs". On the last orange peg the camera zooms in and slows the ball (the "Fever Cam", which also fires on a narrow miss). Clearing the board triggers EXTREME FEVER: the floor becomes 5 bonus bins, with fireworks, "Ode to Joy" and a rainbow. ([earnthis.net](https://earnthis.net/dans-top-100-everything-47-peggle/), [MobyGames](https://mobygames.com/game/peggle), [Game Informer](https://gameinformer.com/games/peggle_2/b/xboxone/archive/2013/12/10/ode-to-joy)) Jason Kapalka says Ode to Joy, the unicorn and the rainbow were placeholders that playtesters loved. ([Wikipedia](https://en.wikipedia.org/wiki/Peggle)) The design term "juicy" itself traces back to a GDC talk that used Peggle as the example. ([Jesper Juul](https://www.jesperjuul.net/ludologist/page/68/))
- **Choices:** shot angle; which Master power to use and where (green pegs); risky bank shots versus safe ones; Challenge mode's stricter goals. ([Wikipedia](https://en.wikipedia.org/wiki/Peggle))
- **Retention without monetization:** a campaign that introduces one Master every 5 levels, Challenges, Duel, score chasing, and "style shot" bonuses *(memory)*.
- **Lesson for the Cauldron:** *scarcity plus one ball you care about plus an escalating audio ladder.* The thrill is a single, limited shot whose outcome you can partly predict.

### 1.2 Peggle 2 (2013)
- It keeps the formula and moves the Master to the side of the screen as a live cheerleader who reacts "to every single moment". It adds Trials (goal puzzles), 10 per Master. During Fever, pegs pay ×20. ([GamesRadar](https://www.gamesradar.com/peggle-2-review), [Destructoid](https://destructoid.com/?p=163169), [Engadget](https://www.engadget.com/2013-12-09-peggle-2-review-relapse.html), [Peggle 2 Wikipedia](https://en.wikipedia.org/wiki/Peggle_2))
- Critics' complaints: 5 Masters instead of 10 means less variety, and some Trials hit "brick walls". ([GamesRadar](https://www.gamesradar.com/peggle-2-review), [Xbox Addict](https://xboxaddict.com/Staff-Review/Xbox-One/13645/Peggle-2.html))
- **Lesson:** a manager character who reacts live to every bounce (Granny) is a proven source of juice. Challenge puzzles extend a fixed toy cheaply.

### 1.3 Peggle Blast (2014, F2P mobile): cautionary tale
- It added lives, a wait timer, and paid trajectory guides, fireballs and extra balls. Pocket Gamer (2.5/5) said the economy profits when the player loses. Destructoid called it "a travesty". Macworld said the paywalls "sap the magic". ([Pocket Gamer](https://www.pocketgamer.com/peggle-blast/review/), [Destructoid](https://www.destructoid.com/reviews/review-peggle-blast/), [Macworld](https://www.macworld.com/article/224780/freemium-field-test-peggle-blast-adds-too-many-barriers-to-popcaps-classic-peg-popping-game.html))
- **Lesson:** gating the *aim aid* and *extra balls* behind friction kills the genre's core pleasure. Overlord has no monetization, but the same trap shows up as long cooldowns on the fun verb (8 s Ladle recharge).

### 1.4 Peglin (Red Nexus, 2022–): roguelike peggle-like
- **Origin:** a 2019 game jam (theme "fall"), described as Peggle meets Slay the Spire. ([Wikipedia](https://en.wikipedia.org/wiki/Peglin))
- **Choices:** orbs are a deck you build, and each orb changes the physics toy. The Bob-orb turns every 8th peg hit into a bomb. The Infernorb sets off bombs in one hit. The Memorb grows with pegs hit this turn. Special pegs: **Crit (!)** makes *every* peg that ball hits critical, retroactively. **Refresh (R)** restores spent pegs. **Bombs** need two hits. Relics combine with orbs into builds. ([TheSixthAxis](https://www.thesixthaxis.com/2025/09/09/peglin-review/), [RPGamer](https://rpgamer.com/review/peglin-review/))
- **Long term:** the Cruciball difficulty ladder unlocks after a first win, and each level unlocks the next ([dev devlog](https://gedig.itch.io/peglin/devlog/383097/the-first-cruciball-levels-are-here-v0720)). Classes unlock through feats, e.g. Spinventor for hitting 7 slimed pegs in a row ([wiki](https://peglin.wiki.gg/wiki/Spinventor)). You also navigate the map by shooting the ball into path holes.
- **Criticism:** "too random to be strategic", repeated layouts, and Cruciball steps that are "annoying rather than meaningful" flat penalties. ([TheSixthAxis](https://www.thesixthaxis.com/2025/09/09/peglin-review/))
- **Lesson:** the *Crit peg* idea (one hit transforms the rest of that ball's journey) creates "one ball I care about" moments. Difficulty steps should change the rules, not just shrink numbers.

### 1.5 Ballionaire (newobject / Raw Fury, 2024): the board-builder
- **Loop:** an "autobonker". You don't aim much. Between drops you pick a **trigger** (145+) or **boon** (55+) and place it on the board. Triggers include portals, mushrooms that bounce balls up, ingredient-adders and splitters, and some combine (ingredients cook into pizza). Each round demands a rising tribute. Boards include Pyramid, Danger Wheel and Pinball. There's a sandbox "Laballatory". ([Steam](https://store.steampowered.com/app/2667120/Ballionaire/), [Rogueliker](https://rogueliker.com/ballionaire-early-access-review/))
- **Rule worth copying:** each ball can fire a given trigger **once**, and a portal teleport "resets" the ball ("it's no longer the same ball"). This stops infinite loops and makes routing matter. ([devlog #2](https://newobject.itch.io/ballionaire/devlog/619959/build-2-released), [devlog #5](https://newobject.itch.io/ballionaire/devlog/622001/build-5-released))
- **Choices:** placement and adjacency. Clustered triggers interact more. Synergies depend on the board: on the pinball table, ball-spawning is bad because you want balls to stay in play. ([Rogueliker](https://rogueliker.com/ballionaire-early-access-review/))
- **Critique:** the AV Club argues pachinko forces a trade-off. Once launched you have no control, and good board design turns the gamble into "an oddball optimization puzzle", so "you can only have one or the other". Other complaints: a busy screen, text-heavy trigger descriptions, and luck-heavy early runs. ([AV Club](https://www.avclub.com/game-theory-ballionaire), [Rogueliker](https://rogueliker.com/ballionaire-early-access-review/))
- **Lesson:** *a persistent board you build is a second, slower decision layer that works while you're idle.* That's exactly what an idle plinko needs. Keep a live verb (Ladles) so it doesn't collapse into pure optimization.

### 1.6 BALL x PIT (Kenny Sun / Devolver, 2025)
- **Moment to moment:** Breakout plus Vampire Survivors. Balls auto-fire upward at descending enemies, and *catching* a returning ball reloads it instantly, which is the skill expression. ([Press Start](https://press-start.com.au/reviews/pc-reviews/2025/10/16/ball-x-pit-review-groin-grabbingly-good/), [Nintendo World Report](https://www.nintendoworldreport.com/review/72918))
- **Choices:** fission levels up balls, **fusion** combines two balls' effects (Burn + Freeze = Freezing Flame), and **evolution** is a named final form. Each hero has a starting-ball gimmick. ([Checkpoint](https://checkpointgaming.net/reviews/2025/10/ball-x-pit-review-fusion-frenzy/), [Press Start](https://press-start.com.au/reviews/pc-reviews/2025/10/16/ball-x-pit-review-groin-grabbingly-good/))
- **Long term:** the city of New Ballbylon has 70+ buildings, and it's harvested by bouncing your heroes across the town grid like "a top-down pachinko machine". Blueprints found in runs unlock buildings and characters, so failed runs still progress. ([Permanent Backlog](https://permanentbacklog.substack.com/p/ball-x-pit-review), [Press Start](https://press-start.com.au/reviews/pc-reviews/2025/10/16/ball-x-pit-review-groin-grabbingly-good/)) Over a million sold by Dec 2025 ([Mobalytics](https://mobalytics.gg/news/guides/ball-x-pit-review)).
- **Critique:** SFX overstimulation in busy moments, and a music loop that never rests. ([Permanent Backlog](https://permanentbacklog.substack.com/p/ball-x-pit-review))
- **Lesson:** *named fusion recipes* are a discovery and collection hook, and they fit the Cauldron's ingredient fantasy perfectly. Busy screens need audio voice-limiting.

### 1.7 Pachinko machines (Japan)
- **Loop:** balls that land in the **start pocket** spin a digital slot. Two matching symbols enter **"reach"**, an extended suspense animation before the last reel. A jackpot opens a big payout gate (the "attacker") for several rounds. **Kakuhen ("fever")** multiplies the odds of the next jackpot, which produces chains. **Jitan** (time-shortening) widens the start gate and speeds up spins. Tulip catchers open and close under machine control, so players time their shots. ([Wikipedia: Pachinko](https://en.wikipedia.org/wiki/Pachinko))
- **Suspense design:** patents describe "reach" as the state where one symbol decides the result, which sharply raises anticipation, and "advance notice" (yokoku) effects that hint at which reach animation will follow. ([JP2000296218A](https://patents.google.com/patent/JP2000296218A/en), [JP5692023B2](https://patents.google.com/patent/JP5692023B2/en)) Kakuhen commonly raises jackpot odds ~10x, with 65–80% continuation *(fan wiki, via search snippet)*.
- **Lesson:** *layer a second lottery on top of the physics.* The physical ball only earns a "spin", and the spin delivers staged suspense (reach) and a fever state. This puts jackpot spectacle into a rain of many balls without the player steering each one. It's how pachinko makes a stream of hundreds of balls exciting.

### 1.8 Casino / "Stake"-style Plinko (risk modes)
- The player picks **rows** (8–16) and a **risk level**. Low risk clusters near 1x. High risk drops the center well below 1x and puts huge multipliers on the edges. More rows means more variance. The paytable is always visible. ([esports.gg guide](https://esports.gg/guides/betting/how-plinko-works))
- **Lesson:** the one interesting decision in pure plinko is *choosing your variance*, and the danger is shown on the buckets. The Cauldron's Malice is a variance dial, but it's invisible (critique C4).

### 1.9 Idle plinko games (PlinkIdle, Plinko Idle Chaos, Plinkonomics, Plinko Idle)
- **PlinkIdle (itch/Steam 2026):** a reviewer praised the "hypnotic" drops and sound, then found click-and-hold dropping beats passive income 5/s vs 0.3/s, so idle feels pointless. Other complaints: upgraded pegs looked identical to old ones, and finished stages had no reason to revisit. ([IncrementalDB review](https://www.incrementaldb.com/community/review/4895))
- **The designer's own notes:** they worry that bursts "lose impact when the screen is already at constant peak intensity". Physics crashes from ball overload led them to propose **capping balls and multiplying ball worth after the cap**. They want prestige to change the board, not "do it again but faster". ([PlinkIdle devlog](https://black-heart-games-studio.itch.io/plinkidle/devlog/949621/plinkidle-game-design-discussion))
- **Plinkonomics:** random events, and an "Abyss" second floor at prestige 5. **Plinko Idle Chaos:** a prestige star shop with auto-buyers. ([Plinkonomics](https://boygamedev.itch.io/plinkonomics), [Plinko Idle Chaos devlog](https://itch.io/devlog/1092507/plinko-idle-chaos-version-040-released.amp))
- **Lesson:** this sub-genre is shallow by default: buy more balls, bigger multipliers, prestige. The good ones add *places* (new floors), *events*, and visibly different pegs. The Cauldron already beats most of them in systems, but it shares their "constant peak intensity" problem (60 balls).

### 1.10 Idle Breakout (Kodiqi, 2018–19): adjacent idle ball game
- Each ball type has its own role and **its own sound**. The Poison ball tags bricks for 2x as a support role. There are timed power-ups, like a 30 s "click fury" that spawns power balls where you click, and an effects toggle for busy late screens. ([Kodiqi devlog](https://kodiqi.itch.io/idle-breakout/devlog/57231/update))
- **Lesson:** active spikes in idle ball games work as **short timed frenzies**, not a permanent small multiplier. Distinct sound per ball type keeps a busy screen readable.

### 1.11 Luck be a Landlord (TrampolineTales, 2021): adjacent slot builder
- Each spin you add one symbol or skip. Symbols interact with neighbors through folk-logic pairs (cat + milk, diver + pearl). Removal and reroll let you thin the "deck", and thinning raises the odds of synergy. Critics note you have to memorize synergies. ([Rogueliker](https://rogueliker.com/luck-be-a-landlord-review/), [Laura Michet](https://blog.lauramichet.com/luck-be-a-landlord-is-about-learning-a-strangers-mental-map-of-the-universe/))
- **Lesson:** *thematic, guessable synergies* ("toad + thorn = split") make a random machine feel authored. Ballionaire credits it as an inspiration ([podcast listing](https://podtail.com/ru/podcast/openindie/)).

### 1.12 Balatro (LocalThunk, 2024): the scoring-juice benchmark
- Jokers fire one at a time with a pulse each, the score digits *roll* rather than swap, and big scores catch fire with escalating SFX. Analyses argue that the sequential reveal teaches players which combos matter. ([Blake Crosley analysis](https://blakecrosley.com/es/guides/design/balatro), [KrASIA](https://kr-asia.com/how-balatro-became-2024s-indie-darling), [Source Gaming](https://sourcegaming.info/2024/11/15/holism-breaking-balatro/))
- **Lesson:** escalation should be *visible on the counter itself*: number size, color and flame scaled to magnitude. That's directly relevant to proposal #4's "+3 looks like +81K".

---

## 2. Genre best practices (synthesis)

1. **Make one ball matter.** Peggle's 10 balls, BALL x PIT's catch-to-reload, pachinko's single start-pocket ball that spins the lottery. Tension needs scarcity and a ball the player authored. A rain of anonymous balls is ambience, not a game.
2. **An escalating audio ladder per ball.** Peggle raises the pitch with every peg hit in a chain, and Idle Breakout gives each ball type its own sound. Audio carries the combo state so the eyes don't have to.
3. **Stage the climax with slow motion and a zoom.** Peggle's Fever Cam on the last peg (and on near misses), and pachinko's "reach". Decide the outcome early, then stretch the reveal.
4. **A fever state that changes the board.** Extreme Fever's bonus bins, kakuhen's raised odds, jitan's wider gate. Fever should be a different *mode*, not just a bigger number.
5. **Layer a lottery on top of the physics.** Pachinko's spin-on-entry gives jackpot moments even when nobody steers a ball. It's the best fit for idle.
6. **Predictable physics, unpredictable compounding.** Peggle cut spinners so shots read. Variance should come from chains and triggers, not from noisy bounces.
7. **A build layer with placement and adjacency.** Ballionaire's triggers, Peglin's orbs and pegs, Landlord's neighbors. Pieces should change behavior (split, portal, crit-the-rest), not add +%.
8. **Thematic, guessable synergies plus a rule against loops.** Folk logic (Landlord), named fusions (BALL x PIT), once-per-ball triggers (Ballionaire).
9. **Variance as an explicit, visible choice.** Casino plinko's risk and rows, Peglin's Cruciball. Show the danger on the board and on the buckets.
10. **Rule-changing challenges extend a fixed toy.** Peggle Challenges and Trials, Ballionaire's tribulations and boards, Peglin's class feats.
11. **Escalating presentation of the number.** Balatro's rolling, flaming counter, and Peggle 2's reacting Master. Feedback size should track magnitude.
12. **Progress that survives failure.** BALL x PIT's city and blueprints mean "even a failed run doesn't feel wasted".

## 3. Pitfalls that make plinko boring

- **Constant peak intensity.** When everything is always busy, bursts don't read (PlinkIdle devlog; BALL x PIT SFX fatigue). This is the Cauldron at 60 balls (C1).
- **Pure luck with no authored input.** Raw pachinko (Sidhu's reason to abandon it), and Peglin's "too random to be strategic".
- **Pure optimization with no gamble.** A solved board kills the bounce thrill (AV Club on Ballionaire). The Cauldron's greedy-solvable +% trees and EV-normalized layouts are this pitfall.
- **Flat-number upgrades that look the same.** PlinkIdle's identical +1 pegs; Cauldron's Deeper Pot ×1.05 (X2).
- **Friction on the fun verb.** Peggle Blast's paywalled aim and balls; the Cauldron's 3 Ladles at 8 s recharge.
- **Difficulty as a flat penalty.** Peglin's Cruciball critique; the Cauldron's invisible Malice (C4).
- **Active play dominating idle, or idle dominating active.** PlinkIdle (clicks 15x passive) versus the Cauldron (active ~2.2x, skill spread ~1.4x). The target is spikes, not either flat extreme.
- **A silent or monotone soundscape.** The Cauldron's idle balls are silent (`scene.ts:713`).
- **Opaque synergy text.** Ballionaire and Landlord both draw "you must memorize" complaints. That's dangerous at 180×320.

---

## 4. Recommendations for The Cauldron

Constraints respected: portrait 180×320 pixel art; idle income must keep flowing and stay EV-computable (`idleRate` via the EV cache); keep Ladles and Tosses; no monetization.

| # | Recommendation | Why (gap) | Borrowed from | Cost |
|---|---|---|---|---|
| 1 | **A music-box rain with a pitch ladder.** Every ball tinks, quantized to a pentatonic scale with pitch set by row (idle balls quiet, max ~6 voices, round-robin). A *player* ball (tossed, ladled or Golden) climbs one scale step per peg hit, like Peggle, on its own brighter timbre, so you can hear your ball through the rain. Each bucket has its own chime. | X3, C1 (your ball is hard to see); proposal Q2 | Peggle pitch ladder; Idle Breakout per-ball sounds; BALL x PIT voice-limit lesson | S |
| 2 | **The Golden Spoon hero ball with Fever Cam.** Every ~60 s Granny loads a glowing hero ingredient worth about 1 min of income × bucket mult. You toss it and ladle it. Over the last 3 rows: slow motion, a 2× zoom on the 180 px board (crop to a 90 px window around the ball), and a drumroll. A near miss on the jackpot still triggers the cam and a "SO CLOSE" groan. Excluded from `idleRate`, like Ladles. | C1, X1 (one ball that matters, active spikes) | Peggle Fever Cam, 10-ball scarcity | M |
| 3 | **A Cauldron "reach" lottery and Bubble Fever** that works idle. Any ball (toadling ones included) that lands in the center bucket drops a token into a 3-bubble slot on the pot. Two matching bubbles = **REACH**: the pot rumbles, Granny leans in, and the third bubble rises slowly. A match starts **Bubble Fever** for 15 s: the center bucket widens by one column (jitan) and pays ×2. Some fevers chain (kakuhen, ~50%). The EV is closed-form (p_center × p_match × fever value), so it folds straight into `idleRate`. This gives idle viewers jackpot moments without steering. | C1, X1, X3; constant intensity broken into peaks | Pachinko start pocket, reach, kakuhen, jitan | S–M |
| 4 | **Ingredient fusion recipes plus a Codex.** When two specials hit the same Thorn or Rune peg within 0.5 s, they fuse into a named evolved ingredient: Splitroot + Boomshroom = **Cluster Pudding** (splits into 3 bombs), Lead Heart + Wisp Salt = **Plumb Bob** (drops straight into the jackpot). First discovery gives a Codex entry, a Granny line and a Batch Token. Replace the generic ticket with "brew a [fusion]" orders. | C3 (tickets are chores), X2 (no discoveries) | BALL x PIT fusion/evolution; Landlord folk-logic pairs | M |
| 5 | **Persistent peg cards: a light board-builder.** Each Batch offers 1 of 3 peg cards (Splitter, Portal, Echo, Crit-Ladle, Bone, Cauldron Mouth). You place it on any iron peg, and it stays for the cycle. A Fall wipes it, so each cycle is a new build. Ballionaire's rule applies: each ball fires each card once, and a portal resets it. Cards affect *toadling* balls too, so a placement decision raises idle income. The EV cache already reruns on board change. Drop `layoutNorm` so layouts and builds really differ. Cap at ~8 cards so it stays readable at 2 px pegs (distinct 3×3 glyphs). | C1, X2, proposal "layoutNorm" cut; a decision layer that works idle | Ballionaire triggers; Peglin Crit/Refresh pegs | M–L |
| 6 | **Make Malice a visible risk dial.** Show it as a "risk table" like casino plinko: raising Malice visibly reshapes the bucket strip (center grows and glows red, inner buckets shrink to ≤1x), adds visible Bumper pegs with a red tint, and makes Granny's voice harsher. Add 1–2 **rule cards** per Malice tier ("Gold pegs move 2x", "Ladles last 2 s but kick 2x") instead of the invisible peg removal. | C4; Peglin Cruciball critique (rules, not penalties) | Stake-style Plinko risk modes; Peglin Cruciball; Ballionaire boards | S–M |
| 7 | **Turn tickets into scarce-shot Bounties.** Every ~90 s a timed bounty takes over: you get exactly 5 Spoon tosses ("land 3 in ×5+ with 5 spoons"). Success turns the bucket floor into Extreme Fever bins for 5 s (every bucket pays the jackpot mult, plus Ode-to-Joy-style "Granny's Hymn"). Failure costs only the bounty. | C3, X1; proposal Q6 | Peggle 10 balls and Extreme Fever buckets | S |
| 8 | **Thin the rain, and make the counter escalate.** Past ~20 balls, raise ball *value* instead of count (merge into "Heavy" variants with bigger sprites, keeping MAX_BALLS around 30), so player balls stay legible. Add a Balatro-style rolling Bile counter whose digits grow, turn green-gold and steam as the per-second rate climbs. Size floats by magnitude: +3 tiny, +81K big and shaking. | C1, X4, proposal #4 (all numbers look alike) | PlinkIdle cap-then-scale; Balatro rolling, flaming score | S |
| 9 | **Daily Brew.** One seeded board a day (layout, peg cards, special ingredient, one bounty), 3 attempts, a personal best and a streak flame, and Granny teases tomorrow's ingredient in the return report. It gives an appointment hook without push notifications. | X5, proposal #1 | Daily-seed roguelike practice *(memory: Spelunky, Peglin community seeds)* | M |

**Suggested order:** 1 + 8 (feel, a few days), then 7 + 3 (spikes and idle jackpots, about a week), then 2, then 6, then 4, then 5 and 9 when the Cauldron gets flagship time. Items 1, 3, 6 and 8 improve the idle-first department without asking for more attention. Items 2, 5 and 7 are where attention starts paying 5–10x instead of a flat ~2x.
