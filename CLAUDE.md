# CLAUDE.md - FC26 Personal Helper

Read this at the start of every session. It's the standing context; PLAN.md has
the full detail.

## What we're building
A single **bookmarklet** for my own personal use on the EA FC 26 Web App, with a
floating panel offering two tools:
1. **EVO assigner** - pick a club player, tick PlayStyles, apply them all at once.
2. **SBC builder** - open an SBC, auto-fill it with my cheapest *local* fodder.

Personal tool, not for distribution. No Tampermonkey, no hosting, no auth - I'm
already signed in when the bookmarklet runs, so it borrows the live session.

## About me (so you pitch it right)
I come from Power Platform (Power Apps, Power Automate, SharePoint, some SQL/C#).
**I don't know JavaScript, React, or TypeScript.** Explain in plain English and
comment every block. Don't assume front-end knowledge.

## Architecture - non-negotiable
1. **Drive the app's own service objects; never fake HTTP.** Use `window.services.*`
   and `window.repositories.*` (with a bare-global fallback). They're already
   authenticated.
2. Service calls are async **"observables"** - wrap them in an observe→promise
   helper so they can be awaited in a loop.
3. **Hardcode small catalogs** of IDs; discover IDs live, comment their source.
4. **State-safe refresh** after any change (mark data dirty) - never reload the page.
5. One file (`fc26-tools.js`), heavily commented for a non-JS dev.

## How we work - every step
- **Never use em dashes (the long dash, Unicode U+2014) in anything you write** -
  docs, the install/features site, code comments, commit messages, or your chat
  replies. They make writing read as AI-generated. Use a comma, a colon, brackets,
  or a plain hyphen ( - ) instead.
- Build **one feature per step, then stop** so I can test in the live app.
- When you need an ID, property, or method name I haven't given you, **give me the
  exact DevTools Console command to find it and wait - never guess.**
- Don't break the panel or existing features when adding a new one.
- **After EVERY change, tell me how to test it - required, not optional.** State
  exactly what to click or type and what a correct result looks like. If the change
  isn't visible in the UI (e.g. plumbing), give me the Console command to confirm it
  instead. Never hand me a change without a test for it.
- You can't see the live app (it's behind login), so I run Console commands and
  paste output/errors back. That hand-off is normal - rely on it.
- **When a new feature is approved and committed, ALWAYS update `RUNBOOK.md` and
  `CHANGELOG.md` in the same change** - `RUNBOOK.md` with how to use/maintain it,
  `CHANGELOG.md` with a plain-English entry under the current install-page version
  (`node release.js`). Not optional; do it as part of shipping the feature.

## Files in this folder
- `CLAUDE.md` - this file (standing context).
- `PLAN.md` - full scope + phased plan. Source of truth for what's in/out of scope.
- `PHASE1-PROMPTS.md` - EVO assigner prompts (build first).
- `PHASE2-PROMPTS.md` - SBC builder prompts.
- `PHASE3-POLISH-PROMPTS.md` - optional UI tidy-up (tabs, draggable) once both tools work.
- `DEBUGGING-PROMPTS.md` - paste-ready prompts for when something breaks.
- `GIT-SAFETY-PROMPTS.md` - save-point / rollback prompts to protect working versions.
- `fc26-tools.js` - **the thing we're building** (my output). Edit this.
- `reference-evo.js` - someone else's working evo helper. **Read-only reference**
  to copy proven bits from (PlayStyle catalog, error-code map) and learn the apply
  flow. Never edit it; we're not shipping it.
- `bookmarklet.txt` - the one-line bookmarklet version of fc26-tools.js for daily use.
- `minify.js` - rebuilds `bookmarklet.txt` from the source (`node minify.js`).
- `release.js` - cuts a new install-page version (`node release.js "note"`): rebuilds the
  bookmarklet, then prepends it to `versions.js` as `MGFC_Justaino_vN` (keeps old ones).
  Also `node release.js list` and `node release.js remove <n>` to view/delete versions.
- `versions.js` - generated list of published bookmarklet versions (newest first); the
  install page reads this. Never hand-edit except to trim old entries.
- `index.html` - GitHub Pages install page; renders the latest bookmarklet + a "Previous
  versions" list entirely from `versions.js`.
- `Documentation/RUNBOOK.md` - plain-English how-to-use/maintain guide (rarity numbers,
  editing the eligible list, theming, rebuilding, publishing versions §7a). Long-form docs
  (RUNBOOK, USER-GUIDE, + PDF exports) live in `Documentation/`. **Update on every new feature.**
- `CHANGELOG.md` - plain-English per-version log of what changed (newest first, by
  install-page version), at the project root. **Add an entry on every new feature.**

## Current status
**Phase 1 (EVO assigner) is built and working in-game.** It does more than the
original PHASE1-PROMPTS.md list - the finished tool has:
- Full-club player picker (loads EVERY player via `services.Club.search`, not just
  the squad), name search, "↻ Reload club" button.
- Preview card (OVR, rarity, GK, caps used, current PlayStyles).
- PlayStyle / PS+ catalog as an **icon-tile grid** (3 cols, uses the app's own
  `UltimateTeam-Icons` font via `icon_basetraitN` / `icon_icontraitN`).
- Selection rules: owned disabled, GK-only disabled for outfielders, 3 PS+ / 8 basic
  caps, live count.
- **Suggest**: position + role dropdowns pre-tick recommended playstyles (top 3 as
  PS+) from the reference's offline ROLES table (we deliberately did NOT use fut.gg -
  CORS-blocked + fragile).
- Apply loop: configurable **delay ms**, claim toggle, per-evo progress, Stop,
  state-safe refresh, and **real-time preview update** from the apply response's
  `data.updatedItem`.
- Panel shell: header with **minimize/close**, scrollable body.

**Phase 1.5 (panel redesign) is DONE** - visual-only, explored via a Claude design
artifact (four themes → Emerald frosted glass chosen) before touching code:
- **Emerald frosted-glass theme.** All colours now live in ONE place: a CSS
  custom-property **token block** on `#fc26-panel` (in the injected `<style id="fc26-style">`);
  every inline `style.cssText` and grid rule reads them via `var(--…)`. Re-skinning =
  edit that token block only. Panel uses `backdrop-filter: blur()` over a translucent
  emerald tint. Accent = emerald `#4fe3ac`; ratings/PS+ stay FUT gold `#ffd98a`;
  Stop button stays red (semantic, not themed).
- **Preview card redesigned** (`renderPreview`): capacity **pips** (3 for PS+ gold,
  8 for Basic emerald) that fill as slots are used, plus current PlayStyles as **icon
  chips** in a PS+ row and a Basic row (chips reuse the `UltimateTeam-Icons` font).
  Also added the player's position group(s) to the meta line. Same data as before -
  purely visual.

**Decisions worth remembering:**
- Proactive evo *eligibility* filtering was dropped: `canApplyTo(slot)` needs the
  exact evolution open AND returned false for all club players in testing, so it's
  unreliable. We rely on the app rejecting ineligible applies (error 460), which the
  loop reports with a readable reason.
- GK scope: GK-only evos (`g:1`) are hidden for outfielders, but general evos (`g:0`)
  stay available to GKs (matches the reference + the game).

**Workflow:**
- Edit `fc26-tools.js`, then regenerate `bookmarklet.txt` with a Node minify snippet
  (strip comments → join lines → prepend `javascript:`) and syntax-check via
  `new Function(...)`. The user tests by pasting the bookmarklet line (or readable
  source) into the FC web-app Console. **The bookmarklet now self-refreshes**: on
  every run it removes any existing `#fc26-panel` AND `#fc26-style` and rebuilds, so
  no manual reset is needed after a change (it also carries the loaded club over
  between runs so rebuilds are instant). A hard reset is only for wiping the
  namespace: `document.getElementById('fc26-panel')?.remove(); document.getElementById('fc26-style')?.remove(); delete window.FC26;`.
- Minify snippet lives at `minify.js` (project root) - a small string/regex-aware
  comment-stripper (the naive approach corrupts the `esc()` regex `/[&<>"]/g`, which
  contains a quote). Run it with Node from the project root; it rewrites
  `bookmarklet.txt` and syntax-checks via `new Function(...)`.
- Git: work on the **`dev`** branch; **`main`** is stable. Only merge dev→main when
  the user explicitly says so. Remote: github.com/justaino/FC26-Tools (private).
- **REQUIRED before any commit that changed the bookmarklet:** whenever
  `fc26-tools.js` (or `bookmarklet.txt`) has changed and the user asks to commit /
  push, FIRST run `node release.js "<concise note of what changed>"` to cut a new
  `MGFC_Justaino_vN` on the install page, then `git add versions.js bookmarklet.txt`
  and include them in that same commit. Derive the note from the actual change (ask
  the user if it isn't obvious). `release.js` no-ops if nothing changed, so it's safe
  to run; only skip it for commits that don't touch the bookmarklet (e.g. docs-only,
  or `index.html`/`release.js` changes). This keeps the install page's version
  history in lock-step with every shipped bookmarklet change. See RUNBOOK §7a.

**Next up:** revisit **eligible-player filtering** for the picker (only show players a
selected evo can actually apply to). This was cut in Phase 1 because `canApplyTo(slot)`
proved unreliable - see the "Decisions" note above; the revisit should re-test that
assumption and find a reliable signal before building UI. After that, Phase 2 (SBC
builder, see PHASE2-PROMPTS.md).
