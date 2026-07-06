# Men Gallant FC · Justaino PS Tool

A personal **bookmarklet** for the EA FC 26 Web App. It adds a floating panel to
pick a club player, tick PlayStyles / PlayStyle+, and apply them all at once. It
drives the app's own logged-in services — no passwords, no servers.

> This README is the quick reference. Full detail lives in **RUNBOOK.md** (use +
> maintain), **CLAUDE.md** (build context), **PLAN.md** (scope).

## Install / use

- Install page: **https://justaino.github.io/FC26-Tools/** (drag on desktop, copy on mobile).
- Or use the one line in `bookmarklet.txt` as a bookmark's URL.
- Open the FC 26 Web App, let your club load, click the bookmark. Every click
  rebuilds fresh — no reset needed after an update.

## Ship a change (the important bit)

Edit the readable source, test it, **then cut a version before committing** — this
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

### Version admin

```
node minify.js            # everyday rebuild of bookmarklet.txt (no version cut)
node release.js list      # show published versions (MGFC_Justaino_vN), newest first
node release.js remove 3  # delete version 3 from the install page
```

## Files

| File | What |
|---|---|
| `fc26-tools.js` | The readable source — **edit this**. |
| `bookmarklet.txt` | Generated one-line bookmarklet for daily use. |
| `minify.js` | Rebuilds `bookmarklet.txt` from the source. |
| `release.js` | Cuts / lists / removes install-page versions. |
| `versions.js` | Generated list of published versions (the install page reads it). |
| `index.html` | GitHub Pages install page (renders itself from `versions.js`). |
| `RUNBOOK.md` · `CLAUDE.md` · `PLAN.md` | Use guide · build context · scope. |
