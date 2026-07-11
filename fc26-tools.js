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
  var prevClub = null;
  try { if (window.FC26 && window.FC26.state && window.FC26.state.clubItems) prevClub = window.FC26.state.clubItems; } catch (e) {}
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
  //   - Caps per player: at most 3 PlayStyle+ and 8 basic PlayStyles.
  // ----------------------------------------------------------------------------

  // Version shown as a little badge in the panel header. It stays "dev" here in the
  // readable source (so a console/test build clearly reads "dev"); when you cut a
  // release, release.js stamps the real "vN" into the built bookmarklet. So an
  // INSTALLED copy shows exactly which published version it is, e.g. "v4".
  var FC26_VERSION = "v19";

  var TRAIT_OFFSET = 301;   // traitId = rewardId - 301
  var CAP_PLUS = 3;         // a player can hold at most 3 PlayStyle+  (PS+)
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
  var RARITIES = {"0":"Common","1":"Rare","3":"Team of the Week","5":"Team of the Year","8":"Star Performer","11":"Team of the Season","12":"Icon","14":"Knockout Royalty Hero","15":"Knockout Royalty ICON","18":"Festival of Football ICON","20":"FoF: Answer the Call","21":"Prime Hero","22":"Ratings Reload","23":"Future Stars Hero","26":"UCL Primetime Hero","27":"UWCL Primetime Hero","28":"Festival of Football: Captains","30":"FUT Birthday","31":"UEFA Women's Champions League Primetime","32":"UEFA Women's Champions League Road to the Final","33":"Thunderstruck","34":"FC Pro Live","35":"Winter Wildcards ICON","36":"Journey of Nations","46":"UEFA Europa League Primetime","49":"Winter Wildcards Hero","50":"UEFA Champions League Primetime","55":"Knockout Royalty","57":"Showdown Upgrade","58":"Showdown","62":"Festival of Football Showdown","63":"Festival of Football Showdown Upgrade","64":"TOTY Honourable Mentions","65":"TOTS Honourable Mentions","69":"World Tour Silver Superstar","71":"Future Stars","72":"Heroes","76":"Trophy Titans ICON","77":"Trophy Titans Hero","81":"Classic XI Hero","82":"Unbreakables","83":"Unbreakables Hero","85":"Unbreakables ICON","88":"Unbreakables Evolution","90":"Moments","91":"World Tour","94":"Festival of Football: Star Performer","96":"Joga Bonito","97":"Joga Bonito Hero","98":"Festival of Football: National Pride","104":"Festival of Football: Glory Hunters Red","105":"UEFA Conference League Primetime","107":"Festival of Football: Path to Glory","108":"Time Warp","109":"Festival of Football: Glory Hunters","111":"Fantasy FC","112":"Time Warp ICON","116":"Festival of Football: Captains ICON","117":"Winter Wildcards","120":"TOTS Breakthrough","124":"UEFA Champions League Road to the Final","125":"UEFA Europa League Road to the Final","126":"UEFA Conference League Road to the Final","127":"Team of the Season Champions","130":"Festival of Football: Greats of the Game Hero","131":"Festival of Football: Greats of the Game ICON","132":"TOTY HM Evolution","135":"Fantasy FC Hero","147":"FUT Birthday EVO","148":"FUT Birthday Hero","149":"FUT Birthday ICON","150":"Cornerstones","151":"Ultimate Scream","155":"Team of the Year ICON","157":"Thunderstruck ICON","163":"eCL Icon","168":"Ultimate Scream Hero","170":"Future Stars ICON"};

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
  var ELIG_SEED = [30, 98, 109];            // starter guess (from reference-evo.js) - edit freely
  // loadEligible(): the saved list, or the seed on first ever run.
  function loadEligible() {
    try { var raw = window.localStorage.getItem(ELIG_KEY); if (raw) return new Set(JSON.parse(raw).map(Number)); } catch (e) {}
    return new Set(ELIG_SEED);
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
  var state = { player: null, selected: new Set(), tab: "PS+", running: false, abort: false, clubItems: prevClub, eligible: loadEligible(), onlyEligible: loadOnlyEligible(), batch: new Map(), theme: loadTheme(), rarityDefs: loadRarityDefs() };

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

  // Recommended playstyles per position/role, in priority order. The top 3 become
  // PS+, the rest basic PlayStyles.
  var ROLES = {"ST":{"Advanced Forward":["Finesse Shot","Low Driven Shot","Rapid","Incisive Pass","Gamechanger","Quick Step","Technical","Tiki Taka","First Touch","Press Proven","Enforcer"],"Target Forward":["Finesse Shot","Enforcer","Precision Header","Low Driven Shot","Incisive Pass","Rapid","First Touch","Gamechanger","Tiki Taka","Press Proven","Pinged Pass"],"Poacher":["Finesse Shot","Low Driven Shot","Rapid","Incisive Pass","First Touch","Gamechanger","Quick Step","Technical","Press Proven","Pinged Pass","Enforcer"],"False 9":["Finesse Shot","Incisive Pass","Low Driven Shot","Gamechanger","Rapid","Tiki Taka","Technical","Pinged Pass","Quick Step","Inventive","First Touch"]},"RW / LW":{"Inside Forward":["Finesse Shot","Low Driven Shot","Rapid","Quick Step","Technical","Gamechanger","Incisive Pass","Pinged Pass","Tiki Taka","First Touch","Inventive"],"Winger":["Rapid","Finesse Shot","Pinged Pass","Quick Step","Technical","Low Driven Shot","Gamechanger","Incisive Pass","Tiki Taka","First Touch","Inventive"],"Wide Playmaker":["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Pinged Pass","Rapid","Low Driven Shot","Gamechanger","Press Proven","First Touch","Inventive"]},"CAM":{"Shadow Striker":["Finesse Shot","Incisive Pass","Rapid","Low Driven Shot","Technical","Quick Step","Tiki Taka","Gamechanger","First Touch","Pinged Pass","Inventive"],"Playmaker":["Finesse Shot","Incisive Pass","Low Driven Shot","Tiki Taka","Pinged Pass","Technical","Gamechanger","First Touch","Press Proven","Quick Step","Inventive"],"Classic 10":["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Pinged Pass","Low Driven Shot","Gamechanger","First Touch","Press Proven","Quick Step","Inventive"],"Half Winger":["Incisive Pass","Rapid","Technical","Tiki Taka","Pinged Pass","Gamechanger","Quick Step","First Touch","Press Proven","Inventive","Low Driven Shot"]},"CM":{"Box to Box":["Incisive Pass","Pinged Pass","Intercept","Finesse Shot","Tiki Taka","Bruiser","Anticipate","Quick Step","Technical","Relentless","Press Proven"],"Playmaker":["Incisive Pass","Pinged Pass","Finesse Shot","Tiki Taka","Technical","Intercept","Low Driven Shot","Anticipate","First Touch","Quick Step","Inventive"],"Deep Lying Playmaker":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Incisive Pass","Anticipate","Jockey","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Holding":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Anticipate","Jockey","Incisive Pass","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Half Winger":["Pinged Pass","Intercept","Quick Step","Tiki Taka","Incisive Pass","Finesse Shot","Anticipate","Technical","Jockey","Bruiser","Rapid"]},"RM / LM":{"Inside Forward":["Finesse Shot","Low Driven Shot","Rapid","Quick Step","Technical","Gamechanger","Incisive Pass","Pinged Pass","Tiki Taka","First Touch","Inventive"],"Winger":["Rapid","Finesse Shot","Pinged Pass","Quick Step","Technical","Low Driven Shot","Gamechanger","Incisive Pass","Tiki Taka","First Touch","Inventive"],"Wide Playmaker":["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Pinged Pass","Rapid","Low Driven Shot","Gamechanger","Press Proven","First Touch","Inventive"],"Wide Midfielder":["Rapid","Quick Step","Pinged Pass","Tiki Taka","Incisive Pass","Intercept","Anticipate","Relentless","Whipped Pass","Jockey","Press Proven"]},"CDM":{"Holding":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Anticipate","Jockey","Incisive Pass","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Deep Lying Playmaker":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Incisive Pass","Anticipate","Jockey","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Box Crasher":["Incisive Pass","Intercept","Pinged Pass","Finesse Shot","Tiki Taka","Quick Step","Bruiser","Anticipate","Technical","Press Proven","Relentless"],"Centre Half":["Intercept","Bruiser","Jockey","Anticipate","Quick Step","Block","Tiki Taka","Pinged Pass","Aerial Fortress","Slide Tackle","Long Ball Pass"],"Wide Half":["Bruiser","Intercept","Quick Step","Jockey","Anticipate","Incisive Pass","Block","Tiki Taka","Pinged Pass","Press Proven","Relentless"]},"RB / LB":{"Fullback":["Bruiser","Intercept","Quick Step","Jockey","Anticipate","Incisive Pass","Block","Tiki Taka","Pinged Pass","Press Proven","Relentless"],"Wingback":["Intercept","Pinged Pass","Quick Step","Anticipate","Bruiser","Tiki Taka","Jockey","Incisive Pass","Rapid","Relentless","Press Proven"],"Falseback":["Intercept","Pinged Pass","Anticipate","Jockey","Tiki Taka","Incisive Pass","Bruiser","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Inverted Wingback":["Incisive Pass","Tiki Taka","Quick Step","Intercept","Anticipate","Rapid","Pinged Pass","Jockey","Press Proven","Relentless","Bruiser"],"Attacking Wingback":["Rapid","Quick Step","Pinged Pass","Tiki Taka","Incisive Pass","Intercept","Anticipate","Relentless","Jockey","First Touch","Bruiser"]},"CB":{"Defender":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Pinged Pass","Aerial Fortress","Slide Tackle","Tiki Taka","Press Proven"],"Stopper":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Slide Tackle","Tiki Taka","Pinged Pass","Relentless","Aerial Fortress"],"Wide Back":["Intercept","Anticipate","Quick Step","Jockey","Bruiser","Block","Pinged Pass","Aerial Fortress","Slide Tackle","Tiki Taka","Press Proven"],"Ball Playing Defender":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Pinged Pass","Tiki Taka","First Touch","Press Proven","Aerial Fortress"]},"GK":{"Goalkeeper":["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Far Throw","Pinged Pass","Long Ball Pass","Tiki Taka","Press Proven","First Touch"],"Ball Playing":["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Pinged Pass","Far Throw","Long Ball Pass","Tiki Taka","Press Proven","First Touch"],"Sweeper Keeper":["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Pinged Pass","Far Throw","Long Ball Pass","Tiki Taka","Press Proven","First Touch"]}};

  // POSITION-GROUP FALLBACK TAILS.
  // The role lists above are only 11 long (= the 3 PS+ + 8 basic cap). If a player
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
  // by this fraction. OVR is still an imperfect proxy for how a card plays (a 97 can have 50s face
  // stats), but the user wants marquee high-OVR cards (e.g. Maradona) to rank up, so we now give it
  // real weight. At 0.35 the final rating is 65% stat/PlayStyle fit + 35% raw OVR, so a top-OVR card
  // gets a clear lift without fully overriding the PlayStyle/stat order. Set it to 0 to ignore OVR.
  var OVR_MIX  = 0.35;

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
    for (i = 0; i < PS_CEIL_PLUS && i < vals.length; i++) topPlus += vals[i];    // best PS_CEIL_PLUS owned as PS+
    for (i = PS_CEIL_PLUS; i < vals.length; i++) restBasic += vals[i];           // EVERY other meta PlayStyle as a basic (no cap)
    return (topPlus * PSPLUS_MULT + restBasic) || 1;                 // never zero
  }

  // roleWeightsFromList(list): turn a role's ORDERED priority PlayStyle list (from ROLES) into a
  // {name: weight} map by rank - the top of the list matters most. This is the fut.gg-style move:
  // score against a specific role's priorities rather than one blunt per-group table. Schedule
  // mirrors the old hand-tuned scale (top pair = 4, next pair = 3, ... ) so numbers stay familiar.
  function roleWeightsFromList(list) {
    var w = {};
    for (var i = 0; i < list.length; i++) {
      // EVERY PlayStyle a role lists gets a non-zero weight (top pair = 4 ... tail = 1), so nothing
      // a role considers relevant is ignored. Only PlayStyles absent from the role entirely = 0.
      var wt = i < 2 ? 4 : i < 4 ? 3 : i < 6 ? 2 : 1;
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
    var sw = STAT_WEIGHTS[group];
    if (!sw) return { stat: 0, playstyle: 0, psScore: 0, statPart: 0, psPart: 0, total: 0, hits: [], statsUsed: {}, group: group, role: null };

    // --- stat part: weighted average of the stats this position cares about (0-99) ---
    var stats = readStats(it);
    var wsum = 0, vsum = 0, used = {};
    for (var k in sw) { wsum += sw[k]; vsum += sw[k] * (stats[k] || 0); used[k] = (stats[k] || 0); }
    // fut.gg-style: fold WEAK FOOT + SKILL MOVES in as two light "attributes" (outfielders only).
    // A star (1-5) is scaled to the 0-99 stat range and weighted per group (TRAIT_STAT_WEIGHTS),
    // so it nudges the stat average rather than adding a separate term - keeps stat + PS = total.
    if (!isGKPlayer(it)) {
      var tw = TRAIT_STAT_WEIGHTS[group];
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
    var roleTable = ROLES[group];
    var cands = [];
    if (roleTable) {
      Object.keys(roleTable).forEach(function (rn) { cands.push({ role: rn, weights: roleWeightsFromList(roleTable[rn]) }); });
    }
    if (!cands.length) cands.push({ role: null, weights: PLAYSTYLE_WEIGHTS[group] || {} });
    var bestRole = null, psScore = 0, psRaw = 0, hits = [];
    cands.forEach(function (c) {
      var raw = 0, h = [];
      owned.forEach(function (o) {
        var base = c.weights[o.name] || 0;
        if (!base) return;
        var val = o.isIcon ? base * PSPLUS_MULT : base;   // a PlayStyle+ counts PSPLUS_MULT x a basic
        raw += val;
        h.push({ name: o.name, isIcon: o.isIcon, val: val });
      });
      var score = Math.min(1, raw / psMaxForWeights(c.weights)) * 100;
      if (bestRole === null || score > psScore) { bestRole = c.role; psScore = score; psRaw = raw; hits = h; }
    });

    // --- blend the two 0-100 halves, then pull toward the card's OVR (quality floor, mix up top) ---
    var statPart = STAT_MIX * statScore;
    var psPart = PS_MIX * psScore;
    var metaBlend = Math.min(100, Math.max(0, statPart + psPart));   // pure stat+PlayStyle score
    var ovr = (typeof it.rating === "number") ? it.rating : metaBlend;
    var total = Math.max(0, Math.min(100, (1 - OVR_MIX) * metaBlend + OVR_MIX * ovr));

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
  //   window.FC26.STAT_WEIGHTS / .PLAYSTYLE_WEIGHTS -> the live tables
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

  // DEPTH CHECK - run BEFORE building so we never show broken squads.
  // Two tests:
  //   1. Total: the club needs at least 11 * N usable players.
  //   2. Per group: each group needs (times it appears in the formation) * N
  //      candidates who can play it. Players overlap groups, so passing this is
  //      necessary but not a hard guarantee; a FAILURE, though, is a real,
  //      specific shortage worth reporting by name.
  function gauntletDepth(formationSlots, n, sides) {
    var players = gauntletPool();
    // Count how many of each group+side the formation asks for. Sided slots are keyed
    // "group|R" / "group|L" so a shortage on ONE flank (e.g. no left-backs) is reported,
    // not hidden by a healthy count on the other. Central slots key on group alone.
    var need = {};
    formationSlots.forEach(function (g, idx) {
      var side = (sides && sides[idx]) || "C";
      var key = (side === "C") ? g : (g + "|" + side);
      need[key] = (need[key] || 0) + 1;
    });
    var shortages = [];
    Object.keys(need).forEach(function (key) {
      var parts = key.split("|"), g = parts[0], side = parts[1] || "C";
      var required = need[key] * n;
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
  // ONLY to break near-ties: between candidates whose Justaino scores are within
  // CHEM_EPSILON of the best available, we prefer the one who shares a league or
  // nation with players already in that squad. Small epsilon = rating still leads.
  var CHEM_EPSILON = 3;
  // Every already-placed player in a squad (starters + subs drafted so far).
  function squadPlaced(squad) {
    var arr = [];
    squad.slots.forEach(function (c) { if (c && c.player) arr.push(c.player); });
    squad.subs.forEach(function (c) { if (c && c.player) arr.push(c.player); });
    return arr;
  }
  // How many "links" a candidate would add: +1 per squad-mate sharing its league,
  // +1 per squad-mate sharing its nation.
  function chemAffinity(placed, cand) {
    var lg = cand.leagueId, nt = cand.nationId, a = 0;
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (lg != null && p.leagueId === lg) a++;
      if (nt != null && p.nationId === nt) a++;
    }
    return a;
  }
  // From a list of {i, score, group} candidates (i = index into pool), keep those
  // within CHEM_EPSILON of the top score, then choose the best by chem affinity,
  // then score, then OVR. Returns the winning candidate (with .i/.score/.group) or null.
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
        best = { i: c.i, score: c.score, group: c.group, aff: aff, rating: rating };
      }
    });
    return best;
  }
  // Per-squad readout: the biggest single-league and single-nation cluster in it,
  // so the chemistry effect is visible without needing league/nation NAMES.
  function chemSummary(placed) {
    var lg = {}, nt = {};
    placed.forEach(function (p) {
      if (p.leagueId != null) lg[p.leagueId] = (lg[p.leagueId] || 0) + 1;
      if (p.nationId != null) nt[p.nationId] = (nt[p.nationId] || 0) + 1;
    });
    function max(o) { var m = 0; Object.keys(o).forEach(function (k) { if (o[k] > m) m = o[k]; }); return m; }
    return { maxLeague: max(lg), maxNation: max(nt) };
  }

  // THE SNAKE DRAFT.
  // Fill the formation slot by slot (one "round" per slot). In each round every
  // squad drafts one player for that slot's group; the draft ORDER flips each
  // round (1..N, then N..1, then 1..N, ...) so no single squad always gets first
  // pick. Each pick takes the best still-available player (highest scorePlayer
  // for that group), then removes them from the shared pool so no player is ever
  // reused across squads. We fill the SCARCEST groups first (fewest candidates)
  // so tight positions get served before the pool is thinned by easy ones.
  function buildGauntlet(formationName, n) {
    var formationSlots = FORMATIONS[formationName];
    if (!formationSlots) return { error: "Unknown formation: " + formationName };
    n = Math.max(1, Math.min(5, n | 0));

    // The L/R side each slot demands (central slots = "C", no side gate).
    var sides = formationSides(formationName);
    var depth = gauntletDepth(formationSlots, n, sides);

    // Pool of available players (we splice out of a working copy as we draft).
    var pool = gauntletPool().slice();

    // Order the 11 slots scarcest-first. We keep each slot's ORIGINAL index so
    // the finished squad can be shown back in normal formation order (GK first).
    // Scarcity is SIDE-aware (canPlaySlot), so a slot with few left-siders sorts early.
    var slotOrder = formationSlots.map(function (group, idx) {
      var side = sides[idx] || "C";
      var cand = pool.filter(function (it) { return canPlaySlot(it, group, side); }).length;
      return { group: group, idx: idx, side: side, cand: cand };
    }).sort(function (a, b) { return a.cand - b.cand; });

    // Prepare N empty squads. Each has 11 starter slots (by original index) plus a
    // bench that we fill after the XIs are done.
    // Each squad also carries a `keys` set of the PLAYER identities already in it, so we never
    // place the same player twice (different cards of one player = a 460 on create).
    var squads = [];
    for (var s = 0; s < n; s++) {
      squads.push({ slots: new Array(formationSlots.length), fillCount: 0, subs: [], keys: new Set() });
    }

    // Draft, round by round (one round per formation slot).
    slotOrder.forEach(function (slot, round) {
      // Flip direction every other round (the "snake").
      var order = [];
      for (var i = 0; i < n; i++) order.push(i);
      if (round % 2 === 1) order.reverse();

      order.forEach(function (squadIdx) {
        var squad = squads[squadIdx];
        // Every available player who can play this slot's group, with their score.
        var cands = [];
        for (var pi = 0; pi < pool.length; pi++) {
          if (!canPlaySlot(pool[pi], slot.group, slot.side)) continue;
          if (squad.keys.has(playerKey(pool[pi]))) continue;   // already have this player in THIS squad
          cands.push({ i: pi, score: scorePlayer(pool[pi], slot.group).total, group: slot.group });
        }
        // Pick the best by score, with the chem tiebreaker for near-ties.
        var pick = chemPick(cands, squad, pool);
        if (!pick) {
          // No one left who can fill this slot for this squad.
          squad.slots[slot.idx] = { group: slot.group, player: null, score: null };
        } else {
          var picked = pool.splice(pick.i, 1)[0];   // remove from the shared pool
          squad.slots[slot.idx] = { group: slot.group, player: picked, score: pick.score };
          squad.keys.add(playerKey(picked));
          squad.fillCount++;
        }
      });
    });

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
          cands.push({ i: pi, score: bj.score.total, group: bj.group });
        }
        var pick = chemPick(cands, squad, pool);
        if (!pick) {
          squad.subs.push({ group: null, player: null, score: null });
        } else {
          var picked = pool.splice(pick.i, 1)[0];
          squad.subs.push({ group: pick.group, player: picked, score: pick.score });
          squad.keys.add(playerKey(picked));
        }
      });
    }

    // Averages per squad (over filled slots only), for balance visibility - one for
    // the starting XI, one for the bench.
    squads.forEach(function (sq) {
      var sum = 0, filled = 0;
      sq.slots.forEach(function (cell) {
        if (cell && cell.player) { sum += cell.score; filled++; }
      });
      sq.avg = filled ? Math.round((sum / filled) * 10) / 10 : 0;
      sq.filled = filled;
      var ssum = 0, sfilled = 0;
      sq.subs.forEach(function (cell) {
        if (cell && cell.player) { ssum += cell.score; sfilled++; }
      });
      sq.subAvg = sfilled ? Math.round((ssum / sfilled) * 10) / 10 : 0;
      sq.subFilled = sfilled;
      sq.chem = chemSummary(squadPlaced(sq));    // biggest league/nation cluster in the 18
    });

    return { formation: formationName, n: n, slots: formationSlots, squads: squads, depth: depth };
  }

  // Console helpers: window.FC26.buildGauntlet("f433", 3), .FORMATIONS
  window.FC26.buildGauntlet = buildGauntlet;
  window.FC26.gauntletDepth = gauntletDepth;
  window.FC26.FORMATIONS = FORMATIONS;

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
  title.textContent = "Men Gallant FC - Justaino FC Web App Tool";
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
  refreshBtn.textContent = "↻ Reload club";
  refreshBtn.title = "Load your full club (every player, not just the squad)";
  refreshBtn.style.cssText = "background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px";
  refreshBtn.addEventListener("click", function () { loadFullClub(); });
  pickerHead.appendChild(pickerTitle);
  pickerHead.appendChild(refreshBtn);

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
        : "Pre-tick recommended playstyles for this position/role (top 3 as PS+)";
    }
    [typeof posSelect !== "undefined" ? posSelect : null, typeof roleSelect !== "undefined" ? roleSelect : null].forEach(function (sel) {
      if (!sel) return;
      sel.disabled = many;
      sel.style.opacity = many ? ".45" : "";
      sel.style.cursor = many ? "not-allowed" : "";
    });
    renderBatchList();                 // refresh the "applying to N players" roll-call
    if (typeof updateWizWho === "function") updateWizWho();  // keep the mobile step-2 header in sync
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
    var panelOpen = (typeof eligOpen !== "undefined" && eligOpen) || (typeof metaOpen !== "undefined" && metaOpen);
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

  // renderPreview(): redraw the selected-player card. Same info as before -
  // name/OVR/rarity, caps used, and current PlayStyles - but laid out visually:
  //   - two "capacity pip" trackers (3 pips for PS+, 8 for Basic) that fill up
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
    // hold up to 3 PS+ / 8 basic, but a player granted the limited "GH 4th PlayStyle+" evo
    // ends up with 4 PS+. So the DISPLAYED cap grows to whatever the player actually holds:
    // a normal card still shows 3/3 + 8/8, a GH-4th card shows 4/4 instead of an overflowing
    // 4/3. (Our SELECTION caps stay 3/8 - see toggleEvo/renderEvos - because the 4th comes
    // from a different, limited evo set we don't apply from our own catalog.)
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
      ? "<span class='pv-jr' title='Justaino rating (0-100) as " + esc(jr.group) + (jr.score.role ? " (" + esc(jr.score.role) + ")" : "") + ": meta " + jr.score.metaBlend + " (stats " + jr.score.statPart + " + PlayStyles " + jr.score.psPart + "), blended " + Math.round(OVR_MIX * 100) + "% with OVR " + jr.score.ovr + "'>JUSTAINO " + jr.score.total.toFixed(1) + " &middot; " + esc(jr.group) + "</span>"
      : "";

    preview.innerHTML =
      // Broadcast "spotlight": giant rating number next to the name, like a lower-third.
      "<div class='pv-hero'>" +
        "<div class='pv-numwrap'><span class='pv-num'>" + (it.rating != null ? it.rating : "?") + "</span>" + jrHTML + "</div>" +
        "<div class='pv-herowho'>" +
          "<div class='pv-nm'>" + esc(playerName(it)) + (isGKPlayer(it) ? "<span class='pv-gk'>GK</span>" : "") + "</div>" +
          "<div class='pv-sub'>" + esc(rarityName(it)) + posLine + "</div>" +
        "</div>" +
      "</div>" +
      "<div class='pv-metaline'>rarity #" + it.rareflag + " &middot; item " + it.id + "</div>" +
      eligHTML +
      "<div class='pv-meters'>" +
        meterHTML("PlayStyle+", pUsed, plusCap, "plus") +
        meterHTML("Basic", bUsed, basicCap, "basic") +
      "</div>" +
      // Face stats grid (Feature: fill the spotlight) - same 6 numbers the Justaino rating reads.
      faceStatsHTML(it) +
      noneMsg +
      groupHTML("PlayStyle+", plus, true) +
      groupHTML("Basic", basic, false) +
      // Reset row (only when there's something to remove): "Remove one" undoes a single
      // PlayStyle; "Clear all" strips them all (confirmed). See runRemove().
      ((plus.length || basic.length)
        ? "<div class='pv-reset'>" +
            "<button class='pv-rm-one'>Remove Latest Evo</button>" +
            "<button class='pv-rm-all'>Clear all evos</button>" +
          "</div>"
        : "");

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
    updateWizWho();               // keep the wizard's mini header in sync
    // On mobile the picker is step 1 of the wizard; choosing a player moves to step 2
    // (skipped when keepStep=true, e.g. ticking a batch checkbox).
    if (!keepStep && currentMode() === "mobile" && state.wizStep === 1) { goStep(2); }
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
    var q = (playerSearch.value || "").trim().toLowerCase();   // current search text
    var players = getClubPlayers().slice().sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });
    if (state.onlyEligible) { players = players.filter(isEligibleRarity); }  // eligible-only filter
    if (q) { players = players.filter(function (it) { return playerName(it).toLowerCase().indexOf(q) !== -1; }); }
    playerList.innerHTML = "";
    if (!players.length) {
      playerList.innerHTML = q
        ? "<div style='opacity:.7'>No players match \"" + esc(q) + "\".</div>"
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
  suggestBtn.title = "Pre-tick recommended playstyles for this position/role (top 3 as PS+)";
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
        if (state.player && currentPlayStyles(state.player).length > prevCount) break;
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
  // its new PlayStyles.
  function findPlayerById(id) { return getClubPlayers().filter(function (p) { return p.id === id; })[0]; }

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

  // loadFullClub(): page through services.Club.search to gather EVERY club player
  // (not just the cached squad) and store them in state.clubItems, then redraw the
  // picker. Read-only - it's the same search the app's Club screen uses.
  async function loadFullClub() {
    var svc = getServices();
    var S = svc && svc.Club;
    if (!S || !S.search || !window.UTSearchCriteriaDTO) { status.textContent = "Club search unavailable on this page."; return; }
    var all = [], seen = {}, offset = 0, guard = 0;
    status.textContent = "Loading full club...";
    while (guard++ < 100) {
      var crit = makeClubCriteria(offset, 91);
      if (!crit) break;
      var res;
      try { res = await awaitService(S.search(crit)); }
      catch (e) { if (offset === 0) { status.textContent = "Club load failed: " + errMsg(e); return; } break; }
      var items = (res && res.response && res.response.items) || (res && res.data && res.data.items) || [];
      if (!items.length) break;
      var added = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], id = it && it.id;
        if (id != null && !seen[id]) { seen[id] = 1; all.push(it); added++; }
      }
      offset += items.length;
      status.textContent = "Loading full club... " + all.length;
      if (added === 0) break;                 // no new players -> we've seen them all
      await sleep(120);                        // gentle pause between pages
    }
    state.clubItems = all;
    renderPlayers();
    try { renderMetaRating(); } catch (e) {}   // refresh the Meta rating list if it's open
    status.textContent = "Club loaded: " + getClubPlayers().length + " players.";
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
    // "Back to players" - jump straight back to the player list to pick the next card.
    // "Back to players" only on mobile (the wizard hides the list on other steps). On
    // desktop the player list is always visible in the left pane, so the button is redundant.
    if (currentMode() === "mobile") {
      var backBtn = document.createElement("button");
      backBtn.className = "ap-back";
      backBtn.textContent = "← Back to players";
      backBtn.addEventListener("click", function () { renderPlayers(); goStep(1); });
      applyBox.appendChild(backBtn);
    }
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
    var loaderHost = (currentMode() === "mobile" && typeof reviewSummary !== "undefined" && reviewSummary) ? reviewSummary : preview;
    loaderHost.appendChild(loader);
    function setLoad(t) { var el = loader.querySelector(".rm-txt"); if (el) el.textContent = t; }
    var id = it.id, removed = 0, guard = 0, maxIter = all ? 40 : 1, failMsg = "";  // 40 = generous backstop; lastEvoRemoved is the real stop
    while (guard++ < maxIter) {
      if (state.abort) break;
      setLoad((all ? "Clearing evos… " : "Removing evo… ") + removed + " removed");
      status.textContent = (all ? "Clearing evos" : "Removing evo") + "... " + removed;
      var res;
      try { res = await removeEvo(id); }
      catch (e) { failMsg = errMsg(e); break; }
      removed++;
      var last = !!(res && res.response && res.response.lastEvoRemoved);
      if (!all || last) break;                                  // single removal, or reached the final one
      await sleep(Math.max(0, parseInt(delayInput.value, 10) || 0));
    }
    setLoad("Refreshing…");
    refreshClub();
    // Reload the club and re-point the preview, retrying until the removal shows (the
    // player's PlayStyle count changed from what it was, or the card left the club).
    var have = currentPlayStyles(it).length;
    for (var att = 0; att < 4; att++) {
      try { await loadFullClub(); } catch (e) {}
      var fresh = findPlayerById(id);
      state.player = fresh || null;
      if (!fresh || currentPlayStyles(fresh).length !== have) break;
      if (att < 3) { status.textContent = "Waiting for removal to register..."; await sleep(700); }
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
          await applyEvo(row.slotId, it.id);                          // adds + grants the PlayStyle
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
    // Back-to-players button - mobile only (desktop always shows the list in the left pane).
    if (currentMode() === "mobile") {
      var backBtn = document.createElement("button"); backBtn.className = "ap-back"; backBtn.textContent = "← Back to players";
      backBtn.addEventListener("click", function () { renderPlayers(); goStep(1); });
      applyBox.appendChild(backBtn);
    }
    refreshClub();
    // Reload the club and re-point our held items to the fresh copies, RETRYING until at
    // least one player's PlayStyle count grows (the grant can lag the apply, same as the
    // single-player flow). Keeps the preview/roll-call accurate without a manual reload.
    if (totalOk > 0) {
      for (var att = 0; att < 4; att++) {
        try { await loadFullClub(); } catch (e) {}
        var grew = false;
        for (var ti = 0; ti < targets.length; ti++) { var fr = findPlayerById(targets[ti].id); if (fr && currentPlayStyles(fr).length > (prevCounts[targets[ti].id] || 0)) { grew = true; break; } }
        if (grew) break;
        if (att < 3) { status.textContent = "Waiting for grants to register..."; await sleep(700); }
      }
    }
    // Re-point active player + batch entries to the fresh club items.
    if (state.player) { var fp = findPlayerById(state.player.id); if (fp) state.player = fp; }
    var newBatch = new Map();
    targets.forEach(function (t) { var f = findPlayerById(t.id) || t; newBatch.set(f.id, f); });
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
    for (var i = 0; i < slotIds.length; i++) {
      if (state.abort) { status.textContent = "Stopped at " + i + "/" + slotIds.length + "."; break; }
      var slotId = slotIds[i];
      var evo = byId(slotId);
      var tile = tiles[i];                                    // this evo's animated tile
      var label = "[" + (i + 1) + "/" + slotIds.length + "] " + (evo ? evo.n : slotId);
      if (tile) tile.classList.add("applying");               // spin while it applies
      status.textContent = label + " ...";
      try {
        await applyEvo(slotId, itemId);                       // adds + grants the PlayStyle
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
    // On this build the item entity we hold is NOT updated in place by the grant - only a
    // fresh club search returns the new PlayStyles. So auto-do exactly what "Reload club"
    // does, and RETRY until the grant actually shows: firing the search immediately after
    // the apply can beat the server (it returns pre-grant data), which is why a manual
    // reload a second later "worked" but the instant one didn't. We poll the re-pulled
    // player's PlayStyle count until it grows (or we run out of tries), so the preview /
    // pips refresh on their own - no manual Reload club needed.
    if (ok > 0) {
      for (var att = 0; att < 4; att++) {
        try { await loadFullClub(); } catch (e) {}            // fresh pull (also redraws the list)
        var fresh = findPlayerById(itemId);
        if (fresh) state.player = fresh;
        var nowCount = state.player ? currentPlayStyles(state.player).length : prevCount;
        if (nowCount > prevCount) break;                      // grant is now visible - stop retrying
        if (att < 3) { status.textContent = "Waiting for the grant to register..."; await sleep(700); }
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
      "#fc26-panel .ap-back{margin-top:12px;width:100%;padding:9px;border:1px solid var(--field-border);border-radius:8px;background:var(--tab);color:var(--ink);font-weight:700;font-size:12px;cursor:pointer}" +
      "#fc26-panel .ap-back:hover{border-color:var(--accent);color:var(--accent)}" +
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
      // Mobile channel tabs (Lineup / Style deck / Review) + the scrolling section body.
      "#fc26-panel .fc26-chtabs{flex:none;display:flex;gap:6px;margin-bottom:10px}" +
      "#fc26-panel .fc26-chtab{flex:1;text-align:center;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:9px 4px;border-radius:8px;color:var(--muted);background:var(--tab);border:1px solid var(--field-border);cursor:pointer;user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#fc26-panel .fc26-chtab.on{color:var(--accent-ink);background:var(--accent);border-color:var(--accent)}" +
      "#fc26-panel .fc26-chtab.dis{opacity:.4;cursor:not-allowed}" +
      "#fc26-panel .fc26-stepbody{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto}" +
      // Mobile guide button (Next: PlayStyle Deck / Review), disabled until the step is ready.
      "#fc26-panel .fc26-guidebtn{flex:none;width:100%;margin-top:10px;padding:11px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-ink);font-weight:800;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}" +
      "#fc26-panel .fc26-guidebtn.dis{opacity:.4;cursor:not-allowed}" +
      "#fc26-panel .fc26-wizwho{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--card);border:1px solid var(--card-border);margin-bottom:11px;font-size:13px}" +
      // Mobile Deck summary: a collapsible caps + face-stats bar atop the PlayStyle Deck step.
      "#fc26-panel .fc26-decksum{margin-bottom:11px;border-radius:12px;background:var(--card);border:1px solid var(--card-border)}" +
      "#fc26-panel .fc26-decksum.open{border-color:var(--accent)}" +
      "#fc26-panel .ds-bar{display:flex;align-items:center;gap:10px;padding:9px 11px}" +
      "#fc26-panel .ds-r{flex:none;font-weight:800;font-size:22px;line-height:1;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .ds-w{flex:1 1 auto;min-width:0}" +
      "#fc26-panel .ds-n{display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .ds-gk{flex:none;color:var(--accent);font-size:8px;border:1px solid var(--accent);border-radius:4px;padding:0 3px}" +
      "#fc26-panel .ds-c{font-size:10px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .ds-toggle{flex:none;background:var(--btn);color:var(--accent);border:1px solid var(--field-border);border-radius:7px;padding:5px 9px;cursor:pointer;font-size:10px;font-weight:800;letter-spacing:.04em;white-space:nowrap}" +
      "#fc26-panel .ds-body{padding:0 11px 11px;display:flex;flex-direction:column;gap:11px}" +
      "#fc26-panel .ds-body .pv-faces{margin-top:0}" +
      // Mobile Review summary: target line + the selected PlayStyle chips (what will be applied).
      "#fc26-panel .fc26-revsum{margin-bottom:11px}" +
      "#fc26-panel .rs-bar{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:12px;background:var(--card);border:1px solid var(--card-border);margin-bottom:12px}" +
      "#fc26-panel .rs-r{flex:none;font-weight:800;font-size:22px;line-height:1;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .rs-w{flex:1 1 auto;min-width:0}" +
      "#fc26-panel .rs-n{display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .rs-c{font-size:10px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .rs-lead{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}" +
      "#fc26-panel .rs-none{font-size:11px;color:var(--muted);opacity:.85;line-height:1.4}" +
      "#fc26-panel .rs-manage{margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}" +
      "#fc26-panel .rs-manage-toggle{width:100%;text-align:left;background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;padding:6px 9px;cursor:pointer;font-size:11px;font-weight:600}" +
      "#fc26-panel .rs-manage-body{margin-top:8px}" +
      // Pinned mobile mini-spotlight (rating + name + caps), always visible below the tabs.
      "#fc26-panel .gt-launch{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:11px 12px;cursor:pointer;color:var(--ink)}" + "#fc26-panel .gt-launch:hover{border-color:var(--accent)}" + "#fc26-panel .gt-launch-ic{flex:none;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-size:17px;background:var(--sel);border:1px solid var(--accent)}" + "#fc26-panel .gt-launch-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" + "#fc26-panel .gt-launch-tx b{font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}" + "#fc26-panel .gt-launch-tx i{font-style:normal;font-size:10.5px;color:var(--muted)}" + "#fc26-panel .gt-launch-go{flex:none;color:var(--accent);font-size:20px;font-weight:800}" + "#fc26-panel .gt-builder{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}" + "#fc26-panel .gt-bd-top{flex:none;display:flex;align-items:center;gap:9px;padding:0 0 10px}" + "#fc26-panel .gt-bd-back{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;cursor:pointer;background:var(--btn);border:1px solid var(--field-border);color:var(--ink);font-size:18px;font-weight:700}" + "#fc26-panel .gt-bd-back:hover{border-color:var(--accent);color:var(--accent)}" + "#fc26-panel .gt-bd-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" + "#fc26-panel .gt-bd-title b{font-size:15px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;line-height:1}" + "#fc26-panel .gt-bd-eyebrow{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}" + "#fc26-panel .gt-clab{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}" + "#fc26-panel .gt-seg{display:inline-flex;background:rgba(0,0,0,.28);border:1px solid var(--field-border);border-radius:9px;padding:3px;gap:2px}" + "#fc26-panel .gt-seg button{border:0;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;padding:6px 10px;border-radius:6px;white-space:nowrap}" + "#fc26-panel .gt-seg button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}" + "#fc26-panel .gt-rebuild{background:var(--btn);color:var(--btn-ink);border:1px solid var(--field-border);border-radius:8px;padding:7px 10px;cursor:pointer;font-size:11px;font-weight:700}" + "#fc26-panel .gt-rebuild:hover{border-color:var(--accent);color:var(--accent)}" + "#fc26-panel .gt-bd-controls{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-bottom:10px}" + "#fc26-panel .gt-bd-tabs{flex:none;display:flex;gap:7px;padding-bottom:10px}" + "#fc26-panel .gt-tab{flex:1;cursor:pointer;background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:7px 10px;color:inherit;font-family:inherit;text-align:left}" + "#fc26-panel .gt-tab[aria-selected=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}" + "#fc26-panel .gt-tab .tn{font-weight:800;font-size:12px;letter-spacing:.04em;text-transform:uppercase}" + "#fc26-panel .gt-tab .ta{margin-left:7px;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-tab .ts{font-size:9.5px;color:var(--muted);margin-top:2px}" + "#fc26-panel .gt-select{appearance:none;-webkit-appearance:none;font-family:inherit;font-weight:700;font-size:12px;color:var(--ink);background:var(--field);border:1px solid var(--field-border);border-radius:8px;padding:8px 10px;cursor:pointer}" + "#fc26-panel .gt-select option{color:#111827;background:#fff}" + "#fc26-panel .gt-sqpills{flex:none;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px;padding-bottom:8px}" + "#fc26-panel .gt-sqpill{padding:9px 4px;border-radius:9px;background:var(--card);border:1px solid var(--card-border);font-family:inherit;font-weight:800;font-size:12px;letter-spacing:.04em;text-transform:uppercase;text-align:center;color:var(--muted);cursor:pointer}" + "#fc26-panel .gt-sqpill[aria-selected=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}" + "#fc26-panel .gt-summary{flex:none;display:flex;flex-wrap:wrap;gap:5px 14px;padding-bottom:8px;font-size:11px;color:var(--muted)}" + "#fc26-panel .gt-summary b{color:var(--ink);font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-summary .gsa{color:var(--gold)}" + "#fc26-panel .gt-statstrip{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--card-border);border:1px solid var(--card-border);border-radius:10px;overflow:hidden}" + "#fc26-panel .gt-stat{background:rgba(0,0,0,.22);padding:9px 8px;text-align:center}" + "#fc26-panel .gt-stat .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}" + "#fc26-panel .gt-stat .v.a{color:var(--accent)}" + "#fc26-panel .gt-stat .v.g{color:var(--gold)}" + "#fc26-panel .gt-stat .k{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:5px}" + "#fc26-panel .gt-bench{background:var(--card);border:1px solid var(--card-border);border-radius:10px;padding:9px 11px}" + "#fc26-panel .gt-bench .bl{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}" + "#fc26-panel .gt-chips{display:flex;flex-wrap:wrap;gap:6px}" + "#fc26-panel .gt-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;background:var(--tile);border:1px solid var(--tile-border);border-radius:999px;padding:4px 9px 4px 6px;white-space:nowrap}" + "#fc26-panel .gt-chip b{color:var(--gold);font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-bench2{flex:none;padding-top:8px}" + "#fc26-panel .gt-benchtoggle{width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--card-border);color:var(--muted);border-radius:9px;padding:8px 11px;font-family:inherit;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}" + "#fc26-panel .gt-benchtoggle[aria-expanded=true]{border-color:var(--accent);color:var(--accent)}" + "#fc26-panel .gt-benchbody{display:none;margin-top:8px}" + "#fc26-panel .gt-benchbody.open{display:block}" + "#fc26-panel .gt-actions{flex:none;display:flex;flex-direction:column;gap:8px}" + "#fc26-panel.fc26-mobile .gt-actions{padding-top:10px;border-top:1px solid var(--border);margin-top:8px}" + "#fc26-panel .gt-arow{display:flex;gap:9px}" + "#fc26-panel .gt-cbtn{flex:1.4;background:var(--apply);color:var(--apply-ink);border:0;border-radius:9px;padding:12px;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}" + "#fc26-panel .gt-rbtn{flex:1;background:rgba(255,120,120,.14);color:#ffc2c2;border:1px solid rgba(255,120,120,.34);border-radius:9px;padding:12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}" + "#fc26-panel .gt-status{min-height:20px}" + "#fc26-panel .gt-sline{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--muted)}" + "#fc26-panel .gt-pbar{height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:8px}" + "#fc26-panel .gt-pbar>i{display:block;height:100%;width:0;background:var(--accent);transition:width .35s ease}" + "#fc26-panel .gt-toast{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:10px;font-size:12.5px;font-weight:700;animation:fc26pop .4s cubic-bezier(.2,1.5,.4,1) both}" + "#fc26-panel .gt-toast.ok{background:rgba(79,227,172,.12);border:1px solid rgba(79,227,172,.4);color:#c9fff0}" + "#fc26-panel .gt-toast.err{background:rgba(255,120,120,.12);border:1px solid rgba(255,120,120,.4);color:#ffd2d2}" + "#fc26-panel .gt-badge{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px}" + "#fc26-panel .gt-toast.ok .gt-badge{background:#4fe3ac;color:#04241a}" + "#fc26-panel .gt-toast.err .gt-badge{background:#e06767;color:#fff}" + "#fc26-panel .gt-warn2{font-size:11.5px;color:#ffc2c2;background:rgba(255,120,120,.10);border:1px solid rgba(255,120,120,.30);border-radius:9px;padding:9px 11px;line-height:1.4}" + "#fc26-panel .gt-warn2 b{color:#ffd7d7}" + "#fc26-panel .gt-pitchwrap{flex:1 1 auto;min-height:0;display:grid;place-items:center;padding:0 4px}" + "#fc26-panel .gt-pitch{height:100%;width:auto;max-width:100%;max-height:100%;aspect-ratio:68/92;border:1px solid var(--card-border);border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#12243d,#0a1424);position:relative}" + "#fc26-panel .gt-pitch svg{position:absolute;inset:0;width:100%;height:100%;display:block}" + "#fc26-panel .gt-dot{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;transition:left .5s cubic-bezier(.4,1.2,.4,1),top .5s cubic-bezier(.4,1.2,.4,1)}" + "#fc26-panel .gt-disc{position:relative;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;color:#06131f;box-shadow:0 4px 12px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.14)}" + "#fc26-panel .gt-dot .gt-sc{position:absolute;bottom:-7px;right:-8px;z-index:2;font-size:9.5px;font-weight:800;line-height:1;padding:2px 4px;border-radius:6px;background:#0a1120;border:1px solid var(--border-strong,rgba(120,180,255,.28));font-variant-numeric:tabular-nums}" + "#fc26-panel .gt-dot .gt-pos{position:absolute;top:-7px;left:-8px;z-index:2;font-size:7.5px;font-weight:800;letter-spacing:.02em;padding:1px 4px;border-radius:5px;background:#0a1120;color:var(--muted);border:1px solid var(--border)}" + "#fc26-panel .gt-dot .gt-nm{font-size:9.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;text-align:center;line-height:1.05;max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.7)}" + "#fc26-panel .gt-dot .gt-meta{margin-top:1px;font-size:8.5px;font-weight:800;letter-spacing:.02em;color:#bcd3ef;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.85)}" + "#fc26-panel .gt-dot.t-elite .gt-disc{background:var(--accent)}" + "#fc26-panel .gt-dot.t-elite .gt-sc{color:var(--accent)}" + "#fc26-panel .gt-dot.t-gold .gt-disc{background:var(--gold)}" + "#fc26-panel .gt-dot.t-gold .gt-sc{color:var(--gold)}" + "#fc26-panel .gt-dot.t-solid .gt-disc{background:#bcd3ef}" + "#fc26-panel .gt-dot.t-solid .gt-sc{color:#bcd3ef}" + "#fc26-panel .gt-dot.t-low .gt-disc{background:#7f93b4;color:#0b1424}" + "#fc26-panel .gt-dot.t-low .gt-sc{color:#9fb2d2}" + "#fc26-panel .gt-dot.empty .gt-disc{background:transparent;color:var(--muted);border:2px dashed var(--muted);font-size:16px}" + "#fc26-panel .gt-dot.empty .gt-sc{display:none}" + "#fc26-panel .gt-dot.empty .gt-nm{color:var(--muted);font-style:italic;text-transform:none;opacity:.8}" + "#fc26-panel.fc26-desktop .gt-bd-main{display:flex;gap:14px;flex:1;min-height:0}" + "#fc26-panel.fc26-desktop .gt-bd-side{flex:0 0 296px;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:11px}" + "#fc26-panel.fc26-mobile.gt-open{height:86vh}" + "@media (prefers-reduced-motion:reduce){#fc26-panel .fc26-ec.applying::after{animation:none}#fc26-panel .ap-chip{opacity:1;transform:none;animation:none}}";
    document.head.appendChild(st);
  }

  renderPlayers();     // show whatever's cached immediately (the squad)
  populatePositions(); // fill the position/role dropdowns
  renderEvos();        // show the "select a player" prompt in the evo area
  // Only fetch the full club if we didn't inherit it from the previous click. If we
  // did, it's shown instantly; hit "↻ Reload club" to pull a fresh copy.
  if (state.clubItems && state.clubItems.length) {
    status.textContent = "Club ready: " + getClubPlayers().length + " players (↻ Reload club to refresh).";
  } else {
    loadFullClub();    // first run: load the FULL club in the background and redraw
  }

  // ----------------------------------------------------------------------------
  // RESPONSIVE LAYOUT
  // Every element above is kept EXACTLY as-is (so all render/apply logic keeps
  // working). We only PLACE those elements differently depending on screen width:
  //   - wide screens  -> "Split Console": squad on the LEFT, build + apply on RIGHT.
  //   - phone/narrow  -> "Wizard": a bottom sheet with 3 steps (Player / PlayStyles / Apply).
  // Trick: group the elements into 4 reusable "modules" (wrapper divs), then move the
  // whole module around with one appendChild (which re-parents it) as the layout changes.
  // ----------------------------------------------------------------------------

  var mq = window.matchMedia("(max-width: 620px)");            // "am I on a phone-ish screen?"
  // Defensive: the very first renderPlayers() above (line ~2560) runs before this
  // line assigns mq, and it can reach currentMode() via updateLineupCollapse. Guard
  // against mq still being undefined so that early call can't throw; it harmlessly
  // reads "desktop" once, then behaves normally after mq exists.
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
    panel.className = (m === "mobile" ? "fc26-mobile" : "fc26-desktop") + (state.minimized ? " fc26-min" : "") + (state.builderOpen && !state.minimized ? " gt-open" : "");
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
  // FEATURE 2 - the "Meta rating" panel: a collapsible section that ranks the
  // whole club for a chosen position by scorePlayer(). This is the on-screen
  // results view (no console needed) for tuning the two weight tables.
  // --------------------------------------------------------------------------
  var metaSection = document.createElement("div");
  metaSection.className = "meta-section";
  var metaToggle = document.createElement("button");
  metaToggle.type = "button";
  metaToggle.className = "meta-toggle";
  var metaBox = document.createElement("div");
  metaBox.className = "meta-box";
  metaBox.style.display = "none";
  // controls: which position to rank as, and how many to show
  var metaControls = document.createElement("div");
  metaControls.className = "meta-controls";
  var metaPos = document.createElement("select");
  metaPos.className = "meta-pos";
  metaPos.innerHTML = META_GROUPS.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("");
  var metaCount = document.createElement("select");
  metaCount.className = "meta-count";
  metaCount.innerHTML = [10, 20, 30, 50].map(function (n) { return "<option value='" + n + "'" + (n === 20 ? " selected" : "") + ">top " + n + "</option>"; }).join("");
  metaControls.appendChild(metaPos);
  metaControls.appendChild(metaCount);
  var metaList = document.createElement("div");
  metaList.className = "meta-list";
  var metaNote = document.createElement("div");
  metaNote.className = "meta-note";
  metaBox.appendChild(metaControls);
  metaBox.appendChild(metaList);
  metaBox.appendChild(metaNote);
  metaSection.appendChild(metaToggle);
  metaSection.appendChild(metaBox);

  var metaOpen = false;
  function updateMetaToggle() { metaToggle.textContent = (metaOpen ? "▾ " : "▸ ") + "Meta rating (rank my club by position)"; }
  metaToggle.addEventListener("click", function () {
    metaOpen = !metaOpen;
    metaBox.style.display = metaOpen ? "block" : "none";
    if (metaOpen) renderMetaRating();
    updateMetaToggle();
    lineupPeek = false;                                        // opening/closing re-collapses the list on mobile
    if (typeof updateLineupCollapse === "function") updateLineupCollapse();
  });
  metaPos.addEventListener("change", renderMetaRating);
  metaCount.addEventListener("change", renderMetaRating);

  // renderMetaRating(): rank the loaded club for the chosen position and draw the
  // rows. Safe to call any time - it no-ops while the section is closed.
  function renderMetaRating() {
    if (!metaOpen) return;
    var group = metaPos.value;
    var n = parseInt(metaCount.value, 10) || 20;
    var players = getClubPlayers();
    if (!players.length) { metaList.innerHTML = ""; metaNote.textContent = "No club players yet - load your club first (↻ Reload club)."; return; }
    var rows = metaTop(group, n);
    metaList.innerHTML = "";
    rows.forEach(function (r, i) {
      var it = r.it, sc = r.score;
      var row = document.createElement("div");
      row.className = "meta-row" + (state.player && state.player.id === it.id ? " on" : "");
      // strip of the player's actual PlayStyle+ icons only (same as the lineup list),
      // so it honestly shows how many PS+ they have - NOT every owned meta PlayStyle.
      var psPlus = currentPlayStyles(it).filter(function (p) { return p.isIcon; });
      var psHTML = psPlus.map(function (p) { return "<i class='ico icon_icontrait" + p.traitId + "'></i>"; }).join("");
      row.innerHTML =
        "<span class='meta-rank'>" + (i + 1) + "</span>" +
        "<span class='meta-ovr'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        "<span class='meta-nm'>" + esc(playerName(it)) + (isGKPlayer(it) ? "<span class='meta-gk'>GK</span>" : "") + "</span>" +
        "<span class='meta-ps'>" + psHTML + "</span>" +
        "<span class='meta-score'><b>" + sc.total.toFixed(1) + "</b><span class='meta-split'>" + sc.statPart + " + " + sc.psPart + "</span></span>";
      row.title = playerName(it) + " as " + group + (sc.role ? " (" + sc.role + ")" : "") + " (out of 100): meta " + sc.metaBlend + " (stats " + sc.statPart + " + PlayStyles " + sc.psPart + "), blended " + Math.round(OVR_MIX * 100) + "% with OVR " + sc.ovr + " = " + sc.total + "  [raw stat avg " + sc.stat + ", PlayStyle score " + sc.psScore + "]";
      row.addEventListener("click", function () { selectPlayer(it); });
      metaList.appendChild(row);
    });
    metaNote.textContent = "Ranked " + rows.length + " as " + group + ". Score leans on meta PlayStyles (a PlayStyle+ counts " + PSPLUS_MULT + "x a basic), then stats. Tap a row to spotlight that player.";
  }
  updateMetaToggle();

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
  var gtFormation = FORMATIONS["f433"] ? "f433" : FORMATION_ORDER[0];
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

  // doBuild(): run the draft for the current formation + count into gtBuild.
  function doBuild() {
    if (!FORMATION_ORDER.length || !FORMATIONS[gtFormation]) { gtBuild = { empty: true, noFormations: true }; return; }
    var players = getClubPlayers();
    if (!players.length) { gtBuild = { empty: true }; return; }
    gtBuild = buildGauntlet(gtFormation, gtCount);
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
      top.appendChild(gtSelectEl(FORMATION_ORDER, gtFormation, function (v) { gtFormation = v; onBuildChange(); }, fmtFormation));
      top.appendChild(gtSelectEl([3, 4, 5], gtCount, function (v) { gtCount = parseInt(v, 10); onBuildChange(); }, function (n) { return n + " sq"; }));
    }
    builderHost.appendChild(top);

    if (!mobile) {
      var ctr = document.createElement("div"); ctr.className = "gt-bd-controls";
      ctr.appendChild(gtLab("Form"));
      // Dropdown (not a segmented control) - the full catalog is too long for buttons.
      ctr.appendChild(gtSelectEl(FORMATION_ORDER, gtFormation, function (v) { gtFormation = v; onBuildChange(); }, fmtFormation));
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
          var b = document.createElement("button"); b.type = "button"; b.className = "gt-tab"; b.setAttribute("aria-selected", String(idx === gtSquadIdx));
          b.innerHTML = "<div><span class='tn'>Squad " + (idx + 1) + "</span><span class='ta'>" + (sq ? sq.avg : "\u2014") + "</span></div><div class='ts'>" + esc(fmtFormation(gtFormation)) + "</div>";
          b.addEventListener("click", function () { gtSquadIdx = idx; renderGtPitch(); renderGtInfo(); renderGtBench(); renderGtSquadSwitch(); });
          gtEls.tabs.appendChild(b);
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
  }

  function renderGtPitch() {
    var pitch = gtEls.pitch; if (!pitch) return;
    Array.prototype.slice.call(pitch.querySelectorAll(".gt-dot")).forEach(function (d) { d.remove(); });
    if (!gtBuild || gtBuild.empty || !gtBuild.squads) return;
    var coords = FORMATION_DOTS[gtFormation] || [];
    var sq = gtBuild.squads[gtSquadIdx] || gtBuild.squads[0];
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
      warn = "<b>Can't build " + gtCount + " full " + esc(fmtFormation(gtFormation)) + " squads.</b> " +
        (!d.totalOk ? ("Need " + d.totalNeeded + " players, have " + d.totalHave + ". ") : "") +
        (d.shortages.length ? ("Short at: " + esc(bits) + ". ") : "") + "Try fewer squads or another formation.";
    }
    if (gtEls.stats) {
      if (warn) { gtEls.stats.className = "gt-warn2"; gtEls.stats.innerHTML = warn; }
      else {
        gtEls.stats.className = "gt-statstrip";
        gtEls.stats.innerHTML = "<div class='gt-stat'><div class='v g'>" + (sq ? sq.avg : "\u2014") + "</div><div class='k'>XI avg</div></div>" +
          "<div class='gt-stat'><div class='v a'>" + (sq ? sq.filled : 0) + "/11</div><div class='k'>Placed</div></div>" +
          "<div class='gt-stat'><div class='v'>" + (sq ? sq.chem.maxLeague : 0) + "</div><div class='k'>League</div></div>" +
          "<div class='gt-stat'><div class='v'>" + (sq ? sq.chem.maxNation : 0) + "</div><div class='k'>Nation</div></div>";
      }
    }
    if (gtEls.summary) {
      if (warn) { gtEls.summary.className = "gt-warn2"; gtEls.summary.innerHTML = warn; }
      else {
        gtEls.summary.className = "gt-summary";
        gtEls.summary.innerHTML = "<span><b class='gsa'>" + (sq ? sq.avg : "\u2014") + "</b> XI avg</span>" +
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
    var res = gtBuild, formationName = res.formation, squads = res.squads;
    var have = await countSavedSquads();
    if (have != null && (have + squads.length) > GAUNTLET_MAX_SQUADS) {
      setGtStatus(gtToast("err", "You have " + have + " of " + GAUNTLET_MAX_SQUADS + " squads - room for only " + Math.max(0, GAUNTLET_MAX_SQUADS - have) + " more. Remove some first."));
      return;
    }
    var fLabel = fmtFormation(formationName);
    var lines = squads.map(function (sq, i) { return "  " + (i + 1) + '. "' + GAUNTLET_NAME_PREFIX + (i + 1) + '" (' + fLabel + ") - " + sq.filled + " starters + " + sq.subFilled + " subs"; });
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
          var r = await createGameSquad(name, formationName, gauntletItemsForSquad(squad));
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

  var squadMod = document.createElement("div");
  squadMod.className = "fc26-squad";
  squadMod.appendChild(pickerHead); squadMod.appendChild(playerSearch); squadMod.appendChild(filterRow); squadMod.appendChild(eligManageRow); squadMod.appendChild(eligManager); squadMod.appendChild(batchBar); squadMod.appendChild(playerList); squadMod.appendChild(lineupStub); squadMod.appendChild(metaSection); squadMod.appendChild(gtSection);
  // Group 2 - Build (Suggest + tabs + evo grid).  (preview is its own module, moved directly.)
  var buildMod = document.createElement("div");
  buildMod.appendChild(evoTitle); buildMod.appendChild(suggestRow); buildMod.appendChild(tabs); buildMod.appendChild(evoCount); buildMod.appendChild(evoList); buildMod.appendChild(ghSection);
  // Group 3 - Apply. The "run row" (optRow) holds the delay chip + Apply/Stop side by side
  // (Apply and Stop swap in the same slot), then the animation/summary box + status line.
  optRow.appendChild(applyBtn); optRow.appendChild(stopBtn);
  var applyMod = document.createElement("div");
  applyMod.appendChild(batchList); applyMod.appendChild(optRow); applyMod.appendChild(applyBox); applyMod.appendChild(status);

  // Compact "selected player" header, shown atop the wizard's PlayStyles step.
  var wizWho = document.createElement("div");
  wizWho.className = "fc26-wizwho";
  function updateWizWho() {
    var it = state.player;
    // With a batch of 2+, the styles apply to ALL of them, but the evo grid's owned/caps
    // still reflect the previewed player - so say both ("N players · building from X").
    if (state.batch.size > 1) {
      wizWho.innerHTML = "<span style='color:var(--accent);font-weight:800'>👥 " + state.batch.size + " players</span>" +
        (it ? " <span style='color:var(--muted)'>&middot; building from " + esc(playerName(it)) + "</span>" : "");
      return;
    }
    wizWho.innerHTML = it
      ? "<span style='color:var(--gold);font-weight:800'>" + (it.rating != null ? it.rating : "?") + "</span> <b>" + esc(playerName(it)) + "</b>"
      : "<span style='color:var(--muted)'>No player selected</span>";
    if (typeof renderDeckSummary === "function") renderDeckSummary();  // keep the mobile Deck summary bar in sync
  }

  // capMetersHTML(it): the two capacity meters (PS+ / Basic) as segment bars, the same
  // ones the preview card draws. Split out so the mobile Deck summary can show them too
  // without duplicating the markup. Caps grow past 3/8 for a GH-4th card (Math.max), just
  // like the preview.
  function capMetersHTML(it) {
    var np = numPlus(it), nb = numBasic(it);
    var plusCap = Math.max(CAP_PLUS, np), basicCap = Math.max(CAP_BASIC, nb);
    function meter(label, used, cap, kind) {
      var segs = "";
      for (var i = 0; i < cap; i++) segs += "<span class='pv-seg" + (i < used ? " on" : "") + "'></span>";
      return "<div class='pv-meter " + kind + "'><div class='pv-mlab'><span>" + label + "</span><b>" + used + "/" + cap + "</b></div>" +
        "<div class='pv-segrow'>" + segs + "</div></div>";
    }
    return "<div class='pv-meters' style='margin-top:0'>" + meter("PlayStyle+", np, plusCap, "plus") + meter("Basic", nb, basicCap, "basic") + "</div>";
  }

  // ---- FEATURE: mobile PlayStyle-Deck summary --------------------------------
  // A slim bar pinned to the top of the mobile Deck step: rating + name + caps, with a
  // "stats" toggle that expands to the capacity meters AND the six face stats (mirroring
  // the Review card), so you can read the player without leaving the deck. Open/closed is
  // remembered across players and sessions.
  var DECK_STATS_KEY = "FC26_deckStatsOpen";
  function loadDeckStatsOpen() { try { return window.localStorage.getItem(DECK_STATS_KEY) === "1"; } catch (e) { return false; } }
  function saveDeckStatsOpen() { try { window.localStorage.setItem(DECK_STATS_KEY, state.deckStatsOpen ? "1" : "0"); } catch (e) {} }
  state.deckStatsOpen = loadDeckStatsOpen();

  var deckSummary = document.createElement("div");
  deckSummary.className = "fc26-decksum";
  // renderDeckSummary(): (re)draw the summary bar for the current player / batch. Stats
  // always reflect the previewed player (state.player), which is also what the evo grid
  // shows - so in a batch it reads "N players" but the stats are the card you're building
  // from. Safe to call any time; it just rewrites the (possibly detached) element.
  function renderDeckSummary() {
    if (!deckSummary) return;
    var it = state.player;
    var many = state.batch.size > 1;
    var open = !!state.deckStatsOpen;
    var rEl, nameEl, capEl, gkBadge = "";
    if (many) {                                        // batch: apply to all, stats from the building-from card
      rEl = "👥";
      nameEl = state.batch.size + " players";
      capEl = it ? ("building from " + playerName(it)) : "batch apply";
    } else if (it) {
      rEl = (it.rating != null ? it.rating : "?");
      nameEl = playerName(it);
      gkBadge = isGKPlayer(it) ? "<span class='ds-gk'>GK</span>" : "";
      capEl = "PS+ " + numPlus(it) + "/" + Math.max(CAP_PLUS, numPlus(it)) + " · BASIC " + numBasic(it) + "/" + Math.max(CAP_BASIC, numBasic(it));
    } else {
      rEl = "—"; nameEl = "No player selected"; capEl = "pick one from the Lineup tab";
    }
    var showToggle = !!it;                             // stats only make sense with a player in focus
    var bar = "<div class='ds-bar'>" +
      "<span class='ds-r'>" + rEl + "</span>" +
      "<div class='ds-w'><div class='ds-n'>" + esc(nameEl) + gkBadge + "</div><div class='ds-c'>" + esc(capEl) + "</div></div>" +
      (showToggle ? "<button type='button' class='ds-toggle'>" + (open ? "▴ hide" : "▾ stats") + "</button>" : "") +
      "</div>";
    var body = (open && it) ? ("<div class='ds-body'>" + capMetersHTML(it) + faceStatsHTML(it) + "</div>") : "";
    deckSummary.className = "fc26-decksum" + (open && it ? " open" : "");
    deckSummary.innerHTML = bar + body;
    var tg = deckSummary.querySelector(".ds-toggle");
    if (tg) tg.addEventListener("click", function () { state.deckStatsOpen = !state.deckStatsOpen; saveDeckStatsOpen(); renderDeckSummary(); });
  }

  // ---- FEATURE: mobile Review summary ---------------------------------------
  // The Review step used to repeat the whole preview card, which now just echoes the
  // Deck step's summary bar. Instead we show a tight "about to apply" list: who it targets
  // plus the PlayStyles you ticked, split PS+ / Basic. When nothing is ticked it still shows
  // (so you can reach Review to manage an existing card) - a "Manage this card" section folds
  // out the eligibility toggle + remove/clear-evo buttons that used to live on the preview.
  state.reviewManageOpen = false;
  var reviewSummary = document.createElement("div");
  reviewSummary.className = "fc26-revsum";
  function renderReviewSummary() {
    if (!reviewSummary) return;
    var it = state.player;
    var many = state.batch.size > 1;
    if (!it && !many) { reviewSummary.style.display = "none"; reviewSummary.innerHTML = ""; return; }  // no target at all
    reviewSummary.style.display = "";
    // Collect the ticked evos, split into PS+ and Basic (via the slotId -> evo lookup).
    var plus = [], basic = [];
    Array.from(state.selected).forEach(function (sid) { var e = byId(sid); if (!e) return; (e.kind === "PS+" ? plus : basic).push(e); });
    var total = plus.length + basic.length;
    // Target line: a batch count, or the single player's rating + name + rarity.
    var target;
    if (many) {
      target = "<span class='rs-r'>👥</span><div class='rs-w'><div class='rs-n'>" + state.batch.size + " players</div><div class='rs-c'>batch apply</div></div>";
    } else {
      target = "<span class='rs-r'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        "<div class='rs-w'><div class='rs-n'>" + esc(playerName(it)) + (isGKPlayer(it) ? "<span class='ds-gk'>GK</span>" : "") + "</div>" +
        "<div class='rs-c'>" + esc(rarityName(it)) + "</div></div>";
    }
    // chipRow(list, isPlus): one PS+/Basic row of icon chips (reuses the preview's chip look).
    function chipRow(list, isPlus) {
      if (!list.length) return "";
      var chips = list.map(function (e) {
        return "<span class='pv-chip" + (isPlus ? " plus" : "") + "'>" +
          "<i class='ico " + (isPlus ? "icon_icontrait" : "icon_basetrait") + evoTrait(e) + "'></i>" +
          esc(e.n.replace(/\+$/, "")) + "</span>";
      }).join("");
      return "<div class='pv-group'><div class='pv-gl'>" + (isPlus ? "PlayStyle+" : "Basic") + " (" + list.length + ")</div>" +
        "<div class='pv-chips'>" + chips + "</div></div>";
    }
    // The queued list, or a muted note when nothing's ticked (you're here just to manage).
    var queued = total
      ? ("<div class='rs-lead'>Applying " + total + " PlayStyle" + (total === 1 ? "" : "s") + ":</div>" + chipRow(plus, true) + chipRow(basic, false))
      : "<div class='rs-none'>No PlayStyles ticked to apply. Go back to the Deck to pick some, or manage the card below.</div>";

    // "Manage this card" (single player only): the eligibility toggle + remove/clear-evo
    // buttons that used to sit on the preview. Folded away by default.
    var manage = "";
    if (it && !many) {
      var mOpen = !!state.reviewManageOpen;
      var elig = isEligibleRarity(it);
      var hasPS = currentPlayStyles(it).length > 0;
      manage = "<div class='rs-manage'>" +
        "<button type='button' class='rs-manage-toggle'>" + (mOpen ? "▾ " : "▸ ") + "Manage this card</button>" +
        (mOpen
          ? "<div class='rs-manage-body'>" +
              "<div class='pv-elig'><span class='pv-elig-state " + (elig ? "on" : "off") + "'>" + (elig ? "✓ evo-eligible" : "not evo-eligible") + "</span>" +
                "<button class='pv-elig-btn'>" + (elig ? "Remove" : "Mark eligible") + "</button></div>" +
              (hasPS
                ? "<div class='pv-reset'><button class='pv-rm-one'>Remove Latest Evo</button><button class='pv-rm-all'>Clear all evos</button></div>"
                : "<div class='pv-none'>No PlayStyles on this card yet.</div>") +
            "</div>"
          : "") +
        "</div>";
    }

    reviewSummary.innerHTML = "<div class='rs-bar'>" + target + "</div>" + queued + manage;

    // Wire the manage controls (listeners, not inline - the app's CSP blocks inline handlers).
    var mt = reviewSummary.querySelector(".rs-manage-toggle");
    if (mt) mt.addEventListener("click", function () { state.reviewManageOpen = !state.reviewManageOpen; renderReviewSummary(); });
    var eb = reviewSummary.querySelector(".pv-elig-btn");
    if (eb) eb.addEventListener("click", function () { setRarityEligible(it.rareflag, !isEligibleRarity(it)); renderReviewSummary(); renderPlayers(); if (state.player) renderPreview(); });
    var rmOne = reviewSummary.querySelector(".pv-rm-one");
    if (rmOne) rmOne.addEventListener("click", function () { runRemove(false); });
    var rmAll = reviewSummary.querySelector(".pv-rm-all");
    if (rmAll) rmAll.addEventListener("click", function () { runRemove(true); });
  }

  // Mobile scaffolding: a broadcast "channel" layout. A fixed tab bar up top (Lineup /
  // Style deck / Review) and the current section scrolling below it. (The old pinned
  // mini-spotlight was removed - the Deck step's summary bar and the Review preview now
  // show the same rating/name/caps, so it was pure duplication.)
  var layoutHost = document.createElement("div");             // the one box we rebuild the layout into
  layoutHost.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column";
  var stepper = document.createElement("div"); stepper.className = "fc26-chtabs";      // the channel tab bar
  var stepBody = document.createElement("div"); stepBody.className = "fc26-stepbody";   // the scrolling section
  var STEP_LABELS = ["Lineup", "PlayStyle Deck", "Review"];   // channel-tab labels (1 / 2 / 3)

  // Mobile "guide" button: walks the user Lineup -> PlayStyle Deck -> Review. It's gated:
  // you can't leave Lineup without a player, and you can't reach Review without at least one
  // PlayStyle picked (the Review tab is dimmed + blocked in the same case). updateGuide()
  // keeps its label/enabled state live (called on every render and every evo change).
  var guideBtn = document.createElement("button");
  guideBtn.className = "fc26-guidebtn";
  guideBtn.addEventListener("click", function () { goStep(state.wizStep + 1); });
  var reviewTabEl = null;   // the Review tab element, so updateGuide can dim/undim it live
  // reviewReady(): may we land on the Review step? Yes if you've ticked something to apply,
  // OR the selected player already HAS PlayStyles (so you can go there just to review /
  // remove them via "Manage this card"). Applying is separately gated by updateApplyBtn.
  function reviewReady() {
    if (state.selected.size >= 1) return true;
    try { return !!(state.player && currentPlayStyles(state.player).length > 0); } catch (e) { return false; }
  }
  function updateGuide() {
    var ready = reviewReady();
    if (reviewTabEl) reviewTabEl.classList.toggle("dis", !ready);
    if (!guideBtn) return;
    if (state.wizStep >= 3) { guideBtn.style.display = "none"; return; }   // Review uses the Apply button
    guideBtn.style.display = "";
    var can, label;
    if (state.wizStep === 1) {
      can = !!state.player || state.batch.size > 0;
      label = can ? "Next: PlayStyle Deck →" : "Pick a player first";
    } else {                                                   // step 2 (PlayStyle Deck)
      can = ready;
      label = can ? "Next: Review →" : "Pick a PlayStyle to continue";
    }
    guideBtn.textContent = label;
    guideBtn.disabled = !can;
    guideBtn.classList.toggle("dis", !can);
  }

  // goStep(n): change wizard step (clamped 1-3) and redraw, on mobile. Guarded: you can't
  // land on Review (3) unless reviewReady() (something ticked, or the card already has
  // PlayStyles to manage) - a no-op otherwise, so both the guide button and a direct
  // Review-tab tap are blocked.
  function goStep(n) {
    n = Math.max(1, Math.min(3, n));
    if (n === 3 && !reviewReady()) return;                    // nothing to apply or manage -> stay put
    state.wizStep = n;
    if (currentMode() === "mobile") renderWizStep();
  }

  // renderWizStep(): draw the stepper + show the current step's modules + set nav buttons.
  function renderWizStep() {
    stepper.innerHTML = "";
    reviewTabEl = null;
    for (var i = 1; i <= 3; i++) {
      (function (n) {
        var s = document.createElement("div");
        s.className = "fc26-chtab" + (n === state.wizStep ? " on" : "");   // active channel highlighted
        s.textContent = STEP_LABELS[n - 1];
        s.addEventListener("click", function () { goStep(n); });
        stepper.appendChild(s);
        if (n === 3) reviewTabEl = s;   // remembered so updateGuide can dim it until ready
      })(i);
    }
    stepBody.innerHTML = "";
    if (state.wizStep === 1) {                                 // Lineup: pick a player
      stepBody.appendChild(squadMod);
      updateLineupCollapse();                                  // re-evaluate the list/stub for mobile
    } else if (state.wizStep === 2) {                          // PlayStyle Deck: choose PlayStyles
      renderDeckSummary(); stepBody.appendChild(deckSummary); stepBody.appendChild(buildMod);
    } else {                                                    // Review: preview + apply
      renderReviewSummary(); stepBody.appendChild(reviewSummary); stepBody.appendChild(applyMod);
    }
    updateGuide();   // set the guide button label/enabled + Review-tab dim for this step
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
    status.textContent = "Club ready: " + getClubPlayers().length + " players (↻ Reload club to refresh).";
  } else {
    loadFullClub();    // first run: load the FULL club in the background and redraw
  }

  applyLayout();                 // build the initial layout for this screen
  body.appendChild(layoutHost);
  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);
})();
