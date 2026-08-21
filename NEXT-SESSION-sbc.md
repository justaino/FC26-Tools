# FC26 Tools - SBC Solver: where it got to, and what's left

## Paste this to start the next session

> Read `CLAUDE.md`, then `NEXT-SESSION-sbc.md`, then `Documentation/RUNBOOK.md` section 3y
> before doing anything.
>
> Context: the SBC Solver SHIPPED in v45, along with the PS+ cap going to 5 and a fix for
> evolved cards being wrongly excluded. `main` and `dev` are level.
>
> Section 3y records five things that were got wrong once and shouldn't be again: squad
> rating is an average with empty slots counting as zero; don't minimise the sum of ratings;
> a requirement's `count` decides whether it applies to one player or all of them; slot
> count doesn't identify an SBC; and the same player can't be in a squad twice. Take those
> as settled - they were each found by testing in the live app.
>
> I'll tell you what I want to do next. If I don't, ask me the open questions at the bottom
> of `NEXT-SESSION-sbc.md` rather than picking something yourself. Remember you can't see
> the live app: give me exact Console commands that RETURN their answer and wait for me to
> paste the output back.

---

Read `CLAUDE.md` first (standing rules: drive `window.services.*`, never guess an ID or
method - give me the exact Console command and WAIT for the output, one change then tell me
how to test, no em dashes, work on `dev`, `node release.js "note"` before any commit that
changed the bookmarklet, update RUNBOOK + CHANGELOG when a feature ships).

**Before anything else, read `Documentation/RUNBOOK.md` section 3y.** It has the full
write-up: the API, the rating formula, the two cost-model mistakes and the two bugs. This
file is just the state of play and the open questions.

## Status

**SHIPPED in v45.** The SBC Solver, the PS+ cap going to 5 (with all 37 role lists re-pulled
from fut.gg at 5+8), and the evolution fix all went out together.

Before that, **v44** fixed the club loader stopping at ~915 of 1785 players, which had been
silently affecting the picker, the Justaino Score rankings and Best XI.

## What it does

Opens from the **🧩 SBC Solver** square in the Lineup column.

1. **Reads** the SBC open in the game: name, slots, requirements in EA's own words.
2. **Pools** your club: who this SBC would accept, and why the rest were excluded.
3. **Solves** the team rating: the cheapest cards you own that get there.
4. **Fills** the squad. **It deliberately does NOT submit** - filling is reversible,
   submitting is not, so that press stays yours in the game.

Steps 1-3 are read-only. Step 4 is behind a confirm listing all eleven cards.

## The things that were got wrong once, so don't get them wrong again

These are all written up properly in RUNBOOK 3y, listed here so they're impossible to miss:

- **"88 rated" is an average, not eleven 88s.** EA's formula is
  `floor(round(total + excess) / size)` where `excess` sums each rating above the average.
  **Empty slots count as ZERO over the full squad size.** Verified against the game's own
  `squad.getRating()` - `window.FC26.ratingCheck()` reports `agree`. If it's ever false,
  the game is right and we're wrong.
- **Don't minimise the sum of ratings.** That was the first cost model and it spent two 94s
  to save eight rating-points of 84. Cost grows exponentially with rating now
  (`window.FC26.sbcCostGrowth`, default 1.7).
- **A requirement's `count` matters.** `-1` = every player; anything else = that many
  players. Treating "Min. 1 TOTW" (count 1) as squad-wide broke the specials toggle.
- **Slot count does NOT identify an SBC.** Nearly all have 11, so a plan for one filled a
  different one. `sbcFingerprint()` uses ids plus a summary of the real requirements.
- **The same player can't be in a squad twice.** Enforced in three places, all needed. Uses
  the existing `playerKey()`.

## Known limits

- **Chemistry is out of scope.** Any SBC with a chemistry requirement shows ✗ and gets no
  plan. This is a real limit, not a temporary one. Nobody has measured how many of the SBCs
  actually done in practice this rules out - **worth checking before investing more.**
- **Only "minimum" team rating is handled.** An exact-rating SBC is refused with a clear
  message.
- Squad rating solving assumes ratings within 6 of the target; outside that it won't look.

## Open questions for the next session

1. **Does it get used?** It shipped, but the honest test is still whether it gets reached
   for when actually doing SBCs. RUNBOOK 3y keeps the three-step delete instructions if not.
2. **Chemistry** - worth attempting, or is the answer to keep saying no?
3. **Alternatives per slot** was raised and deliberately not built, because locking covers
   the same need more safely. Revisit only if locking turns out to be annoying in practice.
4. The **cost growth default (1.7)** was picked by reasoning, not by comparing against real
   market prices. If plans ever feel wrong, that number is the first dial to turn.

## Where the code is

All in `fc26-tools.js`, fenced between `### SBC-SOLVER BEGIN ###` and
`### SBC-SOLVER END ###`, plus one `miniRow` in the layout assembly and the `.sbc-*` rules
in the stylesheet. Nothing else in the tool reads it.

Console helpers: `window.FC26.readSbc()`, `openSbcPage()`, `ratingCheck()`,
`sbcLocks.list()`, `sbcLocks.clear()`, `sbcCostGrowth`.

`Reference/paletools/` (gitignored) holds a deobfuscated copy of Paleta's rival tool, with
a README covering the FC26 SBC API. It is study material only - never copy code out of it.
