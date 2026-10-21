# 01 - The Dungeon (Tower Defense) - Design Spec

Status: **revision 2**, after adversarial review; **revision 4** (2026-10-21) adds the department manager, Ledger-Bones (§18; shared system in 00 §5.4). Flagship department. Ships in **v0.2**.

## 1. Fantasy & pitch

**Pitch:** *Build the dungeon heroes dream of looting, bait them down your killing corridors, then make them regret it.*

**The player is the Overlord**, architect of doom. "Heroes" walk in from the entry, heading for the Hoard. You line the walls with towers, stock the side chambers with summoned monsters, carve curse runes into the floor, and **bait the party down the corridors of your choosing**. Every hero who dies drops **Plunder**. The twist on standard TD is that you also *advertise* the dungeon. Spreading rumors of treasure (the **Lure** dial) brings in tougher, richer heroes. The Overlord wants strong heroes, because strong heroes carry more gold. The Overlord's signature powers here are the **Glare** and the **Trapdoor**.

The department head is **Ledger-Bones**, a skeleton clerk who counts every coin, writes the report and, as the department's manager (§18), shows the Overlord around. Theme link: the Dungeon is the empire's front door and its pride, so it reports body counts and gold to the Throne Room.

## 2. Core loop (active)

1. Hero **parties** arrive every 12 s, entering at the top of the map and walking toward the Hoard.
2. Towers fire automatically, summons block and brawl, and runes trigger when heroes step on them.
3. **Bait Chests** (Dungeon Keeper lesson, D-12): the floor has 2–3 pre-authored **side loops** off the main path. A Bait Chest placed at the end of a loop pulls every party through that loop (a longer route past more of your towers) before they rejoin the main path. Each chest costs Plunder and holds a small lure purse, which heroes "loot" at 5% of their bounty.
4. Kills drop Plunder coins. They auto-collect after 1.5 s. Tapping a coin collects it right away with a +10% "greedy grab" bonus.
5. Spend Plunder on new placeables, upgrades, chests, or a higher Lure tier.
6. Read the preview and adapt. A Knight-heavy party is coming, so you drag a Bone Ballista to the choke, re-bait them into the Brazier loop, and ring the Gong early.

**Example minute.** The HUD preview shows party 14: "2×Sq 1×Cl 1×Wz". You know the Wizard dispels runes, so you move the Bait Chest to the east loop, where your Mire rune sits outside his dispel window. The Cleric is healing the Squires through your Brazier, so you tap the Glare near her. It snaps to her (Glare prioritizes Clerics), 40 dmg, and she drops. A Squire breaks for the Hoard, so you drop the **Trapdoor** under him and he tumbles back to the entry. Another Squire leaks and grabs a gold sack. You chase him with your Arrow Slits and get the sack back plus 25%. No leaks this party, so the Gong stack climbs to +40%.

**Active verbs:** place, drag-move, sell, upgrade, bait, Gong (call early), Glare (targeted), Trapdoor (one per party), coin grab, recover sacks.

## 3. Passive / idle behavior

**While the app is open and untouched**, the simulation runs normally. Coins auto-collect, nothing is called early, and Glare and Trapdoor aren't used. This is the full on-screen idle rate, R_sim.

**`idleRate`** (shared interface, 00 §7) comes from a **headless deterministic sim**:
1. It's recomputed (debounced 3 s) after **any** layout change, upgrade purchase, chest move or Lure change. It never runs on a timer or on app hide (m7), because iOS freezes workers on hide.
2. It simulates 300 game-seconds at the **same 20 Hz step as the live game**, on **3 seeds derived from the layout hash**, and averages them. This runs in a Web Worker (~9,000 ticks, < 100 ms on mid phones). It outputs `plunderPerSec` (net of steals) and `leakFraction`.
3. **Cautious Mode** (gentle offline): the sim also runs at tiers T-1, T-2 and T-3. `idleRate` uses whichever tier has the highest `plunderPerSec` among those with `leakFraction < 0.2`, or T-3 if none qualifies. A layout that can't hold the line never bleeds money while you're away.
4. **Offline:** the shared core applies the suite offline factor and cap (00 §7). There's no local cap node (Deeper Vault was removed). The report shows heroes slain, heroes escaped, and Plunder earned.

**Target ratio:** active ≈ **1.8–2.2× R_sim**: Gong throughput (+25–50%), the perfect-wave Gong stack (up to +100% bounty), Trapdoor saves, coin grabs (+10%), sack recovery and Glare. That's **≈ 3–3.7× offline** at baseline (D-21). The balance simulation verifies this.

## 4. Gentle failure

- **There is no lives counter and no game over.** A hero who reaches the Hoard grabs a **Gold Sack** worth `min(steal_T, 2% of unspent Plunder)`. He turns around and walks back out along the path at 1.3× speed.
- **Recovery:** kill the thief before he exits and the sack drops back with a +25% bonus. Thieves keep their HP, so a leak becomes a second chance with an exciting chase.
- **Spent Plunder can never be stolen.** Placeables and upgrades are never destroyed. Summons "die" and respawn, and runes disabled by Wizards come back after 6 s.
- **Struggle detection:** if `leakFraction` over the last 20 parties is above 30%, the Rumor Mill pulses and offers "Lower Lure by 1?" with one tap. Lowering Lure is always free and instant, and bought tiers stay bought.
- **Champions** (boss heroes) steal 5×. If one reaches the Hoard, his banner flips (purely cosmetic shame) and he counts as a "repelled" Champion with 0 bounty, never a loss state.
- **Starter kit (M7):** every cycle (first visit and after each Fall) starts with **Plunder = 100 + 10% of the previous cycle's blueprint value**, **2 free Arrow Slits** at fixed spots, and Ledger-Bones throwing bones at 1 dps from the Hoard. Income is never zero, and the first upgrade comes in < 60 s.

## 5. Entities

### 5.1 Heroes (enemies), T = Lure tier

Scaling: `HP = HP0 × 1.15^T`, `bounty = b0 × 1.17^T`, `armor = armor0 + floor(T/10)`, `steal = 4 × bounty`.

| Hero | HP0 | Speed (tiles/s) | Armor0 | b0 | Special | Unlock |
|---|---|---|---|---|---|---|
| Squire | 20 | 1.0 | 0 | 3 | none | start |
| Rogue | 14 | 1.8 | 0 | 5 | 30% dodge on projectiles; invisible except within 2 tiles of an Eye of Gloom; **ignores Bait Chests** | Lure 3 |
| Knight | 60 | 0.7 | 3 | 8 | Flat damage reduction per hit (min 1) | Lure 5 |
| Cleric | 25 | 0.9 | 0 | 7 | Heals allies within 1.5 tiles for 4 HP/s (scales with HP mult) | Lure 8 |
| Wizard | 22 | 1.0 | 0 | 9 | Every 8 s, disables the nearest rune within 3 tiles for 6 s | Lure 12 |
| Champion | 400 | 0.6 | 5 | 60 | Every 10th party. Knockback-immune; blockers deal only 50% to him | Lure 1 |

**Party composition:** size = `3 + floor(T/4)`, capped at 12. Composition is weighted by unlocked types, e.g. Squire 50, Rogue 15, Knight 15, Cleric 10, Wizard 10. The next two parties show in the HUD preview.

### 5.2 Placeables

Grid tiles are 16×16 logical px. **Wall** tiles take Towers, **Chamber** tiles (floor next to the path) take Summon lairs, **Path** tiles take Runes, and **loop-end** tiles take Bait Chests.

**Towers (wall tiles)**
| Tower | Cost | Dmg | Rate/s | Range (tiles) | Notes |
|---|---|---|---|---|---|
| Arrow Slit | 25 | 4 | 1.2 | 3 | single target, first-in-path |
| Flame Brazier | 60 | 3/s burn | aura | 1.5 | burns everyone in range, ignores armor |
| Bone Ballista | 120 | 30 | 0.4 | 5 | pierces a line of up to 3 heroes |
| Eye of Gloom | 150 | 0 | aura | 2 | -25% speed, reveals Rogues |

**Summons (chamber tiles; a lair spawns blockers that step onto the adjacent path tile)**
| Lair | Cost | Minions | Minion HP | Dmg/s | Respawn | Notes |
|---|---|---|---|---|---|---|
| Skeleton Crypt | 50 | 2 | 30 | 3 | 8 s | each blocks 1 hero |
| Slime Pit | 90 | 1 | 50 | 2 | 12 s | splits into 2× 20 HP slimes on death |
| Ogre Den | 250 | 1 | 200 | 12 | 20 s | blocks 2 heroes, 1-tile cleave |

**Runic Curses (path tiles; limited by Rune Slots, which start at 3)**
| Rune | Cost | Effect | Cooldown |
|---|---|---|---|
| Mire | 40 | -40% speed for 2 s on step | none |
| Spikes | 70 | 8 dmg per step, 3 charges | 1 charge per 4 s |
| Greed | 100 | heroes dying within 2 tiles drop +50% bounty | none |
| Confusion | 150 | hero walks backward for 1.5 s | 10 s |

**Bait Chests (loop-end tiles)**
| Chest | Cost | Effect |
|---|---|---|
| Bait Chest | 80 (×2 per extra chest) | All non-Rogue heroes detour through this loop. Max 1 active chest per loop. |

**Selling and moving:** a sell within 10 s of placement refunds 100% (undo). After that it refunds 80% of total invested. **Drag-to-move is free.** The moved piece is inactive for 3 s while it "settles", so rearranging is a real tactical verb with a small cost.

### 5.3 Overlord abilities
- **Glare:** tap near any hero to deal 40 dmg (scales with Overlord's Gaze), 20 s cooldown. It **snaps to the highest-priority hero within 12 px of the tap** (Cleric > Wizard > Champion > nearest). A target ring shows on press, and it fires on release (D-13). Active only.
- **Trapdoor:** tap a path tile to open a trapdoor for 2 s. Heroes on it drop back to the entry (Champions are immune). 1 charge per party. Active only (D-21).
- **Gong:** calls the next party immediately for +10% bounty on that party. The bonus **stacks +10% per consecutive early call up to +100%, but only while parties are cleared with no leaks** ("perfect wave"). Any leak resets it.

## 6. Upgrade tree (all in Plunder)

**A. Placeable levels** (per instance, L1-L15)
- `cost = baseCost × 1.6^L`, `dmg/heal/HP ×= 1.22` per level, `range +0.1 tile` every 3 levels. Each piece gets a sprite upgrade at L5, L10 and L15.
- **Branch at L5 and L10** (choose 1 of 2, swappable by re-buying for 50% of the level cost). Examples:
  - Arrow Slit L5: *Crossbow Nest* (dmg ×2.2, rate ×0.6) or *Barbed Volley* (applies 2 dmg/s bleed for 3 s).
  - Skeleton Crypt L5: *Bone Legion* (+1 skeleton) or *Grave Knights* (HP ×2, armor 2).
  - Mire L5: *Tar Pit* (-55% speed) or *Sinkhole* (5% chance to trap a hero for 1.5 s).

**B. Workshop (global research).** Capped at 25 levels, with a visible change every 5 levels (00 §8):
| Node | Cost formula | Effect / level | Max | Visible milestones |
|---|---|---|---|---|
| Whetstones | 100 × 1.5^n | +5% tower dmg | 25 | crit sparks at 5, glowing bolts at 10, … |
| Necromancy | 150 × 1.55^n | +8% summon HP & dmg | 25 | minion eye-glow tiers |
| Deep Inscription | 80 × 1.5^n | +6% rune potency | 25 | rune colour tiers |
| Rune Slots | 500 × 4^n | +1 rune slot | +5 (8 total) | — |
| Greedy Ledger | 200 × 1.7^n | +4% Plunder from all sources | 25 | Hoard pile sprite grows |
| Overlord's Gaze | 250 × 1.8^n | Glare +20% dmg, -0.5 s cooldown | 20 | Glare beam colour tiers |
| Sticky Fingers | 400 × 2.2^n | sack recovery bonus +10% | 5 | — |
| Deep Trapdoor | 300 × 2^n | Trapdoor +0.5 s open | 4 | — |

(Deeper Vault was removed, since offline caps are suite-level now.)

**C. Rumor Mill (the "harder for more" dial)** - see section 7.

**D. Dungeon Expansion**
- **Dig:** convert a solid rock tile into a wall or chamber tile. Cost `50 × 1.35^k` (k = tiles dug so far). *Later:* Dig can also carve **path** tiles, and heroes then route by greed (see §14).
- **New Floors** (layouts): Floor 2 "The Ossuary" for 5,000 and Floor 3 "Drowned Halls" (with a water lane where Rogues run 1.3×) for 60,000. Each layout has a longer path, more side loops, more build tiles, and +20% base bounty. Only one floor is active at a time, and each saves its own layout.

## 7. The Lure dial, and the Fall

The Lure tier T is bought once per tier per cycle: `lureCost(T) = 40 × 1.45^T`. You can freely set T anywhere from 0 to the highest tier bought. **MVP range: 0–40** (M1).

- Hero HP grows ×1.15 per tier while bounty grows ×1.17, so a layout that keeps the same kill rate earns ~1.7% more per tier per hero. Party size also grows every 4 tiers.
- The ceiling is your defense. Effective HP outpaces most single upgrades, so the player constantly balances "push Lure" against "spend on power".
- **New hero types arrive at set tiers.** Each one is a puzzle (Rogue needs an Eye and ignores bait, Wizard needs rune spacing, Cleric needs focus fire), and each carries a bounty premium.

**Infamy (00 §2.2):**
- **Skill gate:** slay **2 Champions at Lure ≥ `min(15 + 4N, 40)`** while leak stays under 20% over the last 20 parties (on screen). It tracks the Dungeon's signature moment, the boss kill (D-14).
- **Economy gate:** this cycle's Plunder ≥ `E0_dungeon × 3^N`.
- **Fall:** the Legend walks the path untouchable and sacks the Hoard. It resets Plunder, placeables and levels, Workshop and Lure tiers. **Kept:** Floors, dug tiles, saved **blueprints** (ghost pieces; tap to rebuild when affordable), plus the starter kit (§4).

## 8. Local currency: Plunder

- **Earned from** hero bounties, recovered sacks (+25%), Gong bonuses, Greed runes, and the offline rate.
- **Spent on** placeables, placeable levels, Workshop, Bait Chests, Lure tiers, Dig, and Floors.
- **Display:** a gold coin icon with the shared `formatNum` (K, M, B, T, then aa, ab…). Plain numbers.
- **Pacing targets:** first Ballista at about 2 min, Lure 5 (Knights) at about 15 min, Floor 2 at about 1.5 h of active play.

## 9. Session shapes

- **30 s:** open the app, see Ledger-Bones' report ("+1.2K Plunder, 312 heroes slain, 9 escaped"), ransom the captured heroes (§13), buy the 1–2 upgrades the "Ready" badge highlights, tap the Gong once, leave.
- **5 min:** read the preview, re-bait a loop and rearrange 2–3 pieces for an incoming Wizard and Knight mix, buy Lure +1, chase a thief, Trapdoor a runner, branch a tower at L5, and catch a Champion party.
- **30 min:** design a new layout on Floor 2 from scratch, find out which tier it holds, iterate on loops and choke points, and tune rune spacing against Wizards. A theorycraft session that ends with a higher idle rate.

## 10. Screen layout (portrait 180×320 logical)

Safe areas: the game canvas fills the screen. Logical rows 0-15 and 304-319 are **decor-only** (cave rock art), so no tap targets sit under the notch or home indicator.

```
y   0 +----------------------------------+
      |  rock decor (notch-safe band)     |  16
 16   | [coin]12.4K Lure7  ▮▮░  [=] [⌂]  |  HUD 16 (+ Infamy bar)
 24   | next: [Sq]x2 [Cl]x1 [Wz]x1 | then..|  preview row, 8x8 icons (D-13)
 32   +----------------------------------+
      |  ENTRY  v                         |
      |   #  ...path...  #  O     [chest] |  playfield 11x13 tiles
      |   #   :  T   :      ~    loop ↺   |  of 16px = 176x208
      |    path winds, side loops         |  T=tower O=lair ~=rune
      |              [HOARD $$$]          |
240   +----------------------------------+
      | [Gong][Glare][Trap] tabs: Twr Sum Run Bait | ability/tab row 16
256   | [slot][slot][slot][slot][slot]    |  build tray 48:
      |  cost   cost   cost   cost  cost  |  drag sources OR
      |                                   |  selected-item panel
304   +----------------------------------+
      |  rock decor (home-indicator band) |  16
320   +----------------------------------+
```
The playfield (11×13 tiles) sits at x 2-177, unobstructed. The preview no longer overlays the playfield. It shows type counts as 8×8 icons in the HUD's second row. Selecting a placed piece swaps the tray for its panel (Upgrade / Branch / Sell / Target mode).

## 11. Touch controls (one-handed)

- **Drag from tray to tile:** places the piece. Valid tiles glow and a ghost shows range. Release on an invalid tile cancels.
- **Tap a placed piece:** selects it, the tray becomes its panel, and its range ring shows.
- **Hold (300 ms) on a placed piece, then drag:** moves it (free, 3 s settle).
- **Flick a selected piece downward:** sells it. A 1 s "sell" chip in the tray allows undo.
- **Glare:** with Glare armed (tap its button, or tap directly near a hero when it's ready), press near a hero to show the snapped target ring, and release to fire.
- **Trapdoor:** tap the Trap button, then tap a path tile.
- **Tap a coin or sack:** collects it.
- **Gong:** a big 32×16 button bottom-left, in thumb reach.
- Every active control lives in the bottom 80 logical px, except taps on the board. Board targets are at least 16 logical px.

## 12. Why it doesn't feel like the other six

- It's the **only spatial-planning game**: where you put things, which corridor you bait the party into, and when you move them is the whole skill. The Mines are tap-to-mine (with rhythm as an upgrade), the Styx is cast-and-tension timing, the Spire is drop-and-merge physics, the Cauldron is steering a particle flow, the Bridge is catching lies, and the War Pit is drafting a warband.
- It's the **only game where you tune your opposition** (Lure) and face enemy *counters* to your build (Wizards vs runes, Rogues vs projectiles and bait).
- Real-time multi-agent combat with a preview-and-respond tactical rhythm.
- Its unique persistent system is **blueprints and Floors** (D-14).
- **Vs the War Pit** (the other strategy department, 07 §12): the Pit is a turn-based draft with no map, decided before the fight, against rival beast warbands rather than heroes. The Dungeon is spatial, real-time and intervened in mid-fight.

## 13. Pixel art & juice

- A 16×16 tile set with a dark purple and green palette. Gold is the only saturated warm colour, so Plunder always pops. Heroes get 2-frame walk cycles at 8 fps, with a 1 px outline in their faction colour.
- **Hit feedback:** a 1-frame white flash on the hero and damage numbers in a 3×5 pixel font. Crits are bigger and gold.
- **Kills:** a hero bursts into 6-10 coin particles that arc and fly to the HUD counter with a ticking "chk" per coin, pitch rising during combos.
- **Leak:** the sack sprite is clearly visible on the thief's back, the Hoard pile visibly shrinks a step, and a sad "clink" plays. Recovery gets a big gold sparkle and Ledger-Bones' rattle-cheer.
- **Bait Chest:** glints every 2 s. Heroes visibly turn their heads toward it.
- **Trapdoor:** a 2-frame trap swing, a falling "aaaa" squeak, and the hero pops out at the entry with stars.
- **Gong:** 2 px screen shake and a low bong, and the party banner unfurls at the entry. The perfect-wave stack shows as gong rings.
- **Runes** glow when charged, crack-flash on trigger, and grey out when dispelled.
- **Champion entrance:** brass fanfare, a 0.5 s slowdown, and a name card ("Sir Reginald the Mildly Brave").
- **Return ritual (v1.1, 00 §5.3):** a 5 s replay of the best kill streak while you were away, then the heroes captured by your Sinkholes and Trapdoors sit in a cell. Tap to ransom them for +5% of the offline haul.

## 14. Technical notes (PixiJS v8)

- **Simulation separate from rendering:** game logic is a pure TS module (no Pixi imports) running a fixed 20 Hz step. Pixi renders with interpolation at display rate. The same module, at the same 20 Hz, runs in a Worker for `idleRate` (seeded PRNG, mulberry32, 3 seeds from the layout hash).
- **Pathing (MVP):** each floor has a main polyline path plus 2–3 side-loop polylines. A party's route is the main path with each baited loop spliced in. Heroes store `distanceAlongRoute`, so there's no pathfinding. Confusion negates velocity. The Trapdoor resets distance to 0.
- **Pathing (later, Dungeon Keeper mode):** Dig carves path tiles. Heroes path-find with A* on the 11×13 grid toward the treasure (Hoard or Bait Chest) that is richest per step. Routes are recomputed only on layout change and cached, exactly like the sim.
- **Targeting:** a per-tile bucket index of heroes. Towers query only the tiles in range (precomputed). No physics engine.
- **Rendering:** the static tilemap is baked into one RenderTexture and rebuilt on Dig or layout change. Heroes, towers and minions are Sprites from one atlas (`scaleMode: 'nearest'`). Coins and particles use `ParticleContainer`. Object pools for heroes, projectiles and coins.
- **Integer scaling:** render at 180×320 and scale by `floor(min(w/180, h/320))`. `roundPixels: true`.
- **Perf budget:** at most 60 heroes, 40 projectiles and 150 particles on screen. Coin particles above the cap merge into "pile" coins. 60 fps target on a 2021 mid-range Android, with 30 fps fallback above 20 ms frame time.
- **Background tab:** pause the live sim on hide. The shared core handles offline accounting from the cached `idleRate`, so nothing is computed on hide.
- **Save:** shared save module (00 §9). Layout + levels + Plunder + Lure + blueprints ≈ 5 KB.

## 15. MVP vs later (ships in v0.2)

**MVP:** Floor 1 with 2 side loops; Squire, Rogue, Knight, Champion; Arrow Slit, Brazier, Ballista; Skeleton Crypt; Mire and Spikes runes; Bait Chests; L1-L10 levels with one L5 branch per piece; Workshop (Whetstones, Necromancy, Rune Slots, Ledger, Gaze); **Lure 0–40**; Gong with perfect-wave stack, Glare with snapping, Trapdoor, sack recovery; 20 Hz 3-seed sim with Cautious Mode; starter kit; Infamy gates and Fall with blueprints; 8 Commendations.

**Later:** Cleric and Wizard; Eye of Gloom, Slime Pit, Ogre Den, Greed and Confusion runes; L10 branches; Floors 2-3 and Dig; Dungeon Keeper mode (path-carving Dig plus greedy A*); named Champions with unique mechanics; the replay-and-ransom return ritual; seasonal hero skins; a layout-sharing code string.

## 16. Meta-economy hooks (per 00)

- **Tribute:** via Rank from `idleRate`.
- **Export (v0.3):** **Bones**: 1 per 25 kills, plus the 2/h base trickle. (Not "souls", which belong to the Styx.) Imported by the Mines and the Bridge (00 §4).
- **Imports:** Ingots → Iron-shod towers (+1 armor-pierce per level; v0.3). Captives → Caged Bait: Rogues pause 1 s at a baited loop's entrance, glancing at the captive without detouring (L1); +10% chest purse (L2–3, later). Rogues still ignore Bait Chests, so the Eye of Gloom puzzle is untouched. This line is hidden until the War Pit unlocks (v0.6) and ships Node 1 only. 2 mechanic nodes per line (00 §4). The revision-2 Souls line was retired in the seven-department re-plan.
- **Trophies:** Legend helms from Falls go to the Throne Room Trophy wall.
- **Infamy and Fall:** §7.

## 17. Decided questions (department-local; ratified 2026-10-21 with the recommended defaults, see README)

1. Should an idle auto-Glare upgrade exist, or is Glare active-only forever? **Decided:** Active-only; it's one of the few active edges. (README OQ 16)
2. Discrete parties (preview-able, as written) or a continuous trickle? **Decided:** Discrete; it suits the preview-and-respond loop. (OQ 17)
3. One floor active at a time, or several in parallel for more passive income? **Decided:** One at a time. (OQ 18)
4. Dungeon Keeper mode (path-carving Dig plus greedy routing): commit to it as the post-MVP direction? **Decided:** Yes, after the MVP proves Bait Chests are fun. (OQ 10)

## 18. Manager: Ledger-Bones

**Ledger-Bones**, skeleton, clerk of the Dungeon. Revision 4 promotes him from department head to the department's **manager** under the shared system (00 §5.4).

- **Personality and voice:** a deadpan accountant who has been dead for centuries and is still annoyed about rounding errors. He reports in percentages, calls the Overlord **"My Liege"**, treats heroes as "visitors" or "customers", and is politely passive-aggressive about leaks ("an unbudgeted withdrawal"). Dry bone puns, never jokes on purpose. His gibberish voice is low dry clicks with teeth-chatter on stressed syllables and a quill-scratch at the end of a line. Readable lines are ≤ 32 characters, formal, often containing a number.
- **Portrait (32×32), expressions:** *neutral* (default, quill behind the ear), *spectacles* (pushing them up: analysis, previews), *jaw-drop* (his jaw literally falls off: Champions, Legend, big hauls), *smug ledger* (perfect waves, profits), *rattled* (leaks, thieves), *counting* (ambient, abacus).
- **Dock:** the default strip (y 16–48) over the HUD and preview row. It never appears while the preview is changing (the 3 s before a party enters) or during intense moments, so the preview is never hidden when it matters.
- **`isIntense`:** a Champion on the field, a thief carrying a sack, a Glare or Trapdoor being aimed, or a party within 4 tiles of the Hoard.
- **Icons he uses:** 💰 Plunder (the same coin-pile glyph as a thief's sack; 🪙 is the Bridge's Tollpence, R4-11), hero-type icons, tower, Bait Chest, Gong, Glare eye, Trapdoor, gold sack.

**Onboarding script (first entry after the Seal; ~80 s; uses the starter kit: 100 Plunder, 2 free Arrow Slits, his own bone-throwing):**
1. **Customers.** The first party walks in, and the free Arrow Slits fire. A dropped coin pulses. "Collect promptly. +10%." Done when the player taps a coin.
2. **First upgrade.** A highlighted build tile by the first bend, with the Arrow Slit in the tray. A ghost drags it. "One more slit, My Liege." Done on placement (inside the 60 s band; the starter kit covers it).
3. **Glare.** A Squire nears the bend, and the Glare button pulses. "Your Gaze. Near the visitor." Done when a Glare fires.
4. **Trapdoor.** A scripted fast Squire slips past. The Trap button pulses, then a path tile. "Trapdoor. Directly beneath." Done when he drops back to the entry.
5. **Gong.** The party is cleared. "Ring for the next customer." Done on the Gong. The +10% chip pops, and he explains the perfect-wave stack in the follow-up line ("No leaks keeps it climbing.").

**Micro-lessons** (`mechanic_unlocked`): **Bait Chests** on first affordability (2 beats: place a chest at a loop's end, then watch a party detour: "Re-routed. +40% exposure."); **Rumor Mill / Lure** on the first tier bought (2 beats: set Lure 1, and point at the bigger bounty in the preview); **Rogues** at Lure 3 (1 beat: "This one ignores chests. Noted.").

**Milestone triggers and example lines:**

| Trigger (00 §5.4) | Condition | Expression | Example line |
|---|---|---|---|
| `first_upgrade` | first L5 branch chosen | spectacles | "A specialist. Sound investment." |
| `first_upgrade` | first Ballista placed (~2 min) | smug ledger | "Ballista. Depreciates nicely." |
| `tier_reached` | new hero type arrives (Knights at Lure 5, Clerics, Wizards) | spectacles | "Knights. Armored. Budget for it." |
| `tier_reached` | Floor 2 bought | jaw-drop | "The Ossuary! So much filing." |
| `mechanic_unlocked` | Bait Chests affordable (runs the micro-lesson) | spectacles | "Chests. Visitors love chests." |
| `dial_raised` | Lure tier bought: first, every 5th, new max | neutral | "Richer customers inbound." |
| `hazard_first` | first thief with a Gold Sack | rattled | "Unbudgeted withdrawal! Chase!" |
| `struggle` | leaks > 30% over 20 parties (delivers "Lower Lure by 1?") | rattled | "Losses at 31%. Lower Lure?" |
| `infamy_50` | Infamy ≥ 50% | smug ledger | "Body count: up 50%, My Liege." |
| `legend_arrives` | Legend at the entry | jaw-drop | "A Legend. Not in the budget." |
| `return_after_fall` | first entry after a Fall | counting | "Blueprints saved. Rebuild?" |
| `goods_link` | Ingots or Captives line opened | smug ledger | "Iron arrived. Itemizing." |
