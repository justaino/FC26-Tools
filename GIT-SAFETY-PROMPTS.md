# Git safety - Claude Code prompts (your "save points")

You're a non-coder letting an AI rewrite your file over and over. Without save
points, one bad edit can wipe a working feature with no undo. Git fixes that -
think of it like manual saves in a game: make one whenever you reach a checkpoint,
reload an earlier one if you mess up. Claude Code runs all the commands; you just
paste the prompts.

---

## Step 1 - Turn on saving (one time)

```
Set up version control for this project so I can save working versions and roll
back. Initialise git in this folder, add a sensible .gitignore, and make a first
commit of everything as it stands. I'm not a coder - briefly explain what you did in
plain English, and tell me the single command to undo back to a save point if I ever
need it.
```

(macOS may pop up a "install command line developer tools" box the first time -
click Install, wait, then re-run the prompt.)

---

## Step 2 - Make a save point (after EVERY step that works)

Do this the moment a step tests correctly - before starting the next one.

```
That works. Commit it as a save point with a short message describing what now
works (e.g. "EVO apply loop working"). Keep the message plain.
```

---

## Step 3 - Reload an earlier save (when something breaks)

```
That change broke things and I want to undo it. Show me my recent save points,
then roll the files back to the last one that worked. Confirm with me which one
before you do it. After rolling back, tell me what state I'm in.
```

---

## Habit
Work step → test → if good, **save point (Step 2)** → next step. If a step goes
bad and you can't quickly fix it, **reload (Step 3)** rather than digging a deeper
hole. That loop keeps you safe no matter how experimental you get.
