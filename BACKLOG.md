# YouTube Roulette — Backlog

Ideas evaluated and shelved for later. Not rejected outright — just not in the current build queue.

## Round Recap Reel

**Source:** UX/UI brainstorm 2026-04-26, idea #15.

**The pitch:** Between rounds, a 6-second Hub montage plays each player's picked thumbnail with their name and vote count, scored to a sting. Replaces the static results-screen breakdown with a Jackbox-style "highlight reel" moment.

**Why deferred:** Needs a `past_picks` history stored across rounds (currently each round wipes `picked_video_*` on the player rows in `nextRound`). That's a real schema expansion (new `yt_round_picks` table or a JSONB array on `yt_rooms`), plus playback orchestration logic. Worth doing once the simpler polish wins are in and the engagement payoff is clear.

**Rough scope when picked up:** M–L. Schema migration, archive logic in `nextRound`/`tallyAndAdvance`, new `renderHubResults` reel branch with timed thumbnail transitions. Optional sting audio adds another layer of complexity (autoplay rules, asset bundling).

**Dependencies:** Should land after the Hot Streak / per-round historical state is in place — same data substrate.

---

## Search-term ↔ Superpowers Spacing (player turn view)

**Source:** Phase A playtest 2026-04-26.

**The pitch:** On the active player's phone view, the gap between the displayed search term and the row of superpower buttons (Reroll / Replace / Swap) is too tight or otherwise off. A small layout pass to introduce more breathing room and a more deliberate visual rhythm.

**Why deferred:** Pure cosmetics, not blocking any flow. Easy fix when picked up.

**Rough scope:** S. Touch `js/ui.js:renderGame` and possibly the `.search-term-section` / `.superpowers` rules in `css/styles.css`.

---

## Playlist First-Video Unavailable Fallback

**Source:** Phase A playtest 2026-04-26.

**The pitch:** When the active player picks a playlist tile, we currently extract the playlist's *first* video ID via `firstVideoId` (set server-side in the Edge Function from `playlistItems` API). If that first video is private, removed, or otherwise unembeddable, the YouTube player errors and the turn auto-advances via the `onError` callback — feels like the game ate the player's pick.

**Why deferred:** Need to decide on the right fallback strategy. Options to consider:
- **Eager fallback in the Edge Function:** when fetching playlistItems, page through items 1..N until we find one with `embeddable=true` and `duration>10s`. More API quota cost.
- **Client-side fallback:** when `onError` fires for a playlist, fetch the next item via a separate Edge Function call and try again. Adds a UX delay but cheaper.
- **Pre-pick validation:** before storing `firstVideoId` in `search_results`, verify it's actually playable. Guarantees no errors but increases search latency.
- **UX-only:** explicitly tell the player "this video can't be played, please pick another" instead of advancing the turn. Cheapest. The current behavior auto-advances which is the worst-feeling option.

**Rough scope:** S–M depending on path chosen. The UX-only option (don't auto-advance, just toast) is S. Eager Edge Function paging is M.

**Dependencies:** None.
