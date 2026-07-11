// meta-page.js - generate meta-rating.html (the "how the Justaino Score works"
// transparency page on the install site) straight from the REAL weight tables in
// fc26-tools.js, so the page can never drift out of sync with the tool.
//
//   node meta-page.js
//
// Run it whenever you change STAT_WEIGHTS / PLAYSTYLE_WEIGHTS / STAT_MIX / PS_MIX in
// fc26-tools.js (e.g. the seasonal meta refresh - see RUNBOOK section 7b). It reads
// those four things out of the source and rewrites meta-rating.html to match.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "fc26-tools.js");
const OUT = path.join(ROOT, "meta-rating.html");

const src = fs.readFileSync(SRC, "utf8");

// --- pull the exact values out of the source -------------------------------
// Walk from `var NAME =` to the matching close brace, then eval the object
// literal (we control this source, and it's plain numbers/strings, so it's safe).
function extractObject(name) {
  const start = src.indexOf("var " + name + " =");
  if (start === -1) throw new Error("meta-page.js: could not find " + name + " in fc26-tools.js");
  const open = src.indexOf("{", start);
  let depth = 0, end = -1;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval("(" + src.slice(open, end + 1) + ")");
}
function extractNumber(name) {
  const m = new RegExp("var\\s+" + name + "\\s*=\\s*([0-9.]+)").exec(src);
  if (!m) throw new Error("meta-page.js: could not find number " + name);
  return parseFloat(m[1]);
}

const STAT_WEIGHTS = extractObject("STAT_WEIGHTS");
const PLAYSTYLE_WEIGHTS = extractObject("PLAYSTYLE_WEIGHTS");
const STAT_MIX = extractNumber("STAT_MIX");
const PS_MIX = extractNumber("PS_MIX");
const PSPLUS_MULT = extractNumber("PSPLUS_MULT");   // a PlayStyle+ is worth this many basics
const OVR_MIX = extractNumber("OVR_MIX");            // light OVR tiebreak

// Same "ceiling" the tool uses to turn raw PlayStyle points into a 0-100 score:
// best 3 owned as PS+ (x PSPLUS_MULT) plus EVERY other meta PlayStyle as a basic.
function psMaxForGroup(group) {
  const vals = Object.values(PLAYSTYLE_WEIGHTS[group] || {}).sort((a, b) => b - a);
  let topPlus = 0, restBasic = 0;
  for (let i = 0; i < 3 && i < vals.length; i++) topPlus += vals[i];
  for (let i = 3; i < vals.length; i++) restBasic += vals[i];
  return (topPlus * PSPLUS_MULT + restBasic) || 1;
}

// --- tiny helpers -----------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
const pct = (mix) => Math.round(mix * 100);

// --- build one position card ------------------------------------------------
function positionCard(group) {
  const stats = STAT_WEIGHTS[group];
  const styles = PLAYSTYLE_WEIGHTS[group] || {};
  const maxStat = Math.max.apply(null, Object.values(stats));

  // stat weights as proportional bars (biggest weight fills the track)
  const statRows = Object.keys(stats).map(function (k) {
    const w = stats[k];
    const width = Math.round((w / maxStat) * 100);
    return '<div class="wbar">' +
      '<span class="wlabel">' + esc(titleCase(k)) + '</span>' +
      '<span class="wtrack"><span class="wfill" style="width:' + width + '%"></span></span>' +
      '<span class="wval">' + w + '</span>' +
    '</div>';
  }).join("");

  // playstyle weights, best first
  const styleRows = Object.keys(styles)
    .sort(function (a, b) { return styles[b] - styles[a]; })
    .map(function (n) {
      return '<div class="ps-row"><span class="ps-name">' + esc(n) + '</span>' +
        '<span class="ps-val">' + styles[n] + '</span></div>';
    }).join("");

  return '<section class="pos-card">' +
    '<div class="pos-head"><span class="pos-name">' + esc(group) + '</span>' +
      '<span class="pos-ceiling" title="Owning the best meta PlayStyles this position wants scores full marks on the PlayStyle half">PlayStyle ceiling ' + psMaxForGroup(group) + ' pts</span>' +
    '</div>' +
    '<div class="pos-cols">' +
      '<div class="pos-col">' +
        '<div class="col-h stat-h">Stat weights <span>how much each stat counts</span></div>' +
        statRows +
      '</div>' +
      '<div class="pos-col">' +
        '<div class="col-h ps-h">Meta PlayStyles <span>bonus points (a PlayStyle+ counts ' + PSPLUS_MULT + '&times; a basic)</span></div>' +
        '<div class="ps-list">' + styleRows + '</div>' +
      '</div>' +
    '</div>' +
  '</section>';
}

const cards = Object.keys(STAT_WEIGHTS).map(positionCard).join("\n");
const generatedOn = new Date().toISOString().slice(0, 10);

// --- the page ---------------------------------------------------------------
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Men Gallant FC - Justaino FC Web App Tool - Meta Rating</title>
<!-- GENERATED by meta-page.js from the real weight tables in fc26-tools.js. Do not hand-edit; run \`node meta-page.js\`. -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  :root {
    --bg:#0b0d10; --surface:#13161b; --border:#1f242c;
    --gold:#f0c040; --gold-dim:#c49a20; --accent:#00c6ff; --emerald:#4fe3ac;
    --text:#e8eaf0; --muted:#6b7280; --green:#22c55e;
  }
  *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:'Inter',sans-serif; min-height:100vh; padding:2.5rem 1.25rem 4rem; }
  .wrap { width:100%; max-width:960px; margin:0 auto; }

  .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:2.5rem; }
  .back-link { color:var(--muted); text-decoration:none; font-size:0.9rem; font-weight:500; border-bottom:1px solid transparent; transition:color 0.15s,border-color 0.15s; }
  .back-link:hover { color:var(--text); border-bottom-color:var(--border); }
  .install-btn { background:var(--gold); color:#1a1206; text-decoration:none; font-weight:600; font-size:0.85rem; padding:8px 16px; border-radius:8px; transition:transform 0.1s,box-shadow 0.15s; }
  .install-btn:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(240,192,64,0.25); }

  .badge { font-family:'Rajdhani',sans-serif; font-weight:700; font-size:0.7rem; letter-spacing:0.18em; color:var(--emerald); text-transform:uppercase; background:rgba(79,227,172,0.08); border:1px solid rgba(79,227,172,0.22); padding:4px 12px; border-radius:20px; display:inline-block; margin-bottom:1.25rem; }
  h1 { font-family:'Rajdhani',sans-serif; font-size:clamp(2rem,6vw,3.2rem); font-weight:700; line-height:1.05; margin-bottom:0.9rem; }
  h1 span { color:var(--emerald); }
  .lede { color:var(--muted); font-size:1.05rem; line-height:1.65; max-width:640px; margin-bottom:2rem; }

  /* Formula explainer */
  .formula { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:1.5rem 1.5rem; margin-bottom:1rem; }
  .formula .eq { font-family:'Rajdhani',sans-serif; font-size:clamp(1.1rem,3.5vw,1.5rem); font-weight:700; line-height:1.4; margin-bottom:1rem; }
  .formula .eq .stat { color:var(--gold); }
  .formula .eq .ps { color:var(--emerald); }
  .formula .mixrow { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
  .mixpill { flex:1 1 200px; background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:0.9rem 1rem; }
  .mixpill .k { font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); }
  .mixpill .v { font-family:'Rajdhani',sans-serif; font-weight:700; font-size:1.6rem; }
  .mixpill.stat .v { color:var(--gold); }
  .mixpill.ps .v { color:var(--emerald); }
  .formula ul { list-style:none; display:flex; flex-direction:column; gap:0.6rem; }
  .formula li { padding-left:1.3rem; position:relative; font-size:0.9rem; line-height:1.55; color:#c3c8d2; }
  .formula li::before { content:''; position:absolute; left:0; top:0.55em; width:6px; height:6px; border-radius:50%; background:var(--muted); }
  .formula li b { color:var(--text); }

  .sec-title { font-family:'Rajdhani',sans-serif; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; font-size:0.8rem; color:var(--muted); margin:2.5rem 0 1rem; }

  /* Position cards grid */
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:1.1rem; }
  .pos-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:1.1rem 1.2rem 1.25rem; }
  .pos-head { display:flex; align-items:center; justify-content:space-between; gap:0.6rem; margin-bottom:1rem; padding-bottom:0.7rem; border-bottom:1px solid var(--border); }
  .pos-name { font-family:'Rajdhani',sans-serif; font-weight:700; font-size:1.35rem; color:var(--text); }
  .pos-ceiling { font-size:0.68rem; color:var(--muted); background:var(--bg); border:1px solid var(--border); border-radius:20px; padding:3px 9px; white-space:nowrap; }
  .pos-cols { display:flex; gap:1.25rem; }
  .pos-col { flex:1; min-width:0; }
  .col-h { font-size:0.72rem; font-weight:600; letter-spacing:0.02em; color:var(--text); margin-bottom:0.7rem; line-height:1.35; }
  .col-h span { display:block; font-size:0.66rem; font-weight:400; color:var(--muted); margin-top:2px; }

  .wbar { display:flex; align-items:center; gap:0.5rem; margin-bottom:0.45rem; }
  .wlabel { flex:0 0 62px; font-size:0.74rem; color:#c3c8d2; }
  .wtrack { flex:1; height:7px; background:var(--bg); border-radius:5px; overflow:hidden; }
  .wfill { display:block; height:100%; background:linear-gradient(90deg,var(--gold-dim),var(--gold)); border-radius:5px; }
  .wval { flex:0 0 18px; text-align:right; font-family:'Rajdhani',sans-serif; font-weight:700; font-size:0.85rem; color:var(--gold); font-variant-numeric:tabular-nums; }

  .ps-list { display:flex; flex-direction:column; gap:0.3rem; }
  .ps-row { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; font-size:0.78rem; }
  .ps-name { color:#c3c8d2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ps-val { flex:0 0 auto; font-family:'Rajdhani',sans-serif; font-weight:700; color:var(--emerald); background:rgba(79,227,172,0.1); border-radius:6px; padding:1px 8px; font-variant-numeric:tabular-nums; }

  footer { text-align:center; color:var(--muted); font-size:0.8rem; margin-top:3rem; line-height:1.7; }
  footer .gen { opacity:0.7; }

  @media (max-width:760px) {
    .grid { grid-template-columns:1fr; }
    .pos-cols { flex-direction:column; gap:1rem; }
  }
</style>
</head>
<body>
<div class="wrap">

  <div class="topbar">
    <a class="back-link" href="features.html">← Back to features</a>
    <a class="install-btn" href="index.html">Get the tool</a>
  </div>

  <div class="badge">★ Justaino Score</div>
  <h1>How the <span>Meta Rating</span> is worked out</h1>
  <p class="lede">
    Every player gets a 0-100 "Justaino Score" for each position, worked out entirely
    from their real stats and PlayStyles. Nothing is hidden - here are the exact weights
    the tool uses, position by position. It's my read of the current FC 26 meta, so it's
    meant to be tuned each season.
  </p>

  <div class="formula">
    <div class="eq">Rating&nbsp;=&nbsp;<span>${pct(1 - OVR_MIX)}% &times; (</span><span class="stat">${pct(STAT_MIX)}% &times; Stat fit</span>&nbsp;+&nbsp;<span class="ps">${pct(PS_MIX)}% &times; PlayStyle fit</span><span>)</span>&nbsp;+&nbsp;<span>${pct(OVR_MIX)}% &times; OVR</span></div>
    <div class="mixrow">
      <div class="mixpill stat"><div class="k">Stat weighting</div><div class="v">${pct(STAT_MIX)}%</div></div>
      <div class="mixpill ps"><div class="k">PlayStyle weighting</div><div class="v">${pct(PS_MIX)}%</div></div>
      <div class="mixpill"><div class="k">OVR tiebreak</div><div class="v">${pct(OVR_MIX)}%</div></div>
    </div>
    <ul>
      <li>Each card is scored against its <b>best-fitting role</b> for a position (Poacher vs Target Forward, Winger vs Inside Forward, and so on), then the top-scoring role wins.</li>
      <li><b>Stat fit (0-99)</b> is a weighted average of the six stats, using each position's weights below (plus weak foot &amp; skill moves as light extras). Stats matter most where the weight is biggest - shooting for strikers, defending for centre-backs.</li>
      <li><b>PlayStyle fit (0-100)</b> counts the meta PlayStyles a card owns for that role - a <b>PlayStyle+ counts ${PSPLUS_MULT}&times; a basic</b>, and <b>every</b> meta basic counts - measured against the best loadout the role could want.</li>
      <li>The two halves blend, then the result is pulled just <b>${pct(OVR_MIX)}%</b> toward the card's in-game OVR - a light tiebreak only, because a 97 with weak face stats plays nothing like a 97. The tables below are the underlying stat and PlayStyle emphasis per position.</li>
    </ul>
  </div>

  <div class="sec-title">The weights, position by position</div>
  <div class="grid">
${cards}
  </div>

  <footer>
    Men Gallant FC · Justaino FC Web App Tool - a personal tool for the EA FC 26 Web App.<br>
    <span class="gen">Weights generated from the live tool on ${generatedOn}. Refreshed each season as the meta shifts.</span>
  </footer>

</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log("Wrote meta-rating.html (" + Object.keys(STAT_WEIGHTS).length + " positions, mix " + pct(STAT_MIX) + "/" + pct(PS_MIX) + ").");
