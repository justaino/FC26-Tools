// release.js - manage the bookmarklet VERSIONS shown on the install page.
//
// WHAT THIS IS FOR
// ----------------
// `node minify.js`  = your everyday rebuild while testing (source -> bookmarklet.txt).
//                     Run it as often as you like; it does NOT create a version.
// `node release.js` = "I'm happy with this build and about to commit."
//                     Run it ONCE when you're ready. It rebuilds the bookmarklet,
//                     then stamps the current build as the NEXT version
//                     (MGFC_Justaino_v1, v2, v3 ...) in versions.js. To keep the file
//                     (and the page) light, it keeps only the newest version plus the
//                     last MAX_OLDER_VERSIONS older ones (see below) - older entries
//                     are pruned automatically. History still lives in git if ever needed.
//
// COMMANDS
//   node release.js                     -> cut a new version (no changelog note)
//   node release.js "what changed"      -> cut a new version WITH a short note
//   node release.js list                -> list the versions on the page right now
//   node release.js remove <n>          -> delete version n (e.g. remove 3)
//
// The install page (index.html) reads versions.js and always shows the newest one
// as the main install, with the rest listed under "Previous versions".
//
// LOADERS - why the installed bookmark is tiny
// --------------------------------------------
// The full build is ~270,000 characters. Desktop browsers cope with that in a
// bookmark, but Android Chrome does NOT - its bookmark URL field gives up long
// before then, so the tool was impossible to install on Android.
//
// So we don't put the build in the bookmark any more. We publish the build as a
// normal file on the site (releases/vN.js) and the bookmark holds a ~300-character
// "loader": fetch that file, then run it. That works everywhere and means a friend
// never has to re-install to get an update.
//
// Why fetch-then-run instead of the usual <script src="..."> trick: the FC web app
// sends a Content-Security-Policy that refuses to load scripts from other sites, so
// a script tag is blocked outright. The same policy allows 'unsafe-eval' and does
// not restrict connect-src, so fetching the text and eval'ing it is permitted. That
// is exactly what the loader does. (Verified against the live app.)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const VERSIONS_JS = path.join(ROOT, "versions.js");
const BOOKMARKLET = path.join(ROOT, "bookmarklet.txt");

// Where the published builds live. RELEASES_DIR is the folder in this repo;
// SITE is the public address GitHub Pages serves it from (see CNAME).
const RELEASES_DIR = path.join(ROOT, "releases");
const SITE = "https://justaino.com";

// Build the tiny loader bookmarklet for a given published file.
//   file = "latest.js"  -> always runs the newest release (what the page installs)
//   file = "v39.js"     -> pinned to that exact version (the "Previous versions" list)
// The ?t= cache-buster stops the browser serving yesterday's copy, which is the same
// stale-code trap the BUILD ID in minify.js protects against.
function loaderFor(file) {
  return (
    "javascript:(function(){fetch('" + SITE + "/releases/" + file + "?t='+Date.now())" +
    ".then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})" +
    ".then(function(c){(0,eval)(c)})" +
    ".catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  );
}

// The bookmarklet is "javascript:" + the actual code. A published release file holds
// just the code (no "javascript:" prefix), because the loader eval's it as plain JS.
function toPayload(bookmarklet) { return bookmarklet.replace(/^javascript:/, ""); }

// Write releases/vN.js and point releases/latest.js at the same content.
function publishRelease(v, payload) {
  if (!fs.existsSync(RELEASES_DIR)) fs.mkdirSync(RELEASES_DIR);
  fs.writeFileSync(path.join(RELEASES_DIR, "v" + v + ".js"), payload + "\n");
  fs.writeFileSync(path.join(RELEASES_DIR, "latest.js"), payload + "\n");
}

// Read a published release back (returns "" if it isn't there).
function readRelease(file) {
  const p = path.join(RELEASES_DIR, file);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : "";
}

// How many OLDER versions to keep alongside the latest. The install page (and this
// file) therefore holds at most MAX_OLDER_VERSIONS + 1 entries; anything beyond that
// is pruned when a new version is cut. Bump this if you ever want a longer tail.
const MAX_OLDER_VERSIONS = 2;

// Trim a newest-first versions array down to the latest + MAX_OLDER_VERSIONS older.
// Returns { kept, dropped } so callers can report what was pruned.
function capVersions(versions) {
  const keep = MAX_OLDER_VERSIONS + 1;
  if (versions.length <= keep) return { kept: versions, dropped: [] };
  return { kept: versions.slice(0, keep), dropped: versions.slice(keep) };
}

// ---- read / write the versions list ---------------------------------------
// versions.js is written by THIS script as two globals:
//   window.FC26_LATEST   = "<loader for releases/latest.js>";   (the main install)
//   window.FC26_VERSIONS = [ ...json... ];                      (newest first)
// so we read it back by finding the array and JSON-parsing it.
function readVersions() {
  if (!fs.existsSync(VERSIONS_JS)) return [];
  const text = fs.readFileSync(VERSIONS_JS, "utf8");
  const at = text.indexOf("window.FC26_VERSIONS");
  if (at === -1) return [];
  const json = text.slice(at).replace(/^window\.FC26_VERSIONS\s*=\s*/, "").replace(/;\s*$/, "");
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error("release.js: could not parse versions.js - is it hand-edited? " + e.message);
    process.exit(1);
  }
}
function writeVersions(versions) {
  fs.writeFileSync(
    VERSIONS_JS,
    'window.FC26_LATEST = ' + JSON.stringify(loaderFor("latest.js")) + ";\n" +
    "window.FC26_VERSIONS = " + JSON.stringify(versions, null, 2) + ";\n"
  );
}
function label(x) { return "MGFC_Justaino_v" + x.v; }

// The panel shows its version from `var FC26_VERSION="..."` in the code. We stamp the
// real vN into that string when cutting a release (below). So two builds that differ
// ONLY by that stamp should count as "no change" - we compare with the stamp blanked.
const VERSION_RE = /(FC26_VERSION\s*=\s*")[^"]*(")/;
function stripVersion(code) { return code.replace(VERSION_RE, "$1$2"); }

// ---- command dispatch ------------------------------------------------------
const cmd = (process.argv[2] || "").toLowerCase();

// node release.js list
if (cmd === "list" || cmd === "ls") {
  const versions = readVersions();
  if (!versions.length) { console.log("No versions yet. Run `node release.js` to cut v1."); process.exit(0); }
  console.log("Versions on the install page (newest first):\n");
  versions.forEach(function (x, i) {
    console.log("  " + label(x) + (i === 0 ? "  [LATEST]" : "") + "  ·  " + x.date + (x.note ? "  -  " + x.note : ""));
  });
  process.exit(0);
}

// node release.js remove <n>
if (cmd === "remove" || cmd === "rm" || cmd === "delete") {
  const n = parseInt(process.argv[3], 10);
  if (!n && n !== 0) { console.error('Usage: node release.js remove <n>   (the number in "MGFC_Justaino_vN")'); process.exit(1); }
  const versions = readVersions();
  const target = versions.find(function (x) { return x.v === n; });
  if (!target) { console.error("release.js: no version v" + n + " found. Try `node release.js list`."); process.exit(1); }
  const wasLatest = versions[0] && versions[0].v === n;
  const kept = versions.filter(function (x) { return x.v !== n; });
  writeVersions(kept);
  // Drop the published file too, so the site stops serving a version the page no
  // longer lists. Anyone who already installed that exact pin will get the loader's
  // "could not load" alert, which is the correct outcome for a withdrawn version.
  const deadFile = path.join(RELEASES_DIR, "v" + n + ".js");
  if (fs.existsSync(deadFile)) fs.unlinkSync(deadFile);
  console.log("Removed " + label(target) + " (" + target.date + ") and its releases/v" + n + ".js.");
  if (!kept.length) {
    console.log("versions.js is now EMPTY - the install page will show no bookmarklet until you cut one.");
  } else if (wasLatest) {
    // Everyone on the main install follows releases/latest.js, so it must fall back
    // to the newest surviving version rather than keep serving the withdrawn one.
    const fallback = readRelease("v" + kept[0].v + ".js");
    if (fallback) {
      fs.writeFileSync(path.join(RELEASES_DIR, "latest.js"), fallback + "\n");
      console.log("Heads up: v" + n + " was the LATEST, so the page's main install AND");
      console.log("releases/latest.js now both point at " + label(kept[0]) + ".");
    } else {
      console.log("Heads up: v" + n + " was the LATEST, so the page's main install is now " + label(kept[0]) + ",");
      console.log("but releases/v" + kept[0].v + ".js is missing - re-run `node release.js` to republish latest.js.");
    }
    console.log("(This does NOT change bookmarklet.txt - it only changes what the page offers.)");
  }
  console.log("Then commit versions.js and push.");
  process.exit(0);
}

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log([
    "node release.js                  cut a new version (no note)",
    'node release.js "what changed"   cut a new version with a changelog note',
    "node release.js list             list the versions on the page",
    "node release.js remove <n>       delete version n",
  ].join("\n"));
  process.exit(0);
}

// ---- default: cut a new version --------------------------------------------
// 1) Rebuild bookmarklet.txt from the readable source and syntax-check it. If the
//    source is broken, minify.js exits non-zero and this throws, so we never cut a
//    broken version.
console.log("Rebuilding bookmarklet from source (minify.js)...");
execSync("node minify.js", { cwd: ROOT, stdio: "inherit" });

// 2) Read the freshly built one-line bookmarklet.
const code = fs.readFileSync(BOOKMARKLET, "utf8").trim();
if (!code.startsWith("javascript:")) {
  console.error("release.js: bookmarklet.txt doesn't look like a bookmarklet. Aborting.");
  process.exit(1);
}

// 3) Load existing versions.
const versions = readVersions();

// 4) Skip a pointless release: the last PUBLISHED build is identical to what we just
//    built (ignoring the version stamp, which always differs since the source says
//    "dev"). We compare against releases/latest.js, because versions.js now stores
//    the short loader rather than the build itself.
const lastPublished = readRelease("latest.js");
if (versions.length && lastPublished && stripVersion(lastPublished) === stripVersion(toPayload(code))) {
  console.log("No change since " + label(versions[0]) + " - nothing to release.");
  process.exit(0);
}

// 5) Next version number + today's date (YYYY-MM-DD) + optional changelog note.
const nextV = versions.reduce(function (max, x) { return Math.max(max, x.v || 0); }, 0) + 1;
const date = new Date().toISOString().slice(0, 10);
const note = (process.argv[2] || "").trim();

// 6) Stamp the real version into the built bookmarklet so the panel's header badge
//    reads "vN" for anyone who installs it. Also rewrite bookmarklet.txt so the file
//    on disk matches the published version. (Running `node minify.js` later resets it
//    to the "dev" placeholder again, which is correct for an untracked test build.)
if (!VERSION_RE.test(code)) {
  console.warn('release.js: heads-up - no FC26_VERSION="..." found in the build, so the header badge won\'t show a version.');
}
const stampedCode = code.replace(VERSION_RE, "$1v" + nextV + "$2");
fs.writeFileSync(BOOKMARKLET, stampedCode + "\n");

// 7) Publish the build as a real file on the site: releases/vN.js, and repoint
//    releases/latest.js at it. This is what the installed bookmark actually fetches.
publishRelease(nextV, toPayload(stampedCode));

// 8) Prepend the new version (newest first), then prune to the latest +
//    MAX_OLDER_VERSIONS older ones so the file stays small, and write it back out.
//    The stored `code` is the tiny PINNED loader for this version, not the build.
versions.unshift({ v: nextV, date: date, note: note, code: loaderFor("v" + nextV + ".js") });
const { kept, dropped } = capVersions(versions);
writeVersions(kept);

// Pruned versions are gone from the page, so their published files are dead weight -
// delete them too. (The code is still in git history if it's ever needed again.)
dropped.forEach(function (x) {
  const p = path.join(RELEASES_DIR, "v" + x.v + ".js");
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

console.log(
  "Released MGFC_Justaino_v" + nextV + "  (" + date + ")" +
  (note ? '  - "' + note + '"' : "") +
  "  ·  " + kept.length + " version(s) on the page now."
);
console.log("Published releases/v" + nextV + ".js and releases/latest.js  (" +
  toPayload(stampedCode).length + " chars).");
if (dropped.length) {
  console.log("Pruned " + dropped.length + " old version(s) to keep only the latest + " +
    MAX_OLDER_VERSIONS + " older: " + dropped.map(label).join(", ") + " (still in git history).");
}
console.log("Next: commit versions.js, bookmarklet.txt and releases/ and push to dev.");
console.log("NOTE: the site serves from `main`, so friends only get this once dev is merged to main.");
