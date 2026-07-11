# Men Gallant FC · Justaino FC Web App Tool

A personal **bookmarklet** for the EA FC 26 Web App. It adds a floating panel to
pick a club player, tick PlayStyles / PlayStyle+, and apply them all at once. It
drives the app's own logged-in services - no passwords, no servers.

> This README is the quick reference. Full detail lives in **RUNBOOK.md** (use +
> maintain), **CLAUDE.md** (build context), **PLAN.md** (scope).

## Install / use

- Install page: **https://justaino.github.io/FC26-Tools/** (drag on desktop, copy on mobile).
- Or use the one line in `bookmarklet.txt` as a bookmark's URL.
- Open the FC 26 Web App, let your club load, click the bookmark. Every click
  rebuilds fresh - no reset needed after an update.

## Ship a change (the important bit)

Edit the readable source, test it, **then cut a version before committing** - this
is what puts your change on the install page:

```
# 1. edit fc26-tools.js, then test (paste it into the FC web-app Console)

# 2. when happy, cut a new install-page version (rebuilds bookmarklet.txt too):
node release.js "short note about what changed"

# 3. commit the tool + the version files together, and push:
git add fc26-tools.js bookmarklet.txt versions.js
git commit -m "short note about what changed"
git push origin dev
```

**Skip `release.js`** for commits that don't touch the bookmarklet (docs,
`index.html`, `release.js`). Work on **`dev`**; merge to **`main`** only when ready.

## Publishing & updating (plain-English cheat-sheet)

Three separate things, easy to mix up:

- **The source** (`fc26-tools.js`) - the code on your computer.
- **The site** - the install page at **https://justaino.github.io/FC26-Tools/**, served
  from the **`main`** branch. It reads its version list from `versions.js`.
- **The bookmark button** in your browser - a saved copy of the code you click while
  playing. It does **not** auto-update when the site changes.

### A. Is the latest version on my site?
1. Open **https://justaino.github.io/FC26-Tools/**; note the version label at the top.
2. Run `node release.js list` to see the newest version number.
3. Same number → you're live. Older number → do **B** (give it 1–2 min after pushing).

### B. Put a code change live on the site
Only when `fc26-tools.js` changed:
```
node release.js "short note about what changed"     # cut the new version
git add fc26-tools.js bookmarklet.txt versions.js
git commit -m "short note about what changed"
git push origin dev                                 # save your working branch
```
Then - **the step people forget** - the site is served from `main`, so pushing to `dev`
alone does nothing to the site. Go live with:
```
git checkout main
git merge dev
git push origin main
git checkout dev
```
Wait ~1–2 min, refresh the site (step A).

### C. Update the bookmark *button* in your browser
The site being current does nothing until you refresh the button you click:
- **Computer (easiest):** show the bookmarks bar (`Ctrl/Cmd+Shift+B`), **delete the old
  button**, then **drag** the latest install button from the site onto the bar.
- **Computer (or edit instead):** click **Copy** on the site → right-click your bookmark →
  **Edit** → clear the URL field → paste → save.
- **Phone:** tap **Copy** on the site, then edit any bookmark and paste it as the URL.
- **Check:** open the FC 26 Web App, let the club load, click the bookmark - it always
  rebuilds fresh, so you're instantly on the new version.

**One-liner to remember:** edit → `node release.js "note"` → commit+push `dev` →
**merge to `main`+push** → refresh site → **re-drag the button**.

### Version admin

```
node minify.js            # everyday rebuild of bookmarklet.txt (no version cut)
node release.js list      # show published versions (MGFC_Justaino_vN), newest first
node release.js remove 3  # delete version 3 from the install page
```

## Files

| File | What |
|---|---|
| `fc26-tools.js` | The readable source - **edit this**. |
| `bookmarklet.txt` | Generated one-line bookmarklet for daily use. |
| `minify.js` | Rebuilds `bookmarklet.txt` from the source. |
| `release.js` | Cuts / lists / removes install-page versions. |
| `versions.js` | Generated list of published versions (the install page reads it). |
| `index.html` | GitHub Pages install page (renders itself from `versions.js`). |
| `RUNBOOK.md` · `CLAUDE.md` · `PLAN.md` | Use guide · build context · scope. |
