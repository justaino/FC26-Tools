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
(e.g. `v4`, so you know which build you're on - see §7a), and the minimise / close
buttons.

**On a computer (wide screen) → "Split Console" (two columns):**
- **Left column = your squad:** the `↻ Reload club` button, a **search box**, the
  **☑ Only evo-eligible** filter, and the **player list**. The list fills the whole
  height and scrolls on its own.
- **Right column = build & apply:** the selected player's **preview card**, the
  **✨ Suggest** row, the **PlayStyle+ / PlayStyle tabs + grid**, and the **Apply**
  button.

**On a phone (narrow screen) → "Wizard" (a bottom sheet, one step at a time):**
- **Step ① Player** - search + filter + player list. Tap a player to move on.
- **Step ② PlayStyles** - the ✨ Suggest row + tabs + grid. Tap **Next: Review →**.
- **Step ③ Apply** - the preview card + the Apply button.
- A **stepper** across the top shows where you are; tap it or **← Back** to move around.

### The parts (both layouts)
- **`↻ Reload club`** - loads every player in your club (not just your squad). Use it
  if you've just opened or changed your club.
- **search box** - filter the list by name.
- **☑ Only evo-eligible `(N rarities)`** - hides cards that can't take PlayStyles (§4).
- **player list** - each row shows rating, name, and - handy - the **PlayStyle+ icons
  the player already has** (gold, on the right), plus a GK badge and rarity. Click/tap
  a row to select.
- **preview card** - name, OVR, GK; the **rarity name + `rarity #NN`**, positions,
  item id; an **eligibility** row (§4); **capacity pips** (3 for PlayStyle+ in gold,
  8 for Basic in emerald) showing slots used; and current PlayStyles as **chips**,
  split into a PlayStyle+ row and a Basic row.
- **✨ Suggest** - position + role dropdowns that pre-tick the recommended PlayStyles
  for that role, filling your **open** slots best-first: the top picks become **PS+**,
  the rest **basic**. If the player already **owns** a top pick, Suggest **falls through**
  to the next-best one instead of leaving the slot empty (it never re-ticks something
  owned), and when a role's own list runs out it keeps going down a general **position**
  list - so there's always a next-best pick. See §3b.
- **PlayStyle+ / PlayStyle tabs + icon grid** - tick the ones you want. Owned ones are
  disabled, GK-only ones are hidden for outfielders, and each type stops at its cap
  (3 PS+, 8 basic). A live counter shows how many you've picked.
- **delay between applies (ms)** - pause between each apply (default 500). Bigger =
  gentler on the account.
- **Apply selected / Stop** - runs the queue. Each PlayStyle tile **spins then ticks**
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

## 4. The evo-eligible list (important)

Only certain card **rarities** can receive PlayStyles. The tool keeps its own list
of eligible rarities and uses it for the **"Only evo-eligible"** filter.

How the list is built:
- **Seed** - a small starting guess baked into the code (`ELIG_SEED`, currently
  `[30, 98, 109]`).
- **Self-learning** - every time an Apply **succeeds**, that card's rarity is proven
  eligible, so it's added automatically.
- **Manual** - you can add/remove rarities yourself (below).

The list is saved in the browser (localStorage), so it survives reloads.

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

All colours live in ONE place: the **token block** at the top of the injected
styles in `fc26-tools.js` - a chunk that starts with `#fc26-panel{ --radius:...`.
Edit a value (e.g. the accent `--accent:#4fe3ac`) and rebuild (§7). You never need
to hunt through the rest of the file; everything reads these `var(--name)` tokens.

Current theme: **Emerald frosted glass**. If text ever feels low-contrast over a
busy screen, raise the panel tint's opacity: `--bg:rgba(18,42,35,.58)` → higher
last number (e.g. `.7`).

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

The note is optional but nice - it shows next to that version on the page. You do
**not** need to run `node minify.js` first; `release.js` does it for you.

**What `node release.js "…"` does, step by step:**
1. rebuilds `bookmarklet.txt` from `fc26-tools.js` (and syntax-checks it - if the
   source is broken it stops and cuts **no** version, so you can't ship a broken one);
2. stamps that fresh build as the **next** version number in `versions.js`, keeping
   every older version intact;
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
- `Documentation/RUNBOOK.md` - this file (how to run / maintain it).
- `Documentation/USER-GUIDE.md` - friendly feature guide for using the tool.
- `CHANGELOG.md` - plain-English per-version log of what changed (add an entry each release).
- `CLAUDE.md` - standing build context. `PLAN.md` - scope + phases.
- `reference-evo.js` - read-only reference script we borrowed proven bits from.
