# Changelog - Men Gallant FC · Justaino PS Tool

What's changed in each install-page version (`MGFC_Justaino_vN`). Newest first.
Versions are cut with `node release.js "note"` and shown on the install page (`index.html`).

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
