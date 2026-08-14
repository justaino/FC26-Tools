window.FC26_LATEST = "javascript:(function(){fetch('https://justaino.com/releases/latest.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();";
window.FC26_VERSIONS = [
  {
    "v": 42,
    "date": "2026-08-14",
    "note": "Adds a Detailed stats section to the player card: all 29 underlying attributes, grouped as the game groups them, with key attributes starred. Live values, so evolved cards read correctly.",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v42.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  },
  {
    "v": 41,
    "date": "2026-08-14",
    "note": "Adds the FUTTIES 5th PlayStyle+ one-off evo, a 'with room left' picker filter, and fixes Suggest stopping one PlayStyle short of full.",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v41.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  },
  {
    "v": 40,
    "date": "2026-08-14",
    "note": "Counts how many people actually use the tool. On startup it now sends one tiny message to a free, cookie-free counter (GoatCounter) that says nothing except which version just ran - no player, club or account data ever leaves the page, and it's fired last so it can't slow the panel down. It counts once per browser tab session rather than once per click, so rebuilding the panel while testing reads as one use, and my own dev builds report separately from released ones so they don't pollute the numbers. Nothing in the panel looks or behaves any differently. The install page already counted visitors, but visiting the install page isn't the same as using the tool - this is the first time I can see the second number.",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v40.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  }
];
