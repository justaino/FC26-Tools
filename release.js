// release.js - manage the bookmarklet VERSIONS shown on the install page.
//
// WHAT THIS IS FOR
// ----------------
// `node minify.js`  = your everyday rebuild while testing (source -> bookmarklet.txt).
//                     Run it as often as you like; it does NOT create a version.
// `node release.js` = "I'm happy with this build and about to commit."
//                     Run it ONCE when you're ready. It rebuilds the bookmarklet,
//                     then stamps the current build as the NEXT version
//                     (MGFC_Justaino_v1, v2, v3 ...) in versions.js, keeping every
//                     older version intact so the install page can still offer them.
//
// COMMANDS
//   node release.js                     -> cut a new version (no changelog note)
//   node release.js "what changed"      -> cut a new version WITH a short note
//   node release.js list                -> list the versions on the page right now
//   node release.js remove <n>          -> delete version n (e.g. remove 3)
//
// The install page (index.html) reads versions.js and always shows the newest one
// as the main install, with the rest listed under "Previous versions".

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const VERSIONS_JS = path.join(ROOT, "versions.js");
const BOOKMARKLET = path.join(ROOT, "bookmarklet.txt");

// ---- read / write the versions list ---------------------------------------
// versions.js is written by THIS script as:  window.FC26_VERSIONS = [ ...json... ];
// so we read it back by stripping that wrapper and JSON-parsing the array.
function readVersions() {
  if (!fs.existsSync(VERSIONS_JS)) return [];
  const text = fs.readFileSync(VERSIONS_JS, "utf8");
  const json = text.replace(/^﻿?\s*window\.FC26_VERSIONS\s*=\s*/, "").replace(/;\s*$/, "");
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error("release.js: could not parse versions.js - is it hand-edited? " + e.message);
    process.exit(1);
  }
}
function writeVersions(versions) {
  fs.writeFileSync(VERSIONS_JS, "window.FC26_VERSIONS = " + JSON.stringify(versions, null, 2) + ";\n");
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
  console.log("Removed " + label(target) + " (" + target.date + ").");
  if (!kept.length) {
    console.log("versions.js is now EMPTY - the install page will show no bookmarklet until you cut one.");
  } else if (wasLatest) {
    console.log("Heads up: v" + n + " was the LATEST, so the page's main install is now " + label(kept[0]) + ".");
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

// 4) Skip a pointless release: newest stored version identical to what we just built
//    (ignoring the version stamp, which always differs since the source says "dev").
if (versions.length && stripVersion(versions[0].code) === stripVersion(code)) {
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

// 7) Prepend the new version (newest first) and write versions.js back out.
versions.unshift({ v: nextV, date: date, note: note, code: stampedCode });
writeVersions(versions);

console.log(
  "Released MGFC_Justaino_v" + nextV + "  (" + date + ")" +
  (note ? '  - "' + note + '"' : "") +
  "  ·  " + versions.length + " version(s) on the page now."
);
console.log("Next: commit versions.js (and bookmarklet.txt) and push to dev.");
