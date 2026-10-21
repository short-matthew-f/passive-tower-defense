# 07 — The War Pit (Auto-Battler)

Status: **revision 3** (2026-10-21), after the adversarial review `review-war-pit.md` (W-01…W-26; outcomes in README). Seventh department, added at the user's request ("in the vein of Super Auto Pets"). Ships in **v0.6** as the 7th Seal, with its battle engine and draft bot built first as the **v0.5.5 internal milestone** (§15, 00 §6.1). Goods were re-planned in 00 §4 (§16). All numbers are seeds: **fine-tuning is owned by simulation** (§14.1, 00 §8.1). Where a seed and a band disagree, the band wins. **Revision 4** (2026-10-21) adds the department manager, Snarl (§18; shared system in 00 §5.4).

## 1. Fantasy & pitch

**Pitch:** *Draft a warband from the Overlord's menagerie, line it up, and watch it maul rival warlords' beasts in the Pit.*

Behind the throne room lies the **War Pit**, a sand ring lined with cages. Rival warlords send their **beast-tamers** to prove their menageries against the Overlord's; the Overlord's war-beasts are bought, fed, bred up and thrown at them. The head is **Snarl**, a scarred **gnoll** pitmaster with a whistle. His **kennel gnolls** (the department's unique species) haul cages, sling chow and run the Pit when you're away. Every beaten beast loses a few teeth, and **Teeth** are the Pit's currency.

**The player is the Overlord**, choosing the beasts, their order and their food. Battles resolve on their own and are **fully deterministic**. The skill is the shop and the line-up, never the fingers. The Overlord's power here is the **Royal Brand** (§5.4). Beaten tamers are dragged off in chains as **Captives** (the export, §16).

Opponents are **rival warbands built from the same roster and shop rules as yours** (W-04, W-05). Reading the opponent is reading a build, as in Super Auto Pets. Humans appear only as the Run's final boss, **the Huntmaster** (§5.2).

## 2. Core loop (active): the Run

A **Run** is a series of rounds against escalating rival warbands. It ends at **8 wins (Triumph)** or when **Grit** (4 hearts) runs out (W-03 short format). Target length: **6–9 min** (§14.1). A Run can be paused anywhere, indefinitely, across app closes.

Each round:
1. **Shop (untimed, target 15–30 s).** **10 Chow** (in-Run currency, discarded at round end). Buy a unit (3), buy food (3), roll the shop (1), freeze a slot (free; it survives rolls and rounds), sell (refunds 1 per level and fires the *Sell* trigger). Place units in **5 line slots**; **the front is the left slot** (mirrored in left-handed mode). Tap-tap or drag to reorder.
2. **Scout.** The next rival is shown as its tamer's archetype badge plus beast icons (stats need the Scouting upgrade). You know *what's* coming, so counter-building is a skill.
3. **Fight.** A deterministic 5–15 s battle at 1×. 2× and Skip are always available.
4. **Result.** Win: Teeth, +1 win. Draw: 70% Teeth. Loss: 40% Teeth and −1 Grit.

**The Huntmaster bout.** When you hold 7 wins, the next battle is the Huntmaster bout (§5.2). Winning it is the Triumph. Losing it costs 1 Grit like any loss, and you face the same bout again (same budget, §14.2).

**Battle rules:** the two front units strike simultaneously (damage = attack). At ≤ 0 HP a unit faints and the line slides forward. Triggers and random draws follow the engine contract (§14.2), so **the same matchup always plays out the same way**: replay, Skip, Skirmishes, offline maths and the simulation agree. **Sudden Death** (W-09): from exchange 50, all damage is +1, rising by +1 every further 10 exchanges. Mutual wipe = draw. A 200-exchange cap (draw) is a safety net only.

**Merging:** buying a duplicate onto a unit gives +1/+1 and 1 XP; **L2 at 3 copies, L3 at 6**. Abilities scale ×1/×2/×3. A level-up adds a bonus unit of the next tier (up to T5) to the next shop.

**Example (round 5).** The scout shows a *Bulwark* tamer: Rust Beetle, Gargoyle-free front, two Cave Spiders, a Stirge. The Beetle will shred your front's attack, and the Spiders' Broods will soak your Manticore's opening volley. You sell a Piglet, merge a second Dire Wolf behind the Tusk Boar, feed the Boar a Blood Pudding and keep it at the front where *Hurt* grows it, and freeze a Sabre Cat for next round.

**Active verbs:** buy, sell, roll, freeze, merge, feed, reorder, brand, scout, station.

## 3. Passive / idle: Skirmishes (the Gauntlet)

When no Run is on screen, the gnolls stage **Skirmishes**: every **interval** (40 s base, down to 25 s via Skirmish Pace), the **Standing Warband** runs a **Gauntlet** of rival warbands (W-06).

- The Standing Warband is a frozen 5-unit snapshot (stats, levels, items, brand). It never shops or grows, except through Kennel and Pens upgrades (§6). It changes only when you **Station** a finished Run's warband (Snarl shows old vs new Teeth/min before you confirm, including the effect of shop-only triggers, §13), or pick one of the last 3 finished warbands.
- Each **Fall cycle** starts with a **starter garrison** (Gutter Rat, Stirge, Tusk Piglet) and Snarl's **opening purse of 120 Teeth** (on unlock and after each Fall), so the first upgrade comes in < 60 s and income is never zero (W-07).
- Skirmishes **pause while a Run is on screen** (decided, README OQ 31). A Run left open with no input for 10 min counts as offline time (00 §7, m4), so Skirmishes resume at the offline factor. Whether they should also run during the shop phase is open question 35 (W-20).

**`idleRate` (00 §7): exact, via fixed Gauntlets.**
1. **8 seeded Gauntlets** per cycle and Stakes, from `seed(cycle.n, stakes, g)`. Gauntlet g is the rival sequence `rival(r, S, seed)` for r = 1…12 (§5.2).
2. The frozen warband fights r = 1, 2, … until its first loss or draw (a draw pays 0.7 of that round and ends the Gauntlet). It is ≤ 12 battles per Gauntlet, ≤ 288 battles with Cautious Stakes, well under 20 ms at the §14.2 budget.
3. ```
   gauntletTeeth_g = k_idle × Σ_{rounds cleared} battleTeeth(r, S)        // k_idle: tunable, seed 0.06
   idleRate        = (60 / interval) × mean_g(gauntletTeeth_g)             // Teeth/min
   ```
   `k_idle` defines idle pay **relative to active pay by construction** (W-02): the sim sets it so the active : idle bands below hold.
4. The Gauntlet is **strictly monotone in warband strength**: a stronger warband clears more rounds, so stationing, Drill Yard and Hardy Stock always matter.
5. **On-screen Skirmishes play the same 8 Gauntlets in order**, so the visible results match the formula exactly.
6. **Cautious Stakes** (like the Dungeon's Cautious Mode): the Gauntlets also run at Stakes −2 and −4, and idle uses whichever pays most.
7. Recomputed (debounced 1 s) on stationing, Kennel/Pens purchases, import purchases and Stakes changes. Never on a timer or on hide.
8. Offline: the shared core applies the factor and cap. The report rounds expectations: "312 Gauntlets, best run to round 9, 4.1K Teeth."

**Target ratio (W-11):** active ≥ **2.6× on-screen idle** at every Kennels level, centred at **3.2×**, measured against the reference offline factor *at the Pit's unlock* (≈ 0.75 with the Idle Hands levels a day 6–8 player owns), which puts **active : offline at 3.5–4.3×**. Hard sim check: active : on-screen idle **≥ 1.8×** at every Kennels level reachable by the idle-only profile (§14.1).

## 4. Gentle failure

- **Banked Teeth are never at risk.** Losses pay 40%. A **Retreat** (0 Grit) banks everything plus the run-end bonus.
- Losses in rounds 1–2 cost no Grit, so a bad opening shop can't end a Run. Each loss gives +1 Chow next round (max +2).
- Skirmish Gauntlets always pay for the rounds cleared and cost nothing.
- Three Retreats in a row under 3 wins makes Snarl offer "Drop Stakes by 2?" in one tap. Lowering is free and bought levels stay bought.
- No timer, energy or abandon penalty. *Forfeit* ends a Run as a Retreat with full payout.
- The Huntmaster costs 1 Grit like any loss, and you simply face him again.

## 5. Entities

### 5.1 Units: MVP roster of 23

Attack/HP at L1; "×L" scales with level. Tiers appear from round: T1 r1, T2 r2, T3 r4, T4 r6, T5 r8. **★** = Bestiary unlock (§6D); the other **17** are the starting pool (W-05: Bog Leech moved to base, Sabre Cat and Bone Ogre added, a ★ moved to T2). Every card carries one of 8 trigger icons (§13).

| Unit | T | A/HP | Trigger: ability |
|---|---|---|---|
| Gutter Rat | 1 | 2/1 | Faint: summon a 1/1 Ratling ×L |
| Stirge | 1 | 1/2 | Start of battle: 1×L dmg to a random enemy |
| Tusk Piglet | 1 | 2/2 | Sell: +1×L Chow (no effect in Skirmishes) |
| Dung Beetle | 1 | 2/1 | Buy: 2 random friends +1×L attack (no effect in Skirmishes) |
| Carrion Crow | 1 | 1/3 | Friend ahead faints: +1/+1 ×L |
| Bog Leech | 1 | 1/3 | Before attack: steal 1×L HP |
| Dire Wolf | 2 | 3/3 | Friend ahead attacks: +1×L attack (battle) |
| Cave Spider | 2 | 2/2 | Faint: summon a 2/2 Brood at level L |
| Rust Beetle | 2 | 2/4 | Start of battle: front enemy −2×L attack, −1 armor |
| Ember Hound | 2 | 3/2 | Knockout: +1/+1 ×L (rest of Run) |
| Mimic ★ | 2 | 2/3 | Faint: give the friend behind a random held item (pool: §5.3 held items) |
| Grave Bat ★ | 2 | 2/2 | Faint: 1×L dmg to 2 random enemies |
| Tusk Boar | 3 | 4/4 | Hurt: +2×L attack (battle) |
| Gorgon Lizard | 3 | 3/5 | Start of battle: highest-attack enemy skips its first L strikes |
| Owlbear | 3 | 5/5 | End of shop: friend ahead +1/+1 ×L (no effect in Skirmishes) |
| Hive Wasp ★ | 3 | 1/4 | Start of battle: all friends gain Thorns 1×L |
| Manticore | 4 | 5/4 | Start of battle: 3×L dmg to the 2 highest-HP enemies |
| Wyvern | 4 | 5/5 | Knockout: strike again (L times per battle) |
| Sabre Cat | 4 | 6/3 | Start of battle: +1×L attack per empty slot in your line |
| Gargoyle ★ | 4 | 3/8 | Passive: −1×L dmg per hit taken (min 1) |
| Bone Ogre | 5 | 6/6 | Faint: summon two 1/1 Ratlings ×L |
| Hydra ★ | 5 | 4/6 | Faint: summon two 3/3 ×L Heads |
| Pit Dragon ★ | 5 | 6/8 | Start of battle: 2×L dmg to every enemy |

### 5.2 Rival warbands and the Huntmaster

Rivals follow the same battle rules and use the **whole** 23-unit roster (so players meet ★ beasts before they own them). Each rival has one of **5 tamer archetypes**, which bias the ghost drafter's picks:

| Archetype | Bias | First seen |
|---|---|---|
| Ratcatcher | swarm and Faint chains (Rat, Spider, Bone Ogre, Hydra) | r1 |
| Falconer | snipers (Stirge, Grave Bat, Manticore, Pit Dragon) | r1 |
| Bulwark | tanks and debuffs (Rust Beetle, Gargoyle, Hive Wasp) | r2 |
| Brawler | attack growth (Dire Wolf, Tusk Boar, Wyvern, Sabre Cat) | r3 |
| Hexer | food, held items, Gorgon Lizard, Mimic | r4 |

```
rival(r, S, seed):
  line   = ghostDraft(archetype, r, seed)   // the novice draft bot (§14.1) plays rounds 1..r of the real shop rules, seeded
  size   = min(5, 1 + ceil(r/2))
  growth = +1/+1 to floor((r−1)/2) seeded units          // additive per round (W-05), never multiplicative
  stakes = stats × 1.12^S (rounded per §14.2) + active tactics cards (§7)
```

**The Huntmaster** (the only human, W-04): a monster hunter with anti-beast tricks, fought in the Huntmaster bout with 4 rival beasts drafted at budget `rB = max(current round, 8)`. 8/14, Armor 2. *Start of battle:* nets your highest-attack unit (it skips its first strike) and gives his beasts +1 attack. His budget is fixed at the first attempt; retries reuse it (§14.2).

### 5.3 Shop and food

Shop: 3 units + 1 food at r1–2, 3 + 2 at r3–4, 4 + 2 at r5–7, 5 + 2 from r8. One held item per unit; a new one replaces the old.

| Food | T | Effect |
|---|---|---|
| Raw Haunch | 1 | +1/+1 permanent |
| Chew Toy | 1 | Held: first hit each battle −2 dmg |
| Blood Pudding | 2 | +3 HP permanent |
| Spiked Collar | 2 | Held: +3 attack on the first strike |
| Hero's Lunchbox | 3 | +1/+1 to every unit (cost 4) |
| Bone Charm | 4 | Held: on faint, return once at 1 HP |

Held-item pool for random draws (Mimic, ghost drafter): Chew Toy, Spiked Collar, Bone Charm.

### 5.4 Overlord power: the Royal Brand

Once per Run, brand one unit: **+50% attack and HP** (tracks growth) and a crown tint. It persists if that warband is stationed. It's the one free, decisive call each Run: who carries the team?

## 6. Upgrade tree (Teeth, except D)

| Branch | Node | Cost | Effect / level | Max |
|---|---|---|---|---|
| A. Pens | Hardy Stock | 100 × 1.5^L | +4% unit attack & HP (garrison too) | 25 |
| | Larder | 500 × 4^L | +1 Chow per round | 2 |
| | Pen Space | 800 × 3^L | Shop slot 4 from r3, slot 5 from r5 | 2 |
| | Free Roll | 1,500 | First roll each round free | 1 |
| | Scouting | 250 × 2^L | L1 rival stats; L2 growth markers | 2 |
| B. Spoils | Tooth Pliers | 120 × 1.55^L | +6% all Teeth; **×2 at every 10th level** (W-01) | ∞ |
| | Showman | 300 × 1.7^L | +10% run-end bonus | 20 |
| | Grit | 800 × 5^L | +1 Grit (→ 6) | 2 |
| C. Kennels | Skirmish Pace | 60 × 1.9^L | Interval −2.5 s (40 → 25) | 6 |
| | Drill Yard | 300 × 1.9^L | Garrison units +1/+1 | 15 |

Handlers (+% skirmish Teeth) is **removed** (W-02): an idle-only multiplier outgrew active play. Skirmish pay now scales only through `k_idle`, Pliers (which pays Runs equally) and warband strength.

Visible milestones (00 §8): every 5 levels of Hardy Stock, Pliers, Showman and Drill Yard change a sprite (war paint, tooth jar, drilling gnolls, crowd). Each Pliers ×2 level adds a gold tooth to the jar.

**D. Bestiary (Crests; persists through Falls)**, the unique persistent system. The 6 ★ units cost 2/3/4/5/7/9 Crests. **Pedigrees:** start Runs with a Gutter Rat (3), +2 Chow in round 1 (4), carry one frozen unit into the next Run (8), **Deep Larder** ranks: +1 starting Chow per rank (10 Crests each, max 3). **Repeatable sink:** cosmetic beast skins (3 Crests each). Hall of Banners: one slot per beaten named Huntmaster (Later). **Crests** are rare and active-only: 2 per Triumph at **Stakes ≥ target − 2** (W-22, so they can't be farmed at Stakes 0), 1 per Run reaching ≥ 6 wins at Stakes ≥ 3.

## 7. The dial: **Stakes**, and the Fall

Snarl raises the betting stakes, drawing richer rivals with nastier tricks. **Each level is bought once per cycle** (`300 × 2.2^S` Teeth; tunable growth 1.8–2.6), resets on Fall, and is free to set at or below the highest bought. **MVP range 0–20.**

```
payout(S) = 1.22^S          // battle, Gauntlet and run-end Teeth; inside 00 §8's 1.15–1.35 reward band (W-01)
rival stats ×= 1.12^S
```
Price growth stays above reward growth by a bounded margin, and Pliers' ×2 levels give long cycles a compounding lever. The binding check is the step-cost band in §14.1.

Like Menace, Stakes adds **rules**: tactics cards active above their level. MVP: **3** Muzzled Front (the rival front unit gains Armor 1) · **6** Ambush (the rival back unit swaps to the front at start) · **9** Pack Healer (the rival rearmost unit heals the front 1 per exchange). Later: **12** War Drums (rivals +1 attack; unrelated to the Mines' Doom Drum) · **15** Marked Prey (your first-bought unit takes 3 at start; for a Standing Warband, slot 1) · **18** Huntmaster's Oath (the Huntmaster revives once at 50%).

**Infamy (00 §2.2):**
- **Skill gate (on screen):** **2 Pit Crowns at Stakes ≥ target**, where a **Pit Crown** is a Triumph (Huntmaster beaten) at that Stakes. MVP target `min(4 + 2N, 10)` (W-21: no target outruns the shipped cards; overflow beyond comes from the economy gate, 00 §2.2). The cap rises to 20 when cards 12–18 ship. `heldLevel` = highest Stakes with 2 Crowns this cycle (ratchets). Whether one Crown should suffice is open question 36.
- **Economy gate:** cycle Teeth ≥ `E0_pit × 3^N` (offline counts).
- **Fall:** the Legend steps into the Pit, beats every beast barehanded and throws open the cages. **Resets** Teeth, trees A–C, Stakes levels, any paused Run and the garrison (back to starter, with a new opening purse). **Keeps** Crests, the Bestiary and Pedigrees, banners and `lifetime.best`.

Row for the 00 §2.2 table: *War Pit | 2 Pit Crowns at Stakes ≥ S | `300 × 2.2^S` Teeth | `min(4 + 2N, 10)` (MVP) | 0–20.* Later Dread Signature: **Old Guard**, the garrison survives the Fall.

## 8. Local currency: **Teeth**

```
battleTeeth(r, S) = 8 × 1.12^(r−1) × payout(S) × localMult
runEndBonus       = 0.5 × wins × battleTeeth(finalRound, S) × (Triumph ? 2 : 1) × (1 + 0.10·Showman)
```
Earned from battles, run-end bonuses, Gauntlets and offline; spent on trees A–C and Stakes. Shared `formatNum`, tooth icon. Pacing bands (§14.1): first upgrade < 60 s (the opening purse covers it), first Triumph at Stakes 0 within ~20 min of Pit play, each Stakes step ≈ 25–60 min of income at the previous level.

## 9. Session shapes

- **30 s:** read Snarl's report, buy 1–2 upgrades, play one shop turn of the paused Run, leave.
- **5 min:** most of a Run. Read the scout, pivot from swarm to snipe, land an L2 Manticore.
- **30 min:** 3–4 full Runs (6–9 min each), buy a Stakes level, chase Pit Crowns at the Infamy target, station the best warband.

## 10. Screen layout (180×320 logical, portrait)

```
y   0 +----------------------------------+
      |  cage-bar decor (notch-safe)      |  16
 16   | [tooth]4.1K Stakes 6 ▮▮░ [=] [⌂]  |  HUD + Infamy bar
 32   | ♥♥♥♡ wins 4/8 rd 6 chow 10 [Bw]   |  run bar 12 (+ rival archetype badge)
 44   +----------------------------------+
      | [r][r][r][r][r]                  |  rival row, 5 cards 34×40, 2 px gaps
 84   |  ~~~~~ clash gap 12 ~~~~~         |
 96   | [Boar][Wlf][Spd][Cat][Rat]        |  YOUR LINE, front = left, 34×40 cards
136   | ⚑ → ⚔+2 (battle)                  |  info line 12 (icon → effect)
148   | [u][u][u][u][u]                   |  shop units 34×40 (no label)
188   | [❄][❄][❄][❄][❄]                   |  freeze strips 34×10
200   | [food][food]        [BRAND]       |  food row 34×40
248   +----------------------------------+
      | [ROLL 1]  [SELL]      [ ▶ FIGHT ] |  action row 32
280   |  sell bin / 1× 2× SKIP in battle  |  24
304   |  decor (home-indicator band)      |  16
320   +----------------------------------+
```
Five 34 px cards plus four 2 px gaps = 178 px. Fronts strike vertically across the clash gap with a lunge. Left-handed mode mirrors the layout (front = right). During battle the shop dims and shows speed controls. With no Run open, the top half shows the live Skirmish and the shop area becomes **START RUN** plus Garrison and Upgrades tabs. Thumb reach for the line row is validated on a 6.7″ device mock during v0.5.5 (W-25).

## 11. Touch controls (one-handed)

- **Tap-tap** primary: tap a shop unit, then a slot (place) or a matching unit (merge); valid targets pulse. Drag works too.
- **Reorder:** tap a line unit, then another slot to swap.
- **Freeze:** tap the 34×10 ❄ strip under a shop card. **Sell:** select + SELL, or drag to the bin (2 s undo).
- **Hold** any unit for its full card (numbers at each level, trigger text).
- **FIGHT** is a 48×32 button bottom-right. All interactive controls except inspect-holds sit below y = 96.
- **Hard rule (W-14):** every tap target is ≥ 12 logical px on its short side (≥ 36 physical px at 3×).

## 12. Why it doesn't feel like the other six

- **Vs the Dungeon:** the Dungeon is **spatial and continuous**: geometry, ranges and routes, real-time combat against hero parties, and mid-fight intervention (Glare, Trapdoor, Gong), all on one fortress grown across a cycle. The Pit is **draft, synergy and sequencing**: no map, only a 5-slot order; turn-based battles that are hands-off once started; decisions made *before* the fight under scarcity (10 Chow) and randomness (rolls); a warband rebuilt from nothing every Run. Its opponents are **rival beast warbands**, not heroes, and its signature event is the **Pit Crown**, not slain Champions, so the two read differently on the Throne report too (W-04).
- **Vs the Spire** (both merge): Spire merging is physics; Pit merging is an economic choice.
- It's the suite's only **roguelite run**, and the only active session with a natural end (Triumph or Retreat).

## 13. Pixel art & juice

- **Card grid (34×40, W-14):** sprite 24×20; stat bar 34×8 at the bottom (attack left, HP right, 3×5 font with a 1 px outline); 7×7 held item top-right; 5×5 level pips top-left; one 7×7 status slot that cycles statuses (Armor, Thorns, Shade, Netted) every 0.6 s; the Royal Brand as a 1 px gold outline tint; a 7×7 **trigger icon** bottom-left.
- **Trigger icon set (8 glyphs, 7×7):** Faint, Hurt, Start of battle, Before/After attack, Knockout, Buy/Sell, End of shop, Friend-ahead. The info line reads `[icon] → effect` in symbols ("⚔3 ×2 ♥max"), so no ability needs a sentence.
- **Shop-only triggers** (Buy, Sell, End of shop) carry a small "no effect in Skirmishes" badge in the Garrison tab, and Snarl's station preview folds the difference in (W-26).
- 2-frame idles. Levels add pips and a palette shift; L3 gets a gold outline. Rival beasts use the same sprites with the tamer's colour collar, so rivals cost no new beast art.
- **Merge:** the copy leaps on, puff, +1/+1 pops; level-up = gold burst and Snarl's whistle.
- **Battle:** 6 px lunges, white hit flash, damage numbers, 1 px shake on big hits. Beasts poof into fur tufts; teeth arc to the jar. Each trigger flashes its icon before resolving, so chains read at 2× and teach the order. Sudden Death tints the sand red.
- **Triumph:** the Huntmaster's net tears, the crowd roars, a tooth fountain. **Retreat:** gnolls drag the warband off with a "next time" whistle while the payout still rolls up big.
- **Return ritual (v1.1):** Snarl replays the best Gauntlet; tap thumbs-down as the last rival falls for +5%.

## 14. Technical notes (PixiJS v8)

- **Battle engine:** a pure TS module (no Pixi) under the §14.2 contract. It emits an event log the renderer plays back; Skip jumps to the end. The same module runs in the Worker (Gauntlets) and in Node (balance simulation, 00 §8.1).
- No physics or pathfinding. Tweens only. One ≤ 1024² atlas, `scaleMode: 'nearest'`, `roundPixels: true`, integer scaling. ≤ 30 sprites, so it's a good low-end test department.
- **Save (00 §9):** `run` = Teeth, trees, Stakes, garrison, last 3 warbands, and the **paused Run** (line, shop, frozen slots, Grit, wins, round, runSeed, actionIndex, Huntmaster budget, `paramsVersion`) ≈ 2 KB. `persistent` = Crests, Bestiary, Pedigrees, skins, banners. `cache` = Gauntlet `idleRate` + hash.

### 14.1 Simulation-driven tuning (W-12, W-17)

The Pit's local sim (layer 1 of 00 §8.1) adds a **draft bot** in three tiers:
- **novice:** greedy value per Chow, no battle look-ahead, 20% random buys. It is also the rivals' ghost drafter.
- **reference:** a heuristic line order (tanks front, start-of-battle damage back, Hurt units front) and at most **8 simulated candidate lines per shop**.
- **expert:** 64 candidate lines per shop.

**Time model:** shop seconds = 8 + 3 × actions (novice ×1.5); battles play at 1× for the first 3 rounds, then 2×. **Budgets:** the engine runs ≤ 0.05 ms per battle (asserted in CI). Fast tier: 100 Runs at the target Stakes with the reference bot. Nightly: 2,000 Runs at each Infamy target level (4, 6, 8, 10) and 200 at every other Stakes level, sharded across workers.

**Calibration:** Settings → **Export playtest log** appends a per-Run summary (wins, losses, Stakes, buys, minutes) to the save export, locally (no server). The reference bot's win rate is fitted to ≥ 5 playtesters' logs before v0.6 ships (open question 37). **Unit tuning** uses a fast surrogate (per-unit win-rate-added from 50K random-team battles), not full-Run coordinate search. Unit health is measured under ≥ 2 bot policies (greedy and synergy-seeking).

**Bands (fail or flag):**
- **Triumph rate** 35–50% of Runs at the target Stakes (reference bot); win rate in rounds 1–5 ≥ 75%; Huntmaster win rate, given the bout is reached, 50–70%. No per-battle band (it fought the Triumph band).
- **Run length** 6–9 min of simulated play (reference time model).
- **Pit skill gate** met within ≤ 2.5 days of reference-profile attention to the Pit (W-03).
- **Active : on-screen idle** ≥ 2.6× (centre 3.2×) at the reference offline factor at unlock; hard floor 1.8× at every Kennels level the idle-only profile reaches (W-02, W-11).
- **Stakes step cost:** buying level k+1 costs ≈ 25–60 min of reference income at level k, across 0–20 (W-01).
- **Captives:** passive rate ≤ 1/3 of the reference active rate.
- **Unit health:** any unit in > 60% of Triumph teams, or under 3% pick rate (flag).
- **Sudden Death cap hits** ≤ 0.01% of battles.

Unit stats, rival growth, `k_idle`, the Stakes coefficients (2.2 / 1.22 / 1.12) and `E0_pit` are owned by the sim.

### 14.2 Engine contract (W-08)

- **Integer stats.** All derived stats are computed once at battle start as `floor(x + 0.5)`, applied in this order: base → round growth → Stakes → Hardy Stock → Brand → food and imports. Battle-time effects are integer adds.
- **Three named mulberry32 streams:** `shop(runSeed, round, roll)`, `shopTrigger(runSeed, round, actionIndex)` (Buy/Sell/End-of-shop randomness), and `battle(hash(teamCanon, rivalCanon, round, paramsVersion))`. Random item pools are listed in §5.3.
- **Total trigger order:** simultaneous triggers resolve by highest attack, then your side before the rival's, then slot order from the front, then unit id. The Huntmaster is a rival unit for ordering.
- **Huntmaster retries** reuse the budget `rB` fixed at the first attempt; the round counter does not grow his party.
- **Params pinning:** a paused Run snapshots `paramsVersion` and keeps it until the Run ends, so a tuning release never changes a Run in progress.
- **Cache hash** covers garrison, upgrades, Stakes, `imports` and `paramsVersion`.
- **Sudden Death** from exchange 50 (§2); the 200-exchange cap is a draw.

## 15. MVP vs later (ships in v0.6)

**Phase (W-16):** **v0.5.5 internal milestone** (engine + draft bot + golden tests, no UI; starts tuning before the art) and then **v0.6** at **10–12 weeks** solo. **Seal #7: 600,000 Tribute (seed) + lifetime Dread ≥ 150**, continuing 00 §6's Dread gate for late departments (reference unlock: day 6–8). "Under Construction" door until then.

**MVP:** Runs with Grit; shop (buy/sell/roll/freeze/merge to L3); 5-slot line; scouting; 23 units (17 + 6 Bestiary); 6 foods; 5 rival archetypes + the Huntmaster; Royal Brand; deterministic engine with Sudden Death and 1×/2×/Skip; Skirmish Gauntlets with Cautious Stakes and stationing; trees A–D including Pedigrees; **Stakes 0–20** with cards 3/6/9 and an MVP Infamy target capped at 10; Infamy and Fall; 8 Commendations (first Triumph, first L3, first Pit Crown…); left-handed mirroring; **Node 1 only** on the Captives lines and the Pit's two import lines (README decided OQ 11); draft bot in CI; Export playtest log.

**Later:** cards 12/15/18 (target cap → 20); Node 2 on the four Pit-related import lines; a second roster (Chimera, Barghest, Kraken Pup…); named Huntmasters and banners; a weekly seeded challenge against your own best; a 6th slot as a deep Bestiary unlock (decided OQ 34); the replay ritual; Old Guard; warband share codes (no server).

## 16. Meta-economy hooks (per 00)

- **Tribute:** via Rank from the Gauntlet `idleRate`.
- **Export: Captives** (W-02, W-19). Active: 1 per Run reaching 6 wins; a Triumph gives 3 instead (the Huntmaster and two handlers). Passive: 1 per 60 Gauntlet rounds cleared, capped at 1/3 of the reference active rate. Plus the 2/h base trickle. ~15/h active, ~4/h passive. Importers (00 §4):
  - **Dungeon → Caged Bait (W-15):** Rogues pause 1 s at a baited loop's entrance, glancing at the captive without detouring (L1); +10% chest purse (L2–3, later). Rogues still ignore Bait Chests, so the Eye of Gloom puzzle stands.
  - **Bridge → Pillory (W-15):** unmasked heroes pay +1× fare as a pillory fine (L1); +5% Unmask bounty (L2–3, later). Crop slots stay a Bridge-tree lever, so the import never eases the skill gate.
- **Imports (00 §4 re-plan; both partners are open before the Pit, so both lines are live on unlock):**
  - **Souls → Restless Spirits:** the first friendly unit to faint each battle returns as a 1/1 Shade (L1); Shade +1/+1 per further level.
  - **Essence → Warding Sigils:** the front 1/2/3 units start each battle with Armor 1.
  - MVP ships Node 1 of each (README decided OQ 11); each level gives +1.5% Teeth, inside the +18% Goods cap. Imported Armor and Shades apply to Runs and to the Standing Warband, and the Gauntlet `idleRate` recomputes when they're bought. Because Souls and Essence stockpile before the Pit opens, the sim holds these lines to maxing **no sooner than 5 days after unlock** (W-19, 00 §8.1).
  - *Superseded draft:* Bones → Bone Barding and Potions → Pit Tonics (kept as spare Node 2 ideas).
- **Trophies:** the Legend's helm goes to the Throne wall as usual.

## 17. Questions

**Decided:**
1. **Goods with a 7th department:** the graph is re-planned instead (00 §4). Every department still has two imports and every Good two importers. Captives go to the Dungeon and the Bridge, and the Pit imports Souls and Essence. (README decision 34.)
2. **v0.6, Seal 600K Tribute + lifetime Dread ≥ 150:** yes. The price is a seed set by the simulation. (README decision 33.)
3. **Skirmishes while a Run is on screen:** they pause, keeping active pay distinct from idle pay. Defaults adopted (provisional, 2026-10-21; README OQ 31).
4. **Free scouting:** archetype and beast icons free, stats behind Scouting (README OQ 32, adapted to rival warbands).
5. **Async PvP:** no, since GitHub Pages has no server; share codes and a weekly seed later (README OQ 33). Ghost-drafted rivals give mirror matches offline.
6. **Line slots:** 5 at 34 px; a 6th later as a deep Bestiary unlock (README OQ 34).

**Open (consolidated in README as OQ 35–37; defaults apply if unanswered):**
7. Run Skirmishes during the shop phase of an open Run, pausing only during the Fight? (Default: **no**; keep decided OQ 31. A Run idle for 10 min accrues offline Skirmishes.)
8. Skill gate: 2 Pit Crowns or 1? (Default: **2**; if the sim can't meet the ≤ 2.5-day band with Triumphs at the top of 35–50%, drop to **1 Crown at Stakes ≥ target**.)
9. Bot calibration: can ≥ 5 playtesters send exported logs before v0.6? (Default: **yes**, friends and family; if not, ship with the bot fitted to the designer's logs plus the novice tier, and widen the Triumph band to 30–55%.)

## 18. Manager: Snarl

**Snarl**, gnoll, pitmaster of the War Pit. Revision 4 promotes him from department head to the department's **manager** under the shared system (00 §5.4).

- **Personality and voice:** a gruff, scarred coach and bookmaker rolled into one. He's terse and competitive, talks in betting and sports slang ("odds", "spread", "rookie"), respects only results, and gives praise grudgingly but sincerely. He calls the Overlord **"Chief"** and blows his whistle instead of saying "well done". He never comments on a battle while it plays; he reviews it afterwards. His gibberish voice is gravel barks with a hyena cackle on wins and a sharp whistle sting. Readable lines are ≤ 32 characters, clipped, often without verbs.
- **Portrait (32×32), expressions:** *scowl* (default, chewing a bone), *hyena laugh* (wins, Triumphs, merges), *whistle* (milestones, "go"), *appraising squint* (scouting, shop tips, Stakes), *grudging respect* (Crowns, the Huntmaster beaten), *bared teeth* (Retreats, the Legend).
- **Dock:** the default strip (y 16–48) over the HUD and run bar. The rival row (from y 44) peeks out below, and the line, shop and action rows stay clear.
- **`isIntense`:** a battle animating (lines wait for the result screen or the next shop), or a drag in progress.
- **Icons he uses:** 🦷 Teeth, Chow, Grit heart, beast and rival-archetype icons, ❄ freeze, roll, ▶ FIGHT, brand crown, Pit Crown, Stakes chip.

**Onboarding script (first entry after the Seal; ~90 s; uses Snarl's 120-Teeth opening purse and the starter garrison):**
1. **Spend the purse.** The Kennels tab glows on Skirmish Pace (60 Teeth). "Purse is yours, Chief. Spend." Done on purchase (inside the 60 s band). The garrison's Skirmish speeds up.
2. **Start a Run, buy a beast.** START RUN pulses, then a shop card. "Pick a beast." Done on the first buy.
3. **Line-up.** A ghost taps the new beast, then the front (left) slot. "Front takes the hits." Done on any reorder or placement.
4. **Scout and fight.** The rival's archetype badge pulses (tap to see the beast icons), then ▶ FIGHT. "Hands off. Watch 'em work." Done when the battle ends. Round 1 can't cost Grit, so the result never hurts.
5. **Merge.** Next shop: a scripted duplicate of a line beast. "Two of a kind? Stack 'em." Done on the merge (+1/+1, XP pips). Snarl whistles and leaves the rest of the Run to the player.

**Micro-lessons** (`mechanic_unlocked`): **Royal Brand** at round 3 of the first Run (1 beat: "Brand your best. One per Run."); **Stationing** at the end of the first finished Run (2 beats: compare Teeth/min old vs new, then confirm, "Your Run, their day job."); **Stakes** on the first level bought (2 beats: set Stakes, then show the next tactics card's icon at level 3).

**Milestone triggers and example lines:**

| Trigger (00 §5.4) | Condition | Expression | Example line |
|---|---|---|---|
| `first_upgrade` | first Tooth Pliers level | appraising squint | "Pliers. Every tooth counts." |
| `first_helper` | first Drill Yard level (garrison drilled) | whistle | "Garrison's drilling. Good." |
| `tier_reached` | first L3 unit | hyena laugh | "Level three! Now we're betting." |
| `tier_reached` | first Triumph (the Huntmaster beaten) | grudging respect | "Huntmaster down. Not bad, Chief." |
| `mechanic_unlocked` | first finished Run (runs the stationing micro-lesson) | appraising squint | "Station 'em. Let 'em earn." |
| `dial_raised` | Stakes bought: first, every 3rd, new max | appraising squint | "Higher stakes. Nastier tricks." |
| `hazard_first` | first Retreat | bared teeth | "Retreat. Teeth banked. Again." |
| `struggle` | 3 Retreats under 3 wins (delivers "Drop Stakes by 2?") | scowl | "Odds are bad. Drop Stakes?" |
| `infamy_50` | Infamy ≥ 50% (first Pit Crown) | grudging respect | "A Crown. Rivals are talking." |
| `legend_arrives` | the Legend at the gate | bared teeth | "Barehanded type. Hide the pups." |
| `return_after_fall` | first entry after a Fall | whistle | "Cages fixed. New purse. Go." |
| `goods_link` | Souls or Essence line opened | hyena laugh | "Ghost dogs! Fainted come back!" |
