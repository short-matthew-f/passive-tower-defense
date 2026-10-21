# 04 — Sorcerer's Spire (Department of Arcane Production)

Status: **revision 2**, after adversarial review; **revision 4** (2026-10-21) adds the department manager, the Head Sorcerer (§18; shared system in 00 §5.4). Ships in **v0.5**. Its T11/Singularity geometry gets a Matter.js prototype during v0.1 (00 §6.1).

## 1. Fantasy & pitch
**Pitch:** *Drop mana orbs into a bubbling flask, merge them up into a Void Star, and let your homunculus apprentices keep distilling in their own little flask while you scheme elsewhere.*

The Spire is the Overlord's alchemy lab. A wobbly glass flask sits on a brazier; orbs of raw mana fall in and fuse into ever-larger, ever-more-dangerous spheres. Merges distill **Arcana**, the Spire's local currency. The Head Sorcerer (a nervous, singed lich) runs the lab and reports to the throne. **The player is the Overlord**, personally placing each orb. The Overlord's signature power here is the **Tremor** (Shake). Spilling a little doom over the rim is just a cost of doing business.

## 2. Core loop (active)
1. A **next orb** hovers at the top of the flask; the next 2 are previewed in the corner.
2. **Drag horizontally to aim** (the default; D-18). Release to drop. Gravity and bounce settle it. Tap-to-drop is an optional setting.
3. Two touching orbs of the same tier merge into one orb of tier+1 at their midpoint, paying Arcana and briefly pushing neighbors outward.
4. **Resonance** rewards *chain depth*, not speed: each extra merge in the cascade set off by a **single drop** adds +0.25 (×1.0 → up to ×3.0). The cascade ends when 1.5 s pass with no merge, or when you drop again. Dropping fast never helps.
5. Spend Arcana on upgrades between (or during) drops.

**Example:** Two Sparks (T1) touch → Ember (T2), +4 Arcana. That Ember rolls into an existing Ember → Wisp (T3), +12 × 1.25 = 15. The Wisp lands on a Wisp → Glimmer (T4), +36 × 1.5 = 54. One drop, 73 Arcana, flask cleared by ~20%.

**Cadence:** 0.6 s cooldown (Quick Valve → 0.4 s). The design target is **25–35 drops/min** for a good player. This is a think-before-you-drop game, the suite's calm puzzle (D-18).

## 3. Orb tiers (entities)
The flask interior is 112 px wide (142 px with Wider Flask). Radii were **re-curved so a Void Star is ~46% of the base width** (D-02, matching real Suika's ~45%). Two Void Stars fit side by side (104 px), and a T10 fits beside a resting T11.

| T | Name | Radius (px) | Diameter / base width | Merge value | Spawnable? |
|---|------|--------|------|-------------|------------|
| 1 | Spark | 4 | 7% | — (drop only) | yes, 40% |
| 2 | Ember | 5 | 9% | 4 | yes, 30% |
| 3 | Wisp | 6 | 11% | 12 | yes, 20% |
| 4 | Glimmer | 8 | 14% | 36 | yes, 10% |
| 5 | Hexball | 10 | 18% | 110 | no |
| 6 | Bloodmoon | 12 | 21% | 330 | no |
| 7 | Soulfire | 15 | 27% | 1,000 | no |
| 8 | Stormheart | 18 | 32% | 3,000 | no |
| 9 | Eclipse | 21 | 38% | 9,000 | no |
| 10 | Abyssal Eye | 24 | 43% | 27,000 | no |
| 11 | Void Star | 26 | 46% | 81,000 | no |

- Two Void Stars merging = **Singularity**: both vanish, pay 250,000 and a guaranteed **Grimoire Page**, plus a screen-wide "implosion" that pulls all orbs toward the center.
- Tiers stay readable through palette **and silhouette** (§13), since adjacent radii are close.
- All Arcana values are multiplied by global multipliers (00 §3.1) and the Volatility multiplier.
- Physics: restitution 0.15, friction 0.4, uniform density (bigger = heavier).
- **Gate before locking numbers:** the v0.1 Matter.js prototype must show a Singularity is reachable in ≤ 45 min of competent play at V0 and with Wider Flask 0. If it isn't, the fallback is "a Void Star absorbs 3 touching Abyssal Eyes".

**Special orbs** (unlock via upgrades / Volatility):
- **Catalyst** (r 5): merges with any orb, upgrading it one tier. 1 per 60 drops base.
- **Hex Stone** (r 6, grey, cursed): junk from Volatility. It doesn't merge, except that 3 touching Hex Stones shatter for 3× the current-highest-tier merge value ÷ 10.
- **Quicksilver** (r 4): merges with nothing and dissolves after 20 s. It pushes orbs on contact (a nudge tool).

## 4. Passive / idle — the Apprentice Flask
Review finding D-07 showed that apprentices dropping into the player's flask punished thinking. **Apprentices never touch the main flask.** They work their own small **Apprentice Flask** in the right gutter: a 24×120 px simplified animation of homunculi tossing orbs into a tiny flask. It's cosmetic and driven by the rate formula, not by physics.

```
idleRate     = apprenticeDropsPerMin/60 × EV_drop × chainDepthFactor × arcanaMult(V_idle) × globalMult
apprenticeDropsPerMin = min(12, apprentices × 4 × (1 + 0.08·Diligence))     // hard cap = 40% of a 30/min active cadence (M2)
chainDepthFactor      = min(1.0, 0.8 + 0.03·Tutelage)                        // the only idle penalty; idleEfficiency was removed
V_idle       = the lowest Volatility set in the last 10 min of active play
```
**EV_drop (corrected, M2):** the Arcana a dropped orb eventually contributes if everything merges up to the **Distill Ceiling** (the highest tier created in active play this cycle, capped at T9; T10 with the Tome of Patience):
```
EV_drop = Σ_t spawnChance(t) × Σ_{k = t+1 .. ceiling} V_k / 2^(k − t)
```
Worked example, ceiling T7 with the base spawn table: t1 = 42.3, t2 = 80.6, t3 = 149.3, t4 = 262.5, so **EV_drop ≈ 97.2 Arcana**. (The old example's 7.8 was wrong.)

- **Offline:** the shared core applies the suite offline factor and cap (00 §7). The main flask is frozen on exit and restored exactly, and it's also frozen while you're in other departments. There are no local cap nodes.
- Grimoire Pages can't be earned offline.
- **Target ratio:** active ≈ 30 drops/min at ~0.7 realization × Resonance ~1.6, which is ≈ 2.8× on-screen idle at the apprentice cap, or **≈ 4.0× offline** at baseline, using the reference offline factor at the Spire's unlock (≈ 0.7, 00 §8). It's higher during a fresh cycle's first 30 min (allowed by 00 §8), and drifts lower late via Tomes. The balance simulation has the final say.

## 5. Gentle failure: the Overflow Vent
- A dashed **Brim Line** sits 14 px below the flask mouth.
- If any settled orb (velocity < 2 px/s) has its top above the Brim Line for **2.5 s**, the flask **vents**: a puff of green steam ejects **every orb whose center is above the Vent Line** (Brim Line − 40 px).
- Vented orbs refund **25%** of their creation value as Arcana ("salvaged fumes").
- Resonance resets, the dropper locks for 1.5 s, and the Head Sorcerer coughs.
- A warning shimmer and heartbeat sfx start at 1.0 s, giving time to fix it with a merge.
- No other penalty. Big orbs sink, so the highest orbs are rarely lost.
- **Settle Charm** (upgrade) adds a manual **Vent Now** button that vents at 50% refund, a deliberate "clean the flask" tool.
- Only the player's own drops can cause a vent. Apprentices and offline never do.

## 6. Upgrade tree
Currency: **Arcana**. Cost formula `cost = base × growth^level`. Grimoire Pages buy the rare **Tome** nodes. Nodes over 10 levels follow the visible-milestone rule (00 §8): Potent Mana adds a new merge-particle tier every 25 levels, and Diligence adds a homunculus sprite every 10 levels.

### A. Alchemy (orb economy)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Potent Mana | 50 | 1.15 | +10% all merge value (local group) | 100 |
| Richer Spawns | 200 | 1.9 | Shifts spawn table one step: −4% T1, +2% T3, +2% T4 | 10 |
| Seed Orb | 5,000 | 4.0 | Adds T5 to spawn table at 1%/level | 5 |
| Resonant Glass | 300 | 1.6 | Resonance cap +0.25 (×3.0 → ×5.5) | 10 |
| Echo Window | 400 | 1.7 | Cascade window +0.15 s | 8 |

### B. Apparatus (flask & physics)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Wider Flask | 1,000 | 3.0 | Interior width +6 px (112 → 142) | 5 |
| Taller Neck | 1,500 | 3.0 | Brim Line raised 8 px | 4 |
| Quick Valve | 100 | 1.5 | Drop cooldown −0.05 s (0.6 → 0.4) | 4 |
| Catalyst Coil | 800 | 2.2 | Catalyst every −6 drops (60 → 18) | 7 |
| Settle Charm | 2,500 | — | Unlocks Vent Now | 1 |
| Overlord's Tremor | 600 | — | Unlocks Shake: jolt the flask (10 s cooldown) | 1 |

### C. Apprentices (idle)
| Node | Base | Growth | Effect | Max |
|---|---|---|---|---|
| Hire Apprentice | 250 | 2.5 | +1 homunculus apprentice (4 drops/min each; total capped at 12/min) | 4 |
| Diligence | 150 | 1.25 | +8% apprentice drop rate (up to the cap) | 25 |
| Tutelage | 400 | 1.4 | chainDepthFactor +0.03 (0.8 → 1.0) | 7 |

(Distillery and Hourglass were removed: no local offline efficiency or cap nodes, 00 §7.)

### D. Tomes (Grimoire Pages; persist through Falls)
The Tomes are the Spire's unique persistent system (D-14).
- **Tome of Twinning** (3 pages): 5% chance a merge creates tier+2.
- **Tome of Hunger** (4): Void Stars slowly absorb touching T1–T3 orbs for value.
- **Tome of Patience** (5): offline Distill Ceiling cap T9 → T10.
- **Tome of the Mirror** (6): the preview queue shows 3 orbs instead of 2.

## 7. The difficulty dial: **Volatility**, and the Fall
A brass knob (0–10) beside the flask. **Each level is bought once per cycle** (`5,000 × 4^V` Arcana) and resets on Fall (B1). Within bought levels, raise it any time. Lowering takes effect on the next vent or after 30 s.

```
arcanaMult(V)   = 1 + 0.3 × V^1.25        (V=5 → ×3.24, V=10 → ×6.33)
hexChance(V)    = 0.03 × V                (V=10 → 30% of drops are Hex Stones)
gravityMult(V)  = 1 + 0.03 × V            (faster, bouncier piling)
brimDrop(V)     = 2 px × V                (Brim Line lowered)
```
- Milestone: the first Singularity at Volatility 3/6/9/10 grants 1 Grimoire Page each.
- Offline uses the *lowest* Volatility set in the last 10 min of active play, and hexChance is ignored offline.

**Infamy (00 §2.2):**
- **Skill gate (Feat):** create tier t while Volatility ≥ v was held **continuously since the last vent, or for at least the last 60 drops**. Turning the knob up just before a merge doesn't count (B1.3). Score = t + v (a Singularity counts as tier 12). Target `min(12 + N, 22)`. Examples: a Soulfire (T7) held at V5, or an Eclipse (T9) at V3.
- **Economy gate:** this cycle's Arcana ≥ `E0_spire × 3^N`.
- **Fall:** the Legend dives into the flask as an unmergeable heavy body, and the lab is razed. It resets Arcana, Alchemy/Apparatus/Apprentices, the Distill Ceiling and Volatility levels. **Kept:** Grimoire Pages and Tomes.

## 8. Local currency: Arcana
- **Earned:** merges (main), Resonance cascades, vent refunds, Hex shatters, idle/offline distillation.
- **Spent:** A/B/C upgrades and Volatility levels.
- **Grimoire Pages:** rare secondary token (Singularities, Volatility milestones), spent on Tomes only. Not offline-earnable.
- Display: shared `formatNum`.

## 9. Session shapes
- **30 s:** Open, collect the report, drop the apprentices' sealed gift orb (§13), make 10–15 considered drops, buy one upgrade, close.
- **5 min:** Push for a new highest tier. Buy the next Volatility level and hold it, survive one vent, buy Wider Flask. ~150 drops, roughly 3× the Arcana of 5 min idle.
- **30 min:** Chase a Singularity at Volatility 6+ for a Grimoire Page, herd Hex Stones into triples, use Vent Now strategically, plan a Tome. Leave the flask in a clean state.

## 10. Screen layout (180×320 logical, portrait)
Safe area: top 16 px and bottom 12 px reserved.

```
 0 ┌──────────────────────────────┐
   │   (notch / status — art only)│ 16
16 ├──────────────────────────────┤
   │ ✺ 12.4K Arcana ▢2 ▮▮░  [⌂]  │ HUD 16–34 (+ Infamy bar)
34 ├──────────────────────────────┤
   │ next:(o)  then:(.)(.)  x1.75 │ queue/Resonance 34–50
50 │ ┌────┐     ▼ dropper   ┌──┐  │
   │ │Vol.│ ─ ─ ─ ─ ─ ─ ─ ─ │Ap│  │ Brim Line ~78
   │ │knob│ │            │  │pr│  │
   │ └────┘ │   FLASK    │  │Fl│  │ flask x 34..146,
   │  Head  │  interior  │  │sk│  │ y 60–262; Apprentice
   │Sorcerer│  112×184   │  │  │  │ Flask 24×120 in the
   │ [Vent] │  (o)(O)    │  └──┘  │ right gutter
   │        └────────────┘        │
262│        [ brazier fire ]      │
270├──────────────────────────────┤
   │ [Alchemy][Apparatus][Appr][T]│ tab bar 270–296 (thumb zone)
296├──────────────────────────────┤
   │                  drawer ^    │ 296–308
308│   (home indicator — art only)│
320└──────────────────────────────┘
```
- Upgrade tabs open a bottom sheet covering y 150–296. The flask stays visible and keeps simulating above.
- The Volatility knob and Vent Now are in the left gutter. The Apprentice Flask is in the right gutter.

## 11. Controls (one-handed)
- **Drag anywhere in the flask column (y 50–262):** the dropper follows your finger's x (clamped). Release = drop. Your finger never covers the orb, because the dropper is at the top and you drag lower down.
- **Tap to drop** is an optional setting (off by default).
- **Hold 0.4 s before release:** shows a dotted landing guide (unlocked free at 100 drops).
- **Flick up** (after Overlord's Tremor): jolt the flask, giving all orbs a +8 px/s upward impulse.
- **Tap-hold the knob and drag vertically:** adjust Volatility. Unbought levels show their price.
- **Swipe down from the HUD:** collapse the upgrade sheet. **⌂** returns to the Throne Room. There's no edge-swipe gesture (D-20).

## 12. Why it's different from the other six
- **Verb:** aim-and-release spatial packing. It's the only department about *physical arrangement* and planning ahead (preview queue), with state that builds up in the flask.
- **Contrast:** Dungeon = placement and mazing against waves; Mines = tap-to-mine (rhythm as an upgrade); Styx = cast-and-tension timing; **Cauldron = steering a continuous flow of independent particles with peg curses and chute tosses (live, lightweight physics, but nothing stacks and you never drag-aim)**; Troll Bridge = catching lies; War Pit = drafting (its merges are an economic choice, not physics). Spire is the calm, puzzle-brained one.
- It has the only stacking rigid-body physics in the suite.
- Pressure is *self-created* by the stack, not by an opponent.

## 13. Pixel art & juice
- Orbs: 11 distinct palettes **and silhouettes** (Spark = 4-pt star, Hexball = hexagon, Eclipse = ringed, Abyssal Eye = blinking eye, Void Star = black with a white rim) so tiers read for colorblind players. The tier number shows faintly on hold.
- Merge: 4-frame flash, ring shockwave, 6–20 pixel particles scaled by tier, and +Arcana float text. The merge "bloop" rises one semitone per tier and per cascade step.
- Resonance ×2+: the flask glass glows. ×3+: runes orbit the rim.
- Singularity: 0.3 s freeze-frame, white invert, 3 px screen shake, chord sting.
- Vent: green steam puff, orbs pop out in arcs, coins fall, sorcerer cough sfx.
- Apprentices: 8×8 homunculi toddling up a tiny ladder in the Apprentice Flask. They nap (Zzz) when capped.
- **Return ritual (v1.1, 00 §5.3):** after an absence the apprentices hand you one **sealed orb** (tier = Distill Ceiling − 3) to drop yourself, worth about +5% of the offline haul when merged.
- Haptics: 10 ms on merge T5+, 30 ms on Singularity/vent (navigator.vibrate where available).

## 14. Technical notes (PixiJS v8)
- **Physics:** **Matter.js** (or Planck.js) circle bodies only. Fixed 60 Hz timestep with accumulator, 4 position iterations. Only circles plus 3 static walls, so it's cheap. Hard cap ~60 bodies.
- Merge detection: collision-start events, queue same-tier pairs, resolve once per step (avoids triple-merge races; lowest body id wins).
- Physics coordinates in logical px. Render at 180×320 and integer-scale the stage (`roundPixels: true`, `scaleMode: 'nearest'`). Orb positions snap to integers on render only.
- Orbs come from one spritesheet atlas. `ParticleContainer` for merge particles, pooled.
- Pause physics when hidden or when another department is viewed. Save flask state (positions, tiers; velocities zeroed) through the shared save module (00 §9) on hide and every 10 s.
- `idleRate(state)` is pure and unit-testable, with no sim. The Apprentice Flask animation is cosmetic.
- Perf: target 60 fps on mid-range Android, falling back to 30 Hz physics if frame time is > 20 ms for 2 s. Sleep resting bodies (Matter `enableSleeping`).
- Determinism isn't required for active play. Seed the spawn RNG for reproducible bug reports.

## 15. MVP vs later (ships in v0.5)
**MVP:** tiers T1–T11 with the re-curved radii, drag-to-aim drop, merge + cascade Resonance, Brim/vent, Arcana, Alchemy (Potent Mana, Richer Spawns, Resonant Glass), Apparatus (Quick Valve, Wider Flask), Apprentices (Hire, Diligence) with the Apprentice Flask, corrected `idleRate`, **Volatility 0–10 bought per level**, Feat Infamy and Fall, Grimoire Pages with Tome of the Mirror (since Infamy above 20 needs Singularities, Pages must exist).

**Later:** Catalyst/Hex/Quicksilver orbs, the other Tomes, Overlord's Tremor, Settle Charm, landing guide, the sealed-orb return ritual, apprentice personalities, seasonal flask skins, "Commission" goals.

## 16. Meta-economy hooks (per 00)
- **Tribute:** via Rank from `idleRate`.
- **Export (v0.3+ Goods, active once the Spire ships):** **Essence**: T7+ merge = 1 (T11 = 5), plus the 2/h base trickle. Imported by the Cauldron and the War Pit (00 §4).
- **Imports:** Ingots → tempered glass (+2 px flask width per level); Souls → Spark fuel (+5% apprentice drop rate, still under the 12/min cap). 2 mechanic nodes per line (00 §4).
- **Infamy and Fall:** §7.

## 17. Decided questions (department-local; ratified 2026-10-21 with the recommended defaults, see README)

1. Is tier 11 + Singularity the right ceiling, or do you want endless tiers with exponential values? **Decided:** T11 + Singularity; endless tiers break the flask geometry. (README OQ 22)
2. Classic Suika "random next orb", or a slightly smarter bag (no 3 T1s in a row)? **Decided:** Smarter bag, since it's gentler. (OQ 23)
3. Should vented orbs be salvageable as anything other than Arcana (e.g. fumes exported to the Cauldron)? **Decided:** No; Goods stay one per department. (OQ 24)

## 18. Manager: the Head Sorcerer

**The Head Sorcerer**, lich, master of the Spire's laboratory. Revision 4 promotes him from department head to the department's **manager** under the shared system (00 §5.4). His given name is Mordecai; nobody uses it, and his title stays the name everywhere else (README decision 28).

- **Personality and voice:** a nervous, permanently singed academic who fears explosions and is secretly thrilled by them. He stammers, cites footnotes and "the literature", hedges every claim, and calls the Overlord **"M-my lord"**. Big merges make him forget to be scared. His gibberish voice is a breathy rattle with stuttered repeats on the first syllable and a little "poof" on exclamations. Readable lines are ≤ 32 characters, with a stammer or a parenthetical.
- **Portrait (32×32), expressions:** *nervous* (default, wringing bony hands), *singed* (smoking robe, after vents and Hex Stones), *ecstatic* (new tiers, Singularity), *lecturing* (finger raised: tips, Tomes), *terrified* (brim warning, the Legend), *relieved* (clean flask, rebuild).
- **Dock:** the default strip (y 16–48) over the HUD. It ends before the dropper and the next orb (y ≥ 50), so the aim column stays clear. While he speaks, his in-scene sprite in the left gutter mirrors the expression.
- **`isIntense`:** a cascade in progress (merges within the last 1.5 s), the brim warning, or the 0.6 s after a drop.
- **Icons he uses:** ✺ Arcana (✦ is the Mines' Gem, R4-11), orb-tier icons, Brim Line, vent steam, Volatility knob, Grimoire Page, apprentice homunculus.

**Onboarding script (first entry after the Seal; ~75 s):**
1. **Aim and drop.** A ghost drags sideways in the flask column and releases. "G-gently. Drag… then let go." Done on the first drop.
2. **Merge.** The smarter bag guarantees a matching orb next to a resting one. "Two alike… they j-join!" Done on the first merge, with Arcana popping.
3. **First upgrade.** The Alchemy tab glows on Potent Mana. "Stronger mana. (See footnote.)" Done on purchase (inside the 60 s band).
4. **Chains.** The Resonance readout pulses. "One drop, many merges. Pays!" Done when any drop sets off a 2-merge cascade, or after 8 drops (a watch-beat).
5. **The line.** The Brim Line glows dashed. "D-don't cross the line. Please." Done after 5 more drops without a vent. He wipes his brow.

**Micro-lessons** (`mechanic_unlocked`): **Apprentices** on the first hire (1 beat: point at the Apprentice Flask, "Their own flask. M-much safer."); **Volatility** on the first level bought (2 beats: turn the knob, then "Hold it. Feats need patience." and the Feat rule shown as an icon strip); **Tomes** on the first Grimoire Page (1 beat: open the Tome shelf).

**Milestone triggers and example lines:**

| Trigger (00 §5.4) | Condition | Expression | Example line |
|---|---|---|---|
| `first_upgrade` | first Wider Flask | relieved | "More room. More… b-breathing." |
| `first_helper` | first apprentice hired | lecturing | "An apprentice! Don't touch it." |
| `tier_reached` | each new highest tier from T6 up | ecstatic | "A Soulfire! For the journal!" |
| `tier_reached` | first Void Star | ecstatic | "A V-VOID STAR. I need to sit." |
| `mechanic_unlocked` | first Singularity (a Grimoire Page) | terrified→ecstatic | "It ate everything. Marvelous." |
| `dial_raised` | Volatility bought: first, every 3rd, new max | nervous | "Higher? The literature says no." |
| `hazard_first` | first vent | singed | "Vented. My eyebrows. Again." |
| `struggle` | 3 vents within 5 min | singed | "Perhaps… lower Volatility?" |
| `infamy_50` | Infamy ≥ 50% | lecturing | "We're cited in hero journals." |
| `legend_arrives` | the Legend at the lab | terrified | "A hero. In MY flask. Oh no." |
| `return_after_fall` | first entry after a Fall | relieved | "Glass swept. Tomes intact. Phew." |
| `goods_link` | Ingots or Souls line opened | lecturing | "Tempered glass! Fewer shards." |
