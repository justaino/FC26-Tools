window.FC26_LATEST = "javascript:(function(){fetch('https://justaino.com/releases/latest.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();";
window.FC26_VERSIONS = [
  {
    "v": 44,
    "date": "2026-08-19",
    "note": "Fix the club load stopping at about half your players",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v44.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  },
  {
    "v": 43,
    "date": "2026-08-15",
    "note": "Fixes the Detailed stats section showing base-card numbers for players not yet opened in the app. The panel now loads each card's attributes itself and shows a loading state instead of placeholder values.",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v43.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  },
  {
    "v": 42,
    "date": "2026-08-14",
    "note": "Adds a Detailed stats section to the player card: all 29 underlying attributes, grouped as the game groups them, with key attributes starred. Live values, so evolved cards read correctly.",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v42.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  }
];
