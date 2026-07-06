# RUNBOOK — Men Gallant FC · Justaino PS Tool

A practical, plain-English guide to running and maintaining the bookmarklet.
This is the "how do I actually use/fix it" doc. For scope and phase history see
`PLAN.md`; for build context see `CLAUDE.md`.

---

## 1. What it is

A single **bookmarklet** for the EA FC 26 Web App. It adds a floating panel that
lets you pick a club player, tick PlayStyles / PlayStyle+, and apply them all at
once. It drives the app's own logged-in services — no passwords, no servers.

The panel header reads **"Men Gallant FC - Justaino PS Tool"**.

---

## 2. Running it day-to-day

1. Make sure the bookmarklet is saved as a bookmark (its URL is the one long line
   in `bookmarklet.txt`, starting with `javascript:`).
2. Open the FC Web App and let your club load.
3. Click the bookmark. The panel appears bottom-right. Click it again any time to
   re-show it if you closed it.

**If something looks stuck or you just updated the code**, reset and re-run by
pasting into the browser Console (F12 → Console):

```js
document.getElementById('fc26-panel')?.remove(); document.getElementById('fc26-style')?.remove(); delete window.FC26;
```

> The middle part (`fc26-style`) matters whenever the **look** changed — the styles
> are injected once per page, so without removing them the new theme won't load.

---

## 3. The panel, top to bottom

- **Players** + `↻ Reload club` — loads every player in your club (not just your
  squad). Use Reload if you've just opened/changed your club.
- **search box** — filter the list by name.
- **☑ Only evo-eligible `(N rarities)`** — see §4.
- **player list** — rating, name, GK badge, rarity. Click one to select it.
- **preview card** — name, OVR, GK; the **rarity name + `rarity #NN`**, positions,
  item id; an **eligibility** row (see §4); **capacity pips** (3 for PlayStyle+ in
  gold, 8 for Basic in emerald) showing how many slots are used; and your current
  PlayStyles as **chips**, split into a PlayStyle+ row and a Basic row.
- **Evolutions** — position + role dropdowns and **✨ Suggest** (pre-ticks the
  recommended PlayStyles: top 3 as PS+, the rest basic).
- **PlayStyle+ / PlayStyle tabs** + the icon grid — tick the ones you want. Owned
  ones are ticked-off/disabled, GK-only ones are hidden for outfielders, and each
  type stops at its cap (3 PS+, 8 basic).
- **delay between applies (ms)** — pause between each apply (default 500). Bigger =
  gentler on the account.
- **Apply selected / Stop** — runs the queue; **Stop** halts after the current one.
- **status line** — progress and results.

---

## 4. The evo-eligible list (important)

Only certain card **rarities** can receive PlayStyles. The tool keeps its own list
of eligible rarities and uses it for the **"Only evo-eligible"** filter.

How the list is built:
- **Seed** — a small starting guess baked into the code (`ELIG_SEED`, currently
  `[30, 98, 109]`).
- **Self-learning** — every time an Apply **succeeds**, that card's rarity is proven
  eligible, so it's added automatically.
- **Manual** — you can add/remove rarities yourself (below).

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

### 4c. Two layers — seed vs live list (don't get these confused)

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
styles in `fc26-tools.js` — a chunk that starts with `#fc26-panel{ --radius:...`.
Edit a value (e.g. the accent `--accent:#4fe3ac`) and rebuild (§7). You never need
to hunt through the rest of the file; everything reads these `var(--name)` tokens.

Current theme: **Emerald frosted glass**. If text ever feels low-contrast over a
busy screen, raise the panel tint's opacity: `--bg:rgba(18,42,35,.58)` → higher
last number (e.g. `.7`).

---

## 7. Editing the source and rebuilding the bookmarklet

1. Edit `fc26-tools.js` (the readable source — the thing you change).
2. From the project folder, rebuild the one-line bookmarklet:
   ```
   node minify.js
   ```
   This strips comments, joins it to one line, **syntax-checks** it, and writes
   `bookmarklet.txt`. If it prints `SYNTAX OK` you're good; if it prints a syntax
   error, the change broke something — fix and re-run.
3. Update your bookmark's URL with the new `bookmarklet.txt` line (or, while
   testing, paste the readable `fc26-tools.js` straight into the Console).
4. Reset + re-run in the app (§2).

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Panel won't open / looks half-styled | Full reset (§2), then re-run. |
| New colours didn't apply | You skipped removing `fc26-style` — use the full reset (§2). |
| "No club players found" | Open your Club in the app, then click `↻ Reload club`. |
| An apply fails with `460 ineligible` | That card can't take that PlayStyle (already has it, capped, or rarity/OVR not allowed). Normal for non-eligible cards. |
| Eligible filter shows a card that won't evo | Select it → **Remove** on its card (the seed was a guess). |
| Console prints `undefined` | That's just the Console echoing "no return value" — look at the lines above it. |

---

## 9. Files in this folder

- `fc26-tools.js` — the readable source. **Edit this.**
- `bookmarklet.txt` — the one-line version for daily use (generated).
- `minify.js` — rebuilds `bookmarklet.txt` from the source (`node minify.js`).
- `RUNBOOK.md` — this file.
- `CLAUDE.md` — standing build context. `PLAN.md` — scope + phases.
- `reference-evo.js` — read-only reference script we borrowed proven bits from.
