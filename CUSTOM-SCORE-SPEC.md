# Score Customiser - custom scoring spec (approved)

Design pitch: https://claude.ai/code/artifact/309618c5-54e1-4760-b93c-0c129b9e6e05

A new full-panel page that lets the user re-weight the rating with their own numbers,
while the Justaino Score stays the shipped baseline and the default.

## The rule

**Two scores, never both at once.** A single switch decides which one the whole hub is
speaking: Rankings, Best XI, the Squad Builder draft, the player-card score pill and any
squad created in game. There is no state where half the tool disagrees with the other half.

## Why it is cheap

`scorePlayer(it, group)` (fc26-tools.js ~981) is a pure function reading module-level
numbers at call time, and **nothing caches a score** - every ranking row, pitch dot and
pill recomputes on render. Change the numbers, re-render, everything follows. The only
exception is the Gauntlet Squad Builder, which builds squads into state (see step 4).

## What is tunable

| Knob | Today | Where |
|---|---|---|
| `STAT_MIX` / `PS_MIX` | 0.50 / 0.50 | one "balance" slider, always totals 1 |
| `OVR_MIX` | **0.01** (was 0.15) | dial, 0-25% |
| `PSPLUS_MULT` | 3.5 | dial, 1-6x |
| `PS_CEIL_PLUS` | 5 | dial, 3-8 |
| `DRAFT_OVR_MIX` | 0.6 | advanced (Squad Builder draft blend) |
| `STAT_WEIGHTS` | 9 groups x 6 stats | advanced, per-position |
| `TRAIT_STAT_WEIGHTS` | 8 groups x 2 | advanced, same per-position editor |
| rank schedule in `roleWeightsFromList` | 4/3/2/1 hardcoded | advanced, four numbers |

Out of scope: editing the `ROLES` priority lists themselves (the drag-to-reorder job behind
SUGGEST-RANKING-TEMPLATE.md). `PLAYSTYLE_WEIGHTS` is dead fallback - all 9 groups have ROLES
entries - so it is not exposed.

## Storage

localStorage `FC26_scoreCfg` = `{ v: 1, on: false, cfg: { ...only the differences } }`.

Storing **deltas from the baseline**, not a full copy, means an untouched knob follows the
next seasonal retune of the Justaino Score instead of freezing at an old number. `v` lets a
future schema change migrate or discard cleanly.

## Naming (decisions taken, flip on request)

- On-screen name for the custom score: **"My Score"** (short enough for the player pill).
- In-game squad name when custom is active: **"My Score Squad N"**. `isJscoreSquadName()`
  widens to match both name families so old "Justaino Score Squad N" still cleans up.
- Changing a setting marks any built Gauntlet squads **out of date** with a one-tap
  Rebuild, rather than silently redrafting while a slider is being dragged.

## Build steps

1. **Config core, no UI** (~2 hrs). `SCORE_DEFAULTS` frozen, `activeCfg()`, the localStorage
   store, rewire ~12 read sites off the loose vars. Console-testable.
2. **The page** (~3 hrs). Launch tile in the lineup column, page shell, active switch,
   presets, balance, three dials, save, reset.
3. **"Who this moves"** (~1 hr). Live re-rank of the top few at a position with movement
   against the Justaino order, off the club already in memory. No new data calls.
4. **Carry the label** (~2 hrs). Pill, page titles, ranking note, squad naming + removal
   matching, Squad Builder stale banner and Rebuild.
5. **Advanced weights** (~3 hrs). Per-position stat weights + skill moves/weak foot, and
   the role priority curve.

Steps 1-4 are the shippable feature. Step 5 can wait for a later version.

Each step: `node minify.js`, then `node release.js "note"` before the commit, plus RUNBOOK
and CHANGELOG entries (CLAUDE.md rules).
