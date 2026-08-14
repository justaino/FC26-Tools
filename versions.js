window.FC26_LATEST = "javascript:(function(){fetch('https://justaino.com/releases/latest.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();";
window.FC26_VERSIONS = [
  {
    "v": 40,
    "date": "2026-08-14",
    "note": "Counts how many people actually use the tool. On startup it now sends one tiny message to a free, cookie-free counter (GoatCounter) that says nothing except which version just ran - no player, club or account data ever leaves the page, and it's fired last so it can't slow the panel down. It counts once per browser tab session rather than once per click, so rebuilding the panel while testing reads as one use, and my own dev builds report separately from released ones so they don't pollute the numbers. Nothing in the panel looks or behaves any differently. The install page already counted visitors, but visiting the install page isn't the same as using the tool - this is the first time I can see the second number.",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v40.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  },
  {
    "v": 39,
    "date": "2026-07-31",
    "note": "Suggest now picks the PlayStyles that actually raise your score, instead of reading off a fixed list. It works one slot at a time, and it judges each candidate by building the card you WOULD have and scoring that - so a suggestion isn't a guess about the score, it is the score. Three things follow from that. It re-measures after every pick, because what a PlayStyle is worth depends on what's already on the card. It stops as soon as nothing left would move the number, so it won't fill slots for the sake of it - if it picks 5 and leaves 3 basic slots free, those slots genuinely add nothing. And it will spend a PlayStyle+ upgrading a good PlayStyle the card already has when that beats adding a new one, which also hands the basic slot back for it to refill. The big one: if you've set your own PlayStyle weights for a position in Peks Lab, Suggest now follows YOURS. Before this you could rank your whole club by your own weighting and Suggest would still hand you mine. It builds for the role you actually picked rather than whichever role flatters the card, and the status line tells you what it chose and what your score does: 4 PS+, 1 basic, score 40.2 to 89.7",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v39.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  },
  {
    "v": 38,
    "date": "2026-07-31",
    "note": "Fixes the slot counts when you upgrade a PlayStyle you already had. If a card held Finesse and Power Shot as basics and you applied Finesse+, it read as 1 PlayStyle+ and 2 basics - it should be 1 and 1, because applying the + upgrades that slot rather than adding a second one, and gives the basic back. Two things were wrong: the panel briefly held the same PlayStyle as both a basic and a +, and the meters took whichever count was higher, which kept the stale basic. A PlayStyle is now held once, as either the basic or the +, with the + always winning; and while the panel is holding receipts for a card it trusts its own count, since the game's numbers lag both ways after an upgrade. The deck agrees too: the tile flips straight to gold, and the freed basic slot is available again immediately",
    "code": "javascript:(function(){fetch('https://justaino.com/releases/v38.js?t='+Date.now()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(c){(0,eval)(c)}).catch(function(e){alert('Justaino FC Hub could not load: '+e.message)})})();"
  }
];
