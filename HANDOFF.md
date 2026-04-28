# YouTube Roulette — Session Handoff

Read this first when picking up the project in a new session. It captures current state, recent decisions, and the next likely thing to work on.

**Last updated:** 2026-04-28 — through Batch D + Studio Card Lift refinements (v49). Two batches remain: E and G.

---

## At a glance

- **What it is:** Jackbox-style party game. A "Hub" (TV/desktop) shows the room code; phones join with the code. Each round, every player gets a turn. On their turn: a random 4-character search term is generated, the Hub does a YouTube search and displays a 20-thumbnail grid, the active player picks one via a numbered grid on their phone, the Hub plays the video, then "Stop & Next" advances. After everyone's turn, all players vote. First to N points wins.
- **Stack:** Vanilla JS, no build step. Supabase for realtime + a single Edge Function for the YouTube search. GitHub Pages deploy.
- **Deploy URL:** `magitekzed.github.io` (root, not a subpath).
- **Repo:** `https://github.com/MagitekZed/ytroulette`
- **Current cache-bust:** CSS `?v=49`, JS `?v=49`. Every JS edit bumps this in lockstep across `index.html`, both imports in `js/app.js`, and the import in `js/ui.js`.
- **Schema:** `schema.sql` is canonical. Migrations live in `migrations/NNN_name.sql` and are run manually via Supabase SQL Editor.

---

## Saved memory (project conventions)

These live in `~/.claude/projects/.../memory/` and are auto-loaded each session. Critical to honor:

- **`feedback_terminology.md`** — Use **Hub** (TV/desktop) and **Players** (phones). Never DM/Player (that's another project's vocab).
- **`feedback_push_workflow.md`** — Solo dev. After a coherent change, **commit and push to master directly** without pausing to ask. The user iterates on master and tests live.
- **`feedback_accessibility.md`** — Personal app, NOT commercial. Don't gate design behind accessibility. **No `prefers-reduced-motion` guards.** No `tabindex` shuffling. The user has OS-level reduce-motion enabled but explicitly wants full motion. `reducedMotion()` in `js/app.js` is hardcoded to `false`.
- **`feedback_pacing.md`** — Comprehension over speed. Comprehension beats need ≥1.5-2s of full visibility. ~800ms is subliminal. Tactile feedback (vote received, ready celebration) can stay quick. **When in doubt, longer wins.** User accepted the 6.8s game-start arc and 6.6s selection→video bridge happily.

---

## File map

| Path | What's there |
|------|--------------|
| `index.html` | Single-page shell. CDN scripts (Supabase, morphdom, YT IFrame, qrious). Cache-bust on the bottom script tag + the CSS link. |
| `js/app.js` | State, Supabase realtime, game logic, event delegation, slot-reveal helpers, animation orchestration. ~2000 lines. |
| `js/ui.js` | All view rendering as HTML strings. `tallyVotes`, `avatarContent`, `getPlayerColor` exported helpers. ~1000 lines. |
| `js/hub.js` | YT IFrame player lifecycle + `buildPool` filter. Exports `setFirstPlayCallback` for `video_started_at` writes. |
| `js/config.js` | Supabase URL + anon key. |
| `css/styles.css` | Mobile-first dark theme with glassmorphism. ~3100 lines. |
| `schema.sql` | Canonical Supabase schema. |
| `migrations/` | Manual SQL migrations. Run before deploying JS that depends on them. |
| `supabase/functions/youtube-search/index.ts` | Edge Function. Filters non-embeddable, `#shorts` titles, ≤10s clips. Has a fallback search if the first pass returns <5 videos. |
| `BACKLOG.md` | Deferred-but-good ideas, with rough scope per item. |
| `HANDOFF.md` | This file. |
| `.claude/launch.json` | Local dev server config (`npx serve .` on port 3000). |

---

## Recent work (latest sessions)

### Studio Card Lift transition + refinements (completed, v49)
The FLIP morph + black-bridge approach (Batch D Task 3) felt cheap (thumbnail-zoom is the give-away). Replaced with the designer's **Studio Card Lift**: the picked tile collapses into a player-color slab that blooms to fullscreen, then a "NOW PLAYING" placard pops in.

**Final choreography (3580ms total, after the 3000ms selection beat):**
- T+0: `Hub.playVideo` fires; iframe loads behind a black scrim. `.np-stage` overlay built.
- T+0–640: SLAB BLOOM — clip-path expands a player-color radial slab from picked tile rect to fullscreen. **Card is hidden during this entire phase** (per user feedback — only the slab should be visible while expanding).
- T+640–840: 200ms breath; just the colored slab visible.
- T+840–1220: CARD REVEAL — `.now-playing-card` fades in with subtle scale 0.94→1. Avatar + eyebrow + title + footer all become visible together (no more lift animation; the whole card pops in cleanly).
- T+1080–1420: text staggers — eyebrow rises (1080), title rises (1140), footer rises (1240).
- T+1420–3220: HOLD ~1800ms (cinematic breath).
- T+3220–3580: DISSOLVE — scrim + slab + card fade together; avatar holds 80ms longer.

DOM: `.np-stage > .np-scrim + .np-slab + .now-playing-card` built dynamically by `runFlipMorph` (kept the function name; entirely different transition now). Appended to `body` outside `#app` so morphdom never touches. Old `.hub-thumb--launching` / `.hub-thumb--blacking` classes fully retired. Total bridge from selection to video: 3000 + 3580 = **6580ms** (~6.6s). Long, deliberately so per pacing principle.

### Batch D — Premium tiles + Selection beat (completed, v44)
Three coordinated visual upgrades for the Hub mid-game experience.

**Task 1 — Premium tiles:** `.hub-thumb` rebuilt with cinematic gradient mask (`::before`), active-color gloss strip (`::after`), 44px number badge with idle `hubNumBreath` pulse and player-color border via `color-mix`, repositioned YouTube-style duration pill, 2-line clamped title floating over the gradient. Markup re-shuffle: `.hub-thumb-duration` lifted OUT of `.hub-thumb-meta`. Dense-grid demotion via `:has()` selectors — 13+ cells hide views, 16+ cells scale the badge + clamp title to 1 line.

**Task 2 — Selection beat (3000ms — bumped from spec's 900ms per pacing):** Picked tile pops with overshoot + 3-pulse player-color glow ring + number badge punch; others blur/dim/scale-down. Pick chip CENTERED IN tile (not below) with 56px avatar + 1.6rem text + 2rem #N. Visible for ~2.6s before the lift starts. New state flags `_showingSelection`, `_selectionTimeout`. The OLD 200ms setTimeout in `handleHubPlaybackChange` was REMOVED — `runSelectionThenLaunch` owns playback start now. Picked tile + chip both `data-morph-skip="true"`.

**Task 3 — FLIP morph:** REPLACED by Studio Card Lift (see above).

### Concurrency hardening (completed, v38)
Bug-investigator audit identified 8 races + 6 project patterns. All shipped:
- **C1:** `tallyAndAdvance` clears `revealingVotes` immediately after reveal window (was in finally — caused vote-reveal flash on results view).
- **C2:** `_autoAdvanceTimer` declared in state + cleared in `clearSession`; callback guards on `!roomCode`. Fixed leaked interval.
- **C3:** `selectVideo` writes room before player (was player→room — caused brief render of selecting view with picked tile highlighted before YT player swung in).
- **H1:** `_avatarWriteTimer` cleared in `clearSession`.
- **H2:** `kickPlayer` voting branch writes `player_order` first, then deletes player.
- **H3:** `nextRound` + `playAgain` write room first, then players. **Fixed the "bad transition between videos with empty grid border" the user noticed earlier.**
- **H4:** Reroll/Replace/Swap consume optimistically before DB writes (mirrors `cycle-avatar` pattern). Prevents fast-double-tap from firing two terms.
- **H5:** `forceReconcile` + `loadRoom` re-validate `roomCode` after each await — no "ghost room" partial repopulation post-leave.

**6 project patterns established (apply project-wide):**
1. Multi-write transitions: write room first (it owns view-state via status/playback_status); player-state echoes follow.
2. One-shot user actions: optimistic local consumption (mutate state, render, then DB write).
3. Every state-tracked timer/interval handle MUST be cleared in `clearSession`.
4. `setTimeout` callbacks that mutate state should early-return on `!state.roomCode`.
5. Async actions should re-check `state.roomCode` after each await.
6. Render-only flags cleared in tight scopes, not in finally blocks.

### Batch C — Thumbs-down skip vote (completed, v43)
Migration 003 adds `yt_players.thumbs_down BOOL DEFAULT false` and `yt_rooms.video_started_at TIMESTAMPTZ`.

**Mechanics:**
- Strict majority threshold `count > Math.floor(total/2)`. For 2 players = unanimous.
- Active player counts in eligible voters (per user "everyone").
- Mid-game joiners (spectators not in `player_order`) cannot vote.
- 60s gate per video. Phone button disabled with countdown until gate opens.
- `video_started_at` written by YT IFrame `onStateChange === 1` (via `Hub.setFirstPlayCallback`), NOT by `selectVideo`. Future-proofs against playlist auto-skipping.
- `thumbs_down` reset on EVERY turn boundary: `startGame`, `finishTurn`, `nextRound`, `playAgain`, `selectVideo`, `kickPlayer` (current-player branch).
- Hub auto-skip in `handlePlayerChange` UPDATE branch — `_skipVoteFiring` debounces. Toast on Hub "Skipped by majority vote." Phones see no dedicated toast (turn banner + view transition signal it).

**Phone UI:** 👎 button on both waiting view AND active player's controls. Optimistic local consume. 1Hz `_thumbsGateInterval` ticker drives the visible countdown.

**Hub UI:** `👎 N/T` tally chip in admin bar (left side via `margin-right: auto`). NO `data-morph-skip` because the count needs to update on every render.

**Known limitation (BACKLOG):** the 60s gate counts ad time on non-Premium accounts (state=1 fires when ad starts, not actual video).

### Batch B — Turn-change banner + Reconnect pill (completed, v36-v37)
**H1 — Turn-change banner:** `#hub-banner` with `.hub-banner--turn` modifier (top-positioned, z-index 600 above iframe). Fires on `oldPlayerIndex !== state.room.current_player_index` for turns 2+. **Skipped on turn 1** (curtain owns it via `!state._showingCurtain` check). **2800ms total** (was 1320ms — bumped per pacing): 350ms in + 2100ms hold + 350ms out via single `hubTurnBannerLife` keyframe. New flags `_showingTurnBanner`, `_turnBannerTimeout`. M1 optimistic flip + `triggerSearch` both gated on `!_showingTurnBanner`; banner's setTimeout tail fires `triggerSearch` after the banner clears. **`Hub.stopVideo()` fires INSIDE the H1 block BEFORE `runTurnBanner`** so the iframe doesn't cover the banner.

**Concern A — Reconnect pill:** lightweight visibility/online listener path. `#conn-pill-host` outside `#app`. Channel `subscribe()` callback updates `state._connStatus`. `forceReconcile()` triggers on `visibilitychange` and `online` events. `setConnStatus` early-returns if `roomCode` is null (so intentional leaves don't surface "Reconnecting..." pill). Pill DOM also explicitly cleared in `clearSession`.

### Batch A — Quick wins + Hub timer + Fullscreen (completed, v35)
- **M1** — empty-grid flash fix: optimistic `playback_status = 'searching'` in `handleRoomChange` term-change branch. `searchStartTime` anchored UNCONDITIONALLY in `triggerSearch` (was inside the optimistic-flip gate, would skip if M1 pre-set the flag).
- **M2** — "Now Playing" placeholder stripped. Empty `<div class="hub-main"></div>` during playing.
- **Item 1** — Hub video timer pill in admin bar (right end via `margin-left: auto`). `data-morph-skip="true"` so JS-written textContent isn't clobbered. Hooks YT `onStateChange` (state 1=play, 2=pause, 0=end). 250ms tick. Exposes `Hub.getElapsedSeconds()`.
- **Item 3** — Fullscreen toggle: ⛶ button in admin bar. `documentElement.requestFullscreen()`. First-time toast hint via `localStorage.yt_fs_hint_seen`. `syncFullscreenButton()` called at end of `render()` so morphdom rerenders don't break the icon-swap.

### Pre-game polish — Phase 1 (game-start arc, completed, v25-v34)
Total arc from "all ready" to first thumbnail = ~6.8s.

**Infrastructure:** `<div id="hub-overlay">` + `<div id="hub-banner">` siblings of `#yt-player-wrapper` in `index.html`. Both OUTSIDE `#app` — JS owns full DOM lifecycle. Helpers: `setOverlay/clearOverlay/setBanner/clearBanner`.

**Item 5 — Ready-up countdown:** `runCountdown()` runs 3-2-1-GO! at 1000ms intervals + 1200ms GO! tail. Cancellable via `abortCountdown()`. Hub auto-start hook in `handlePlayerChange` UPDATE branch calls `runCountdown` instead of `startGame` directly. The 2s safety-net poll routes through `runCountdown` too (was bypassing it, was a bug). Abort fires on UPDATE (un-ready) and DELETE.

**Item 3 — Game-start curtain:** `runCurtain()` chains off countdown — shows "First up: [Name]" for 1.6s. Player name in `getPlayerColor()` with text glow. `triggerSearch` gated by `!state._showingCurtain`. `state._showingCurtain = true` set BEFORE `await startGame()` so realtime echo can't fire `triggerSearch` during the await window.

**Item 2 — Player join fanfare:** INSERT-only trigger in `handlePlayerChange`. Skips own-player. `_justJoinedIds` set drives card slide-in + bottom banner with avatar + "[NAME] joined" (~2020ms each, queued).

**Z-index scale:** grid 10, banners 50, overlays 100. Toast 1000. yt-player-wrapper 500. Turn banner specifically z-index 600 (above iframe).

### Audit remediation (completed, earlier)
18 findings across 4 commits. Notable durable fixes: `state.isProcessing` consolidated INSIDE action functions with try/finally, `state._lastTalliedRound` per-round dedupe token, `playback_status: 'search_failed'` as a real status, phone-host-leave ends room, mid-round joiners are spectators.

### UX/UI Phases A/B/C (completed, much earlier)
Adaptive Hub grid + QR code in lobby + haptic feedback + active-player spotlight; blind voting + numbered vote grid + last-voter spotlight; slot-machine term reveal + emoji avatars + Hot Streak badge.

---

## REMAINING WORK — Batches E and G

These are the two remaining batches from the original 4-ship roadmap. Specs are detailed enough to ship without re-engaging PM — fold the refiner reshapes already noted and execute.

---

### BATCH E — Round + Voting Polish

**Items:** H3 (round-2+ entry overlay), H4 (vote pip cascade), M3 (vote-pulse guard).

**Cache-bust target: `?v=50`.**

**No migration.**

#### H3 — Round 2+ entry beat

**Problem:** When the round ends and `nextRound` flips status from `results` back to `playing`, the Hub jumps directly to the game view. There's no "ROUND 2" announcement — the user has flagged this as the missing turn-transition (round transition) beat.

**Implementation:**

1. **State additions** (in `js/app.js` state object):
   ```js
   _showingRoundBanner: false,
   _roundBannerTimeout: null,
   ```
   Reset both in `clearSession`.

2. **Trigger** in `handleRoomChange` (where `oldStatus !== state.room.status` fires):
   ```js
   if (state.isHub && oldStatus === 'results' && state.room.status === 'playing') {
     state._showingRoundBanner = true;
     setOverlay(`<div class="hub-round-overlay"><div class="hub-round-line">ROUND ${state.room.round}</div><div class="hub-round-go">GO!</div></div>`);
     state._roundBannerTimeout = setTimeout(() => {
       state._showingRoundBanner = false;
       state._roundBannerTimeout = null;
       clearOverlay();
     }, 2400);
   }
   ```
   (2400ms total per pacing principle — was specced as 1400 but bump for comprehension. 200ms scrim fade + 360ms ROUND scale-in + 1700ms hold + 140ms exit.)

3. **Gate `triggerSearch`** in `showView` and via `triggerSearch`'s entry path: add `&& !state._showingRoundBanner` to existing curtain/turn-banner gates. The round banner's tail clears the flag and lets the next render path proceed.

4. **CSS** (append to styles.css, after the existing turn-banner block):
   ```css
   .hub-round-overlay {
     display: flex;
     flex-direction: column;
     align-items: center;
     gap: 16px;
     animation: hubRoundOverlayLife 2400ms ease-out forwards;
   }
   .hub-round-line {
     font-family: var(--font-heading);
     font-weight: 600;
     font-size: 1.2rem;
     letter-spacing: 0.4em;
     color: var(--gold-dim);
     text-transform: uppercase;
     animation: hubRoundLineIn 320ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;
   }
   .hub-round-go {
     font-family: var(--font-heading);
     font-weight: 900;
     font-size: 14rem;
     line-height: 0.9;
     color: var(--gold);
     text-shadow: 0 0 60px var(--gold-glow);
     animation: hubRoundGoIn 360ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both;
   }
   /* Note: hub-overlay's existing background and is-active opacity handle the scrim */
   @keyframes hubRoundOverlayLife {
     0%   { opacity: 0; }
     8%   { opacity: 1; }
     94%  { opacity: 1; }
     100% { opacity: 0; }
   }
   @keyframes hubRoundLineIn {
     from { opacity: 0; transform: translateY(8px); letter-spacing: 0.2em; }
     to   { opacity: 1; transform: translateY(0); letter-spacing: 0.4em; }
   }
   @keyframes hubRoundGoIn {
     from { opacity: 0; transform: scale(0.4); }
     to   { opacity: 1; transform: scale(1); }
   }
   ```

#### H4 — Vote-reveal pip cascade

**Problem:** The vote count reveal currently fires all counts pulsing simultaneously with `voteRevealPulse` (1.5s). Could feel more theatrical with a per-card cascade.

**Implementation:**

1. In `js/ui.js` `renderHubVoting` (find the votingPlayers map block, around line 758): the existing `.hub-vote-count--reveal` class is already applied during reveal. Add `data-revealed="true"` to the count element AND a per-row `nth-child` stagger via CSS.

2. **CSS update** to existing `voteRevealPulse`:
   ```css
   @keyframes voteRevealPulse {
     0%   { transform: scale(0.7); opacity: 0; }
     45%  { transform: scale(1.18); opacity: 1; }
     100% { transform: scale(1.0); opacity: 1; }
   }
   .hub-vote-count--reveal {
     animation: voteRevealPulse 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
   }
   /* Stagger by card position — 200ms per card, up to 6 cards */
   .hub-vote-grid > .hub-vote-card:nth-child(1) .hub-vote-count--reveal { animation-delay: 200ms; }
   .hub-vote-grid > .hub-vote-card:nth-child(2) .hub-vote-count--reveal { animation-delay: 400ms; }
   .hub-vote-grid > .hub-vote-card:nth-child(3) .hub-vote-count--reveal { animation-delay: 600ms; }
   .hub-vote-grid > .hub-vote-card:nth-child(4) .hub-vote-count--reveal { animation-delay: 800ms; }
   .hub-vote-grid > .hub-vote-card:nth-child(5) .hub-vote-count--reveal { animation-delay: 1000ms; }
   .hub-vote-grid > .hub-vote-card:nth-child(6) .hub-vote-count--reveal { animation-delay: 1200ms; }
   ```

3. **Adjust `tallyAndAdvance` reveal window** (in `js/app.js`): the existing 1500ms wait may need bumping to 1900ms to accommodate the longest cascade (6 cards × 200ms + 700ms pulse = ~1900ms). Verify by counting cards in a real game — at 4 players the cascade ends at 800ms+700ms=1500ms, fine. At 5+ players bump to 1900ms.

#### M3 — Vote-pulse re-trigger guard

**Problem:** `state.revealingVotes = true` triggers the pulse on each card. If `debouncedRender` fires during the reveal window, the pulse animation re-applies on already-animated elements — potentially restarting them.

**Implementation:**

1. Add the `data-morph-skip`-style guard to `onBeforeElUpdated` in `js/app.js` (the morphdom callback already has the existing `data-morph-skip` short-circuit at the top — add a parallel one for `data-revealed`):
   ```js
   if (fromEl.dataset && fromEl.dataset.revealed === 'true' && toEl.dataset?.revealed === 'true') return false;
   ```
   Place this right after the existing `data-morph-skip` check.

2. In `renderHubVoting`, add `data-revealed="true"` to the `.hub-vote-count--reveal` element when `revealing` is true:
   ```js
   `<div class="hub-vote-count hub-vote-count--reveal" data-revealed="true">${votes} vote${votes !== 1 ? 's' : ''}</div>`
   ```

3. Apply the same to the H4 pip elements if you go pip-based (probably keep the existing count-text approach; pips were a designer suggestion that wasn't strictly required — count-with-cascade is enough).

#### Cumulative onBeforeElUpdated allowlist (after Batch E ships)

The callback should check, in order:
1. `data-revealed="true"` on both fromEl and toEl → return false (M3)
2. `data-morph-skip="true"` on fromEl → return false (Batch D — already shipped)
3. Existing slot-cell guard (`hub-char--rolling` / `hub-char--locked`) — unchanged

#### Cumulative `clearSession` resets after Batch E

Add: `_showingRoundBanner`, `_roundBannerTimeout`. (Existing flags shipped: see earlier batches.)

#### Test checkpoints

- Round 1 → results → next round transitions: ROUND 2 / GO! overlay plays for 2.4s; turn-1 curtain replays for round 2 (or skips to turn-banner depending on existing logic — verify); slot reveal kicks in cleanly after.
- Cast all votes: cards reveal vote counts staggered across the grid. No double-pulse on subsequent renders.
- M3 specifically: open DevTools and force a re-render (e.g., another player updates avatar) during the reveal window — pulse should NOT re-trigger.

#### Commit message template

```
batch E: round-2+ overlay + vote-reveal cascade + pulse guard (?v=50)

- H3: ROUND N / GO! overlay on results→playing transition (hub).
  2400ms total, gates triggerSearch via _showingRoundBanner flag.
- H4: vote-reveal cascade — nth-child(N) animation-delay stagger
  on .hub-vote-count--reveal (200ms per card). voteRevealPulse
  shortened 1.5s → 700ms; tallyAndAdvance reveal-window may need
  1500→1900ms bump for 5+ player games.
- M3: data-revealed="true" guard in onBeforeElUpdated prevents
  re-trigger on debouncedRender during reveal windows.

Cache-bust: v50.
```

---

### BATCH G — Playlist Fallback (Concern B)

**Items:** Concern B alone.

**Cache-bust target: `?v=51`.**

**Migration 004 required.**

#### Migration 004

Create `migrations/004_add_selected_playlist.sql`:
```sql
ALTER TABLE yt_rooms ADD COLUMN IF NOT EXISTS selected_playlist_id TEXT;
```

Mirror inline in `schema.sql` (find `yt_rooms` definition, add the column).

**Run on Supabase BEFORE deploying JS.** The user runs migrations manually.

#### Implementation

1. **Add `Hub.playPlaylist` to `js/hub.js`:**
   ```js
   let pendingPlaylistId = null;

   export function playPlaylist(playlistId) {
     if (!playlistId) return;
     if (!player || !playerReady) {
       pendingPlaylistId = playlistId;
       return;
     }
     resetTimer();
     firstPlayFired = false;
     showPlayer();
     try {
       player.loadPlaylist({ list: playlistId, listType: 'playlist', index: 0 });
       pendingPlaylistId = null;
     } catch (err) {
       console.error('Failed to load playlist:', err);
     }
   }
   ```
   In `playVideo`, clear `pendingPlaylistId` so the two paths don't trample.
   In `onReady`, flush `pendingPlaylistId` if set.

2. **`selectVideo` writes the right column** (in `js/app.js`). Currently the function writes `selected_video_id`. Update to discriminate on `video.type`:
   ```js
   const isPlaylist = video.type === 'playlist';
   const updates = {
     selected_video_index: index,
     playback_status: 'playing',
     video_started_at: null, // first-play callback will populate
   };
   if (isPlaylist) {
     updates.selected_playlist_id = video.playlistId;
     updates.selected_video_id = video.firstVideoId; // seed; first-play overwrites
   } else {
     updates.selected_video_id = video.videoId;
     updates.selected_playlist_id = null;
   }
   await db.from('yt_rooms').update(updates).eq('code', state.roomCode);
   ```
   Then the player update for picked_video_* (matching Pattern 1 — room first, player second).

3. **Hub plays the right thing** in `runFlipMorph` (currently calls `Hub.playVideo(videoId)` at T+0). Add a discriminator:
   ```js
   const playlistId = state.room?.selected_playlist_id;
   if (playlistId) {
     Hub.playPlaylist(playlistId);
   } else {
     Hub.playVideo(videoId);
   }
   ```
   Same swap in `attemptHubRejoin` (search for the `Hub.playVideo` call there).

4. **First-play callback captures actual video data** (in `js/app.js`, the existing `Hub.setFirstPlayCallback` registration in `createHubRoom` and `attemptHubRejoin`). Currently the callback just writes `video_started_at`. Extend it to capture the actually-playing video's data:
   ```js
   Hub.setFirstPlayCallback(async () => {
     if (!state.isHub || !state.roomCode) return;
     const updates = { video_started_at: new Date().toISOString() };
     // For playlists, capture the actually-playing first video's id + title
     if (state.room?.selected_playlist_id) {
       const data = Hub.getCurrentVideoData?.() || {};
       if (data.video_id) updates.selected_video_id = data.video_id;
     }
     await db.from('yt_rooms').update(updates).eq('code', state.roomCode);
   });
   ```
   Add to `js/hub.js`:
   ```js
   export function getCurrentVideoData() {
     if (!player || !playerReady) return null;
     try { return player.getVideoData?.(); } catch { return null; }
   }
   ```

5. **8s timeout fallback** for "all items unplayable" — when `Hub.playPlaylist` is called but no `firstPlayFired` event arrives within 8s, mark the tile unplayable and return to selecting view.

   Add `state._playlistFallbackTimer: null` to state + `clearSession`. In `runFlipMorph` (or wherever `Hub.playPlaylist` is called):
   ```js
   if (playlistId) {
     state._playlistFallbackTimer = setTimeout(async () => {
       state._playlistFallbackTimer = null;
       if (!state.roomCode) return;
       // First-play never fired — mark tile unavailable
       if (state.room?.playback_status === 'playing' && state.room?.selected_playlist_id === playlistId) {
         toast('Playlist unplayable. Pick another.', 'error');
         const results = [...(state.room.search_results || [])];
         const idx = state.room.selected_video_index;
         if (idx != null && results[idx]) {
           results[idx] = { ...results[idx], unplayable: true };
         }
         await db.from('yt_rooms').update({
           playback_status: 'selecting',
           selected_video_id: null,
           selected_playlist_id: null,
           search_results: results,
         }).eq('code', state.roomCode);
       }
     }, 8000);
   }
   ```
   Clear this timeout inside the first-play callback (when it actually fires):
   ```js
   if (state._playlistFallbackTimer) {
     clearTimeout(state._playlistFallbackTimer);
     state._playlistFallbackTimer = null;
   }
   ```

6. **Render unplayable tiles greyed** in `js/ui.js`:
   - In the selecting branch's thumb template, check `video.unplayable` and add `.hub-thumb--unplayable` class. Skip the `data-action="select-video"` for that tile.
   - Same for the phone-side num-grid in `renderGame` — gate the click on `available && !unplayable`.

   CSS:
   ```css
   .hub-thumb--unplayable {
     opacity: 0.3;
     filter: grayscale(1);
     cursor: not-allowed;
   }
   .hub-thumb--unplayable::after {
     content: 'UNAVAILABLE';
     position: absolute;
     top: 50%;
     left: 50%;
     transform: translate(-50%, -50%);
     background: rgba(0, 0, 0, 0.85);
     color: var(--text-muted);
     font-family: var(--font-heading);
     font-weight: 700;
     font-size: 0.85rem;
     letter-spacing: 2px;
     padding: 6px 14px;
     border-radius: 4px;
     z-index: 5;
   }
   ```

#### Test checkpoints

- Pick a regular video → unchanged behavior.
- Pick a playlist where item 1 is playable → plays normally; voting screen shows item 1's thumbnail (via captured `selected_video_id`).
- Pick a playlist where item 1 is unplayable but item 2+ is fine → IFrame native skip; first-play callback fires when item 2 starts; voting shows item 2's thumb.
- Pick a playlist where ALL items are unplayable → 8s timeout fires; tile turns greyscale-striped with "UNAVAILABLE"; toast appears; active player picks again.
- Hub refresh during playlist playback → `attemptHubRejoin` resumes via `Hub.playPlaylist` branch.

#### Commit message template

```
batch G: playlist fallback via YT IFrame native loadPlaylist (?v=51)

- migration 004: yt_rooms.selected_playlist_id TEXT
- Hub.playPlaylist uses native loadPlaylist({list, listType:'playlist', index:0})
  — IFrame skips unplayable items automatically.
- selectVideo writes selected_playlist_id when picking playlists; first-play
  callback captures the actually-playing video id via getVideoData() so
  skip-vote / voting view use the right id.
- runFlipMorph + attemptHubRejoin discriminate: selected_playlist_id →
  playPlaylist; else selected_video_id → playVideo.
- 8s "all unplayable" timeout marks the tile + returns to selecting view.
- Unplayable tiles render greyscale with "UNAVAILABLE" overlay; not tappable.

Cache-bust: v51.
```

---

## Schema migrations

Three migrations exist in `migrations/`:
- `001_add_avatar.sql` — `yt_players.avatar TEXT`
- `002_add_streak_fields.sql` — `yt_rooms.last_round_winner TEXT, streak_count INTEGER`
- `003_add_skip_vote.sql` — `yt_players.thumbs_down BOOL DEFAULT false; yt_rooms.video_started_at TIMESTAMPTZ`

All three have been run on the deployed Supabase. Future migrations:
1. Land as `migrations/NNN_name.sql` AND update `schema.sql` inline.
2. Be run on Supabase BEFORE the JS that depends on them ships (otherwise INSERT/UPDATE 400s on unknown columns).

**Migration 004 (Batch G):** see Batch G section above for the SQL. User runs it on Supabase before pulling the Batch G JS.

---

## How to run / test

### Local dev
```bash
cd "O:/Projects/AI Projects/Vibe Coding/YouToube Roulette"
npx -y serve .
```
Open `http://localhost:3000` on desktop + phone (same wifi, use desktop's LAN IP). Multiple browser tabs/profiles work for testing multi-player flows.

In Claude Code, `mcp__Claude_Preview__preview_start` with name `ytr` starts a server (config in `.claude/launch.json`). User typically prefers iterate-on-master (saved memory) — push, hard-refresh, test. Avoid spinning up the preview unless explicitly asked.

### Deploy
GitHub Pages auto-deploys on push to `master`. Cache-bust ensures the browser fetches fresh files. Hard-refresh after the new `?v=N` URL in DevTools Network tab confirms the bump landed.

### Test checklist (run if you've changed something significant)
1. Hub create → 2 phone joins → both ready → game starts. (Tests realtime + auto-start.)
2. Each phone takes a turn, picks a video. (Tests turn flow + slot reveal between turns + Studio Card Lift transition.)
3. Voting: cast all votes, watch the reveal, see results.
4. Repeat 2-3 across multiple rounds until win-condition. (Tests Hot Streak, score progression, no soft-lock.)
5. Phone-host leave from a non-Hub room with another player connected.
6. Hub refresh mid-game during `playing` state. (Tests `attemptHubRejoin` resume.)
7. Skip-vote: 60s gate, threshold cross, auto-skip + toast on Hub.

---

## Decisions log (non-obvious)

- **Optimistic local state updates** in `showView` and `triggerSearch` — avoids the empty-grid flash. Tradeoff: brief divergence from DB; realtime echo reconciles within ~200ms.
- **Per-round dedupe token** (`state._lastTalliedRound`) instead of `isProcessing` for tally protection — necessary because `isProcessing` resets in `finally` BEFORE the room-status echo.
- **Multi-write transitions: room first, player second** (project pattern #1). Hub's status-change branch consumes player echoes that follow.
- **Optimistic local consume for one-shot user actions** (project pattern #2). `cycle-avatar` is the canonical example; superpowers, thumbs-down all follow.
- **`data-morph-skip="true"` mechanism** in `onBeforeElUpdated` — used by hub video timer (250ms textContent ticks), the picked tile + chip during selection beat. Generic single-attribute escape hatch.
- **`reducedMotion()` is hardcoded `false`** + no `@media (prefers-reduced-motion: reduce)` in CSS. Per saved memory: full motion always for this personal app.
- **Hot Streak is badge-only**, no bonus points (per user decision).
- **"No Winner" votes BLOCK the unanimous bonus** (per user decision).
- **Past_terms accumulates across rounds** (per user decision) — kept for future use (recap reel).
- **Polling interval at 2s** is a deliberate fallback to realtime, not a bug. NOT cleared in `clearSession` (page-lifetime).
- **Cache-bust strategy** is a single integer bumped per commit-batch across `index.html`, `app.js`'s two imports, and `ui.js`'s one import.
- **`Hub.stopVideo()` fires INSIDE the H1 turn-banner block BEFORE `runTurnBanner`** so the iframe doesn't cover the banner. Same paint frame.
- **Studio Card Lift card is hidden during slab expansion** (per user feedback) — only the colored slab is visible while expanding. Card pops in cleanly after.

---

## Known quirks (intentional or acknowledged)

- **No password / auth** — open RLS policies. By design for casual party game.
- **Room codes can collide** — `generateRoomCode` retries 10 times then gives up. Stale-room cleanup runs on every create.
- **YouTube ad/conversion tracking errors in console** — comes from inside the YT iframe, blocked by uBlock Origin. Not our code, not a bug.
- **Hub admin "force-next-round" action** is dead code — defined in switch but no UI references it.
- **Existing players with `avatar = NULL`** render their initial letter. Backwards-compatible.
- **Skip-vote 60s gate counts ad time on non-Premium accounts** — see BACKLOG.md. Host has Premium so doesn't notice during testing.

---

## Coding conventions

- Vanilla JS, 2-space indent, ES modules with explicit `?v=N` cache-bust on imports.
- No semicolon obsession (consistent with existing code).
- No comments unless intent is genuinely non-obvious — well-named identifiers carry their own meaning.
- Don't add error handling for scenarios that can't happen — trust internal code; only validate at system boundaries.
- Optimistic UI updates preferred over loading spinners.
- **Push to master directly after a coherent change** — solo dev workflow, saved memory.
- Cache-bust EVERY JS edit (`index.html`, both `app.js` imports, `ui.js`'s one import). Single new integer per commit.

---

## Agent lineup

| Agent | When |
|------|------|
| `bug-investigator` | User reports broken behavior. Read-only diagnosis with file:line evidence. |
| `idea-man` | "What could we add?" Unfiltered brainstorm. |
| `refiner` | After idea-man — accept/reshape/reject ideas into concept cards. ALSO useful as a final safety pass before shipping (race conditions, breakage). |
| `designer` | Concrete visual/motion specs (durations, easings, dimensions, hex). Battle-tested across the entire transition system. |
| `project-manager` | Concept-complete features → phased implementation plan. |
| `app-developer` | Plan in hand → write the code. Knows the project conventions and saved memory. |
| `database-engineer` | Schema, migrations, RLS, query review. |
| `rules-lawyer` | Validate against external sources. |

---

## Picking up Batches E or G

1. Read this HANDOFF + the relevant batch section above.
2. Read `BACKLOG.md` for context on deferred items.
3. Brief `app-developer` directly with the batch spec from this doc — the specs are detailed enough to ship without re-engaging PM.
4. For Batch G, remind the user to run `migrations/004_add_selected_playlist.sql` on Supabase before deploying the JS.
5. Push to master after a coherent commit. Don't pause to ask (solo dev preference).

The remaining batches close out the planned roadmap. After E and G ship, the major polish work is done. Backlog items become the next-question agenda.
