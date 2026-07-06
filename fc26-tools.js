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

  // Also stash the helpers on a tiny namespace, so you can poke them from the
  // DevTools Console (e.g. type: typeof window.FC26.applyEvo) when testing.
  // Optional - the panel uses the local functions above directly.
  window.FC26 = window.FC26 || {};
  window.FC26.getServices = getServices;
  window.FC26.awaitService = awaitService;
  window.FC26.applyEvo = applyEvo;
  window.FC26.claimEvo = claimEvo;

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
  var state = { player: null, selected: new Set(), tab: "PS+", running: false, abort: false, clubItems: prevClub, eligible: loadEligible(), onlyEligible: loadOnlyEligible() };

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

  // Recommended playstyles per position/role, in priority order. The top 3 become
  // PS+, the rest basic PlayStyles.
  var ROLES = {"ST":{"Advanced Forward":["Finesse Shot","Low Driven Shot","Rapid","Incisive Pass","Gamechanger","Quick Step","Technical","Tiki Taka","First Touch","Press Proven","Enforcer"],"Target Forward":["Finesse Shot","Enforcer","Precision Header","Low Driven Shot","Incisive Pass","Rapid","First Touch","Gamechanger","Tiki Taka","Press Proven","Pinged Pass"],"Poacher":["Finesse Shot","Low Driven Shot","Rapid","Incisive Pass","First Touch","Gamechanger","Quick Step","Technical","Press Proven","Pinged Pass","Enforcer"],"False 9":["Finesse Shot","Incisive Pass","Low Driven Shot","Gamechanger","Rapid","Tiki Taka","Technical","Pinged Pass","Quick Step","Inventive","First Touch"]},"RW / LW":{"Inside Forward":["Finesse Shot","Low Driven Shot","Rapid","Quick Step","Technical","Gamechanger","Incisive Pass","Pinged Pass","Tiki Taka","First Touch","Inventive"],"Winger":["Rapid","Finesse Shot","Pinged Pass","Quick Step","Technical","Low Driven Shot","Gamechanger","Incisive Pass","Tiki Taka","First Touch","Inventive"],"Wide Playmaker":["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Pinged Pass","Rapid","Low Driven Shot","Gamechanger","Press Proven","First Touch","Inventive"]},"CAM":{"Shadow Striker":["Finesse Shot","Incisive Pass","Rapid","Low Driven Shot","Technical","Quick Step","Tiki Taka","Gamechanger","First Touch","Pinged Pass","Inventive"],"Playmaker":["Finesse Shot","Incisive Pass","Low Driven Shot","Tiki Taka","Pinged Pass","Technical","Gamechanger","First Touch","Press Proven","Quick Step","Inventive"],"Classic 10":["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Pinged Pass","Low Driven Shot","Gamechanger","First Touch","Press Proven","Quick Step","Inventive"],"Half Winger":["Incisive Pass","Rapid","Technical","Tiki Taka","Pinged Pass","Gamechanger","Quick Step","First Touch","Press Proven","Inventive","Low Driven Shot"]},"CM":{"Box to Box":["Incisive Pass","Pinged Pass","Intercept","Finesse Shot","Tiki Taka","Bruiser","Anticipate","Quick Step","Technical","Relentless","Press Proven"],"Playmaker":["Incisive Pass","Pinged Pass","Finesse Shot","Tiki Taka","Technical","Intercept","Low Driven Shot","Anticipate","First Touch","Quick Step","Inventive"],"Deep Lying Playmaker":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Incisive Pass","Anticipate","Jockey","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Holding":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Anticipate","Jockey","Incisive Pass","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Half Winger":["Pinged Pass","Intercept","Quick Step","Tiki Taka","Incisive Pass","Finesse Shot","Anticipate","Technical","Jockey","Bruiser","Rapid"]},"RM / LM":{"Inside Forward":["Finesse Shot","Low Driven Shot","Rapid","Quick Step","Technical","Gamechanger","Incisive Pass","Pinged Pass","Tiki Taka","First Touch","Inventive"],"Winger":["Rapid","Finesse Shot","Pinged Pass","Quick Step","Technical","Low Driven Shot","Gamechanger","Incisive Pass","Tiki Taka","First Touch","Inventive"],"Wide Playmaker":["Finesse Shot","Incisive Pass","Technical","Tiki Taka","Pinged Pass","Rapid","Low Driven Shot","Gamechanger","Press Proven","First Touch","Inventive"],"Wide Midfielder":["Rapid","Quick Step","Pinged Pass","Tiki Taka","Incisive Pass","Intercept","Anticipate","Relentless","Whipped Pass","Jockey","Press Proven"]},"CDM":{"Holding":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Anticipate","Jockey","Incisive Pass","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Deep Lying Playmaker":["Intercept","Pinged Pass","Bruiser","Tiki Taka","Incisive Pass","Anticipate","Jockey","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Box Crasher":["Incisive Pass","Intercept","Pinged Pass","Finesse Shot","Tiki Taka","Quick Step","Bruiser","Anticipate","Technical","Press Proven","Relentless"],"Centre Half":["Intercept","Bruiser","Jockey","Anticipate","Quick Step","Block","Tiki Taka","Pinged Pass","Aerial Fortress","Slide Tackle","Long Ball Pass"],"Wide Half":["Bruiser","Intercept","Quick Step","Jockey","Anticipate","Incisive Pass","Block","Tiki Taka","Pinged Pass","Press Proven","Relentless"]},"RB / LB":{"Fullback":["Bruiser","Intercept","Quick Step","Jockey","Anticipate","Incisive Pass","Block","Tiki Taka","Pinged Pass","Press Proven","Relentless"],"Wingback":["Intercept","Pinged Pass","Quick Step","Anticipate","Bruiser","Tiki Taka","Jockey","Incisive Pass","Rapid","Relentless","Press Proven"],"Falseback":["Intercept","Pinged Pass","Anticipate","Jockey","Tiki Taka","Incisive Pass","Bruiser","Quick Step","First Touch","Press Proven","Long Ball Pass"],"Inverted Wingback":["Incisive Pass","Tiki Taka","Quick Step","Intercept","Anticipate","Rapid","Pinged Pass","Jockey","Press Proven","Relentless","Bruiser"],"Attacking Wingback":["Rapid","Quick Step","Pinged Pass","Tiki Taka","Incisive Pass","Intercept","Anticipate","Relentless","Jockey","First Touch","Bruiser"]},"CB":{"Defender":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Pinged Pass","Aerial Fortress","Slide Tackle","Tiki Taka","Press Proven"],"Stopper":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Slide Tackle","Tiki Taka","Pinged Pass","Relentless","Aerial Fortress"],"Wide Back":["Intercept","Anticipate","Quick Step","Jockey","Bruiser","Block","Pinged Pass","Aerial Fortress","Slide Tackle","Tiki Taka","Press Proven"],"Ball Playing Defender":["Intercept","Bruiser","Anticipate","Jockey","Quick Step","Block","Pinged Pass","Tiki Taka","First Touch","Press Proven","Aerial Fortress"]},"GK":{"Goalkeeper":["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Far Throw","Pinged Pass","Long Ball Pass","Tiki Taka","Press Proven","First Touch"],"Ball Playing":["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Pinged Pass","Far Throw","Long Ball Pass","Tiki Taka","Press Proven","First Touch"],"Sweeper Keeper":["Far Reach","Footwork","1v1 Close Down","Deflector","Cross Claimer","Pinged Pass","Far Throw","Long Ball Pass","Tiki Taka","Press Proven","First Touch"]}};

  // Look up an evo by playstyle name. pspByName is keyed by the BASE name (no "+").
  var psByName = {}, pspByName = {};
  PS.forEach(function (x) { psByName[x.n] = x; });
  PSP.forEach(function (x) { pspByName[x.n.replace(/\+$/, "")] = x; });

  // playerPositionGroups(it): the role groups this player can fill (preferred
  // position first, then alternates), deduped - used to fill the position dropdown.
  function playerPositionGroups(it) {
    var ids = null;
    try { if (Array.isArray(it.possiblePositions)) ids = it.possiblePositions; } catch (e) {}
    if (!ids) { try { ids = it.getBasePossiblePositions(); } catch (e) {} }
    ids = ids || [];
    var groups = [];
    [it.preferredPosition].concat(ids).forEach(function (id) {
      if (id == null) return;
      var g = POS_GROUP[id];
      if (g && groups.indexOf(g) === -1) groups.push(g);
    });
    return groups;
  }

  // The floating panel. A flex column: fixed header on top, scrollable body below.
  var panel = document.createElement("div");
  panel.id = "fc26-panel";
  // Size / position / rounding come from .fc26-desktop or .fc26-mobile (in the CSS),
  // which applyLayout() sets on the panel based on screen width. Everything else
  // (the frosted glass look) is here.
  panel.style.cssText =
    "position:fixed;z-index:99999;" +
    "display:flex;flex-direction:column;overflow:hidden;" +
    "background:var(--bg);color:var(--ink);font:13px system-ui,sans-serif;" +
    "backdrop-filter:blur(16px) saturate(1.25);-webkit-backdrop-filter:blur(16px) saturate(1.25);" +
    "box-shadow:var(--shadow);border:1px solid var(--border)";

  // Header bar: title left, minimize + close right. Lives OUTSIDE the scroll area
  // so the buttons are always reachable even with a long list.
  var header = document.createElement("div");
  header.className = "fc26-header";   // the drag handle (see the drag code near the bottom)
  // touch-action:none lets us drag on touch screens without the page trying to scroll.
  header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--header-bg);border-bottom:1px solid var(--border);touch-action:none";
  var title = document.createElement("div");
  title.className = "fc26-title";
  title.textContent = "Men Gallant FC - Justaino PS Tool";
  title.style.cssText = "flex:1;font-weight:700;font-size:12px;line-height:1.2;color:var(--title)";
  var minBtn = document.createElement("button");
  minBtn.textContent = "–";
  minBtn.title = "Minimize / expand";
  minBtn.style.cssText = "background:var(--btn);color:var(--btn-ink);border:0;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;line-height:1";
  var closeBtn = document.createElement("button");
  closeBtn.textContent = "×";                 // "×"
  closeBtn.title = "Close (re-click the bookmark to reopen)";
  closeBtn.style.cssText = "background:var(--btnx);color:var(--btnx-ink);border:0;border-radius:6px;width:24px;height:24px;cursor:pointer;font-weight:700;line-height:1";
  closeBtn.addEventListener("click", function () { panel.remove(); });
  header.appendChild(title); header.appendChild(minBtn); header.appendChild(closeBtn);

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
    body.style.display = state.minimized ? "none" : "";
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
  pickerTitle.textContent = "Players";
  pickerTitle.style.cssText = "flex:1;font-weight:600";
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

  // Scrollable list of club players. Its height is set by CSS (.fc26-plist): a fixed
  // cap on mobile, but "flex to fill the left pane" on desktop so it never leaves a gap.
  var playerList = document.createElement("div");
  playerList.className = "fc26-plist";
  playerList.style.cssText = "margin-top:6px;overflow:auto;display:flex;flex-direction:column;gap:4px";

  // Preview card for the selected player (hidden until one is picked).
  var preview = document.createElement("div");
  preview.style.cssText = "margin-top:8px;padding:8px;border-radius:8px;background:var(--card);border:1px solid var(--card-border);display:none";

  // renderPreview(): redraw the selected-player card. Same info as before -
  // name/OVR/rarity, caps used, and current PlayStyles - but laid out visually:
  //   - two "capacity pip" trackers (3 pips for PS+, 8 for Basic) that fill up
  //     as slots are used (PS+ pips gold, Basic pips emerald), and
  //   - the current PlayStyles as icon chips, split into a PS+ row and a Basic row.
  // The chip icons reuse the app's PlayStyle icon font, the same one the evo grid
  // uses, so the preview and the picker share one look.
  function renderPreview() {
    var it = state.player;
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

    // pipsHTML(label, used, cap, kindClass): a labelled row of filled/empty pips.
    function pipsHTML(label, used, cap, kindClass) {
      var pips = "";
      for (var i = 0; i < cap; i++) { pips += "<span class='pv-pip" + (i < used ? " on" : "") + "'></span>"; }
      return "<div class='pv-cap " + kindClass + "'>" +
        "<div class='pv-lab'><span>" + label + "</span><b>" + used + "/" + cap + "</b></div>" +
        "<div class='pv-pips'>" + pips + "</div></div>";
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

    preview.innerHTML =
      "<div class='pv-head'>" +
        "<span class='pv-name'>" + esc(playerName(it)) + "</span>" +
        "<span class='pv-ovr'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        (isGKPlayer(it) ? "<span class='pv-gk'>GK</span>" : "") +
      "</div>" +
      "<div class='pv-meta'>" + esc(rarityName(it)) + " &middot; rarity #" + it.rareflag + posLine + " &middot; item " + it.id + "</div>" +
      eligHTML +
      "<div class='pv-caps'>" +
        pipsHTML("PlayStyle+", pUsed, CAP_PLUS, "plus") +
        pipsHTML("Basic", bUsed, CAP_BASIC, "basic") +
      "</div>" +
      noneMsg +
      groupHTML("PlayStyle+", plus, true) +
      groupHTML("Basic", basic, false);

    // Wire the eligibility button (listener, not inline onclick - the app's CSP
    // blocks inline handlers). Toggles this rarity, then redraws the card + list.
    var eb = preview.querySelector(".pv-elig-btn");
    if (eb) eb.addEventListener("click", function () {
      setRarityEligible(it.rareflag, !isEligibleRarity(it));
      renderPreview();
      renderPlayers();
    });
  }

  // selectPlayer(it): remember the choice, clear any ticked evos from the previous
  // player, then redraw the list, preview, and evolution tabs.
  function selectPlayer(it) {
    state.player = it;
    state.selected = new Set();   // a fresh player starts with nothing ticked
    if (typeof applyBox !== "undefined" && applyBox) { applyBox.style.display = "none"; applyBox.innerHTML = ""; }  // clear any old apply summary
    renderPlayers();
    renderPreview();
    populatePositions();          // dropdowns now reflect this player's positions
    renderEvos();
    updateWizWho();               // keep the wizard's mini header in sync
    // On mobile the picker is step 1 of the wizard; choosing a player moves to step 2.
    if (currentMode() === "mobile" && state.wizStep === 1) { goStep(2); }
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
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:7px;cursor:pointer;border:1px solid " +
        (selected ? "var(--accent)" : "var(--card-border)") + ";background:" + (selected ? "var(--sel)" : "var(--card)");
      // The PlayStyle+ icons the player already has (isIcon = the "+" version), so you
      // can see a card's PS+ at a glance without opening it. Uses the game icon font.
      var psPlus = currentPlayStyles(it).filter(function (p) { return p.isIcon; });
      var psHTML = psPlus.length
        ? "<span class='pl-ps'>" + psPlus.map(function (p) { return "<i class='ico icon_icontrait" + p.traitId + "'></i>"; }).join("") + "</span>"
        : "";
      // The right-hand stuff (PS+ icons + GK + rarity) goes in a fixed-width "meta" zone
      // so the NAME column is the SAME width on every row - a different number of PS+ icons
      // no longer jitters how much of the name shows. (On mobile the zone just fits content.)
      row.innerHTML =
        "<span class='pl-rate'>" + (it.rating != null ? it.rating : "?") + "</span>" +
        "<span class='pl-name'>" + esc(playerName(it)) + "</span>" +
        "<span class='pl-meta'>" +
          psHTML +
          (isGKPlayer(it) ? "<span class='pl-gk'>GK</span>" : "") +
          "<span class='pl-rar'>" + esc(rarityName(it)) + "</span>" +
        "</span>";
      row.addEventListener("click", function () { selectPlayer(it); });
      playerList.appendChild(row);
    });
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
  evoTitle.textContent = "Evolutions";
  evoTitle.style.cssText = "margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-weight:600";

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
  // Top 3 -> PS+, the rest -> basic. Skips owned / GK-mismatch / cap-full and
  // respects the caps, exactly like manual ticking. Selection only - nothing applied.
  function suggest() {
    var it = state.player;
    if (!it) { status.textContent = "Select a player first."; return; }
    var pos = posSelect.value, role = roleSelect.value;
    if (!pos || !role || !ROLES[pos] || !ROLES[pos][role]) { status.textContent = "Pick a position and role."; return; }
    var gk = isGKPlayer(it);
    var plusUsed = numPlus(it), baseUsed = numBasic(it), added = 0, owned = 0, skip = [];
    state.selected = new Set();
    ROLES[pos][role].forEach(function (name, idx) {
      var wantPlus = idx < 3;                                   // top 3 -> PS+
      var evo = wantPlus ? pspByName[name] : psByName[name];
      if (!evo) { skip.push(name); return; }
      if (evo.g && !gk) { skip.push(name + " (GK-only)"); return; }
      if (hasEvo(it, evo)) { owned++; return; }                // already has it
      if (wantPlus) { if (plusUsed >= CAP_PLUS) { skip.push(name + "+ (full)"); return; } plusUsed++; }
      else { if (baseUsed >= CAP_BASIC) { skip.push(name + " (full)"); return; } baseUsed++; }
      state.selected.add(evo.s); added++;
    });
    setTab(idxTab());                                          // switches tab AND re-renders
    status.textContent = "Suggested " + added + " for " + pos + " / " + role +
      (owned ? ", " + owned + " owned" : "") + (skip.length ? ", skipped " + skip.length : "") + ".";
  }
  posSelect.addEventListener("change", populateRoles);
  suggestBtn.addEventListener("click", suggest);

  // Two tabs: PlayStyle+ and basic PlayStyle.
  var tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;gap:6px;margin-top:6px";
  function makeTab(label, kind) {
    var b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1;padding:6px;border:1px solid var(--field-border);border-radius:7px;color:var(--ink);cursor:pointer;font-weight:600;background:var(--tab)";
    b.addEventListener("click", function () { setTab(kind); });
    return b;
  }
  var tabPlus = makeTab("PlayStyle+ (36)", "PS+");
  var tabBase = makeTab("PlayStyle (36)", "PS");
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
    tabPlus.style.background = state.tab === "PS+" ? "var(--accent)" : "var(--tab)";
    tabPlus.style.color = state.tab === "PS+" ? "var(--accent-ink)" : "var(--ink)";
    tabBase.style.background = state.tab === "PS" ? "var(--accent)" : "var(--tab)";
    tabBase.style.color = state.tab === "PS" ? "var(--accent-ink)" : "var(--ink)";
    evoList.innerHTML = "";
    var it = state.player;
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
  }

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
    status.textContent = "Club loaded: " + getClubPlayers().length + " players.";
  }

  // "claim & finish" toggle.
  var optRow = document.createElement("div");
  optRow.style.cssText = "margin-top:8px;display:flex;align-items:center;gap:6px";

  // Delay control: how long to wait BETWEEN each apply, in milliseconds. A bigger,
  // human-ish gap is safer for the account. (Claiming now happens automatically
  // after every apply - PlayStyle evos grant on apply, so there's no reason to
  // ever skip it, hence no toggle.)
  var delayWrap = document.createElement("label");
  delayWrap.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px";
  delayWrap.appendChild(document.createTextNode("delay between applies (ms)"));
  var delayInput = document.createElement("input");
  delayInput.type = "number"; delayInput.value = "500"; delayInput.min = "0"; delayInput.step = "100";
  delayInput.style.cssText = "width:64px;padding:4px 6px;border-radius:6px;border:1px solid var(--field-border);background:var(--field);color:var(--ink)";
  delayWrap.appendChild(delayInput);
  optRow.appendChild(delayWrap);

  // Apply (green) and Stop (red) buttons - only one shows at a time.
  var applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply selected";
  applyBtn.style.cssText = "width:100%;margin-top:8px;padding:9px;border:none;border-radius:8px;cursor:pointer;background:var(--apply);color:var(--apply-ink);font-weight:700";
  applyBtn.addEventListener("click", runApply);

  var stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";
  stopBtn.style.cssText = "width:100%;margin-top:8px;padding:9px;border:none;border-radius:8px;cursor:pointer;background:#c0392b;color:#fff;font-weight:700;display:none";
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
    // On mobile that's step 1 of the wizard; on desktop the list is always visible, so
    // we just scroll it into view. Either way we redraw the list so its PlayStyle+ icons
    // reflect what we just added.
    var backBtn = document.createElement("button");
    backBtn.className = "ap-back";
    backBtn.textContent = "← Back to players";
    backBtn.addEventListener("click", function () {
      renderPlayers();
      if (currentMode() === "mobile") { goStep(1); }
      else { try { playerList.scrollIntoView({ block: "nearest" }); } catch (e) {} }
    });
    applyBox.appendChild(backBtn);
    // Stagger the pop-in (non-blocking so the club refresh can run underneath).
    chipEls.forEach(function (c, i) { setTimeout(function () { c.classList.add("show"); }, 90 * i); });
  }

  // runApply(): the queue. For each ticked evo: await applyEvo, optionally await
  // claimEvo, pause ~400ms, report progress in the status line. A failure on one
  // evo is logged and the run continues. Nothing is faked - every call goes
  // through the app's own Academy service. At the end we refresh so the new
  // PlayStyles show without a page reload.
  async function runApply() {
    if (state.running) return;
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
      // ---- THEME TOKENS ("Emerald frosted glass") ------------------------------
      // The ONE place colours live. Every element below and every inline style in
      // this file reads these via var(--name), so re-skinning = edit this block only.
      // Values are mostly translucent (rgba) on purpose: the panel is frosted glass,
      // so the live app shows through, softened by the blur set on the panel itself.
      "#fc26-panel{" +
        "--radius:12px;" +                                          // corner rounding
        "--bg:rgba(18,42,35,.58);" +                                // panel glass tint (deep emerald)
        "--border:rgba(255,255,255,.15);" +                         // hairline edges
        "--header-bg:rgba(255,255,255,.06);" +                      // title bar wash
        "--ink:#eaf6f0;--muted:#a2c9ba;--title:#ffffff;" +          // text: normal / dim / heading
        "--accent:#4fe3ac;--accent-ink:#04241a;" +                  // emerald accent + dark text for on-accent
        "--gold:#ffd98a;" +                                         // ratings + PlayStyle+ (FUT gold)
        "--btn:rgba(255,255,255,.10);--btn-ink:#d6f4e8;" +          // secondary buttons
        "--btnx:rgba(255,120,120,.14);--btnx-ink:#ffc2c2;" +        // close (×) button
        "--field:rgba(0,0,0,.28);--field-border:rgba(255,255,255,.14);" + // inputs / dropdowns
        "--card:rgba(255,255,255,.06);--card-border:rgba(255,255,255,.12);" + // sub-panels (rows, preview)
        "--sel:rgba(79,227,172,.18);" +                             // selected / highlighted fill
        "--tab:rgba(255,255,255,.06);--icon:#dcf4ea;" +             // inactive tab + evo icon colour
        "--tile:rgba(255,255,255,.05);--tile-border:rgba(255,255,255,.12);" + // basic evo tiles
        "--tile-psp:rgba(255,217,138,.12);--tile-psp-border:rgba(255,217,138,.34);" + // PS+ tiles (gold tint)
        "--apply:rgba(79,227,172,.92);--apply-ink:#04241a;" +      // Apply button
        "--shadow:0 16px 40px rgba(0,0,0,.5);" +                    // drop shadow
      "}" +
      // ---- preview card (selected player) --------------------------------------
      // Header line: name + OVR + optional GK badge.
      "#fc26-panel .pv-head{display:flex;align-items:baseline;gap:8px}" +
      "#fc26-panel .pv-name{font-weight:800;font-size:15px;color:var(--ink)}" +
      "#fc26-panel .pv-ovr{color:var(--gold);font-weight:800;font-variant-numeric:tabular-nums}" +
      "#fc26-panel .pv-gk{margin-left:auto;color:var(--accent);font-size:9px;border:1px solid var(--accent);border-radius:4px;padding:0 4px}" +
      "#fc26-panel .pv-meta{color:var(--muted);font-size:11px;margin-top:2px}" +
      // Capacity pips: one filled pip per slot used (PS+ = gold, Basic = emerald).
      "#fc26-panel .pv-caps{display:flex;gap:14px;margin-top:11px}" +
      "#fc26-panel .pv-cap{flex:1;min-width:0}" +
      "#fc26-panel .pv-lab{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}" +
      "#fc26-panel .pv-lab b{color:var(--ink);font-variant-numeric:tabular-nums;letter-spacing:0}" +
      "#fc26-panel .pv-pips{display:flex;gap:4px}" +
      "#fc26-panel .pv-pip{height:6px;flex:1;border-radius:3px;background:rgba(255,255,255,.12)}" +
      "#fc26-panel .pv-cap.plus .pv-pip.on{background:var(--gold)}" +
      "#fc26-panel .pv-cap.basic .pv-pip.on{background:var(--accent)}" +
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
      // ---- evo-grid tiles ------------------------------------------------------
      // PlayStyle+ icons shown inline on each player row in the picker (gold).
      "#fc26-panel .pl-ps{display:inline-flex;gap:3px;align-items:center;flex:none}" +
      "#fc26-panel .pl-ps .ico{font-family:'UltimateTeam-Icons',sans-serif;font-style:normal;font-weight:400;font-size:14px;line-height:1;color:var(--gold)}" +
      // Player row: rating | name (flexes) | meta zone (icons + GK + rarity).
      "#fc26-panel .pl-rate{flex:none;min-width:22px;text-align:center;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}" +
      "#fc26-panel .pl-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#fc26-panel .pl-gk{flex:none;color:var(--accent);font-size:9px;border:1px solid var(--accent);border-radius:4px;padding:0 4px}" +
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
      "#fc26-panel .fc26-ec .nm{font-size:9.5px;line-height:1.15;color:var(--muted);word-break:break-word}" +
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
      // ---- responsive layout: Split Console (desktop) / Wizard sheet (mobile) ---
      "#fc26-panel.fc26-desktop{bottom:16px;right:16px;width:520px;max-width:calc(100vw - 24px);max-height:88vh;border-radius:var(--radius)}" +
      "#fc26-panel.fc26-mobile{left:0;right:0;bottom:0;width:100%;max-height:86vh;border-radius:16px 16px 0 0}" +
      // Minimized (desktop OR mobile) = a small draggable pill in the bottom-right by
      // default. These come AFTER the mode rules so they override the panel width/shape.
      "#fc26-panel.fc26-min{left:auto;right:12px;bottom:12px;top:auto;width:auto;max-width:300px;max-height:none;border-radius:999px}" +
      "#fc26-panel.fc26-min .fc26-header{border-bottom:0}" +
      "#fc26-panel.fc26-min .fc26-title{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      // The header is the drag handle: show a move cursor where dragging is allowed
      // (the desktop panel, and either pill — but not the docked mobile sheet).
      "#fc26-panel.fc26-desktop .fc26-header,#fc26-panel.fc26-min .fc26-header{cursor:move}" +
      "#fc26-panel .fc26-cols{display:flex;gap:14px;flex:1;min-height:0}" +
      "#fc26-panel .fc26-pane{min-width:0;min-height:0;display:flex;flex-direction:column;overflow-y:auto}" +
      "#fc26-panel .fc26-pane.l{width:46%;flex:none}" +
      "#fc26-panel .fc26-pane.r{flex:1;border-left:1px solid var(--border);padding-left:14px}" +
      // list heights: capped on mobile; on desktop the squad list flexes to fill its
      // pane and the evo list is uncapped (the whole right pane scrolls as one).
      "#fc26-panel .fc26-plist{max-height:210px}" +
      "#fc26-panel .fc26-elist{max-height:210px}" +
      "#fc26-panel.fc26-desktop .fc26-squad{display:flex;flex-direction:column;flex:1;min-height:0}" +
      "#fc26-panel.fc26-desktop .fc26-plist{flex:1;min-height:80px;max-height:none}" +
      "#fc26-panel.fc26-desktop .fc26-elist{max-height:none}" +
      // thin, subtle scrollbars everywhere inside the panel (no fat OS scrollbar).
      "#fc26-panel ::-webkit-scrollbar{width:8px;height:8px}" +
      "#fc26-panel ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:8px}" +
      "#fc26-panel ::-webkit-scrollbar-track{background:transparent}" +
      "#fc26-panel *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}" +
      "#fc26-panel .fc26-stepper{display:flex;gap:6px;margin-bottom:12px}" +
      "#fc26-panel .fc26-step{flex:1;text-align:center;font-size:10px;color:var(--muted);cursor:pointer;user-select:none}" +
      "#fc26-panel .fc26-step .c{width:22px;height:22px;border-radius:50%;margin:0 auto 4px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.2);font-weight:700;font-size:11px}" +
      "#fc26-panel .fc26-step.done .c{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}" +
      "#fc26-panel .fc26-step.now .c{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 3px rgba(79,227,172,.15)}" +
      "#fc26-panel .fc26-step.now{color:var(--ink);font-weight:700}" +
      "#fc26-panel .fc26-wizwho{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--card);border:1px solid var(--card-border);margin-bottom:11px;font-size:13px}" +
      "#fc26-panel .fc26-wviznav{display:flex;gap:8px;margin-top:12px}" +
      "#fc26-panel .fc26-wizbtn{padding:10px 12px;border-radius:8px;border:1px solid var(--field-border);background:var(--tab);color:var(--ink);font-weight:600;font-size:12px;cursor:pointer}" +
      "#fc26-panel .fc26-wizbtn.next{flex:1;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}" +
      "@media (prefers-reduced-motion:reduce){#fc26-panel .fc26-ec.applying::after{animation:none}#fc26-panel .ap-chip{opacity:1;transform:none;animation:none}}";
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
  function currentMode() { return mq.matches ? "mobile" : "desktop"; }
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

  // posSlot(): which remembered spot applies right now, or null when the panel is docked
  // (the mobile full sheet) and therefore not draggable.
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
  // (a remembered, clamped spot — or clear inline styles so the CSS default edge applies).
  function applyPanelChrome() {
    var m = currentMode();
    panel.className = (m === "mobile" ? "fc26-mobile" : "fc26-desktop") + (state.minimized ? " fc26-min" : "");
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
    if (e.target && e.target.closest && e.target.closest("button")) return;   // let –/× buttons work
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
  window.addEventListener("resize", function () { applyPanelChrome(); reclampPanel(); });

  // Group 1 - Squad (search + eligible filter + player list). On desktop this becomes
  // a flex column (via .fc26-squad) so the player list flexes to fill the left pane.
  var squadMod = document.createElement("div");
  squadMod.className = "fc26-squad";
  squadMod.appendChild(pickerHead); squadMod.appendChild(playerSearch); squadMod.appendChild(filterRow); squadMod.appendChild(playerList);
  // Group 2 - Build (Suggest + tabs + evo grid).  (preview is its own module, moved directly.)
  var buildMod = document.createElement("div");
  buildMod.appendChild(evoTitle); buildMod.appendChild(suggestRow); buildMod.appendChild(tabs); buildMod.appendChild(evoCount); buildMod.appendChild(evoList);
  // Group 3 - Apply (delay + Apply/Stop + the animation/summary box + status line).
  var applyMod = document.createElement("div");
  applyMod.appendChild(optRow); applyMod.appendChild(applyBtn); applyMod.appendChild(stopBtn); applyMod.appendChild(applyBox); applyMod.appendChild(status);

  // Compact "selected player" header, shown atop the wizard's PlayStyles step.
  var wizWho = document.createElement("div");
  wizWho.className = "fc26-wizwho";
  function updateWizWho() {
    var it = state.player;
    wizWho.innerHTML = it
      ? "<span style='color:var(--gold);font-weight:800'>" + (it.rating != null ? it.rating : "?") + "</span> <b>" + esc(playerName(it)) + "</b>"
      : "<span style='color:var(--muted)'>No player selected</span>";
  }

  // Wizard scaffolding (used only on mobile).
  var layoutHost = document.createElement("div");             // the one box we rebuild the layout into
  layoutHost.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column";
  var stepper = document.createElement("div"); stepper.className = "fc26-stepper";
  var stepBody = document.createElement("div");
  var wizNav = document.createElement("div"); wizNav.className = "fc26-wviznav";
  var wizBack = document.createElement("button"); wizBack.className = "fc26-wizbtn"; wizBack.textContent = "← Back";
  var wizNext = document.createElement("button"); wizNext.className = "fc26-wizbtn next"; wizNext.textContent = "Next →";
  wizNav.appendChild(wizBack); wizNav.appendChild(wizNext);
  wizBack.addEventListener("click", function () { goStep(state.wizStep - 1); });
  wizNext.addEventListener("click", function () { goStep(state.wizStep + 1); });
  var STEP_LABELS = ["Player", "PlayStyles", "Apply"];

  // goStep(n): change wizard step (clamped 1-3) and redraw, on mobile.
  function goStep(n) { state.wizStep = Math.max(1, Math.min(3, n)); if (currentMode() === "mobile") renderWizStep(); }

  // renderWizStep(): draw the stepper + show the current step's modules + set nav buttons.
  function renderWizStep() {
    stepper.innerHTML = "";
    for (var i = 1; i <= 3; i++) {
      (function (n) {
        var s = document.createElement("div");
        s.className = "fc26-step" + (n === state.wizStep ? " now" : (n < state.wizStep ? " done" : ""));
        s.innerHTML = "<span class='c'>" + (n < state.wizStep ? "✓" : n) + "</span>" + STEP_LABELS[n - 1];
        s.addEventListener("click", function () { goStep(n); });
        stepper.appendChild(s);
      })(i);
    }
    stepBody.innerHTML = "";
    if (state.wizStep === 1) {                                 // Step 1: pick a player
      stepBody.appendChild(squadMod);
    } else if (state.wizStep === 2) {                          // Step 2: choose PlayStyles
      updateWizWho(); stepBody.appendChild(wizWho); stepBody.appendChild(buildMod);
    } else {                                                    // Step 3: review + apply
      stepBody.appendChild(preview); stepBody.appendChild(applyMod);
    }
    wizBack.style.visibility = state.wizStep === 1 ? "hidden" : "visible";
    wizNext.style.display = state.wizStep === 3 ? "none" : "";  // step 3 uses the Apply button, not Next
    wizNext.textContent = state.wizStep === 1 ? "Next: PlayStyles →" : "Next: Review →";
  }

  // applyLayout(): (re)build the whole layout for the current screen width.
  function applyLayout() {
    var m = currentMode();
    applyPanelChrome();   // set the panel's class + position (mode + minimized + saved spot)
    // Desktop: the panes scroll (host doesn't). Mobile: the whole sheet scrolls.
    layoutHost.style.overflowX = "hidden";
    layoutHost.style.overflowY = m === "mobile" ? "auto" : "hidden";
    layoutHost.innerHTML = "";
    if (m === "desktop") {
      var cols = document.createElement("div"); cols.className = "fc26-cols";
      var l = document.createElement("div"); l.className = "fc26-pane l";
      var r = document.createElement("div"); r.className = "fc26-pane r";
      l.appendChild(squadMod);
      r.appendChild(preview); r.appendChild(buildMod); r.appendChild(applyMod);
      cols.appendChild(l); cols.appendChild(r);
      layoutHost.appendChild(cols);
    } else {
      layoutHost.appendChild(stepper); layoutHost.appendChild(stepBody); layoutHost.appendChild(wizNav);
      renderWizStep();
    }
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
