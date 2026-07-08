# Phase 3 - Polish: Claude Code prompts (optional but recommended)

Do these AFTER Phase 1 and Phase 2 both work. They're pure UI - no service or
catalog changes - so they're low-risk. The point: once one panel holds two tools,
it gets cluttered, so we tidy it.

Same rules apply (CLAUDE.md). One prompt at a time; test after each.

---

## 3.1 - Tabbed panel (EVO / SBC)

```
Phase 3, step 3.1 - tidy the panel into tabs. Right now both tools live in one
panel and it's getting busy.

Add two tabs at the top of the panel: "EVO" and "SBC". Clicking a tab shows that
tool's controls and hides the other's. Default to the EVO tab.

This is a UI reorganisation only - REUSE all existing feature code, don't rewrite
or change any service calls. Don't break either tool. Plain-English comments. Tell
me how to test (switch tabs, confirm each tool still works).
```

---

## 3.2 - Draggable, collapsible, closable

```
Step 3.2 - make the panel nicer to live with. reference-evo.js has working
drag logic you can adapt.

- make the panel draggable by its title bar so it doesn't cover the game
- add a small "–" button that collapses it to just the title bar, and expands again
- add a small "x" button that hides it (I'll re-open by clicking the bookmarklet,
  which already re-shows an existing panel)

Reuse the drag approach from reference-evo.js. UI only - don't touch service calls.
Don't break tabs or either tool. Plain-English comments. Tell me how to test.
```

---

## 3.3 - Small quality-of-life (optional)

```
Step 3.3 - optional niceties, only if easy and safe:
- remember which tab (EVO/SBC) I last used during this session
- keep a small scrollable status/log line at the bottom showing the last few
  actions and any errors, so I'm not relying on the Console
- make sure nothing here re-introduces a page reload

UI/state only. Keep everything working. Plain-English comments. Tell me how to test.
```

---

## Done
Both tools live behind clean tabs in a panel I can move, collapse, and close,
with a visible status line. Regenerate the bookmarklet when you're happy.
