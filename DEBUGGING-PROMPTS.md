# Debugging - Claude Code prompts for when things break

Not a phase - a grab-bag. When something goes wrong, find the matching section,
gather what it asks for, then paste the prompt. These work at any point in the build.

**The one rule that matters:** paste the FULL red error text, exactly as it appears
in the Console - don't summarise or retype it. The exact wording is what lets
Claude Code find the cause. Right-click the red line → Copy, or screenshot it.

---

## A - The panel doesn't appear at all

Gather: open the Console (⌥⌘J) and look for red errors right after you click the
bookmarklet (or paste the source).

```
My FC26 panel isn't showing up. I clicked the bookmarklet / pasted the source on
the loaded Web App and nothing appeared. Here's what the Console shows:
[PASTE ANY RED ERRORS, OR "no errors"]

Walk me through finding why - give me Console checks one at a time. Likely suspects:
the panel id already exists, an error before the panel is added, or I'm not on a
page where document.body is ready. Tell me what to run and what a good result looks like.
```

---

## B - A button throws an error when I click it

Gather: the full red error from the Console, and which button you clicked.

```
Clicking [WHICH BUTTON] in the panel throws this error:
[PASTE THE FULL RED ERROR]

Explain in plain English what it means, then give me a Console command to confirm
the cause before you change any code. Don't guess at a fix - verify first, then patch.
```

---

## C - It "worked" but nothing changed in the game

```
The action reported success but I don't see the change in-game (the new PlayStyles
/ the filled SBC slots). No reload fixed it / a reload was needed.

This is probably the state-safe refresh not firing. Show me how the current code
marks data dirty after a change, give me a Console command to check whether the
refresh is actually running, then fix it so changes show WITHOUT a reload. Tell me
how to test.
```

---

## D - The bookmarklet does nothing, but pasting the source in the Console works

```
When I paste the source into the Console it works, but clicking the bookmarklet
does nothing. 

This points at either a stale bookmarklet line or the page blocking it. First,
give me the freshly regenerated bookmarklet line from the current fc26-tools.js so
I can replace the bookmark. If that still fails, explain how to confirm whether the
page's security policy is blocking it, and what my fallback is.
```

---

## E - EA updated the Web App and now it's broken

This is the big one - EA pushes updates that can rename internal objects or change
IDs. When a tool that *used* to work suddenly doesn't, suspect this first.

Gather: run the discovery cheat-sheet from PLAN.md and copy the output.

```
The tool used to work and now doesn't - I think EA updated the Web App. Here's the
current state of the app's internals:
window.services keys: [PASTE]
window.repositories keys: [PASTE]
Academy methods (if relevant): [PASTE]
And the error I'm seeing: [PASTE FULL RED ERROR]

Compare this to what fc26-tools.js expects. Tell me exactly which names or IDs
changed, and patch the code to match. If a catalog ID changed, give me a Console
command to find the new value before patching. Tell me how to test.
```

---

## When a fix makes things worse

Stop and roll back to your last working save point - see GIT-SAFETY-PROMPTS.md.
A clean known-good version beats debugging a tangle.
