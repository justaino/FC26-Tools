# Phase 1 — EVO assigner: Claude Code prompts

Paste these into Claude Code (running in ~/fc26-tools, with PLAN.md, fc26-tools.js
and reference-evo.js in the folder), **one at a time, in order**.

Golden rule: after EACH prompt, do what it says to test, and paste any Console
output or red errors back BEFORE moving to the next prompt. Don't batch them.

---

## 1.1 — Discover (no code yet)

```
We're on Phase 1, step 1.1 (discovery) of PLAN.md. Don't write any feature code yet.

I'll run commands in the FC26 Web App's DevTools Console (I'm on the Evolutions /
Academy hub with my club loaded) and paste the output back to you.

Give me a short numbered list of Console commands to confirm:
1. that window.services.Academy exists, and whether it has methods named
   addItemToSlot and claimSlot
2. what window.repositories.Item.getClub() returns, and how to print the first
   player item
3. how an Academy call reports completion - i.e. whether the object it returns
   has an .observe() method

For each command, tell me in one line what a "good" result looks like. Then wait
for my output.
```

---

## 1.2 — Service plumbing (define helpers, don't call them)

```
Step 1.2. Here are my Console results from 1.1:
[PASTE YOUR RESULTS HERE]

Add to fc26-tools.js without breaking the panel:
- a helper that turns an EA "observable" service call into something I can await:
  it calls observable.observe(window, callback), resolves on success, rejects on
  failure, and always unobserves afterwards
- applyEvo(slotId, itemId) -> services.Academy.addItemToSlot(slotId, itemId, undefined)
- claimEvo(slotId) -> services.Academy.claimSlot(slotId)
- reuse the same "window.services or bare global" fallback the panel already uses

Comment every block in plain English (I don't know JavaScript). Don't call these
yet - just define them. Add a temporary "Self-test plumbing" button that logs
whether the three helpers exist, so I can confirm nothing errored. Tell me what to
click to test.
```

---

## 1.3 — Catalog (reuse the reference, then verify)

```
Step 1.3 - the PlayStyle catalog. Read reference-evo.js in this folder; it has a
full PS and PSP table.

Copy that catalog into fc26-tools.js as two arrays (PS and PS+). Each entry has:
name (n), slotId (s), rewardId (r), gk-only flag (g). Tag PS entries kind:"PS" and
PSP entries kind:"PS+". Also define the caps (3 PS+, 8 basic) and note that
traitId = rewardId - 301.

Before I trust the whole table, give me 2 Console commands to spot-check that two
of these slotIds are still valid in the current app version, then wait. Comment the
catalog. Don't build UI yet.
```

---

## 1.4 — Player picker

```
Step 1.4 - the player picker. Add to the panel a way to pick one of my club players.

- get club players from repositories.Item.getClub(), filtered to real players
  (item.isPlayer())
- show them in a scrollable list in the panel (name + OVR + rarity if available)
- clicking one selects it as the "current player" and shows its OVR, rarity, and
  current PlayStyles in a small preview area
- store the selected player in a reusable state object

If reading a player's name / OVR / current PlayStyles needs a specific property or
helper, give me a Console command to find the right property name first, then wait.
Keep existing features working. Plain-English comments. Tell me what to test.
```

---

## 1.5 — Selection + caps (no applying yet)

```
Step 1.5 - selecting evos with caps. For the currently selected player, show the
catalog as a tickable list (group PS and PS+).

Rules:
- enforce caps: max 3 PS+ and max 8 basic, counting what the player already has
  PLUS what I've ticked
- disable any evo the player already owns; disable GK-only evos when the player
  isn't a GK (and non-GK evos when they are)
- show a live count like "2 selected (1 PS+, 1 PS)"

Selection only - don't apply anything. If you need to know how to read "does this
player already have evo X" or "is this player a GK", give me a Console command to
find the right property first, then wait. Plain-English comments.
```

---

## 1.6 — Apply loop (the payoff)

```
Step 1.6 - apply the selected evos. Add an "Apply selected" button that runs the queue.

- for each ticked evo: await applyEvo(slotId, currentPlayer.id); if claiming is on,
  also await claimEvo(slotId)
- short delay (~400ms) between each call
- per-evo progress in the panel status line (done / failed). For failures, map the
  error code to a readable reason - reference-evo.js has a code map you can reuse
- a Stop button that aborts the rest of the queue
- after the run: state-safe refresh (mark the club item dirty so the app redraws)
  and re-render the player's preview so I see the new PlayStyles without reloading
- if one evo fails, keep going and report it - don't abort the whole run

Plain-English comments. Walk me through what changed, then tell me exactly how to
test on one cheap player.
```

---

## Done = Phase 1 exit criteria

Pick a player, tick 4-5 PlayStyles, hit Apply, and see them on the card in-game
without reloading. When that works, regenerate the bookmarklet (ask: "give me the
updated bookmarklet line") and move to Phase 2.
