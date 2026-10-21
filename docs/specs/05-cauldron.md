# 05 — The Cauldron (Idle Plinko)

Status: **revision 2**, after adversarial review. **This is the starter department and the first build** (user decision: "Plinko it is"), so its tutorial is the game's tutorial: Granny's onboarding script (§18). **Revision 4** (2026-10-21) adds Granny as the department manager (shared system in 00 §5.4).

## 1. Fantasy & pitch
**Pitch:** *A never-ending rain of foul ingredients bounces down the Hag's peg board. Curse the pegs to steer the flow into the jackpot, and brew plagues for the Overlord.*

The Cauldron is the empire's kitchen-of-doom, run by **Granny Gristle**, a hag who cooks plagues, curses and minion stew in a giant bubbling pot. A slanted rack of iron nails (pegs) hangs above the pot. Her **Toadlings** (warty little helpers) tip ingredients in from the rail. Where the ingredients land decides how potent the batch is. Output is **Bile**, the local currency. The Spire refines magic; the Cauldron is gross, cheap, mass-produced evil, like a school cafeteria for villains.

**Point of view:** the player is the Overlord. Granny runs the kitchen, and the Overlord's touch *curses* pegs and tosses the choice ingredients.

## 2. Core loop (active play) — verb: *steer the flow*

Review finding D-01 found that drag-aim-drop made the Cauldron play exactly like the Spire. The Cauldron's main verb is now **playing the board, not the drop**. The Spire keeps canonical drag-aim Suika.

1. **The flow:** Toadlings on the rail tip ingredients in continuously from random positions. It's idle-native from the first second: the board is never empty.
2. **Cursed Ladle pegs (main active verb):** tap any iron peg to curse it into a **Ladle peg** for 4 s. Any ingredient that touches it (toadling-dropped or tossed) gets kicked toward the center column. You start with **3 charges**, recharging 1 per 8 s. Placing Ladles on the right rows, at the right moment, funnels the rain into the high buckets.
3. **Granny's Toss (secondary verb):** the next **choice ingredient** sits in Granny's spoon. Tap one of the **9 chute keys** (a row of buttons under the pot, one per column) to toss it down that chute. Cooldown **1.0 s** (upgradable to 0.5 s). Only the current ingredient plus **1 next** are shown. Tosses are how you feed recipes with specific ingredients.
4. Ingredients fall through ~10 rows of pegs into one of **9 buckets**. Bile gained = `ingredientValue × bucketMult × modifiers`.
5. **Moving gold pegs** slide across set rows. A hit gives ×1.5 on that drop (stacks, up to 3 hits) and a crunchy "ding".
6. **Recipe ticket:** the pot always shows one order, e.g. *"3 Newt + 1 Bat Wing in ×2 or better."* An ingredient counts toward the ticket if it was **Tossed, or touched one of your Ladle pegs**, and landed in a qualifying bucket. Each counted ingredient pops a tick on the ticket itself, so you never have to track the particle (D-08). Finish it and you get a **Batch**: 25× your average drop value + 1 Batch Token. A new ticket rolls right away. Batches are also the Cauldron's Infamy event (§7).

**Example:** the ticket wants 3 Newts in ×2+. Rain is spraying left. You curse two pegs on row 4 and row 7 left of center, and three falling Newts get ladled inward. Two land in ×2 and one in the ×5 center, and the ticket ticks to 3/3. You tap chute 5 to Toss your Mandrake straight down the middle while the gold peg slides through. It clips the gold peg (×1.5) and lands in ×5.

Ingredients do **not** collide with each other. Each is an independent particle that only hits static pegs, moving pegs and walls. That keeps the physics cheap and deterministic, and keeps the feel apart from the Spire's stacking physics.

## 3. Passive / idle behavior
- **Toadlings** auto-drop ingredients from uniformly random rail positions (no aiming, no Ladles). Base: 1 toadling, 1 drop every 2.0 s.
- **On screen, idle:** toadlings keep dropping with the full simulation, so you can watch it.
- **`idleRate`** (shared interface, 00 §7): `toadlingDropsPerSec × avgIngredientValue × E[mult]_random`. Gold pegs, Ladles, recipes and special procs are excluded. Specials count at base value. With Taught Toadlings, the aimed share uses `E[mult]_aimed`.
- **Offline:** the shared core applies the suite offline factor (0.6 base, 0.9 cap) and the shared cap (8 h base; Curfew Bells and Long Reach raise it). There are no local cap or efficiency nodes. Report line: "Granny brewed 12.4K Bile and burned 3 toadlings' eyebrows."
- **EV cache (fixes M9):** `E[mult]` uses **common random numbers**: one fixed set of 20,000 (x, jitter seed, gold-peg phase) tuples, reused on every rerun so only the board changes. It runs in a Web Worker (< 150 ms) on any board upgrade or Malice change, never on a timer and never on hide. Random-x and aimed EVs are computed separately. A future option is an exact transfer-matrix solver.
- **Target ratio:** active ≈ **2–3× on-screen idle** (Ladle steering ~1.5×, Tosses + recipes ~1.4×, gold pegs ~1.2×), so **active ≈ 3.3–5× offline** at baseline. The balance simulation measures `activeMult` and has the final say.

## 4. Gentle failure modes
- **No zero bucket.** The edge "Dregs" buckets always pay something. They're capped at **60% of the lowest inner bucket** (D-09), so aiming at the walls is never optimal.
- **Spill:** an ingredient that hits a side wall at high speed can bounce out into a **Slop Pail** that pays ×0.25. Nothing is ever lost completely.
- **Tickets never fail.** Wrong ingredients just don't count. You can **reroll** a ticket for free every 60 s.
- **Malice overreach:** at high Malice the safe paths are thin. Bile/min can dip, but it never goes below the Malice 0 baseline × 0.8, and you can always set Malice lower (bought levels stay bought).

## 5. Entities

### Board
| Param | Base | Notes |
|---|---|---|
| Peg rows | 10 | 12 with Extra Row (max 2) |
| Peg radius | 2 px | Logical px |
| Peg spacing | **18 px horizontal, 14 px vertical**, offset rows | Widened for readability (D-08) |
| Buckets | 9, each 18 px wide | Starting layout below |
| Gravity | 400 px/s² | Fixed timestep 120 Hz |
| Restitution | 0.45 vs pegs, 0.6 vs walls | ±8% random jitter on each bounce |
| `p_center` (design parameter) | ≈ 12% of random-x drops at Malice 0 | `p_center(M) ≈ 0.12 × 0.85^M`; verified by the EV cache |

**The single bucket table** (fixes the contradictions in B2):

| Bucket | 1 (Dregs) | 2 | 3 | 4 | 5 (Center) | 6 | 7 | 8 | 9 (Dregs) |
|---|---|---|---|---|---|---|---|---|---|
| Start | ×0.5 | ×1 | ×1.5 | ×2 | **×3** | ×2 | ×1.5 | ×1 | ×0.5 |
| Center Jackpot I–IV | | | | | ×5 → ×7 → ×10 → ×15 | | | | |

### Peg types
| Peg | Effect | Unlock |
|---|---|---|
| Iron (default) | Plain bounce; can be cursed into a Ladle | — |
| **Ladle (player-cursed)** | For 4 s, kicks touching ingredients toward the center column (+40 px/s horizontal) | Start: 3 charges |
| Gold (moving) | ×1.5 per hit (max 3); slides 20 px/s | Start: 1 gold peg |
| Bone | +1 flat Bile per hit (scaled by tier) | Board upgrade |
| Rune | Teleports the ingredient up 2 rows once (more bounces) | Board upgrade |
| Thorn | Splits a Toad-class ingredient into 2 half-value copies | Board upgrade |
| Bumper (Malice) | Strong kick sideways toward the Dregs | Added by Malice |

### Ingredients (minimum sprite 5×5 px, 1 px outline, distinct colour per type; D-08)
| Ingredient | Value | Colour | Behavior | Spoon / flow weight |
|---|---|---|---|---|
| Newt Eye | 1 | yellow | Basic | 50% |
| Toad | 4 | green | Heavy, bounces less (rest. 0.35) | 30% |
| Bat Wing | 3 | purple | Floaty, gravity ×0.7 | 15% |
| Mandrake | 12 | orange | Screams; worth ×2 in a recipe | 5% (unlock) |
| **Splitroot** (special) | 6 | brown | Splits into 3 on its first peg hit | Unlock |
| **Boomshroom** (special) | 8 | red | Explodes on its 4th peg hit: gold pegs within 20 px give +1 hit to all ingredients for 2 s | Unlock |
| **Lead Heart** (special) | 10 | grey | Very heavy, falls nearly straight (good for Tosses) | Unlock |
| **Wisp Salt** (special) | 5 | cyan | Homes 30% toward the highest bucket below it | Unlock |
| **Hero's Sock** (rare) | 50 | white, glowing | 1-in-200 drop. ×2 Batch payout | Unlock |

`ingredientValue = base × (1 + 0.25 × FresherStockLevel)`.

### Toadlings
| Param | Base | Formula |
|---|---|---|
| Count | 1 | +1 per Hire Toadling level (max 8) |
| Drop interval | 2.0 s | `2.0 × 0.92^lvl`, min 0.5 s |
| Aim | Uniform random | Taught Toadlings: +20% of drops aim at the best chute ±1 |

## 6. Upgrade tree
Every cost is `base × growth^level`, paid in **Bile** unless marked 🎫 (Batch Tokens). Nodes with more than 10 levels follow the suite's visible-milestone rule (00 §8): Fresher Stock and Deeper Pot change the pot's bubble colour every 10 levels.

### A. Pantry (ingredients)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Fresher Stock | 15 | 1.15 | +25% value for all ingredients (additive per level) | ∞ |
| Mandrake Patch | 500 | — | Unlock Mandrake | 1 |
| Splitroot | 2,000 | — | Unlock Splitroot (4% weight) | 1 |
| Boomshroom | 8,000 | — | Unlock Boomshroom (3%) | 1 |
| Lead Heart | 25,000 | — | Unlock (3%) | 1 |
| Wisp Salt | 80,000 | — | Unlock (3%) | 1 |
| Special Odds | 1,000 | 1.6 | +1% weight on each unlocked special | 10 |
| Sock Drawer | 250K | — | Unlock Hero's Sock | 1 |

### B. Peg Board
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Extra Row | 300 | 3.0 | +1 peg row (more bounces, +4% E[mult]) | 2 |
| Ladle Charges | 150 | 2.0 | +1 Ladle charge (3 → 6) | 3 |
| Long Ladle | 400 | 2.2 | Ladle duration +1 s (4 → 8 s) | 4 |
| Gold Peg | 200 | 2.2 | +1 moving gold peg | 5 |
| Gold Polish | 100 | 1.35 | Gold mult +0.1 (base 1.5) | 15 |
| Bone Pegs | 1,500 | 1.8 | Convert 3 iron pegs to bone; bone gives +`1 × 1.2^lvl` | 10 |
| Rune Pegs | 6,000 | 2.5 | +1 rune peg | 4 |
| Thorn Pegs | 12,000 | 2.5 | +1 thorn peg | 4 |
| Scrying Ladle | 1,500 | — | Hold a chute key to see a probability glow over the buckets (D-19) | 1 |

### C. Buckets
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Deeper Pot | 50 | 1.25 | All bucket mults ×(1 + 0.05·lvl) | ∞ |
| Center Jackpot | 400 | 2.0 | Center bucket ×3 → ×5 → ×7 → ×10 → ×15 | 4 |
| Lined Buckets | 250 | 1.5 | Every **non-center** bucket +4% (D-09). Dregs stay capped at 60% of the lowest inner bucket | 10 |
| Bucket Shift | 3,000 | — | Long-press a bucket to swap it with a neighbor (1 swap per 5 min) | 1 |

### D. Toadling Kitchen (automation)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Hire Toadling | 100 | 2.4 | +1 toadling | 7 |
| Fly Bribes | 75 | 1.3 | Toadling interval ×0.92 | 20 |
| Taught Toadlings | 10,000 | 2.0 | +20% of toadling drops are aimed | 3 |

(Night Shift was removed. Offline cap and efficiency are Throne/Dread-level now, 00 §7.)

### E. Recipes 🎫 (Batch Tokens; persist through Falls)
| Node | Cost | Effect |
|---|---|---|
| Bigger Batches | 2 🎫 × 1.5^lvl | Batch payout +5× avg drop |
| Quick Tickets | 3 🎫 × 2^lvl | Reroll cooldown −10 s (min 10 s) |
| Double Order | 15 🎫 | 2 tickets on screen at once |
| Quick Toss | 2 🎫 × 1.6^lvl | Toss cooldown −0.05 s (1.0 → 0.5) |

**Pacing target:** first Hire Toadling at ~45 s, Center Jackpot I by ~4 min, first special ingredient at ~12 min, Malice I affordable at ~20 min.

## 7. The "harder board" dial: Board Malice (0–10) and the Fall

**Buying Malice (B1, B2):** each Malice level is a one-time purchase, `2,000 × 5^M` Bile, and **resets on Fall**. Once bought you can set Malice anywhere at or below your highest level, for free. Each level:
- removes the 2 pegs that most often guide drops into the inner buckets, and narrows the ×1–×2 buckets by 1 px each, so there are fewer safe paths;
- adds 1 **Bumper peg** per 2 levels;
- raises the inner buckets: `centerMult = baseCenter × 1.25^M`, `nextToCenter × 1.12^M`. These exponents are starting guesses; the balance simulation solves them so that the simulated `E[mult]` grows about `×1.08^M` given `p_center(M)`;
- raises the Dregs `× (1 + 0.04M)`, but never above the 60% cap.

High Malice rewards Ladle steering most: random drops gain modestly, while steered drops gain a lot.

**Infamy (00 §2.2):**
- **Skill gate:** complete **5 Batches at Malice ≥ `min(4 + N, 10)`** this cycle (on screen). It's a held, ratcheting state, not a jackpot count (m13), and it can't be completed by toadlings alone.
- **Economy gate:** this cycle's Bile earnings ≥ `E0_cauldron × 3^N`. That makes the first Fall land at ~3–4 h active-equivalent, not 25–40 min.
- **Fall:** the Legend wades through the pegs and the kitchen is razed. It resets Bile, Pantry, Board, Buckets, Toadlings and Malice levels. **Kept:** Batch Tokens, Recipes, Board Layouts.

**Board Layouts (the Cauldron's unique persistent collection, v1.1; D-14):** Classic (start), Funnel (unlocked by Fall #1), Hex (Fall #3), Spiral (Fall #5). Each layout is a different peg geometry and bucket order with its own EV cache. You pick one at the start of each cycle.

## 8. Local currency: Bile
- **Earned:** every ingredient landing (main source), bone peg hits, Batch payouts, offline brewing.
- **Spent:** Pantry, Peg Board, Buckets, Toadling Kitchen, Malice levels.
- **Batch Tokens 🎫:** secondary currency, earned only by finishing recipes (active only). Spent on the Recipes branch. This is what makes active play worth more than raw Bile.
- Display: shared `formatNum` (00 §8), plain numbers.

## 9. Session shapes
- **30 s:** Open, collect the report, buy 1–2 upgrades, curse a few pegs to finish half a ticket, close. Feels like a slot pull with a guaranteed payout.
- **5 min:** Finish 2–3 tickets by laddering Ladles and Tossing Mandrakes down the center chute, time gold-peg hits, buy a new row or gold peg, buy and try the next Malice level.
- **30 min:** Push Malice to the edge of what you can steer through. Plan Ladle placements around bumpers, save Batch Tokens for Double Order, unlock the next special and rebuild around it (thorn pegs plus Splitroot make drop fountains). Leave with E[mult] noticeably higher.

## 10. Screen layout (180×320 portrait)
Safe insets: top 16 px (notch/status bar), bottom 12 px (home indicator). Gameplay fits in y=16..308.
```
y   0 ┌──────────────────────────┐
      │      (safe area/notch)   │
   16 ├──────────────────────────┤
      │Bile 12.4K 🎫7 ▮▮▮░ [≡][⌂]│ HUD 16px: Infamy bar (skill|econ)
   32 ├──────────────────────────┤
      │ ≈toadlings≈ [🥄Toad] nxt:o│ Rail 12px: toadlings + spoon
   44 ├──────────────────────────┤
      │ .  .  .  .  .  .  .  .  .│
      │  .  .  .  ◆→ .  .  .  .  │ Peg board 142px
      │ .  .  ⊂  .  .  .  .  .  .│ (10–12 rows; ◆ gold, ⊂ Ladle)
      │  .  .  ✦  .  .  .  .  .  │
  186 ├──┬──┬──┬──┬──┬──┬──┬──┬──┤
      │.5│1 │1.5│2│3 │2 │1.5│1│.5│ Buckets 18px
  204 ├──┴──┴──┴──┴──┴──┴──┴──┴──┤
      │[Malice] (CAULDRON) 📜 2/3│ Pot 40px; lever L, ticket R
      │ ⊂⊂⊂ ladles  ~~bubbling~~ │ Ladle charges
  244 ├──┬──┬──┬──┬──┬──┬──┬──┬──┤
      │1 │2 │3 │4 │5 │6 │7 │8 │9 │ Chute keys 24px (Toss)
  268 ├──┴──┴──┴──┴──┴──┴──┴──┴──┤
      │[Pantry][Board][Bkt][Toad]│ Upgrade tabs 24px
  292 ├──────────────────────────┤
      │   ticker / toasts        │ 16px
  308 ├──────────────────────────┤
      │   (home indicator safe)  │
  320 └──────────────────────────┘
```
Upgrade sheets slide up and cover the board (y=44..268). The board keeps simulating underneath, dimmed, not paused.

## 11. Controls (one-handed, thumb)
- **Tap a peg** (snaps to the nearest iron peg within 8 px): curse it into a Ladle (uses a charge).
- **Tap a chute key** (bottom row): Toss the spoon ingredient down that column.
- **Hold a chute key** for 0.4 s (Scrying Ladle): the buckets glow by landing probability for that chute. Release to Toss, or slide off to cancel.
- **Flick up** on the spoon icon: swap the current ingredient with the next (1 free swap per ticket).
- **Long-press a bucket:** Bucket Shift (if owned).
- **Tap the Malice lever:** opens a 0–10 slider in the bottom zone. Unbought levels show their price.
- Chute keys, tabs and the lever are in the bottom 40% of the screen. Peg taps use the mid-board, which is in thumb reach.

## 12. What makes it different
- **Verb:** *steer a flow*. You shape a continuous rain with temporary board edits; you don't aim single drops. Spire = aim and stack one piece at a time; Mines = tap-to-mine (rhythm as an upgrade); Styx = cast-and-tension timing; Dungeon = placement and mazing; Bridge = reading people; War Pit = drafting a warband.
- **Nothing persists on the board.** Each ingredient is a 2-second story. The Spire is about the state that builds up in the flask; the Cauldron has no buildup.
- **Gamble feel with a floor:** this is the department that sells variance. Malice turns it into a risk-appetite slider.
- **Input is visibly different from the Spire's:** taps on pegs and fixed chute keys, no drag, no hold-to-aim on the board, and different cooldown and preview numbers (1.0 s / 1 next vs the Spire's drag and 2 next).

## 13. Pixel art & juice
- Palette: sickly greens, bruise purples, copper pot, iron-grey pegs, gold highlights. Ingredients are 5×5 px minimum with 1 px outlines and one hue per type.
- Each peg hit flashes the peg white for 1 frame and plays a pitched "tink" (pitch rises with each consecutive hit on the same drop).
- A Ladle peg glows green with a tiny spoon sprite and a countdown pip ring. Kicked ingredients leave a 1 px green streak.
- Gold peg hit: 4-particle gold spark, a "×1.5" popup, and a coin "ding".
- Bucket landing: a splash in the bucket's colour. Multipliers of ×5 and up get a 2-frame screen shake (1 px), a green plume from the pot and a Granny cackle. ×10 and up get a 120 ms slow-mo freeze.
- Ticket ticks pop on the ticket itself. Batch complete: the pot erupts in a skull-shaped bubble and the ticket burns away.
- Pot bubble rate scales with recent Bile/s, so it doubles as an at-a-glance income meter.
- **Return ritual (v1.1, 00 §5.3):** the toadling backlog fills a **Hopper** on the rail. Tip it for a 3 s cascading rain on the board, worth +5% of the offline haul.

## 14. Technical notes (PixiJS v8)
- **Physics:** custom and minimal. Particles are circles that collide only with static pegs, moving pegs (kinematic circles) and walls. No particle-particle collisions. Fixed timestep 120 Hz with an accumulator. Seeded PRNG (mulberry32) for jitter.
- **Broadphase:** a uniform grid matching peg spacing. Each particle checks only its own cell and neighbors (≤ 9 pegs). Cheap enough for **150 live particles** on mid-range phones.
- **Rendering:** pegs are baked into one static `RenderTexture`, redrawn on upgrade. Gold, rune, bumper and Ladle pegs are separate sprites. Ingredients use a pooled `ParticleContainer` from a single atlas. Text uses `BitmapText`.
- **Integer scaling:** render to a 180×320 base at `scale = floor(min(w/180, h/320))` with `roundPixels: true`, `antialias: false`.
- **EV cache:** the same physics module runs headless in a Web Worker with the fixed 20,000-tuple CRN set (§3). Results are stored in the save keyed by board hash and shown as an "expected value" readout in the Board tab.
- **Perf caps:** at most 150 particles. Excess toadling drops resolve instantly via `E[mult]` and show a small "+N" splash. Pause the sim when hidden and switch to rate mode.
- **Numbers and save:** plain `number`, shared `formatNum`, shared save module (00 §9).

## 15. MVP scope vs later (ships in v0.1)
**MVP:** Classic 10-row board, 9 buckets with the single table, Newt/Toad/Bat Wing, Ladle pegs (3 charges), Granny's Toss with chute keys, 1–3 gold pegs, toadlings (hire, Fly Bribes), Fresher Stock, Deeper Pot, Center Jackpot, Lined Buckets, Extra Row, Ladle Charges, CRN EV cache and idleRate, recipe tickets with Batch payout (Bile only, no tokens), **Malice 0–10 bought with Bile**, Infamy gates and Fall, 8 Commendations, **Granny as manager** (onboarding = the game's tutorial, Malice micro-lesson, milestone lines; §18).

**v1.1:** Batch Tokens and the Recipes branch, Mandrake, Splitroot, Boomshroom, bone/rune pegs, Long Ladle, Scrying Ladle, Board Layouts, Hopper return ritual, Potions export (with Goods, v0.3).
**Later:** Lead Heart, Wisp Salt, Hero's Sock, thorn pegs, Bucket Shift, Double Order, seasonal ingredients (Pumpkin Hex for Oct 31). (The old "Granny dialogue line" item is superseded: Granny is the department manager from the MVP, §18.)

## 16. Meta-economy hooks (per 00)
- **Tribute:** via Rank from `idleRate` (00 §5.1).
- **Export (v0.3):** **Potions**: 1 per Batch, plus 1 per 3,000 toadling drops, plus the 2/h base trickle.
- **Imports (v0.3):** Contraband → exotic ingredient weight; Essence → +1 Ladle charge per level. Each line has 2 mechanic nodes (00 §4).
- **Infamy and Fall:** §7.
- Every import is a bonus layer. The Cauldron is fully playable without any of them.

## 17. Decided questions (department-local; ratified 2026-10-21 with the recommended defaults, see README)

1. Is the "Hero's Sock" joke OK, or would you rather have a more grim-dark tone for rare ingredients? **Decided:** Keep; the suite's tone is comic-evil. (README OQ 25)
2. Bucket Shift: too much agency for plinko, or a welcome strategy layer? **Decided:** Keep as Later content. (OQ 26)
3. Should the classic drag-to-aim drop exist at all? **Decided:** No. Toss-by-chute covers aiming, and drag-aim is the Spire's verb. (follows OQ 8)

## 18. Manager: Granny Gristle

**Granny Gristle**, hag, head cook of the Cauldron. Revision 4 promotes her from department head to the department's **manager** under the shared system (00 §5.4). Hers is the first voice the player hears, so **her onboarding is the game's tutorial**.

- **Personality and voice:** a doting grandmother who happens to brew plagues. She is warm, patient and quietly menacing, measures everything in recipes, and is proud of the grossest ingredients. She calls the Overlord **"dearie"**, never hurries the player, and praises small wins. Her gibberish voice is warbly and mid-range, with a cackle on exclamations and a slurp after compliments. Readable lines are ≤ 32 characters, usually a gentle instruction or a food metaphor.
- **Portrait (32×32), expressions:** *stirring* (default, ladle in hand), *cackle* (big wins, Batches), *tasting* (scheming, recipes, Malice), *proud-disgusted* (spills, Dregs, the Hero's Sock), *worried* (Legend, long absence), *knitting* (ambient: a scarf made of something that's still wriggling).
- **Dock:** the default strip over the HUD and toadling rail (y 16–48). The board, buckets, pot and chute keys stay clear.
- **`isIntense`:** within 1.5 s of a Toss or Ladle, or while a Batch-complete eruption plays.
- **Icons she uses:** 🫧 Bile, ingredient icons, Ladle peg, chute key, 📜 ticket, toadling, Malice lever.

**Onboarding script (first launch; ~75 s; this is the game's tutorial):**
1. **Curse a peg.** The flow is already raining. A peg in the busiest row pulses under a ghost-finger. "Tap a nail, dearie. Curse it!" Done when a Ladled ingredient lands in an inner bucket. Bile pops and the pot bubbles.
2. **First upgrade.** The Toadling tab glows on Hire Toadling (≈ 45 s reference pace, inside the 60 s band). "Another pair of warty hands." Done on purchase. The new toadling waddles onto the rail.
3. **Toss.** The spoon glows with a Newt, and chute key 5 pulses. "Straight down the middle!" Done when a Tossed ingredient lands.
4. **The ticket.** The recipe ticket glows. "Granny's order. Fill it." Done when one ingredient ticks the ticket (Tossed or Ladled into a qualifying bucket). The tick pops on the ticket itself.
5. **Gold peg.** A gold peg slides through. "Clip the shiny one. ×1.5!" Done when any ingredient hits a gold peg, or after 20 s (it's a watch-beat, so the ghost only points).
6. **Granny's farewell.** "Kitchen's yours. Stir often!" The ⌂ button gets a single pulse, and the Mines Seal tip is saved for the `mechanic_unlocked` line below.

**Malice micro-lesson** (`mechanic_unlocked` on the first Malice purchase; 2 beats): (1) the lever opens and Granny points at the thinned board: "Fewer safe paths. Richer pot." (2) "Steer harder, dearie." Done when 3 Ladled drops land in the inner buckets at the new Malice.

**Milestone triggers and example lines:**

| Trigger (00 §5.4) | Condition | Expression | Example line |
|---|---|---|---|
| `first_upgrade` | first Center Jackpot level | tasting | "Middle's sweeter now. Mmm." |
| `first_helper` | 4th toadling hired | cackle | "Four warts! A proper kitchen." |
| `mechanic_unlocked` | first Batch completed | cackle | "That's a PLAGUE, dearie!" 📜 |
| `mechanic_unlocked` | the Mines Seal becomes affordable | tasting | "Goblins next door want you." ⌂ |
| `tier_reached` | first special ingredient (v1.1: Mandrake) | proud-disgusted | "Mandrake! Mind the screaming." |
| `dial_raised` | Malice I bought (runs the micro-lesson), then Malice 5 and 10 | tasting | "Nastier board. Lovely." |
| `hazard_first` | first Slop Pail spill | proud-disgusted | "Slop's still supper, dearie." |
| `infamy_50` | Infamy ≥ 50% | stirring | "Folk smell my stew for miles." |
| `legend_arrives` | Legend at the kitchen door | worried | "A hero at MY door? Wipe feet." |
| `return_after_fall` | first entry after a Fall | stirring | "New pot. Same old Granny." |
| `return_long_absence` | ≥ 8 h away | knitting | "Kept the pot warm for you." |
| `goods_link` | Contraband or Essence line opened | cackle | "Smuggled spice! Ooh, naughty." |
