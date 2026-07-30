/*
  FC26 Tools - readable source (bookmarklet form).
  No Tampermonkey, no hosting, no auth. You're already signed into the Web App
  when you run this, so it just borrows the live session.

  TWO WAYS TO RUN:
  - While building: copy everything below and paste into DevTools Console (fast).
    First time, Chrome asks you to type "allow pasting" - do it once.
  - For daily use:  use the one-liner in bookmarklet.txt as a bookmark.

  This starter proves the code can see the app's internal service objects
  (window.services) - the foundation every real feature is built on.
*/
(function () {
  "use strict";

  // Every click rebuilds from scratch. We tear down any existing panel AND the
  // injected styles first, so the LATEST code/styles always show - no manual reset
  // needed after an update (this applies whether you click the bookmark or paste
  // the source). To keep the rebuild instant, we grab the club we already loaded in
  // the previous run and reuse it instead of re-fetching all ~1300 players.
  // We also carry over the "fresh-card overrides" (cards we've evo'd this session, see
  // FRESH-CARD OVERRIDES further down), so a Reload club straight after a rebuild can't
  // serve you a stale pre-evo copy of a player you just changed.
  var prevClub = null, prevFresh = null;
  try { if (window.FC26 && window.FC26.state && window.FC26.state.clubItems) prevClub = window.FC26.state.clubItems; } catch (e) {}
  try { if (window.FC26 && window.FC26.state && window.FC26.state.fresh && window.FC26.state.fresh.size) prevFresh = window.FC26.state.fresh; } catch (e) {}
  var oldPanel = document.getElementById("fc26-panel"); if (oldPanel) oldPanel.remove();
  var oldStyle = document.getElementById("fc26-style"); if (oldStyle) oldStyle.remove();

  // ----------------------------------------------------------------------------
  // STEP 1.2 - SERVICE PLUMBING
  // The building blocks for the EVO assigner. We DEFINE them here but do NOT call
  // them yet, so nothing touches your club. Later steps wire them to real buttons.
  // ----------------------------------------------------------------------------

  // getServices(): hands back the app's live service objects. Same "window.services
  // or bare global" fallback the panel's first button uses, kept in one place so
  // every helper reads it the same way. Returns null if the app isn't loaded yet.
  function getServices() {
    return window.services || (typeof services !== "undefined" ? services : null);
  }

  // awaitService(observable): the bridge between the app's async style and ours.
  //
  // The app's service calls don't return the answer straight away. They hand back
  // an "observable" object and call you back LATER when the server replies. We saw
  // this in discovery (step 1.1): the call returns an EAObservable and signals
  // completion via observable.observe(context, callback), where the callback gets
  // (theObservable, responseObject). That response has .success, .error and .data.
  //
  // This wrapper turns that callback style into a Promise, so later code can simply
  // `await applyEvo(...)` inside a normal loop. It:
  //   - attaches our listener with observable.observe(window, callback)
  //   - resolves with the response when response.success is true
  //   - rejects with the response (which carries .error.code) on failure
  //   - ALWAYS detaches the listener afterwards via unobserve - success or fail -
  //     so we never leave dangling listeners on the app's objects.
  function awaitService(observable) {
    return new Promise(function (resolve, reject) {
      // observe(context, callback): "context" is just an owner tag the app uses to
      // match the later unobserve. We use `window` as that tag.
      observable.observe(window, function (theObservable, response) {
        // Detach first, no matter what happens next. Wrapped in try/catch so a
        // hiccup while detaching can't swallow the real result.
        try { theObservable.unobserve(window); } catch (e) { /* ignore */ }

        if (response && response.success) {
          resolve(response);          // worked - hand back the full response object
        } else {
          reject(response);           // failed - response.error.code tells us why
        }
      });
    });
  }

  // applyEvo(slotId, itemId): adds one PlayStyle/evo (the "slot") to one of your
  // club players (the "item"). The third argument is intentionally undefined -
  // that's the call shape the app expects. Returns a Promise you can await.
  function applyEvo(slotId, itemId) {
    var svc = getServices();
    return awaitService(svc.Academy.addItemToSlot(slotId, itemId, undefined));
  }

  // claimEvo(slotId): finalises/claims a slot after applying. Returns a Promise.
  function claimEvo(slotId) {
    var svc = getServices();
    return awaitService(svc.Academy.claimSlot(slotId));
  }

  // removeEvo(itemId): removes ONE applied PlayStyle/evo upgrade from a club player.
  // Discovered live: services.Academy.removeEvoUpgrade(itemId) returns an EAObservable
  // like addItemToSlot, and the response carries { item, lastEvoRemoved } - lastEvoRemoved
  // is true when that was the final upgrade (the card then reverts and leaves the club evo
  // list). There is NO argument to target a specific PlayStyle - each call just removes one
  // (an "undo"), so "clear all" means calling this repeatedly until lastEvoRemoved. Returns
  // a Promise. (The two extra args removeEvoUpgrade takes are booleans that default false;
  // we leave them at their defaults.)
  function removeEvo(itemId) {
    var svc = getServices();
    return awaitService(svc.Academy.removeEvoUpgrade(itemId));
  }

  // Also stash the helpers on a tiny namespace, so you can poke them from the
  // DevTools Console (e.g. type: typeof window.FC26.applyEvo) when testing.
  // Optional - the panel uses the local functions above directly.
  window.FC26 = window.FC26 || {};
  window.FC26.getServices = getServices;
  window.FC26.awaitService = awaitService;
  window.FC26.applyEvo = applyEvo;
  window.FC26.claimEvo = claimEvo;
  window.FC26.removeEvo = removeEvo;

  // ----------------------------------------------------------------------------
  // STEP 1.3 - PLAYSTYLE CATALOG
  // Copied straight from the proven reference script (reference-evo.js). This is
  // pure data - just a lookup table - so there's nothing to "run" here. Later
  // steps turn it into the tickable list of evolutions.
  //
  // Each entry has four short keys:
  //   n = name      (the PlayStyle's display name)
  //   s = slotId    (the Academy "slot" the apply call targets - this is the ID
  //                  we pass to applyEvo)
  //   r = rewardId  (identifies which PlayStyle reward the slot grants)
  //   g = gk-only   (1 = goalkeepers only, 0 = any player)
  //
  // Two important rules that come with this table:
  //   - traitId = rewardId - 301. A "traitId" is how the app refers to a
  //     PlayStyle on a player; we'll use this later to check "does this player
  //     already have evo X" and to draw the right icon.
  //   - Caps per player: at most 4 PlayStyle+ and 8 basic PlayStyles.
  // ----------------------------------------------------------------------------

  // Version shown as a little badge in the panel header. It stays "dev" here in the
  // readable source (so a console/test build clearly reads "dev"); when you cut a
  // release, release.js stamps the real "vN" into the built bookmarklet. So an
  // INSTALLED copy shows exactly which published version it is, e.g. "v4".
  var FC26_VERSION = "dev";

  var TRAIT_OFFSET = 301;   // traitId = rewardId - 301
  var CAP_PLUS = 4;         // a player can hold at most 4 PlayStyle+  (PS+)  [EA raised this from 3 to 4]
  var CAP_BASIC = 8;        // a player can hold at most 8 basic PlayStyles (PS)

  // PS = the 36 basic PlayStyles.
  var PS = [{"n":"Finesse Shot","s":2141,"r":301,"g":0},{"n":"Far Throw","s":2142,"r":331,"g":1},{"n":"Enforcer","s":2143,"r":330,"g":0},{"n":"Intercept","s":2144,"r":317,"g":0},{"n":"Whipped Pass","s":2145,"r":313,"g":0},{"n":"Long Ball Pass","s":2146,"r":311,"g":0},{"n":"Incisive Pass","s":2147,"r":309,"g":0},{"n":"Deflector","s":2148,"r":336,"g":1},{"n":"Quick Step","s":2149,"r":326,"g":0},{"n":"Trickster","s":2150,"r":324,"g":0},{"n":"Slide Tackle","s":2151,"r":319,"g":0},{"n":"Aerial Fortress","s":2152,"r":320,"g":0},{"n":"Tiki Taka","s":2153,"r":312,"g":0},{"n":"Gamechanger","s":2154,"r":308,"g":0},{"n":"Chip Shot","s":2155,"r":302,"g":0},{"n":"Cross Claimer","s":2156,"r":333,"g":1},{"n":"Bruiser","s":2157,"r":329,"g":0},{"n":"Precision Header","s":2158,"r":305,"g":0},{"n":"Acrobatic","s":2159,"r":306,"g":0},{"n":"Long Throw","s":2160,"r":328,"g":0},{"n":"Press Proven","s":2161,"r":325,"g":0},{"n":"Block","s":2162,"r":316,"g":0},{"n":"Pinged Pass","s":2163,"r":310,"g":0},{"n":"Inventive","s":2164,"r":314,"g":0},{"n":"Power Shot","s":2165,"r":303,"g":0},{"n":"1v1 Close Down","s":2166,"r":334,"g":1},{"n":"Relentless","s":2167,"r":327,"g":0},{"n":"Rapid","s":2168,"r":322,"g":0},{"n":"Jockey","s":2169,"r":315,"g":0},{"n":"Anticipate","s":2170,"r":318,"g":0},{"n":"Low Driven Shot","s":2171,"r":307,"g":0},{"n":"Dead Ball","s":2172,"r":304,"g":0},{"n":"Far Reach","s":2173,"r":335,"g":1},{"n":"Footwork","s":2174,"r":332,"g":1},{"n":"Technical","s":2175,"r":321,"g":0},{"n":"First Touch","s":2176,"r":323,"g":0}];

  // PSP = the 36 PlayStyle+ versions (the "plus" upgrades).
  var PSP = [{"n":"Far Reach+","s":2181,"r":335,"g":1},{"n":"Technical+","s":2184,"r":321,"g":0},{"n":"Intercept+","s":2185,"r":317,"g":0},{"n":"Tiki Taka+","s":2186,"r":312,"g":0},{"n":"Low Driven Shot+","s":2187,"r":307,"g":0},{"n":"Footwork+","s":2188,"r":332,"g":1},{"n":"Jockey+","s":2191,"r":315,"g":0},{"n":"Anticipate+","s":2196,"r":318,"g":0},{"n":"Finesse Shot+","s":2200,"r":301,"g":0},{"n":"Incisive Pass+","s":2203,"r":309,"g":0},{"n":"Quick Step+","s":2210,"r":326,"g":0},{"n":"Rapid+","s":2211,"r":322,"g":0},{"n":"Pinged Pass+","s":2213,"r":310,"g":0},{"n":"Bruiser+","s":2189,"r":329,"g":0},{"n":"Relentless+","s":2183,"r":327,"g":0},{"n":"Long Ball Pass+","s":2192,"r":311,"g":0},{"n":"Inventive+","s":2197,"r":314,"g":0},{"n":"Cross Claimer+","s":2198,"r":333,"g":1},{"n":"First Touch+","s":2201,"r":323,"g":0},{"n":"1v1 Close Down+","s":2204,"r":334,"g":1},{"n":"Trickster+","s":2206,"r":324,"g":0},{"n":"Press Proven+","s":2207,"r":325,"g":0},{"n":"Block+","s":2212,"r":316,"g":0},{"n":"Gamechanger+","s":2214,"r":308,"g":0},{"n":"Deflector+","s":2215,"r":336,"g":1},{"n":"Power Shot+","s":2216,"r":303,"g":0},{"n":"Enforcer+","s":2182,"r":330,"g":0},{"n":"Chip Shot+","s":2190,"r":302,"g":0},{"n":"Acrobatic+","s":2193,"r":306,"g":0},{"n":"Dead Ball+","s":2194,"r":304,"g":0},{"n":"Slide Tackle+","s":2195,"r":319,"g":0},{"n":"Long Throw+","s":2199,"r":328,"g":0},{"n":"Aerial Fortress+","s":2202,"r":320,"g":0},{"n":"Far Throw+","s":2205,"r":331,"g":1},{"n":"Whipped Pass+","s":2208,"r":313,"g":0},{"n":"Precision Header+","s":2209,"r":305,"g":0}];

  // Tag every entry with its kind so later code can tell the two groups apart and
  // enforce the right cap. (We mutate each object once, here, at load time.)
  PS.forEach(function (x) { x.kind = "PS"; });
  PSP.forEach(function (x) { x.kind = "PS+"; });

  // ALL = both lists combined, handy for "find an evo by its slotId" later.
  var ALL = PS.concat(PSP);

  // Expose the catalog on the namespace so you can sanity-check it from the
  // Console (e.g. window.FC26.PS.length should be 36).
  window.FC26.PS = PS;
  window.FC26.PSP = PSP;
  window.FC26.ALL = ALL;
  window.FC26.CAPS = { plus: CAP_PLUS, basic: CAP_BASIC, traitOffset: TRAIT_OFFSET };
  window.FC26.version = FC26_VERSION;   // check with: window.FC26.version

  // ----------------------------------------------------------------------------
  // THEMES - "Broadcast" colourways (frosted glass)
  // The panel stays frosted glass; a THEME is just a set of colour tokens. We apply
  // the chosen theme by setting each token as an INLINE custom property on the panel
  // (see applyTheme). Inline props beat the defaults in the injected <style> block,
  // so switching theme re-colours every element instantly with NO rebuild - because
  // every colour in this file is read via var(--name). UCL Night is the default.
  //
  // To ADD a theme: drop another entry in THEMES and list its id in THEME_ORDER; the
  // header picker fills itself from that. To RE-SKIN one: edit its vars below.
  // --radius and --shadow are the same for all themes, so they live in THEME_SHARED
  // and applyTheme folds them in.
  var THEME_KEY = "FC26_theme";   // localStorage key: which theme id is chosen
  var DEFAULT_THEME = "ucl";
  var THEME_SHARED = { "--radius": "12px", "--shadow": "0 16px 40px rgba(0,0,0,.55)" };
  var THEMES = {
    // UCL Night - deep navy glass, cyan accent, FUT gold for ratings + PS+. Default.
    ucl: { label: "UCL Night", vars: {
      "--bg": "rgba(13,20,36,.58)", "--border": "rgba(120,180,255,.16)", "--header-bg": "rgba(255,255,255,.05)",
      "--ink": "#e8f2ff", "--muted": "rgba(160,200,255,.72)", "--title": "#ffffff",
      "--accent": "#38e1ff", "--accent-ink": "#06131f", "--gold": "#ffd76a",
      "--btn": "rgba(255,255,255,.10)", "--btn-ink": "#cfe6ff",
      "--btnx": "rgba(255,120,120,.14)", "--btnx-ink": "#ffc2c2",
      "--field": "rgba(0,0,0,.30)", "--field-border": "rgba(120,180,255,.18)",
      "--card": "rgba(255,255,255,.05)", "--card-border": "rgba(120,180,255,.14)",
      "--sel": "rgba(56,225,255,.16)", "--tab": "rgba(255,255,255,.05)", "--icon": "#dcf0ff",
      "--tile": "rgba(255,255,255,.05)", "--tile-border": "rgba(120,180,255,.16)",
      "--tile-psp": "rgba(255,215,106,.12)", "--tile-psp-border": "rgba(255,215,106,.34)",
      "--apply": "rgba(56,225,255,.92)", "--apply-ink": "#06131f"
    } },
    // Broadcast Yellow - near-black glass, electric lime accent, magenta for PS+.
    yellow: { label: "Broadcast Yellow", vars: {
      "--bg": "rgba(16,16,16,.62)", "--border": "rgba(255,255,255,.14)", "--header-bg": "rgba(255,255,255,.05)",
      "--ink": "#f4f6ea", "--muted": "#a6a996", "--title": "#ffffff",
      "--accent": "#d9ff3d", "--accent-ink": "#1a1e00", "--gold": "#ff5ca8",
      "--btn": "rgba(255,255,255,.10)", "--btn-ink": "#e8ead8",
      "--btnx": "rgba(255,120,120,.16)", "--btnx-ink": "#ffb3b3",
      "--field": "rgba(0,0,0,.34)", "--field-border": "rgba(255,255,255,.16)",
      "--card": "rgba(255,255,255,.05)", "--card-border": "rgba(255,255,255,.12)",
      "--sel": "rgba(217,255,61,.16)", "--tab": "rgba(255,255,255,.05)", "--icon": "#eef0e0",
      "--tile": "rgba(255,255,255,.05)", "--tile-border": "rgba(255,255,255,.14)",
      "--tile-psp": "rgba(255,92,168,.14)", "--tile-psp-border": "rgba(255,92,168,.40)",
      "--apply": "rgba(217,255,61,.92)", "--apply-ink": "#1a1e00"
    } },
    // Prime Teal - dark teal glass, teal accent, coral for PS+.
    teal: { label: "Prime Teal", vars: {
      "--bg": "rgba(14,28,34,.58)", "--border": "rgba(120,220,205,.16)", "--header-bg": "rgba(255,255,255,.05)",
      "--ink": "#e6f5f1", "--muted": "rgba(150,205,195,.72)", "--title": "#ffffff",
      "--accent": "#2dd4bf", "--accent-ink": "#05201c", "--gold": "#ff9e6b",
      "--btn": "rgba(255,255,255,.10)", "--btn-ink": "#cfeee7",
      "--btnx": "rgba(255,120,120,.14)", "--btnx-ink": "#ffc2c2",
      "--field": "rgba(0,0,0,.30)", "--field-border": "rgba(120,220,205,.18)",
      "--card": "rgba(255,255,255,.05)", "--card-border": "rgba(120,220,205,.14)",
      "--sel": "rgba(45,212,191,.16)", "--tab": "rgba(255,255,255,.05)", "--icon": "#d8f2ec",
      "--tile": "rgba(255,255,255,.05)", "--tile-border": "rgba(120,220,205,.16)",
      "--tile-psp": "rgba(255,158,107,.14)", "--tile-psp-border": "rgba(255,158,107,.36)",
      "--apply": "rgba(45,212,191,.92)", "--apply-ink": "#05201c"
    } }
  };
  var THEME_ORDER = ["ucl", "yellow", "teal"];   // the order the picker lists them in

  // loadTheme(): the saved theme id, or the default the first time / if it's unknown.
  function loadTheme() {
    try { var t = window.localStorage.getItem(THEME_KEY); if (t && THEMES[t]) return t; } catch (e) {}
    return DEFAULT_THEME;
  }
  // saveTheme(id): remember the choice across reloads.
  function saveTheme(id) { try { window.localStorage.setItem(THEME_KEY, id); } catch (e) {} }

  // ----------------------------------------------------------------------------
  // STEP 1.4 - PLAYER PICKER (data + read-only helpers)
  // Small helpers that turn a club item into the bits we show: name, OVR, rarity,
  // GK?, and current PlayStyles. Discovery confirmed every club player has these
  // methods. Nothing here changes your club - it's all reading.
  // ----------------------------------------------------------------------------

  // rareflag (a number EA uses internally) -> readable rarity name. Copied from the
  // reference script. If a rareflag isn't listed we just show the number, so a
  // missing entry is harmless.
  // One entry per line, in numeric id order, so a new rarity is easy to add: just drop a
  // "<id>": "<name>", line in the right place. Unknown ids fall back to "Rarity <id>".
  var RARITIES = {
    "0":   "Common",
    "1":   "Rare",
    "3":   "Team of the Week",
    "5":   "Team of the Year",
    "8":   "Star Performer",
    "11":  "Team of the Season",
    "12":  "Icon",
    "14":  "Knockout Royalty Hero",
    "15":  "Knockout Royalty ICON",
    "16":  "FUTTIES",
    "18":  "Festival of Football ICON",
    "20":  "FoF: Answer the Call",
    "21":  "Prime Hero",
    "22":  "Ratings Reload",
    "23":  "Future Stars Hero",
    "26":  "UCL Primetime Hero",
    "27":  "UWCL Primetime Hero",
    "28":  "Festival of Football: Captains",
    "30":  "FUT Birthday",
    "31":  "UEFA Women's Champions League Primetime",
    "32":  "UEFA Women's Champions League Road to the Final",
    "33":  "Thunderstruck",
    "34":  "FC Pro Live",
    "35":  "Winter Wildcards ICON",
    "36":  "Journey of Nations",
    "46":  "UEFA Europa League Primetime",
    "49":  "Winter Wildcards Hero",
    "50":  "UEFA Champions League Primetime",
    "55":  "Knockout Royalty",
    "57":  "Showdown Upgrade",
    "58":  "Showdown",
    "62":  "Festival of Football Showdown",
    "63":  "Festival of Football Showdown Upgrade",
    "64":  "TOTY Honourable Mentions",
    "65":  "TOTS Honourable Mentions",
    "69":  "World Tour Silver Superstar",
    "71":  "Future Stars",
    "72":  "Heroes",
    "76":  "Trophy Titans ICON",
    "77":  "Trophy Titans Hero",
    "81":  "Classic XI Hero",
    "82":  "Unbreakables",
    "83":  "Unbreakables Hero",
    "85":  "Unbreakables ICON",
    "88":  "Unbreakables Evolution",
    "90":  "Moments",
    "91":  "World Tour",
    "94":  "Festival of Football: Star Performer",
    "96":  "Joga Bonito",
    "97":  "Joga Bonito Hero",
    "98":  "Festival of Football: National Pride",
    "103": "Festival of Football: National Pride Red",
    "104": "Festival of Football: Glory Hunters Red",
    "105": "UEFA Conference League Primetime",
    "107": "Festival of Football: Path to Glory",
    "108": "Time Warp",
    "109": "Festival of Football: Glory Hunters",
    "111": "Fantasy FC",
    "112": "Time Warp ICON",
    "116": "Festival of Football: Captains ICON",
    "117": "Winter Wildcards",
    "120": "TOTS Breakthrough",
    "124": "UEFA Champions League Road to the Final",
    "125": "UEFA Europa League Road to the Final",
    "126": "UEFA Conference League Road to the Final",
    "127": "Team of the Season Champions",
    "130": "Festival of Football: Greats of the Game Hero",
    "131": "Festival of Football: Greats of the Game ICON",
    "132": "TOTY HM Evolution",
    "135": "Fantasy FC Hero",
    "147": "FUT Birthday EVO",
    "148": "FUT Birthday Hero",
    "149": "FUT Birthday ICON",
    "150": "Cornerstones",
    "151": "Ultimate Scream",
    "155": "Team of the Year ICON",
    "157": "Thunderstruck ICON",
    "163": "eCL Icon",
    "168": "Ultimate Scream Hero",
    "170": "Future Stars ICON"
  };

  // traitId -> PlayStyle base name, built from our catalog (traitId = rewardId - 301).
  // Used to label a player's CURRENT playstyles in the preview.
  var traitName = {};
  PS.forEach(function (x) { traitName[x.r - TRAIT_OFFSET] = x.n; });

  // ----------------------------------------------------------------------------
  // EVO-ELIGIBLE RARITIES
  // Only certain card rarities can actually receive PlayStyles. We can't read this
  // reliably from the app - the app's own canApplyTo() returns false for every club
  // card unless it's the exact one mid-evolution - so we keep our OWN list of
  // eligible "rareflags" (the number EA uses for a card's rarity). The list is:
  //   - seeded from a small STARTER guess (edit ELIG_SEED below anytime);
  //   - grown AUTOMATICALLY: every time an Apply succeeds, that card's rarity is
  //     proven eligible, so we add it;
  //   - correctable by hand: the preview card shows a mark/remove button for the
  //     selected player's rarity.
  // It's saved in the browser (localStorage) so it survives page reloads.
  var ELIG_KEY = "FC26_eligibleRarities";   // localStorage key: the rarity list
  var ELIG_ONLY_KEY = "FC26_onlyEligible";  // localStorage key: is the filter on?
  var ELIG_SEED = [16, 30, 94, 98, 103, 109];        // starter guess (from reference-evo.js) - edit freely. 16 = FUTTIES
  // ELIG_MERGE_ONCE: rarities added to the eligible list AFTER first release. Each is force-added
  // to an EXISTING saved list exactly once (tracked in ELIG_MERGED_KEY), so a newly-eligible
  // rarity like FUTTIES(16) turns on for current installs too - without re-adding anything the
  // user later chooses to remove. Add new post-release eligible rarities here.
  var ELIG_MERGE_ONCE = [16];
  var ELIG_MERGED_KEY = "FC26_eligibleMerged";
  // loadEligible(): the saved list, or the seed on first ever run. Also runs the one-time merges.
  function loadEligible() {
    var set = null;
    try { var raw = window.localStorage.getItem(ELIG_KEY); if (raw) set = new Set(JSON.parse(raw).map(Number)); } catch (e) {}
    if (!set) return new Set(ELIG_SEED);   // first ever run: seed the whole list
    // One-time merges for existing users.
    try {
      var done = JSON.parse(window.localStorage.getItem(ELIG_MERGED_KEY) || "[]").map(Number);
      var changed = false;
      ELIG_MERGE_ONCE.forEach(function (r) { if (done.indexOf(r) === -1) { set.add(r); done.push(r); changed = true; } });
      if (changed) {
        window.localStorage.setItem(ELIG_KEY, JSON.stringify(Array.from(set)));
        window.localStorage.setItem(ELIG_MERGED_KEY, JSON.stringify(done));
      }
    } catch (e) {}
    return set;
  }
  // loadOnlyEligible(): the saved on/off state of the filter (default off).
  function loadOnlyEligible() {
    try { return window.localStorage.getItem(ELIG_ONLY_KEY) === "1"; } catch (e) { return false; }
  }
  // saveEligible() / saveOnlyEligible(): write the current values back to storage.
  function saveEligible() { try { window.localStorage.setItem(ELIG_KEY, JSON.stringify(Array.from(state.eligible))); } catch (e) {} }
  function saveOnlyEligible() { try { window.localStorage.setItem(ELIG_ONLY_KEY, state.onlyEligible ? "1" : "0"); } catch (e) {} }
  // isEligibleRarity(it): is this player's rarity in our eligible list?
  function isEligibleRarity(it) { try { return state.eligible.has(it.rareflag); } catch (e) { return false; } }
  // setRarityEligible(rf, on): add/remove one rareflag, then persist.
  function setRarityEligible(rf, on) { if (on) state.eligible.add(rf); else state.eligible["delete"](rf); saveEligible(); }

  // ----------------------------------------------------------------------------
  // FEATURE 1 - COMPLETE RARITY TABLE
  // The app keeps the FULL rarity definitions in repositories.Rarity._collection:
  // a plain object keyed by rarity id, one UTItemRarityDTO per entry (discovered
  // live - 128 entries on the test account). Every DTO carries a numeric `id`, but
  // its `name` is EA-obfuscated (encrypted bytes, not readable text - the app decodes
  // it with a session key we can't reconstruct), so we do NOT use that field. Instead
  // we read the complete ID LIST from that collection and resolve each id to a readable
  // NAME via our own static RARITIES map (top-up later via a transfer-market scrape;
  // final fallback is "Rarity <id>"). This is what lets evo-eligibility be complete from
  // day one instead of being learned one encountered rarity at a time.
  //
  // loadRarityDefs(): read that collection into a sorted list of { id, name, searchable }.
  //   - id         : the numeric rarity id (the same number as a card's rareflag)
  //   - name       : readable name from RARITIES, else "Rarity <id>"
  //   - searchable : the DTO's own flag (true = the game lets you filter for it in the
  //                  transfer market; handy to know which ones a TM scrape could name)
  // Returns [] if the table can't be read - then the learn-as-you-go flow (loadEligible /
  // auto-learn on apply / the preview "Mark eligible" button) keeps working unchanged.
  function loadRarityDefs() {
    var defs = [];
    try {
      var R = window.repositories && window.repositories.Rarity;
      var c = R && R._collection;                 // plain object: rarityId -> UTItemRarityDTO
      if (c) {
        Object.keys(c).forEach(function (k) {
          var dto = c[k];
          if (!dto || dto.id == null) return;
          var id = Number(dto.id);
          defs.push({ id: id, name: RARITIES[id] || ("Rarity " + id), searchable: !!dto.searchable });
        });
        defs.sort(function (a, b) { return a.id - b.id; });
      }
    } catch (e) { /* fall through to [] -> learn-as-you-go stays in charge */ }
    return defs;
  }

  // The one place we remember what the user has picked. Reused by later steps.
  //   player   = the selected club item (or null)
  //   selected = a Set of ticked evo slotIds
  //   tab      = which evolution tab is showing ("PS+" or "PS")
  //   running  = true while an apply run is in progress
  //   abort    = set true by the Stop button to end the run early
  //   clubItems = the FULL club loaded via search (null until we load it); when
  //               present the picker uses this instead of the app's partial cache
  //   eligible = Set of evo-eligible rareflags (see EVO-ELIGIBLE RARITIES above)
  //   onlyEligible = true when the picker is filtered to eligible rarities only
  //   batch    = a Map of id -> club item: the players TICKED for batch apply. The
  //              active player (state.player) is NOT auto-added; when the batch is
  //              empty, Apply targets just the active player (unchanged single flow).
  //   theme    = chosen colourway id (see THEMES); applied by applyTheme, remembered
  //   rarityDefs = the app's full rarity table [{id,name,searchable}] (Feature 1); [] if unread
  //   fresh    = id -> the freshest copy of a card we've seen, taken straight from the
  //              server's own reply to one of OUR applies/removals. See "FRESH-CARD
  //              OVERRIDES" further down (near loadFullClub) for why this exists.
  var state = { player: null, selected: new Set(), tab: "PS+", running: false, abort: false, clubItems: prevClub, eligible: loadEligible(), onlyEligible: loadOnlyEligible(), batch: new Map(), theme: loadTheme(), rarityDefs: loadRarityDefs(), fresh: prevFresh || new Map() };

  // getClubPlayers(): same read we proved in discovery - pull the club's items
  // collection, turn it into a list, keep only real players.
  function getClubPlayers() {
    // Prefer the full club we loaded ourselves (all players). Fall back to the
    // app's in-memory cache (usually just the active squad) until that's done.
    if (state.clubItems && state.clubItems.length) {
      return state.clubItems.filter(function (it) { try { return it && it.isPlayer && it.isPlayer(); } catch (e) { return false; } });
    }
    try {
      var c = window.repositories.Item.getClub();
      var raw = (c && c.items && typeof c.items.values === "function") ? Array.from(c.items.values()) : [];
      return raw.filter(function (it) { try { return it && it.isPlayer && it.isPlayer(); } catch (e) { return false; } });
    } catch (e) { return []; }
  }

  // playerName(it): display name via the app's static data; "Player" if missing,
  // so the UI never shows blank.
  function playerName(it) {
    try { var sd = it.getStaticData ? it.getStaticData() : it._staticData; if (sd && sd.name) return sd.name; } catch (e) {}
    return "Player";
  }

  // rarityName(it): readable rarity, or "Rarity <n>" when we have no name for it.
  function rarityName(it) { return RARITIES[it.rareflag] || ("Rarity " + it.rareflag); }

  // normName(s): lowercase AND strip accents/diacritics, so a plain "guler" matches "Güler".
  // How it works: normalize("NFD") splits an accented letter into its base letter + a separate
  // "combining mark" character (ü -> u + ̈), then we delete those marks (the Unicode range
  // U+0300-U+036F). Result is a plain a-z string safe for a substring (indexOf) search.
  function normName(s) {
    var str = String(s == null ? "" : s);
    try { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
    catch (e) { return str.toLowerCase(); }   // older browsers without normalize(): fall back to plain lowercase
  }

  // playerSearchText(it): everything the search box is allowed to match on for a player -
  // the full display name PLUS the first and last name on their own (so "arda" and "guler"
  // both find Arda Güler), all accent-stripped via normName. Built fresh each filter pass.
  function playerSearchText(it) {
    var sd = null;
    try { sd = it.getStaticData ? it.getStaticData() : it._staticData; } catch (e) {}
    var parts = [playerName(it)];
    if (sd) { parts.push(sd.firstName, sd.lastName, sd.name, sd.commonName); }
    return normName(parts.filter(Boolean).join(" "));
  }

  // isGKPlayer(it): true if this player is a goalkeeper.
  function isGKPlayer(it) { try { return !!it.isGK(); } catch (e) { return false; } }

  // currentPlayStyles(it): the player's existing playstyles as {traitId, isIcon}.
  // isIcon === true means it's the "+" (PlayStyle+) version.
  function currentPlayStyles(it) { try { return it.getPlayStyles() || []; } catch (e) { return []; } }

  // tiny HTML-escaper so odd characters in a name can't break the markup.
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  // Expose for Console poking while we build.
  window.FC26.getClubPlayers = getClubPlayers;
  window.FC26.state = state;
  // Feature 1 (rarity table) Console helpers:
  //   window.FC26.getRarityDefs()      -> the full [{id,name,searchable}] list read at startup
  //   window.FC26.reloadRarityDefs()   -> re-read it from the app (and redraw the picker)
  window.FC26.getRarityDefs = function () { return state.rarityDefs; };
  window.FC26.reloadRarityDefs = function () { state.rarityDefs = loadRarityDefs(); try { renderPlayers(); } catch (e) {} return state.rarityDefs; };

  // Fresh-card override helpers (see FRESH-CARD OVERRIDES further down). Normally you never
  // need these - they're the manual escape hatch if a pinned card ever looks wrong:
  //   window.FC26.fresh()        -> ["Mbappe (4 PlayStyles)", ...] currently pinned as fresher than the club
  //   window.FC26.clearFresh()   -> forget all of them and trust the next club load completely
  window.FC26.fresh = function () {
    return Array.from(state.fresh.values()).map(function (it) {
      return playerName(it) + " (" + currentPlayStyles(it).length + " PlayStyles)";
    });
  };
  window.FC26.clearFresh = function () { state.fresh = new Map(); return "Cleared. Hit Reload club for a clean pull."; };

  // window.FC26.diag() -> a plain object describing what's actually on screen right now.
  // It RETURNS the object (rather than console.log-ing it) so the Console prints it as the
  // result of the command - a console.log on its own evaluates to `undefined`, which is all
  // you see on some mobile consoles.
  window.FC26.diag = function () {
    var p = document.getElementById("fc26-panel");
    var line = p && p.querySelector(".fc26-clubstat");
    var btn = p && p.querySelector(".fc26-reload");
    function box(el) { if (!el) return null; var r = el.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }
    return {
      build: FC26_VERSION,   // compare against the BUILD ID that `node minify.js` printed
      mode: (window.matchMedia("(max-width: 620px)").matches ? "mobile" : "desktop"),
      panelClass: p ? p.className : "(no panel)",
      statusLineInDOM: !!line,
      statusLineText: line ? line.textContent : null,
      statusLineSize: box(line),
      buttonInDOM: !!btn,
      buttonText: btn ? btn.textContent : null,
      buttonClass: btn ? btn.className : null,
      buttonSize: box(btn),
      clubPlayers: getClubPlayers().length
    };
  };

  // Console helpers for editing the evo-eligible rarity list by hand. Each one
  // saves to storage AND redraws the panel, and returns the updated list:
  //   window.FC26.eligible.list()       -> current eligible rarity numbers
  //   window.FC26.eligible.add(98)      -> add rarity 98
  //   window.FC26.eligible.remove(30)   -> remove rarity 30
  //   window.FC26.eligible.clear()      -> empty the whole list
  window.FC26.eligible = {
    list: function () { return Array.from(state.eligible).sort(function (a, b) { return a - b; }); },
    add: function (rf) { setRarityEligible(Number(rf), true); try { renderPlayers(); if (state.player) renderPreview(); } catch (e) {} return this.list(); },
    remove: function (rf) { setRarityEligible(Number(rf), false); try { renderPlayers(); if (state.player) renderPreview(); } catch (e) {} return this.list(); },
    clear: function () { state.eligible = new Set(); saveEligible(); try { renderPlayers(); if (state.player) renderPreview(); } catch (e) {} return this.list(); }
  };

  // ----------------------------------------------------------------------------
  // STEP 1.9 - SUGGEST DATA (position groups, role recommendations, name lookups)
  // Copied from the reference script. This is offline curated data - no fut.gg,
  // no network. If a recommendation ever looks wrong, edit the list below.
  // ----------------------------------------------------------------------------

  // EA position id -> role group (from the app's position ids).
  var POS_GROUP = {
    0: "GK", 1: "CB", 2: "RB / LB", 3: "RB / LB", 4: "CB", 5: "CB", 6: "CB", 7: "RB / LB", 8: "RB / LB",
    9: "CDM", 10: "CDM", 11: "CDM", 12: "RM / LM", 13: "CM", 14: "CM", 15: "CM", 16: "RM / LM",
    17: "CAM", 18: "CAM", 19: "CAM", 20: "RW / LW", 21: "ST", 22: "RW / LW", 23: "RW / LW",
    24: "ST", 25: "ST", 26: "ST", 27: "RW / LW"
  };

  // POS_SIDE: which FLANK a position id sits on - "R" right, "L" left. Only the two-sided
  // groups (RB/LB, RM/LM, RW/LW) need this; every other id is central and omitted, so
  // posSide() returns "C" (no side constraint). Hardcoded from the app's own
  // window.PlayerPosition enum (discovered live): 2 RWB / 3 RB / 12 RM / 20 RF / 23 RW are
  // right; 7 LB / 8 LWB / 16 LM / 22 LF / 27 LW are left.
  var POS_SIDE = { 2: "R", 3: "R", 7: "L", 8: "L", 12: "R", 16: "L", 20: "R", 22: "L", 23: "R", 27: "L" };
  function posSide(id) { return POS_SIDE[id] || "C"; }

  // Recommended playstyles per position/role, in priority order. The top 4 become
  // PS+, the rest basic PlayStyles.
  // Reads as: ROLES[position][role] = priority-ordered list (best pick first).
  // suggest() ticks the top ones as PS+ (up to the PS+ cap), the rest as basic.
  var ROLES = {
    "ST": {
      "Advanced Forward":     ["Finesse Shot","Low Driven Shot","Rapid","Gamechanger","Incisive Pass","Quick Step","Technical","Tiki Taka","First Touch","Press Proven","Enforcer"],
      "Target Forward":       ["Finesse Shot","Enforcer","Precision Header","Low Driven Shot","Gamechanger","Incisive Pass","Rapid","First Touch","Tiki Taka","Press Proven","Pinged Pass"],
      "Poacher":              ["Finesse Shot","Low Driven Shot","Rapid","Gamechanger","Incisive Pass","First Touch","Quick Step","Technical","Press Proven","Pinged Pass","Enforcer"],
      "False 9":              ["Finesse Shot","Incisive Pass","Low Driven Shot","Gamechanger","Rapid","Inventive","Tiki Taka","Technical","Pinged Pass","Quick Step","First Touch"]
    },
    "RW / LW": {
      "Inside Forward":       ["Finesse Shot","Low Driven Shot","Rapid","Gamechanger","Quick Step","Inventive","Technical","Incisive Pass","Pinged Pass","Tiki Taka","First Touch"],
      "Winger":               ["Rapid","Finesse Shot","Pinged Pass","Quick Step","Gamechanger","Inventive","Technical","Low Driven Shot","Incisive Pass","Tiki Taka","First Touch"],
      "Wide Playmaker":       ["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Gamechanger","Inventive","Pinged Pass","Rapid","Low Driven Shot","Press Proven","First Touch"]
    },
    "CAM": {
      "Shadow Striker":       ["Finesse Shot","Incisive Pass","Rapid","Gamechanger","Low Driven Shot","Inventive","Technical","Quick Step","Tiki Taka","First Touch","Pinged Pass"],
      "Playmaker":            ["Finesse Shot","Incisive Pass","Low Driven Shot","Tiki Taka","Inventive","Gamechanger","Pinged Pass","Technical","First Touch","Press Proven","Quick Step"],
      "Classic 10":           ["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Gamechanger","Inventive","Pinged Pass","Low Driven Shot","First Touch","Press Proven","Quick Step"],
      "Half Winger":          ["Incisive Pass","Rapid","Technical","Tiki Taka","Gamechanger","Inventive","Pinged Pass","Quick Step","First Touch","Press Proven","Low Driven Shot"]
    },
    "CM": {
      "Box to Box":           ["Incisive Pass","Pinged Pass","Intercept","Finesse Shot","Tiki Taka","Bruiser","Anticipate","Quick Step","Technical","Relentless","Press Proven"],
      "Playmaker":            ["Incisive Pass","Pinged Pass","Finesse Shot","Tiki Taka","Inventive","Technical","Intercept","Low Driven Shot","Anticipate","First Touch","Quick Step"],
      "Deep Lying Playmaker": ["Intercept","Pinged Pass","Bruiser","Tiki Taka","Incisive Pass","Inventive","Anticipate","Jockey","Quick Step","First Touch","Press Proven","Long Ball Pass"],
      "Holding":              ["Intercept","Pinged Pass","Bruiser","Tiki Taka","Anticipate","Jockey","Incisive Pass","Quick Step","First Touch","Press Proven","Long Ball Pass"],
      "Half Winger":          ["Pinged Pass","Intercept","Quick Step","Tiki Taka","Incisive Pass","Finesse Shot","Anticipate","Technical","Jockey","Bruiser","Rapid"]
    },
    "RM / LM": {
      "Inside Forward":       ["Finesse Shot","Low Driven Shot","Rapid","Gamechanger","Quick Step","Inventive","Technical","Incisive Pass","Pinged Pass","Tiki Taka","First Touch"],
      "Winger":               ["Rapid","Finesse Shot","Pinged Pass","Quick Step","Gamechanger","Inventive","Technical","Low Driven Shot","Incisive Pass","Tiki Taka","First Touch"],
      "Wide Playmaker":       ["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Gamechanger","Inventive","Pinged Pass","Rapid","Low Driven Shot","Press Proven","First Touch"],
      "Wide Midfielder":      ["Rapid","Quick Step","Pinged Pass","Tiki Taka","Incisive Pass","Intercept","Anticipate","Relentless","Whipped Pass","Jockey","Press Proven"]
    },
    "CDM": {
      "Holding":              ["Intercept","Pinged Pass","Bruiser","Tiki Taka","Anticipate","Jockey","Incisive Pass","Quick Step","First Touch","Press Proven","Long Ball Pass"],
      "Deep Lying Playmaker": ["Intercept","Pinged Pass","Bruiser","Tiki Taka","Incisive Pass","Anticipate","Jockey","Quick Step","First Touch","Press Proven","Long Ball Pass"],
      "Box Crasher":          ["Incisive Pass","Intercept","Pinged Pass","Finesse Shot","Tiki Taka","Quick Step","Bruiser","Anticipate","Technical","Press Proven","Relentless"],
      "Centre Half":          ["Intercept","Bruiser","Jockey","Anticipate","Quick Step","Block","Tiki Taka","Pinged Pass","Aerial Fortress","Slide Tackle","Long Ball Pass"],
      "Wide Half":            ["Bruiser","Intercept","Quick Step","Jockey","Anticipate","Incisive Pass","Block","Tiki Taka","Pinged Pass","Press Proven","Relentless"]
    },
    "RB / LB": {
      "Fullback":             ["Bruiser","Intercept","Quick Step","Jockey","Anticipate","Incisive Pass","Block","Tiki Taka","Pinged Pass","Press Proven","Relentless"],
      "Wingback":             ["Intercept","Pinged Pass","Quick Step","Anticipate","Bruiser","Tiki Taka","Jockey","Incisive Pass","Rapid","Relentless","Press Proven"],
      "Falseback":            ["Intercept","Pinged Pass","Anticipate","Jockey","Tiki Taka","Incisive Pass","Bruiser","Quick Step","First Touch","Press Proven","Long Ball Pass"],
      "Inverted Wingback":    ["Incisive Pass","Tiki Taka","Quick Step","Intercept","Anticipate","Rapid","Pinged Pass","Jockey","Press Proven","Relentless","Bruiser"],
      "Attacking Wingback":   ["Rapid","Quick Step","Pinged Pass","Tiki Taka","Incisive Pass","Intercept","Anticipate","Relentless","Jockey","First Touch","Bruiser"]
    },
    "CB": {
      "Defender":             ["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Pinged Pass","Aerial Fortress","Slide Tackle","Tiki Taka","Press Proven"],
      "Stopper":              ["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Slide Tackle","Tiki Taka","Pinged Pass","Relentless","Aerial Fortress"],
      "Wide Back":            ["Intercept","Anticipate","Quick Step","Jockey","Bruiser","Block","Pinged Pass","Aerial Fortress","Slide Tackle","Tiki Taka","Press Proven"],
      "Ball Playing Defender":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Pinged Pass","Tiki Taka","First Touch","Press Proven","Aerial Fortress"]
    },
    "GK": {
      "Goalkeeper":           ["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Far Throw","Pinged Pass","Long Ball Pass","Tiki Taka","Press Proven","First Touch"],
      "Ball Playing":         ["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Pinged Pass","Far Throw","Long Ball Pass","Tiki Taka","Press Proven","First Touch"],
      "Sweeper Keeper":       ["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Pinged Pass","Far Throw","Long Ball Pass","Tiki Taka","Press Proven","First Touch"]
    }
  };

  // POSITION-GROUP FALLBACK TAILS.
  // The role lists above are only 11 long (near the 4 PS+ + 8 basic cap). If a player
  // already owns several of a role's top picks, that list can run out of "next best"
  // options before every slot is filled. So each position GROUP also has a general
  // priority order of (nearly) all the playstyles that make sense there. suggest()
  // fills from the role's curated list FIRST, then keeps going down this tail for any
  // slot still open - guaranteeing there's always a next-best pick. These broad
  // orders are just the safety net; the curated role lists above drive the top picks.
  var TAIL_ATT = ["Finesse Shot","Low Driven Shot","Rapid","Quick Step","Technical","Gamechanger","Incisive Pass","Tiki Taka","Pinged Pass","First Touch","Inventive","Trickster","Press Proven","Power Shot","Chip Shot","Acrobatic","Precision Header","Relentless","Whipped Pass","Enforcer","Dead Ball","Long Ball Pass","Anticipate","Intercept","Jockey","Bruiser","Block","Slide Tackle","Aerial Fortress","Long Throw"];
  var TAIL_MID = ["Incisive Pass","Pinged Pass","Tiki Taka","Intercept","Anticipate","Quick Step","Technical","First Touch","Press Proven","Rapid","Gamechanger","Bruiser","Jockey","Relentless","Inventive","Finesse Shot","Low Driven Shot","Long Ball Pass","Whipped Pass","Trickster","Block","Enforcer","Slide Tackle","Power Shot","Precision Header","Aerial Fortress","Chip Shot","Acrobatic","Dead Ball","Long Throw"];
  var TAIL_DEF = ["Intercept","Anticipate","Jockey","Bruiser","Block","Slide Tackle","Aerial Fortress","Quick Step","Rapid","Tiki Taka","Pinged Pass","Incisive Pass","Press Proven","Relentless","Enforcer","First Touch","Long Ball Pass","Whipped Pass","Technical","Inventive","Gamechanger","Trickster","Finesse Shot","Low Driven Shot","Power Shot","Precision Header","Acrobatic","Chip Shot","Dead Ball","Long Throw"];
  var TAIL_GK  = ["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Far Throw","Pinged Pass","Long Ball Pass","Tiki Taka","Incisive Pass","Press Proven","First Touch","Quick Step","Whipped Pass","Inventive"];
  // Which fallback tail each position group uses (attacker / midfielder / defender / GK).
  var POS_TAIL = {
    "ST": TAIL_ATT, "RW / LW": TAIL_ATT, "CAM": TAIL_ATT, "RM / LM": TAIL_ATT,
    "CM": TAIL_MID,
    "CDM": TAIL_DEF, "RB / LB": TAIL_DEF, "CB": TAIL_DEF,
    "GK": TAIL_GK
  };

  // ----------------------------------------------------------------------------
  // FEATURE 2 - MY OWN META RATING (v2: role-aware, fut.gg-inspired)
  // The rating is my own opinion of the current FC26 meta - the tables below are what
  // you edit to re-tune it. scorePlayer (further down) just reads them.
  //
  //  scorePlayer(player, group) = STAT part  +  PLAYSTYLE part  (blended by STAT_MIX/PS_MIX)
  //    STAT part      : a weighted average of the stats that matter for the position
  //                     (0-99-ish), using STAT_WEIGHTS, PLUS the card's weak foot + skill
  //                     moves folded in as light attributes (TRAIT_STAT_WEIGHTS).
  //    PLAYSTYLE part : how many of the card's owned PlayStyles are meta for its BEST-fitting
  //                     role. Instead of one blunt per-group table, we score against each role
  //                     in ROLES (the same role lists Suggest uses) and take the best - the
  //                     fut.gg-style "score every role, keep the top" idea. PLAYSTYLE_WEIGHTS
  //                     is now only a fallback for a group with no ROLES entry. PS+ counts double.
  // ----------------------------------------------------------------------------

  // The 6 numbers in it.attributes, in the order the app stores them. Proven live
  // on real cards (Tavernier / Ochoa). Outfielders read them as the 6 face stats;
  // a goalkeeper's 6 mean the GK stats instead, so GKs are read under GK names.
  var FACE_STATS = ["pace", "shooting", "passing", "dribbling", "defending", "physical"];
  var GK_STATS   = ["diving", "handling", "kicking", "reflexes", "speed", "positioning"];

  // STAT_WEIGHTS: for each position group, how much each stat counts. The meta
  // right now rewards pace and dribbling on attackers, defending/physical at the
  // back, so those carry the biggest weights. Numbers are relative (the code
  // divides by their total), so only the RATIOS matter, not the scale.
  var STAT_WEIGHTS = {
    "ST":      { pace: 8,  shooting: 10, passing: 4, dribbling: 8, defending: 1,  physical: 6 },
    "RW / LW": { pace: 10, shooting: 7,  passing: 5, dribbling: 9, defending: 1,  physical: 4 },
    "CAM":     { pace: 7,  shooting: 7,  passing: 9, dribbling: 9, defending: 2,  physical: 4 },
    "RM / LM": { pace: 9,  shooting: 6,  passing: 7, dribbling: 8, defending: 3,  physical: 4 },
    "CM":      { pace: 6,  shooting: 5,  passing: 9, dribbling: 7, defending: 6,  physical: 6 },
    "CDM":     { pace: 6,  shooting: 3,  passing: 7, dribbling: 5, defending: 9,  physical: 8 },
    "RB / LB": { pace: 9,  shooting: 2,  passing: 6, dribbling: 6, defending: 8,  physical: 6 },
    "CB":      { pace: 7,  shooting: 1,  passing: 4, dribbling: 3, defending: 10, physical: 9 },
    // GK weights the 6 GK stats (reflexes + diving matter most in the current meta).
    "GK":      { diving: 9, handling: 8, kicking: 4, reflexes: 10, speed: 4, positioning: 8 }
  };

  // PLAYSTYLE_WEIGHTS: FALLBACK bonus table for owned meta PlayStyles, per position group.
  // As of the role-aware rating (v2), scorePlayer no longer uses this for groups that have a
  // ROLES entry - it instead scores against the card's BEST-fitting ROLE (the ordered priority
  // lists in ROLES, converted to per-rank weights - see roleWeightsFromList). This table only
  // kicks in for a group with no ROLES entry, so it's kept as a safety net. A PlayStyle+ is
  // worth DOUBLE its base number (handled in code). Anything not listed = 0.
  var PLAYSTYLE_WEIGHTS = {
    "ST":      { "Finesse Shot": 4, "Low Driven Shot": 4, "Rapid": 3, "Quick Step": 3, "Technical": 3, "Trickster": 2, "First Touch": 2, "Power Shot": 1, "Chip Shot": 1, "Acrobatic": 1, "Precision Header": 1, "Incisive Pass": 1, "Dead Ball": 1 },
    "RW / LW": { "Finesse Shot": 4, "Rapid": 4, "Quick Step": 3, "Technical": 3, "Trickster": 3, "Low Driven Shot": 3, "Incisive Pass": 2, "First Touch": 2, "Tiki Taka": 1, "Pinged Pass": 1, "Whipped Pass": 1 },
    "CAM":     { "Incisive Pass": 4, "Finesse Shot": 4, "Tiki Taka": 3, "Technical": 3, "Rapid": 2, "Low Driven Shot": 2, "Pinged Pass": 2, "Trickster": 2, "First Touch": 2, "Quick Step": 2 },
    "RM / LM": { "Rapid": 4, "Quick Step": 3, "Finesse Shot": 3, "Technical": 3, "Pinged Pass": 2, "Incisive Pass": 2, "Tiki Taka": 2, "Whipped Pass": 2, "Low Driven Shot": 2, "Trickster": 2, "First Touch": 1 },
    "CM":      { "Incisive Pass": 4, "Tiki Taka": 3, "Pinged Pass": 3, "Press Proven": 2, "Intercept": 2, "Technical": 2, "First Touch": 2, "Anticipate": 2, "Finesse Shot": 2, "Long Ball Pass": 1, "Relentless": 1, "Bruiser": 1 },
    "CDM":     { "Intercept": 4, "Pinged Pass": 3, "Anticipate": 3, "Bruiser": 3, "Tiki Taka": 2, "Jockey": 2, "Block": 2, "Press Proven": 2, "Incisive Pass": 2, "Slide Tackle": 1, "Long Ball Pass": 1, "Aerial Fortress": 1 },
    "RB / LB": { "Quick Step": 4, "Rapid": 3, "Intercept": 3, "Anticipate": 3, "Bruiser": 2, "Jockey": 2, "Pinged Pass": 2, "Whipped Pass": 2, "Tiki Taka": 2, "Block": 1, "Relentless": 1, "Press Proven": 1 },
    "CB":      { "Anticipate": 4, "Intercept": 4, "Block": 3, "Bruiser": 3, "Jockey": 3, "Aerial Fortress": 2, "Slide Tackle": 2, "Quick Step": 2, "Pinged Pass": 1, "Press Proven": 1 },
    "GK":      { "Far Reach": 4, "Footwork": 3, "1v1 Close Down": 3, "Cross Claimer": 2, "Deflector": 2, "Far Throw": 1, "Pinged Pass": 1, "Long Ball Pass": 1 }
  };

  // TRAIT_STAT_WEIGHTS: how much a card's WEAK FOOT and SKILL MOVES stars count, per position
  // group (fut.gg factors both). Discovered live: it.skillMoves and it.weakFoot are 1-5 stars.
  // scorePlayer folds them INTO the stat average as two extra "attributes" (a 5-star = 99-equiv,
  // 3-star = ~59), scaled by these weights - so they nudge the rating without a separate term
  // (keeps stat + PlayStyle = total). Attackers value skill moves + both feet most; defenders
  // barely; keepers not at all (GKs never get these two added). Weights are relative to
  // STAT_WEIGHTS above (each group's stat weights total ~35-40, so sm:2 is a light ~5% nudge).
  var TRAIT_STAT_WEIGHTS = {
    "ST":      { sm: 2, wf: 2 },
    "RW / LW": { sm: 3, wf: 1.5 },
    "CAM":     { sm: 2.5, wf: 1.5 },
    "RM / LM": { sm: 2.5, wf: 1 },
    "CM":      { sm: 1.5, wf: 1 },
    "CDM":     { sm: 0.5, wf: 0.5 },
    "RB / LB": { sm: 1, wf: 0.5 },
    "CB":      { sm: 0.3, wf: 0.5 }
    // GK: intentionally absent - weak foot / skill moves don't matter for keepers.
  };

  // How the two parts blend into the final 0-100 "Justaino rating". These MUST add up to 1.
  // Balanced ~50/50, tuned to mirror fut.gg's GG Rating: an elite-STATS card with a spread of PS+
  // (e.g. Maradona) should beat a card that owns the exact 3 meta PS+ but has weaker stats. A PS
  // heavy blend inverts that (it over-rewards the perfect-PS card), so stats carry real weight here.
  // Within the PlayStyle half a PlayStyle+ is worth PSPLUS_MULT x a basic (see scorePlayer). Nudge
  // STAT_MIX up to lean more on raw stat quality, PS_MIX up to lean more on owning meta PlayStyles.
  var STAT_MIX = 0.50;
  var PS_MIX   = 0.50;

  // PSPLUS_MULT: how much more a PlayStyle+ counts than the same basic PlayStyle, inside the
  // PlayStyle score. 3.5 = a PS+ is worth three-and-a-half basics (was 3). Used in BOTH the raw
  // score (scorePlayer) and the ceiling (psMaxForWeights) so the 0-100 normalization stays honest.
  // Higher = owning the RIGHT PlayStyle+ (vs a plain basic) matters more.
  var PSPLUS_MULT = 3.5;

  // PS_CEIL_PLUS: how many of a role's PlayStyles the "full marks" ceiling assumes you own as PS+.
  // This is the headroom that lets QUANTITY of relevant PS+ matter: with a low ceiling a card that
  // owns just 3 meta PS+ already saturates at 100, so a card with 5 relevant PS+ scores no higher.
  // Raising this to 5 lifts the ceiling, so 5 relevant PS+ now clearly out-scores 3. (Was 3.)
  var PS_CEIL_PLUS = 5;

  // OVR_MIX: after the stat/PlayStyle blend, we pull the final rating toward the card's in-game OVR
  // by this fraction. OVR is an imperfect proxy for how a card plays (a 97 can have 50s face stats),
  // so it's kept deliberately light - a gentle tiebreak that nudges marquee high-OVR cards up without
  // overriding the PlayStyle/stat order. At 0.01 the final rating is 99% stat/PlayStyle fit + 1% raw
  // OVR (was 0.15, before that 0.35) - i.e. OVR is now PURELY a tiebreak: it only separates two cards
  // whose stat/PlayStyle fit is otherwise near-identical, and can never lift a marquee card above a
  // better-fitting one. Set it to 0 to ignore OVR entirely.
  var OVR_MIX  = 0.01;

  // DRAFT_OVR_MIX: the SQUAD BUILDER's own blend (NOT the Justaino Score itself).
  // 0 = pure score, 1 = pure OVR. Lives up here with the other knobs so SCORE_DEFAULTS (below)
  // can read it; it's USED by draftScoreFromScore() down in the Squad Builder section.
  //
  // History, because the number moved for a reason: it was 0.6 from v20, chosen to stop high-OVR
  // icons (few PlayStyles) being benched by meta-kitted lower-rated cards. BUT at that time the
  // score itself carried 35% OVR, so 0.6 really meant ~74% OVR. We since cut OVR_MIX to 0.01 and
  // never revisited this, and measuring a real 546-player club showed the "60%" was behaving like
  // ~47% anyway (OVR spread 11.75 vs score spread 20.2 - only SPREAD moves a ranking, and the gap
  // between the two averages is a constant that cancels out).
  // Now 0.1: the Gauntlet draft should follow the active score (Justaino or your own), with OVR
  // left as a light nudge for genuine near-ties. Adjustable live in Peks Lab -> Advanced.
  var DRAFT_OVR_MIX = 0.1;

  // ----------------------------------------------------------------------------
  // FEATURE 5 (step 1 of 5) - CUSTOM SCORE: the config store
  // See CUSTOM-SCORE-SPEC.md. Everything above is the BASELINE - "the Justaino Score",
  // my opinion, shipped as the default. This block lets those numbers be OVERRIDDEN by
  // the user, so they can rank their club by their own opinion instead.
  //
  // The rule: TWO SCORES, NEVER BOTH AT ONCE. One switch (scoreState.on) decides which
  // one the whole hub speaks - rankings, Best XI, the Squad Builder draft, the score pill
  // and any squad created in game. There is no state where half the tool disagrees.
  //
  // HOW IT WORKS, in plain English:
  //   * SCORE_DEFAULTS  = a snapshot of the baseline numbers above. Never changes at runtime.
  //   * scoreState.cfg  = ONLY the numbers the user actually changed (the "differences").
  //   * CFG             = the two merged together. THE SCORER READS CFG, NOTHING ELSE.
  // Storing only the differences means an untouched knob follows the next seasonal retune
  // of the baseline instead of freezing at an old number.
  //
  // IMPORTANT: the loose vars above (STAT_MIX, PS_MIX, PSPLUS_MULT, PS_CEIL_PLUS, OVR_MIX,
  // STAT_WEIGHTS, TRAIT_STAT_WEIGHTS) are still the single source of the BASELINE, and
  // meta-page.js parses them OUT OF THIS FILE BY NAME to build meta-rating.html. Do not
  // rename or restructure them. Nothing except SCORE_DEFAULTS should READ them any more.
  // ----------------------------------------------------------------------------

  var SCORE_KEY = "FC26_scoreCfg";   // localStorage key: the switch + the user's differences
  var SCORE_SCHEMA = 1;              // bump if the saved shape ever changes (older saves are then ignored)

  // SCORE_DEFAULTS: the baseline, i.e. the Justaino Score exactly as shipped.
  // rankCurve = the per-rank weight schedule roleWeightsFromList uses: a role's top pair of
  // PlayStyles score 4, the next pair 3, the next pair 2, everything else 1. Flatten it to
  // spread the credit; steepen it to make only the top couple of PlayStyles really count.
  var SCORE_DEFAULTS = {
    statMix:     STAT_MIX,            // share of the score from stat fit (psMix is always 1 - this)
    ovrMix:      OVR_MIX,             // how hard the result is pulled toward the card's in-game OVR
    psPlusMult:  PSPLUS_MULT,         // a PlayStyle+ is worth this many basics
    psCeilPlus:  PS_CEIL_PLUS,        // how many owned-as-PS+ the "full marks" ceiling assumes
    draftOvrMix: DRAFT_OVR_MIX,       // Squad Builder draft blend (separate from the score itself)
    rankCurve:   [4, 3, 2, 1],        // role priority curve: top pair, next pair, next pair, tail
    statWeights: STAT_WEIGHTS,        // per position group: how much each of the 6 stats counts
    traitWeights: TRAIT_STAT_WEIGHTS  // per position group: skill moves + weak foot pull
  };

  // LIMITS: [min, max] for every editable number, so a hand-edited localStorage (or a future
  // slider) can never feed the scorer something that breaks it. Applied on every read.
  var SCORE_LIMITS = {
    statMix: [0.10, 0.90], ovrMix: [0, 0.25], psPlusMult: [1, 6],
    psCeilPlus: [3, 8], draftOvrMix: [0, 1], rank: [0, 10], statWeight: [0, 15]
  };
  // clamp(v, lo, hi, fallback): a usable number inside the limits, or the fallback if it isn't one.
  function clampNum(v, lo, hi, fallback) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  // scoreState: what's saved. `on` = is the custom score switched on; `cfg` = the differences.
  var scoreState = { on: false, cfg: {} };

  // loadScoreState(): read the save. Anything missing, malformed or from an older schema falls
  // back to "off, no differences" - i.e. the plain Justaino Score. It can never throw.
  function loadScoreState() {
    try {
      var raw = window.localStorage.getItem(SCORE_KEY);
      if (!raw) return { on: false, cfg: {} };
      var o = JSON.parse(raw);
      if (!o || o.v !== SCORE_SCHEMA) return { on: false, cfg: {} };
      return { on: !!o.on, cfg: (o.cfg && typeof o.cfg === "object") ? o.cfg : {} };
    } catch (e) { return { on: false, cfg: {} }; }
  }
  // saveScoreState(): write the switch + differences. Returns TRUE if it actually saved.
  // This can genuinely fail: the EA web app fills localStorage with its own "console-history"
  // key (megabytes of it), and once the ~5MB quota is hit every write throws. Seen live. We
  // don't want to lose the setting silently, so we warn in the Console and report the failure
  // so the settings page (step 2) can tell you your tuning won't survive a reload.
  var scoreSaveOk = true;   // false once a save has failed - read by the UI
  function saveScoreState() {
    try {
      window.localStorage.setItem(SCORE_KEY, JSON.stringify({ v: SCORE_SCHEMA, on: scoreState.on, cfg: scoreState.cfg }));
      scoreSaveOk = true;
    } catch (e) {
      scoreSaveOk = false;
      console.warn("[FC26] Couldn't save your Peks Lab settings - browser storage is full, so they'll be lost on reload. " +
        "Free some up with: localStorage.removeItem('console-history')", e);
    }
    return scoreSaveOk;
  }

  // mergeGroups(base, over): merge a per-position-group table of numbers (statWeights /
  // traitWeights) with the user's overrides, one key at a time, so overriding ST's pace
  // leaves every other position AND every other ST stat on the baseline.
  function mergeGroups(base, over) {
    var out = {};
    Object.keys(base).forEach(function (g) {
      var row = {}, b = base[g], o = (over && over[g]) || {};
      Object.keys(b).forEach(function (k) {
        row[k] = (o[k] != null) ? clampNum(o[k], SCORE_LIMITS.statWeight[0], SCORE_LIMITS.statWeight[1], b[k]) : b[k];
      });
      out[g] = row;
    });
    return out;
  }

  // CFG: the resolved, clamped config the scorer actually reads. Rebuilt by rebuildCfg()
  // whenever the switch flips or a value changes - never edit CFG directly.
  var CFG = null;
  function rebuildCfg() {
    var d = SCORE_DEFAULTS;
    var o = scoreState.on ? (scoreState.cfg || {}) : {};   // switch off = baseline, differences ignored
    var L = SCORE_LIMITS;
    var statMix = clampNum(o.statMix, L.statMix[0], L.statMix[1], d.statMix);
    CFG = {
      statMix: statMix,
      psMix: 1 - statMix,                                   // ALWAYS the remainder, so the two can't drift apart
      ovrMix: clampNum(o.ovrMix, L.ovrMix[0], L.ovrMix[1], d.ovrMix),
      psPlusMult: clampNum(o.psPlusMult, L.psPlusMult[0], L.psPlusMult[1], d.psPlusMult),
      psCeilPlus: Math.round(clampNum(o.psCeilPlus, L.psCeilPlus[0], L.psCeilPlus[1], d.psCeilPlus)),
      draftOvrMix: clampNum(o.draftOvrMix, L.draftOvrMix[0], L.draftOvrMix[1], d.draftOvrMix),
      // psWeights: YOUR per-position PlayStyle tables. Unlike statWeights there's no baseline to
      // merge with - a position either has your table (and uses it) or it doesn't (and scores by
      // role as normal). Values are clamped; a non-numeric entry is dropped rather than trusted.
      psWeights: (function () {
        var out = {}, src = o.psWeights || {};
        Object.keys(src).forEach(function (g) {
          var row = {}, any = false;
          Object.keys(src[g] || {}).forEach(function (n) {
            var v = Number(src[g][n]);
            if (isFinite(v)) { row[n] = Math.min(L.rank[1], Math.max(L.rank[0], v)); any = true; }
          });
          if (any) out[g] = row;
        });
        return out;
      })(),
      rankCurve: (Array.isArray(o.rankCurve) && o.rankCurve.length === 4)
        ? o.rankCurve.map(function (v, i) { return clampNum(v, L.rank[0], L.rank[1], d.rankCurve[i]); })
        : d.rankCurve.slice(),
      statWeights: mergeGroups(d.statWeights, o.statWeights),
      traitWeights: mergeGroups(d.traitWeights, o.traitWeights)
    };
  }

  // hasScoreDiffs(): has the user actually changed anything, or is their custom score still
  // a straight copy of the baseline? (Switched on but untouched = still identical.)
  function hasScoreDiffs() {
    var c = scoreState.cfg;
    return !!(c && Object.keys(c).length);
  }
  // isCustomScore(): is the hub currently speaking a score that ISN'T the Justaino Score?
  // Used by every label, pill and squad name so custom results are never mistaken for mine.
  function isCustomScore() { return !!scoreState.on && hasScoreDiffs(); }
  // scoreLabel(): what to CALL the active score on screen.
  function scoreLabel() { return isCustomScore() ? "My Score" : "Justaino Score"; }

  // invalidateScoreCaches(): almost nothing caches a score (that's why tuning works at all), but
  // the Best XI view keeps its last drafted boards in `metaBoards` and only redrafts when that's
  // empty. Without this, changing the scoring and returning to Best XI would show the OLD XIs
  // under the new label. Called by every mutator below.
  function invalidateScoreCaches() {
    try { metaBoards = null; } catch (e) {}
    // The lineup tile is built once and reused, so its title has to be re-stamped by hand.
    try { setMetaLaunchLabel(); } catch (e2) {}
  }

  // setScoreValue(key, value): change one knob (null/undefined removes the override, putting
  // that knob back on the baseline). Saves + rebuilds. Returns the new resolved value.
  function setScoreValue(key, value) {
    if (value == null) { delete scoreState.cfg[key]; }
    else { scoreState.cfg[key] = value; }
    saveScoreState(); rebuildCfg(); invalidateScoreCaches();
    return CFG[key];
  }
  // setNestedWeight(table, group, key, value): change ONE number inside a per-position table
  // ("statWeights" / "traitWeights") without disturbing its neighbours. A plain
  // setScoreValue("statWeights", {...}) would REPLACE the whole override object, wiping every
  // other position you'd tuned - this reads, modifies and writes back instead. Passing
  // value = null removes just that one override, and any now-empty parent is pruned so
  // "no differences" really means an empty cfg (which is what isCustomScore() keys off).
  function setNestedWeight(table, group, key, value) {
    var t = scoreState.cfg[table] || (scoreState.cfg[table] = {});
    var row = t[group] || (t[group] = {});
    if (value == null) {
      delete row[key];
      if (!Object.keys(row).length) delete t[group];
      if (!Object.keys(t).length) delete scoreState.cfg[table];
    } else {
      row[key] = value;
    }
    saveScoreState(); rebuildCfg(); invalidateScoreCaches();
  }
  // setRankCurveAt(i, value): the role priority curve is stored as a whole 4-number array, so
  // edit a copy of the LIVE one and write it back.
  function setRankCurveAt(i, value) {
    var curve = CFG.rankCurve.slice();
    curve[i] = value;
    scoreState.cfg.rankCurve = curve;
    saveScoreState(); rebuildCfg(); invalidateScoreCaches();
  }
  // clearGroupWeights(group): put ONE position back on my baseline (both tables), leaving
  // every other position's tuning alone.
  function clearGroupWeights(group) {
    ["statWeights", "traitWeights", "psWeights"].forEach(function (t) {
      if (scoreState.cfg[t]) {
        delete scoreState.cfg[t][group];
        if (!Object.keys(scoreState.cfg[t]).length) delete scoreState.cfg[t];
      }
    });
    saveScoreState(); rebuildCfg(); invalidateScoreCaches();
  }
  // groupIsTuned(group): does this position carry any override? Drives the "edited" marker.
  function groupIsTuned(group) {
    var c = scoreState.cfg;
    return !!((c.statWeights && c.statWeights[group]) || (c.traitWeights && c.traitWeights[group]) ||
      (c.psWeights && c.psWeights[group]));
  }

  // ---- YOUR OWN PlayStyle weights, per position -----------------------------------------------
  // baselinePsWeights(group): the PlayStyle -> weight table this position uses TODAY, merged across
  // every role it can be played in, taking the HIGHEST weight any role gives each PlayStyle (the
  // best case the position can value it). This is exactly the table meta-rating.html publishes, and
  // it's what a custom list is seeded from - so you adjust my numbers rather than start cold.
  function baselinePsWeights(group) {
    var roles = ROLES[group];
    if (!roles) return copyObj(PLAYSTYLE_WEIGHTS[group] || {});
    var merged = {};
    Object.keys(roles).forEach(function (rn) {
      var w = roleWeightsFromList(roles[rn]);
      Object.keys(w).forEach(function (n) { if (merged[n] == null || w[n] > merged[n]) merged[n] = w[n]; });
    });
    return merged;
  }
  function copyObj(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }

  // hasOwnPsList(group): is this position scoring on YOUR list rather than by role?
  function hasOwnPsList(group) { return !!(CFG.psWeights && CFG.psWeights[group] && Object.keys(CFG.psWeights[group]).length); }
  // startOwnPsList(group): take over this position, seeded with the numbers it already uses.
  function startOwnPsList(group) {
    var t = scoreState.cfg.psWeights || (scoreState.cfg.psWeights = {});
    t[group] = baselinePsWeights(group);
    saveScoreState(); rebuildCfg(); invalidateScoreCaches();
  }
  // setPsWeight(group, name, value): change or (value = null) remove one PlayStyle from your list.
  // Removing the last one hands the position back to the role system.
  function setPsWeight(group, name, value) { setNestedWeight("psWeights", group, name, value); }
  // dropOwnPsList(group): give this position back to the role system entirely.
  function dropOwnPsList(group) {
    if (scoreState.cfg.psWeights) {
      delete scoreState.cfg.psWeights[group];
      if (!Object.keys(scoreState.cfg.psWeights).length) delete scoreState.cfg.psWeights;
    }
    saveScoreState(); rebuildCfg(); invalidateScoreCaches();
  }

  // setScoreOn(on): flip the switch WITHOUT losing the saved differences, so you can A/B
  // your own tuning against mine.
  function setScoreOn(on) { scoreState.on = !!on; saveScoreState(); rebuildCfg(); invalidateScoreCaches(); return isCustomScore(); }
  // resetScore(): throw away every custom value AND switch back to the Justaino Score.
  function resetScore() { scoreState = { on: false, cfg: {} }; saveScoreState(); rebuildCfg(); invalidateScoreCaches(); }

  // Load + resolve immediately, so CFG exists before anything scores a player.
  scoreState = loadScoreState();
  rebuildCfg();

  // Console helpers (the page UI comes in step 2 - until then this IS the interface):
  //   window.FC26.score.cfg()                  -> the resolved config the scorer is using
  //   window.FC26.score.on(true|false)         -> switch the custom score on / off
  //   window.FC26.score.set("statMix", 0.72)   -> change one knob (null puts it back to baseline)
  //   window.FC26.score.reset()                -> wipe everything, back to the Justaino Score
  //   window.FC26.score.isCustom() / .label()  -> is a custom score active, and what it's called
  window.FC26.score = {
    cfg: function () { return CFG; },
    state: function () { return scoreState; },
    defaults: SCORE_DEFAULTS,
    limits: SCORE_LIMITS,
    on: setScoreOn,
    set: setScoreValue,
    reset: resetScore,
    isCustom: isCustomScore,
    label: scoreLabel,
    setWeight: function (group, key, v) { return setNestedWeight("statWeights", group, key, v); },
    setTrait: function (group, key, v) { return setNestedWeight("traitWeights", group, key, v); },
    setCurve: setRankCurveAt,
    clearGroup: clearGroupWeights,
    psBaseline: baselinePsWeights,      // what a position values today, merged across its roles
    psStart: startOwnPsList,            // take a position over with your own list (seeded)
    psSet: setPsWeight,                 // set/remove one PlayStyle's weight
    psDrop: dropOwnPsList,              // hand the position back to the role system
    saved: function () { return scoreSaveOk; }   // false = storage is full, settings won't survive a reload
  };

  // The order the position dropdown offers, and the value the app has no group for.
  var META_GROUPS = ["ST", "RW / LW", "CAM", "RM / LM", "CM", "CDM", "RB / LB", "CB", "GK"];

  // Look up an evo by playstyle name. pspByName is keyed by the BASE name (no "+").
  var psByName = {}, pspByName = {};
  PS.forEach(function (x) { psByName[x.n] = x; });
  PSP.forEach(function (x) { pspByName[x.n.replace(/\+$/, "")] = x; });

  // ----------------------------------------------------------------------------
  // FEATURE 4b - limited "one-off" PlayStyle+ reward evos (e.g. the GH 4th PlayStyle+)
  // Discovered live: the Academy groups evolutions into CATEGORIES; the "Rewards"
  // category (id 9) holds slots whose slotName IS a PlayStyle+ name ("Intercept+",
  // "Finesse Shot+", ...). Each is a 1-level, instant-grant evo that "adds <PS+> to any
  // qualified player" - and the GH ("Glory Hunters") ones add it as a 4TH PlayStyle+,
  // beyond the normal cap of 3. They are LIMITED / one-off: applying one consumes it.
  //
  // Mechanically, applying is the SAME call we already use for normal PlayStyles -
  // addItemToSlot(slotId, itemId) + claim - so applyEvo/claimEvo above work unchanged;
  // only the slotId is different (the Rewards slot's own id, e.g. 2119 for Intercept+).
  //
  // We deliberately do NOT auto-classify which are "4th" vs normal (their slotName/desc
  // are identical, and there's no reliable flag). Instead the UI lists the available ones
  // and YOU pick the one you know is the GH 4th; the game enforces cap/eligibility and we
  // surface any rejection. Applying is always explicit + confirmed (never batch/Suggest).
  var REWARDS_CATEGORY_ID = 9;   // Academy "Rewards" category (discovered live)

  // pspByPlusName: PSP catalog keyed by FULL plus-name ("Intercept+") so we can map a
  // reward slot (whose slotName is that name) back to our PS+ entry (icon / trait).
  var pspByPlusName = {};
  PSP.forEach(function (e) { pspByPlusName[e.n] = e; });

  // academySlots(): the Academy slot collection as a plain array (empty until loaded).
  function academySlots() {
    try {
      var rA = window.repositories && window.repositories.Academy;
      var s = rA && (rA.getSlots ? rA.getSlots() : rA.slots);
      if (!s) return [];
      if (Array.isArray(s)) return s;
      if (typeof s.values === "function") return Array.from(s.values());
      return Array.from(s);
    } catch (e) { return []; }
  }

  // isGHFourth(s): true for a "GH 4th <PlayStyle+>" reward slot - the Glory Hunters evo that
  // adds a 4TH PS+. Confirmed live: these are named with a "GH 4th" prefix AND their
  // description says "...any qualified Glory Hunters player. Only Glory Hunter items are
  // eligible...". We match either signal. Normal PS+ reward evos (name just "Finesse Shot+",
  // desc "any qualified player") do NOT match, so a non-4th is never offered as a 4th.
  function isGHFourth(s) {
    if (!s || s.categoryId !== REWARDS_CATEGORY_ID) return false;
    return /gh\s*4th/i.test(s.slotName || "") || /glory hunter/i.test(s.slotDescription || "");
  }
  // ghPsp(slotName): map a GH-4th slot to our PS+ catalog entry (for its icon/trait) by
  // stripping the "GH 4th " prefix and matching the remainder ("Quick Step+", ...); falls
  // back to any catalog PS+ name found inside the slot name. null if none matches.
  function ghPsp(slotName) {
    var nm = slotName || "";
    var stripped = nm.replace(/^\s*GH\s*4th\s*/i, "").trim();
    if (pspByPlusName[stripped]) return pspByPlusName[stripped];
    for (var i = 0; i < PSP.length; i++) { if (nm.indexOf(PSP[i].n) !== -1) return PSP[i]; }
    return null;
  }
  // rewardEvosFromCache(): the GH-4th reward evos currently cached, as [{ slotId, name, psp }].
  // No network - reads whatever the Academy repo already holds for the Rewards category.
  function rewardEvosFromCache() {
    return academySlots().filter(isGHFourth).map(function (s) {
      return { slotId: s.id, name: s.slotName, psp: ghPsp(s.slotName) };
    });
  }

  // loadRewardEvos(): best-effort ask the app to load the Rewards category, then return
  // rewardEvosFromCache(). The request can reject on some pages, but if you've opened
  // Evolutions -> Rewards in the app the slots are already cached, so we just read them.
  async function loadRewardEvos() {
    var svcA = getServices() && getServices().Academy;
    try {
      if (svcA && svcA.requestSlotsByCategory) {
        // Discovered live: the DAO reads categoryId/count/offset/sort OFF this object and
        // fetches /academy/category/9 - so we can load the Rewards category COLD (no need to
        // visit that screen first). Passing the bare id 9 returns a 500; it MUST be this
        // criteria shape. Confirmed: this takes cat-9 slots from 0 -> 61 from a cold start.
        var o = svcA.requestSlotsByCategory({ categoryId: REWARDS_CATEGORY_ID, count: 100, offset: 0, sort: null });
        if (o && typeof o.observe === "function") { await awaitService(o); }
        else if (o && typeof o.then === "function") { await o; }
      }
    } catch (e) { /* ignore - fall back to whatever is already cached */ }
    return rewardEvosFromCache();
  }

  // applyRewardEvo(slotId, itemId): apply ONE limited reward evo to a player - same mechanic
  // as a normal PlayStyle (addItemToSlot + claim). The CALLER must confirm first (one-off).
  async function applyRewardEvo(slotId, itemId) {
    await applyEvo(slotId, itemId);
    try { await claimEvo(slotId); } catch (e) { /* PS grants on apply; claim often 460, harmless */ }
  }

  // Console helpers (list/load only - apply is intentionally NOT exposed here, so a stray
  // console call can't spend a one-off; the panel UI applies it behind a confirm):
  //   await window.FC26.fourthEvos.load()   -> load Rewards + list [{slotId,name,psp}]
  //   window.FC26.fourthEvos.list()         -> list what's already cached
  window.FC26.fourthEvos = { list: rewardEvosFromCache, load: loadRewardEvos };

  // playerPositionGroups(it): the role groups this player can fill (preferred
  // position first, then alternates), deduped - used to fill the position dropdown.
  // playerPositionIds(it): every position id this player can play (preferred position
  // first, then alternates), deduped. The raw ids feed BOTH the group lookup below and
  // the side lookup (posSide) used for left/right placement.
  function playerPositionIds(it) {
    var ids = null;
    try { if (Array.isArray(it.possiblePositions)) ids = it.possiblePositions; } catch (e) {}
    if (!ids) { try { ids = it.getBasePossiblePositions(); } catch (e) {} }
    ids = ids || [];
    var all = [];
    [it.preferredPosition].concat(ids).forEach(function (id) {
      if (id != null && all.indexOf(id) === -1) all.push(id);
    });
    return all;
  }
  function playerPositionGroups(it) {
    var groups = [];
    playerPositionIds(it).forEach(function (id) {
      var g = POS_GROUP[id];
      if (g && groups.indexOf(g) === -1) groups.push(g);
    });
    return groups;
  }

  // shortPos(id): a compact position label for a single position id. For the combined
  // groups ("RB / LB", "RW / LW", "RM / LM") we split on the side (POS_SIDE) so we show
  // the actual side the card plays - e.g. id 2 -> "RB", id 7 -> "LB". Central/single
  // groups (ST, CB, CDM, CM, CAM, GK) are returned as-is.
  function shortPos(id) {
    var g = POS_GROUP[id];
    if (!g) return null;
    if (g.indexOf(" / ") !== -1) {
      var parts = g.split(" / ");                 // ["RB","LB"] etc (Right first, Left second)
      return posSide(id) === "L" ? parts[1] : parts[0];
    }
    return g;
  }
  // primaryPosLabel(it): the small badge label for a player's MAIN position - their
  // preferred position if we have it, else the first playable group. Used in the lineup
  // rows (the same little tag the GK badge used, now shown for every position).
  function primaryPosLabel(it) {
    var l = null;
    try { if (it.preferredPosition != null) l = shortPos(it.preferredPosition); } catch (e) {}
    if (l) return l;
    var groups = playerPositionGroups(it);
    if (!groups.length) return null;
    var g = groups[0];
    return (g.indexOf(" / ") !== -1) ? g.split(" / ")[0] : g;
  }

  // ----------------------------------------------------------------------------
  // FEATURE 2 - the scoring engine (reads the two tables above)
  // ----------------------------------------------------------------------------

  // readStats(it): the player's 6 stats as a {name: value} object. GK cards get
  // GK stat names; everyone else gets outfield face-stat names.
  // IMPORTANT: on an evolved card, the plain `it.attributes` array is FROZEN at the
  // base (pre-evo) values - the game keeps the live evolved 6 face stats behind the
  // `getAttributes()` method instead (confirmed live: base [77,78,85,87,81,84] vs
  // evolved [92,89,94,95,95,95]). So we call getAttributes() first and only fall
  // back to the raw array if that method isn't available on this item.
  function readStats(it) {
    var a = null;
    try { if (typeof it.getAttributes === "function") a = it.getAttributes(); } catch (e) {}
    if (!a || !a.length) { try { a = it.attributes || []; } catch (e2) { a = []; } }
    var keys = isGKPlayer(it) ? GK_STATS : FACE_STATS;
    var o = {};
    for (var i = 0; i < keys.length; i++) o[keys[i]] = (a[i] != null ? a[i] : 0);
    return o;
  }

  // Short labels for the 6 stats, in the SAME order readStats returns them, so the
  // face-stats readout lines up with the numbers. Outfield = the 6 face stats; GK =
  // the 6 keeper stats (matches how readStats renames them for keepers).
  var FACE_LABELS = { pace: "PAC", shooting: "SHO", passing: "PAS", dribbling: "DRI", defending: "DEF", physical: "PHY" };
  var GK_LABELS   = { diving: "DIV", handling: "HAN", kicking: "KIC", reflexes: "REF", speed: "SPD", positioning: "POS" };

  // faceStatsHTML(it): the player's 6 stats as a labelled 3x2 grid (Feature: face stats).
  // Same numbers the Justaino rating reads (it.attributes via readStats), so it can never
  // be out of step with the card. Values are colour-graded by a simple heat scale so a
  // strong stat reads at a glance; the classes map to theme tokens (works in every skin).
  // Reused by the desktop spotlight AND the mobile PlayStyle-Deck summary.
  function faceStatsHTML(it) {
    var gk = isGKPlayer(it);
    var keys = gk ? GK_STATS : FACE_STATS;         // order matches readStats
    var labels = gk ? GK_LABELS : FACE_LABELS;
    var stats = readStats(it);
    // grade(v): heat class. >=90 elite (accent), 80-89 strong (gold), 70-79 ok (ink), else low (muted).
    function grade(v) { return v >= 90 ? "hi" : v >= 80 ? "mid" : v >= 70 ? "reg" : "lo"; }
    var cells = keys.map(function (k) {
      var v = stats[k] || 0;
      return "<div class='pv-fstat'><span class='pv-fk'>" + labels[k] + "</span>" +
        "<span class='pv-fv " + grade(v) + "'>" + v + "</span></div>";
    }).join("");
    return "<div class='pv-faces'>" +
      "<div class='pv-fl'>" + (gk ? "GK stats" : "Face stats") + "</div>" +
      "<div class='pv-fgrid'>" + cells + "</div></div>";
  }

  // scoreByPositionHTML(it): the card's score at EVERY position it can play, best first, with the
  // strongest one accented. Answers "where is this player actually good?" at a glance - a card can
  // be a middling CM and an excellent CDM, and only the best number reaches the pill.
  // Shared by the Rankings detail view, the desktop spotlight card and the mobile Deck summary,
  // so all three can never disagree. Returns "" if the card has no known positions.
  function scoreByPositionHTML(it) {
    try {
      var groups = playerPositionGroups(it);
      if (!groups.length) return "";
      var scored = groups
        .map(function (g) { return { g: g, t: scorePlayer(it, g).total }; })
        .sort(function (a, b) { return b.t - a.t; });
      return "<div class='pv-group'><div class='pv-gl'>" + esc(scoreLabel()) + " by position</div><div class='mp-posrow'>" +
        scored.map(function (s, i) {
          return "<span class='mp-poschip" + (i === 0 ? " top" : "") + "'>" + esc(s.g) + " <b>" + s.t.toFixed(1) + "</b></span>";
        }).join("") + "</div></div>";
    } catch (e) { return ""; }
  }

  // psMaxForGroup(group): a realistic "ceiling" of raw PlayStyle bonus points for a
  // position - the best 3 meta PlayStyles owned as PS+ (doubled) plus the next 5 as
  // basic. We divide a player's raw bonus by this to get a 0-100 PlayStyle score, so
  // "full marks" means owning the best meta PlayStyles this position can want.
  function psMaxForGroup(group) {
    return psMaxForWeights(PLAYSTYLE_WEIGHTS[group] || {});
  }

  // psMaxForWeights(weights): the "full marks" PlayStyle ceiling for a role (used by the scorer).
  // We divide a card's raw bonus by this to get a 0-100 PlayStyle score. It's the best 5 meta
  // PlayStyles owned as PS+ (x PSPLUS_MULT) plus the next 3 as basic. Deliberately HIGH: a card
  // that only owns the top-3 as PS+ should NOT saturate at 100 - owning MORE/better PlayStyle+
  // keeps pushing the score up, so a 5-PS+ card out-scores a 3-PS+ one instead of both maxing out.
  function psMaxForWeights(weights) {
    var vals = Object.keys(weights).map(function (k) { return weights[k]; }).sort(function (a, b) { return b - a; });
    var topPlus = 0, restBasic = 0, i;
    for (i = 0; i < CFG.psCeilPlus && i < vals.length; i++) topPlus += vals[i];   // best psCeilPlus owned as PS+
    for (i = CFG.psCeilPlus; i < vals.length; i++) restBasic += vals[i];          // EVERY other meta PlayStyle as a basic (no cap)
    return (topPlus * CFG.psPlusMult + restBasic) || 1;              // never zero
  }

  // roleWeightsFromList(list): turn a role's ORDERED priority PlayStyle list (from ROLES) into a
  // {name: weight} map by rank - the top of the list matters most. This is the fut.gg-style move:
  // score against a specific role's priorities rather than one blunt per-group table. Schedule
  // mirrors the old hand-tuned scale (top pair = 4, next pair = 3, ... ) so numbers stay familiar.
  function roleWeightsFromList(list) {
    var w = {}, curve = CFG.rankCurve;   // [top pair, next pair, next pair, tail] - see SCORE_DEFAULTS
    for (var i = 0; i < list.length; i++) {
      // EVERY PlayStyle a role lists gets a non-zero weight (top pair = 4 ... tail = 1 by default),
      // so nothing a role considers relevant is ignored. Only PlayStyles absent from the role = 0.
      var wt = i < 2 ? curve[0] : i < 4 ? curve[1] : i < 6 ? curve[2] : curve[3];
      if (w[list[i]] == null) w[list[i]] = wt;
    }
    return w;
  }

  // isStar(v): true only for a real 1-5 star rating (weak foot / skill moves). We DON'T default a
  // missing value to a neutral 3 - folding a ~59-equivalent into the stat average would drag every
  // high-stat card down. If the card doesn't expose it, we simply skip that term (see scorePlayer).
  function isStar(v) { return typeof v === "number" && v >= 1 && v <= 5; }

  // scorePlayer(it, group): my meta score for a club item played in a position
  // group, as a single 0-100 "Justaino rating". Returns a breakdown so the UI can
  // show WHY:
  //   total     = the Justaino rating (0-100). 100 is near-impossible: it needs an
  //               almost-perfect card in BOTH stats and meta PlayStyles.
  //   statPart  = how many of those points came from stats  (= STAT_MIX x statScore)
  //   psPart    = how many came from PlayStyles             (= PS_MIX  x psScore)
  //   stat      = the raw weighted stat average (0-99), before the blend
  //   psScore   = the raw PlayStyle score (0-100), before the blend
  //   playstyle = raw PlayStyle bonus points
  //   hits      = which owned PlayStyles scored, for display
  //   statsUsed = the named stats + values that fed the stat part (self-checks order)
  //   role      = the BEST-fitting role we scored the PlayStyles against (null for a fallback group)
  function scorePlayer(it, group) {
    var sw = CFG.statWeights[group];
    if (!sw) return { stat: 0, playstyle: 0, psScore: 0, statPart: 0, psPart: 0, total: 0, hits: [], statsUsed: {}, group: group, role: null };

    // --- stat part: weighted average of the stats this position cares about (0-99) ---
    var stats = readStats(it);
    var wsum = 0, vsum = 0, used = {};
    for (var k in sw) { wsum += sw[k]; vsum += sw[k] * (stats[k] || 0); used[k] = (stats[k] || 0); }
    // fut.gg-style: fold WEAK FOOT + SKILL MOVES in as two light "attributes" (outfielders only).
    // A star (1-5) is scaled to the 0-99 stat range and weighted per group (TRAIT_STAT_WEIGHTS),
    // so it nudges the stat average rather than adding a separate term - keeps stat + PS = total.
    if (!isGKPlayer(it)) {
      var tw = CFG.traitWeights[group];
      if (tw) {
        // ONLY add these when the card actually exposes them (some club-search items don't).
        // A missing value is skipped entirely - never defaulted to a neutral 3 - so a card without
        // the data keeps its true stat average instead of being dragged toward ~59.
        if (isStar(it.skillMoves)) { wsum += tw.sm; vsum += tw.sm * (it.skillMoves / 5 * 99); used.skillMoves = it.skillMoves; }
        if (isStar(it.weakFoot))   { wsum += tw.wf; vsum += tw.wf * (it.weakFoot   / 5 * 99); used.weakFoot   = it.weakFoot; }
      }
    }
    var statScore = wsum ? (vsum / wsum) : 0;

    // --- playstyle part: ROLE-AWARE. Score the owned PlayStyles against every role this group
    //     offers (ROLES), take the role that scores highest. Falls back to the blunt per-group
    //     PLAYSTYLE_WEIGHTS table only if the group has no ROLES entry. PS+ counts double. ---
    var owned = [];
    currentPlayStyles(it).forEach(function (p) {
      var name = traitName[p.traitId];        // base name (traitName has no "+")
      if (name) owned.push({ name: name, isIcon: !!p.isIcon });
    });
    // A user-defined PlayStyle table for this position REPLACES the role system for it: you've
    // said which PlayStyles matter here and by how much, so there's nothing left to fit a role
    // against. Every other position keeps scoring by best-fitting role as normal.
    var roleTable = ROLES[group];
    var cands = [];
    var ownTable = CFG.psWeights && CFG.psWeights[group];
    if (ownTable && Object.keys(ownTable).length) {
      cands.push({ role: "Your list", weights: ownTable });
    } else if (roleTable) {
      Object.keys(roleTable).forEach(function (rn) { cands.push({ role: rn, weights: roleWeightsFromList(roleTable[rn]) }); });
    }
    if (!cands.length) cands.push({ role: null, weights: PLAYSTYLE_WEIGHTS[group] || {} });
    var bestRole = null, psScore = 0, psRaw = 0, hits = [];
    cands.forEach(function (c) {
      var raw = 0, h = [];
      owned.forEach(function (o) {
        var base = c.weights[o.name] || 0;
        if (!base) return;
        var val = o.isIcon ? base * CFG.psPlusMult : base;   // a PlayStyle+ counts psPlusMult x a basic
        raw += val;
        h.push({ name: o.name, isIcon: o.isIcon, val: val });
      });
      var score = Math.min(1, raw / psMaxForWeights(c.weights)) * 100;
      if (bestRole === null || score > psScore) { bestRole = c.role; psScore = score; psRaw = raw; hits = h; }
    });

    // --- blend the two 0-100 halves, then pull toward the card's OVR (quality floor, mix up top) ---
    var statPart = CFG.statMix * statScore;
    var psPart = CFG.psMix * psScore;
    var metaBlend = Math.min(100, Math.max(0, statPart + psPart));   // pure stat+PlayStyle score
    var ovr = (typeof it.rating === "number") ? it.rating : metaBlend;
    var total = Math.max(0, Math.min(100, (1 - CFG.ovrMix) * metaBlend + CFG.ovrMix * ovr));

    return {
      stat: Math.round(statScore * 10) / 10,   // raw weighted stat average (0-99), incl. WF/SM
      playstyle: psRaw,                          // raw PlayStyle bonus points (best role)
      psScore: Math.round(psScore * 10) / 10,    // PlayStyle score (0-100) before blend
      statPart: Math.round(statPart),            // stat's contribution to the meta blend
      psPart: Math.round(psPart),                // PlayStyle's contribution to the meta blend
      metaBlend: Math.round(metaBlend * 10) / 10,// stat+PlayStyle score BEFORE the OVR pull
      ovr: ovr,                                  // the card OVR the rating was pulled toward
      total: Math.round(total * 10) / 10,        // the Justaino rating, 0-100 (1 decimal, so near-ties separate)
      hits: hits,
      statsUsed: used,
      group: group,
      role: bestRole                             // the best-fitting role the PlayStyles matched
    };
  }

  // metaTop(group, n): the top-N club players for a position group, best first.
  function metaTop(group, n) {
    n = n || 20;
    return getClubPlayers()
      // only rank players who can actually play this position group (a CDM list
      // shouldn't include players who can't play CDM).
      .filter(function (it) { return playerPositionGroups(it).indexOf(group) !== -1; })
      .map(function (it) { return { it: it, score: scorePlayer(it, group) }; })
      .sort(function (a, b) { return b.score.total - a.score.total; })
      .slice(0, n);
  }

  // bestJustaino(it): the player's highest Justaino rating across the positions they
  // can play, for the preview-card pill. Returns { group, score } or null.
  function bestJustaino(it) {
    var groups = playerPositionGroups(it);
    if (!groups.length) return null;
    var best = null;
    groups.forEach(function (g) {
      var s = scorePlayer(it, g);
      if (!best || s.total > best.score.total) best = { group: g, score: s };
    });
    return best;
  }

  // Console helpers so the tables can be poked/tuned without the UI:
  //   window.FC26.scorePlayer(it, "ST")   -> full breakdown for one item
  //   window.FC26.metaTop("CB", 10)       -> top 10 CBs in the loaded club
  //   window.FC26.STAT_WEIGHTS           -> the BASELINE table (the Justaino Score, never changes)
  //   window.FC26.score.cfg().statWeights -> the table the scorer is ACTUALLY using right now
  window.FC26.scorePlayer = scorePlayer;
  window.FC26.metaTop = metaTop;
  window.FC26.bestJustaino = bestJustaino;
  window.FC26.STAT_WEIGHTS = STAT_WEIGHTS;
  window.FC26.PLAYSTYLE_WEIGHTS = PLAYSTYLE_WEIGHTS;

  // ============================================================================
  // FEATURE 3 - GAUNTLET SQUAD BUILDER (display only)
  // Given a formation + N (3-5), build N squads from the club with ZERO shared
  // players (the "Gauntlet" rule: each objective wants a different XI), each as
  // strong as possible, via a snake draft on the Justaino meta score
  // (scorePlayer). We never place anyone in the game - this is just a plan.
  // ============================================================================

  // A formation is just an ordered list of 11 position GROUPS (the same group
  // strings scorePlayer/playerPositionGroups already speak: GK, CB, RB / LB,
  // CDM, CM, RM / LM, CAM, RW / LW, ST). Left/right are merged into one group,
  // exactly like the rest of the tool, so a "RB / LB" slot accepts either side.
  // ---- FORMATION CATALOG (built LIVE from the game) --------------------------
  // The game owns the real formation definitions (repositories.Squad.getFormations()):
  // every formation's create() KEY (f.name, e.g. "f4231" vs "f4231a"), its display name,
  // and its 11 slots IN ORDER - each slot carrying the real position id (0-27). We build
  // our tables straight from that, so every variant matches the game exactly (both 4-2-3-1s,
  // the four 4-3-3s, 4-4-1-1, etc.) and create() gets the correct key + slot order.
  //
  // The ONE thing the game data does NOT give us is pitch x/y, so POS_COORD supplies a fixed
  // per-position-id layout (purely cosmetic - just where to draw the dot). Portrait pitch:
  // GK at the bottom (y=90), strikers at the top (y~15); right side = high x, left = low x.
  // Keyed by the app's window.PlayerPosition ids (discovered live).
  var POS_COORD = {
    0: [50, 90],                                   // GK
    1: [50, 80],                                   // SW
    2: [88, 60], 3: [85, 70], 7: [15, 70], 8: [12, 60],   // RWB RB LB LWB
    4: [64, 76], 5: [50, 78], 6: [36, 76],         // RCB CB LCB
    9: [63, 60], 10: [50, 62], 11: [37, 60],       // RDM CDM LDM
    12: [86, 47], 13: [63, 49], 14: [50, 50], 15: [37, 49], 16: [14, 47], // RM RCM CM LCM LM
    17: [66, 33], 18: [50, 35], 19: [34, 33],      // RAM CAM LAM
    20: [64, 22], 21: [50, 24], 22: [36, 22], 23: [82, 20], 27: [18, 20], // RF CF LF RW LW
    24: [62, 15], 25: [50, 14], 26: [38, 15]       // RS ST LS
  };

  // These five tables are all REBUILT by buildFormationCatalog() from the live game data.
  // They start empty and are keyed by the game's formation name (f.name, e.g. "f433").
  var FORMATION_LABEL = {};   // f-name -> display name ("4-3-3 (2)")   [for the dropdown]
  var FORMATIONS = {};        // f-name -> [11 position GROUP strings]  [scoring/eligibility]
  var FORMATION_DOTS = {};    // f-name -> [[slotLabel, x%, y%] x11]    [pitch graphic]
  var FORMATION_SIDES = {};   // f-name -> [11 sides "R"/"L"/"C"]       [placement gate]
  var FORMATION_ORDER = [];   // f-names in the game's own display order [dropdown order]

  // buildFormationCatalog(): read the game's formations and (re)fill the tables above.
  // Returns how many formations were loaded (0 if the game hasn't loaded them yet). Safe to
  // call repeatedly. We skip any formation with a slot we can't score (unknown group).
  function buildFormationCatalog() {
    var list = null;
    try {
      var R = window.repositories && window.repositories.Squad;
      list = (R && R.getFormations) ? R.getFormations() : (R && R.formations);
    } catch (e) { list = null; }
    var arr = !list ? [] : (Array.isArray(list) ? list
      : (typeof list.values === "function" ? Array.from(list.values())
      : Object.keys(list).map(function (k) { return list[k]; })));
    var order = [], labels = {}, groups = {}, dots = {}, sides = {};
    arr.forEach(function (f) {
      var key = f && f.name;
      if (!key || !Array.isArray(f.positions) || f.positions.length !== 11) return;
      var g = [], d = [], sd = [], ok = true;
      f.positions.forEach(function (p) {
        var id = p.id;
        var grp = POS_GROUP[id];
        if (!grp) { ok = false; return; }          // a slot we can't score - skip the formation
        g.push(grp);
        sd.push(posSide(id));
        var c = POS_COORD[id] || [50, 50];
        d.push([p.name || grp, c[0], c[1]]);       // slot label (RCB, RM, RS, ...) + coords
      });
      if (!ok) return;
      order.push(key); labels[key] = f.displayName || key; groups[key] = g; dots[key] = d; sides[key] = sd;
    });
    if (!order.length) return 0;
    FORMATION_ORDER = order; FORMATION_LABEL = labels; FORMATIONS = groups; FORMATION_DOTS = dots; FORMATION_SIDES = sides;
    try { window.FC26.FORMATIONS = FORMATIONS; } catch (e) {}
    return order.length;
  }
  buildFormationCatalog();   // best-effort at load; openBuilder() refreshes it too.

  // formationSides(name): the precomputed L/R side of each of the 11 slots (from position ids).
  function formationSides(formationName) { return FORMATION_SIDES[formationName] || []; }
  // fmtFormation(name): the human display name for a formation key (for UI text).
  function fmtFormation(name) { return FORMATION_LABEL[name] || name; }
  // A full Gauntlet squad is 18 players: 11 starters + 7 subs on the bench.
  var SUBS_PER_SQUAD = 7;
  var SQUAD_SIZE = 11 + SUBS_PER_SQUAD;     // 18

  // isLoanPlayer(it): true if this is a LOAN or otherwise TIME-LIMITED item that shouldn't go
  // into a saved squad. Two shapes, both discovered live (all permanent cards use -1 for both):
  //   1. MATCH-COUNT loan  - it.loans is the number of loan matches left (e.g. Iniesta = 20);
  //      -1 means "not a match loan".
  //   2. TIMED loan / expiring item - it.loans is -1 but it.endTime is a real Unix expiry
  //      timestamp (e.g. Salgado); permanent cards use endTime = -1. This covers timed loans
  //      whether still active or already expired.
  // Loan/expired items can make the game reject a whole squad create with error 460, and you
  // wouldn't want an expiring card in a Gauntlet squad anyway, so we exclude both kinds.
  function isLoanPlayer(it) {
    try {
      if (typeof it.loans === "number" && it.loans > -1) return true;      // match-count loan
      if (typeof it.endTime === "number" && it.endTime > 0) return true;   // timed / expiring
      return false;
    } catch (e) { return false; }
  }

  // playerKey(it): a stable identity for the underlying PLAYER (not the specific card), used to
  // stop the same player appearing twice in one squad - the game rejects that create with a 460
  // (e.g. a 95 and a 92 Courtois). Ideally we'd use the numeric assetId, but on club-search
  // items it comes back 0/undefined (discovered live), and definitionId/guidAssetId differ per
  // card version. The ONE thing two versions of a player reliably share here is their NAME, so
  // we key on firstName+lastName (falling back to the display name). A truthy numeric assetId is
  // preferred if the app ever populates it; the item id is the last-resort (never de-dupes two
  // different cards, but is always safe).
  function playerKey(it) {
    try { if (it.assetId) return "a" + it.assetId; } catch (e) {}
    try { if (it._assetId) return "a" + it._assetId; } catch (e) {}
    try {
      var sd = it.getStaticData ? it.getStaticData() : it._staticData;
      if (sd) {
        var nameKey = ((sd.firstName || "") + "|" + (sd.lastName || "") + "|" + (sd.name || "")).toLowerCase();
        if (nameKey.replace(/[|]/g, "").trim()) return "n" + nameKey;
      }
    } catch (e) {}
    return "i" + (it && it.id);
  }

  // Which club players can be used at all: anyone with at least one position group we
  // know how to score, EXCLUDING loan players (the game won't let a loan item into a
  // saved squad, so drafting one guarantees a failed create).
  function gauntletPool() {
    return getClubPlayers().filter(function (it) {
      return !isLoanPlayer(it) && playerPositionGroups(it).length > 0;
    });
  }

  // Can this player fill this formation slot? True if the slot's group is one of
  // the player's own position groups.
  function canPlayGroup(it, group) {
    return playerPositionGroups(it).indexOf(group) !== -1;
  }

  // canPlaySlot(it, group, side): the placement gate. POS_GROUP merges both flanks into one
  // group (keeps scoring simple), but a "LB" pitch slot must not take a pure RB. So on top of
  // canPlayGroup we require, for a SIDED slot, that the player has a position id in THAT group
  // on THAT side (posSide). A player who plays both sides passes either. Central slots
  // (side "C") keep the old group-only behaviour.
  function canPlaySlot(it, group, side) {
    if (!canPlayGroup(it, group)) return false;
    if (side === "C" || !side) return true;
    var ids = playerPositionIds(it);
    for (var i = 0; i < ids.length; i++) {
      if (POS_GROUP[ids[i]] === group && posSide(ids[i]) === side) return true;
    }
    return false;
  }

  // Normalise a formation input into an array of N valid formation names. Accepts a
  // single string (broadcast to all N squads) or an array (one name per squad); any
  // missing/invalid entry falls back to the default formation. This is what lets the
  // whole Squad Builder be per-squad while old callers (and the console helper) can
  // still pass one formation string.
  function normFormations(input, n) {
    var fallback = FORMATIONS["f433"] ? "f433" : (FORMATION_ORDER[0] || null);
    var out = [];
    for (var i = 0; i < n; i++) {
      var f = Array.isArray(input) ? input[i] : input;
      if (!f || !FORMATIONS[f]) f = fallback;
      out.push(f);
    }
    return out;
  }

  // DEPTH CHECK - run BEFORE building so we never show broken squads.
  // Two tests:
  //   1. Total: the club needs at least 18 * N usable players (11 starters + 7 subs each).
  //   2. Per group+side: demand is SUMMED across the per-squad formations (a mix like
  //      [4-3-3, 3-5-2] asks for different things), so each key needs that summed count
  //      of candidates who can play it. Players overlap groups, so passing is necessary
  //      but not a hard guarantee; a FAILURE is a real, specific shortage to report.
  function gauntletDepth(formations, n) {
    var players = gauntletPool();
    // Sum how many of each group+side the N formations ask for. Sided slots are keyed
    // "group|R" / "group|L" so a shortage on ONE flank (e.g. no left-backs) is reported,
    // not hidden by a healthy count on the other. Central slots key on group alone.
    var need = {};
    for (var s = 0; s < n; s++) {
      var slots = FORMATIONS[formations[s]] || [];
      var fsides = formationSides(formations[s]);
      slots.forEach(function (g, idx) {
        var side = fsides[idx] || "C";
        var key = (side === "C") ? g : (g + "|" + side);
        need[key] = (need[key] || 0) + 1;
      });
    }
    var shortages = [];
    Object.keys(need).forEach(function (key) {
      var parts = key.split("|"), g = parts[0], side = parts[1] || "C";
      var required = need[key];   // already summed across squads
      var have = players.filter(function (it) { return canPlaySlot(it, g, side); }).length;
      if (have < required) shortages.push({ group: (side === "C" ? g : (g + " (" + side + ")")), required: required, have: have });
    });
    return {
      totalNeeded: SQUAD_SIZE * n,       // 18 per squad (11 starters + 7 subs)
      totalHave: players.length,
      totalOk: players.length >= SQUAD_SIZE * n,
      shortages: shortages,          // per-group gaps for the STARTING slots (subs are position-free)
      ok: players.length >= SQUAD_SIZE * n && shortages.length === 0
    };
  }

  // ---- Chemistry tiebreaker (light) ----------------------------------------
  // A club item exposes its league and nation as plain numbers: it.leagueId and
  // it.nationId (discovered live; e.g. Ochoa = league 78, nation 83). We use them
  // ONLY to break near-ties: between candidates whose draft scores are within
  // CHEM_EPSILON of the best available, we prefer the one who shares a league or
  // nation with players already in that squad. Small epsilon = rating still leads.
  var CHEM_EPSILON = 3;
  // ICONS are chem-special in FC 26. Discovered live: every FUT Icon shares
  // leagueId 2118 (there is NO isIcon() method on the item, and rareflag varies
  // per promo - e.g. Maradona = 36, Pirlo = 131 - so it can't identify icons).
  // An icon gives itself full chem AND contributes to EVERYONE: it counts as +1
  // toward EVERY league (not just other icons) and DOUBLE (+2) toward its nation.
  var ICON_LEAGUE = 2118;
  function isIcon(it) { try { return !!it && it.leagueId === ICON_LEAGUE; } catch (e) { return false; } }
  // Every already-placed player in a squad (starters + subs drafted so far).
  function squadPlaced(squad) {
    var arr = [];
    squad.slots.forEach(function (c) { if (c && c.player) arr.push(c.player); });
    squad.subs.forEach(function (c) { if (c && c.player) arr.push(c.player); });
    return arr;
  }
  // How many "links" a candidate would add to the players already in the squad.
  // League: normally +1 per squad-mate sharing the candidate's league, BUT an icon
  // on EITHER side always links (icons boost every league), so an icon candidate is
  // chem-friendly with everyone and placing an icon helps every other card's league.
  // Nation: +1 per squad-mate sharing the candidate's nation, or +2 if either side
  // is an icon (icons count double toward their nation).
  function chemAffinity(placed, cand) {
    var lg = cand.leagueId, nt = cand.nationId, a = 0;
    var candIcon = isIcon(cand);
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i], pIcon = isIcon(p);
      if (candIcon || pIcon) a++;                        // icon (either side) links every league
      else if (lg != null && p.leagueId === lg) a++;     // otherwise only an exact league match
      if (nt != null && p.nationId === nt) a += (candIcon || pIcon) ? 2 : 1;  // icons double for nation
    }
    return a;
  }
  // From a list of {i, score, disp, group} candidates (i = index into pool), keep
  // those within CHEM_EPSILON of the top score, then choose the best by chem
  // affinity, then score, then OVR. `score` is the RANKING value (the OVR-aware
  // draft blend); `disp` is the Justaino Score we store/show for the pick, so the
  // pitch and averages keep meaning the Justaino number even though the draft is
  // OVR-aware. Returns the winner (with .i/.score/.disp/.group) or null.
  function chemPick(cands, squad, pool) {
    if (!cands.length) return null;
    var bestScore = -1;
    cands.forEach(function (c) { if (c.score > bestScore) bestScore = c.score; });
    var placed = squadPlaced(squad);
    var best = null;
    cands.forEach(function (c) {
      if (c.score < bestScore - CHEM_EPSILON) return;         // too far below the top to consider
      var aff = chemAffinity(placed, pool[c.i]);
      var rating = pool[c.i].rating || 0;
      if (!best || aff > best.aff ||
          (aff === best.aff && c.score > best.score) ||
          (aff === best.aff && c.score === best.score && rating > best.rating)) {
        best = { i: c.i, score: c.score, disp: (c.disp != null ? c.disp : c.score), group: c.group, aff: aff, rating: rating };
      }
    });
    return best;
  }
  // Per-squad readout: the biggest single-league and single-nation cluster in it,
  // so the chemistry effect is visible without needing league/nation NAMES.
  function chemSummary(placed) {
    var lg = {}, nt = {}, icons = 0;
    placed.forEach(function (p) {
      if (isIcon(p)) {
        icons++;                                                             // no real league; boosts every league
        if (p.nationId != null) nt[p.nationId] = (nt[p.nationId] || 0) + 2;  // icon counts double for its nation
      } else {
        if (p.leagueId != null) lg[p.leagueId] = (lg[p.leagueId] || 0) + 1;
        if (p.nationId != null) nt[p.nationId] = (nt[p.nationId] || 0) + 1;
      }
    });
    function max(o) { var m = 0; Object.keys(o).forEach(function (k) { if (o[k] > m) m = o[k]; }); return m; }
    var maxRealLeague = max(lg);
    // Icons lift the biggest real-league bloc by +1 each (only meaningful if a real league exists).
    return { maxLeague: maxRealLeague + (maxRealLeague > 0 ? icons : 0), maxNation: max(nt) };
  }

  // ---- Draft ranking (OVR-aware) -------------------------------------------
  // The Meta Rating tab ranks by the Justaino Score, which leans on meta
  // PlayStyles - great for "who's best-tuned", but it under-rates high-OVR cards
  // (especially icons, which usually carry few current PlayStyles). For SQUAD
  // BUILDING we want the strongest cards to start, so the draft ranks by a blend
  // that leans on OVR while still letting Justaino/role-fit shape near-ties.
  // We do NOT touch scorePlayer() (Meta Rating stays exactly as tuned in v18).
  // The knob itself (DRAFT_OVR_MIX) is declared up with the other scoring constants so the
  // custom-score config can hold it; the live value is CFG.draftOvrMix.
  // Blend an already-computed scorePlayer() result into the draft ranking number.
  function draftScoreFromScore(sc) {
    var ovr = (typeof sc.ovr === "number") ? sc.ovr : sc.total;
    return CFG.draftOvrMix * ovr + (1 - CFG.draftOvrMix) * sc.total;
  }

  // THE SNAKE DRAFT (per-squad formations).
  // Each squad can have its OWN formation, so each squad has its OWN slot order (its
  // formation's 11 slots, scarcest-first in the initial pool). We still run 11 rounds
  // and snake the SQUAD order each round (1..N, then N..1, ...) so no squad always
  // picks first; in round r every squad drafts for ITS OWN r-th scarcest slot. Each
  // pick (highest OVR-aware draft score) is removed from the shared pool, so no player
  // is reused across squads. `formationInput` is a formation NAME (all squads the same)
  // or an ARRAY of names (one per squad); a plain string keeps old callers working.
  function buildGauntlet(formationInput, n) {
    n = Math.max(1, Math.min(5, n | 0));
    var formations = normFormations(formationInput, n);   // -> array of N valid names
    for (var vi = 0; vi < n; vi++) {
      if (!FORMATIONS[formations[vi]]) return { error: "Unknown formation: " + formations[vi] };
    }
    var depth = gauntletDepth(formations, n);

    // Pool of available players (we splice out of a working copy as we draft).
    var pool = gauntletPool().slice();

    // Prepare N squads. Each carries its OWN formation, a slots array sized to that
    // formation (kept in the formation's original position order, GK first), a `keys`
    // set (so one player is never placed twice in a squad), and its OWN scarcest-first
    // slot order. Scarcity is side-aware (canPlaySlot), so a slot with few left-siders
    // sorts early.
    var squads = [];
    for (var s = 0; s < n; s++) {
      var fname = formations[s];
      var fslots = FORMATIONS[fname];
      var fsides = formationSides(fname);
      var slotOrder = fslots.map(function (group, idx) {
        var side = fsides[idx] || "C";
        var cand = pool.filter(function (it) { return canPlaySlot(it, group, side); }).length;
        return { group: group, idx: idx, side: side, cand: cand };
      }).sort(function (a, b) { return a.cand - b.cand; });
      squads.push({ formation: fname, slots: new Array(fslots.length), fillCount: 0, subs: [], keys: new Set(), slotOrder: slotOrder });
    }

    // Draft, round by round. 11 rounds (one starter per squad per round); snake the
    // squad order each round. In round r each squad drafts for ITS OWN r-th slot.
    for (var round = 0; round < 11; round++) {
      var order = [];
      for (var i = 0; i < n; i++) order.push(i);
      if (round % 2 === 1) order.reverse();

      order.forEach(function (squadIdx) {
        var squad = squads[squadIdx];
        var slot = squad.slotOrder[round];
        if (!slot) return;   // every formation has 11 slots, so this is just a guard
        // Every available player who can play this slot's group+side, with their draft score.
        var cands = [];
        for (var pi = 0; pi < pool.length; pi++) {
          if (!canPlaySlot(pool[pi], slot.group, slot.side)) continue;
          if (squad.keys.has(playerKey(pool[pi]))) continue;   // already have this player in THIS squad
          var sc = scorePlayer(pool[pi], slot.group);
          cands.push({ i: pi, score: draftScoreFromScore(sc), disp: sc.total, group: slot.group });
        }
        // Pick the best by draft score (OVR-aware), with the chem tiebreaker for near-ties.
        var pick = chemPick(cands, squad, pool);
        if (!pick) {
          // No one left who can fill this slot for this squad.
          squad.slots[slot.idx] = { group: slot.group, player: null, score: null };
        } else {
          var picked = pool.splice(pick.i, 1)[0];   // remove from the shared pool
          squad.slots[slot.idx] = { group: slot.group, player: picked, score: pick.disp };
          squad.keys.add(playerKey(picked));
          squad.fillCount++;
        }
      });
    }

    // BENCH DRAFT. After every XI is complete, hand out 7 subs per squad, still
    // snaking so no squad hogs the leftovers. Bench slots aren't position-locked
    // (a FUT bench takes anyone), so each pick is simply the best remaining player
    // by their STRONGEST role (bestJustaino), removed from the shared pool so the
    // no-overlap rule holds across all 18 x N players.
    for (var sr = 0; sr < SUBS_PER_SQUAD; sr++) {
      var subOrder = [];
      for (var so = 0; so < n; so++) subOrder.push(so);
      if (sr % 2 === 1) subOrder.reverse();

      subOrder.forEach(function (squadIdx) {
        var squad = squads[squadIdx];
        // Every available player, scored at their strongest role.
        var cands = [];
        for (var pi = 0; pi < pool.length; pi++) {
          if (squad.keys.has(playerKey(pool[pi]))) continue;   // no duplicate player on this squad's bench
          var bj = bestJustaino(pool[pi]);
          if (!bj) continue;
          cands.push({ i: pi, score: draftScoreFromScore(bj.score), disp: bj.score.total, group: bj.group });
        }
        var pick = chemPick(cands, squad, pool);
        if (!pick) {
          squad.subs.push({ group: null, player: null, score: null });
        } else {
          var picked = pool.splice(pick.i, 1)[0];
          squad.subs.push({ group: pick.group, player: picked, score: pick.disp });
          squad.keys.add(playerKey(picked));
        }
      });
    }

    // Averages per squad (over filled slots only), for balance visibility - one for
    // the starting XI, one for the bench.
    squads.forEach(function (sq) {
      var sum = 0, filled = 0, ovrSum = 0;
      sq.slots.forEach(function (cell) {
        if (cell && cell.player) { sum += cell.score; ovrSum += (cell.player.rating || 0); filled++; }
      });
      sq.avg = filled ? Math.round((sum / filled) * 10) / 10 : 0;   // Justaino-score avg (kept for reference)
      sq.ovrAvg = filled ? Math.round(ovrSum / filled) : 0;         // true squad OVR average (what "XI avg" shows)
      sq.filled = filled;
      var ssum = 0, sfilled = 0;
      sq.subs.forEach(function (cell) {
        if (cell && cell.player) { ssum += cell.score; sfilled++; }
      });
      sq.subAvg = sfilled ? Math.round((ssum / sfilled) * 10) / 10 : 0;
      sq.subFilled = sfilled;
      sq.chem = chemSummary(squadPlaced(sq));    // biggest league/nation cluster in the 18
    });

    return { formations: formations, n: n, squads: squads, depth: depth };
  }

  // Console helpers: window.FC26.buildGauntlet("f433", 3), .FORMATIONS
  window.FC26.buildGauntlet = buildGauntlet;
  window.FC26.gauntletDepth = gauntletDepth;
  window.FC26.FORMATIONS = FORMATIONS;

  // ---- Meta Ratings "Best XI" boards (view-only depth chart) ----------------
  // buildMetaBoards(formationName, teamCount): fill ONE formation's 11 slots teamCount times
  // as a DEPTH CHART. Team 1 is your strongest XI by the Justaino META score (scorePlayer.total,
  // NOT the OVR-heavy draft blend the Squad Builder uses); Team 2 is the strongest XI of the
  // players left after Team 1; Team 3 the next, etc. Each player is used once (their strongest
  // slot), so you never see the same face twice. It's purely a preview - nothing is created in
  // game. Reuses gauntletPool (excludes loan/expiring cards), canPlaySlot, scorePlayer, chemSummary.
  function buildMetaBoards(formationName, teamCount) {
    teamCount = Math.max(1, Math.min(5, teamCount | 0));
    if (!FORMATIONS[formationName]) return { error: "Unknown formation: " + formationName };
    var fslots = FORMATIONS[formationName];
    var fsides = formationSides(formationName);
    var pool = gauntletPool();
    var usedKeys = new Set();        // players already placed in an EARLIER team (used once across the board)
    var teams = [];
    for (var t = 0; t < teamCount; t++) {
      // Fill scarcest slot first (fewest eligible players LEFT), so a rare left-back isn't
      // stranded after the pool's been picked over - same idea as the Squad Builder draft.
      var slotOrder = fslots.map(function (group, idx) {
        var side = fsides[idx] || "C";
        var cand = pool.filter(function (it) { return !usedKeys.has(playerKey(it)) && canPlaySlot(it, group, side); }).length;
        return { group: group, idx: idx, side: side, cand: cand };
      }).sort(function (a, b) { return a.cand - b.cand; });

      var slots = new Array(fslots.length);
      var placed = [], sum = 0, ovrSum = 0, filled = 0;
      slotOrder.forEach(function (slot) {
        var best = null, bestScore = -1;
        for (var pi = 0; pi < pool.length; pi++) {
          var it = pool[pi];
          if (usedKeys.has(playerKey(it))) continue;                 // already used by this or an earlier team
          if (!canPlaySlot(it, slot.group, slot.side)) continue;
          var sc = scorePlayer(it, slot.group).total;                // pure META score (not OVR-weighted)
          if (sc > bestScore) { bestScore = sc; best = it; }
        }
        if (best) {
          slots[slot.idx] = { group: slot.group, player: best, score: bestScore };
          usedKeys.add(playerKey(best)); placed.push(best);
          sum += bestScore; ovrSum += (best.rating || 0); filled++;
        } else {
          slots[slot.idx] = { group: slot.group, player: null, score: null };
        }
      });
      teams.push({
        formation: formationName,
        slots: slots,
        filled: filled,
        avg: filled ? Math.round((sum / filled) * 10) / 10 : 0,   // Justaino meta average of the XI
        ovrAvg: filled ? Math.round(ovrSum / filled) : 0,          // true OVR average of the XI
        chem: chemSummary(placed)
      });
    }
    return { formation: formationName, teamCount: teamCount, teams: teams };
  }
  window.FC26.buildMetaBoards = buildMetaBoards;

  // ---- FEATURE: turn a Best XI into a REAL 18-man squad (starters + rules-based bench) -------
  // The Best XI page shows your strongest XI for a formation (buildMetaBoards, view-only). This
  // takes that SAME XI and gives it a 7-man bench, so the whole thing can be created in game.
  // The bench is drafted as the NEXT BEST players AFTER the XI (each club player used once, same
  // rule as the board), but with GUARANTEED position cover: at least one each of a fixed set of
  // spots, then the last sub is simply the best remaining player at their strongest position.
  //
  // JSCORE_BENCH_REQS: the required bench spots, IN DRAFT PRIORITY ORDER (scarcer / side-locked
  // spots first so they aren't stranded). Each is a [group, side] pair matching canPlaySlot:
  // side "L"/"R" pins a flank (LM vs RM), side "" means either side / central. No backup GK by
  // design (matches the spec). If a spot can't be filled (club has no spare there) it's skipped
  // and reported in `missing`, and its slot goes to the best-remaining fill instead.
  var JSCORE_BENCH_REQS = [
    { group: "ST",      side: "",  label: "ST" },
    { group: "RM / LM", side: "L", label: "LM" },
    { group: "RM / LM", side: "R", label: "RM" },
    { group: "CM",      side: "",  label: "CM" },
    { group: "CB",      side: "",  label: "CB" },
    { group: "RB / LB", side: "",  label: "LB/RB" }
  ];
  var JSCORE_BENCH_SIZE = 7;   // a full FUT bench (same as the Gauntlet's SUBS_PER_SQUAD)

  // benchForTeam(team, pool): draft ONE team's 7-man bench out of `pool`, removing each pick from
  // it (splice) so the caller's pool shrinks as we go. That shared-pool trick is what stops two
  // teams benching the same player. Returns the finished squad object.
  function benchForTeam(team, pool) {
    var subs = [];        // ordered bench cells (like squad.subs elsewhere)
    var missing = [];     // required spot labels we couldn't fill (for the report / UI)

    // bestForSlot(group, side): index into pool of the best remaining player for this spot,
    // scored at that group (Justaino meta). null if nobody left can play it. side "" = group only.
    function bestForSlot(group, side) {
      var bestI = -1, bestScore = -1;
      for (var i = 0; i < pool.length; i++) {
        var ok = (side === "L" || side === "R") ? canPlaySlot(pool[i], group, side) : canPlayGroup(pool[i], group);
        if (!ok) continue;
        var sc = scorePlayer(pool[i], group).total;
        if (sc > bestScore) { bestScore = sc; bestI = i; }
      }
      return bestI < 0 ? null : { i: bestI, score: bestScore };
    }

    // 1) Fill the REQUIRED spots first, in priority order (best remaining for each).
    JSCORE_BENCH_REQS.forEach(function (req) {
      if (subs.length >= JSCORE_BENCH_SIZE) return;
      var pick = bestForSlot(req.group, req.side);
      if (!pick) { missing.push(req.label); return; }
      var picked = pool.splice(pick.i, 1)[0];
      subs.push({ group: req.group, side: req.side, reqLabel: req.label, player: picked, score: pick.score });
    });

    // 2) Fill the rest of the bench (up to 7) with the best remaining player at their
    // strongest position (bestJustaino) - the plain "next best" cover slot.
    while (subs.length < JSCORE_BENCH_SIZE) {
      var bestI = -1, bestScore = -1, bestGroup = null;
      for (var i = 0; i < pool.length; i++) {
        var bj = bestJustaino(pool[i]);
        if (!bj) continue;
        if (bj.score.total > bestScore) { bestScore = bj.score.total; bestI = i; bestGroup = bj.group; }
      }
      if (bestI < 0) { subs.push({ group: null, side: "", reqLabel: null, player: null, score: null }); continue; }
      var pk = pool.splice(bestI, 1)[0];
      subs.push({ group: bestGroup, side: "", reqLabel: null, player: pk, score: bestScore });
    }

    // Bench average over filled subs (for display).
    var ssum = 0, sfilled = 0;
    subs.forEach(function (c) { if (c.player) { ssum += c.score; sfilled++; } });

    return {
      formation: team.formation,
      slots: team.slots,          // 11 starters, formation order (for create)
      subs: subs,                 // 7 bench cells
      avg: team.avg, ovrAvg: team.ovrAvg, filled: team.filled,
      subAvg: sfilled ? Math.round((ssum / sfilled) * 10) / 10 : 0,
      subFilled: sfilled,
      missing: missing,
      chem: chemSummary(squadPlaced({ slots: team.slots, subs: subs }))
    };
  }

  // buildBestXiSquads(formationName, teamCount, board): the WHOLE depth chart as real 18-man
  // squads - every team's XI plus its own bench, shaped exactly like a Gauntlet squad
  // ({ slots:[11], subs:[7] }) so each feeds straight into gauntletItemsForSquad + createGameSquad.
  //
  // NO PLAYER APPEARS TWICE ANYWHERE ON THE CHART. buildMetaBoards already keeps the XIs apart;
  // this adds the benches to that same used-once rule two ways:
  //   - the bench pool starts as the club MINUS every team's XI, so a sub can never be another
  //     team's starter (before, Team 2's bench happily picked Team 1's best players);
  //   - all teams draft from that ONE shrinking pool, in order, so Team 1 fills its whole bench
  //     from the best leftovers, then Team 2 from what's left, then Team 3.
  // Team 1 therefore gets the strongest bench and later teams thin out - deliberate, since the
  // chart is ranked (Team 1 IS your best squad). A team that runs out of cover for a required
  // spot reports it in `missing`, which the UI already surfaces.
  // Returns { error } if the formation is unknown.
  function buildBestXiSquads(formationName, teamCount, board) {
    if (!FORMATIONS[formationName]) return { error: "Unknown formation: " + formationName };
    teamCount = Math.max(1, Math.min(5, teamCount | 0) || 1);
    // Callers that already have a matching board (the Best XI page renders one every time) pass it
    // in rather than paying for a second full draft.
    if (!board || board.error || !board.teams || board.teams.length !== teamCount) {
      board = buildMetaBoards(formationName, teamCount);
      if (board.error) return board;
    }

    // The shared bench pool: every usable club player minus EVERY team's starting XI.
    var taken = new Set();
    board.teams.forEach(function (t) {
      t.slots.forEach(function (c) { if (c && c.player) taken.add(playerKey(c.player)); });
    });
    var pool = gauntletPool().filter(function (it) { return !taken.has(playerKey(it)); });

    // Sequential, best team first. benchForTeam splices its picks out of `pool`.
    var squads = board.teams.map(function (t) { return benchForTeam(t, pool); });
    return { formation: formationName, teamCount: teamCount, squads: squads };
  }
  window.FC26.buildBestXiSquads = buildBestXiSquads;

  // buildBestXiSquad(formationName, teamIdx, teamCount): one squad off that chart, 0-based.
  // `teamCount` is how many teams to RESERVE benches for - pass what the page is showing, so the
  // squad you create can't clash with a sibling you might create next. Defaults keep the old
  // console call working: buildBestXiSquad("f433") = Team 1 of a one-team chart, as before.
  function buildBestXiSquad(formationName, teamIdx, teamCount, board) {
    teamIdx = Math.max(0, teamIdx | 0);
    var all = buildBestXiSquads(formationName, Math.max(teamCount | 0, teamIdx + 1), board);
    if (all.error) return all;
    return all.squads[teamIdx] || { error: "No team " + (teamIdx + 1) + " for " + formationName };
  }
  window.FC26.buildBestXiSquad = buildBestXiSquad;

  // Console-friendly, non-JS-readable preview:
  //   window.FC26.previewBestXiSquad("f433")          -> Team 1 of a one-team chart
  //   window.FC26.previewBestXiSquad("f433", 1, 3)    -> Team 2 of a three-team chart
  // -> the XI and bench as plain "Position: Name (score)" strings, plus any missing bench spot.
  function previewSquadLines(sq) {
    function nm(c) { return (c && c.player) ? (playerName(c.player) + " (" + (c.score != null ? c.score : "-") + ")") : "(empty)"; }
    return {
      formation: fmtFormation(sq.formation),
      startingXI: sq.slots.map(function (c) { return (c && c.group ? c.group : "?") + " -> " + nm(c); }),
      bench: sq.subs.map(function (c) { return (c.reqLabel ? c.reqLabel : "best") + " -> " + nm(c); }),
      benchMissing: sq.missing.length ? sq.missing.join(", ") : "none",
      xiOvrAvg: sq.ovrAvg, benchAvg: sq.subAvg
    };
  }
  window.FC26.previewBestXiSquad = function (formationName, teamIdx, teamCount) {
    var sq = buildBestXiSquad(formationName || "f433", teamIdx, teamCount);
    return sq.error ? sq.error : previewSquadLines(sq);
  };

  // checkBestXiOverlap(formationName, teamCount): the no-overlap self-check. Lists every player
  // used more than once across the whole chart (starters AND benches). Should always be empty.
  //   window.FC26.checkBestXiOverlap("f433", 3)
  window.FC26.checkBestXiOverlap = function (formationName, teamCount) {
    var all = buildBestXiSquads(formationName || "f433", teamCount || 3);
    if (all.error) return all.error;
    var seen = {}, dupes = [];
    all.squads.forEach(function (sq, i) {
      function note(c, where) {
        if (!c || !c.player) return;
        var k = playerKey(c.player), tag = "Team " + (i + 1) + " " + where;
        if (seen[k]) dupes.push(playerName(c.player) + ": " + seen[k] + " AND " + tag);
        else seen[k] = tag;
      }
      sq.slots.forEach(function (c) { note(c, "XI"); });
      sq.subs.forEach(function (c) { note(c, "bench"); });
    });
    return {
      teams: all.squads.length,
      playersUsed: Object.keys(seen).length,          // should be 18 x teams (minus any empty cells)
      duplicates: dupes.length ? dupes : "none",
      benchAvgs: all.squads.map(function (sq, i) { return "Team " + (i + 1) + ": " + sq.subAvg + (sq.missing.length ? " (missing " + sq.missing.join(", ") + ")" : ""); })
    };
  };

  // ---- Justaino Score squad create/remove plumbing (kept SEPARATE from the Gauntlet ones) ----
  // These squads get their OWN name prefix and their OWN tracked-id list, so the Best XI page's
  // "Remove" only ever deletes Justaino Score squads (never Gauntlet ones) and vice versa. The
  // low-level calls (createGameSquad / listSavedSquads / removeGameSquad / countSavedSquads) are
  // shared - only the naming and tracking differ.
  // The prefix follows the ACTIVE score, so a squad drafted on your own weighting is named
  // "My Score Squad 3" in game and doesn't pretend to be one of mine.
  function jscoreNamePrefix() { return (isCustomScore() ? "My Score" : "Justaino Score") + " Squad "; }
  // Removal matches BOTH name families, so squads made before you started customising (and any
  // made while switched the other way) still clean up. Your own squads are never touched.
  function isJscoreSquadName(name) {
    return typeof name === "string" && (name.indexOf("Justaino Score ") === 0 || name.indexOf("My Score ") === 0);
  }
  var JSCORE_IDS_KEY = "FC26_justainoScoreSquadIds";
  function loadJscoreSquadIds() {
    try { var raw = window.localStorage.getItem(JSCORE_IDS_KEY); if (raw) return JSON.parse(raw) || []; } catch (e) {}
    return [];
  }
  function saveJscoreSquadIds(list) {
    try { window.localStorage.setItem(JSCORE_IDS_KEY, JSON.stringify(list || [])); } catch (e) {}
  }
  // nextJscoreSquadNumber(savedList): 1 + the highest "Squad N" already saved, scanning the LIVE
  // squad list so numbering survives reloads and never collides with an existing squad. It counts
  // BOTH name families, so "Justaino Score Squad 2" means the next custom one is "My Score Squad 3"
  // rather than a confusing second Squad 2.
  function nextJscoreSquadNumber(savedList) {
    var max = 0;
    (savedList || []).forEach(function (s) {
      var m = /(?:Justaino Score|My Score) Squad (\d+)/.exec(s.name || "");
      if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
    });
    return max + 1;
  }

  // ---- FEATURE: create the built Gauntlet squads in the game (writes to the account) ----
  // This is the ONLY part of the tool that creates data on your account. It never touches your
  // active squad, and every squad it makes is tracked so "Remove Gauntlet squads" can undo them
  // in one click. It drives the app's own window.services.Squad, the same service the web app's
  // Squads screen uses. The whole flow was discovered live: create() is a single call that
  // builds a squad from an ordered item list, and remove() takes the numeric squad id.

  // Formations are now keyed by the game's OWN formation name (f.name, e.g. "f433" / "f4231a"),
  // which IS exactly what create() wants, so there's no name->key translation to do any more.
  var GAUNTLET_MAX_SQUADS = 30;   // getMaxSquads() live = 30; creation only fills empty slots
  // Every squad we create is named with this prefix, so removal can find OUR squads on ANY
  // device by scanning the live squad list (not by a per-device id that can also renumber
  // after a delete). Your own squads never match this, so they're never touched.
  var GAUNTLET_NAME_PREFIX = "MGFC Gauntlet ";
  function isGauntletSquadName(name) { return typeof name === "string" && name.indexOf(GAUNTLET_NAME_PREFIX) === 0; }

  // localStorage list of squad ids WE created, as [{id, name}]. Persisted so "Remove Gauntlet
  // squads" still works after the bookmarklet reloads (panel state is rebuilt each run, this
  // list is not).
  var GAUNTLET_IDS_KEY = "FC26_gauntletSquadIds";
  function loadGauntletSquadIds() {
    try { var raw = window.localStorage.getItem(GAUNTLET_IDS_KEY); if (raw) return JSON.parse(raw) || []; } catch (e) {}
    return [];
  }
  function saveGauntletSquadIds(list) {
    try { window.localStorage.setItem(GAUNTLET_IDS_KEY, JSON.stringify(list || [])); } catch (e) {}
  }

  // gauntletItemsForSquad(sq): turn one built squad into the ORDERED item array create() wants.
  // create() maps items[i] -> slot i, so slots 0-10 = the 11 starters (formation order) and
  // slots 11-17 = the 7 subs. A missing pick becomes null, which the game reads as an empty
  // slot. Reserves (18+) are simply left off the end.
  function gauntletItemsForSquad(sq) {
    var items = [];
    sq.slots.forEach(function (cell) { items.push(cell && cell.player ? cell.player : null); });  // 0-10 starters
    sq.subs.forEach(function (cell) { items.push(cell && cell.player ? cell.player : null); });    // 11-17 subs
    return items;
  }

  // createGameSquad(name, formationName, items): make ONE saved squad. The 4th create() arg is a
  // "dream/concept" flag - we pass FALSE so it builds a normal squad from your OWNED items and is
  // NOT made active (your real team is left alone). Returns {id, squad}.
  async function createGameSquad(name, formationName, items) {
    var svc = getServices() && getServices().Squad;
    if (!svc || !svc.create) throw new Error("Squad service unavailable on this page.");
    // formationName IS the game's formation key (f.name, e.g. "f4231a") - pass it straight through.
    var resp = await awaitService(svc.create(name, formationName, items, false));
    var squad = resp && resp.data && resp.data.squad;
    var id = (squad && squad.getId) ? squad.getId() : null;
    return { id: id, squad: squad };
  }

  // removeGameSquad(id): delete one saved squad by its NUMERIC id (confirmed live - passing the
  // entity instead 400s with a "[object Object]" url).
  async function removeGameSquad(id) {
    var svc = getServices() && getServices().Squad;
    if (!svc || !svc.remove) throw new Error("Squad service unavailable on this page.");
    return await awaitService(svc.remove(id));
  }

  // listSavedSquads(): the live saved-squad list as [{id, name}] (or null if unreadable). This
  // is the source of truth for both the cap check and finding OUR squads to remove. Ids are read
  // fresh each call because the game can renumber squads after a delete.
  async function listSavedSquads() {
    var svc = getServices() && getServices().Squad;
    if (!svc || !svc.requestSquadList) return null;
    try {
      var r = await awaitService(svc.requestSquadList());
      var a = r && r.data && r.data.squads;
      if (!a) return [];
      return a.map(function (s) {
        return { id: (s.getId ? s.getId() : s._id), name: (function () { try { return s.getName(); } catch (e) { return s._name; } })() };
      });
    } catch (e) { return null; }
  }
  // countSavedSquads(): total saved squads right now (for the 30-cap check). null if unreadable.
  async function countSavedSquads() {
    var list = await listSavedSquads();
    return list ? list.length : null;
  }

  // Console/testing helpers.
  window.FC26.createGameSquad = createGameSquad;
  window.FC26.removeGameSquad = removeGameSquad;
  window.FC26.gauntletSquadIds = loadGauntletSquadIds;

  // The floating panel. A flex column: fixed header on top, scrollable body below.
  var panel = document.createElement("div");
  panel.id = "fc26-panel";
  // Size / position / rounding come from .fc26-desktop or .fc26-mobile (in the CSS),
  // which applyLayout() sets on the panel based on screen width. Everything else
  // (the frosted glass look) is here.
  panel.style.cssText =
    "position:fixed;z-index:99999;" +
    "display:flex;flex-direction:column;overflow:hidden;" +
    "background:var(--bg);color:var(--ink);font:13px 'Avenir Next Condensed','Arial Narrow',system-ui,sans-serif;" +
    "backdrop-filter:blur(16px) saturate(1.25);-webkit-backdrop-filter:blur(16px) saturate(1.25);" +
    "box-shadow:var(--shadow);border:1px solid var(--border)";

  // applyTheme(id): paint the chosen colourway onto the panel. It sets every colour
  // token as an INLINE custom property on #fc26-panel; those override the defaults in
  // the injected <style> block, so the whole UI re-colours live (no rebuild). Unknown
  // ids fall back to the default. Called once at build, and again from the picker.
  function applyTheme(id) {
    var chosen = THEMES[id] ? id : DEFAULT_THEME;
    state.theme = chosen;
    var t = THEMES[chosen];
    var k;
    for (k in THEME_SHARED) { panel.style.setProperty(k, THEME_SHARED[k]); }
    for (k in t.vars) { panel.style.setProperty(k, t.vars[k]); }
    saveTheme(chosen);
  }
  window.FC26.applyTheme = applyTheme;   // e.g. window.FC26.applyTheme("teal")
  applyTheme(state.theme);               // paint the saved (or default) theme now

  // Header bar: title left, minimize + close right. Lives OUTSIDE the scroll area
  // so the buttons are always reachable even with a long list.
  var header = document.createElement("div");
  header.className = "fc26-header";   // the drag handle (see the drag code near the bottom)
  // touch-action:none lets us drag on touch screens without the page trying to scroll.
  header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--header-bg);border-bottom:1px solid var(--border);touch-action:none";
  var title = document.createElement("div");
  title.className = "fc26-title";
  title.textContent = "Men Gallant FC - Justaino FC Hub";
  title.style.cssText = "flex:1;font-weight:700;font-size:12px;line-height:1.2;color:var(--title);text-transform:uppercase;letter-spacing:.06em";
  // Small version badge next to the title, e.g. "v4" (or "dev" for an untracked build).
  // Hover shows a reminder to check the install page for the newest version.
  var verBadge = document.createElement("span");
  verBadge.className = "fc26-ver";
  verBadge.textContent = FC26_VERSION;
  verBadge.title = "You're on " + FC26_VERSION + ". Check the install page for the latest version.";
  verBadge.style.cssText = "flex:none;font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--accent);background:var(--sel);border:1px solid var(--accent);border-radius:999px;padding:2px 7px;line-height:1;white-space:nowrap";
  // Theme picker: a compact dropdown of the Broadcast colourways. Changing it recolours
  // the panel live (applyTheme sets the tokens) and remembers the choice. Fills itself
  // from THEME_ORDER, so adding a theme needs no change here.
  var themeSel = document.createElement("select");
  themeSel.className = "fc26-theme";
  themeSel.title = "Colour theme";
  themeSel.innerHTML = THEME_ORDER.map(function (id) {
    return "<option value='" + id + "'" + (id === state.theme ? " selected" : "") + ">" + esc(THEMES[id].label) + "</option>";
  }).join("");
  themeSel.style.cssText = "flex:none;max-width:112px;font-size:10px;font-weight:700;color:var(--btn-ink);background:var(--btn);border:1px solid var(--field-border);border-radius:6px;padding:3px 5px;cursor:pointer";
  themeSel.addEventListener("change", function () { applyTheme(themeSel.value); });

  // Reset button: snap the dock back to its default full-width bottom position and size
  // (clears any dragged spot / resized size). Only useful on the desktop dock; hidden on
  // the mobile sheet and the minimized pill (see CSS).
  var resetBtn = document.createElement("button");
  resetBtn.className = "fc26-reset";
  resetBtn.textContent = "⤢";
  resetBtn.title = "Reset size & position (re-dock)";
  resetBtn.style.cssText = "background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;line-height:1;font-size:13px";
  resetBtn.addEventListener("click", function () { resetDock(); });

  var minBtn = document.createElement("button");
  minBtn.textContent = "–";
  minBtn.title = "Minimize / expand";
  minBtn.style.cssText = "background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;line-height:1";
  var closeBtn = document.createElement("button");
  closeBtn.textContent = "×";                 // "×"
  closeBtn.title = "Close (re-click the bookmark to reopen)";
  closeBtn.style.cssText = "background:var(--btnx);color:var(--btnx-ink);border:0;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;line-height:1";
  closeBtn.addEventListener("click", function () { panel.remove(); });
  header.appendChild(title); header.appendChild(verBadge); header.appendChild(themeSel); header.appendChild(resetBtn); header.appendChild(minBtn); header.appendChild(closeBtn);

  // Scrollable body: everything except the header goes in here, so a long player
  // or evo list scrolls INSIDE the panel instead of running off the screen.
  var body = document.createElement("div");
  // Body fills the panel and is a flex column; it does NOT scroll itself - the inner
  // layout (panes on desktop / the sheet on mobile) does its own scrolling. min-height:0
  // lets it shrink inside the flex panel so the inner scroll areas actually cap.
  body.style.cssText = "padding:12px;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden";

  // Minimize hides the body (header stays). On mobile, minimized also shrinks the panel
  // to a small draggable "pill" (handled in applyPanelChrome below); expanding restores
  // the full-width sheet.
  minBtn.addEventListener("click", function () {
    state.minimized = !state.minimized;
    body.style.display = state.minimized ? "none" : "flex";   // restore flex (not ""), or the scroll height chain collapses
    minBtn.textContent = state.minimized ? "+" : "–";
    applyPanelChrome();   // update size/position for the new minimized state
  });

  var status = document.createElement("div");
  status.style.cssText = "margin-top:8px;opacity:.85;max-height:120px;overflow:auto";
  status.textContent = "Ready.";

  // ---- STEP 1.4 player-picker UI -------------------------------------------
  // A "Players" heading, separated from the test buttons by a top border.
  // Header row: "Players" title on the left, a Refresh button on the right.
  var pickerHead = document.createElement("div");
  pickerHead.style.cssText = "display:flex;align-items:center;gap:8px";
  var pickerTitle = document.createElement("div");
  pickerTitle.textContent = "Lineup";
  pickerTitle.className = "fc26-lab";
  pickerTitle.style.cssText = "flex:1";
  var refreshBtn = document.createElement("button");
  refreshBtn.className = "fc26-reload";
  refreshBtn.textContent = "↻ Reload club";
  refreshBtn.title = "Load your full club (every player, not just the squad)";
  // NOTE: this button's look lives in the STYLESHEET (.fc26-reload), not in an inline
  // style.cssText like most buttons here. That matters: an inline style ALWAYS beats a
  // stylesheet rule, so while the colours were set inline the ".busy" / ".done" states
  // could never recolour the button - the class went on, but nothing changed on screen.
  refreshBtn.addEventListener("click", function () { loadFullClub(); });
  pickerHead.appendChild(pickerTitle);
  pickerHead.appendChild(refreshBtn);

  // ---- FEATURE: club-load feedback in the Lineup itself -----------------------
  // WHY: the main status line (the `status` div above) lives in applyMod, which on a phone
  // is ONLY in the DOM on the Review step. So every "Loading full club... 320" message was
  // being written to a detached element and you could never see it - tapping "Reload club"
  // on the Lineup step looked like it did nothing at all. (On desktop applyMod is always in
  // the right pane, which is why it only looked broken on mobile.)
  // FIX: a second, small status line that sits INSIDE the Lineup module, right under the
  // Reload button, so it's visible from wherever that button is. setClubStatus() writes to
  // both this line and the main status, so desktop behaviour is unchanged.
  var clubStat = document.createElement("div");
  clubStat.className = "fc26-clubstat";
  //   text = what to show
  //   kind = "busy" (spinner + accent), "done" (tick + accent), "err" (red), or "" (plain)
  function setClubStatus(text, kind) {
    status.textContent = text;                                     // the original line (desktop / Review step)
    var mark = kind === "busy" ? "<span class='fc26-btnspin'></span>"
             : kind === "done" ? "<span class='fc26-tick'>✓</span>" : "";
    clubStat.className = "fc26-clubstat" + (kind ? " " + kind : "");
    clubStat.innerHTML = mark + "<span>" + esc(text) + "</span>";
  }

  // ---- the Reload button's own three states ----------------------------------
  // "busy" = spinner + live count, disabled.  "done" = a tick that lingers a moment.
  // "idle" = back to normal.
  //
  // WHY the timings below: when your club is already in the app's memory the whole sweep
  // comes back in ONE page and finishes in a couple of hundred milliseconds - so the
  // spinner and the count flashed past before you could see them, and the tap still looked
  // like it did nothing. RELOAD_MIN_MS holds the busy state for a beat so the tap is always
  // visibly acknowledged, and RELOAD_DONE_MS keeps a "✓ Reloaded" confirmation on screen
  // afterwards. Neither delays the actual data - the list is already updated underneath.
  var RELOAD_MIN_MS = 650;      // shortest time the spinner is allowed to be on screen
  var RELOAD_DONE_MS = 2600;    // how long the "✓ Reloaded" confirmation lingers
  var reloadDoneTimer = null;
  function setReloadBtn(mode, label) {
    refreshBtn.disabled = (mode === "busy");
    refreshBtn.className = "fc26-reload" + (mode === "busy" ? " busy" : mode === "done" ? " done" : "");
    if (mode === "busy") refreshBtn.innerHTML = "<span class='fc26-btnspin'></span><span>" + esc(label || "Loading…") + "</span>";
    else if (mode === "done") refreshBtn.innerHTML = "<span class='fc26-tick'>✓</span><span>Reloaded</span>";
    else refreshBtn.textContent = "↻ Reload club";
  }
  // clubReadyText(): the calm resting message the status line settles back to.
  function clubReadyText() {
    return "Club ready: " + getClubPlayers().length + " players (tap ↻ Reload club to refresh).";
  }

  // Search box: type to filter the list by name.
  var playerSearch = document.createElement("input");
  playerSearch.type = "text";
  playerSearch.placeholder = "search club by name...";
  playerSearch.style.cssText = "margin-top:6px;width:100%;box-sizing:border-box;padding:6px 8px;border-radius:7px;border:1px solid var(--field-border);background:var(--field);color:var(--ink)";
  playerSearch.addEventListener("input", renderPlayers);

  // "Only evo-eligible" filter. When ticked, the list shows only players whose
  // rarity is in our eligible set (see EVO-ELIGIBLE RARITIES). The right-hand note
  // shows how many rarities are currently marked eligible. State is remembered.
  var filterRow = document.createElement("label");
  filterRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--muted);cursor:pointer";
  var eligChk = document.createElement("input");
  eligChk.type = "checkbox";
  eligChk.checked = state.onlyEligible;
  eligChk.style.cssText = "accent-color:var(--accent);cursor:pointer;margin:0";
  var eligChkLbl = document.createElement("span");
  eligChkLbl.textContent = "Only evo-eligible";
  var eligNote = document.createElement("span");
  eligNote.style.cssText = "margin-left:auto;opacity:.85";
  filterRow.appendChild(eligChk); filterRow.appendChild(eligChkLbl); filterRow.appendChild(eligNote);
  eligChk.addEventListener("change", function () { state.onlyEligible = eligChk.checked; saveOnlyEligible(); renderPlayers(); });

  // ---- FEATURE 1: manage eligible rarities (full named list) ----------------
  // A collapsible manager that lists the app's FULL rarity table (state.rarityDefs,
  // read from repositories.Rarity - Feature 1) as a searchable checklist. Ticking a
  // rarity marks it evo-eligible; unticking removes it. This SUPERSEDES learn-as-you-go
  // as the main way to choose eligibility - though learn-on-apply and the preview card's
  // "Mark eligible" button still work, since they just tick entries in the SAME set
  // (state.eligible). Your already-eligible ids stay ticked (same localStorage key).
  var eligManageRow = document.createElement("div");
  eligManageRow.style.cssText = "display:flex;margin-top:6px";
  var eligManageBtn = document.createElement("button");
  eligManageBtn.type = "button";
  eligManageBtn.className = "elig-manage-btn";
  eligManageRow.appendChild(eligManageBtn);

  // The manager panel (hidden until opened): its own search box, quick actions, the
  // scrolling checklist, and a small status line.
  var eligManager = document.createElement("div");
  eligManager.className = "elig-manager";
  eligManager.style.display = "none";
  var eligSearch = document.createElement("input");
  eligSearch.type = "text";
  eligSearch.placeholder = "filter rarities by name or id...";
  eligSearch.className = "elig-search";
  eligSearch.addEventListener("input", renderRarityManager);
  // Actions row: a single "Reset to my list" that STAGES a reset back to your seed list.
  // (The old bulk "Tick shown / Untick shown" were removed - too easy to wipe the whole
  //  list by accident. Editing is now stage-then-Save, see below.)
  var eligActions = document.createElement("div");
  eligActions.className = "elig-actions";
  var eligReset = document.createElement("button"); eligReset.type = "button"; eligReset.textContent = "Update to OG list"; eligReset.className = "elig-act elig-reset";
  eligReset.title = "Stage a reset back to your original (OG) seed list, then Save to apply";
  eligActions.appendChild(eligReset);
  var eligListEl = document.createElement("div");
  eligListEl.className = "elig-list";
  var eligMgrNote = document.createElement("div");
  eligMgrNote.className = "elig-mgr-note";
  // Stage-then-Save confirm bar: hidden until there are pending changes; Save commits, Cancel discards.
  var eligConfirm = document.createElement("div");
  eligConfirm.className = "elig-confirm";
  eligConfirm.style.display = "none";
  var eligMsg = document.createElement("span"); eligMsg.className = "elig-msg";
  var eligCancel = document.createElement("button"); eligCancel.type = "button"; eligCancel.textContent = "Cancel"; eligCancel.className = "elig-cancel";
  var eligSave = document.createElement("button"); eligSave.type = "button"; eligSave.textContent = "Save changes"; eligSave.className = "elig-save";
  eligConfirm.appendChild(eligMsg); eligConfirm.appendChild(eligCancel); eligConfirm.appendChild(eligSave);
  eligManager.appendChild(eligSearch); eligManager.appendChild(eligActions); eligManager.appendChild(eligListEl); eligManager.appendChild(eligMgrNote); eligManager.appendChild(eligConfirm);

  // stagedElig: a WORKING copy of the eligible set. Ticking a rarity edits this, not the
  // real list (state.eligible) - nothing is written until you press Save. Re-seeded from the
  // live list every time the manager opens (and on Save/Cancel).
  var stagedElig = new Set(state.eligible);

  // open/close state + button label (shows the SAVED eligible count).
  var eligOpen = false;
  function updateManageBtn() { eligManageBtn.textContent = (eligOpen ? "▾ " : "▸ ") + "Manage eligible rarities (" + state.eligible.size + ")"; }
  eligManageBtn.addEventListener("click", function () {
    eligOpen = !eligOpen;
    eligManager.style.display = eligOpen ? "block" : "none";
    if (eligOpen) { stagedElig = new Set(state.eligible); renderRarityManager(); }   // start clean from the saved list
    updateManageBtn();
    lineupPeek = false;                                        // opening/closing re-collapses the list on mobile
    if (typeof updateLineupCollapse === "function") updateLineupCollapse();
  });

  // currentRarityRows(): the rarity table rows that match the manager's search box
  // (matched on name OR id), or all of them when the box is empty.
  function currentRarityRows() {
    var q = (eligSearch.value || "").trim().toLowerCase();
    return state.rarityDefs.filter(function (r) {
      if (!q) return true;
      return r.name.toLowerCase().indexOf(q) !== -1 || String(r.id).indexOf(q) !== -1;
    });
  }
  // renderRarityManager(): (re)draw the checklist against the STAGED set. Each box reflects
  // stagedElig; a box whose staged state differs from the saved list is marked "will add" /
  // "will remove" and the confirm bar appears. Ticking edits stagedElig only (no save). If
  // the rarity table couldn't be read, we say so and lean on learn-as-you-go (fallback).
  function renderRarityManager() {
    if (!state.rarityDefs.length) {
      eligListEl.innerHTML = "";
      eligMgrNote.textContent = "The app's rarity table couldn't be read on this page, so the full list isn't available yet. Learn-as-you-go still works: mark a card eligible from its preview, or reopen the tool once your club has loaded.";
      updateConfirmBar();
      return;
    }
    var rows = currentRarityRows();
    eligListEl.innerHTML = "";
    rows.forEach(function (r) {
      var committed = state.eligible.has(r.id);
      var staged = stagedElig.has(r.id);
      var pend = staged !== committed;
      var lab = document.createElement("label");
      lab.className = "elig-item" + (pend ? " pending" : "");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = staged;
      var nm = document.createElement("span"); nm.className = "elig-nm" + (pend && !staged ? " elig-strike" : ""); nm.textContent = r.name;
      var badge = document.createElement("span"); badge.className = "elig-pend " + (staged ? "add" : "rem"); badge.style.display = pend ? "" : "none"; badge.textContent = staged ? "will add" : "will remove";
      var idb = document.createElement("span"); idb.className = "elig-id"; idb.textContent = "#" + r.id;
      cb.addEventListener("change", function () {
        if (cb.checked) stagedElig.add(r.id); else stagedElig["delete"](r.id);
        // update THIS row's pending styling in place (keeps scroll position), then the bar + note.
        var p = stagedElig.has(r.id) !== state.eligible.has(r.id);
        lab.classList.toggle("pending", p);
        nm.classList.toggle("elig-strike", p && !cb.checked);
        badge.className = "elig-pend " + (cb.checked ? "add" : "rem");
        badge.textContent = cb.checked ? "will add" : "will remove";
        badge.style.display = p ? "" : "none";
        updateConfirmBar();
        updateMgrNote();
      });
      lab.appendChild(cb); lab.appendChild(nm); lab.appendChild(badge); lab.appendChild(idb);
      eligListEl.appendChild(lab);
    });
    updateMgrNote();
    updateConfirmBar();
  }
  // updateMgrNote(): refresh the manager's summary line (shown / ticked / total), based on the
  // STAGED set. Split out so a single tick can update it live without rebuilding the whole list.
  function updateMgrNote() {
    if (!state.rarityDefs.length) return;
    var rows = currentRarityRows();
    var ticked = rows.filter(function (r) { return stagedElig.has(r.id); }).length;
    eligMgrNote.textContent = rows.length + " shown, " + ticked + " ticked (" + stagedElig.size + " selected of " + state.rarityDefs.length + " rarities).";
  }
  // eligDiffCount(): how many rarities the staged set adds or removes vs the saved list.
  function eligDiffCount() {
    var n = 0;
    stagedElig.forEach(function (id) { if (!state.eligible.has(id)) n++; });
    state.eligible.forEach(function (id) { if (!stagedElig.has(id)) n++; });
    return n;
  }
  // updateConfirmBar(): show the Save/Cancel bar only when there are pending changes.
  function updateConfirmBar() {
    var d = eligDiffCount();
    eligConfirm.style.display = d > 0 ? "flex" : "none";
    if (d > 0) eligMsg.textContent = d + " pending change" + (d === 1 ? "" : "s");
  }
  // Save: commit the staged set to the real list (persist + refresh everything), then redraw
  // the manager clean. Cancel: throw the staged edits away. Reset: stage the seed default (you
  // still Save to apply). All three go through the SAME confirm gate - nothing writes silently.
  eligSave.addEventListener("click", function () {
    state.eligible = new Set(stagedElig);
    saveEligible();
    updateManageBtn();
    renderPlayers();
    if (state.player) renderPreview();
    renderRarityManager();
  });
  eligCancel.addEventListener("click", function () { stagedElig = new Set(state.eligible); renderRarityManager(); });
  eligReset.addEventListener("click", function () { stagedElig = new Set(ELIG_SEED); renderRarityManager(); });
  updateManageBtn();

  // ---- STEP 2a batch bar ---------------------------------------------------
  // Shows how many players are ticked (via the per-row checkbox) for BATCH apply,
  // with a Clear button. Hidden when nothing is ticked (then Apply just targets the
  // previewed player, exactly like before).
  var batchBar = document.createElement("div");
  batchBar.style.cssText = "display:none;align-items:center;gap:8px;margin-top:8px;padding:5px 8px;border-radius:7px;background:var(--sel);border:1px solid var(--accent);font-size:11px;color:var(--ink)";
  var batchCount = document.createElement("span");
  batchCount.style.cssText = "flex:1;font-weight:600";
  var batchClear = document.createElement("button");
  batchClear.textContent = "Clear";
  batchClear.title = "Untick all batched players";
  batchClear.style.cssText = "background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600";
  batchClear.addEventListener("click", function () { state.batch.clear(); renderPlayers(); updateBatchUI(); });
  batchBar.appendChild(batchCount); batchBar.appendChild(batchClear);

  // batchList: a "who will get these PlayStyles" summary shown right above the Apply
  // button (it lives in applyMod, which is the desktop right pane AND the mobile step-3
  // screen - so on a phone, where you can't see the ticked list, you still get a clear
  // roll-call before applying). Hidden unless 2+ players are batched. Rendered by
  // renderBatchList() and refreshed from updateBatchUI().
  var batchList = document.createElement("div");
  batchList.style.cssText = "display:none;margin-bottom:8px;padding:8px;border-radius:8px;background:var(--card);border:1px solid var(--accent);font-size:11px";
  function renderBatchList() {
    if (state.batch.size <= 1) { batchList.style.display = "none"; batchList.innerHTML = ""; return; }
    batchList.style.display = "block";
    var chips = Array.from(state.batch.values()).map(function (it) {
      return "<span class='bl-chip'><b>" + (it.rating != null ? it.rating : "?") + "</b> " + esc(playerName(it)) + "</span>";
    }).join("");
    batchList.innerHTML = "<div class='bl-lead'>Applying selected PlayStyles to " + state.batch.size + " players:</div><div class='bl-chips'>" + chips + "</div>";
  }

  // updateBatchUI(): refresh the batch bar's count/visibility, and disable Suggest when
  // more than one player is batched (Suggest is single-player only - it reads the active
  // player's position/role). Manual ticking still works in batch mode.
  function updateBatchUI() {
    var n = state.batch.size;
    if (n > 0) { batchBar.style.display = "flex"; batchCount.textContent = n + " selected for batch apply"; }
    else { batchBar.style.display = "none"; }
    // Suggest (and its position/role dropdowns, which only feed Suggest) are single-
    // player only, so grey them all out together when more than one player is batched.
    var many = n > 1;
    if (typeof suggestBtn !== "undefined" && suggestBtn) {
      suggestBtn.disabled = many;
      suggestBtn.style.opacity = many ? ".45" : "";
      suggestBtn.style.cursor = many ? "not-allowed" : "pointer";
      suggestBtn.title = many
        ? "Suggest works on one player at a time - uncheck extras first."
        : "Pre-tick recommended playstyles for this position/role (top 4 as PS+)";
    }
    [typeof posSelect !== "undefined" ? posSelect : null, typeof roleSelect !== "undefined" ? roleSelect : null].forEach(function (sel) {
      if (!sel) return;
      sel.disabled = many;
      sel.style.opacity = many ? ".45" : "";
      sel.style.cursor = many ? "not-allowed" : "";
    });
    renderBatchList();                 // refresh the "applying to N players" roll-call
    if (typeof updateGuide === "function") updateGuide();    // batching a player unlocks "Next: Build & Apply"
  }

  // Scrollable list of club players. Its height is set by CSS (.fc26-plist): a fixed
  // cap on mobile, but "flex to fill the left pane" on desktop so it never leaves a gap.
  var playerList = document.createElement("div");
  playerList.className = "fc26-plist";
  playerList.style.cssText = "margin-top:6px;overflow:auto;display:flex;flex-direction:column;gap:4px";

  // ---- FEATURE: collapse the Lineup list on mobile while a panel is open --------
  // On a phone the player list and an open Meta-rating / Manage-rarities panel fight for
  // the same vertical space. So on mobile, when either panel is open, the list folds to a
  // one-line stub ("Player list hidden - N players, tap to show") - tapping the stub peeks
  // the list back, and closing the panel restores it. Desktop always shows both.
  var lineupPeek = false;   // user tapped the stub to reveal the list even though a panel is open
  var lineupStub = document.createElement("button");
  lineupStub.type = "button";
  lineupStub.className = "fc26-liststub";
  lineupStub.style.display = "none";
  lineupStub.addEventListener("click", function () { lineupPeek = true; updateLineupCollapse(); });
  // updateLineupCollapse(): show the stub (and hide the list) whenever a panel (Manage
  // eligible rarities or Meta rating) is open and there's no active peek - on BOTH mobile
  // and desktop, so the open panel gets the room instead of fighting the list for space.
  // Otherwise show the list. Also refreshes the stub's count.
  function updateLineupCollapse() {
    var panelOpen = (typeof eligOpen !== "undefined" && eligOpen);   // Meta rating is now its own full-panel page, not an inline section
    var collapse = panelOpen && !lineupPeek;
    playerList.style.display = collapse ? "none" : "";
    lineupStub.style.display = collapse ? "block" : "none";
    if (collapse) {
      var n = playerList.querySelectorAll(".pl-row").length;   // rows currently listed (after search/filter)
      lineupStub.textContent = "▸ Player list hidden - " + n + " player" + (n === 1 ? "" : "s") + ", tap to show";
    }
  }

  // Preview card for the selected player (hidden until one is picked).
  var preview = document.createElement("div");
  preview.style.cssText = "margin-top:8px;padding:8px;border-radius:8px;background:var(--card);border:1px solid var(--card-border);display:none";

  // Placeholder shown in the desktop dock's middle "spotlight" zone until a player is
  // picked, so that column never sits empty. renderPreview toggles it opposite to the
  // preview card. (Only added to the DOM on desktop; harmless if absent.)
  var spotHint = document.createElement("div");
  spotHint.className = "fc26-spothint";
  spotHint.textContent = "Pick a player from the lineup to spotlight them here.";

  // Open/closed state for the spotlight card's foldaway detail on mobile (see renderPreview).
  // Reuses the OLD Deck-summary storage key, so if you'd already opted into seeing stats on
  // the phone that preference carries straight over to the merged card.
  var CARD_DETAIL_KEY = "FC26_deckStatsOpen";
  function loadCardDetailOpen() { try { return window.localStorage.getItem(CARD_DETAIL_KEY) === "1"; } catch (e) { return false; } }
  function saveCardDetailOpen() { try { window.localStorage.setItem(CARD_DETAIL_KEY, state.cardDetailOpen ? "1" : "0"); } catch (e) {} }
  state.cardDetailOpen = loadCardDetailOpen();

  // renderPreview(): redraw the selected-player card. Same info as before -
  // name/OVR/rarity, caps used, and current PlayStyles - but laid out visually:
  //   - two "capacity pip" trackers (4 pips for PS+, 8 for Basic) that fill up
  //     as slots are used (PS+ pips gold, Basic pips emerald), and
  //   - the current PlayStyles as icon chips, split into a PS+ row and a Basic row.
  // The chip icons reuse the app's PlayStyle icon font, the same one the evo grid
  // uses, so the preview and the picker share one look.
  function renderPreview() {
    var it = state.player;
    if (spotHint) spotHint.style.display = it ? "none" : "block";   // show the placeholder only when nothing is picked
    if (!it) { preview.style.display = "none"; preview.innerHTML = ""; return; }
    preview.style.display = "block";

    // The app's official "slots used" counts (null if it can't tell us).
    var nb = (function () { try { return it.getNumBasicPlayStyles(); } catch (e) { return null; } })();
    var np = (function () { try { return it.getNumPlusPlayStyles(); } catch (e) { return null; } })();

    // Split the player's current PlayStyles into PS+ (isIcon) and basic, keeping
    // each one's traitId (for its icon) and readable name.
    var plus = [], basic = [];
    currentPlayStyles(it).forEach(function (p) {
      var entry = { traitId: p.traitId, name: traitName[p.traitId] || ("trait " + p.traitId) };
      (p.isIcon ? plus : basic).push(entry);
    });
    // Use the app's count when we have it, else fall back to how many we found.
    var pUsed = (np != null) ? np : plus.length;
    var bUsed = (nb != null) ? nb : basic.length;

    // FEATURE 4a - dynamic cap DISPLAY. The item exposes no "max PlayStyles" (discovered
    // live - there's no getMaxPlusPlayStyles), so we can't read a real cap. Normal cards
    // now hold up to 4 PS+ / 8 basic (EA raised PS+ from 3 to 4). A player granted the
    // limited "GH 4th PlayStyle+" evo could still end up past that. So the DISPLAYED cap
    // grows to whatever the player actually holds: a normal card shows 4/4 + 8/8, and a
    // card carrying an extra PS+ shows 5/5 instead of an overflowing 5/4. (Our SELECTION
    // caps read the same CAP_PLUS/CAP_BASIC - see toggleEvo/renderEvos.)
    var plusCap = Math.max(CAP_PLUS, pUsed);
    var basicCap = Math.max(CAP_BASIC, bUsed);

    // meterHTML(label, used, cap, kind): a labelled broadcast-style segment meter - one
    // skewed segment per slot, filled up to "used" (PS+ segments gold, Basic segments accent).
    function meterHTML(label, used, cap, kind) {
      var segs = "";
      for (var i = 0; i < cap; i++) { segs += "<span class='pv-seg" + (i < used ? " on" : "") + "'></span>"; }
      return "<div class='pv-meter " + kind + "'>" +
        "<div class='pv-mlab'><span>" + label + "</span><b>" + used + "/" + cap + "</b></div>" +
        "<div class='pv-segrow'>" + segs + "</div></div>";
    }

    // groupHTML(label, list, isPlus): one "PlayStyle+"/"Basic" chip row (hidden
    // when that group is empty).
    function groupHTML(label, list, isPlus) {
      if (!list.length) return "";
      var chips = list.map(function (e) {
        return "<span class='pv-chip" + (isPlus ? " plus" : "") + "'>" +
          "<i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + e.traitId + "'></i>" +
          esc(e.name) + "</span>";
      }).join("");
      return "<div class='pv-group'><div class='pv-gl'>" + label + "</div>" +
        "<div class='pv-chips'>" + chips + "</div></div>";
    }

    // Position groups for the meta line (e.g. "RW / LW"), if the app exposes them.
    var posLine = "";
    try { var pg = playerPositionGroups(it); if (pg && pg.length) posLine = " &middot; " + esc(pg.join(", ")); } catch (e) {}

    var noneMsg = (!plus.length && !basic.length) ? "<div class='pv-none'>No PlayStyles yet.</div>" : "";

    // Eligibility row: is THIS card's rarity in our evo-eligible list, and a button
    // to add/remove it (this is how you seed or correct the list by hand).
    var elig = isEligibleRarity(it);
    var eligHTML = "<div class='pv-elig'>" +
      "<span class='pv-elig-state " + (elig ? "on" : "off") + "'>" + (elig ? "✓ evo-eligible" : "not evo-eligible") + "</span>" +
      "<button class='pv-elig-btn'>" + (elig ? "Remove" : "Mark eligible") + "</button>" +
      "</div>";

    // Justaino rating pill: the player's BEST 0-100 meta score across the positions
    // they can play, shown right under the big OVR number.
    var jr = null; try { jr = bestJustaino(it); } catch (e) {}
    var jrHTML = jr
      ? "<span class='pv-jr' title='Justaino rating (0-100) as " + esc(jr.group) + (jr.score.role ? " (" + esc(jr.score.role) + ")" : "") + ": meta " + jr.score.metaBlend + " (stats " + jr.score.statPart + " + PlayStyles " + jr.score.psPart + "), blended " + Math.round(CFG.ovrMix * 100) + "% with OVR " + jr.score.ovr + "'>" + scoreLabel().toUpperCase() + " " + jr.score.total.toFixed(1) + " &middot; " + esc(jr.group) + "</span>"
      : "";

    // The heavier half of the card. On DESKTOP it's always shown (there's room in the
    // spotlight column). On MOBILE the card now sits directly above the PlayStyle grid
    // (they're one step since the Deck and Review were merged), so showing all of this
    // would push the tiles below the fold - it folds away behind a toggle instead, and
    // your choice is remembered. Same markup and same order either way.
    var detailHTML =
      "<div class='pv-metaline'>rarity #" + it.rareflag + " &middot; item " + it.id + "</div>" +
      // Score at every position this card can play (same block the Rankings detail shows).
      scoreByPositionHTML(it) +
      // Face stats grid (Feature: fill the spotlight) - same 6 numbers the Justaino rating reads.
      faceStatsHTML(it) +
      noneMsg +
      groupHTML("PlayStyle+", plus, true) +
      groupHTML("Basic", basic, false);
    var mobile = currentMode() === "mobile";
    var detailOpen = !mobile || !!state.cardDetailOpen;

    preview.innerHTML =
      // Broadcast "spotlight": giant rating number next to the name, like a lower-third.
      "<div class='pv-hero'>" +
        "<div class='pv-numwrap'><span class='pv-num'>" + (it.rating != null ? it.rating : "?") + "</span>" + jrHTML + "</div>" +
        "<div class='pv-herowho'>" +
          "<div class='pv-nm'>" + esc(playerName(it)) + (isGKPlayer(it) ? "<span class='pv-gk'>GK</span>" : "") + "</div>" +
          "<div class='pv-sub'>" + esc(rarityName(it)) + posLine + "</div>" +
        "</div>" +
      "</div>" +
      eligHTML +
      "<div class='pv-meters'>" +
        meterHTML("PlayStyle+", pUsed, plusCap, "plus") +
        meterHTML("Basic", bUsed, basicCap, "basic") +
      "</div>" +
      (mobile
        ? "<button type='button' class='pv-more'>" + (detailOpen ? "▴ Hide stats &amp; PlayStyles" : "▾ Stats &amp; PlayStyles") + "</button>" +
          // Explicit inline display, not the `hidden` attribute - we're injected into EA's
          // page and a host reset like `[hidden]{display:block}` would unfold it on us.
          "<div class='pv-detail'" + (detailOpen ? "" : " style='display:none'") + ">" + detailHTML + "</div>"
        : detailHTML) +
      // Reset row (only when there's something to remove): "Remove one" undoes a single
      // PlayStyle; "Clear all" strips them all (confirmed). See runRemove().
      ((plus.length || basic.length)
        ? "<div class='pv-reset'>" +
            "<button class='pv-rm-one'>Remove Latest Evo</button>" +
            "<button class='pv-rm-all'>Clear all evos</button>" +
          "</div>"
        : "");

    // Fold/unfold the detail block (mobile only - the button doesn't exist on desktop).
    var moreBtn = preview.querySelector(".pv-more");
    if (moreBtn) moreBtn.addEventListener("click", function () {
      state.cardDetailOpen = !state.cardDetailOpen;
      saveCardDetailOpen();
      renderPreview();
    });

    // Wire the eligibility button (listener, not inline onclick - the app's CSP
    // blocks inline handlers). Toggles this rarity, then redraws the card + list.
    var eb = preview.querySelector(".pv-elig-btn");
    if (eb) eb.addEventListener("click", function () {
      setRarityEligible(it.rareflag, !isEligibleRarity(it));
      renderPreview();
      renderPlayers();
    });
    // Wire the reset buttons (listeners, not inline - CSP). runRemove guards on
    // state.running, so a stray click mid-run is harmless.
    var rmOne = preview.querySelector(".pv-rm-one");
    if (rmOne) rmOne.addEventListener("click", function () { runRemove(false); });
    var rmAll = preview.querySelector(".pv-rm-all");
    if (rmAll) rmAll.addEventListener("click", function () { runRemove(true); });
  }

  // selectPlayer(it, keepStep): remember the choice, clear any ticked evos from the
  // previous player, then redraw the list, preview, and evolution tabs. keepStep=true
  // focuses the player WITHOUT advancing the mobile wizard (used when a batch checkbox
  // brings a player into focus, so ticking several on a phone doesn't jump to step 2).
  function selectPlayer(it, keepStep) {
    state.player = it;
    state.selected = new Set();   // a fresh player starts with nothing ticked
    if (typeof applyBox !== "undefined" && applyBox) { applyBox.style.display = "none"; applyBox.innerHTML = ""; }  // clear any old apply summary
    renderPlayers();
    try { renderMetaRating(); } catch (e) {}   // keep the Meta rating highlight in sync
    renderPreview();
    populatePositions();          // dropdowns now reflect this player's positions
    renderEvos();
    // On mobile the picker is step 1; choosing a player moves you to Build & Apply
    // (skipped when keepStep=true, e.g. ticking a batch checkbox).
    if (!keepStep && currentMode() === "mobile" && state.wizStep === 1) { goStep(2); }
    else if (typeof updateGuide === "function") updateGuide();   // otherwise just refresh the guide button
    reclampPanel();               // the right pane just grew - keep the whole panel on-screen
    console.log("[FC26] selected player", playerName(it), it.id);
  }

  // renderPlayers(): (re)build the scrollable list, highest OVR first. The chosen
  // row gets a blue outline.
  function renderPlayers() {
    // Keep the filter's rarity-count label in sync every redraw.
    if (typeof eligNote !== "undefined" && eligNote) {
      var nR = state.eligible.size;
      eligNote.textContent = "(" + nR + " rarit" + (nR === 1 ? "y" : "ies") + ")";
    }
    var qRaw = (playerSearch.value || "").trim();   // what the user actually typed (for the "no match" message)
    var q = normName(qRaw);                          // accent-stripped + lowercased, for matching
    var players = getClubPlayers().slice().sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });
    if (state.onlyEligible) { players = players.filter(isEligibleRarity); }  // eligible-only filter
    // Match against full name + first/last name, all accent-insensitive (so "guler" finds Güler).
    if (q) { players = players.filter(function (it) { return playerSearchText(it).indexOf(q) !== -1; }); }
    playerList.innerHTML = "";
    if (!players.length) {
      playerList.innerHTML = q
        ? "<div style='opacity:.7'>No players match \"" + esc(qRaw) + "\".</div>"
        : (state.onlyEligible
            ? "<div style='opacity:.7'>No evo-eligible players shown. Untick \"Only evo-eligible\", or pick a card you can evo and click \"Mark eligible\" on its card.</div>"
            : "<div style='opacity:.7'>No club players found - open your Club first, then click ↻ Refresh.</div>");
      return;
    }
    players.forEach(function (it) {
      var selected = state.player && state.player.id === it.id;
      var row = document.createElement("div");
      row.className = "pl-row" + (selected ? " on" : "");   // styling lives in CSS (.pl-row / .pl-row.on)
      // The PlayStyle+ icons the player already has (isIcon = the "+" version), so you
      // can see a card's PS+ at a glance without opening it. Uses the game icon font.
      var psPlus = currentPlayStyles(it).filter(function (p) { return p.isIcon; });
      var psHTML = psPlus.length
        ? "<span class='pl-ps'>" + psPlus.map(function (p) { return "<i class='ico icon_icontrait" + p.traitId + "'></i>"; }).join("") + "</span>"
        : "";
      // The position badge sits right AFTER the name (like the Meta list) - the name
      // truncates and the badge stays put, so it never crowds the PS+ icons on the right.
      var posBadge = (function () { var pp = primaryPosLabel(it); return pp ? "<span class='pl-pos" + (isGKPlayer(it) ? " gk" : "") + "'>" + esc(pp) + "</span>" : ""; })();
      // The right-hand stuff (PS+ icons + rarity) goes in a fixed-width "meta" zone so the
      // NAME column is the SAME width on every row - a different number of PS+ icons no
      // longer jitters how much of the name shows. (On mobile the zone just fits content.)
      row.innerHTML =
        "<span class='pl-rate'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        "<span class='pl-nameg'><span class='pl-name'>" + esc(playerName(it)) + "</span>" + posBadge + "</span>" +
        "<span class='pl-meta'>" +
          psHTML +
          "<span class='pl-rar'>" + esc(rarityName(it)) + "</span>" +
        "</span>";
      // Batch-apply checkbox (prepended). Ticking it adds/removes this player from the
      // batch WITHOUT selecting it as active (stopPropagation) - so it never changes the
      // preview or, on mobile, advances the wizard. Tapping the row body still selects.
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "pl-check";
      cb.checked = state.batch.has(it.id);
      cb.title = "Add to batch apply";
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
      cb.addEventListener("change", function () {
        if (cb.checked) state.batch.set(it.id, it); else state.batch["delete"](it.id);
        updateBatchUI();
        // Ticking a player also brings it into focus (preview/evos), but WITHOUT the
        // mobile wizard jump - so you can tick several in a row on a phone.
        if (cb.checked) selectPlayer(it, true);
      });
      row.insertBefore(cb, row.firstChild);
      row.addEventListener("click", function () { selectPlayer(it); });
      playerList.appendChild(row);
    });
    if (typeof updateLineupCollapse === "function") updateLineupCollapse();   // refresh the mobile stub count / state
  }

  // ---- STEP 1.5 evolution selection + caps ---------------------------------
  // byId(slotId): find a catalog entry (PS or PS+) by its slotId.
  function byId(s) { for (var i = 0; i < ALL.length; i++) { if (ALL[i].s === s) return ALL[i]; } return null; }
  // evoTrait(evo): the player-side traitId for this evo (rewardId - 301).
  function evoTrait(evo) { return evo.r - TRAIT_OFFSET; }
  // hasEvo(it, evo): does the player already have this exact PlayStyle (base vs +)?
  function hasEvo(it, evo) {
    try { return evo.kind === "PS+" ? !!it.hasPlusPlayStyle(evoTrait(evo)) : !!it.hasBasePlayStyle(evoTrait(evo)); }
    catch (e) { return false; }
  }
  // How many PlayStyles the player ALREADY has, per kind.
  function numBasic(it) { try { return it.getNumBasicPlayStyles() || 0; } catch (e) { return 0; } }
  function numPlus(it) { try { return it.getNumPlusPlayStyles() || 0; } catch (e) { return 0; } }
  // How many of each kind the user has currently TICKED.
  function selectedCount(kind) { var n = 0; state.selected.forEach(function (s) { var e = byId(s); if (e && e.kind === kind) n++; }); return n; }

  // "Evolutions" heading.
  var evoTitle = document.createElement("div");
  evoTitle.textContent = "PlayStyle Deck";
  evoTitle.className = "fc26-lab";
  evoTitle.style.cssText = "margin-top:14px";

  // ---- STEP 1.9 suggest row: position + role dropdowns and a Suggest button ----
  var suggestRow = document.createElement("div");
  suggestRow.style.cssText = "display:flex;gap:6px;margin-top:6px;align-items:center";
  var posSelect = document.createElement("select");
  posSelect.style.cssText = "flex:1;min-width:0;padding:5px;border-radius:6px;border:1px solid var(--field-border);background:var(--field);color:var(--ink)";
  var roleSelect = document.createElement("select");
  roleSelect.style.cssText = "flex:1.4;min-width:0;padding:5px;border-radius:6px;border:1px solid var(--field-border);background:var(--field);color:var(--ink)";
  var suggestBtn = document.createElement("button");
  suggestBtn.textContent = "✨ Suggest";
  suggestBtn.title = "Pre-tick recommended playstyles for this position/role (top 4 as PS+)";
  suggestBtn.style.cssText = "background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:5px 8px;cursor:pointer;white-space:nowrap;font-size:11px";
  suggestRow.appendChild(posSelect); suggestRow.appendChild(roleSelect); suggestRow.appendChild(suggestBtn);

  // populatePositions(): fill the position dropdown - the selected player's own
  // positions (preferred first); if no player yet, show all groups.
  function populatePositions() {
    var groups = state.player ? playerPositionGroups(state.player) : [];
    var list = groups.length ? groups : Object.keys(ROLES);
    posSelect.innerHTML = list.map(function (p) { return "<option>" + esc(p) + "</option>"; }).join("");
    populateRoles();
  }
  // populateRoles(): fill the role dropdown from the chosen position.
  function populateRoles() {
    var pos = posSelect.value;
    var rs = (pos && ROLES[pos]) ? Object.keys(ROLES[pos]) : [];
    roleSelect.innerHTML = '<option value="">role...</option>' + rs.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("");
  }
  // idxTab(): after suggesting, show whichever tab holds more of the picks.
  function idxTab() {
    var arr = Array.from(state.selected);
    var selPlus = arr.filter(function (s) { var e = byId(s); return e && e.kind === "PS+"; }).length;
    return selPlus >= (arr.length - selPlus) ? "PS+" : "PS";
  }
  // suggest(): pre-tick the recommended playstyles for the chosen position/role.
  //
  // How it works: each role has ONE ranked list (best pick first). We fill the
  // player's OPEN slots in two passes down that same list:
  //   Pass 1 - PlayStyle+ : fill the free PS+ slots with the best picks the player
  //            doesn't already have. If a top pick is owned (or is GK-only for a
  //            non-GK), we "fall through" to the next-best pick instead of leaving
  //            the slot empty - so an owned top pick no longer wastes a PS+ slot.
  //   Pass 2 - Basic      : keep walking the SAME list and fill the free basic slots
  //            with the next picks the player doesn't own and that we didn't already
  //            tick as a "+" in pass 1.
  // Selection only - nothing is applied. Never re-ticks a style the player owns.
  function suggest() {
    if (state.batch.size > 1) { status.textContent = "Suggest works on one player at a time - uncheck extras first."; return; }
    var it = state.player;
    if (!it) { status.textContent = "Select a player first."; return; }
    var pos = posSelect.value, role = roleSelect.value;
    if (!pos || !role || !ROLES[pos] || !ROLES[pos][role]) { status.textContent = "Pick a position and role."; return; }

    var gk = isGKPlayer(it);          // is this player a goalkeeper?

    // Build the ONE ranked list we fill from: the role's curated picks FIRST, then
    // the position group's general fallback order for anything still open. We drop
    // duplicates (keeping the first, higher-priority appearance) so no playstyle is
    // ever considered - or ticked - twice.
    var ranked = [];
    var seenName = {};
    ROLES[pos][role].concat(POS_TAIL[pos] || []).forEach(function (name) {
      if (seenName[name]) return;     // already in the list higher up - skip the repeat
      seenName[name] = true;
      ranked.push(name);
    });

    // owns(name): does the player ALREADY have this playstyle, in EITHER form
    // (basic OR plus)? Base and plus share the same underlying trait, so we must
    // check both - otherwise a player who owns "Bruiser+" could be re-suggested a
    // basic "Bruiser". If they own it either way, we skip it entirely.
    function owns(name) {
      var b = psByName[name], p = pspByName[name];
      return (b && hasEvo(it, b)) || (p && hasEvo(it, p));
    }

    // Suggest replaces whatever was ticked - start from a clean selection.
    state.selected = new Set();

    // How many slots of each kind are still OPEN on this player right now.
    var plusOpen = CAP_PLUS - numPlus(it);    // free PlayStyle+ slots
    var baseOpen = CAP_BASIC - numBasic(it);  // free basic slots
    var added = 0;                            // how many we tick in total

    // ---- Pass 1: PlayStyle+ ----
    ranked.forEach(function (name) {
      if (plusOpen <= 0) return;              // no PS+ slots left -> stop ticking "+"
      var evo = pspByName[name];              // the "+" version of this playstyle
      if (!evo) return;                       // no PS+ exists for this name (shouldn't happen)
      if (evo.g && !gk) return;               // GK-only evo, player isn't a GK -> fall through
      if (owns(name)) return;                 // already has it -> fall through (don't re-tick)
      state.selected.add(evo.s); plusOpen--; added++;   // tick this PS+
    });

    // ---- Pass 2: basic PlayStyles ----
    ranked.forEach(function (name) {
      if (baseOpen <= 0) return;              // no basic slots left -> stop
      var evo = psByName[name];               // the basic version of this playstyle
      if (!evo) return;
      if (evo.g && !gk) return;               // GK-only evo, player isn't a GK -> fall through
      if (owns(name)) return;                 // already has it -> skip
      var plusEvo = pspByName[name];          // was this name already ticked as a "+" above?
      if (plusEvo && state.selected.has(plusEvo.s)) return;   // yes -> don't also tick basic
      state.selected.add(evo.s); baseOpen--; added++;         // tick this basic
    });

    // For the status line only: count how many list picks were skipped because the
    // player already owns them, and how many have no usable evo (e.g. a GK-only
    // style for a non-GK). These are informational - they don't change the ticks.
    var owned = 0, unavailable = 0;
    ranked.forEach(function (name) {
      if (owns(name)) { owned++; return; }
      var b = psByName[name], p = pspByName[name];
      var noPlus = !p || (p.g && !gk);        // no PS+ we could ever use for this player
      var noBase = !b || (b.g && !gk);        // no basic we could ever use for this player
      if (noPlus && noBase) unavailable++;
    });

    setTab(idxTab());                         // switches to the busier tab AND re-renders
    status.textContent = "Suggested " + added + " for " + pos + " / " + role +
      (owned ? ", " + owned + " owned" : "") +
      (unavailable ? ", " + unavailable + " unavailable" : "") + ".";
  }
  posSelect.addEventListener("change", populateRoles);
  suggestBtn.addEventListener("click", suggest);

  // Two tabs: PlayStyle+ and basic PlayStyle.
  var tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;margin-top:8px;border:1px solid var(--field-border);border-radius:7px;overflow:hidden";
  function makeTab(label, kind) {
    var b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1;padding:7px 4px;border:0;color:var(--muted);cursor:pointer;font-weight:700;font-size:10px;letter-spacing:.14em;text-transform:uppercase;background:transparent";
    b.addEventListener("click", function () { setTab(kind); });
    return b;
  }
  var tabPlus = makeTab("PlayStyle+", "PS+");
  var tabBase = makeTab("Basic", "PS");
  tabs.appendChild(tabPlus); tabs.appendChild(tabBase);

  // Live count of what's ticked.
  var evoCount = document.createElement("div");
  evoCount.style.cssText = "margin-top:6px;color:var(--accent);font-weight:700;font-size:12px";
  evoCount.textContent = "0 selected";

  // Tickable list for the active tab. Height via CSS (.fc26-elist): capped on mobile,
  // uncapped on desktop (the whole right pane scrolls instead of a box-in-a-box).
  var evoList = document.createElement("div");
  evoList.className = "fc26-elist";
  evoList.style.cssText = "margin-top:6px;overflow:auto;display:flex;flex-direction:column;gap:3px";

  function updateEvoCount() {
    var sp = selectedCount("PS+"), sb = selectedCount("PS");
    evoCount.textContent = (sp + sb) + " selected (" + sp + " PS+, " + sb + " PS)";
    if (typeof updateGuide === "function") updateGuide();   // keep the mobile guide button / Review gate live
    if (typeof updateApplyBtn === "function") updateApplyBtn();   // enable/disable "Apply selected" by selection
  }

  // setTab(kind): switch tab and redraw.
  function setTab(kind) { state.tab = kind; renderEvos(); }

  // toggleEvo(evo, on): tick/untick one evo, enforcing caps. SELECTION ONLY -
  // nothing is applied to the club here.
  function toggleEvo(evo, on) {
    var it = state.player;
    if (on && it) {
      if (evo.kind === "PS+" && numPlus(it) + selectedCount("PS+") >= CAP_PLUS) { status.textContent = "PS+ cap reached (max " + CAP_PLUS + ")."; renderEvos(); return; }
      if (evo.kind === "PS" && numBasic(it) + selectedCount("PS") >= CAP_BASIC) { status.textContent = "Basic cap reached (max " + CAP_BASIC + ")."; renderEvos(); return; }
      state.selected.add(evo.s);
    } else {
      state.selected.delete(evo.s);
    }
    renderEvos();
  }

  // renderEvos(): (re)build the active tab's tickable list, applying all the rules:
  //   - already-owned        -> disabled (would error if applied)
  //   - GK-only on a non-GK  -> disabled
  //   - once a kind's cap is reached, remaining unticked ones of that kind -> disabled
  function renderEvos() {
    // Active tab uses the emerald accent with dark text; inactive stays a faint wash.
    tabPlus.style.background = state.tab === "PS+" ? "var(--accent)" : "transparent";
    tabPlus.style.color = state.tab === "PS+" ? "var(--accent-ink)" : "var(--muted)";
    tabBase.style.background = state.tab === "PS" ? "var(--accent)" : "transparent";
    tabBase.style.color = state.tab === "PS" ? "var(--accent-ink)" : "var(--muted)";
    evoList.innerHTML = "";
    var it = state.player;
    if (typeof updateGhVisibility === "function") { try { updateGhVisibility(); } catch (e) {} }   // show/hide the GH-4th section for this player
    if (!it) { evoList.innerHTML = "<div style='opacity:.7'>Select a player above to choose evolutions.</div>"; updateEvoCount(); return; }
    var gk = isGKPlayer(it);
    var list = state.tab === "PS+" ? PSP : PS;
    var capReached = state.tab === "PS+"
      ? (numPlus(it) + selectedCount("PS+") >= CAP_PLUS)
      : (numBasic(it) + selectedCount("PS") >= CAP_BASIC);
    var isPlus = state.tab === "PS+";
    // Build a 3-column grid of icon tiles (styles live in the injected <style>).
    var grid = document.createElement("div");
    grid.className = "fc26-grid";
    list.forEach(function (evo) {
      var owned = hasEvo(it, evo);
      var wrongScope = !!evo.g && !gk;            // GK-only evo, but player is not a GK
      var selected = state.selected.has(evo.s);
      var disabled = owned || wrongScope || (capReached && !selected);
      var reason = owned ? "already owned" : wrongScope ? "GK-only evo" : (disabled ? "cap full" : "");
      var nm = evo.n.replace(/\+$/, "");          // name implies the kind via the tab
      var tile = document.createElement("div");
      tile.className = "fc26-ec" + (isPlus ? " psp" : "") + (selected ? " sel" : "") + (disabled ? " dis" : "");
      tile.title = nm + (reason ? " - " + reason : "");
      // the <i> uses the app's PlayStyle icon font via icon_basetraitN / icon_icontraitN
      tile.innerHTML =
        "<i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + evoTrait(evo) + "'></i>" +
        "<div class='nm'>" + esc(nm) + "</div>" +
        (owned ? "<span class='own'>✓</span>" : "");
      if (!disabled) { tile.addEventListener("click", function () { toggleEvo(evo, !state.selected.has(evo.s)); }); }
      grid.appendChild(tile);
    });
    evoList.appendChild(grid);
    updateEvoCount();
    if (typeof ghOpen !== "undefined" && ghOpen) { try { renderGHList(); } catch (e) {} }   // keep GH tiles' enabled/note in sync with the selected player
  }

  // ---- FEATURE 4b UI: GH 4th PlayStyle+ (one-off) --------------------------
  // A collapsible section (in the PlayStyle Deck) that lists ONLY the real GH-4th evos.
  // Tapping one applies that 4th PS+ to the SELECTED player after a strong confirm. These
  // are limited one-offs, so this is deliberately kept OUT of batch apply and Suggest, and
  // never fires without an explicit tap + confirm. The game enforces the real rules
  // (Glory Hunters card, already has 3 PS+); we surface its rejection if it says no.
  var ghSection = document.createElement("div");
  ghSection.style.cssText = "margin-top:14px;display:none";   // hidden until an eligible GH player is picked
  var ghToggle = document.createElement("button");
  ghToggle.type = "button";
  ghToggle.className = "gh-toggle";
  var ghBox = document.createElement("div");
  ghBox.className = "gh-box";
  ghBox.style.display = "none";
  var ghHead = document.createElement("div");
  ghHead.className = "gh-head";
  ghHead.innerHTML = "One-off Glory Hunters evos: adds a <b>4th</b> PlayStyle+ to the selected GH player (needs 3 PS+ already). Applied one at a time, always confirmed - never part of batch or Suggest.";
  var ghBar = document.createElement("div");
  ghBar.style.cssText = "display:flex;gap:6px;margin-top:8px";
  var ghLoadBtn = document.createElement("button");
  ghLoadBtn.type = "button"; ghLoadBtn.className = "gh-load"; ghLoadBtn.textContent = "↻ Load / refresh";
  ghBar.appendChild(ghLoadBtn);
  var ghList = document.createElement("div"); ghList.className = "gh-list";
  var ghNote = document.createElement("div"); ghNote.className = "gh-note";
  ghBox.appendChild(ghHead); ghBox.appendChild(ghBar); ghBox.appendChild(ghList); ghBox.appendChild(ghNote);
  ghSection.appendChild(ghToggle); ghSection.appendChild(ghBox);

  var ghOpen = false, ghEvos = [], ghLoading = false;
  function updateGhToggle() { ghToggle.textContent = (ghOpen ? "▾ " : "▸ ") + "GH 4th PlayStyle+ (one-off)" + (ghEvos.length ? " (" + ghEvos.length + ")" : ""); }
  ghToggle.addEventListener("click", function () {
    ghOpen = !ghOpen;
    ghBox.style.display = ghOpen ? "block" : "none";
    if (ghOpen && !ghEvos.length) { loadGH(); } else { renderGHList(); }
    updateGhToggle();
  });
  ghLoadBtn.addEventListener("click", function () { loadGH(); });

  // loadGH(): best-effort load the Rewards category, then list the GH-4th evos. Guarded so
  // overlapping calls (e.g. auto-load on select + the toggle) can't stack requests.
  async function loadGH() {
    if (ghLoading) return;
    ghLoading = true;
    ghNote.textContent = "Loading GH 4th evos...";
    try { ghEvos = await loadRewardEvos(); } catch (e) { ghEvos = rewardEvosFromCache(); }
    ghLoading = false;
    updateGhToggle();
    renderGHList();
  }
  // updateGhVisibility(): show the WHOLE GH-4th section ONLY when the active player is an
  // eligible Glory Hunters card (right rarity + exactly 3 PS+); hide it entirely otherwise.
  // Loads the evo list the first time it becomes visible. Called from renderEvos (every
  // select), so the section appears/disappears as you click through players.
  function updateGhVisibility() {
    var show = eligGH(state.player);
    ghSection.style.display = show ? "" : "none";
    if (show && !ghEvos.length && !ghLoading) { loadGH(); }
  }
  // renderGHList(): draw one tappable tile per GH-4th evo. Tiles are only enabled when a
  // single player is the active pick (not a multi-player batch) and no run is in progress.
  // eligGH(it): the GH-4th eligibility gate - a Glory Hunters card that already has EXACTLY
  // 3 PlayStyle+ (so applying adds the 4th). Anything else keeps the chips disabled. Matched
  // on the rarity NAME containing "Glory Hunter" (covers Glory Hunters + Glory Hunters Red).
  // The game is still the final enforcement layer; this just prevents obvious mistakes.
  function eligGH(it) { return !!it && /glory hunter/i.test(rarityName(it)) && numPlus(it) === 3; }

  function renderGHList() {
    ghList.innerHTML = "";
    var it = state.player;
    if (!ghEvos.length) { ghNote.textContent = "No GH 4th evos found. Open Evolutions -> Rewards in the app, then click Load / refresh."; return; }
    var many = state.batch.size > 1;
    var canApply = eligGH(it) && !many && !state.running;
    // Explain exactly why the chips are enabled or disabled, so it's never a mystery.
    ghNote.textContent =
      !it ? "Select a Glory Hunters player (with 3 PS+) first." :
      many ? "Batch is active - GH 4th applies to one player, so untick the batch first." :
      !/glory hunter/i.test(rarityName(it)) ? (playerName(it) + " isn't a Glory Hunters card - GH 4th only applies to Glory Hunters items.") :
      numPlus(it) !== 3 ? (playerName(it) + " has " + numPlus(it) + " PS+ - GH 4th needs a card with exactly 3 PS+ already.") :
      ("Tap one to add it to " + playerName(it) + " as a 4th PlayStyle+. Confirmed (one-off) before applying.");
    ghEvos.forEach(function (evo) {
      var trait = evo.psp ? (evo.psp.r - TRAIT_OFFSET) : null;
      var label = (evo.name || "").replace(/^\s*GH\s*4th\s*/i, "");   // show just the PS+ name; the section header says "GH 4th"
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "gh-tile" + (canApply ? "" : " dis");
      tile.disabled = !canApply;
      tile.innerHTML = (trait != null ? "<i class='ico icon_icontrait" + trait + "'></i>" : "") + "<span>" + esc(label) + "</span>";
      tile.title = "Apply " + esc(evo.name) + " to the selected player (one-off)";
      tile.addEventListener("click", function () { runGHApply(evo); });
      ghList.appendChild(tile);
    });
  }
  // runGHApply(evo): apply ONE GH-4th evo to the active player. Explicit confirm first
  // (one-off, can't be undone). Same state-safe refresh the normal apply uses.
  async function runGHApply(evo) {
    if (state.running) return;
    var it = state.player;
    if (!it) { status.textContent = "Select a Glory Hunters player first."; return; }
    if (state.batch.size > 1) { status.textContent = "GH 4th applies to one player - clear the batch first."; return; }
    if (!eligGH(it)) { status.textContent = "GH 4th needs a Glory Hunters card with exactly 3 PlayStyle+ already."; return; }
    var psName = evo.psp ? evo.psp.n : evo.name;
    if (!window.confirm(
      "Apply " + evo.name + " to " + playerName(it) + "?\n\n" +
      "This spends your ONE-OFF " + psName + " evo and adds it as a 4th PlayStyle+.\n" +
      "The player must be a Glory Hunters card that already has 3 PlayStyle+.\n\n" +
      "This cannot be undone. Continue?")) return;
    state.running = true; state.abort = false; setRunning(true);
    status.textContent = "Applying " + evo.name + " to " + playerName(it) + "...";
    var itemId = it.id, prevCount = currentPlayStyles(it).length, failMsg = "";
    try { await applyRewardEvo(evo.slotId, itemId); }
    catch (e) { failMsg = errMsg(e); }
    refreshClub();
    if (!failMsg) {
      // Same retry-poll the single-apply flow uses: the grant can lag the call, so re-pull
      // the club until this player's PlayStyle count grows (or we run out of tries).
      for (var att = 0; att < 4; att++) {
        try { await loadFullClub(); } catch (e) {}
        var fresh = findPlayerById(itemId); if (fresh) state.player = fresh;
        if (state.player && currentPlayStyles(state.player).length > prevCount) {
          rememberFresh(state.player);   // the grant is visible - pin it so a later club load can't lose it
          break;
        }
        if (att < 3) { status.textContent = "Waiting for the grant to register..."; await sleep(700); }
      }
    }
    renderPreview(); renderEvos(); renderPlayers();
    if (currentMode() === "mobile") renderWizStep();
    state.running = false; setRunning(false);
    loadGH();   // the applied slot is now used - refresh the list
    status.textContent = failMsg ? ("GH 4th failed: " + failMsg) : (evo.name + " applied to " + playerName(state.player || it) + ".");
  }
  updateGhToggle();

  // ---- STEP 1.6 apply loop -------------------------------------------------
  // sleep(ms): a small awaitable pause, so we don't fire calls back-to-back.
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Readable reasons for the app's error codes (from the reference script).
  var CODE = { 458: "captcha required", 460: "ineligible (already has it, maxed, or rarity/OVR not allowed)", 461: "permission denied", 426: "feature disabled", 470: "not enough currency" };
  // errMsg(e): turn a rejected service response into a short human reason.
  function errMsg(e) {
    if (!e) return "?";
    var code = (e.error && e.error.code) || e.status;
    if (code && CODE[code]) return code + " - " + CODE[code];
    if (e.error && e.error.message) return ((e.error.code || "") + " " + e.error.message).trim();
    return code ? "status=" + code : (e.message || String(e));
  }
  // refreshClub(): mark club data dirty so the app's own views redraw without a
  // page reload (mirrors what the app does after its own apply). The apply call
  // already flags Academy.requiresHubCall; we also nudge the club item pile.
  function refreshClub() {
    try {
      var pile = (window.ItemPile && window.ItemPile.CLUB != null) ? window.ItemPile.CLUB : 7;
      window.repositories.Item.setDirty(pile);
      window.repositories.Academy.requiresHubCall = true;
    } catch (e) {}
  }
  // findPlayerById(id): re-locate the player after a run so the preview reflects
  // its new PlayStyles. First checks our loaded snapshot (state.clubItems); if it's
  // not there (e.g. a card just re-added to the club that our snapshot missed), falls
  // back to reading the app's OWN live club collection directly.
  function findPlayerById(id) {
    var hit = getClubPlayers().filter(function (p) { return p.id === id; })[0];
    if (hit) return hit;
    try {
      var c = window.repositories.Item.getClub();
      var raw = (c && c.items && typeof c.items.values === "function") ? Array.from(c.items.values()) : [];
      return raw.filter(function (p) { try { return p && p.id === id && p.isPlayer && p.isPlayer(); } catch (e) { return false; } })[0];
    } catch (e) { return undefined; }
  }

  // ---- FRESH-CARD OVERRIDES --------------------------------------------------
  // THE PROBLEM this solves (the "I applied a PlayStyle but the Lineup doesn't show it" bug):
  // services.Club.search serves the club FROM THE APP'S OWN IN-MEMORY STORE, and that store
  // can keep handing back the card as it was BEFORE our evo landed. loadFullClub() used to
  // finish with a flat "state.clubItems = all", so any of those stale copies would silently
  // overwrite the freshly-graded card we'd just planted, and the PS+ icons would vanish from
  // the list. It only bit SOMETIMES because it's a race: the background club sweep that runs
  // when the panel opens is slow (slower still on a phone), so whether it lands before or
  // after your apply is pure timing.
  //
  // THE FIX: whenever the server hands us a fresh copy of a card (the "updatedItem" in its
  // reply to our own apply/remove call - the most authoritative thing we ever see), we keep
  // it in state.fresh. Every club load then merges those overrides back OVER its results, so
  // a stale search can never undo a change we know happened.
  //
  // An override is dropped when it's no longer needed:
  //   - the freshly-loaded copy matches it PlayStyle-for-PlayStyle (the store has caught up), or
  //   - a COMPLETE club load doesn't contain that card at all (it genuinely left the club, e.g.
  //     fully reverted or sold), or
  //   - you call FC26.clearFresh() from the Console (manual escape hatch).

  // psSig(it): a short text "fingerprint" of a card's PlayStyles, e.g. "4+|9|17". Sorted so
  // the same set always produces the same string, which lets us compare two copies of a card
  // with one === instead of walking the lists.
  function psSig(it) {
    try {
      return currentPlayStyles(it).map(function (p) { return p.traitId + (p.isIcon ? "+" : ""); }).sort().join("|");
    } catch (e) { return ""; }
  }

  // rememberFresh(item): record this card as the freshest copy we know of.
  function rememberFresh(item) {
    if (!item || item.id == null) return;
    try { state.fresh.set(item.id, item); } catch (e) {}
  }
  // forgetFresh(id): stop overriding this card (it left the club, or the club caught up).
  function forgetFresh(id) { try { state.fresh["delete"](id); } catch (e) {} }

  // mergeFresh(list, complete): overlay our known-fresh cards on a just-loaded club list.
  //   list     = the players the club search returned
  //   complete = true when that search reported it had retrieved the WHOLE club
  // Returns the list to actually keep. Note we only ever REPLACE an entry that's already in
  // the list - we never add a card back in, so a sold/consumed player can't reappear as a ghost.
  function mergeFresh(list, complete) {
    if (!state.fresh || !state.fresh.size) return list;
    var seenIds = {};
    for (var i = 0; i < list.length; i++) {
      var row = list[i]; if (!row || row.id == null) continue;
      seenIds[row.id] = 1;
      var override = state.fresh.get(row.id);
      if (!override) continue;
      if (psSig(row) === psSig(override)) { forgetFresh(row.id); continue; }  // store caught up - override no longer needed
      list[i] = override;                                                      // stale copy - keep OUR fresher card
    }
    // On a complete load, any override whose card isn't in the club any more is dead weight.
    if (complete) {
      Array.from(state.fresh.keys()).forEach(function (id) { if (!seenIds[id]) forgetFresh(id); });
    }
    return list;
  }

  // upsertClubItem(item): drop a fresh item entity into our snapshot (state.clubItems),
  // replacing the old copy with the same id (or appending if new). We use this to plant
  // the freshly-graded card the apply call hands back, so the picker/preview update WITHOUT
  // waiting on a club re-search (see applyUpdatedItem below). It ALSO records the card as a
  // fresh-card override, so a later club load can't quietly undo it (see above).
  function upsertClubItem(item) {
    if (!item || item.id == null) return;
    rememberFresh(item);
    // If our snapshot is empty/thin (common on mobile, where the full club can be slow to
    // load and the list is being served from the app's OWN collection instead), seed it from
    // that collection FIRST. Otherwise pushing the single fresh card would collapse the list
    // to one player and hide everyone else.
    if (!state.clubItems || !state.clubItems.length) {
      try {
        var c = window.repositories.Item.getClub();
        state.clubItems = (c && c.items && typeof c.items.values === "function") ? Array.from(c.items.values()) : (state.clubItems || []);
      } catch (e) { state.clubItems = state.clubItems || []; }
    }
    for (var i = 0; i < state.clubItems.length; i++) {
      if (state.clubItems[i] && state.clubItems[i].id === item.id) { state.clubItems[i] = item; return; }
    }
    state.clubItems.push(item);
  }

  // applyUpdatedItem(res): the apply call (Academy.addItemToSlot) returns its result under
  // res.data, and the freshly-graded card is res.data.updatedItem (confirmed live - the
  // response's data keys are activeSlots/inactiveSlots/isMaximumNumberOfSlotsReached/
  // updatedItem/objectiveUpdates). That item ALREADY reflects the new PlayStyles, so we can
  // update our snapshot straight from it instead of hoping a club re-search returns fresh
  // data. Returns the item, or null if the response didn't carry one.
  function applyUpdatedItem(res) {
    try {
      var d = res && res.data;
      var it = d && (d.updatedItem || d.item);
      return (it && it.id != null) ? it : null;
    } catch (e) { return null; }
  }

  // makeClubCriteria(offset, count): build the app's search criteria object for
  // club players (one "page" starting at offset). Returns null if the app doesn't
  // expose UTSearchCriteriaDTO.
  function makeClubCriteria(offset, count) {
    var Ctor = window.UTSearchCriteriaDTO;
    if (!Ctor) return null;
    var c = new Ctor();
    try { c.type = (window.SearchType && window.SearchType.PLAYER) || "player"; } catch (e) {}
    try { c.count = count; } catch (e) {}
    try { c.offset = offset; } catch (e) {}
    return c;
  }

  // loadFullClub(): gather EVERY club player (not just the cached squad) into
  // state.clubItems, then redraw the picker. Read-only - it's the same search the
  // app's Club screen uses.
  //
  // How services.Club.search really behaves (discovered live):
  //  - FRESH load (club store still empty): it FETCHES from the server one page at a
  //    time and DOES respect offset/count - a single offset-0 call only returns the
  //    first ~90, so we MUST page with a rising offset to collect everyone.
  //  - Once the whole club is in the client store: it returns the ENTIRE club from
  //    memory and IGNORES offset, so the next page just repeats (no NEW players) and
  //    reports `retrievedAll: true`-ish - that's our natural stop.
  //  - The store also fills in over a few seconds after load (slower on mobile), so the
  //    server may not have every page ready on the first pass.
  // The old bug was ending the sweep on the FIRST empty/duplicate page; on mobile a
  // transient blank page mid-fetch froze a partial club. So now we: (a) page by offset
  // accumulating UNIQUE players, (b) RETRY a blank/errored page a few times before
  // trusting it, (c) stop a pass only after TWO pages bring no new players (guards a
  // one-off duplicate), and (d) RE-SWEEP a few times until the club stops growing or the
  // app reports retrievedAll - so a still-filling club keeps getting picked up without a
  // manual reload.
  //
  // RE-ENTRANCY: a sweep can run for many seconds, so it's easy to start a second one on top
  // of the first (tapping "Reload club" twice, or a retry-poll firing while the panel's own
  // opening sweep is still going). Two sweeps both finishing with "state.clubItems = ..." is
  // a race with no winner. So loadFullClub() is a thin wrapper: if a sweep is already running
  // it hands back THAT sweep's promise, and everyone waiting simply shares the one result.
  // The wrapper also owns the button's busy state, so EVERY caller (your tap, the panel's
  // own opening load, and the retry-polls after an apply) shows the same visible progress.
  var clubLoadInFlight = null;                       // the promise of the running sweep, or null when idle
  function loadFullClub() {
    if (clubLoadInFlight) return clubLoadInFlight;   // already sweeping - join that run instead of starting another
    if (reloadDoneTimer) { clearTimeout(reloadDoneTimer); reloadDoneTimer = null; }   // cancel a lingering tick
    var startedAt = Date.now();
    setReloadBtn("busy", "Loading…");
    var p = sweepFullClub();
    clubLoadInFlight = p;
    // Whichever way it ends: clear the flag, then hold the spinner until RELOAD_MIN_MS has
    // passed (a warm club finishes far too fast to see), and only then show the outcome.
    var settle = function (ok) {
      if (clubLoadInFlight !== p) return;
      clubLoadInFlight = null;
      setTimeout(function () { finishReload(ok); }, Math.max(0, RELOAD_MIN_MS - (Date.now() - startedAt)));
    };
    p.then(function (v) { settle(v === true); }, function () { settle(false); });
    return p;
  }
  // finishReload(ok): show the outcome on the button, then settle everything back to calm.
  // On failure we leave the red error message alone and just re-enable the button.
  function finishReload(ok) {
    if (!ok) { setReloadBtn("idle"); return; }
    setReloadBtn("done");
    setClubStatus("Club loaded - " + getClubPlayers().length + " players.", "done");
    reloadDoneTimer = setTimeout(function () {
      reloadDoneTimer = null;
      setReloadBtn("idle");
      setClubStatus(clubReadyText());
    }, RELOAD_DONE_MS);
  }
  async function sweepFullClub() {
    var svc = getServices();
    var S = svc && svc.Club;
    if (!S || !S.search || !window.UTSearchCriteriaDTO) { setClubStatus("Club search unavailable on this page.", "err"); return; }
    var all = [], seen = {};                 // UNIQUE players kept across every pass (by item id)
    var SWEEP_CAP = 8, PAGE_CAP = 200, BLANK_RETRY_MAX = 4;
    var sweep = 0, lastTotal = -1, stableSweeps = 0, retrievedAll = false, hardFail = null;
    setClubStatus("Loading full club…", "busy");
    while (sweep++ < SWEEP_CAP) {
      var offset = 0, pageGuard = 0, blankRetries = 0, noNewStreak = 0, passDone = false;
      while (pageGuard++ < PAGE_CAP) {
        var crit = makeClubCriteria(offset, 91);
        if (!crit) { passDone = true; break; }
        var res;
        try { res = await awaitService(S.search(crit)); }
        catch (e) {
          if (blankRetries++ < BLANK_RETRY_MAX) { await sleep(500); continue; }   // transient error - retry same offset
          if (!all.length) hardFail = errMsg(e);
          passDone = true; break;
        }
        var inner = (res && res.response) || (res && res.data) || {};
        var items = inner.items || [];
        if (inner.retrievedAll === true) retrievedAll = true;
        if (!items.length) {
          if (retrievedAll) { passDone = true; break; }
          if (blankRetries++ < BLANK_RETRY_MAX) { await sleep(400); continue; }    // transient blank page - retry
          passDone = true; break;                                                  // genuinely empty -> end of this pass
        }
        blankRetries = 0;
        var added = 0;
        for (var i = 0; i < items.length; i++) { var it = items[i], id = it && it.id; if (id != null && !seen[id]) { seen[id] = 1; all.push(it); added++; } }
        offset += items.length;
        // Live count, both on the button and in the Lineup's status line, so you can SEE it working.
        setClubStatus("Loading full club… " + all.length + " players", "busy");
        setReloadBtn("busy", "Loading… " + all.length);
        if (retrievedAll) { passDone = true; break; }
        noNewStreak = (added === 0) ? (noNewStreak + 1) : 0;
        if (noNewStreak >= 2) { passDone = true; break; }   // two pages, no new players -> seen them all this pass
        await sleep(120);
      }
      if (hardFail && !all.length) { setClubStatus("Club load failed: " + hardFail, "err"); return; }
      if (retrievedAll) break;                              // app confirms the whole club is loaded
      if (all.length === lastTotal) { if (++stableSweeps >= 2) break; }   // total not growing across passes -> done
      else stableSweeps = 0;
      lastTotal = all.length;
      await sleep(500);                                     // give the still-filling club a moment, then sweep again
    }
    // Overlay any card we KNOW is fresher than what the search returned, so a stale copy from
    // the app's in-memory store can't wipe out an evo we just applied (see FRESH-CARD OVERRIDES).
    state.clubItems = mergeFresh(all, retrievedAll);
    // The active player may have just been swapped for its fresher copy in that merge - re-point
    // state.player at whatever is now in the list, so the preview and the Lineup never disagree.
    if (state.player && state.player.id != null) {
      var again = findPlayerById(state.player.id);
      if (again) state.player = again;
    }
    renderPlayers();
    try { renderMetaRating(); } catch (e) {}   // refresh the Meta rating list if it's open
    // If the Meta page is open on the Best XI tab, rebuild it now that the full club is in.
    // A fresh club invalidates the drafted boards AND the "who this moves" baseline order
    // (that's cached per position and is only valid for the club it was measured on).
    try { impactBaseline = { group: null, ids: null }; } catch (e0) {}
    try { if (state.metaPageOpen && metaView === "xi") { metaBoards = null; renderMetaPage(); } } catch (e) {}
    return true;   // success - loadFullClub's finishReload() shows the "✓ Club loaded" confirmation
  }

  // "claim & finish" toggle.
  var optRow = document.createElement("div");
  optRow.style.cssText = "margin-top:10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px";

  // Delay control: how long to wait BETWEEN each apply, in milliseconds. A bigger,
  // human-ish gap is safer for the account. (Claiming now happens automatically
  // after every apply - PlayStyle evos grant on apply, so there's no reason to
  // ever skip it, hence no toggle.)
  var delayWrap = document.createElement("label");
  delayWrap.style.cssText = "flex:none;display:flex;align-items:center;gap:5px;white-space:nowrap;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--field-border);border-radius:6px;padding:5px 9px";
  delayWrap.appendChild(document.createTextNode("delay"));
  var delayInput = document.createElement("input");
  delayInput.type = "number"; delayInput.value = "500"; delayInput.min = "0"; delayInput.step = "100";
  // Borderless so it reads as part of the chip ("DELAY 500 MS"), like the mockup.
  delayInput.style.cssText = "width:42px;padding:0;border:0;background:transparent;color:var(--ink);font-weight:700;font-size:11px;text-align:center;font-variant-numeric:tabular-nums";
  delayWrap.appendChild(delayInput);
  delayWrap.appendChild(document.createTextNode("ms"));
  optRow.appendChild(delayWrap);

  // Apply (green) and Stop (red) buttons - only one shows at a time.
  var applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply selected";
  applyBtn.style.cssText = "flex:1;min-width:140px;padding:10px;border:none;border-radius:7px;cursor:pointer;background:var(--apply);color:var(--apply-ink);font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase";
  applyBtn.addEventListener("click", runApply);

  // updateApplyBtn(): grey out "Apply selected" when nothing is ticked (there's nothing to
  // apply). You can still reach Review to manage an existing card; the button just can't fire.
  function updateApplyBtn() {
    if (!applyBtn) return;
    var none = state.selected.size === 0;
    applyBtn.disabled = none;
    applyBtn.style.opacity = none ? ".45" : "";
    applyBtn.style.cursor = none ? "not-allowed" : "pointer";
    applyBtn.title = none ? "Tick at least one PlayStyle in the Deck to apply." : "";
  }

  var stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";
  stopBtn.style.cssText = "flex:1;min-width:140px;padding:10px;border:none;border-radius:7px;cursor:pointer;background:#c0392b;color:#fff;font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase;display:none";
  stopBtn.addEventListener("click", function () { state.abort = true; status.textContent = "Stopping after current evo..."; });

  // setRunning(on): swap Apply <-> Stop while a run is in progress.
  function setRunning(on) {
    applyBtn.style.display = on ? "none" : "";
    stopBtn.style.display = on ? "" : "none";
  }

  // ---- apply animation + result summary ------------------------------------
  // A box under the buttons that shows the apply IN PROGRESS (a grid of the queued
  // PlayStyle tiles, each spinning then stamping a tick, one by one) and then the
  // RESULT SUMMARY (icon chips of what was added). Purely visual - same applies.
  var applyBox = document.createElement("div");
  applyBox.className = "fc26-apply";
  applyBox.style.display = "none";

  // buildApplyTiles(slotIds): one tile per queued evo, in apply order. Returns the
  // tile elements so runApply can flip each: (nothing) -> applying -> done/failed.
  function buildApplyTiles(slotIds) {
    applyBox.style.display = "block";
    applyBox.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "fc26-grid";
    var tiles = slotIds.map(function (sid) {
      var evo = byId(sid);
      var isPlus = evo && evo.kind === "PS+";
      var t = document.createElement("div");
      t.className = "fc26-ec" + (isPlus ? " psp" : "");
      var nm = evo ? evo.n.replace(/\+$/, "") : String(sid);
      t.innerHTML =
        "<i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + (evo ? evoTrait(evo) : "") + "'></i>" +
        "<div class='nm'>" + esc(nm) + "</div><span class='ap-badge'></span>";
      grid.appendChild(t);
      return t;
    });
    applyBox.appendChild(grid);
    return tiles;
  }

  // renderApplySummary(okList, failCount, name): the after-run card - a tick, the
  // count, and the added PlayStyles as chips that pop in (PS+ gold, basic emerald).
  function renderApplySummary(okList, failCount, name) {
    applyBox.style.display = "block";
    applyBox.innerHTML = "";
    var head = document.createElement("div");
    head.className = "ap-head";
    head.innerHTML =
      "<span class='tick'>✓</span><span>Added " + okList.length + " to <b>" + esc(name) + "</b></span>" +
      "<span class='sub'>" + (failCount || 0) + " failed</span>";
    applyBox.appendChild(head);
    var chipsWrap = document.createElement("div");
    chipsWrap.className = "ap-chips";
    var chipEls = okList.map(function (evo) {
      var isPlus = evo.kind === "PS+";
      var c = document.createElement("span");
      c.className = "ap-chip" + (isPlus ? " plus" : "");
      c.innerHTML = "<i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + evoTrait(evo) + "'></i>" + esc(evo.n.replace(/\+$/, ""));
      chipsWrap.appendChild(c);
      return c;
    });
    applyBox.appendChild(chipsWrap);
    if (!okList.length) {
      var none = document.createElement("div");
      none.className = "ap-fail";
      none.textContent = "Nothing was added.";
      applyBox.appendChild(none);
    }
    // (There used to be a mobile-only "← Back to players" button here. With the wizard down
    // to two tabs, the Lineup tab is always one tap away at the top of the screen, so the
    // button was a second way to do the same thing - and desktop never had it.)
    // Stagger the pop-in (non-blocking so the club refresh can run underneath).
    chipEls.forEach(function (c, i) { setTimeout(function () { c.classList.add("show"); }, 90 * i); });
  }

  // ---- STEP 2b batch apply -------------------------------------------------
  // runApply(): the Apply button's entry point. If any players are TICKED for batch
  // (state.batch), run the batch flow; otherwise run the classic single-player flow on
  // the previewed player. (Both are below.)
  function runApply() {
    if (state.running) return;
    if (state.batch.size >= 1) { return runBatch(); }
    return runSingle();
  }

  // ---- STEP 3 reset / remove PlayStyles ------------------------------------
  // runRemove(all): remove PlayStyles from the PREVIEWED player.
  //   all=false -> remove ONE (the game decides which; the API can't target a specific
  //                PlayStyle, so this is an "undo" of one upgrade).
  //   all=true  -> loop removeEvo until lastEvoRemoved (the card is fully reverted and
  //                leaves the club evo list). Confirmed first.
  // Same delay between calls, same Stop (via setRunning + state.abort), and the same
  // reload-then-repoll refresh apply uses - but here we wait for the count to CHANGE
  // (drop), or for the card to leave the club, rather than grow.
  async function runRemove(all) {
    if (state.running) return;
    var it = state.player;
    if (!it) { status.textContent = "Select a player first."; return; }
    if (!currentPlayStyles(it).length) { status.textContent = "This player has no PlayStyles to remove."; return; }
    // IMPORTANT wording: the game removes evo UPGRADES (newest first), which may be a
    // stat/skill boost, NOT necessarily a PlayStyle - and we can't target or peek. So we
    // always confirm and say "evo", not "PlayStyle".
    var msg = all
      ? "Clear ALL evo upgrades from " + playerName(it) + "?\n\nRemoves upgrades one at a time, newest first (PlayStyles AND any stat/skill upgrades), until the card fully reverts - it may leave your club evo list."
      : "Remove the LATEST evo upgrade from " + playerName(it) + "?\n\nThis removes whatever was applied most recently, which may be a stat/skill upgrade rather than a PlayStyle.";
    if (!window.confirm(msg)) return;
    state.running = true; state.abort = false; setRunning(true);
    applyBox.style.display = "none"; applyBox.innerHTML = "";   // clear any old apply/batch summary
    // Loader appended to the preview card (right under the reset buttons, so the spinner
    // sits next to the button you pressed). It's wiped when renderPreview() rebuilds the
    // card at the end.
    var loader = document.createElement("div");
    loader.className = "rm-load"; loader.style.marginTop = "10px";
    loader.innerHTML = "<span class='rm-spin'></span><span class='rm-txt'>" + (all ? "Clearing evos…" : "Removing evo…") + "</span>";
    // Show the spinner where the button that triggered it lives: the preview card on desktop,
    // but the Review "Manage this card" panel on mobile (the preview isn't in the DOM there).
    // Both are wiped by the re-render at the end (renderPreview / renderWizStep).
    // The preview card is now in the DOM in BOTH modes (desktop spotlight column, mobile
    // Build & Apply step), so the spinner always lands next to the button you pressed.
    var loaderHost = preview;
    loaderHost.appendChild(loader);
    function setLoad(t) { var el = loader.querySelector(".rm-txt"); if (el) el.textContent = t; }
    var id = it.id, removed = 0, guard = 0, maxIter = all ? 40 : 1, failMsg = "";  // 40 = generous backstop; lastEvoRemoved is the real stop
    var freshItem = null, cardLeftClub = false;
    while (guard++ < maxIter) {
      if (state.abort) break;
      setLoad((all ? "Clearing evos… " : "Removing evo… ") + removed + " removed");
      status.textContent = (all ? "Clearing evos" : "Removing evo") + "... " + removed;
      var res;
      try { res = await removeEvo(id); }
      catch (e) { failMsg = errMsg(e); break; }
      removed++;
      // Academy responses live under res.data (confirmed for apply); accept res.response too,
      // in case removal reports differently. updatedItem is the freshly-reverted card.
      var rd = (res && res.data) || (res && res.response) || {};
      var ru = applyUpdatedItem(res); if (ru && ru.id === id) freshItem = ru;
      var last = !!(rd.lastEvoRemoved);
      if (last) cardLeftClub = true;                            // final upgrade gone - the card reverts and leaves the club evo list
      if (!all || last) break;                                  // single removal, or reached the final one
      await sleep(Math.max(0, parseInt(delayInput.value, 10) || 0));
    }
    setLoad("Refreshing…");
    refreshClub();
    // A fully-reverted card leaves the club evo list altogether, so drop any fresh-card
    // override we were holding for it - the club's own answer is the right one from here.
    if (cardLeftClub) forgetFresh(id);
    // Prefer the reverted card the response handed back (data.updatedItem) - reliable, no
    // dependence on a club re-search. Fall back to reloading + polling only if we got nothing.
    var have = currentPlayStyles(it).length;
    if (freshItem && !cardLeftClub) {
      upsertClubItem(freshItem); state.player = freshItem;
    } else {
      for (var att = 0; att < 4; att++) {
        try { await loadFullClub(); } catch (e) {}
        if (freshItem && !cardLeftClub) { upsertClubItem(freshItem); state.player = freshItem; break; }
        var fresh = findPlayerById(id);
        state.player = fresh || null;
        if (!fresh || currentPlayStyles(fresh).length !== have) break;
        if (att < 3) { status.textContent = "Waiting for removal to register..."; await sleep(700); }
      }
    }
    state.selected = new Set();
    // renderPreview rebuilds the card (removing the loader); the status line reports the result.
    renderPreview(); renderEvos(); renderPlayers(); updateBatchUI();
    if (currentMode() === "mobile") renderWizStep();
    state.running = false; setRunning(false);
    status.textContent = failMsg
      ? ("Removed " + removed + ", then failed: " + failMsg)
      : ("Removed " + removed + " evo" + (removed === 1 ? "" : "s") + (state.player ? " from " + playerName(state.player) : "") + ".");
  }

  // planForPlayer(it, slotIds): decide, for ONE player, which of the selected evos can
  // actually be applied and which must be skipped - re-checked per player because caps
  // and owned styles differ. Mirrors the same rules as manual ticking (suggest()).
  //   - already owned (base or +)   -> skip "owned"
  //   - GK-only evo on a non-GK     -> skip "GK-only"
  //   - that player's cap is full   -> skip "PS+ full" / "full"
  // Returns { toApply:[{slotId,evo}], skipped:[{evo,reason}] }.
  function planForPlayer(it, slotIds) {
    var gk = isGKPlayer(it);
    var plusLeft = CAP_PLUS - numPlus(it);      // PS+ slots still open on THIS player
    var baseLeft = CAP_BASIC - numBasic(it);    // basic slots still open on THIS player
    var toApply = [], skipped = [];
    slotIds.forEach(function (sid) {
      var evo = byId(sid);
      if (!evo) return;
      if (hasEvo(it, evo)) { skipped.push({ evo: evo, reason: "owned" }); return; }
      if (evo.g && !gk) { skipped.push({ evo: evo, reason: "GK-only" }); return; }
      if (evo.kind === "PS+") { if (plusLeft <= 0) { skipped.push({ evo: evo, reason: "PS+ full" }); return; } plusLeft--; }
      else { if (baseLeft <= 0) { skipped.push({ evo: evo, reason: "full" }); return; } baseLeft--; }
      toApply.push({ slotId: sid, evo: evo });
    });
    return { toApply: toApply, skipped: skipped };
  }

  // buildBatchUI(targets, slotIds): draw one section per batched player (header + a grid
  // of the tiles that WILL be applied + a "skipped" note), and return the structure the
  // loop animates: [{player, rows:[{slotId,evo,tileEl}], statEl, skippedCount}].
  function buildBatchUI(targets, slotIds) {
    applyBox.style.display = "block";
    applyBox.innerHTML = "";
    return targets.map(function (it) {
      var plan = planForPlayer(it, slotIds);
      var sec = document.createElement("div"); sec.className = "bx-sec";
      var head = document.createElement("div"); head.className = "bx-head";
      head.innerHTML =
        "<span class='bx-rate'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        "<span class='bx-name'>" + esc(playerName(it)) + "</span>" +
        "<span class='bx-stat'>queued " + plan.toApply.length + "</span>";
      sec.appendChild(head);
      var rows = [];
      if (plan.toApply.length) {
        var grid = document.createElement("div"); grid.className = "fc26-grid";
        plan.toApply.forEach(function (r) {
          var evo = r.evo, isPlus = evo.kind === "PS+";
          var t = document.createElement("div"); t.className = "fc26-ec" + (isPlus ? " psp" : "");
          t.innerHTML =
            "<i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + evoTrait(evo) + "'></i>" +
            "<div class='nm'>" + esc(evo.n.replace(/\+$/, "")) + "</div><span class='ap-badge'></span>";
          grid.appendChild(t);
          rows.push({ slotId: r.slotId, evo: evo, tileEl: t });
        });
        sec.appendChild(grid);
      } else {
        var no = document.createElement("div"); no.className = "bx-none"; no.textContent = "Nothing to apply (owned / full / GK scope).";
        sec.appendChild(no);
      }
      if (plan.skipped.length) {
        var sk = document.createElement("div"); sk.className = "bx-skip";
        sk.textContent = "skipped " + plan.skipped.length + ": " + plan.skipped.map(function (s) { return s.evo.n.replace(/\+$/, "") + " (" + s.reason + ")"; }).join(", ");
        sec.appendChild(sk);
      }
      applyBox.appendChild(sec);
      return { player: it, rows: rows, statEl: head.querySelector(".bx-stat"), skippedCount: plan.skipped.length };
    });
  }

  // runBatch(): apply the selected evos to EVERY ticked player, one player at a time,
  // one evo at a time (await each, then claim). Per-player owned/cap/scope re-check means
  // a style another player already has is reported as "skipped", not "failed". Same delay
  // between every call, same Stop, same state-safe club refresh at the end.
  async function runBatch() {
    var slotIds = Array.from(state.selected);
    if (!slotIds.length) { status.textContent = "Nothing selected."; return; }
    var targets = Array.from(state.batch.values());
    if (!targets.length) { status.textContent = "No players ticked."; return; }
    state.running = true; state.abort = false; setRunning(true);
    var prevCounts = {};                                   // PlayStyle counts before, per player (to detect the grants landing)
    targets.forEach(function (t) { prevCounts[t.id] = currentPlayStyles(t).length; });
    var freshById = {};                                    // freshest card per player from the apply responses (data.updatedItem)
    var sections = buildBatchUI(targets, slotIds);
    var totalSteps = sections.reduce(function (n, s) { return n + s.rows.length; }, 0);
    var step = 0, totalOk = 0, totalFail = 0;
    for (var pi = 0; pi < sections.length && !state.abort; pi++) {
      var sec = sections[pi], it = sec.player, okC = 0, failC = 0;
      for (var i = 0; i < sec.rows.length; i++) {
        if (state.abort) break;
        var row = sec.rows[i], tile = row.tileEl;
        if (tile) tile.classList.add("applying");
        status.textContent = "[" + (pi + 1) + "/" + sections.length + "] " + playerName(it) + " - " + row.evo.n + " ...";
        try {
          var bres = await applyEvo(row.slotId, it.id);               // adds + grants the PlayStyle
          var bui = applyUpdatedItem(bres);                           // the response's freshly-graded card
          if (bui && bui.id === it.id) freshById[it.id] = bui;        // keep the latest for this player
          try { await claimEvo(row.slotId); } catch (ce) { console.warn("[FC26] claim skipped", ce); }
          okC++; totalOk++;
          if (tile) { tile.classList.remove("applying"); tile.classList.add("done"); var b = tile.querySelector(".ap-badge"); if (b) b.textContent = "✓"; }
        } catch (e) {
          failC++; totalFail++;
          if (tile) { tile.classList.remove("applying"); tile.classList.add("failed"); var bf = tile.querySelector(".ap-badge"); if (bf) bf.textContent = "✕"; }
          console.warn("[FC26] apply failed", playerName(it), row.evo.n, e);
        }
        step++;
        if (step < totalSteps && !state.abort) { await sleep(Math.max(0, parseInt(delayInput.value, 10) || 0)); }
      }
      if (sec.statEl) sec.statEl.textContent = okC + " added" + (failC ? ", " + failC + " failed" : "") + (sec.skippedCount ? ", " + sec.skippedCount + " skipped" : "");
      if (okC > 0) { setRarityEligible(it.rareflag, true); }        // a success proves this rarity is evo-eligible
    }
    // Overall banner at the top of the box.
    var banner = document.createElement("div"); banner.className = "bx-banner";
    banner.innerHTML = "<span class='tick'>✓</span><span>Batch: <b>" + totalOk + "</b> added across " + sections.length + (sections.length === 1 ? " player" : " players") +
      (totalFail ? ", " + totalFail + " failed" : "") + (state.abort ? " (stopped)" : "") + "</span>";
    applyBox.insertBefore(banner, applyBox.firstChild);
    // (The mobile-only "← Back to players" button was dropped here too - see renderApplySummary.)
    refreshClub();
    // The apply responses handed back each player's freshly-graded card (data.updatedItem),
    // already carrying the new PlayStyles - plant them straight into our snapshot so the list
    // and roll-call update WITHOUT depending on a club re-search (which caches the whole club
    // and can keep serving pre-grant copies). Only if NO response gave us a usable fresh item
    // do we fall back to the old reload-until-a-count-grows poll.
    var haveFresh = false;
    targets.forEach(function (t) { var f = freshById[t.id]; if (f) { upsertClubItem(f); haveFresh = true; } });
    if (totalOk > 0 && !haveFresh) {
      for (var att = 0; att < 4; att++) {
        try { await loadFullClub(); } catch (e) {}
        var grew = false;
        // Pin EVERY player whose grant is now visible (not just the first), so a later club
        // load can't lose any of them - then stop retrying as soon as at least one landed.
        for (var ti = 0; ti < targets.length; ti++) {
          var fr = findPlayerById(targets[ti].id);
          if (fr && currentPlayStyles(fr).length > (prevCounts[targets[ti].id] || 0)) { rememberFresh(fr); grew = true; }
        }
        if (grew) break;
        if (att < 3) { status.textContent = "Waiting for grants to register..."; await sleep(700); }
      }
    }
    // Re-point active player + batch entries to the fresh club items (prefer the response's copy).
    if (state.player) { var fp = freshById[state.player.id] || findPlayerById(state.player.id); if (fp) state.player = fp; }
    var newBatch = new Map();
    targets.forEach(function (t) { var f = freshById[t.id] || findPlayerById(t.id) || t; newBatch.set(f.id, f); });
    state.batch = newBatch;
    state.selected = new Set();                                       // applied ones are now owned
    renderPreview(); renderEvos(); renderPlayers(); updateBatchUI();
    if (currentMode() === "mobile") renderWizStep();
    state.running = false; setRunning(false);
    status.textContent = "Batch done: " + totalOk + " added, " + totalFail + " failed.";
  }

  // runSingle(): the classic single-player queue (unchanged). For each ticked evo: await
  // applyEvo, then claimEvo, pause, report progress. A failure on one evo is logged and
  // the run continues. Nothing is faked - every call goes through the app's own Academy
  // service. At the end we refresh so the new PlayStyles show without a page reload.
  async function runSingle() {
    var it = state.player;
    if (!it) { status.textContent = "Select a player first."; return; }
    var slotIds = Array.from(state.selected);
    if (!slotIds.length) { status.textContent = "Nothing selected."; return; }
    state.running = true; state.abort = false; setRunning(true);
    var itemId = it.id, rareflag = it.rareflag, ok = 0, fail = 0;
    var prevCount = currentPlayStyles(it).length;   // PlayStyles before this run (to detect the grant landing)
    var tiles = buildApplyTiles(slotIds);   // the animated queue under the buttons
    var okList = [];                         // evos that succeeded (for the summary)
    var freshItem = null;                    // the freshest card the apply responses hand back (data.updatedItem)
    for (var i = 0; i < slotIds.length; i++) {
      if (state.abort) { status.textContent = "Stopped at " + i + "/" + slotIds.length + "."; break; }
      var slotId = slotIds[i];
      var evo = byId(slotId);
      var tile = tiles[i];                                    // this evo's animated tile
      var label = "[" + (i + 1) + "/" + slotIds.length + "] " + (evo ? evo.n : slotId);
      if (tile) tile.classList.add("applying");               // spin while it applies
      status.textContent = label + " ...";
      try {
        var ares = await applyEvo(slotId, itemId);            // adds + grants the PlayStyle
        var ui = applyUpdatedItem(ares);                       // the response's freshly-graded card
        if (ui && ui.id === itemId) freshItem = ui;            // keep the latest (reflects every apply so far)
        // Always try to claim/finish (best-effort). For PlayStyle evos the grant
        // already happened on apply, so claim commonly returns 460 - that's harmless
        // and we just carry on.
        try { await claimEvo(slotId); }
        catch (ce) { console.warn("[FC26] claim skipped (usually fine for PlayStyle evos)", label, ce); }
        ok++; if (evo) okList.push(evo);                       // remember for the summary
        if (tile) { tile.classList.remove("applying"); tile.classList.add("done"); var b = tile.querySelector(".ap-badge"); if (b) b.textContent = "✓"; }
        status.textContent = "OK " + label;
        console.log("[FC26] applied", label);
      } catch (e) {
        fail++;
        if (tile) { tile.classList.remove("applying"); tile.classList.add("failed"); var bf = tile.querySelector(".ap-badge"); if (bf) bf.textContent = "✕"; }
        status.textContent = "FAILED " + label + " - " + errMsg(e);
        console.warn("[FC26] apply failed", label, e);
      }
      if (i < slotIds.length - 1 && !state.abort) {                     // breathe between calls
        var delayMs = Math.max(0, parseInt(delayInput.value, 10) || 0); // read the box each time
        await sleep(delayMs);
      }
    }
    // Swap the animated tiles for the result summary (chips of what was added).
    renderApplySummary(okList, fail, playerName(it));
    // Self-learn: any success proves this card's rarity CAN receive PlayStyles, so
    // add it to the evo-eligible list (persisted). Grows the list over time.
    if (ok > 0) { setRarityEligible(rareflag, true); }
    refreshClub();                                            // also nudge the app's own views
    // The apply call HANDS BACK the freshly-graded card (data.updatedItem), already carrying
    // the new PlayStyles - so we trust that directly and plant it in our snapshot. This is the
    // reliable path: it does NOT depend on a club re-search returning fresh data (that search
    // caches the whole club in memory and can keep serving the pre-grant copy, which was the
    // bug where applied evos didn't show up in the list). Only if the response somehow gave us
    // no usable item do we fall back to the old poll-a-fresh-pull-until-it-grows loop.
    if (ok > 0) {
      if (freshItem && currentPlayStyles(freshItem).length > prevCount) {
        upsertClubItem(freshItem); state.player = freshItem;  // list + preview now reflect the grant, no reload needed
      } else {
        for (var att = 0; att < 4; att++) {
          try { await loadFullClub(); } catch (e) {}          // fresh pull (also redraws the list)
          if (freshItem) { upsertClubItem(freshItem); state.player = freshItem; }
          var fresh = findPlayerById(itemId);
          if (fresh && currentPlayStyles(fresh).length >= currentPlayStyles(state.player || fresh).length) state.player = fresh;
          var nowCount = state.player ? currentPlayStyles(state.player).length : prevCount;
          if (nowCount > prevCount) {                         // grant is now visible - stop retrying
            rememberFresh(state.player);                      // pin it, so a later club load can't lose it again
            break;
          }
          if (att < 3) { status.textContent = "Waiting for the grant to register..."; await sleep(700); }
        }
      }
    } else {
      try { var f0 = findPlayerById(itemId); if (f0) state.player = f0; } catch (e) {}
    }
    state.selected = new Set();                               // applied ones are now owned
    renderPreview(); renderEvos(); renderPlayers();           // redraw the updated player everywhere
    if (currentMode() === "mobile") renderWizStep();          // force the wizard step to repaint too
    state.running = false; setRunning(false);
    status.textContent = "Done: " + ok + " ok, " + fail + " failed.";
  }

  // Inject the evo-grid styles once (id-guarded so re-running can't duplicate).
  // Scoped under #fc26-panel so we never affect the app's own styling.
  if (!document.getElementById("fc26-style")) {
    var st = document.createElement("style");
    st.id = "fc26-style";
    st.textContent =
      // ---- THEME TOKENS (default = "UCL Night" frosted glass) ------------------
      // Every element below and every inline style in this file reads colours via
      // var(--name). The LIVE source of truth for those values is the THEMES map near
      // the top of this file: applyTheme() writes the chosen theme's tokens as inline
      // props on #fc26-panel, which override the block below. This block just mirrors
      // the DEFAULT theme (UCL Night) so the panel looks right even before applyTheme
      // runs. To change colours, edit THEMES (not here). Values are translucent (rgba)
      // on purpose: the panel is frosted glass, so the app shows through, blurred.
      "#fc26-panel{" +
        "--radius:12px;" +                                          // corner rounding
        "--bg:rgba(13,20,36,.58);" +                                // panel glass tint (deep navy)
        "--border:rgba(120,180,255,.16);" +                         // hairline edges
        "--header-bg:rgba(255,255,255,.05);" +                      // title bar wash
        "--ink:#e8f2ff;--muted:rgba(160,200,255,.72);--title:#ffffff;" + // text: normal / dim / heading
        "--accent:#38e1ff;--accent-ink:#06131f;" +                  // cyan accent + dark text for on-accent
        "--gold:#ffd76a;" +                                         // ratings + PlayStyle+ (FUT gold)
        "--btn:rgba(255,255,255,.10);--btn-ink:#cfe6ff;" +          // secondary buttons
        "--btnx:rgba(255,120,120,.14);--btnx-ink:#ffc2c2;" +        // close (×) button
        "--field:rgba(0,0,0,.30);--field-border:rgba(120,180,255,.18);" + // inputs / dropdowns
        "--card:rgba(255,255,255,.05);--card-border:rgba(120,180,255,.14);" + // sub-panels (rows, preview)
        "--sel:rgba(56,225,255,.16);" +                             // selected / highlighted fill
        "--tab:rgba(255,255,255,.05);--icon:#dcf0ff;" +             // inactive tab + evo icon colour
        "--tile:rgba(255,255,255,.05);--tile-border:rgba(120,180,255,.16);" + // basic evo tiles
        "--tile-psp:rgba(255,215,106,.12);--tile-psp-border:rgba(255,215,106,.34);" + // PS+ tiles (gold tint)
        "--apply:rgba(56,225,255,.92);--apply-ink:#06131f;" +      // Apply button
        "--shadow:0 16px 40px rgba(0,0,0,.55);" +                   // drop shadow
      "}" +
      // Theme picker in the header: keep the open dropdown readable on every OS, and
      // hide it when the panel is minimized to a pill (no room).
      "#fc26-panel .fc26-theme option{color:#111827;background:#ffffff}" +
      "#fc26-panel.fc26-min .fc26-theme{display:none}" +
      "#fc26-panel.fc26-min .fc26-reset,#fc26-panel.fc26-mobile .fc26-reset{display:none}" +
      // Broadcast section labels (LINEUP / STYLE DECK): uppercase, letter-spaced, with a
      // trailing hairline, like a lower-third caption.
      "#fc26-panel .fc26-lab{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}" +
      "#fc26-panel .fc26-lab::after{content:'';flex:1;height:1px;background:var(--border)}" +
      // Lineup rows: transparent card, an accent left-edge on hover / when selected.
      "#fc26-panel .pl-row{display:flex;align-items:center;gap:8px;padding:6px 7px;border-radius:5px;cursor:pointer;border-left:3px solid transparent;background:var(--card)}" +
      "#fc26-panel .pl-row:hover{border-left-color:var(--accent)}" +
      "#fc26-panel .pl-row.on{border-left-color:var(--accent);background:var(--sel)}" +
      // ---- preview card (selected player) --------------------------------------
      // Header line: name + OVR + optional GK badge.
      // Spotlight hero: giant rating number + name/sub line (broadcast lower-third).
      "#fc26-panel .pv-hero{display:flex;align-items:center;gap:12px}" +
      "#fc26-panel .pv-numwrap{flex:none;display:flex;flex-direction:column;align-items:center;gap:5px}" +
      "#fc26-panel .pv-num{font-weight:800;font-size:46px;line-height:.9;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .pv-jr{font-size:9px;font-weight:800;letter-spacing:.04em;color:var(--accent-ink);background:var(--accent);border-radius:999px;padding:2px 7px;line-height:1.2;white-space:nowrap;text-align:center}" +
      "#fc26-panel .pv-herowho{min-width:0}" +
      "#fc26-panel .pv-nm{display:flex;align-items:center;gap:6px;font-weight:800;font-size:17px;color:var(--ink);line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .pv-gk{flex:none;color:var(--accent);font-size:9px;border:1px solid var(--accent);border-radius:4px;padding:0 4px}" +
      "#fc26-panel .pv-sub{color:var(--muted);font-size:11px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .pv-metaline{color:var(--muted);font-size:10px;opacity:.7;margin-top:4px}" +
      // Capacity meters: skewed broadcast segments, one per slot, filled up to "used"
      // (PS+ segments gold, Basic segments accent).
      "#fc26-panel .pv-meters{display:flex;flex-direction:column;gap:9px;margin-top:12px}" +
      "#fc26-panel .pv-meter{min-width:0}" +
      "#fc26-panel .pv-mlab{display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}" +
      "#fc26-panel .pv-mlab b{color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:0}" +
      "#fc26-panel .pv-segrow{display:flex;gap:3px;padding:0 2px}" +
      "#fc26-panel .pv-seg{height:9px;flex:1;background:rgba(255,255,255,.12);transform:skewX(-14deg);border-radius:1px}" +
      "#fc26-panel .pv-meter.plus .pv-seg.on{background:var(--gold)}" +
      "#fc26-panel .pv-meter.basic .pv-seg.on{background:var(--accent)}" +
      // Face-stats grid (3x2). minmax(0,1fr) columns + min-width:0 cells keep the numbers
      // INSIDE the pane on every width - they wrap/shrink, never overflow off the edge.
      "#fc26-panel .pv-faces{margin-top:13px}" +
      "#fc26-panel .pv-fl{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}" +
      "#fc26-panel .pv-fgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}" +
      "#fc26-panel .pv-fstat{display:flex;align-items:baseline;justify-content:space-between;gap:4px;min-width:0;background:rgba(0,0,0,.22);border:1px solid var(--card-border);border-radius:8px;padding:6px 8px}" +
      "#fc26-panel .pv-fk{font-size:9px;font-weight:800;letter-spacing:.05em;color:var(--muted)}" +
      "#fc26-panel .pv-fv{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}" +
      "#fc26-panel .pv-fv.hi{color:var(--accent)}" +
      "#fc26-panel .pv-fv.mid{color:var(--gold)}" +
      "#fc26-panel .pv-fv.reg{color:var(--ink)}" +
      "#fc26-panel .pv-fv.lo{color:var(--muted)}" +
      // Grouped chips: current PlayStyles, split into a PS+ row and a Basic row.
      "#fc26-panel .pv-group{margin-top:12px}" +
      "#fc26-panel .pv-gl{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}" +
      "#fc26-panel .pv-chips{display:flex;flex-wrap:wrap;gap:5px}" +
      "#fc26-panel .pv-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px 4px 6px;border-radius:999px;font-size:11px;background:var(--tile);border:1px solid var(--tile-border);color:var(--ink)}" +
      "#fc26-panel .pv-chip.plus{background:var(--tile-psp);border-color:var(--tile-psp-border);color:#ffe7b0}" +
      "#fc26-panel .pv-chip .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:13px;line-height:1;color:var(--icon)}" +
      "#fc26-panel .pv-chip.plus .ico{color:var(--gold)}" +
      "#fc26-panel .pv-none{margin-top:10px;font-size:11px;color:var(--muted);opacity:.8}" +
      // Eligibility row inside the preview card.
      "#fc26-panel .pv-elig{display:flex;align-items:center;gap:8px;margin-top:8px}" +
      "#fc26-panel .pv-elig-state{font-size:10px;letter-spacing:.04em;text-transform:uppercase}" +
      "#fc26-panel .pv-elig-state.on{color:var(--accent)}" +
      "#fc26-panel .pv-elig-state.off{color:var(--muted)}" +
      "#fc26-panel .pv-elig-btn{margin-left:auto;background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600}" +
      // ---- Feature 1: manage-eligible-rarities checklist -----------------------
      "#fc26-panel .elig-manage-btn{width:100%;text-align:left;background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:11px;font-weight:600}" +
      "#fc26-panel .elig-manager{margin-top:6px;padding:8px;border-radius:8px;background:var(--card);border:1px solid var(--card-border)}" +
      "#fc26-panel .elig-search{width:100%;box-sizing:border-box;padding:5px 7px;border-radius:6px;border:1px solid var(--field-border);background:var(--field);color:var(--ink);font-size:11px}" +
      "#fc26-panel .elig-actions{display:flex;gap:6px;margin-top:6px}" +
      "#fc26-panel .elig-act{flex:1;background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:4px 6px;cursor:pointer;font-size:10px;font-weight:600}" +
      "#fc26-panel .elig-list{max-height:200px;overflow:auto;margin-top:6px;display:flex;flex-direction:column;gap:2px}" +
      "#fc26-panel .elig-item{display:flex;align-items:center;gap:7px;padding:3px 5px;border-radius:5px;cursor:pointer;font-size:11px;color:var(--ink)}" +
      "#fc26-panel .elig-item:hover{background:var(--sel)}" +
      "#fc26-panel .elig-item input{accent-color:var(--accent);cursor:pointer;margin:0;flex:none}" +
      "#fc26-panel .elig-nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .elig-id{flex:none;font-size:9px;color:var(--muted);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .elig-mgr-note{margin-top:7px;font-size:10px;color:var(--muted);opacity:.85}" +
      // Stage-then-Save: pending rows, the add/remove badge, and the Save/Cancel confirm bar.
      "#fc26-panel .elig-item.pending{background:var(--sel);box-shadow:inset 2px 0 0 var(--accent)}" +
      "#fc26-panel .elig-strike{text-decoration:line-through;opacity:.55}" +
      "#fc26-panel .elig-pend{flex:none;font-size:8px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:1px 6px;white-space:nowrap}" +
      "#fc26-panel .elig-pend.add{color:var(--accent);border:1px solid var(--accent)}" +
      "#fc26-panel .elig-pend.rem{color:var(--btnx-ink);border:1px solid rgba(255,120,120,.45)}" +
      "#fc26-panel .elig-confirm{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--sel);border:1px solid var(--accent)}" +
      "#fc26-panel .elig-msg{flex:1;font-size:11px;font-weight:700;color:var(--ink)}" +
      "#fc26-panel .elig-save{flex:none;background:var(--accent);color:var(--accent-ink);border:0;border-radius:6px;padding:5px 11px;cursor:pointer;font-size:10px;font-weight:800}" +
      "#fc26-panel .elig-cancel{flex:none;background:transparent;color:var(--muted);border:1px solid var(--field-border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:10px;font-weight:700}" +
      // ---- Feature 2: Meta rating section --------------------------------------
      "#fc26-panel .meta-section{margin-top:8px}" +
      "#fc26-panel .meta-toggle{width:100%;text-align:left;background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:11px;font-weight:600}" +
      "#fc26-panel .meta-box{margin-top:6px;padding:8px;border-radius:8px;background:var(--card);border:1px solid var(--card-border)}" +
      "#fc26-panel .meta-controls{display:flex;gap:6px}" +
      "#fc26-panel .meta-pos,#fc26-panel .meta-count{padding:5px;border-radius:6px;border:1px solid var(--field-border);background:var(--field);color:var(--ink);font-size:11px}" +
      "#fc26-panel .meta-pos{flex:1;min-width:0}" +
      "#fc26-panel .meta-count{flex:none}" +
      "#fc26-panel .meta-pos option,#fc26-panel .meta-count option{color:#111827;background:#ffffff}" +
      "#fc26-panel .meta-list{max-height:260px;overflow:auto;margin-top:8px;display:flex;flex-direction:column;gap:3px}" +
      "#fc26-panel .meta-row{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:5px;cursor:pointer;border-left:3px solid transparent;background:var(--tile)}" +
      "#fc26-panel .meta-row:hover{border-left-color:var(--accent)}" +
      "#fc26-panel .meta-row.on{border-left-color:var(--accent);background:var(--sel)}" +
      "#fc26-panel .meta-rank{flex:none;min-width:18px;text-align:right;font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .meta-ovr{flex:none;min-width:22px;text-align:center;font-weight:800;font-size:14px;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .meta-nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:12.5px}" +
      "#fc26-panel .meta-gk{margin-left:5px;color:var(--accent);font-size:8px;border:1px solid var(--accent);border-radius:4px;padding:0 3px}" +
      "#fc26-panel .meta-ps{flex:none;display:inline-flex;gap:2px;align-items:center;overflow:hidden;max-width:70px}" +
      "#fc26-panel .meta-ps .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:12px;line-height:1;color:var(--gold)}" +
      "#fc26-panel .meta-score{flex:none;display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}" +
      "#fc26-panel .meta-score b{color:var(--accent);font-size:14px;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .meta-split{font-size:9px;color:var(--muted);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .meta-note{margin-top:7px;font-size:10px;color:var(--muted);opacity:.85}" +
      // Meta Ratings full-page layout (tabs + a scrolling body that fills the panel).
      "#fc26-panel .mp-tabs{flex:none;display:flex;gap:7px;padding-bottom:10px}" +
      "#fc26-panel .mp-tabs .gt-sqpill{flex:1}" +
      "#fc26-panel .mp-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}" +
      "#fc26-panel .mp-controls{flex:none;padding-bottom:8px}" +
      "#fc26-panel .mp-list{flex:1;min-height:0;max-height:none;margin-top:0}" +
      "#fc26-panel .mp-soon{padding:24px 10px;text-align:center;color:var(--muted);font-size:12px;opacity:.85}" +
      // Meta player detail card (in-page): its own scroller + a per-position meta breakdown row + the exit button.
      "#fc26-panel .mp-detail{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto}" +
      "#fc26-panel .mp-posrow{display:flex;flex-wrap:wrap;gap:6px}" +
      "#fc26-panel .mp-poschip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:11px;background:var(--tile);border:1px solid var(--tile-border);color:var(--muted)}" +
      "#fc26-panel .mp-poschip b{color:var(--ink);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .mp-poschip.top{background:var(--sel);border-color:var(--accent);color:var(--ink)}" +
      "#fc26-panel .mp-poschip.top b{color:var(--accent)}" +
      "#fc26-panel .mp-edit{width:100%;margin-top:14px;padding:11px;border:0;border-radius:9px;background:var(--accent);color:var(--accent-ink);font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}" +
      // ---- Feature 3: Gauntlet squad builder -----------------------------------
      "#fc26-panel .gt-build{flex:none;background:var(--accent);color:var(--accent-ink);border:0;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.04em}" +
      "#fc26-panel .gt-out{margin-top:8px;display:flex;flex-direction:column;gap:10px}" +
      "#fc26-panel .gt-warn{padding:9px 11px;border-radius:8px;background:rgba(255,120,120,.10);border:1px solid rgba(255,120,120,.34)}" +
      "#fc26-panel .gt-warn-t{font-weight:800;font-size:12px;color:#ffc2c2;margin-bottom:6px}" +
      "#fc26-panel .gt-warn-l{font-size:11px;color:var(--ink);opacity:.9;line-height:1.4;margin-top:3px}" +
      "#fc26-panel .gt-warn-l b{color:#ffd7d7}" +
      "#fc26-panel .gt-squad{border-radius:10px;background:var(--card);border:1px solid var(--card-border);overflow:hidden}" +
      "#fc26-panel .gt-head{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--sel);border-bottom:1px solid var(--card-border)}" +
      "#fc26-panel .gt-head b{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink)}" +
      "#fc26-panel .gt-avg{margin-left:auto;font-size:10px;color:var(--accent);font-weight:700;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .gt-rows{display:flex;flex-direction:column}" +
      "#fc26-panel .gt-row{display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer;border-left:3px solid transparent}" +
      "#fc26-panel .gt-row:hover{border-left-color:var(--accent);background:var(--sel)}" +
      "#fc26-panel .gt-row.on{border-left-color:var(--accent);background:var(--sel)}" +
      "#fc26-panel .gt-row.empty{cursor:default;opacity:.7}" +
      "#fc26-panel .gt-row.empty:hover{border-left-color:transparent;background:transparent}" +
      "#fc26-panel .gt-pos{flex:none;min-width:56px;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}" +
      "#fc26-panel .gt-ovr{flex:none;min-width:22px;text-align:center;font-weight:800;font-size:13px;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .gt-nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:12px}" +
      "#fc26-panel .gt-empty{color:var(--muted);font-weight:500;font-style:italic}" +
      "#fc26-panel .gt-sc{flex:none;font-weight:800;font-size:13px;color:var(--accent);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .gt-bench-lab{padding:5px 10px;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:rgba(0,0,0,.14);border-top:1px solid var(--card-border);border-bottom:1px solid var(--card-border)}" +
      "#fc26-panel .gt-chem{padding:6px 10px;font-size:10px;color:var(--muted);border-top:1px solid var(--card-border);background:rgba(0,0,0,.08)}" +
      // ---- Feature 4b: GH 4th PlayStyle+ (one-off) section ---------------------
      "#fc26-panel .gh-toggle{width:100%;text-align:left;background:var(--tile-psp);color:var(--gold);border:1px solid var(--tile-psp-border);border-radius:7px;padding:7px 9px;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.04em}" +
      "#fc26-panel .gh-box{margin-top:6px;padding:9px;border-radius:8px;background:var(--card);border:1px solid var(--tile-psp-border)}" +
      "#fc26-panel .gh-head{font-size:10.5px;line-height:1.35;color:var(--muted)}" +
      "#fc26-panel .gh-head b{color:var(--gold)}" +
      "#fc26-panel .gh-load{background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:10px;font-weight:600}" +
      "#fc26-panel .gh-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}" +
      "#fc26-panel .gh-tile{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:var(--tile-psp);border:1px solid var(--tile-psp-border);color:#ffe7b0;cursor:pointer;font-size:11px;font-weight:700}" +
      "#fc26-panel .gh-tile .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:14px;line-height:1;color:var(--gold)}" +
      "#fc26-panel .gh-tile:hover{border-color:var(--gold)}" +
      "#fc26-panel .gh-tile.dis{opacity:.4;cursor:not-allowed}" +
      "#fc26-panel .gh-note{margin-top:9px;font-size:10px;color:var(--muted);opacity:.9}" +
      // reset / remove PlayStyles row (preview card)
      "#fc26-panel .pv-reset{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}" +
      "#fc26-panel .pv-rm-one{flex:1 1 auto;min-width:0;background:var(--btn);color:var(--btn-ink);border:0;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:11px;font-weight:600}" +
      "#fc26-panel .pv-rm-one:hover{color:var(--accent)}" +
      "#fc26-panel .pv-rm-all{flex:1 1 auto;min-width:0;background:rgba(255,120,120,.14);color:#ffc2c2;border:1px solid rgba(255,120,120,.34);border-radius:7px;padding:6px 10px;cursor:pointer;font-size:11px;font-weight:600}" +
      "#fc26-panel .pv-rm-all:hover{background:rgba(255,120,120,.22)}" +
      // removal loader + summary (shown in the apply box while clearing/removing evos)
      "#fc26-panel .rm-load{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink)}" +
      "#fc26-panel .rm-spin{width:18px;height:18px;flex:none;border:2px solid rgba(255,255,255,.18);border-top-color:var(--accent);border-radius:50%;animation:fc26spin .7s linear infinite}" +
      "#fc26-panel .rm-done{display:flex;align-items:center;gap:8px;font-weight:700;font-size:12px}" +
      "#fc26-panel .rm-done .tick{width:20px;height:20px;flex:none;border-radius:50%;background:var(--accent);color:#04241a;display:grid;place-items:center;font-size:12px}" +
      // ---- evo-grid tiles ------------------------------------------------------
      // PlayStyle+ icons shown inline on each player row in the picker (gold).
      "#fc26-panel .pl-check{flex:none;width:15px;height:15px;margin:0;accent-color:var(--accent);cursor:pointer}" +
      // batch roll-call summary (above the Apply button when 2+ players are batched)
      "#fc26-panel .bl-lead{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}" +
      "#fc26-panel .bl-chips{display:flex;flex-wrap:wrap;gap:5px}" +
      "#fc26-panel .bl-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;font-size:11px;background:var(--tile);border:1px solid var(--tile-border);color:var(--ink)}" +
      "#fc26-panel .bl-chip b{color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .pl-ps{display:inline-flex;gap:3px;align-items:center;flex:none}" +
      "#fc26-panel .pl-ps .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:14px;line-height:1;color:var(--gold)}" +
      // Player row: rating | name (flexes) | meta zone (icons + GK + rarity).
      "#fc26-panel .pl-rate{flex:none;min-width:24px;text-align:center;font-weight:700;font-size:15px;color:var(--accent);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .pl-row.on .pl-rate{color:var(--ink)}" +
      "#fc26-panel .pl-nameg{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden}" +
      "#fc26-panel .pl-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:13.5px;letter-spacing:.03em;text-transform:uppercase}" +
      "#fc26-panel .pl-gk{flex:none;color:var(--accent);font-size:9px;border:1px solid var(--accent);border-radius:4px;padding:0 4px}" +
      "#fc26-panel .pl-pos{flex:none;font-size:9px;font-weight:800;letter-spacing:.02em;color:var(--muted);border:1px solid var(--field-border);border-radius:4px;padding:0 4px;white-space:nowrap}" +
      "#fc26-panel .pl-pos.gk{color:var(--accent);border-color:var(--accent)}" +
      "#fc26-panel .pl-meta{flex:none;display:flex;align-items:center;gap:5px;justify-content:flex-end;overflow:hidden}" +
      "#fc26-panel .pl-meta .pl-rar{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-size:10px;color:var(--muted)}" +
      "#fc26-panel.fc26-desktop .pl-meta{width:86px}" +          // fixed -> consistent name width
      "#fc26-panel.fc26-mobile .pl-meta{max-width:52%}" +         // plenty of room -> size to content
      "#fc26-panel.fc26-mobile .pl-name{flex:1 1 auto}" +
      "#fc26-panel .fc26-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}" +
      "#fc26-panel .fc26-ec{position:relative;background:var(--tile);border:1px solid var(--tile-border);border-radius:9px;padding:7px 4px;cursor:pointer;text-align:center;transition:.08s;user-select:none}" +
      "#fc26-panel .fc26-ec:hover{border-color:var(--accent)}" +
      "#fc26-panel .fc26-ec.sel{background:var(--sel);border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}" +
      "#fc26-panel .fc26-ec.psp{background:var(--tile-psp);border-color:var(--tile-psp-border)}" +
      "#fc26-panel .fc26-ec.psp.sel{background:var(--sel);border-color:var(--accent)}" +
      "#fc26-panel .fc26-ec.dis{opacity:.38;cursor:not-allowed}" +
      "#fc26-panel .fc26-ec.dis:hover{border-color:var(--tile-border)}" +
      "#fc26-panel .fc26-ec .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:24px;line-height:1;display:block;margin-bottom:4px;color:var(--icon)}" +
      "#fc26-panel .fc26-ec.psp .ico{color:var(--gold)}" +
      "#fc26-panel .fc26-ec .nm{font-size:9px;line-height:1.15;color:var(--ink);opacity:.85;word-break:break-word;text-transform:uppercase;letter-spacing:.03em}" +
      "#fc26-panel .fc26-ec .own{position:absolute;top:3px;right:4px;font-size:10px;color:#67e08a}" +
      // ---- apply progress (tiles spin -> tick) + result summary ----------------
      "#fc26-panel .fc26-ec .ap-badge{position:absolute;top:3px;right:4px;width:14px;height:14px;border-radius:50%;display:grid;place-items:center;font-size:9px;opacity:0;transform:scale(.4)}" +
      "#fc26-panel .fc26-ec.applying{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset,0 0 14px rgba(79,227,172,.45)}" +
      "#fc26-panel .fc26-ec.applying::after{content:'';position:absolute;inset:0;border-radius:9px;border:2px solid transparent;border-top-color:var(--accent);animation:fc26spin .7s linear infinite}" +
      "#fc26-panel .fc26-ec.done{border-color:rgba(79,227,172,.5)}" +
      "#fc26-panel .fc26-ec.done .ap-badge{background:var(--accent);color:#04241a;opacity:1;transform:scale(1);transition:.25s cubic-bezier(.3,1.6,.5,1)}" +
      "#fc26-panel .fc26-ec.failed{border-color:rgba(255,120,120,.5);opacity:.7}" +
      "#fc26-panel .fc26-ec.failed .ap-badge{background:#e06767;color:#fff;opacity:1;transform:scale(1)}" +
      "@keyframes fc26spin{to{transform:rotate(360deg)}}" +
      "#fc26-panel .fc26-apply{margin-top:10px}" +
      "#fc26-panel .ap-head{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;margin-bottom:9px}" +
      "#fc26-panel .ap-head .tick{width:20px;height:20px;border-radius:50%;background:var(--accent);color:#04241a;display:grid;place-items:center;font-size:12px;flex:none}" +
      "#fc26-panel .ap-head .sub{font-weight:500;font-size:11px;color:var(--muted);margin-left:auto}" +
      "#fc26-panel .ap-chips{display:flex;flex-wrap:wrap;gap:6px}" +
      "#fc26-panel .ap-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px 4px 7px;border-radius:999px;font-size:11px;background:var(--tile);border:1px solid var(--tile-border);color:var(--ink);opacity:0;transform:scale(.6) translateY(6px)}" +
      "#fc26-panel .ap-chip.plus{background:var(--tile-psp);border-color:var(--tile-psp-border);color:#ffe7b0}" +
      "#fc26-panel .ap-chip .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:13px;line-height:1;color:var(--icon)}" +
      "#fc26-panel .ap-chip.plus .ico{color:var(--gold)}" +
      "#fc26-panel .ap-chip.show{animation:fc26pop .4s cubic-bezier(.2,1.5,.4,1) forwards}" +
      "@keyframes fc26pop{to{opacity:1;transform:scale(1) translateY(0)}}" +
      "#fc26-panel .ap-fail{margin-top:9px;font-size:11px;color:#ff9e9e}" +
      // ---- batch apply: per-player sections + overall banner -------------------
      "#fc26-panel .bx-banner{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--border)}" +
      "#fc26-panel .bx-banner .tick{width:20px;height:20px;border-radius:50%;background:var(--accent);color:#04241a;display:grid;place-items:center;font-size:12px;flex:none}" +
      "#fc26-panel .bx-sec{margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)}" +
      "#fc26-panel .bx-sec:last-child{border-bottom:0;margin-bottom:0}" +
      "#fc26-panel .bx-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}" +
      "#fc26-panel .bx-rate{flex:none;min-width:22px;text-align:center;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .bx-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}" +
      "#fc26-panel .bx-stat{flex:none;font-size:10px;color:var(--muted)}" +
      "#fc26-panel .bx-none{font-size:11px;color:var(--muted);opacity:.8}" +
      "#fc26-panel .bx-skip{margin-top:6px;font-size:10px;color:var(--muted);opacity:.85}" +
      // ---- responsive layout: Broadcast dock (desktop) / Wizard sheet (mobile) ---
      // Desktop = a wide "production console" docked to the bottom edge, with a bright
      // top rule (the LIVE strip look). Three zones sit side by side inside it (lineup
      // rail | spotlight | style deck), each scrolling on its own. Small side insets
      // (10px) and an explicit width give it room to be dragged (header) and resized
      // (corner grip) into a free-floating console without overflowing the page.
      "#fc26-panel.fc26-desktop{left:10px;bottom:0;width:calc(100vw - 20px);max-width:none;height:52vh;min-height:340px;max-height:520px;border-radius:16px 16px 0 0;border-top:2px solid var(--accent)}" +
      "#fc26-panel.fc26-mobile{left:0;right:0;bottom:0;width:100%;min-height:70vh;max-height:86vh;border-radius:16px 16px 0 0}" +
      // Minimized (desktop OR mobile) = a small draggable pill in the bottom-right by
      // default. These come AFTER the mode rules so they override the panel width/shape.
      "#fc26-panel.fc26-min{left:auto;right:12px;bottom:12px;top:auto;width:auto;height:auto;min-height:0;max-width:300px;max-height:none;border-top:0;border-radius:999px}" +
      "#fc26-panel.fc26-min .fc26-header{border-bottom:0}" +
      "#fc26-panel.fc26-min .fc26-title{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      // The header is the drag handle: show a move cursor where dragging is allowed
      // (the desktop dock, and either pill - but not the docked mobile sheet).
      "#fc26-panel.fc26-desktop .fc26-header,#fc26-panel.fc26-min .fc26-header{cursor:move}" +
      // Three zones of the Broadcast dock: lineup rail (l), spotlight (m), style deck (r).
      "#fc26-panel .fc26-cols{display:flex;gap:14px;flex:1;min-height:0}" +
      "#fc26-panel .fc26-pane{min-width:0;min-height:0;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto}" +
      "#fc26-panel .fc26-pane.l{flex:0 0 30%;min-width:230px}" +
      "#fc26-panel .fc26-pane.m{flex:1 1 auto;min-width:200px;border-left:1px solid var(--border);padding-left:14px}" +
      "#fc26-panel .fc26-pane.r{flex:0 0 300px;border-left:1px solid var(--border);padding-left:14px}" +
      // Narrow desktop (dock resized small): two columns - lineup on the left, and a single
      // flexible right pane (r2) with the spotlight stacked ON TOP of the style deck.
      "#fc26-panel .fc26-pane.r2{flex:1 1 auto;min-width:0;border-left:1px solid var(--border);padding-left:14px}" +
      // The spotlight + deck panes are scrollers. Force their children to keep natural
      // height (flex:none) so tall content OVERFLOWS and the pane scrolls, instead of the
      // flex column squishing them to fit (which killed the scroll).
      "#fc26-panel .fc26-pane.m > *,#fc26-panel .fc26-pane.r > *,#fc26-panel .fc26-pane.r2 > *{flex:0 0 auto}" +
      // Placeholder in the empty spotlight zone (before a player is picked).
      "#fc26-panel .fc26-spothint{margin-top:8px;padding:20px 10px;border:1px dashed var(--card-border);border-radius:10px;text-align:center;font-size:12px;color:var(--muted);opacity:.8}" +
      // list heights: capped on mobile; on desktop the squad list flexes to fill its
      // pane and the evo list is uncapped (the whole right pane scrolls as one).
      "#fc26-panel .fc26-plist{max-height:210px}" +
      // Mobile-only stub shown in place of the collapsed Lineup list (a tap-to-reveal button).
      // Club-load feedback: the Reload button's own spinner + the Lineup status line under it.
      // Both live in the Lineup module, so they're visible on a phone (where the main status
      // line is only in the DOM on the Review step).
      // The whole look is here (NOT inline) so .busy / .done can actually recolour it.
      "#fc26-panel .fc26-reload{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px}" +
      "#fc26-panel .fc26-reload.busy,#fc26-panel .fc26-reload.done{background:var(--sel);color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);font-weight:700}" +
      "#fc26-panel .fc26-reload:disabled{opacity:1;cursor:progress}" +
      "#fc26-panel .fc26-btnspin{flex:none;width:10px;height:10px;display:inline-block;border:2px solid rgba(255,255,255,.22);border-top-color:var(--accent);border-radius:50%;animation:fc26spin .7s linear infinite}" +
      "#fc26-panel .fc26-tick{flex:none;font-weight:800;color:var(--accent)}" +
      // The status line under the button. It gets a chip background while it's live (busy /
      // just-finished / failed) so it reads as something happening, not muted footnote text.
      "#fc26-panel .fc26-clubstat{display:flex;align-items:center;gap:7px;min-height:15px;margin-top:6px;font-size:11px;color:var(--muted);border-radius:6px;transition:background .2s ease}" +
      "#fc26-panel .fc26-clubstat.busy,#fc26-panel .fc26-clubstat.done{color:var(--accent);background:var(--sel);padding:5px 8px;font-weight:700;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .fc26-clubstat.err{color:#ffc2c2;background:rgba(255,120,120,.10);padding:5px 8px;font-weight:700}" +
      "#fc26-panel .fc26-liststub{width:100%;text-align:left;margin-top:6px;padding:9px 11px;border-radius:8px;background:var(--tab);border:1px dashed var(--field-border);color:var(--muted);font-size:11px;font-weight:600;cursor:pointer}" +
      "#fc26-panel .fc26-liststub:hover{border-color:var(--accent);color:var(--accent)}" +
      "#fc26-panel .fc26-elist{max-height:210px}" +
      "#fc26-panel.fc26-desktop .fc26-squad{display:flex;flex-direction:column;flex:1;min-height:0}" +
      "#fc26-panel.fc26-desktop .fc26-plist{flex:1;min-height:80px;max-height:none}" +
      "#fc26-panel.fc26-desktop .fc26-elist{max-height:none}" +
      // thin, subtle scrollbars everywhere inside the panel (no fat OS scrollbar).
      "#fc26-panel ::-webkit-scrollbar{width:8px;height:8px}" +
      "#fc26-panel ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:8px}" +
      "#fc26-panel ::-webkit-scrollbar-track{background:transparent}" +
      "#fc26-panel *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}" +
      // ---- resize grip (desktop only) ------------------------------------------
      // A small diagonal-striped handle in the bottom-right corner. Only shown on the
      // maximized desktop panel (hidden on mobile + when minimized). The diagonal
      // stripes are drawn with a CSS gradient so there's no image to embed.
      "#fc26-panel .fc26-grip{position:absolute;right:2px;bottom:2px;width:16px;height:16px;cursor:nwse-resize;z-index:4;touch-action:none;opacity:.5;" +
        "background:linear-gradient(135deg,transparent 0 45%,var(--muted) 45% 55%,transparent 55% 66%,var(--muted) 66% 76%,transparent 76%)}" +
      "#fc26-panel .fc26-grip:hover{opacity:.95}" +
      // Edge + corner resize handles: invisible strips along each side, each with its own
      // resize cursor. Thin enough not to steal clicks from the content; the corners are a
      // small 14px square. z-index sits just under the grip so overlaps resolve sensibly.
      "#fc26-panel .fc26-rz{position:absolute;z-index:3;touch-action:none}" +
      "#fc26-panel .fc26-rz-n{top:0;left:12px;right:12px;height:6px;cursor:ns-resize}" +
      "#fc26-panel .fc26-rz-s{bottom:0;left:12px;right:12px;height:6px;cursor:ns-resize}" +
      "#fc26-panel .fc26-rz-e{top:12px;bottom:12px;right:0;width:6px;cursor:ew-resize}" +
      "#fc26-panel .fc26-rz-w{top:12px;bottom:12px;left:0;width:6px;cursor:ew-resize}" +
      "#fc26-panel .fc26-rz-ne{top:0;right:0;width:14px;height:14px;cursor:nesw-resize}" +
      "#fc26-panel .fc26-rz-nw{top:0;left:0;width:14px;height:14px;cursor:nwse-resize}" +
      "#fc26-panel .fc26-rz-sw{bottom:0;left:0;width:14px;height:14px;cursor:nesw-resize}" +
      // Mobile channel tabs (Lineup / Build & Apply) + the scrolling section body.
      // (A ".dis" dimmed-tab rule used to live here for the gated Review tab; there's no
      // gated tab any more, so it went with it.)
      "#fc26-panel .fc26-chtabs{flex:none;display:flex;gap:6px;margin-bottom:10px}" +
      "#fc26-panel .fc26-chtab{flex:1;text-align:center;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:9px 4px;border-radius:8px;color:var(--muted);background:var(--tab);border:1px solid var(--field-border);cursor:pointer;user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#fc26-panel .fc26-chtab.on{color:var(--accent-ink);background:var(--accent);border-color:var(--accent)}" +
      "#fc26-panel .fc26-stepbody{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto}" +
      // Mobile guide button ("Next: Build & Apply"), disabled until a player is picked.
      "#fc26-panel .fc26-guidebtn{flex:none;width:100%;margin-top:10px;padding:11px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-ink);font-weight:800;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}" +
      "#fc26-panel .fc26-guidebtn.dis{opacity:.4;cursor:not-allowed}" +
      // The spotlight card's foldaway detail (mobile only - see renderPreview). Everything
      // that used to be styled here (.fc26-wizwho, .fc26-decksum/.ds-*, .fc26-revsum/.rs-*)
      // belonged to the old three-step wizard and went with it.
      "#fc26-panel .pv-more{width:100%;margin-top:12px;text-align:left;background:var(--btn);color:var(--accent);border:1px solid var(--field-border);border-radius:7px;padding:8px 10px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:800;letter-spacing:.04em}" +
      "#fc26-panel .pv-more:hover{border-color:var(--accent)}" +
      "#fc26-panel .pv-detail{margin-top:2px}" +
      "#fc26-panel .pv-detail .pv-metaline{margin-top:8px}" +
      // Pinned mobile mini-spotlight (rating + name + caps), always visible below the tabs.
      "#fc26-panel .gt-launch{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:11px 12px;cursor:pointer;color:var(--ink)}" + "#fc26-panel .gt-launch:hover{border-color:var(--accent)}" + "#fc26-panel .gt-launch-ic{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-size:17px;background:var(--sel);border:1px solid var(--accent)}" + "#fc26-panel .gt-launch-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" + "#fc26-panel .gt-launch-tx b{font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}" + "#fc26-panel .gt-launch-tx i{font-style:normal;font-size:10.5px;color:var(--muted)}" + "#fc26-panel .gt-launch-go{flex:none;color:var(--accent);font-size:20px;font-weight:800}" + "#fc26-panel .gt-builder{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}" + "#fc26-panel .gt-bd-top{flex:none;display:flex;align-items:center;gap:9px;padding:0 0 10px}" + "#fc26-panel .gt-bd-back{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;cursor:pointer;background:var(--btn);border:1px solid var(--field-border);color:var(--ink);font-size:18px;font-weight:700}" + "#fc26-panel .gt-bd-back:hover{border-color:var(--accent);color:var(--accent)}" + "#fc26-panel .gt-bd-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" + "#fc26-panel .gt-bd-title b{font-size:15px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1}" + "#fc26-panel .gt-bd-eyebrow{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}" + "#fc26-panel .gt-clab{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}" + "#fc26-panel .gt-seg{display:inline-flex;background:rgba(0,0,0,.28);border:1px solid var(--field-border);border-radius:9px;padding:3px;gap:2px}" + "#fc26-panel .gt-seg button{border:0;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;padding:6px 10px;border-radius:6px;white-space:nowrap}" + "#fc26-panel .gt-seg button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}" + "#fc26-panel .gt-rebuild{background:var(--btn);color:var(--btn-ink);border:1px solid var(--field-border);border-radius:8px;padding:7px 10px;cursor:pointer;font-size:11px;font-weight:700}" + "#fc26-panel .gt-rebuild:hover{border-color:var(--accent);color:var(--accent)}" + "#fc26-panel .gt-bd-controls{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-bottom:10px}" + "#fc26-panel .gt-bd-tabs{flex:none;display:flex;gap:7px;padding-bottom:10px}" + "#fc26-panel .gt-tab{flex:1;cursor:pointer;background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:7px 10px;color:inherit;font-family:inherit;text-align:left}" + "#fc26-panel .gt-tab[aria-selected=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}" + "#fc26-panel .gt-tab .tn{font-weight:800;font-size:12px;letter-spacing:.04em;text-transform:uppercase}" + "#fc26-panel .gt-tab .ta{margin-left:7px;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-tab .ts{font-size:9.5px;color:var(--muted);margin-top:2px}" + "#fc26-panel .gt-select{appearance:none;-webkit-appearance:none;font-family:inherit;font-weight:700;font-size:12px;color:var(--ink);background:var(--field);border:1px solid var(--field-border);border-radius:8px;padding:8px 10px;cursor:pointer}" + "#fc26-panel .gt-select option{color:#111827;background:#fff}" + "#fc26-panel .gt-tabsel{width:100%;margin-top:7px;padding:5px 7px;font-size:11px;font-weight:700}" + "#fc26-panel .gt-mform{flex:none;display:flex;align-items:center;gap:8px;padding-bottom:8px}" + "#fc26-panel .gt-mform-lab{flex:none;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}" + "#fc26-panel .gt-mform-sel{flex:1;min-width:0}" + "#fc26-panel .gt-sqpills{flex:none;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px;padding-bottom:8px}" + "#fc26-panel .gt-sqpill{padding:9px 4px;border-radius:9px;background:var(--card);border:1px solid var(--card-border);font-family:inherit;font-weight:800;font-size:12px;letter-spacing:.04em;text-transform:uppercase;text-align:center;color:var(--muted);cursor:pointer}" + "#fc26-panel .gt-sqpill[aria-selected=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}" + "#fc26-panel .gt-summary{flex:none;display:flex;flex-wrap:wrap;gap:5px 14px;padding-bottom:8px;font-size:11px;color:var(--muted)}" + "#fc26-panel .gt-summary b{color:var(--ink);font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-summary .gsa{color:var(--gold)}" + "#fc26-panel .gt-statstrip{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--card-border);border:1px solid var(--card-border);border-radius:10px;overflow:hidden}" + "#fc26-panel .gt-stat{background:rgba(0,0,0,.22);padding:9px 8px;text-align:center}" + "#fc26-panel .gt-stat .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}" + "#fc26-panel .gt-stat .v.a{color:var(--accent)}" + "#fc26-panel .gt-stat .v.g{color:var(--gold)}" + "#fc26-panel .gt-stat .k{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:5px}" + "#fc26-panel .gt-bench{background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:9px 11px}" + "#fc26-panel .gt-bench .bl{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}" + "#fc26-panel .gt-chips{display:flex;flex-wrap:wrap;gap:6px}" + "#fc26-panel .gt-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;background:var(--tile);border:1px solid var(--tile-border);border-radius:999px;padding:4px 9px 4px 6px;white-space:nowrap}" + "#fc26-panel .gt-chip b{color:var(--gold);font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-bench2{flex:none;padding-top:8px}" + "#fc26-panel .gt-benchtoggle{width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--card-border);color:var(--muted);border-radius:9px;padding:8px 11px;font-family:inherit;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}" + "#fc26-panel .gt-benchtoggle[aria-expanded=true]{border-color:var(--accent);color:var(--accent)}" + "#fc26-panel .gt-benchbody{display:none;margin-top:8px}" + "#fc26-panel .gt-benchbody.open{display:block}" + "#fc26-panel .gt-actions{flex:none;display:flex;flex-direction:column;gap:8px}" + "#fc26-panel.fc26-mobile .gt-actions{padding-top:10px;border-top:1px solid var(--border);margin-top:8px}" + "#fc26-panel .gt-arow{display:flex;gap:9px}" + "#fc26-panel .gt-cbtn{flex:1.4;background:var(--apply);color:var(--apply-ink);border:0;border-radius:9px;padding:12px;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}" + "#fc26-panel .gt-rbtn{flex:1;background:rgba(255,120,120,.14);color:#ffc2c2;border:1px solid rgba(255,120,120,.34);border-radius:9px;padding:12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}" + "#fc26-panel .gt-status{min-height:20px}" + "#fc26-panel .gt-sline{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--muted)}" + "#fc26-panel .gt-pbar{height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:8px}" + "#fc26-panel .gt-pbar>i{display:block;height:100%;width:0;background:var(--accent);transition:width .35s ease}" + "#fc26-panel .gt-toast{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:10px;font-size:12.5px;font-weight:700;animation:fc26pop .4s cubic-bezier(.2,1.5,.4,1) both}" + "#fc26-panel .gt-toast.ok{background:rgba(79,227,172,.12);border:1px solid rgba(79,227,172,.4);color:#c9fff0}" + "#fc26-panel .gt-toast.err{background:rgba(255,120,120,.12);border:1px solid rgba(255,120,120,.4);color:#ffd2d2}" + "#fc26-panel .gt-badge{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px}" + "#fc26-panel .gt-toast.ok .gt-badge{background:#4fe3ac;color:#04241a}" + "#fc26-panel .gt-toast.err .gt-badge{background:#e06767;color:#fff}" + "#fc26-panel .gt-warn2{font-size:11.5px;color:#ffc2c2;background:rgba(255,120,120,.10);border:1px solid rgba(255,120,120,.30);border-radius:9px;padding:9px 11px;line-height:1.4}" + "#fc26-panel .gt-warn2 b{color:#ffd7d7}" + "#fc26-panel .gt-pitchwrap{flex:1 1 auto;min-height:0;display:grid;place-items:center;padding:0 4px}" + "#fc26-panel .gt-pitch{height:100%;width:auto;max-width:100%;max-height:100%;aspect-ratio:68/92;border:1px solid var(--card-border);border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#12243d,#0a1424);position:relative}" + "#fc26-panel .gt-pitch svg{position:absolute;inset:0;width:100%;height:100%;display:block}" + "#fc26-panel .gt-dot{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;transition:left .5s cubic-bezier(.4,1.2,.4,1),top .5s cubic-bezier(.4,1.2,.4,1)}" + "#fc26-panel .gt-disc{position:relative;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;color:#06131f;box-shadow:0 4px 12px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.14)}" + "#fc26-panel .gt-dot .gt-sc{position:absolute;bottom:-7px;right:-8px;z-index:2;font-size:9.5px;font-weight:800;line-height:1;padding:2px 4px;border-radius:6px;background:#0a1120;border:1px solid var(--border-strong,rgba(120,180,255,.28));font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-dot .gt-pos{position:absolute;top:-7px;left:-8px;z-index:2;font-size:7.5px;font-weight:800;letter-spacing:.02em;padding:1px 4px;border-radius:5px;background:#0a1120;color:var(--muted);border:1px solid var(--border)}" + "#fc26-panel .gt-dot .gt-nm{font-size:9.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;text-align:center;line-height:1.05;max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.7)}" + "#fc26-panel .gt-dot .gt-meta{margin-top:1px;font-size:8.5px;font-weight:800;letter-spacing:.02em;color:#bcd3ef;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.85)}" + "#fc26-panel .gt-dot.t-elite .gt-disc{background:var(--accent)}" + "#fc26-panel .gt-dot.t-elite .gt-sc{color:var(--accent)}" + "#fc26-panel .gt-dot.t-gold .gt-disc{background:var(--gold)}" + "#fc26-panel .gt-dot.t-gold .gt-sc{color:var(--gold)}" + "#fc26-panel .gt-dot.t-solid .gt-disc{background:#bcd3ef}" + "#fc26-panel .gt-dot.t-solid .gt-sc{color:#bcd3ef}" + "#fc26-panel .gt-dot.t-low .gt-disc{background:#7f93b4;color:#0b1424}" + "#fc26-panel .gt-dot.t-low .gt-sc{color:#9fb2d2}" + "#fc26-panel .gt-dot.empty .gt-disc{background:transparent;color:var(--muted);border:2px dashed var(--muted);font-size:16px}" + "#fc26-panel .gt-dot.empty .gt-sc{display:none}" + "#fc26-panel .gt-dot.empty .gt-nm{color:var(--muted);font-style:italic;text-transform:none;opacity:.8}" + "#fc26-panel.fc26-desktop .gt-bd-main{display:flex;gap:14px;flex:1;min-height:0}" + "#fc26-panel.fc26-desktop .gt-bd-side{flex:0 0 296px;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:11px}" + "#fc26-panel.fc26-mobile.gt-open{height:86vh}" +
      // ---- Feature 5: Club Dashboard (display only) ----------------------------
      // Scrolling page body that fills the panel under the shared gt-bd-top header.
      "#fc26-panel .db-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding-right:2px}" +
      // Module 1 - hero strip: 5 stat cells (own bg + border + gap, so wrapping on a
      // phone never leaves an odd empty block the way a gap-background grid would).
      "#fc26-panel .db-hero{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}" +
      "#fc26-panel .db-hcell{background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:12px 10px;display:flex;flex-direction:column;gap:3px}" +
      "#fc26-panel .db-hn{font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .db-hn.g{color:var(--gold)}" +
      "#fc26-panel .db-hl{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700}" +
      // On a phone 5 across is too tight - drop to 3 columns (5 cells wrap to 3 + 2).
      "#fc26-panel.fc26-mobile .db-hero{grid-template-columns:repeat(3,1fr)}" +
      // Generic dashboard section card + heading (reused by every module below the hero).
      "#fc26-panel .db-card{background:var(--card);border:1px solid var(--card-border);border-radius:12px;padding:12px}" +
      "#fc26-panel .db-h3{margin:0 0 10px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:800;display:flex;align-items:center;gap:8px}" +
      "#fc26-panel .db-h3::after{content:'';flex:1;height:1px;background:var(--border)}" +
      // Module 2 - Club records: a standout player per stat, 2 across (1 on a phone).
      "#fc26-panel .db-recs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}" +
      "#fc26-panel .db-rec{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:var(--tile);border:1px solid var(--tile-border)}" +
      "#fc26-panel .db-rec-ic{flex:none;width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-size:15px;background:var(--sel);border:1px solid var(--accent)}" +
      "#fc26-panel .db-rec-meta{flex:1;min-width:0}" +
      "#fc26-panel .db-rec-lab{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}" +
      "#fc26-panel .db-rec-nm{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}" +
      "#fc26-panel .db-rec-val{flex:none;font-size:20px;font-weight:800;line-height:1;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .db-rec-val.a{color:var(--accent)}" +
      "#fc26-panel.fc26-mobile .db-recs{grid-template-columns:1fr}" +
      // Module 3 - Rating spread: a bar per OVR band, height scaled to the biggest band.
      "#fc26-panel .db-hist{display:flex;align-items:flex-end;gap:8px;height:104px;padding-top:16px}" +
      "#fc26-panel .db-hcol{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}" +
      "#fc26-panel .db-hbar{width:100%;border-radius:6px 6px 2px 2px;background:var(--accent);position:relative;min-height:3px}" +
      "#fc26-panel .db-hcol.g .db-hbar{background:var(--gold)}" +
      "#fc26-panel .db-hcount{position:absolute;top:-15px;left:0;right:0;text-align:center;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .db-hlab{font-size:9px;color:var(--muted);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}" +
      // Module 4 - Squad DNA: average of each face stat as a labelled bar, plus a read-out.
      "#fc26-panel .db-dna{display:flex;flex-direction:column;gap:9px}" +
      "#fc26-panel .db-drow{display:grid;grid-template-columns:34px 1fr 26px;align-items:center;gap:10px}" +
      "#fc26-panel .db-dk{font-size:10px;letter-spacing:.04em;font-weight:800;color:var(--muted)}" +
      "#fc26-panel .db-dtrack{height:8px;border-radius:5px;background:rgba(255,255,255,.06);overflow:hidden}" +
      "#fc26-panel .db-dfill{height:100%;border-radius:5px;background:var(--accent)}" +
      "#fc26-panel .db-dv{font-size:12px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .db-dnanote{margin-top:11px;font-size:11.5px;color:var(--muted);line-height:1.5}" +
      "#fc26-panel .db-dnanote b{color:var(--accent)}" +
      // Module 5 - Position depth: one chip per position group; thin cover flagged amber
      // (amber is semantic, like the Stop button's red - deliberately not the theme accent).
      "#fc26-panel .db-depth{display:flex;flex-wrap:wrap;gap:8px}" +
      "#fc26-panel .db-pchip{display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:9px;background:var(--tile);border:1px solid var(--tile-border)}" +
      "#fc26-panel .db-pchip .pp{font-size:11px;font-weight:800;letter-spacing:.02em;color:var(--ink)}" +
      "#fc26-panel .db-pchip .pc{font-size:12px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .db-pchip.thin{border-color:rgba(255,180,84,.42);background:rgba(255,180,84,.09)}" +
      "#fc26-panel .db-pchip.thin .pc{color:#ffb454}" +
      "#fc26-panel .db-depthkey{margin-top:10px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px}" +
      "#fc26-panel .db-depthkey i{width:9px;height:9px;border-radius:3px;background:#ffb454;display:inline-block;flex:none}" +
      // Module 6 - PlayStyle insights: a few one-line stats about the club's PlayStyle+ spread.
      "#fc26-panel .db-ps{display:flex;flex-direction:column}" +
      "#fc26-panel .db-prow{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:9px 0;border-bottom:1px solid var(--card-border)}" +
      "#fc26-panel .db-prow:first-child{padding-top:0}" +
      "#fc26-panel .db-prow:last-child{border-bottom:0;padding-bottom:0}" +
      "#fc26-panel .db-pl{font-size:12px;color:var(--muted)}" +
      "#fc26-panel .db-pr{font-size:13px;font-weight:700;text-align:right}" +
      "#fc26-panel .db-pr .g{color:var(--gold);font-variant-numeric:tabular-nums}" +
      // ---- Feature 6: Peks Lab (custom score) --------------------------
      // Scrolling page body under the shared gt-bd-top header, then one card per group
      // of controls. Every colour comes from the theme tokens, so all three skins work.
      "#fc26-panel .ss-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:11px;padding-right:2px}" +
      "#fc26-panel .ss-card{background:var(--card);border:1px solid var(--card-border);border-radius:11px;padding:12px 13px;display:flex;flex-direction:column;gap:10px}" +
      // .off = the tuning cards while the Justaino Score is active (look inert, can't be used).
      "#fc26-panel .ss-card.off{opacity:.42}" +
      "#fc26-panel .ss-lab{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);font-weight:700}" +
      "#fc26-panel .ss-note{font-size:10.5px;color:var(--muted);line-height:1.45}" +
      "#fc26-panel .ss-note b{color:var(--ink)}" +
      // The active-score switch: two halves, the live one filled with the accent.
      "#fc26-panel .ss-seg{display:flex;background:rgba(0,0,0,.28);border:1px solid var(--field-border);border-radius:9px;padding:3px;gap:3px}" +
      "#fc26-panel .ss-seg button{flex:1;border:0;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:9px 6px;border-radius:6px}" +
      "#fc26-panel .ss-seg button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}" +
      "#fc26-panel .ss-presets{display:flex;flex-wrap:wrap;gap:6px}" +
      "#fc26-panel .ss-preset{font-family:inherit;font-size:10.5px;font-weight:700;padding:6px 10px;border-radius:999px;background:var(--tile);border:1px solid var(--tile-border);color:var(--muted);cursor:pointer;white-space:nowrap}" +
      "#fc26-panel .ss-preset[aria-pressed=true]{border-color:var(--accent);color:var(--accent);background:var(--sel)}" +
      "#fc26-panel .ss-preset:disabled{cursor:default}" +
      // Balance: the two big percentages, then the split bar, then the slider under it.
      "#fc26-panel .ss-balnums{display:flex;justify-content:space-between;align-items:baseline;gap:10px}" +
      "#fc26-panel .ss-balnums b{font-size:23px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .ss-balnums .k{display:block;margin-top:4px;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700}" +
      "#fc26-panel .ss-balnums .r{text-align:right}" +
      "#fc26-panel .ss-bar{position:relative;height:11px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid var(--field-border);overflow:hidden}" +
      "#fc26-panel .ss-bar>i{position:absolute;left:0;top:0;bottom:0;background:var(--accent);opacity:.85;transition:width .18s ease}" +
      // Sliders: native range inputs, restyled to the panel's look in both engines.
      "#fc26-panel .ss-range{-webkit-appearance:none;appearance:none;width:100%;height:20px;background:transparent;cursor:pointer;display:block;margin:0;padding:0}" +
      "#fc26-panel .ss-range::-webkit-slider-runnable-track{height:5px;border-radius:999px;background:rgba(255,255,255,.11)}" +
      "#fc26-panel .ss-range::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;margin-top:-6px;border-radius:50%;background:#fff;border:3px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,.5)}" +
      "#fc26-panel .ss-range::-moz-range-track{height:5px;border-radius:999px;background:rgba(255,255,255,.11)}" +
      "#fc26-panel .ss-range::-moz-range-thumb{width:17px;height:17px;border-radius:50%;background:#fff;border:3px solid var(--accent)}" +
      "#fc26-panel .ss-range:disabled{cursor:default}" +
      "#fc26-panel .ss-range:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}" +
      // One dial = name, live value, slider, and a line of plain English with the baseline.
      "#fc26-panel .ss-dial{display:flex;flex-direction:column;gap:2px}" +
      "#fc26-panel .ss-dh{display:flex;align-items:baseline;gap:8px}" +
      "#fc26-panel .ss-dh .n{flex:1;font-size:11.5px;font-weight:700}" +
      "#fc26-panel .ss-dh .v{font-size:13px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .ss-dh .v.base{color:var(--muted)}" +
      "#fc26-panel .ss-dcap{font-size:10px;color:var(--muted);line-height:1.4}" +
      // The "Custom" chip in the page header, shown only when a custom score is live.
      "#fc26-panel .ss-chip{flex:none;font-size:8.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:4px 7px;border-radius:5px;background:var(--sel);color:var(--accent);border:1px solid var(--accent)}" +
      // The way IN: a labelled pill in the Justaino Score page header (icon + wording, so it
      // reads as a destination rather than a mystery glyph). Rings in the accent when a custom
      // score is live. The label shortens to "Settings" on a phone so the title keeps its room.
      "#fc26-panel .ss-hdrbtn{flex:none;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:9px;cursor:pointer;background:var(--btn);border:1px solid var(--field-border);color:var(--ink);font-family:inherit;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}" +
      "#fc26-panel .ss-hdrbtn .ic{font-size:14px;line-height:1}" +
      "#fc26-panel .ss-hdrbtn:hover{border-color:var(--accent);color:var(--accent)}" +
      "#fc26-panel .ss-hdrbtn.on{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 1px var(--accent),0 0 10px -2px var(--accent)}" +
      "#fc26-panel .ss-hdrbtn .tx-short{display:none}" +
      "#fc26-panel.fc26-mobile .ss-hdrbtn{padding:0 9px;font-size:10px}" +
      "#fc26-panel.fc26-mobile .ss-hdrbtn .tx-full{display:none}" +
      "#fc26-panel.fc26-mobile .ss-hdrbtn .tx-short{display:inline}" +
      // "Who this moves": the live re-ranking under the dials (step 3).
      "#fc26-panel .ss-imphead{display:flex;align-items:center;gap:8px}" +
      "#fc26-panel .ss-imphead .ss-lab{flex:1}" +
      "#fc26-panel .ss-imphead select{padding:5px 8px;font-size:11px}" +
      "#fc26-panel .ss-implist{display:flex;flex-direction:column;gap:5px}" +
      "#fc26-panel .ss-improw{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid var(--card-border)}" +
      "#fc26-panel .ss-imprank{flex:none;width:19px;height:19px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:800;background:rgba(255,255,255,.08);color:var(--muted);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .ss-improw.top .ss-imprank{background:var(--accent);color:var(--accent-ink)}" +
      "#fc26-panel .ss-impnm{flex:1;min-width:0;font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .ss-impsc{font-size:12px;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .ss-impmv{flex:none;width:32px;text-align:right;font-size:10px;font-weight:800;color:var(--muted);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .ss-impmv.up{color:#6ee7b7}" +
      "#fc26-panel .ss-impmv.dn{color:#ff9d9d}" +
      // Advanced section: the folded-out body of per-position weight sliders.
      "#fc26-panel .ss-advbody{display:flex;flex-direction:column;gap:9px;margin-top:10px;padding-top:10px;border-top:1px solid var(--card-border)}" +
      "#fc26-panel .ss-advbody .ss-lab{margin-top:4px}" +
      "#fc26-panel .ss-advbody .ss-preset{align-self:flex-start}" +
      // A PlayStyle weight row: the slider takes the width, the remove button sits at the end.
      "#fc26-panel .ss-psrow{display:flex;align-items:flex-start;gap:8px}" +
      "#fc26-panel .ss-psdial{flex:1;min-width:0}" +
      "#fc26-panel .ss-psdel{flex:none;width:24px;height:24px;margin-top:2px;border-radius:7px;cursor:pointer;background:rgba(255,120,120,.12);border:1px solid rgba(255,120,120,.32);color:#ffc2c2;font-family:inherit;font-size:14px;font-weight:700;line-height:1;padding:0}" +
      "#fc26-panel .ss-psdel:hover{background:rgba(255,120,120,.22)}" +
      "@media (prefers-reduced-motion:reduce){#fc26-panel .ss-bar>i{transition:none}}" +
      "@media (prefers-reduced-motion:reduce){#fc26-panel .fc26-ec.applying::after{animation:none}#fc26-panel .fc26-btnspin{animation:none}#fc26-panel .ap-chip{opacity:1;transform:none;animation:none}}";
    document.head.appendChild(st);
  }

  // NOTE: the first draw + club load USED to happen here as well as at the very bottom of
  // this file - the same block twice, so every run kicked off two full club sweeps. The
  // copy that lived here has been removed; the one at the end of the file does the job
  // (it's a superset - it also calls updateBatchUI - and it runs after everything exists).

  // ----------------------------------------------------------------------------
  // RESPONSIVE LAYOUT
  // Every element above is kept EXACTLY as-is (so all render/apply logic keeps
  // working). We only PLACE those elements differently depending on screen width:
  //   - wide screens  -> "Split Console": squad on the LEFT, build + apply on RIGHT.
  //   - phone/narrow  -> a bottom sheet with 2 tabs (Lineup / Build & Apply), where the
  //                      second tab is the SAME stack as the desktop right-hand pane.
  // Trick: group the elements into 4 reusable "modules" (wrapper divs), then move the
  // whole module around with one appendChild (which re-parents it) as the layout changes.
  // ----------------------------------------------------------------------------

  var mq = window.matchMedia("(max-width: 620px)");            // "am I on a phone-ish screen?"
  // Defensive: currentMode() can be reached (via updateLineupCollapse) from a render that
  // runs before this line assigns mq. Guard against mq still being undefined so such a call
  // can't throw; it harmlessly reads "desktop" once, then behaves normally after mq exists.
  function currentMode() { return (mq && mq.matches) ? "mobile" : "desktop"; }
  state.wizStep = 1;                                            // which wizard step (mobile)
  state.minimized = false;                                      // is the panel minimized?

  // ---- MOVE / MINIMIZE ------------------------------------------------------
  // Minimizing shrinks the panel to a small draggable "pill" (on BOTH desktop and
  // mobile); maximizing restores the full panel. Everything is dragged by its header
  // and always kept FULLY on-screen, so a maximized panel can never spill its content
  // off the edge. Three positions are remembered separately (localStorage):
  //   Max   = the maximized desktop panel
  //   PillD = the desktop pill        PillM = the mobile pill
  // (The mobile full-width sheet is always docked to the bottom, so it isn't dragged.)
  function loadPos(k) { try { var r = window.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function savePos(k, p) { try { window.localStorage.setItem(k, JSON.stringify(p)); } catch (e) {} }
  var positions = { Max: loadPos("FC26_posMax"), PillD: loadPos("FC26_posPillD"), PillM: loadPos("FC26_posPillM") };

  // ---- RESIZE (desktop only) ------------------------------------------------
  // The maximized desktop panel can be resized by dragging the bottom-right grip.
  // The chosen size is remembered in localStorage (same helpers as the drag spots)
  // and re-applied on every run. Mobile (bottom sheet) and the minimized pill are
  // NOT resizable - they keep their CSS sizing, and the grip is hidden there.
  var savedSize = loadPos("FC26_size");     // {w,h} in px, or null until first resize

  // Resize handles on every edge AND corner, so the panel can be dragged bigger/smaller
  // from any side (not just the bottom-right). The bottom-right ("se") is the visible
  // striped grip; the other seven are invisible strips laid along each edge/corner. They
  // all share ONE resize routine (wireResizeHandle below) - the DIRECTION string ("n",
  // "sw", "e", ...) tells it which edges move and which stay pinned.
  var grip = document.createElement("div");
  grip.className = "fc26-grip";
  grip.title = "Drag to resize";
  panel.appendChild(grip);
  // Build the seven extra handles. Each entry is [direction, css-class]; the SE corner is
  // the grip above. resizeHandles collects them all so applyPanelSize can show/hide them
  // together and we can wire them in one loop.
  var resizeHandles = [{ el: grip, dir: "se" }];
  [["n", "fc26-rz-n"], ["s", "fc26-rz-s"], ["e", "fc26-rz-e"], ["w", "fc26-rz-w"],
   ["ne", "fc26-rz-ne"], ["nw", "fc26-rz-nw"], ["sw", "fc26-rz-sw"]].forEach(function (d) {
    var el = document.createElement("div");
    el.className = "fc26-rz " + d[1];
    el.title = "Drag to resize";
    panel.appendChild(el);
    resizeHandles.push({ el: el, dir: d[0] });
  });

  // canResize(): the desktop dock is resizable (drag the bottom-right grip); the mobile
  // sheet and the minimized pill are not.
  function canResize() { return currentMode() === "desktop" && !state.minimized; }

  // clampSize(w,h): keep the box within sensible min sizes and the viewport.
  function clampSize(w, h) {
    return {
      w: Math.max(340, Math.min(w, window.innerWidth - 8)),
      h: Math.max(260, Math.min(h, window.innerHeight - 8))
    };
  }

  // applyPanelSize(): set an explicit width/height on the panel (overriding the CSS
  // 520px / 88vh) when a saved size exists AND we're on the resizable desktop panel;
  // otherwise clear those inline styles so the CSS sizing takes over. Also shows/hides
  // the grip. Called from applyPanelChrome so size + mode + position stay in sync.
  function applyPanelSize() {
    if (canResize() && savedSize) {
      var c = clampSize(savedSize.w, savedSize.h);
      panel.style.width = c.w + "px";
      panel.style.height = c.h + "px";
      panel.style.maxHeight = "none";       // our explicit height replaces the 88vh cap
    } else {
      panel.style.width = "";
      panel.style.height = "";
      panel.style.maxHeight = "";
    }
    // Show every resize handle on the desktop dock; hide them all on mobile / when minimized.
    var showHandles = canResize();
    resizeHandles.forEach(function (h) { h.el.style.display = showHandles ? "block" : "none"; });
  }

  // Live resize from ANY edge or corner, mirroring the header-drag pointer pattern below.
  // On pointerdown we pin the panel's current rectangle as inline left/top/width/height,
  // then each move recomputes the box: an edge named in the direction MOVES toward the
  // pointer, and the OPPOSITE edge stays put (dragging "w" keeps the right edge fixed,
  // "n" keeps the bottom fixed, and so on). Everything is clamped to a min size and the
  // viewport so the box can never invert or leave the screen.
  var MIN_W = 340, MIN_H = 260;
  var resizeState = null;
  function endResize(el) {
    if (!resizeState) return;
    var r = panel.getBoundingClientRect();
    savedSize = { w: r.width, h: r.height };
    savePos("FC26_size", savedSize);
    // A top/left drag moves the panel too, so remember the spot (Max on desktop) as well -
    // otherwise the next rebuild would snap it back to where it was before the resize.
    var slot = posSlot();
    if (slot) { positions[slot] = { left: r.left, top: r.top }; savePos("FC26_pos" + slot, positions[slot]); }
    if (resizeState.pid != null && el) { try { el.releasePointerCapture(resizeState.pid); } catch (_) {} }
    resizeState = null;
  }
  // doResize(cx,cy): apply the current pointer position to the pinned start rectangle.
  function doResize(cx, cy) {
    var s = resizeState, dir = s.dir;
    var dx = cx - s.x, dy = cy - s.y;
    var left = s.left, top = s.top, w = s.w, h = s.h;
    if (dir.indexOf("e") !== -1) {           // east: move the RIGHT edge, left pinned
      w = Math.max(MIN_W, Math.min(s.w + dx, window.innerWidth - s.left - 4));
    }
    if (dir.indexOf("w") !== -1) {           // west: move the LEFT edge, right pinned
      w = Math.max(MIN_W, Math.min(s.w - dx, s.right - 4));
      left = s.right - w;
    }
    if (dir.indexOf("s") !== -1) {           // south: move the BOTTOM edge, top pinned
      h = Math.max(MIN_H, Math.min(s.h + dy, window.innerHeight - s.top - 4));
    }
    if (dir.indexOf("n") !== -1) {           // north: move the TOP edge, bottom pinned
      h = Math.max(MIN_H, Math.min(s.h - dy, s.bottom - 4));
      top = s.bottom - h;
    }
    panel.style.left = left + "px"; panel.style.top = top + "px";
    panel.style.width = w + "px"; panel.style.height = h + "px";
    maybeReflowDesktop();   // collapse to 2 columns (or back to 3) as we cross the width threshold
  }
  // wireResizeHandle(el, dir): attach the shared resize behaviour to one handle.
  function wireResizeHandle(el, dir) {
    el.addEventListener("pointerdown", function (e) {
      if (!canResize()) return;
      e.preventDefault();
      e.stopPropagation();                   // don't let this reach the header/drag logic
      var r = panel.getBoundingClientRect();
      panel.style.left = r.left + "px"; panel.style.top = r.top + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
      panel.style.maxHeight = "none";
      // Pin the start rectangle: its corners (right/bottom) are the edges we keep fixed.
      resizeState = { dir: dir, x: e.clientX, y: e.clientY, left: r.left, top: r.top,
        w: r.width, h: r.height, right: r.left + r.width, bottom: r.top + r.height, pid: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });
    el.addEventListener("pointermove", function (e) {
      if (!resizeState) return;
      if (e.buttons === 0) { endResize(el); return; }   // missed pointerup guard
      doResize(e.clientX, e.clientY);
    });
    el.addEventListener("pointerup", function () { endResize(el); });
    el.addEventListener("pointercancel", function () { endResize(el); });
  }
  resizeHandles.forEach(function (h) { wireResizeHandle(h.el, h.dir); });

  // posSlot(): which remembered spot applies right now, or null when the panel is docked
  // (the mobile full sheet) and therefore not draggable. The desktop dock IS draggable:
  // it starts docked full-width at the bottom, but the header lifts it into a floating
  // console, and that spot is remembered under "Max".
  function posSlot() {
    if (currentMode() === "mobile") return state.minimized ? "PillM" : null;
    return state.minimized ? "PillD" : "Max";
  }
  function dragEnabled() { return posSlot() !== null; }

  // clampOnScreen(left, top, w, h): keep the WHOLE box on-screen (this is what stops a
  // maximized panel dropping its lower half off the bottom of the window).
  function clampOnScreen(left, top, w, h) {
    return {
      left: Math.max(4, Math.min(left, window.innerWidth - w - 4)),
      top: Math.max(4, Math.min(top, window.innerHeight - h - 4))
    };
  }

  // applyPanelChrome(): set the panel's CSS class (mode + minimized) and its position
  // (a remembered, clamped spot - or clear inline styles so the CSS default edge applies).
  function applyPanelChrome() {
    var m = currentMode();
    // NOTE: "gt-open" is dropped while minimized. That class sets the mobile panel to a tall
    // fixed height (#fc26-panel.fc26-mobile.gt-open{height:86vh}), and because it's a 2-class
    // rule it OUT-SPECIFICS the 1-class pill rule (.fc26-min) - so a panel minimized with the
    // builder open would keep its full height and only "half close". Minimized never needs the
    // builder height, so we simply don't add gt-open when minimized.
    panel.className = (m === "mobile" ? "fc26-mobile" : "fc26-desktop") + (state.minimized ? " fc26-min" : "") + ((state.builderOpen || state.metaPageOpen || state.dashOpen || state.scorePageOpen) && !state.minimized ? " gt-open" : "");
    applyPanelSize();     // set/clear our explicit size BEFORE clamping position (so the rect is right)
    var slot = posSlot();
    var pos = slot ? positions[slot] : null;
    if (pos) {
      var r = panel.getBoundingClientRect();
      var c = clampOnScreen(pos.left, pos.top, r.width || 300, r.height || 48);
      panel.style.left = c.left + "px"; panel.style.top = c.top + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
    } else {
      panel.style.left = ""; panel.style.top = ""; panel.style.right = ""; panel.style.bottom = "";
    }
  }

  // reclampPanel(): after the panel's HEIGHT changes (e.g. selecting a player fills the
  // right pane, or the desktop layout is (re)built), nudge it back so the WHOLE box is
  // on-screen. Only acts when the panel sits at an inline top (a dragged/pill spot) - the
  // docked defaults anchor to a CSS edge and can't overflow. This is what makes the panel
  // "auto-adjust" when you click a player instead of growing off the bottom of the window.
  function reclampPanel() {
    if (!panel.style.top) return;                       // anchored to a CSS edge -> nothing to do
    var r = panel.getBoundingClientRect();
    var c = clampOnScreen(r.left, r.top, r.width, r.height);
    panel.style.left = c.left + "px"; panel.style.top = c.top + "px";
  }

  // resetDock(): forget any dragged spot / resized size and snap back to the default
  // full-width bottom dock. Clears the saved values (memory + localStorage), un-minimizes,
  // then rebuilds - applyPanelChrome/applyPanelSize then fall back to the CSS dock defaults.
  function resetDock() {
    savedSize = null;
    positions.Max = null;
    try { window.localStorage.removeItem("FC26_size"); window.localStorage.removeItem("FC26_posMax"); } catch (e) {}
    if (state.minimized) { state.minimized = false; body.style.display = "flex"; minBtn.textContent = "–"; }
    applyLayout();
  }

  var dragState = null;
  // endDrag(): finish a drag - save the resting position and clear the drag state.
  // Called from pointerup AND pointercancel AND the "no button held" guard below, so a
  // missed pointerup can never leave the panel stuck to the cursor.
  function endDrag() {
    if (!dragState) return;
    var slot = posSlot();
    if (slot) {
      var r = panel.getBoundingClientRect();
      positions[slot] = { left: r.left, top: r.top };
      savePos("FC26_pos" + slot, positions[slot]);
    }
    if (dragState.pid != null) { try { header.releasePointerCapture(dragState.pid); } catch (_) {} }
    dragState = null;
  }
  header.addEventListener("pointerdown", function (e) {
    if (!dragEnabled()) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;                  // left mouse button only
    if (e.target && e.target.closest && e.target.closest("button, select, input")) return;   // let the –/× buttons and the theme dropdown work
    var r = panel.getBoundingClientRect();
    dragState = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, pid: e.pointerId };
    try { header.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  header.addEventListener("pointermove", function (e) {
    if (!dragState) return;
    if (e.buttons === 0) { endDrag(); return; }   // button isn't actually held (missed pointerup) -> stop
    var c = clampOnScreen(e.clientX - dragState.dx, e.clientY - dragState.dy, dragState.w, dragState.h);
    panel.style.left = c.left + "px"; panel.style.top = c.top + "px";
    panel.style.right = "auto"; panel.style.bottom = "auto";
  });
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
  // Re-clamp on window resize / phone rotate so a saved spot never ends up off-screen.
  window.addEventListener("resize", function () { applyPanelChrome(); reclampPanel(); maybeReflowDesktop(); });

  // Group 1 - Squad (search + eligible filter + player list). On desktop this becomes
  // a flex column (via .fc26-squad) so the player list flexes to fill the left pane.
  // --------------------------------------------------------------------------
  // FEATURE 2 - the "Meta Ratings" page. This used to be a collapsible section in the
  // lineup column; it's now its OWN full-panel screen (same shell as the Squad Builder):
  // a launcher tile flips the main layout out and a full-panel host in. The page has two
  // sub-views (tabs): "Rankings" (rank the club per position, moved here verbatim) and
  // "Best XI" (a depth-chart pitch, wired in step 2). Reuses scorePlayer/metaTop and the
  // Squad Builder's page chrome + pitch, so there's very little new code.
  // --------------------------------------------------------------------------
  // The launcher tile (this is what the lineup column shows; it opens the full screen).
  var metaLaunch = document.createElement("div");
  metaLaunch.className = "meta-section";
  var metaLaunchBtn = document.createElement("button");
  metaLaunchBtn.type = "button";
  metaLaunchBtn.className = "gt-launch";
  // The tile's title is the ACTIVE score's name, so the way in says which score you'd be reading.
  // Re-run setMetaLaunchLabel() after anything that changes the active score.
  function setMetaLaunchLabel() {
    var custom = isCustomScore();
    metaLaunchBtn.innerHTML = "<span class='gt-launch-ic'>📊</span>" +
      "<span class='gt-launch-tx'><b>" + esc(scoreLabel()) + "</b><i>" +
      (custom ? "Your own weighting - rankings and best XIs" : "Rank your club by position and see your best XIs") +
      "</i></span><span class='gt-launch-go'>›</span>";
  }
  setMetaLaunchLabel();
  metaLaunchBtn.addEventListener("click", openMetaPage);
  metaLaunch.appendChild(metaLaunchBtn);

  // The full-screen page lives inside the panel body, hidden until opened (reuses the
  // Squad Builder's .gt-builder container styling: flex column, own scroll).
  var metaPageHost = document.createElement("div");
  metaPageHost.className = "gt-builder";
  metaPageHost.style.display = "none";
  body.appendChild(metaPageHost);

  // Which sub-view of the Meta page is showing.
  var metaView = "rank";   // "rank" (per-position rankings) | "xi" (best-XI pitch)
  // When set, the Meta page shows a full detail card for this player INSTEAD of the list/pitch.
  // Tapping a ranking row or a pitch dot opens it; its back arrow returns to the view you were on.
  // This keeps Meta Ratings a self-contained browse experience (no jumping into the evo wizard).
  var metaDetail = null;

  // Best XI view state.
  var GT_PITCH_SVG_META = "<svg viewBox='0 0 68 92' preserveAspectRatio='none' aria-hidden='true'><g fill='none' stroke='rgba(120,180,255,.22)' stroke-width='0.35'><rect x='1.5' y='1.5' width='65' height='89' rx='1.2'/><line x1='1.5' y1='46' x2='66.5' y2='46'/><circle cx='34' cy='46' r='8.5'/><circle cx='34' cy='46' r='0.6' fill='rgba(120,180,255,.22)' stroke='none'/><rect x='15' y='1.5' width='38' height='14'/><rect x='25' y='1.5' width='18' height='5.5'/><rect x='15' y='76.5' width='38' height='14'/><rect x='25' y='85' width='18' height='5.5'/></g></svg>";
  var metaXiFormation = FORMATIONS["f433"] ? "f433" : (FORMATION_ORDER[0] || null);   // chosen formation
  var metaXiCount = 3;     // how many depth-chart teams (Team 1 = best XI, Team 2 = next, ...)
  var metaXiIdx = 0;       // which team's pitch is showing
  var metaBoards = null;   // last buildMetaBoards() result
  var metaSquads = null;   // last buildBestXiSquads() result (the XIs above + their benches)

  // metaRebuildBoards(): (re)run the depth-chart draft for the current formation + count.
  function metaRebuildBoards() {
    buildFormationCatalog();   // best-effort refresh in case formations weren't loaded when the panel opened
    metaSquads = null;
    if (!FORMATION_ORDER.length || !FORMATIONS[metaXiFormation]) {
      if (FORMATIONS["f433"]) metaXiFormation = "f433"; else if (FORMATION_ORDER[0]) metaXiFormation = FORMATION_ORDER[0];
    }
    if (!FORMATION_ORDER.length || !FORMATIONS[metaXiFormation]) { metaBoards = { empty: true, noFormations: true }; return; }
    if (!getClubPlayers().length) { metaBoards = { empty: true }; return; }
    metaBoards = buildMetaBoards(metaXiFormation, metaXiCount);
    if (metaXiIdx >= metaXiCount) metaXiIdx = 0;
    // Benches for EVERY team in one go (they share a pool, so they can't be drafted separately).
    // Cached here rather than per render: switching team pills re-renders, and re-drafting all the
    // benches each time would re-score the whole club several thousand times for no new answer.
    metaSquads = buildBestXiSquads(metaXiFormation, metaXiCount, metaBoards);
  }

  // metaSquadFor(idx): the cached 18-man squad for a depth-chart team, or an { error } object.
  function metaSquadFor(idx) {
    if (!metaSquads || metaSquads.error) return metaSquads || { error: "No squads built yet" };
    return metaSquads.squads[idx] || { error: "No team " + (idx + 1) };
  }

  // Persistent Rankings controls + list (created once; the page render re-appends them).
  var metaPos = document.createElement("select");
  metaPos.className = "meta-pos gt-select";
  metaPos.innerHTML = META_GROUPS.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("");
  var metaCount = document.createElement("select");
  metaCount.className = "meta-count gt-select";
  metaCount.innerHTML = [10, 20, 30, 50].map(function (n) { return "<option value='" + n + "'" + (n === 20 ? " selected" : "") + ">top " + n + "</option>"; }).join("");
  // Search box: find a specific player within the CURRENT position ranking (e.g. "Garnacho" while
  // on ST). Matching players show at their TRUE rank even if outside the top N; players who can't
  // play the chosen position never appear. Accent-tolerant (reuses playerSearchText / normName).
  var metaSearch = document.createElement("input");
  metaSearch.type = "text";
  metaSearch.className = "meta-search gt-select";
  metaSearch.placeholder = "search this position by name...";
  metaSearch.style.cssText = "flex:1;min-width:0;width:100%;box-sizing:border-box";
  var metaList = document.createElement("div");
  metaList.className = "meta-list mp-list";
  var metaNote = document.createElement("div");
  metaNote.className = "meta-note";
  metaPos.addEventListener("change", renderMetaRating);
  metaCount.addEventListener("change", renderMetaRating);
  metaSearch.addEventListener("input", renderMetaRating);

  state.metaPageOpen = false;

  // openMetaPage()/closeMetaPage(): mirror openBuilder/closeBuilder - flip the main layout
  // out, the meta page in (and add the mobile "gt-open" height class via applyPanelChrome).
  function openMetaPage() {
    state.metaPageOpen = true;
    metaDetail = null;                       // always open on the list/pitch, not a stale detail
    metaPageHost.style.display = "flex";
    layoutHost.style.display = "none";
    applyPanelChrome();
    renderMetaPage();
  }
  function closeMetaPage() {
    state.metaPageOpen = false;
    metaDetail = null;
    metaPageHost.style.display = "none";
    layoutHost.style.display = "flex";
    applyPanelChrome();
  }
  function setMetaView(v) { metaView = v; renderMetaPage(); }

  // showMetaDetail(it): open the in-page player detail. Selects the player (keepStep=true so it
  // never advances the mobile evo wizard behind the overlay), then redraws the page in detail mode.
  function showMetaDetail(it) {
    try { selectPlayer(it, true); } catch (e) { state.player = it; }
    metaDetail = it;
    renderMetaPage();
  }
  function closeMetaDetail() { metaDetail = null; renderMetaPage(); }

  // renderMetaPage(): (re)build the whole page for the current sub-view. Header (back +
  // title), a two-tab strip (Rankings / Best XI), then the active view's body.
  function renderMetaPage() {
    if (!state.metaPageOpen) return;
    metaPageHost.innerHTML = "";
    if (metaDetail) { renderMetaDetail(); return; }   // detail card takes over the whole page

    var top = document.createElement("div"); top.className = "gt-bd-top";
    var back = document.createElement("button"); back.type = "button"; back.className = "gt-bd-back"; back.textContent = "‹"; back.title = "Back"; back.addEventListener("click", closeMetaPage);
    var ttl = document.createElement("div"); ttl.className = "gt-bd-title"; ttl.innerHTML = "<span class='gt-bd-eyebrow'>Men Gallant FC</span><b>" + esc(scoreLabel()) + "</b>";
    top.appendChild(back); top.appendChild(ttl);
    // Peks Lab lives HERE rather than as another tile in the Lineup column: it changes
    // this page's numbers, so this is where you'd reach for it. It picks up an accent ring
    // while a custom score is active, so you can't be looking at custom rankings unaware.
    var ssBtn = document.createElement("button"); ssBtn.type = "button";
    ssBtn.className = "ss-hdrbtn" + (isCustomScore() ? " on" : "");
    // Icon + label. To change the icon, edit the one emoji below - nothing else depends on it.
    ssBtn.innerHTML = "<span class='ic'>🔧</span><span class='tx-full'>Peks Lab</span><span class='tx-short'>Peks Lab</span>";
    ssBtn.title = isCustomScore() ? "Peks Lab (your own weighting is active)" : "Peks Lab";
    ssBtn.setAttribute("aria-label", ssBtn.title);
    ssBtn.addEventListener("click", function () { openScorePage("meta"); });
    top.appendChild(ssBtn);
    metaPageHost.appendChild(top);

    // Sub-view tab strip (reuses the Squad Builder's pill styling).
    var tabs = document.createElement("div"); tabs.className = "mp-tabs";
    [["rank", "Rankings"], ["xi", "Best XI"]].forEach(function (t) {
      var b = document.createElement("button"); b.type = "button"; b.className = "gt-sqpill";
      b.textContent = t[1]; b.setAttribute("aria-selected", String(metaView === t[0]));
      b.addEventListener("click", function () { setMetaView(t[0]); });
      tabs.appendChild(b);
    });
    metaPageHost.appendChild(tabs);

    var view = document.createElement("div"); view.className = "mp-body";
    if (metaView === "rank") {
      var controls = document.createElement("div"); controls.className = "meta-controls mp-controls";
      controls.appendChild(metaPos); controls.appendChild(metaCount);
      view.appendChild(controls);
      var searchRow = document.createElement("div"); searchRow.className = "meta-controls mp-controls";
      searchRow.appendChild(metaSearch);
      view.appendChild(searchRow);
      view.appendChild(metaList);
      view.appendChild(metaNote);
    } else {
      renderMetaXiInto(view);
    }
    metaPageHost.appendChild(view);
    renderMetaRating();
  }

  // renderMetaDetail(): the in-page player detail card (shown when metaDetail is set). Read-focused:
  // big OVR + Justaino pill, a per-position meta breakdown, face stats, and current PlayStyles. The
  // back arrow returns to whichever view you came from (Rankings / Best XI); "Edit PlayStyles" is the
  // one explicit door OUT into the evo tool. Reuses the spotlight's pv-* styles + faceStatsHTML.
  function renderMetaDetail() {
    var it = metaDetail;
    var fromLabel = (metaView === "xi") ? "Best XI" : "Rankings";

    var top = document.createElement("div"); top.className = "gt-bd-top";
    var back = document.createElement("button"); back.type = "button"; back.className = "gt-bd-back"; back.textContent = "‹"; back.title = "Back to " + fromLabel; back.addEventListener("click", closeMetaDetail);
    var ttl = document.createElement("div"); ttl.className = "gt-bd-title"; ttl.innerHTML = "<span class='gt-bd-eyebrow'>Back to " + esc(fromLabel) + "</span><b>Player detail</b>";
    top.appendChild(back); top.appendChild(ttl);
    metaPageHost.appendChild(top);

    var body = document.createElement("div"); body.className = "mp-body mp-detail";

    // Headline: OVR + best Justaino pill + name/rarity/positions.
    var jr = null; try { jr = bestJustaino(it); } catch (e) {}
    var jrHTML = jr ? "<span class='pv-jr'>" + scoreLabel().toUpperCase() + " " + jr.score.total.toFixed(1) + " &middot; " + esc(jr.group) + "</span>" : "";
    var posLine = ""; try { var pg = playerPositionGroups(it); if (pg && pg.length) posLine = " &middot; " + esc(pg.join(", ")); } catch (e) {}

    // Per-position breakdown (shared with the spotlight card + mobile Deck summary).
    var perPos = scoreByPositionHTML(it);

    // Current PlayStyles, split PS+ / Basic (same chip markup as the spotlight card).
    var plus = [], basic = [];
    currentPlayStyles(it).forEach(function (p) { (p.isIcon ? plus : basic).push({ traitId: p.traitId, name: traitName[p.traitId] || ("trait " + p.traitId) }); });
    function groupHTML(label, list, isPlus) {
      if (!list.length) return "";
      var chips = list.map(function (e) { return "<span class='pv-chip" + (isPlus ? " plus" : "") + "'><i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + e.traitId + "'></i>" + esc(e.name) + "</span>"; }).join("");
      return "<div class='pv-group'><div class='pv-gl'>" + label + "</div><div class='pv-chips'>" + chips + "</div></div>";
    }
    var noneMsg = (!plus.length && !basic.length) ? "<div class='pv-none'>No PlayStyles yet.</div>" : "";

    body.innerHTML =
      "<div class='pv-hero'>" +
        "<div class='pv-numwrap'><span class='pv-num'>" + (it.rating != null ? it.rating : "?") + "</span>" + jrHTML + "</div>" +
        "<div class='pv-herowho'>" +
          "<div class='pv-nm'>" + esc(playerName(it)) + (isGKPlayer(it) ? "<span class='pv-gk'>GK</span>" : "") + "</div>" +
          "<div class='pv-sub'>" + esc(rarityName(it)) + posLine + "</div>" +
        "</div>" +
      "</div>" +
      perPos +
      faceStatsHTML(it) +
      noneMsg +
      groupHTML("PlayStyle+", plus, true) +
      groupHTML("Basic", basic, false) +
      "<button type='button' class='mp-edit'>Edit PlayStyles →</button>";
    metaPageHost.appendChild(body);

    // "Edit PlayStyles": leave the Meta page and open this player in the evo tool's Deck.
    var edit = body.querySelector(".mp-edit");
    if (edit) edit.addEventListener("click", function () {
      closeMetaPage();
      if (currentMode() === "mobile") { goStep(2); } else { renderPreview(); }
    });
  }

  // renderMetaXiInto(view): build the Best XI sub-view - a formation + team-count picker, team
  // pills (Team 1 / 2 / 3...), an average stat strip, and the chosen team on a pitch. The dot
  // drawing mirrors the Squad Builder's renderGtPitch (reusing all the .gt-pitch/.gt-dot styles).
  function renderMetaXiInto(view) {
    // This sub-view now has content BELOW the pitch (bench + create), so let it scroll instead
    // of the pitch eating all the height (mp-body is overflow:hidden by default). The pitch keeps
    // a min-height (set below) so it stays usable and pushes overflow into the scroll.
    view.style.overflowY = "auto";
    // (Re)build boards if we have none yet, or the last attempt was empty (e.g. club loaded since).
    if (!metaBoards || metaBoards.empty) metaRebuildBoards();

    // Formation + team-count controls.
    var controls = document.createElement("div"); controls.className = "meta-controls mp-controls";
    controls.appendChild(gtSelectEl(FORMATION_ORDER, metaXiFormation, function (v) { metaXiFormation = v; metaRebuildBoards(); renderMetaPage(); }, fmtFormation));
    controls.appendChild(gtSelectEl([1, 2, 3, 4, 5], metaXiCount, function (v) { metaXiCount = parseInt(v, 10); metaRebuildBoards(); renderMetaPage(); }, function (n) { return "Top " + n; }));
    view.appendChild(controls);

    // If we can't build (no formations / no club), show a friendly note and stop.
    if (!metaBoards || metaBoards.empty) {
      var w = document.createElement("div"); w.className = "gt-warn2";
      w.innerHTML = metaBoards && metaBoards.noFormations
        ? "Formations haven't loaded yet. Open the <b>Squads</b> screen in the app once, then reopen this page."
        : "No club players loaded yet. Go back, tap <b>↻ Reload club</b>, then reopen this page.";
      view.appendChild(w);
      return;
    }

    var teams = metaBoards.teams;
    if (metaXiIdx >= teams.length) metaXiIdx = 0;
    var team = teams[metaXiIdx];

    // Team pills (only shown when there's more than one team to switch between).
    if (teams.length > 1) {
      var pills = document.createElement("div"); pills.className = "gt-sqpills";
      teams.forEach(function (tm, i) {
        var b = document.createElement("button"); b.type = "button"; b.className = "gt-sqpill";
        b.textContent = "Team " + (i + 1); b.setAttribute("aria-selected", String(i === metaXiIdx));
        b.addEventListener("click", function () { metaXiIdx = i; renderMetaPage(); });
        pills.appendChild(b);
      });
      view.appendChild(pills);
    }

    // Average stat strip: Justaino meta avg, true OVR avg, placed count, biggest league bloc.
    var strip = document.createElement("div"); strip.className = "gt-statstrip";
    strip.innerHTML =
      "<div class='gt-stat'><div class='v a'>" + team.avg + "</div><div class='k'>JST avg</div></div>" +
      "<div class='gt-stat'><div class='v g'>" + team.ovrAvg + "</div><div class='k'>OVR avg</div></div>" +
      "<div class='gt-stat'><div class='v'>" + team.filled + "/11</div><div class='k'>Placed</div></div>" +
      "<div class='gt-stat'><div class='v'>" + team.chem.maxLeague + "</div><div class='k'>League</div></div>";
    view.appendChild(strip);

    // The pitch (own element, so it never touches the Squad Builder's gtEls.pitch).
    var pw = document.createElement("div"); pw.className = "gt-pitchwrap"; pw.style.minHeight = "260px";
    var pitch = document.createElement("div"); pitch.className = "gt-pitch"; pitch.innerHTML = GT_PITCH_SVG_META;
    pw.appendChild(pitch);
    view.appendChild(pw);

    var coords = FORMATION_DOTS[team.formation] || [];
    coords.forEach(function (c, i) {
      var pos = c[0], x = c[1], y = c[2], cell = team.slots[i], p = cell && cell.player;
      var d = document.createElement("div");
      d.className = "gt-dot " + (p ? ("t-" + gtTier(cell.score)) : "empty");
      d.style.left = x + "%"; d.style.top = y + "%";
      if (p) {
        d.innerHTML = "<div class='gt-disc'>" + (p.rating != null ? p.rating : "?") + "</div><div class='gt-nm'>" + esc(playerName(p)) + "</div><div class='gt-meta'>" + esc(pos) + " · JS " + Math.round(cell.score) + "</div>";
        d.title = playerName(p) + " (" + (cell.group || pos) + ", Justaino " + cell.score + ") - tap for detail";
        d.style.cursor = "pointer";
        d.addEventListener("click", function () { showMetaDetail(p); });
      } else {
        d.innerHTML = "<div class='gt-disc'>–</div><div class='gt-nm'>open</div><div class='gt-meta'>" + esc(pos) + "</div>";
      }
      pitch.appendChild(d);
    });

    // --- CREATE THIS SQUAD (under whichever team is being viewed) ---------------------------
    // Shows the rules-based bench (so you see the FULL squad before committing) and a Create
    // button that saves it in game as "Justaino Score Squad N". Offered on ANY team whose XI is
    // complete - Team 1 creates the best XI, Team 2 the 2nd-best, etc. The bench comes from the
    // shared draft done in metaRebuildBoards, so no player appears on two teams anywhere.
    if (team.filled === 11) {
      var jsq = metaSquadFor(metaXiIdx);
      if (!jsq.error) {
        var teamTag = (teams.length > 1) ? ("Team " + (metaXiIdx + 1) + " · ") : "";
        // Bench preview: 7 chips, each "POS Name score". reqLabel is the guaranteed spot
        // (ST/LM/RM/CM/CB/LB/RB); the last, unlabelled one shows as "SUB" (best remaining).
        var benchBox = document.createElement("div"); benchBox.className = "gt-bench"; benchBox.style.marginTop = "10px";
        var chips = jsq.subs.map(function (c) {
          var lab = c.reqLabel || "SUB";
          return c.player
            ? "<span class='gt-chip'><span style='color:var(--muted);font-weight:800;font-size:9px;letter-spacing:.06em'>" + esc(lab) + "</span> " + esc(playerName(c.player)) + " <b>" + Math.round(c.score) + "</b></span>"
            : "<span class='gt-chip' style='opacity:.55'>" + esc(lab) + " (none)</span>";
        }).join("");
        // On a multi-team chart the benches are drafted from one shared pool (Team 1 first), so say
        // so - it explains why Team 1's bench is stronger than Team 3's, and why no name repeats.
        var benchWhat = (teams.length > 1) ? "no player used twice" : "next best";
        benchBox.innerHTML = "<div class='bl'>" + teamTag + "Bench · " + benchWhat + " · 7 subs" + (jsq.subAvg ? " · avg " + jsq.subAvg : "") + "</div><div class='gt-chips'>" + chips + "</div>";
        view.appendChild(benchBox);

        // If a required bench spot couldn't be filled (club too thin there), say so honestly.
        if (jsq.missing && jsq.missing.length) {
          var mw = document.createElement("div"); mw.className = "gt-warn2"; mw.style.marginTop = "8px";
          mw.innerHTML = "No spare <b>" + esc(jsq.missing.join(", ")) + "</b> in your club for the bench - those slots use your next-best players instead.";
          view.appendChild(mw);
        }

        // Actions: Create + Remove + a status line (its OWN element, separate from the builder's).
        var jActions = document.createElement("div"); jActions.className = "gt-actions"; jActions.style.marginTop = "10px";
        var jArow = document.createElement("div"); jArow.className = "gt-arow";
        var jCreate = document.createElement("button"); jCreate.type = "button"; jCreate.className = "gt-cbtn"; jCreate.textContent = "Create " + scoreLabel() + " Squad";
        var jRemove = document.createElement("button"); jRemove.type = "button"; jRemove.className = "gt-rbtn"; jRemove.textContent = "Remove " + scoreLabel() + " squads";
        jArow.appendChild(jCreate); jArow.appendChild(jRemove);
        var jStatus = document.createElement("div"); jStatus.className = "gt-status";
        jActions.appendChild(jArow); jActions.appendChild(jStatus);
        view.appendChild(jActions);

        jCreate.addEventListener("click", function () { runCreateJustainoSquad(jStatus, jCreate, jRemove); });
        jRemove.addEventListener("click", function () { runRemoveJustainoSquads(jStatus, jCreate, jRemove); });
      }
    }
  }

  // renderMetaRating(): rank the loaded club for the chosen position and draw the rows.
  // Safe to call any time (selectPlayer / loadFullClub call it) - it no-ops unless the
  // Meta page is open on the Rankings view. Same rows/markup as the old collapsible view.
  function renderMetaRating() {
    if (!state.metaPageOpen || metaView !== "rank") return;
    var group = metaPos.value;
    var n = parseInt(metaCount.value, 10) || 20;
    var players = getClubPlayers();
    if (!players.length) { metaList.innerHTML = ""; metaNote.textContent = "No club players yet - load your club first (close this, tap ↻ Reload club, then reopen)."; return; }

    // FULL ranking for this position (every player who can play the group), so a searched
    // player's TRUE rank is known even when they're outside the top N. metaTop with a huge n
    // returns the whole sorted list; we tag each entry with its 1-based rank.
    var full = metaTop(group, 1e9);
    full.forEach(function (r, i) { r.rank = i + 1; });

    // Search: when the box has text, show ONLY players in THIS position whose name matches, each
    // at their real rank (in or out of the top N). Empty box = the normal top-N view. Players who
    // can't play this position are never in `full`, so they never appear - exactly as intended.
    var q = normName((metaSearch.value || "").trim());
    var searching = q.length > 0;
    var rows = searching
      ? full.filter(function (r) { return playerSearchText(r.it).indexOf(q) !== -1; })
      : full.slice(0, n);

    metaList.innerHTML = "";
    rows.forEach(function (r) {
      var it = r.it, sc = r.score;
      var row = document.createElement("div");
      row.className = "meta-row" + (state.player && state.player.id === it.id ? " on" : "");
      // strip of the player's actual PlayStyle+ icons only (same as the lineup list),
      // so it honestly shows how many PS+ they have - NOT every owned meta PlayStyle.
      var psPlus = currentPlayStyles(it).filter(function (p) { return p.isIcon; });
      var psHTML = psPlus.map(function (p) { return "<i class='ico icon_icontrait" + p.traitId + "'></i>"; }).join("");
      row.innerHTML =
        "<span class='meta-rank'>" + r.rank + "</span>" +
        "<span class='meta-ovr'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        "<span class='meta-nm'>" + esc(playerName(it)) + (isGKPlayer(it) ? "<span class='meta-gk'>GK</span>" : "") + "</span>" +
        "<span class='meta-ps'>" + psHTML + "</span>" +
        "<span class='meta-score'><b>" + sc.total.toFixed(1) + "</b><span class='meta-split'>" + sc.statPart + " + " + sc.psPart + "</span></span>";
      row.title = playerName(it) + " as " + group + (sc.role ? " (" + sc.role + ")" : "") + " (out of 100): meta " + sc.metaBlend + " (stats " + sc.statPart + " + PlayStyles " + sc.psPart + "), blended " + Math.round(CFG.ovrMix * 100) + "% with OVR " + sc.ovr + " = " + sc.total + "  [raw stat avg " + sc.stat + ", PlayStyle score " + sc.psScore + "]";
      row.addEventListener("click", function () { showMetaDetail(it); });
      metaList.appendChild(row);
    });
    if (searching) {
      metaNote.textContent = rows.length
        ? ("Found " + rows.length + " matching \"" + metaSearch.value.trim() + "\" as " + group + " - rank = their place in your full " + group + " list of " + full.length + ".")
        : ("No " + group + " matching \"" + metaSearch.value.trim() + "\" in your club. Players who can't play " + group + " don't appear here.");
    } else {
      // The note names WHICH score did the ranking, and states the live mix, so a screenshot of a
      // custom ranking can't be mistaken for the shipped Justaino one.
      metaNote.textContent = "Ranked " + rows.length + " of " + full.length + " as " + group + " by " + scoreLabel() +
        " (stats " + Math.round(CFG.statMix * 100) + "%, PlayStyles " + Math.round(CFG.psMix * 100) +
        "%, a PlayStyle+ counts " + CFG.psPlusMult + "x a basic). Tap a row for full detail.";
    }
  }

  // --------------------------------------------------------------------------
  // GAUNTLET SQUAD BUILDER (Feature 3) - a collapsible section, same shape as the
  // Meta rating one. Pick a formation + how many squads (N), press Build, and get
  // N non-overlapping XIs drafted off the Justaino score. Display only.
  // --------------------------------------------------------------------------
  // ---- FEATURE (v15): full-screen Gauntlet squad builder ----------------------
  // The Gauntlet builder is now its OWN screen (a pitch with a dot per player),
  // opened by a launch button and closed with a back arrow. It reuses buildGauntlet
  // for the draft and createGameSquad/removeGameSquad for the writes.

  // FORMATION_DOTS (pitch coordinates per slot) is now built LIVE from the game catalog by
  // buildFormationCatalog() near the top of the file - it's no longer hardcoded here.
  var GT_PITCH_SVG = "<svg viewBox='0 0 68 92' preserveAspectRatio='none' aria-hidden='true'><g fill='none' stroke='rgba(120,180,255,.22)' stroke-width='0.35'><rect x='1.5' y='1.5' width='65' height='89' rx='1.2'/><line x1='1.5' y1='46' x2='66.5' y2='46'/><circle cx='34' cy='46' r='8.5'/><circle cx='34' cy='46' r='0.6' fill='rgba(120,180,255,.22)' stroke='none'/><rect x='15' y='1.5' width='38' height='14'/><rect x='25' y='1.5' width='18' height='5.5'/><rect x='15' y='76.5' width='38' height='14'/><rect x='25' y='85' width='18' height='5.5'/></g></svg>";

  var gtBuild = null;          // last buildGauntlet() result (the drafted squads)
  // Default to 4-3-3 (f433) when the game offers it, else the first formation in the catalog.
  var gtFormation = FORMATIONS["f433"] ? "f433" : FORMATION_ORDER[0];   // GLOBAL default (the top picker; sets every squad)
  var gtFormations = [];       // per-squad formation names; squad i uses gtFormations[i]
  var gtCount = 3;
  var gtSquadIdx = 0;          // which squad's pitch is showing
  var gtBenchOpen = false;     // mobile bench collapsible
  var gtEls = {};              // live references to the dynamic bits of the current view
  state.builderOpen = false;
  state.gtRunning = false;

  // Launch button (this is what the Lineup column shows; it opens the full screen).
  var gtSection = document.createElement("div");
  gtSection.className = "meta-section";
  var gtLaunch = document.createElement("button");
  gtLaunch.type = "button";
  gtLaunch.className = "gt-launch";
  gtLaunch.innerHTML = "<span class='gt-launch-ic'>\u26BD</span>" +
    "<span class='gt-launch-tx'><b>Squad Builder</b><i>Build no-overlap Gauntlet squads on a pitch</i></span>" +
    "<span class='gt-launch-go'>\u203A</span>";
  gtLaunch.addEventListener("click", openBuilder);
  gtSection.appendChild(gtLaunch);

  // The full-screen overlay lives inside the panel body, hidden until opened.
  var builderHost = document.createElement("div");
  builderHost.className = "gt-builder";
  builderHost.style.display = "none";
  body.appendChild(builderHost);

  // Small DOM helpers -----------------------------------------------------------
  function gtTier(sc) { return sc >= 85 ? "elite" : sc >= 78 ? "gold" : sc >= 70 ? "solid" : "low"; }
  function gtLab(t) { var s = document.createElement("span"); s.className = "gt-clab"; s.textContent = t; return s; }
  function gtSegEl(items, current, onPick) {
    var seg = document.createElement("div"); seg.className = "gt-seg";
    items.forEach(function (v) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = v; b.setAttribute("aria-pressed", String(v == current));
      b.addEventListener("click", function () { Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); onPick(v); });
      seg.appendChild(b);
    });
    return seg;
  }
  function gtSelectEl(items, current, onChange, fmt) {
    var s = document.createElement("select"); s.className = "gt-select";
    items.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = fmt ? fmt(v) : v; if (v == current) o.selected = true; s.appendChild(o); });
    s.addEventListener("change", function () { onChange(s.value); });
    return s;
  }
  function gtMkPitch() { var w = document.createElement("div"); w.className = "gt-pitchwrap"; var p = document.createElement("div"); p.className = "gt-pitch"; p.innerHTML = GT_PITCH_SVG; w.appendChild(p); gtEls.pitch = p; return w; }
  function gtMkActions(mobile) {
    var a = document.createElement("div"); a.className = "gt-actions";
    var cb = document.createElement("button"); cb.type = "button"; cb.className = "gt-cbtn"; cb.addEventListener("click", runCreateGauntlet);
    var rb = document.createElement("button"); rb.type = "button"; rb.className = "gt-rbtn"; rb.textContent = "Remove Gauntlet squads"; rb.addEventListener("click", runRemoveGauntlet);
    gtEls.createBtn = cb; gtEls.removeBtn = rb;
    if (mobile) { var row = document.createElement("div"); row.className = "gt-arow"; row.appendChild(cb); row.appendChild(rb); a.appendChild(row); }
    else { a.appendChild(cb); a.appendChild(rb); }
    var st = document.createElement("div"); st.className = "gt-status"; gtEls.statusEl = st; a.appendChild(st);
    return a;
  }
  function gtSline(t) { return "<div class='gt-sline'>" + esc(t) + "</div>"; }
  function gtProgress(t, pct) { return "<div class='gt-sline'><span class='rm-spin'></span><span>" + esc(t) + "</span></div><div class='gt-pbar'><i style='width:" + pct + "%'></i></div>"; }
  function gtToast(kind, t) { return "<div class='gt-toast " + kind + "'><span class='gt-badge'>" + (kind === "ok" ? "\u2713" : "!") + "</span><span>" + esc(t) + "</span></div>"; }
  function setGtStatus(html) { if (gtEls.statusEl) gtEls.statusEl.innerHTML = html; }

  // Per-squad formations. gtFormations[i] is squad i's formation; any missing/invalid entry
  // (e.g. a squad we just added when the count grew) falls back to the GLOBAL default
  // gtFormation. The top "All" picker sets every squad; each squad's own dropdown overrides one.
  function ensureFormations() {
    for (var i = 0; i < gtCount; i++) {
      if (!gtFormations[i] || !FORMATIONS[gtFormations[i]]) gtFormations[i] = gtFormation;
    }
    gtFormations.length = gtCount;   // trim extras if the count shrank
  }
  function setAllFormations(v) { gtFormation = v; for (var i = 0; i < gtCount; i++) gtFormations[i] = v; }

  // doBuild(): run the draft for the current per-squad formations + count into gtBuild.
  function doBuild() {
    if (!FORMATION_ORDER.length || !FORMATIONS[gtFormation]) { gtBuild = { empty: true, noFormations: true }; return; }
    var players = getClubPlayers();
    if (!players.length) { gtBuild = { empty: true }; return; }
    ensureFormations();
    gtBuild = buildGauntlet(gtFormations, gtCount);   // pass the per-squad array
    if (gtSquadIdx >= gtCount) gtSquadIdx = 0;
  }

  function openBuilder() {
    state.builderOpen = true;
    // Refresh the formation catalog from the game in case it wasn't loaded at script start.
    // If we now have formations but the current pick isn't valid, re-point to a sensible default.
    if (buildFormationCatalog() && !FORMATIONS[gtFormation]) {
      gtFormation = FORMATIONS["f433"] ? "f433" : FORMATION_ORDER[0];
    }
    doBuild();
    builderHost.style.display = "flex";
    layoutHost.style.display = "none";
    applyPanelChrome();   // adds the "gt-open" class so the mobile panel gets a definite height
    renderBuilder();
    refreshGauntletCount();
  }
  function closeBuilder() {
    state.builderOpen = false;
    builderHost.style.display = "none";
    layoutHost.style.display = "flex";
    applyPanelChrome();   // drops "gt-open" so the mobile panel goes back to auto height
  }
  // Formation/count/Rebuild changed: re-draft and redraw the body (keeps the shell).
  function onBuildChange() {
    doBuild();
    if (gtSquadIdx >= gtCount) gtSquadIdx = 0;
    renderGtBody();
    if (!state.gtRunning) setGtStatus(gtSline("Nothing is created until you tap Create."));
  }

  // renderBuilder(): (re)build the whole screen for the current mode (desktop/mobile).
  function renderBuilder() {
    if (!state.builderOpen) return;
    var mobile = currentMode() === "mobile";
    builderHost.innerHTML = "";
    gtEls = {};

    var top = document.createElement("div"); top.className = "gt-bd-top";
    var back = document.createElement("button"); back.type = "button"; back.className = "gt-bd-back"; back.textContent = "\u2039"; back.title = "Back"; back.addEventListener("click", closeBuilder);
    var ttl = document.createElement("div"); ttl.className = "gt-bd-title"; ttl.innerHTML = "<span class='gt-bd-eyebrow'>Men Gallant FC</span><b>Squad Builder</b>";
    top.appendChild(back); top.appendChild(ttl);
    if (mobile) {
      // Formation is a DROPDOWN (29 formations won't fit a segmented control); labelled by display name.
      // This top picker is the GLOBAL default: it sets EVERY squad. Per-squad overrides are below the pills.
      top.appendChild(gtSelectEl(FORMATION_ORDER, gtFormation, function (v) { setAllFormations(v); onBuildChange(); }, fmtFormation));
      top.appendChild(gtSelectEl([3, 4, 5], gtCount, function (v) { gtCount = parseInt(v, 10); onBuildChange(); }, function (n) { return n + " sq"; }));
    }
    builderHost.appendChild(top);

    if (!mobile) {
      var ctr = document.createElement("div"); ctr.className = "gt-bd-controls";
      ctr.appendChild(gtLab("All"));
      // Dropdown (not a segmented control) - the full catalog is too long for buttons.
      // GLOBAL default: sets every squad. Each squad's tab has its own override dropdown.
      ctr.appendChild(gtSelectEl(FORMATION_ORDER, gtFormation, function (v) { setAllFormations(v); onBuildChange(); }, fmtFormation));
      ctr.appendChild(gtLab("Squads"));
      ctr.appendChild(gtSegEl([3, 4, 5], gtCount, function (v) { gtCount = v; onBuildChange(); }));
      var grow = document.createElement("span"); grow.style.flex = "1"; ctr.appendChild(grow);
      var reb = document.createElement("button"); reb.type = "button"; reb.className = "gt-rebuild"; reb.textContent = "\u21BB Rebuild"; reb.addEventListener("click", onBuildChange); ctr.appendChild(reb);
      builderHost.appendChild(ctr);

      var tabs = document.createElement("div"); tabs.className = "gt-bd-tabs"; gtEls.tabs = tabs; builderHost.appendChild(tabs);
      var main = document.createElement("div"); main.className = "gt-bd-main";
      main.appendChild(gtMkPitch());
      var side = document.createElement("div"); side.className = "gt-bd-side";
      var strip = document.createElement("div"); strip.className = "gt-statstrip"; gtEls.stats = strip; side.appendChild(strip);
      var bench = document.createElement("div"); bench.className = "gt-bench"; gtEls.bench = bench; side.appendChild(bench);
      side.appendChild(gtMkActions(false));
      main.appendChild(side);
      builderHost.appendChild(main);
    } else {
      var pills = document.createElement("div"); pills.className = "gt-sqpills"; gtEls.pills = pills; builderHost.appendChild(pills);
      // Per-squad formation override for the ACTIVE squad (pills are too small to embed a select).
      var mform = document.createElement("div"); mform.className = "gt-mform"; gtEls.mform = mform; builderHost.appendChild(mform);
      var summary = document.createElement("div"); summary.className = "gt-summary"; gtEls.summary = summary; builderHost.appendChild(summary);
      builderHost.appendChild(gtMkPitch());
      var b2 = document.createElement("div"); b2.className = "gt-bench2";
      var bt = document.createElement("button"); bt.type = "button"; bt.className = "gt-benchtoggle"; bt.setAttribute("aria-expanded", String(gtBenchOpen));
      var bb = document.createElement("div"); bb.className = "gt-benchbody" + (gtBenchOpen ? " open" : "");
      bt.addEventListener("click", function () { gtBenchOpen = !gtBenchOpen; bt.setAttribute("aria-expanded", String(gtBenchOpen)); bb.classList.toggle("open", gtBenchOpen); renderGtBench(); });
      gtEls.benchToggle = bt; gtEls.benchBody = bb;
      b2.appendChild(bt); b2.appendChild(bb); builderHost.appendChild(b2);
      builderHost.appendChild(gtMkActions(true));
    }

    renderGtBody();
    if (!state.gtRunning) setGtStatus(gtSline("Nothing is created until you tap Create."));
  }

  // renderGtBody(): fill the dynamic bits (squad switch, pitch, stats, bench, actions).
  function renderGtBody() { renderGtSquadSwitch(); renderGtPitch(); renderGtInfo(); renderGtBench(); updateBuilderActions(); }

  function renderGtSquadSwitch() {
    if (gtEls.tabs) {
      gtEls.tabs.innerHTML = "";
      for (var i = 0; i < gtCount; i++) {
        (function (idx) {
          var sq = (gtBuild && gtBuild.squads) ? gtBuild.squads[idx] : null;
          var fname = gtFormations[idx] || gtFormation;
          // A DIV (not a button) so it can hold a native <select> for this squad's formation.
          var tab = document.createElement("div"); tab.className = "gt-tab"; tab.setAttribute("aria-selected", String(idx === gtSquadIdx));
          var hd = document.createElement("div");
          hd.innerHTML = "<span class='tn'>Squad " + (idx + 1) + "</span><span class='ta'>" + (sq ? sq.ovrAvg : "\u2014") + "</span>";
          tab.appendChild(hd);
          // This squad's own formation override (changing it re-drafts and keeps this squad selected).
          var sel = gtSelectEl(FORMATION_ORDER, fname, function (v) { gtFormations[idx] = v; gtSquadIdx = idx; onBuildChange(); }, fmtFormation);
          sel.className = "gt-select gt-tabsel";
          sel.addEventListener("mousedown", function (e) { e.stopPropagation(); });   // don't let the select's click re-trigger the tab
          sel.addEventListener("click", function (e) { e.stopPropagation(); });
          tab.appendChild(sel);
          tab.addEventListener("click", function () { gtSquadIdx = idx; renderGtBody(); });
          gtEls.tabs.appendChild(tab);
        })(i);
      }
    }
    if (gtEls.pills) {
      gtEls.pills.innerHTML = "";
      for (var j = 0; j < gtCount; j++) {
        (function (idx) {
          var b = document.createElement("button"); b.type = "button"; b.className = "gt-sqpill"; b.textContent = String(idx + 1); b.setAttribute("aria-selected", String(idx === gtSquadIdx));
          b.addEventListener("click", function () { gtSquadIdx = idx; renderGtPitch(); renderGtInfo(); renderGtBench(); renderGtSquadSwitch(); });
          gtEls.pills.appendChild(b);
        })(j);
      }
    }
    // Mobile: a single formation dropdown for the ACTIVE squad, refreshed as the pills change.
    if (gtEls.mform) {
      gtEls.mform.innerHTML = "";
      var lab = document.createElement("span"); lab.className = "gt-mform-lab"; lab.textContent = "Squad " + (gtSquadIdx + 1) + " formation";
      var msel = gtSelectEl(FORMATION_ORDER, gtFormations[gtSquadIdx] || gtFormation, function (v) { gtFormations[gtSquadIdx] = v; onBuildChange(); }, fmtFormation);
      msel.className = "gt-select gt-mform-sel";
      gtEls.mform.appendChild(lab); gtEls.mform.appendChild(msel);
    }
  }

  function renderGtPitch() {
    var pitch = gtEls.pitch; if (!pitch) return;
    Array.prototype.slice.call(pitch.querySelectorAll(".gt-dot")).forEach(function (d) { d.remove(); });
    if (!gtBuild || gtBuild.empty || !gtBuild.squads) return;
    var sq = gtBuild.squads[gtSquadIdx] || gtBuild.squads[0];
    var coords = FORMATION_DOTS[sq.formation] || [];   // this squad's own formation shape
    coords.forEach(function (c, i) {
      var pos = c[0], x = c[1], y = c[2], cell = sq.slots[i], p = cell && cell.player;
      var d = document.createElement("div");
      d.className = "gt-dot " + (p ? ("t-" + gtTier(cell.score)) : "empty");
      d.style.left = x + "%"; d.style.top = y + "%";
      if (p) {
        d.innerHTML = "<div class='gt-disc'>" + (p.rating != null ? p.rating : "?") + "</div><div class='gt-nm'>" + esc(playerName(p)) + "</div><div class='gt-meta'>" + esc(pos) + " \u00b7 JS " + Math.round(cell.score) + "</div>";
        d.title = playerName(p) + " (" + (cell.group || pos) + ", Justaino " + cell.score + ")";
      } else {
        d.innerHTML = "<div class='gt-disc'>\u2013</div><div class='gt-nm'>open</div><div class='gt-meta'>" + esc(pos) + "</div>";
      }
      pitch.appendChild(d);
    });
  }

  function renderGtInfo() {
    var empty = !gtBuild || gtBuild.empty;
    var depthBad = gtBuild && gtBuild.depth && !gtBuild.depth.ok;
    var sq = (gtBuild && gtBuild.squads) ? gtBuild.squads[gtSquadIdx] : null;
    var warn = null;
    if (empty && gtBuild && gtBuild.noFormations) { warn = "Formations haven't loaded yet. Open the <b>Squads</b> screen in the app once, then reopen this builder."; }
    else if (empty) { warn = "No club players loaded yet. Close this, tap \u21BB Reload club, then reopen."; }
    else if (depthBad) {
      var d = gtBuild.depth, bits = d.shortages.map(function (s) { return s.group + " (" + s.have + "/" + s.required + ")"; }).join(", ");
      warn = "<b>Can't build " + gtCount + " full squads.</b> " +
        (!d.totalOk ? ("Need " + d.totalNeeded + " players, have " + d.totalHave + ". ") : "") +
        (d.shortages.length ? ("Short at: " + esc(bits) + ". ") : "") + "Try fewer squads or different formations.";
    }
    if (gtEls.stats) {
      if (warn) { gtEls.stats.className = "gt-warn2"; gtEls.stats.innerHTML = warn; }
      else {
        gtEls.stats.className = "gt-statstrip";
        gtEls.stats.innerHTML = "<div class='gt-stat'><div class='v g'>" + (sq ? sq.ovrAvg : "\u2014") + "</div><div class='k'>XI avg</div></div>" +
          "<div class='gt-stat'><div class='v a'>" + (sq ? sq.filled : 0) + "/11</div><div class='k'>Placed</div></div>" +
          "<div class='gt-stat'><div class='v'>" + (sq ? sq.chem.maxLeague : 0) + "</div><div class='k'>League</div></div>" +
          "<div class='gt-stat'><div class='v'>" + (sq ? sq.chem.maxNation : 0) + "</div><div class='k'>Nation</div></div>";
      }
    }
    if (gtEls.summary) {
      if (warn) { gtEls.summary.className = "gt-warn2"; gtEls.summary.innerHTML = warn; }
      else {
        gtEls.summary.className = "gt-summary";
        gtEls.summary.innerHTML = "<span><b class='gsa'>" + (sq ? sq.ovrAvg : "\u2014") + "</b> XI avg</span>" +
          "<span><b>" + (sq ? sq.filled : 0) + "/11</b> placed</span>" +
          "<span><b>" + (sq ? sq.chem.maxLeague : 0) + "</b> league</span>" +
          "<span><b>" + (sq ? sq.chem.maxNation : 0) + "</b> nation</span>";
      }
    }
  }

  function renderGtBench() {
    var sq = (gtBuild && gtBuild.squads) ? gtBuild.squads[gtSquadIdx] : null;
    var chips = sq ? sq.subs.map(function (cell) {
      var p = cell && cell.player;
      return "<span class='gt-chip'>" + (p ? ("<b>" + (p.rating != null ? p.rating : "?") + "</b> " + esc(playerName(p))) : "<span style='color:var(--muted);font-style:italic'>open</span>") + "</span>";
    }).join("") : "";
    if (gtEls.bench) { gtEls.bench.innerHTML = "<div class='bl'>Bench \u00B7 7 subs</div><div class='gt-chips'>" + chips + "</div>"; }
    if (gtEls.benchToggle) {
      var f = sq ? sq.subs.filter(function (c) { return c && c.player; }) : [];
      var avg = f.length ? Math.round(f.reduce(function (a, c) { return a + (c.player.rating || 0); }, 0) / f.length) : "\u2014";
      gtEls.benchToggle.innerHTML = "<span>" + (gtBenchOpen ? "\u25BE" : "\u25B8") + " Bench (7)</span><span style='color:var(--muted);opacity:.8'>avg " + avg + "</span>";
      gtEls.benchBody.innerHTML = "<div class='gt-chips'>" + chips + "</div>";
    }
  }

  // updateBuilderActions(): enable/label Create + Remove for the current state.
  function updateBuilderActions() {
    if (!gtEls.createBtn) return;
    var count = (state.gauntletLiveCount != null) ? state.gauntletLiveCount : loadGauntletSquadIds().length;
    var canCreate = !!(gtBuild && gtBuild.depth && gtBuild.depth.ok) && !state.gtRunning;
    gtEls.createBtn.disabled = !canCreate;
    gtEls.createBtn.style.opacity = canCreate ? "" : ".45";
    gtEls.createBtn.style.cursor = canCreate ? "pointer" : "not-allowed";
    gtEls.createBtn.textContent = "Create " + gtCount + " in game";
    var canRemove = count > 0 && !state.gtRunning;
    gtEls.removeBtn.disabled = !canRemove;
    gtEls.removeBtn.style.opacity = canRemove ? "" : ".45";
    gtEls.removeBtn.style.cursor = canRemove ? "pointer" : "not-allowed";
    gtEls.removeBtn.textContent = count ? ("Remove Gauntlet squads (" + count + ")") : "Remove Gauntlet squads";
  }

  // refreshGauntletCount(): live count of OUR squads (named MGFC Gauntlet ...) for the Remove button.
  async function refreshGauntletCount() {
    var list = await listSavedSquads();
    if (list == null) return;
    var ours = list.filter(function (sq) { return sq.id !== 0 && isGauntletSquadName(sq.name); });
    state.gauntletLiveCount = ours.length;
    updateBuilderActions();
  }

  // runCreateGauntlet(): create the drafted squads in the game (confirmed, capped, animated).
  async function runCreateGauntlet() {
    if (state.gtRunning) return;
    if (!gtBuild || gtBuild.empty || !(gtBuild.depth && gtBuild.depth.ok)) { setGtStatus(gtSline("Nothing to create - pick a formation/count that builds full squads.")); return; }
    var res = gtBuild, squads = res.squads;
    var have = await countSavedSquads();
    if (have != null && (have + squads.length) > GAUNTLET_MAX_SQUADS) {
      setGtStatus(gtToast("err", "You have " + have + " of " + GAUNTLET_MAX_SQUADS + " squads - room for only " + Math.max(0, GAUNTLET_MAX_SQUADS - have) + " more. Remove some first."));
      return;
    }
    // Each squad names its OWN formation in the confirm, since they can differ now.
    var lines = squads.map(function (sq, i) { return "  " + (i + 1) + '. "' + GAUNTLET_NAME_PREFIX + (i + 1) + '" (' + fmtFormation(sq.formation) + ") - " + sq.filled + " starters + " + sq.subFilled + " subs"; });
    var msg = "Create " + squads.length + " NEW saved squad" + (squads.length === 1 ? "" : "s") + " in your FC web app?\n\n" +
      lines.join("\n") + "\n\n" + (have != null ? ("You have " + have + " of " + GAUNTLET_MAX_SQUADS + " squads; this uses " + squads.length + " more.\n") : "") +
      "Your active squad is NOT touched. Undo any time with \"Remove Gauntlet squads\".\n\nContinue?";
    if (!window.confirm(msg)) return;
    state.gtRunning = true; updateBuilderActions();
    var tracked = loadGauntletSquadIds().slice(), okCount = 0, failCount = 0;
    // Per-squad failure reasons, so the toast can say WHY (not just a count).
    var fails = [];
    // Reliability tuning. Squad creates that fire too close together get rejected
    // (seen as a 460) because EA hasn't finished settling the previous create. So:
    //   - SETTLE_MS: the normal pause between one create finishing and the next starting.
    //   - RETRY_ATTEMPTS: how many total tries each squad gets before we give up.
    //   - RETRY_SETTLE_MS: a longer pause before a RETRY, to let a transient reject clear.
    var SETTLE_MS = 600, RETRY_ATTEMPTS = 3, RETRY_SETTLE_MS = 1200;

    // createOneSquad(name, squad): create a single squad, auto-retrying on failure with a
    // longer settle each time. Returns {ok, id, reason}. Only a squad that fails EVERY
    // attempt is reported as a failure.
    async function createOneSquad(name, squad, pct) {
      var lastReason = "?";
      for (var attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          setGtStatus(gtProgress("Retrying " + name + " (try " + attempt + " of " + RETRY_ATTEMPTS + ")\u2026", pct));
          await sleep(RETRY_SETTLE_MS);
        }
        try {
          var r = await createGameSquad(name, squad.formation, gauntletItemsForSquad(squad));
          if (r && r.id != null) return { ok: true, id: r.id };
          lastReason = "created but no id returned";
          console.warn("[FC26] squad create returned no id", name, "(try " + attempt + ")", r);
        } catch (e) {
          lastReason = errMsg(e);
          console.warn("[FC26] squad create FAILED", name, "(try " + attempt + ")", "reason=", lastReason, "response=", e);
        }
      }
      return { ok: false, reason: lastReason };
    }

    for (var i = 0; i < squads.length; i++) {
      var name = GAUNTLET_NAME_PREFIX + (i + 1);
      var pct = Math.round(i / squads.length * 100);
      setGtStatus(gtProgress("Creating " + name + " (" + (i + 1) + "/" + squads.length + ")\u2026", pct));
      var res2 = await createOneSquad(name, squads[i], pct);
      if (res2.ok) { tracked.push({ id: res2.id, name: name }); saveGauntletSquadIds(tracked); okCount++; }
      else { failCount++; fails.push({ name: name, reason: res2.reason }); }
      if (i < squads.length - 1) await sleep(SETTLE_MS);
    }
    state.gtRunning = false;
    await refreshGauntletCount();
    var failText = fails.length ? (" - " + fails.map(function (f) { return f.name.replace(GAUNTLET_NAME_PREFIX, "#") + ": " + f.reason; }).join("; ")) : "";
    setGtStatus(gtToast(okCount > 0 && failCount === 0 ? "ok" : "err",
      okCount + " squad" + (okCount === 1 ? "" : "s") + " created" + (failCount ? (", " + failCount + " failed" + failText) : "") + ". Open Squads to see them."));
  }

  // runRemoveGauntlet(): delete every MGFC Gauntlet squad from the live list (device-independent).
  async function runRemoveGauntlet() {
    if (state.gtRunning) return;
    var list = await listSavedSquads();
    if (list == null) { setGtStatus(gtToast("err", "Couldn't read your squad list. Open the Squads screen once, then try again.")); return; }
    var ours = list.filter(function (sq) { return sq.id !== 0 && isGauntletSquadName(sq.name); });
    if (!ours.length) { state.gauntletLiveCount = 0; saveGauntletSquadIds([]); updateBuilderActions(); setGtStatus(gtSline("No Gauntlet squads found to remove.")); return; }
    var msg = "Remove the " + ours.length + " Gauntlet squad" + (ours.length === 1 ? "" : "s") + " in your club?\n\n" +
      ours.map(function (s) { return "  - " + s.name; }).join("\n") +
      "\n\nThis removes squads named \"" + GAUNTLET_NAME_PREFIX + "...\" only; your own squads are safe.\n\nContinue?";
    if (!window.confirm(msg)) return;
    state.gtRunning = true; updateBuilderActions();
    var okCount = 0, failCount = 0, guard = 0;
    while (guard++ < 60) {
      var cur = await listSavedSquads();
      if (cur == null) { failCount++; break; }
      var target = null;
      for (var j = 0; j < cur.length; j++) { if (cur[j].id !== 0 && isGauntletSquadName(cur[j].name)) { target = cur[j]; break; } }
      if (!target) break;
      setGtStatus(gtProgress("Removing " + target.name + "\u2026", okCount ? Math.round(okCount / (okCount + 1) * 100) : 30));
      try { await removeGameSquad(target.id); okCount++; }
      catch (e) { failCount++; console.warn("[FC26] squad remove failed", target, e); break; }
      await sleep(300);
    }
    saveGauntletSquadIds([]);
    state.gtRunning = false;
    await refreshGauntletCount();
    setGtStatus(gtToast(okCount > 0 ? "ok" : "err", "Removed " + okCount + " squad" + (okCount === 1 ? "" : "s") + (failCount ? (", " + failCount + " failed - try again") : "") + "."));
  }

  // ---- Justaino Score squad: create / remove (driven from the Best XI page) --------------------
  // Single squad = the current Best XI + rules-based bench. Mirrors the Gauntlet runners but uses
  // the SEPARATE name prefix / tracked-id list so its Remove only touches Justaino Score squads.
  // statusEl is the Best XI page's own status <div>; createBtn/removeBtn are disabled while busy.
  async function runCreateJustainoSquad(statusEl, createBtn, removeBtn) {
    if (state.jsRunning || state.gtRunning) return;
    // Rebuild the WHOLE chart fresh at click time (so it reflects the live club), then take the
    // team on screen. It has to be the whole chart, not just this team: the benches are drafted
    // from one shared pool, which is what keeps this squad clear of any sibling you create next.
    var jsq = buildBestXiSquad(metaXiFormation, metaXiIdx, metaXiCount);
    if (jsq.error || jsq.filled !== 11) { statusEl.innerHTML = gtToast("err", "Couldn't build a full XI for this formation - try another."); return; }
    var saved = await listSavedSquads();
    if (saved == null) { statusEl.innerHTML = gtToast("err", "Couldn't read your squad list. Open the Squads screen once, then try again."); return; }
    var have = saved.length;
    if (have >= GAUNTLET_MAX_SQUADS) { statusEl.innerHTML = gtToast("err", "You have " + have + " of " + GAUNTLET_MAX_SQUADS + " squads - remove some first."); return; }
    var name = jscoreNamePrefix() + nextJscoreSquadNumber(saved);   // "<active score> Squad N" (next free number)
    // Confirm, listing the whole bench so the create is never a surprise.
    var benchLines = jsq.subs.map(function (c) { return "  - " + (c.reqLabel || "SUB") + ": " + (c.player ? playerName(c.player) : "(none)"); });
    var xiDesc = (metaXiIdx === 0) ? ("your strongest 11 by " + scoreLabel()) : ("your #" + (metaXiIdx + 1) + " best 11 by " + scoreLabel() + " (depth chart)");
    var teamNote = (metaXiCount > 1) ? (", Team " + (metaXiIdx + 1)) : "";
    var msg = "Create \"" + name + "\" (" + fmtFormation(jsq.formation) + teamNote + ") in your FC web app?\n\n" +
      "Starting XI: " + xiDesc + " (OVR avg " + jsq.ovrAvg + ").\n\n" +
      "Bench (next best):\n" + benchLines.join("\n") + "\n\n" +
      "You have " + have + " of " + GAUNTLET_MAX_SQUADS + " squads; this uses 1 more.\n" +
      "Your active squad is NOT touched. Undo any time with \"Remove " + scoreLabel() + " squads\".\n\nContinue?";
    if (!window.confirm(msg)) return;
    state.jsRunning = true; if (createBtn) createBtn.disabled = true; if (removeBtn) removeBtn.disabled = true;
    statusEl.innerHTML = gtProgress("Creating " + name + "…", 40);
    // Same settle/retry approach as the Gauntlet: a create too soon after another can 460.
    var ok = false, newId = null, reason = "?", ATTEMPTS = 3, RETRY_SETTLE_MS = 1200;
    for (var attempt = 1; attempt <= ATTEMPTS && !ok; attempt++) {
      if (attempt > 1) { statusEl.innerHTML = gtProgress("Retrying " + name + " (try " + attempt + " of " + ATTEMPTS + ")…", 40); await sleep(RETRY_SETTLE_MS); }
      try {
        var r = await createGameSquad(name, jsq.formation, gauntletItemsForSquad(jsq));
        if (r && r.id != null) { ok = true; newId = r.id; } else { reason = "created but no id returned"; console.warn("[FC26] Justaino squad create returned no id", name, r); }
      } catch (e) { reason = errMsg(e); console.warn("[FC26] Justaino squad create FAILED", name, "(try " + attempt + ")", e); }
    }
    state.jsRunning = false; if (createBtn) createBtn.disabled = false; if (removeBtn) removeBtn.disabled = false;
    if (ok) {
      var tracked = loadJscoreSquadIds().slice(); tracked.push({ id: newId, name: name }); saveJscoreSquadIds(tracked);
      statusEl.innerHTML = gtToast("ok", "Created \"" + name + "\". Open the Squads screen to see it.");
    } else {
      statusEl.innerHTML = gtToast("err", "Couldn't create " + name + " - " + reason + ". Try again.");
    }
  }

  // runRemoveJustainoSquads(): delete every "Justaino Score ..." squad from the live list.
  async function runRemoveJustainoSquads(statusEl, createBtn, removeBtn) {
    if (state.jsRunning || state.gtRunning) return;
    var list = await listSavedSquads();
    if (list == null) { statusEl.innerHTML = gtToast("err", "Couldn't read your squad list. Open the Squads screen once, then try again."); return; }
    var ours = list.filter(function (sq) { return sq.id !== 0 && isJscoreSquadName(sq.name); });
    if (!ours.length) { saveJscoreSquadIds([]); statusEl.innerHTML = gtSline("No " + scoreLabel() + " squads found to remove."); return; }
    var msg = "Remove the " + ours.length + " score squad" + (ours.length === 1 ? "" : "s") + " in your club?\n\n" +
      ours.map(function (s) { return "  - " + s.name; }).join("\n") +
      "\n\nThis removes squads named \"Justaino Score ...\" or \"My Score ...\" only; your own squads are safe.\n\nContinue?";
    if (!window.confirm(msg)) return;
    state.jsRunning = true; if (createBtn) createBtn.disabled = true; if (removeBtn) removeBtn.disabled = true;
    var okCount = 0, failCount = 0, guard = 0;
    while (guard++ < 60) {
      var cur = await listSavedSquads();
      if (cur == null) { failCount++; break; }
      var target = null;
      for (var j = 0; j < cur.length; j++) { if (cur[j].id !== 0 && isJscoreSquadName(cur[j].name)) { target = cur[j]; break; } }
      if (!target) break;
      statusEl.innerHTML = gtProgress("Removing " + target.name + "…", 40);
      try { await removeGameSquad(target.id); okCount++; } catch (e) { failCount++; console.warn("[FC26] Justaino squad remove failed", target, e); break; }
      await sleep(300);
    }
    saveJscoreSquadIds([]);
    state.jsRunning = false; if (createBtn) createBtn.disabled = false; if (removeBtn) removeBtn.disabled = false;
    statusEl.innerHTML = gtToast(okCount > 0 ? "ok" : "err", "Removed " + okCount + " squad" + (okCount === 1 ? "" : "s") + (failCount ? (", " + failCount + " failed - try again") : "") + ".");
  }

  // ============================================================================
  // FEATURE 5 - CLUB DASHBOARD (display only)
  // A full-panel page (same shell as Justaino Score / Squad Builder) that reads the
  // loaded club and shows player-stat summaries and fun facts. It NEVER creates or
  // changes anything in game - it's a pure read-out. Built one module at a time;
  // v1 modules: hero strip, club records, rating spread, squad DNA, position depth,
  // PlayStyle insights. (This step ships the page shell + the hero strip.)
  // ============================================================================

  // The launcher tile (sits in the lineup column, next to Justaino Score + Squad Builder).
  var dashLaunch = document.createElement("div");
  dashLaunch.className = "meta-section";
  var dashLaunchBtn = document.createElement("button");
  dashLaunchBtn.type = "button";
  dashLaunchBtn.className = "gt-launch";
  dashLaunchBtn.innerHTML = "<span class='gt-launch-ic'>🏟️</span>" +
    "<span class='gt-launch-tx'><b>Club Dashboard</b><i>Player stats and fun facts about your whole club</i></span>" +
    "<span class='gt-launch-go'>›</span>";
  dashLaunchBtn.addEventListener("click", openDashPage);
  dashLaunch.appendChild(dashLaunchBtn);

  // The full-screen page host (hidden until opened; reuses the .gt-builder shell styling:
  // flex column, own scroll, fills the panel).
  var dashHost = document.createElement("div");
  dashHost.className = "gt-builder";
  dashHost.style.display = "none";
  body.appendChild(dashHost);

  state.dashOpen = false;

  // openDashPage()/closeDashPage(): flip the main layout out and the dashboard in,
  // mirroring openMetaPage/closeMetaPage (applyPanelChrome adds the mobile gt-open height).
  function openDashPage() {
    state.dashOpen = true;
    dashHost.style.display = "flex";
    layoutHost.style.display = "none";
    applyPanelChrome();
    renderDashPage();
  }
  function closeDashPage() {
    state.dashOpen = false;
    dashHost.style.display = "none";
    layoutHost.style.display = "flex";
    applyPanelChrome();
  }

  // computeClubSummary(): the top-line hero numbers, all from LOCAL club data.
  //   players - how many player cards are loaded
  //   avgOvr  - mean in-game OVR (it.rating), rounded
  //   nations - count of distinct nations  (it.nationId)
  //   leagues - count of distinct leagues  (it.leagueId)
  //   icons   - how many icons (they share the hidden icon league, via isIcon())
  function computeClubSummary() {
    var players = getClubPlayers();
    var ovrSum = 0, ovrN = 0, nations = {}, leagues = {}, icons = 0;
    players.forEach(function (it) {
      var r = 0; try { r = it.rating || 0; } catch (e) {}
      if (r) { ovrSum += r; ovrN++; }
      try { if (it.nationId != null) nations[it.nationId] = 1; } catch (e2) {}
      try { if (it.leagueId != null) leagues[it.leagueId] = 1; } catch (e3) {}
      if (isIcon(it)) icons++;
    });
    return {
      players: players.length,
      avgOvr: ovrN ? Math.round(ovrSum / ovrN) : 0,
      nations: Object.keys(nations).length,
      leagues: Object.keys(leagues).length,
      icons: icons
    };
  }

  // computeClubRecords(): one standout player per stat, all from LOCAL club data.
  // The six face-stat records use OUTFIELD players only (GK cards read a different set of
  // six stats - diving/handling/... - so their pace/shooting/etc are 0 and never win here).
  // Highest OVR and Top Justaino Score consider EVERY player (keepers included).
  // Returns [{icon,label,name,value,accent}] in display order.
  function computeClubRecords() {
    var players = getClubPlayers();
    var outfield = players.filter(function (it) { return !isGKPlayer(it); });
    // leadStat(list,key): the player with the highest value of one face stat.
    function leadStat(list, key) {
      var best = null;
      list.forEach(function (it) {
        var v = readStats(it)[key] || 0;
        if (v && (!best || v > best.v)) best = { it: it, v: v };
      });
      return best;
    }
    var recs = [];
    function push(icon, label, lead, acc) {
      if (lead && lead.it) recs.push({ icon: icon, label: label, name: playerName(lead.it), value: lead.v, accent: !!acc });
    }
    push("⚡", "Fastest · PAC", leadStat(outfield, "pace"));
    push("💪", "Strongest · PHY", leadStat(outfield, "physical"));
    push("🎯", "Sharpshooter · SHO", leadStat(outfield, "shooting"));
    push("🎩", "Playmaker · PAS", leadStat(outfield, "passing"));
    push("✨", "Magician · DRI", leadStat(outfield, "dribbling"));
    push("🧱", "The Wall · DEF", leadStat(outfield, "defending"));
    // Highest OVR (every player).
    var ovrBest = null;
    players.forEach(function (it) { var r = it.rating || 0; if (r && (!ovrBest || r > ovrBest.v)) ovrBest = { it: it, v: r }; });
    push("👑", "Highest OVR", ovrBest);
    // Top Justaino Score (every player, at their best position).
    var jBest = null;
    players.forEach(function (it) {
      var j = null; try { j = bestJustaino(it); } catch (e) {}
      if (j && (!jBest || j.score.total > jBest.v)) jBest = { it: it, v: j.score.total };
    });
    if (jBest && jBest.it) recs.push({ icon: "🔥", label: "Top " + scoreLabel(), name: playerName(jBest.it), value: jBest.v.toFixed(1), accent: true });
    return recs;
  }

  // computeRatingSpread(): how many players fall in each OVR band, for the histogram.
  // Bands are inclusive on both ends; the 90+ band is flagged gold (your best cards).
  function computeRatingSpread() {
    var buckets = [
      { label: "90+", min: 90, max: 200, gold: true, n: 0 },
      { label: "85-89", min: 85, max: 89, n: 0 },
      { label: "80-84", min: 80, max: 84, n: 0 },
      { label: "75-79", min: 75, max: 79, n: 0 },
      { label: "<75", min: 0, max: 74, n: 0 }
    ];
    getClubPlayers().forEach(function (it) {
      var r = it.rating || 0;
      for (var i = 0; i < buckets.length; i++) {
        if (r >= buckets[i].min && r <= buckets[i].max) { buckets[i].n++; break; }
      }
    });
    return buckets;
  }

  // computeSquadDNA(): the club's AVERAGE of each outfield face stat (PAC/SHO/PAS/DRI/DEF/PHY),
  // in the fixed FACE_STATS order, plus a plain-English read of the strongest/softest areas.
  // GKs are excluded (they read a different six stats). Each avg is a whole number 0-99.
  function computeSquadDNA() {
    var outfield = getClubPlayers().filter(function (it) { return !isGKPlayer(it); });
    var sums = {}; FACE_STATS.forEach(function (k) { sums[k] = 0; });
    outfield.forEach(function (it) { var st = readStats(it); FACE_STATS.forEach(function (k) { sums[k] += (st[k] || 0); }); });
    var n = outfield.length;
    var avgs = FACE_STATS.map(function (k) { return { key: k, label: FACE_LABELS[k], v: n ? Math.round(sums[k] / n) : 0 }; });
    // A short read: name the top stat, the runner-up, and the softest.
    var byVal = avgs.slice().sort(function (a, b) { return b.v - a.v; });
    // Plain-English adjective per stat for the summary sentence.
    var WORD = { pace: "pace", shooting: "shooting", passing: "passing", dribbling: "dribbling", defending: "defending", physical: "physicality" };
    var note = "";
    if (n) {
      var top = byVal[0], second = byVal[1], low = byVal[byVal.length - 1];
      note = "Strongest in <b>" + esc(WORD[top.key]) + "</b> (" + top.v + ") and <b>" + esc(WORD[second.key]) + "</b> (" + second.v + "); softest in <b>" + esc(WORD[low.key]) + "</b> (" + low.v + ").";
    }
    return { count: n, avgs: avgs, note: note };
  }

  // computePositionDepth(): how many club players can fill each position group (a player
  // counts toward every group they can play), in META_GROUPS order. A group is "thin" when
  // fewer than DEPTH_THIN players cover it. Reuses playerPositionGroups (same eligibility the
  // Squad Builder uses).
  var DEPTH_THIN = 5;
  function computePositionDepth() {
    var counts = {}; META_GROUPS.forEach(function (g) { counts[g] = 0; });
    getClubPlayers().forEach(function (it) {
      playerPositionGroups(it).forEach(function (g) { if (counts[g] != null) counts[g]++; });
    });
    return META_GROUPS.map(function (g) { return { group: g, n: counts[g], thin: counts[g] < DEPTH_THIN }; });
  }

  // computePlayStyleInsights(): a few fun stats about the club's PlayStyle+ (the "+" versions).
  //   totalPlus   - how many PlayStyle+ across the whole club
  //   mostCommon  - the PlayStyle+ owned by the most cards ({name, n}) or null
  //   mostKitted  - the card with the most PlayStyle+ ({name, n}) or null
  //   zeroPlus    - how many cards have no PlayStyle+ at all
  function computePlayStyleInsights() {
    var players = getClubPlayers();
    var totalPlus = 0, zeroPlus = 0, byTrait = {}, mostKitted = null;
    players.forEach(function (it) {
      var plusCount = 0;
      currentPlayStyles(it).forEach(function (p) {
        if (p.isIcon) { plusCount++; totalPlus++; byTrait[p.traitId] = (byTrait[p.traitId] || 0) + 1; }
      });
      if (plusCount === 0) zeroPlus++;
      if (plusCount > 0 && (!mostKitted || plusCount > mostKitted.n)) mostKitted = { it: it, n: plusCount };
    });
    var topTrait = null;
    Object.keys(byTrait).forEach(function (t) { if (!topTrait || byTrait[t] > topTrait.n) topTrait = { traitId: +t, n: byTrait[t] }; });
    return {
      players: players.length,
      totalPlus: totalPlus,
      zeroPlus: zeroPlus,
      mostCommon: topTrait ? { name: (traitName[topTrait.traitId] || ("trait " + topTrait.traitId)) + "+", n: topTrait.n } : null,
      mostKitted: mostKitted ? { name: playerName(mostKitted.it), n: mostKitted.n } : null
    };
  }

  // renderDashPage(): (re)build the whole dashboard. v1 step 1 = header + hero strip;
  // later modules (records, spread, DNA, depth, PlayStyles) get appended to bodyEl here.
  function renderDashPage() {
    if (!state.dashOpen) return;
    dashHost.innerHTML = "";

    // Header (back + eyebrow + title) - same chrome as the other full-panel pages.
    var top = document.createElement("div"); top.className = "gt-bd-top";
    var back = document.createElement("button"); back.type = "button"; back.className = "gt-bd-back"; back.textContent = "‹"; back.title = "Back"; back.addEventListener("click", closeDashPage);
    var ttl = document.createElement("div"); ttl.className = "gt-bd-title"; ttl.innerHTML = "<span class='gt-bd-eyebrow'>Men Gallant FC</span><b>Club Dashboard</b>";
    top.appendChild(back); top.appendChild(ttl);
    dashHost.appendChild(top);

    // Scrolling body that fills the rest of the panel.
    var bodyEl = document.createElement("div"); bodyEl.className = "db-body";

    var players = getClubPlayers();
    if (!players.length) {
      var empty = document.createElement("div"); empty.className = "mp-soon";
      empty.textContent = "No club loaded yet. Go back, tap ↻ Reload club, then reopen this page.";
      bodyEl.appendChild(empty);
      dashHost.appendChild(bodyEl);
      return;
    }

    // ---- MODULE 1: hero strip (at-a-glance club summary) ----
    var s = computeClubSummary();
    var hero = document.createElement("div"); hero.className = "db-hero";
    [[s.players, "Players", ""], [s.avgOvr, "Avg OVR", "g"], [s.nations, "Nations", ""], [s.leagues, "Leagues", ""], [s.icons, "Icons", ""]].forEach(function (c) {
      var cell = document.createElement("div"); cell.className = "db-hcell";
      cell.innerHTML = "<span class='db-hn " + c[2] + "'>" + c[0] + "</span><span class='db-hl'>" + esc(c[1]) + "</span>";
      hero.appendChild(cell);
    });
    bodyEl.appendChild(hero);

    // ---- MODULE 2: Club records (a standout player per stat) ----
    var recs = computeClubRecords();
    if (recs.length) {
      var recCard = document.createElement("div"); recCard.className = "db-card";
      var recH = document.createElement("div"); recH.className = "db-h3"; recH.textContent = "Club records"; recCard.appendChild(recH);
      var recGrid = document.createElement("div"); recGrid.className = "db-recs";
      recs.forEach(function (r) {
        var t = document.createElement("div"); t.className = "db-rec";
        t.innerHTML = "<div class='db-rec-ic'>" + r.icon + "</div>" +
          "<div class='db-rec-meta'><div class='db-rec-lab'>" + esc(r.label) + "</div><div class='db-rec-nm'>" + esc(r.name) + "</div></div>" +
          "<div class='db-rec-val" + (r.accent ? " a" : "") + "'>" + r.value + "</div>";
        recGrid.appendChild(t);
      });
      recCard.appendChild(recGrid);
      bodyEl.appendChild(recCard);
    }

    // ---- MODULE 3: Rating spread (OVR histogram) ----
    var spread = computeRatingSpread();
    var maxN = Math.max.apply(null, spread.map(function (b) { return b.n; }).concat([1]));
    var spCard = document.createElement("div"); spCard.className = "db-card";
    var spH = document.createElement("div"); spH.className = "db-h3"; spH.textContent = "Rating spread"; spCard.appendChild(spH);
    var hist = document.createElement("div"); hist.className = "db-hist";
    spread.forEach(function (b) {
      var col = document.createElement("div"); col.className = "db-hcol" + (b.gold ? " g" : "");
      var pct = Math.round(b.n / maxN * 100);
      col.innerHTML = "<div class='db-hbar' style='height:" + pct + "%'><span class='db-hcount'>" + b.n + "</span></div>" +
        "<span class='db-hlab'>" + esc(b.label) + "</span>";
      hist.appendChild(col);
    });
    spCard.appendChild(hist);
    bodyEl.appendChild(spCard);

    // ---- MODULE 4: Squad DNA (average outfield face stats + read-out) ----
    var dna = computeSquadDNA();
    if (dna.count) {
      var dnaCard = document.createElement("div"); dnaCard.className = "db-card";
      var dnaH = document.createElement("div"); dnaH.className = "db-h3"; dnaH.textContent = "Squad DNA"; dnaCard.appendChild(dnaH);
      var dnaWrap = document.createElement("div"); dnaWrap.className = "db-dna";
      dna.avgs.forEach(function (a) {
        var row = document.createElement("div"); row.className = "db-drow";
        row.innerHTML = "<span class='db-dk'>" + esc(a.label) + "</span>" +
          "<div class='db-dtrack'><div class='db-dfill' style='width:" + Math.min(100, a.v) + "%'></div></div>" +
          "<span class='db-dv'>" + a.v + "</span>";
        dnaWrap.appendChild(row);
      });
      dnaCard.appendChild(dnaWrap);
      var dnaNote = document.createElement("div"); dnaNote.className = "db-dnanote"; dnaNote.innerHTML = dna.note; dnaCard.appendChild(dnaNote);
      bodyEl.appendChild(dnaCard);
    }

    // ---- MODULE 5: Position depth (players who can fill each position group) ----
    var depth = computePositionDepth();
    var depCard = document.createElement("div"); depCard.className = "db-card";
    var depH = document.createElement("div"); depH.className = "db-h3"; depH.textContent = "Position depth"; depCard.appendChild(depH);
    var depWrap = document.createElement("div"); depWrap.className = "db-depth";
    var anyThin = false;
    depth.forEach(function (d) {
      if (d.thin) anyThin = true;
      var chip = document.createElement("div"); chip.className = "db-pchip" + (d.thin ? " thin" : "");
      chip.innerHTML = "<span class='pp'>" + esc(d.group) + "</span><span class='pc'>" + d.n + "</span>";
      depWrap.appendChild(chip);
    });
    depCard.appendChild(depWrap);
    if (anyThin) {
      var depKey = document.createElement("div"); depKey.className = "db-depthkey";
      depKey.innerHTML = "<i></i> Highlighted = thin cover (fewer than " + DEPTH_THIN + " players can fill the slot)";
      depCard.appendChild(depKey);
    }
    bodyEl.appendChild(depCard);

    // ---- MODULE 6: PlayStyle insights ----
    var psi = computePlayStyleInsights();
    var psCard = document.createElement("div"); psCard.className = "db-card";
    var psH = document.createElement("div"); psH.className = "db-h3"; psH.textContent = "PlayStyle insights"; psCard.appendChild(psH);
    var psWrap = document.createElement("div"); psWrap.className = "db-ps";
    function psRow(label, valHTML) {
      return "<div class='db-prow'><span class='db-pl'>" + esc(label) + "</span><span class='db-pr'>" + valHTML + "</span></div>";
    }
    var rowsHTML = psRow("Total PlayStyle+ across the club", "<span class='g'>" + psi.totalPlus + "</span>");
    if (psi.mostCommon) rowsHTML += psRow("Most common PlayStyle+", esc(psi.mostCommon.name) + " <span class='g'>&times;" + psi.mostCommon.n + "</span>");
    if (psi.mostKitted) rowsHTML += psRow("Most-kitted card", esc(psi.mostKitted.name) + " <span class='g'>" + psi.mostKitted.n + " PS+</span>");
    rowsHTML += psRow("Cards with zero PlayStyle+", "<span class='g'>" + psi.zeroPlus + "</span>");
    psWrap.innerHTML = rowsHTML;
    psCard.appendChild(psWrap);
    bodyEl.appendChild(psCard);

    dashHost.appendChild(bodyEl);
  }

  // Console helper: open the dashboard without clicking (and a summary read-out).
  window.FC26.openDashPage = openDashPage;
  window.FC26.clubSummary = computeClubSummary;
  window.FC26.clubRecords = computeClubRecords;
  window.FC26.ratingSpread = computeRatingSpread;
  window.FC26.squadDNA = computeSquadDNA;
  window.FC26.positionDepth = computePositionDepth;
  window.FC26.playStyleInsights = computePlayStyleInsights;

  // ============================================================================
  // FEATURE 6 - SCORE CUSTOMISER (step 2 of 5: the page)
  // The interface for the custom-score config built in step 1 (see the SCORE_DEFAULTS
  // block near the top, and CUSTOM-SCORE-SPEC.md). One switch decides whether the hub
  // speaks the Justaino Score or your own; the cards below tune your own.
  //
  // Everything applies AND saves the moment you move it - there is no separate Save
  // button, because the whole point is watching the ranking move as you drag. "Reset to
  // Justaino" is the undo.
  // ============================================================================

  // SCORE_PRESETS: named starting opinions. Each is just a set of the same knobs, so
  // picking one is identical to dragging the sliders there yourself. `vals: null` means
  // "clear every override", i.e. straight back to my baseline numbers.
  var SCORE_PRESETS = [
    { id: "base",  name: "Justaino baseline", vals: null,
      note: "My numbers exactly: an even split between stat fit and PlayStyles." },
    { id: "stats", name: "Stats purist", vals: { statMix: 0.75, psPlusMult: 2.5, psCeilPlus: 4 },
      note: "Ranks mostly on raw stat fit for the position. PlayStyles still count, but far less." },
    { id: "ps",    name: "PlayStyle maxxer", vals: { statMix: 0.28, psPlusMult: 4.5, psCeilPlus: 6 },
      note: "Rewards owning the right PlayStyles for the role above raw stat numbers." },
    { id: "ovr",   name: "OVR respecter", vals: { statMix: 0.5, ovrMix: 0.15, psPlusMult: 3.5, psCeilPlus: 5 },
      note: "Pulls the score back toward the card's in-game OVR, the way the hub ranked before v28." }
  ];

  // activePresetId(): which preset (if any) the current settings exactly match, so the
  // chip can light up. Returns null once you've dragged away from all of them.
  function activePresetId() {
    for (var i = 0; i < SCORE_PRESETS.length; i++) {
      var p = SCORE_PRESETS[i];
      if (!p.vals) { if (!hasScoreDiffs()) return p.id; continue; }
      var keys = Object.keys(p.vals), match = true;
      for (var k = 0; k < keys.length; k++) {
        // compare against the RESOLVED config, and allow for floating-point wobble
        if (Math.abs(CFG[keys[k]] - p.vals[keys[k]]) > 0.0001) { match = false; break; }
      }
      // a preset only "matches" if nothing OUTSIDE its own keys has been changed too
      if (match && Object.keys(scoreState.cfg).every(function (kk) { return keys.indexOf(kk) !== -1; })) return p.id;
    }
    return null;
  }
  // applyPreset(p): load a preset's numbers (or clear everything for the baseline one).
  function applyPreset(p) {
    if (!p.vals) { scoreState.cfg = {}; saveScoreState(); rebuildCfg(); return; }
    scoreState.cfg = {};                         // presets replace, they don't stack
    Object.keys(p.vals).forEach(function (k) { scoreState.cfg[k] = p.vals[k]; });
    saveScoreState(); rebuildCfg();
  }

  // There's deliberately NO launcher tile in the Lineup column - the column was getting
  // crowded, and these settings belong WITH the score they change. The way in is the small
  // 🔧 Peks Lab button in the Justaino Score page header (see renderMetaPage), which is why
  // closing this page returns you there rather than to the main panel.

  // The full-screen page host (hidden until opened; same .gt-builder shell as the others).
  var ssHost = document.createElement("div");
  ssHost.className = "gt-builder";
  ssHost.style.display = "none";
  body.appendChild(ssHost);

  state.scorePageOpen = false;
  // Which position the "who this moves" list previews. Starts on whatever the Rankings page is
  // showing (so the two agree when you arrive from it), falling back to ST.
  state.scoreImpactPos = (metaPos && META_GROUPS.indexOf(metaPos.value) !== -1) ? metaPos.value : "ST";
  state.scoreAdvOpen = false;                     // the Advanced section starts folded away
  state.scoreAdvPos = state.scoreImpactPos;       // which position its stat-weight sliders edit
  // Where "back" should go. "meta" = we came from the Justaino Score page's header button
  // (the normal way in), "layout" = opened straight from the Console helper.
  state.scoreFrom = "layout";

  function openScorePage(from) {
    state.scorePageOpen = true;
    state.scoreFrom = (from === "meta") ? "meta" : "layout";
    if (state.scoreFrom === "meta") metaPageHost.style.display = "none";
    else layoutHost.style.display = "none";
    ssHost.style.display = "flex";
    applyPanelChrome();
    renderScorePage();
  }
  // Closing redraws whatever we came back to, so any change to the scoring shows up
  // immediately (nothing caches a score - it just needs a repaint). Coming back to the
  // Justaino Score page therefore re-ranks it in front of you.
  function closeScorePage() {
    state.scorePageOpen = false;
    ssHost.style.display = "none";
    if (state.scoreFrom === "meta" && state.metaPageOpen) {
      metaPageHost.style.display = "flex";
      try { renderMetaPage(); } catch (e) {}
    } else {
      layoutHost.style.display = "flex";
      try { renderPreview(); } catch (e) {}
      try { renderMetaRating(); } catch (e) {}
    }
    applyPanelChrome();
  }

  // ---- "Who this moves": live re-ranking against the Justaino order (step 3) -----------------
  // The point of this card is that tuning stops being abstract: drag a slider and watch which of
  // YOUR players climb or fall. It reads the club already in memory - no network calls.

  // withBaselineScoring(fn): run fn with the scorer temporarily forced onto MY baseline numbers,
  // then put the live config straight back. This is how we get the "before" order to compare
  // against, without duplicating scorePlayer. rebuildCfg() with the switch off IS the baseline.
  function withBaselineScoring(fn) {
    var savedCfg = CFG, savedOn = scoreState.on;
    scoreState.on = false; rebuildCfg();
    try { return fn(); }
    finally { scoreState.on = savedOn; CFG = savedCfg; }   // restore the exact object we had
  }

  // rankIdsForGroup(group): every club player who can play this position, as item ids, best first
  // by whatever config is live when it's called.
  function rankIdsForGroup(group) {
    return getClubPlayers()
      .filter(function (it) { return playerPositionGroups(it).indexOf(group) !== -1; })
      .map(function (it) { return { it: it, t: scorePlayer(it, group).total }; })
      .sort(function (a, b) { return b.t - a.t; })
      .map(function (r) { return r.it.id; });
  }

  // The baseline order never changes while you drag, so compute it once per position and keep it.
  var impactBaseline = { group: null, ids: null };
  function baselineOrderFor(group) {
    if (impactBaseline.group !== group || !impactBaseline.ids) {
      impactBaseline = { group: group, ids: withBaselineScoring(function () { return rankIdsForGroup(group); }) };
    }
    return impactBaseline.ids;
  }

  // computeScoreImpact(group, n): the top n players at this position under the CURRENT config,
  // each with how many places they've moved versus the Justaino order (+ = climbed).
  function computeScoreImpact(group, n) {
    var players = getClubPlayers().filter(function (it) { return playerPositionGroups(it).indexOf(group) !== -1; });
    if (!players.length) return [];
    var baseIds = baselineOrderFor(group), baseRank = {};
    baseIds.forEach(function (id, i) { baseRank[id] = i; });
    return players
      .map(function (it) { return { it: it, score: scorePlayer(it, group) }; })
      .sort(function (a, b) { return b.score.total - a.score.total; })
      .slice(0, n || 6)
      .map(function (r, i) {
        var was = baseRank[r.it.id];
        return { it: r.it, total: r.score.total, moved: (was == null) ? 0 : (was - i) };
      });
  }
  window.FC26.scoreImpact = computeScoreImpact;

  // renderImpactList(el, group): fill one container with the rows. Called on every slider move,
  // so it only touches this element - never the whole page (which would rip the slider thumb
  // out from under your finger mid-drag).
  function renderImpactList(el, group) {
    var rows = computeScoreImpact(group, 6);
    if (!rows.length) {
      el.innerHTML = "<div class='ss-note'>No players in your club can play " + esc(group) + ", or the club hasn't loaded yet.</div>";
      return;
    }
    el.innerHTML = rows.map(function (r, i) {
      var mv = r.moved > 0 ? "<span class='ss-impmv up'>▲" + r.moved + "</span>"
        : r.moved < 0 ? "<span class='ss-impmv dn'>▼" + (-r.moved) + "</span>"
        : "<span class='ss-impmv'>–</span>";
      return "<div class='ss-improw" + (i === 0 ? " top" : "") + "'>" +
        "<span class='ss-imprank'>" + (i + 1) + "</span>" +
        "<span class='ss-impnm'>" + esc(playerName(r.it)) + "</span>" +
        "<span class='ss-impsc'>" + r.total.toFixed(1) + "</span>" + mv + "</div>";
    }).join("");
  }

  // ssDial(o): build one labelled slider. o = {
  //   name, value, min, max, step, fmt(v), cap, onInput(v), disabled
  // } - fmt turns the raw number into what's shown (e.g. 0.04 -> "4%").
  function ssDial(o) {
    var wrap = document.createElement("div"); wrap.className = "ss-dial";
    var head = document.createElement("div"); head.className = "ss-dh";
    var nm = document.createElement("span"); nm.className = "n"; nm.textContent = o.name;
    var val = document.createElement("span"); val.className = "v" + (o.disabled ? " base" : ""); val.textContent = o.fmt(o.value);
    head.appendChild(nm); head.appendChild(val);
    var rng = document.createElement("input");
    rng.type = "range"; rng.className = "ss-range";
    rng.min = o.min; rng.max = o.max; rng.step = o.step; rng.value = o.value;
    rng.disabled = !!o.disabled;
    rng.setAttribute("aria-label", o.name);
    // "input" fires continuously while dragging, so the number tracks your thumb.
    rng.addEventListener("input", function () {
      val.textContent = o.fmt(Number(rng.value));
      o.onInput(Number(rng.value));
    });
    wrap.appendChild(head); wrap.appendChild(rng);
    // The caption is optional: the Advanced rows pack 8 sliders together and a line of prose
    // under each one would bury them.
    if (o.cap) { var cap = document.createElement("div"); cap.className = "ss-dcap"; cap.textContent = o.cap; wrap.appendChild(cap); }
    return wrap;
  }

  // ssWeightRow(o): one compact weight slider for the Advanced section - a short label, the live
  // number, my baseline for comparison, and the slider. o = { label, value, base, min, max, step,
  // disabled, onInput }.
  function ssWeightRow(o) {
    return ssDial({
      name: o.label, value: o.value, min: o.min, max: o.max, step: o.step, disabled: o.disabled,
      fmt: function (v) { return (Math.round(v * 10) / 10) + (Math.abs(v - o.base) < 0.001 ? "" : "  (was " + o.base + ")"); },
      cap: "", onInput: o.onInput
    });
  }

  // renderScorePage(): (re)build the whole page. Called on open and after anything that
  // changes the SHAPE of the page (the switch, a preset). Dragging a slider deliberately
  // does NOT redraw - that would rip the thumb out from under your finger.
  function renderScorePage() {
    if (!state.scorePageOpen) return;
    // Redrawing replaces the scrolling body with a NEW element, which starts at the top - so
    // pressing a button deep in Advanced used to fling you back to the switch. Remember where
    // you were and put it back once the new body is in place.
    var prevScroll = 0;
    var oldBody = ssHost.querySelector(".ss-body");
    if (oldBody) prevScroll = oldBody.scrollTop;
    ssHost.innerHTML = "";
    var custom = isCustomScore();
    var on = !!scoreState.on;
    var d = SCORE_DEFAULTS;

    // ---- Header: back + title + the "Custom" chip when a custom score is live ----
    var top = document.createElement("div"); top.className = "gt-bd-top";
    var back = document.createElement("button"); back.type = "button"; back.className = "gt-bd-back";
    back.textContent = "‹"; back.title = "Back"; back.addEventListener("click", closeScorePage);
    var ttl = document.createElement("div"); ttl.className = "gt-bd-title";
    ttl.innerHTML = "<span class='gt-bd-eyebrow'>Men Gallant FC</span><b>Peks Lab</b>";
    top.appendChild(back); top.appendChild(ttl);
    if (custom) { var chip = document.createElement("span"); chip.className = "ss-chip"; chip.textContent = "Custom"; top.appendChild(chip); }
    ssHost.appendChild(top);

    var bodyEl = document.createElement("div"); bodyEl.className = "ss-body";

    // The live "who this moves" list is built further down, but every slider needs to refresh it,
    // so declare it (and its refresher) up here. refreshImpact is throttled to one repaint per
    // animation frame - a slider fires "input" far faster than we need to re-rank a whole club.
    var impList = document.createElement("div"); impList.className = "ss-implist";
    var impQueued = false;
    function refreshImpact() {
      if (impQueued) return;
      impQueued = true;
      window.requestAnimationFrame(function () { impQueued = false; renderImpactList(impList, state.scoreImpactPos); });
    }

    // ---- Card 1: the active-score switch (the only control that changes the hub) ----
    var swCard = document.createElement("div"); swCard.className = "ss-card";
    var swLab = document.createElement("div"); swLab.className = "ss-lab"; swLab.textContent = "Active score";
    var seg = document.createElement("div"); seg.className = "ss-seg";
    [["Justaino Score", false], ["My Score", true]].forEach(function (t) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = t[0];
      b.setAttribute("aria-pressed", String(on === t[1]));
      b.addEventListener("click", function () { setScoreOn(t[1]); renderScorePage(); });
      seg.appendChild(b);
    });
    var swNote = document.createElement("div"); swNote.className = "ss-note";
    swNote.innerHTML = !on
      ? "The hub is ranking by the <b>Justaino Score</b>, my own opinion of the meta. Switch to My Score to use your own weighting."
      : (custom
        ? "Everything in the hub - rankings, Best XI, the Squad Builder and the score on a player card - is using <b>My Score</b>. My settings are untouched underneath, so you can switch back any time."
        : "<b>My Score</b> currently matches the Justaino Score exactly. Move anything below and it becomes yours.");
    swCard.appendChild(swLab); swCard.appendChild(seg); swCard.appendChild(swNote);
    bodyEl.appendChild(swCard);

    // Everything below only does anything when My Score is the active one.
    var offCls = on ? "" : " off";

    // ---- Card 2: presets ----
    var preCard = document.createElement("div"); preCard.className = "ss-card" + offCls;
    var preLab = document.createElement("div"); preLab.className = "ss-lab"; preLab.textContent = "Start from";
    var preWrap = document.createElement("div"); preWrap.className = "ss-presets";
    var activeId = activePresetId(), activeNote = "";
    SCORE_PRESETS.forEach(function (p) {
      var b = document.createElement("button"); b.type = "button"; b.className = "ss-preset"; b.textContent = p.name;
      b.setAttribute("aria-pressed", String(on && activeId === p.id));
      b.disabled = !on;
      if (on && activeId === p.id) activeNote = p.note;
      b.addEventListener("click", function () { applyPreset(p); renderScorePage(); });
      preWrap.appendChild(b);
    });
    var preNote = document.createElement("div"); preNote.className = "ss-note";
    preNote.textContent = activeNote || "A preset is just a set of the sliders below. Pick one as a starting point, then adjust.";
    preCard.appendChild(preLab); preCard.appendChild(preWrap); preCard.appendChild(preNote);
    bodyEl.appendChild(preCard);

    // ---- Card 3: the balance (the control that moves rankings most) ----
    var balCard = document.createElement("div"); balCard.className = "ss-card" + offCls;
    var balLab = document.createElement("div"); balLab.className = "ss-lab"; balLab.textContent = "Balance";
    var nums = document.createElement("div"); nums.className = "ss-balnums";
    var statPct = Math.round(CFG.statMix * 100);
    nums.innerHTML = "<div><b id='ss-statpct'>" + statPct + "%</b><span class='k'>Stats</span></div>" +
      "<div class='r'><b id='ss-pspct'>" + (100 - statPct) + "%</b><span class='k'>PlayStyles</span></div>";
    var bar = document.createElement("div"); bar.className = "ss-bar";
    var fill = document.createElement("i"); fill.style.width = statPct + "%"; bar.appendChild(fill);
    var balRange = document.createElement("input");
    balRange.type = "range"; balRange.className = "ss-range";
    balRange.min = Math.round(SCORE_LIMITS.statMix[0] * 100); balRange.max = Math.round(SCORE_LIMITS.statMix[1] * 100);
    balRange.step = 1; balRange.value = statPct; balRange.disabled = !on;
    balRange.setAttribute("aria-label", "Balance between stats and PlayStyles");
    balRange.addEventListener("input", function () {
      var v = Number(balRange.value);
      nums.querySelector("#ss-statpct").textContent = v + "%";
      nums.querySelector("#ss-pspct").textContent = (100 - v) + "%";
      fill.style.width = v + "%";
      setScoreValue("statMix", v / 100);
      refreshImpact();
    });
    var balNote = document.createElement("div"); balNote.className = "ss-note";
    balNote.innerHTML = "How much of the score comes from raw stat fit for the position, versus owning the right PlayStyles for the role. Justaino sits at <b>" + Math.round(d.statMix * 100) + " / " + Math.round((1 - d.statMix) * 100) + "</b>.";
    balCard.appendChild(balLab); balCard.appendChild(nums); balCard.appendChild(bar); balCard.appendChild(balRange); balCard.appendChild(balNote);
    bodyEl.appendChild(balCard);

    // ---- Card 4: the three dials ----
    var dCard = document.createElement("div"); dCard.className = "ss-card" + offCls;
    var dLab = document.createElement("div"); dLab.className = "ss-lab"; dLab.textContent = "Dials";
    dCard.appendChild(dLab);

    dCard.appendChild(ssDial({
      name: "OVR tiebreak", value: Math.round(CFG.ovrMix * 100), disabled: !on,
      min: Math.round(SCORE_LIMITS.ovrMix[0] * 100), max: Math.round(SCORE_LIMITS.ovrMix[1] * 100), step: 1,
      fmt: function (v) { return v + "%"; },
      cap: "How hard the result is pulled toward the card's in-game OVR. Justaino keeps this at " + Math.round(d.ovrMix * 100) + "%, a pure tiebreak.",
      onInput: function (v) { setScoreValue("ovrMix", v / 100); refreshImpact(); }
    }));

    dCard.appendChild(ssDial({
      name: "A PlayStyle+ is worth", value: CFG.psPlusMult, disabled: !on,
      min: SCORE_LIMITS.psPlusMult[0], max: SCORE_LIMITS.psPlusMult[1], step: 0.5,
      fmt: function (v) { return v.toFixed(1) + "×"; },
      cap: "In basic PlayStyles. Higher means owning the right PlayStyle+ counts for far more than owning several ordinary ones. Justaino: " + d.psPlusMult.toFixed(1) + "×.",
      onInput: function (v) { setScoreValue("psPlusMult", v); refreshImpact(); }
    }));

    dCard.appendChild(ssDial({
      name: "Full marks needs", value: CFG.psCeilPlus, disabled: !on,
      min: SCORE_LIMITS.psCeilPlus[0], max: SCORE_LIMITS.psCeilPlus[1], step: 1,
      fmt: function (v) { return v + " PS+"; },
      cap: "The ceiling a card is measured against. Raise it and stacking a sixth relevant PlayStyle+ keeps paying; lower it and a well-built card maxes out sooner. Justaino: " + d.psCeilPlus + ".",
      onInput: function (v) { setScoreValue("psCeilPlus", v); refreshImpact(); }
    }));
    bodyEl.appendChild(dCard);

    // ---- Card 5: "who this moves" - the live re-ranking of YOUR club ----
    // Deliberately NOT dimmed with the others: while the Justaino Score is active it shows your
    // real current top 6 with no movement, which is exactly the "before" picture you'd want.
    var impCard = document.createElement("div"); impCard.className = "ss-card";
    var impHead = document.createElement("div"); impHead.className = "ss-imphead";
    var impLab = document.createElement("div"); impLab.className = "ss-lab"; impLab.textContent = "Who this moves";
    var impSel = document.createElement("select"); impSel.className = "gt-select";
    impSel.innerHTML = META_GROUPS.map(function (g) {
      return "<option" + (g === state.scoreImpactPos ? " selected" : "") + ">" + esc(g) + "</option>";
    }).join("");
    impSel.setAttribute("aria-label", "Position to preview");
    impSel.addEventListener("change", function () {
      state.scoreImpactPos = impSel.value;
      renderImpactList(impList, state.scoreImpactPos);
    });
    impHead.appendChild(impLab); impHead.appendChild(impSel);
    var impNote = document.createElement("div"); impNote.className = "ss-note";
    impNote.innerHTML = "Your top 6 at this position under the settings above. The arrow is how many places they've moved <b>against the Justaino Score order</b>.";
    impCard.appendChild(impHead); impCard.appendChild(impList); impCard.appendChild(impNote);
    bodyEl.appendChild(impCard);
    renderImpactList(impList, state.scoreImpactPos);   // first paint

    // ---- Card 6: Advanced (collapsed) - per-position stat weights, role curve, draft blend ----
    // Folded away by default: these are the knobs you reach for once the headline ones aren't
    // enough. They write into the SAME store, one number at a time (setNestedWeight), so tuning
    // ST's pace never disturbs CB's.
    var advCard = document.createElement("div"); advCard.className = "ss-card" + offCls;
    var advTog = document.createElement("button"); advTog.type = "button"; advTog.className = "gt-benchtoggle";
    advTog.setAttribute("aria-expanded", String(!!state.scoreAdvOpen));
    advTog.disabled = !on;
    advTog.innerHTML = "<span>Advanced &middot; per-position weights</span><span>" + (state.scoreAdvOpen ? "–" : "+") + "</span>";
    advTog.addEventListener("click", function () { state.scoreAdvOpen = !state.scoreAdvOpen; renderScorePage(); });
    advCard.appendChild(advTog);

    if (state.scoreAdvOpen && on) {
      var advBody = document.createElement("div"); advBody.className = "ss-advbody";

      // --- 6a: stat weights for ONE position at a time ---
      var wRow = document.createElement("div"); wRow.className = "ss-imphead";
      var wLab = document.createElement("div"); wLab.className = "ss-lab"; wLab.textContent = "Stat weights";
      var wSel = document.createElement("select"); wSel.className = "gt-select";
      wSel.innerHTML = META_GROUPS.map(function (g) {
        return "<option" + (g === state.scoreAdvPos ? " selected" : "") + ">" + esc(g) + (groupIsTuned(g) ? " •" : "") + "</option>";
      }).join("");
      wSel.setAttribute("aria-label", "Position to edit");
      wSel.addEventListener("change", function () {
        state.scoreAdvPos = wSel.value.replace(/ •$/, "");   // strip the "edited" marker
        renderScorePage();
      });
      wRow.appendChild(wLab); wRow.appendChild(wSel);
      advBody.appendChild(wRow);

      var grp = state.scoreAdvPos;
      var gk = (grp === "GK");
      var labels = gk ? GK_LABELS : FACE_LABELS;
      var baseRow = SCORE_DEFAULTS.statWeights[grp] || {};
      Object.keys(CFG.statWeights[grp] || {}).forEach(function (k) {
        advBody.appendChild(ssWeightRow({
          label: labels[k] || k, value: CFG.statWeights[grp][k], base: baseRow[k],
          min: SCORE_LIMITS.statWeight[0], max: SCORE_LIMITS.statWeight[1], step: 0.5, disabled: !on,
          onInput: function (v) { setNestedWeight("statWeights", grp, k, v); refreshImpact(); }
        }));
      });
      // Skill moves + weak foot ride along as two light extra "stats". Keepers never get them,
      // so the rows simply aren't offered for GK (TRAIT_STAT_WEIGHTS has no GK entry).
      var tw = CFG.traitWeights[grp];
      if (tw && !gk) {
        var tBase = SCORE_DEFAULTS.traitWeights[grp] || {};
        [["sm", "Skill moves"], ["wf", "Weak foot"]].forEach(function (p) {
          advBody.appendChild(ssWeightRow({
            label: p[1], value: tw[p[0]], base: tBase[p[0]],
            min: 0, max: 6, step: 0.5, disabled: !on,
            onInput: function (v) { setNestedWeight("traitWeights", grp, p[0], v); refreshImpact(); }
          }));
        });
      }
      var wNote = document.createElement("div"); wNote.className = "ss-note";
      wNote.innerHTML = "Only the <b>ratios</b> matter, not the scale - doubling every number here changes nothing. " +
        (gk ? "Keepers are scored on their six GK stats." : "Skill moves and weak foot count as two light extra stats.") +
        " A <b>•</b> in the dropdown marks a position you've edited.";
      advBody.appendChild(wNote);
      if (groupIsTuned(grp)) {
        var clr = document.createElement("button"); clr.type = "button"; clr.className = "ss-preset";
        clr.textContent = "Reset " + grp + " to Justaino";
        clr.addEventListener("click", function () { clearGroupWeights(grp); renderScorePage(); });
        advBody.appendChild(clr);
      }

      // --- 6a2: YOUR OWN PlayStyle weights for this position ---
      // The same shape meta-rating.html publishes: PlayStyle -> weight. Taking a position over
      // switches it off the role system, so the numbers here are the whole story for it.
      var pLab = document.createElement("div"); pLab.className = "ss-lab";
      pLab.textContent = "PlayStyle weights · " + grp;
      advBody.appendChild(pLab);

      if (!hasOwnPsList(grp)) {
        // Not taken over yet: show what it values today, read-only, plus the way in.
        var preview = document.createElement("div"); preview.className = "mp-posrow";
        var bw = baselinePsWeights(grp);
        Object.keys(bw).sort(function (a, b) { return bw[b] - bw[a]; }).forEach(function (n) {
          preview.innerHTML += "<span class='mp-poschip'>" + esc(n) + " <b>" + bw[n] + "</b></span>";
        });
        advBody.appendChild(preview);
        var takeNote = document.createElement("div"); takeNote.className = "ss-note";
        takeNote.innerHTML = grp + " currently scores by <b>best-fitting role</b>, and the above is what it can " +
          "value. Take it over to set your own PlayStyles and weights - you'll start from these numbers.";
        advBody.appendChild(takeNote);
        var take = document.createElement("button"); take.type = "button"; take.className = "ss-preset";
        take.textContent = "Use my own list for " + grp;
        take.addEventListener("click", function () { startOwnPsList(grp); renderScorePage(); });
        advBody.appendChild(take);
      } else {
        // Taken over: one editable row per PlayStyle, heaviest first, each removable.
        var mine = CFG.psWeights[grp];
        Object.keys(mine).sort(function (a, b) { return mine[b] - mine[a]; }).forEach(function (n) {
          var row = document.createElement("div"); row.className = "ss-psrow";
          var dial = ssWeightRow({
            label: n, value: mine[n], base: baselinePsWeights(grp)[n] != null ? baselinePsWeights(grp)[n] : 0,
            min: SCORE_LIMITS.rank[0], max: SCORE_LIMITS.rank[1], step: 0.5, disabled: !on,
            onInput: function (v) { setPsWeight(grp, n, v); refreshImpact(); }
          });
          dial.classList.add("ss-psdial");
          var del = document.createElement("button"); del.type = "button"; del.className = "ss-psdel";
          del.innerHTML = "×"; del.title = "Remove " + n + " from " + grp;
          del.setAttribute("aria-label", del.title);
          del.addEventListener("click", function () { setPsWeight(grp, n, null); renderScorePage(); });
          row.appendChild(dial); row.appendChild(del);
          advBody.appendChild(row);
        });

        // Add a PlayStyle: every one not already on the list. GK-only PlayStyles are offered ONLY
        // for GK, and the GK position is offered ONLY those plus the general ones - same rule the
        // evo picker uses (the catalog's g:1 flag).
        var addRow = document.createElement("div"); addRow.className = "ss-imphead";
        var addSel = document.createElement("select"); addSel.className = "gt-select"; addSel.style.flex = "1";
        var avail = PS.filter(function (e) {
          if (mine[e.n] != null) return false;              // already on the list
          return gk ? true : !e.g;                          // GK-only PlayStyles are for keepers only
        }).map(function (e) { return e.n; }).sort();
        addSel.innerHTML = "<option value=''>+ Add a PlayStyle…</option>" +
          avail.map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("");
        addSel.setAttribute("aria-label", "Add a PlayStyle to " + grp);
        addSel.addEventListener("change", function () {
          if (!addSel.value) return;
          setPsWeight(grp, addSel.value, 2);                // lands mid-table; drag it where you want
          renderScorePage();
        });
        addRow.appendChild(addSel);
        advBody.appendChild(addRow);

        var pNote = document.createElement("div"); pNote.className = "ss-note";
        pNote.innerHTML = "<b>" + esc(grp) + " now scores on this list, not by role.</b> A PlayStyle+ still counts " +
          CFG.psPlusMult + "× its number here. Anything not listed is worth nothing at " + esc(grp) + ". " +
          "Only the ratios matter, and the 0-100 ceiling follows the list, so a very short list makes scores swingy.";
        advBody.appendChild(pNote);
        var giveBack = document.createElement("button"); giveBack.type = "button"; giveBack.className = "ss-preset";
        giveBack.textContent = "Score " + grp + " by role again";
        giveBack.addEventListener("click", function () { dropOwnPsList(grp); renderScorePage(); });
        advBody.appendChild(giveBack);
      }

      // --- 6b: the role priority curve ---
      var cLab = document.createElement("div"); cLab.className = "ss-lab"; cLab.textContent = "Role priority curve";
      advBody.appendChild(cLab);
      [["Top 2 PlayStyles", 0], ["Next 2", 1], ["Next 2", 2], ["The rest", 3]].forEach(function (p) {
        advBody.appendChild(ssWeightRow({
          label: p[0], value: CFG.rankCurve[p[1]], base: SCORE_DEFAULTS.rankCurve[p[1]],
          min: SCORE_LIMITS.rank[0], max: SCORE_LIMITS.rank[1], step: 0.5, disabled: !on,
          onInput: function (v) { setRankCurveAt(p[1], v); refreshImpact(); }
        }));
      });
      var cNote = document.createElement("div"); cNote.className = "ss-note";
      cNote.innerHTML = "Each role has a priority-ordered list of PlayStyles. This is how much credit each rank earns. " +
        "Steepen it (say 6/2/1/0) so only a role's top couple of PlayStyles really count, or flatten it so anything relevant counts.";
      advBody.appendChild(cNote);

      // --- 6c: the Squad Builder's own draft blend ---
      var sLab = document.createElement("div"); sLab.className = "ss-lab"; sLab.textContent = "Squad Builder draft";
      advBody.appendChild(sLab);
      advBody.appendChild(ssDial({
        name: "Lean on OVR", value: Math.round(CFG.draftOvrMix * 100), disabled: !on,
        min: 0, max: 100, step: 5,
        fmt: function (v) { return v + "%"; },
        cap: "The Gauntlet Squad Builder drafts on a blend of OVR and the score, not the score alone - strong cards should start. " +
          Math.round(SCORE_DEFAULTS.draftOvrMix * 100) + "% is my default; drop it to let your weighting shape those squads more.",
        onInput: function (v) { setScoreValue("draftOvrMix", v / 100); }
      }));

      advCard.appendChild(advBody);
    }
    bodyEl.appendChild(advCard);

    // ---- Storage warning: only when a save has actually failed (see saveScoreState) ----
    if (!scoreSaveOk) {
      var warn = document.createElement("div"); warn.className = "gt-warn2";
      warn.innerHTML = "<b>Your settings can't be saved.</b> This browser's storage for the FC web app is full, so anything you change here will be lost when you reload. Open the Console and run <b>localStorage.removeItem('console-history')</b> to free some up.";
      bodyEl.appendChild(warn);
    }

    // ---- Actions ----
    var acts = document.createElement("div"); acts.className = "gt-actions";
    var row = document.createElement("div"); row.className = "gt-arow";
    var doneBtn = document.createElement("button"); doneBtn.type = "button"; doneBtn.className = "gt-cbtn"; doneBtn.textContent = "Done";
    doneBtn.addEventListener("click", closeScorePage);
    var resetBtn = document.createElement("button"); resetBtn.type = "button"; resetBtn.className = "gt-rbtn"; resetBtn.textContent = "Reset to Justaino";
    resetBtn.disabled = !hasScoreDiffs() && !on;
    resetBtn.addEventListener("click", function () {
      if (hasScoreDiffs() && !window.confirm("Throw away every custom value and switch back to the Justaino Score?\n\nThis can't be undone.")) return;
      resetScore(); renderScorePage();
    });
    row.appendChild(doneBtn); row.appendChild(resetBtn);
    var actNote = document.createElement("div"); actNote.className = "ss-note";
    actNote.textContent = "Changes apply and save as you move them - there's nothing to submit. Saved in this browser only.";
    acts.appendChild(row); acts.appendChild(actNote);
    bodyEl.appendChild(acts);

    ssHost.appendChild(bodyEl);
    // Restore the scroll position. Once now (covers the usual case) and once on the next frame,
    // because a taller/shorter page can still be settling its layout and would clamp the value.
    if (prevScroll) {
      bodyEl.scrollTop = prevScroll;
      window.requestAnimationFrame(function () { if (bodyEl.parentNode) bodyEl.scrollTop = prevScroll; });
    }
  }

  // Console helper: open the page without clicking.
  window.FC26.openScorePage = openScorePage;

  var squadMod = document.createElement("div");
  squadMod.className = "fc26-squad";
  squadMod.appendChild(pickerHead); squadMod.appendChild(clubStat); squadMod.appendChild(playerSearch); squadMod.appendChild(filterRow); squadMod.appendChild(eligManageRow); squadMod.appendChild(eligManager); squadMod.appendChild(batchBar); squadMod.appendChild(playerList); squadMod.appendChild(lineupStub); squadMod.appendChild(metaLaunch); squadMod.appendChild(gtSection); squadMod.appendChild(dashLaunch);
  // Group 2 - Build (Suggest + tabs + evo grid).  (preview is its own module, moved directly.)
  var buildMod = document.createElement("div");
  buildMod.appendChild(evoTitle); buildMod.appendChild(suggestRow); buildMod.appendChild(tabs); buildMod.appendChild(evoCount); buildMod.appendChild(evoList); buildMod.appendChild(ghSection);
  // Group 3 - Apply. The "run row" (optRow) holds the delay chip + Apply/Stop side by side
  // (Apply and Stop swap in the same slot), then the animation/summary box + status line.
  optRow.appendChild(applyBtn); optRow.appendChild(stopBtn);
  var applyMod = document.createElement("div");
  applyMod.appendChild(batchList); applyMod.appendChild(optRow); applyMod.appendChild(applyBox); applyMod.appendChild(status);

  // NOTE: three things used to live here and were removed when the mobile Deck and Review
  // steps were merged into one "Build & Apply" step:
  //   wizWho / updateWizWho - a compact "selected player" header that was never actually
  //                           added to the DOM, so it had been dead code for a while.
  //   deckSummary           - the slim rating/name/caps bar atop the old Deck step.
  //   reviewSummary         - the "about to apply" target + chip list on the old Review step.
  //   capMetersHTML         - only existed so deckSummary could reuse the preview's meters.
  // Both summaries were mobile-only echoes of the desktop spotlight card. Now that the card
  // itself (preview / renderPreview) is ON the mobile build step, they were showing the same
  // data in a third and fourth shape, which is what made the phone flow feel scattered.

  // Mobile scaffolding: a tab bar up top and the current section scrolling below it.
  //
  // TWO steps, not three. It used to be Lineup / PlayStyle Deck / Review, which is what made
  // the phone feel unlike the desktop dock: the deck and the Apply button were on separate
  // screens, Review was gated behind reviewReady(), and each screen had its own bespoke
  // summary bar. Desktop's right-hand pane is already "spotlight card, then deck, then
  // apply" stacked vertically, which is exactly what a phone wants - so step 2 is now that
  // same stack, using the same element instances. See renderWizStep below.
  var layoutHost = document.createElement("div");             // the one box we rebuild the layout into
  layoutHost.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column";
  var stepper = document.createElement("div"); stepper.className = "fc26-chtabs";      // the channel tab bar
  var stepBody = document.createElement("div"); stepBody.className = "fc26-stepbody";   // the scrolling section
  var STEP_LABELS = ["Lineup", "Build & Apply"];              // channel-tab labels (1 / 2)

  // Mobile "guide" button: the one hop from Lineup to Build & Apply. It only needs a player
  // (or a batch) to be enabled - there's no second gate any more, because Apply now lives on
  // the same step as the deck and is separately greyed out by updateApplyBtn until something
  // is ticked. updateGuide() keeps its label/enabled state live.
  var guideBtn = document.createElement("button");
  guideBtn.className = "fc26-guidebtn";
  guideBtn.addEventListener("click", function () { goStep(state.wizStep + 1); });
  function updateGuide() {
    if (!guideBtn) return;
    if (state.wizStep >= 2) { guideBtn.style.display = "none"; return; }   // Apply lives on this step
    guideBtn.style.display = "";
    var can = !!state.player || state.batch.size > 0;
    guideBtn.textContent = can ? "Next: Build & Apply →" : "Pick a player first";
    guideBtn.disabled = !can;
    guideBtn.classList.toggle("dis", !can);
  }

  // goStep(n): change wizard step (clamped 1-2) and redraw, on mobile. No gate: tapping
  // "Build & Apply" with nobody selected just shows the same "pick a player" prompt the
  // desktop deck shows, rather than silently refusing the tap.
  function goStep(n) {
    n = Math.max(1, Math.min(2, n));
    state.wizStep = n;
    if (currentMode() === "mobile") renderWizStep();
  }

  // renderWizStep(): draw the stepper + show the current step's modules + set nav buttons.
  function renderWizStep() {
    stepper.innerHTML = "";
    for (var i = 1; i <= 2; i++) {
      (function (n) {
        var s = document.createElement("div");
        s.className = "fc26-chtab" + (n === state.wizStep ? " on" : "");   // active channel highlighted
        s.textContent = STEP_LABELS[n - 1];
        s.addEventListener("click", function () { goStep(n); });
        stepper.appendChild(s);
      })(i);
    }
    stepBody.innerHTML = "";
    if (state.wizStep === 1) {                                 // Lineup: pick a player
      stepBody.appendChild(squadMod);
      updateLineupCollapse();                                  // re-evaluate the list/stub for mobile
    } else {
      // Build & Apply: the SAME three modules, in the SAME order, as the desktop dock's
      // right-hand pane (see buildDesktop's narrow "r2" branch). Not copies - the very same
      // elements, re-parented, so every listener and all state carries over untouched.
      renderPreview();                                         // redraw for this mode (it folds detail away on a phone)
      stepBody.appendChild(preview); stepBody.appendChild(spotHint);
      stepBody.appendChild(buildMod); stepBody.appendChild(applyMod);
    }
    updateGuide();   // set the guide button label/enabled for this step
  }

  // NARROW_DESKTOP: below this PANEL width (px) the desktop dock drops from three columns
  // to two, so a small dock never squeezes the style deck. (The panel is resizable, so this
  // is measured off the panel, not the viewport.)
  var NARROW_DESKTOP = 840;
  // desktopColMode(): 3 columns when the dock is wide, 2 when it's been resized narrow.
  function desktopColMode() {
    var w = panel.getBoundingClientRect().width || window.innerWidth;
    return w < NARROW_DESKTOP ? 2 : 3;
  }
  // buildDesktop(): (re)draw the desktop columns for the current width.
  //   WIDE (3 cols): lineup rail | spotlight (preview) | style deck (build + apply).
  //   NARROW (2 cols): lineup rail | one right pane with the spotlight stacked ON TOP of
  //     the deck (like the old two-pane layout), so nothing gets crushed sideways.
  // Same element instances are just re-parented, so all state/listeners survive.
  function buildDesktop() {
    state.desktopCols = desktopColMode();
    layoutHost.innerHTML = "";
    var cols = document.createElement("div"); cols.className = "fc26-cols";
    var l = document.createElement("div"); l.className = "fc26-pane l";
    l.appendChild(squadMod);
    cols.appendChild(l);
    if (state.desktopCols === 3) {
      var mid = document.createElement("div"); mid.className = "fc26-pane m";
      mid.appendChild(preview); mid.appendChild(spotHint);
      var r = document.createElement("div"); r.className = "fc26-pane r";
      r.appendChild(buildMod); r.appendChild(applyMod);
      cols.appendChild(mid); cols.appendChild(r);
    } else {
      // Narrow: spotlight stacks on top of the deck in a single flexible right pane.
      var r2 = document.createElement("div"); r2.className = "fc26-pane r2";
      r2.appendChild(preview); r2.appendChild(buildMod); r2.appendChild(applyMod);
      cols.appendChild(r2);
    }
    layoutHost.appendChild(cols);
    updateLineupCollapse();   // desktop always shows the full list (stub hidden)
  }
  // maybeReflowDesktop(): while resizing (or on a window resize) re-split the columns only
  // when the width actually crosses the wide/narrow threshold - cheap, no needless rebuilds.
  function maybeReflowDesktop() {
    if (currentMode() !== "desktop") return;
    if (desktopColMode() !== state.desktopCols) buildDesktop();
  }

  // applyLayout(): (re)build the whole layout for the current screen width.
  function applyLayout() {
    var m = currentMode();
    applyPanelChrome();   // set the panel's class + position (mode + minimized + saved spot)
    // In BOTH modes an inner element scrolls, not the host: desktop = the panes; mobile =
    // the section body (fc26-stepbody), so the tab bar + pinned spotlight stay put.
    layoutHost.style.overflowX = "hidden";
    layoutHost.style.overflowY = "hidden";
    layoutHost.innerHTML = "";
    if (m === "desktop") {
      buildDesktop();   // 3 or 2 columns depending on the dock's current width
    } else {
      layoutHost.appendChild(stepper); layoutHost.appendChild(stepBody); layoutHost.appendChild(guideBtn);
      renderWizStep();
    }
    // Keep the full-screen Squad Builder in front if it's open (e.g. after a phone/desktop flip),
    // and rebuild it for the new mode. layoutHost was just rebuilt above, so hide it again.
    if (state.builderOpen) { layoutHost.style.display = "none"; builderHost.style.display = "flex"; renderBuilder(); }
    if (state.metaPageOpen) { layoutHost.style.display = "none"; metaPageHost.style.display = "flex"; renderMetaPage(); }
    // Same for the other two full-screen pages (the Dashboard was missing here, so rotating
    // a phone with it open used to dump you back on the main layout with the page still "open").
    if (state.dashOpen) { layoutHost.style.display = "none"; dashHost.style.display = "flex"; renderDashPage(); }
    // Peks Lab is checked LAST and hides the meta page, because it's normally opened
    // FROM it - both flags are true at once, and the settings page is the one in front.
    if (state.scorePageOpen) { layoutHost.style.display = "none"; metaPageHost.style.display = "none"; ssHost.style.display = "flex"; renderScorePage(); }
    // applyPanelChrome (above) clamped using the height BEFORE this content was added, so
    // re-clamp now that the real height is known - otherwise the tall panel can start
    // partly off-screen and its scrollbar be unreachable.
    reclampPanel();
  }

  // Rebuild the layout when the screen crosses the phone/desktop breakpoint (resize/rotate).
  try { mq.addEventListener("change", applyLayout); } catch (e) { try { mq.addListener(applyLayout); } catch (e2) {} }

  renderPlayers();     // show whatever's cached immediately (the squad)
  populatePositions(); // fill the position/role dropdowns
  renderEvos();        // show the "select a player" prompt in the evo area
  updateBatchUI();     // batch bar hidden + Suggest enabled to start (empty batch)
  // Only fetch the full club if we didn't inherit it from the previous click. If we
  // did, it's shown instantly; hit "↻ Reload club" to pull a fresh copy.
  if (state.clubItems && state.clubItems.length) {
    setClubStatus(clubReadyText());
  } else {
    loadFullClub();    // first run: load the FULL club in the background and redraw
  }

  applyLayout();                 // build the initial layout for this screen
  body.appendChild(layoutHost);
  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);
})();
