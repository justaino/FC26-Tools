# Changelog - Men Gallant FC · Justaino FC Hub

What's changed in each install-page version (`MGFC_Justaino_vN`). Newest first.
Versions are cut with `node release.js "note"` and shown on the install page (`index.html`).

---

## v43 - 2026-08-15

**Fixes the detailed stats showing the wrong numbers.**

- **The bug:** for a player you hadn't already opened in the web app, the new Detailed stats
  section showed the **base card's** attributes instead of the real ones. On an evolved
  player that's wildly out - one of mine read 81 Acceleration in the panel and 97 in the
  game. The giveaway was that the numbers "fixed themselves" the moment you visited that
  player's Attributes screen in the app.
- **Why:** the game doesn't send a card's detailed attributes when your club loads. It
  fetches them per player, the first time something asks. Until then the tool was reading a
  placeholder that happens to be the base card's stats, with nothing to indicate it wasn't
  real. The six face stats were never affected - only the detailed list.
- **The fix:** the panel now asks the game for that card's attributes itself the moment you
  select a player, and redraws when they arrive. No more visiting the player in the app first.
- **It says "Loading detailed stats…" while it waits** rather than showing the placeholder.
  Those wrong numbers looked completely believable, and showing believable-but-wrong is worse
  than showing nothing for a second.
- It's a one-off per player. Come back to the same card and it's instant.
- **If it can't confirm the numbers**, it shows them with a plain warning that they may be
  the base card's, rather than quietly passing them off as correct.
- Clicking quickly through players can't cross the wires either - a late answer for one
  player will never land on whoever you've since clicked on.

---

## v42 - 2026-08-14

**Every stat a player has, not just the six on the front of the card.**

- **New "Detailed stats" section on the player card.** Under the six face stats there's now
  a **▸ Detailed stats** bar. Tap it and you get all **29** underlying attributes -
  Acceleration, Composure, Standing Tackle, Curve, the lot.
- **Grouped the way the game groups them:** the attributes that feed PAC sit under PAC, the
  ones that feed SHO sit under SHO, and so on. I don't decide that grouping, the game hands
  it over, so it's right by definition and it'll follow EA if they ever change it.
- **A ★ marks the card's key attributes** - the handful the game itself singles out as the
  ones that define this player.
- Each attribute gets a small bar and is colour-graded on **the same scale as the face
  stats**, so a number means the same thing wherever you see it.
- **Collapsed by default**, so it never shoves the PlayStyle deck down the page, and it
  remembers whether you left it open. That's remembered separately from the card's own
  "Stats & PlayStyles" fold, so opening one doesn't drag the other along.
- **Works the same on desktop and phone** - two columns where there's width, one where there
  isn't. It's the same component, so the two can't drift apart.
- **Evolved cards show their real, current numbers.** This one nearly bit us: the game keeps
  a second frozen copy of every attribute at the card's pre-evolution values, and reading the
  wrong one would have quietly shown stale stats for every evolved player in the club. Checked
  on an evolved Pirlo, whose Acceleration reads 74 frozen and 93 live. We use live.
- **Note on goalkeepers:** a keeper's detailed numbers don't match the six on the front of
  their card, sometimes by a lot. That is how EA's own data is - it isn't the tool getting it
  wrong, and I've left the real numbers showing rather than hide them.

---

## v41 - 2026-08-14

**The FUTTIES 5th PlayStyle+, a filter that hides full cards, and Suggest finally fills
the last slot.**

- **FUTTIES 5th PlayStyle+ (one-off).** EA now hands out limited evos that add a **5th**
  PlayStyle+ to a FUTTIES card, on top of the normal cap of 4. Pick a FUTTIES player that
  already has 4 PlayStyle+ and a new gold bar appears under the PlayStyle grid listing the
  ones you own. Tap one, confirm, done.
- It works exactly like the **GH 4th** section that was already there, and both now live
  side by side: GH 4th shows for a Glory Hunters card on 3 PlayStyle+, FUTTIES 5th for a
  FUTTIES card on 4. The section stays completely hidden unless the player you've picked
  can actually use it, so it's never in the way.
- Same safety rules as before, deliberately: **one player at a time, always behind a
  confirm, never part of batch apply and never picked by Suggest.** These are one-offs, so
  spending one should take a deliberate tap. The game still has the final say, and if it
  refuses you get the reason.
- The card now reads **5/5** rather than an overflowing 5/4 once the extra one lands.
- **FUTTIES Icon cards are NOT evo-eligible.** They briefly were during testing. They
  aren't, they're out, and the tool no longer offers them anything. Their rarity is still
  spelled out properly as "FUTTIES Icon" instead of "Rarity 139".
- **New "with room left" filter on the player list.** Tick it (next to "Only evo-eligible")
  and any card that's already full - 4 PlayStyle+ **and** 8 basic - drops out of the list.
  A card that's maxed one kind but not the other still shows, because there's genuinely
  something left to give it.
- It's a narrowing of "Only evo-eligible" rather than a filter of its own, so it greys out
  until that one is ticked. Both settings are remembered.
- The list keeps itself honest: fill a card's last slot and it disappears from the list on
  its own, without waiting for the game to catch up.
- **Suggest now fills all 12 slots instead of stopping at 11.** This was a real bug and it
  had been there the whole time.
- **Why it happened:** each role has a list of PlayStyles that count for it, and anything
  not on that list is worth nothing. Suggest stops as soon as the next pick would add
  nothing - which is usually the right behaviour, but it meant the list length was a hard
  ceiling. 36 of the 37 role lists held exactly **11** names, so 11 was all you could ever
  get, no matter how empty the card was.
- **The fix** is the lists, not the code: every role now has **12**, matching the 4 + 8 you
  can actually hold.
- The new lists come from **fut.gg's "Best PlayStyles by Role"**, read at its 4-PlayStyle+
  / 8-base setting, which is exactly our caps. Their roles line up with ours one for one,
  all 37 of them.
- **Nothing was taken away from any role.** Every one of the 37 only gained. 24 of them had
  the important end of the list reshuffled to match fut.gg's priority order.
- Goalkeepers were updated from the same source rather than my guesswork, and all three
  keeper roles gained Incisive Pass.
- One knock-on: because each role now values one more PlayStyle, "full marks" is slightly
  harder, so scores drop by about **1.5%** across the board. It's the same drop for
  everyone, so your rankings and Best XI stay put - the numbers just read a touch lower.

---

## v40 - 2026-08-14

**I can finally see how many people actually use this.**

- Nothing in the panel looks or behaves any differently. This one is entirely behind the
  scenes, so if you don't care how the sausage is made, there's nothing here for you.
- **The problem:** the install page counts visitors, but visiting the install page isn't
  the same as using the tool. Someone can look once and never come back, or use it every
  day for a month and never visit the page again. I had no way of telling those apart.
- **What now happens:** when the panel opens, it sends one tiny message to a free,
  cookie-free counter (GoatCounter) saying nothing except **which version just ran**.
  That's the entire message.
- **What is never sent:** anything about you, your club, your players, your account, or
  what you do in the tool. It can't be, because the message only ever contains a version
  number.
- **It can't slow anything down or break anything.** It's the last thing that happens,
  after the panel is already on screen, it's never waited for, and if it fails it fails
  silently. Worst case, a use doesn't get counted.
- **It counts once per browser tab session, not once per click.** Clicking the bookmark
  five times in a row while you fiddle with something reads as one use, which is the more
  honest number.
- My own test builds report separately from real released ones, so me developing the
  thing doesn't inflate the count.

---

## Install change - 2026-07-31 (applies from v39 onwards)

**The tool now installs on Android.** No new tool version, nothing in the panel changed -
this is purely about how you get it.

- **What was wrong:** the bookmark held the entire tool, about **270,000 characters** of
  code. Desktop and iPhone cope with a bookmark that big. **Android Chrome flatly does
  not** - its bookmark URL field gives up long before that, so the Android instructions on
  the install page were describing something that couldn't actually work.
- **What changed:** the thing you paste is now a **271-character loader**. Its only job is
  to fetch the real tool from the site and run it. Same three install tabs, same steps, just
  a short string instead of an enormous one.
- **You never re-install again.** The loader always pulls the newest published build, so
  from now on a new version reaches you the next time you tap the bookmark. No more copying
  a fresh bookmarklet every time something changes.
- **The install page got much faster on a phone** - the file behind it went from **852 KB to
  under 5 KB**, because it now stores a short loader per version instead of a full copy of
  the tool three times over.
- **It needs a connection to launch.** You're on the FC web app when you use it, so in
  practice this costs you nothing.
- **Already installed?** Your existing bookmark keeps working exactly as it does today - it's
  a complete self-contained copy of that version. It just won't pick up new versions. Grab
  the new one from the install page whenever you fancy, and that's the last time.

---

## v39 - 2026-07-31

**Suggest now picks the PlayStyles that actually raise your score.**

- It used to read off a fixed list I'd written for each role. It now works out, for this
  particular card, which PlayStyles move the number most - and it judges each one by
  **building the card you'd have and scoring that**. A suggestion isn't a guess about your
  score any more, it *is* your score.
- **The big one: if you've set your own PlayStyle weights for a position in Peks Lab, Suggest
  now follows yours.** Before this you could rank your entire club by your own weighting and
  Suggest would still hand you mine.
- **It re-thinks after every pick**, because what a PlayStyle is worth depends on what's
  already on the card. The fifth good PlayStyle is worth less than the first, and it prices
  that in.
- **It stops when nothing left would help.** If it picks 5 and leaves 3 basic slots free,
  that's not it giving up - those slots genuinely add nothing, and it'll tell you the score is
  already maxed rather than spending evos for show.
- **It'll upgrade instead of adding.** When a PlayStyle+ on something the card already has
  beats adding a new style, it takes the upgrade - and since v38 that hands the basic slot
  back, which it can then refill. The status line counts those as "(1 upgrade)".
- **It builds for the role you picked**, not whichever role happens to flatter the card, so
  changing the role genuinely changes the answer. The status line shows what it chose and what
  your score does: `4 PS+, 1 basic - score as CDM / Holding 40.2 -> 89.7`.
- If a suggestion looks wrong to you, that's now a **weighting** you disagree with rather than
  a list I forgot to update - Peks Lab is where to argue with it.

---

## v38 - 2026-07-31

**Fixed: the slot counts when you upgrade a PlayStyle the card already had.**

- If a card held **Finesse** and **Power Shot** as basics and you applied **Finesse+**, the card
  read as **1 PlayStyle+ and 2 basics**. It should be **1 and 1**: applying the + upgrades that
  slot rather than adding a second one, so the basic comes back to you.
- **What was wrong.** Two things, both from the same wrong assumption - that a card can hold a
  PlayStyle as a basic *and* as a +. It can't. The panel briefly held both (it knew the + had
  landed while the game still listed the basic), and the meters took whichever count was higher,
  which kept the stale one.
- **What happens now.** A PlayStyle is held **once**, as either the basic or the +, and the +
  always wins because it's the upgrade. While the panel is holding receipts for a card it trusts
  its own count rather than the game's, because the game's numbers lag in **both** directions
  after an upgrade - too low for what you just added, too high for the basic it gave back.
- **The deck agrees too.** That tile flips straight to gold with a tick, and the basic slot the
  upgrade freed is available again immediately, so you can spend it on something else.

---

## v37 - 2026-07-30

**Peks specifically said that the new icons are ugly AF, such a shame but ah well.**

- The diamonds are gone and **the original square PlayStyle tiles are back**, exactly as they
  were. The **categories stay**, so the deck is still grouped under the six headings with a tally
  of what the card holds in each.

**One tile per PlayStyle, and a tap cycles it.**

- The PlayStyle+ / Basic tabs are **gone**. Tap a tile once to queue the **basic**, twice for the
  **PlayStyle+**, a third time to clear it.
- **A tap can never land somewhere the game would reject.** Any step the card can't take is left
  out of the cycle: a card that already has the basic goes straight to PS+, and when a cap is full
  that kind is skipped entirely.
- **A queued tile says which kind it is** on a strip along its bottom - `BASIC` in cyan, `PS+` in
  gold - so the second tap is never a guess. The line where the tabs used to be spells the gesture
  out too.
- **Nothing is spent until you press Apply**, so a mis-tap costs nothing. Tap again to clear it.
- Reading a tile: a **gold tile with a tick** means the card already has the PlayStyle+, a
  **tinted tile with a tick** means it has the basic, and a faint tile means it hasn't got it.
  A tile you already own stays solid rather than fading, so the deck still reads properly when a
  cap is full.
- **Suggest is untouched.** It picks exactly what it did before - it never used the tabs, it
  writes its choices straight in. The only difference is its picks now light up across the whole
  deck at once instead of being split over two tabs.

---

## v36 - 2026-07-30

**The PlayStyle Deck is now a board, grouped like fut.gg.**

- Every PlayStyle appears **once**, as a diamond, under the same six headings fut.gg uses:
  Finishing, Passing, Defending, Ball control, Physical, Goalkeeping. The category name sits
  above its row, with a tally on the right of what the card holds there (`2+ 3` = two
  PlayStyle+, three basics).
- **Colour tells you everything at a glance.** Gold filled = the card has the PlayStyle+.
  White filled = it has the basic. White with a small gold **+** on the corner = it has the
  basic and the upgrade is still open. Dim = it hasn't got it.
- **A ring is something you've queued** - gold for a PlayStyle+, cyan for a basic. So the rule
  is: a solid fill is always a fact about the card, a ring is always something you're about to
  spend. Dashed and faded means it can't be added right now, because that cap is full.
- **The PlayStyle+ / Basic switch stays, but it no longer changes what you see.** The board
  always shows the whole card; the switch only decides what a **tap adds**, and it's tinted by
  what that costs (gold for PS+, cyan for basic). Switching sides never clears what you queued.
- **This fixes a real trap.** The old Basic tab hid which styles you'd already upgraded to +,
  so it was easy to queue a basic you'd long since passed. Now you can see it.
- Goalkeeping is hidden for outfielders (with a small note saying so). Goalkeepers still see
  every category, because general evos apply to them too, exactly as in the game.
- **Suggest reads better**: its picks light up as rings across the whole board on one screen
  instead of being split over two tabs.
- Nothing about applying changed - same caps, same Suggest, same Apply, same batch.

**Bigger icons, and Intercept's blank icon is fixed.**

- The PlayStyle pictograms are much larger in the new diamonds - 42px diamonds on desktop,
  46px on a phone.
- Basic **Intercept** used to show as an empty diamond. That one's on EA: their own stylesheet
  defines the icon for all 36 PlayStyle+ versions but only 35 of the basics, and the one it
  leaves out is Intercept.
- The panel now checks which icons the game actually defines and, where one is missing,
  **borrows the other version of the same PlayStyle** - the same picture, so nothing looks odd.
  It covers every icon in the panel, not just the deck, and if EA ever add the missing one we
  pick theirs up automatically.
- Console, if you're curious: `FC26.iconCheck()` lists any icons the game doesn't define and
  what we're drawing instead; `FC26.checkBoard()` proves all 36 PlayStyles are on the board
  exactly once.

---

## v35 - 2026-07-30

**Applied PlayStyles now show up instantly, every time.**

- The bug: you applied a PlayStyle, it worked, and the little capacity meters on the card didn't
  move. It came and went, and it hit players from deep in the club list most.
- **What was actually going on, and it wasn't our code.** EA run Evolutions and your club as two
  separate services. The PlayStyle is granted immediately, but the club side publishes it **when it
  feels like it**, sometimes minutes later. The panel used to ask "what does this card have now?"
  and draw whatever came back, so if it asked before EA had caught up, you got the old numbers.
  Whether it worked was down to timing, which is why it felt random.
- **What happens now: the panel keeps its own receipts.** When an apply call comes back successful,
  we already know exactly which PlayStyle just landed, so there's nothing to ask anyone. The panel
  notes it down and shows it straight away. The meters, the chips, the PS+ icons in the Lineup, the
  ✓ on the tile you just used, the caps and your Justaino Score all read the same combined picture:
  what the game says, plus what we know we did.
- Receipts look after themselves. One tears itself up the moment the game's own copy of the card
  finally shows that PlayStyle, so nothing is ever counted twice. Reverting a card's evos throws its
  receipts away, because that card has gone backwards.
- Receipts survive a **Reload club** and a bookmarklet update, so a refresh can't lose them.
- **Applying is quicker too.** The old "Waiting for the grant to register..." step, which re-loaded
  your whole club up to four times after every apply, is gone - it never actually reached the
  servers, and the receipts make it pointless.
- One safety net kept: if the game replies with a copy of the card carrying **fewer** PlayStyles than
  it had before (their data lagging), the panel refuses it rather than accepting a card that just
  lost PlayStyles.
- Console, if you're ever curious: `FC26.applied()` lists PlayStyles the game hasn't caught up with
  yet, `FC26.clearApplied()` forgets them and shows only what the game itself reports. Seeing entries
  in `FC26.applied()` is normal and healthy.

---

## v34 - 2026-07-30

**Applied PlayStyles no longer disappear from the Lineup.**

- This was the "I applied it, it worked, but the card doesn't show it" bug. It happened on desktop
  too, just less often, and it was pure timing, which is why it came and went.
- **What was going wrong:** the game serves your club **from its own memory**, and that copy can
  still be the card as it was *before* your evo landed. Our club load ended by replacing the whole
  list in one go, so any stale copy silently overwrote the freshly-evo'd card we'd just saved. The
  background club load that runs when the panel opens is slow (slower on a phone), so whether it
  finished before or after your apply was a coin toss.
- **What happens now:** whenever the server hands back an updated card in reply to one of our own
  applies or removals - the most trustworthy copy there is - it gets **pinned**. Every club load
  merges those pinned cards back over its results, so a stale copy can't undo a change we know
  happened. A pin retires itself once the game's own copy catches up, or when a full load shows the
  card has left your club.
- Two club loads can no longer race each other either: a second one now joins the first instead of
  starting a rival sweep. And the panel was **starting two full club sweeps on every run** from a
  duplicated block of code, which is now gone.
- Console escape hatches if a pinned card ever looks wrong: `FC26.fresh()` lists what's pinned,
  `FC26.clearFresh()` forgets them all.

**The phone flow now matches the desktop one.**

- **Two tabs instead of three.** "PlayStyle Deck" and "Review" are merged into one **Build & Apply**
  tab. It holds the same spotlight card, the same PlayStyle grid and the same Apply button, in the
  same order, as the right-hand pane of the desktop dock - the very same on-screen pieces, not
  phone-only copies of them.
- **Why it needed doing:** the deck and the Apply button were on separate screens, Review was locked
  until you'd ticked something, and each screen had grown its own little summary bar showing the
  same rating and caps in a different shape. That's what made it feel scattered.
- **No more locked tab.** You can open Build & Apply whenever you like; the Apply button stays greyed
  out until something is ticked, exactly as on desktop.
- On a phone the card's **stats and PlayStyle chips fold away** behind a "▾ Stats & PlayStyles"
  toggle so the tiles stay in reach, and it remembers your choice. Desktop shows everything as before.
- **Remove Latest Evo / Clear all evos** now sit on the card itself instead of hidden behind "Manage
  this card", and the "← Back to players" button is gone - the Lineup tab is one tap away.

**"↻ Reload club" finally looks like it's doing something on a phone.**

- The button was working the whole time; you just couldn't see it. Its progress was being written to
  a status line that, on mobile, **only existed on the Review step** - so on the Lineup step it was
  updating an element that wasn't on screen.
- The button is now the progress bar: a spinner and a live count (`⟳ Loading… 320`), and it can't be
  tapped twice. Under it, a status line in the Lineup shows the same thing.
- A reload of an already-loaded club comes back in a fraction of a second, so it used to flash past
  unseen. The spinner now holds for a beat, then a **"✓ Club loaded - N players"** confirmation
  lingers before settling back.

**For maintenance:** `node minify.js` now stamps a **BUILD ID** (`dev-a1b2c3`, a fingerprint of the
code) into the build and prints it. The panel's header badge shows the same id, so a cached copy
can't pass itself off as the latest. Copy the file with `pbcopy < bookmarklet.txt`, never out of the
editor. `FC26.diag()` reports the running build plus what's actually on screen.

---

## v33 - 2026-07-27

**PEKUN, THE LAST TWO UPDATES HAVE BEEN JUST FOR YOU OOO**

**Best XI depth-chart squads no longer share players.**

- **No player appears twice across the chart now**, starters or bench. Before, only the starting XIs
  were kept apart: each bench was drafted from "the whole club minus *this* team's 11", so Team 1's
  bench was basically Team 2's spine, and Team 2's bench could pick **Team 1's starters**. Creating
  Team 1 and Team 2 in game gave you two squads fighting over the same cards.
- **How it picks now:** all the XIs are drafted first, then every team's bench comes out of one
  shared pool of what's left, **Team 1 first, then Team 2, then Team 3**. The chart is ranked, so
  your best squad also gets the best bench.
- **Expect Team 1's bench to look weaker than it did.** Nothing is missing: the players that used to
  sit on Team 1's bench are now Team 2 and Team 3 starters instead. Later teams also run out of
  cover for a required spot more often, which the page already tells you about under the bench.
- **If you want Team 1's strongest possible bench, set the team count to 1.** Showing 3 teams
  reserves players for 3 teams whether you create them or not.
- The bench heading now reads **"no player used twice"** instead of "next best" when more than one
  team is on screen.

**"Score Customiser" is now "Peks Lab".**

- Same feature, same settings, new name. Nothing you've saved is affected and every dial stays
  exactly where you left it.
- The pill on the Justaino Score page, the page header, and the website guide all follow. On a
  phone the button now reads "Peks Lab" too, instead of shortening to "Customise".

---

## v32 - 2026-07-27

**Gauntlet squads now follow the score instead of leaning on OVR.**

- **The Squad Builder draft is now led by the Justaino Score (or your own).** It used to blend 60%
  raw OVR into its picks; that's now **10%**, just enough to give the better card the shirt when two
  players are genuinely level. Expect high-rated cards with few useful PlayStyles to lose their
  place to better-kitted ones, especially icons.
- **Why it changed:** the 60% was set back in v20 to stop icons being benched - but at that time the
  score itself already carried 35% OVR, so 60% really meant about 74%. The score's OVR has since
  been cut twice (down to 1%), and this number was never revisited. Measuring a real 546-player club
  showed the "60%" was actually behaving like 47%, because what moves a ranking is how much the
  numbers *spread*, not the label on the dial.
- You can still set this yourself in **Score Customiser → Advanced → Squad Builder draft**. Turn it
  up if you'd rather the builder simply started your strongest cards.
- The Score Customiser guide on the website has been updated to match, including a worked example
  of why this particular dial reads higher than it behaves.

---

## v31 - 2026-07-27

**Advanced tuning: set the stat weights per position, and say exactly which PlayStyles matter.**

- **New Advanced section** in the Score Customiser (folded away until you want it).
- **Stat weights, one position at a time.** Pick a position, then a slider per stat - so you can
  decide that pace matters more at CB, or that passing carries your CDMs. Each slider shows my
  original number next to yours. Keepers get their six GK stats instead, and correctly don't get
  skill moves or weak foot. Positions you've edited are marked with a **•**, and each has its own
  "Reset this position to Justaino".
- **Your own PlayStyle list per position - the big one.** Until now you could only change *how much*
  PlayStyles counted, not *which* ones. Now you can take a position over and set a weight for each
  PlayStyle yourself, add any PlayStyle that isn't there, and remove ones you don't rate. It starts
  seeded with the numbers that position already uses (the same table the "How the score works" page
  shows), so you adjust rather than start from nothing.
  - A position with your own list **stops scoring by best-fitting role** - your list is the whole
    story for it, and anything not on it is worth nothing there. "Score CB by role again" hands it
    back whenever you want, and other positions are unaffected.
  - Keeper-only PlayStyles are only offered for GK.
- **Role priority curve.** Each role has a priority-ordered list of PlayStyles; these four numbers
  are how much credit each rank earns. Steepen it so only a role's top couple really count, or
  flatten it so anything relevant counts.
- **Squad Builder draft blend.** Gauntlet squads deliberately lean on OVR rather than the score
  alone, which is why they move less than the rankings when you retune. You can now set how much.
- **Fixed:** pressing a button deep in the settings (add a PlayStyle, take over a position) jumped
  the page back to the top. It now keeps your place.

---

## v30 - 2026-07-27

**See who your tuning actually moves, and the rest of the hub now says which score it's using.**

- **New "Who this moves" card** in the Score Customiser, under the dials. It shows your top 6 at a
  position and re-sorts **live as you drag**, with green ▲ / red ▼ arrows for how many places each
  player has moved against the Justaino order. Pick any position from the dropdown. This turns
  tuning from guesswork into a decision you can see.
- **Every screen now names the score it's using.** With your own weighting active, the score pill on
  a player card reads "MY SCORE 91.2 · ST", the Lineup tile and the page title say **My Score**, and
  the rankings note tells you the live mix ("by My Score - stats 75%, PlayStyles 25%...").
- **Squads you create say which score built them.** A squad drafted on your weighting saves in game
  as **"My Score Squad N"** instead of borrowing mine. Remove still catches both kinds, so older
  "Justaino Score Squad" ones still clean up, and the numbering counts both so you never get two
  Squad 2s. Your own squads and Gauntlet squads are never touched.
- **New: your score at every position, on the player card.** The breakdown that was only on the
  rankings detail view now also shows on the Lineup player card (and in the mobile stats drawer).
  Handy because the pill only ever shows a player's *best* position - a card can be a middling CM
  and an excellent CDM, and you'd never have seen it.
- **Fixed:** the Rankings player detail still said "Justaino" while everything else said "My Score".
  All three views now read from one shared block, so they can't drift apart again.
- **Fixed:** changing your scoring and going back to Best XI showed the *old* XIs under the new
  name, because that page reuses its last draft. It now redraws properly.

---

## v29 - 2026-07-26

**New Score Customiser: rank your club by your own weighting instead of mine.**

- **A 🔧 Score Customiser button** now sits at the top right of the Justaino Score page (it reads
  "Customise" on a phone). It opens a page where you set your own scoring numbers. Nothing was added
  to the Lineup column - these settings belong with the score they change.
- **Two scores, never both at once.** One switch at the top chooses between the **Justaino Score**
  (mine, still the default) and **My Score** (yours). Whichever is active is used by everything:
  Rankings, Best XI, the Squad Builder draft and the score on a player card. Flipping the switch
  doesn't delete your tuning, so you can compare yours against mine freely.
- **Four presets to start from:** Justaino baseline, Stats purist, PlayStyle maxxer, and OVR
  respecter (which ranks closer to the card's OVR, the way the hub did before v28).
- **Balance slider** - how much of the score comes from raw stat fit versus owning the right
  PlayStyles for the role. The two always add up to 100.
- **Three dials** - how hard the score leans on OVR, how many basic PlayStyles a PlayStyle+ is
  worth, and how many relevant PlayStyle+ "full marks" assumes. Each one tells you my baseline
  value, so you can see how far you've moved from it.
- **Everything applies and saves as you drag it** - there's no Save button. Closing the page drops
  you back on the rankings, already re-sorted. **Reset to Justaino** wipes your values and switches
  back, behind a confirmation.
- **You always know which score you're looking at:** the 🔧 button gains a glowing ring and the page
  shows a "Custom" chip whenever your own weighting is active.
- If the browser's storage is full (the EA web app fills it with its own console history), the page
  now tells you plainly that your settings can't be saved, and how to free space up.
- **Fixed:** rotating a phone with the Club Dashboard open used to dump you back on the main panel
  while the page still thought it was open.

---

## v28 - 2026-07-26

**The Justaino Score barely looks at OVR any more - it's now a pure tiebreak.**

- **OVR now counts for 1% of the score, down from 15%.** The rating is 99% about how a card actually
  fits the position (stat fit + owning the right PlayStyles for the role) and 1% about the number on
  the front of the card. In practice OVR can now only separate two players whose fit is otherwise
  level - it can never lift a marquee high-OVR card above one that genuinely suits the role better.
- **What you'll notice:** high-OVR cards with mediocre face stats slide down the Rankings, and
  well-built cards with the right PlayStyles climb. Best XI and the pitch follow the same order.
  Hover a ranking row and the tooltip now reads "blended 1% with OVR".
- The Squad Builder's own draft is unaffected - it uses a separate, deliberately OVR-heavy blend so
  Gauntlet squads still lean on raw ratings.
- The public "how the Justaino Score works" page (meta-rating.html) was regenerated to match, so the
  formula, the OVR tiebreak figure and the worked example all show the new numbers.

---

## v27 - 2026-07-24

**New Club Dashboard page: player stats and fun facts about your whole club, at a glance.**

- **A new "Club Dashboard" tile** (🏟️) sits in the Lineup column next to Justaino Score and Squad
  Builder. It opens a full-screen page that reads your loaded club and shows six read-only cards. It
  never creates or changes anything in game - it's purely a read-out.
- **Hero strip** - the top-line numbers: how many Players, your Avg OVR (in gold), and how many
  Nations, Leagues and Icons you own.
- **Club records** - a standout player per stat: Fastest (PAC), Strongest (PHY), Sharpshooter (SHO),
  Playmaker (PAS), Magician (DRI), The Wall (DEF), plus your Highest OVR card and your Top Justaino
  Score card. The six face-stat records use outfield players only (keepers read a different set of
  stats, so they can't win those); Highest OVR and Top Justaino Score include everyone.
- **Rating spread** - a small histogram of how many cards you own in each OVR band (90+, 85-89,
  80-84, 75-79, under 75), with the 90+ band in gold.
- **Squad DNA** - your club's average of each outfield face stat (PAC/SHO/PAS/DRI/DEF/PHY) as bars,
  plus a plain-English read of your two strongest areas and softest one.
- **Position depth** - how many players can fill each position (ST, RW/LW, CAM, ..., GK). Any spot
  with fewer than 5 players who can cover it is flagged amber so thin cover reads at a glance.
- **PlayStyle insights** - total PlayStyle+ across the club, your most common PlayStyle+, your
  most-kitted card, and how many cards have no PlayStyle+ yet.
- Everything is mobile-friendly (the hero drops to three across, records stack to one column, chips
  wrap) and follows whichever colour theme you have selected.

---

## v26 - 2026-07-24

**Create your Best XI as a real squad (with a proper bench), search the rankings, and FUTTIES support.**

- **Create a squad straight from the Justaino Score → Best XI page.** Under the pitch there's now a
  bench preview plus **Create / Remove** buttons. Create saves the XI you're looking at as a real
  in-game squad named **"Justaino Score Squad N"**, in the formation shown. Your active squad is
  never touched, and **Remove Justaino Score squads** deletes them again (separate from the
  Gauntlet remove - each only touches its own squads).
- **The bench is built for you as the next-best cover.** After the starting XI, it guarantees one
  each of **ST, LM, RM, CM, CB and LB/RB**, then fills the last sub with your best remaining
  player - all drafted from the players left after the XI. If your club is thin at a spot, it says
  so and uses your next-best there instead.
- **Works for the depth chart too.** Viewing Team 2 (your 2nd-best XI) and hitting Create makes
  that squad with its own bench; Team 3 the same, and so on. Players can repeat across teams by
  design (a Team 1 bench player can start for Team 2).
- **Search a position ranking by name.** On the Rankings view there's a new search box: while on,
  say, ST it finds a player (e.g. "Garnacho") and shows them at their **true rank** even if they're
  outside the top N. Players who can't play the chosen position don't appear. Accent-tolerant.
- **FUTTIES cards are now recognised and evo-eligible.** Added rarity **16 = FUTTIES** to the
  rarity list and the eligible set (it turns on automatically for existing installs, once).

## v25 - 2026-07-24

**PlayStyle+ cap raised to 4, and the tool is now "Justaino FC Hub".**

- **You can now apply up to 4 PlayStyle+** (was 3) per player, matching EA's change to the
  game. The picker, the "PS+ cap reached" message, and the preview capacity meter all follow
  the new limit; Basic PlayStyles stay capped at 8.
- **Suggest now pre-ticks the top 4 recommended PlayStyles as PS+** (was top 3), taken in
  priority order from each position/role list. No other Suggest behaviour changed.
- **Renamed everywhere to "Justaino FC Hub"** (was "Justaino FC Web App Tool"): the panel
  header, the install page, the Features and Justaino Score/meta pages, and the docs.
- Note: the one-off **"GH 4th PlayStyle+"** section still targets Glory Hunters cards with
  exactly 3 PS+ and is unchanged pending an in-game check of how it behaves under the new cap.

## v24 - 2026-07-16

**The Justaino Score gets its own page - with a best-XI pitch - and finally shows on mobile.**

- **"Meta rating" is now "Justaino Score", and it has its own full-screen page.** The old
  cramped drop-down inside the Lineup column is gone. In its place is a **Justaino Score** tile
  (next to Squad Builder) that opens a full page with two tabs:
  - **Rankings** - the same per-position club ranking as before (pick a position + how many to
    show), just with room to breathe and its own scroll.
  - **Best XI** - your **strongest XI on a pitch** for any formation, picked by Justaino Score.
    A "Top N" control adds a **2nd, 3rd, ... XI as a depth chart** (each team uses the best
    players left after the ones above it, so nobody appears twice). Each dot shows OVR, name and
    JS score; a stat strip shows the team's **JST avg**, OVR avg, placed count and biggest league
    bloc. It's **view-only** - nothing is created in the game (that's still the Squad Builder's job).
- **Tap any player for a full detail card - without leaving the page.** Tapping a ranked row or a
  pitch dot slides to a player detail card (big score, a **JST Score by position** breakdown, face
  stats and current PlayStyles). The back arrow returns you exactly where you were (Rankings or Best
  XI). An "Edit PlayStyles" button is the one deliberate door into the evo tool. Before, tapping a
  player quietly jumped you into the PlayStyle Deck behind the page - that's fixed.
- **Your Justaino Score now shows on mobile.** On a phone, tapping a player shows the score as a
  pill directly under the big OVR number (in both the PlayStyle Deck and the Review step), matching
  what desktop always showed. It was missing on mobile before.

---

## v23 - 2026-07-12

**Applied and removed evos now show up straight away, on desktop and mobile.**

- **The player list and preview refresh instantly after an apply.** Before, applying an evo
  sometimes left the card looking unchanged until you hit "↻ Reload club" (and on the phone it
  often didn't update at all). The tool was relying on the app's club search to hand back fresh
  data, but that search caches the whole club in memory and kept serving the old, pre-evo copy.
  Now the tool reads the freshly-graded card straight out of the apply response itself, so the
  new PlayStyles appear the moment the apply finishes - no manual reload.
- **Same fix for batch apply and for removing evos.** Batch apply updates every touched card,
  and "Remove Latest Evo" / "Clear all evos" revert the card on screen right away, all from the
  service response instead of a re-search.

---

## v22 - 2026-07-12

**Meta rating tuned for the new FC 26 PlayStyles, lighter OVR, and a smarter, forgiving player search.**

- **Gamechanger and Inventive now count.** These new FC 26 PlayStyles (finishing flair and creative
  passing) were barely weighted, so cards that own them were under-rated. They're now weighted as
  solid mid-tier PlayStyles on the attacking and creative roles that actually want them (strikers,
  wingers, CAM, and playmaker midfielders) - and left off the defensive roles, matching the meta.
- **OVR now matters less.** The final score used to be pulled 35% toward a card's in-game OVR; that's
  down to 15%, so the rating leans much harder on the stats and PlayStyles that decide how a card
  actually plays. A high-OVR card with weak face stats no longer coasts on its number.
- **Player search ignores accents and matches first OR last name.** Searching "guler" now finds
  Güler, "mbappe" finds Mbappé, and typing just a first name works too. No more empty results because
  of a special character.
- **Rarity 103 is named.** Cards of that rarity now read "Festival of Football: National Pride Red"
  instead of "Rarity 103".
- **The "How the meta rating works" page is now fully honest.** It's rebuilt from the same role tables
  the tool actually scores with, and each position now has a "By role" breakdown you can click open to
  see the exact ordered PlayStyle weights. The Maradona worked example uses his real figures
  (stat 92.5, PlayStyle 83.3, final **89.3** at the new 15% OVR).

---

## v21 - 2026-07-11

**Per-squad formations in the Squad Builder.**

- **Each Gauntlet squad can now use its own formation** (Squad 1 = 4-3-3, Squad 2 = 4-2-3-1, Squad 3 =
  3-5-2, and so on) instead of all sharing one. The draft still runs across all squads at once with the
  same no-overlap and OVR-aware logic, so no player ends up in two squads.
- **How to set them:** the top **"All"** formation picker sets every squad at once (a quick default),
  then each squad overrides its own - on desktop via a dropdown on each squad tab, on mobile via a
  "Squad N formation" dropdown under the number pills. The pitch, the depth check, and the "Create in
  game" step all respect each squad's own formation.

(Also, off the tool: the "How the meta rating works" page now has a worked Maradona-at-CAM example, and
its numbers were corrected to match what the tool actually shows - 91.1.)

---

## v20 - 2026-07-11

**Squad Builder now starts your best cards (icons included) and shows a real squad OVR.**

- **The draft is OVR-aware.** It used to rank purely by the Justaino Score, which leans on meta
  PlayStyles - so a strong card with few PlayStyles (an icon like Maradona especially) could get
  benched behind a lower-rated but meta-kitted card. The draft now ranks by a blend of in-game OVR
  and the Justaino Score, weighted toward OVR, so your best players start while position/role fit and
  chemistry still break near-ties. The Meta rating tab is unchanged.
- **Icon chemistry is modelled correctly.** In FC 26 an icon gives full chem itself and lifts
  EVERYONE: it counts toward every league (not just other icons) and double toward its nation. The
  builder now recognises icons (every icon shares the hidden "icon league") and scores them that way,
  so icons stop being passed over for "no chem" and same-league/same-nation teammates get their boost.
- **"XI avg" now shows the squad's average OVR** (a normal FUT-looking rating) instead of the average
  Justaino Score. The per-player "JS" number and the disc colours on the pitch still reflect the
  Justaino Score.

---

## v19 - 2026-07-11

**Meta rating tuning, an evolved-stats fix, and a couple of lineup touches.**

- **Evolved players now score and display their REAL stats.** The game freezes the plain `attributes`
  array on a card at its pre-evo (base) values and keeps the live evolved face stats behind a method
  (`getAttributes()`). The tool was reading the frozen array, so an evo'd card (e.g. a 95 Mainoo whose
  real stats are 92/89/94/95/95/95) was being scored and shown with its old base numbers. It now reads
  the live evolved stats, so both the Face-stats grid and the stat half of the Justaino Score are correct.
- **Meta rating re-tuned** so marquee cards land where you'd expect: in-game OVR now carries **35%** of
  the score (was a light tiebreak), a PlayStyle+ counts **3.5x** a basic (was 2.5x), and the "full marks"
  PlayStyle ceiling rewards up to **5** relevant PlayStyle+ - so a card with five useful PS+ genuinely
  out-scores one with three instead of both maxing out.
- **Every lineup row shows the player's primary position** as a small badge next to their name (ST, CB,
  the correct RB/LB or RW/LW side, GK in the accent colour) - not just goalkeepers.
- **On desktop, the player list now tucks away** (to a "tap to show" stub) when you open Meta rating or
  Manage eligible rarities, just like it already did on mobile, so the open panel gets the room.

---

## v18 - 2026-07-11

**Smarter Meta rating (v2): role-aware, PlayStyle-led, and honest about card quality.**

The "Meta rating" (rank my club by position) was rebuilt so the numbers reflect how a card actually
plays, closer to how fut.gg's GG Rating thinks:

- **Scored at the ROLE level, not just the position.** Each card is now judged against its *best-fitting
  role* (Poacher vs Target Forward, Winger vs Inside Forward, ...) using the same role lists Suggest
  uses, then the top-scoring role is shown. Hover a row to see which role it picked.
- **PlayStyles lead, then stats, with a light OVR nudge.** A PlayStyle+ now counts **2.5x** a basic
  PlayStyle, and **every** meta basic a card owns is counted (no more cap at three). Stats still matter
  and are weighted per position (defending barely counts for a striker, heavily for a centre-back).
  In-game OVR is only a small tiebreak - deliberately minor, because a 97 with poor face stats plays
  nothing like a 97.
- **Weak foot + skill moves** now feed the rating (they read from the card when the app exposes them),
  weighted more for attackers than defenders.
- **Scores carry one decimal** (e.g. 88.4), so cards that used to tie on a whole number now separate,
  and the PlayStyle ceiling was raised so a stacked card no longer flatlines at 100.

Net effect: your best cards rank where they should - a marquee playmaker tops the CAM list, purpose-built
finishers top the ST list - instead of a mid card with the "perfect" three stickers leaping the queue.

---

## v17 - 2026-07-11

**Mobile minimize fix + a new name.**

- **Minimize now works on the phone while the Squad Builder is open.** Before, tapping the minimize
  ( - ) button with the builder open only "half closed" the panel: the contents hid but the tall
  sheet stayed, because the builder's full-height styling was overriding the little pill. Minimize
  now always collapses to the small draggable pill in the bottom-right, builder open or not.
- **Renamed to "Justaino FC Web App Tool"** (was "Justaino PS Tool") everywhere it shows: the panel
  header, the install and features pages, and the Meta Rating page. Old published versions keep the
  old name in their history; new versions carry the new one.

---

## v16 - 2026-07-11

**Squad Builder: every real formation, correct left/right, and squads that always create.**

- **All the game's formations, in a dropdown.** The builder no longer offers just four hardcoded
  shapes - it now reads the game's own formation list, so you get every formation the game has
  (~29), including **both** 4-2-3-1s (the RM/CAM/LM one and the three-CAM one), the four 4-3-3
  variants, 4-4-1-1, the 5-at-the-back shapes and more. Pick from a tidy dropdown; the pitch and the
  squad it creates now match exactly what the game expects for that formation.
- **Wingers and full-backs go on the correct side.** A left-back slot only takes a player who
  actually plays the left (and the same for RB/LB, RM/LM, RW/LW). A player who plays both sides is
  still eligible for either. If you're short on one flank (e.g. no left-backs), the builder now says
  so instead of quietly putting someone on the wrong foot.
- **No more "1 squad failed" on Create.** Three things that made the game reject a squad are now
  handled: **loan players** (both the match-count kind and timed/expiring loans like a short-term
  Icon loan) are left out of the builder; the **same player is never put in one squad twice** (even
  two different cards/ratings of him - e.g. a 95 and a 92 Courtois); and a squad that hits a
  transient hiccup is retried automatically. Different squads can still each use that player.

---

## v15 - 2026-07-11

**The Gauntlet builder is now a full-screen pitch.**

- **Squad Builder** is its own screen now. Open it from the **⚽ Squad Builder** button under the
  player list (Lineup), and leave it with the **‹** back arrow. No more cramped dropdown.
- The centrepiece is a **football pitch**: one dot per player, placed by formation. Each dot shows
  the player's OVR on a coloured disc (tinted by their Justaino score - brighter = better), their
  name, and the position with the Justaino score under it. Empty slots show as a dashed open spot.
- **Switch between squads** with tabs on desktop or number pills on mobile, and the pitch animates
  the players into their new spots.
- A **stat strip** (XI average, players placed, and the biggest league/nation cluster) sits beside
  the pitch on desktop, or as a one-line summary on mobile. The **bench** (7 subs) is listed too,
  collapsible on mobile to keep the pitch big.
- **Create in game** and **Remove Gauntlet squads** work exactly as before (same confirm dialogs
  and safety), now with a proper progress bar and a success/failed toast instead of a plain status
  line.
- The mobile panel now holds a comfortable minimum height so it never collapses into a thin sliver.

---

## v14 - 2026-07-10

**Create Gauntlet squads in the game (and undo them in one tap).**

- The Gauntlet builder now has two new buttons under the squad cards: **Create in game** and
  **Remove Gauntlet squads**. This is the first thing the tool ever *creates* on your account.
- **Create in game** turns the built squads into real saved squads named **"MGFC Gauntlet 1",
  "MGFC Gauntlet 2", ...**. It shows a confirm dialog listing exactly what it will make, checks
  the 30-squad limit first, and reports progress and a done/failed count. It **never touches your
  active squad** and never makes a new squad active.
- **Remove Gauntlet squads** deletes every squad named "MGFC Gauntlet ..." - found by scanning
  your live squad list, so it works even on a different device and even after the game renumbers
  squads. Your own squads (any other name) are never touched. The button shows how many exist.
- Under the hood it drives the app's own squad service (`services.Squad.create` / `.remove`), the
  same one the web app's Squads screen uses.

---

## v13 - 2026-07-10

**Gauntlet squad builder (display only).**

- New **▸ Gauntlet squad builder** section under the player list (below Meta rating). Pick a
  formation (4-3-3, 4-4-2, 4-2-3-1 or 3-5-2) and how many squads (3, 4 or 5), then **Build**.
- It drafts that many complete squads from your club with **no player shared** between them:
  11 starters plus 7 subs each (18 per squad), each slot filled by the best available player
  for that position on the Justaino rating (a snake draft, so the squads stay balanced).
- **Depth check first:** if your club cannot fill that many full squads it tells you exactly
  which positions are short and builds nothing, instead of making broken teams.
- Each squad shows its starting-XI average, its bench, and a light **chem clusters** line
  (how many players share a league or a nation). Tap any player row to spotlight that card.
- This is **display only** - it does not create or change anything in your game. (Creating
  these squads in the web app for real is the next feature.)

---

## v12 - 2026-07-10

**Crash fix.**

- Guarded `currentMode` on load so the panel can no longer crash while it is still working
  out whether to show the desktop or mobile layout.

---

## v11 - 2026-07-10

**Safer eligible-rarity manager: nothing changes until you Save.**

- The bulk **Tick shown / Untick shown** buttons are gone (too easy to wipe your whole
  eligible list by accident).
- Ticking or unticking a rarity now **stages** the change instead of applying it: the row
  is flagged **will add** / **will remove** and a bar appears with **Save changes** and
  **Cancel**. Your real list only updates when you press **Save**; **Cancel** discards the
  lot. The "(N)" count on the button doesn't move until you Save.
- New **Update to OG list** button stages a reset back to your original seed list, which you
  then Save (or Cancel) like any other change.
- The preview card's **Mark eligible** and learn-on-apply are single, deliberate actions, so
  they still apply straight away.

---

## v10 - 2026-07-10

**Mobile Lineup: more room for the panels you open.**

- On a phone, opening **Meta rating** or **Manage eligible rarities** used to leave the
  player list squashed above/below it, making the open panel hard to scroll.
- Now, opening either one **folds the player list to a single line** ("Player list hidden
  - N players, tap to show"), giving the panel the full height. **Tap the stub** to peek the
  list back, or **close the panel** and the list returns on its own.
- Desktop is unchanged: the list and an open panel show together.

---

## v9 - 2026-07-10

**Viewing and applying PlayStyles, made clearer on both phone and desktop.**

### Face stats everywhere the card shows
- The player's six **face stats** (PAC / SHO / PAS / DRI / DEF / PHY, or the six GK stats
  for keepers) now appear on the **desktop spotlight** card, so the middle pane no longer
  looks empty, and they ride along when the dock narrows to two panes.
- They come straight off the card's own numbers (the same ones the Justaino rating reads),
  so they can never be out of step, and each value is colour-graded so a strong stat reads
  at a glance.

### Resize the panel from any side
- The floating desktop panel can now be dragged bigger or smaller from **any edge or
  corner**, not just the bottom-right. The opposite side stays pinned, and the size and
  position are remembered.

### Mobile: a tidier build-and-apply flow
- The **PlayStyle Deck** tab has a slim summary bar at the top: rating, name and caps, with
  a **stats** toggle that folds out the capacity meters plus the six face stats, so you can
  read the player without leaving the deck. It remembers whether you left it open.
- The old pinned mini-spotlight at the bottom was removed (it just repeated that summary).
- The **Review** tab no longer repeats the whole card. It now shows exactly **what you are
  about to apply** (the ticked PlayStyles, split PlayStyle+ / Basic) and a **Manage this
  card** fold-out with the eligibility toggle and the Remove / Clear-evo buttons.

### Apply and Review gating
- **Apply selected** is now **disabled when nothing is ticked** (on both mobile and
  desktop), instead of doing nothing.
- You can now open the **Review** tab for a card that **already has PlayStyles** even with
  nothing newly ticked, so you can go there just to review or remove them.

---

## v8 - 2026-07-10

**The Meta rating ("Justaino Score") - my own 0-100 player score.**

### A score per player, per position
- Every player now gets a **0-100 rating** for each position, worked out entirely from
  their **real stats and PlayStyles** (no external data or player database).
- It shows as a green **`JUSTAINO xx · <pos>`** pill under the OVR on the preview card
  (the player's best position), and as a new **▸ Meta rating** list under the player
  picker that ranks the players in your club who can play a chosen position, best first.
- Each row shows the score split as `stats + PlayStyles`, so you can see why.

### How it's scored
- **Stats** are a weighted average tuned per position (shooting for strikers, defending
  for centre-backs, and so on), and **PlayStyles** add points for the meta ones a player
  owns - a **PlayStyle+ counts double**. The two blend 70/30 (stats/PlayStyles), so a
  card with elite stats but none of the meta PlayStyles tops out around 70, and only a
  near-perfect card approaches 100.
- The PlayStyle weights are seeded from the current FC 26 meta consensus and are meant to
  be re-tuned each season.

### Full transparency page
- A new **"How the meta rating works"** page on the site (`meta-rating.html`, linked from
  the install and features pages) lays out **every weight for every position**. It's
  generated straight from the tool's own tables, so it can't drift out of sync.

---

## v7 - 2026-07-10

**4th PlayStyle+ support (the limited "GH 4th" Glory Hunters evos).**

### Caps now show the real number
A card that already has a 4th PlayStyle+ shows `PlayStyle+ 4/4` in the preview and the
mobile mini-spotlight, instead of a broken `4/3`. Normal cards are unchanged (3 PS+ / 8
basic).

### Apply a GH 4th PlayStyle+ from the tool
- Select a **Glory Hunters card that already has exactly 3 PlayStyle+** and a gold **"GH
  4th PlayStyle+ (one-off)"** section appears in the PlayStyle Deck.
- It lists your available GH-4th evos (one chip per PlayStyle+). Tap one, confirm, and it
  adds that PlayStyle+ as a **4th** to the player.
- Safeguards: it **only shows for eligible cards**, is **never part of batch apply or
  Suggest**, and **every apply is confirmed** (these evos are one-offs). The game still
  has the final say on eligibility.
- The list **loads by itself** (no need to open Evolutions -> Rewards first) and
  **refreshes after each apply**, so new GH-4th evos appear.

---

## v6 - 2026-07-10

**Complete rarity list for evo-eligibility.** The tool now reads the game's own full
rarity table (about 128 rarities) when it starts, so you can choose which rarities count
as evo-eligible from the **whole named list up front**, instead of only the ones you'd
happened to apply to before.

### Manage eligible rarities
- A new **▸ Manage eligible rarities (N)** button under the "Only evo-eligible" row opens
  a searchable checklist of every rarity, by name.
- **Tick / untick** a rarity to add or remove it - it saves instantly and updates the
  filter. Type in the **filter box** to narrow by name or id, and use **Tick shown /
  Untick shown** to change a whole filtered group at once.
- Your previously-eligible rarities stay ticked - nothing is lost.
- Self-learning and the preview card's **Mark eligible** button still work exactly as
  before; they just tick entries in the same list.

### Notes
- A few rarities show as **`Rarity <number>`** - that's only a missing display name (EA
  scrambles the names in the game data); they're still fully selectable. Names can be
  filled in one line at a time in the code.
- If the game's rarity table can't be read for any reason, the tool quietly falls back to
  the old learn-as-you-go behaviour.

---

## v5 - 2026-07-10

A full visual redesign of the panel: the "Broadcast" look, with switchable colour
themes. Everything the tool did before still works the same way; this is layout and
styling (plus the theme picker). The old Emerald frosted-glass skin is retired.

### Switchable colour themes
There's now a **theme dropdown** in the panel header with three frosted-glass
colourways, and it remembers your pick:
- **UCL Night** (the default) - deep navy with a cyan accent and FUT gold.
- **Broadcast Yellow** - near-black with an electric lime accent.
- **Prime Teal** - dark teal with a coral accent.

### Broadcast layout (desktop)
- The panel is now a **wide console docked to the bottom of the screen** with a bright
  top edge, split into three zones: the **Lineup** (your players), the **Spotlight**
  (the selected player), and the **PlayStyle Deck** (choose + apply).
- You can still **drag it and resize it** by the corner, and there's a new **reset
  button** (the little expand icon in the header) that snaps it back to the default dock.
- Resize it narrow and it drops to **two columns** (the spotlight tucks above the deck)
  so nothing gets squashed.

### Redesigned player spotlight
The selected-player card is now a broadcast-style "lower third": a big rating number
next to the name, with the PlayStyle+ (3) and Basic (8) caps drawn as **segment meters**
instead of dots. Same info as before.

### Guided mobile flow
On a phone the wizard is now **channel tabs** (Lineup / PlayStyle Deck / Review) with a
**pinned mini-spotlight** at the bottom that always shows who you're building. A **guide
button** walks you through the steps, and you **can't reach Review until you've picked at
least one PlayStyle** (the Review tab stays greyed out until then).

### Type + naming
- The whole panel now uses a **condensed, uppercase broadcast typeface**.
- "Evolutions" is renamed **"PlayStyle Deck"**; the delay control and Apply button now
  sit **side by side** in one row.

---

## v4 - 2026-07-08

### Version badge in the panel header
The panel now shows **which version you're on** as a small badge next to the title
(e.g. `v4`), so you can tell at a glance whether you're on the latest and know when to
grab a newer one from the install page.

- The number is stamped in automatically when a version is cut, so it always matches
  the published version. A build you're just testing from the source shows `dev`.
- Nothing else about how the tool works has changed.

---

## v3 - 2026-07-06

The last of the four friend-feedback tweaks: a smarter **✨ Suggest**.

### 4. Smarter Suggest (fall-through past owned PlayStyles)
Suggest now always fills every slot it can, instead of leaving gaps.

- **Before:** if a player already owned one of a role's top picks, Suggest just skipped
  it and left that slot empty - so an owned top pick meant one fewer suggestion.
- **Now:** it **falls through** to the next-best pick. It fills your **open** slots
  best-first (top picks as PS+, the rest basic), counting only the slots you actually
  have free.
- **Never re-ticks an owned style** - in either form. If you already hold a PlayStyle as
  a "+", Suggest won't offer you its basic version either.
- **Always has a next-best.** When a role's own curated list runs out of unowned picks,
  Suggest keeps going down a general **position** list (attacker / midfielder / defender /
  keeper), so even a heavily-evolved card still gets every slot filled.
- Still works on **one player at a time** (greyed out during a multi-player batch).

---

## v2 - 2026-07-06

Four feature tweaks (from friends' feedback) plus a couple of desktop fixes.

### 1. Resizable desktop panel
The floating panel can now be **resized**, not just dragged.

- Grab the little **diagonal-striped handle in the bottom-right corner** and drag to
  make the panel bigger or smaller (width *and* height).
- Minimum size ~340×260; it won't grow past the screen edges.
- The size is **remembered** (saved in your browser, like the drag position), so it
  reopens at the size you left it.
- **Desktop only** - on a phone (the bottom-sheet "Wizard") and while minimized, the
  handle is hidden and sizing is automatic.

### 2. Multi-select players → batch apply
Apply the same PlayStyles to **several players in one run**.

- Every player row now has a **checkbox** on the left. Tick the players you want.
  Ticking one also brings it into focus (its preview shows on the right).
- A green **"N selected for batch apply"** bar appears, with a **Clear** button.
- Pick your PlayStyles once, then hit **Apply selected** - it applies to *all* ticked
  players, one after another.
- A **roll-call** ("Applying selected PlayStyles to N players: …") shows above the
  Apply button so you can see exactly who's affected before you go.
- Each player is checked **individually**: any PlayStyle a player already owns, can't
  fit (its own 3 PS+ / 8 basic caps), or that's GK-only on an outfielder is reported as
  **skipped** (not a failure). The result shows a section per player with what was added
  / failed / skipped.
- **Suggest** (and its position/role dropdowns) is greyed out while more than one player
  is ticked - it only works on a single player. Manual ticking still works in batch mode.
- With **nothing** ticked, Apply behaves exactly as before (just the previewed player).

### 3. Reset / remove evos
You can now **remove PlayStyles** from a card, matching the EA web app's clear ability.

- On the preview card, two buttons: **Remove Latest Evo** and **Clear all evos**.
- **Remove Latest Evo** removes the most recently applied upgrade.
- **Clear all evos** removes them one by one until the card fully reverts.
- **Both always ask you to confirm first.** A spinner + live count shows the progress
  right under the buttons.
- **Important wording:** the game removes evo *upgrades* newest-first, and there's no way
  to pick a specific one or to know in advance whether the next one is a PlayStyle or a
  **stat/skill upgrade**. So the buttons say "evo", not "PlayStyle", and the confirm
  warns you. Clear all reverts the card, which can make it **leave your club evo list**.

### Fixes
- **Desktop scrolling** is reliable again - the PlayStyle grid / right side scrolls
  fully, including after **minimizing and re-opening** the panel (a bug there collapsed
  the scroll).
- The **"← Back to players"** button after applying now only shows on **mobile** (on
  desktop the player list is always visible, so it was redundant).

---

## v1 - 2026-07-06

- Responsive layout: desktop **Split Console** (players left, build + apply right) and
  mobile **Wizard** (3-step bottom sheet).
- **Drag** the panel by its header; position remembered.
- PlayStyle+ icons shown inline on each player row.
- (Foundation from Phase 1: full-club picker, preview card, PlayStyle/PS+ icon grid,
  Suggest, apply loop with delay/Stop, state-safe refresh - see `PLAN.md`.)
