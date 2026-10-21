# Balance simulation (`sim/`)

The headless balance harness from specs/00 §8.1. It runs the reference player through simulated
days on **the game's own pure modules**, so "the sim matches the game" holds because both run the
same code. Nothing here imports Pixi or the DOM.

```
npm run sim                     # 7 days x 3 seeds + side profiles -> table, sim/out/report.{md,json} (~45-50 s)
npm run sim -- --days 30        # weeks 2-4 cycle metrics
npm run sim -- --quick          # reference profile only, 1 seed (~5 s)
npm run sim -- --fall-at 150    # Fall policy: push to 150% Infamy before letting the Legend in
npm run sim -- --skill expert   # bot skill: novice | reference | expert
npm run sim -- --live           # Cauldron: live physics every second (no activeRate table)
npm test                        # includes tests/balance.test.ts, the fast CI tier (~10-14 s)
```

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
   - **Between sessions**: one closed-form `applyOffline` jump (offlineFactor, offline cap,
     Tribute cap).
   - **Shared rules**: `completeFall` and `buySeal` follow the same rules as the game, all through
     `src/core/economy.ts` and `src/core/meta.ts`.
   - **Throne Room bot**: buys Seals, then Dark Banners, Curfew Bells and Treasury, then Dread
     perks, by value per cost.
   - **Fall policy**: Fall at 100% Infamy (`--fall-at` pushes further).
   - **Profiles**: `reference` (day 1: 45 + 15 + 30 min; then 10 + 10 + 10 + 20 min),
     `idle-only`, `grinder`, `solo`.

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
   - `anyAffordable`, `dialLevel`, `dialMax`, `dialId`, `dialCost`, plus optional `ratioState`
     and `localRatioBands` (the spec's own active:idle bands).
3. Add one line to `sim/adapters/index.ts`. Add its arc first-Fall day and unlock minute in
   `sim/metrics.ts` if 00 §6 gives one. Its Seal starts being bought automatically.

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
  in `metrics.ts`.

Bands derived for a partial suite (see `metrics.ts`):

- **Tribute / Dread share**: at most the equal share plus 20.7 pp. The spec's 35% at 7
  departments is 1/7 + 20.7 pp, so 2 departments allow 70.7% and 4 allow 45.7%.
- **Dread by day 7**: the 00 §6 arc for only the departments that exist. Each department's first
  Fall falls on its arc day (Cauldron early day 2, Mines day 3, Dungeon day 4, Bridge day 4-5),
  then cycles of 3 days (low, Crush 0) to 1.5 days (high, Crush 25%) at 100% Infamy. For
  Cauldron + Mines that gives 70-235; for all four departments, 125-371 (the full suite's 120-200
  is lower because 00 §6 has the Pit and the Spire contributing almost nothing by day 7).
- **Phantom Seals** variant: pays the unbuilt departments' Seals (Styx, Spire, Pit) as pure
  Tribute sinks, to approximate the full suite's Tribute economy.

## Current results (reference, 7 days, 3 seeds; `sim/out/report.md` has the full table)

71 pass, 17 warn, 0 fail after the second tuning pass below (Cauldron, Mines, Dungeon, Bridge).
All hard bands pass. The remaining warnings are soft:

- **First Fall wall clock vs AE hours.** In the reference profile every night and day gap adds
  ~2-4 h active-equivalent. The Cauldron's hard "3-4 h AE ± 1 h" band puts its first Fall in the
  day-1 evening session (19:10, 3.1 h AE) instead of "early day 2". The later departments are
  held to their arc day instead: Mines day 3 08:00 (~11 h AE), Dungeon day 4 08:05 (~20 h AE),
  Bridge day 5 08:00 (~18 h AE).
- **Economy gate ≈ 2.5 h AE**: the same conflict.
- **Cauldron week-1 cycles** average 1.1 days (the 1.5-3 day band is for weeks 2-4), so it Falls 6
  times by day 7 and takes ~50% of the Dread (cap 45.7% for 4 departments). See "Still open".
- **Dial step cost**: Cauldron median 14 min, Mines 2 min, Dungeon 6 min (Bridge 30 min passes).
  Low dial levels are bought during the rebuild ramp, where income doubles every few minutes.

30-day runs (`--days 30`) still show the structural late-cycle problem from the tuning log, now in
all four departments: longest cycles 9-11 days.

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
  but the Styx/Spire/Pit prices should be re-derived with their adapters.
