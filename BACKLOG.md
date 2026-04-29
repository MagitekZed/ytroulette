# YouTube Roulette — Backlog

Ideas evaluated and shelved for later. Not rejected outright — just not in the current build queue.

## Skip-vote 60s timer counts ad time on non-Premium accounts

**Source:** Playtest 2026-04-27 (after Batch C ship).

**The pitch:** The thumbs-down skip-vote 60s gate is anchored on the YT IFrame's first `onStateChange === 1` event (PLAYING). That fires when the **ad** starts on accounts without YouTube Premium, not when the actual video starts. Result: a user with a 30-second pre-roll ad can vote-to-skip after only 30s of actual video. The host (developer) has Premium so doesn't see this in their own testing — it's a real bug for everyone else.

**Why deferred:** Non-trivial to fix cleanly. The YT IFrame public API doesn't expose `onAdStart` / `onAdEnd` events. Possible approaches:
- Listen for additional state transitions (state 3 = BUFFERING) — ad-to-video transitions sometimes show up as buffering, but unreliable.
- Use `player.getDuration()` — returns the VIDEO duration, but during an ad it returns the ad's duration. So watching for the duration value to change might work as an "ad ended" signal, but YT may not always update this reliably.
- Use `player.getVideoUrl()` — for ads vs main video the URL differs; could detect change. Has worked in some unofficial implementations but no API guarantee.
- Add a "Real video started" UI button the active player taps to manually start the gate. Hacky but reliable.

**Rough scope:** M. Mostly research time (validating which detection approach actually works against current YT IFrame behavior) plus the implementation. Likely needs to track `getDuration()` over time and fire the gate-start when the duration value stabilizes after an ad.

**Workaround for now:** the host can use Premium to test (already happening) and the gate is acceptable in practice — even if it counts ad time, players can still meaningfully wait 60s before skip-voting on most non-pre-roll-ad videos.

**Dependencies:** None. Could ship anytime.

---

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

## Hub winner type — dial down size + glow (cinematic overlay AND inline announcement)

**Source:** Chat 2026-04-28 — two screenshots:
1. Inline "★ Rghc earns 1 point!" wrapping to 3 lines on the results screen.
2. Cinematic WINNER / Name / +1 POINT overlay with the name "Rghc" hazing into the background.

**The pitch:** Both symptoms stem from a single offender: `.hub-winner-name` at [css/styles.css:3515](css/styles.css:3515). It applies `font-size: 9rem` plus *two* compounding glows — `text-shadow: 0 0 60px currentColor` AND `filter: drop-shadow(0 0 20px currentColor)`. There's also a duplicate, milder `.hub-winner-name` rule at [css/styles.css:2221](css/styles.css:2221) (`font-size: 2rem`) that gets overridden by source order, so the cinematic styling leaks into the inline results announcement (which is just a sentence, not a single name) and blows up the layout. The double-glow turns big type into a washed-out haze rather than a punchy halo.

**Fix shape:**
- Pick *one* glow layer, not both — text-shadow at ~24–32px gives a tighter halo on heavy type than drop-shadow's bloom. Designer's call.
- Drop the cinematic-overlay font-size to ~5.5–6.5rem, or use `clamp(3rem, 7vw, 6rem)` so it scales on smaller Hub displays.
- Decide whether the inline `.hub-results-announcement > .hub-winner-name` should share the cinematic style at all. Probably not — it's a sentence ("X earns N points"), not a name beat. Either rename one of the classes (e.g. `.hub-winner-name--hero` for the overlay) or scope the cinematic rule to `.hub-winner-overlay .hub-winner-name`. Either way the duplicate-class pattern is the bug under the bug.
- Verify on the Hub at 1080p and 1440p.

**Why deferred:** Pure cosmetics, not blocking. Worth bundling with the broader "Hub Voting Screen — Full Visual Review" entry below — same design language across the cinematic moments.

**Rough scope:** S. Two CSS rules + likely a class rename in [js/app.js:1908](js/app.js:1908) and [js/ui.js:901](js/ui.js:901) so they don't share a class.

**Dependencies:** None — but consider doing it alongside the voting-screen review for consistency.

---

## Phones lag behind the Hub slot reveal — show "rolling search term…" until it lands

**Source:** Chat 2026-04-28.

**The pitch:** When a new round/turn kicks off, the Hub plays the slot-machine reveal (~1.8s, see `SLOT_REVEAL_MIN_MS` at [js/app.js:97](js/app.js:97)). On phones, `state.room.current_search_term` updates the instant the realtime row arrives — so the new term is plainly visible on every player's phone (header at [js/ui.js:141](js/ui.js:141), and superpower view at [js/ui.js:645](js/ui.js:645)) *before* the Hub finishes spinning. It deflates the suspense the slot reveal is meant to create. Phones should hold a "rolling search term…" placeholder (or matching slot animation) until the Hub reveal lands.

**Design questions:**
- Where does the phone learn that the Hub is currently revealing? Option A: a new `room.reveal_state` (`'rolling' | 'locked'`) the Hub sets when it starts/ends the spin — clean signal but adds a write. Option B: phones just time it themselves — when `current_search_term` *changes*, they hide the term locally for `SLOT_REVEAL_MIN_MS` and show the placeholder, then reveal. No schema change. Cleanest. Risk: phone joins mid-reveal and would show the placeholder unnecessarily for ~1.8s — acceptable, arguably even fine.
- Should the phone do a tiny slot animation of its own, or just display the rolling-text placeholder? Cheap version: animated text "rolling…" with bouncing dots. Spicy version: a mini character-roll matching the Hub's cadence so it lands in sync — more work, much more cohesive feel.
- Reroll / Replace / Swap also change `current_search_term` ([js/app.js:1645](js/app.js:1645) etc.) — those don't trigger a slot reveal on the Hub today (they're a different animation). Make sure the placeholder gating only kicks in for the slot-reveal path, not for superpower edits, or use a unified gate.

**Recommended shape (gut):** option B with a synced mini-roll on the phone — the cell columns spin in tandem with the Hub so when the Hub locks, the phone's term snaps into place at the same moment. The shared `SLOT_REVEAL_MIN_MS` constant makes this nearly free to keep in sync.

**Rough scope:** S–M depending on whether we go plain placeholder (S) or synced mini-roll (M). Two phone render paths to update plus a small state flag (`state._termRollUntil = Date.now() + SLOT_REVEAL_MIN_MS`).

**Dependencies:** None.

---

## Lobby — gate auto-start on expected player count, not just "everyone ready"

**Source:** Chat 2026-04-28.

**The pitch:** The Hub auto-starts the game the instant `players.length >= 2 && every ready` ([js/app.js:1063](js/app.js:1063)). For a planned 3-player game, if two players join and ready up before the third has joined, the countdown fires and the third player misses the start. The system has no notion of "we're waiting for N people."

**Design questions to resolve before coding:**
- Where does the expected count come from? Three plausible shapes:
  1. **Host sets headcount in the lobby** — a `max_players` (or `expected_players`) field the host bumps with `+ / −` on the Hub. Auto-start requires `players.length === expected_players && every ready`. Cleanest UX, needs a schema column.
  2. **Manual "Start Now" button on the Hub** — kill auto-start entirely, host taps to commit when the lobby looks right. Zero schema change. Loses the satisfying "everyone ready → game starts" beat.
  3. **Hybrid: auto-start when full+ready, otherwise wait for host tap** — best of both, slightly more state.
- What about late joiners? Should joining a `lobby`-status room still be allowed up until host commits? (Currently yes.)
- Visual: lobby should show "3 / 4 joined" so everyone knows we're waiting on someone, not just "press ready."

**Recommended shape (gut):** option 3 — host sets target headcount on the Hub lobby (default = current player count, can bump up/down), and auto-start fires only when `players.length >= expected && every ready`. A "Start now anyway" override button covers the case where someone bailed before joining.

**Rough scope:** S–M. Schema: add `expected_players INT` to `yt_rooms`. UI: counter widget on Hub lobby ([js/ui.js](js/ui.js) `renderHubLobby` area). Logic: tweak the gate at [js/app.js:1063](js/app.js:1063). The override button is a few lines on top.

**Dependencies:** None. Worth deciding the design shape with the user before implementing.

---

## False "room ended while you were away" on transient mobile reconnect

**Source:** Playtest 2026-04-28 — phone briefly lost connection as the round advanced playback → voting; on reconnect it showed "The room ended while you were away" and bounced to home, while the Hub was still mid-round.

**Diagnosis (bug-investigator agent):**
- The toast lives at [js/app.js:799](js/app.js:799), fired from the `forceReconcile` flow at [js/app.js:782](js/app.js:782).
- Trigger: `loadRoom` ([js/app.js:753](js/app.js:753)) destructures only `data` from the Supabase `.single()` and silently ignores `error`. Any transient failure (network blip on phone wake, JWT not yet refreshed, PGRST101/301 hiccup, or even the `state.roomCode !== code` early-return) leaves `state.room` null.
- `forceReconcile` then misreads "room is falsy" as proof the room was DELETEd, fires the toast, calls `clearSession()`, and routes to home.
- The *real* host-ended path is the realtime DELETE handler at [js/app.js:840](js/app.js:840) → routes to `host-ended` view ([js/ui.js:1059](js/ui.js:1059)). The speculative toast branch is a redundant guess that misfires under flaky mobile.

**Fix shape:**
- Make `loadRoom` capture `error` and throw on non-`PGRST116` (no-rows) errors so `forceReconcile`'s `catch` keeps the "reconnecting" pill up.
- In `forceReconcile`, only treat a confirmed "room not found" (PGRST116 + empty players query) as ended. On any other error, leave `_connStatus = 'reconnecting'` and retry (small backoff loop, 2–3 attempts).
- Cleanest option: delete the speculative toast branch entirely and rely solely on the realtime DELETE handler — DELETE replication is the authoritative "host ended" signal.

**Why deferred:** Need to think about which fix shape we want before coding — the "delete the speculative branch" option is appealingly simple but means a phone that reconnects after a *real* host-end while the realtime channel is still down won't learn the room is gone until the channel resubscribes. Acceptable? Probably yes, but worth a moment.

**Rough scope:** S. Two functions in [js/app.js](js/app.js).

**Repro:** Phone in a round, lock screen / walk into dead zone right as Hub advances phase. On wake → toast + bounce to home.

**Dependencies:** None.

---

## Decode HTML entities in YouTube titles (double-escape bug)

**Source:** Chat 2026-04-28 — screenshot of `OZZY OSBOURNE - &quot;Mama, I&#39;m Coming Home&quot; (Official Video)` rendered literally on the Hub "Now Playing" line.

**The pitch:** YouTube's Data API returns video titles with HTML entities pre-encoded (`&quot;`, `&#39;`, `&amp;`, `&lt;`, etc.). Our `esc()` helper then escapes the leading `&` again, producing `&amp;quot;` in the HTML, which the browser renders as the literal text `&quot;`. Result: any title with quotes, apostrophes, or ampersands looks broken.

**Where it manifests:** anywhere a title flows through `esc()` — confirmed at [js/ui.js:266](js/ui.js:266) ("Now Playing"), and almost certainly the search-result grid, vote tiles, picked-video chip, results screen, and history. Probably channel/playlist names too.

**Fix sketch:** add a `decodeEntities(str)` step before `esc()` for fields that come from YouTube. Cheapest implementation: a tiny lookup for the common five (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) plus numeric `&#NNN;` regex — avoids the textarea-innerHTML trick which has its own XSS pitfalls. Apply at the ingestion point (Edge Function response handling in [js/app.js](js/app.js)) so the in-memory state holds clean strings, rather than sprinkling `decodeEntities` at every render site.

**Rough scope:** S. One helper, one or two ingestion sites, regression-check the render paths.

**Dependencies:** None.

---

## Identity picker — emoji avatar AND color, free choice + discoverability

**Source:** Chat 2026-04-28 (emoji picker), follow-up 2026-04-28 (also let players choose their color).

**The pitch:** Players have an emoji avatar and a color, but there's no visible way to choose either:
- **Emoji:** tap-to-cycle exists for your own avatar (`cycle-avatar` handler at [js/app.js:2018](js/app.js:2018), wired in [js/ui.js:106](js/ui.js:106) and [js/ui.js:617](js/ui.js:617)), but it's silent/undiscoverable, only hinted at via a `title` tooltip (useless on phones), and cycle-one-at-a-time is tedious when your target emoji is far in the list.
- **Color:** purely deterministic — `getPlayerColor` hashes `playerId` against a 12-color palette ([js/ui.js:8-19](js/ui.js:8)). No DB field, no user choice. Two players can collide on the same color today and there's nothing they can do about it.

**What "good" looks like:** one combined identity picker that opens when you tap your own avatar — emoji grid on top, color swatches below, both committing on tap. Closes automatically. The avatar itself gets a "tap to change" affordance (subtle pulse on join, edit-pencil overlay, or a faint outline ring). Surfaces wherever the player sees their own avatar — lobby, in-game player rail, game-over.

**Design questions:**
- **Color uniqueness:** lock one color per room (taken swatches greyed out / show whose), or allow collisions? Locking is cleaner but adds reservation/race logic on the realtime channel. Allowing collisions is trivially easy. Probably allow collisions but visually nudge toward unique picks (badge "already taken by Sam" without blocking).
- **Schema:** add `color TEXT` to `yt_players` (hex string). `getPlayerColor` becomes "prefer stored, fall back to hash" so existing rooms still work.
- **Default assignment on join:** keep the hash for first assignment so players still get distinct-ish colors without acting; only override when they pick.
- **Emoji defaults:** `EMOJI_AVATARS` is already random-on-join ([js/app.js:644](js/app.js:644), [js/app.js:706](js/app.js:706)) — keep that, picker just lets you override.

**Why deferred:** Underlying data path for emoji (debounced DB write) already works. Color needs a schema column. Not blocking gameplay; this is a UX/discoverability pass that benefits from being designed once and shipped together.

**Rough scope:** M. Schema migration (`color` on `yt_players`). `getPlayerColor` becomes lookup-first. New `renderIdentityPicker` modal/popover. Replace the cycle handler with open-picker. New `set-avatar` and `set-color` actions with debounced writes (mirror the existing avatar pattern at [js/app.js:2018](js/app.js:2018)). Affordance pass on `.player-avatar--cyclable` in [css/styles.css](css/styles.css).

**Dependencies:** None — purely additive.

---

## Rebrand — drop "YouTube" from the product name → "Tube Roulette"

**Source:** Chat 2026-04-29 — review of YouTube API ToS / Developer Policies / Brand Guidelines ahead of a possible quota-extension audit and public release.

**The pitch:** YouTube's Brand Guidelines explicitly prohibit using "YouTube," "YT," or any variant *as part of an application's name* — they call out "YouTube for Kids" / "YouTube Education" as the violation pattern, which is structurally identical to "YouTube Roulette." Compatibility phrasing ("a great app for YouTube," "powered by YouTube") *is* allowed in subtitles/marketing copy. Product name needs to change before we ship publicly or apply for a quota extension; subtitle does the brand-bridge.

**Recommended landing:** `Tube Roulette — the party game for YouTube`. "Tube" is generic English, identical syllable rhythm to the current name (small rebrand cost), preserves the roulette/spin metaphor the slot reveal + turn structure already lean into. Reel Roulette / Clip Roulette are alternates if a future design pass wants to move further from the original.

**Surface area (rough sweep — 14 files contain "YouTube Roulette"):**
- User-visible copy: [index.html](index.html) `<title>`, header, meta tags; Hub lobby/title bars; phone home screen; results / final winner screens; any toast strings.
- Repo / build: [package.json](package.json) `name`, [README.md](README.md), [HANDOFF.md](HANDOFF.md), [FLOW.md](FLOW.md), [FLOW-OVERVIEW.md](FLOW-OVERVIEW.md) — internal docs, low priority but worth sweeping for consistency.
- Code comments: [js/app.js](js/app.js), [js/ui.js](js/ui.js), [js/hub.js](js/hub.js), [js/config.js](js/config.js), [css/styles.css](css/styles.css), [schema.sql](schema.sql), [supabase/functions/youtube-search/index.ts](supabase/functions/youtube-search/index.ts) all have a top-of-file comment naming the project.
- DB table prefix `yt_` is fine — internal, not user-facing — leave it.
- Working directory `YouToube Roulette` and git repo name: don't rename mid-flight, do at a clean commit boundary if at all.

**Open questions:**
- Do we want the subtitle baked into the page `<title>` and Hub header (always visible), or only on the home screen / lobby (less noisy in-game)? Probably home + lobby only, in-game just shows "Tube Roulette" or no title at all.
- Domain / hosting URL — if we already have a `youtube-roulette.*` URL booked, decide whether to move or keep as a redirect.

**Why deferred:** Not blocking anything in the current build queue; this is a pre-publish gate, not a playtest blocker. Worth bundling with the YouTube attribution branding pass below since they're both audit-prep work.

**Rough scope:** S. Mostly find/replace in user-visible strings + a subtitle line in two or three views. Internal docs/comments are an optional second sweep.

**Dependencies:** Pair with "YouTube attribution branding on every page" below — both are audit-prep. Do them together.

---

## YouTube attribution branding on every page (audit-prep)

**Source:** Chat 2026-04-29 — same ToS review as the rebrand entry above.

**The pitch:** YouTube Developer Policies require that any surface displaying YouTube content "must make clear to the viewer that YouTube is the source" via the proper YouTube Brand Features per the Branding Guidelines, and that the logo "link back to YouTube content or to a YouTube component of that application." Today none of our views show a YouTube wordmark/logo — Hub grid, phone numbered grid, Now Playing, vote screen, results, winner overlay all display YouTube content with no attribution. This is the single most visible compliance gap before we'd be ready to apply for a quota extension or publish.

**Surfaces that need attribution (anywhere YouTube content is shown):**
- Hub: 20-thumbnail selecting grid, Now Playing line + iframe, voting grid, scoreboard (shows past picks), winner overlay (shows the winning thumbnail).
- Phone: numbered selecting grid, vote grid, results screen if it shows thumbnails.
- Anywhere a video title, channel name, or thumbnail flows from the YT Data API into the UI.

**Design shape (gut):** small persistent YouTube wordmark in a corner of the Hub views (bottom-right, low-emphasis but visible), and a smaller wordmark on phone views' bottom bar. Linked to `https://youtube.com` (or to the currently-playing video URL on the Now Playing surface, which is the spec-compliant "link to YouTube content" form). Colors per the official brand kit — don't recolor or restyle the logo. Asset comes from YouTube's brand resource pack (https://brand.youtube/), which is the canonical source.

**Open design questions:**
- Wordmark vs. play-button-only logo? The wordmark reads more clearly at small sizes and is the form their guidelines lean on for attribution. Use wordmark.
- Light vs. dark variant — the Hub is dark (`#0a0a0a`-ish backgrounds) so the white wordmark; phones have mixed surfaces, may need both.
- Dynamic link target on the Now Playing surface (link to the actual playing video) vs. always linking to `youtube.com` — dynamic is more correct under the policy ("link to a YouTube component"), trivial to wire since we already have `current_video_id`.
- Don't use the YouTube logo as a button or part of a control — it's strictly attribution.

**Why deferred:** Pre-publish/audit-prep, not a playtest blocker. Pair with the rebrand above.

**Rough scope:** S. New small component (HTML + CSS) inserted into Hub view templates and phone view templates. Asset download from brand.youtube. No JS state changes.

**Dependencies:** None mechanical. Worth doing together with the rebrand so all the audit-prep ships in one batch.

---

## Hub Voting Screen — Full Visual Review

**Source:** Phase B playtest 2026-04-26.

**The pitch:** The Hub voting screen feels under-designed compared to the rest of the game. The current layout uses the available space inefficiently (most of the screen is empty), the player vote-status indicators (now bigger Jackbox-style cards but still room to grow) could be more dramatic/animated, and the overall presentation could feel more like a "moment." A focused visual pass — Jackbox-style, with bold typography, larger/more cinematic vote cards, animated transitions between voted/pending states, and a more deliberate use of the screen real estate.

**Why deferred:** The functional bones are now in place (blind voting, numbered grid, last-voter spotlight, bigger pending cards). A full visual review is design-driven and best done as a focused effort rather than tacked onto each functional change.

**Rough scope:** M. Touches `renderHubVoting`, several CSS rules, possibly new keyframe animations. May benefit from a design exploration / mockup phase before code.

**Dependencies:** None — but worth doing alongside or after Phase C's slot-machine reveal so the cinematic style is consistent.
