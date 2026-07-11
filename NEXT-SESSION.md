# NEXT-SESSION.md - continue the FC26 tool build

Paste the prompt at the bottom into a fresh session to continue. Everything above it is
context so you (or the next Claude) can get oriented fast.

## Where things stand (v8 shipped)

The tool is `fc26-tools.js` (one commented IIFE, built to `bookmarklet.txt` via
`node minify.js`; versioned on the install page via `node release.js "note"`). Working on
the `dev` branch; `main` is stable. Standing rules live in `CLAUDE.md`; the four-feature
plan and status live in `PLAN-v2.md` (the source of truth for this work).

**Branch state:** `dev` is at v8 and pushed to origin. `main` is still at **v7** - do NOT
merge dev -> main unless the user explicitly says so.

**Done so far (from BRIEF.md / PLAN-v2.md):**
- **Feature 1 - Complete rarity table (v6).** Reads `repositories.Rarity._collection`
  (~128 ids) into `state.rarityDefs`, with a "Manage eligible rarities" checklist. Names
  from the static `RARITIES` map; ~50 unnamed show as `Rarity <id>` (TM name-scrape
  deferred).
- **Feature 4 - Dynamic PS+ cap + GH 4th applier (v7).** 4a: display cap grows to the real
  count (a 4-PS+ card shows `4/4`). 4b: apply the limited "GH 4th" Glory Hunters evos from
  the Academy "Rewards" category (id 9), gated to Glory Hunters + exactly 3 PS+, one-off
  confirm, excluded from batch/Suggest.
- **Feature 2 - Meta rating / "Justaino Score" (v8).** A self-computed **0-100 score per
  player per position**, from real stats + PlayStyles only:
  - `scorePlayer(it, group)` = `STAT_MIX*statFit + PS_MIX*psFit` (0.70/0.30, tunable at top
    of the file). Stats read live from `it.attributes` (outfield = [PAC,SHO,PAS,DRI,DEF,PHY],
    GK = [DIV,HAN,KIC,REF,SPD,POS]), weighted per position by `STAT_WEIGHTS`. PlayStyle half
    uses `PLAYSTYLE_WEIGHTS` (seeded from FC26 meta web-research, PS+ counts double),
    normalised against a per-position ceiling (`psMaxForGroup`).
  - UI: green `JUSTAINO xx · <pos>` pill under the OVR on the preview card (best position via
    `bestJustaino`) + a "▸ Meta rating" list under the picker that ranks club players for a
    chosen position (filtered to players who actually play it).
  - **Design decision (settled):** the rating stays **absolute**, NOT pool-relative. We can't
    see EA's full player DB (out of scope), and a club-relative score would jump around. Power
    creep is handled by the **seasonal weight refresh**, not a self-deflating number.
  - Console (read-only): `window.FC26.scorePlayer(it,"ST")`, `window.FC26.metaTop("CB",10)`,
    `window.FC26.bestJustaino(it)`, `window.FC26.STAT_WEIGHTS` / `.PLAYSTYLE_WEIGHTS`.
  - **Transparency page:** `meta-rating.html` shows every weight per position, GENERATED from
    the live tables by `node meta-page.js` (so it can't drift). Linked from `index.html` and
    `features.html`. Re-tuning steps: RUNBOOK section 7b.

## Still to build

- **Feature 3 - Gauntlet squad builder (NEXT, last of the four).** Given a formation + N
  (3-5), build N squads from the club with **ZERO shared players** (Gauntlet rule) via a
  **snake draft on `scorePlayer()`** (Feature 2, now available). Display only - never
  auto-place in the game. Full spec in `PLAN-v2.md` Feature 3. Sketch:
  1. Controls: formation dropdown (a few hardcoded formations as position-group lists), N
     (3/4/5), Build button.
  2. **Depth check BEFORE building:** need N x 11 distinct players; report specific position
     shortages instead of building broken squads.
  3. Snake draft: fill position by position; per squad pick the best available by
     `scorePlayer(it, positionGroup)`; remove picked players from the pool (no repeats across
     squads); alternate direction each round (1..N then N..1).
  4. Light chemistry tiebreaker: between near-equal scores prefer a player sharing a
     league/nation already common in that squad. **Discovery needed** for how a club item
     exposes league/nation - give a Console command, don't guess.
  5. Output: N squads listed (position -> name, rating, Justaino score) with each squad's
     average score so balance is visible.
  Likely a new collapsible section (like the Meta rating one) or a step/tab. Reuse
  `playerPositionGroups`, `scorePlayer`, `metaTop`, `getClubPlayers`.

## After the four features

- Optional: **TM rarity-name scrape** for the ~50 unnamed rarities (Feature 1) - user said
  skip for now, remind later. Quick alt: add a `"id":"Name"` line to `RARITIES` (RUNBOOK 5).
- Optional: revisit **eligible-player filtering** for the picker (was cut in Phase 1;
  `canApplyTo(slot)` proved unreliable - re-test before building UI).
- Seasonal: **re-tune the meta rating** (RUNBOOK 7b) - edit `STAT_WEIGHTS` /
  `PLAYSTYLE_WEIGHTS` / `STAT_MIX` / `PS_MIX`, then `node meta-page.js` + `node minify.js`.

## How to work (from CLAUDE.md - non-negotiable)

- Drive the app's own `window.services.*` / `window.repositories.*`; never fake HTTP.
- Owner is NOT a JS dev: explain in plain English, comment every block, **no em dashes**
  anywhere (docs, code, chat).
- One feature/step at a time, then stop for a live test. **Always say exactly how to test.**
- Need an id/method/field you don't have? Give the exact DevTools Console command and WAIT
  (owner pastes output back). Never guess.
- After editing `fc26-tools.js`: `node minify.js` (rebuilds `bookmarklet.txt` + syntax
  checks). Before committing a bookmarklet change: `node release.js "<note>"` (cuts the next
  `MGFC_Justaino_vN`), and commit `versions.js` + `bookmarklet.txt` too. Update
  `Documentation/RUNBOOK.md` + `CHANGELOG.md` when a feature ships.
- The bookmarklet self-refreshes on every run (removes old `#fc26-panel` + `#fc26-style`
  and rebuilds, carrying the loaded club over). Hard reset:
  `document.getElementById('fc26-panel')?.remove(); document.getElementById('fc26-style')?.remove(); delete window.FC26;`.

---

## PROMPT TO PASTE INTO THE NEW SESSION

> Continue the FC26 personal bookmarklet tool. Read `CLAUDE.md`, `PLAN-v2.md`, and
> `NEXT-SESSION.md` first, and follow the CLAUDE.md working rules exactly (drive the app's
> own service objects, one step at a time with a test after each, give me exact DevTools
> Console commands instead of guessing ids/fields/methods, plain-English comments, no em
> dashes, work on `dev`, run `node minify.js` after edits and `node release.js "note"` before
> any commit that changed the bookmarklet, and update RUNBOOK + CHANGELOG when a feature
> ships).
>
> Features 1, 4, and 2 are already shipped (v6, v7, v8) - v8 (Feature 2, the Meta rating /
> "Justaino Score") is on `dev` only, not yet merged to `main`. Now build the last one,
> **Feature 3 - the Gauntlet squad builder**: given a formation + N (3-5), build N squads
> from my club with ZERO shared players via a snake draft on the meta rating
> (`scorePlayer()`), display only. See `PLAN-v2.md` Feature 3 for the full spec.
>
> Start by proposing a short build plan (controls, depth-check-first, the snake-draft
> algorithm, the light league/nation chem tiebreaker, and the output layout), and give me the
> one discovery Console command it needs up front: how a club item exposes its **league and
> nation** (for the chem tiebreaker) - then wait for my output before writing code. Build the
> depth check + draft first; the chem tiebreaker can come after that works.
