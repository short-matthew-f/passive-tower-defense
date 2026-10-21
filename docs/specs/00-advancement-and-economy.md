# 00 — Advancement Pipeline & Meta-Economy

Status: **revision 4** (2026-10-21). Revision 4 applies two user decisions: **department managers** (the department heads become managers who onboard the player and chime in at milestones; shared system in §5.4, per-department sections in 01–07 §18), and the **Goblin Mines' rhythm becomes an upgrade** (plain tap-to-mine core, the Doom Drum branch in 02 §6E; touched here in §4, §6 and §8.1). The revision 4 review (`review-rev4.md`, R4-01…R4-23) then fixed the manager strip's input rule, the save model, trigger spam and the Mines drum rules. Revision 2 followed the adversarial reviews (`review-design.md`, `review-economy-scope.md`). Revision 3 adds the seventh department (the War Pit, `07-war-pit.md`), re-plans the Goods graph for seven departments, adopts **simulation-driven tuning** (§8.1), and records the ratified open-question answers. Revision 3 also applies the War Pit review (`review-war-pit.md`, W-01…W-26): a two-layer simulation harness, per-unlock offline baselines, softened Captives imports and a re-estimated v0.6. This spec owns everything *between* departments: Tribute, Dread, Infamy/Falls, Goods (cross-links), the Throne Room, unlocks, offline rules, balance, saves and build phases. Department-internal numbers stay in specs 01–07.

**Every number in specs 00–07 is a starting point (a seed).** The targets and bands are the design; the headless balance simulation owns the final constants (§8.1).

---

## 1. Design pillars

1. **Every department stands alone.** Played alone, any department reaches its Fall and uses its whole tree. Cross-links are at most **+18% income** plus a few mechanics, and never a gate.
2. **Spreading attention pays off but is never required.** That's done through diminishing returns, not requirements.
3. **Nothing banked is ever lost** except by a reset the player chooses.
4. **Resets roll one department at a time.** The player never wipes seven games at once.
5. **Active ≈ 3–5× offline** at baseline in every department, measured by the balance simulation (§8.1), drifting to 2.5–3× late.
6. **Closing the app never beats watching it.** The effective offline factor is hard-capped at 0.9× on-screen idle in the shared core.
7. **Prestige comes from play, not absence.** Infamy's skill gate only counts on-screen events (§2.2). An ignored department keeps earning, but it never Falls by itself.
8. **Simulate, then tune.** Specs fix targets and bands. Constants are seeds until the simulation has centred them (§8.1).

---

## 2. Prestige structure — decision

### 2.1 Options considered

| Option | Verdict |
|---|---|
| A. **Single global prestige** (reset all seven) | Rejected. It forces you to abandon mid-pushes in six games. The loss feels huge, which isn't gentle. |
| B. **Seven independent prestiges and currencies** | Rejected. It creates seven silos with no shared payoff, and seven times the balancing. |
| C. **Per-department Falls + global Ascension** | Deferred. Two reset layers is too much at launch (see "Cataclysm", §2.6). |
| **D. Rolling Falls**: per-department Infamy and reset, paying **one shared currency, Dread**, spent in a global branch plus per-department wings | **Chosen.** Both reviews named this the strongest part of the design. |

**Why D wins:** each game gets its own prestige moment and identity: its own legendary hero, its own reset rules, its own signature Infamy event, and (later) its own Dread wing. The *reward* is shared, though, so falling the Mines makes the Dungeon stronger too. Resets are small, opt-in and staggered, and they happen while the other six departments keep running.

**Answers to the brief:** yes, every game has its own prestige layer (the Fall). There is one prestige currency (Dread) and one prestige *layer* at launch. Games interact through three channels: Tribute (all of them feed the hub), Dread (any Fall strengthens all of them), and Goods (each exports one by-product that two partners import, from v0.3).

### 2.2 Infamy: two gates (per department, 0–200%)

Review finding B1 showed that a pure skill check on a free dial lets you farm Dread in minutes. Infamy now needs **both** of these:

- **Skill gate:** the department's **signature event**, performed at or above the dial target. It counts **on-screen play only** (active, or on-screen idle where the event can happen). It **ratchets**: `heldLevel` is the best level achieved this cycle and never goes down.
- **Economic gate:** this cycle's lifetime local earnings (offline included) must reach `floor_d(N) = E0_d × 3^N`. `E0_d` is set by the balance simulation so the reference player reaches it about 2.5 h active-equivalent into their first cycle of that department.

Every **dial level is a one-time purchase in local currency that resets on Fall** (the Dungeon's Lure model). Once bought, the dial is free to set anywhere at or below the highest level bought. That keeps the user-facing promise "the dial is always your choice", and it also makes each cycle cost real economy.

```
skillFrac = min(1, heldLevel / target_d(N))
econFrac  = min(1, log10(max(1, cycleEarnings)) / log10(floor_d(N)))
Infamy    = 100 × min(skillFrac, econFrac)                        // 0–100%

// overflow, only once both gates are at 100%
skillOver = (target(N+1) == target(N)) ? 1 : (heldLevel − target(N)) / (target(N+1) − target(N))
econOver  = log(cycleEarnings / floor(N)) / log(3)
Infamy    = 100 + 100 × min(1, skillOver, econOver)               // 100–200%
```
So **200% always means "you already meet the next Fall's requirements"**, in every department. Pushing has a cost that's comparable across departments (fixes M4). When a dial is capped, overflow comes from the economy gate alone, so there's no dead zone.

| Dept | Signature event (skill gate, on-screen only) | Dial and per-level price (local currency, resets on Fall) | target_d(N), N = prior Falls | MVP dial range |
|---|---|---|---|---|
| Cauldron | Complete **5 Batches** (recipe tickets, from player Tosses) at Malice ≥ M | Malice `2,000 × 5^M` Bile | `min(4 + N, 10)` | 0–10 |
| Goblin Mines | Break **50 rocks** at depth d (goblins count while on screen) | Depth via Dig Deeper `100 × 1.21^d` Nuggets | `30 + 5N` (no cap) | 1–60 |
| Dungeon | Slay **2 Champions** at Lure ≥ T, with leak < 20% over the last 20 parties | Lure `40 × 1.45^T` Plunder | `min(15 + 4N, 40)` | 0–40 |
| Troll Bridge | **5 evidence-backed Unmasks** (≥ 2 visible matching tells) at Menace ≥ M | Menace `500 × 3^M` Tollpence | `min(4 + 2N, 20)` | 0–20 |
| River Styx | Land **20 souls** at Wrath ≥ W with ≤ 30% escapes, including ≥ 1 rare+ | Wrath `1,000 × 3^W` Obols | `min(5 + 2N, 20)` | 0–20 |
| Sorcerer's Spire | **Feat**: create tier t while Volatility ≥ v was held since the last vent *or* for the last 60 drops. Score = t + v (Singularity = 12) | Volatility `5,000 × 4^V` Arcana | `min(12 + N, 22)` | 0–10 |
| War Pit | Win **2 Pit Crowns** (8-win Runs that beat the Huntmaster) at Stakes ≥ S | Stakes `300 × 2.2^S` Teeth | `min(4 + 2N, 10)` in MVP (cap 20 once cards 12–18 ship) | 0–20 |

All MVP dial ranges cover Falls #0–#5 plus overflow (fixes M1). Prices and targets are seeds owned by the balance simulation (§8.1); the sim must show each target reachable inside the shipped range.

Each department shows Infamy as a ring around its door in the Throne Room and as a thin two-segment bar (skill | economy) in its own HUD, so the player always knows which gate is lagging.

### 2.3 The Fall: "Sacked & Avenged" (voluntary)

- At 100%, a **named Legendary Hero** appears at that department's gate ("Dame Brightjaw the Unreasonably Tall is sharpening her sword outside the Kitchen."). **She waits indefinitely.** Infamy can keep climbing to 200% in the meantime, so the player decides when to let her in: the classic "fall now or push" choice.
- **Let Them Come** plays the sequence (fixes D-17):
  1. **Sacked:** the Legend breaks in and razes the department in its own verb (Dungeon: walks the path; Mines: drills down; Spire: dives into the flask; Cauldron: wades through the pegs; Styx: drains the river; Bridge: just... walks across; War Pit: beats every beast barehanded and throws open the cages). This is the reset.
  2. **Avenged:** the Overlord personally descends. One timed tap (Crush) adds **+0–25% Dread**.
  3. The Legend is captured. Her helm goes on the Trophy wall, word spreads (that's the Dread), and the department is rebuilt "bigger and meaner" (that's the next, higher target).
- MVP ships this as a static illustrated card with the one-tap Crush timing bar (decided, README OQ 3). Interactive per-department Last Stands come in v0.7+, after every department's MVP has shipped.

**Dread payout:**
```
Dread = floor( 10 × (1 + 0.5·N_d) × (Infamy/100)^1.5 × FreshBlood × (1 + 0.1·LegendsBane_d) × (1 + Crush) )
FreshBlood = 2 on a department's first Fall, else 1;   Crush ∈ [0, 0.25]
```
For example, a first Fall at 100% pays 20 and at 200% pays 56. A 3rd Fall (N=2) at 120% pays 26. The exponent is 1.5, not 2 (M4), so 200% pays 2.8× instead of 4×. Pushing is rewarded, but it isn't mandatory.

### 2.4 What a Fall resets and keeps

General rule: **the bulk currency, its trees and the dial purchases reset; rare tokens, collections and layouts persist.**

| Dept | Resets (`run`) | Keeps (`persistent` / `lifetime`) |
|---|---|---|
| Cauldron | Bile, Pantry, Peg Board, Buckets, Toadling Kitchen, Malice levels | Batch Tokens, Recipes branch, unlocked Board Layouts |
| Mines | Nuggets, Gauntlet, Crew, Shaft, the Drum Circle's Nugget levels (02 §7), current max depth | Gems, Infernal Engineering, the Doom Drum and its on/off setting, Tempo Lever, Thunder Beat, `maxDepthEver` |
| Dungeon | Plunder, placeables and levels, Workshop, Lure tiers | Floors, dug tiles, saved **blueprints** (ghost pieces, tap to rebuild). Each cycle starts with a **starter kit** (see 01 §4) so income is never 0 (M7). |
| Bridge | Tollpence, all four trees, Menace levels | traveler Codex, lifetime bounties (which unlock traveler types and rule cards, never Menace) |
| Styx | Obols, all trees, band unlocks, Wrath levels | Codex, Trophy Wall, bait stock |
| Spire | Arcana, Alchemy/Apparatus/Apprentices, Distill Ceiling, Volatility levels | Grimoire Pages, Tomes |
| War Pit | Teeth, Pens/Spoils/Kennels trees, Stakes levels, the Standing Warband (back to the starter garrison), any paused Run. Each cycle starts with Snarl's 120-Teeth opening purse (07 §3). | Crests, Bestiary unlocks and Pedigrees, Hall of Banners, `lifetime.best` |

Across all departments, **imported Goods nodes, Throne upgrades, Dread perks, Tribute, Goods stockpiles and `peakRank` are never reset.**

**Rebuild targets:** with the Dread bought from the previous Fall, a department should regain its *previous* 100% point in ≤ 35% of the previous cycle's time, and reach the new target in 100–130% of it. **Rebuild Rush:** ×3 local income for the first 30 min after a Fall.

### 2.5 Dread tree (spent at the Dread Altar)

**Launch (v0.1):**
| Perk | Branch | Cost (Dread) | Effect / level | Max |
|---|---|---|---|---|
| Iron Fist | Empire | 5 × 1.4^L | +10% all local income (Dread group, §3.1) | ∞ |
| Tithe Collector | Empire | 6 × 1.45^L | +15% Tribute | ∞ |
| Long Reach | Empire | 8 × 1.6^L | +1 h offline cap, all departments | 8 |
| Idle Hands | Empire | 10 × 1.7^L | +0.05 offline factor, all departments (0.6 → 0.9 cap) | 6 |
| Ruinborn | each department's wing | 4 × 1.5^L | +25% this department's income (Dread group) | 20 |

**Later (wings expansion, v0.7+; designs kept):**
| Perk | Cost | Effect | Max |
|---|---|---|---|
| Swift Rebuild | 12 × 2^L | Rebuild Rush +15 min | 4 |
| Goods Caravan | 10 × 1.6^L | +10% Goods trickle (needs Goods, v0.3+) | 10 |
| Head Start (wing) | 15 × 2.2^L | Start each cycle owning the first 2L dial levels and 1 + L free helpers (M4) | 5 |
| Legend's Bane (wing) | 20 × 2^L | +10% Dread from this department's Falls | 5 |
| Signature (wing) | 40 | One-time unique perk, listed below | 1 |

Signatures:
- **Cauldron, Granny's Book:** Mandrake and Splitroot are pre-unlocked.
- **Mines, Express Lift:** the depth lever starts at `maxDepthEver − 15` (Dig cost already paid up to there).
- **Dungeon, Master Mason:** blueprints auto-rebuild at L1 as Plunder allows.
- **Bridge, Familiar Faces:** Squint and the first 5 Wallet Sense levels are kept.
- **Styx, Old Charts:** Murk is pre-unlocked and starts with 2 Imp Netters.
- **Spire, Seeded Flask:** starts with Wider Flask 1 and Catalyst Coil 2.
- **War Pit, Old Guard:** the Standing Warband survives the Fall.

### 2.6 Later: Cataclysm (not in launch scope)
Would unlock only after every department has fallen 5 times, resetting Dread perks and Throne upgrades for a permanent multiplier currency. **Decided (README OQ 2): left out** until players actually reach 5 Falls everywhere. It isn't designed further here.

---

## 3. Currency map

| Currency | Scope | Sources | Sinks | Resets on |
|---|---|---|---|---|
| Bile | Cauldron | ingredient landings, Batches, offline | Pantry, Board, Buckets, Toadlings, Malice | Cauldron Fall |
| Batch Tokens | Cauldron (rare) | recipes (active only) | Recipes branch | never |
| Nuggets | Mines | rocks, offline | Gauntlet, Crew, Shaft, Drum Circle levels | Mines Fall |
| Gems | Mines (rare) | Geodes, Bedrock, Lucky Rocks, Motherlodes | Infernal Engineering, the Doom Drum, Tempo Lever, Thunder Beat | never |
| Plunder | Dungeon | bounties, sacks, Gong, offline sim | placeables, Workshop, Lure, Dig, Floors, Bait Chests | Dungeon Fall |
| Tollpence | Bridge | tolls, bounties, confiscations, goons | 4 trees, Menace | Bridge Fall |
| Obols | Styx | soul sales, wisps, netters, Codex | trees, bait, bands, Wrath | Styx Fall |
| Arcana | Spire | merges, Resonance, vents, offline | Alchemy/Apparatus/Apprentices, Volatility | Spire Fall |
| Grimoire Pages | Spire (rare) | Singularities, Volatility milestones | Tomes | never |
| Teeth | War Pit | battles, run-end bonuses, Skirmish Gauntlets, opening purse, offline | Pens, Spoils, Kennels, Stakes | War Pit Fall |
| Chow | War Pit (in-Run only) | 10 per round (+Larder) | shop buys and rolls | end of each round; never saved outside a Run |
| Crests | War Pit (rare) | Triumphs at Stakes ≥ target − 2, deep Runs at Stakes ≥ 3 (active only) | Bestiary, Pedigrees, beast skins | never |
| **Goods** (7 kinds, §4; v0.3+) | shared | by-products of each department | Import nodes in partner departments | never |
| **Tribute** | global | every unlocked department, continuously (§5.1); Commendations | Seals, Throne upgrades | never |
| **Dread** | global prestige | Falls | Dread Altar | never (except Cataclysm) |

```
  ┌──────────── each department (×7) ─────────────┐
  │ play/idle ──► LOCAL currency ──► local trees   │
  │      │              │ (rate)      + dial levels │
  │      │ by-product   ▼                           │
  │      ▼        Rank (log of idle rate)           │
  │    GOODS ──┐        │     Infamy = min(skill,   │
  │   (v0.3+)  │        │              economy)     │
  └────────────┼────────┼──────────────┼────────────┘
               │        ▼              ▼ 100–200%
     partner   │     TRIBUTE         FALL (opt-in)
     depts'  ◄─┘        │              │
     Import nodes       ▼              ▼
                 Throne Room        DREAD
                 · Seals (unlocks)  · Empire perks ──► all depts
                 · Dark Banners ──► +local income
                 · Curfew Bells, Treasury, Satchel
                                    · Dept wings ───► one dept
```

Local currencies **never convert** into each other or into Tribute directly. That isolation is the main anti-domination and anti-inflation tool.

### 3.1 Canonical multiplier stacking (fixes M5)

Every department and the balance simulation use exactly this:
```
localIncome = base
            × (1 + Σ localAdd)                         // the department's own +% nodes
            × (1 + 0.10·Banner_d)                      // Throne group
            × (1 + 0.10·IronFist + 0.25·Ruinborn_d)    // Dread group
            × (1 + importAdd_d)                        // Goods group, ≤ 0.18
            × tempMult                                 // max(RebuildRush 3, LateRecruit 2), never multiplied together

Tribute/min = 0.5 × (1 + Rank_eff)^1.5
            × (1 + 0.15·TitheCollector + DarkTithe 0.25 + min(0.25, 0.01·Trophies))
            × (1.5 if the department is on screen)
            × (offlineFactor if the app is closed)
```
Groups multiply; members of a group add. The Trophy bonus is capped at +25%.

---

## 4. Cross-links: Goods (ships in v0.3, once ≥ 4 departments exist)

Each department **exports one Good** as a by-product. Exporting never spends local currency. Each department **imports exactly two** Goods and **each Good has exactly two importers**, so seven departments make **14 thematic links**. Because every Good still splits across two lines, the per-line economics below are unchanged from revision 2.

| Good | Made by | Active rate | Passive rate | Imported by |
|---|---|---|---|---|
| Potions | Cauldron: each Batch = 1; toadlings 1 per 3,000 drops | ~15/h | ~4/h | Mines, Styx |
| Ingots | Mines: Ore Vein 2%, Motherlode 5 | ~20/h | ~6/h | Dungeon, Spire |
| Bones | Dungeon: 1 per 25 kills | ~20/h | ~6/h | Mines, Bridge |
| Contraband | Bridge: each confiscation = 1; goon crates `max(1, sniffer)` per 5 h | ~12/h | ~3/h | Cauldron, Styx |
| Souls | Styx: rare+ catch = 1, every 10th common = 1 | ~15/h | ~4/h | Spire, War Pit |
| Essence | Spire: T7+ merge = 1 (T11 = 5) | ~10/h | ~3/h | Cauldron, War Pit |
| Captives | War Pit: 1 per Run reaching 6 wins (3 per Triumph); 1 per 60 Gauntlet rounds cleared, capped at 1/3 of the active rate | ~15/h | ~4/h | Dungeon, Bridge |

**Revision 3 re-plan (seven departments).** The War Pit's Captives go to the Dungeon (bait for Bait Chests) and the Bridge (a pillory for unmasked heroes). To keep two imports each, the Dungeon drops **Souls** and the Bridge drops **Essence**, and the Pit takes both freed slots (Souls: restless spirits for fainted beasts; Essence: warding sigils). This choice was made over the alternatives (Dungeon dropping Ingots, Bridge dropping Bones) because it keeps an **early-game line live in every v0.3 department**: at v0.3 the Cauldron has Contraband, the Mines have Potions and Bones, the Dungeon has Ingots and the Bridge has Bones. The Pit unlocks last, so both its imports are live on day one. It also replaces 07's first-draft proposal (a third Requisitions line for two departments plus a 3/h trickle). That would have broken the two-importer symmetry and stretched Goods pacing to ~18 days.

**Accepted cost (W-19):** the Dungeon's and the Bridge's second import line now opens with the Pit (day 6–8) instead of with the Styx (day 2), so those lines max around day 18–20 instead of ~day 14. Both departments keep a live first line from v0.3. From the Pit's side, Souls and Essence have stockpiled before it opens, so the sim holds its two lines to maxing **no sooner than 5 days after unlock** (lever: node costs ×1.5 for a line whose Good predates its importer).

- Goods are **plain integers** (no exponential growth).
- **Guaranteed base trickle:** every unlocked exporter yields at least **2/h** of its Good, even when it has never been upgraded (fixes M6). So a department you never play still supplies its partners. With two importers per Good, 2/h is unchanged for seven departments.
- Passive rates flow while offline, under each department's offline cap.

**Import lines:** each department gets a "Requisitions" tab with 2 lines (one per imported Good). Each line has **2 mechanic nodes**, each max 3 levels, costing `40 × 2.5^L` Goods (390 per node, 780 per line). **Each level also grants +1.5% local income**, so a maxed line gives +9% and both give +18%. There's no pure "+1%" node (D-15). At ~130 Goods/day per Good shared across two lines, a Good's two lines max out in about 12 days after the exporter unlocks. All of these are seeds, and the ~12-day band is what the simulation holds (§8.1).

**Node authoring (decided, README OQ 11):** both nodes of every line are authored with v0.3. If scope is tight, Node 1 ships alone (lines then max at +4.5% each). The Captives lines and the Pit's two import lines ship **Node 1 only** in v0.6 (W-16); their Node 2s come later.

Node 1 of each line:
- Ingots → Dungeon: Iron-shod towers, +1 armor-pierce per level.
- Captives → Dungeon: Caged Bait. Rogues pause 1 s at a baited loop's entrance, glancing at the captive without detouring (L1); +10% chest purse (L2–3, later). Rogues still ignore Bait Chests (W-15).
- Bones → Mines: bone miners, each worth +1 Grunt.
- Potions → Mines: Stamina Stew, a guaranteed crit every 30/25/20 taps (L1–3). Revision 4 replaced "wider on-beat window during Frenzy", because the beat is now an optional upgrade (02 §6E) and an import must help every player.
- Ingots → Spire: tempered glass, +2 px flask width per level.
- Souls → Spire: Spark fuel, +5% apprentice drop rate.
- Bones → Bridge: Skulls on posts, +5% fare.
- Captives → Bridge: Pillory. Unmasked heroes pay +1× fare as a pillory fine (L1); +5% Unmask bounty (L2–3, later). Crop slots stay a Bridge-tree lever, so the import never eases the skill gate (W-15).
- Contraband → Cauldron: exotic ingredient weight.
- Essence → Cauldron: Ladle peg charges +1.
- Potions → Styx: bait-effect brews.
- Contraband → Styx: Unpaid Debt bait discount.
- Souls → War Pit: Restless Spirits. The first friendly unit to faint each battle returns as a 1/1 Shade (L1); Shade +1/+1 per further level.
- Essence → War Pit: Warding Sigils. The front 1/2/3 units start each battle with Armor 1.

Retired by the re-plan (designs kept as spare Node 2 ideas): Souls → Dungeon (+1 skeleton per Crypt) and Essence → Bridge (Truth Rune).

**Strength rules:**
- Imports **never** unlock content, raise Infamy, or count toward Seals.
- A partner that isn't unlocked yet hides that line. **Black Market** (Throne, v0.3) sells any Good at 40 Tribute each (+2% per purchase that day), so Goods can never bottleneck.
- Import levels persist through Falls.

---

## 5. The Throne Room (hub)

**Layout (180×320):**
- Top: Tribute counter and Dread counter.
- Center: the Overlord on the throne, with six department doors in a 2×3 grid around him and the **War Pit's iron gate** set into the floor behind the throne (top centre, 48×24 px). Each door shows **only** its Infamy ring plus one priority badge (skull for a waiting Legend > "Ready" pip). Long-press a door for a tooltip with income/s and both Infamy gates (D-25).
- Bottom tabs: **Throne** (upgrades) · **Altar** (Dread) · **Armory** (Goods & Black Market, v0.3+) · **Trophies**.
- **Manager cameos** (§5.4.8): a department's manager peeks out of its door for a moment when something there needs the Overlord.
- Tap a door to enter. Every department has a ⌂ in its HUD to return. There are no edge-swipe gestures, because they collide with the Android back gesture (D-20).

### 5.1 Tribute income

Each unlocked department pays Tribute continuously, whether or not it's on screen:
```
Rank_d   = floor( 40 × log10(idleRate_d / ref_d) / log10(target_d / ref_d) )
           ref_d    = idleRate at a fixed scripted early state per department, defined in the balance sim (m6)
           target_d = the reference player's idleRate at their first 100% Infamy
Rank_eff = max(Rank_d, floor(0.6 × peakRank_d))   // peakRank lives in DeptSave.lifetime, so a Fall never tanks Tribute
```
`idleRate_d` is the department's on-screen idle rate, `offlineRate` before the offline factor (§7). Rank puts every department on the same log scale (Rank 40 ≈ "ready for the first Fall"), so the Mines' big Nuggets and the Bridge's small Tollpence weigh the same. Going from Rank 40 to 44 (×2.5 income) gives +15% Tribute from that department. Opening a new department gives far more, so spreading out pays without being required.

**Deliberate choices:**
- Tribute is mostly blind to active play. Only the ×1.5 on-screen bonus rewards attention. The hub rewards *breadth*, while each department rewards its own grind.
- While the app is closed, Tribute accrues at the same offline factor as local income (0.6 base). That fixes m9, where a single night made Seals 5–6 free.

**Commendations:** each department defines milestones (first Ballista, first Void Star, …) that pay `25 × 1.3^i` Tribute once. There are 8 per department at launch and 20 eventually. They're the early-game Tribute engine.

### 5.2 Throne upgrades (Tribute)

| Upgrade | Phase | Cost | Effect | Max |
|---|---|---|---|---|
| **Seals** (department unlocks) | v0.1 | see §6 | Opens a department | 7 |
| Dark Banners (one per department) | v0.1 | 100 × 1.6^L | +10% that department's income (Throne group) | 25 each |
| **Curfew Bells** | v0.1 | 600 × 2^L | +1 h offline cap, all departments (replaces every local cap node, D-14) | 8 |
| Treasury Vaults | v0.1 | 200 × 1.8^L | Tribute offline cap 8 h → +2 h/L | 8 (24 h) |
| Gobbo's Satchel | v0.1 (L1) | 500 × 4^L | L1: the report lists "Ready" buys with a "go" button. L2–L3 (**Steward**, later; decided opt-in per department, README OQ 4): auto-spends up to 25% / 50% of each department's offline haul | 3 |
| Imperial Roads | v0.3 | 1,000 × 2^L | +10% Goods trickle | 10 |
| Black Market | v0.3 | — | Buy Goods at 40 Tribute each | — |
| Edict Board | later | 2,500 | One standing Edict, switchable every 1 h: *Dark Tithe* (+25% Tribute), *Iron Discipline* (+0.1 offline factor in one department, still under the 0.9 cap), *Fear Itself* (+25% economy-gate progress in one department) | 1 |
| Trophy Hall | later | 1,500 | Displays Legends; +1% Tribute each, capped at +25% | 1 |
| Throne cosmetics | later | 1K–1M | Throne, braziers, minion guards, carpet | — |

**Steward rules (m5), for when it ships:** rank candidates by Δ`idleRate` / cost. Exclude consumables (bait), spatial items (placeables, Dig, Bait Chests) and dial purchases. Never spend below a per-department "reserve" the player sets. Toggle per department.

### 5.3 Goblin messenger report

**Gobbo**, the only cross-department goblin, runs in on return after ≥ 60 s away. For absences under 10 min it's a compact toast. Otherwise it's a full scroll:
- One line per department: haul, a flavor line from the department's **manager** (Granny, Gritch, Grumm, Pilk, the Head Sorcerer, Snarl the gnoll pitmaster, and Ledger-Bones, the Dungeon's skeleton clerk; one flavor line each, decided README OQ 15), drawn from that manager's `report` line pool with a 16×16 portrait (§5.4.7), and one highlight such as "1 Moon Witch!".
- Goods gained, Tribute gained, economy-gate progress, a **"⚠ Legend at the gate"** callout, and "cap reached at 6 h of 8 h" when time was wasted.
- **Collect All** is a single tap. There's no doubling and no ad.
- **Return rituals (v1.1 per department, D-16):** each department adds an optional ~5 s tactile ritual on first entry after an absence, worth +5% of that department's haul. Collect All always grants the base haul, so the ritual is never required. Rituals are listed in each spec.

### 5.4 Department managers (revision 4, user decision)

Every department has a **manager**. Managers are the department heads the specs already name, promoted to recurring characters: each one introduces the player to their department, teaches it by doing, and chimes in as the player hits milestones. **Gobbo is not a manager.** He stays the only cross-department character and carries the managers' lines to the throne (§5.3, §5.4.7). The player is still always the Overlord (D-23). Managers advise, report and react. They never act for the player: no auto-buying and no auto-play.

**Rules for the whole system:**
1. **Flavour and guidance, never a gate.** No content, reward or Infamy depends on reading a line or on the chattiness setting.
2. **Teach by doing, one mechanic at a time.** A lesson is an action the player performs, never a wall of text.
3. **Never block play.** One small strip, out of the play field. Touches pass through it, and it waits for calm moments.
4. **Distinct voices.** Each spec's §18 fixes personality, verbal tics, expressions and how the manager addresses the Overlord. No two managers share a form of address or a voice timbre.

#### 5.4.1 Roster

| Dept | Manager | Species | Calls the Overlord | Voice (gibberish synth) | In a word |
|---|---|---|---|---|---|
| Cauldron | Granny Gristle | hag | "dearie" | warbly mid-range, cackle on "!" | doting menace |
| Mines | Gritch | goblin | "BOSS!" | fast high squeaks, pick-clink accents | greedy hype |
| Dungeon | Ledger-Bones | skeleton | "My Liege" | dry low clicks, teeth-chatter | deadpan accountant |
| Bridge | Grumm | troll | (a pointing-claw icon) | deep rumbles, chewing pops | proud and dim (icon-only) |
| Styx | Pilk | imp | "Your Dreadness" | lilting buzzy chirps, sing-song | lazy, sly storyteller |
| Spire | the Head Sorcerer | lich | "M-my lord" | breathy rattle, stutter repeats | anxious academic |
| War Pit | Snarl | gnoll | "Chief" | gravel barks, hyena laugh, whistle | gruff coach and bookie |

#### 5.4.2 Onboarding (the guided first session)

- **When:** the first entry into a department after its Seal is bought (on first launch for the Cauldron, whose onboarding is the game's tutorial). The first beat starts at once, with no modal and no "start tutorial?" screen. A **Skip** chip sits on the bubble.
- **Shape:** **4–6 beats, 45–90 s of guidance, one mechanic per beat.** Each beat has a ≤ 32-character line with icons, a **highlight** (a pulsing 1 px outline on the target), an optional **ghost-finger** demo of the gesture, and a **completion condition that's a player action**. The beat waits for the action, and no timer forces progress. After 10 s with no input the ghost-finger repeats. After 30 s the bubble shrinks to the portrait, and the highlight stays.
- **Waiting beats (`waitFor`, R4-06):** a beat whose action isn't possible yet (usually an upgrade that isn't affordable) doesn't show early with a highlight on a greyed button. It waits, with the strip hidden, while the player plays freely, and it starts the moment its `waitFor` condition holds. Waiting time doesn't count toward the 45–90 s, and the first-upgrade band (< 60 s from entry) still applies on the clock.
- **Live game, no sandbox.** A beat may script a spawn from the department's normal content (a guaranteed Ore Vein, a smuggler traveler, a nibble). Onboarding grants nothing beyond what the spec's starter kit already provides, so it never changes the economy the sim measures.
- **First upgrade < 60 s:** every script makes its first purchase by beat 2 or 3. That keeps the hard band (§8 and §8.1), and the sim checks it by running the reference bot through the real script.
- **Skip:** skipping ends the script and records `skipped`. Skipped mechanics are kept in `manager.pendingTips` and come back as single-line tips the first time they matter (Full chattiness only).
- **Interrupt and resume:** leaving mid-script saves the beat index. The next entry resumes there, or at the next beat if its action has already been done.
- **Replay:** Settings → Managers → *Replay intro* for each department and each micro-lesson. It runs on the live state. When a beat's action isn't available (it costs too much, or it's already maxed), the ghost-finger demonstrates without waiting.
- **Micro-lessons:** mechanics that unlock later get a **1–3 beat lesson** on their `mechanic_unlocked` trigger, under the same rules. Examples: the Mines' Doom Drum and first keg (02 §18), Bait Chests and new hero types, Bridge rule cards, the Styx's Wrath slider and Murk, the Spire's Volatility knob, the War Pit's stationing and tactics cards.
- **Chattiness doesn't remove onboarding**, because it's guided content, not chatter. At **Off**, the onboarding and each micro-lesson start as a single prompt ("▶ Show me / ✕ Skip") instead of starting by themselves.

#### 5.4.3 Milestone triggers

Department cores emit typed events into one shared **`ManagerDirector`**. Each spec maps its own moments onto these trigger types, and each §18 lists 8–12 of them with example lines. A new trigger type needs an edit here, which keeps the director generic.

| Trigger | Fires when | Priority | Repeats |
|---|---|---|---|
| `onboarding` | first entry after unlock (§5.4.2) | guided | once (replayable) |
| `first_upgrade` | first purchase of a node the spec names | low | once per save per node |
| `first_helper` | helper-count milestones (goblins, toadlings, netters, apprentices, goons, garrison) | low | once per save |
| `tier_reached` | a new `maxEver` tier: depth stratum, floor, depth band, orb tier, hero type, Run wins | medium | once per save per tier |
| `mechanic_unlocked` | a new mechanic becomes affordable or is bought (**the Mines' Doom Drum**, a Bridge rule card, the Wrath slider, Bait Chests, Volatility, stationing…); runs a micro-lesson where the spec defines one | high | once per save |
| `dial_raised` | a dial level is bought for the first time in the save: level 1, then every 5th level (a spec may use every 3rd for a dial of ≤ 20 levels, or its own milestone list). Re-buying a level after a Fall is silent, and a level a spec's `tier_reached` already covers stays silent (R4-09) | medium | once per save per listed level |
| `hazard_first` | the first instance of each gentle-failure event (cave-in, vent, bonk, line snap, thief, Retreat) | medium | once per save |
| `struggle` | the spec's struggle detector fires (Dungeon leaks > 30%, Pit 3 Retreats, repeated Spire vents…); delivers that spec's existing one-tap offer | medium | 30 min cooldown |
| `commendation` | a Commendation pays (§5.1) | low | Full only |
| `infamy_50` | Infamy crosses 50% this cycle | medium | once per cycle |
| `infamy_100` | Infamy reaches 100% | high | once per cycle |
| `legend_arrives` | the Legend appears at the gate | high | once per cycle (also a Throne cameo and the report) |
| `fall` | on the Sacked & Avenged card (§2.3) | guided | every Fall |
| `return_after_fall` | the first entry after a Fall | high | every Fall (variants by N) |
| `return_long_absence` | the first entry after ≥ 8 h away (variant for ≥ 3 days) | medium | each absence |
| `goods_link` | an import line opens for the department, its first import node is bought, or its export first reaches a partner | medium | once per save per link |
| `report` | Gobbo's report (§5.4.7) | — | every report |
| `ambient` | ≥ 60 s on screen without input and nothing queued | lowest | Full only, ≤ 1 per 10 min |

#### 5.4.4 Rate limiting and calm detection

- **Unprompted lines** are everything except onboarding, micro-lessons, the Fall card and the report. They're capped at **1 per 3 min per department** and **1 per 90 s suite-wide** (`managerClock.lastLineAt`), and `ambient` has its own cap of 1 per 10 min.
- **Queue:** each department has a priority queue holding at most 3 lines. It lives in memory only and isn't saved. A line that waits more than 10 min, or is still queued when the app is hidden, expires, except a high-priority line, which is written to `manager.reportCarry` and shown in the next Gobbo report instead.
- **Write the line for when it lands.** Because lines wait for calm, a line about an intense moment (a Frenzy, a battle, a cascade) is written in the past tense ("That FRENZY! Do again!"), and a department leaves a hazard out of `isIntense` when its tip has to arrive while the hazard is still on screen (02 §18, R4-13).
- **Never during intense moments.** Each department exports `isIntense(state)`, and a line waits until it has been false for 2 s. Each §18 defines it, and the §18 is authoritative; in summary: Mines: Frenzy, a lit keg, or ≥ 5 taps in the last second. Dungeon: a Champion on the field, a thief chase, or a Glare or Trapdoor aim. Bridge: a drag or a verdict hold. Styx: the hook window or reeling. Spire: a cascade or the brim warning. Cauldron: within 1.5 s of a Toss or Ladle. War Pit: a battle animating.
- **One bubble at a time.** Onboarding and micro-lessons suspend the queue.
- **Settling-in grace:** in the first 30 s after entering a department, only `return_*` and `legend_arrives` may speak.

#### 5.4.5 Presentation and chattiness

- **Portrait:** 32×32 px pixel art with a 1 px outline and **5–6 expressions** per manager (listed in each §18), plus a 2-frame talk flap and a blink. A 16×16 mini-portrait is derived from it for the report and the Throne Room.
- **Manager strip:** a 160×32 px strip slides in from the left in 150 ms: the portrait on the left and the bubble (≤ 124×32 px) on its right. By default it docks **over the HUD rows at y 16–48** (x 0–160, so ⌂ stays uncovered). Each spec's §18 names its dock. The strip never covers the department's interactive core (the rock wall, the peg board, the flask, the clue strip, the line, the river's hook zone), the drawer or the bottom thumb zone.
- **Input (R4-03): the whole strip, bubble included, is pass-through.** Some HUD rows hold controls (the Mines' depth lever, the Cauldron's [≡]), so a bubble that took taps would block them for 3–4 s. Any touch that lands under the strip goes to the game *and* collapses the bubble to the 32×32 portrait (x 0–32) for the rest of that line. When an onboarding beat's highlight target lies under the bubble, the bubble starts collapsed, with the line beside the highlight as a 1-row caption. A spec keeps its controls in that row at x ≥ 40 so the portrait never hides them. The only hit targets are 12×12 **chips** at the bubble's bottom-right corner: **Skip** during onboarding and **✓** on a `struggle` offer (R4-15). A §18 dock must place that corner clear of controls.
- **Bubble content (consistent with README decided OQ 15 and OQ 27):** every line carries **1–3 icons** from the shared icon atlas (currencies, helpers, dials, hazards, Goods; every currency has its own glyph, so a bubble never shows one icon meaning two things, R4-11) and a **gibberish voice**: a per-manager WebAudio syllable synth with no recorded voice-over, so there's nothing to localize. Six managers also show a **short readable line of ≤ 32 characters** (two rows of the pixel font). That matches OQ 15, which already gives every head one readable flavour line in Gobbo's report. **Grumm is the exception:** his bubbles are **icon-only** in the Bridge, as decided in OQ 27, and they rise from his in-scene sprite instead of the strip (06 §18). Gobbo "translates" him in the report and in the Manager log.
- **Timing:** a bubble auto-dismisses after `2.5 s + 50 ms × characters` (3 s if icon-only). Any touch under it collapses it early. During onboarding, the Skip chip ends the script. A `struggle` bubble carries its one-tap offer on the ✓ chip; letting it expire or touching elsewhere declines it, and the offer comes back no sooner than the trigger's 30 min cooldown.
- **Sound:** the gibberish ducks under the music at the `managerVoice` volume. Muting the voice leaves the bubbles.
- **Manager log:** Settings → Managers lists the last 20 lines per department as readable text (Grumm's as Gobbo's translation).

**Chattiness** (Settings → Managers; one suite-wide setting):

| Setting | Shows |
|---|---|
| **Full** (default) | every trigger, including `ambient`, `commendation`, `first_upgrade` and the tips for skipped beats |
| **Milestones only** | `mechanic_unlocked`, `tier_reached`, `dial_raised` (new max only), `hazard_first`, `struggle`, `infamy_50`/`infamy_100`, `legend_arrives`, `fall`, `return_*`, `goods_link` |
| **Off** | no unprompted bubbles. Onboarding and micro-lessons start as a "Show me / Skip" prompt. Throne cameos still peek, silently. Gobbo's report keeps its one flavour line per department (decided OQ 15), because it's part of the report, not a bubble. |

#### 5.4.6 Data model

Lines are **data, not code**. Each department has `content/managers/<dept>.json`, with readable text in locale files.

```ts
type TriggerType = 'onboarding'|'first_upgrade'|'first_helper'|'tier_reached'|'mechanic_unlocked'|'dial_raised'
  |'hazard_first'|'struggle'|'commendation'|'infamy_50'|'infamy_100'|'legend_arrives'|'fall'
  |'return_after_fall'|'return_long_absence'|'goods_link'|'report'|'ambient';
interface ManagerLine {
  id: string;                     // 'mines.drum.bought.1'
  trigger: TriggerType;
  when?: Condition[];             // predicates on the event payload and department state, e.g. {key:'stratum', op:'==', value:'stone'}
  expr: string;                   // expression key, e.g. 'starEyed'
  icons: IconId[];                // 1–3
  text?: string;                  // locale key; omitted for icon-only lines (all of Grumm's)
  priority: 'guided'|'high'|'medium'|'low'|'ambient';
  repeat: 'oncePerSave'|'oncePerCycle'|{ cooldownMin: number };
  minChattiness: 'full'|'milestones';
  weight?: number;                // among eligible variants; unseen variants always go first
}
interface OnboardingScript { id: string; dept: DeptId; beats: Beat[] }   // 'mines.intro', 'mines.drum'
interface Beat { line: string; highlight: TargetId; ghost?: Gesture; done: Condition; spawn?: ScriptedSpawn;
                waitFor?: Condition }  // R4-06: beat starts only once this holds (e.g. node affordable)
interface ManagerSave {           // DeptSave.manager (§9); never reset by a Fall
  onboarding: Record<string, 'done'|'skipped'|number>;   // script id → state, or the beat index in progress
  pendingTips: string[];          // beat ids skipped, to return as one-line tips when they first matter (Full only)
  seen: Record<string, number>;   // line id → times shown (oncePerSave lines, variant rotation, once-per-save cameos)
  cycleSeen: string[];            // oncePerCycle line ids and this cycle's Throne cameo ids; cleared on Fall
  lastLineAt: number;             // per-department rate limit
  lastEnteredAt: number;          // detects the first entry after a Fall or an absence
  greetPending: null|'fall'|'absence';   // set by a Fall or by a ≥ 8 h app absence, cleared on the next entry
  reportCarry: string|null;       // a missed high-priority line for the next Gobbo report (§5.4.4, §5.4.7)
  log: string[];                  // last 20 line ids, for the Manager log
}
```
- `ManagerDirector` is a pure function, `(event, deptState, managerSave, managerClock, settings, now) → { show?: lineId, save' }`. The sim runs it (the onboarding band, §8.1), and unit tests assert the rate limits and queue rules.
- **Content lint (CI):** readable lines ≤ 32 characters, 1–3 icons per line, no `text` on Grumm's lines, every trigger a §18 table lists has at least 2 variants, every expression key exists in the atlas, and no two currencies share an icon id.
- **Absence is app-level:** `return_long_absence` means ≥ 8 h since `SaveRoot.lastSeen`, not since the player last opened that department, so a department the player simply skipped for a day doesn't greet them as if they'd been away.
- **Volume:** about 50 strings per department at launch (an onboarding script, 1–3 micro-lessons, 8–12 triggers × 2–3 variants, 6 report lines and 6 ambient lines). The save cost is about 1–2 KB per department.

#### 5.4.7 Gobbo's report

- Each department's line in the report comes from its manager's **`report` pool**. The line is picked by context: the haul against the last report, the highlight, `legendWaiting`, a hit offline cap, or a Fall. Unseen variants come first.
- A **high-priority line that expired in the queue, or that fired while the department was off screen** (`legend_arrives`, `infamy_100`, a `mechanic_unlocked` becoming affordable; held in `manager.reportCarry`) replaces that department's flavour line.
- **No double greeting (R4-14):** after an absence of ≥ 8 h, the manager's `return_long_absence` line *is* their report line. On entering the department afterwards they only wave (the expression flashes in the strip without a bubble), so the same greeting never shows twice. That's at most one line per manager, so the report stays one line per department (OQ 15).
- Each line shows the manager's 16×16 mini-portrait with the line's expression. Grumm's line is Gobbo's translation in italics: *"Grumm says: many coins. Grumm proud."*

#### 5.4.8 Throne Room cameo

- **Peek:** when a department has a pending high-priority event (a Legend waiting, Infamy at 100%, a new mechanic ready to buy such as the Mines' Doom Drum), its manager's 16×16 head peeks out of that door for 2 s, the first time the Throne Room is shown after the event (once per event: per-cycle events are recorded in `cycleSeen`, once-per-save ones such as the Doom Drum in `seen`). It's a personable twin of the door's priority badge (D-25), not a replacement. Tapping the head enters the department, like the door.
- **Daily word:** once per real day (Full only, `managerClock.lastThroneCameoDay`), the manager with the most recent milestone delivers one bubble beside the throne (Ledger-Bones: "Skull count up 12%, My Liege.").
- **The Fall card:** on the Sacked & Avenged card (§2.3), the department's manager stands in a corner, *alarmed* during Sacked and *triumphant* after the Crush, with one `fall` line.

#### 5.4.9 Scope

- **v0.1:** the director, the strip, the gibberish synth, the line pipeline and lint, Settings → Managers (chattiness, voice volume, replay, log), the report integration and Throne cameos, plus **Granny and Gritch** with their onboarding scripts and the Doom Drum micro-lesson.
- **Each later department ships its manager with its MVP:** 5–6 expressions, a 32×32 portrait, the mini-portrait, a voice preset and ~50 lines.
- **Later (v0.7+):** two-manager exchanges in the Throne Room, manager cosmetics, and seasonal lines (Halloween 2026-10-31).

---

## 6. Unlock order, progression arc and build phases

**Starter: The Cauldron** (the user's decision: "Plinko it is"). It has the lowest skill floor, it's instantly legible, and it's idle-native. The Dungeon is the flagship but comes third, once the player knows the meta, which keeps the TD tutorial out of the first 60 seconds. The order alternates intensity: chance → smash (with rhythm as its first big upgrade, 02 §6E) → strategy → judgment → timing → physics puzzle → drafting. It also matches tech risk, since Matter.js (Spire) ships last among the first six.

**Why the War Pit is seventh (and last):**
- **It's a meta-literate department.** Runs, Stakes tactics cards, Crests and stationing pay off most for a player who already understands Infamy, Falls and Dread. Its opponents are rival beast warbands built from its own roster (07 §5.2), so it borrows nothing from the Dungeon's heroes (W-24).
- **Strategy is spread out.** The two strategy departments (Dungeon #3 and Pit #7) sit as far apart as possible, so the run-based drafter lands as a fresh change of pace in week 2, when the first six have settled into cycles.
- **Its Goods are live on arrival.** The Pit imports Souls (#5) and Essence (#6), so both of its lines open the day it does. Captives then give the early Dungeon and Bridge a late-game boost.
- **Shipping is cheap.** The other six Seals, Dread gates and releases don't move. The Pit has low tech risk but the largest content and bot surface, so it ships as its own release.
- *Rejected:* slotting it at #5. That would re-index two Seals and both Dread gates, open the Pit with both import lines hidden, and put two strategy departments back to back in the order.

| # | Department | Seal cost (provisional) | Extra requirement | Reference time |
|---|---|---|---|---|
| 1 | Cauldron | — | — | 0:00 |
| 2 | Goblin Mines | 60 Tribute | — | ~0:10 |
| 3 | Dungeon | 400 | — | ~0:40 |
| 4 | Troll Bridge | 4,000 | — | ~1:45 |
| 5 | River Styx | 25,000 | lifetime Dread ≥ 10 (any first Fall) | day 2 |
| 6 | Sorcerer's Spire | 150,000 | lifetime Dread ≥ 60 (two first Falls) | day 4–5 |
| 7 | War Pit | 600,000 | lifetime Dread ≥ 150 (about four to five Falls) | day 6–8 |

The balance simulation sets the final Seal prices. Lifetime Dread is the binding gate for departments 5–7 by design (decided, README OQ 6). Dread requirements are thresholds on *lifetime* Dread, never spent, so unlocking never competes with perks. A single maxed first Fall pays 56, so the Spire always needs two departments to have fallen. The Pit's 150 sits inside the first-week band (120–200 lifetime Dread), so the reference player opens it late in week 1.

**Late Recruit catch-up:** a newly unlocked department earns ×2 local income until its Rank reaches 60% of the average Rank of the others. It doesn't stack with Rebuild Rush.

**Reference player:** day 1 has 90 min active. After that, about 50 min/day active (3×10 min + 1×20 min), with the rest offline.

- **First hour:** Cauldron tutorial (Granny's onboarding, §5.4.2), with the first toadling at 0:45 and Center Jackpot I at about 4 min. The Mines open at about 10 min (Gritch's onboarding), and the Doom Drum is affordable after ~20–30 min of Mines play. Malice I is affordable at about 20 min. The Dungeon opens at about 40 min.
- **First day:** Bridge at about 1:45. By bedtime the Cauldron's skill gate is about done and its economy gate is 60–80%. The first overnight report shows 3–4 departments.
- **First Fall: Cauldron, about 3–4 h active-equivalent, typically early day 2.** The economy gate and the Malice prices guarantee this (fixes B2). It pays about 20–40 Dread and unlocks the Styx. The Mines Fall second (day 3) and the Dungeon third (day 4).
- **First week:** the first 6 departments open by day 5, the War Pit by day 6–8, 5–7 Falls, about 120–200 lifetime Dread.
- **Weeks 2–4:** each department cycles every 1.5–3 real days (never > 5). With seven staggered departments, a Legend is waiting somewhere roughly daily.

### 6.1 Build phases (fixes B4)

| Phase | Est. (solo) | Ships |
|---|---|---|
| **v0.1** | 8–10 wks | Shared core (save module, clock, `offlineRate` interface, `formatNum`, headless balance simulation in CI, §8.1). Throne Room: Tribute, Seals, Dark Banners, Curfew Bells, Treasury, Satchel L1, Gobbo report. **Manager system** (§5.4: director, onboarding runner, bubble strip, gibberish synth, line data, settings). **Cauldron + Goblin Mines** at their MVPs, with Granny and Gritch. Falls with a static Sacked & Avenged card. Dread: Iron Fist, Tithe Collector, Long Reach, Idle Hands, Ruinborn. 8 Commendations per department. |
| v0.2 | 8–10 wks | **Dungeon** MVP (flagship; fixed path + Bait Chests). |
| v0.3 | 6–8 wks | **Troll Bridge** MVP. **Goods**, Requisitions, Black Market, Imperial Roads. |
| v0.4 | 4–6 wks | **River Styx** MVP. |
| v0.5 | 6 wks | **Sorcerer's Spire** MVP (Matter.js; prototype the T11/Singularity geometry during v0.1). |
| v0.5.5 | (inside v0.6's estimate) | **War Pit engine milestone** (internal, no UI): the deterministic battle engine (§14.2 contract), the draft bot at three tiers, rival ghost drafting, golden tests. Tuning starts before the art (W-16). |
| v0.6 | 10–12 wks | **War Pit** MVP (`07-war-pit.md` §15): shop, Skirmish Gauntlets, Stakes 0–20, Bestiary, Pedigrees. Captives export with Node 1 of its two import lines in the Dungeon and the Bridge, plus Node 1 of the Pit's Souls and Essence lines. The draft bot joins the balance simulation, calibrated against exported playtest logs. |
| v0.7+ | — | Return rituals, wings expansion (Head Start, Legend's Bane, Signatures, Swift Rebuild), Steward, Edicts, Trophy Hall bonus, interactive Last Stands, each spec's "v1.1/Later" content. |
| Out of scope (decided) | — | Cataclysm (OQ 2), monetization (OQ 1: none), push notifications (OQ 5: none at launch; the Gobbo report covers it). |

Until a department ships, its door is drawn as a boarded-up "Under Construction" door, and Seal costs re-index so the next shipped department is always the next purchasable one.

---

## 7. Offline rules (suite-wide)

| Rule | Value |
|---|---|
| Base offline cap | **8 h**, every department |
| Throne *Curfew Bells* | +8 h → 16 h |
| Dread *Long Reach* | +8 h → **24 h max** |
| Local offline-cap or offline-efficiency nodes | **None.** They were removed from all department specs (D-14, m3), and 07 never had any. |
| Offline factor | One shared constant: **0.6 × on-screen idle rate**. Idle Hands adds +0.05/L. Iron Discipline adds +0.1. The **hard cap is 0.9** and is enforced in the shared core (M2). |
| Present but no input | After 10 min with no input, time counts as offline time against the cap and pays the offline factor (m4). |
| Tribute | accrues at the offline factor, with its own Treasury cap (8 → 24 h) |
| Goods | passive rates (§4), using each department's cap |
| Infamy | **never** advances offline. Only the economy gate fills from offline earnings. |
| Clock | One shared save clock: `elapsed = clamp(now − lastSeen, 0, 7 days)`. If the clock moves backward, elapsed = 0 and lastSeen resets (no penalty). A monotonic `performance.now()` is used while running. |

**Simultaneity:** while the player is in department A, departments B–G accrue their closed-form `idleRate` (at 1.0, not the offline factor, because the player is present) every 1 s tick. Nothing off-screen is simulated frame by frame. The Spire freezes its flask when not viewed. Department A runs its live sim. On app hide, every department switches to offline accounting from the same timestamp. The Dungeon's sim rates, the Cauldron's EV cache and the War Pit's Skirmish Gauntlets are recomputed when layout, warband, upgrades or the dial change, never on a timer and never on hide. The War Pit's Skirmishes pause while a Run is on screen; a Run left with no input for 10 min falls under the present-but-no-input rule above, so Skirmishes accrue at the offline factor.

**Required interface:** every department exposes a pure `idleRate(state): {local, goods}` (its on-screen idle rate). The core applies the offline factor and the caps. It's used for the report, Rank, background accrual and the balance simulation. Each department also supplies the simulation's bot policies (§8.1), and the sim *measures* `activeMult` from them. No department hand-states its active multiplier.

---

## 8. Balance model

**Curves:**
- Local costs grow geometrically, 1.08–1.9 per level. Any infinite or long node must have cost growth ≥ its effect growth (B3).
- The dials grow reward at roughly 1.15–1.35 per step against 1.15–1.2 difficulty, and every dial level now costs local currency. Reward per step must be **multiplicative**: a linear payout (e.g. `1 + 0.25·M`) falls out of the band as the dial climbs while geometric prices keep rising (W-01). Each department's dial is held to the step-cost band in §8.1.
- Tribute grows polynomially in Rank (^1.5). Throne costs grow geometrically (1.6–2), so the hub is a slow, steady layer that never runs away.
- Dread grows linearly with the Fall count and with (Infamy)^1.5. Economy floors grow ×3 per Fall. Perk costs grow 1.4–2.2.

**Baseline** (for every "active : offline" target): a department's state 30 min or more into a cycle, with the Throne and Dread upgrades the reference player would own at that point. During a cycle's first 30 min the ratio may run higher, because the helpers aren't bought yet. The baseline offline factor is the one the reference player has **at that department's own unlock time** (W-11), computed by the sim, not a flat 0.6: roughly 0.6 for departments 1–4, 0.65 for the Styx, 0.7 for the Spire and 0.75 for the War Pit. Each department's on-screen target is stated against its own factor.

**Visible-milestone rule (D-15):** any node with more than 10 levels must change something *visible* every 5 or 10 levels (a new particle, a sprite swap, an extra lane). Each spec lists its milestone visuals or inherits this rule.

**Milestone targets (reference player):**
| Milestone | Target | Tolerance |
|---|---|---|
| First upgrade in any new department | < 60 s | hard |
| Something affordable on every return > 15 min | 100% | hard |
| Department 4 open | ≤ 2 h | ±30 min |
| First Fall | 3–4 h active-equivalent | ±1 h |
| Any department cycle | ≥ 2 h | hard |
| Department cycle length, weeks 2–4 | 1.5–3 days | ≤ 5 days |
| Import lines for a Good maxed | ~12 days after the exporter unlocks | ±4 days |

**Anti-domination:**
1. Local currencies never convert.
2. Tribute is log-normalized per department and diminishes per department.
3. Dread depends on Infamy %, not on income magnitude.
4. Every Fall has an economy gate that grows ×3 per Fall, so no department can be farmed (B1).
5. Goods are linear, capped integers.

**Headless balance simulation:** see §8.1. It replaces revision 2's "balance script" everywhere in specs 00–07.

**Inflation control and numbers (m1):**
- Falls reset local numbers. A local currency stays under 1e30 within a cycle.
- **All currencies use plain JS `number`** (doubles), so there's no Decimal library. Tribute stays < 1e9 and Dread < 1e6 through year 1.
- Display rounds to 3 significant figures: `999`, `1.23K`, `45.6M`, `789B`, `1.00T`. After T comes `aa` (1e15), `ab`, … `az`, `ba`, … There's a settings toggle for scientific notation (`1.23e18`).
- One `formatNum()` lives in the shared core and renders in the pixel BitmapText font. Every spec uses it.

---

### 8.1 Simulation-driven tuning (decided policy)

**Policy (user decision, 2026-10-21): fine-tuning is done by simulation, in the long run and from v0.1.**

1. **All numbers are starting points.** Every cost, rate, curve exponent, Seal price, floor `E0_d`, dial coefficient and unit stat in specs 00–07 is a seed. What the specs actually commit to are the **targets and bands** (table below, plus each department's own bands). When a seed and a band disagree, the band wins.
2. **The simulation is the authority for tuning.** Tuned constants live in one file, `balance/params.json`, which the game and the sim both read. Changing a constant means a params diff plus a sim report in the same PR. It never means editing the spec. Specs change only when a *band* or a *mechanic* changes. Playtest feedback moves bands, and the sim then moves the numbers.
3. **Specs record bands, not numbers, where possible.** New or revised spec text states a target ("first upgrade < 60 s", "active ≈ 3–5× offline") and marks constants as seeds. 07 §14.1 is the model for a department's bot and local bands. Specs 01–06 use the bot table below until each adds its own sim subsection.

**Harness.** `sim/` is a Node/TypeScript runner that imports the **same pure modules the game ships** (no Pixi). It has **two layers** (W-13), because running every live core for every simulated active minute (millions of physics steps) can't fit a CI budget:

1. **Local sims.** Each department's live core plus its bots produce `activeRate(state)` and `idleRate(state)` tables over a grid of department states (tree levels, dial, imports). Cores: the Cauldron's CRN particle board (20K tuples), the Mines' tap, beat and regrowth model (tables for both drum states, 02 §13), the Dungeon's 20 Hz path sim (3 seeds), the Bridge's traveler and haggle model, the Styx's bite and tension model, the Spire's headless Matter.js flask, and the **War Pit's deterministic battle engine** (the same module the game and its Gauntlet Worker use, 07 §14.2). Tables run nightly and are cached as CI artifacts keyed by the params hash and the core's code hash.
2. **Meta sim.** The 30-day, 5-profile simulation of Tribute, Infamy, Dread, Goods, offline and the save clock. It reads active rates from the cached tables (interpolated) and calls each department's exact `idleRate` module directly.

Everything is seeded and uses common random numbers, so a params change is compared against the same dice.

**Bots and policies.** Each department ships, with its MVP, one **active bot** run at three skill settings (novice / reference / expert, which set reaction noise, accuracy and decision quality) and one **idle buyer** (Gobbo's "Ready" ranking: Δ`idleRate`/cost, honouring §5.2's Steward exclusions).

| Dept | Active bot (reference skill) |
|---|---|
| Cauldron | Tosses into the chute with the best Scrying EV; Ladles on the hottest pegs each cooldown |
| Mines | 6 taps/s targeting veins, kegs and clusters; once the Doom Drum is owned, one judged tap per beat landing 85% of the time plus free follow-ups, and Frenzy when available (every state in 02 §3 must sit in band, drum-off later cycles included; a no-timing masher must earn ≤ 85% of it) |
| Dungeon | Rebuilds from a library of scripted layouts; Bait Chest heuristic; Glare and Trapdoor with 300 ms reaction; Gong on perfect waves |
| Bridge | Deduction at p(correct) by skill, haggles to the Wallet Sense band, Unmasks only with ≥ 2 tells |
| Styx | Hook-set with a reaction-time distribution; tension held in band with noise; casts to the best depth |
| Spire | Greedy merge-adjacency aim at 30 drops/min |
| War Pit | Draft bot from 07 §14.1 (novice/reference/expert = 0/8/64 simulated candidate lines per shop, with a shop-time model) |

The bots drive five **player profiles** across 30 simulated days: **reference** (§6 schedule), **idle-only** (two Collect All visits a day, buys "Ready"), **grinder** (3 h/day active), **single-department main** (plays one department only; for departments 5–7, which need lifetime Dread from elsewhere, it starts from a fixture save of the reference state at that department's unlock, W-23), and **lapsed** (day 1, then 3-day gaps).

**Metrics and bands** (hard = fails CI; soft = flagged in the report):

| Metric | Band | Level |
|---|---|---|
| Active : offline per department at baseline (§8 baseline state) | 3–5×, drifting to 2.5–3× late | hard (drift soft) |
| Effective offline factor | ≤ 0.9 | hard |
| First upgrade in any new department | < 60 s | hard |
| Something affordable on every return > 15 min | 100% | hard |
| Time to first Fall (reference) | 3–4 h active-equivalent ± 1 h | hard |
| Any department cycle | 2 h – 5 days; 1.5–3 days in weeks 2–4 | hard / soft |
| Unlock times | §6 reference times ± 30 min (depts 2–4) or ± 1 day (depts 5–7) | soft |
| Dread pacing | 120–200 lifetime Dread at day 7; Dread/day in weeks 2–4 within ±25% of the locked baseline | hard / soft |
| Income share | no department > 35% of Tribute or of Dread at day 7, or > 30% at day 30 (about 2× an equal 1/7 share) | hard |
| Single-department main | reaches its first Fall within 1.5× the reference player's time in that department; whole tree reachable | hard |
| Idle-only | every unlocked department's income grows on every visit; no Infamy from offline | hard |
| Goods | a Good's two lines max ~12 days after the exporter unlocks (± 4) | soft |
| Fall reachability | every Fall #0–#5 target reachable inside the shipped dial range | hard |
| Rebuild | previous 100% regained in ≤ 35% of the previous cycle's time | soft |
| Dial step cost | buying dial level k+1 costs ≈ 25–60 min of reference income at level k, across each MVP range (W-01) | hard for the War Pit; soft elsewhere until each department's audit (the Bridge's linear `payout_mult` first) |
| Late-import pacing | an import line whose Good predates its importer (the Pit's Souls and Essence lines) maxes no sooner than 5 days after unlock (W-19) | soft |
| Goods graph lint | parsed from every spec's §16 and 00 §4: 7 exporters, 14 links, exactly 2 importers per Good (W-10) | hard |
| Department-local | each spec's own bands (e.g. 07 §14.1: Triumphs in 35–50% of Runs at the target Stakes; 02 §3: the Mines' ratio before and after the Doom Drum) | per spec |
| Onboarding | every department's scripted first session reaches its first upgrade in < 60 s, with the reference bot run through the real onboarding script (§5.4.2) | hard |

**Tuning loop.** Constants marked `tunable` in `params.json` carry a range. `npm run tune` runs a bounded coordinate search that pulls the metrics toward their band centres and opens a PR with the params diff and the before/after report. It never auto-merges, and a human reviews every PR.

**CI.**
- **Every PR (fast tier, ≤ 5 min):** the meta sim (reference profile, 30 days, 3 seeds) on the cached local tables, plus local smoke runs only for departments whose code or params changed (War Pit: 100 Runs at the Infamy-target Stakes with the reference bot). Golden determinism tests: the same seed gives identical output, and **fixture saves from release N−1 produce identical `idleRate` under release N's code at the same `paramsVersion`** (the sim and game share one module, so "sim matches game" is true by construction, W-13). Engine-speed assertions (War Pit ≤ 0.05 ms per battle). Hard bands fail the build.
- **Nightly (full tier):** rebuilds the local tables, then all 5 profiles × 30 seeds × 30 days. The War Pit gets 2,000 Runs at each Infamy target level and 200 at every other Stakes level, sharded across workers (07 §14.1), and the Dungeon covers its whole layout library. It publishes an HTML report with trends to the CI artifacts, and soft-band drift opens a tracking issue.
- **Calibration:** GitHub Pages has no server, so bots are anchored to humans through a local **Export playtest log** (Settings) that playtesters send by hand (07 §14.1). Bot skill knobs are fitted to those logs; playtests move bands, the sim moves numbers.
- From v0.1 the sim covers the shipped departments only. Each later release adds its department's core, bots and bands **before** that department can merge.

---

## 9. Save data model (fixes M8)

- **One save module, one format,** used by every department. No department writes storage directly.
- **Storage:** IndexedDB (via `idb-keyval`) as the primary store. A **synchronous localStorage mirror** of the whole `SaveRoot` is written on `pagehide` and `visibilitychange: hidden`, since the save is < 60 KB. On load, the newest valid copy of the two wins.
- **Write cadence:** autosave every 10 s, on hide, after any Fall, and after any purchase over 10% of the bank.
- **Two rotating IndexedDB slots (A/B)** with a checksum.
- **Single writer:** take a Web Locks lock (`navigator.locks.request('overlord-save')`) with a BroadcastChannel fallback. A second tab shows "Open in another tab" and neither credits offline time twice.
- **iOS eviction:** iOS Safari can delete storage after 7 days without use unless the app is installed. Prompt "Add to Home Screen" before the first Fall. When the app isn't installed, nag weekly for an Export. Call `navigator.storage.persist()` on the first Fall.
- **Settings → Export/Import:** a base64 gzip string as a manual backup.

```ts
interface SaveRoot {
  schema: number;                 // root version, migrations[schema] chain
  savedAt: number; lastSeen: number;  // ms epoch, shared clock
  meta: {
    tribute: number; tributePeak: number;
    dread: number; dreadLifetime: number;
    goods: Record<GoodId, number>;
    throne: Record<ThroneUpgradeId, number>;
    dreadPerks: Record<string, number>;      // "empire.ironFist", "mines.ruinborn"
    commendations: Record<DeptId, number>;   // bitmask
    trophies: LegendRecord[];
    edict?: { id: string; target?: DeptId; since: number };
    settings: { notation: 'suffix'|'sci'; leftHanded: boolean; haptics: boolean; sfx: number; music: number;
                chattiness: 'full'|'milestones'|'off'; managerVoice: number;    // §5.4.5
                audioLatencyMs: number; steadyDrum: boolean; holdToAutoHit: boolean };  // 02 §6E, §10 (R4-05)
    managerClock: { lastLineAt: number; lastThroneCameoDay: string }; // suite-wide rate limit, §5.4.4
  };
  depts: Partial<Record<DeptId, DeptSave>>;  // absent = locked
}
type DeptId = 'cauldron'|'mines'|'dungeon'|'bridge'|'styx'|'spire'|'pit';
type GoodId = 'potions'|'ingots'|'bones'|'contraband'|'souls'|'essence'|'captives';
interface DeptSave {
  v: number;                      // per-department schema version, own migration chain
  unlockedAt: number;
  cycle: { n: number; startedAt: number; earnings: number; heldLevel: number; legendWaiting: boolean };
  lifetime: { peakRank: number; falls: number; best: Record<string, number> }; // e.g. maxDepthEver, lifetimeBounties
  imports: Record<string, number>;// persistent across Falls
  manager: ManagerSave;           // persistent across Falls (§5.4.6)
  persistent: unknown;            // rare tokens, codex, blueprints (department-typed)
  run: unknown;                   // reset on Fall (department-typed)
  cache?: { idleRate: number; hash: string }; // hash covers the department's state, imports and paramsVersion (W-08)
}
```
- **Migration:** pure functions `(old) => new`, one per version step, run in order and unit-tested with fixture saves.
- **Fall:** `run` and `cycle` are replaced with defaults (`cycle.n` carried +1), while `persistent`, `lifetime`, `imports` and `manager` are untouched (only `manager.cycleSeen` is cleared). That makes the Fall a one-liner that can't accidentally keep or wipe the wrong data.
- **Size:** under 60 KB total. The War Pit's `run` (including a paused Run) is about 2 KB.
- **New departments** add a `DeptId`, a `GoodId` and their own `DeptSave.v` chain. The root `schema` bumps once per release, so v0.6 saves gain `pit` lazily (absent = locked).

---

## 10. Anti-frustration

- **No monetization, ads, energy or wait-gates** (decided, README OQ 1). Every department is playable at any moment.
- **Falls are opt-in**, Infamy never decays, and banked meta currencies never drain. Local losses stay capped and recoverable, as in the specs.
- **No mandatory department:** imports ≤ +18%, the Black Market backstops Goods, and Tribute is log-scaled. The War Pit never ends a Run with a loss of banked Teeth.
- **Late Recruit** ×2 and **Rebuild Rush** ×3 shorten slow starts. Every Dungeon cycle starts with a starter kit. The report states when an offline cap was hit.
- **Seasonal content is cosmetic only** (e.g. Halloween 2026-10-31 skins).

---

## 11. Required changes to game specs — status: APPLIED (revisions 2, 3 and 4)

Every change below has been made in the game specs. The full finding → outcome table is in `README.md`.

**Revision 4 (user decisions, 2026-10-21):** 02 rewritten: plain tap-to-mine core; the Doom Drum branch (§6E) with Drumhead, Wide Swing, Goblin Frenzy, Frenzy Fuse, Drummer Goblins and later companions; the pre-drum active edge comes from tap power, crits, focus, kegs and any-tap Chain Lightning; a two-state ratio band; the Infamy gate never needs the drum; Stamina Stew re-specified (here §4 and 02 §16). Managers: §5.4 added here, `ManagerSave` in §9, an onboarding band in §8.1, and a §18 "Manager" section in every spec 01–07. The "Mines = beat-tapping" contrast lines in 01, 03, 04, 05 and 06 now read "tap-to-mine, with rhythm as an upgrade".

**Revision 4 review (`review-rev4.md`, R4-01…R4-23):** here: §2.4 and §3 list the Drum Circle; §5.4.2 waiting beats and 1–3 beat micro-lessons; §5.4.3 `dial_raised` thinned; §5.4.4 queue persistence and past-tense lines; §5.4.5 fully pass-through strip with chips; `ManagerSave` gains `pendingTips`, `lastEnteredAt`, `greetPending` and `reportCarry`; settings gain the drum's latency, Steady Drum and hold-to-auto-hit. In 02: one judged tap per beat, Frenzy pips, crit caps, drum-off band coverage, Tempo Lever kept through Falls, a 5-beat intro plus a keg micro-lesson. In 01, 04, 05 and 06: icon and personality fixes, Grumm's bubble moved off the Mood Face, a misfiled trigger.

**Revision 3 (seven departments, simulation policy, ratified defaults):** 01 imports Ingots + **Captives** (Souls dropped) and exports Bones to the Mines and the Bridge. 06 imports Bones + **Captives** (Essence dropped). 03 exports Souls to the Spire and the Pit. 04 exports Essence to the Cauldron and the Pit. 07 imports **Souls + Essence**, not Bones + Potions, and its Goods and Seal questions are resolved. Every §17 in 01–06 is "Decided"; 07 §17 lists its decided items and the three new questions (README OQ 35–37). All "balance script" references point to §8.1.

**Revision 3, War Pit review (W-01…W-26):** 07 rewritten to revision 3 (rival warbands, 8-win Runs, Gauntlet idle, multiplicative Stakes, engine contract, card grid). 00: two-layer harness, per-unlock offline baseline, dial step-cost band, Goods lint, Seals max 7, v0.5.5 milestone and v0.6 at 10–12 weeks, Captives softened. 01 and 06: Caged Bait and Pillory softened, Bones importers corrected. 03 and 04: on-screen targets restated against their unlock-time offline factor.

| Spec | Applied |
|---|---|
| All | `idleRate(state)` interface; Commendations (8 at launch); shared `formatNum` with plain numbers; ⌂ navigation, no edge swipes; offline cap 8 h with no local cap or efficiency nodes; shared offline factor; Infamy, Fall and keeps per §2.2–2.4 with purchasable dial levels; Goods per §4; return ritual (v1.1); department-unique minion species; the player is always the Overlord acting through the department head. |
| 01 Dungeon | Deeper Vault removed; export is **Bones**; blueprints survive; Lure bought per tier, MVP 0–40; starter kit each cycle; offline sim at 20 Hz on 3 seeds, recomputed on layout/upgrade/Lure change only; Bait Chests + side loops (MVP) and mazing (later); Trapdoor and perfect-wave Gong; preview moved to HUD; Glare target snapping; skeleton clerk; visible milestones and level caps on Workshop nodes. |
| 02 Mines | Sharper Picks, Dig Deeper and Tap Damage curves fixed; regrowth ceiling in both live and offline formulas; slacking penalty, Lunch Breaks and Long Shift removed; Frenzy becomes a beat mechanic (revision 2; since revision 4 the beat and Frenzy live in the Doom Drum branch, 02 §6E); rake does 25%; Gems re-paced; MVP depth 1–60; `maxDepthEver`; Ingots from veins/Motherlodes. |
| 03 Styx | Night Shift removed; Wrath in MVP, bought per level, idle scaling 1.10^W; twitch is a line drag with a visible nibble state; active rate recomputed (6/min); reel hold zone y ≥ 200 with tension on the line; the Overlord fishes, Pilk runs the Imp Netters (imps are now unique to the Styx); auto-sell kept. |
| 04 Spire | Radii re-curved (T11 = 46% of the width); EV formula corrected; apprentices work a separate Apprentice Flask; drop cadence target 25–35/min with drag-to-aim default; Resonance from chain depth; offline drop cap; Distillery and Hourglass removed; edge swipe removed; §12 Cauldron description fixed; Volatility bought per level, MVP 0–10, Feat snapshot rule. |
| 05 Cauldron | Starter department; verb changed to **steer the flow** (Toadlings pour, the player Tosses into chutes and sets Ladle pegs); 5×5 px ingredients with distinct colours and wider spacing; one center-bucket table; Dregs capped; Malice bought with Bile, MVP 0–10; Infamy from Batches; EV cache with common random numbers (20K); Night Shift removed; Board Layouts as the persistent collection. |
| 07 War Pit | New in revision 3. Follows §2.2–2.4 (Stakes, two Pit Crowns, Crests kept), §4 (Captives; Souls + Essence imports), §5.1 (Rank from the exact Gauntlet `idleRate`), §7 (no local offline nodes) and §8.1 (draft bot tiers, deterministic engine shared with the sim). |
| 06 Bridge | Contradiction-based deduction (claims, Wanted Poster, Menace rule cards); bounty scales with evidence; false accusation breaks the Streak; clue crops instead of icons; large-part tells only; 0.1× haggle notches; verdict hold-buttons; fixed traffic with a queue; Menace bought per level, MVP 0–20; Hero Whisper Showdown 10× and on-screen only; Long Shift removed. |

---

## 12. Open questions

The 30 revision-2 questions and the War Pit's first four (OQ 31–34) are all **decided** with their recommended defaults (README § "Decided questions"). The only open items are the three new ones from the War Pit review (OQ 35–37), listed in README § "Open questions".
