# CLAUDE.md — FC26 Personal Helper

Read this at the start of every session. It's the standing context; PLAN.md has
the full detail.

## What we're building
A single **bookmarklet** for my own personal use on the EA FC 26 Web App, with a
floating panel offering two tools:
1. **EVO assigner** — pick a club player, tick PlayStyles, apply them all at once.
2. **SBC builder** — open an SBC, auto-fill it with my cheapest *local* fodder.

Personal tool, not for distribution. No Tampermonkey, no hosting, no auth — I'm
already signed in when the bookmarklet runs, so it borrows the live session.

## About me (so you pitch it right)
I come from Power Platform (Power Apps, Power Automate, SharePoint, some SQL/C#).
**I don't know JavaScript, React, or TypeScript.** Explain in plain English and
comment every block. Don't assume front-end knowledge.

## Architecture — non-negotiable
1. **Drive the app's own service objects; never fake HTTP.** Use `window.services.*`
   and `window.repositories.*` (with a bare-global fallback). They're already
   authenticated.
2. Service calls are async **"observables"** — wrap them in an observe→promise
   helper so they can be awaited in a loop.
3. **Hardcode small catalogs** of IDs; discover IDs live, comment their source.
4. **State-safe refresh** after any change (mark data dirty) — never reload the page.
5. One file (`fc26-tools.js`), heavily commented for a non-JS dev.

## How we work — every step
- Build **one feature per step, then stop** so I can test in the live app.
- When you need an ID, property, or method name I haven't given you, **give me the
  exact DevTools Console command to find it and wait — never guess.**
- Don't break the panel or existing features when adding a new one.
- **After EVERY change, tell me how to test it — required, not optional.** State
  exactly what to click or type and what a correct result looks like. If the change
  isn't visible in the UI (e.g. plumbing), give me the Console command to confirm it
  instead. Never hand me a change without a test for it.
- You can't see the live app (it's behind login), so I run Console commands and
  paste output/errors back. That hand-off is normal — rely on it.

## Files in this folder
- `CLAUDE.md` — this file (standing context).
- `PLAN.md` — full scope + phased plan. Source of truth for what's in/out of scope.
- `PHASE1-PROMPTS.md` — EVO assigner prompts (build first).
- `PHASE2-PROMPTS.md` — SBC builder prompts.
- `PHASE3-POLISH-PROMPTS.md` — optional UI tidy-up (tabs, draggable) once both tools work.
- `DEBUGGING-PROMPTS.md` — paste-ready prompts for when something breaks.
- `GIT-SAFETY-PROMPTS.md` — save-point / rollback prompts to protect working versions.
- `fc26-tools.js` — **the thing we're building** (my output). Edit this.
- `reference-evo.js` — someone else's working evo helper. **Read-only reference**
  to copy proven bits from (PlayStyle catalog, error-code map) and learn the apply
  flow. Never edit it; we're not shipping it.
- `bookmarklet.txt` — the one-line bookmarklet version of fc26-tools.js for daily use.

## Current status
Phase 1 (EVO assigner), working through PHASE1-PROMPTS.md.
