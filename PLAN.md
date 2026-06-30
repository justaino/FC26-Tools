# FC26 Personal Helper — Implementation Plan (lean)

A bookmarklet for **my own** use on the EA FC 26 Web App. Two tools in one
floating panel. No Tampermonkey, no hosting, no auth — I'm signed in when I click
it, so it borrows the live session. Built with Claude Code, one feature at a time.

> Read this before each phase. Build in order. Don't start a phase until the
> previous one works in the live app.

---

## 1. Scope (locked — do not expand)

- **Tool A — EVO assigner:** pick a club player → tick PlayStyles → apply all at once.
- **Tool B — SBC builder:** open an SBC → auto-fill with my cheapest eligible club players.

Out of scope: sniping, auto-buying, prices, sharing, hosting, auto-update, mobile,
Tampermonkey. One panel, one user, desktop.

---

## 2. How it runs

- **Distribution:** a single `javascript:` bookmarklet on the bookmarks bar.
  Load the Web App, let the club load, click it. Runs once per click.
- **Dev loop:** while building, paste the readable source into the DevTools
  Console for instant testing. Once a version is good, Claude Code emits the
  updated one-line bookmarklet; replace the bookmark's URL.
- **Fallback:** if the app ever blocks the bookmarklet (content security policy),
  the *same code* can move into Tampermonkey unchanged. Don't do this unless needed.

---

## 3. Architecture (applies to every feature)

1. **Drive the app's own service objects — never fake HTTP.** Use `window.services.*`
   and `window.repositories.*`; they're the functions the in-game buttons call,
   and they're already authenticated.
2. **Service calls are async "observables"** — they notify when done. Wrap them in
   a small promise helper so we can `await` them in a loop.
3. **Hardcode small catalogs** of the IDs we need; discover IDs in DevTools, comment
   their source.
4. **State-safe refresh:** after a change, mark data "dirty" so the app redraws —
   no reload.
5. **One readable file, every block commented in plain English** (I don't know JS).

---

## 4. Conventions for Claude Code

- Don't break the panel or existing features when adding one.
- ONE feature per step, then stop so I can test.
- When you need an ID/method I haven't given you, tell me the exact Console command
  to find it — don't guess.
- After each change: say what changed and what to click to test it.

---

## 5. Phase 0 — Skeleton ✅
Bookmarklet installed, panel shows, "list services" prints the app's service names.

## 6. Phase 1 — EVO assigner (build first; reference script solves the hard parts)

1.1 **Discover:** confirm `services.Academy.addItemToSlot` / `claimSlot` and
    `repositories.Item.getClub()`; note how a call signals completion.
1.2 **Plumbing:** add the observe→promise wrapper + `applyEvo` / `claimEvo`.
1.3 **Catalog:** import PlayStyle / PS+ table (name → slotId → rewardId); spot-check
    a couple of IDs against the live app before trusting it.
1.4 **Picker:** list club players, select one, show OVR / rarity / current PlayStyles.
1.5 **Select + caps:** tick evos; enforce 3 PS+ / 8 basic; disable owned ones.
1.6 **Apply loop:** apply each selected (await), optional claim, small delay, then
    state-safe refresh + re-render.

*Exit:* pick a player, tick 4–5, apply, see them on the card without reloading.
*(Cut for now: role auto-suggest. Add later only if wanted.)*

## 7. Phase 2 — SBC builder (minimal; chemistry is the hard part — defer it)

2.1 **Discover:** find `services.SBC` and the open-challenge requirements object.
2.2 **Show requirements** in the panel (read-only milestone).
2.3 **Fodder list:** rank eligible club players using LOCAL club data only -
    untradeable / duplicates first, then lowest rating (and discard value). No
    price API (prices stay out of scope; "cheapest" here = cheapest for *me* to
    give up, which the app already knows locally).
2.4 **Auto-fill v1:** fill slots from that ranked fodder to meet *count + min
    rating* only; show resulting chemistry but don't optimise it; I submit manually.

*Exit (v1):* with an SBC open, panel shows requirements and fills count+rating from
cheap fodder, leaving me to review and submit.
*(Later: chemistry-aware fill — a separate optimisation problem.)*

---

## 8. The build loop (every step)
ask for ONE change → it edits + explains → paste into Console (or update bookmark)
→ reload app → test → paste any red Console errors back → repeat.

## 9. Discovery cheat-sheet (paste in DevTools Console)
```js
Object.keys(window.services || {}).sort();          // what services exist
Object.keys(window.repositories || {}).sort();      // what repositories exist
Object.getOwnPropertyNames(Object.getPrototypeOf(window.services.Academy)); // its methods
```
