# YouTube Roulette — Session Handoff

Read this first when picking up the project in a new session. It captures current state, recent decisions, and the next likely thing to work on.

**Last updated:** 2026-04-28 — through Batch H (v52). The original 4-ship roadmap (Batches A–G) is shipped; Batch H closed playtest gaps in the turn flow.

**Canonical flow references** (read these before touching the turn / round / voting flow):
- **`FLOW.md`** — exhaustive per-phase trace with file:line, every state flag, every animation beat in ms.
- **`FLOW-OVERVIEW.md`** — one-screen mermaid flowchart of every path through the game with gates and overlaps.

---

## At a glance

- **What it is:** Jackbox-style party game. A "Hub" (TV/desktop) shows the room code; phones join with the code. Each round, every player gets a turn. On their turn: a random 4-character search term is generated, the Hub does a YouTube search and displays a 20-thumbnail grid, the active player picks one via a numbered grid on their phone, the Hub plays the video, then "Stop & Next" advances. After everyone's turn, all players vote. First to N points wins.
- **Stack:** Vanilla JS, no build step. Supabase for realtime + a single Edge Function for the YouTube search. GitHub Pages deploy.
- **Deploy URL:** `magitekzed.github.io` (root, not a subpath).
- **Repo:** `https://github.com/MagitekZed/ytroulette`
- **Current cache-bust:** CSS `?v=52`, JS `?v=52`. Every JS edit bumps this in lockstep across `index.html`, both imports in `js/app.js`, and the import in `js/ui.js`.
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
| `FLOW.md` | Exhaustive game-flow reference — every phase, every state flag, every beat in ms, with file:line. |
| `FLOW-OVERVIEW.md` | One-screen mermaid flowchart of every path; gates + overlaps tables. |
| `.claude/launch.json` | Local dev server config (`npx serve .` on port 3000). |

---

## Recent work (latest sessions)

### Batch H — Flow polish from playtest (completed, v52)
Four targeted fixes from a v51 multi-round playtest. One commit, no migration.

- **Fix 1 — Video starts 500ms into card lift, not at T+0.** `Hub.playVideo` / `Hub.playPlaylist` calls inside `runFlipMorph` now wrap in a 500ms `setTimeout` so YT load + buffer overlap with the card-lift hold instead of starting cleanly during it. Audio leak window shrunk from ~1.5–2s to ~0.5–1s. State flag `_videoStartTimeout` cleared in `clearSession`. The 8s playlist fallback timer is armed inside the same setTimeout so its countdown aligns with actual load.
- **Fix 2 — `_showingTurnBanner` retrofitted into slot-reveal gates.** Pre-existing oversight from Batch B that Batch E almost caught: gates at `showView` (~line 1389) and `render` (~line 1487) check `_showingCurtain` / `_showingCountdown` / `_showingRoundBanner` but missed `_showingTurnBanner`. Slot reveal could kick off behind the turn banner. One-line fix in two spots; mirrors the existing pattern.
- **Fix 3 — WINNER overlay between vote cascade and scoreboard.** New player-color overlay fires inside `tallyAndAdvance` between the cascade and the `status: 'results'` write. 2400ms total. Shape: eyebrow "WINNER" → big name in player color (text-shadow + drop-shadow) → "+1 POINT" / "+2 POINTS · UNANIMOUS" / "TIE". Unanimous detection: `isUnanimous && state.players.length >= 3` (matches existing scoring logic). `winnerId === null` → TIE branch. New flag `_showingWinnerBanner` + timeout, both reset in `clearSession`. The previous 300ms breath is gone — overlay's intrinsic life owns that gap.
- **Fix 4 — Round 2+ chains `runCurtain` after the ROUND N / GO! overlay.** Generalized `runCurtain` to read `state.room.player_order[state.room.current_player_index]` instead of hardcoded `[0]`. The Batch E round-banner tail no longer calls `triggerSearch` directly — it now sets `_showingCurtain = true` and runs `runCurtain`, which fires `triggerSearch` from its own tail. Round 2+ now shows: ROUND N (2400ms) → "First up: NAME" curtain (1600ms) → slot reveal.

**Cumulative slot-reveal gate after Batch H** (both call sites): `!state._showingCurtain && !state._showingCountdown && !state._showingRoundBanner && !state._showingTurnBanner && !state._showingWinnerBanner`.

**Cumulative `clearSession` resets added by H:** `_videoStartTimeout`, `_showingWinnerBanner`, `_winnerBannerTimeout`.

### Batch G — Playlist fallback (completed, v51)
**Migration 004** added `yt_rooms.selected_playlist_id TEXT`. Mirrored in `schema.sql`.

`Hub.playPlaylist` in `js/hub.js` uses native `loadPlaylist({list, listType: 'playlist', index: 0})` — IFrame skips unplayable items automatically. `pendingPlaylistId` queues if player isn't ready; `onReady` flushes; `playVideo` clears the pending so paths don't trample. New `Hub.getCurrentVideoData` exposes `getVideoData()` for capture.

`selectVideo` discriminates on `video.type === 'playlist'`: writes `selected_playlist_id` (and seeds `selected_video_id` with `firstVideoId`), or writes `selected_video_id` and nulls the playlist column. Room write FIRST, then player write (Pattern 1 preserved).

`runFlipMorph` AND `attemptHubRejoin` both branch on `selected_playlist_id`. The first-play callback (registered in `createHubRoom` and `attemptHubRejoin`) extends to capture the actually-playing video id via `getVideoData()` for playlists, so skip-vote / voting view use the right thumbnail.

**8s "all unplayable" fallback timer** (`state._playlistFallbackTimer`) armed inside the playVideo setTimeout. If first-play never fires within 8s, marks the tile `unplayable: true`, resets `playback_status` to `'selecting'`, toasts "Playlist unplayable. Pick another." Cleared inside the first-play callback when it actually fires; cleared in `clearSession`. Unplayable tiles render `.hub-thumb--unplayable` (greyscale + "UNAVAILABLE" overlay) and aren't tappable.

`attemptHubRejoin` resume condition widened from `selected_video_id` to `selected_video_id || selected_playlist_id` so refresh during playlist playback resumes correctly.

### Batch E — Round + Voting polish (completed, v50)
No migration. Three coordinated additions.

- **H3 — Round 2+ entry overlay.** `_showingRoundBanner` flag + 2400ms ROUND N / GO! overlay fires in `handleRoomChange` on `oldStatus === 'results' && state.room.status === 'playing'`. Gates `triggerSearch` via the flag added to `showView` and `render` slot-reveal gates. Tail kicks `triggerSearch` (later replaced by `runCurtain` chain in Batch H).
- **H4 — Vote-reveal cascade.** Per-card stagger via CSS `nth-child(N)` `animation-delay` (200ms × card index) on `.hub-vote-count--reveal`. `voteRevealPulse` shortened from 1500ms to 700ms. `tallyAndAdvance` reveal window bumped from 1500ms to 1900ms (longer-wins per pacing).
- **M3 — Vote-pulse re-trigger guard.** `data-revealed="true"` attribute on the count element + a parallel short-circuit in `onBeforeElUpdated` (placed BEFORE the existing `data-morph-skip` check). Prevents debouncedRender from re-applying the pulse on already-animated elements.

**Final `onBeforeElUpdated` allowlist order** (after Batch E, unchanged through G+H): (1) `data-revealed="true"` on both fromEl and toEl → return false; (2) `data-morph-skip="true"` on fromEl → return false; (3) existing slot-cell guard.

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

## Roadmap status

The original 4-ship roadmap (Batches A–G) is **done**. Batch H closed the playtest gaps that surfaced after E/G landed. From here, work is driven by playtest feedback or BACKLOG items rather than a pre-planned ship sequence.

For "what comes next" candidates, see `BACKLOG.md`. For full-flow context before touching the turn/round/voting paths, read `FLOW.md` + `FLOW-OVERVIEW.md` first.

---

## Schema migrations

Four migrations exist in `migrations/`:
- `001_add_avatar.sql` — `yt_players.avatar TEXT`
- `002_add_streak_fields.sql` — `yt_rooms.last_round_winner TEXT, streak_count INTEGER`
- `003_add_skip_vote.sql` — `yt_players.thumbs_down BOOL DEFAULT false; yt_rooms.video_started_at TIMESTAMPTZ`
- `004_add_selected_playlist.sql` — `yt_rooms.selected_playlist_id TEXT` (Batch G)

All four have been run on the deployed Supabase (004 ran alongside the Batch G JS push). Future migrations:
1. Land as `migrations/NNN_name.sql` AND update `schema.sql` inline.
2. Be run on Supabase BEFORE the JS that depends on them ships (otherwise INSERT/UPDATE 400s on unknown columns).

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

## Picking up the next session

1. Read this HANDOFF for state context + saved-memory recap.
2. Read `FLOW-OVERVIEW.md` for a one-screen mental model of every path.
3. Read `FLOW.md` only if you need file:line precision for a specific beat (you usually do before changing a transition).
4. Read `BACKLOG.md` for the candidate work pool. Items are sized (S/M/L) with rough scope.
5. Pick a triage path:
   - **Playtest report from the user** → bug-investigator with the reported symptoms; produce a diagnosis brief; then app-developer with the fix spec.
   - **Polish/feature pull from BACKLOG** → if the entry has a "Recommended shape (gut)" note, it's design-complete enough for app-developer; otherwise refiner first.
   - **New idea** → idea-man → refiner → project-manager → app-developer. Don't skip refiner; it catches scope creep.
6. Bump cache-bust on every JS edit. New schema columns require a migration file AND a `schema.sql` update AND the user running it on Supabase before the JS lands.
7. Push to master after each coherent commit. Don't pause to ask (solo dev preference).

The original roadmap is closed. Future work is reactive — driven by playtest, BACKLOG, or fresh ideas, not a pre-planned ship sequence.
