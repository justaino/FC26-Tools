# PLAN-v2.md - Next four features

Source of truth for the features described in `BRIEF.md`. Supersedes the SBC
builder direction in `PLAN.md` (Phase 2) and `PHASE2-PROMPTS.md`, which are now
parked. Standing rules in `CLAUDE.md` still apply: plain-English comments, one
feature per step then stop, a Console discovery command instead of guessing any
ID/method, and a "how to test" with every change. No em dashes anywhere.

## Where the code stands (from the Step 0 audit)

- One file, `fc26-tools.js`, one IIFE. Rebuilds itself on every run.
- Club reading is solved: `getClubPlayers()` / `loadFullClub()` (pages
  `services.Club.search`), `it.rating`, `playerName`, `rarityName` + `it.rareflag`,
  `isGKPlayer`, `playerPositionGroups` + `POS_GROUP`, `currentPlayStyles`,
  `hasEvo`, `numBasic`/`numPlus`.
- Eligibility today is learn-as-you-go: `FC26_eligibleRarities` in localStorage,
  seeded `[30,98,109]`, grown on each successful apply, hand-editable. A static
  `RARITIES` id->name map is used only to LABEL cards, not to drive the picker.
- Two gaps the new work must fill with a discovery step first:
  1. No code reads a player's raw stats (pace, dribbling, physical, etc.) yet.
  2. Caps are hardcoded `CAP_PLUS = 3` / `CAP_BASIC = 8`; we read the current
     COUNT (`getNumPlusPlayStyles`) but never the player's actual MAX.

## Build order + status

Build in this order (Feature 3 depends on Feature 2). Each feature opens with its
own Console discovery command and stops for a live test.

1. Feature 1 - Complete rarity table - **DONE, shipped v6.**
2. Feature 4 - Dynamic PS+ cap + GH 4th applier - **DONE, shipped v7.**
3. Feature 2 - Meta rating (`scorePlayer` + two weight tables) - **NEXT.**
4. Feature 3 - Gauntlet squad builder - after Feature 2.

**Shipped through v7 (on `main`).** Next session starts at Feature 2.

---

## Feature 1 - Complete rarity table

**Goal:** load the game's full rarity definitions (every id -> name) from the
app's own data so eligibility is complete from day one, instead of only the
rarities this account has encountered.

**Steps**
1. Discovery: find where the app keeps rarity DEFINITIONS (the id -> name table
   used to render rarity badges), likely in `window.repositories` or a
   metadata/localization service. Console command, wait for output.
2. Load that table at startup into a `RARITY_DEFS` map (id -> name). This
   supersedes the static `RARITIES` label map and the learn-as-you-go seed as the
   SOURCE of names.
3. Eligibility UI becomes "choose from the full named list" (tick rarities on/off
   by name), not "wait to encounter". Keep the existing "Mark eligible" button and
   `window.FC26.eligible.*` helpers as the on/off mechanism.
4. Migrate once: every rareflag already in `FC26_eligibleRarities` carries over as
   pre-ticked. (Current test value: `[30,98,109]`.)
5. Show rarity NAMES everywhere we currently show a bare id.
6. Fallback: if the table cannot be read, keep today's learn-as-you-go behaviour
   working exactly as-is (the static `RARITIES` map + seed).

**Test:** open the eligible-rarity UI and confirm the full named list appears;
the three seeded rarities are pre-ticked; ticking/unticking persists across a
rebuild.

---

## Feature 4 - Dynamic PS+ cap (4th PlayStyle+ evo)

**Goal:** some evos raise a player's PS+ cap to 4, so the fixed 3/8 assumption
must go. The game's own apply/eligibility stays the real enforcement layer; our
cap is only UX.

**Important (from the user, 2026-07-10):** the 4th PS+ is NOT the standard PSP
catalog (slots 2181-2216) with the cap raised. It's a **separate, limited evo set**
named like "GH 4th [PlayStyle+] <name>" (Glory Hunters), with its own slot ids, and
it is **consumable** - once used it may be gone. So:
- Do NOT assume ticking a normal PS+ tile fills the 4th slot, and NEVER auto-spend a
  one-off 4th-PS+ evo.
- This splits Feature 4 into two parts: (4a) cap AWARENESS as UX - read the real cap
  per player, show meters as /4 when raised, stop soft-blocking at 3; and (4b, later)
  optionally SOURCE the "GH 4th" slot set so the 4th can be applied deliberately. 4b
  needs a live player with that evo available to discover the slot ids, so it waits
  until one exists to inspect.

**Steps**
1. Discovery: does a player item or the open evo expose the player's ACTUAL
   current caps (base and PS+)? Console command, wait.
2. If yes: read caps per player and drive ALL cap UI/validation from that
   (`CAP_PLUS`/`CAP_BASIC` become per-player values: meters, tile disabling,
   `toggleEvo`, `suggest`, `planForPlayer`).
3. If not: keep 3/8 as defaults plus a per-player "extra PS+ slot" override toggle
   stored with settings (new localStorage key).
4. Never hard-block on our own count alone; keep surfacing the app's rejection
   reason (`errMsg`, error 460) if an apply fails.

**Test:** on a player known to have a 4th PS+ slot, the PS+ meter reads x/4 and a
4th PS+ can be ticked and applied; a normal player still caps at 3.

---

## Feature 2 - My own meta rating

**Goal:** a self-computed score per player per position:
`scorePlayer(player, position) = stat score + PlayStyle bonuses`.

**Steps**
1. Discovery: how does an item expose its stats (the 6 face stats and/or in-depth
   attributes)? Console command, wait.
2. `STAT_WEIGHTS`: position-group profiles (ST, winger, CM/CAM, CDM, fullback, CB,
   GK) in ONE commented table at the top of the file, weighted toward the current
   meta (pace, dribbling/agility, physical for outfield).
3. `PLAYSTYLE_WEIGHTS`: a second table mapping each PlayStyle -> bonus per position
   group, "+" versions worth roughly double base. SEED BY RESEARCH: web-search
   current FC26 meta consensus on the most valuable PlayStyles, populate the table,
   comment sources/reasoning next to the values.
4. `scorePlayer` combines the two, reusing `currentPlayStyles`/`hasEvo` for the PS+
   part and `playerPositionGroups` for the profile.
5. Sanity-check UI: show top-N players for a chosen position with a score breakdown
   (stat part + playstyle part) so both tables can be tuned.
6. Meta updates later: re-run the research and edit `PLAYSTYLE_WEIGHTS` only, with
   a before/after diff of what changed and why. No code change.

**Test:** pick a position, see a ranked top-N with stat/playstyle split; tweak a
weight and watch the ranking move.

---

## Feature 3 - Gauntlet squad builder

**Goal:** given a formation and N (3-5), build N squads from the club with ZERO
shared players (Gauntlet rule), each genuinely good, via a snake draft on the meta
rating. Display only; do not auto-place in the game.

**Steps**
1. Controls: formation dropdown (a few hardcoded formations as position lists),
   N (3/4/5), Build button.
2. Depth check BEFORE building: need N x 11 distinct players; report specific
   position shortages instead of building broken squads.
3. Snake draft: fill position by position; per squad pick the best available by
   `scorePlayer()`; remove picked players from the pool (no repeats across squads);
   alternate direction each round (1..N then N..1).
4. Light chemistry tiebreaker: between similar scores, prefer a player sharing a
   league/nation already common in that squad. (Discovery may be needed for how the
   item exposes league/nation.)
5. Output: N squads listed (position -> name, rating, score) with each squad's
   average score, so balance is visible.

**Test:** choose a formation + N, click Build, get N squads with no shared player
and comparable average scores; an under-depth club reports the shortage.

---

## Explicitly out of scope

Unreleased/datamined players, fut.gg/futbin scraping, live prices, auto-creating
SBCs in the game UI.

**Update (2026-07-10):** auto-creating **squads** was deliberately brought IN scope by the
user and shipped in v14 (Gauntlet "Create in game" + "Remove Gauntlet squads"). See
`SQUAD-CREATION-SPEC.md` and RUNBOOK §3h.

## Shipping checklist (per feature, from CLAUDE.md)

- Update `Documentation/RUNBOOK.md` and `CHANGELOG.md` in the same change.
- Run `node release.js "<note>"` before any commit that changed the bookmarklet,
  and include `versions.js` + `bookmarklet.txt` in that commit.
- Work on `dev`; merge to `main` only when asked.
