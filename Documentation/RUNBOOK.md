# RUNBOOK - Men Gallant FC · Justaino PS Tool

A practical, plain-English guide to running and maintaining the bookmarklet.
This is the "how do I actually use/fix it" doc. For scope and phase history see
`PLAN.md`; for build context see `CLAUDE.md`.

---

## 1. What it is

A single **bookmarklet** for the EA FC 26 Web App. It adds a floating panel that
lets you pick a club player, tick PlayStyles / PlayStyle+, and apply them all at
once. It drives the app's own logged-in services - no passwords, no servers.

The panel header reads **"Men Gallant FC - Justaino PS Tool"**.

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
  (3 PS+, 8 basic). A live counter shows how many you've picked.
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

**How the score works (two halves blended):**
- **Stat fit (0-99)** = a weighted average of the six stats, using `STAT_WEIGHTS[pos]`.
- **PlayStyle fit (0-100)** = points for the meta PlayStyles the player owns
  (`PLAYSTYLE_WEIGHTS[pos]`, a **PlayStyle+ counts double**), measured against that
  position's best-case loadout.
- **Rating** = `STAT_MIX × statFit + PS_MIX × playStyleFit` (currently 0.70 / 0.30). The
  0.30 means a stats-monster with none of the meta PlayStyles tops out around 70; only a
  near-perfect card in both halves approaches 100.

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
  Each pick is the best available club player for that position group by the Justaino score
  (`scorePlayer`); subs are then drafted by each player's best position (`bestJustaino`).
- **Light chem tiebreaker (`chemPick` + `CHEM_EPSILON`).** Among players within a few points
  of the best score, it prefers one who shares a **league** or **nation** already common in
  that squad (read straight off the item: `it.leagueId`, `it.nationId`), then higher rating.
  `chemSummary` produces the "up to X share a league / Y share a nation" line per squad.
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

## 7b. Re-tuning the meta rating each season

The meta rating (§3d) is **my opinion of the current FC 26 meta**, frozen in a few
places at the top of `fc26-tools.js`. Player data is read live, so new/better cards score
themselves automatically - you only touch these when the *game's* meta shifts (a patch, a
new season):

1. **`STAT_WEIGHTS`** - how much each stat counts per position. Numbers are relative, so
   only the ratios matter.
2. **`PLAYSTYLE_WEIGHTS`** - the meta PlayStyles per position and their points. Add a
   `"PlayStyle Name": 3` line to value a new one; delete a line to drop one. (The 0-100
   PlayStyle "ceiling" is derived from these automatically - nothing else to change.)
3. **`STAT_MIX` / `PS_MIX`** - how hard PlayStyles swing overall. They must add to 1.0.

**After editing any of the above, do BOTH:**
```
node meta-page.js     # regenerate the public transparency page (meta-rating.html)
node minify.js        # rebuild the bookmarklet (then release.js when shipping - §7a)
```
`meta-page.js` reads the tables straight out of `fc26-tools.js`, so the site page can
never drift from the tool. If you forget it, the tool is still correct but the page is
stale.

**Note:** if EA adds a brand-new PlayStyle to the *game*, it also needs a line in the
`PS` / `PSP` catalogs (so the tool knows it exists) before you can weight it. Renaming or
reweighting existing ones is just editing numbers.

The easy path: ask Claude to *"refresh the FC 26 meta"* and it will re-research the
current consensus, propose a before/after of the weight changes, and on approval do the
edits + regenerate + rebuild for you.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Panel won't open / looks half-styled | Click the bookmark again (it rebuilds); if still stuck, hard reset (§2). |
| New colours didn't apply | Re-click the bookmark - it now re-injects styles every time. |
| "No club players found" | Open your Club in the app, then click `↻ Reload club`. |
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
- `Documentation/RUNBOOK.md` - this file (how to run / maintain it).
- `Documentation/USER-GUIDE.md` - friendly feature guide for using the tool.
- `CHANGELOG.md` - plain-English per-version log of what changed (add an entry each release).
- `CLAUDE.md` - standing build context. `PLAN.md` - scope + phases.
