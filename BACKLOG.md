# YouTube Roulette — Backlog

Ideas evaluated and shelved for later. Not rejected outright — just not in the current build queue.

## handleHubPlaybackChange 200ms playVideo delay

**Source:** Concurrency hardening audit 2026-04-27.

**The pitch:** `handleHubPlaybackChange` schedules `Hub.playVideo(...)` inside a 200ms `setTimeout` (a holdover from earlier render-vs-playback ordering work). Now that Tasks 2/3 (selection beat + FLIP morph) own the bridge into playback explicitly, this 200ms delay may be redundant or actively fighting the new choreography.

**Why deferred:** Not breaking anything today. Worth a careful review when Tasks 2/3 land — likely candidate to remove entirely or fold into the morph timing.

**Rough scope:** XS investigate, XS-S to remove. Single setTimeout in `js/app.js` `handleHubPlaybackChange`.

**Dependencies:** Easier to evaluate after Batch D ships.

---

## Home form-card: cancel / back affordance

**Source:** Playtest 2026-04-27.

**The pitch:** On the home screen, clicking "Host the Hub Display", "Create Game (Phone)", or "Join Game" reveals a form card. There's no cancel/back button to close that card and return to the three-button picker. Currently the only way out is to refresh the page.

**Why deferred:** Not blocking — the form cards still work as intended once you've committed. The friction is on accidental clicks and "let me reconsider" moments. Page refresh is an acceptable workaround for now.

**Rough scope:** XS. Add a small `← back` text-button (or `×` close affordance in the corner) to each form card. Clicking it just hides the open card and re-shows the home button stack. Already handled by the existing `show-hub` / `show-create` / `show-join` toggle mechanism — likely just needs a new `data-action="hide-form-cards"` button per card and a handler that strips the visible class. Apply on both mobile and desktop.

**Dependencies:** None.

---

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

---

## Remove O/0 (and possibly I/1) From Room Code Generation

**Source:** Phase B playtest 2026-04-26.

**The pitch:** Room codes are randomly generated from `ROOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'`. The letter `O` and digit `0` look nearly identical in most fonts; same for `I` and `1`. When dictating codes verbally or reading off a TV at distance, this creates errors. Restrict the alphabet to unambiguous characters.

**Why deferred:** Trivial change but worth bundling with other small polish; doesn't block anything.

**Rough scope:** XS. One-line change in `js/app.js` — replace `ROOM_CHARS` with the filtered set (e.g. `'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`). Existing rooms with O/0/I/1 codes keep working; only newly-generated codes use the restricted alphabet.

**Dependencies:** None.

---

## Hub Voting Screen — Full Visual Review

**Source:** Phase B playtest 2026-04-26.

**The pitch:** The Hub voting screen feels under-designed compared to the rest of the game. The current layout uses the available space inefficiently (most of the screen is empty), the player vote-status indicators (now bigger Jackbox-style cards but still room to grow) could be more dramatic/animated, and the overall presentation could feel more like a "moment." A focused visual pass — Jackbox-style, with bold typography, larger/more cinematic vote cards, animated transitions between voted/pending states, and a more deliberate use of the screen real estate.

**Why deferred:** The functional bones are now in place (blind voting, numbered grid, last-voter spotlight, bigger pending cards). A full visual review is design-driven and best done as a focused effort rather than tacked onto each functional change.

**Rough scope:** M. Touches `renderHubVoting`, several CSS rules, possibly new keyframe animations. May benefit from a design exploration / mockup phase before code.

**Dependencies:** None — but worth doing alongside or after Phase C's slot-machine reveal so the cinematic style is consistent.
