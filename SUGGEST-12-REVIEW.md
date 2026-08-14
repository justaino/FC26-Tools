# Suggest: the 12th PlayStyle - proposed ROLES update (FOR REVIEW)

Nothing in `fc26-tools.js` has changed yet. Approve and I apply exactly what is below.

## Why Suggest stops at 11

Not the caps and not the apply loop - both already allow 12. It is the data.

`ROLES` gives each role an ordered PlayStyle list; `roleWeightsFromList` turns that into
weights; **a PlayStyle not on the list scores 0**. Suggest stops the moment the best
remaining candidate would add nothing, so it can never pick past the end of the list.
36 of the 37 lists held exactly 11 names. That is the whole bug - no code change needed.

## Where the new lists come from

fut.gg: https://www.fut.gg/playstyles/best-by-role/

That page has a selector for how many PlayStyles+ (2-5) and how many base (6-10) you
want. Set to **4 PS+ / 8 base** it gives exactly our caps: 12 per role. Under the hood it
is ONE priority-ordered list of 12 per role and the selector just decides how many of the
leading entries are drawn as PS+ - so the order below IS fut.gg's order, read straight
from the page rather than retyped.

Their role names and position groups match ours exactly, all 37, so nothing had to be
guessed or renamed. Three of their names differ in spelling only and were mapped:
Game Changer -> Gamechanger, Long Ball -> Long Ball Pass, Rush Out -> 1v1 Close Down.

## What actually moves the score

The rank curve is `[4,3,2,1]`: ranks 1-2 weigh 4, ranks 3-4 weigh 3, ranks 5-6 weigh 2,
**ranks 7-12 all weigh 1**. Only the top 6 and their order change behaviour. Which six
sit in the tail matters; their order among themselves does not.

Also worth knowing: Suggest does not blindly make the top 4 into PS+. It picks whatever
raises the score most, so a high-weight PlayStyle the card already owns as a basic tends
to get upgraded first. The list sets priorities, not a fixed 4-and-8 split.

## Side effect

The full-marks ceiling (`psMaxForWeights`) sums every weight, so a 12th name at weight 1
lifts it 63 -> 64. Every card scores about **1.6% lower** on the PlayStyle half. Identical
shift for every card in a role, so rankings and Best XI barely move, but the numbers
printed on cards tick down a little.

## A. Roles where a PlayStyle is DROPPED (0)

The ones worth your eye. Everything else only gains.

| Role | In | Out | Proposed 12, priority order |
|---|---|---|---|

## B. Pure additions (37)

| Role | New 12th | Top 6 | Proposed 12, priority order |
|---|---|---|---|
| ST / Advanced Forward | Pinged Pass | **reordered** | Finesse Shot, Low Driven Shot, Rapid, Incisive Pass, Gamechanger, Quick Step, Technical, Tiki Taka, First Touch, Press Proven, Enforcer, Pinged Pass |
| ST / Target Forward | Technical | **reordered** | Finesse Shot, Enforcer, Precision Header, Low Driven Shot, Incisive Pass, Rapid, First Touch, Gamechanger, Tiki Taka, Press Proven, Pinged Pass, Technical |
| ST / Poacher | Tiki Taka | **reordered** | Finesse Shot, Low Driven Shot, Rapid, Incisive Pass, First Touch, Gamechanger, Quick Step, Technical, Press Proven, Pinged Pass, Enforcer, Tiki Taka |
| ST / False 9 | Press Proven | **reordered** | Finesse Shot, Incisive Pass, Low Driven Shot, Technical, Gamechanger, Rapid, Tiki Taka, Pinged Pass, Quick Step, Inventive, First Touch, Press Proven |
| RW / LW / Inside Forward | Press Proven | **reordered** | Finesse Shot, Low Driven Shot, Rapid, Quick Step, Technical, Gamechanger, Incisive Pass, Pinged Pass, Tiki Taka, First Touch, Inventive, Press Proven |
| RW / LW / Winger | Press Proven | **reordered** | Rapid, Finesse Shot, Pinged Pass, Quick Step, Technical, Low Driven Shot, Gamechanger, Incisive Pass, Tiki Taka, First Touch, Inventive, Press Proven |
| RW / LW / Wide Playmaker | Quick Step | **reordered** | Finesse Shot, Incisive Pass, Technical, Tiki Taka, Pinged Pass, Rapid, Low Driven Shot, Gamechanger, Press Proven, First Touch, Inventive, Quick Step |
| CAM / Shadow Striker | Press Proven | **reordered** | Finesse Shot, Incisive Pass, Rapid, Technical, Low Driven Shot, Quick Step, Tiki Taka, Gamechanger, First Touch, Pinged Pass, Inventive, Press Proven |
| CAM / Playmaker | Rapid | **reordered** | Finesse Shot, Incisive Pass, Low Driven Shot, Technical, Tiki Taka, Pinged Pass, Gamechanger, First Touch, Press Proven, Quick Step, Inventive, Rapid |
| CAM / Classic 10 | Rapid | **reordered** | Finesse Shot, Incisive Pass, Technical, Tiki Taka, Pinged Pass, Low Driven Shot, Gamechanger, First Touch, Press Proven, Quick Step, Inventive, Rapid |
| CAM / Half Winger | Finesse Shot | **reordered** | Incisive Pass, Rapid, Technical, Finesse Shot, Tiki Taka, Pinged Pass, Gamechanger, Quick Step, First Touch, Press Proven, Inventive, Low Driven Shot |
| CM / Box to Box | First Touch | unchanged | Incisive Pass, Pinged Pass, Intercept, Finesse Shot, Tiki Taka, Bruiser, Anticipate, Quick Step, Technical, Relentless, Press Proven, First Touch |
| CM / Playmaker | Press Proven | **reordered** | Incisive Pass, Pinged Pass, Finesse Shot, Tiki Taka, Technical, Intercept, Low Driven Shot, Anticipate, First Touch, Quick Step, Inventive, Press Proven |
| CM / Deep Lying Playmaker | (reorder only) | **reordered** | Intercept, Pinged Pass, Bruiser, Incisive Pass, Tiki Taka, Anticipate, Jockey, Quick Step, First Touch, Press Proven, Long Ball Pass, Inventive |
| CM / Holding | Relentless | **reordered** | Intercept, Pinged Pass, Bruiser, Anticipate, Tiki Taka, Jockey, Incisive Pass, Quick Step, First Touch, Press Proven, Long Ball Pass, Relentless |
| CM / Half Winger | Relentless | unchanged | Pinged Pass, Intercept, Quick Step, Tiki Taka, Incisive Pass, Finesse Shot, Anticipate, Technical, Jockey, Bruiser, Rapid, Relentless |
| RM / LM / Inside Forward | Press Proven | **reordered** | Finesse Shot, Low Driven Shot, Rapid, Quick Step, Technical, Gamechanger, Incisive Pass, Pinged Pass, Tiki Taka, First Touch, Inventive, Press Proven |
| RM / LM / Winger | Press Proven | **reordered** | Rapid, Finesse Shot, Pinged Pass, Quick Step, Technical, Low Driven Shot, Gamechanger, Incisive Pass, Tiki Taka, First Touch, Inventive, Press Proven |
| RM / LM / Wide Playmaker | Quick Step | **reordered** | Finesse Shot, Incisive Pass, Technical, Tiki Taka, Pinged Pass, Rapid, Low Driven Shot, Gamechanger, Press Proven, First Touch, Inventive, Quick Step |
| RM / LM / Wide Midfielder | Bruiser | **reordered** | Rapid, Quick Step, Pinged Pass, Intercept, Tiki Taka, Incisive Pass, Anticipate, Relentless, Whipped Pass, Jockey, Press Proven, Bruiser |
| CDM / Holding | Relentless | **reordered** | Intercept, Pinged Pass, Bruiser, Anticipate, Tiki Taka, Jockey, Incisive Pass, Quick Step, First Touch, Press Proven, Long Ball Pass, Relentless |
| CDM / Deep Lying Playmaker | Inventive | **reordered** | Intercept, Pinged Pass, Bruiser, Incisive Pass, Tiki Taka, Anticipate, Jockey, Quick Step, First Touch, Press Proven, Long Ball Pass, Inventive |
| CDM / Box Crasher | First Touch | unchanged | Incisive Pass, Intercept, Pinged Pass, Finesse Shot, Tiki Taka, Quick Step, Bruiser, Anticipate, Technical, Press Proven, Relentless, First Touch |
| CDM / Centre Half | Relentless | unchanged | Intercept, Bruiser, Jockey, Anticipate, Quick Step, Block, Tiki Taka, Pinged Pass, Aerial Fortress, Slide Tackle, Long Ball Pass, Relentless |
| CDM / Wide Half | Slide Tackle | unchanged | Bruiser, Intercept, Quick Step, Jockey, Anticipate, Incisive Pass, Block, Tiki Taka, Pinged Pass, Press Proven, Relentless, Slide Tackle |
| RB / LB / Fullback | Slide Tackle | unchanged | Bruiser, Intercept, Quick Step, Jockey, Anticipate, Incisive Pass, Block, Tiki Taka, Pinged Pass, Press Proven, Relentless, Slide Tackle |
| RB / LB / Wingback | Whipped Pass | **reordered** | Intercept, Pinged Pass, Quick Step, Bruiser, Anticipate, Tiki Taka, Jockey, Incisive Pass, Rapid, Relentless, Press Proven, Whipped Pass |
| RB / LB / Falseback | Relentless | **reordered** | Intercept, Pinged Pass, Anticipate, Bruiser, Jockey, Tiki Taka, Incisive Pass, Quick Step, First Touch, Press Proven, Long Ball Pass, Relentless |
| RB / LB / Inverted Wingback | First Touch | **reordered** | Incisive Pass, Tiki Taka, Quick Step, Anticipate, Intercept, Rapid, Pinged Pass, Jockey, Press Proven, Relentless, Bruiser, First Touch |
| RB / LB / Attacking Wingback | Whipped Pass | **reordered** | Rapid, Quick Step, Pinged Pass, Intercept, Tiki Taka, Incisive Pass, Anticipate, Relentless, Jockey, First Touch, Bruiser, Whipped Pass |
| CB / Defender | Relentless | unchanged | Intercept, Bruiser, Anticipate, Jockey, Quick Step, Block, Pinged Pass, Aerial Fortress, Slide Tackle, Tiki Taka, Press Proven, Relentless |
| CB / Stopper | First Touch | unchanged | Intercept, Bruiser, Anticipate, Jockey, Quick Step, Block, Slide Tackle, Tiki Taka, Pinged Pass, Relentless, Aerial Fortress, First Touch |
| CB / Wide Back | Relentless | unchanged | Intercept, Anticipate, Quick Step, Jockey, Bruiser, Block, Pinged Pass, Aerial Fortress, Slide Tackle, Tiki Taka, Press Proven, Relentless |
| CB / Ball Playing Defender | Slide Tackle | unchanged | Intercept, Bruiser, Anticipate, Jockey, Quick Step, Block, Pinged Pass, Tiki Taka, First Touch, Press Proven, Aerial Fortress, Slide Tackle |
| GK / Goalkeeper | Incisive Pass | unchanged | Far Reach, Footwork, 1v1 Close Down, Deflector, Cross Claimer, Far Throw, Pinged Pass, Long Ball Pass, Tiki Taka, Press Proven, First Touch, Incisive Pass |
| GK / Ball Playing | Incisive Pass | unchanged | Far Reach, Footwork, 1v1 Close Down, Deflector, Cross Claimer, Pinged Pass, Far Throw, Long Ball Pass, Tiki Taka, Press Proven, First Touch, Incisive Pass |
| GK / Sweeper Keeper | Incisive Pass | unchanged | Far Reach, Footwork, 1v1 Close Down, Deflector, Cross Claimer, Pinged Pass, Far Throw, Long Ball Pass, Tiki Taka, Press Proven, First Touch, Incisive Pass |
