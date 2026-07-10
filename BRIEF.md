# BRIEF — Next features for my FC26 tool

Read this fully, then AUDIT MY EXISTING CODE before writing anything. My app has
evolved.
wherever they disagree. CLAUDE.md rules still apply (plain-English comments, one
step at a time, tell me how to test every change, give me Console discovery
commands instead of guessing names).

---

## What I want, in one summary

1. **Complete rarity list (fixes EVO eligibility).** My app already shows eligible
   players and "learns" rarities as I mark them eligible — but it only ever learns
   rarities I've encountered. I want to load the FULL rarity definitions table
   (every rarity id -> name in the game) from the app's own data, so eligibility
   is complete from day one instead of learned piecemeal.

2. **My own meta rating.** A self-computed score per player per position, weighted
   for what the current meta rewards (pace, dribbling/agility, physicality etc.),
   PLUS PlayStyle/PlayStyle+ bonuses from a PLAYSTYLE_WEIGHTS table (a meta-relevant
   PS+ can matter more than raw stats). Both weight tables exposed at the top of the
   code so I can tune them. Research current meta consensus online (you have web
   search) to seed the PlayStyle weights with sourced values. No live scraping — the
   research lands in a static table I own, and I'll re-run the research prompt when
   the meta shifts.

4. **Dynamic PS+ cap (4th PlayStyle+ evo).** Some evos now raise a player's PS+
   cap to 4, so the hardcoded 3 PS+ / 8 basic assumption must go. Preferred: discover
   whether the app exposes a player's ACTUAL current caps and read them per player.
   Fallback: keep 3/8 as defaults with a per-player override toggle. Either way the
   game's own apply/eligibility remains the enforcement layer — our cap is just UX.

3. **Gauntlet squad builder.** Given a formation and N (3–5), build N squads from
   my club with ZERO shared players (Gauntlet rule), each squad genuinely good —
   use a snake draft driven by the meta rating (stats + PlayStyle bonuses) so
   quality spreads evenly. Include a depth check (N x 11 distinct players; warn me
   what's short instead of building broken squads). Display the squads; don't
   auto-place them in the game.

Explicitly OUT of scope: unreleased/dataminded players, fut.gg/futbin scraping,
live prices, auto-creating squads in the game UI.

---

## Step 0 — Audit (do this first, before any code)

Read every file in this folder. Then report back, in plain English:
- what the app currently does, feature by feature
- how my current rarity "learning" works — NOTE: the learned data itself lives in
  the browser's localStorage, NOT in these files, so you'll only find the code that
  reads/writes it. As part of the audit, tell me the exact Console command to dump
  that stored data (based on the key names you find in the code) and I'll paste the
  output back so you can see the current state.
- what club-reading / player-property code already exists that features 2 and 3
  can reuse
- anything in the planning docs that's now stale vs. the real code

Then propose a short implementation order for the three features against MY actual
code structure, and WAIT for my go-ahead before implementing.

---

## Feature 1 — Complete rarity table

- Discovery first: give me Console commands to find where the app keeps rarity
  DEFINITIONS (the id -> name table used to render rarity names/badges on any
  card — likely in window.repositories or a metadata/loc service). I'll paste
  results back.
- Then: load that table at startup. This SUPERSEDES the learn-as-you-go list — I
  should now be choosing eligible rarities from the full named list, not waiting to
  encounter them. Migrate once: any rarity ids already marked eligible in my
  localStorage data carry over as pre-ticked.
- Keep my "mark as eligible" flow as the way I tick entries on/off.
- Show rarity NAMES (not bare ids) wherever the app currently shows ids.
- Fallback: if the table can't be read for some reason, keep my learn-as-you-go
  behaviour working exactly as it does now.

## Feature 2 — My own meta rating

- scorePlayer(player, position) = stat score + PlayStyle bonuses.
- STAT WEIGHTS: position-group profiles (ST, winger, CM/CAM, CDM, fullback, CB, GK)
  in ONE clearly-commented table at the top. Weight toward current meta: pace,
  dribbling/agility, physical for outfield.
- PLAYSTYLE_WEIGHTS: a second table mapping each PlayStyle -> bonus per position
  group, with "+" versions worth roughly double base. SEED IT BY RESEARCH: use your
  web search to find current FC26 meta consensus on the most valuable PlayStyles,
  populate the table, and comment your sources/reasoning next to the values.
- Future meta updates: when I say "the meta changed", re-run that research and
  update PLAYSTYLE_WEIGHTS only — show me a before/after of what you changed and
  why. No code changes, just the table.
- Sanity-check: show top-N players for a chosen position with score breakdown
  (stats part + playstyle part) so I can tune both tables.

## Feature 4 — Dynamic PS+ cap (4th PlayStyle+ evo)

- Discovery first: Console commands to find whether a player item or the open evo
  exposes the player's CURRENT PlayStyle caps (base and PS+). If yes, read caps per
  player and drive all cap UI/validation from that.
- If not exposed: default 3 PS+ / 8 basic, plus a per-player "extra PS+ slot"
  override toggle stored with my settings.
- Never hard-block on our own count alone: the game's apply/eligibility check is
  the enforcement layer; surface its rejection reason if an apply fails.

## Feature 3 — Gauntlet builder

- Controls: formation dropdown (hardcode a few common formations as position lists),
  N squads (3/4/5), Build button.
- Depth check BEFORE building: N x 11 distinct players needed; report specific
  position shortages instead of building broken squads.
- Snake draft: fill position by position; per squad pick the best available by
  scorePlayer(); remove picked players from the pool (enforces no-repeat across
  squads); alternate draft direction each round (1..N then N..1).
- Light chemistry tiebreaker: between similar scores, prefer a player sharing
  league/nation already common in that squad.
- Output: N squads listed (position -> name, rating, score) with each squad's
  average score, so I can see they're balanced. Display only.

---

## Working agreement (same as always)

- One step at a time; stop after each so I can test in the live app.
- Every change comes with: what changed + exactly how to test it.
- Need an ID/property/service name? Give me the Console command; never guess.
- Don't break existing features. Commit a save point after each step that works.
