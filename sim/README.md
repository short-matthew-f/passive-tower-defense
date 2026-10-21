# Balance simulation (`sim/`)

The headless balance harness from specs/00 §8.1. It runs the reference player through simulated
days on **the game's own pure modules**, so "the sim matches the game" holds because both run the
same code. Nothing here imports Pixi or the DOM.

```
npm run sim                     # 7 days x 3 seeds + side profiles -> table, sim/out/report.{md,json}
npm run sim -- --days 30        # weeks 2-4 cycle metrics
npm run sim -- --quick          # reference profile only, 1 seed (~5 s)
npm run sim -- --fall-at 150    # Fall policy: push to 150% Infamy before letting the Legend in
npm run sim -- --skill expert   # bot skill: novice | reference | expert
npm run sim -- --live           # Cauldron: live physics every second (no activeRate table)
npm test                        # includes tests/balance.test.ts, the fast CI tier (~7-9 s)
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
   - **Greedy buyer** (both): it buys the best Δincome/cost. When the skill gate needs the next
     dial level (Malice, Dig Deeper), it saves for it, and only buys items that pay for
     themselves before the dial would be affordable anyway. Gems and Batch Tokens buy the drum,
     then the cheapest node.
   - **Skill**: novice / reference / expert set reaction time and decision cadence (Cauldron),
     and tap rate and beat accuracy (Mines, 02 §13: 50/85/95%).
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
  factor). The metric uses "baseline" seconds only, meaning at least 30 min of on-screen play into
  the cycle (00 §8). Core multipliers cancel out, because both sides exclude them.
- **Active-equivalent (AE) time** = on-screen seconds, plus background and offline income
  converted at that department's measured active rate.
- **Calibration** rows run the live core with no player input against `idleRate`, which should
  be about 1.0 by definition (00 §7).

## Adding a department

The pure economy lives in `src/depts/<dept>/def.ts`, a `DeptEcon` with no Pixi imports;
`index.ts` spreads it into the full `DeptDef`. To add a department:

1. Give the department a `def.ts` (copy `cauldron/def.ts`). Keep its numbers in pure modules.
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
- **CI gate**: only rows marked `+CI` fail `npm test`. These are integrity (NaN, Infinity,
  negative balances), offline factor at most 0.9, first upgrade under 60 s, Fall #0-#5 targets
  inside the dial range, and every department reaching its first Fall. All other balance bands
  are reported, not gated. To gate one, set `ci: true` on it in `metrics.ts`.

Bands derived for a partial suite (see `metrics.ts`):

- **Tribute / Dread share**: at most the equal share plus 20.7 pp. The spec's 35% at 7
  departments is 1/7 + 20.7 pp, so 2 departments allow 70.7%.
- **Dread by day 7**: the 00 §6 arc for only the departments that exist. Each department's first
  Fall falls on its arc day (Cauldron early day 2, Mines day 3), then cycles of 3 days (low,
  Crush 0) to 1.5 days (high, Crush 25%) at 100% Infamy. For Cauldron + Mines that gives 70-235.
- **Phantom Seals** variant: the current 2-department build has no Tribute sink besides Banners.
  This variant pays the unbuilt departments' Seals as sinks, to approximate the full suite's
  Tribute economy.

## Current results (reference, 7 days, 3 seeds; `sim/out/report.md` has the full table)

**Pass**:
- First upgrade: Cauldron 8 s, Mines 4 s.
- Mines unlock at 5 active minutes.
- Something affordable on every return over 15 min (26/26 for each department).
- Idle-only never Falls, and its income never drops.
- Offline factor 0.70.
- No NaN or negative balances.
- Single-department mains are within 1.5x of the reference.
- Cauldron first Fall at 2.3 h AE; Mines at 3.8 h AE.

**Fail / warn**:
- **Active : offline at baseline.** Cauldron 6.6x (on-screen 4.5x, band 2-3x). Mines 1.6x
  (on-screen 1.05x with the drum, band 2.4-3.0x). Both are outside 3-5x, and skill barely moves
  them.
- **Calibration.** The Cauldron's live board with no input earns 1.8x `idleRate`, because
  `idleRate` leaves out gold pegs (05 §3). Mines matches at 1.12x.
- **Pacing is too fast on the wall clock.** The Cauldron's first Fall comes on day 1 at 19:00
  (arc: early day 2). The Mines' first Fall comes on day 2 at 08:00 (arc: day 3). Mines cycles
  average 0.74 d (band 1.5-3). Lifetime Dread on day 7 is 274 (derived band 70-235). The Mines
  earn 77% of all Dread.
- **Dial step cost.** Cauldron median 3.9 min, Mines 14.5 min of income per level (band 25-60).
- **Later-cycle stalls (30-day run).** After Fall #7 the Mines need depth 65, but the dial caps
  at 60, so the department stalls at 92% for good. The Cauldron's Malice 8 costs 1.7e13 Bile
  (100,000 x 15^M) against ~2e11/day, so after its 4th Fall (day 8) it stalls at 88%. Both break the 5-day cycle
  cap.
- **Tribute is high.** About 56K lifetime by the end of day 1 (arc: about 4K by 1:45 and 25K by
  day 2). With 2 departments, all of it goes into Banners (about 20 levels each by day 7).
