# RUNBOOK - Men Gallant FC · Justaino FC Hub

A practical, plain-English guide to running and maintaining the bookmarklet.
This is the "how do I actually use/fix it" doc. For scope and phase history see
`PLAN.md`; for build context see `CLAUDE.md`.

---

## 1. What it is

A single **bookmarklet** for the EA FC 26 Web App. It adds a floating panel that
lets you pick a club player, tick PlayStyles / PlayStyle+, and apply them all at
once. It drives the app's own logged-in services - no passwords, no servers.

The panel header reads **"Men Gallant FC - Justaino FC Hub"**.

It's **responsive**: on a computer it opens as a wide **two-pane** panel; on a phone
it opens as a full-width **step-by-step** sheet (see §3). Same features either way.

---

## 2. Running it day-to-day

1. Make sure the bookmarklet is saved as a bookmark (its URL is the one long line
   in `bookmarklet.txt`, starting with `javascript:`).
2. Open the FC Web App and let your club load.
3. Click the bookmark. The panel appears bottom-right.

**Every click rebuilds fresh.** Clicking the bookmark again (or re-pasting the
source) tears down the old panel + styles and rebuilds with the latest code, so you
do **not** need any manual reset after an update - the new look/logic just shows.
The already-loaded club is carried over so the rebuild is instant; hit `↻ Reload
club` if you want a fresh pull.

**Hard reset** (only if something is truly stuck, or to clear the `window.FC26`
namespace) - paste into the Console (F12 → Console):

```js
document.getElementById('fc26-panel')?.remove(); document.getElementById('fc26-style')?.remove(); delete window.FC26;
```

---

## 3. The panel - two layouts

The panel automatically picks a layout based on your screen width. **All the parts
below are the same** in both - they're just arranged differently.

The **header bar** (shared by both layouts) shows the title, a small **version badge**
(e.g. `v5`, so you know which build you're on - see §7a), the **theme dropdown**
(colourway picker, see §6), a **reset button** (the ⤢ icon - snaps the panel back to
its default dock), and the minimise / close buttons.

**On a computer (wide screen) → "Broadcast console" (a wide bar docked to the bottom
of the screen, three zones side by side):**
- **Left = Lineup:** the `↻ Reload club` button, a **search box**, the
  **☑ Only evo-eligible** filter, and the **player list**. Fills the height, scrolls on
  its own.
- **Middle = Spotlight:** the selected player's **preview card** (until you pick someone
  it shows a "pick a player" placeholder).
- **Right = PlayStyle Deck:** the **✨ Suggest** row, the **PlayStyle+ / Basic** tabs +
  grid, and the **delay + Apply** row.
- **Drag** it by the header, **resize** it with the corner grip, and hit the **⤢ reset**
  button to re-dock. Make it narrow and it collapses to **two columns** (the spotlight
  tucks on top of the deck).

**On a phone (narrow screen) → "Channel tabs" (a bottom sheet):**
- Tabs across the top: **Lineup → PlayStyle Deck → Review**. A **pinned mini-spotlight**
  at the bottom always shows who you're building (rating, name, caps).
- A **guide button** walks you through: it's disabled until the step is ready, and you
  **can't reach Review until at least one PlayStyle is picked** (the Review tab stays
  greyed out until then). Picking a player jumps you straight to PlayStyle Deck.

### The parts (both layouts)
- **`↻ Reload club`** - loads every player in your club (not just your squad). Use it
  if you've just opened or changed your club.
- **search box** - filter the list by name.
- **☑ Only evo-eligible `(N rarities)`** - hides cards that can't take PlayStyles (§4).
- **player list** - each row shows rating, name, and - handy - the **PlayStyle+ icons
  the player already has** (gold, on the right), plus a GK badge and rarity. Click/tap
  a row to select.
- **preview card (Spotlight)** - a big rating number next to the name (+ GK); the
  **rarity name + `rarity #NN`**, positions, item id; an **eligibility** row (§4);
  two **segment meters** (3 for PlayStyle+ in gold, 8 for Basic in the accent colour)
  showing slots used; and current PlayStyles as **chips**, split into a PlayStyle+ row
  and a Basic row.
- **✨ Suggest** - position + role dropdowns that pre-tick the recommended PlayStyles
  for that role, filling your **open** slots best-first: the top picks become **PS+**,
  the rest **basic**. If the player already **owns** a top pick, Suggest **falls through**
  to the next-best one instead of leaving the slot empty (it never re-ticks something
  owned), and when a role's own list runs out it keeps going down a general **position**
  list - so there's always a next-best pick. See §3b.
- **PlayStyle+ / Basic tabs + icon grid** - tick the ones you want. Owned ones are
  disabled, GK-only ones are hidden for outfielders, and each type stops at its cap
  (4 PS+, 8 basic). A live counter shows how many you've picked.
- **delay chip + Apply / Stop** - the **DELAY (ms)** chip (default 500; bigger = gentler
  on the account) sits **side by side** with the **Apply** button in one row; **Stop**
  swaps into Apply's spot while a run is going. Each PlayStyle tile **spins then ticks**
  as it lands, and at the end you get an **"Added N to <player>"** summary of exactly
  what went on. **Stop** halts after the current one.

---

## 3a. New in v2 - resize the panel, batch apply, remove evos

**Resize the panel (computer only).** Grab the small **diagonal-striped handle in the
bottom-right corner** and drag to change the panel's width and height. Minimum ~340×260;
it won't spill off-screen. The size is **remembered** (like the drag position), so it
reopens at the size you left it. On a phone, and while minimized, there's no handle.

**Apply to several players at once (batch).** Every player row has a **checkbox** on the
left. Tick everyone you want - ticking one also previews it. A green **"N selected for
batch apply"** bar appears (with a **Clear** button). Pick your PlayStyles once, hit
**Apply selected**, and it applies to all ticked players in one run. A **roll-call**
("Applying selected PlayStyles to N players: …") shows above the Apply button so you can
see exactly who's included first.
- Each player is checked **on its own**: anything it already owns, can't fit (its own 3
  PS+ / 8 basic caps), or that's GK-only on an outfielder is **skipped** (not a failure).
  The result shows a **section per player** with added / failed / skipped.
- **✨ Suggest** (and its dropdowns) is greyed out while more than one player is ticked -
  Suggest works on one player at a time. With **nothing** ticked, Apply works on just the
  previewed player, exactly as before.

**Remove PlayStyles / evos.** The preview card has **Remove Latest Evo** and **Clear all
evos** (they show only when the card has PlayStyles). Both **ask you to confirm** and show
a spinner + live count under the buttons while working.
- The game removes evo *upgrades* **newest-first** and gives **no way to target a specific
  one** - and the next one removed **might be a stat/skill upgrade, not a PlayStyle**.
  That's why the buttons say "evo" and the confirm warns you.
- **Clear all evos** keeps removing until the card fully reverts, which can make it
  **leave your club evo list**.
- Drives the app's own `services.Academy.removeEvoUpgrade` - nothing faked.

---

## 3b. New in v3 - smarter Suggest (fall-through)

> **Superseded by v39 - see §3v.** Suggest no longer reads off these ranked lists; it
> optimises the score directly. `ROLES` and the tail tables described below are still very
> much alive, but now as the **scorer's** weights rather than Suggest's running order.

**Suggest now always fills what it can.** Before, if a player already owned one of a
role's top picks, that slot was just skipped and left empty (so an owned top pick meant
one fewer suggestion). Now it **falls through** to the next-best pick instead:

- It fills your **open** slots best-first - top picks as **PS+**, the rest **basic** -
  and only counts slots you actually have free (a player who already holds a PS+ has
  fewer PS+ slots to fill).
- Anything the player **already owns is skipped** and never re-ticked (in either form -
  it won't offer a basic version of a PlayStyle you already hold as a "+").
- When the role's own curated list runs out of unowned picks, Suggest keeps going down a
  general **position** list (attacker / midfielder / defender / keeper) so it can always
  find a next-best - a heavily-evolved player still gets every slot filled.
- Still **one player at a time** (greyed out during a multi-player batch, same as before).

**Maintaining the rankings.** Two tables in `fc26-tools.js` drive Suggest:
- `ROLES` - the curated best-first list per position/role (the top picks). Edit a role's
  array to change its priorities.
- `TAIL_ATT` / `TAIL_MID` / `TAIL_DEF` / `TAIL_GK` (mapped by `POS_TAIL`) - the general
  position fallback orders used once a role's list is exhausted. These are broad,
  sensible defaults, not a live meta feed; edit them to taste. Because the tail only
  kicks in after the curated picks, its exact order only matters for already-loaded cards.

After editing either table, rebuild with `node minify.js` (see §7).

---

## 3c. New in v7 - GH 4th PlayStyle+ + a 4-slot cap display

Support for the **4th PlayStyle+** (the limited "GH 4th" Glory Hunters evos):

- **Caps show the real number.** A card that already holds a 4th PlayStyle+ now shows
  `PlayStyle+ 4/4` in the preview and the mobile mini-spotlight, instead of an
  overflowing `4/3`. Normal cards are unchanged (`3/3`, `8/8`). Display only - the game
  still decides what can actually be added.
- **Apply a GH 4th from the tool.** Select a **Glory Hunters card that already has
  exactly 3 PlayStyle+** and a gold **"GH 4th PlayStyle+ (one-off)"** section appears in
  the PlayStyle Deck. Open it, and tap the chip for the PlayStyle+ you want; after a
  confirm it adds that PS+ as a **4th** to the player.
  - It **only appears for eligible cards** (Glory Hunters rarity + exactly 3 PS+), is
    **never part of batch apply or Suggest**, and every apply is confirmed (these evos are
    **one-offs** - applying one spends it).
  - The list **loads on its own** (no need to open Evolutions -> Rewards first) and
    **refreshes after each apply**, so newly-acquired GH-4th evos show up.
  - How it works under the hood: the GH-4th evos are Academy "Rewards" category (id 9)
    slots named `GH 4th <PlayStyle+>`; the tool loads that category via
    `services.Academy.requestSlotsByCategory({ categoryId: 9, count: 100, offset: 0 })`
    and applies one with the same `addItemToSlot` + `claim` calls a normal PlayStyle uses.
  - Console: `await window.FC26.fourthEvos.load()` lists your GH-4th evos (read-only); the
    panel is the only place that can apply one.
  - **Eligibility note:** the "Glory Hunters" gate matches the rarity NAME containing
    "Glory Hunter", so it also allows **Glory Hunters Red** cards. Change `eligGH()` in
    `fc26-tools.js` if you ever want it restricted to the base rarity only.

---

## 3d. New in v8 - the Meta rating ("Justaino Score")

A self-computed **0-100 score per player per position**, worked out entirely from the
player's real stats and PlayStyles (no external data, no player database).

**Where you see it:**
- A green **`JUSTAINO xx · <pos>`** pill under the big OVR on the preview card. It shows
  the player's BEST score across the positions they can play.
- A **▸ Meta rating** section under the player list: pick a position and it ranks the
  players in your club who can play there, best first, each with the `stat + PlayStyle`
  split behind the score.

**How the score works (v2 - role-aware, rebuilt in v18):**
- **Stat fit (0-99)** = a weighted average of the six stats, using `STAT_WEIGHTS[pos]`, PLUS the
  card's weak foot and skill moves folded in as light attributes (`TRAIT_STAT_WEIGHTS`, outfielders
  only, and only when the app exposes those values).
- **PlayStyle fit (0-100)** = the card is scored against its BEST-fitting ROLE in that position
  (each role's ordered priority list in `ROLES`, turned into per-rank weights by `roleWeightsFromList`),
  and the top-scoring role wins (shown as `(Poacher)` etc. in the hover tooltip). A **PlayStyle+ counts
  `PSPLUS_MULT`× a basic** (3.5), and **every** meta basic the card owns is counted - the "full marks"
  ceiling (`psMaxForWeights`) is the best `PS_CEIL_PLUS` (5) as PS+ plus ALL other role PlayStyles as
  basics, so a card with five relevant PS+ genuinely out-scores one with three (neither flatlines at 100).
- **Rating** = `(1 - OVR_MIX) × (STAT_MIX × statFit + PS_MIX × playStyleFit) + OVR_MIX × OVR`.
  Currently `STAT_MIX / PS_MIX = 0.50 / 0.50` and `OVR_MIX = 0.01` (so the final number is 99% stat/
  PlayStyle fit + 1% raw OVR). OVR is deliberately a **pure tiebreak** as of v28: it only separates two
  cards whose stat/PlayStyle fit is otherwise near-identical, and can never lift a marquee high-OVR card
  above a better-fitting one (it was 0.35, then 0.15). Scores carry **one decimal** so near-ties separate.
- **Stats are read live via `readStats(it)`, which prefers `it.getAttributes()` over the plain
  `it.attributes` array.** This matters for EVOLVED cards: the game freezes `it.attributes` at the base
  (pre-evo) values and exposes the true evolved six face stats only through `getAttributes()`. Reading
  the getter means evo'd cards score (and display) with their real current stats.

**Console helpers (read-only):**
`window.FC26.scorePlayer(it, "ST")`, `window.FC26.metaTop("CB", 10)`,
`window.FC26.bestJustaino(it)`, and the live tables `window.FC26.STAT_WEIGHTS` /
`window.FC26.PLAYSTYLE_WEIGHTS`.

**Re-tuning it:** see §7b. The public transparency page (`meta-rating.html`) shows every
weight and is generated from these same tables.

---

## 3e. New in v9 - face stats, all-edge resize, tidier mobile flow

Visual/flow polish for viewing and applying PlayStyles. No new game calls, no change to
how applying works.

**Face stats on the card.** The player's six stats now show as a 3x2 grid:
- Built by `faceStatsHTML(it)`, which reads `readStats(it)` (the same six numbers off
  `it.attributes` the meta rating uses) and labels them PAC/SHO/PAS/DRI/DEF/PHY, or the six
  GK stats for keepers. Values are colour-graded (`.pv-fv.hi/.mid/.reg/.lo` = accent / gold
  / ink / muted) by simple 90 / 80 / 70 thresholds.
- Shown on the **desktop spotlight** (`renderPreview`), inside the **mobile Deck** summary
  when its stats toggle is open, and in the **Review** step is intentionally NOT repeated.

**Resize from any edge or corner (desktop).** There are now eight handles, not one:
the striped bottom-right grip plus seven invisible strips (`.fc26-rz-n/s/e/w/ne/nw/sw`).
All share one routine (`wireResizeHandle` -> `doResize`): the edge(s) named in the handle's
direction move toward the pointer, the opposite edge stays pinned, clamped to a min size
(`MIN_W`/`MIN_H` = 340/260) and the viewport. Size AND position are saved (`FC26_size`
plus the `Max` spot) so a top/left drag doesn't snap back. `⤢` in the header still re-docks.

**Mobile Deck summary** (`renderDeckSummary`, element `deckSummary`): a slim bar atop the
PlayStyle Deck step showing rating + name + caps, with a **▾ stats** toggle that folds out
the capacity meters (`capMetersHTML`) + face stats. Open/closed persists in
`FC26_deckStatsOpen`. This replaced the old pinned mini-spotlight, which was removed
(it duplicated this bar; the `.fc26-spot` / `updateStickySpot` code is gone).

**Mobile Review summary** (`renderReviewSummary`, element `reviewSummary`): replaces the
repeated preview on the Review step. Shows the target (player or batch) and the **ticked**
PlayStyles split PS+ / Basic, plus a **Manage this card** fold-out (`state.reviewManageOpen`)
carrying the eligibility toggle and the Remove / Clear-evo buttons that used to live on the
preview. The remove spinner is hosted here on mobile (`loaderHost` in `runRemove`).

**Gating (`reviewReady` + `updateApplyBtn`):**
- You can reach **Review** when something is ticked OR the card already has PlayStyles (so
  you can go there just to manage/remove). This is the `reviewReady()` check used by the
  guide button, the Review tab dim, and `goStep`.
- **Apply selected** is disabled whenever nothing is ticked (`updateApplyBtn`, called from
  `updateEvoCount`), on both mobile and desktop.

---

## 3f. New in v10 - mobile Lineup list collapse

On mobile only, opening the **Meta rating** or **Manage eligible rarities** panel folds the
player list to a one-line stub so the panel has room to scroll. Driven by
`updateLineupCollapse()`: it hides `playerList` and shows `lineupStub` when
`currentMode() === "mobile"` AND a panel is open (`eligOpen || metaOpen`) AND the user hasn't
tapped the stub to peek (`lineupPeek`). Tapping the stub sets `lineupPeek = true` (reveals the
list); opening/closing either panel resets `lineupPeek = false` (re-collapses). It's re-run
from the two toggle handlers, `renderPlayers`, `renderWizStep` (Lineup step) and
`buildDesktop`/`applyLayout`, so desktop always shows the full list.

---

## 3g. New in v13 - Gauntlet squad builder (display only)

A **▸ Gauntlet squad builder** section under the player list (below Meta rating) that drafts
several complete squads from your club with **no player shared between them** - the Gauntlet
rule. It only shows the squads; it does not touch your game.

**How to use it:**
- Open **▸ Gauntlet squad builder**, pick a **formation** (4-3-3, 4-4-2, 4-2-3-1 or 3-5-2)
  and how many **squads** (3, 4 or 5), then click **Build**.
- Each squad shows 11 starters (by position) with the XI average, a **Bench** of 7 subs, and
  a **Chem clusters** line. Tap any row to spotlight that player in the preview.

**How it builds (the moving parts):**
- `buildGauntlet(formationName, n)` does the work and returns `{ squads, depth, ... }`. Each
  squad has `slots` (11 starters, by the formation's position order) and `subs` (7), and each
  filled cell is `{ group, player, score }` where `player` is the real club item.
- **Depth check first (`gauntletDepth`).** It needs `n × 18` distinct usable players and
  enough cover per position group. If not, `renderGauntlet` shows a red warning listing the
  exact shortages (need vs have) and **builds nothing** - no broken squads.
- **Snake draft.** Starters are filled position by position, hardest-to-fill position first;
  each round alternates direction (1..N then N..1) so no single squad hoards the best players.
  Each pick is the best available club player for that position group by an **OVR-aware draft
  score** (`draftScoreFromScore`): a blend of the player's in-game OVR and their Justaino score
  for that slot, weighted `DRAFT_OVR_MIX` toward OVR (0.6 by default). This stops high-rated
  cards - especially icons, which carry few current PlayStyles - from being benched by a
  meta-optimised but lower-rated card. `scorePlayer` and the Meta rating tab are untouched; the
  Justaino score is still what's displayed (pitch "JS" and the per-slot tier colour). Subs are
  drafted by each player's best position (`bestJustaino`), blended the same way.
- **Light chem tiebreaker (`chemPick` + `CHEM_EPSILON`).** Among players within a few points
  of the best draft score, it prefers one who shares a **league** or **nation** already common
  in that squad (read straight off the item: `it.leagueId`, `it.nationId`), then higher rating.
  **Icons are modelled correctly (`isIcon` = `leagueId === 2118`, discovered live):** an icon
  contributes to EVERY league (not just other icons) and counts **double** toward its nation, so
  icons are chem-friendly with everyone and no longer sit out for "no chem". `chemSummary`
  produces the "up to X share a league / Y share a nation" line per squad (icons lift the league
  bloc by +1 each and count double for nation).
- **Squad averages.** `sq.ovrAvg` is the whole-number average OVR of the 11 starters (this is
  the "XI avg" shown in the builder). `sq.avg` is the Justaino-score average, kept for reference.
- Picked players are removed from the pool as they go, so **no player appears in two squads**.

**Console helpers (read-only):**
`window.FC26.buildGauntlet("4-3-3", 3)`, `window.FC26.gauntletDepth(...)`,
`window.FC26.FORMATIONS`.

**Console helper (read-only):** `window.FC26.gauntletSquadIds()` lists the ids this device
recorded when it last created squads (a hint only - removal works off the live list, see §3h).

---

## 3h. New in v14 - create the Gauntlet squads in the game (and undo them)

The Gauntlet section has two action buttons under the squad cards. This is the **only** part of
the tool that *creates* anything on your account, so both are confirmed before they run and
neither ever touches your active squad.

**Create in game** (`runCreateGauntlet`):
- Turns the built squads into real saved squads named **"MGFC Gauntlet 1", "MGFC Gauntlet 2", ...**
  (the prefix is `GAUNTLET_NAME_PREFIX`).
- Confirms first with a dialog listing every squad it will make, and checks the game's **30-squad
  cap** (`countSavedSquads` vs `GAUNTLET_MAX_SQUADS`) so it won't try to overflow.
- Each squad is one `services.Squad.create(name, formationKey, items, false)` call
  (`createGameSquad`). The 4th arg **false** means a normal owned-player squad that is **not** made
  active. `items` is the 18 players in slot order (11 starters then 7 subs) from
  `gauntletItemsForSquad`; the game maps `items[i]` to slot `i`. Formation names map to the game's
  keys via `GAME_FORMATION_KEY` (`4-3-3`->`f433`, `4-4-2`->`f442`, `4-2-3-1`->`f4231`, `3-5-2`->`f352`).
- Progress and a done/failed count show in the status line under the buttons.

**Remove Gauntlet squads** (`runRemoveGauntlet`):
- Deletes every squad whose name starts with the Gauntlet prefix. It finds them by reading your
  **live** squad list (`listSavedSquads`), not by a stored id - so it works on **any device** and
  survives the game **renumbering** squad ids after a delete. It re-reads the list after each delete
  and removes by the current id (`removeGameSquad`, which takes the numeric id, not the entity).
- Your own squads (any other name) are never matched. Confirmed first, lists what it will remove.
- The button label shows the live count (`refreshGauntletCount` -> `state.gauntletLiveCount`),
  refreshed when the section opens and after each create/remove.

**Maintenance notes:**
- To rename the squads, change `GAUNTLET_NAME_PREFIX` (one place) - create and remove both use it.
- The service was discovered live: `create` is 4 args `(name, formationKey, items, dreamFlag)`;
  passing `dreamFlag = true` makes a *concept* squad (that path 500s for owned items, which is why
  the old "duplicate" approach failed). `remove` takes the **id**; passing the entity 400s.

---

## 3i. New in v15 - the full-screen pitch Squad Builder

The Gauntlet builder moved out of the cramped dropdown into its **own screen**. The build logic,
create, and remove are all unchanged (§3g, §3h); this is a redesigned front-end over the same
`buildGauntlet` / `createGameSquad` / `removeGameSquad`.

**How to use it:**
- Under the player list (Lineup) tap **⚽ Squad Builder** (`gtLaunch`). The whole panel body
  switches to the builder; the **‹** back arrow returns to the normal tool.
- Pick a **formation** and **squad count** (3/4/5). Desktop uses segmented buttons plus a
  **↻ Rebuild**; mobile uses two compact dropdowns in the header.
- The **pitch** shows one dot per starter, placed by formation (`FORMATION_DOTS` has the x/y
  percentages per formation, in the same slot order as `FORMATIONS`). Each dot: OVR on a disc
  tinted by the player's Justaino tier (`gtTier`: elite/gold/solid/low), name, then `POS · JS score`.
  Empty slots render as a dashed disc.
- **Switch squads** with tabs (desktop) or number pills (mobile). Only the dots move; the pitch
  animates them (CSS transition on `left`/`top`).
- **Stat strip** = XI average, placed count, biggest league and nation cluster (desktop: a 4-cell
  grid beside the pitch; mobile: a one-line summary above the pitch). The **bench** (7 subs) shows
  as chips - always visible on desktop, collapsible on mobile to keep the pitch large.
- **Create / Remove** live at the bottom with the same confirm dialogs, now with a progress bar
  (`gtProgress`) and a success/failed **toast** (`gtToast`) instead of a plain status line.

**Structure / maintenance notes:**
- The builder is a separate overlay `builderHost` inside the panel body; `state.builderOpen`
  toggles it. `openBuilder` / `closeBuilder` set that flag, swap `builderHost` and `layoutHost`,
  and call `applyPanelChrome()` (which adds the `gt-open` class).
- `renderBuilder()` rebuilds the whole screen and branches on `currentMode()` (desktop vs mobile).
  `renderGtBody` -> `renderGtSquadSwitch` / `renderGtPitch` / `renderGtInfo` / `renderGtBench` /
  `updateBuilderActions` redraw the pieces; changing formation/count calls `onBuildChange` which
  re-runs the draft (`doBuild`).
- The mobile panel has a fixed **minimum height** (`min-height:70vh`, `gt-open` raises it to 86vh)
  so it never collapses when a step has little content.
- To restyle dots/tiers edit the `.gt-dot` / `.gt-disc` / `.t-elite|gold|solid|low` rules in the
  `#fc26-style` block; all colours read the UCL Night tokens.

---

## 3j. New in v16 - real formations, correct sides, and squads that always create

Three fixes/rewrites to the Squad Builder, all so the squads it builds match what the game will
actually accept.

**All formations, straight from the game (the dropdown).**
- The formation list is no longer hardcoded. On load (and each time you open the builder)
  `buildFormationCatalog()` reads the game's own catalog via `repositories.Squad.getFormations()`
  and fills five tables, all keyed by the game's formation name (`f.name`, e.g. `f433`, `f4231a`):
  `FORMATIONS` (11 position-group strings), `FORMATION_DOTS` (pitch coords + slot label per slot),
  `FORMATION_SIDES` (L/R/C per slot), `FORMATION_LABEL` (display name), `FORMATION_ORDER`.
- That means **every** formation the game offers is available - ~29 of them, including both
  **4-2-3-1** variants (the RM/CAM/LM one and the three-CAM `f4231a`), the four 4-3-3s, 4-4-1-1, the
  5-at-the-back shapes, etc. The picker is now a **dropdown** (desktop and mobile) showing display
  names via `fmtFormation`.
- `create()` gets the formation's own name as its key (no translation table), and the slots/pitch
  are built from `f.positions` in the game's order, so what you build = what the game expects.
- The one thing the game data lacks is pitch x/y, so `POS_COORD` supplies a fixed per-position-id
  layout (cosmetic only - just where to draw the dot). To nudge a formation that looks off, edit
  `POS_COORD` for that position id.
- If `getFormations()` ever returns empty (formations not loaded), the builder shows "Open the
  Squads screen once, then reopen" instead of guessing.

**Left/right placement (`canPlaySlot` + `POS_SIDE`).**
- `POS_GROUP` still merges both flanks into one group for **scoring** (RB / LB, RM / LM, RW / LW),
  but placement now respects the side. `POS_SIDE` marks the right/left position ids (from the game's
  `window.PlayerPosition` enum), and `canPlaySlot(it, group, side)` only lets a player into a
  sided slot if they actually play that side. A both-sided player still qualifies for either. Depth
  (`gauntletDepth`) is side-aware too, so a shortage on one flank (e.g. no left-backs) is reported.

**Squads that don't get rejected with a 460.**
- **Loan players are excluded** from the pool (`isLoanPlayer`): match-count loans (`it.loans > -1`,
  e.g. an Icon loan) *and* timed/expiring loans (`it.endTime > 0`; permanent cards use `-1`). The
  game refuses a loan in a saved squad, so drafting one guaranteed a failed create.
- **No duplicate player per squad.** The game rejects a squad with the same player twice (even two
  different cards/rarities of him). Each squad carries a `keys` set of `playerKey(it)`, and the
  draft skips a candidate whose player is already in that squad (XI **and** bench). `playerKey`
  prefers a numeric `assetId` but those come back 0/undefined on club items, so it falls back to the
  player's `firstName|lastName` from `getStaticData()` - the only identity two card versions reliably
  share. Different squads can still each have that player.
- Create also retries a failed squad up to 3× with a longer settle (`RETRY_ATTEMPTS` /
  `RETRY_SETTLE_MS`) and reports the real per-squad reason in the toast.

## 3k. New in v20 - OVR-aware draft + correct icon chemistry

Two fixes so the builder starts your best cards (see the `CHANGELOG` for the plain-English version):
- **OVR-aware draft.** The draft ranks by `draftScoreFromScore(sc)` = `DRAFT_OVR_MIX * OVR +
  (1 - DRAFT_OVR_MIX) * Justaino`. **`DRAFT_OVR_MIX` was 0.6 here in v20; it is 0.1 as of v32** -
  see the note in §3q. (The live value is `CFG.draftOvrMix`, editable in Peks Lab.) `scorePlayer` / the Meta rating tab are
  untouched; the Justaino score is still what's displayed. Candidates carry a `disp` (Justaino) field
  through `chemPick`, stored as `cell.score` so the pitch "JS" and disc-colour tiers stay Justaino.
- **Icons.** `isIcon(it)` = `it.leagueId === 2118` (discovered live - no `isIcon()` method, and
  `rareflag` varies per promo). In `chemAffinity`, an icon on either side links every league (+1) and
  counts double (+2) for its nation; `chemSummary` lifts the real-league bloc by +1 per icon and
  doubles their nation. The "XI avg" stat is `sq.ovrAvg` (whole-number OVR average of the 11 starters);
  `sq.avg` is the Justaino-score average, kept for reference.

## 3l. New in v21 - per-squad formations

Each of the N Gauntlet squads can now use its own formation.
- **Data model.** `gtFormations` is an array (one formation name per squad). `ensureFormations()` fills
  any missing/invalid entry with the global default `gtFormation` and trims extras when the count
  shrinks; `setAllFormations(v)` sets `gtFormation` and every entry. `doBuild()` passes the whole array
  to `buildGauntlet(gtFormations, gtCount)`.
- **`buildGauntlet(formationInput, n)`** now accepts a formation NAME (broadcast to all) **or** an
  ARRAY (one per squad); `normFormations` normalises either into N valid names, so the console helper
  `window.FC26.buildGauntlet("f433", 3)` still works. Each squad carries its own `sq.formation`, and the
  starter draft gives each squad its own scarcest-first `slotOrder` (still 11 snaked rounds, still
  no-overlap). `gauntletDepth(formations, n)` sums demand across the per-squad formations.
- **UI.** The top **"All"** picker calls `setAllFormations` (sets every squad). Desktop: each squad tab
  (`renderGtSquadSwitch`) is a `<div>` holding a per-squad formation `<select>` (`.gt-tabsel`); its
  `mousedown`/`click` are stopped so it doesn't re-trigger the tab. Mobile: the number pills pick the
  squad and a single `.gt-mform` "Squad N formation" `<select>` edits the active one. `renderGtPitch`
  draws from `FORMATION_DOTS[sq.formation]`, and `runCreateGauntlet` passes `sq.formation` per squad to
  `createGameSquad` (which already took a formation per squad).

---

## 3m. New in v23 - instant refresh after apply / remove (how it works)

Applied and removed evos now update the card on screen straight away, without a manual
`↻ Reload club`. This matters most on mobile, where the old approach often didn't update at all.

- **The old bug.** After an apply, the tool used to call `loadFullClub()` (the app's `Club.search`)
  to pull the card back with its new PlayStyles. But once your club is in memory, that search
  **caches the whole club and keeps serving the pre-evo copy**, so the card looked unchanged until a
  later manual reload happened to catch a refresh.
- **The fix - use the service response.** `services.Academy.addItemToSlot(...)` (our `applyEvo`)
  returns the freshly-graded card at **`res.data.updatedItem`** (confirmed live; the response's
  `data` keys are `activeSlots / inactiveSlots / isMaximumNumberOfSlotsReached / updatedItem /
  objectiveUpdates`). `applyUpdatedItem(res)` pulls that item out, and `upsertClubItem(item)` drops
  it into our `state.clubItems` snapshot (replacing the old copy by id). So the list + preview redraw
  from the response itself - no dependence on the cached search. `runSingle`, `runBatch`, and
  `runRemove` all do this; they only fall back to the old reload-and-poll loop if a response somehow
  carries no usable item.
- **`upsertClubItem` on mobile.** If our snapshot is empty/thin (the full club can be slow to load on
  a phone, so the list is served from the app's own collection), it seeds `state.clubItems` from
  `repositories.Item.getClub()` first, then replaces the one applied card - otherwise it would collapse
  the list to a single player.
- **Removal responses.** `removeEvoUpgrade` is read the same way (`res.data` first, `res.response` as a
  fallback) for both the reverted card and the `lastEvoRemoved` flag.

---

## 3n. New in v24 - the Justaino Score page (Rankings + Best XI) and the mobile score fix

The **Meta rating is renamed "Justaino Score"** and moved out of the lineup column onto its own
full-screen page, built on the same shell as the Squad Builder. There is also a small mobile fix.

**How to use it.** In the Lineup column, tap the **Justaino Score** tile (📊, next to Squad Builder).
The page has a back arrow (‹) and two tabs:

- **Rankings** - unchanged behaviour: pick a position and how many players to show; the club is
  ranked by Justaino Score for that position. Tap a row for the detail card (below).
- **Best XI** - pick a **formation** and a **"Top N"** count. Team 1 is your strongest XI for that
  formation by Justaino Score; Team 2 is the strongest XI of the players **left after** Team 1, and
  so on (a depth chart - no player appears in two teams). The pills switch which team is on the
  pitch; the stat strip shows **JST avg** (the XI's Justaino average), **OVR avg**, **Placed** and
  the biggest **League** bloc. **Nothing is created in the game** - this is a preview only. To
  actually build/save squads, use the Squad Builder.

**Player detail card.** Tapping a ranked row OR a pitch dot opens a detail card **inside the page**
(it does not jump into the evo tool): big OVR + Justaino pill, a **JST Score by position** breakdown
(every position the card can play, scored, best first), face stats, and current PlayStyles. The back
arrow returns to whichever tab you came from. The **Edit PlayStyles →** button is the only thing that
leaves the page - it closes Justaino Score and opens that player in the PlayStyle Deck.

**How it's built (for maintenance).**
- `buildMetaBoards(formationName, teamCount)` (near `buildGauntlet`) does the depth-chart draft.
  It reuses `gauntletPool()` (excludes loan/expiring cards), `canPlaySlot`, and `scorePlayer(...).total`
  (pure Justaino Score, **not** the OVR-heavy `draftScoreFromScore` the Squad Builder uses). Exposed as
  `window.FC26.buildMetaBoards("f433", 3)` for console checks.
- The page is a hidden `metaPageHost` (a `.gt-builder`) toggled by `openMetaPage()`/`closeMetaPage()`,
  mirroring the Squad Builder's `openBuilder`/`closeBuilder`. `applyPanelChrome()` adds the mobile
  `gt-open` height class when either page is open, and `applyLayout()` re-shows it after a phone/desktop
  flip. `renderMetaPage()` draws the tabs + the active view; `metaView` is `"rank"` or `"xi"`;
  `metaDetail` (an item) makes it draw `renderMetaDetail()` instead.
- The pitch, dots and stat strip reuse the Squad Builder's `.gt-pitch/.gt-dot/.gt-statstrip` styles;
  the ranking rows reuse `.meta-row` etc.; the detail card reuses the spotlight's `.pv-*` styles.
  Only a few `.mp-*` rules are new (tabs, page body, detail card, per-position chips).

**Mobile Justaino score fix.** On a phone the player is shown by the **PlayStyle Deck summary bar**
(`renderDeckSummary`) and the **Review** header (`renderReviewSummary`), which showed the OVR but not
the score. Both now render a compact `JUSTAINO xx.x · GRP` pill (`.ds-jr`) stacked under the OVR, from
the same `bestJustaino(it)` the desktop spotlight uses. Single player only (a batch has no one score).

---

## 3o. New in v26 - create a Best XI as a real squad, rankings search, FUTTIES

Three additions: the Justaino Score page can now **create squads**, its Rankings view has a
**search box**, and **FUTTIES** (rarity 16) is recognised and evo-eligible.

**Create a Best XI squad (with a bench).** On the **Justaino Score -> Best XI** view, under the
pitch, whichever team you're viewing (Team 1 = best XI, Team 2 = 2nd best, ...) now shows a **bench
preview** and **Create / Remove** buttons.
- **Create** saves that XI as a real in-game squad named **"Justaino Score Squad N"** (N = the next
  free number), in the formation shown. It confirms first (listing the whole bench), respects the
  30-squad cap, never touches your active squad, and retries a create that gets a transient 460.
- **The bench** is the next-best cover after the XI: guaranteed one each of **ST, LM, RM, CM, CB,
  LB/RB** (wide mids/backs are side-correct), then the 7th sub is your best remaining player. Any
  spot the club can't cover is reported and filled with your next-best instead. **No backup GK** by
  design. **Since v33 no player appears twice anywhere on the chart** - see §3r.
- **Remove Justaino Score squads** deletes every squad whose name starts with `Justaino Score `.
  This is **separate** from the Gauntlet remove: each button only ever touches its own squads (own
  name prefix + own tracked-id list in localStorage: `FC26_justainoScoreSquadIds`).

*How it's built:* `buildBestXiSquads(formationName, teamCount, board)` (near `buildMetaBoards`)
drafts every team's bench from `JSCORE_BENCH_REQS`, returning Gauntlet-shaped `{ slots, subs }`
squads so they reuse `gauntletItemsForSquad` + `createGameSquad`. UI + the
`runCreateJustainoSquad` / `runRemoveJustainoSquads` handlers live in `renderMetaXiInto`. Console:
`window.FC26.buildBestXiSquad("f433")` and the readable `window.FC26.previewBestXiSquad("f433")`.

**Rankings search.** The Rankings view has a **"search this position by name..."** box. With text
in it, the list shows only players who can play the chosen position **and** match the name, each at
their **true rank** in your full list for that position (even if outside the top N). Empty box = the
normal top-N view. Accent-tolerant (reuses `playerSearchText`/`normName`). `renderMetaRating` now
ranks against the **full** list (`metaTop(group, 1e9)`) and filters/relabels ranks from there.

**FUTTIES (rarity 16).** Added `"16": "FUTTIES"` to the (now one-per-line) `RARITIES` map and to
`ELIG_SEED`. Because existing installs already have a saved eligible list, `ELIG_MERGE_ONCE = [16]`
force-adds it **once** (tracked in `FC26_eligibleMerged`) so it turns on without wiping your own
tweaks; remove it later and it stays removed. To make a future rarity eligible for everyone, add its
id to both `ELIG_SEED` and `ELIG_MERGE_ONCE`.

---

## 3p. New in v27 - the Club Dashboard (display only)

A third full-screen page (after Justaino Score and Squad Builder) that reads your loaded club and
shows player stats + fun facts. It's **read-only** - it never creates or changes anything in game.

**How to use it.** In the Lineup column tap the **🏟️ Club Dashboard** tile (next to Justaino Score /
Squad Builder). The page scrolls through six cards, top to bottom:
- **Hero strip** - Players, Avg OVR (gold), Nations, Leagues, Icons.
- **Club records** - one standout card per stat: Fastest/Strongest/Sharpshooter/Playmaker/Magician/
  The Wall (from the 6 face stats, outfield only), plus Highest OVR and Top Justaino Score (everyone).
- **Rating spread** - a histogram of how many cards fall in each OVR band (90+ / 85-89 / 80-84 /
  75-79 / <75).
- **Squad DNA** - the average of each outfield face stat (PAC/SHO/PAS/DRI/DEF/PHY) as bars + a
  one-line read of your strongest/softest areas.
- **Position depth** - how many players can fill each position group; groups with fewer than
  `DEPTH_THIN` (5) covers are flagged amber.
- **PlayStyle insights** - total PlayStyle+, most common PlayStyle+, most-kitted card, cards with none.

**How it's built.** Mirrors the other pages exactly: a launcher tile (`dashLaunch`, class
`.gt-launch`), a full-panel host (`dashHost`, class `.gt-builder`, hidden until opened), and
`openDashPage()` / `closeDashPage()` that flip `layoutHost` out and `dashHost` in - the same pattern
as `openMetaPage`/`openBuilder`. `applyPanelChrome()` adds the mobile `gt-open` height class when
`state.dashOpen` is set (alongside `builderOpen`/`metaPageOpen`). `renderDashPage()` draws the header
(reusing `.gt-bd-top`) then a scrolling `.db-body` with the six cards.

The data all comes from small pure helpers over `getClubPlayers()`, each exposed on `window.FC26`
for console spot-checks: `computeClubSummary` (`FC26.clubSummary`), `computeClubRecords`
(`FC26.clubRecords`), `computeRatingSpread` (`FC26.ratingSpread`), `computeSquadDNA`
(`FC26.squadDNA`), `computePositionDepth` (`FC26.positionDepth`), `computePlayStyleInsights`
(`FC26.playStyleInsights`). They reuse the existing engine: `readStats` for face stats,
`bestJustaino`/`scorePlayer` for the Justaino record, `playerPositionGroups` for depth, `isIcon` for
the icon count, and `currentPlayStyles`/`traitName` for the PlayStyle stats. Styling is a new block of
`.db-*` classes in the injected `<style>`, all reading the theme tokens (`var(--accent)` etc.) so it
follows the selected theme; the only fixed colour is the amber (`#ffb454`) used for thin-depth, which
is semantic (like the Stop button's red), not the accent.

*Not yet built (deferred):* **Top nations** and **Top leagues** bar charts - they need an ID->name
catalog for `nationId`/`leagueId` (the club only gives the numbers), so they were left for a later
version. Tapping a record to open that player is also a planned polish pass, not in v1.

---

## 3q. New in v29 - Peks Lab (rank by YOUR weighting)

Everything in §3d is **my** opinion of the meta, shipped as the default. Peks Lab lets
you override those numbers and rank your club by your own opinion instead, without losing mine.

**The rule: two scores, never both at once.** One switch decides which score the WHOLE hub speaks -
Rankings, Best XI, the Squad Builder draft and the score pill on a player card. There is deliberately
no state where half the tool disagrees with the other half.

**How to use it.** Open **Justaino Score**, then the **🔧 Peks Lab** pill at the top right. The pill
gains an accent ring + glow whenever a custom score is live, so you can never be looking at custom
rankings unaware.

- **Active score** - the switch. `Justaino Score` or `My Score`. Flipping it does NOT delete your
  tuning, so you can A/B your numbers against mine freely. While Justaino is active the tuning
  cards below are dimmed and their sliders disabled.
- **Start from** - four presets, each just a set of the sliders below: *Justaino baseline* (clears
  everything), *Stats purist*, *PlayStyle maxxer*, *OVR respecter* (puts `ovrMix` back to 0.15, i.e.
  how the hub ranked before v28). A preset chip lights up only while the settings exactly match it.
- **Balance** - `statMix` vs PlayStyles. The single biggest lever on rankings. The two always total
  100 (`psMix` is never stored, it's always the remainder), so there's no invalid state.
- **Dials** - `ovrMix` (0-25%), `psPlusMult` (1-6x), `psCeilPlus` (3-8). Each caption states my
  baseline value so you can see how far you've wandered.
- **Reset to Justaino** - wipes every custom value AND switches back. Confirmed first.

Everything **applies and saves the moment you move it** - there is no Save button, because the
point is watching the ranking move. Closing the page returns you to the Justaino Score page and
re-renders it, so you see the new order immediately.

### How it works in the code

- `SCORE_DEFAULTS` snapshots the baseline constants (`STAT_MIX`, `OVR_MIX`, `STAT_WEIGHTS` ...).
  **Those loose vars are still the single source of the baseline and `meta-page.js` parses them out
  of the source BY NAME to build `meta-rating.html` - do not rename or restructure them.**
- `scoreState.cfg` holds **only the differences** from the baseline, saved to localStorage
  `FC26_scoreCfg` as `{v:1, on:<bool>, cfg:{...}}`. Storing deltas (not a full copy) means an
  untouched knob follows the next seasonal retune (§7b) instead of freezing at an old number.
- `CFG` is the two merged and **clamped** (`SCORE_LIMITS`), rebuilt by `rebuildCfg()` on every
  change. **`scorePlayer` and friends read `CFG` and nothing else.** Nothing caches a score, so a
  change plus a repaint is all it takes for the whole hub to follow.
- `isCustomScore()` = switch on AND at least one difference. A switch that's on but untouched is
  still identical to mine, so it correctly reports `false`.
- Saving can genuinely fail: the EA web app fills localStorage with its own multi-megabyte
  `console-history` key and blows the ~5MB quota. `saveScoreState()` returns false and warns in the
  Console, and the page shows a red banner telling you to run
  `localStorage.removeItem('console-history')`.

**Console API:** `window.FC26.score.cfg() / .on(bool) / .set(key, value) / .reset() / .isCustom() /
.label() / .saved()`, plus `window.FC26.openScorePage()`.

### "Who this moves" (the live re-ranking, v30)

The card under the dials shows your top 6 at a chosen position under the current settings, with how
many places each has moved **against the Justaino order**. Drag any slider and it re-sorts live.

- `withBaselineScoring(fn)` runs `fn` with the scorer briefly forced onto the baseline, then puts
  the live `CFG` object straight back. There is only ever ONE scorer, so the "before" order can
  never drift from what the rest of the hub does.
- The baseline order can't change while you drag, so it's cached per position in `impactBaseline`.
  **That cache is cleared on a club reload** (it was measured against the old club).
- Refreshes are throttled to one per animation frame - a range input fires `input` far faster than
  a whole club needs re-ranking.
- The card is deliberately NOT dimmed with the other tuning cards: while the Justaino Score is
  active it shows your genuine current top 6 with no movement, i.e. the "before" picture.

### How the label carries across the hub (v30)

Everything that names the score calls `scoreLabel()`, so it says "Justaino Score" or "My Score"
depending on what's active: the score pill (desktop spotlight AND mobile Deck bar), the Lineup
tile, the Justaino Score page title, the Rankings note (which also states the live mix), the
Rankings player-detail view, and the Club Dashboard's top-score record.

**Squads.** `jscoreNamePrefix()` follows the active score, so a squad drafted on your weighting
saves as **"My Score Squad N"**. `isJscoreSquadName()` matches BOTH families, so squads made before
you started customising still clean up, and `nextJscoreSquadNumber()` counts both so you never get
two Squad 2s. Gauntlet squads are untouched by either.

**Cache trap (fixed in v30):** the Best XI view keeps its drafted boards in `metaBoards` and only
redrafts when that's empty, so changing the scoring and returning would have shown the OLD XIs
under the new label. Every score mutator now calls `invalidateScoreCaches()`, which clears
`metaBoards` and re-stamps the Lineup tile's title. The Gauntlet Squad Builder needs no such
handling - `openBuilder()` calls `doBuild()` unconditionally, so it redrafts every time it opens.

**Score by position (v30).** `scoreByPositionHTML(it)` renders a card's score at EVERY position it
can play, best first, top one accented. It's shared by the Rankings detail view, the desktop
spotlight card and the mobile Deck summary, so the three can't disagree. Worth having on the
player card because the pill only ever shows a player's BEST position - a card can be a middling
CM and an excellent CDM and you'd never see it.

### Advanced (v31)

Folded away by default, under the impact list. Four things live here:

- **Stat weights, per position.** A dropdown picks the position, then a slider per stat, each
  showing my baseline for comparison. Keepers get their six GK stats and correctly get NO skill
  moves / weak foot rows (`TRAIT_STAT_WEIGHTS` has no GK entry). An edited position is marked with
  a **•** in the dropdown and has its own "Reset <pos> to Justaino".
- **Your own PlayStyle weights, per position** - see below.
- **Role priority curve** - the four `rankCurve` numbers behind `roleWeightsFromList`.
- **Squad Builder draft** (`draftOvrMix`) - how much those squads lean on OVR rather than the score.
  **Default lowered from 0.6 to 0.1 in v32.** The 0.6 was set in v20 to stop high-OVR icons (few
  PlayStyles) being benched, but at that time the score ITSELF carried 35% OVR, so 0.6 really meant
  ~74% OVR. We cut `OVR_MIX` twice afterwards and never revisited this. Measuring a real 546-player
  club also showed "60%" behaving like ~47%, because a weighted average only splits influence evenly
  when both inputs have a similar SPREAD (OVR spread 11.75 vs score spread 20.2; the 28-point gap
  between their averages is a constant that cancels out). At 0.1 the Gauntlet draft follows the
  active score, with OVR as a light nudge for genuine near-ties.

**The nested-write trap.** `setScoreValue("statWeights", {...})` would REPLACE the whole override
object, wiping every other position you'd tuned. `setNestedWeight(table, group, key, value)` reads,
modifies and writes back a single number instead, and prunes now-empty parents so "no differences"
really means an empty `cfg` (which `isCustomScore()` keys off).

### Your own PlayStyle weights, per position (v31)

The one thing the sliders can't express: WHICH PlayStyles matter at a position, and by how much.

- `baselinePsWeights(group)` builds the PlayStyle -> weight table the position uses today, merged
  across every role it can be played in, taking the HIGHEST weight any role gives each PlayStyle.
  **This is exactly the table `meta-rating.html` publishes**, and it's what a custom list is seeded
  from, so you adjust my numbers rather than start cold.
- Taking a position over stores `cfg.psWeights[group]`. In `scorePlayer`, a position with its own
  table gets ONE candidate (`role: "Your list"`) **instead of** its role candidates - so a
  customised position stops scoring by best-fitting role entirely. That's deliberate: once you've
  said what matters there, there's nothing left to fit a role against. Anything not on the list is
  worth zero at that position.
- The 0-100 ceiling (`psMaxForWeights`) follows YOUR list, so a very short list makes scores
  swingy - hence seeding from the full table rather than an empty one.
- GK-only PlayStyles (catalog flag `g:1`) are offered only for GK.
- "Score <pos> by role again" (`dropOwnPsList`) hands it straight back; other positions are
  unaffected either way.

**Console API (advanced):** `window.FC26.score.setWeight(group, stat, v) / .setTrait(group, "sm"|"wf", v)
/ .setCurve(i, v) / .clearGroup(group) / .psBaseline(group) / .psStart(group) / .psSet(group, name, v)
/ .psDrop(group)`.

**Scroll position (v31).** `renderScorePage()` rebuilds the scrolling body, which is a NEW element
starting at the top, so every button that redraws used to fling you back to the switch. It now
remembers `.ss-body`'s `scrollTop` and restores it after the rebuild (twice - once immediately, once
on the next frame, since a taller/shorter page can clamp the first attempt). **If you add a button
that redraws another full-page view, it needs the same treatment** - the fix isn't inherited.

---

## 3r. New in v33 - Best XI benches never overlap

**What changed.** On **Justaino Score -> Best XI**, the depth-chart teams now share one squad of
players: **nobody appears twice across the whole chart**, starters or subs.

Before, only the starting XIs were kept apart. Each team's bench was drafted from "the whole club
minus *this* team's 11", which meant:
- Team 1's bench was, in effect, Team 2's spine, and
- Team 2's bench could pick **Team 1's starters** - your best player in the club could show up as a
  Team 2 sub.

So creating Team 1 and Team 2 in game gave you two squads fighting over the same cards.

**How it works now.** `buildBestXiSquads(formationName, teamCount, board)`:
1. builds the board as before (the XIs were already used-once across teams),
2. makes **one** bench pool = the club minus **every** team's XI,
3. drafts each team's 7 subs out of that shared pool **in order**, splicing picks out as it goes.

**Team 1 fills its whole bench first, then Team 2, then Team 3.** That's deliberate: the chart is
ranked, so your best squad should also get the best bench. The trade-off is real and expected:

- **Team 1's bench is weaker than it was in v32**, because the players it used to bench are now
  reserved as Team 2 / Team 3 starters. Nothing is broken - those players are still in the chart,
  just wearing a different shirt.
- **Later teams thin out** and hit `missing` (a required ST/LM/RM/CM/CB/LB-RB the club can't cover)
  more often. The page already reports that under the bench.
- Showing **3 teams** reserves for 3 teams even if you only create Team 1. Drop the team count to
  1 if you want Team 1's strongest possible bench.

The bench label says **"no player used twice"** instead of "next best" whenever more than one team
is on screen, so the change is visible without reading this.

**Caching.** `metaRebuildBoards()` now also stores `metaSquads` (all teams' benches) alongside
`metaBoards`, and `metaSquadFor(idx)` reads it. Benches **cannot** be drafted per team on demand any
more - they share a pool, so they're built together. Clicking a team pill re-renders but does not
re-draft; only a formation/count change or a club reload rebuilds. If you add anything that changes
the club or the score, make sure it calls `metaRebuildBoards()` (not just a re-render), or the
benches will be stale.

**Console self-check:**
```js
window.FC26.checkBestXiOverlap("f433", 3)
// -> { teams: 3, playersUsed: 54, duplicates: "none", benchAvgs: [...] }
```
`duplicates` must be `"none"`. `playersUsed` should be 18 x teams, minus any cell the club was too
thin to fill. `benchAvgs` shows the intended Team 1 > Team 2 > Team 3 drop-off. Also:
`window.FC26.previewBestXiSquad("f433", 1, 3)` prints Team 2 of a three-team chart in full.

**Also in v33: "Score Customiser" is now "Peks Lab".** Label only - no behaviour, storage key or
function name changed (`FC26_scoreCfg`, `scoreState`, `renderScorePage` etc. all keep their names).
The **file stays `score-customiser.html`** so the published guide URL doesn't break, and the mobile
short label is now just "Peks Lab" (it used to shorten to "Customise"). If you rename it again, the
places to touch are: the pill in `renderMetaPage` and its `title`, the page header in
`renderScorePage`, the storage-full warning in `saveScoreState`, `score-customiser.html` (title,
lede, step 3, FAQ), the footer link text in `meta-page.js` (then re-run `node meta-page.js`), and
`features.html`.

---

## 3s. New in v34 - pinned cards, a two-tab phone flow, and the BUILD ID

### Pinned "fresh" cards (why applied PlayStyles used to vanish)

**The bug.** You applied a PlayStyle, it worked, and then the card in the Lineup showed no sign of
it. Intermittent, and on desktop as well as mobile.

**The cause.** `services.Club.search` serves the club **from the app's own in-memory store**, and
that store can keep handing back the pre-grant copy of a card. `loadFullClub()` used to finish with
a flat `state.clubItems = all`, so those stale copies overwrote the freshly-graded card we had just
planted. It was a race: the background club sweep that starts when the panel opens is slow, so
whether it landed before or after your apply was down to timing.

**The fix - `state.fresh`.** Whenever the server hands back an `updatedItem` in reply to one of our
own `Academy` calls, `rememberFresh(item)` pins it. `mergeFresh(list, complete)` then overlays those
pins on every club load, so a stale search can never undo a change we know happened.

Rules worth knowing:
- A pin **only ever replaces** an entry already in the list. It never adds one back, so a card you
  sold or used in an SBC can't reappear as a ghost.
- A pin **retires itself** when the loaded copy has an identical PlayStyle fingerprint (`psSig`),
  meaning the store has caught up, or when a **complete** load (`retrievedAll`) doesn't contain the
  card at all.
- Pins **carry across a bookmarklet rebuild** (see `prevFresh` at the top of the file), so a reload
  straight after a re-paste is safe.

Console helpers:

```js
FC26.fresh()        // ["Mbappé (3 PlayStyles)", ...] - what's currently pinned
FC26.clearFresh()   // forget them all and trust the next club load completely
```

**`loadFullClub()` is now a wrapper** around `sweepFullClub()` with an in-flight guard: a second
call joins the running sweep and shares its promise instead of starting a rival that races to write
`state.clubItems`. It also owns the Reload button's busy state. Note the panel used to run the
whole "first draw + club load" block **twice** (once mid-file, once at the end), so every run kicked
off two sweeps; the mid-file copy is gone.

### The phone flow: two tabs, not three

`STEP_LABELS` is now `["Lineup", "Build & Apply"]`. Step 2 of `renderWizStep()` appends
`preview`, `spotHint`, `buildMod`, `applyMod` - **the same element instances** the desktop dock uses
in its narrow `r2` pane, in the same order. They're re-parented, not cloned, so every listener and
all state survives the move.

Removed along with the third step (each has a note in the source where it used to live):
`reviewReady()` and the gated Review tab, `deckSummary`, `reviewSummary`, `capMetersHTML`, the dead
`wizWho`/`updateWizWho`, both "← Back to players" buttons, and the CSS for all of it.

**Mobile-only difference:** the card sits directly above the grid now, so `renderPreview()` folds
its heavier half (item line, score-by-position, face stats, current-PlayStyle chips) behind a
`.pv-more` toggle, defaulting closed. Hero, eligibility row, capacity meters and the remove buttons
stay visible. Desktop shows everything with no toggle. The preference reuses the old
`FC26_deckStatsOpen` key so an existing choice carries over.

### Club-load feedback

The main `status` line lives in `applyMod`, which on mobile was only in the DOM on the old Review
step - so "Loading full club… 320" was being written to a detached element and the Reload button
looked dead. There's now a second line, `clubStat`, **inside the Lineup module**; `setClubStatus()`
writes to both, so desktop is unchanged.

Two timings in the source, both deliberate: `RELOAD_MIN_MS` (650) holds the spinner long enough to
see, because a warm club comes back in one page in a couple of hundred milliseconds, and
`RELOAD_DONE_MS` (2600) is how long the "✓ Club loaded" confirmation lingers. **Neither delays the
data** - the list is already updated underneath.

> **Gotcha worth remembering:** the Reload button's look lives in the **stylesheet**
> (`.fc26-reload`), not in an inline `style.cssText` like most buttons in this file. An inline style
> always beats a stylesheet rule, so while the colours were inline the `.busy` / `.done` classes
> went on but nothing changed on screen.

### The BUILD ID (stop testing stale code)

`node minify.js` stamps `FC26_VERSION` with `dev-<6 hex>`, a fingerprint of the code, and prints it.
The panel's **header badge shows the same id**, so you can tell at a glance which build is running.

```
node minify.js
pbcopy < bookmarklet.txt      # copy the FILE, never the editor buffer
```

Copying out of the editor is what caused a wasted round of testing: the editor served a cached copy
and the badge said `dev` either way. `release.js` overwrites the same slot with the real `vN` when
you cut a version, and blanks it before comparing builds, so its "no change" check is unaffected.

`FC26.diag()` returns the running build plus whether the status line and Reload button are actually
on screen and what size they are. It **returns** the object rather than logging it, because a bare
`console.log` evaluates to `undefined`, which is all some mobile consoles show you.

---

## 3t. New in v35 (+v38) - applied receipts (the count always moves now)

**The bug.** You applied a PlayStyle, the call succeeded, and the meters on the card didn't move.
Intermittent, and more likely on players from deep in the club list.

**The cause - and it isn't ours.** EA runs Evolutions and the club on two different services. The
grant happens immediately, but the club service publishes it **on its own schedule**, sometimes
minutes later. Proven live: `Academy.addItemToSlot` returns a success whose own `updatedItem`
reports **zero** PlayStyles, and a genuine `POST /ut/game/fc26/club` moments later says the same.
So every version up to v34 was asking a question nobody could answer yet, and drawing the old
numbers when the answer came back stale. Pure timing, which is why it came and went.

**The fix - stop asking.** When our own apply call comes back successful, we already know exactly
which PlayStyle landed. So we write ourselves a **receipt** and show it. No polling, no extra club
reads, no waiting on EA.

How it works in the code (all in `fc26-tools.js`):

| Piece | What it does |
|---|---|
| `state.applied` | A Map of `itemId -> [{traitId, isIcon}]` - the PlayStyles we applied this session that the game's own card data hasn't published yet. |
| `noteApplied(itemId, traitId, isPlus)` | Files a receipt. Called at the exact point each apply succeeds, in all three apply paths (single, batch, GH 4th). |
| `effectivePlayStyles(it)` | **The one function everything visible should use.** Returns the app's own PlayStyle list **plus** any receipt still missing from it. |
| `forgetApplied(id)` | Tears up a card's receipts. Called after a remove/clear, because the card just went backwards. |
| `oneEach(list)` | **v38.** Enforces one entry per PlayStyle - see below. |

`effectivePlayStyles` is **self-cleaning**: every time it runs it drops any receipt the app's own
copy now shows, so a PlayStyle can never be counted twice and a receipt can't linger forever.

### One PlayStyle, one slot (v38)

**A card holds each PlayStyle once - either as the basic or as the "+", never both.** Applying the
"+" to a style you already had **upgrades that slot** and hands the basic back. So a card with
Finesse and Power Shot as basics, given Finesse+, holds 1 PS+ and 1 basic - not 1 and 2.

Two things got that wrong before v38, and both are worth remembering if you touch this code:

1. A receipt says "Finesse+ landed" while the app's card data still lists "Finesse basic", so the
   merged list held both. `oneEach()` now drops the basic whenever the same trait is present as a
   "+". **The "+" always wins** - it's the upgrade.
2. `numPlus` / `numBasic` used to return `Math.max(the app's count, ours)`. That was built for the
   app lagging **low** after an apply - but on an upgrade it lags **high**, still counting the
   basic it gave back, and the max kept the stale number. They now believe **our** count while
   receipts are pending for that card (`pendingFor(it)`), and fall back to the max once there are
   none, where the app's own data is authoritative again.

`hasEvo` follows the same rule: it reads the effective list first, and because a trait appears
there only once, that entry settles it outright - a style held as a "+" is no longer held as a
basic. `renderPreview` calls `numPlus` / `numBasic` rather than doing its own sums, so the meters
can never disagree with the chips underneath them or with the caps the deck enforces.

What reads it: the capacity meters and chips on the spotlight card, the PS+ icons in the Lineup and
the Rankings list, the "already owned ✓" ticks in the deck, the cap arithmetic (`hasEvo`,
`numBasic`, `numPlus`) and the Justaino Score. `currentPlayStyles(it)` still exists and is still the
raw, unvarnished answer from the app - use it only where you deliberately want that (e.g. `psSig`,
which compares a club copy against a pinned one).

Receipts **survive**: they're keyed by player id, so a Reload club can't lose them, and they're
carried across a bookmarklet rebuild alongside the club (`prevApplied`).

Two things this replaced:

- The 4-attempt **"Waiting for the grant to register..."** retry polls in single apply, batch apply
  and GH 4th are **gone**. They re-loaded your club up to four times per apply and never actually
  hit the network anyway (`services.Club.search` is answered from memory), so they were slow *and*
  useless. Applying is noticeably quicker now.
- One guard was kept: if EA returns an updated card carrying **fewer** PlayStyles than the card
  started with, we refuse it rather than adopt it, so a laggy reply can't wipe PlayStyles the
  player already had.

Console escape hatches:

```js
FC26.applied()        // ["Vinicius Jr: Rapid+", ...] - receipts the game hasn't caught up with yet
FC26.clearApplied()   // tear them all up and show only what the app itself reports
```

`FC26.applied()` returning receipts is **healthy** - it means a grant landed and EA hasn't published
it yet. It returning "No pending receipts" just means the game has caught up. Both are fine.

This sits alongside the v34 pinned-card system (`FC26.fresh()`), it doesn't replace it: pinning
keeps the freshest **card** through a club load, receipts keep the freshest **PlayStyle list**
through EA's lag.

---

## 3u. New in v36-v37 - the categorised deck and the tap cycle

The deck used to be a flat A-to-Z grid, shown one tab at a time. It's now **grouped under six
categories**, with **one tile per PlayStyle** instead of two tabs.

> **A note on the history:** v36 shipped this as rotated **diamonds**. Peks called them ugly AF,
> so v37 put the original square tiles back and kept everything else. If you ever fancy the
> diamonds again, they're in git at tag-free commit `810a641`.

### How to read a tile

| Look | Meaning |
|---|---|
| Gold tile, ✓ | The card already has this as a **PlayStyle+** |
| Tinted tile, ✓ | The card already has the **basic** version |
| Faint tile | The card hasn't got it |
| Accent ring + **BASIC** strip | You've queued it to be added as a basic |
| Gold ring + **PS+** strip | You've queued it to be added as a PlayStyle+ |
| Faded | Can't be added: that cap is full, or it's GK-only and this is an outfielder |

A tile the card **already owns stays solid and simply doesn't respond** - it doesn't fade. That's
deliberate: fading facts would make the whole deck look dead once a cap is full.

### The tap cycle (v37)

The PlayStyle+ / Basic tabs are **gone**. One tap cycles a tile:

```
nothing  ->  basic  ->  PlayStyle+  ->  nothing
```

**Any step the card can't take is left out of the ring**, so a tap can never land somewhere the
game would reject. A card that already has the basic cycles `nothing -> PS+ -> nothing`; with the
PS+ cap full it's `nothing -> basic -> nothing`; with nothing available the tile doesn't respond.

All of that lives in **one function, `tileRing(it, base, plus)`**, which returns the states this
tile can be in, in tap order. `cycleEvo()` walks it and the tooltip reads from it, so the tap and
the tooltip can never disagree. If you change a rule, change it there.

Three things make the cycle safe, which was the worry when it was designed:

1. Illegal steps are **removed**, not silently skipped.
2. A queued tile **says which kind it is** on the strip along its bottom (`BASIC` / `PS+`), so the
   second tap is never a guess. The hint line where the tabs used to be spells the gesture out.
3. **Nothing is spent until you press Apply** - a mis-tap costs nothing, just tap again.

One subtlety worth knowing if you touch the caps: `tileRing` subtracts the tile's **own** queued
slot before comparing against the cap. Without that, a tile you'd already queued would count
itself as full and couldn't be cycled back off.

### The category table

`PS_CATEGORIES` near the top of `fc26-tools.js`, right after `psByName` / `pspByName`:

```js
{ c: "Finishing", gk: 0, ps: ["Finesse Shot", "Chip Shot", ...] }
```

- `c` is the heading, `ps` are **base names spelled exactly as in the `PS` catalog** (that's the
  key `psByName` / `pspByName` are built on), and `gk:1` marks the Goalkeeping row.
- The Goalkeeping six are precisely our six `g:1` evos, so hiding the whole category for an
  outfielder needs no extra data. A goalkeeper still sees every category, because general evos
  apply to keepers too - same as the game.
- Some sites call **1v1 Close Down** "Rush Out". We keep our name: it's what the game's own evo
  list shows, so it matches what you tap.

**After editing either table, run this in the Console:**

```js
FC26.checkBoard()
```

`ok: true`, `total: 36`, `catalog: 36`, and empty `missing` / `unknown` / `duplicated` means the
table still covers the catalog exactly. `unknown` catches a mistyped name.

### Category labels sit ABOVE the row

A left gutter would need about 140px and the deck pane is 286px wide, which would leave room for
roughly two tiles per row. So the label sits above its row with
a hairline rule, and the figure on the right is what the card holds in that category: `2+ 3`
means two PlayStyle+ and three basics.

### The Intercept icon gap (and the general fix)

Basic Intercept used to draw as an **empty diamond**. The cause is in **EA's own stylesheet**:
it defines 71 PlayStyle icon rules - all 36 `icon_icontraitN`, but only **35** `icon_basetraitN`,
with `icon_basetrait16` missing entirely. Trait 16 is Intercept. Nothing we can style fixes a
class that was never written.

So every PlayStyle icon in the panel now goes through one helper:

```js
psIco(traitId, isPlus)   // -> the finished <i class='ico ...'></i>
```

It scans once, at startup, for which of those classes the app actually defines (`ICON_CLASSES`),
and when the one it wants is missing it **borrows the other variant of the same PlayStyle** - the
same pictogram, so nothing looks out of place. If EA ever fills the gap we pick up their real icon
with no code change. If the scan can't read the stylesheets at all (a cross-origin sheet throws),
it behaves exactly as before and asks for what it wanted.

Nine places draw these icons and all of them route through the helper: the board, the spotlight
card's chips, the Lineup and Rankings PS+ strips, the apply queue tiles, the apply summary chips,
the batch tiles, the mobile card and the GH-4th tiles.

```js
FC26.iconCheck()
```

Returns the number of rules found in the app plus every gap and what we're drawing instead.
Expect one gap today: Intercept's basic, drawing `icon_icontrait16`.

### Sizing

Back to the original tile metrics: a 3-column grid (`.fc26-grid`) of `.fc26-ec` tiles with a 24px
icon and a 9px wrapping name, so nothing needs abbreviating. The v37 state classes layer on top of
that look rather than replacing it - `own-plus`, `own-base`, `selp` (the gold ring that overrides
`.sel`'s accent one) and `.qbar` (the queued strip).

---

## 3v. New in v39 - Suggest optimises the score

Suggest used to walk a hand-written ranked list per role and fill the free slots top-down.
It now **optimises the actual score** - the Justaino Score, or your own weighting if you've
tuned one in Peks Lab.

### Why it had to change

A Peks Lab PlayStyle list **replaces** the role system when scoring (`CFG.psWeights[group]`
wins over `ROLES` - see `weightsFor`). So before v39 you could rank your entire club by your
own weighting, and Suggest would still hand you mine. The two halves of the tool disagreed.

### How it picks

One slot at a time, always taking the biggest gain, re-measuring after every pick:

1. For every PlayStyle the card could still take, in both forms, it **builds the card that
   would result** and scores it (`scorePlayer(it, group, psOverride, fixedWeights)`).
2. It takes whichever gains the most, folds that into the working card, and goes again.
3. It stops the moment nothing left would move the number.

Three consequences worth understanding, because they look like bugs if you don't:

- **It often picks fewer than the free slots.** The PlayStyle score saturates at a ceiling
  (`psMaxForWeights`), so past a point extra PlayStyles are worth literally nothing. Stopping
  is the correct answer - the status line says so explicitly.
- **The picks are not a fixed ranking.** What a PlayStyle is worth depends on what's already
  on the card, which is why it re-scores each round rather than sorting once.
- **It will spend a PlayStyle+ upgrading a basic the card already has** when that beats adding
  something new (a "+" is worth `psPlusMult` basics). Since v38 the upgrade hands the basic
  slot back, which it can then refill. The status line counts these as "(1 upgrade)".

One guard: it never takes a style as a basic and then upgrades it in the same run, which would
spend two evos to reach a state one evo reaches.

### The pieces

| Piece | What it does |
|---|---|
| `psAgainst(owned, weights)` | **The single implementation** of "what are these PlayStyles worth". `scorePlayer` runs it once per candidate role and keeps the best; Suggest runs it on hypothetical cards. Sharing it means what Suggest optimises IS what the score measures. |
| `ownedNames(list)` | A PlayStyle list as `[{name, isIcon}]`, the shape the maths wants. |
| `weightsFor(group, role)` | Which weights to optimise against, mirroring `scorePlayer`'s precedence: your Peks Lab list, else the chosen role, else the per-group fallback. |
| `scorePlayer(it, group, psOverride, fixedWeights)` | Two new optional arguments. `psOverride` scores a **hypothetical** PlayStyle list instead of the card's real one. `fixedWeights` pins scoring to ONE weights table instead of trying every role. |

### The role dropdown still matters

`scorePlayer` normally tries every role the position offers and keeps the best. Suggest passes
`fixedWeights`, pinning it to **the role you chose**, so it builds for the job you asked for
rather than whichever role flatters the card. That's also why the status line reports the score
*as that role* - it's the number the decision was made on, and it can differ from the headline
score on the Justaino Score page, which is free to pick a better-fitting role.

If you've set your own list for that position, the role dropdown is ignored and the status line
says `for CDM / your list`.

### If the picks look wrong

The algorithm can only be as good as the weights. Suggest is now a mirror of the score, so a
suggestion you disagree with is a **weighting** you disagree with - argue with it in Peks Lab
(§3q) or in `ROLES` (§7b), not here.

---

## 4. The evo-eligible list (important)

Only certain card **rarities** can receive PlayStyles. The tool keeps its own list
of eligible rarities and uses it for the **"Only evo-eligible"** filter.

How the list is built:
- **Full rarity table (v6+)** - on startup the tool reads the **game's own complete
  rarity table** (`repositories.Rarity._collection`, ~128 rarities) so you can pick
  eligibility from the **full named list** straight away, instead of waiting to
  encounter each rarity. Use the **Manage eligible rarities** button (§4e).
- **Seed** - a small starting guess baked into the code (`ELIG_SEED`, currently
  `[30, 98, 109]`), used only on the very first run before you've ticked anything.
- **Self-learning** - every time an Apply **succeeds**, that card's rarity is proven
  eligible, so it's added automatically.
- **Manual** - tick/untick rarities yourself via the manager (§4e), the preview card's
  **Mark eligible** button, or the Console commands (§4b).

The list is saved in the browser (localStorage), so it survives reloads. Your existing
ticked rarities carry over unchanged when the full table loads.

### 4a. How to know a rarity's number

- **Easiest:** click the player. The preview card's second line shows it, e.g.
  `Team of the Season Champions · rarity #127 · ST · item 123456`.
- **Console:** select a player, then run
  ```js
  window.FC26.state.player.rareflag
  ```

### 4b. How to update the eligible list through code

Paste any of these into the Console **while the panel is open**. Each one saves the
change *and* redraws the panel, and prints the updated list:

```js
window.FC26.eligible.list()        // show the current eligible rarity numbers
window.FC26.eligible.add(147)      // add rarity 147 (e.g. FUT Birthday EVO)
window.FC26.eligible.remove(30)    // remove rarity 30
window.FC26.eligible.clear()       // empty the whole list
```

You can also do it without code: select a card and use the **Mark eligible /
Remove** button on its preview card.

### 4c. Two layers - seed vs live list (don't get these confused)

- The **live list** (what the filter uses) lives in the browser. Edit it with the
  commands in 4b. This is what you'll change 99% of the time.
- The **seed** (`ELIG_SEED` in `fc26-tools.js`) is *only* the first-run starting
  point. Once a live list exists, the seed is ignored. To change the *starting*
  list, edit the seed **and** clear the live list so it re-seeds:
  ```js
  window.FC26.eligible.clear()     // then re-run the bookmarklet
  ```

### 4d. Wipe everything and start fresh

```js
localStorage.removeItem('FC26_eligibleRarities'); localStorage.removeItem('FC26_onlyEligible');
```
Then reset + re-run (§2). The list goes back to the seed and the filter turns off.

### 4e. Manage eligible rarities - the full named list (v6+, stage-then-Save in v11)

Under the **Only evo-eligible** row there's a **▸ Manage eligible rarities (N)** button
(N = how many are currently eligible). Click it to open a checklist of the **whole
rarity table**, by name. **Editing is stage-then-Save (v11): nothing changes until you Save.**
- **Tick / untick** a rarity to STAGE adding/removing it. The row is flagged **will add** /
  **will remove**, and a bar appears at the bottom with **Save changes** and **Cancel**.
  Your real list only updates on **Save**; **Cancel** throws the staged edits away. The
  `(N)` count on the button doesn't move until you Save.
- **Update to OG list** - stages a reset back to your original seed list (`ELIG_SEED`), which
  you then Save (or Cancel) like any other change.
- **Filter box** - type a name or id to narrow the list (e.g. `Festival`, or `30`).
- The bottom line shows `X shown, Y ticked (Z selected of 128 rarities)` (staged counts).
- The old **Tick shown / Untick shown** bulk buttons were removed in v11 (too easy to wipe
  the whole list by accident).

Under the hood: staged edits live in `stagedElig` (a copy of `state.eligible` re-seeded on
open); **Save** does `state.eligible = new Set(stagedElig)` + `saveEligible()`; **Cancel**
copies the saved list back; the confirm bar is driven by `eligDiffCount()` / `updateConfirmBar()`.

The preview card's **Mark eligible / Remove** and learn-on-apply are single deliberate
actions, so they still apply immediately (they write `state.eligible` directly, not the stage).

Some rarities show as **`Rarity <id>`** - that's a missing display name only (they're
still fully tickable); name them via §5. If the game's table can't be read for some
reason, the manager says so and the tool falls back to the old learn-as-you-go behaviour.

---

## 5. Fixing a rarity that shows as "Rarity NN"

That's a missing **display name**, separate from eligibility. Names live in the
`RARITIES` object near the top of `fc26-tools.js`. To add one, drop a
`"number":"Name"` pair into that object, e.g.:

```
"127":"Team of the Season Champions",
```

Then rebuild the bookmarklet (§7). Or just tell Claude the number + name and it'll
add it. (Find the number using §4a.)

---

## 6. Changing the theme / colours

**In the app:** use the **theme dropdown** in the header to switch colourway. There are
three, all frosted glass, and your pick is remembered:
- **UCL Night** (default) - navy + cyan + FUT gold.
- **Broadcast Yellow** - near-black + electric lime (PlayStyle+ goes magenta).
- **Prime Teal** - dark teal + coral.

**In the code:** every colour is a `var(--name)` token, and each theme is just a set of
those tokens. They live in the **`THEMES` map near the top of `fc26-tools.js`** (one entry
per theme, each with a `label` + a `vars` object). To retune a theme, edit its `vars`
(e.g. `"--accent": "#38e1ff"`); to add one, drop in another entry and list its id in
`THEME_ORDER` - the header picker fills itself. Then rebuild (§7). The `#fc26-panel{ ... }`
block in the injected styles just mirrors the **default** (UCL Night) as a fallback.

If text ever feels low-contrast over a busy screen, raise a theme's panel tint opacity:
bump the last number of its `--bg` (e.g. `rgba(13,20,36,.58)` → `.7`). You can also poke
it live from the Console: `window.FC26.applyTheme("teal")`.

---

## 7. Editing the source and rebuilding the bookmarklet

1. Edit `fc26-tools.js` (the readable source - the thing you change).
2. From the project folder, rebuild the one-line bookmarklet:
   ```
   node minify.js
   ```
   This strips comments, joins it to one line, **syntax-checks** it, and writes
   `bookmarklet.txt`. If it prints `SYNTAX OK` you're good; if it prints a syntax
   error, the change broke something - fix and re-run.
3. Update your bookmark's URL with the new `bookmarklet.txt` line (or, while
   testing, paste the readable `fc26-tools.js` straight into the Console).
4. Just click the bookmark / paste again - it rebuilds itself, so no reset needed.

`node minify.js` is your everyday rebuild - run it as often as you like while
testing. It does **not** create a version.

---

## 7a. Publishing a new version to the install page

The install page (`index.html`) shows the **latest** bookmarklet as the main
install, and keeps every **previous** version listed underneath ("Previous
versions"), each one copyable. Versions are labelled `MGFC_Justaino_v1`, `_v2`,
`_v3`… and are stored in `versions.js`.

### ⭐ THE RULE - do this EVERY time before you commit a bookmarklet change

> **Changed `fc26-tools.js`? Before you `git commit`, run:**
>
> ```
> node release.js "short note about what changed"
> ```
>
> then commit `versions.js` **and** `bookmarklet.txt` together.

If you skip it, the install page keeps showing the OLD bookmarklet - your change
goes to GitHub but nobody can install it. So: **edit → test → `node release.js "…"`
→ commit → push.** (Claude is also instructed to do this automatically whenever you
ask it to commit a bookmarklet change - see CLAUDE.md - but this is the manual
version so you can do it yourself and not forget.)

The note is optional but nice - it becomes the version's **"What's new" description**
on the install page: the latest version shows it under the main install, and every
previous version shows its own note in the list. So **write it in plain, friend-friendly
language** (what changed, in words a mate would understand), not developer shorthand -
that text is what people read to decide whether to grab a new version. You do **not**
need to run `node minify.js` first; `release.js` does it for you.

**What `node release.js "…"` does, step by step:**
1. rebuilds `bookmarklet.txt` from `fc26-tools.js` (and syntax-checks it - if the
   source is broken it stops and cuts **no** version, so you can't ship a broken one);
2. stamps that fresh build as the **next** version number in `versions.js`, then
   **prunes old entries so only the newest version plus the 2 most recent older ones
   are kept** (3 in total). This stops `versions.js` growing forever - each entry
   stores the full bookmarklet (~160 KB), so an untrimmed file was making the install
   page slow to load. Pruned versions are still in git history if you ever need one
   back. To keep a different number, change `MAX_OLDER_VERSIONS` at the top of
   `release.js`;
3. **stamps that version number into the tool itself** (the `FC26_VERSION` value), so
   the panel's header badge shows the right number, e.g. `v4`. In the source it stays
   `dev`; only the released build gets the real number, so a build you paste straight
   from the source for testing correctly reads `dev`;
4. if nothing actually changed since the last version (ignoring that version stamp), it
   says so and does nothing (safe to run anytime).

Then commit `versions.js` (and `bookmarklet.txt`) and push. The install page updates
itself from `versions.js` - you never hand-edit `index.html`.

### Skip it when the bookmarklet DIDN'T change

If a commit only touches docs, `index.html`, or `release.js` (not the tool itself),
you don't need a new version - just commit normally.

### Seeing and removing versions

`release.js` has three more commands so you never have to hand-edit the big
`versions.js` file:

```
node release.js list          # show every version on the page (newest first, with dates + notes)
node release.js remove 3      # delete version 3 (the "3" in MGFC_Justaino_v3)
node release.js help          # reminder of all commands
```

Use `list` first to find the number, then `remove N`. Notes:
- Removing a version only changes what the **page** offers - it does **not** touch
  `bookmarklet.txt` or your bookmark.
- If you remove the **latest**, the page's main install falls back to the next
  newest automatically (handy for rolling back a bad release on the page).
- After a `remove`, commit `versions.js` and push.

`versions.js` grows a little with each version (each one holds a full copy of the
bookmarklet). If it ever feels big, prune a few old ones with `remove`.

---

## 7b. Re-tuning the meta rating each season ⭐ READ THIS BEFORE TOUCHING WEIGHTS

The meta rating / "Justaino Score" (§3d) is **my opinion of the current FC 26 meta**, frozen
in a handful of tables at the top of `fc26-tools.js`. Player data is read live, so new/better
cards score themselves automatically - you only edit these when the *game's* meta shifts.

### ⚠️ The one thing to understand first: PlayStyle weights come from `ROLES`, NOT `PLAYSTYLE_WEIGHTS`

There are two PlayStyle tables in the file, and it's easy to edit the wrong one:

- **`ROLES`** = the **real source**. This is what the score actually uses. Edit THIS to change
  how PlayStyles count.
- **`PLAYSTYLE_WEIGHTS`** = a **dead fallback**. It only runs if a position had *no* `ROLES` entry -
  and they all have one, so it never runs. **Leave it alone; editing it changes nothing.** (It's kept
  only as a safety net.)

### How `ROLES` works - position → role → an ORDERED list

`ROLES` is grouped by position, then by role, and each role is an **ordered priority list** of
PlayStyles. **A PlayStyle's position in the list sets how much it's worth** - the code
(`roleWeightsFromList`) turns rank into points automatically:

| Where it sits in the role's list | Weight it earns |
|---|---|
| 1st or 2nd | **4** |
| 3rd or 4th | **3** |
| 5th or 6th | **2** |
| 7th onward | **1** |
| not in the list at all | **0** |

A card is scored against **every role its position offers**, and the **best-fitting role wins**.
A **PlayStyle+ counts `PSPLUS_MULT`× a basic** (currently 3.5×).

**So to re-tune a PlayStyle, you just move it up or down its role's list** (or add/remove it).
Think of it like a priority column: row order = ranking.

**Worked example - make Gamechanger matter more for a Shadow Striker (CAM):**
find `"Shadow Striker"` inside `ROLES` and move `"Gamechanger"` earlier in the array.
```
Before: ["Finesse Shot","Incisive Pass","Rapid","Low Driven Shot","Technical", ... ,"Gamechanger", ...]
                                                                  (7th = weight 1)
After:  ["Finesse Shot","Incisive Pass","Rapid","Gamechanger","Low Driven Shot","Technical", ...]
                                                  (4th = weight 3)
```
Moving it up bumps everything below it down one place - that's normal and fine.

### The other knobs (all near the top of `fc26-tools.js`, each commented)

1. **`STAT_WEIGHTS`** - how much each of the 6 stats counts per position. Numbers are relative
   (only the ratios matter).
2. **`STAT_MIX` / `PS_MIX`** - the split between stat fit and PlayStyle fit (must add to 1.0;
   currently 0.50 / 0.50).
3. **`OVR_MIX`** - how much the final score leans on the card's in-game OVR (currently **0.01**;
   a pure tiebreak - it only separates cards that are otherwise level). Set to 0 to ignore OVR entirely. *(Note: the squad builder's draft uses a
   SEPARATE knob, `DRAFT_OVR_MIX = 0.6` - that's §3k, not the meta rating.)*
4. **`PSPLUS_MULT`** - how many basics a PlayStyle+ is worth (currently 3.5).
5. **`PS_CEIL_PLUS`** - how many relevant PS+ the "full marks" ceiling assumes (currently 5 -
   raise it so QUANTITY of relevant PS+ matters more).

### ⚠️ After editing ANY of the above, run BOTH commands

```
node meta-page.js     # regenerate the public transparency page (meta-rating.html)
node minify.js        # rebuild the bookmarklet (then release.js when shipping - §7a)
```
`meta-page.js` reads the tables (including `ROLES`) straight out of `fc26-tools.js`, so the
site page **can never drift from the tool**. If you forget it, the tool is still correct but the
page is stale.

**Note:** if EA adds a brand-new PlayStyle to the *game*, it also needs a line in the
`PS` / `PSP` catalogs (so the tool knows it exists) before you can weight it. Renaming or
reweighting existing ones is just moving names around in `ROLES`.

The easy path: ask Claude to *"refresh the FC 26 meta"* and it will re-research the
current consensus, propose a before/after of the weight changes, and on approval do the
edits + regenerate + rebuild for you.

---

## 7c. The changelog page (`changelog.html`)

A page on the site that shows the release history: a timeline with the newest release open and
every older one collapsed to its headline, plus search and New / Fixed filters.

**It has no copy of its own.** It fetches `CHANGELOG.md` - the same file you already update on
every release - and renders it in the browser. So there is nothing to keep in step: write the
changelog entry as normal, push, and the page is current. No generated file, no second place to
edit, and `release.js` doesn't need to know about it.

### What the reader understands

Only what the changelog actually uses, so keep writing entries the way you already do:

| Markdown | Becomes |
|---|---|
| `## v37 - 2026-07-30` | a new release on the timeline (this is what splits the file up) |
| `**A whole line in bold.**` | a section headline inside that release |
| `### Sub-heading` | a smaller gold sub-heading (only the older v9-v13 entries use these) |
| `- bullet` | a bullet; wrapped lines indented two spaces are joined back on |
| `  - nested bullet` | a nested bullet |
| `**bold**`, `*italic*`, `` `code` `` | inline formatting |
| `---` | ignored (it's just a separator) |

Two rules worth knowing when you write an entry:

- A headline must be **bold for the whole line**. A line that merely *starts* bold
  (`**For maintenance:** node minify.js now...`) is treated as a paragraph, which is what you want.
- The release heading must match `## vN - YYYY-MM-DD` exactly, or that release won't appear.

### New / Fixed tags

Nothing in the markdown records which a release was, so the page works it out from the words:
a headline that describes something being put right gets **Fixed**, anything else gets **New**,
and a release that did both gets both. Some fixes are written as good news ("Applied PlayStyles
now show up instantly"), so when a headline reads like new work the page also checks that
section's **first bullet** for an unambiguous fix word. Only the first bullet - go deeper and
almost everything reads as a fix, because most entries explain what used to happen.

If a release ever gets tagged wrong, the honest fix is to reword the headline. The word lists are
`FIX_WORDS` and `FIX_BODY` in the page.

### Testing it locally

The page reads a neighbouring file, so **opening it by double-clicking won't work** - browsers
block a `file://` page from reading the file next to it. The page says so plainly rather than
showing a blank screen. To test properly:

```bash
cd "/Users/justaino/Claude Project/FC26 Tools"
python3 -m http.server 8000
# then open http://localhost:8000/changelog.html
```

Each release has a permalink: `changelog.html#v29` opens v29 and scrolls to it.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Panel won't open / looks half-styled | Click the bookmark again (it rebuilds); if still stuck, hard reset (§2). |
| New colours didn't apply | Re-click the bookmark - it now re-injects styles every time. |
| "No club players found" | Open your Club in the app, then click `↻ Reload club`. |
| Applied evo doesn't show on the card | Fixed in v23 (reads the apply response directly). If it recurs, click `↻ Reload club` - and check you're on the latest bookmarklet. |
| An apply fails with `460 ineligible` | That card can't take that PlayStyle (already has it, capped, or rarity/OVR not allowed). Normal for non-eligible cards. |
| Eligible filter shows a card that won't evo | Select it → **Remove** on its card (the seed was a guess). |
| Console prints `undefined` | That's just the Console echoing "no return value" - look at the lines above it. |

---

## 9. Files in this folder

- `fc26-tools.js` - the readable source. **Edit this.**
- `bookmarklet.txt` - the one-line version for daily use (generated).
- `minify.js` - rebuilds `bookmarklet.txt` from the source (`node minify.js`).
- `release.js` - cuts a new install-page version (`node release.js "note"`, §7a).
- `versions.js` - the list of published versions the install page reads (generated).
- `index.html` - the install page (renders itself from `versions.js`).
- `features.html` - the "what it does" page (linked from the install page).
- `meta-rating.html` - the meta-rating transparency page (generated - see below).
- `meta-page.js` - regenerates `meta-rating.html` from the live weight tables (`node meta-page.js`, §7b).
  **Its footer links to `score-customiser.html`, so edit the link there, not in the generated HTML.**
- `changelog.html` - the release-history page (§7c). Reads `CHANGELOG.md` live, so it needs no upkeep.
- `score-customiser.html` - the Peks Lab guide (§3q). **Filename kept on purpose** after the v33
  rename so the published URL doesn't break; only the wording inside changed. **Hand-written, not generated**, so if
  you change a baseline number (the 50/50 mix, the 1% OVR tiebreak, 3.5x, the ceiling of 5) or add a
  preset, update this page too. It's linked from the install page, the features page and the bottom
  of `meta-rating.html`.
- `Documentation/RUNBOOK.md` - this file (how to run / maintain it).
- `Documentation/USER-GUIDE.md` - friendly feature guide for using the tool.
- `CHANGELOG.md` - plain-English per-version log of what changed (add an entry each release).
- `CLAUDE.md` - standing build context. `PLAN.md` - scope + phases.
