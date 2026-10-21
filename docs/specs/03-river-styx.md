# 03 — River Styx (Department of Soul Acquisition)

Status: **revision 2**, after adversarial review; **revision 4** (2026-10-21) adds the department manager, Pilk (§18; shared system in 00 §5.4). Ships in **v0.4**.

## 1. Fantasy & pitch

**Pitch:** *Cast a bone-hook into the black river, read the bite, and reel a thrashing lost soul up through the fog before it slips free.*

The Overlord's armies, spells and minions all run on souls. The River Styx is where the drowned, the forgotten and the over-ambitious drift on their way to the underworld, and the Overlord simply skims the good ones first. **The player is the Overlord**, fishing personally from a rickety dock. The Overlord's signature power here is the **Grip**: the hook-set. **Pilk, the imp ferryman** (the department head), poles a skiff around the river and runs the Imp Netters, who net stragglers when nobody is watching. Souls are sold to the ferryman's ledger for **Obols** (the coin of the dead), the local currency.

> **Interpretation (decided, README OQ 12):** the brief offered "fishing for souls". This spec uses **cast → bite → reel** fishing (aim depth, hook-set timing, tension management) rather than tap-to-snatch, which is too close to the Mines' tap verb. A "snatch" verb survives as a secondary action on surface wisps (§2.4). Both reviews called this loop one of the suite's three strongest.

## 2. Core loop (active)

**Cast → Wait/Lure → Nibble → Bite → Hook → Reel → Land → Sell/Upgrade → Cast**

### 2.1 Cast (drag-and-release)
Press in the river zone and drag **down**. A dotted line previews the hook's sink point. Drag distance sets **depth** (0–100% of unlocked depth), and horizontal drag sets lateral position. Release to cast. The hook sinks at 40 px/s (logical), so a deep cast takes ~4 s. The anticipation is the point.

### 2.2 Lure (optional twitch)
While the hook sits, souls in range (radius 24 px) notice it. **Drag the line up 4–8 px** (a short upward nudge in the control bar) to twitch the bait: +25% bite chance for 1.5 s, at most once per second. A twitch is a *drag*, the hook-set is a *tap*, so the two verbs can never be confused (D-11). Ignoring the twitch is fine; the average bite wait is 3–8 s.

### 2.3 Nibble, bite and hook-set (timing)
- **Nibbling state:** when a soul starts nibbling, the bobber gets a visible ring and the line turns pale. **Twitching is disabled while a soul nibbles.** The bobber dips 1–2 times (fake-outs).
- **Real bite:** the bobber plunges, the ring flashes, "thunk" sfx. The player has a **hook window** (base 600 ms) to **tap**.
- Tapping on a fake-out dip spooks the soul, which swims off (the cast continues and another soul may bite). Missing the window means the soul steals the nibble and swims off.

### 2.4 Reel (hold + tension)
Hold in the control bar (y ≥ 200) to reel (D-22). The soul pulls in bursts ("thrashes"). **Tension is drawn on the line itself**: the line's colour shifts from white to amber to red, and its vibration amplitude grows. A small arc around the REEL button mirrors it.
- Holding raises tension at the `reelPower` rate. Releasing lets it drain at 2×.
- During a **thrash** (telegraphed by the soul glowing red ~300 ms before), tension rises 3× faster while holding.
- Tension ≥ 100% for 0.4 s → **line slips** and the soul escapes. Tension 0% for > 2.5 s → the soul "drifts loose" and escapes.
- Distance to the dock shrinks only while holding below the red zone. A typical common soul takes 3–5 s to reel; a legendary takes 15–25 s with 6–10 thrashes.

Example: a *Wailing Clerk* (common) bites at 30% depth. The player taps in the window, holds 1.2 s, sees the red glow, releases, the soul thrashes harmlessly, holds again, and lands it in 4 s. +12 Obols.

**Surface wisps (secondary verb):** small wisps skim the surface every ~10 s. A **flick** (fast upward swipe) on one snatches it instantly for a tiny reward (1/5 of a common). It keeps hands busy during sinking.

### 2.5 Land
The soul flies into the soul-jar on the dock with a pop. The first catch of each species triggers a **Codex** entry. Selling is automatic (to Obols) unless the soul is a **Trophy** (rare+), which can be kept on the Wall for a permanent bonus (§6.4). Souls (the Good) are a free by-product and never compete with Obols.

## 3. Passive / idle

While the player isn't actively fishing (in another department, app closed, or idle > 20 s on screen), **Pilk's skiff** and the **Imp Netters** fish on their own.

- Passive catch rate: `R_idle = netters × netRate × depthMix`, base `netRate` = 1 soul / 30 s per netter. Netters only catch from depths ≤ `netDepth` (upgradable).
- Idle souls use the expected value of the depth's rarity table (no per-soul rolls offline). Rares and legendaries are rolled once at the end as a Poisson draw with the expected count, so idle can still produce one exciting catch.
- **`idleRate`** (shared interface): `R_idle × EV(soul value at netDepth) × 1.10^W_idle × idleMult`, where `W_idle` is the Wrath level set.
- **Offline:** the shared core applies the suite offline factor and cap (00 §7). There are no local cap nodes.
- **Target ratio (recomputed, D-11):** a full cycle (sink 1–4 s, bite wait 3–8 s, hook, reel 3–5 s) gives **~6 catches/min** of active play. Early game: active ≈ 6 × 14 = 84 Obols/min; idle with 3 netters ≈ 6/min × 5 = 30/min. Active ≈ 2.8× on-screen idle, so **≈ 4.3× offline** at baseline, using the reference offline factor at the Styx's unlock (≈ 0.65, 00 §8). The balance simulation verifies this.

## 4. Gentle failure

- **Soul escapes** (slip, drift, spook, missed hook): nothing lost but the catch. Bait is *not* consumed on escape, only on landing.
- **Line snap** (only on max tension during a legendary thrash): the hook returns, with a 5 s re-rig cooldown while an imp comically splices the line. No currency loss.
- **Escaped rares** leave a glowing "trail" for 60 s, and the same soul is 2× more likely to bite your next cast in that area. Failure becomes a second chance.
- **Fog Surge** (Wrath event): visibility drops for 20 s, but bobber flashes and the line colour stay visible. Never punitive beyond difficulty.

## 5. Entities

### 5.1 Depth bands
| Band | Depth px | Unlock | Mood | Base value mult |
|---|---|---|---|---|
| Shallows | 0–60 | start | grey mist | 1× |
| Murk | 60–120 | 500 Ob | green bioluminescence | 4× |
| Drowned Halls | 120–180 | 12k Ob | sunken columns | 16× |
| Abyssal Choir | 180–240 | 300k Ob | red singing glow | 64× |
| Lethe Bottom | 240–300 | 8M Ob | white void | 256× |

(The river scrolls vertically while reeling; the screen shows ~130 px of water at once.)

### 5.2 Souls (sample of 15 species, 3 per band)
| Soul | Band | Rarity | Base Obols | Pull (tension/s on thrash) | Thrashes | Speed px/s | Behavior |
|---|---|---|---|---|---|---|---|
| Wailing Clerk | Shallows | common (70%) | 10 | 30 | 1–2 | 12 | straight drifter |
| Lost Tourist | Shallows | uncommon (25%) | 25 | 40 | 2–3 | 18 | zigzags |
| Drowned Knight | Shallows | rare (5%) | 120 | 60 | 4 | 10 | heavy, slow pull |
| Bog Poet | Murk | common | 40 | 35 | 2 | 15 | circles bait first |
| Twin Wraiths | Murk | uncommon | 100 | 45 | 3 | 22 | two bites, both must hook |
| Moon Witch | Murk | rare | 500 | 70 | 5 | 20 | teleports once mid-reel |
| ... (Drowned Halls / Choir / Lethe follow the same pattern, ×4 value per band) |
| **Hero's Echo** | any | legendary (0.3%) | 50× band common | 90 | 8 | 25 | gold glow, full-screen reel |

Rarity roll per bite: common 70 / uncommon 25 / rare 4.7 / legendary 0.3, modified by bait and Soul Scent.

### 5.3 Baits (consumed on a successful land; crafted with Obols; stock persists through Falls)
| Bait | Cost | Effect |
|---|---|---|
| Worm of Regret | free, infinite | none |
| Broken Promise | 20 Ob ×10 | +50% uncommon weight |
| Unpaid Debt | 200 Ob ×10 | +100% rare weight, Murk+ only |
| Hero's Lock of Hair | 5k Ob ×3 | +5× legendary weight |
| Gilded Obol | 1k Ob ×5 | +100% Obols from catch |

Exactly one bait slot is active. Netters use Worm unless you buy the Chum Barrel upgrade.

### 5.4 Helpers
- **Pilk the Ferryman** (department head): passive skiff, 1 soul / 45 s at Shallows from the start.
- **Imp Netter** (hireable, max 20): see upgrades. Imps are unique to the Styx; the Cauldron uses Toadlings.
- **Lantern Eel** (late): follows the hook and reveals bite type icons (fake vs real).

## 6. Upgrade tree

All costs are `cost = base × growth^level`, in Obols. Nodes over 10 levels follow the visible-milestone rule (00 §8): e.g. Reel Speed swaps the reel sprite at 10/20/30/40 levels, and Bigger Nets adds a visible net size every 10 levels.

### 6.1 Line & Reel (active power)
| Node | Base | Growth | Effect / level | Max |
|---|---|---|---|---|
| Reel Speed | 15 | 1.15 | +8% reel distance/s | 50 |
| Braided Sinew Line | 40 | 1.18 | tension cap +6% | 40 |
| Steady Hand | 60 | 1.20 | tension drain on release +5% | 30 |
| Quick Strike | 100 | 1.25 | hook window +40 ms (600 → 1,400 ms) | 20 |
| Barbed Hook | 500 | 1.35 | 1.5%/lvl chance a slip becomes a land | 20 |

### 6.2 Lures & Lantern (what bites)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Deeper Cast | band unlock costs (§5.1) | — | unlocks next band | 4 |
| Lantern Glow | 80 | 1.22 | bite wait −4% (floor 1 s) | 25 |
| Soul Scent | 300 | 1.30 | rare weight +4% (mult.) | 25 |
| Twin Hooks | 25k | ×10 | +1 hook per cast (max 3); bites resolve one at a time | 2 |
| Wisp Net | 200 | 1.25 | surface wisp value +20%, spawn +5% | 20 |

### 6.3 Imp Crew (idle)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Hire Imp Netter | 50 | 1.28 | +1 netter (1 soul / 30 s) | 20 |
| Bigger Nets | 150 | 1.20 | netRate +10% | 40 |
| Longer Poles | 1k | 1.6 | netDepth +10% of unlocked depth (base 20%, cap 60%) | 4 |
| Chum Barrel | 10k | 2.0 | netters use equipped bait at 25% efficiency (+25%/lvl) | 3 |

(Night Shift was removed, since offline caps are suite-level now, 00 §7.)

### 6.4 Trophy Wall (collection; persists through Falls)
Keep a rare or legendary instead of selling it. Each mounted Trophy gives a permanent +2% (rare) / +10% (legendary) Obols bonus for its band. Wall slots: 3 base, +1 per 10 Codex entries. Swapping is free, so it's a light decision layer, not a grind. The Codex and Trophy Wall are the Styx's unique persistent system (D-14).

### 6.5 Catch combo
Consecutive lands without an escape grant `comboMult = 1 + 0.05 × min(streak, 20)` (max 2×). An escape resets it to 0 (gentle: only the bonus is lost).

## 7. The difficulty dial — "River Wrath", and the Fall

A slider on the dock (0–20), unlocked after Murk. **Each level is bought once per cycle** (`1,000 × 3^W` Obols) and resets on Fall (B1). Within bought levels it's free to set. Each level:
- Soul thrash pull ×`1.08^W`, thrash count +`floor(W/3)`
- Hook window ×`0.97^W` (floor 250 ms)
- Fake-out frequency +5%/level (cap 60%)
- W ≥ 5: Fog Surges. W ≥ 10: "Ripper" souls that cut lines (escape only).
- **Reward:** active Obols ×`1.12^W`, rare weight ×`1.03^W`. Idle ×`1.10^W` (M2), so the active edge from Wrath tops out at ~1.4× at W20 and doesn't run away.

**Infamy (00 §2.2):**
- **Skill gate:** land **20 souls at Wrath ≥ `min(5 + 2N, 20)` with ≤ 30% escapes, including ≥ 1 rare or better** (on screen).
- **Economy gate:** this cycle's Obols ≥ `E0_styx × 3^N`.
- **Fall:** a Legend drains the river. It resets Obols, all trees, band unlocks and Wrath levels. **Kept:** Codex, Trophy Wall, bait stock.

## 8. Local currency: Obols

- **Earned:** selling souls (auto), surface wisps, idle netters, Codex first-catch bonuses (10× species base).
- **Spent:** all upgrades in §6, bait crafting, band unlocks, Wrath levels.
- Souls themselves aren't a local currency; they're converted at the dock. The Souls *Good* is a free by-product (00 §4).
- Display: shared `formatNum`.

## 9. Session shapes

- **30 s:** Open, read the report, sort Pilk's net (§13), tap "Buy all affordable" on Imp Crew, cast once, land a Clerk, leave.
- **5 min:** ~30 catches. Push one depth band with Unpaid Debt bait, hunt a rare for the Codex, buy 4–6 Line upgrades, buy and try the next Wrath level if the combo held.
- **30 min:** Unlock a new band (Murk around minute 6–10 of a fresh cycle; Drowned Halls ~45–60 min). Chase a Hero's Echo with Lock of Hair, rearrange the Trophy Wall, and work the Infamy gate at the target Wrath.

## 10. Screen layout (180×320 logical, portrait)

```
 0 ┌──────────────────────────┐
   │ SAFE TOP (notch) 0-16    │  empty / sky gradient only
16 ├──────────────────────────┤
   │ Ob 12.4k ☠x7 ▮▮░ [≡][⌂]  │  HUD 16-30: Obols, combo, Infamy
30 ├──────────────────────────┤
   │  fog  ~~ skiff(Pilk) ~~  │  SKY/SURFACE 30-70
   │ dock+Overlord wisps  ~~~ │
70 ├~~~~~~~~~~~~~~~~~~~~~~~~~~┤  waterline
   │   souls drift  →   ←     │
   │        |line (tension    │  RIVER 70-200 (play zone,
   │        |  colour)        │  scrolls during deep reels)
   │        o bobber/hook     │  depth ruler x=170-178
200├──────────────────────────┤
   │  ↑twitch   tap=hook      │  CONTROL BAR 200-292
   │ [Bait▾]  ( REEL )  [Wrath]│  hold anywhere here to reel
   │  tension arc around REEL │  thumb zone
292├──────────────────────────┤
   │ [Line][Lure][Crew][Wall] │  UPGRADE TABS 292-304
304├──────────────────────────┤
   │ SAFE BOTTOM 304-320      │  home indicator, empty
320└──────────────────────────┘
```

The upgrade drawer slides up over the river (to y=110), and the game keeps running (idle netters visible). Safe-area insets are read from `env(safe-area-inset-*)` and converted to logical px.

## 11. Controls (one-thumb)

| Gesture | Where | Action |
|---|---|---|
| Drag down + release | river zone | cast (depth/aim) |
| Short drag up (4–8 px) | control bar, while waiting (not nibbling) | twitch bait |
| Tap | control bar, on a bite | set hook (the Grip) |
| Hold | control bar (y ≥ 200) | reel; release to ease tension |
| Flick up | on a surface wisp | snatch wisp |
| Swipe up | tab bar | open upgrade drawer |
| Long-press (600 ms) | soul jar | Codex |

Hook and reel input is confined to the control bar, so the thumb never covers the soul or its thrash telegraph. A left-handed mirror option flips the dock and buttons.

## 12. Why it is different

- **Mines** = tap-to-mine, with rhythm as an upgrade. **Styx** = *patience + timing + tension*: few, deliberate inputs, with a held press as the core verb.
- **Dungeon** = placement and mazing; **Spire** = physics merging; **Cauldron** = steering a flow; **Troll Bridge** = catching lies; **War Pit** = drafting a warband. The Styx is the only cast-and-tension department and the only one with a **collection codex** at its heart.
- Mood: quiet, foggy, slow music with sudden spikes: the "calm" department of the empire.

## 13. Pixel art & juice

- Palette: 6 blue-black tones plus one accent per band (green, teal, red, white). Souls are 8×8 to 16×16 sprites with a 4-frame drift and 2-frame thrash; legendaries are 24×24.
- Nibble: a pale bobber ring and a faint line shimmer.
- Bite: bobber plunge, 3-ring ripple, 1 px screen nudge, low "thunk".
- Thrash: the soul flares red, the line vibrates and reddens, haptic `navigator.vibrate(15)`.
- Land: the soul arcs to the jar, the jar glows, a coin shower with +N floating text, pitch rising with the combo.
- Escape: the soul sticks out its tongue, a wobbly "plip" sfx, a sad imp sigh. Comedic, never harsh.
- Legendary: music drops out, heartbeat bass, gold particles, full-screen zoom.
- Pilk hums off-key, and his skiff wakes leave 1 px ripples.
- **Return ritual (v1.1, 00 §5.3):** Pilk dumps the net on the dock. Tap the souls to sort keepers onto the Trophy Wall (and new Codex entries), worth +5% of the offline haul.

## 14. Technical notes (PixiJS v8)

- Single `Container` world at 180×320, rendered at base resolution with `roundPixels`, `antialias:false`, integer-scaled.
- **No physics engine.** Souls move on simple steering paths (sine drift + seek-bait). The line is a 6-segment verlet rope drawn with `Graphics`; its tint and amplitude encode tension. Tension is pure scalar logic.
- River parallax: 3 `TilingSprite` layers; depth scroll moves the world container's y.
- Pool soul sprites (max ~25 on screen) and particles (`ParticleContainer`, cap 200).
- Fixed-step logic at 30 Hz, rendering at display rate. Pause when hidden and use `idleRate` on return.
- Input: Pointer Events with a gesture recognizer (tap < 200 ms, hold ≥ 200 ms, flick > 0.6 px/ms, twitch = upward drag 4–8 px). The hook window is measured in logic time so it stays fair under frame drops.
- Save: the shared save module (00 §9). Numbers: plain `number`, shared `formatNum`.
- Audio: WebAudio, ~12 short sfx, one ambient loop per band (OGG, < 200 KB each).

## 15. MVP vs later (ships in v0.4)

**MVP:** Shallows + Murk + Drowned Halls (9 species + Hero's Echo), cast/nibble/hook/reel with tension on the line, twitch-by-drag, surface wisps, 3 baits, Line & Reel + Imp Crew trees, `idleRate` + report, combo, basic Codex, **Wrath 0–20 bought per level** (it drives Infamy, so it has to ship with the department), Infamy gates and Fall.
**Later:** bands 4–5, Trophy Wall (v1.1, decided README OQ 13), Twin Hooks, Lantern Eel, Chum Barrel, the net-sorting return ritual, seasonal souls (Halloween 2026-10-31 is a free theme), weather events, named "boss souls".

## 16. Meta-economy hooks (per 00)

- **Tribute:** via Rank from `idleRate`.
- **Export:** **Souls**: rare+ catch = 1, every 10th common = 1, plus the 2/h base trickle. Imported by the Spire and the War Pit (00 §4).
- **Imports:** Potions → bait-effect brews; Contraband → Unpaid Debt bait discount. 2 mechanic nodes per line (00 §4).
- **Infamy and Fall:** §7.
- **Report line:** "Pilk netted 214 souls (1 Moon Witch!), 3,870 Obols."

## 17. Decided questions (department-local; ratified 2026-10-21 with the recommended defaults, see README)

1. Confirm cast/bite/reel instead of tap-to-snatch (snatch kept for wisps)? **Decided:** Yes. (README OQ 12)
2. Haptics: OK to use vibration on thrash (Android only; iOS PWAs ignore it)? **Decided:** Yes, with a settings toggle. (OQ 14)
3. Trophy Wall: in the MVP for collection appeal, or deferred? **Decided:** Deferred to v1.1; the Codex covers collection at launch. (OQ 13)
4. Should Pilk have comic dialogue in the messenger report, or stay silent? **Decided:** One-line dialogue. (OQ 15) Revision 4 keeps this and adds his manager lines (§18).

## 18. Manager: Pilk

**Pilk**, imp, ferryman of the Styx. Revision 4 promotes him from department head to the department's **manager** under the shared system (00 §5.4).

- **Personality and voice:** a lazy, sly old river hand who has seen everything float by. He's in no hurry, full of tall tales and superstitions ("never whistle at a Wailer"), gives souls nicknames, and calls the Overlord **"Your Dreadness"** with a wink. He's unexpectedly sharp when a rare bites. His gibberish voice is lilting buzzy chirps with a sing-song rise and a lazy yawn on long lines. Readable lines are ≤ 32 characters, drawled, and often end in "…".
- **Portrait (32×32), expressions:** *lazy smile* (default, leaning on his pole), *wide-eyed* (bites, rares, legendaries), *sly wink* (tips, baits, tall tales), *gloomy* (escapes, line snaps, the Legend draining the river), *snoozing* (ambient, long absence), *excited* (Codex entries, Trophies).
- **Dock:** the default strip (y 16–48) over the HUD and the fog band. That's where his skiff drifts anyway, and the skiff sprite pauses while he speaks. The river, the bobber and the reel zone (y ≥ 200) stay clear.
- **`isIntense`:** a nibble or bite in progress, the hook window, or reeling. Lines wait for the land or the escape plus 2 s.
- **Icons he uses:** Obol, soul-species icons, bobber, hook, REEL, tension line, wisp, bait icons, Wrath slider, Codex book.

**Onboarding script (first entry after the Seal; ~80 s):**
1. **Cast.** A ghost drags down from the dock into the river and releases. "Drop it in, Your Dreadness…" Done on any cast.
2. **Hook.** A scripted Wailing Clerk nibbles once (no fake-outs on this cast) and then plunges. "Wait… wait… NOW!" The bobber ring flashes. Done on a successful hook-set. A miss simply repeats the bite.
3. **Reel.** The REEL button pulses. "Hold. Ease off when it's red." The tension line glows. Done on the land, with Obols popping into the jar.
4. **First upgrade.** Hire Imp Netter glows (the first catches cover it). "Hire a lad. Works for nothing." Done on purchase (inside the 60 s band).
5. **Wisps.** A scripted wisp skims the surface. "Flick the little ones…" A ghost flicks. Done on a snatch, or after 2 wisps pass. Pilk settles back into his skiff.

**Micro-lessons** (`mechanic_unlocked`): **Murk** on the first band unlock (1 beat: a deeper cast, "Deeper souls. Meaner too."); **Wrath** on the first level bought (2 beats: set the slider, then "Twitchier fish. Richer catch…" and land one); **baits** on the first bait crafted (1 beat: equip it).

**Milestone triggers and example lines:**

| Trigger (00 §5.4) | Condition | Expression | Example line |
|---|---|---|---|
| `first_upgrade` | first Line & Reel upgrade | sly wink | "Stronger line. Fewer stories…" |
| `first_helper` | 5 Imp Netters | lazy smile | "Five lads. I can nap now." |
| `tier_reached` | first rare soul landed | wide-eyed | "A rare! Haven't seen one in ages" |
| `tier_reached` | first legendary (Hero's Echo) | excited | "THAT'S a story for the pub!" |
| `mechanic_unlocked` | Murk band unlocked (runs the micro-lesson) | sly wink | "Murk's open. Bring a lantern." |
| `dial_raised` | Wrath bought: first, every 5th, new max | gloomy | "River's angry. Good fishing…" |
| `hazard_first` | first line snap | gloomy | "Snapped. Lad's splicing it." |
| `infamy_50` | Infamy ≥ 50% | lazy smile | "Ferrymen talk about you now…" |
| `legend_arrives` | the Legend at the dock | gloomy | "She wants to drain my river." |
| `return_after_fall` | first entry after a Fall | lazy smile | "River's back. Always comes back." |
| `return_long_absence` | ≥ 3 days away | snoozing | "Oh! Thought you'd drowned…" |
| `goods_link` | Potions or Contraband line opened | sly wink | "Potion bait. Souls go mad…" |
