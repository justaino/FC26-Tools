# Phase 2 - SBC builder: Claude Code prompts

The last build phase. Paste into Claude Code (running in ~/fc26-tools), **one at a
time, in order**. CLAUDE.md already carries the rules (drive the app's services,
comment for a non-JS dev, tell me how to test each time).

Golden rule: after EACH prompt, test it and paste any Console output / errors back
BEFORE the next one.

> Honest heads-up: SBC is harder than the EVO tool. The data model (sets →
> challenges → requirements → squad slots) is bigger, and I couldn't pre-confirm
> the SBC service name the way I could for Academy - so 2.1 is discovery-heavy and
> may take a couple of rounds. Chemistry is the hard core and is deferred to the
> OPTIONAL section at the bottom.

**Before you start:** Web App → Squad Building Challenges → enter one challenge so
the squad screen is visible. The discovery steps read the *currently open* challenge.

---

## 2.1 - Discover the SBC objects (no code yet)

```
Phase 2, step 2.1 (discovery) - no feature code yet. I have an SBC open in the Web
App (a challenge entered, squad screen visible).

Give me Console commands, a few at a time, to find:
1. which key in window.services and window.repositories relates to SBC - list both
   key sets sorted and point out anything matching /sbc|challenge|squad/i
2. once we know the SBC service, its method names
3. the object for the currently open challenge and its requirements - print it so I
   can see how requirements (rating, chemistry, count, nationality, etc.) are stored
4. how to read the challenge's squad slots (which are empty vs filled)
5. whether placing a player in a slot returns an "observable" (so we can REUSE the
   observe-to-promise helper from Phase 1), and how to tell which challenge is open

For each command, tell me what a good result looks like. Then wait for my output.
```

---

## 2.2 - Show requirements (read-only milestone)

```
Step 2.2. Here's what discovery returned:
[PASTE YOUR 2.1 RESULTS HERE]

Add to fc26-tools.js a READ-ONLY feature: when an SBC challenge is open, show its
requirements in the panel.

- prefer any human-readable requirement text the app already provides; only map
  requirement type codes to words if there's no ready-made text
- one requirement per line (e.g. "Min team rating: 84", "Chemistry: 28+",
  "Players: 11")
- read-only: do not place or change anything

Don't break existing features. Plain-English comments. Tell me how to test - which
SBC to open and what the panel should show versus what the game shows.
```

---

## 2.3 - Fodder list (ranked from LOCAL data, no prices)

```
Step 2.3 - the fodder list. Add a list of my cheapest club players to use as SBC
fodder, ranked using LOCAL data only (no price API).

Rank order: untradeable first, then duplicates, then lowest rating, then lowest
discard / quick-sell value. Show name + rating + untradeable/dup flags.

- cap the list to the top ~50 (my club can have thousands of players - don't render
  them all or the panel will lag)
- if the open challenge exposes a way to check whether a player is ELIGIBLE for it
  (rarity / league / nation etc.), filter to eligible players only

If you need a property or method to read untradeable / duplicate / rating / discard
value / eligibility, give me the Console command to find it first, then wait.

Plain-English comments. Tell me how to test.
```

---

## 2.4 - Auto-fill v1 (fill + show pass/fail, I submit manually)

```
Step 2.4 - auto-fill v1. Add a "Fill with fodder" button for the open challenge.

- fill every EMPTY squad slot with the cheapest eligible fodder from the 2.3 list,
  using the SBC service method for placing a player in a slot (if you don't know
  that method name yet, give me a Console command to find it first, then wait)
- reuse the Phase 1 observe-to-promise helper if placement is observable
- short delay (~300ms) between placements; a Stop button to abort the rest
- DO NOT try to satisfy chemistry or re-implement EA's squad-rating maths. Instead,
  after filling, use the app's OWN requirement check to show each requirement as
  pass / fail in the panel, so I can see at a glance what's met
- also add a "Remove all fodder" button that clears the players I just auto-placed,
  so I can undo a bad fill without removing each one by hand
- state-safe refresh so the squad redraws; leave the final SUBMIT to me (manual)
- if a placement fails, skip it, report it, and keep going - don't abort everything

Plain-English comments. Walk me through what changed, then tell me exactly how to
test on a cheap, low-rating SBC first.
```

---

## Done = Phase 2 exit criteria

With an SBC open, the panel shows its requirements, lists cheap local fodder, fills
the empty slots, shows pass/fail per requirement, and can undo the fill - I review
and submit manually. Then regenerate the bookmarklet ("give me the updated
bookmarklet line"). That's the whole project: EVO assigner + SBC builder.

---
---

# OPTIONAL APPENDIX - 2.5 Chemistry-aware fill

Only attempt once 2.1–2.4 are solid. Full optimal SBC solving is a real
optimisation problem and overkill for a personal tool - so this is a *heuristic*
(good enough), not a perfect solver. Skipping it is a valid choice.

```
OPTIONAL upgrade - only now that 2.1-2.4 work. Improve "Fill with fodder" to try to
satisfy chemistry, using a simple heuristic (NOT a perfect solver):

- when picking fodder for a slot, prefer cheap players who share a league, nation,
  or club already common in the squad, to raise chemistry
- after filling, re-check requirements using the app's own checker and show the
  chemistry result; if chemistry still fails, tell me which slots to swap manually
- keep it a heuristic: a few improvement passes, then stop - don't try every combination

Keep everything from 2.4 working. Plain-English comments. Tell me how to test and
how to tell whether chemistry actually improved.
```
