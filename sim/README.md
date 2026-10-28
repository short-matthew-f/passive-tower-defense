# Balance simulation (`sim/`)

> **Balance state after Pass 6 (final), all seven departments, Goods, long nodes and the new rules
> (Edicts, Trophy Hall, Legend's Bane, Swift Rebuild, Goods Caravan, Steward, Head Start,
> Signatures, return rituals).** Every hard band passes in week 1 except one seed's Spire
> active:offline (2.99x on 20 baseline minutes; median 4.4x). Unlocks (Mines 5 min, Dungeon 45 min,
> Bridge 90 min, Styx day 2, Spire day 4 18:00, Pit day 6) and first Falls (Cauldron day 1 evening,
> Mines day 3, Dungeon day 4, Bridge day 5, Styx day 5, Spire day 7, Pit day 9-10) sit on the 00 §6
> arc; day-7 Dread 373 (band 145-439); the Cauldron's day-7 Dread share is back to ~34% (cap 35%).
> In 30-day runs every department's weeks 2-4 cycles average 1.9-2.9 days with no cycle over
> 4.0 days (3 seeds), and something is affordable on every return. The Steward never spent below
> its reserve or bought a dial in 1,469 purchases. Still open: 30-day active:offline drift (Mines
> up to ~5.2x, Dungeon ~2.4x, Pit and Spire lumpy), the Cauldron's week-1 cycles (~1.2 days) and
> the arc-vs-AE first-Fall conflict. Details: "Pass 6" at the end.

The headless balance harness from specs/00 §8.1. It runs the reference player through simulated
days on **the game's own pure modules**, so "the sim matches the game" holds because both run the
same code. Nothing here imports Pixi or the DOM.

```
npm run sim                     # 7 days x 3 seeds + side profiles -> table, sim/out/report.{md,json} (~55 s)
npm run sim -- --days 30        # weeks 2-4 cycle metrics (~30 s per seed)
npm run sim -- --quick          # reference profile only, 1 seed (~10 s)
npm run sim -- --fall-at 150    # Fall policy: push to 150% Infamy before letting the Legend in
npm run sim -- --skill expert   # bot skill: novice | reference | expert
npm run sim -- --live           # Cauldron and Spire: live physics every second (no activeRate table)
npm run sim -- --floor-growth 3     # experiment: economy floor growth per Fall (shipped x2.5)
npm run sim -- --out /tmp/a     # write report.{md,json} to /tmp/a instead of sim/out (parallel runs)
npm run sim -- --ref-only --days 30 --seeds 1 --seed 2   # one 30-day seed, no side profiles
npm run sim -- --profile steward    # the main table for another profile
npm run sim -- --off edicts,rituals # attribution: new rules off (edicts,rituals,extras,wings,later)
npm test                        # includes tests/balance.test.ts, the fast CI tier (~20 s)
BALANCE_LONG=1 npx vitest run tests/balance.test.ts   # + the 30-day weeks 2-4 tier (~70 s)
```

`npm run sim` takes ~110 s (three 7-day seeds plus the side profiles: idle-only, steward, phantom
Seals, single-department mains, calibration probes). Three 30-day seeds run in parallel in ~2 min:
`for k in 1 2 3; do npm run sim -- --ref-only --days 30 --seeds 1 --seed $k --out /tmp/s$k & done`.

`npm run sim` uses Vite's module runner (`sim/cli.mjs`), so it needs no extra dependency.

## How it works

Two layers, as in 00 §8.1:

1. **Local layer: department adapters** (`sim/adapters/<dept>.ts`). Each one drives that
   department's real pure code with a reference bot:
   - **Cauldron** runs the shipped `CauldronCore` (`src/depts/cauldron/logic.ts`) on the real
     peg-board physics. The bot Tosses down the chute with the best landing EV, or the best
     ticket-zone odds when the spoon holds a needed ingredient. That EV comes from per-chute
     landing tables built from the same `Board` (common random numbers). The bot also Ladles the
     pegs with the most ingredients about to pass (ticket ingredients weigh x3) and rerolls stale
     tickets. Live physics costs ~0.6 ms per simulated second, so the adapter builds an
     **activeRate table** lazily: the first 180 live seconds in each coarse board state measure
     the active:idle ratio and the Batch rate, and later seconds in that state reuse them.
     Batches still advance the skill gate. `--live` turns the table off.
   - **Mines**: the live wall loop lives in `scene.ts` (tangled with Pixi), so the adapter ports
     it headless. That covers the 5x5 wall, rock kinds and regrowth, goblins hopping between
     rocks, tap-lit and auto kegs, cave-in rubble, Chain Lightning, Gems, the Doom Drum (one
     judged tap per beat, Frenzy pips) and the 50-rock gate. Every number comes from `model.ts`.
     The shop is the real `buildGroups()` from `upgrades.ts`, driven through a headless
     `DeptCtx`, so costs, caps and locks are the game's. The bot taps 6/s, lights kegs that touch
     at least 3 rocks, breaks Veins and Geodes first, then finishes the most-cracked rock. With
     the drum it lands 85% of judged taps.
   - **Dungeon** runs the shipped 20 Hz path sim (`src/depts/dungeon/sim.ts`, the same `Sim` the
     scene renders and `idleRate` runs headless) live on screen, and ports the scene's thin layer
     around it: coins (the bot grabs 30/60/85% for +10%, the rest auto-collect), steals from the
     bank (2% cap) and recovered sacks (+25%), Glare (thieves, then Champions, then whoever is
     nearest the Hoard), the Trapdoor (under a hero in the route's last quarter), the Gong (door
     clear and the last party held), Champion kills feeding the leak-gated skill gate, Lure
     step-down when the live floor leaks > 25%, the blueprint snapshot and the post-Fall starter
     kit. Verbs fire after a reaction delay (1.0 / 0.3 / 0.15 s). The builder ranks every
     placement (the best free tile per kind by path coverage on the current route), piece
     upgrade, L5 branch, Workshop node, Bait Chest and Rune Slot by Δdefense/cost, where defense
     is the expected damage a party member takes on the route (model.ts stats, map.ts routes).
     The Lure is bought when a 1-seed, 8-party probe of the real `Sim` says the layout holds the
     next tier (< 20% leaks); while it holds, the bot saves for it. Workshop and Lure purchases
     go through the real `buildGroups()`. It shops every 15 / 6 / 4 on-screen seconds.
   - **Bridge**: the gate loop lives in `scene.ts`, so the adapter ports it headless on the
     real pure rules (`model.ts`: generator, tells, Poster, `reply`, `band`, bounties, goon
     tolls). That covers the fresh bench on entry, one arrival per 7 s (overflow to the goons),
     walk / decide / Search (1.1 s) / reveal (1.3 s) timing, counters, bonks and naps (taps on
     Grumm shorten them), the streak, the Hero Whisper showdown, the onboarding's scripted
     travelers and the evidence-gated skill gate. The bot reads each traveler like a player:
     parts and destination against `NORMAL[claim]`, the Writ seal and the Poster, ignoring
     today's fake tell after the Menace 9 card. It spots each real contradiction with p = 0.7 /
     0.9 / 0.98 and misreads an alternate 4% / 1% / 0.3% of the time. It Unmasks at >= 2 hero
     clues (the expert at 1), Searches on smuggling clues or a sniff, and otherwise drags into
     the Wallet Sense band (lower for brawny or suspect Claims), taking or pushing a counter.
     The buyer ranks the real `buildGroups()` by Δ(idleRate + 0.25 x expected active income)/cost,
     the active part a 160-traveler Monte Carlo of the same policy on the real generator.
   - **Styx**: the catch loop lives in `scene.ts`, so the adapter ports it headless at the
     scene's 30 Hz on the pure rules in `model.ts`: cast and sink (40 px/s), the exponential bite
     wait (x1.25 while twitching), the biter's swim to the hook (the Bog Poet circles 1.6 s), the
     nibble with Wrath fake-out dips, the hook window, the reel (hold raises tension at
     `REEL_RISE / lineCap`, release drains at `drainRate`, telegraphed thrashes at the scene's
     progress points, slip after 0.4 s at >= 100%, drift loose after 2.5 s at 0%, heavy / sinker /
     teleport / twin souls), the land (combo, Wrath, Gilded Obol, the Codex first-catch bonus,
     bait use, the 20-soul Wrath gate), wisps, fog surges, line snaps and the netters, which the
     scene credits on screen too. The bot casts to the band with the best expected Obols/s, sets
     the hook with a normal reaction time (0.40 / 0.29 / 0.22 s, sd 0.12 / 0.07 / 0.04), taps a
     fake-out dip 12 / 4 / 1% of the time, eases off the reel on a thrash telegraph after its
     reaction time (lapses add 0.35 s, 15 / 6 / 2% of thrashes), works the skill gate at the
     target Wrath with Unpaid Debt bait and otherwise fishes at the top Wrath with Gilded Obols.
     The shop is the real `buildGroups()`; the buyer values Δ(idleObols + 0.25 x an analytic
     estimate of the same loop)/cost, judging a node on up to 3 levels when the next one alone
     changes nothing (Longer Poles inside the Shallows).
   - **Spire** runs the shipped `SpireCore` (`src/depts/spire/logic.ts`) on its Pixi-free circle
     physics (`physics.ts`) and credits `idleRateOf` on screen like the scene. The bot scores 24
     aim positions by dropping a straight line onto the pile: an immediate same-tier contact, a
     same-tier neighbour at the resting spot and a low landing score up; landings near the Brim
     Line and burying a smaller orb score down (the expert also looks one merge ahead). It drops
     at 22 / 30 / 34 per minute, the reference and expert only once a cascade has been quiet for
     1.2 s and the pile is still (the novice drops on the beat and vents ~2x as often), with aim
     noise 5 / 1.5 / 0.5 px. Like the Cauldron it builds an activeRate table lazily: the first
     900 live seconds in each coarse flask state (spawn, geometry and cascade nodes, Volatility)
     measure merge income per unit of Potent x arcanaMult(V), the Feat tier and the Distill
     Ceiling; later seconds reuse them and advance the drop count and the Feat's 60-drop log.
     Live physics costs ~0.8 ms per simulated second, so 7-day runs are almost all live.
   - **War Pit** plays Runs on the real shop and battle rules (`src/depts/pit/run.ts`,
     `engine.ts`) with the greedy draft bot (`bot.ts`), and pays Skirmishes from the real memoized
     Gauntlet `idleRate` only while no Run is on screen, as the scene does. It ports the scene's
     thin layer: battle Teeth x Pliers x Arena Renown at each result card, the run-end bonus,
     Crests, Pit Crowns (the skill gate), Captives (the Goods counter), the last-3 warband history
     and stationing the best of them when its Gauntlet beats the Standing Warband. Bots (07 §14.1):
     the novice adds 20% random buys and shops 1.5x slower; the reference judges up to 8 line
     orders per shop and the expert 64, each by guessed battles (own seeds) against what the scout
     shows: the rival's beasts always, their stats with Scouting L1, levels and items with L2 (the
     expert reads one level more). Time model: shop 8 s + 3 s per action, battles at 1x for rounds
     1-3 then 2x, the 1.5 s result card, 6 s on the summary and 3 s at home. Stakes: buying a level
     sets the dial to it (the scene's button); the bot steps one down after a Retreat and back up
     after a Triumph, plays the Infamy target while it still needs its Crown, and buys Stakes above
     the target only after a Crown at its current top. The buyer ranks the real `buildGroups()` by
     Δ(Gauntlet idleRate + 0.25 x an estimate of active Teeth/s)/cost.
   - **Greedy buyer** (Cauldron, Mines): it buys the best Δincome/cost. When the skill gate needs the next
     dial level (Malice, Dig Deeper, Menace), it saves for it, and only buys items that pay for
     themselves before the dial would be affordable anyway. Gems and Batch Tokens buy the drum,
     then the cheapest node.
   - **Skill**: novice / reference / expert set reaction time and decision cadence (Cauldron,
     Dungeon), tap rate and beat accuracy (Mines, 02 §13: 50/85/95%), and reading accuracy,
     haggling and think time (Bridge).
2. **Meta layer** (`sim/meta.ts`): department-agnostic. It mirrors `src/core/game.ts` step by step.
   - **On screen**: one 1 s `econTick` per second. Off-screen departments accrue
     `idleRate x coreMult`, Tribute accrues with the x1.5 on-screen bonus, and `checkProgress`
     handles peakRank, Legends and Commendations.
   - **Between sessions**: one closed-form `applyOffline` jump (per-department offlineFactor, so
     Iron Discipline counts for that department's income and Tribute; offline cap, Tribute cap).
   - **Shared rules**: `completeFall` and `buySeal` follow the same rules as the game, all through
     `src/core/economy.ts`, `src/core/meta.ts` and `src/core/perks.ts` (Pass 6):
     - `credit()` adds `amount x econGateMult` to the economy gate (Fear Itself), the bank gets the
       plain amount;
     - a Fall pays `dreadPayout(..., legendsBane)`, then applies Head Start and the Signature
       (game.ts `applyCyclePerks`); a Signature also applies when bought, as the Altar does;
     - Rebuild Rush length (Swift Rebuild), Trophy Hall and Dark Tithe (in `tributeRate`) and the
       Goods Caravan (in `roadsMult`) come through the core functions automatically;
     - the Steward (`stewardShare` / `stewardSpend`) accrues its allowance off screen every tick,
       spends every 5 s and once per offline jump, exactly like game.ts `stewardPass`; the sim
       audits every pass (never below the reserve floor, never past the pool, the dial never
       moves);
     - return rituals: the haul of each absence >= 60 s waits for the department's next played
       entry, which credits `ritualBonus(haul, score)` (profile score: reference 0.7) before a
       waiting Legend is let in. Collect-All visits skip it.
     - Prices are rounded up like the Throne and Altar sheets (`Math.ceil(cost(L))`).
   - **Throne Room bot**: buys Seals, then by value per Tribute Dark Banners, Curfew Bells,
     Treasury, Imperial Roads, the Black Market, the Trophy Hall (+1% Tribute per Legend incl. the
     next week's) and the Edict Board (worth a standing Dark Tithe); Tribute boosts count half. It
     then buys Dread perks by value per Dread: Iron Fist, Tithe, Long Reach, Idle Hands, Ruinborn,
     Swift Rebuild (~15 extra Rush minutes per cycle, at half value), Goods Caravan (as a Roads
     level), Head Start (+10% x 0.6^L of the department), Signature (+15% of the department), and
     Legend's Bane only when a week of its extra Dread buys more than its price would now. The
     reference player never buys Gobbo's Satchel (quality of life) or cosmetics.
   - **Edicts** (with the Edict Board): Dark Tithe while the next Seal's Dread is met but its
     Tribute is short; else Fear Itself on the department whose economy gate most lags its skill
     gate; else Iron Discipline on the department with the oldest cycle. `setEdict` enforces the
     hourly switch.
   - **Fall policy**: Fall at 100% Infamy (`--fall-at` pushes further).
   - **Profiles**: `reference` (day 1: 45 + 15 + 30 min; then 10 + 10 + 10 + 20 min),
     `steward` (the same schedule, Satchel L3 and the Steward on everywhere at the UI's 25%
     reserve), `idle-only`, `grinder`, `solo`. Inside a session the player plays 5-min slices: a
     freshly unlocked department first, then one with a Legend waiting, then (Pass 6) one whose
     economy gate has been full for 12 h while its skill gate isn't (once per session), then the
     department visited longest ago (a round robin across sessions and days).
   - **Single-department main** for departments 5-7 starts from the reference player's meta state
     at that department's unlock (00 §8.1, W-23), since they need lifetime Dread from elsewhere.

Everything is seeded (`sim/rng.ts`) and deterministic for a given seed. The CI test asserts it.

### Measured quantities

- **Active : offline** = (base local income earned on screen) / (on-screen `idleRate` x offline
  factor). The metric uses "baseline" seconds only, meaning at least 30 min of active-equivalent
  time into the cycle (00 §8: the helpers a 30-minute player owns). With 4 departments sharing
  the reference player's ~50 min a day, a department rarely gets 30 on-screen minutes in one
  cycle, so the first pass's on-screen definition left the Dungeon and Bridge with no baseline.
  Core multipliers cancel out, because both sides exclude them.
- **Active-equivalent (AE) time** = on-screen seconds, plus background and offline income
  converted at that department's measured active rate.
- **Calibration** rows run the live core with no player input against `idleRate`, which should
  be about 1.0 by definition (00 §7).

## Adding a department

The pure economy lives in `src/depts/<dept>/def.ts`, a `DeptEcon` with no Pixi imports;
`index.ts` spreads it into the full `DeptDef`. To add a department:

1. Give the department a `def.ts` (copy `cauldron/def.ts`; all four built departments have one).
   Keep its numbers in pure modules.
2. Write `sim/adapters/<dept>.ts` that implements `DeptAdapter` (`sim/types.ts`):
   - `startSession(save, env)` returns `{ step(dt), buy(goals), end() }`. `step` plays on screen
     and credits income only through `env.earn(base)` and `env.raiseSkill(level)`, exactly like
     `DeptCtx`. If the department has a headless core, run it. Otherwise port the scene loop and
     call the pure model.
   - `buy(goals)` is the bot's shop. Prefer driving the department's real upgrade list.
     `goals.dialGoal` is the dial level the Fall policy wants.
   - `anyAffordable`, `dialLevel`, `dialMax`, `dialId`, `dialCost`, plus optional `ratioState`,
     `localRatioBands` (the spec's own active:idle bands) and `ratioScale` (the department's long
     node multiplier, divided out of both sides of the ratio metrics; see Pass 5).
3. Add one line to `sim/adapters/index.ts`. Add its arc first-Fall day and unlock minute
   (departments 2-4) or unlock day (5-7, `ARC_UNLOCK_DAY`) in `sim/metrics.ts`. Its Seal starts
   being bought automatically. A department whose skill gate isn't counted in dial levels (the
   Spire's Feat is tier + Volatility) sets `dialMax` to the gate's range for the reachability check.

## Reading the report

Each row shows a status, the spec level and a CI marker.

- **FAIL**: a spec-hard band is violated.
- **WARN**: a soft or derived band is violated.
- **INFO**: context only.
- **Seeds**: values are seed medians (spread in brackets), and the status is the worst seed.
- **CI gate**: rows marked `+CI` fail `npm test`. These are integrity (NaN, Infinity,
  negative balances), offline factor at most 0.9, first upgrade under 60 s, Fall #0-#5 targets
  inside the dial range, and every department reaching its first Fall. `tests/balance.test.ts`
  also gates the bands the tuning passes brought into range (`TUNED_GATES`: Cauldron first Fall AE,
  the active:offline and local ratio bands, cycle bounds, unlock times, the Dungeon's and the
  Bridge's arc days, "something affordable"). Those are keyed per department, so a newly added
  department isn't gated until its own tuning pass. The suite bands (shares, day-7 Dread) are
  gated per department set (`SUITE_GATES`, keyed by the built set): adding a department turns them
  off until that set is re-baselined. To gate a band for every department, set `ci: true` on it
  in `metrics.ts`. With `BALANCE_LONG=1` the test also runs 30 days (seed 1) and gates every
  department's weeks 2-4 cycle (1.5-3 days) and longest cycle (<= 5 days).
- **Ratio rows** with under 10 baseline minutes (a department opened in the last day of the run,
  e.g. the War Pit in a 7-day run) are reported as INFO: one or two payouts can't be judged.

Bands derived for a partial suite (see `metrics.ts`):

- **Tribute / Dread share**: at most the equal share plus 20.7 pp. The spec's 35% at 7
  departments is 1/7 + 20.7 pp, so 2 departments allow 70.7%, 4 allow 45.7% and 6 allow 37.4%.
- **Dread by day 7**: the 00 §6 arc for only the departments that exist. Each department's first
  Fall falls on its arc day (Cauldron early day 2, Mines day 3, Dungeon day 4, Bridge day 4-5),
  then cycles of 3 days (low, Crush 0) to 1.5 days (high, Crush 25%) at 100% Infamy. For
  Cauldron + Mines that gives 70-235; for four departments, 125-371; for six, 145-439 (the full
  suite's 120-200 is lower because 00 §6 has the Pit and the Spire contributing almost nothing by
  day 7). 00 §6 gives no first-Fall day for the Styx and the Spire; `metrics.ts` holds them to
  2.75-3.75 days after their unlock (the Dungeon and the Bridge take ~2.8 and ~3.0 days): Styx
  day 4.25-5.25, Spire day 6.25-7.25.
- **Unlock day** (departments 5-7): 00 §6's reference day ± 1 day (00 §8.1): Styx "day 2"
  (1-2 d), Spire "day 4-5" (3-5 d).
- **Phantom Seals** variant: pays the unbuilt departments' Seals (now only the Pit's) as pure
  Tribute sinks, to approximate the full suite's Tribute economy.

## Current results (reference, 7 days, 3 seeds; `sim/out/report.md` has the full table)

107 pass, 34 warn, 1 fail, 48 info after the final pass (Pass 6 below; the counts include the side
profiles). The one FAIL is a single seed's Spire active : offline (2.99x on 20 baseline minutes of
a lumpy payout; median 4.41x). The remaining warnings are soft:

- **First Fall wall clock vs AE hours.** In the reference profile every night and day gap adds
  ~2-4 h active-equivalent. The Cauldron's hard "3-4 h AE ± 1 h" band puts its first Fall in the
  day-1 evening session (19:00, 3.4 h AE) instead of "early day 2". The later departments are
  held to their arc day instead: Mines day 3 08:00 (~10 h AE), Dungeon day 4 08:00 (~19 h AE),
  Bridge day 5 08:00 (~18 h AE), Styx day 5 18:00 (~21 h AE), Spire day 7 08:00 (~19 h AE; one
  seed in three day 8 12:35). The War Pit opens on day 6 12:30-18:00, its first Fall on day 9-10.
- **Economy gate ≈ 2.5 h AE**: the same conflict.
- **Cauldron week-1 cycles** average 1.2 days (the 1.5-3 day band is for weeks 2-4); its day-7
  Dread share is 32-34% (one seed 40%; cap 35%).
- **Spire on-screen ratio** 3.15x median, 2.1-3.5x across seeds on 15-20 baseline minutes (band
  2.4-3.2x).
- **Dial step cost**: low dial levels are bought during the rebuild ramp (minutes, not 25-60).

30-day runs (3 seeds): weeks 2-4 cycles 1.9 / 2.4 / 2.6 / 2.7 / 2.5 / 2.9 / 2.9 days (Cauldron,
Mines, Dungeon, Bridge, Styx, Spire, Pit), longest cycle 4.0 days, no stalls. The 30-day
active : offline drift is listed under Pass 6, "Still open".

## Tuning log

Each change is a sim-tuned seed, commented as such where it lives. "Before" is the harness
author's report (reference, 7 days, 3 seed medians) and "after" is the current one.

### Changes

1. **Cauldron: gold pegs count in `idleRate`** (`econ.ts` `expectedMult`, `sim.ts`
   `landingStats`). The EV cache now runs the board with its moving gold pegs and records the
   mean gold hits per bucket. It drops the value-weighted ingredient mix rather than Newts only,
   because ingredients bounce differently. `idleRate` therefore equals "the board with no input"
   (00 §7). This departs from 05 §3's "gold pegs excluded" text, which left the live board
   earning 1.8x `idleRate` with no input. Gold Peg and Gold Polish now raise idle income and Rank.
   The adapter's buyer stopped proxying them as active-only.
2. **Cauldron: Batch payout** `25 x EV + 10 s of idleRate` -> `+ 8 s` (`BATCH_IDLE_S`). Batches
   are most of the active edge, and Bigger Batches (+200% at L10) grows them across cycles.
3. **Cauldron: Malice price** `100,000 x 15^M` -> `2.7e6 x 5^min(M,5) x 2^max(0,M-5)`. That is x5
   per level through the income ramp, then x2 at the top of the dial, where income has plateaued.
4. **Cauldron: econBase** 2e9 -> 6e9, **rankRef** 300 -> 8,000 (idleRate after ~10 min on screen),
   **rankTarget** 150K -> 350K (idleRate at the first 100% Infamy, now with gold counted).
5. **Mines: Pick Tier multiplies tap damage** x1.9 per tier (`FIST_TIER`, `fistDamage`; the scene,
   the upgrade text and the adapter all use it). Tiers used to multiply only the crew (x98 at tier
   5), so taps fell to ~5% of income. The ratio is steep in this number: x1.6 gives ~1.8x on
   screen, x2.0 ~3.4x, x2.5 ~10x.
6. **Mines: `idleRate` models the goblins' hop** (`GOBLIN_HOP_S` 0.4 s per rock and a soft
   regrowth ceiling, `crewRocksPerSec`). This replaces the flat 0.85 overkill factor. It was
   fitted to the live wall across 1-8 goblins and 0.07-6 s of swinging per rock (live/idle
   0.94-1.12). The old closed form overpaid a one-hitting crew by up to 2.5x, so late in a cycle
   offline beat the live wall. The bot's income estimate uses the same crew term and lets each
   tap break at most one rock.
7. **Mines: skill target capped at the dial** `min(30 + 5N, 60)`. Fall #7 used to ask for depth 65
   on a 60-deep shaft.
8. **Mines: econBase** 1e7 -> 2.5e10, **rankTarget** 1,500 -> 2e5 (idleRate at the first 100%
   Infamy). Dig Deeper stays `100 x 1.36^d`. Steeper digs (1.45-1.5) moved the first Fall to day 3,
   but they made depth the binding limit. Taps then one-shot rocks at max depth and the ratio
   collapsed to ~1.3x within a cycle. 02 §6D wants the wall to come from HP, not dig prices.
9. **Core: Dark Banners out of Rank** (`economy.ts` `rank`). Banners are bought with Tribute, so
   counting them in Rank closed a Tribute -> Banner -> Rank -> Tribute loop. Dread perks stay in.
10. **Harness:** the Cauldron calibration probe samples 900 s per board state instead of 180 s
    (`main.ts`). The payout is skewed, so short samples undershot and read 0.85x on an `idleRate`
    that matches the live board within ±5% over long runs. The CI test now runs 7 days and gates
    the tuned bands (see "CI gate" above).

### Before -> after

| Metric (band) | Before | After |
|---|---|---|
| Cauldron active : offline (3-5x) | 6.64x FAIL | 4.06x |
| Cauldron active : on-screen idle (2-3x) | 4.54x | 2.72x |
| Mines active : offline (3-5x) | 1.60x FAIL | 4.37x |
| Mines active : on-screen idle, drum (2.4-3.0x) | 1.06x | 2.84x |
| Cauldron live board / idleRate (≈1.0) | 1.78x | 0.97x |
| Mines live wall / idleRate (≈1.0) | 1.12x | 0.99x |
| Cauldron first Fall (3-4 h AE ± 1; arc 1-1.5 d) | 2.34 h, day 1 19:00 | 3.14 h, day 1 19:00 |
| Mines first Fall (soft 3-4 h AE; arc 2-3 d) | 3.79 h, day 2 08:00 | 8.61 h, day 2 18:00 |
| Mines shortest cycle (>= 2 h) | 10.0 h | 32.9 h |
| Mines average cycle (1.5-3 d) | 0.74 d | 2.00 d |
| Cauldron average cycle (1.5-3 d) | 1.27 d | 1.14 d |
| Lifetime Dread day 7 (70-235 derived) | 274 | 208 |
| Mines Dread share (<= 70.7%) | 77% | 40% |
| Cauldron / Mines dial step median (25-60 min) | 3.9 / 14.5 min | 6.8 / 1.6 min |
| Lifetime Tribute, end of day 1 (arc ~4K-25K) | 56K | 61K |
| Lifetime Tribute, day 7 | 5.1M | 2.9M |
| First upgrade, Cauldron / Mines (< 60 s) | 8 s / 4 s | 8 s / 4 s |
| Something affordable on returns > 15 min | 26/26 | 26/26 |
| 30 days: Falls, Cauldron / Mines | 4 / 7, then stuck for good (88% / 92%) | 8 / 5, no permanent stall |
| 30 days: longest cycle (<= 5 d) | 22 / 23 d | 9 / 11 d |

Bot skill now matters in both departments (`--skill`, seed 1). Mines drum-on on-screen ratio:
novice 2.2x, reference 2.8x, expert 3.4x (it was ~1.05x for all three). Cauldron: 2.4x / 2.7x /
3.4x. The expert bot lands just over the reference band (~5.1-5.2x active:offline). That's
expected, since the band is set for the reference player.

### Still open (structural, outside department seeds)

- **Weeks 2-4 cycles stretch to 5-11 days.** Every Fall multiplies the economy floor by x3. Each
  department's income meanwhile plateaus once its capped nodes are bought (Mines: 8 goblins,
  Picks 40, Tier 5 put idle at ~3e5/s; Cauldron: rows, gold and jackpot cap, and Fresher Stock
  grows only ~cost^0.2). In a 2-department build, Dread perks add too little to keep pace.
  During those long cycles the Mines' uncapped Tap Damage keeps growing, so the 30-day Mines
  ratio drifts to ~5x on screen. Fixing this needs a meta-level decision: gentler floor growth,
  long multiplicative nodes, or the full suite's Dread and Goods.
- **Tribute is ~10x the arc on day 1.** Rank 40 means "ready for the first Fall", and the
  Cauldron's idle rate reaches its first-Fall level within an hour. Tribute at
  `0.5 x (1 + Rank)^1.5` per minute then pays ~60K on day 1. Under 00 §6 the Seal prices
  (4K / 25K / 150K / 600K) are sim-owned, so they should scale up rather than Tribute down.
  That's a Throne-level change.
- **AE vs wall clock** (above): pick which of the two the reference profile should honour.

### Pass 2: Dungeon and Troll Bridge (4 departments)

New adapters `sim/adapters/dungeon.ts` and `sim/adapters/bridge.ts` (see "How it works"); both
departments got a Pixi-free `def.ts` that their `index.ts` spreads in (behavior unchanged). The
meta sim unlocks them by Seal in `DEPT_ORDER`. "Before" is the first run with all four adapters
registered and the old numbers (seed 1); "after" is the current report (3-seed medians, worst
status).

Changes:

1. **Seals** (`src/core/meta.ts`): Dungeon 400 -> 2,500, Bridge 4,000 -> 44,000. Tribute runs ~10x
   the arc on day 1 (see "Still open"), so the provisional prices opened the Dungeon at 10 active
   min and the Bridge at 45. The Styx/Spire/Pit Seals (25K/150K/600K, Dread-gated) were left for
   those departments' own passes; the Bridge's Seal now sits above the Styx's.
2. **Dungeon econBase** 6e6 -> 2.5e7 (`dungeon/def.ts`): first Fall day 3 -> day 4 (arc).
3. **Bridge econBase** 8e4 -> 1e7, **rankRef** 1 -> 2, **rankTarget** 6 -> 25 (`bridge/def.ts`):
   the Bridge fell first of all (day 2) and sat at Rank 80-95 on a ~6/s idle rate.
4. **Dungeon Gong step** +10% -> +8% (`GONG_STEP`; five rings still fill the stack, now +40%).
   Active play measured 2.27-2.38x on-screen idle against 01 §3's 1.8-2.2x. The "Perfect Gong"
   Commendation now reads FULL STACK (it tests `bestGong >= GONG_MAX`), Ledger-Bones says +40%,
   and the scene's HUD texts use `GONG_STEP` instead of a hard-coded 10.
5. **Cauldron econBase** 6e9 -> 2.4e9 (cross-department, `cauldron/def.ts`). With the Dungeon and
   the Bridge open on day 1, the Cauldron gets fewer of the day's 90 minutes, and its first Fall
   slipped to day 2 08:00 at 5.4-5.7 h AE, outside the hard band. A Fall at the next morning's
   session always costs ~5.5 h AE in this profile (the night adds ~2 h), so the gate has to fill
   during the day-1 evening session.
6. **Harness**: the baseline for active:offline is 30 min of active-equivalent time into the cycle
   (it was 30 on-screen minutes, which the Dungeon and Bridge never reached with ~12 min a day
   each). Returns count only departments the player has entered (a department unlocked in the
   last slice of a session has had no chance to earn; the Bridge starts with an empty bank). The
   balance test gates suite bands per built department set, and checks determinism by replaying
   day 1 of the 7-day run (one extra 1-day run instead of two). Calibration probes now cover the
   Dungeon (live floor, no verbs) and the Bridge (goons only).

| Metric (band) | Before | After |
|---|---|---|
| Dungeon unlock (40 ± 30 active min) | 10 min | 45 min |
| Bridge unlock, Department 4 (105 ± 30; 00 §8 <= 2 h) | 45 min | 90 min |
| Cauldron first Fall (3-4 h AE ± 1, hard) | 8.21 h, day 2 08:00 FAIL | 3.11 h, day 1 19:10 |
| Dungeon first Fall (arc day 4) | day 3 12:30 (2.52 d) | day 4 08:05 (3.34 d) |
| Bridge first Fall (arc day 4-5, after the Dungeon) | day 2 21:17 (1.89 d) | day 5 08:00 (4.33 d) |
| Dungeon active : offline (3-5x) | no baseline time FAIL (first 30 min 3.45x) | 3.30x |
| Dungeon active : on-screen idle (1.8-2.2x) | 2.26x (first 30 min) | 2.15x |
| Bridge active : offline (3-5x) | no baseline time FAIL (first 30 min 3.87x) | 3.64x |
| Bridge active : on-screen idle (2.3-3.2x) | 2.59x (first 30 min) | 2.39x [2.31-2.56] |
| Cauldron / Mines active : offline (3-5x) | 3.63x / 4.02x | 4.25x / 3.96x |
| Dungeon / Bridge live floor with no input / idleRate (≈ 1.0) | n/a | 0.99x / 1.05x |
| Dungeon / Bridge first upgrade (< 60 s) | 0 s / 16 s | 0 s / 4 s |
| Tribute share C / M / D / B (<= 45.7%) | 26 / 20 / 19 / 35% | 29 / 23 / 24 / 24% |
| Dread share C / M / D / B (<= 45.7%) | 31 / 22 / 27 / 19% | 50 WARN / 25 / 15 / 9% |
| Lifetime Dread, day 7 (125-371 derived for 4 depts) | 399 WARN | 329 |
| Dungeon / Bridge average cycle (1.5-3 d) | 1.68 / 1.50 d | 2.18 d / open cycle 2.7 d at 99% |
| Dungeon / Bridge dial step median (25-60 min) | 5.2 / 17.3 min | 6.0 / 29.8 min |
| Something affordable on returns > 15 min (100%) | 100% | 100% |
| Lifetime Tribute, end of day 1 | 39K | 47K |
| `npm run sim` runtime | 23 s (`--quick`, before the probe cache) | ~46 s full, ~8 s `--quick` |

Bot skill (`--skill`, seed 1), on-screen ratio novice / reference / expert: Dungeon 1.86x / 2.15x /
2.25x, Bridge 2.32x / 2.39x / 2.60x.

Still open after pass 2:

- **Cauldron Dread share ~50% at day 7** (cap 45.7%). It isn't the first-Fall change: at the old
  econBase the Cauldron also Falls 6 times by day 7 (shares 48-51%). Its week-1 cycles run
  ~1.1 days while the Dungeon (first Fall day 4) and the Bridge (day 5) Fall 1-2 times by the arc.
  Under the arc's own cycles (1.5-3 days) the Cauldron's share would be ~31-36%. Steeper Malice
  above the knee (x3) brought it to 41-43% but opened a 2.25-day stall at Malice IX, so it was
  reverted; fixing it belongs with the weeks 2-4 cycle work below. Not gated.
- **Weeks 2-4 now stretch in the new departments too** (30 days: Dungeon average 5.1 d, longest
  10.6 d; Bridge 6.0 d / 9.8 d). The Dungeon fills its floor (85 pieces, all at L10) by day 5, after
  which only the Lure grows income (bounty x1.17 per tier, +4 tiers per Fall vs a x3 floor). The
  Bridge caps Signage, Goon Pricing and Goons by ~day 4, after which only Menace grows income
  (x1.2 per level, +2 levels per Fall). Same meta-level decision as above.
- **Bridge Seal (44K) above the Styx's (25K).** Fine for unlock order (the Styx is Dread-gated),
  but the Styx/Spire/Pit prices should be re-derived with their adapters. (Done in pass 3.)

### Pass 3: River Styx and Sorcerer's Spire (6 departments)

New adapters `sim/adapters/styx.ts` and `sim/adapters/spire.ts` (see "How it works"), registered
after the Bridge; both unlock by Seal plus lifetime Dread (10 / 60) in `DEPT_ORDER`. "Before" is
the first full run with both adapters and the harness fixes below but the departments' own seed
numbers (3-seed medians, worst status); "after" is the current report.

Harness changes:

1. **Slice rotation** (`meta.ts`). The slice picker used "least time today" but reset it every
   session, so the 10-min sessions only ever reached the first two departments in order: the
   Cauldron and the Mines got ~25 min a day, the Dungeon and the Bridge ~5, and departments 5-6
   none at all outside Legend days. Slices now go to the department visited longest ago (fresh
   unlocks and waiting Legends first). Each of six departments gets ~8 on-screen minutes a day.
   This moved the four tuned departments a little (table below); no Cauldron, Mines, Dungeon or
   Bridge number was changed.
2. **Single-department fixture** for departments 5-7 (00 §8.1, W-23): the reference player's
   meta (Throne, Dread perks, lifetime Dread) at the unlock. Without it the solo Styx had no
   Banners or perks and read 1.7x the reference time.
3. **Unlock day and first-Fall arc** for departments 5-6 (`metrics.ts`, see "Bands derived").
4. **Floor-growth experiment switch**: `DeptEcon.floorGrowth` (optional, never set by the game;
   `economy.ts` `econFloor` and the 100-200% Infamy band use it, default `FLOOR_GROWTH = 3`),
   `SimConfig.floorGrowth` and `npm run sim -- --floor-growth X`.

Changes (sim-tuned seeds, commented where they live):

1. **Seals** (`src/core/meta.ts`): Styx 25,000 -> 120,000, Spire 150,000 -> 900,000 (War Pit
   600,000 -> 3,000,000, provisional, to keep the ladder rising for the phantom-Seal variant).
   Lifetime Dread (10 / 60) is met by day 2 / day 3, so Tribute binds.
2. **Styx** (`styx/def.ts`): econBase 1e6 -> 1.2e8, rankRef 6 -> 12, rankTarget 60 -> 250.
   `NET_YIELD` 0.65 kept: the live loop already sits at ~2.6x on screen.
3. **Spire** (`spire/def.ts`): `IDLE_TUNE` 0.5 -> 8, econBase 1.5e8 -> 1.8e10, rankRef 100 ->
   1,500, rankTarget 2,000 -> 1e4. The reference bot realizes several times EV_drop(T9) per drop
   (Void Stars and a Singularity every ~25-30 min), so the apprentices' formula needed a much
   larger realization factor to keep active play at ~2.8x idle.

| Metric (band) | Before | After |
|---|---|---|
| Styx unlock (day 2 ± 1) | 1.33 d (day 2 08:00, with the Bridge) | 1.52 d (day 2 12:30) [1.52-1.75] |
| Spire unlock (day 4-5 ± 1) | 2.52 d (day 3 12:30) | 3.52 d (day 4 12:30) [3.52-3.88] |
| Styx first Fall (derived 4.25-5.25 d) | 2.34 d, 6.3 h AE | 4.52 d, 16.7 h AE [4.52-4.75] |
| Spire first Fall (derived 6.25-7.25 d) | 3.75 d, 1.1 h AE | 6.33 d, 16.2 h AE [5.88-6.33] |
| Styx active : offline (3-5x) | 3.12x FAIL (one seed 2.98x) | 4.01x [3.94-4.11] |
| Styx active : on-screen idle (03 §3: ~2.8x, 2.4-3.2) | 2.16x | 2.66x [2.61-2.70] |
| Spire active : offline (3-5x) | 34.6x FAIL | 3.63x [3.27-3.65]; 4.1x pooled over 6 seeds |
| Spire active : on-screen idle (04 §4: ~2.8x, 2.4-3.2) | 25.1x | 2.51x [2.26-2.52]; 2.83x pooled |
| Styx / Spire first upgrade (< 60 s) | 0-12 s / 10-20 s | 12 s / 10-20 s |
| Styx / Spire something affordable on returns | 100% / 100% | 100% / 100% |
| Styx / Spire cycles (2 h - 5 d) | 24-53 h / 24-30 h | 72 h / 48-68 h |
| Tribute share Styx / Spire (<= 37.4%) | 28% / 8% | 16% / 20% |
| Dread share Styx / Spire (<= 37.4%) | 16% / 12% | 9% / 10% |
| Lifetime Dread, day 7 (145-439 derived for 6) | 406 | 304 [269-309] |
| Single-department main, Styx / Spire (<= 1.5x) | 2.19 h / 0.62 h vs 3.27 / 1.01 | 22.5 h / 15.2 h vs 16.7 / 13.3 |
| `npm run sim` runtime | n/a | ~49 s full, ~9 s `--quick`; CI test ~13 s |

The four tuned departments, pass 2 (4 departments, old slice picker) -> pass 3 (6 departments,
rotation): active : offline Cauldron 4.25x -> 4.26x, Mines 3.96x -> 3.92x, Dungeon 3.30x ->
3.36x, Bridge 3.64x -> 3.56x; first Falls unchanged (day 1 19:14, day 3 08:00, day 4 08:00, day 5
08:05); Cauldron average cycle 1.14 -> 1.24 d; Dread share Cauldron 50% -> 41% (cap 45.7% -> 37.4%),
Mines 25 -> 16%, Dungeon 15 -> 18%, Bridge 9 -> 8%; Tribute shares 15-17% each. One Cauldron seed
now reads 3.10x on screen against its 2-3x band (median 2.72x; seed 1, which CI gates, passes).

Bot skill (`--skill`): Styx on-screen ratio novice / reference / expert 2.28x / 2.66x / 2.63x
(seed 1). The Styx loop is mostly waiting (sink, bite wait, swim-in, fly), and with a few Braided
Line levels a reel only fails if the player holds ~0.9 s into a thrash, so skill shows up as
spooked fake-outs, missed windows at high Wrath and recast time, not escapes. Spire, 6 seeds x 2 h
solo: novice / reference / expert earn 4.8e8 / 5.0e8 / 6.1e8 Arcana; the novice's slower beat
offsets its worse aim because fast drops clog the flask (vents), and without the 1.2 s settle the
30-drops/min reference bot earned less than the novice.

What changes how they feel:

- **Spire apprentices pay 16x more per orb** (`IDLE_TUNE` 0.5 -> 8). Idle and offline Arcana and
  the Spire's Rank rise accordingly; active play is unchanged. The Spire report and Rank now read
  ~1e4/s at the first 100% Infamy instead of ~600/s.
- **Longer first cycles**: the Styx's first Legend now comes ~3 days after its Seal (was <1 day)
  and the Spire's ~3 days after (was ~1 h of active-equivalent play).
- **Later Seals**: the Styx opens a few hours after the Bridge instead of at the same moment; the
  Spire on day 4 instead of day 3.

Still open after pass 3:

- **Cauldron Dread share ~41%** (above): same cause as before, the starter's ~1.2-day week-1
  cycles. The arc (1.5-3-day cycles) would give it 24-31%. Not gated.
- **Spire ratio noise**: ~25 baseline minutes per 7-day seed of a payout where one Singularity is
  worth ~2,000 s of idle. Pooled it sits at 4.1x; `ratioOffline|spire` is not CI-gated.
- **Weeks 2-4** now stretch in all six departments (next section).

#### Floor growth experiment (not applied)

30-day reference runs, 3 seeds each (`--floor-growth`, or `SimConfig.floorGrowth`). The economy
floor is `E0 x g^n`; the 100-200% band spans one more step of `g`. Values per department in the
order Cauldron / Mines / Dungeon / Bridge / Styx / Spire, seed medians.

| | x3 (shipped) | x2.5 | x2 |
|---|---|---|---|
| Falls in 30 days | 9 / 5 / 5 / 4 / 3 / 3 | 10 / 6 / 5 / 5 / 4 / 4 | 13 / 7 / 5 / 6 / 5 / 5 |
| Weeks 2-4 average cycle, days (1.5-3) | 5.2 / 6.1 / 5.6 / 5.8 / 5.6 / 5.3 | 3.6 / 6.9 / 5.0 / 5.9 / 5.9 / 5.7 | 3.0 / 4.0 / 4.5 / 5.0 / 5.5 / 4.4 |
| Longest cycle incl. open, days (<= 5) | 9.5 / 10.4 / 9.2 / 9.0 / 7.2 / 6.8 | 6.8 / 11.5 / 9.2 / 10.4 / 9.2 / 8.6 | 6.0 / 6.8 / 8.2 / 8.0 / 10.5 / 7.1 |
| Stalls (cycles > 5 d, per department) | 2-3 | 2-3 | 1-2 |
| Lifetime Dread day 7 / 14 / 30 | 304 / 579 / 837 | 345 / 720 / 1,102 | 395 / 1,048 / 1,735 |
| Dread per day, weeks 2-4 | 24 | 33 | 58 |
| Cauldron Dread share, day 30 (<= 30%) | 37-39% | 37-39% | 48-51% |

In every variant the stalled cycles sit with the skill gate full and the economy gate at 90-99%
for days: once a department's capped nodes are bought its income plateaus, so the time to the
next floor still grows geometrically, only with a smaller base. x2 is the only variant near the
band, and it buys that with 2.4x the Dread rate (more Iron Fist and Ruinborn feed back into
income) and a 50% Cauldron Dread share. No growth factor on its own brings weeks 2-4 into
1.5-3 days.

### Pass 4: Goods (cross-department links, 00 §4)

Goods are in the meta sim exactly as in `game.ts` (`src/core/goods.ts` is shared): every second the
passive rate of each unlocked exporter (its `goods.rate`, clamped to [2/h trickle, the Good's
passive rate] x Imperial Roads) accrues on and off screen; the department on screen also earns the
active bonus from its export counter (`goods.count`: Batches + drops / 3,000, veins x 2%, kills / 25,
confiscations, rare+ catches + other catches / 10, T7+ merges), held to (active - passive) per hour
by a 10-minute token bucket; `applyOffline` credits the passive rate under the offline cap. The
importAdd group (+1.5% per import level, cap +18%) is in `coreMult`, not in Rank (like Banners:
the Black Market sells Goods for Tribute). The Throne bot spends Goods on every affordable import
node (cheapest first), and weighs Imperial Roads and a Black Market top-up (the open node with the
smallest Tribute shortfall) against Banners by income share per Tribute (one import level =
+2% of one department: +1.5% plus its small mechanic). `--no-goods` turns all of it off and
reproduces the pre-Goods build exactly (verified: identical `--quick` report to HEAD).

The War Pit has no adapter yet, so Captives, the Pit's two import lines and the late-import band
(W-19) aren't measured; the Pit's lines carry 00 §4's x1.5 lever (`LATE_LINE_MULT`) unmeasured.

Goods-specific constants (sim-tuned, commented where they live):

1. **Node cost** 40 -> 80 x 2.5^L (`NODE_BASE`). Node 1 ships alone (00 §4's fallback; lines max at
   +4.5%), so 40 x 2.5^L priced a line at 390 Goods and a Good's two lines maxed 4-6 days after the
   exporter unlocked (band ~12 ± 4). 80 puts the line's 780 Goods into its one node.
2. **Black Market** 40 -> 400 Tribute (+2% per purchase per day, `MARKET_BASE`). Tribute runs ~10x the
   arc (see "Still open"); at 40 a maxed line cost ~2% of a week-2 day's Tribute.
3. **Bone Miners take crew slots** (`mines/model.ts` `crewSize`). As 3 goblins beyond the 8-goblin
   cap they added ~35% to the crew's idle rate and pulled the Mines' drum-on on-screen ratio from
   2.68x to 2.33x (CI-gated band 2.4-3.0x); inside the cap they are three free hires.

Before (`--no-goods`) -> after, reference profile, 3 seeds:

| Metric | Before | After |
|---|---|---|
| Goods earned per day (Potions / Ingots / Bones / Contraband / Souls / Essence), 30 d | — | 166 / 99 / 249 / 84 / 169 / 128 (~1% active: ~8 on-screen min a day per department) |
| A Good's two lines maxed, days after the exporter unlocks (8-16) | — | Potions 9.1, Ingots 12.0, Bones 7.2 (WARN), Contraband 13.4 |
| Goods group at day 7 / day 30 | — | +3.0-7.5% / +4.5-9.0% (Node-1 cap +9%) |
| Black Market, 30 d | — | ~1,150 Goods for 2.8M Tribute (3.1% of lifetime Tribute); Roads L7-8 |
| Lifetime Dread day 7 (145-439) | 304 [269-309] | 338 [300-342] |
| Lifetime Dread day 14 / day 30 (seed medians) | 579 / 837 | 588 / 902 |
| Weeks 2-4 average cycle, days, C / M / D / B / S / Sp (1.5-3) | 5.15 / 6.14 / 5.59 / 5.80 / 5.56 / 5.32 | 4.59 / 7.29 / 5.38 / 5.06 / 8.04 / 7.60 |
| Falls in 30 days (seed 2), C / M / D / B / S / Sp | 9 / 5 / 5 / 4 / 3 / 3 | 9 / 5 / 5 / 4 / 4 / 4 |
| Average cycle after the first Fall, days (30 d) | 3.19 / 5.10 / 4.80 / 5.80 / 5.56 / 5.32 | 2.88 / 4.80 / 4.64 / 5.06 / 8.04* / 7.60* |
| Dread share day 30, Cauldron (<= 37.4%) | 39.3% | 36.4% |
| Tribute shares day 30 | 10-27% | 10-26% |
| Active : offline, 7 d (3-5x) | C 4.26 M 3.92 D 3.36 B 3.56 S 4.01 Sp 3.63 | C 4.52 M 4.02 D 3.33 B 3.60 S 4.29 Sp 4.57 [3.38-5.47] |

\* Every Fall comes earlier with Goods (e.g. the Bridge's 4th Fall day 21.8 -> 19.5, the Styx's and
the Spire's 4th Fall now lands on day 28-29 in every seed instead of one): the Styx and Spire
averages rise only because that extra, long 4th cycle is now inside the 30-day window. Goods
shorten cycles by ~5-10%; they don't fix the structural weeks 2-4 stretch (5-8 day cycles), which
still needs the meta-level decision under "Still open".

Watch: the Spire's active:offline reads 4.57x median with one seed at 5.47x (hard band 3-5x). Tempered
Glass widens the flask 6 px at L3, which helps the live bot more than Spark Fuel's +15% apprentice
drops help idle; it sits on ~20 baseline minutes of a lumpy payout (see Pass 3), so it's noted, not
retuned. The Mines' gated ratio reads 2.57x [2.52-2.76].

### Pass 5: War Pit, long nodes, floor growth (7 departments)

New adapter `sim/adapters/pit.ts` (see "How it works"), registered after the Spire; the Pit unlocks
by Seal plus lifetime Dread 150 in `DEPT_ORDER`, so with seven adapters there are no phantom Seals
left. Then the weeks 2-4 fix: one long multiplicative node per department, and a floor-growth
decision re-made with those nodes in place. Every number below is a sim-tuned seed, commented where
it lives. "Before" for week 1 is Pass 4's report (six departments, 3-seed medians); "before" for
weeks 2-4 is a 30-day run with the Pit adapter but no long nodes at x3; "after" is the current tree.

Harness changes:

1. **`ratioScale`** (`sim/types.ts`, `meta.ts`): the long node multiplies active and idle income
   alike, but it grows income ~1000x through a late cycle, so a ratio of summed seconds was decided
   by the last hours and by single lumpy payouts (the Pit read 1x-30x across seeds). The ratio
   metrics now divide the node's multiplier out of both sides. At level 0 nothing changes.
2. **Ratio rows under 10 baseline minutes are INFO** (`metrics.ts`), and the single-department row
   compares against the seed median of the reference first Fall, INFO when the reference has none
   in the window (the Pit in 7 days). It used seed 1 alone.
3. **Dry returns are logged** (`meta.ts`: a `dry` event names the department and its state).
4. **30-day CI tier** (`BALANCE_LONG=1`, see "Reading the report").

#### War Pit tuning

The adapter measured a Pit far off its bands with the shipped seeds: the reference bot's line search
beat an 8/14 Huntmaster ~85% of the time (Triumphs ~90% at the target Stakes), the economy gate
filled within an hour of the Seal (econBase 4e4 against Late Recruit x2, Banners, Dread perks and
offline Skirmishes at ~0.7), and late in a cycle the bot bought Stakes it couldn't win Runs at
because the drilled Standing Warband still cleared all 12 Gauntlet rounds there. Changes:

1. **Huntmaster** 8/14 -> 14/30 (`run.ts` `HUNT_ATK`/`HUNT_HP`), his own stats growing with
   stakesStat^0.5 (`HUNT_STAKES_EXP`; his beasts keep the full x1.1^S). At the full growth the
   reference bot won ~1 Stakes-10 Run in 3, and the last target stalled cycles past 5 days.
   `PARAMS_VERSION` 1 -> 2.
2. **Skill gate: 1 Pit Crown at Stakes >= target** (`def.ts` `PIT_CROWNS`, was 2), 07 open question
   8's own fallback for when the sim can't meet "skill gate within 2.5 days of reference attention"
   at the top of the 35-50% Triumph band. The reference player gives the Pit ~8 on-screen minutes a
   day (~1 Run); two Crowns took 3-5 days a cycle. HUD and summary texts read `x/PIT_CROWNS`.
3. **k_idle** 0.06 -> 0.05 (`K_IDLE`), **Showman** +10% -> +5% per level (`run.ts` `SHOWMAN_STEP`):
   once the Standing Warband clears all 12 Gauntlet rounds Skirmish pay is capped
   (~0.3 x 1.22^S x Teeth multipliers per s), while Showman kept growing Run pay; at +10% x 20 a
   late cycle read ~6x on screen.
4. **econBase** 4e4 -> 5e6, **rankRef** 0.15 -> 0.5, **rankTarget** 3 -> 12 (`def.ts`).
5. **Seal** 3,000,000 kept (`src/core/meta.ts`): lifetime Dread 150 arrives on day 4-5, Tribute
   binds, and the Pit opens on day 6 18:00 - day 7 08:00.

| War Pit (band) | Shipped seeds | After |
|---|---|---|
| First upgrade (< 60 s) | 102 s (the bot saved the purse for Stakes 1) | 0 s (Tooth Pliers from the 120-Teeth purse) |
| Unlock (00 §6 day 6-8) | 6.33 d | 5.75 d [5.75-6.33] (day 6 18:00 - day 7 08:00) |
| First Fall (~3 days after the Seal) | 1.4 d after (econ gate in ~0.3 h AE) | 2.6-3.0 d after (day 9 08:00 - day 10 08:00) |
| Triumphs at the target Stakes, reference (35-50%) | ~90% (Huntmaster ~100% when reached) | ~50% at Stakes 4, 46-73% over targets 4-10 in 30-day runs |
| Novice / reference / expert at Stakes 4 | 50 / 90 / 100% | 17 / 52 / 67% |
| Rounds 1-5 win rate (>= 75%) | 95% | 90-96% |
| Run length (6-9 min) | 5.3-6 min | 6.5-6.7 min |
| Active : on-screen idle (07 §3: >= 2.6x, centre 3.2x) | 0.8-7.6x in 12-day runs | 3.0-3.5x over days 6-16 (3 seeds); see "Still open" for 30 days |
| Weeks 2-4 cycle (1.5-3 d) | 4.7 d (2 Crowns) | 2.85 / 3.08 / 3.79 d (seeds 1-3) |

Drill Yard check (the task's late-cycle question): with the honest Stakes policy the bot's Run pay
over Skirmish pay held 3.1-3.9x in the Drill 6-9 bucket across three 30-day seeds (before the long
nodes, which made raw per-bucket sums meaningless). What broke the ratio was not Drill alone but a
dial set above the bot's Run strength (the drilled warband kept clearing 12 rounds there): the bot
now raises Stakes only after a Crown at its top, as a player who reads the scout would.

#### The long nodes (weeks 2-4)

Shared curve in `src/core/longnode.ts`, themed and priced per department: **income x1.15 per level,
cost x1.18 per level** (cost growth >= effect growth, 00 §8), a new title every 10 levels (the
visible milestone, shown in the row: "KETTLE X1.15 > X1.32", "NEXT: VAT X4.05"), **max 150**, a run
upgrade (resets on Fall), **open after the department's 2nd Fall**. Each multiplies every local
income path (inside `idleRate` and the scene's earn calls), so it moves active and idle together.

| Department | Node | Effect | First level | Titles |
|---|---|---|---|---|
| Cauldron | Grander Cauldron (Pantry) | every ingredient's value x1.15^L (`ingValue`) | 1.5e10 Bile | POT, KETTLE, VAT, TUN, CISTERN, MOAT, LAKE |
| Mines | Richer Seams (Shaft) | every rock's Nuggets x1.15^L (`oreMult`) | 2e9 Nuggets | COPPER ... DRAGONORE |
| Dungeon | Hoard of Greed (Workshop) | all Plunder x1.15^L (`plunderMult`; the idle sim runs at greed 0 and scales after the memo) | 5e5 Plunder | COFFER ... MOUNTAIN |
| Bridge | Royal Toll Charter (Bridge) | every fare, bounty, fine and goon toll x1.15^L (`fareMult`) | 8e4 Tollpence | WRIT ... EMPIRE |
| Styx | Ferryman's Legend (Lures) | every soul, wisp and netted catch x1.15^L (`legendMult`) | 1.2e5 Obols | WHISPER ... LEGEND |
| Spire | Arcane Amplifier (Alchemy) | all Arcana x1.15^L (in `potentMult`) | 1.5e8 Arcana | LENS ... APEX |
| War Pit | Arena Renown (Spoils) | all Teeth, Runs and Skirmishes, x1.15^L (`teethMult` = Pliers x Renown) | 2e4 Teeth | BRAWL ... EPIC |

Why these shapes (each was measured, then changed):

- **The cap.** Each multiplicative node's income-per-spend elasticity is ln(effect)/ln(cost growth),
  0.85 here, and they add: with Tooth Pliers (0.16), Fresher Stock or Tap Damage alongside, the
  sum reaches ~1, i.e. exponential income. A Pit stalled on its skill gate for 7 days went from
  1e8 to 1e22 Teeth/s. The cap bounds the node at x1.3e9; normal cycles use 40-80 levels, the
  Styx up to ~120 (its Wrath dial costs x9 per Fall until the target caps at 20; at 100 and 120 a
  Styx working its Wrath-20 gate had nothing left to buy on returns).
- **2nd-Fall unlock.** Opening after the first Fall, the node arrived in cycle 1, where the greedy
  buyers rightly preferred a universal multiplier to active-only nodes (Tap Damage, Batch nodes,
  reels), which dragged the CI-gated week-1 ratios out of band (Mines 1.86x on screen, Styx 1.91x).
  Pricing it later fixed the ratios but cost ~24 levels (~x28 income) in late cycles; the unlock
  keeps cycles 0-1 as tuned and the low prices for weeks 2-4.
- **Bases** ~1-2 h of a later cycle's plateau idle, then lowered where a department's weeks 2-4 still
  ran long (Dungeon, Bridge, Styx, Pit: their skill gates and dials grow faster than the floor:
  Wrath x9, Lure x9.4, Menace x6.3 per Fall).

Side changes this needed (all to keep previously gated bands passing):

1. **Mines FIST_TIER** 1.9 -> 2.0: the reference seed read 2.2-2.3x on screen (band 2.4-3.0x), and
   its day-0/1 values moved with no Mines change at all (Tribute now also grows with Legend trophies
   through the Trophy Hall group, which shifts Seal times and the slice rotation).
2. **Styx NET_YIELD** 0.65 -> 0.6: the reference seed read 2.30x on screen (band 2.4-3.2x) after its
   Seal moved from day 2 18:00 to 12:30.
3. **Bridge OPENING_FLOAT** 0 -> 100 Tollpence: with an empty bank and no goons the Bridge earns
   nothing until played, so a Fall in a slice's last second left 3 returns with nothing affordable
   (hard band). 100 covers the first goon, like the Dungeon's 100 and the Pit's 120.
4. **HUD** (`src/ui/hud.ts`): the economy-gate toast used `econBase * 3 ** n`; it now calls
   `econFloor`.

#### Floor-growth comparison (with the long nodes and Goods)

30-day reference runs, 3 seeds each, seed medians, departments in the order Cauldron / Mines /
Dungeon / Bridge / Styx / Spire / War Pit. The Dread/day yardstick is the 00 §6 arc for weeks 2-4
(each department cycling every 3 days at Crush 0 to every 1.5 days at Crush 25% from its arc first
Fall): 77-340 a day for seven departments, ~146 at 2.25-day cycles. The pre-Pass-5 29 a day was a
symptom of the stretched cycles.

| | Before (no long nodes, x3) | x3 | **x2.5 (shipped)** | x2 |
|---|---|---|---|---|
| Falls in 30 days | 9 / 5 / 5 / 4 / 4 / 3 / 3 | 14 / 12 / 10 / 10 / 9 / 9 / 6 | 15 / 13 / 10 / 10 / 9 / 10 / 7 | 18 / 15 / 10 / 10 / 9 / 10 / 7 |
| Weeks 2-4 average cycle, days (1.5-3) | 4.75 / 6.00 / 5.63 / 5.33 / 8.27 / 5.27 / 4.67 | 2.61 / 2.46 / 2.77 / 2.82 / 2.98 / 2.90 / 3.59 | 2.26 / 2.15 / 2.82 / 2.73 / 2.92 / 2.60 / 3.08 | 1.81 / 1.91 / 2.82 / 2.86 / 2.90 / 2.49 / 3.08 |
| Longest cycle incl. open, days (<= 5) | 7.8 / 10.0 / 9.2 / 9.7 / 14.0 / 13.4 / 9.7 | 3.0 / 3.0 / 3.5 / 3.9 / 4.0 / 3.8 / 7.0 | 2.6 / 2.6 / 3.2 / 3.9 / 4.0 / 3.4 / 4.4 | 2.2 / 2.4 / 3.4 / 4.0 / 3.8 / 3.2 / 3.8 |
| Stalls (cycles > 5 d, median per dept) | 2 each | Pit 1 | 0 (one seed: a Pit 8.6 d) | 0 |
| Lifetime Dread day 7 / 14 / 30 (day 7: 145-439) | 314 / 638 / 976 | 361 / 1,098 / 5,044 | 372 / 1,233 / 5,704 | 415 (one seed WARN) / 1,709 / 6,928 |
| Dread per day, weeks 2-4 (arc 77-340) | 29 | 203 | 233 | 284 |
| Dread share day 30, highest (<= 30%) | Cauldron 33% | Cauldron 21% | Cauldron 25% | Cauldron 31% (FAIL) |
| Tribute share day 30, highest (<= 30%) | Spire 24% | Pit 22% | Styx 22% | Styx 24% |

**Decision: x2.5** (`src/core/economy.ts` `FLOOR_GROWTH`). With the long nodes most departments are
bound by their skill gates and dial prices rather than the floor (the Dungeon, Bridge, Styx and Spire
barely move between variants), so the floor mostly sets the Cauldron's and Mines' pace and the
Pit's. x2.5 is the only variant with all seven departments inside 1.5-3 days, while the day-7 Dread
stays in its band and Dread per day stays inside the arc band; x3 leaves the Pit at 3.6 days with a
7-day stall, and x2 breaks the day-7 band and puts the Cauldron above 30% of the Dread at day 30.

#### Before -> after (7 days, 3 seeds, medians)

| Metric (band) | Before (Pass 4, six departments) | After (seven) |
|---|---|---|
| Report | 96 pass / 29 warn / 0 fail (six departments) | 105 pass / 34 warn / 0 fail |
| Active : offline C / M / D / B / S / Sp (3-5x) | 4.52 / 4.02 / 3.33 / 3.60 / 4.29 / 4.57 | 4.10 / 3.84 / 3.33 / 3.56 / 3.85 / 3.33 |
| On-screen ratio C / M (drum) / D / B / S / Sp (dept bands) | 2.72 / 2.57 / 2.15 / 2.39 / 2.66 / 2.51 | 2.63 / 2.49 / 2.16 / 2.36 / 2.53 / 2.33 |
| First Falls C / M / D / B / S / Sp (arc) | d1 19:14 / d3 08:00 / d4 08:00 / d5 08:05 / d5 12:30 / d7 08:00 | d1 19:14 / d3 08:00 / d4 08:00 / d5 08:05 / d5 12:30 / d7 08:05 |
| Unlocks Styx / Spire / Pit (00 §6) | 1.52 / 3.52 / — | 1.52 / 3.52 / 5.75 d |
| First upgrade, every department (< 60 s) | 0-20 s | 0-20 s (Bridge 0 s with its float, Pit 0 s) |
| Lifetime Dread day 7 (145-439) | 338 | 372 [355-390] |
| Dread share day 7, Cauldron (<= 35% at 7; 37.4% at 6) | 41% (WARN) | 33.6% [32-35%] |
| Tribute shares day 7 | 15-17% each | 13-20% (Pit 1%, opened on day 6-7) |
| Something affordable on returns (100%) | 100% | 100% (30-day: 100% at x2.5) |
| `npm run sim` / CI test runtime | ~50 s / ~13 s | ~55 s / ~11 s |

What changes how departments feel:

- **A seventh door.** The War Pit opens late in week 1 and Falls ~3 days later. Its Huntmaster hits
  much harder early (14/30 at Stakes 0, was 8/14) but grows more gently with Stakes; one Pit Crown
  at the target now holds the skill gate; Showman pays half as much per level; Skirmishes pay
  ~17% less per round cleared.
- **Every department has a long node** that opens after its 2nd Fall: one row that keeps paying
  x1.15 a level through the whole cycle, with a new title every 10 levels. Late in a cycle it's
  where most of the bank goes, and income climbs steadily instead of plateauing; numbers get much
  bigger late in a cycle (Dungeon and Styx idle rates reach 1e5-1e6/s by week 4, Ranks ~150-250).
- **Shorter, steadier weeks 2-4**: 2.2-3.1 days per department instead of 5-8, and a Legend at the
  gate somewhere most days. Dread arrives ~8x faster than before in weeks 2-4 (now what the 00 §6
  arc implies), so Dread perks fill faster.
- **Smaller tweaks**: Mines taps hit harder per Pick Tier (x2.0), the Styx's netters fetch a bit less
  (0.6), the Bridge starts each cycle with 100 Tollpence.

Still open after pass 5:

- **War Pit attention.** Late Pit cycles hang on one Triumph at Stakes 10 with ~1 Run a day, so a
  seed can still stall one cycle (8.6 days in 1 of 3). A reference player who opens the
  department whose skill gate is lagging (00 §2.2: the HUD shows it) would fix most of it; that's
  a profile change for all departments, not tried here.
- **30-day active : offline drift** (not CI-gated): Mines ~5x (Tap Damage still grows in long
  cycles), Dungeon ~2.1x (was ~2.8x: the buyer funds Hoard of Greed over defense, so the live floor
  leaks at Lures the Cautious idle steps below), Pit 2-5x (lumpy Run payouts on ~1 Run a day),
  Spire 2.7-3.8x.
- **Rank inflation.** Rank is log-income, so the long nodes raise late Ranks (~+30 per 10 node
  levels in the Pit) and Tribute; Seals and Banners absorb it so far (lifetime Tribute day 7
  7.9M vs 7.1M).
- **Cauldron week-1 Dread share** 32-35% (cap 35%): not gated.

### Pass 6 (final): the new rules mirrored, the last tuning

All seven departments, Goods, long nodes, and the core rules added since Pass 5. "Before" for week 1
is the report at the start of this pass (current department numbers, the old mirror); "after" is
the current tree. Everything below is a 3-seed median unless marked.

#### Harness changes

1. **Mirrored rules** (`sim/meta.ts`, all through the real core functions; see "How it works"):
   Fear Itself in `credit()` (`econGateMult`), per-department `offlineFactor(s, id)` for offline
   income, that department's Tribute and the ratio metrics (Iron Discipline), `dreadPayout` with
   Legend's Bane, Head Start and the Signature at each cycle start (and the Signature on purchase),
   the Steward (`stewardShare` / `stewardSpend`, same pool, floor and 5 s cadence as game.ts),
   return rituals (`ritualBonus`, score 0.7), purchase policies for `LATER_PERKS`, the wing perks,
   `THRONE_EXTRAS` and Edicts, and prices rounded up like the sheets. Swift Rebuild, Trophy Hall,
   Dark Tithe and Goods Caravan act through `tempMult`, `tributeRate` and `roadsMult`.
2. **Adapters**: the War Pit stores the stationed warband in `persistent.guard` (scene.ts
   `station()`, Old Guard), and the Dungeon runs `masonRebuild` on entry when Master Mason is owned.
3. **`steward` profile** and its rows: a hard audit (never below the reserve, never past the pool,
   no dial move; 0 violations in 1,469 buys over 7 days), what it bought, its pace against the
   reference, and its hard bands (all pass). The CI test runs it for 3 days.
4. **Slice picker**: after fresh and Legend-waiting departments, one whose economy gate has been
   full for 12 h while the skill gate isn't, once per session (the HUD shows that bar). It only
   fires on real stalls; week 1 is unchanged.
5. **CLI**: `--out <dir>`, `--seed N`, `--profile P`, `--ref-only`, `--off <rules>`. New INFO rows:
   when the new perks are first bought, the Dread share they take, Edict time, rituals.
6. **CI** (`tests/balance.test.ts`): the determinism test has a 20 s timeout (it timed out at 5 s
   under load); a 3-day Steward test; new gates `firstFallDay|mines`, `cycleAvg|dungeon`,
   `cycleMax|pit`, and `dreadShare|cauldron` in the seven-department suite set. `npx vitest run`
   ~22 s; the 30-day tier ~70 s.

**A bug the mirror found (fixed in the sim, worth knowing for the game).** The first ritual mirror
credited the bonus after letting a waiting Legend in, so 3.5% of a big overnight haul landed in a
fresh cycle's economy gate. That broke the 30-day runs: Cauldron cycles of 3 minutes, Spire stalls
of 11 days, Mines 10x on screen. The game avoids it because `completeFall` re-enters the department
and a ritual whose scene closes forfeits its bonus, so the bonus can only pay the old cycle. The sim
now plays the ritual before the Fall. If the game ever lets a ritual finish across a Fall (or pay
after it), the same exploit appears.

#### Tuning changes (each commented SIM-TUNED where it lives)

| Change | Where | Why |
|---|---|---|
| Spire Seal 900,000 -> 1,200,000 Tribute | `src/core/meta.ts` `SEAL_COST` | Trophy Hall + Dark Tithe make Tribute ~10% richer by day 4: the Spire opened day 4 08:00 and Fell day 6 18:00 (arc 6.25-7.25 d). Now it opens day 4 18:00 and Falls day 7. |
| Cauldron skill target `min(4 + n, 10)` -> `n = 0 ? 4 : min(5 + n, 10)` | `src/depts/cauldron/def.ts` | Week 1 had 6 Cauldron Falls (cycle 1 ~13 h overnight) and ~45% of the day-7 Dread (cap 35%). The first Fall is unchanged; from Fall #6 on the cap is the same. |
| Spire `IDLE_TUNE` 8 -> 6.5 (econBase 1.8e10 kept) | `src/depts/spire/def.ts` | 30-day on-screen ratio 2.0-2.3x (active : offline 2.3-2.8x, hard 3-5x); the slower idle also holds the earliest seed's first Fall to day 7. |
| War Pit skill target `min(4 + 2n, 20)` -> `min(4 + floor(1.5n), 20)` | `src/depts/pit/def.ts` (+ `tests/pit.test.ts`) | Weeks 2-4 cycles 3.1-3.3 d with 5.0-5.7 d stalls at targets 12-16 on ~1 Run a day. |

Tried and reverted: Mines `FIST_TIER` 1.8 -> 1.7 (the 5.2x Mines reading came from the ritual bug
above; with the fix 1.8 reads 2.68x on screen, 1.7 read 2.16x).

#### Before -> after, week 1 (7 days, 3 seeds, medians)

| Metric (band) | Before (pass start) | After |
|---|---|---|
| Report (incl. side profiles) | 105 pass / 34 warn / 1 fail | 107 pass / 34 warn / 1 fail (+ steward rows) |
| Active : offline C / M / D / B / S / Sp (3-5x) | 3.71 / 4.05 / 3.29 / 3.57 / 4.15 / 3.22 (one seed 2.78, FAIL) | 3.56 / 4.15 / 3.30 / 3.62 / 4.20 / 4.41 (one seed 2.99, FAIL) |
| On-screen ratio C / M (drum) / D / B / S / Sp | 2.36 / 2.63 / 2.12 / 2.36 / 2.75 / 2.25 | 2.33 / 2.68 / 2.13 / 2.35 / 2.78 / 3.15 |
| First upgrade (< 60 s) | 0-12 s | 0-12 s |
| Unlocks Mines / Dungeon / Bridge (active min) | 5 / 45 / 90 | 5 / 45 / 90 |
| Unlocks Styx / Spire / Pit (days) | 1.52 / 3.52 / 6.33 | 1.52 / 3.75 / 5.75 |
| First Falls C / M / D / B / S / Sp | d1 19:00 / d3 08:00 / d4 08:00 / d5 08:05 / d5 18:00 / d7 08:05 | d1 19:00 / d3 08:00 / d4 08:00 / d5 08:00 / d5 18:00 / d7 08:00 (one seed d8 12:35) |
| Cauldron cycles after the first Fall | 1.19 d, 6 Falls | 1.18 d, 5 Falls |
| Dread share by day 7, Cauldron (<= 35%) | 41.0% | 33.5% [32-40%] |
| Lifetime Dread day 7 (145-439) | 402 [390-417] | 373 [313-392] |
| Tribute shares day 7 (<= 35%) | 13-19% (Pit 0.3%) | 14-19% (Pit 1%) |
| Lifetime Tribute day 7 | 7.8M | 8.5M |
| Something affordable on returns | 100% | 100% |
| Steward profile (rules / hard bands) | not simulated | 0 violations / all pass; +1 Fall in Cauldron, Mines, Bridge by day 7 |

#### Before -> after, weeks 2-4 (30 days, 3 seeds)

"Pass 5" is that pass's x2.5 column; "mirrored" is this pass's mirror before the Pit and slice
changes (Spire already tuned).

| Metric (band) | Pass 5 | Mirrored, before Pit tuning | After |
|---|---|---|---|
| Weeks 2-4 cycle C / M / D / B / S / Sp / Pit (1.5-3 d) | 2.26 / 2.15 / 2.82 / 2.73 / 2.92 / 2.60 / 3.08 | Pit 3.09 / 3.10 / 3.30 (seeds) | 1.90 / 2.43 / 2.59 / 2.67 / 2.51 / 2.88 / 2.86 |
| Longest cycle (<= 5 d) | 2.6 / 2.6 / 3.2 / 3.9 / 4.0 / 3.4 / 4.4 (one seed Pit 8.6) | Pit 5.66 and 5.00 (2 of 3 seeds) | 2.4 / 4.0 / 3.2 / 3.5 / 3.6 / 4.0 / 3.7 (max 4.0) |
| Falls in 30 days | 15 / 13 / 10 / 10 / 9 / 10 / 7 | | 17 / 12 / 11 / 10 / 10 / 9 / 8 |
| Lifetime Dread day 7 / 14 / 30 | 372 / 1,233 / 5,704 | | 373 / 1,456 / 6,338 |
| Dread share day 30, highest (<= 35% at 7) | Cauldron 25% | | Cauldron 35% [33-39%] |
| Tribute share day 30, highest | Styx 22% | | Bridge 22% |
| Active : offline C / M / D / B / S / Sp / Pit (not gated) | M ~5, D ~2.1, Pit 2-5, Sp 2.7-3.8 | | 4.5 / 5.2 / 2.4 / 3.3 / 3.7 / 3.1 [2.6-4.2] / 5.1 [2.3-5.3] |

New-perk uptake (30 days, seed 1, 1-based days): Trophy Hall and Edict Board day 2 12:30; Legend's
Bane (Cauldron) day 11; Swift Rebuild day 12 (L3 by day 30); Head Start L2 everywhere from day 15;
the seven Signatures days 19-21; Legend's Bane in the Mines and Dungeon days 21-23. 12% of the Dread
goes to the new perks. Goods Caravan is never worth a Dread over Iron Fist or Ruinborn. Edicts: Fear
Itself ~85% of the time (mostly the Spire and the Mines), Dark Tithe ~10% (saving for Seals), Iron
Discipline ~3%.

#### What changes how the game feels

- **The Cauldron's second to fifth Legends need one more Malice level** (5 Batches at Malice
  6/7/8/9, was 5/6/7/8; Malice 10 from the sixth Legend, was the seventh). Week 1 has one Cauldron Fall
  fewer; the starter no longer dominates the first Dread.
- **The Spire opens half a day later** (Seal 1.2M Tribute, day 4 evening), and its apprentices pay
  ~19% less idle, so the flask feels more worth playing (on screen ~2.6-3.2x idle).
- **War Pit Legends ask for gentler Stakes** later on (4, 5, 7, 8, 10, 11, 13 ... 20 instead of
  4, 6, 8 ... 20), so one tough Huntmaster no longer holds a cycle for 5 days.
- **The new rules mostly add pace, not pressure**: rituals +3.5% of each haul, Fear Itself shortens
  economy-gate waits, Trophy Hall and Dark Tithe add ~10% Tribute (absorbed by the Spire Seal and
  Banners), and the wing perks arrive in weeks 2-3.

#### Still open after Pass 6

- **30-day active : offline drift** (not gated; the 7-day hard bands pass): the Mines rise to
  ~5.2x (4.2x on screen: Tap Damage and the Gem nodes keep growing while the crew hits its regrowth
  ceiling; the fix is a Mines curve change, e.g. Tap Damage cost growth, not a seed), the Dungeon
  falls to ~2.4x (the buyer funds Hoard of Greed over defense), and the Pit and Spire swing by seed
  (2.3-5.3x, 2.6-4.2x) on lumpy Run and Singularity payouts.
- **Spire week-1 ratio and first Fall spread**: 15-20 baseline minutes in week 1, so one seed in
  three reads under 3x active : offline or Falls just after day 7.
- **Cauldron**: week-1 cycles ~1.2 days and a 33-39% Dread share at day 30 (cap 35%). Lengthening
  them further needs the first Fall to move, which the hard AE band forbids (see "Current results").
- **Tribute surplus**: Banners reach 16-17 per department by day 7. Only Seals and Banners absorb
  Tribute in week 1; the Trophy Hall and Dark Tithe make that ~10% larger.
- **Goods Caravan** is never bought by the reference bot (its +10% trickle is worth less than Iron
  Fist or Ruinborn at any price the bot meets); a cheaper curve would make it a real choice.

## Pass 7 (Wave 1 of the fun plan: pacing reset, Night Orders, active play moves the meter)

Intentional design changes. Each one is mirrored in `sim/meta.ts`, which uses the same pure helpers.

- **24 h offline cap** (`economy.ts OFFLINE_CAP_BASE_H`, was 8 h): local income, Goods and Tribute.
  Curfew Bells, Long Reach and Treasury stack on top. Fun plan A4 / research R10.
- **Offline time fills the economy gate to 90% of the floor** (`OFFLINE_GATE_CAP`, linear; ~99% on
  the log Infamy bar). The last push is on screen, or comes from a "gate" Night Order. Background
  departments count in full while the player is present. The skill gate still never moves offline:
  `idleOnlyFalls` stays 0.
- **Night Orders** (`core/orders.ts`). Each department holds a standing order for every absence of
  60 s or more. The core pair is "income" (+25% bank) vs "bait the Legend" (gate x1.5, no 90%
  limit), and departments can supply their own orders. The sim bot baits once the skill gate is met
  and takes the income order otherwise (`botOrder`). Its run tallies are in `SimResult.orders`.
- **A5: on-screen earnings count x2 on the economy gate** (`ACTIVE_GATE_MULT`; the bank is
  unchanged, and present-but-idle play doesn't count). A skill-gate "chunk" bonus was tried and
  dropped: with the current Cauldron it moved the first Fall into session 2 (1.5 h AE, hard band 2-5).
- **Seals and Dread gates** (`meta.ts`):

  | | Before (Pass 6) | Pass 7 |
  |---|---|---|
  | Dungeon | 2,500 | 600 |
  | Bridge | 60,000 | 1,500 |
  | Styx | 120,000 / 10 Dread | 6,000 / 10 Dread |
  | Spire | 1,200,000 / 60 Dread | 100,000 / 30 Dread |
  | War Pit | 3,000,000 / 150 Dread | 400,000 / 75 Dread |

  Reference profile, seed 1 (live tree):

  | | Before | Pass 7 |
  |---|---|---|
  | Unlocks | Mines 5 min, Dungeon 45 min, Bridge day 2 08:00, Styx day 2 12:30, Spire day 4 18:00, Pit day 6 21:00 | Mines 5 min, Dungeon 10 min, Bridge 30 active min (session 1), Styx day 1 ~19:15 (right after the first Fall), Spire day 2 21:00, Pit day 3 21:00 |
  | First Falls | Cauldron 0.80, Mines 2.33, Dungeon 3.33, Bridge 4.34, Styx 4.75, Spire 6.52, Pit after day 7 | Cauldron 0.79, Mines 1.88, Dungeon 2.52, Bridge 2.88, Styx 3.5-4.8, Spire 4.75-5.75, Pit 5.3-6.5 |

  Day-7 lifetime Dread is ~470. The derived band follows the new arcs.
- **Bands re-baselined** (`metrics.ts`):
  - `ARC_UNLOCK_ACTIVE_MIN`: Dungeon 15, Bridge 40 (± 30).
  - `ARC_UNLOCK_DAY`: Styx 0.5-1, Spire 1-2, Pit 2-3 (± 1 day).
  - `ARC_FIRST_FALL_DAY`: Cauldron 0.75-1.5, Mines 1.75-3, Dungeon 2.25-3.25, Bridge 2.5-3.5, Styx
    3-4.5, Spire 4.5-5.5, Pit 5.5-6.5.
  - `tests/balance.test.ts` drops `cycleAvg|mines`: week-1 Mines cycles now run ~1.5 d, at the floor
    of the weeks 2-4 band.
- **Known.** Multi-seed runs: one seed of three reads the Cauldron at 2.9x active:offline. The
  ratio metric doesn't count the income order's +25%. HEAD already failed one Pit seed the same way.
  Department agents' partial edits move the Styx / Mines / Bridge numbers, so re-run after they land.
