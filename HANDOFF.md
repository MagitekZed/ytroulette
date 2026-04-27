# YouTube Roulette — Session Handoff

Read this first when picking up the project in a new session. It captures current state, recent decisions, and the next likely thing to work on.

**Last updated:** 2026-04-26 — end of pre-game polish Phase 1 (game-start arc).

---

## At a glance

- **What it is:** Jackbox-style party game. A "Hub" (TV/desktop) shows the room code; phones join with the code. Each round, every player gets a turn. On their turn: a random 4-character search term is generated, the Hub does a YouTube search and displays a 20-thumbnail grid, the active player picks one via a numbered grid on their phone, the Hub plays the video, then "Stop & Next" advances. After everyone's turn, all players vote. First to N points wins.
- **Stack:** Vanilla JS, no build step. Supabase for realtime + a single Edge Function for the YouTube search. GitHub Pages deploy.
- **Deploy URL:** `magitekzed.github.io` (root, not a subpath).
- **Repo:** `https://github.com/MagitekZed/ytroulette`
- **Current cache-bust:** CSS `?v=30`, JS `?v=29`. Every JS edit bumps this in lockstep across `index.html`, both imports in `js/app.js`, and the import in `js/ui.js`.
- **Schema:** `schema.sql` is canonical. Migrations live in `migrations/NNN_name.sql` and are run manually via Supabase SQL Editor.

---

## File map

| Path | What's there |
|------|--------------|
| `index.html` | Single-page shell. CDN scripts (Supabase, morphdom, YT IFrame, qrious). Cache-bust on the bottom script tag + the CSS link. |
| `js/app.js` | State, Supabase realtime, game logic, event delegation, slot-reveal helpers. ~1100 lines. |
| `js/ui.js` | All view rendering as HTML strings. `tallyVotes`, `avatarContent`, `getPlayerColor` exported helpers. |
| `js/hub.js` | YT IFrame player lifecycle + `buildPool` filter. |
| `js/config.js` | Supabase URL + anon key. |
| `css/styles.css` | Mobile-first dark theme with glassmorphism. ~1900 lines. |
| `schema.sql` | Canonical Supabase schema. |
| `migrations/` | Manual SQL migrations. Run before deploying JS that depends on them. |
| `supabase/functions/youtube-search/index.ts` | Edge Function. Filters non-embeddable, `#shorts` titles, ≤10s clips. Has a fallback search if the first pass returns <5 videos. |
| `BACKLOG.md` | Deferred-but-good ideas, with rough scope per item. |
| `HANDOFF.md` | This file. |
| `.claude/launch.json` | Local dev server config (`npx serve .` on port 3000). |

---

## Recent work (latest sessions)

### Pre-game polish — Phase 1: game-start arc (completed)
designer → refiner → project-manager → app-developer pipeline. Total arc from "all ready" to first thumbnail = ~8.6s (countdown + curtain + slot reveal). Full plan in BACKLOG / archived planning notes; Phases 2/3/tail still queued.

**Infrastructure:** added `<div id="hub-overlay">` + `<div id="hub-banner">` siblings of `#yt-player-wrapper` in `index.html`. Both live OUTSIDE `#app` so morphdom never touches them — JS owns full DOM lifecycle. New `state` flags: `_showingCountdown`, `_countdownTimeouts`, `_showingCurtain`, `_curtainTimeout`, `_joinBannerQueue`, `_joinBannerActive`, `_joinBannerTimeout`, `_justJoinedIds`. All reset in `clearSession`. New helpers: `setOverlay/clearOverlay/setBanner/clearBanner`, `reducedMotion()` matchMedia gate.

**Item 5 — Ready-up countdown:** `runCountdown()` runs 3-2-1-GO! at 1000ms intervals + 1200ms GO! tail (lets the goShockwave finish). Cancellable via `abortCountdown()`. Hub auto-start hook in `handlePlayerChange` UPDATE branch now calls `runCountdown` instead of `startGame` directly. The 2s safety-net poll suppressed during countdown via `&& !state._showingCountdown`. Abort fires on UPDATE (un-ready) and DELETE (drop below 2 players). Reduced-motion variant: 600ms "Starting..." text fade.

**Item 3 — Game-start curtain:** `runCurtain()` chains off countdown — shows "First up: [Name]" for 1.6s (400 in + 800 hold + 400 out via CSS keyframes). Player name in `getPlayerColor()` with text glow. `triggerSearch` gated by `!state._showingCurtain` — curtain's tail calls it on cleanup. `startGame()` got an optimistic local-state update for `player_order` so `runCurtain` can read `player_order[0]` without the realtime echo round-trip. Reduced-motion: 600ms text fade.

**Item 2 — Player join fanfare:** INSERT-only trigger in `handlePlayerChange`. Skips own-player. Adds id to `_justJoinedIds` for 600ms (ui.js reads this set to emit `data-newly-joined="true"` on the `.hub-player-item` for slide-in entrance). Queue-driven banner: `enqueueJoinBanner` → `runJoinBanner` drains sequentially. Banner positioned bottom (`.hub-banner--join` modifier) above the admin bar. ~2020ms per banner (280 in + 1500 hold + 240 out). Inner `.hub-join-banner` handles Y-motion; parent `.hub-banner` keeps `translateX(-50%)` for centering. Reduced-motion: opacity-only.

**Z-index scale established:** grid 10, banners 50, overlays 100. (Existing toast 1000, yt-player-wrapper 500 — banners sit behind a playing video, intentionally.)

### Audit remediation (completed)
A bug-investigator + project-manager + app-developer pipeline went through the full game flow and produced 18 findings. All shipped across 4 commits (39dc884, d3c88b7, 6e9aaa1, 6d96547). Key durable fixes:
- `state.isProcessing` consolidated INSIDE action functions (`startGame`, `tallyAndAdvance`, `nextRound`) with try/finally — no more soft-locks on throws.
- `state._lastTalliedRound` per-round token to block double-tally race (the realtime score-echo arriving back at the host after Call #1 finished but before the room-status echo flipped local state).
- `playback_status: 'search_failed'` is a real status — explicit branches on Hub and player phone instead of inferring from `idle + empty results` (which misfired between turns).
- Phone host leaving = end room (matches Hub-leave pattern, uses confirm overlay).
- Mid-round joiners are spectators until next round (gated on `player_order`).
- Hub rejoin during `playing`/`searching` resumes correctly.

### UX/UI improvements (completed — Phases A/B/C)
A 10-item plan from idea-man → refiner → project-manager. All shipped:

**Phase A** (no schema): adaptive Hub grid (count-aware columns, 16:9 cells), QR code in lobby (280px, links to `?join=ROOMCODE`), haptic micro-feedback on phone taps, active-player spotlight glow on the grid.

**Phase B** (no schema, voting trio): blind voting (Hub hides counts during, 1.5s reveal pulse before results), numbered vote grid on phone (mirrors Hub corner pills), last-voter spotlight (Hub dims voted cards + holdout pulses gold + holdout's phone shows "Everyone's waiting for you...").

**Phase C** (2 migrations): slot-machine term reveal on Hub (1800ms staggered locks + 1000ms hold = 2800ms min before grid; min-time enforced in `triggerSearch` so it always plays in full), emoji avatars (20-emoji set, tap your own to cycle, optimistic + 300ms-debounced DB write), Hot Streak badge (🔥 ×N pill on results when same player wins consecutively, badge-only no bonus points).

### Slot-reveal polish (followed Phase C)
Multiple iterative fixes after playtest:
- Slowed down spin (60ms→80ms ticks, 1000ms→1800ms total locks).
- Optimistic state updates in `showView` and `triggerSearch` so the searching view renders without waiting for DB round-trip echo (eliminated empty-grid flash).
- `searchStartTime` re-anchored so the full reveal plays out.
- Removed `.hub-char` `charReveal` entrance animation (it was running on top of the slot machine producing a "loading one at a time" effect).
- Added `hubGridFadeIn` + `hubThumbFadeIn` cascade for smoother grid arrival.
- Moved `--rolling` class out of source HTML (JS owns the lifecycle); morphdom `onBeforeElUpdated` callback skips updates on rolling/locked cells unless `data-final-char` differs.
- Simplified `reSearch` to skip the intermediate `idle` write that caused a flash.

### Tooling
Created `~/.claude/agents/designer.md` — a senior UI/UX/motion designer agent. Read-only (Read/Grep/Glob/WebFetch/WebSearch), opus model, outputs concrete specs (durations in ms, easing curves, hex colors, dimensions) ready for app-developer. Two modes: greenfield (design new things) and review-and-polish (specific improvements with prioritized issues).

---

## Active threads / what's likely next

### Open (raised but not yet acted on)
- **"Bad transition between videos with empty video grid border before next roulette."** User raised this then said "nevermind." Worth a one-line investigation: when a turn ends and the next active player's term arrives, there may be a brief flash of the empty grid before the new searching view kicks in. The optimistic update in `showView` only fires for hub-enters-game with `idle` status — but turn transitions don't go through `showView` (status stays `playing`, only term changes via `handleRoomChange`'s term-change branch). The branch DOES call `triggerSearch` which has its own optimistic update — so this should already be covered. But it's worth a check next session if the user re-raises.

### Pre-game polish — Phases 2/3/tail (queued)
Designer + refiner + project-manager pipeline produced detailed plans for these. Outlines below; full step-level detail to be re-derived per phase by re-engaging project-manager.

**Phase 2 — Lobby polish:**
- **Item 1 — Hub lobby ambient motion** (CSS-only): room code idle breathing, body background gradient drift, `.hub-title` kinetic entrance on lobby mount. *Cut from designer's spec: floating thumbnail confetti (would fight morphdom).*
- **Item 7 — QR code frame upgrade:** wrap `#hub-qr` canvas in `.hub-qr-wrapper` with 12px gold border + 4 viewfinder corner brackets (4 child divs — pseudo-elements can't do all 4) + idle scale breath + "SCAN TO JOIN" label. Side-by-side layout at min-width 720px. Scan-feedback flash on INSERT (same hook as join fanfare).
- **Item 8 — Player card visual upgrade:** 4px left border in `getPlayerColor()`, avatar 38px → 56px, idle bop via CSS `nth-child(N)` stagger (NOT inline animation-delay — would reset every render), ready celebration on `false→true` via `_justReadiedIds` flag set. *Cut: 3-dot waiting loader (redundant with existing "○ Waiting").*
- **Item 12 mini — Phone room code badge typography fix** (~5min): `.room-badge` 0.7rem→0.85rem, weight 700→800, letter-spacing 3px→4px.

**Phase 3 — In-game polish:**
- **Item 10 — Slot cell visual texture** (CSS-only, doesn't touch motion logic): layered gradient (dark top/bottom, lit middle) + chrome top/bottom borders + inset shadows + outer gold glow on `.hub-char`. Roll state: 0.4px blur + trailing text-shadow. Lock state: white-light glint sweep via `::after` (320ms one-shot). *Note: `.hub-char` needs `position: relative; overflow: hidden` added.*
- **Item 6 — Turn-change announcement banner:** fires on `current_player_index` change in `handleRoomChange`. Uses `#hub-banner` with `.hub-banner--turn` modifier (top-positioned). 1320ms total (280 in + 800 hold + 240 out). New `state._showingTurnBanner` flag delays `triggerSearch` by 1400ms; slot cells hidden during banner via parent class. **First-turn skip:** check `!state._showingCurtain` — curtain owns turn 1, banner owns turns 2+. *Cut: persistent active-player display upgrade (would break top-bar flex at TV resolutions).*
- **Item 11 — Hub admin bar refinement** (mostly CSS): default opacity 0.25, `:hover` to 1.0, 60px hover zone above bar. Auto-hide during `playback_status === 'searching'` via `.hub-admin-bar--hidden` class. *Cut: `[H]` keyboard shortcut (idle-dim covers the noise problem).*

**Tail-end:**
- **Item 4 — Home screen polish:** kinetic title intro + "Roulette" gradient sweep + button hierarchy reframe (Host Hub → primary `btn-gold btn-lg` + "RECOMMENDED FOR TV" microcopy; others stay secondary). Currently all 3 buttons compete equally. *Cut: decorative spinning background circle (redundant with Phase 2 body gradient drift).*

**Rejected during refinement:**
- Item 9 — rotating lobby copy (would fight morphdom every render; nobody stares at the lobby long enough for 3 cycles anyway).
- Item 12's larger scope (phone badge expansion + QR + copy button) — kept only the typography fix.

**Cross-cutting decisions:**
- All motion items get `prefers-reduced-motion: reduce` overrides in the consolidated `@media` block at end of `css/styles.css` (currently has Phase 1 entries; will grow per phase).
- No sound — deferred indefinitely.
- Per-phase cache-bust bump: Phase 2 → `?v=27`, Phase 3 → `?v=28`, tail → `?v=29`.

### Other open
- **"Bad transition between videos with empty video grid border before next roulette."** Raised then dismissed in a prior session. Worth a check if user re-raises — the optimistic update in `triggerSearch` should already cover turn-transitions.

### Backlog
See `BACKLOG.md` for the full list. Top items by likely user interest:
- Hub voting screen full visual review (M scope)
- Round Recap Reel (M-L, needs `past_picks` history → schema work)
- Playlist first-video unavailable fallback (S-M, multiple options to choose from)
- Search-term ↔ Superpowers spacing (S, pure CSS)
- Remove O/0 from room code generation (XS, one line in `ROOM_CHARS`)

---

## How to run / test

### Local dev
```bash
cd "O:/Projects/AI Projects/Vibe Coding/YouToube Roulette"
npx -y serve .
```
Open `http://localhost:3000` on desktop + phone (same wifi, use desktop's LAN IP). Multiple browser tabs/profiles work for testing multi-player flows.

In Claude Code, `mcp__Claude_Preview__preview_start` with name `ytr` starts a server (config in `.claude/launch.json`).

### Deploy
GitHub Pages auto-deploys on push to `master`. Cache-bust ensures the browser fetches fresh files. Hard-refresh after the new `?v=N` URL in DevTools Network tab confirms the bump landed.

### Schema migrations
Two migrations exist in `migrations/`:
- `001_add_avatar.sql` — `yt_players.avatar TEXT`
- `002_add_streak_fields.sql` — `yt_rooms.last_round_winner TEXT, streak_count INTEGER`

Both have been run on the deployed Supabase. Future migrations should:
1. Land as `migrations/NNN_name.sql` AND update `schema.sql` inline.
2. Be run on Supabase BEFORE the JS that depends on them ships (otherwise INSERT/UPDATE 400s on unknown columns — same kind of bug as the original `selected_video_id` issue).

### Test checklist (run if you've changed something significant)
1. Hub create → 2 phone joins → both ready → game starts. (Tests realtime + auto-start.)
2. Each phone takes a turn, picks a video. (Tests turn flow + slot reveal between turns.)
3. Voting: cast all votes, watch the 1.5s reveal pulse, see results. (Tests blind voting + tally race protection.)
4. Repeat 2-3 across multiple rounds until win-condition. (Tests Hot Streak, score progression, no soft-lock.)
5. Phone-host leave from a non-Hub room with another player connected. (Tests confirm overlay + room deletion + host-ended view on the other phone.)
6. Hub refresh mid-game during `playing` state. (Tests `attemptHubRejoin` resume.)

---

## Decisions log (non-obvious)

- **Optimistic local state updates** in `showView` and `triggerSearch` — to avoid the empty-grid flash from waiting for the DB round-trip echo before rendering the searching view. Tradeoff: local state can briefly diverge from DB, but the realtime echo reconciles within ~200ms.
- **Per-round dedupe token** (`state._lastTalliedRound`) instead of relying on `isProcessing` for tally protection — necessary because `isProcessing` resets in `finally` BEFORE the room-status realtime echo arrives back at the host, re-opening the race that was previously closed by leaving the flag set.
- **morphdom `onBeforeElUpdated` callback** owns the slot-cell lifecycle while reveal is in progress. JS adds/removes `--rolling` and `--locked` classes; morphdom doesn't touch them unless `data-final-char` changes (a new term).
- **Hot Streak is badge-only**, no bonus points (per user decision). Just visual feedback for consecutive wins.
- **"No Winner" votes BLOCK the unanimous bonus** (per user decision). One abstain prevents the 2pt bonus even if everyone else agrees.
- **Past_terms accumulates across rounds** (per user decision) — kept for future use (e.g., a recap reel that shows which terms produced the best videos).
- **Polling interval at 2s** is a deliberate fallback to realtime, not a bug. The interval handle is stored in `state._pollInterval` for diagnostics but NOT cleared in `clearSession` (it runs for the page lifetime).
- **Cache-bust strategy** is a single integer bumped per phase/commit-batch across `index.html`, `app.js`'s two imports, and `ui.js`'s one import. No CSS-only bumps unless CSS is the only file that changed.

---

## Known quirks (intentional or acknowledged)

- **No password / auth** — open RLS policies. Anyone with the room code can join. By design for a casual party game.
- **Room codes can collide** — `generateRoomCode` retries 10 times then gives up with a toast. Stale-room cleanup runs on every create (rooms older than 24h get deleted).
- **Mobile autoplay restrictions** — sound was deferred for this reason. Music + UI sounds are listed in BACKLOG but not built.
- **YouTube ad/conversion tracking errors in console** — comes from inside the YT iframe, blocked by uBlock Origin if the user has it. Not our code, not a bug. Safe to ignore.
- **Hub admin "force-next-round" action** is dead code — defined in the click handler switch but no UI references it. Left in case a future Hub admin UI uses it.
- **Existing players with `avatar = NULL`** render their initial letter instead of an emoji. Backwards-compatible — no data migration needed for old rows.

---

## Coding conventions

- Vanilla JS, 2-space indent, ES modules with explicit `?v=N` cache-bust on imports.
- No semicolon obsession (consistent with existing code).
- No comments unless intent is genuinely non-obvious — well-named identifiers carry their own meaning.
- Don't add error handling for scenarios that can't happen — trust internal code; only validate at system boundaries (user input, external APIs).
- Optimistic UI updates are preferred over loading spinners where the eventual reconciliation is harmless.
- Don't commit if the user hasn't explicitly asked. Especially: don't commit when migrations need to run first.
- Cache-bust EVERY JS edit (`index.html`, both `app.js` imports, `ui.js`'s one import). Single new integer per commit.

---

## Agent lineup (for context)

| Agent | When |
|------|------|
| `bug-investigator` | User reports broken behavior. Read-only diagnosis with file:line evidence. |
| `idea-man` | "What could we add?" Unfiltered brainstorm of 8-25 ideas. |
| `refiner` | After idea-man — accept/reshape/reject ideas into concept cards. |
| `designer` | After refiner OR for design reviews — concrete visual/motion specs (durations, easings, dimensions). |
| `project-manager` | Concept-complete features → phased implementation plan. |
| `app-developer` | Plan in hand → write the code. |
| `database-engineer` | Schema, migrations, RLS, query review. |
| `rules-lawyer` | Validate against external sources (specs, docs). |

The designer agent is new this session and hasn't been run yet.
