# Changelog - Men Gallant FC · Justaino FC Web App Tool

What's changed in each install-page version (`MGFC_Justaino_vN`). Newest first.
Versions are cut with `node release.js "note"` and shown on the install page (`index.html`).

---

## v19 - 2026-07-11

**Meta rating tuning, an evolved-stats fix, and a couple of lineup touches.**

- **Evolved players now score and display their REAL stats.** The game freezes the plain `attributes`
  array on a card at its pre-evo (base) values and keeps the live evolved face stats behind a method
  (`getAttributes()`). The tool was reading the frozen array, so an evo'd card (e.g. a 95 Mainoo whose
  real stats are 92/89/94/95/95/95) was being scored and shown with its old base numbers. It now reads
  the live evolved stats, so both the Face-stats grid and the stat half of the Justaino Score are correct.
- **Meta rating re-tuned** so marquee cards land where you'd expect: in-game OVR now carries **35%** of
  the score (was a light tiebreak), a PlayStyle+ counts **3.5x** a basic (was 2.5x), and the "full marks"
  PlayStyle ceiling rewards up to **5** relevant PlayStyle+ - so a card with five useful PS+ genuinely
  out-scores one with three instead of both maxing out.
- **Every lineup row shows the player's primary position** as a small badge next to their name (ST, CB,
  the correct RB/LB or RW/LW side, GK in the accent colour) - not just goalkeepers.
- **On desktop, the player list now tucks away** (to a "tap to show" stub) when you open Meta rating or
  Manage eligible rarities, just like it already did on mobile, so the open panel gets the room.

---

## v18 - 2026-07-11

**Smarter Meta rating (v2): role-aware, PlayStyle-led, and honest about card quality.**

The "Meta rating" (rank my club by position) was rebuilt so the numbers reflect how a card actually
plays, closer to how fut.gg's GG Rating thinks:

- **Scored at the ROLE level, not just the position.** Each card is now judged against its *best-fitting
  role* (Poacher vs Target Forward, Winger vs Inside Forward, ...) using the same role lists Suggest
  uses, then the top-scoring role is shown. Hover a row to see which role it picked.
- **PlayStyles lead, then stats, with a light OVR nudge.** A PlayStyle+ now counts **2.5x** a basic
  PlayStyle, and **every** meta basic a card owns is counted (no more cap at three). Stats still matter
  and are weighted per position (defending barely counts for a striker, heavily for a centre-back).
  In-game OVR is only a small tiebreak - deliberately minor, because a 97 with poor face stats plays
  nothing like a 97.
- **Weak foot + skill moves** now feed the rating (they read from the card when the app exposes them),
  weighted more for attackers than defenders.
- **Scores carry one decimal** (e.g. 88.4), so cards that used to tie on a whole number now separate,
  and the PlayStyle ceiling was raised so a stacked card no longer flatlines at 100.

Net effect: your best cards rank where they should - a marquee playmaker tops the CAM list, purpose-built
finishers top the ST list - instead of a mid card with the "perfect" three stickers leaping the queue.

---

## v17 - 2026-07-11

**Mobile minimize fix + a new name.**

- **Minimize now works on the phone while the Squad Builder is open.** Before, tapping the minimize
  ( - ) button with the builder open only "half closed" the panel: the contents hid but the tall
  sheet stayed, because the builder's full-height styling was overriding the little pill. Minimize
  now always collapses to the small draggable pill in the bottom-right, builder open or not.
- **Renamed to "Justaino FC Web App Tool"** (was "Justaino PS Tool") everywhere it shows: the panel
  header, the install and features pages, and the Meta Rating page. Old published versions keep the
  old name in their history; new versions carry the new one.

---

## v16 - 2026-07-11

**Squad Builder: every real formation, correct left/right, and squads that always create.**

- **All the game's formations, in a dropdown.** The builder no longer offers just four hardcoded
  shapes - it now reads the game's own formation list, so you get every formation the game has
  (~29), including **both** 4-2-3-1s (the RM/CAM/LM one and the three-CAM one), the four 4-3-3
  variants, 4-4-1-1, the 5-at-the-back shapes and more. Pick from a tidy dropdown; the pitch and the
  squad it creates now match exactly what the game expects for that formation.
- **Wingers and full-backs go on the correct side.** A left-back slot only takes a player who
  actually plays the left (and the same for RB/LB, RM/LM, RW/LW). A player who plays both sides is
  still eligible for either. If you're short on one flank (e.g. no left-backs), the builder now says
  so instead of quietly putting someone on the wrong foot.
- **No more "1 squad failed" on Create.** Three things that made the game reject a squad are now
  handled: **loan players** (both the match-count kind and timed/expiring loans like a short-term
  Icon loan) are left out of the builder; the **same player is never put in one squad twice** (even
  two different cards/ratings of him - e.g. a 95 and a 92 Courtois); and a squad that hits a
  transient hiccup is retried automatically. Different squads can still each use that player.

---

## v15 - 2026-07-11

**The Gauntlet builder is now a full-screen pitch.**

- **Squad Builder** is its own screen now. Open it from the **⚽ Squad Builder** button under the
  player list (Lineup), and leave it with the **‹** back arrow. No more cramped dropdown.
- The centrepiece is a **football pitch**: one dot per player, placed by formation. Each dot shows
  the player's OVR on a coloured disc (tinted by their Justaino score - brighter = better), their
  name, and the position with the Justaino score under it. Empty slots show as a dashed open spot.
- **Switch between squads** with tabs on desktop or number pills on mobile, and the pitch animates
  the players into their new spots.
- A **stat strip** (XI average, players placed, and the biggest league/nation cluster) sits beside
  the pitch on desktop, or as a one-line summary on mobile. The **bench** (7 subs) is listed too,
  collapsible on mobile to keep the pitch big.
- **Create in game** and **Remove Gauntlet squads** work exactly as before (same confirm dialogs
  and safety), now with a proper progress bar and a success/failed toast instead of a plain status
  line.
- The mobile panel now holds a comfortable minimum height so it never collapses into a thin sliver.

---

## v14 - 2026-07-10

**Create Gauntlet squads in the game (and undo them in one tap).**

- The Gauntlet builder now has two new buttons under the squad cards: **Create in game** and
  **Remove Gauntlet squads**. This is the first thing the tool ever *creates* on your account.
- **Create in game** turns the built squads into real saved squads named **"MGFC Gauntlet 1",
  "MGFC Gauntlet 2", ...**. It shows a confirm dialog listing exactly what it will make, checks
  the 30-squad limit first, and reports progress and a done/failed count. It **never touches your
  active squad** and never makes a new squad active.
- **Remove Gauntlet squads** deletes every squad named "MGFC Gauntlet ..." - found by scanning
  your live squad list, so it works even on a different device and even after the game renumbers
  squads. Your own squads (any other name) are never touched. The button shows how many exist.
- Under the hood it drives the app's own squad service (`services.Squad.create` / `.remove`), the
  same one the web app's Squads screen uses.

---

## v13 - 2026-07-10

**Gauntlet squad builder (display only).**

- New **▸ Gauntlet squad builder** section under the player list (below Meta rating). Pick a
  formation (4-3-3, 4-4-2, 4-2-3-1 or 3-5-2) and how many squads (3, 4 or 5), then **Build**.
- It drafts that many complete squads from your club with **no player shared** between them:
  11 starters plus 7 subs each (18 per squad), each slot filled by the best available player
  for that position on the Justaino rating (a snake draft, so the squads stay balanced).
- **Depth check first:** if your club cannot fill that many full squads it tells you exactly
  which positions are short and builds nothing, instead of making broken teams.
- Each squad shows its starting-XI average, its bench, and a light **chem clusters** line
  (how many players share a league or a nation). Tap any player row to spotlight that card.
- This is **display only** - it does not create or change anything in your game. (Creating
  these squads in the web app for real is the next feature.)

---

## v12 - 2026-07-10

**Crash fix.**

- Guarded `currentMode` on load so the panel can no longer crash while it is still working
  out whether to show the desktop or mobile layout.

---

## v11 - 2026-07-10

**Safer eligible-rarity manager: nothing changes until you Save.**

- The bulk **Tick shown / Untick shown** buttons are gone (too easy to wipe your whole
  eligible list by accident).
- Ticking or unticking a rarity now **stages** the change instead of applying it: the row
  is flagged **will add** / **will remove** and a bar appears with **Save changes** and
  **Cancel**. Your real list only updates when you press **Save**; **Cancel** discards the
  lot. The "(N)" count on the button doesn't move until you Save.
- New **Update to OG list** button stages a reset back to your original seed list, which you
  then Save (or Cancel) like any other change.
- The preview card's **Mark eligible** and learn-on-apply are single, deliberate actions, so
  they still apply straight away.

---

## v10 - 2026-07-10

**Mobile Lineup: more room for the panels you open.**

- On a phone, opening **Meta rating** or **Manage eligible rarities** used to leave the
  player list squashed above/below it, making the open panel hard to scroll.
- Now, opening either one **folds the player list to a single line** ("Player list hidden
  - N players, tap to show"), giving the panel the full height. **Tap the stub** to peek the
  list back, or **close the panel** and the list returns on its own.
- Desktop is unchanged: the list and an open panel show together.

---

## v9 - 2026-07-10

**Viewing and applying PlayStyles, made clearer on both phone and desktop.**

### Face stats everywhere the card shows
- The player's six **face stats** (PAC / SHO / PAS / DRI / DEF / PHY, or the six GK stats
  for keepers) now appear on the **desktop spotlight** card, so the middle pane no longer
  looks empty, and they ride along when the dock narrows to two panes.
- They come straight off the card's own numbers (the same ones the Justaino rating reads),
  so they can never be out of step, and each value is colour-graded so a strong stat reads
  at a glance.

### Resize the panel from any side
- The floating desktop panel can now be dragged bigger or smaller from **any edge or
  corner**, not just the bottom-right. The opposite side stays pinned, and the size and
  position are remembered.

### Mobile: a tidier build-and-apply flow
- The **PlayStyle Deck** tab has a slim summary bar at the top: rating, name and caps, with
  a **stats** toggle that folds out the capacity meters plus the six face stats, so you can
  read the player without leaving the deck. It remembers whether you left it open.
- The old pinned mini-spotlight at the bottom was removed (it just repeated that summary).
- The **Review** tab no longer repeats the whole card. It now shows exactly **what you are
  about to apply** (the ticked PlayStyles, split PlayStyle+ / Basic) and a **Manage this
  card** fold-out with the eligibility toggle and the Remove / Clear-evo buttons.

### Apply and Review gating
- **Apply selected** is now **disabled when nothing is ticked** (on both mobile and
  desktop), instead of doing nothing.
- You can now open the **Review** tab for a card that **already has PlayStyles** even with
  nothing newly ticked, so you can go there just to review or remove them.

---

## v8 - 2026-07-10

**The Meta rating ("Justaino Score") - my own 0-100 player score.**

### A score per player, per position
- Every player now gets a **0-100 rating** for each position, worked out entirely from
  their **real stats and PlayStyles** (no external data or player database).
- It shows as a green **`JUSTAINO xx · <pos>`** pill under the OVR on the preview card
  (the player's best position), and as a new **▸ Meta rating** list under the player
  picker that ranks the players in your club who can play a chosen position, best first.
- Each row shows the score split as `stats + PlayStyles`, so you can see why.

### How it's scored
- **Stats** are a weighted average tuned per position (shooting for strikers, defending
  for centre-backs, and so on), and **PlayStyles** add points for the meta ones a player
  owns - a **PlayStyle+ counts double**. The two blend 70/30 (stats/PlayStyles), so a
  card with elite stats but none of the meta PlayStyles tops out around 70, and only a
  near-perfect card approaches 100.
- The PlayStyle weights are seeded from the current FC 26 meta consensus and are meant to
  be re-tuned each season.

### Full transparency page
- A new **"How the meta rating works"** page on the site (`meta-rating.html`, linked from
  the install and features pages) lays out **every weight for every position**. It's
  generated straight from the tool's own tables, so it can't drift out of sync.

---

## v7 - 2026-07-10

**4th PlayStyle+ support (the limited "GH 4th" Glory Hunters evos).**

### Caps now show the real number
A card that already has a 4th PlayStyle+ shows `PlayStyle+ 4/4` in the preview and the
mobile mini-spotlight, instead of a broken `4/3`. Normal cards are unchanged (3 PS+ / 8
basic).

### Apply a GH 4th PlayStyle+ from the tool
- Select a **Glory Hunters card that already has exactly 3 PlayStyle+** and a gold **"GH
  4th PlayStyle+ (one-off)"** section appears in the PlayStyle Deck.
- It lists your available GH-4th evos (one chip per PlayStyle+). Tap one, confirm, and it
  adds that PlayStyle+ as a **4th** to the player.
- Safeguards: it **only shows for eligible cards**, is **never part of batch apply or
  Suggest**, and **every apply is confirmed** (these evos are one-offs). The game still
  has the final say on eligibility.
- The list **loads by itself** (no need to open Evolutions -> Rewards first) and
  **refreshes after each apply**, so new GH-4th evos appear.

---

## v6 - 2026-07-10

**Complete rarity list for evo-eligibility.** The tool now reads the game's own full
rarity table (about 128 rarities) when it starts, so you can choose which rarities count
as evo-eligible from the **whole named list up front**, instead of only the ones you'd
happened to apply to before.

### Manage eligible rarities
- A new **▸ Manage eligible rarities (N)** button under the "Only evo-eligible" row opens
  a searchable checklist of every rarity, by name.
- **Tick / untick** a rarity to add or remove it - it saves instantly and updates the
  filter. Type in the **filter box** to narrow by name or id, and use **Tick shown /
  Untick shown** to change a whole filtered group at once.
- Your previously-eligible rarities stay ticked - nothing is lost.
- Self-learning and the preview card's **Mark eligible** button still work exactly as
  before; they just tick entries in the same list.

### Notes
- A few rarities show as **`Rarity <number>`** - that's only a missing display name (EA
  scrambles the names in the game data); they're still fully selectable. Names can be
  filled in one line at a time in the code.
- If the game's rarity table can't be read for any reason, the tool quietly falls back to
  the old learn-as-you-go behaviour.

---

## v5 - 2026-07-10

A full visual redesign of the panel: the "Broadcast" look, with switchable colour
themes. Everything the tool did before still works the same way; this is layout and
styling (plus the theme picker). The old Emerald frosted-glass skin is retired.

### Switchable colour themes
There's now a **theme dropdown** in the panel header with three frosted-glass
colourways, and it remembers your pick:
- **UCL Night** (the default) - deep navy with a cyan accent and FUT gold.
- **Broadcast Yellow** - near-black with an electric lime accent.
- **Prime Teal** - dark teal with a coral accent.

### Broadcast layout (desktop)
- The panel is now a **wide console docked to the bottom of the screen** with a bright
  top edge, split into three zones: the **Lineup** (your players), the **Spotlight**
  (the selected player), and the **PlayStyle Deck** (choose + apply).
- You can still **drag it and resize it** by the corner, and there's a new **reset
  button** (the little expand icon in the header) that snaps it back to the default dock.
- Resize it narrow and it drops to **two columns** (the spotlight tucks above the deck)
  so nothing gets squashed.

### Redesigned player spotlight
The selected-player card is now a broadcast-style "lower third": a big rating number
next to the name, with the PlayStyle+ (3) and Basic (8) caps drawn as **segment meters**
instead of dots. Same info as before.

### Guided mobile flow
On a phone the wizard is now **channel tabs** (Lineup / PlayStyle Deck / Review) with a
**pinned mini-spotlight** at the bottom that always shows who you're building. A **guide
button** walks you through the steps, and you **can't reach Review until you've picked at
least one PlayStyle** (the Review tab stays greyed out until then).

### Type + naming
- The whole panel now uses a **condensed, uppercase broadcast typeface**.
- "Evolutions" is renamed **"PlayStyle Deck"**; the delay control and Apply button now
  sit **side by side** in one row.

---

## v4 - 2026-07-08

### Version badge in the panel header
The panel now shows **which version you're on** as a small badge next to the title
(e.g. `v4`), so you can tell at a glance whether you're on the latest and know when to
grab a newer one from the install page.

- The number is stamped in automatically when a version is cut, so it always matches
  the published version. A build you're just testing from the source shows `dev`.
- Nothing else about how the tool works has changed.

---

## v3 - 2026-07-06

The last of the four friend-feedback tweaks: a smarter **✨ Suggest**.

### 4. Smarter Suggest (fall-through past owned PlayStyles)
Suggest now always fills every slot it can, instead of leaving gaps.

- **Before:** if a player already owned one of a role's top picks, Suggest just skipped
  it and left that slot empty - so an owned top pick meant one fewer suggestion.
- **Now:** it **falls through** to the next-best pick. It fills your **open** slots
  best-first (top picks as PS+, the rest basic), counting only the slots you actually
  have free.
- **Never re-ticks an owned style** - in either form. If you already hold a PlayStyle as
  a "+", Suggest won't offer you its basic version either.
- **Always has a next-best.** When a role's own curated list runs out of unowned picks,
  Suggest keeps going down a general **position** list (attacker / midfielder / defender /
  keeper), so even a heavily-evolved card still gets every slot filled.
- Still works on **one player at a time** (greyed out during a multi-player batch).

---

## v2 - 2026-07-06

Four feature tweaks (from friends' feedback) plus a couple of desktop fixes.

### 1. Resizable desktop panel
The floating panel can now be **resized**, not just dragged.

- Grab the little **diagonal-striped handle in the bottom-right corner** and drag to
  make the panel bigger or smaller (width *and* height).
- Minimum size ~340×260; it won't grow past the screen edges.
- The size is **remembered** (saved in your browser, like the drag position), so it
  reopens at the size you left it.
- **Desktop only** - on a phone (the bottom-sheet "Wizard") and while minimized, the
  handle is hidden and sizing is automatic.

### 2. Multi-select players → batch apply
Apply the same PlayStyles to **several players in one run**.

- Every player row now has a **checkbox** on the left. Tick the players you want.
  Ticking one also brings it into focus (its preview shows on the right).
- A green **"N selected for batch apply"** bar appears, with a **Clear** button.
- Pick your PlayStyles once, then hit **Apply selected** - it applies to *all* ticked
  players, one after another.
- A **roll-call** ("Applying selected PlayStyles to N players: …") shows above the
  Apply button so you can see exactly who's affected before you go.
- Each player is checked **individually**: any PlayStyle a player already owns, can't
  fit (its own 3 PS+ / 8 basic caps), or that's GK-only on an outfielder is reported as
  **skipped** (not a failure). The result shows a section per player with what was added
  / failed / skipped.
- **Suggest** (and its position/role dropdowns) is greyed out while more than one player
  is ticked - it only works on a single player. Manual ticking still works in batch mode.
- With **nothing** ticked, Apply behaves exactly as before (just the previewed player).

### 3. Reset / remove evos
You can now **remove PlayStyles** from a card, matching the EA web app's clear ability.

- On the preview card, two buttons: **Remove Latest Evo** and **Clear all evos**.
- **Remove Latest Evo** removes the most recently applied upgrade.
- **Clear all evos** removes them one by one until the card fully reverts.
- **Both always ask you to confirm first.** A spinner + live count shows the progress
  right under the buttons.
- **Important wording:** the game removes evo *upgrades* newest-first, and there's no way
  to pick a specific one or to know in advance whether the next one is a PlayStyle or a
  **stat/skill upgrade**. So the buttons say "evo", not "PlayStyle", and the confirm
  warns you. Clear all reverts the card, which can make it **leave your club evo list**.

### Fixes
- **Desktop scrolling** is reliable again - the PlayStyle grid / right side scrolls
  fully, including after **minimizing and re-opening** the panel (a bug there collapsed
  the scroll).
- The **"← Back to players"** button after applying now only shows on **mobile** (on
  desktop the player list is always visible, so it was redundant).

---

## v1 - 2026-07-06

- Responsive layout: desktop **Split Console** (players left, build + apply right) and
  mobile **Wizard** (3-step bottom sheet).
- **Drag** the panel by its header; position remembered.
- PlayStyle+ icons shown inline on each player row.
- (Foundation from Phase 1: full-club picker, preview card, PlayStyle/PS+ icon grid,
  Suggest, apply loop with delay/Stop, state-safe refresh - see `PLAN.md`.)
