# Tube Roulette — Motion System & The Card Deal

A design doc for the holistic visual-effects pass. The **Card Deal** (grid reveal) is specced
build-ready; the rest of the motion system is captured at design-direction level (validated
concept, needs a short detail pass before its own build).

**Companion docs:** `FLOW.md` / `FLOW-OVERVIEW.md` (existing beats + timings), `HANDOFF.md` (project state).

---

## 0. Status & scope

| Section | Readiness |
|---|---|
| Motion tokens + signature gesture (§2–3) | **Build-ready** — pure additive foundation |
| ★ The Card Deal / grid reveal (§4) | **Build-ready** — deeply specced + adversarially reviewed |
| Other signature moments (§5) | Direction — concept validated, needs a detail pass |
| Micro layer (§6) | Direction — mostly CSS, low risk |
| View-transition engine (§7) | Direction — plumbing, ships last, has a must-fix list |

**Hard constraints (saved project memory — non-negotiable):**
- **Full motion always.** `reducedMotion()` is hardcoded `false`. No `prefers-reduced-motion` guards.
- **Comprehension over speed for BEATS** (1.6–4.2s holds), but **navigation is fast** (150–520ms). Two clocks.
- **Hub = TV/desktop**, possibly weak hardware (Chromecast / smart-TV / HDMI stick). **60fps is non-negotiable**; dropped frames are the #1 "cheap" tell. Compositor-safe properties only (`transform`, `opacity`) in any hot path.
- **Hub & Players** terminology. Vanilla JS, no build step, no heavy deps.

---

## 1. The reframe

The in-game **beats are already premium and they are the spine** — the countdown, the curtain, the
slot-machine term reveal, the Studio Card Lift, the winner overlay. The gap was never "we need a
view-transition engine." It was three things:

1. **No single recurring gesture** to make every altitude feel like one hand.
2. **Under-built signature moments** where the game is most exciting (the grid reveal chief among them).
3. **Hard-cut seams** between beats.

So the work is: **tokens + a signature gesture + signature moments + connective tissue.** The
view-transition engine is real but demoted to quiet plumbing for the few un-beated nav moments (§7).

---

## 2. Motion tokens

Add to `:root`. These promote the existing inline cubic-beziers to named vars (existing usages keep
working; new work references the tokens) so the new system *is* the old hand.

```css
/* Navigation durations (the fast clock) */
--dur-instant:  90ms;   /* tap acknowledgment, active press        */
--dur-quick:   180ms;   /* hover, focus, single element in         */
--dur-snap:    280ms;   /* workhorse: component enters, toasts     */
--dur-move:    420ms;   /* view-to-view crossfades                 */
--dur-sweep:   520ms;   /* heaviest nav move                       */
/* Comprehension beats (1600–4200ms) are authored one-offs, deliberately NOT in this scale. */

/* Stagger (collapsed to two — 45 vs 70 was imperceptible) */
--stag:         60ms;   /* lists, rows, grid cells                 */
--stag-beat:   200ms;   /* dramatic cascades (matches vote reveal) */

/* Easings (promoted from existing curves) */
--ease-out:    cubic-bezier(0.2, 0, 0.2, 1);      /* utility exit velocity         */
--ease-rise:   cubic-bezier(0.22, 1, 0.36, 1);    /* arrivals (bulk staggers)      */
--ease-in:     cubic-bezier(0.4, 0, 1, 1);        /* departures                    */
--ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);    /* symmetric morphs              */
--ease-over:   cubic-bezier(0.16, 1.4, 0.3, 1);   /* position overshoot (deal-in)  */

/* THE SIGNATURE GESTURE (see §3) */
--ease-settle: linear(0, 0.7 18%, 1.08 40%, 0.98 62%, 1.02 80%, 1);

/* Spatial / elevation */
--lift-sm: 12px; --lift-md: 28px; --lift-lg: 48px;
/* z: grid content 10 · banners 50 · overlay 100 · iframe 500 · turn-banner 600 · card-lift stage 700 · toast 1000
   (these are the EXISTING values — verify before assuming; the proposal's earlier "overlay 600" was wrong) */
```

---

## 3. The signature gesture — `--ease-settle`

The house style already has a fingerprint nobody had named: **overshoot-and-settle** (`nameSlam`
1.15→0.96→1.04→1.0; `goImpact` →1.45 then settle; `readyConfirm` 0.96→1.04→1.0). Name it and make it
recur deliberately.

- **Rule:** every *arrival of consequence* lands on `--ease-settle` — card-deal lands, the search-term
  lock, the form-card open, the winner row, toasts.
- **Reserve** plain `--ease-rise` for *bulk background* staggers so the settle stays special by contrast.
- One verb, two intensities. This single discipline is what turns "a tasteful list of five easings"
  into one coherent feeling.

---

## 4. ★ The Card Deal — grid reveal  *(build-ready hero)*

**Intent:** the search-results grid doesn't *appear* — it's **dealt**. Thumbnails fly onto the felt
like a croupier's deal, landing with weight and an overshoot detent, the last beat punctuated by a
grid-wide shimmer in the active player's color. Anticipation → weight → payoff.

### 4.1 Why a card deal, not a slot-reel

We seriously specced the literal slot-machine spin and rejected it for three **structural** reasons
(not taste):

1. **The content fights the metaphor.** Slot symbols are iconic/high-contrast; YouTube thumbnails are
   busy photographic rectangles that average to a brown-grey smear when spun at speed — reads as
   "video buffering glitch," not "chance." Intrinsic to the content, not tunable.
2. **Premium and perf-safe are opposed for a reel.** The premium version (fast + blurred + clunking)
   janks on a weak Hub; the perf-safe version (slow, no blur) *is* the cheap version. A card deal is
   **pure compositor transforms** — its premium form and its perf-safe form are the *same* version, so
   the cheapness/jank risk is designed out, not mitigated.
3. **Novelty spend.** The term reveal is *already* a literal slot machine ~3s earlier. A second spin
   makes both feel cheaper. Changing the verb (spin → **deal**) keeps the casino/chance world
   (roulette, blackjack, baccarat all live on the felt) while letting the grid be its own moment.

**The "Roulette" name is still honored** — by the term reveal's literal spin, and by the *pattern* of
the deal (a left→right row sweep, or an outer-ring-inward spiral; see §4.4).

### 4.2 Adaptive cadence (the count rule)

The edge function can return up to **25** results. Cadence adapts so total time stays bounded:

| Results | `cols` (existing formula) | `rows` | **Cadence** | Beats |
|---|---|---|---|---|
| 1 | 2 | 1 | one card at a time | n |
| 2–4 | 2 | 1–2 | one card at a time | n |
| 5 | 3 | 2 | one card at a time | 5 |
| 6 | 3 | 2 | **one row at a time** | 2 |
| 7–8 | 4 | 2 | one row at a time | 2 |
| 9–12 | 4 | 3 | one row at a time | 3 |
| 13–20 | 5 | 3–4 | one row at a time | 3–4 |
| 21–25 | 5 | 5 | one row at a time | 5 |

`cols` is the existing `renderHubGame` formula (`≤4→2, ≤6→3, ≤12→4, else 5`). Row of cell `i` =
`Math.floor(i/cols)`, column = `i % cols` — both known at render, emit inline
`style="--row:..; --col:.."`. **Threshold: ≤5 → one-at-a-time; >5 → one-row-at-a-time.**

**Timing — Mode A (≤5, one card at a time):**

| Step | Value |
|---|---|
| Card `i` launch | `i × 120ms` |
| Flight | 440ms, position `--ease-over`, land-pop scale `--ease-settle` |
| Last card lands | ≤ ~920ms (i=4 → 480ms launch + 440ms) |
| Hero beat (shimmer) | fires on last land, ~360ms |
| **Total** | **~1.2s** |

**Timing — Mode B (>5, one row at a time, R rows):**

| Step | Value |
|---|---|
| Row `r` launch | `r × 150ms` |
| Intra-row micro-stagger | card col `c` adds `c × 35ms` (hand fans down, not a rigid bar) |
| Flight | 440ms, same curves |
| Last row launch (R=5) | 600ms; last card +140ms = 740ms; lands ~1180ms; settles ~1340ms |
| Hero beat (shimmer) | fires as last row lands, ~360ms tail |
| **Total (25 cards)** | **~1.5s** · (20 cards ≈ 1.4s) |

Both modes cap at 5 sequential beats, so the moment never drags regardless of count.

### 4.3 Choreography (the deal)

- **Deck origin:** top-center, just above the grid (the "dealer's hand"). A faint deck stub may sit
  there pre-deal; grid slots show faint empty outlines.
- **Flight:** each card translates `deckXY → slotXY` with a slight `rotate(-10deg → 0)` and
  `scale(0.96 → 1.0)`. Position uses `--ease-over` so the card slides a hair **past** its slot then
  back — the overshoot of a real dealt card.
- **Land detent:** on arrival the card pops `scale 1.06 → 1.0` via `--ease-settle` (the signature
  gesture) + a one-shot active-color **edge flash** on the existing `.hub-thumb::after` top strip
  (opacity `0.7→1.0→0.7`, ~200ms) — the per-card "snap." Number badge fires the existing `hubNumPunch`.
- **Card treatment:** even face-up, cells should *read as cards* — rounded corners (already present),
  a subtle drop shadow during flight, the 3D-ish rotate-settle — so the deal reads as a deal, not as
  "images sliding in from a point."
- **Within a row (Mode B):** the 35ms left→right micro-stagger makes a row land as a fanned hand, not
  a slab (a flat simultaneous row lock looks like a sprite swap).

### 4.4 The hero beat (payoff)

When the **last** card/row lands:
1. **Heavier settle** on the final card(s): `scale 1.08 → 0.99 → 1.0` over 300ms (the last beat weighs more).
2. **Grid-wide shimmer** — one active-color light sweep crosses `.hub-grid` left→right, reusing
   `curtainShineSlide` mechanics: a `.hub-grid-shine` layer,
   `linear-gradient(105deg, transparent, color-mix(in srgb, var(--active-color) 35%, white), transparent)`,
   width ~30% of grid, `translateX(-120% → 320%)` over **420ms `--ease-out`**. Ties the 25 cells into
   one object at the instant it becomes one.
3. **Frame bloom** — the grid's existing active-color `box-shadow` pulses brighter then back, ~360ms
   ("powers on").
4. *(Optional)* 4–6 active-color sparks off bottom-center, reusing `curtainSpark1-6` verbatim.

**Roulette nod (optional layering):** deal rows in a left→right sweep, OR run the *land* order as an
outer-ring-inward spiral so the cards settle like a ball coming to rest around a wheel.

### 4.5 Handoff from the term reveal (the seam)

Today: term locks in `'searching'` → a ~1000ms dead hold → hard view swap to `'selecting'` (grid).
That gap is where two mechanics feel like two events. Make the term reveal the **windup** and the deal
the **payout**:

- **Cut the post-lock hold** ~1000ms → ~450ms.
- On the final character lock, the term cells **charge**: synchronized `scale 1.0→1.06→1.0` (180ms,
  `--ease-settle`) + a faint active-color underline wipe (reuse `curtainShineSlide`, 250ms). Reads as
  "the handle bottoms out."
- The term then **docks** to its `.hub-search-term-inline` slot in the selecting top bar (it already
  lives there) — shrinks/flies up — while the grid mounts and the **deal inherits the wipe's left→right
  vector**. One gesture: question cranks → bottoms out → throws the board → docks itself.

### 4.6 Faces, backs & the filler problem

A reel has no good "what shows before reveal" filler. A deal does: **the card back.**

- **Primary (highest floor, fastest):** deal **face-up** with full card treatment. Simplest, no second
  asset, no flicker risk. Pre-deal slots are empty outlines.
- **Recommended flourish (if time/perf allow):** deal **face-down** (branded back: gold-foil monogram
  on near-black, active-color edge glow) and **flip-on-land** — `rotateY(0→90→0)`, swap back→thumbnail
  at 90°, ~200ms, concurrent with the land detent. Keeps the casino "reveal" delight **without** a
  separate full-grid flip phase (that second phase is what blows the time budget at 25). The flip is
  *part of* the landing, not after it.

Decide face-up vs flip-on-land during build based on measured cost; both are single-phase and fit the
timing tables.

### 4.7 Physics & curves (cheap-vs-expensive lives here)

- **Flight position:** `--ease-over` (`cubic-bezier(0.16,1.4,0.3,1)`) — overshoots the slot, returns.
- **Land scale-pop:** `--ease-settle` — the signature detent.
- **No "stops dead":** the overshoot + settle is what gives weight. A linear/ease-out stop with no
  overshoot is the #1 motion tell and would look foreign to this game's own beats.
- **Hero card** overshoots heavier (1.08 vs 1.06) and longer (300 vs ~220ms).

### 4.8 Audio (optional layer — recommended)

A deal has a great, *cheap-to-synthesize* sound vocabulary (flick / snap / settle) and no busy
"casino blare" risk.

- **Hub only.** Unlock `AudioContext` on the game-start user gesture (someone clicked host/start) — no
  autoplay violation. Phones stay silent.
- **Synthesize, don't bundle** (Web Audio, zero assets): per-card/row deal = a short filtered-noise
  "flick" (~12ms); the hero land = a fatter low **settle-thunk** (90→70Hz sine + overtone, ~140ms).
  Rhythm: flick-flick-flick … **thunk**.
- **Phone haptic (active player only):** at the hero land, `navigator.vibrate([0,40,30,80])` on the
  device where `state.playerId === activePlayerId` — they feel the payoff in hand while the Hub thunks.
  No-op where unsupported = free.
- **Strictly additive.** Master ~-12dB, Hub mute in the admin bar, visual fully self-sufficient if
  audio is unavailable. Ship visual-first; the lock timestamps are the trigger points for an audio pass.

### 4.9 Performance (perf-safe by construction)

- **Hot path = `transform` + `opacity` only.** Zero `filter: blur` anywhere. This is the whole reason
  the card deal beats the reel — it can't jank the way a blurred scroll does.
- **`will-change: transform`** added when a card's flight starts, **removed the instant it lands.**
  Never global, never permanent (a left-on `will-change` is its own leak/tell).
- **Layer budget:** at most one row in flight at a time (Mode B) or one card (Mode A) → a handful of
  promoted layers at any instant, all demoted by the end. Trivial 60fps even on a Chromecast.
- **No layout reads in the loop:** column/row emitted inline at render; timing from `performance.now()`
  deltas (same pattern as `startSlotReveal`). Nothing touches `top`/`height`/`width`.
- **Image readiness:** reuse the same thumbnail URLs already in `search_results` (same cache entries as
  the `<img>`). If a card's image hasn't decoded, it flies as a tinted dark card and swaps on decode —
  never a broken-image glyph mid-flight.

### 4.10 Re-entry (reroll / replace / re-search) — delights once, not ten times

After a superpower the room reverts to `'selecting'` with updated `search_results` and morphdom
re-diffs. The full deal must **not** re-run every time. Discriminate by diffing incoming results
against the rendered set (by index + thumbnail URL):

- **0 changed** (echo, or non-mutating return): **no animation.** Guard via a `_cardDealDone` flag +
  `.hub-thumb--settled` class; `onBeforeElUpdated` skips settled cells whose `data-thumb-idx` + URL are
  unchanged (mirrors the existing `hub-char--locked` skip).
- **1 changed** (reroll-one / replace-one / a tile marked `unplayable`): **only that card re-deals** —
  a ~500ms solo deal (fly in + land detent + one flick), others frozen. Matches the mental model of a
  single re-roll.
- **Many / all changed** (admin re-search, full swap): **full deal re-runs** (it's a genuinely new
  board) — but duck the hero audio (~-18dB) so repeated re-searches don't feel like a slot floor.

### 4.11 Implementation approach (reuse the proven pattern)

- **New `runCardDeal()`** alongside `startSlotReveal` (`js/app.js`), driven by per-card/row timers in a
  `cardDealTimers[]` array with the same `if (cardDealTimers.length) return;` re-entry guard and a
  `stopCardDeal()` mirror. Use `requestAnimationFrame` (not `setInterval`) for the flight ramp so the
  overshoot is smooth; store/cancel the rAF ids.
- **Trigger** from the render tail (the spot near `js/app.js:1505` that currently kicks `startSlotReveal`
  for `'searching'`) — fire when `playback_status === 'selecting'` AND `!state._cardDealDone` AND no
  banner is up.
- **Classes:** `.hub-thumb--dealing` (in flight), `.hub-thumb--landing` (detent), `.hub-thumb--settled`
  (resting, morph-skip eligible). New: `.hub-card-back` (if flip), `.hub-grid-shine`.
- **Morph-skip:** extend `onBeforeElUpdated` (`js/app.js:1468`) with one clause — dealing/settled cells
  `return false` unless their thumbnail URL changed (then `return true` so the single-card re-deal path
  replaces it). Same shape as the existing `hub-char` clause.
- **Inline at render** (`renderHubGame`, the grid cell map): `style="--row:${Math.floor(i/cols)}; --col:${i%cols}"`.
- **State flags:** `_cardDealDone` (gates re-run), `_hubLowPower` (reserved; the deal is already
  compositor-safe so this mostly gates the optional flip/sparks), `_hubAudioReady`. **All cleared in
  `clearSession`** (project pattern #3) and any timer/rAF cancelled there.
- **Untouched:** the picked-tile → Studio Card Lift path keeps working because the deal hands off to the
  same static `.hub-thumb` / `.hub-thumb-img` the rest of the app already diffs.

### 4.12 Cheap-tells checklist (each tell → its guard)

| Cheap tell | Guard |
|---|---|
| Dropped frames / jank | Hot path transform+opacity only; no blur; `will-change` promote-on-start/demote-on-land; ≤1 row in flight |
| Two identical slot machines back-to-back | Verb changed to **deal**; term reveal recast as the windup that *throws* the deal |
| Metronomic, even row stops | 35ms intra-row micro-stagger; heavier/longer hero land |
| "Stops dead" (no weight) | `--ease-over` flight overshoot + `--ease-settle` land detent on every card |
| Cards land as a rigid bar | Intra-row left→right micro-stagger (fanned hand) |
| Broken-image glyph mid-deal | Decode-gate: undecoded card flies tinted, swaps on decode |
| Re-running the full deal on every reroll | `_cardDealDone` + settled morph-skip; 0→none, 1→solo re-deal, many→full (ducked) |
| Silent, hollow landing | Optional Web-Audio flick-cascade + hero thunk + active-player haptic; gesture-unlocked, muteable |
| Garish casino blare | Woody synth not arcade beeps; ~-12dB; Hub mute; additive only |
| Empty/ugly pre-reveal state | Card backs (flip variant) or clean empty-slot outlines (face-up variant) |

### 4.13 Edge cases

- **Counts 1–25:** §4.2 table covers col/row math. Partial last row (e.g. 13 in 5 cols → last row of 3)
  deals only its present cards.
- **Very fast turns / mid-deal view change:** `stopCardDeal()` + `clearSession` cancel all timers/rAF;
  the morph-skip prevents an echo from restarting a finished deal.
- **Low-power Hub:** the deal is already 60fps-safe; if a probe still flags trouble, drop the optional
  flip (deal face-up) and the sparks. The core deal+land+shimmer is the floor and still reads premium.

---

## 5. Other signature moments  *(design direction — detail pass before build)*

### 5.1 Phone COMMIT — the active player taps their pick  *(BUILT, ?v=57)*
The phone is the *controller*; today the pick tap is a generic button scale. Make it land: tile dips
(`scale 0.92`) with a **double-tick haptic** `vibrate([12,30,12])`; snaps up `--ease-settle` to 1.06
with a player-color border flood + shadow bloom; the **other tiles recede** (`opacity 0.35, scale
0.97`) so focus collapses onto the choice; a player-color sweep wipes the tile, "sending" the pick.

**As built (v59, dialled up from the v57 first pass):** `numCellCommit` dip 0.84 → peak 1.24 → settle
1.08 (`--ease-settle`); committed cell floods to a 44% player-color fill + a 3px ring + a big 40px
glow; `numCellRecede` → opacity 0.16, scale 0.9, blur 1.5px (others recede hard with depth); a bold
`::after` `numCellSweep`; haptic `vibrate([28,45,28])`. A `_committingPick` flag holds the numbered grid for ~1150ms
(optimistically flipping `playback_status` to `playing` locally, mirroring the hub's flip) so the beat
plays before the view turns over to the Stop controls, and a slow write can't flash the grid back to a
tappable state. **Cross-device timing:** the phone beat (~700ms) deliberately overlaps the Hub's
*selection-beat start* (the Hub runs a 3000ms selection beat before the Studio Card Lift, so syncing
the sweep to the Card Lift ~2.3s later would make the controller feel laggy). Do NOT add a multi-second
phone delay to "sync" them.

### 5.2 Beat → beat color handoff (connective tissue)
Thread the active player's color through the seams: as the turn banner exits, the search-term cells are
already mounted invisibly seeded with that player's color; banner clears → cells cascade up
`--ease-settle`, borders bleeding player-color → gold as they lock. The identity hands off into the
search apparatus (and then into the deal's hero shimmer, §4.4).

### 5.3 Selector → form morph (home) + the missing back affordance
Replace the hard `.hidden` toggle: the **tapped button expands in place into the form card** (FLIP,
transform-only) while the other two buttons peel off; fields rise in `--ease-settle`. Add a `← back`
affordance (`data-action="show-picker"`) whose reverse motion collapses the form back to the button.
**Build note:** requires the `show-create/hub/join` handlers to stop using `classList.add('hidden')` as
the mechanism (it hard-cuts the morph) — drive an animation state (`is-leaving` → `transitionend` →
`hidden`) instead.

---

## 6. Micro layer  *(mostly CSS, low risk)*

Button press→spring-release (`:active scale .96 --dur-instant` → release `--ease-settle`) with haptic on
`pointerdown`; input focus glow ring (`--dur-quick`); hover standardized to `--dur-quick`; room-code
badge arrival (`--ease-settle`) + a `text-shadow` glow breath (NOT letter-spacing — that thrashes
layout); toasts routed to `--dur-snap` / `--ease-rise`; async buttons show a 3-dot pulse instead of a
dead `disabled`.

---

## 7. View-transition engine  *(plumbing — ships last, behind a kill-switch)*

The Hub literally cannot transition between views today (every Hub view shares one `.hub-layout` root,
so morphdom diffs in place and no enter animation replays). Worth fixing, but it is **not** the
headline — it fires only on the un-beated moments (home↔lobby, →gameover, →home) because the beats own
every dramatic transition.

**Approach:** wrap the existing `morphdom` call in `render()` with `document.startViewTransition`,
**gated to real `currentView` changes** (`viewChanged = currentView !== _lastRenderedView`), and
**suppressed** whenever a beat owns the screen (`_showingCountdown/Curtain/TurnBanner/RoundBanner/
WinnerBanner/Selection || _launchingVideo`). Ship behind `const VIEW_TRANSITIONS = true;`. Directional
crossfade goes **bold** (per-content-column, ~14% travel + a blur depth-cue that reads at TV distance) —
*not* a sub-perceptual 3% nudge — or we cut "direction encodes meaning" honestly.

**Must-fix list (from the feasibility review) before this ships:**
- Cross-origin **iframe won't paint** in VT snapshots → hide the YT player before `startViewTransition`
  (the `forceReconcile` path is the real gap).
- **Reentrancy:** an echo render mid-transition mutates live DOM under the frozen snapshot → defer
  renders during a transition, reconcile on `vt.finished`.
- **`host-ended` and leave→home bypass `showView`** (raw `currentView` mutation) → route through it or
  add a `_suppressNextTransition` flag.
- **First render** (`null → home`) and the post-`_launchingVideo` clear can fire spurious/late
  transitions → seed `_lastRenderedView` correctly.

---

## 8. Build sequence

1. **Tokens + `--ease-settle`** — zero risk, unblocks everything.
2. **Micro layer + the cut list (§9)** — mostly CSS, every screen feels more alive immediately.
3. **★ The Card Deal** — the hero. Build the face-up version first (strict superset of today's
   `hubThumbFadeIn`), then layer flip-on-land + the audio pass.
4. **Phone COMMIT + beat→beat color handoff** — premium where it counts.
5. **Selector → form morph** (render + JS state).
6. **View-transition engine** — last, behind the kill-switch, with §7's fixes.

Steps 1–4 deliver the bulk of the felt premium-ness; 5–6 are the structural pieces.

---

## 9. Cut list (overwrought — removed by the adversarial pass)

- ❌ Hub room-code **letter-spacing breath** — animates layout (paint thrash on the one element that
  must stay crisp) and reads as "loading." Breathe the `text-shadow` glow only.
- ❌ **White flash on game-over** — wrong emotion (that's the GO! starting-pistol vocabulary). Use a
  warm gold-wash bloom — "trophy," not "seizure."
- ⚠️ **Avatar spring-pop** — gate to first-mount only, or it twitches on every morphdom re-render.

---

## 10. Open decisions

- **Card faces:** face-up (simplest, highest floor) vs flip-on-land with branded backs (more casino
  flavor, slightly more build). Decide on measured cost during §4 build; both fit the timing tables.
- **Audio in v1 or a fast-follow:** the deal is self-sufficient without it, but the flick→thunk is half
  the feel. Recommend visual-first, audio as the immediate next pass.
- **Roulette nod intensity:** plain row sweep vs outer-ring-inward spiral land order (§4.4).

---

*Pre-publish reminder (unrelated to motion, tracked in `BACKLOG.md`): the **Tube Roulette rebrand +
YouTube attribution pass** is a hard gate before any public publish — the product still ships as
"YouTube Roulette" in code.*
