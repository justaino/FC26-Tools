# NEXT-SESSION.md - continue the FC26 tool build

Paste the prompt at the bottom into a fresh session to continue. Everything above it is
context so you (or the next Claude) can get oriented fast.

## Where things stand (shipped through v7, on `dev` AND `main`)

The tool is `fc26-tools.js` (one commented IIFE, built to `bookmarklet.txt` via
`node minify.js`; versioned on the install page via `node release.js "note"`). Working on
the `dev` branch; `main` is stable. Standing rules live in `CLAUDE.md`; the four-feature
plan and status live in `PLAN-v2.md` (the source of truth for this work).

**Done so far (from BRIEF.md):**
- **Feature 1 - Complete rarity table (v6).** Reads the game's full rarity table
  (`repositories.Rarity._collection`, ~128 ids) into `state.rarityDefs`, with a "Manage
  eligible rarities" checklist so eligibility is chosen from the full named list. Names
  come from the static `RARITIES` map (EA obfuscates the table's own names); ~50 unnamed
  show as `Rarity <id>`. Optional TM name-scrape was **deferred** (see the memory note).
- **Feature 4 - Dynamic PS+ cap + GH 4th applier (v7).**
  - 4a: the item exposes no "max PlayStyles", so the *display* cap grows to the actual
    count - a 4-PS+ card shows `PlayStyle+ 4/4` instead of `4/3`.
  - 4b: apply the limited **"GH 4th"** Glory Hunters evos. They live in the Academy
    "Rewards" category (id 9) as slots named `GH 4th <PlayStyle+>`. A gold section in the
    PlayStyle Deck shows them **only** for an eligible player (Glory Hunters rarity + exactly
    3 PS+), loads the category cold with
    `requestSlotsByCategory({categoryId:9,count:100,offset:0})`, and applies one behind a
    one-off confirm (`addItemToSlot` + `claim`). Excluded from batch apply and Suggest.
    Console (read-only): `await window.FC26.fourthEvos.load()`.

## Still to build (in order)

- **Feature 2 - My own meta rating (NEXT).** `scorePlayer(player, position) = stat score
  + PlayStyle bonuses`. Two tunable tables at the top of the file: `STAT_WEIGHTS`
  (position-group profiles: ST, winger, CM/CAM, CDM, fullback, CB, GK; weighted for the
  current meta - pace, dribbling/agility, physical) and `PLAYSTYLE_WEIGHTS` (each
  PlayStyle -> bonus per position group; "+" versions ~double; **seed by web-searching
  current FC26 meta consensus and comment the sources**). Sanity-check UI: top-N players
  for a chosen position with the stat/playstyle split so both tables can be tuned.
  **First step is a discovery command:** find how a club item exposes its stats
  (pace/shooting/passing/dribbling/defending/physical, and ideally the in-depth
  attributes) - do NOT guess the method/field names.
- **Feature 3 - Gauntlet squad builder.** Given a formation + N (3-5), build N squads from
  the club with ZERO shared players via a snake draft on `scorePlayer()` (depends on
  Feature 2). Depth check first (N x 11 distinct; report shortages), light league/nation
  chem tiebreaker, display only. See PLAN-v2.md Feature 3 for the full spec.

## How to work (from CLAUDE.md - non-negotiable)

- Drive the app's own `window.services.*` / `window.repositories.*`; never fake HTTP.
- Owner is NOT a JS dev: explain in plain English, comment every block, no em dashes
  anywhere (docs, code, chat).
- One feature/step at a time, then stop for a live test. **Always say exactly how to test.**
- Need an id/method/field you don't have? Give the exact DevTools Console command and WAIT
  (owner pastes output back). Never guess.
- After editing `fc26-tools.js`: `node minify.js` (rebuilds `bookmarklet.txt` + syntax
  checks). Before committing a bookmarklet change: `node release.js "<note>"` (cuts the
  next `MGFC_Justaino_vN`), and commit `versions.js` + `bookmarklet.txt` too. Update
  `Documentation/RUNBOOK.md` + `CHANGELOG.md` when a feature ships.

## Open item to revisit

- TM rarity-name scrape for the ~50 unnamed rarities (Feature 1) - owner said skip for
  now, remind later. Quick alternative: add a `"id":"Name"` line to the `RARITIES` map
  (RUNBOOK §5).

---

## PROMPT TO PASTE INTO THE NEW SESSION

> Continue the FC26 personal bookmarklet tool. Read `CLAUDE.md`, `PLAN-v2.md`, and
> `NEXT-SESSION.md` first, and follow the CLAUDE.md working rules exactly (drive the app's
> own service objects, one step at a time with a test after each, give me exact DevTools
> Console commands instead of guessing ids/fields, plain-English comments, no em dashes,
> work on `dev`, run `node minify.js` after edits and `node release.js "note"` before any
> commit that changed the bookmarklet).
>
> Features 1 (complete rarity table) and 4 (dynamic PS+ cap + GH 4th applier) are already
> shipped (v6, v7) on both `dev` and `main`. Start **Feature 2 - my own meta rating**
> (`scorePlayer` + `STAT_WEIGHTS` + `PLAYSTYLE_WEIGHTS`, seeding the PlayStyle weights from
> researched current-FC26 meta consensus). Begin with the one discovery step it needs: give
> me the Console command to find how a club item exposes its stats (pace, shooting,
> passing, dribbling, defending, physical, and any in-depth attributes), then wait for me to
> paste the output before writing any code.
