# Overlord: from 4/10 to 7+/10

> **TL;DR**
> 1. **Most important change: add Shifts.** A Shift is a 3-minute scored run you can lose, and its 0-3 stars set that department's income for the next 8 hours (B1). Build it first for the Bridge. Today you open the app, collect and close. With Shifts you play one tense round and the result lasts all night.
> 2. You forget to play because nothing calls you back and nothing is waiting. Give the next Legend a name, a silhouette and a dawn appointment (A7). Then add real push (B2), but only once the app is installed on the home screen. It needs a small server. There are no local scheduled notifications on the web.
> 3. On your iPhone the game is silent and never buzzes. Fix that and the juice in week 1 (A1, A2). It's cheap, and nothing else feels good until it's done.
> 4. Seven half-games split your attention. Pick one department as today's focus (B3) and spend the new work on three flagship departments, not on systems copied seven times.
> 5. Measure it with a local playtest log and a daily 1-10 rating. If the Bridge Shift doesn't raise the rating, stop before building six more.

Synthesised from eight critic reports (retention, feel, choices, pacing, meta, and three department audits) in `/home/user/fun-review/raw/`, then stress-tested by a skeptic pass (see **Skeptic's notes** at the end). Every critic reached the same core finding by a different route.

---

## Why it's a 4/10

**1. Nothing calls you back, and coming back feels the same every time.** Overlord never reaches outside the app: there's no push, no icon badge and no daily hook (a grep finds none). The spec explicitly chose "no push at launch". Inside the app, a 10-hour absence and a 3-day absence produce *identical* Gobbo reports, because the 8 h cap quietly ate 64 hours. Infamy never advances offline, so in the sim's "forgetful" profile the player gets **zero Falls in 7 days**. The good hooks already in the game are buried. Pumpkin Hex season started *today* and appears only as a Cauldron spoon. The Wanted Poster sits inside the Bridge. Legends wait in silence, and every Fall brings back the same one. You forget to play because the game never asks you to come back and never gives you anything to look forward to.

**2. Your hands barely matter.** The sim *targets* active play at 2-3x idle. An expert out-earns a novice by only ~1.4x. About 90% of each cycle's progress happens while you're away (Dungeon first Fall: 19 AE-hours, 0.58 h on screen). On top of that, the Infamy economy gate is log-scaled, so it sits at 85-99% for one to two days while nothing you do moves it. In the Spire, a dumb bot's active income is *below* its apprentices' idle income. The game has taught you, correctly, to collect and close.

**3. No stakes and no real decisions.** About 200 upgrade rows each add +X%. The balance sim and the Steward both run the same greedy "best Δincome/cost" bot, which shows the trees are solved. Difficulty dials are gates you must raise, and raising them is always right. You can't lose in the Dungeon. The Spire flask never filled across 500 drops. The Bridge prints its answer key on the wall, and its haggle counter reveals the traveler's true wallet. Cauldron layouts are EV-normalised, so they're only cosmetic. Nothing can go wrong, so nothing feels earned.

**4. On your iPhone it's mute, buzz-free and tiny.** All 93 `haptic()` calls use `navigator.vibrate`, which iOS ignores. The silent switch mutes WebAudio, and the Dungeon and Throne Room have no sound at all. Every number uses one 3x5 font at one size, so "+3" and "+81K" look alike. Screen shake is 1 px. Buying an upgrade has no sound, flash or float. The hub is seven black rectangles, and the Fall is a text box with no picture of the Legend. Nothing gives you a felt reward.

**5. Breadth instead of depth, and the best content comes last.** Seven departments copy one template: 15 currencies, an "INF %" bar, a dial and a Fall. Each gets about 7 minutes of attention a day. Seal prices were raised 6-15x to match a spec calendar. So you judge the game on plinko and tap-mining, while the Bridge, Spire and War Pit (the games with real decisions) arrive on days 2, 4 and 6. Prestige rebuys the same tree for +10%, each department has one Legend who repeats forever, and nothing new happens after day 6.

---

## The plan

Each item lists: what changes · root cause(s) fixed · impact · cost · how it plays.

### A. Quick wins (S cost, high impact, no server)

**A1. Sound and touch on iPhone.**
- **Sound:** on first tap, set `navigator.audioSession.type='playback'`, behind a "sound on silent" toggle that defaults to on. Feature-detect it. Where it's missing, fall back to the known trick of starting a looping silent `<audio>` element on that tap, which lets WebAudio play with the switch on silent.
- **Haptics:** on iOS 18+, route `haptic()` to the hidden `<input type=checkbox switch>` click trick, rate-limited to about one per 60 ms.
  - *Limits:* this is an undocumented hack. It fires only inside a touch handler, so it works for taps (a Mines crit, a hook set, a buy, a merge drop) but not for timer-driven events (Pit hits, balls landing). Choose call sites with that in mind, keep `vibrate` for Android, and expect Apple might break it.
- **Feedback:** add a rising-pitch chime, a row flash and a haptic to `sheet.ts buy()`, and give the Dungeon and Throne Room basic sound effects.
- · #4 · HIGH · S · *A Mines crit clicks under your thumb and crunches, even with the phone on silent.*

**A2. Juice pack.**
- One shared `juice.ts` provides decaying 2D shake (2/4/6 px) and hit-stop (30-80 ms). Use it at Styx HOOKED!, Pit hits, Spire T5+ merges and Bridge verdicts.
- Floating numbers scale 1x/2x/3x with their value relative to income and punch in when they appear.
- The HUD bank counts up and pulses when coins land.
- Rates read "/h" or "FULL 23:10" instead of "+0.0069/s".
- · #4 · HIGH · S · *A T7 merge throws a bouncing 3x "+1000" into a counter that ka-chunks up.*

**A3. A Next Goal ribbon, and a report that hands you a goal.**
- A one-line strip in every scene shows the nearest milestone and its ETA ("LEGEND AT THE KITCHEN · ~3h40", "BRIDGE SEAL 42/60 · 2 min"). When you reach a goal, the manager cameos.
- Gobbo's report opens with a headline (the best event), then "YOU CAN NOW AFFORD X [GO]".
- The GO list becomes free, no longer locked behind the 500-Tribute Satchel.
- A tap-to-open Gobbo's Sack replaces the return-ritual taps. Its tier depends on how long you were away.
- · #1, #2 · HIGH · S · *You open the app to "THE STYX LANDED A MOON WITCH · you can afford Toadling Kitchen 4 →" and you're buying within one tap.*

**A4. Pacing reset.**
- Return Seals to the spec prices (Dungeon 400, Bridge 4K), so the first session samples four games.
- The first Fall unlocks the Styx for free. The Pit opens on Fall #3 (about day 3).
- The base offline cap goes to 24 h, and offline time can fill the economy gate up to 90%, so a Legend is always one visit away.
- · #1, #5 · HIGH · S · *At minute 35 you're haggling at the Bridge, and after a forgotten weekend two Legends are waiting.*

**A5. Your hands move the meter.**
- Earnings made on screen count x3 toward the economy gate (`credit()` already takes a gate factor).
- Draw the Infamy bar linear in time remaining, with an ETA, instead of a log %.
- · #2 · HIGH · S · *Twelve good tolls visibly push the Bridge from 88% to 97%, and the Legend is yours tonight.*

**A6. All Hallows' Dread (Oct 24 - Nov 7). Ship it only if it's live by Oct 28.**
- Add a Throne Room banner, jack-o'-lanterns, and one 13-pumpkin counter across departments (Pumpkin Hex, gourd rocks, pumpkin-headed travelers).
- The reward is a Jack-o'-Overlord helm on the throne sprite.
- Spend no more than one day on it. It's a test of whether a visible countdown brings you back. It isn't a system.
- · #1 · MED-HIGH · S · *A two-week reason to come back daily, with a countdown on screen.*

**A7. Something to look forward to (no server needed).**
- Each department gets a roster of 5-7 escalating Legends instead of one, made mostly as data plus palette and hat swaps of the existing hero sprite. Dame Brightjaw is followed by her Taller Sister, then the Paladin Twins.
- The Trophy Wall becomes a 7x6 grid of helms, with silhouettes for the ones you haven't caught ("12/42").
- "INF %" becomes the next Legend walking down a road toward the door, named and silhouetted ("??? THE DROWNED KNIGHT").
- **Dawn Ambush:** a Legend who arrives while you're offline camps until 6-10 am local time, and meeting her then pays +50% Dread. Missing it costs nothing.
- · #1, #3, #5 · HIGH · S · *You close the app wondering who the silhouette is, and you open it at 7 am because she storms in at dawn.*

**A8. The Fall as a celebration.**
- Last Stand becomes the main red button.
- The card opens with what you gain ("Capture Dame Brightjaw: 56 Dread, her helm on your wall").
- Show a 4x Legend sprite and a 2-second sack of the department, then the Overlord drops in and slams.
- Move the rules behind an (i).
- · #4, #5 · HIGH · S · *Granny shrieks, a giant knight kicks the cauldron over, the screen shakes, and the helm flies onto the wall.*

### B. Big bets (the 4/10 → 7+/10 moves)

**B1. Shifts and Reputation: 3 minutes that set your next 8 hours. (This is the one that matters most.)**
- *Pitch:* a department gets one short, scored session with a clear ending, and it can go wrong:
  - **Bridge Shift:** 25 travelers, a quota and one new rule from a pool of about 20 (a Papers, Please structure).
  - **Dungeon Raid:** 5 parties, 5 hearts and a 10% stake.
  - **Spire Flask Run:** a vent ends the flask and banks your score, with a personal Best.
  - **War Pit:** a Run already is a Shift. Wire it to Reputation.
- Each Shift ends with the manager's stamped receipt of 0-3 stars. Stars set a **Reputation** buff on that department's idle and offline income (+25/60/100%). It decays over 8 h and shows on the door ("DUNGEON: FEARED ★★★ 6h").
- Retune the sim's active:idle band from 2-3x to roughly "skipping costs half your rate".
- **Rollout gate:** build the Bridge Shift alone (about a week), play it for 3 days, and check the fun rating. Build the Raid and the Flask Run only if the rating moves. Styx, Mines and Cauldron Shifts aren't planned. Those departments get Reputation from their existing play, or stay idle-first.
- *Replaces/cuts:* return rituals, the Dungeon Gong gap rule and coin taps, Cauldron tickets, and the Bridge's 10-second goon autopilot.
- · #2, #3 · VERY HIGH · M for Bridge + Dungeon + Spire (it would be L for all seven) · *Before bed you play a tense 3-minute Raid, scrape 2 stars, and wake to "the Dungeon's fearsome name drew 1,240 visitors: +60%".*

**B2. Raven Post: real push, written in the managers' voices. (Gated on the app being installed.)**
- *Pitch:* on hide, the client posts up to 3 locally computed events to a tiny server, which sends them when they're due as pushes in a manager's voice:
  - Legend arrival or Dawn Ambush
  - a department reaching its cap
  - a Reputation buff expiring
- Ask for permission in the fiction after the first Fall ("Gobbo can send ravens"). Cap pushes at 2 per day, and let each type be toggled.
- **Infrastructure:**
  - **Install first.** iOS delivers Web Push only to a PWA added to the Home Screen, on iOS 16.4+. The permission request must come from a tap inside that installed app, not from Safari. Make "let your minions reach you" the reason to install, and treat this whole item as zero value if you never install.
  - **There are no local scheduled notifications on the web.** The Notification Triggers API was abandoned, and a closed PWA runs no code. Every timed ping needs a server.
  - **The server:** a Cloudflare Worker on the free tier, with a cron trigger every 5 minutes, KV for the subscription and due events, VAPID keys, and Web Push payload encryption using a Workers-compatible library. It's a second deploy target next to GitHub Pages, with CORS from the Pages origin.
  - **The service worker:** switch `vite-plugin-pwa` from `generateSW` to `injectManifest` so the service worker can handle `push` and `notificationclick`. The click opens `?src=push` for the playtest log.
  - **iOS rules:** every push must show a visible notification (there's no silent push), subscriptions can expire, and the client must re-subscribe on launch.
  - **The badge is part of this.** On iOS, `setAppBadge` needs the same notification permission. A badge set on hide also goes stale, because nothing updates it while the app is closed. So the service worker sets the badge when each push arrives. There's no separate badge item.
  - **Skipped:** the `.ics` "Remind me" download. In the standalone iOS PWA it's unreliable, and nobody taps it twice.
- *Replaces:* the spec's "no push" decision (OQ5).
- · #1 · VERY HIGH if installed, zero if not · M · *22:05, your phone buzzes: "GRITCH: Boss! Cart's full and the crew's just standing there." A red "1" sits on the icon.*

**B3. Today's Focus: one department a day, not seven chores.**
- *Pitch:* each day the Throne Room names a **Department of the Day**. Its door glows, and it gets x2 income and a themed twist ("Blood Moon: rare souls x3"). You can swap it once a day for a **Favoured** department of your choice.
- It has one **Decree**, tied to that department's Shift or signature play ("3-star a Bridge Shift", "land a rare"). Clearing it pays a Dread shard and a cosmetic or relic.
- Departments outside your focus run idle and stay quiet, with no nag pips.
- Optional extra, only if B1's Spire Flask Run lands: a **Daily Flask**, the same seeded Suika bag for everyone, with a personal best.
- *Cut from the earlier draft:* three Decrees across departments, Petitions with hidden manager Loyalty, a 7-day streak with freezes, and the coffer. Together they turned the game into a daily checklist, the same chore feeling that makes it a 4/10.
- *Replaces:* the hidden Wanted Poster, the one-bubble "daily word" and the seven Banner rows.
- · #1, #5 · HIGH · S-M · *"Today I'm a smuggler-catcher." You play the Bridge properly for ten minutes instead of two minutes in seven places.*

**B4. A living lair.**
- *Pitch:* the black doors become 2-3 frame vignettes driven by real state: a bubbling pot, a swinging pick, a Legend silhouette pacing outside. Each shows its manager's status line ("HOPPER FULL!", "SHE'S HERE", "ZZZ") and its Reputation stars.
- Captured helms hang behind the throne, and Tribute piles up beside it. The Overlord laughs when you collect and taps his fingers while a Legend waits.
- Goods porters carrying crates between doors come later, only if there's time.
- *Replaces:* black doors, rate readouts and the text Trophy list. (Legend rosters moved to A7.)
- · #4, #5 · HIGH · M (mostly pixel art) · *By day 4 the room is crowded with trophies and gold.*

**B5. Falls that change how you play.**
- *Pitch:* each Fall pays Dread **and** a 1-of-3 draft of relics that change play ("every 10th ball splits in three", "contraband glows", "start Runs with a Rat Swarm"). Relics persist and form a collection.
- Start with 6-8 relics for each flagship department (Bridge, Spire, Pit, Dungeon). The other departments get them only if the draft proves fun.
- *Later:* dial levels that add *rules* the way Bridge Menace does (Thieves, Priests, Bumpers). This is the right direction, but it's design work for each department, so it waits for evidence.
- *Cut:* a 1-of-3 boon at every dial level and Infamy quarter. That's dozens of extra choice screens per week across seven departments.
- *Replaces/cuts:* most +% Altar rows (keep 2-3 infinite sinks) and the skip-ahead Signatures.
- · #3, #5 · HIGH · M · *"Defeating her reveals: THE SECOND CHUTE", and you plan the next cycle around it.*

### C. Per-department upgrades (top 2 each)

The new effort goes to the flagships: **Bridge, Spire, War Pit and Dungeon**. Cauldron, Mines and Styx get their S fixes and then stay idle-first.

| Dept | Upgrade 1 | Upgrade 2 |
|---|---|---|
| **Cauldron** | **Rain and sound from the first second:** 3 toadlings at 0.8 s, Hire growth 7 → 2.4, pentatonic peg tinks, bucket chimes. #4, #5 · HIGH · S | **Golden Spoon:** one aimable hero ball per minute, slow-mo over the last 3 rows, Extreme-Fever jackpot. #2, #3 · MED · M (later) |
| **Mines** | **Fury, not a penalty:** remove the 8/s half-damage soft cap and add a Fury meter (3 s of x2, red tint). #2, #4 · HIGH · S | **Drum on day one:** free at depth 3, war-chant music bed, ±110 ms window, auto-calibrated. Rhythm timing on iOS WebAudio needs on-device latency tests. #4 · MED · S-M |
| **Dungeon** | **Raids** (B1's event): 5 hearts, a stake, a Champion finale. #2, #3 · HIGH · M | **Greedy Gong and wave receipts:** the Gong sends the next party now for x1.5, plus a Ledger-Bones receipt and a PERFECT streak. #3, #4 · HIGH · S |
| **Bridge** | **Take down the answer key:** daily-seeded tells, hideable smuggler tells, 30% red herrings. #3 · HIGH · S | **Haggle a person:** fuzzy counters, nerve tells, FINAL OFFER, and four big price buttons instead of the 3-point coin stack. #3, #4 · HIGH · S |
| **Styx** | **A real fight, less waiting:** move the Last Stand gold band into the main reel, sink speed 40 → 90 px/s, bite wait 4.5 → 2 s, fewer fake-outs. #3 · HIGH · S | **Size, stars, records, and clock-tied spawns** (Moon Witch 20:00-02:00, announced by Pilk). #1, #3 · MED · M (later) |
| **Spire** | **Make it Suika:** flask about 25% smaller, orbs x1.35, and a vent *ends* a scored Flask Run (with a Best). #3 · HIGH · S-M | **Re-price for a 3-hour arc:** tame T7+ payouts, unfold rows progressively, a visible change every 10 Potent levels. #2, #5 · HIGH · S |
| **War Pit** | **Make Runs worth it:** battle Teeth x5, K_IDLE x5, a beatable Huntmaster who re-rolls on retry, +1 Grit for reaching him. #2, #3 · HIGH · S | **Readable and punchy:** names and one-tap ability text on cards, lines centred 12 px apart, lunges, big damage numbers. #3, #4 · HIGH · S |

### D. Cut or simplify

- **Return rituals** (+5% for busywork taps, and they block the board). Gobbo's Sack (A3) and Reputation (B1) replace them.
- **Gobbo's Satchel paywall** on the GO list. Make it free.
- **Steward auto-spend.** It automates the only decisions left. Keep it only as a late convenience.
- **Chore buttons:** Dungeon coin taps, the 8 s Gong gate, the Mines soft cap and the 10 s Bridge autopilot.
- **Seven identical Banner rows.** Fold them into Today's Focus (B3).
- **Cauldron `layoutNorm`.** Let layouts really differ, or drop them.
- **Goods import sheet** (+1.5% rows). Keep Goods as Decree rewards (and porters if B4 gets there), and cut the sheet.
- **Two-gate "INF %" jargon** in every HUD. Replace it with the Legend on the road (A7).
- **Manager text over playfields,** and first-entry dialogue that swallows taps. Move it to the manager strip and let taps pass through.
- **The spec calendar as a tuning goal.** Retune the sim to target *meaningful active play* and *a new toy every session in week 1*, not dates.
- **Not adopted from the critics:**
  - "Overlord's Gaze", an x1-x5 multiplier that ramps the longer you stay. It rewards staying longer, not playing well, and Reputation already pays for skill.
  - Streaks, Petitions with manager Loyalty, mid-cycle boon drafts, Goods ring diagrams and a weekly Crusade.

---

## Build order

**Wave 0 (day 1):** ship the playtest log (below) on its own, along with A6 if it can go live by Oct 28. Collect 2-3 days of baseline.

**Wave 1 (week 1, all S): "it feels alive and it gives me something to wait for".**
- A1, A2, A8, A3, A7, A4, A5.
- Then the S fixes in the department table: the Bridge answer key and haggle, the Spire flask, the Pit economy and readability, Styx timings, Mines Fury, the Cauldron first minute.
- Re-run the sim with the new bands.
- **Install the PWA on the iPhone this week** if it isn't installed already. B2 depends on it.

**Wave 2 (weeks 2-3): "my play matters, and it reaches me".**
- **B1 Bridge Shift and Reputation** (wire Pit Runs to Reputation at the same time). Play them for 3 days and check the rating.
- If the rating moves, build the Dungeon Raid and the Spire Flask Run.
- In parallel, build **B2 Raven Post**. It's independent work: the Worker, `injectManifest` and permission UX.

**Wave 3 (weeks 4-6): "something to care about".**
- B3 Today's Focus, B5 relic drafts for the flagships, then B4 living lair.

**Later, only if waves 1-3 land:**
- an Aurelia nemesis story arc as the long-term goal
- dial rule cards beyond the Bridge
- the Cauldron board-builder and Golden Spoon
- the Styx clock-tied spawns
- the Mines vertical shaft
- Pit tribes

---

## How to know it worked

There's no analytics today, so add a local playtest log, `src/core/playlog.ts`:

- **What it records:** append-only JSON in localStorage, capped at about 2,000 events. Event types:
  - `session_start`, with its source (push / badge / direct), read from a `?src=` URL param on push opens
  - `session_end` (duration)
  - `dept_enter` / `dept_exit` (seconds spent)
  - `report_collect`, `go_tap`, `fall`, `buy`, `shift_end` (stars), `decree_done`, `push_sent` / `push_opened`
  - `installed`: true when `navigator.standalone` is set, so you know whether B2 can work at all
- **Daily rating:** once a day, a one-tap question at the end of a session: "How fun was today? 1-10".
- **Export:** Settings → "Export playtest log" uses the share sheet or copies the JSON. A small `sim/playlog.ts` script turns the export into a summary.

**Measure these, comparing the 3-day baseline with each wave:**

| Metric | Why | Target after wave 2 |
|---|---|---|
| Sessions per day | Direct "forget to play" signal | ≥ 3 |
| Days active out of 7 | Return rate | ≥ 6 |
| Median gap between sessions | Appointments are working | < 6 h while awake |
| % of sessions that enter a department (vs. collect and leave) | Play matters | ≥ 60% |
| Shifts played per day | The core bet is working | ≥ 1 |
| Median active minutes per session | Depth of play | 4-8 min |
| Share of sessions opened from a push (if installed) | The trigger is working | ≥ 30% of sessions |
| Daily fun rating | The real question | ≥ 7 |

**Decision rules:**
- If sessions per day rise but the fun rating doesn't, the triggers work and the games don't. Push harder on B1 and the department fixes, and don't add more pushes.
- If the fun rating rises but sessions per day don't, bring B2 and B3 forward.
- If the Bridge Shift doesn't move the rating within 3 days, rethink B1 before building more Shifts.

---

## Skeptic's notes

What the skeptic pass changed, and why:

1. **Picked a single most important change.** The draft had five equally weighted Big bets. Only B1 tackles both complaints at once: it makes a session matter ("care"), and the expiring Reputation gives you a reason to come back ("forget"). Push alone just reminds you about a 4/10 game, and you would turn it off. B1 now leads, with a rollout gate: Bridge first, then measure.
2. **Wrote the push infrastructure down honestly.**
   - Web Push on iOS needs the PWA installed on the Home Screen (iOS 16.4+), a permission request made from a tap inside that installed app, a custom service worker (`injectManifest`, not the current `generateSW`) and a server: a Worker with cron, KV, VAPID and payload encryption.
   - The web has no local scheduled notifications.
   - The draft's A7 badge was misleading. iOS gates `setAppBadge` behind notification permission, and a badge set on hide goes stale because nothing updates it while the app is closed. The badge is now part of B2, and the `.ics` fallback is cut.
3. **Replaced A7 with a no-server reason to return.** Legend rosters with silhouettes and the Dawn Ambush moved up from B4 and B2. They're cheap (data plus palette swaps), they work without installing, and they create anticipation, which nothing in the game did before.
4. **Cut checklist creep from the Daily Court.** It had three Decrees, Petitions, hidden Loyalty, a coffer and a 7-day streak with freezes. That's a to-do list stacked on seven to-do lists, and streak guilt doesn't fit a hobby game with one player. It's now B3 Today's Focus: one department and one Decree. This also finally answers the breadth problem (#5), which the draft diagnosed and then made worse by adding a new system to all seven departments.
5. **Scoped the per-department multipliers.** Six new Shift modes, seven relic pools, 42 dial boons and dial rule cards were costed as "M". They aren't. New effort now goes to four flagships (Bridge, Spire, Pit, Dungeon). Styx, Mines and Cauldron Shifts are dropped, and the mid-cycle boon drafts are cut.
6. **Dropped Overlord's Gaze.** A multiplier for time on screen rewards staying, not skill, and it overlaps with Reputation.
7. **Flagged iOS risks in A1.**
   - `audioSession` needs feature detection and a silent-`<audio>` fallback.
   - The checkbox-switch haptic is an undocumented iOS 18 hack that fires only inside touch handlers, so it can't buzz on timer-driven hits.
   - The Mines rhythm Drum needs latency testing on the device.
8. **Time-boxed Halloween (A6).** If it isn't live by Oct 28, the window is too short to justify the art.
9. **Added kill criteria and an install check to the metrics,** so the next round of work follows what the playtest log shows, not more critic reports.
