# YouTube Roulette — Backlog

Ideas evaluated and shelved for later. Not rejected outright — just not in the current build queue.

## Round Recap Reel

**Source:** UX/UI brainstorm 2026-04-26, idea #15.

**The pitch:** Between rounds, a 6-second Hub montage plays each player's picked thumbnail with their name and vote count, scored to a sting. Replaces the static results-screen breakdown with a Jackbox-style "highlight reel" moment.

**Why deferred:** Needs a `past_picks` history stored across rounds (currently each round wipes `picked_video_*` on the player rows in `nextRound`). That's a real schema expansion (new `yt_round_picks` table or a JSONB array on `yt_rooms`), plus playback orchestration logic. Worth doing once the simpler polish wins are in and the engagement payoff is clear.

**Rough scope when picked up:** M–L. Schema migration, archive logic in `nextRound`/`tallyAndAdvance`, new `renderHubResults` reel branch with timed thumbnail transitions. Optional sting audio adds another layer of complexity (autoplay rules, asset bundling).

**Dependencies:** Should land after the Hot Streak / per-round historical state is in place — same data substrate.
