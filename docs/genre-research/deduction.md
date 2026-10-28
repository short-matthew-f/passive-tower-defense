# Inspection, deduction and haggling games: research for The Troll Bridge

Date: 2026-10-28. Scope: what the Papers, Please family, the deduction-puzzle family (Obra Dinn, Golden Idol, Her Story), and the shopkeeping and haggling family (Recettear, Moonlighter, Potion Craft, Potionomics, Shop Titans) can teach the Bridge.

Inputs read first: spec `/home/user/passive-tower-defense/docs/specs/06-troll-bridge.md`, critique `/home/user/fun-review/raw/depts-b.md` (B1-B6, P10-P15) and `/home/user/fun-review/proposal.md`. The critique's two central findings shape everything below:
- **The answer key is on the wall.** The Poster board lists all 7 tell icons, which never change. Smugglers always show their first tell. 74% of heroes show 2+ tells. Accuracy is about 100% after memorizing.
- **The haggle reveals the wallet.** `reply()` counters at exactly the Wallet when Haggler's Tongue is 0, so the dominant line is "ask high, read the counter, push once."

**A note on sources.** The web-search budget for this session ran out before every lead was followed. Claims backed by a URL are cited inline. A few details come from general genre knowledge and are marked *(unverified here)*.

---

## Part 1. Game-by-game notes

### 1. Papers, Please (Lucas Pope, 2013; portrait phone port 2022)
- **Fair but hard.** Every verdict checks out against documents on the desk: names, dates, seals, photos, all of which can be cross-checked. Errors are small (a date one day out, a slightly wrong seal), so you *can* miss one, but you never have to guess. Pope says the bureaucratic framing "made it easy for me to fill out a complex set of gameplay-oriented rules and regulations" ([Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)). He also "cut back on some of the randomness he initially wanted" because too much of it overwhelmed players and broke the balance ([Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please)). The lesson is that difficulty should come from rules, not from dice.
- **Rules escalate.** About one new rule or tool a day, introduced in a fixed order: Day 1 Arstotzkans only. Day 2 documents must be current, plus inspection. Day 3 entry ticket. Day 4 entry permit, ID and fingerprints. Day 5 detain. Day 6 work permit. Day 7 search and bribes. Day 8 forgeries ([modding docs day table](https://paperspleasemoddingdoc.readthedocs.io/en/latest/txt-csv/Days/), [wiki Rulebook](https://papersplease.fandom.com/wiki/Rulebook)). Rules also *expire* (the entry ticket lasts only Day 3, and the permit lasts Days 4-26). Expiring rules keep players from going on autopilot. Story reasons ("political intervention") justify each change.
- **Mistakes and stakes.** You get 2 free warnings a day, then 5, 5, 10, 15... credits a citation ([wiki Citation](https://papersplease.fandom.com/wiki/Citation), [ludo.guide](https://www.ludo.guide/guide/papers-please/citations)). Pay comes per correct entrant and goes to rent, food, heat and medicine. Debt ends the game ([Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please)). The fax arrives *right after* the mistake, so the feedback is immediate and the bill comes later.
- **Pacing.** A real-time shift clock, a queue visible outside the booth, and an end-of-day ledger. Pope found "the bulletin is basically ignored when you've got someone to talk to right away", so rule introductions had to be timed with care ([Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)). He describes the schedule as "this complicated network of dependencies".
- **Narrative and morality.** Scripted encounters (the "spouse without papers", EZIC agents, bribes) sit on top of random entrants. Twenty endings. Pope kept things "vague and non-judgemental" and left the family "largely unspecified" so players project onto them (Game Developer, above). Critics note the ethics are emergent from the money mechanics: pay per correct stamp against mercy ([PopMatters](https://popmatters.com/183289-papers-please-morality-2495645423.html), [Games Criticism](https://gamescriticism.org/2023/07/24/do-you-feel-like-a-hero-yet-externalised-morality-in-video-games/)). Recurring faces such as Jorji, the cheerful smuggler who keeps coming back with worse papers, give stamps a memory *(unverified here)*.
- **Replayability.** Randomized Endless modes, one "limited only by the player's error count" (Wikipedia).
- **Mobile relevance.** The phone version is **portrait-only**, with new touch UI, retuned timers and booth upgrades cut to one ([Android Police](https://www.androidpolice.com/papers-please-android-release/)). Reviewers felt touch made the iPad version "more personal", and a vertical layout used the screen better ([TouchArcade](https://toucharcade.com/2014/12/15/papers-please-for-ipad-review/), [TheSixthAxis](https://www.thesixthaxis.com/2015/01/07/mobile-watch-papers-please/)). This is proof that the full genre works on a portrait phone.

### 2. That's Not My Neighbor (Nacho Sama, 2024)
- **Fair but hard.** You are a 1955 doorman checking residents against records ([Steam](https://store.steampowered.com/app/3431040/Thats_not_my_Neighbor/), [itch.io](https://nachogames.itch.io/thats-not-my-neighbor)). One review stresses that "randomized details that change for residents each day mean you can never simply memorize patterns" ([Medium review](https://medium.com/@dsibe.top/review-of-thats-not-my-neighbor-unraveling-the-paranoia-7ca493183b65)). That is exactly the cure for the Bridge's static answer key. Tells come in tiers: document mismatches (ID, entry request, resident list) and body tells (eyes, teeth, smile), with new checking tools added day by day *(details unverified here)*.
- **Escalation.** Doppelgangers "conceal a mask or mimic body movements or manipulate documents" in later days ([TapTap review](https://www.taptap.io/post/9395939)). Arcade and Nightmare modes extend play.
- **Stakes.** Letting a doppelganger in costs a resident, and you see the consequence later. Calling the D.D.D. on a human also has a cost. Both errors are punished, so neither "deny all" nor "admit all" is safe *(unverified here)*.
- **Takeaway.** A cheap, cartoony, viral take on Papers, Please. It shows that face-level visual tells work at low resolution *when they are re-randomized per day*.

### 3. Return of the Obra Dinn (Lucas Pope, 2018)
- **Fair but hard.** Every identity can be reasoned from clues seen in memories, the crew sketch, the roster and the ship plan. Pope tracked character-fate links in spreadsheets so the chains are always followable ([Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)). Some deaths accept multiple valid answers, so ambiguity is forgiven, not punished.
- **Anti-guessing.** Fates are **confirmed only in sets of three**, so you can't brute-force a single slot. Players note this keeps "educated guesses based on deduction" viable while blocking random entry ([Steam discussion](https://steamcommunity.com/app/653530/discussions/0/1741104717711187168), [Nintendo World Report](https://nintendoworldreport.com/review/51991)). Later deduction games copied this "three correct before lock-in" rule (Wikipedia).
- **Structure.** A PAX demo confused players, so Pope reorganized the content into ten chapters with the logbook as the timeline (Wikipedia). Even pure-deduction games need sequencing.
- **Weakness.** Little replay value after one solve ([Wikipedia reception](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)).
- **Takeaway.** Batch-confirm verdicts, accept partial ambiguity, and make sure every answer is derivable.

### 4. The Case of the Golden Idol (Color Gray Games, 2022)
- **Fair but hard.** The team removed clues that let players skip steps ("we had to remove that clue because it was making parts of the game superfluous"). They playtested early and often to decide "what parts needed simplification and what needed obfuscation" ([Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/-the-case-of-the-golden-idol-i-used-frequent-testing-to-improve-its-mystery-solving)). They also report a "roof of complexity" past which puzzles stop being fun ([Wikipedia](https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol) citing Thinky Games).
- **Feedback.** The game shows an indicator "when you have two or fewer mistakes in a category" ([RPGFan](https://www.rpgfan.com/review/the-case-of-the-golden-idol/)). This is the cautionary tale: players and critics say it makes brute-forcing "way too easy" ([Quarter to Three forum](https://forum.quartertothree.com/t/detective-games/120211?page=18), [Digital Trends on the sequel](https://qa2.www.digitaltrends.com/gaming/the-rise-of-the-golden-dol-review)). Feedback that is too precise *becomes* the answer key, the same failure as the Bridge's exact-Wallet counter.

### 5. Her Story (Sam Barlow, 2015)
- **Deduction.** A keyword search shows 5 clips at a time. The player supplies all the inference, and the game never grades you ([Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game)), [Giant Bomb](https://giantbomb.com/reviews/her-story-review)). Barlow added ambiguity after studying real police interviews ([Game Developer IGF](https://gamedeveloper.com/audio/road-to-the-igf-sam-barlow-s-i-her-story-i-)).
- **Takeaway.** The player's tool sets the ceiling of the deduction. Limiting the view (5 results, or 3 crop slots on the Bridge) creates the work. That only holds if the hidden information *matters*.

### 6. Not For Broadcast (NotGames, 2020-22)
- **Pressure from juggling.** You run four live camera feeds, bleep swearing in real time and cut to ads, while electrical faults interrupt ([Epic Store/news](https://store.epicgames.com/news/not-for-broadcast-captures-the-high-octane-rush-of-managing-a-newsroom)). Ratings, advertisers and "the bigshots upstairs" score you. Earlier choices carry into later episodes ([Prima](https://primagames.com/news/not-for-broadcast-episode-2-update)).
- **Takeaway.** Attention split between a *routine* task and a *rare urgent* task (the bleep) is itself tension. On the Bridge, routine pricing plus a rare liar is the same shape, *if* routine pricing is fast.

### 7. Contraband Police (Crazy Rocks, 2023)
- **Inspection plus search.** Any small mismatch across documents means refusal. Intelligence flags suspicious drivers, whom you search with a UV light and tools to find hidden compartments ([Steam](https://store.steampowered.com/app/756800/contraband_police/), [Thumb Culture](https://www.thumbculture.co.uk/contraband-police-ps5-review)). Smugglers offer bribes, and some run the checkpoint ([GameGrin](https://www.gamegrin.com/reviews/contraband-police-review/)).
- **Weakness.** Reviewers call the choices "binary" (GameGrin).
- **Takeaway.** A *physical search* minigame (where to look) turns a yes/no SEARCH into a skill. The "flagged by intel" tip is the cousin of the Wanted Poster.

### 8. Do Not Feed the Monkeys (Fictiorama, 2018; 2099 sequel 2023)
- **Observation under budget.** You watch caged "monkeys" through cameras, piece together their lives and choose whether to intervene, while sleep, food, rent and a job eat your time ([Xbox Store](https://xbox.com/en-GB/games/store/1/9N8QGLQSKR77)). One review says the result is "a busy and frustrating situation in which you have a limited amount of time to complete some of these objectives" ([TapTap](https://www.taptap.io/es/post/5667988)).
- **Takeaway.** Information that appears only at certain times creates appointment play, with the risk of frustration if a miss is permanent.

### 9. Strange Horticulture (Bad Viking, 2022)
- **Deduction.** You match customer requests to plants using a field guide whose drawings "only depict a small part of the plant", plus written descriptions, a loupe and elimination ([Wikipedia](https://en.wikipedia.org/wiki/Strange_Horticulture), [PC Gamer 90](https://www.pcgamer.com/uk/strange-horticulture-review/)). Critics are split: some found it straightforward, while others note "the game will straight up tell you the name" too often ([GameSpew](https://www.gamespew.com/2022/01/strange-horticulture-review/), [Room Escape Artist](https://roomescapeartist.com/2024/06/08/strange-horticulture-review/)).
- **Takeaway.** A **reference book the player has to cross-read** (partial picture plus text) is fair and chewy. When the game names the answer, the puzzle dies. That is the Bridge's Poster board problem.

### 10. Cultist Simulator (Weather Factory, 2018)
- **Reading as discovery.** The team "wanted to make a game where understanding the game was itself the game", so it shipped with no tutorial. "Aha!" moments "are most exciting when the game has seemed opaque", but early builds were "almost unplayable". They fixed this with breadcrumbs in flavor text, and capped text at about 25% of Fallen London's ([MCV](https://mcvuk.com/development-news/when-we-made-cultist-simulator/), [Into the Spine](https://intothespine.com/2018/04/24/interview-cultist-simulator/)).
- **Takeaway.** Players can *learn* tells from flavor (Codex lines) instead of being told them, but only with enough breadcrumbs.

### 11. Inscryption and I'm Not a Robot (rule escalation)
- Inscryption keeps adding exceptions "so frequently that the game keeps changing before players settle in" ([Xbox Tavern](https://www.xboxtavern.com/inscryption-review/), [PSU blog](https://sites.psu.edu/rcc5418/2022/09/24/inscryption-value-through-variety)).
- neal.fun's I'm Not a Robot runs 48 levels that start with familiar CAPTCHAs and twist them each level ([BGR](https://bgr.com/2065984/worlds-most-annoying-captcha-im-not-a-robot/), [Destructoid](https://www.destructoid.com/remember-that-one-wildly-popular-browser-game-from-2024-its-creator-is-trying-to-run-it-back-with-a-new-title/)).
- **Takeaway.** Each rule should be a **twist on a known verb**, not a new screen. That is cheap content with a high surprise value.

### 12. Haggling and shopkeeping: Recettear, Moonlighter, Potion Craft, Potionomics, Shop Titans
- **Recettear (EasyGameStation, 2007/2010).** Each customer type has a **budget and a tolerance %** that differs by type (girl, adventurer, Louie...). Community tables chart sell percentages per type ([Recettear Wiki](https://recettear.fandom.com/wiki/Pricing_Strategies)). Reputation rises faster when a sale closes *without* haggling ([Steam thread](https://steamcommunity.com/app/70400/discussions/0/1474222595290587328)). Pricing close to the customer's limit pays combo or "Just" XP bonuses *(unverified here)*. The lesson: **reward reading the person's type**, and make greed cost something other than the sale.
- **Moonlighter (Digital Sun, 2018).** You can't see an item's value. You set a price and watch **four reaction faces** (ecstatic, happy, grudging, refuses). A ledger records the best price at each reaction, so you learn over time ([Siliconera](https://siliconera.com/?p=709874), [PC Gamer](https://www.pcgamer.com/uk/in-moonlighter-youre-part-adventurer-part-shopkeeper)). Reviewers enjoyed "finding a customer's sweet spot" and felt real regret at underpricing ([biffbampop](https://biffbampop.com/2018/07/17/in-the-game-moonlighter-is-fun-addictive-dungeon-crawling/)). Demand shifts so that old knowledge decays ([Ice Cream for Everyone](https://willem-icfe-en.beehiiv.com/p/pricing-in-moonlighter)). The lesson: **the price discovery is the game**, the ledger turns it into long-term learning, and demand drift keeps it from being solved.
- **Potion Craft (niceplay, 2022).** A timing bar: click while the arrow is inside an icon to raise the price, and misses lower it. Difficulty narrows the windows but pays more ([Steam discussion](https://steamcommunity.com/app/1210320/discussions/0/3728448512599838786), [Wikipedia](https://en.wikipedia.org/wiki/Potion_Craft)). It is quick and skill-based, but some players found it under-explained.
- **Potionomics (Voracious, 2022).** Haggling is a **card battle**: raise *Interest* before *Patience* runs out, while the customer applies *Stress*. The customer's **next move shows in a thought bubble** ([Gamepur](https://www.gamepur.com/guides/how-haggling-works-in-potionomics), [Prima](https://primagames.com/reviews/potionomics-review)). The designer built it around "openers" and "closers" because "there aren't a lot of games about talking", and tied card unlocks to relationships ([Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-potionomics-turned-price-haggling-into-a-card-game)). The lesson: **telegraph the opponent's intent, not their number.** A visible meter of patience makes the push-your-luck readable.
- **Shop Titans (Kabam, mobile).** Every sale offers **Surcharge** (more gold, costs Energy) or **Discount** (less gold, gains Energy) ([BlueStacks guide](https://www.bluestacks.com/blog/game-guides/shop-titans/shopt-tips-tricks-en.html), [PocketGamer](https://www.pocketgamer.com/shop-titans/guide/)). The lesson for mobile: one tap per customer, and greed is a **budgeted resource across the session**, so each surcharge is a choice about *which* customer to squeeze.

---

## Part 2. Synthesis

### 2.1 Strongest genre best practices
1. **Truth is checkable, so errors feel like your fault.** Every correct answer can be derived from information on screen (Papers, Please documents, Obra Dinn's spreadsheet-checked chains, Golden Idol's removal of shortcut clues). Difficulty comes from **volume and cross-referencing**, not from hidden dice. Pope cut randomness for exactly this reason.
2. **Today's rules aren't yesterday's.** Papers, Please adds rules and also retires them. That's Not My Neighbor re-randomizes the details daily so "you can never simply memorize patterns". Moonlighter's demand drifts. A rule set that never changes becomes a lookup table.
3. **Both kinds of error cost something.** Letting a liar through *and* accusing an innocent must both hurt (Papers citations, That's Not My Neighbor victims, Contraband Police fines). If only one side is punished, "accuse everyone" or "wave everyone through" wins.
4. **Grace, then a bill.** Papers gives 2 free citations a day, then escalating fines. Instant feedback (the fax) plus a delayed ledger keeps a mistake from feeling like a cliff and still makes the third one sting.
5. **A shift with an end.** A clock, a visible queue and an end-of-day report. The report is where stakes become story (rent, family, ratings in Not For Broadcast).
6. **Show intent and mood, never the number.** Moonlighter's 4 faces, Potionomics' thought bubble and Patience meter. The player infers the Wallet from behavior and history (Moonlighter's ledger), not from a counter that equals it.
7. **Greed is a budget.** Shop Titans' Energy and Potionomics' Patience and Stress make squeezing one customer cost something later, which turns pricing into allocation.
8. **Escalate by twisting known verbs.** Inscryption and I'm Not a Robot pile exceptions onto one familiar interaction. Papers adds one document or tool at a time. New rules are cheap content when they reuse existing art.
9. **Batch confirmation blocks brute force.** Obra Dinn's sets of three. Golden Idol's "2 or fewer wrong" shows the opposite failure: feedback that is too precise.
10. **Faces with a memory.** Recurring entrants (Jorji), scripted encounters on top of random ones, and consequences that return (Not For Broadcast, That's Not My Neighbor). They are what makes a stamp a moral choice.
11. **Learn by reading, with breadcrumbs.** Cultist Simulator and Strange Horticulture teach through flavor and partial references. Opaque is fun only if the clues are there.

### 2.2 Pitfalls
- **The answer key.** A board listing every tell (the Bridge's Poster), Strange Horticulture naming the plant, or Golden Idol's precise error indicator. If the game tells you, there is nothing to deduce.
- **Feedback that leaks the hidden state.** The Bridge's counter equals the Wallet. It is the haggle version of Golden Idol's brute-force leak.
- **No stakes, or one-sided stakes.** "Nothing ever drains banked Tollpence" plus a 4-12 coin false-accusation cost means there's no dread. Papers, Please without rent is a sorting toy.
- **A repetitive loop with sparse interest.** One decision in 12 matters on the Bridge (critique B3). Not For Broadcast and Papers keep the routine work *fast* so the rare case gets your attention.
- **Rules arrive too slowly.** Papers adds one roughly every in-game day (a few minutes of play). The Bridge's Menace cards are hours apart (critique B4).
- **Losing to the input, not the judgment.** The Bridge's 1.7 px-per-notch coin stack (critique B5). Contraband Police and the Papers port both retuned controls for their platform.
- **Too opaque.** Early Cultist Simulator was "almost unplayable". Removing the answer key must come with in-world breadcrumbs (a Codex, Grumm's thought bubbles).
- **Permanent misses on a timer.** Do Not Feed the Monkeys frustrates players when the clock eats content. In an idle game, missing a day must never feel like losing content forever.
- **Exhaustible content.** Obra Dinn has little replay value. Daily seeding plus an endless mode (Papers) avoids this.

### 2.3 Recommendations for The Troll Bridge

Constraints respected: 180x320 portrait pixel art, icon-only Grumm (decided OQ 27), 30 s to 5 min sessions, and goons that keep earning while you're away. These build on the critique's P10-P15 and do not repeat them where the critique is already specific. Each item names its source and the reason.

**R1. The Rulebook replaces the Poster board: a daily "Decree" with only today's tells. (S)**
- *What:* The wall shows **today's** seeded liar set (3-4 of ~12 large parts, per critique P11) as pictures only, with no "= UNMASK" labels. Yesterday's tells move to the Codex as "old news". One tell a day **expires** and one is added. On Day 1 of a cycle only, the board stays fully labeled as a tutorial.
- *Why:* Papers, Please rules both appear and expire. That's Not My Neighbor's daily randomization defeats memorizing. Strange Horticulture's partial drawings make the player cross-read.
- *Pixel and mobile:* reuses existing part sprites at 16x16 in the existing Poster slot.

**R2. Both errors cost something, with Papers-style grace. (S)**
- *What:* Two free mistakes per Shift (Grumm shrugs). From the 3rd mistake on, each costs an escalating **fine from the Shift purse** (not the bank): 5%, 5%, 10%, 15% of the purse. A hero let through on screen costs the purse (not just a Whisper pip) *and* returns later (R6).
- *Why:* Papers' 0, 0, 5, 5, 10 citation curve, and two-sided stakes from That's Not My Neighbor and Contraband Police. Stakes stay confined to the Shift, so banked Tollpence is still safe and the idle promise holds.

**R3. Haggle by mood, not by number: 4 reaction faces plus a Patience pip bar plus a Grumm ledger. (S)**
- *What:* Counters land at Wallet x U(0.8, 1.0) (critique P12). Add a visible **Patience bar of 3 pips** (Potionomics) that each push spends. Show a Moonlighter-style **4-face mood scale** as the price moves. The traveler type's **ledger** in the Codex records "best price per mood" for that type *today*. Wallets drift daily (Moonlighter demand), so the ledger never fully solves it.
- *Why:* Moonlighter's price discovery and ledger, and Potionomics' telegraphed intent. The counter stops being the answer.
- *Pixel:* 4 face sprites at 8x8 and 3 pips. They fit the existing speech-bubble row.

**R4. A Greed budget per Shift (Shop Titans Energy). (S)**
- *What:* Each Shift gives Grumm, say, 6 **Glower** charges. Pricing above STEEP spends one. Accepting FAIR on an honest peasant refunds half a charge. Combine this with critique P13's 4 price buttons and a one-flick FAIR for the routine 80%.
- *Why:* Shop Titans' surcharge/discount energy turns "always max the price" into choosing *whom* to squeeze. Recettear rewards closing without haggling. It speeds up the routine travelers, the Not For Broadcast lesson that the boring part must go fast.

**R5. Verdict confirmation in batches: a "Tally" at the end of each Shift. (S-M)**
- *What:* SEARCH still pops the barrel at once, because that is the fun moment. UNMASK *bounty size* and missed-hero reveals, though, settle in the Shift report: "3 of your 4 unmasks were heroes." Show the tally in groups so no single verdict is confirmed in isolation. Grumm stamps the report with 0-3 stars (critique P10 and proposal B1).
- *Why:* Obra Dinn's sets of three block spam-guessing and keep the inference honest. Papers' end-of-day ledger turns mistakes into a story. It also moves dread to one beat at the end, which suits a 3-minute session.

**R6. Faces that come back: a Rogues' Gallery of named repeat travelers. (M)**
- *What:* About 6 named recurring characters, built from existing parts plus one signature item. Examples: **Eel Man** the smuggler, who returns with sillier disguises; **Dame Osric** from the Poster, who comes back with a *new* disguise if she slipped through; and an honest Widow who can't pay, a mercy choice that costs the purse but earns a Codex page and a later favor. A slipped hero becomes a Dungeon Champion (critique P14).
- *Why:* Jorji and the scripted encounters in Papers, plus carried consequences in Not For Broadcast. It gives verdicts a future and gives the Fall's Legend a lead-up.
- *Mobile and idle:* recurring travelers can appear in Gobbo's report ("Eel Man tried the goons. They let him through. Again."), which makes the idle side feed the story.

**R7. Rule cards as twists, one per Shift, retired on schedule. (M)**
- *What:* Turn Menace cards into a ~20-card pool (critique P10). Each card **twists an existing verb or part**: "Pilgrims may wear boots (rain)" *inverts* a tell, "Writs need a BLUE seal" adds a cross-check, "No one to the Fort" denies by Claim, and "One of each Pair lies" brings back card 12. A new card always **arrives with a story beat** (Grumm holds up the card with a pictogram) *before* the first traveler, because Pope found the bulletin is ignored once someone is at the window. Menace sets how many cards stack (1-3).
- *Why:* Papers' daily rule order, and Inscryption and I'm Not a Robot twisting known interactions. Rules reuse art, so content is cheap.

**R8. A physical search, not a yes/no. (M)**
- *What:* SEARCH opens a 2-second **pat-down**: the traveler sprite gets 3 tap-zones (hat, pack, boots). The contraband is in one of them, and the right Rule card or tell points to which. A wrong zone wastes time and offends. It still fits within the 180x320 scene, because zones are large parts.
- *Why:* Contraband Police's UV search turns inspection into a skill and makes the eel reveal a find, not just a button press.

**R9. Breadcrumbs instead of labels: a Codex that teaches through flavor. (S)**
- *What:* Each unmask or confiscation unlocks a Codex page with a pictogram rhyme or icon pair ("glow + bare feet = ?"). Grumm's squint thought bubble (already specced) shows a **?** icon on one crop when you hold, not the answer.
- *Why:* Cultist Simulator's breadcrumbs and Strange Horticulture's field guide. Removing the answer key (R1) without these would recreate early Cultist Simulator's "almost unplayable" opacity. Icon-only fits OQ 27.

**R10. Daily seeded "Border Challenge" with a personal best (endless mode). (S-M, later)**
- *What:* Once a day, the same seeded 25-traveler queue for everyone, played to 3 errors. Show the score and streak.
- *Why:* Papers' Endless mode "limited only by error count", and the Obra Dinn replay problem solved by seeding. It gives the Bridge a reason to open beyond collecting. Only ship it if Shifts prove fun (proposal rollout gate).

| # | Recommendation | Main source | Cost |
|---|---|---|---|
| R1 | Daily Decree, today-only tells, no labels | Papers, Please; That's Not My Neighbor; Strange Horticulture | S |
| R2 | Two-sided stakes, 2 free mistakes, then escalating Shift-purse fines | Papers, Please citations | S |
| R3 | Mood faces, Patience pips, drifting wallets, ledger | Moonlighter; Potionomics | S |
| R4 | Greed budget (Glower charges), one-flick FAIR | Shop Titans; Recettear | S |
| R5 | Batched Tally at Shift end | Obra Dinn; Papers ledger | S-M |
| R6 | Rogues' Gallery of recurring travelers with consequences | Papers (Jorji); Not For Broadcast | M |
| R7 | Rule-twist pool, announced before the queue | Papers; Inscryption; I'm Not a Robot | M |
| R8 | 3-zone pat-down search | Contraband Police | M |
| R9 | Codex breadcrumbs, a squint "?" | Cultist Simulator; Strange Horticulture | S |
| R10 | Daily seeded Border Challenge | Papers Endless | S-M |

**Suggested order:** R1 + R3 + R9 together (removing the answer key needs the breadcrumbs), then R2 + R4 + R5 inside the critique's Shift build, then R7 + R6, then R8 and R10 if the fun rating moves.

**Target to tune toward:** skilled accuracy of about 75-85% (critique P11). A Shift should hold about 25 travelers with about 1 interesting decision in 3, against about 1 in 12 today. The idle and goon rate stays flat and is lifted only by Shift stars, so nothing is lost while you're away.
