# 02 — Goblin Mines (Department of Extraction)

Status: **revision 4** (2026-10-21). Revision 2 followed the adversarial review. Revision 4 applies two user decisions: **plain tap-to-mine is the core verb**, and the war-drum rhythm becomes an **upgrade branch, the Doom Drum** (§6E), with levels and companion nodes. It also adds the department manager, Gritch (§18, shared system in 00 §5.4). The revision 4 review (`review-rev4.md`, R4-01…R4-23) then fixed the drum's timing rule (one judged tap per beat), Frenzy pips, crit caps, the band coverage for drum-off cycles, the onboarding length and the save fields. Ships in **v0.1** alongside the Cauldron. All numbers are seeds owned by the balance simulation (00 §8.1); where a seed and a band disagree, the band wins.

## 1. Fantasy & pitch
**Pitch:** *Smash the rock wall with the Overlord's gauntlet while a crew of greedy goblins chips beside you. Dig deeper for richer veins and nastier stone, and when you're ready, haul in the Doom Drum and make the whole mine swing in time.*

The Overlord's war machine runs on ore. The Mines are the dirtiest department in the empire. **The player is the Overlord**, who comes down to *personally* crack rocks, which drives the goblins wild with fear and enthusiasm. Your taps are the Overlord's gauntlet (a heavy armoured fist pops on each tap). Later, the goblins drag the **Doom Drum** up onto the top ledge and pound it, and hitting on the beat becomes how the Overlord shows off. The foreman, **Gritch** (the department's manager, §18), introduces the Mines, chimes in at milestones and writes the department's report for Gobbo. Goblins are unique to the Mines; Gobbo is the only goblin who leaves.

## 2. Core loop (active) — verb: *smash*
Tap rocks → rocks crack and shatter → **Nuggets** fly to the counter on their own → spend on gauntlet, goblins, effects, depth → dig deeper.

**The rock wall:** a 5×5 grid of 32×32 px rock tiles. A broken tile stays an empty dark socket, then a new rock "grows" back after **1.5 s**. Goblins walk the ledges and attack the rocks nearest them.

**Tapping (from the first second):**
- Every tap deals **tap damage** to the rock under the finger. There is no timing requirement and no wrong tap. Taps on empty sockets do nothing (no penalty).
- **Crits** (5% base, ×5) give the gauntlet its punch from minute one: a "CRUNCH" word, hit-stop, a heavier thud.
- **Choosing targets is the skill before the drum:** goblins hit whatever rock is nearest; you pick. Ore Veins and Geodes first, finish the rocks the goblins have already cracked, set off Powder Kegs where they'll hit the most HP, and (with Chain Lightning) tap into clusters.
- **Rapid-tap soft cap:** taps beyond **8 per rolling second** deal 50% damage (the flash dims; nothing else changes). Together with the total cap of 15 hits/s (decided, README OQ 21), three fingers top out at about 1.4× one quick thumb. Before the drum there is no timing gate, so this cap is what keeps multi-touch from dominating.

**Moment-to-moment example (Depth 12, Stone stratum, no drum yet):**
- A grey rock has 54 HP. Your tap does 12 damage, so it breaks in 5 taps (4 with a crit). It drops 9 Nuggets.
- A glinting **Ore Vein** rock (8% spawn) has 2× HP and drops 5× Nuggets. You switch to it before a goblin wanders over.
- A tap procs **Chain Lightning** (Gem node, 12%): an arc jumps to 2 adjacent rocks for 50% damage. You start tapping the middle of clusters.
- A red **Powder Keg** spawns. Tap it once to light it. 1.2 s later it blasts the 3×3 around it for 10× tap damage. Players learn to wait for it to sit among high-HP rocks.
- A goblin has a rock at one crack left. You finish it, and he shakes his pick at you.

**After the Doom Drum (§6E):** the goblins' drum keeps a tempo, every rock carries a thin contracting ring that closes on each beat, and each beat judges **one tap**: the first tap after the previous beat's midpoint. If it lands inside the window it's a **Beat Hit** (×2 damage at first, more with Drumhead). Every other tap, including the quick follow-ups after a boom, does full normal damage: the drum *adds* a way to earn more and never takes anything away, but mashing can't fish for Beat Hits (§6E). Beat Hits fill **Frenzy** pips once Goblin Frenzy is bought. The same Depth 12 rock now breaks in about 3 taps when one is a Beat Hit, and with Goblin Frenzy, eight Beat Hits flare the torches, double the drum and start Frenzy.

## 3. Passive / idle behaviour
- **On screen, no input:** goblins keep mining. Kegs left alone auto-detonate after 8 s for 50% effect. Frenzy never triggers. With Drummer Goblins, the crew swings in time to the drum (an idle bonus, §6E). There's **no slacking penalty** (idling on screen is never punished).
- **`idleRate`** (shared interface, 00 §7). Deterministic, and the **same formula drives the live goblin tick** (B3):

```
goblinDPS    = Σ goblin.baseDPS × pickMult × overdepthMult × drumSync        // drumSync = 1 + 0.08 × drummers (1.0 without the drum)
rocksPerSec  = min( goblinDPS / avgHP(depth),  activeTiles / regrowTime ) × overkillEff   // regrowth ceiling applies
nuggetRate   = rocksPerSec × avgReward(depth) × veinBonus
gemRate      = rocksPerSec × gemChance                                                       // expected value, no RNG
```
  `overkillEff` (≈ 0.85) is measured by the balance simulation from live play.
- **Offline:** the shared core applies the suite offline factor (0.6 base, 0.9 cap) and cap (8 h base). There are no local cap or efficiency nodes (Lunch Breaks and Long Shift were removed). Hazards are disabled offline.

**Target ratio (revision 4): two states, both hard bands in the sim.**

| State | Active : on-screen idle | Active : offline (reference factor 0.6) |
|---|---|---|
| Before the Doom Drum (plain tapping) | 1.8–2.5×, centre 2.2× | 3.0–4.2× |
| With the Doom Drum (reference 85% on-beat) | 2.4–3.0×, centre 2.7× | 4.0–5.0× |

**How plain tapping reaches 3–5× offline without the drum** (reference bot, 6 taps/s):
1. **Tap power:** Tap Damage is seeded so that 6 taps/s ≈ **0.8–1.0× the crew's DPS** at the §8 baseline state. The sim's lever is the Tap Damage base and growth, held against Sharper Picks so that taps never fall behind the crew. Alone this gives ≈ 1.8–2.0×.
2. **Crits:** 5% × (×5) adds +20% tap damage from the start; Crit Chance and Crit Power take it toward +100–200%. The caps (25% and ×9) bound the expected crit bonus at exactly +200% (`1 + 0.25 × 8 = 3.0`), so crits can't outgrow the band late in a cycle (R4-02).
3. **Focus:** the player breaks Veins and Geodes first and finishes cracked rocks. Taps run at `overkillEff` ≈ 0.95 against the goblins' 0.85, and reward per break is +10–15% above the goblins' random mix.
4. **Kegs:** lit by a tap for 10× tap damage, versus 50% when left to auto-detonate.
5. **Chain Lightning** (Gems) procs on any tap (in revision 2 it needed a Beat Hit).

The drum then adds roughly +25–50% on top (Beat Hits, streak, Frenzy), while Drummer Goblins add up to +32% to idle. The sim holds the with-drum band by trading Drumhead and Frenzy against Drummer Goblins. The regrowth ceiling means offline can never out-earn the live wall.

**Which states each band covers (R4-08).** The drum is kept through Falls, so after cycle 1 almost nobody is "before the drum". The pre-drum band is therefore measured in **two** states, both hard: (a) cycle 1 at baseline with no drum, and (b) any later cycle at baseline with the drum **owned but switched off** and Drummer Goblins bought (their idle sync stays on, which lowers this ratio). Both must sit in 1.8–2.5× on-screen idle (3.0–4.2× offline), so switching the drum off for comfort or accessibility never drops the Mines below the suite's 3× floor. The with-drum band uses the drum switched on. `E0_mines` (the economy gate) is set from the drum-on reference bot, and the sim also checks that a drum-off reference bot meets it within the §8.1 single-department tolerance (1.5×).

## 4. Gentle failure / soft friction
Nothing is ever lost permanently. Every hazard costs a few seconds or a little efficiency. Missing the beat is never a failure: an off-beat tap is a normal tap.

| Hazard | Trigger | Effect | Counterplay |
|---|---|---|---|
| **Cave-in** | 2% per rock broken at depth ≥ 15 | 3–5 tiles fill with Rubble (1 hit each, 0 reward). Goblins under it are stunned 4 s | Timber Supports (−15%/lvl). A rake clears Rubble instantly |
| **Gas pocket** *(later)* | Gas rock (green tint, depth ≥ 25) | Goblins in a 3×3 mine at 50% for 8 s | Lanterns shorten it. Tap the cloud to waft it away (−1 s per tap) |
| **Bedrock** *(later)* | 3% of tiles at depth ≥ 30 | Can't be tapped (clink sfx). Blocks a socket until an explosion or lightning hits it | Explosives. Bedrock drops 3 Gems when blasted |
| **Overdepth** | Depth exceeds goblin pick tier (§6B) | Those goblins mine at 40% | Upgrade picks or step back up a stratum |

## 5. Entities
**Rocks** (d = current depth):
| Rock | Spawn | HP | Reward | Notes |
|---|---|---|---|---|
| Common | ~80% | `H(d) = 10 × 1.17^(d-1)` | `R(d) = 2 × 1.19^(d-1)` | Tint per stratum |
| Ore Vein | 8% (+Prospector) | 2×H | 5×R | Sparkle every 1 s. 2% chance to yield 1 **Ingot** (Good, v0.3) |
| Geode | 0.5% | 3×H | 1×R + 1 Gem | Reveals its crystal on crack |
| Powder Keg | 3% | 1 tap | 0 | 3×3 blast, 10× tap dmg |
| Motherlode *(later)* | 1 per 200 rocks | 15×H | 40×R + 5 Ingots | Big 2×2 tile. Brings a crowd of goblins |
| Rubble | cave-in only | 1 | 0 | |
| Gas Rock *(later)* | 4% (d ≥ 25) | 1×H | 1.5×R | Releases gas |
| Bedrock *(later)* | 3% (d ≥ 30) | immune to taps | 3 Gems | Explosion/lightning only |

**Strata** (every 10 depths, new palette and music layer): 1–10 Dirt, 11–20 Stone, 21–30 Iron, 31–40 Crystal, 41–50 Magma, 51+ Abyss (repeating with escalating tint). Once the drum is owned, each stratum also sets the tempo (§6E).

**Stratum behaviours (the Mines' unique progression, later; D-14):** each stratum adds one new rock *behaviour*, not just a tint. Iron: Magnet rocks pull Chain Lightning toward them. Crystal: Mirror rocks give lightning +1 jump. Magma: Hot rocks spread burn to neighbours. Abyss: Hollow rocks have two HP shells.

**Goblins** (max 12 on the ledges, 8 in MVP; drummers sit on the drum ledge and don't count):
| Goblin | Base DPS | Hire cost | Special |
|---|---|---|---|
| Grunt | 1.0 | `25 × 1.6^n` (n = goblins owned) | none |
| Sapper (unlock d10) | 0.5 | 2× Grunt | Plants a keg every 20 s |
| Shocker (unlock d20) | 0.5 | 3× Grunt | Chain lightning every 6 s (4 jumps, 2× its DPS) |
| Prospector (unlock d30) | 0.3 | 3× Grunt | +2% vein spawn each (cap +10%) |
| Drummer (needs the Doom Drum) | 0 | §6E | Syncs the crew to the beat (+8% crew DPS each) |

## 6. Upgrade tree
Unless noted, cost = `base × growth^level`. Any long node has cost growth ≥ effect growth (B3). Nodes over 10 levels follow the visible-milestone rule (00 §8): the gauntlet sprite upgrades every 25 Tap Damage levels, goblins get a new pick sprite every 10 Sharper Picks levels, and the drum skin changes every 5 Drumhead levels.

**A. Gauntlet (tap)** — the pre-drum active edge lives here.
| Node | Base | Growth | Effect |
|---|---|---|---|
| Tap Damage | 10 | 1.10 | `(1 + L) × 2^floor(L/25)`, with no upper limit (B3). Seeded so 6 taps/s ≈ 0.8–1.0× crew DPS at baseline (§3) |
| Crit Chance | 60 | 1.45 | 5% + 1%/L (cap 25%), crit ×5 |
| Crit Power | 200 | 1.6 | crit mult +1/L (cap ×9). With Crit Chance capped, the expected bonus tops out at +200% (§3) |
| Heavy Knuckles | 1e3 | 1.9 | each tap also does 15% splash to adjacent tiles per L (cap 60%) |
| Keen Eye | 400 | 1.8 | Veins and Geodes glint 1 s before they finish regrowing, and tapping one first gets +10%/L reward (max 5) |

(Frenzy Fuse moved to the Drum branch, where it now extends Frenzy. The on-beat window lives in Wide Swing.)

**B. Goblin Crew**
| Node | Base | Growth | Effect |
|---|---|---|---|
| Hire Goblin | see §5 | 1.6 | +1 goblin |
| Sharper Picks | 100 | **1.5** | goblin DPS ×1.15/L, **max 40** (B3) |
| Pick Tier | `500 × 12^T` | — | sets the goblin depth tier: no overdepth until `10 × (T+1)` |

(Gritch's Whip moved to the Drum branch, since it only acts during Frenzy.)

**C. Infernal Engineering (costs Gems; persists through Falls)**
| Node | Cost (Gems) | Effect |
|---|---|---|
| Chain Lightning | `5 × 1.5^L` | 5% + 1.5%/L proc on **any tap** (Beat Hits proc at 2×), arcs 2 + floor(L/5) rocks at 50% |
| Blasting Powder | `5 × 1.5^L` | keg spawn 3% + 0.5%/L, blast mult 10 + 2/L |
| Magma Pick | `8 × 1.6^L` | taps leave burn: 20% tap dmg/s for 3 s (+0.5 s/L) |
| Echo Strike | `10 × 1.7^L` | 3%/L chance a tap repeats 0.3 s later |
| Lucky Rocks | `6 × 1.5^L` | +0.1%/L Gem chance on any rock |

**D. Shaft**
| Node | Cost | Effect |
|---|---|---|
| Dig Deeper | `100 × 1.21^d` | unlocks max depth d+1 (this is the Mines' dial purchase; resets on Fall) |
| Timber Supports | `1e3 × 1.6^L` | cave-in chance −15%/L |
| Lanterns *(later)* | `2e3 × 1.6^L` | gas duration −1 s/L, cap −6 |
| Rock Regrowth | `300 × 1.4^L` | respawn 1.5 s → −0.1 s/L (min 0.6 s) |

Dig Deeper growth (1.21) sits just above the reward growth (1.19). Depth stays a deliberate spend, and the wall comes from HP rather than from runaway dig costs (B3).

### E. Drum Circle (the Doom Drum and its companions; revision 4)

The branch is **visible from the first session** as a covered drum silhouette with its price and requirement ("Doom Drum — 8 ✦ · reach depth 6"), so the player always knows the rhythm is coming. Every other node in the branch is hidden behind the drum until it's owned.

**The root node: Doom Drum.**
- **Cost:** **8 Gems**, and `maxDepthEver ≥ 6`. Reference: affordable at **~20–30 min** of Mines play. Gems run ~1 per 2 min early (m10), so a player who saves every Gem gets the drum at ~16–18 min, and one who buys Chain Lightning (5 Gems) first gets it at ~25–30 min. It competes with Chain Lightning as the first big Gem buy. Gritch flags it (§18).
- **Persistence:** like Infernal Engineering, the drum is **kept through Falls**. A mechanic, once learned, stays learned; its Nugget-priced levels below reset with the rest of the cycle.
- **On purchase:** the goblins haul the drum onto the top ledge, the music gains its drum layer (which *is* the metronome), the **beat lamp** appears on the depth-lever row and every rock grows a thin **contracting ring** that closes on each beat. A one-time micro-lesson with Gritch follows (§18), with an optional latency calibration.
- **Base effect:** taps within the on-beat window are **Beat Hits** for ×2 damage. Off-beat taps do normal damage.
- **Toggle:** an owned drum can be switched off in the Drum tab (rings hidden, no Beat Hits). Drummer Goblins keep their idle sync either way, so switching off never costs idle income. The toggle is saved in `persistent`, so a Fall never switches a drum back on for a player who turned it off (§13).

**Beat rules (once the drum is owned):**
```
beatPeriod(d) = max(0.50, 0.70 − 0.03 × floor((d − 1) / 10))  s         // per stratum: Dirt 0.70 … floor 0.50
window        = 60 ms + 10 ms × WideSwing                              // centred on the beat; ×2 with the Steady Drum setting
beatMult      = 2.0 + 0.1 × Drumhead                                   // ×2.0 → ×3.0 at Drumhead 10
streakBonus   = 1 + 0.03 × min(streak, 10)                             // on Beat Hits only; +30% max
```
- **One judged tap per beat (R4-01).** Each beat owns the time from the previous beat's midpoint to the next midpoint. The **first tap in that span, from any pointer**, is the beat's judged tap: inside the window it's a Beat Hit, outside it the beat is spent (that tap still does normal damage). Every later tap in the span is a normal tap and can't become a Beat Hit. This is what makes the drum a timing skill: a 60 ms window would otherwise be hit by chance by a 6 taps/s thumb about a third of the time, and by three mashing fingers almost every beat. The natural pattern it rewards is **BOOM-ta-ta**: hit the beat, then follow up freely until the midpoint. Hold-to-auto-hit taps are never judged and never spend a beat.
- **Drum Streak:** consecutive beats whose judged tap was a Beat Hit. A judged tap outside the window resets the streak to 0, so only the bonus is lost (as with the Styx catch combo). Beats with no tap at all don't break it (pausing is free), and follow-up taps never affect it. A tap with no beat ring shown (drum off) never affects anything.
- **Frenzy pips** (with Goblin Frenzy): +1 per Beat Hit, decaying 1 per 3 s without one. **Starting Frenzy empties the pips, and they don't fill while Frenzy runs** (R4-07); Beat Hits during Frenzy extend it instead. Frenzy uptime is therefore bounded (reference ≈ 40–55%), and the sim holds it there with the pip count and Frenzy Fuse.
- **Accessibility:** the **Steady Drum** setting doubles the window and adds a screen-edge pulse. **Hold to auto-hit** (§10) never lands on-beat. Neither is ever required: the Infamy gate doesn't need the drum (§7).

**Companion nodes (shown only once the drum is owned).** Nuggets unless marked ✦ (Gems, persistent).

| Node | Cost | Max | Effect | Why it needs the drum |
|---|---|---|---|---|
| **Drumhead** | `400 × 1.6^L` | 10 | Beat Hit mult +0.1/L (×2.0 → ×3.0). Drum skin changes at L5 and L10 | Levels the drum itself: the on-beat multiplier |
| **Wide Swing** | `600 × 1.9^L` | 6 | On-beat window +10 ms/L (60 → 120 ms) | Levels the drum: timing window width |
| **Goblin Frenzy** | `1,500 × 1.8^L` | 6 | L1: unlocks **Frenzy** at 8 pips: 5 s of taps ×2 (stacking with Beat Hits) and goblins ×1.5; each Beat Hit during Frenzy adds 0.25 s (cap 10 s). L2–L4: −1 pip each (8 → 5). L5–L6: Frenzy tap mult +0.5 each (×2 → ×3) | Frenzy is fed only by Beat Hits |
| **Frenzy Fuse** | `500 × 1.7^L` | 8 | Frenzy base duration +0.5 s/L (5 → 9 s), extension cap +0.5 s/L (10 → 14 s) | Extends Frenzy |
| **Gritch's Whip** | `2e3 × 1.5^L` | 10 | +10%/L goblin DPS during Frenzy | Acts only during Frenzy |
| **Drummer Goblins** | `2,500 × 2.2^n` | 4 | +1 drummer on the drum ledge; the crew swings in time: **`drumSync` +8% crew DPS each** (+32% at 4), counted in `idleRate` and offline | Drummers need a drum to bang |
| **Steady Hands** | `3,000 × 2.5^L` | 3 | Each level forgives 1 missed judged tap per Drum Streak, and Frenzy pip decay slows by +1 s/L (3 → 6 s) | Streak and pip protection |
| **Tempo Lever** ✦ *(later)* | `10 × 2^L` Gems | 2 | Unlocks tempo options, free to switch in the Drum tab. L1 **Stomp**: period ×1.25, window ×1.4, beatMult −0.3. L2 **Charge**: period ×0.8, window ×0.8, beatMult +0.3. Default **March** = the stratum tempo. Gem-priced and kept through Falls, because it unlocks a *choice* rather than power, and re-buying a setting every cycle is a chore (R4-17) | Tempo options for the drum |
| **Thunder Beat** ✦ *(later)* | `12 × 1.6^L` Gems | 5 | Every 16th beat is a Thunder Beat (a big gold ring and a drum boom). A Beat Hit on it fires Chain Lightning for sure, with +L extra jumps | Rides on the beat count |
| **Encore** *(later)* | `8,000 × 2^L` | 5 | When Frenzy ends, the drummers keep a war rhythm: goblins ×1.25 for 3 s/L. Shown only once Goblin Frenzy and at least 1 drummer are owned | Needs Frenzy and drummers |

Drummer Goblins is the branch's one idle node. Without it, the drum would only widen the active edge and push the ratio past 5×. With it, the drum is worth buying for idle players too, and the sim balances the two sides (§3).

## 7. The difficulty dial: Depth, and the Fall
Depth is the dial. **Dig Deeper** buys max depth, and the **depth lever** (§9) lets you pick any unlocked depth at any time, with no cost to switch.

- Value per rock: `R(d)/H(d) = 0.2 × (1.19/1.17)^(d-1)`
- Hazard density rises with depth (§4/§5). With the drum, each stratum is also a faster tempo.
- Players settle at the deepest depth their pick tier and tap damage handle comfortably, around **4–8 taps per common rock**. The lever shows a "taps/rock" hint (counting the expected Beat Hit share once the drum is owned), so dropping back a few levels is an obvious, painless choice.

**Infamy (00 §2.2):**
- **Skill gate:** break **50 rocks at depth `30 + 5N`** this cycle while on screen (goblin breaks count while you watch). The step is 5 depths per Fall, not 10 (B3). **The gate never requires the drum** (revision 4 decision):
  - The drum *is* reachable well before the first Fall target (≈ 20–30 min vs the Mines' first Fall on day 3), so requiring it would be fair on time. It's still left out, for three reasons. (1) The user's decision makes rhythm an upgrade, and an upgrade the Fall depends on would really be a mandatory core verb again. (2) Depth mastery is the Mines' signature, and the gate should measure it the same way for players who switch the drum off, use Steady Drum, or hold-to-auto-hit. (3) The Infamy gate is the place where a "gentle failure" promise matters most.
  - The drum still **speeds the gate up**: Beat Hits, Frenzy and Thunder Beats cut taps per rock at the target depth, so rhythm players reach it sooner. The sim checks both: the target is reachable inside the band with the drum off (reference tapping bot) and with it on.
- **Economy gate:** this cycle's Nuggets ≥ `E0_mines × 3^N`.
- **Fall:** the Legend drills down through the grid and collapses the shaft. It resets Nuggets, Gauntlet, Crew, Shaft, the Drum Circle's Nugget nodes (Drumhead, Wide Swing, Goblin Frenzy, Frenzy Fuse, Gritch's Whip, Drummer Goblins, Steady Hands, Encore) and current max depth. **Kept:** Gems, Infernal Engineering, **the Doom Drum**, its on/off setting, Tempo Lever and Thunder Beat, `maxDepthEver` (used by the Express Lift signature, 00 §2.5).

## 8. Local currencies
- **Nuggets** (primary): from every rock. Spent on Gauntlet, Crew, Shaft and the Drum Circle's levels. Shared `formatNum`, plain numbers (HP at depth 60 is ~1e5; at depth 220, ~1e15, still a safe double).
- **Gems** (secondary, rare; Q1 resolved: keep Gems): from Geodes, Lucky Rocks, Bedrock and Motherlodes. Spent on Infernal Engineering, the Doom Drum, Tempo Lever and Thunder Beat. **Pacing (re-derived, m10):** about 1.5 rocks/s in early active play × 0.5% Geode ≈ **1 Gem per 2 minutes**, rising with Lucky Rocks. The drum lands at ~20–30 min of play (§6E: ~16–18 min if every Gem is saved, ~25–30 min with Chain Lightning first); idle-only players get there through `gemRate`.

## 9. Screen layout (180×320 logical)
The top 16 px and bottom 20 px are visual-only (rock ceiling/floor art), so no buttons ever sit under the notch or the home indicator. Gritch's portrait and bubble use the manager strip over the HUD rows (00 §5.4), never the wall or the drawer. The lever's ▲▼ sit at x ≥ 40, so a bubble collapsed to its portrait (x 0–32) never hides them (00 §5.4.5).

```
 0 ┌──────────────────────────────┐
   │ ░░ ceiling art (safe pad) ░░ │ 16
16 ├──────────────────────────────┤
   │ ◆12.4K  ✦37 Gems  ▮▮░     ⌂ │ HUD 16px (+ Infamy bar)
32 ├──────────────────────────────┤
   │ D12 Stone ▲▼  ~4 taps/rock ◉│ depth lever 16px; ◉ = beat lamp (drum owned only)
48 ├──────────────────────────────┤
   │g  ┌──┬──┬──┬──┬──┐  g        │
   │   │◎▓│▓▓│✧✧│▓▓│▓▓│           │  ◎ = contracting beat ring (drum owned only)
   │g  ├──┼──┼──┼──┼──┤  g        │  ROCK WALL
   │   │▓▓│  │▓▓│TNT│▓▓│          │  5×5 × 32px = 160×160
   │   ├──┼──┼──┼──┼──┤           │  x 10..170, y 56..216
   │   │ ...                       │  goblins on ledges; drummers on the top ledge
   │   └──┴──┴──┴──┴──┘            │
216├──────────────────────────────┤
   │ crit 7%  ⚡12%  goblins 8     │ status bar 12px (pre-drum)
   │ FRENZY ●●●●●○○○ ×4  goblins 8│   …becomes pips + streak once Goblin Frenzy is owned
228├──────────────────────────────┤
   │[Gaunt][Crew][Drum][Eng][Shft]│ tab strip 20px (5 × 36px)
   │  ┌ upgrade row 1  [BUY 1.2K]┐│ drawer 60px (3 rows × 20)
   │  ├ upgrade row 2  [BUY 4.0K]┤│ collapsible
   │  └ upgrade row 3  [BUY  80K]┘│
300├──────────────────────────────┤
   │ ░ floor art (home indicator) │ 20
320└──────────────────────────────┘
```
Before the drum, the Drum tab shows the covered drum, its price and its requirement, and nothing else. The tab gets a "Ready" pip when the drum becomes affordable.

## 10. Controls (one-handed, thumb)
- **Tap** a rock: hit it (a Beat Hit if the drum is on and it's the beat's judged tap inside the window, §6E). Multi-touch supports up to 3 pointers, with a total cap of 15 hits/s and the 8/s soft cap (§2).
- **Hold** on a rock: auto-hits at 4 hits/s, always off-beat. This is an accessibility option from the start (decided, README OQ 19), slower than real play.
- **Rake** (drag across the wall): each tile crossed takes **25% of a tap's damage** (max 8 tiles per swipe), and **Rubble is cleared outright** (D-06). It's a cleanup tool, not a damage strategy.
- **Flick up / down** on the drawer: expand or collapse it.
- **Tap ▲▼** on the lever: change depth by 1. **Long-press:** strata picker.
- **Drum tab:** drum on/off and (with Tempo Lever) the tempo option.
- All buttons are in the bottom 40% of the screen except the HUD, which is read-only apart from ⌂.

## 11. What makes it different
- **Verb: smash, then smash in time.** The Mines are the suite's tap-to-mine clicker, the purest "numbers go up" toy. The Doom Drum turns it into the only game with a **tempo**. Dungeon is placement and mazing, Styx is cast-and-tension timing (no tempo), Spire is aim-and-drop, Cauldron is steering a flow, Troll Bridge is catching lies, War Pit is drafting.
- **Rhythm as a purchase.** No other department turns a whole new input skill into an upgrade branch. Buying the drum changes how the department *feels*, not just its numbers, and it's the suite's clearest "new mechanic" milestone.
- **A static grid.** The only fixed grid in the suite. No physics, no paths, no characters to judge.
- **Numbers-go-up purity.** It's the suite's "comfort food" game, with the biggest numbers and the most immediate feedback.
- **Spatial mini-decisions:** where kegs sit, which veins to hit first, how to chain lightning through clustered rocks.

## 12. Pixel art & juice
- **Hit:** the tile squashes 1 px with a 1-frame white flash. 3–5 chip particles (2×2 px) in the stratum colour. A crack overlay advances at 33/66% HP.
- **Break:** 8–12 chunks with gravity, a 2-frame screen shake (1 px), and nuggets arcing to the HUD counter, which "gulps" (scale 1.15).
- **Crit:** gauntlet slam, a yellow "CRUNCH" pixel word, 50 ms hit-stop.
- **Lightning:** 1 px jagged cyan polyline, 3 frames, with a residual glow tint.
- **Keg:** fuse spark, then a 3×3 radial flash and a 3 px shake. The goblins cheer.
- **Doom Drum arrival:** four goblins drag the drum onto the top ledge, the first boom shakes dust off the ceiling, and the rings fade in on every rock over two beats.
- **Beat Hit:** the ring snaps shut in gold, the gauntlet gives a heavier thud, and a tiny "!" pops.
- **Frenzy:** the torches flare, the drum layer doubles, and tap sfx rises +1 semitone per Beat Hit.
- **Sfx:** layered "tock" with ±8% pitch variance by rock type, a glassy ping for veins, goblin barks ("Shiny!"), and a dull "clunk" for bedrock. Before the drum, the music's percussion is just picks and grunts; the drum layer joins on purchase.
- **Goblins:** 16×16 sprites, 4-frame swing. Before the drum they idle by scratching and arguing; afterwards they bob to the beat, and drummers swing two-handed mallets.
- **Return ritual (v1.1, 00 §5.3):** the kegs the goblins stockpiled while you were away are piled at the seam. One tap sets off a chain blast across the wall, worth +5% of the offline haul.

## 13. Technical notes (PixiJS v8)
- Render at 180×320 and integer-scale with `scaleMode: 'nearest'` and `roundPixels: true`. One texture atlas.
- **No physics engine.** Chunks and nuggets use per-particle velocity and gravity in a pooled `ParticleContainer` (hard cap 300).
- **Logic** runs on a fixed 20 Hz tick, decoupled from rendering. Goblin damage is applied through the same `rocksPerSec` formula as `idleRate`, regrowth ceiling and `drumSync` included, so live and offline can't diverge.
- **Beat clock (drum owned only):** driven by the WebAudio clock (`AudioContext.currentTime`), with tap timestamps compared in audio time and corrected by a latency calibration offered once on drum purchase and kept in settings. Before the drum, the beat clock isn't started.
- **Rapid-tap soft cap:** a ring buffer of the last 15 tap timestamps; taps beyond the 8th in any 1 s window deal 50%.
- **Numbers:** plain `number`, shared `formatNum` (00 §8). No Decimal library.
- **Input:** `pointerdown` on a single hit-area container, mapped to a grid cell by math. Total cap 15 hits/s.
- **Perf:** at most about 25 tiles, 12 goblins, 4 drummers and 300 particles. Pause on `visibilitychange`. Drop the particle cap to 120 if frame time is over 20 ms.
- **Save:** shared save module (00 §9). `persistent` holds Gems, Infernal Engineering, `drumOwned`, `drumOn`, the chosen tempo, Tempo Lever and Thunder Beat; `run` holds the Drum Circle's Nugget levels. The latency offset, Steady Drum and hold-to-auto-hit are suite settings (`meta.settings`, 00 §9), because they belong to the player and the device, not to a cycle.
- **Sim (00 §8.1):** the local sim builds `activeRate` tables for **both** drum states. Active bot: 6 taps/s with vein/keg/cluster targeting; with the drum, one judged tap per beat landing in the window 85% of the time (novice 50%, expert 95%), follow-up taps after each boom up to 6 taps/s, and Frenzy whenever available. A "masher" bot (the same tap rate, no timing) must earn ≤ 85% of the reference bot with the drum on; it's the check on R4-01. The idle buyer ranks the drum and Drummer Goblins like any other node.

## 14. Session shapes
- **30 s:** open, read Gritch's report, blast the keg pile, buy 2–3 upgrades with "Buy Max", leave.
- **5 min, before the drum:** hunt veins and Geodes, pop kegs strategically, buy Tap Damage and Crit Chance, unlock 1–2 depths, hire a goblin, and watch the Gem counter creep toward the drum.
- **5 min, with the drum:** a couple of Frenzy chains on the beat, keep a Drum Streak alive through a cave-in, unlock 1–2 depths, buy a Drumhead level or a drummer, put saved Gems into Chain Lightning or Thunder Beat.
- **30 min:** push through a stratum boundary (new tint, hazards and, with the drum, a faster tempo), raise the pick tier, reach the next Tap Damage ×2 milestone, and work the 50-rock Infamy gate at the target depth. A first cycle's 30-min session typically ends with the drum bought and Gritch's micro-lesson done.

## 15. MVP vs later (ships in v0.1)
**MVP:** 5×5 wall; Common/Vein/Keg/Geode/Rubble rocks; **depths 1–60** (strata palettes Dirt → Abyss, covering Falls #0–#5 plus overflow); Grunt + Sapper goblins (cap 8); Gauntlet (Tap Damage, Crit Chance, Crit Power, Keen Eye), Crew (Hire, Sharper Picks, Pick Tier), Shaft (Dig Deeper, Supports, Rock Regrowth), Engineering (Chain Lightning, Blasting Powder); the 8/s soft cap; **Drum Circle: Doom Drum, Drumhead, Wide Swing, Goblin Frenzy, Frenzy Fuse, Drummer Goblins** with the beat clock, latency calibration and Steady Drum; cave-ins; `idleRate` + report; Infamy gates and Fall; 8 Commendations (including "First Doom Drum boom"); Buy ×1/×10/Max; **Gritch as manager** (onboarding, keg and drum micro-lessons, milestone lines; §18).

**Later:** Heavy Knuckles, Steady Hands, Gritch's Whip, Tempo Lever, Thunder Beat, Encore; Shocker/Prospector goblins, Gas/Bedrock, Motherlode, stratum behaviours, Magma Pick/Echo, the keg return ritual, goblin cosmetics (hats), a rare "Rock Golem" event tile, a mine-cart rail mini-event.

## 16. Meta-economy hooks (per 00)
- **Tribute:** via Rank from `idleRate`.
- **Export (v0.3):** **Ingots** from Ore Veins (2%) and Motherlodes (5), plus the 2/h base trickle. Never converted from Nuggets.
- **Imports (v0.3):** Bones → bone miners (+1 Grunt each); Potions → **Stamina Stew**: every 30th tap is a guaranteed crit, −5 taps per level (30/25/20). It used to widen the on-beat window during Frenzy, but an import must work for every player, drum or not. 2 mechanic nodes per line (00 §4).
- **Infamy and Fall:** §7.

## 17. Decided questions (department-local; ratified 2026-10-21 with the recommended defaults, see README)

1. Should hold-to-auto-hit be in from the start (accessibility) or unlocked as an upgrade? **Decided:** From the start, in settings. (README OQ 19)
2. Do you want a soft cap on visible goblins (12), with "squads" stacking DPS past that? **Decided:** No; 12 is enough with Sharper Picks capped. Drummers sit on their own ledge and don't count. (OQ 20)
3. Should multi-touch (up to 3 fingers) be allowed, or one finger only for one-handed parity? **Decided:** Allowed, with the 15 hits/s cap. Revision 4 adds the 8/s soft cap so that, before the drum, three fingers stay within ~1.4× one quick thumb. (OQ 21)
4. Rhythm from minute one, or as an upgrade? **Decided (user, revision 4):** plain tap-to-mine is the core; the Doom Drum branch unlocks rhythm (README decision 43).
5. Should the Infamy skill gate require the drum? **Decided (revision 4, to ratify):** no; the drum only speeds it up (§7; README decision 45).

## 18. Manager: Gritch

**Gritch**, goblin, foreman of the Mines. Revision 4 promotes him from department head to the department's **manager** under the shared system (00 §5.4).

- **Personality and voice:** loud, greedy, hyperactive, and terrified of the Overlord in a way that comes out as enthusiasm. He talks in short shouted bursts, calls the player **"BOSS!"**, loves anything shiny or explosive, and takes credit for the crew's work. He is the suite's one *greedy* manager (Grumm is proud of his bridge, not greedy; 06 §18), and he never naps: Gritch is always moving. His gibberish voice is fast, high, squeaky syllables with a pick-clink on stressed words. Readable lines are ≤ 32 characters and often end in "!".
- **Portrait (32×32), expressions:** *grin* (default, snaggle teeth), *star-eyed* (shiny things, Gems, veins), *panic* (cave-ins, Legend), *rocking out* (head-banging to the drum, after the drum only), *sulky* (absence, step back in depth), *salute* (milestones, the Fall's rebuild).
- **Dock:** the default strip (y 16–48) over the HUD and depth lever. The whole strip is pass-through (00 §5.4.5): a touch on the lever works and collapses the bubble to his portrait (x 0–32), which never covers ▲▼ (§9). The wall, status bar and drawer stay clear.
- **`isIntense`:** Frenzy active, a keg fuse lit, or ≥ 5 taps in the last second. A cave-in is deliberately *not* intense, so his first-cave-in tip lands while the Rubble is still there (R4-13).
- **Icons he uses:** ◆ nugget, ✦ gem, 💥 keg, ⚡ lightning, ⬇ depth, 🥁 drum, goblin head.

**Onboarding script (first session on unlock; 5 beats, ~40–50 s of guidance, ~80–100 s on the clock including waits; one mechanic per beat; skippable; replayable from Settings → Managers).** Beats marked *waits* use the shared `waitFor` rule (00 §5.4.2): the player mines freely with the strip hidden until the condition holds, and that time isn't counted as guidance. (R4-06: revision 4's first draft had 6 beats and claimed the first rocks already paid for Tap Damage; at 1 damage per tap a depth-1 rock takes 10 taps and pays 2 Nuggets, and Dig Deeper costs 121.)
1. **Smash.** Gritch pops in, saluting and shaking. A cracked rock pulses under a ghost-finger. Bubble: "BOSS! Smash it!" + ◆. Done when the player breaks one rock. Nuggets fly to the counter.
2. **First upgrade** (*waits* until Tap Damage is affordable: 10 Nuggets, ~5 rocks, ~10 s). The Gauntlet tab glows on Tap Damage. "Bigger fist! BUY!" Done on purchase (reference < 25 s from entry, inside the 60 s band).
3. **Hire** (*waits* for 25 Nuggets, ~10 s). Hire Goblin glows. "Hire Snik! He works for shinies." The new Grunt waddles out and starts chipping. Done on hire.
4. **Shiny first.** A scripted Ore Vein grows in. Gritch goes star-eyed: "SHINY! That one!" + ◆◆. Done when the player breaks the vein (the 5× payout pops big).
5. **Deeper** (*waits* until Dig Deeper is affordable: 121 Nuggets, ~30–45 s of play). The Shaft tab glows on Dig Deeper, then the ▲▼ lever. "Deeper = shinier!" + ⬇. Done when the player digs to depth 2. Gritch salutes and leaves; the covered drum in the Drum tab gets a single wink ("Later, BOSS… 🥁").

**Keg micro-lesson** (1 beat, on the first natural Powder Keg spawn, normally within the first 2 minutes; moved out of the intro by R4-06): the keg pulses. "Tap it. Then DUCK." + 💥. Done when it blows, or when it auto-detonates (then the line is "Next one, YOU light it!").

**Doom Drum micro-lesson** (the `mechanic_unlocked` trigger on drum purchase; 3 beats, ~30 s, skippable, replayable):
1. **Watch the ring.** The music drops to the drum layer alone for two bars, and one rock's ring is highlighted closing on each boom. "Hit when it CLOSES!" Optional latency calibration offered as a single tap ("Tap with the boom ×8") or skipped.
2. **Four Beat Hits.** "Four on the boom!" Each Beat Hit pops a gold "!"; a counter fills to 4. Off-beat taps still break rocks, and Gritch never scolds.
3. **Nothing lost.** "Miss? Still a hit!" A follow-up tap right after a boom pops a plain chip, showing that filler taps are free ("BOOM-ta-ta!"). Then he points at Goblin Frenzy and Drummer Goblins, now visible in the Drum tab: "More drum = more BOOM."

**Milestone triggers and example lines** (readable line + icons; each has 2–3 variants in data):

| Trigger (00 §5.4) | Condition | Expression | Example line |
|---|---|---|---|
| `first_upgrade` (non-onboarding) | first Crit Chance level | grin | "CRUNCH! Do again!" |
| `first_helper` | 4th goblin hired | salute | "Full ledge, BOSS! …almost." |
| `tier_reached` | first entry into Stone, Iron, Crystal, Magma, Abyss | star-eyed | "Stone! Shinier! Harder!" ⬇ |
| `mechanic_unlocked` | drum becomes affordable (8 ✦ and depth 6) | star-eyed | "BOSS. The DRUM. Buy drum." 🥁 |
| `mechanic_unlocked` | Doom Drum bought (runs the micro-lesson) | rocking out | "BOOM BOOM BOOM!" |
| `mechanic_unlocked` | first Frenzy (speaks after it ends, since Frenzy is intense) | rocking out | "That FRENZY! Do again, BOSS!" |
| `dial_raised` | a new `maxDepthEver` of 5, 15, 25, 35… (mid-stratum; stratum entries belong to `tier_reached`, so the two never fire together) | grin | "Deeper! Smells like gems." |
| `hazard_first` | first cave-in | panic | "Rubble! RAKE IT!" |
| `infamy_50` | Infamy ≥ 50% this cycle | star-eyed | "Heroes are TALKING about us." |
| `infamy_100` | both gates full | grin | "Ready to be FAMOUS, BOSS!" |
| `legend_arrives` | Legend at the gate | panic | "Big hero. Big drill. Uh oh." |
| `return_after_fall` | first entry after a Fall (variant without the drum: "Shaft's gone. Gems are safe!") | salute | "Shaft's gone. Drum's safe!" 🥁 |
| `return_long_absence` | ≥ 8 h away (this is his report line; on entry he only waves, 00 §5.4.7) | sulky | "Crew dug all night, BOSS!" ◆ |
| `goods_link` | Bones or Potions line opened | grin | "Bone miners! They don't eat!" |
