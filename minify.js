// Minify fc26-tools.js into a one-line bookmarklet.
// Strips // and /* */ comments and collapses whitespace, but preserves the
// contents of '..' ".." `..` strings AND /regex/ literals verbatim. Regex
// detection uses the previous significant character (our regexes all follow "(").
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname; // run with: node minify.js  (from the project root)
const src = fs.readFileSync(path.join(ROOT, "fc26-tools.js"), "utf8");

let out = "";
let i = 0;
const n = src.length;
let prevSig = ""; // last non-whitespace char we emitted (for regex detection)

function isRegexStart(prev) {
  // A "/" begins a regex when the previous significant char can't end an
  // expression. Covers all regexes in this file (they follow "(").
  return prev === "" || "(,=:[!&|?{};\n".indexOf(prev) !== -1;
}

while (i < n) {
  const c = src[i];
  const c2 = src[i + 1];

  // line comment
  if (c === "/" && c2 === "/") {
    while (i < n && src[i] !== "\n") i++;
    continue;
  }
  // block comment
  if (c === "/" && c2 === "*") {
    i += 2;
    while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
    i += 2;
    continue;
  }
  // strings and template literals
  if (c === '"' || c === "'" || c === "`") {
    const q = c;
    out += c; i++;
    while (i < n) {
      const d = src[i];
      out += d;
      if (d === "\\") { out += src[i + 1] || ""; i += 2; continue; }
      i++;
      if (d === q) break;
    }
    prevSig = q;
    continue;
  }
  // regex literal
  if (c === "/" && isRegexStart(prevSig)) {
    out += c; i++;
    let inClass = false;
    while (i < n) {
      const d = src[i];
      out += d;
      if (d === "\\") { out += src[i + 1] || ""; i += 2; continue; }
      if (d === "[") inClass = true;
      else if (d === "]") inClass = false;
      i++;
      if (d === "/" && !inClass) break;
    }
    // consume regex flags
    while (i < n && /[a-z]/i.test(src[i])) { out += src[i]; i++; }
    prevSig = "/";
    continue;
  }
  // whitespace: collapse any run to a single space
  if (c === " " || c === "\t" || c === "\n" || c === "\r") {
    let j = i;
    while (j < n && /\s/.test(src[j])) j++;
    // only keep a space if it separates two token characters
    if (out.length && !/\s$/.test(out)) out += " ";
    i = j;
    continue;
  }
  // normal character
  out += c;
  prevSig = c;
  i++;
}

// tidy: drop spaces that are clearly unnecessary around punctuation is risky,
// so we keep it conservative - the result is already a single line.
out = out.trim();

// ---- stamp a BUILD ID so a stale copy can never masquerade as the latest ----
// The source says FC26_VERSION = "dev", which is the same string for every dev build -
// so if you pasted a cached bookmarklet the panel still said "dev" and looked right.
// Here we replace it with "dev-<6 hex>", a fingerprint of the code itself: same code
// always gives the same id, any change gives a new one. The panel's header badge shows
// it, so you can eyeball the badge against what this script prints.
// (release.js overwrites the same slot with the real "vN" when you cut a version, and it
//  blanks this slot before comparing builds, so its "no change" check still works.)
const VERSION_RE = /(FC26_VERSION\s*=\s*")[^"]*(")/;
const buildId = "dev-" + crypto.createHash("sha1").update(out.replace(VERSION_RE, "$1$2")).digest("hex").slice(0, 6);
if (!VERSION_RE.test(out)) {
  console.warn('minify.js: heads-up - no FC26_VERSION="..." in the source, so the build has no id.');
}
out = out.replace(VERSION_RE, "$1" + buildId + "$2");

const bookmarklet = "javascript:" + out;

// Syntax-check: this throws if the minified body isn't valid JS.
try {
  // Validate the function body (strip the "javascript:" prefix for the check).
  new Function(out);
  console.log("SYNTAX OK");
} catch (e) {
  console.error("SYNTAX ERROR:", e.message);
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, "bookmarklet.txt"), bookmarklet + "\n");
console.log("Wrote bookmarklet.txt  (" + bookmarklet.length + " chars)");
console.log("");
console.log("  BUILD ID: " + buildId);
console.log("  The panel's header badge must read exactly this. If it doesn't, you're");
console.log("  running a cached copy - don't copy out of the editor, copy the file:");
console.log("");
console.log("      pbcopy < bookmarklet.txt");
console.log("");
