// ============================================================
// YouTube Roulette — Main Application (app.js)
// State management, Supabase integration, game logic, events
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as UI from './ui.js?v=38';
import * as Hub from './hub.js?v=38';

// ============================================================
// SUPABASE CLIENT
// ============================================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// CONSTANTS
// ============================================================
const ROOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SPECIALS = `1234567890&#()@!?:._"'-,`;  // 23 special characters for search terms
const LETTERS_AND_SPECIALS = LETTERS + SPECIALS;
const EMOJI_AVATARS = ['🎮','🦄','🚀','🐙','🍕','👻','🎯','🦖','⚡','🧙','🌮','🦊','🤖','🍄','🐸','🎸','👑','🐝','☄️','🎲'];
const DEFAULT_WIN_SCORE = 3;
const TERM_LENGTH = 4;

const reducedMotion = () => false;

// ============================================================
// STATE
// ============================================================
const state = {
  playerId: null,
  playerName: null,
  roomCode: null,
  room: null,
  players: [],
  currentView: 'home',
  channel: null,
  isHub: false,           // Hub display mode
  replaceMode: false,
  replaceCharIndex: null,
  swapMode: false,
  swapFirstIndex: null,
  isProcessing: false,
  isSearching: false,     // YouTube search in progress
  confirmLeave: false,    // Hub leave confirmation dialog
  _pollInterval: null,    // Handle for the 2s poll fallback
  _lastTalliedRound: null, // Per-round dedupe token for tallyAndAdvance (anti double-score)
  revealingVotes: false,  // Hub-only: 1.5s blind-vote reveal window after final vote
  _avatarWriteTimer: null, // Debounce handle for avatar DB writes
  _showingCountdown: false,
  _countdownTimeouts: [],
  _showingCurtain: false,
  _curtainTimeout: null,
  _joinBannerQueue: [],
  _joinBannerActive: false,
  _joinBannerTimeout: null,
  _justJoinedIds: new Set(),
  _justLoadedCells: false,
  _termJustRevealed: false,
  _turnJustStartedForMe: false,
  _justReadiedIds: new Set(),
  _resultsAnimated: false,
  _showingTurnBanner: false,
  _turnBannerTimeout: null,
  _autoAdvanceTimer: null,
  _connStatus: 'ok',
};

// Expose state for UI rendering
export { state, db };

// ============================================================
// SLOT-MACHINE TERM REVEAL (Hub searching state)
// ============================================================
// Pacing: each cell spins for ~600ms before locking, with a 400ms stagger
// between locks. Total reveal: 4 cells × 400ms stagger + 600ms spin = ~1800ms.
// triggerSearch enforces SLOT_REVEAL_MIN_MS so the grid never appears
// mid-reveal even if the search returns instantly.
const SLOT_TICK_MS = 80;
const SLOT_FIRST_LOCK_MS = 600;
const SLOT_STAGGER_MS = 400;
const SLOT_HOLD_AFTER_LOCK_MS = 1000;
// 4 chars: last lock at 600 + 3*400 = 1800ms, plus 1000ms hold = 2800ms total
const SLOT_REVEAL_MIN_MS = SLOT_FIRST_LOCK_MS + (TERM_LENGTH - 1) * SLOT_STAGGER_MS + SLOT_HOLD_AFTER_LOCK_MS;

const slotIntervals = [];

function startSlotReveal() {
  // Already running on the current cells — don't restart (would reset the spin).
  // render() can be called many times during the reveal (debouncedRender on echoes);
  // each call shouldn't yank back to time 0.
  if (slotIntervals.length > 0) return;
  // Pick up cells that haven't been spun yet (no rolling, no locked classes).
  // Locked cells are static — they've already played out and should stay put.
  const cells = document.querySelectorAll('.hub-search-term .hub-char:not(.hub-char--rolling):not(.hub-char--locked)');
  if (cells.length === 0) return;
  cells.forEach(cell => cell.classList.add('hub-char--rolling'));
  cells.forEach((cell, i) => {
    const finalChar = cell.dataset.finalChar;
    const lockAt = SLOT_FIRST_LOCK_MS + i * SLOT_STAGGER_MS;
    const startTime = performance.now();
    const tickInterval = setInterval(() => {
      if (performance.now() - startTime >= lockAt) {
        clearInterval(tickInterval);
        cell.textContent = finalChar;
        cell.classList.remove('hub-char--rolling');
        cell.classList.add('hub-char--locked');
        const idx = slotIntervals.indexOf(tickInterval);
        if (idx >= 0) slotIntervals.splice(idx, 1);
      } else {
        cell.textContent = LETTERS_AND_SPECIALS[Math.floor(Math.random() * LETTERS_AND_SPECIALS.length)];
      }
    }, SLOT_TICK_MS);
    slotIntervals.push(tickInterval);
  });
}

function stopSlotReveal() {
  slotIntervals.forEach(clearInterval);
  slotIntervals.length = 0;
}

// ============================================================
// HUB OVERLAY + BANNER (countdown, curtain, join fanfare)
// JS owns the lifecycle of #hub-overlay and #hub-banner —
// they live outside #app and morphdom never touches them.
// ============================================================
function setOverlay(html) {
  const el = document.getElementById('hub-overlay');
  if (!el) return;
  el.innerHTML = html;
  el.classList.add('is-active');
}

function clearOverlay() {
  const el = document.getElementById('hub-overlay');
  if (!el) return;
  el.classList.remove('is-active', 'is-pulsing', 'tick-flash', 'hub-overlay--go-flash');
  el.innerHTML = '';
}

function setBanner(html, modifierClass) {
  const el = document.getElementById('hub-banner');
  if (!el) return;
  el.innerHTML = html;
  if (modifierClass) el.classList.add(modifierClass);
  el.classList.add('is-active');
}

function clearBanner() {
  const el = document.getElementById('hub-banner');
  if (!el) return;
  el.classList.remove('is-active', 'hub-banner--join', 'hub-banner--turn');
  el.innerHTML = '';
}

// --- Ready-up countdown (Step 1.1) ---
function scheduleCountdown(fn, ms) {
  const id = setTimeout(() => {
    state._countdownTimeouts = state._countdownTimeouts.filter(t => t !== id);
    fn();
  }, ms);
  state._countdownTimeouts.push(id);
  return id;
}

async function runCountdown() {
  if (state._showingCountdown) return;
  state._showingCountdown = true;

  if (reducedMotion()) {
    setOverlay('<div class="hub-countdown-num hub-countdown-num--reduced">Starting...</div>');
    scheduleCountdown(async () => {
      if (!state._showingCountdown) return;
      clearOverlay();
      state._showingCountdown = false;
      await startGame();
      runCurtain();
    }, 600);
    return;
  }

  const overlayEl = document.getElementById('hub-overlay');
  if (overlayEl) overlayEl.classList.add('is-pulsing');

  const tickFlash = () => {
    if (!overlayEl) return;
    overlayEl.classList.add('tick-flash');
    setTimeout(() => overlayEl.classList.remove('tick-flash'), 180);
  };

  const tickNum = (text, modifier) => {
    if (!state._showingCountdown) return;
    setOverlay(`<div class="hub-countdown-num ${modifier}">${text}</div>`);
    tickFlash();
  };

  tickNum('3', 'hub-countdown-num--three');
  scheduleCountdown(() => {
    tickNum('2', 'hub-countdown-num--two');
    scheduleCountdown(() => {
      tickNum('1', 'hub-countdown-num--one');
      scheduleCountdown(() => {
        if (!state._showingCountdown) return;
        // Stop pulse, swap to GO! tint, write the layered GO! structure.
        if (overlayEl) {
          overlayEl.classList.remove('is-pulsing', 'tick-flash');
          overlayEl.classList.add('hub-overlay--go-flash');
          setTimeout(() => overlayEl.classList.remove('hub-overlay--go-flash'), 300);
        }
        setOverlay(
          `<div class="hub-go">
             <div class="hub-go__flash"></div>
             <div class="hub-go__shake">
               <div class="hub-go__ring hub-go__ring--inner"></div>
               <div class="hub-go__ring hub-go__ring--outer"></div>
               <span class="hub-go__text">GO!</span>
             </div>
           </div>`
        );
        scheduleCountdown(async () => {
          if (!state._showingCountdown) return;
          // Claim the curtain BEFORE the DB write so the realtime echo's render
          // pass (which arrives mid-await) skips the slot-reveal gates at
          // showView and render(). Without this, the echo briefly flips
          // playback_status to 'searching' and starts the slot machine
          // underneath the not-yet-shown curtain.
          state._showingCurtain = true;
          await startGame();
          state._showingCountdown = false;
          state._countdownTimeouts.forEach(clearTimeout);
          state._countdownTimeouts = [];
          clearOverlay();
          runCurtain();
        }, 1200);
      }, 1000);
    }, 1000);
  }, 1000);
}

function abortCountdown() {
  state._showingCountdown = false;
  state._countdownTimeouts.forEach(clearTimeout);
  state._countdownTimeouts = [];
  clearOverlay();
}

// --- Game-start curtain (Step 1.2) ---
function runCurtain() {
  // _showingCurtain is now claimed in runCountdown BEFORE awaiting startGame,
  // so an early-return on it would no-op every call. Trust the call sites
  // (runCountdown is the only one) and just (re)assert the flag here.
  state._showingCurtain = true;

  const activePlayerId = state.room?.player_order?.[0];
  const activePlayer = state.players.find(p => p.id === activePlayerId);
  const name = activePlayer?.name || '???';
  const color = activePlayerId ? UI.getPlayerColor(activePlayerId) : 'var(--gold)';

  const escName = (s) => {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  };

  const sparks = [1,2,3,4,5,6].map(i => `<div class="hub-curtain-spark hub-curtain-spark--${i}"></div>`).join('');
  setOverlay(
    `<div class="hub-curtain" style="--player-color:${color}">
       <div class="hub-curtain-bar"></div>
       <div class="hub-curtain-label">FIRST UP</div>
       <div class="hub-curtain-name">${escName(name)}</div>
       <div class="hub-curtain-underline">
         <div class="hub-curtain-underline-shine"></div>
       </div>
       <div class="hub-curtain-sparks">${sparks}</div>
     </div>`
  );

  const duration = reducedMotion() ? 600 : 2050;
  state._curtainTimeout = setTimeout(() => {
    state._curtainTimeout = null;
    state._showingCurtain = false;
    clearOverlay();
    if (state.isHub && state.room?.status === 'playing'
        && (state.room?.playback_status === 'searching' || state.room?.playback_status === 'idle')
        && !state.isSearching) {
      triggerSearch();
    }
  }, duration);
}

// --- Player join fanfare (Step 1.3) ---
function enqueueJoinBanner(player) {
  state._joinBannerQueue.push(player);
  if (!state._joinBannerActive) runJoinBanner();
}

function runJoinBanner() {
  if (state._joinBannerQueue.length === 0) {
    state._joinBannerActive = false;
    return;
  }
  state._joinBannerActive = true;
  const player = state._joinBannerQueue.shift();
  const color = UI.getPlayerColor(player.id);
  const avatar = UI.avatarContent(player);
  const escName = (s) => {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  };
  const sparks = [1,2,3,4,5,6].map(i => `<div class="hub-join-spark hub-join-spark--${i}"></div>`).join('');
  setBanner(
    `<div class="hub-join-banner" style="--player-color:${color}; border-color:${color}">
       <div class="hub-join-avatar-wrap">
         <div class="hub-join-avatar" style="background:${color}">${avatar}</div>
       </div>
       <div class="hub-join-text">
         <span class="hub-join-name">${escName(player.name)}</span>
         <span class="hub-join-verb">joined</span>
       </div>
       <div class="hub-join-sparks">${sparks}</div>
     </div>`,
    'hub-banner--join'
  );
  state._joinBannerTimeout = setTimeout(() => {
    state._joinBannerTimeout = null;
    clearBanner();
    runJoinBanner();
  }, 2300);
}

// --- Turn-change banner (H1) ---
function runTurnBanner(player, color) {
  if (!player) return;
  const escName = (s) => {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  };
  state._showingTurnBanner = true;
  setBanner(`
    <div class="hub-turn-banner" style="--player-color:${color}">
      <span class="hub-turn-banner-label">UP NEXT</span>
      <span class="hub-turn-banner-name">${escName(player.name)}</span>
    </div>
  `, 'hub-banner--turn');
  state._turnBannerTimeout = setTimeout(() => {
    state._turnBannerTimeout = null;
    state._showingTurnBanner = false;
    clearBanner();
    // Tail call: kick off triggerSearch now that the banner is done.
    // While the banner was up, the M1 optimistic flip was suppressed and
    // triggerSearch was deferred — fire it here. triggerSearch is a no-op if
    // already searching, and does its own optimistic 'searching' flip otherwise.
    if (state.isHub && state.room?.status === 'playing'
        && (state.room?.playback_status === 'idle' || state.room?.playback_status === 'searching')
        && !state.isSearching) {
      triggerSearch();
    }
  }, 1320);
}

// ============================================================
// INIT
// ============================================================
async function init() {
  state.playerId = localStorage.getItem('yt_player_id');
  if (!state.playerId) {
    state.playerId = crypto.randomUUID();
    localStorage.setItem('yt_player_id', state.playerId);
  }

  const joinParam = new URLSearchParams(location.search).get('join');
  const validJoin = joinParam && /^[A-Z0-9]{4}$/i.test(joinParam) ? joinParam.toUpperCase() : null;

  // Check if we had a hub session
  state.isHub = localStorage.getItem('yt_is_hub') === 'true';

  setupEventListeners();

  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, syncFullscreenButton)
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.roomCode && state.currentView !== 'home') {
      forceReconcile();
    }
  });
  window.addEventListener('online', () => {
    if (state.roomCode && state.currentView !== 'home') forceReconcile();
  });

  const savedRoom = localStorage.getItem('yt_room_code');
  const savedName = localStorage.getItem('yt_player_name');

  if (savedRoom && state.isHub) {
    // Hub reconnect — no player name needed
    const ok = await attemptHubRejoin(savedRoom);
    if (!ok) { clearSession(); showView('home'); }
  } else if (savedRoom && savedName) {
    state.playerName = savedName;
    const ok = await attemptRejoin(savedRoom);
    if (!ok) { clearSession(); showView('home'); }
  } else {
    showView('home');
  }

  if (validJoin && state.currentView === 'home') {
    setTimeout(() => {
      document.querySelector('[data-action="show-join"]')?.click();
      const input = document.getElementById('join-code');
      if (input) input.value = validJoin;
    }, 50);
  }

  // Poll every 2s as a reliable fallback
  state._pollInterval = setInterval(async () => {
    if (!state.roomCode || state.currentView === 'home') return;
    try {
      const oldStatus = state.room?.status;
      const oldPlayback = state.room?.playback_status;
      const oldTerm = state.room?.current_search_term;
      await loadRoom(state.roomCode);

      if (state.room?.status !== oldStatus) {
        showView(viewForStatus(state.room.status));
      } else if (state.isHub && !state.isSearching && oldTerm !== state.room?.current_search_term) {
        // Term changed (superpower) — re-search takes priority
        await triggerSearch();
      } else if (state.isHub && state.room?.playback_status !== oldPlayback) {
        handleHubPlaybackChange();
      } else {
        debouncedRender();
      }

      // Hub auto-start safety net: handles the case where the Hub refreshed
      // while all players were already ready (no realtime event arrives to trigger handlePlayerChange).
      // Skip during countdown so the in-flight 3-2-1-GO sequence doesn't get pre-empted.
      // Routes through runCountdown (matches realtime path) so the countdown isn't bypassed.
      if (state.isHub && state.room?.status === 'lobby' && !state._showingCountdown
          && state.players.length >= 2 && state.players.every(p => p.ready)) {
        runCountdown();
      }
    } catch { /* ignore */ }
  }, 2000);
}

// ============================================================
// SESSION
// ============================================================
function clearSession() {
  localStorage.removeItem('yt_room_code');
  localStorage.removeItem('yt_player_name');
  localStorage.removeItem('yt_is_hub');
  state.roomCode = null;
  state.room = null;
  state.players = [];
  state.playerName = null;
  state.isHub = false;
  state.replaceMode = false;
  state.replaceCharIndex = null;
  state.swapMode = false;
  state.swapFirstIndex = null;
  state.isSearching = false;
  state.isProcessing = false;
  state._lastTalliedRound = null;
  state._showingCountdown = false;
  state._countdownTimeouts.forEach(clearTimeout);
  state._countdownTimeouts = [];
  state._showingCurtain = false;
  if (state._curtainTimeout) { clearTimeout(state._curtainTimeout); state._curtainTimeout = null; }
  state._joinBannerQueue = [];
  state._joinBannerActive = false;
  if (state._joinBannerTimeout) { clearTimeout(state._joinBannerTimeout); state._joinBannerTimeout = null; }
  state._justJoinedIds.clear();
  state._justLoadedCells = false;
  state._termJustRevealed = false;
  state._turnJustStartedForMe = false;
  state._justReadiedIds.clear();
  state._resultsAnimated = false;
  state._showingTurnBanner = false;
  if (state._turnBannerTimeout) { clearTimeout(state._turnBannerTimeout); state._turnBannerTimeout = null; }
  if (state._autoAdvanceTimer) { clearInterval(state._autoAdvanceTimer); state._autoAdvanceTimer = null; }
  if (state._avatarWriteTimer) { clearTimeout(state._avatarWriteTimer); state._avatarWriteTimer = null; }
  state._connStatus = 'ok';
  const pillHost = document.getElementById('conn-pill-host');
  if (pillHost) pillHost.innerHTML = '';
  clearOverlay();
  clearBanner();
  if (state.channel) {
    db.removeChannel(state.channel);
    state.channel = null;
  }
  Hub.destroyPlayer();
}

async function attemptRejoin(roomCode) {
  try {
    const { data: room } = await db.from('yt_rooms').select().eq('code', roomCode).single();
    if (!room) return false;
    const { data: player } = await db.from('yt_players').select()
      .eq('id', state.playerId).eq('room_code', roomCode).single();
    if (!player) return false;
    state.roomCode = roomCode;
    state.room = room;
    const { data: players } = await db.from('yt_players').select().eq('room_code', roomCode);
    // Pattern 5: if the user bailed (cleared session) while we were loading
    // the player list, don't re-populate.
    if (state.roomCode !== roomCode) return false;
    state.players = players || [];
    subscribeToRoom(roomCode);
    showView(viewForStatus(room.status));
    return true;
  } catch { return false; }
}

async function attemptHubRejoin(roomCode) {
  try {
    const { data: room } = await db.from('yt_rooms').select().eq('code', roomCode).single();
    if (!room || room.host_id !== state.playerId) return false;
    state.roomCode = roomCode;
    state.room = room;
    state.isHub = true;
    const { data: players } = await db.from('yt_players').select().eq('room_code', roomCode);
    // Pattern 5: bail if the user cleared session mid-rejoin.
    if (state.roomCode !== roomCode) return false;
    state.players = players || [];

    // Re-initialize YouTube player for hub
    Hub.initPlayer(async () => {
      if (state.room?.playback_status === 'playing') {
        await db.from('yt_rooms').update({ playback_status: 'stopped' })
          .eq('code', state.roomCode);
      }
    });

    subscribeToRoom(roomCode);
    showView(viewForStatus(room.status));

    // Resume in-flight playback / search after a Hub refresh.
    // The realtime subscription won't replay the playback_status change that
    // happened before reload, so we kick the right path manually.
    const playback = state.room?.playback_status;
    if (playback === 'playing' && state.room?.selected_video_id) {
      handleHubPlaybackChange();
    } else if (playback === 'searching') {
      triggerSearch();
    }

    return true;
  } catch { return false; }
}

// ============================================================
// ROOM MANAGEMENT
// ============================================================
async function generateRoomCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    const { data } = await db.from('yt_rooms').select('code').eq('code', code).maybeSingle();
    if (!data) return code;
  }
  return null;
}

// Lazy cleanup: remove rooms older than 24 hours on room creation
async function cleanupStaleRooms() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db.from('yt_rooms').delete().lt('created_at', cutoff);
  } catch { /* best-effort cleanup */ }
}

async function createRoom(playerName, winScore) {
  await cleanupStaleRooms();
  const code = await generateRoomCode();
  if (!code) { toast('Unable to generate a unique room code. Try again.', 'error'); return; }

  const { error: roomErr } = await db.from('yt_rooms').insert({
    code, host_id: state.playerId, status: 'lobby', win_score: winScore, is_hub: false,
  });
  if (roomErr) { toast('Failed to create room. Try again.', 'error'); return; }

  const { error: playerErr } = await db.from('yt_players').insert({
    id: state.playerId, room_code: code, name: playerName,
    avatar: EMOJI_AVATARS[Math.floor(Math.random() * EMOJI_AVATARS.length)],
  });
  if (playerErr) { toast('Failed to join room.', 'error'); return; }

  state.playerName = playerName;
  state.roomCode = code;
  localStorage.setItem('yt_room_code', code);
  localStorage.setItem('yt_player_name', playerName);
  await loadRoom(code);
  subscribeToRoom(code);
  showView('lobby');
  toast('Room created!', 'success');
}

async function createHubRoom(winScore) {
  await cleanupStaleRooms();
  const code = await generateRoomCode();
  if (!code) { toast('Unable to generate a unique room code. Try again.', 'error'); return; }

  const { error } = await db.from('yt_rooms').insert({
    code, host_id: state.playerId, status: 'lobby', win_score: winScore, is_hub: true,
  });
  if (error) { toast('Failed to create room. Try again.', 'error'); return; }

  state.isHub = true;
  state.roomCode = code;
  localStorage.setItem('yt_room_code', code);
  localStorage.setItem('yt_is_hub', 'true');

  // Initialize YouTube player once (lives outside #app, persistent)
  Hub.initPlayer(async () => {
    if (state.room?.playback_status === 'playing') {
      await db.from('yt_rooms').update({ playback_status: 'stopped' })
        .eq('code', state.roomCode);
    }
  });

  await loadRoom(code);
  subscribeToRoom(code);
  showView('lobby');
  toast('Hub created! Players can now join.', 'success');
}

async function joinRoom(roomCode, playerName) {
  roomCode = roomCode.toUpperCase().trim();
  const { data: room } = await db.from('yt_rooms').select().eq('code', roomCode).single();
  if (!room) { toast('Room not found. Check the code.', 'error'); return; }
  if (room.status === 'gameover') { toast('That game is over.', 'error'); return; }

  const isMidGame = room.status !== 'lobby';
  const { data: existing } = await db.from('yt_players').select().eq('room_code', roomCode);
  if (existing?.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    toast('That name is taken.', 'error'); return;
  }

  const { error } = await db.from('yt_players').insert({
    id: state.playerId, room_code: roomCode, name: playerName,
    avatar: EMOJI_AVATARS[Math.floor(Math.random() * EMOJI_AVATARS.length)],
  });
  if (error) { toast('Failed to join.', 'error'); return; }

  state.playerName = playerName;
  state.roomCode = roomCode;
  localStorage.setItem('yt_room_code', roomCode);
  localStorage.setItem('yt_player_name', playerName);
  await loadRoom(roomCode);
  subscribeToRoom(roomCode);
  showView(viewForStatus(room.status));
  toast(isMidGame ? 'Joined mid-game!' : 'Joined room!', 'success');
}

async function loadRoom(roomCode) {
  // Pattern 5: capture the requested code and re-validate after the awaits.
  // If the user left the room (clearSession nulled state.roomCode) or joined a
  // different room while these queries were in flight, don't repopulate state
  // with data from the old room.
  const code = roomCode;
  const { data: room } = await db.from('yt_rooms').select().eq('code', code).single();
  if (state.roomCode !== code) return;
  const { data: players } = await db.from('yt_players').select().eq('room_code', code);
  if (state.roomCode !== code) return;
  state.room = room;
  state.players = players || [];
}

// ============================================================
// RECONNECT (Concern A)
// ============================================================
function setConnStatus(status) {
  if (state._connStatus === status) return;
  state._connStatus = status;
  const host = document.getElementById('conn-pill-host');
  if (!host) return;
  if (status === 'reconnecting') {
    host.innerHTML = '<div class="conn-pill conn-pill--reconnecting">⟳ Reconnecting...</div>';
  } else {
    host.innerHTML = '';
  }
}

async function forceReconcile() {
  if (!state.roomCode) return;
  setConnStatus('reconnecting');
  try {
    await loadRoom(state.roomCode);
    // Pattern 5: re-check after every await — user may have left the room
    // while loadRoom was in flight (visibilitychange + leave intersect).
    if (!state.roomCode) return;
    if (state.room) {
      const targetView = viewForStatus(state.room.status);
      if (state.currentView !== targetView) {
        showView(targetView);
      } else {
        debouncedRender();
      }
    } else {
      // Room ended while away
      toast('The room ended while you were away.', 'info');
      clearSession();
      showView('home');
      return;
    }
    if (!state.roomCode) return;
    if (!state.channel) subscribeToRoom(state.roomCode);
    setConnStatus('ok');
  } catch (err) {
    console.error('Reconcile failed:', err);
    // Leave _connStatus as 'reconnecting'; next attempt will retry
  }
}

// ============================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================
function subscribeToRoom(roomCode) {
  if (state.channel) db.removeChannel(state.channel);
  state.channel = db
    .channel(`room-${roomCode}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'yt_rooms',
      filter: `code=eq.${roomCode}`,
    }, handleRoomChange)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'yt_players',
      filter: `room_code=eq.${roomCode}`,
    }, handlePlayerChange)
    .subscribe((status) => {
      // Skip status updates when we've intentionally left the room
      // (clearSession nulls roomCode). Otherwise CLOSED fires on leave/end-game
      // and we'd surface a false-alarm "Reconnecting..." pill.
      if (!state.roomCode) return;
      if (status === 'SUBSCRIBED') setConnStatus('ok');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnStatus('reconnecting');
      }
    });
}

async function handleRoomChange(payload) {
  if (payload.eventType === 'DELETE') {
    // Room was deleted (hub closed the game)
    if (!state.isHub) {
      state.currentView = 'host-ended';
      render();
    }
    return;
  }
  const oldStatus = state.room?.status;
  const oldPlayback = state.room?.playback_status;
  const oldTerm = state.room?.current_search_term;
  const oldPlayerIndex = state.room?.current_player_index;
  const oldResultsLen = state.room?.search_results?.length || 0;
  state.room = payload.new;

  // Only reset superpower interaction state when the term or game status changes,
  // so unrelated room updates don't interrupt mid-superpower interaction
  if (oldStatus !== state.room.status || oldTerm !== state.room.current_search_term) {
    state.replaceMode = false;
    state.replaceCharIndex = null;
    state.swapMode = false;
    state.swapFirstIndex = null;
  }

  // Phone-side polish triggers (M5/H1/H2). Hub doesn't render the phone num-grid
  // or the per-player turn entrance, so these are gated on !state.isHub.
  if (!state.isHub) {
    // M5 — empty grid → results loaded: stagger fade-in for filled num-cells
    const newResultsLen = state.room.search_results?.length || 0;
    if (oldResultsLen === 0 && newResultsLen > 0) {
      state._justLoadedCells = true;
      setTimeout(() => {
        if (!state.roomCode) return;
        state._justLoadedCells = false;
        debouncedRender();
      }, 250);
    }
    // H1 — turn becomes mine (turns 2+; turn 1 covered by showView hook)
    if (oldPlayerIndex !== undefined && state.room.current_player_index !== oldPlayerIndex) {
      const myIndex = state.room.player_order?.indexOf(state.playerId);
      if (myIndex >= 0 && state.room.current_player_index === myIndex) {
        state._turnJustStartedForMe = true;
        setTimeout(() => {
          if (!state.roomCode) return;
          state._turnJustStartedForMe = false;
          debouncedRender();
        }, 1400);
      }
    }
    // H2 — search term changed: replay slot-cell reveal
    if (oldTerm !== state.room.current_search_term && state.room.current_search_term) {
      state._termJustRevealed = true;
      setTimeout(() => {
        if (!state.roomCode) return;
        state._termJustRevealed = false;
        debouncedRender();
      }, 500);
    }
  }

  // H1 — hub turn-change banner (turns 2+; turn 1 owned by curtain)
  if (state.isHub
      && oldStatus === state.room.status
      && oldStatus === 'playing'
      && oldPlayerIndex !== undefined
      && state.room.current_player_index !== oldPlayerIndex
      && !state._showingCurtain
      && !state._showingCountdown) {
    const nextId = state.room.player_order?.[state.room.current_player_index];
    const nextPlayer = state.players.find(p => p.id === nextId);
    if (nextPlayer) {
      const color = UI.getPlayerColor(nextId);
      runTurnBanner(nextPlayer, color);
    }
  }

  if (oldStatus !== state.room.status) {
    state.isProcessing = false;
    // Always hide the YouTube player when status changes (e.g., playing → voting)
    if (state.isHub) Hub.stopVideo();
    const { data: players } = await db.from('yt_players').select().eq('room_code', state.roomCode);
    if (players) state.players = players;
    showView(viewForStatus(state.room.status));
  } else if (state.isHub && !state.isSearching && oldTerm !== state.room.current_search_term) {
    // Search term changed (superpower used / new turn) — re-search takes priority.
    // M1: optimistically flip to 'searching' so morphdom doesn't paint an empty
    // grid frame between the term change and triggerSearch's own optimistic flip.
    // H1 coordination: while the turn banner is up, suppress the optimistic flip
    // AND defer triggerSearch — banner's setTimeout tail fires triggerSearch.
    if (state.room.playback_status === 'idle' && !state._showingTurnBanner) {
      state.room.playback_status = 'searching';
      render();
    }
    if (!state._showingTurnBanner) await triggerSearch();
  } else if (state.isHub && oldPlayback !== state.room.playback_status) {
    handleHubPlaybackChange();
  } else {
    debouncedRender();
  }
}

async function handlePlayerChange(payload) {
  if (payload.eventType === 'INSERT') {
    if (!state.players.find(p => p.id === payload.new.id)) {
      state.players.push(payload.new);
    }
    if (payload.new.id !== state.playerId) {
      state._justJoinedIds.add(payload.new.id);
      setTimeout(() => {
        if (!state.roomCode) return;
        state._justJoinedIds.delete(payload.new.id);
        debouncedRender();
      }, 600);
      if (state.isHub) enqueueJoinBanner(payload.new);
    }
  } else if (payload.eventType === 'UPDATE') {
    const idx = state.players.findIndex(p => p.id === payload.new.id);
    const wasReady = state.players[idx]?.ready;
    if (idx >= 0) state.players[idx] = payload.new;
    else state.players.push(payload.new);
    // N1 — ready celebration: fire on false → true, skip own player (their tap
    // already gives tactile feedback via the Ready button itself).
    if (!wasReady && payload.new.ready === true && payload.new.id !== state.playerId) {
      state._justReadiedIds.add(payload.new.id);
      setTimeout(() => {
        if (!state.roomCode) return;
        state._justReadiedIds.delete(payload.new.id);
        debouncedRender();
      }, 600);
    }
    if (state._showingCountdown && !state.isProcessing && !state.players.every(p => p.ready)) {
      abortCountdown();
    }
  } else if (payload.eventType === 'DELETE') {
    state.players = state.players.filter(p => p.id !== payload.old?.id);
    if (state._showingCountdown && state.players.length < 2) {
      abortCountdown();
    }
    if (state._showingCurtain && state.players.length < 2) {
      state._showingCurtain = false;
      if (state._curtainTimeout) { clearTimeout(state._curtainTimeout); state._curtainTimeout = null; }
      clearOverlay();
    }
  }

  // Host/Hub auto-tally: when all players have voted
  // (tallyAndAdvance manages its own isProcessing guard)
  if (isHost() && state.room?.status === 'voting') {
    const orderSet = new Set(state.room.player_order || []);
    const votingPlayers = state.players.filter(p => orderSet.has(p.id));
    const allVoted = votingPlayers.every(p => p.vote_for);
    if (allVoted && votingPlayers.length > 0) {
      await tallyAndAdvance();
    }
  }

  // Hub auto-start: when all players ready
  // Routes through runCountdown → startGame (its own isProcessing guard)
  if (state.isHub && state.room?.status === 'lobby' && !state._showingCountdown) {
    if (state.players.length >= 2 && state.players.every(p => p.ready)) {
      runCountdown();
    }
  }

  debouncedRender();
}

// ============================================================
// HUB PLAYBACK MANAGEMENT
// ============================================================
function handleHubPlaybackChange() {
  if (!state.isHub) return;

  // Always render first
  debouncedRender();

  if (state.room.playback_status === 'playing') {
    setTimeout(async () => {
      // Pattern 4: bail if the user left the room while we were waiting.
      if (!state.roomCode) return;
      // Use the video ID stored directly on the room — no stale index lookup
      const videoId = state.room.selected_video_id;

      if (!videoId) {
        console.error('No video ID on room for playback');
        toast('This video can\'t be played. Skipping...', 'error');
        await db.from('yt_rooms').update({ playback_status: 'stopped' })
          .eq('code', state.roomCode);
        return;
      }

      Hub.playVideo(videoId);
    }, 200);
  } else {
    // Any non-playing state: hide the player overlay
    // (covers 'stopped', 'idle', 'searching', 'selecting', etc.)
    Hub.stopVideo();
  }
}

// ============================================================
// YOUTUBE SEARCH (Hub mode)
// ============================================================
async function triggerSearch() {
  if (!state.isHub || state.isSearching) return;
  state.isSearching = true;

  const term = state.room.current_search_term;

  // Anchor the min-time clock unconditionally — even when an upstream optimistic
  // flip already set playback_status to 'searching' (M1), the slot reveal still
  // needs SLOT_REVEAL_MIN_MS from this point to play out in full.
  const searchStartTime = performance.now();

  // Optimistic local update: render the searching view NOW so the slot reveal
  // starts at user-visible time T0, without waiting for the DB write + realtime
  // round-trip echo to come back. (The showView path may have already done this;
  // skip in that case.)
  if (state.room && state.room.playback_status !== 'searching') {
    state.room.playback_status = 'searching';
    render();
  }

  await db.from('yt_rooms').update({ playback_status: 'searching' })
    .eq('code', state.roomCode);

  try {
    // Call Edge Function
    const { data, error } = await db.functions.invoke('youtube-search', {
      body: { term, videoOnly: false },
    });

    if (error || !data?.results) {
      toast('YouTube search failed. Try re-searching.', 'error');
      await db.from('yt_rooms').update({ playback_status: 'search_failed' })
        .eq('code', state.roomCode);
      return;
    }

    // Build pool using the 3-video rule
    let pool = Hub.buildPool(data.results);

    // Fallback: if less than 3 videos in the pool, do a video-only search
    const videoCount = pool.filter(r => r.type === 'video').length;
    if (videoCount < 3) {
      const { data: fallback } = await db.functions.invoke('youtube-search', {
        body: { term, videoOnly: true },
      });
      if (fallback?.results) {
        const existing = new Set(pool.map(r => r.videoId).filter(Boolean));
        const extras = fallback.results.filter(r => !existing.has(r.videoId)).slice(0, 3 - videoCount);
        pool = [...pool, ...extras].slice(0, 20);
      }
    }

    // Number each item
    pool = pool.map((item, i) => ({ ...item, index: i }));

    // Hold the searching view long enough for the slot reveal to finish + a beat to read.
    // If the search returned faster than the reveal duration, wait out the remainder.
    const elapsed = performance.now() - searchStartTime;
    if (elapsed < SLOT_REVEAL_MIN_MS) {
      await new Promise(r => setTimeout(r, SLOT_REVEAL_MIN_MS - elapsed));
    }

    // Store results and set status
    await db.from('yt_rooms').update({
      search_results: pool,
      selected_video_index: null, selected_video_id: null,
      playback_status: 'selecting',
    }).eq('code', state.roomCode);

  } catch (err) {
    console.error('Search error:', err);
    toast('Search failed.', 'error');
  } finally {
    state.isSearching = false;
    // If the term changed during the in-flight search (rapid superpower chain),
    // schedule a follow-up so we don't wait on the 2s poll fallback.
    const currentTerm = state.room?.current_search_term;
    if (state.isHub && currentTerm && currentTerm !== term && state.room?.status !== 'gameover') {
      Promise.resolve().then(() => triggerSearch());
    }
  }
}

// ============================================================
// VIEW MANAGEMENT — morphdom for flicker-free updates
// ============================================================
let renderTimer = null;
function debouncedRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => render(), 40);
}

function showView(name) {
  // Clear any existing auto-advance timer
  if (state._autoAdvanceTimer) {
    clearInterval(state._autoAdvanceTimer);
    state._autoAdvanceTimer = null;
  }

  // Hub entering game view with no search yet: optimistically flip to 'searching'
  // BEFORE rendering so the slot reveal starts immediately (no empty-grid flash).
  // The DB write follows shortly via triggerSearch; the realtime echo on the same
  // value won't trigger a re-render branch.
  if (state.isHub && name === 'game' && state.room?.playback_status === 'idle') {
    state.room.playback_status = 'searching';
  }

  state.currentView = name;
  render();

  // H1 — turn-1 entrance: handleRoomChange's index-change check doesn't fire
  // for turn 1 (undefined → 0 happens via showView, not a room update).
  if (name === 'game' && !state.isHub && state.room?.current_player_index !== undefined) {
    const myIndex = state.room.player_order?.indexOf(state.playerId);
    if (myIndex >= 0 && state.room.current_player_index === myIndex && !state._turnJustStartedForMe) {
      state._turnJustStartedForMe = true;
      setTimeout(() => {
        if (!state.roomCode) return;
        state._turnJustStartedForMe = false;
        debouncedRender();
      }, 1400);
    }
  }

  // N3 — results-announcement bloom: run-once per results-view mount.
  if (name === 'results' && !state._resultsAnimated) {
    setTimeout(() => {
      if (!state.roomCode) return;
      state._resultsAnimated = true;
    }, 1400);
  }
  // Reset for the next results view when leaving (lobby or new round).
  if (name === 'lobby' || name === 'game') {
    state._resultsAnimated = false;
  }

  // When hub enters game view, trigger the first search
  // (skip during the curtain — the curtain's tail kicks off the search itself)
  if (state.isHub && name === 'game' && state.room?.playback_status === 'searching' && !state.isSearching && !state._showingCurtain && !state._showingCountdown) {
    triggerSearch();
  }

  // Hub results auto-advance: 30-second countdown
  if (state.isHub && name === 'results') {
    let countdown = 30;
    state._autoAdvanceTimer = setInterval(async () => {
      // Pattern 4: guard against state mutation after the user has left the room.
      if (!state.roomCode) return;
      countdown--;
      const el = document.getElementById('hub-countdown');
      if (el) el.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(state._autoAdvanceTimer);
        state._autoAdvanceTimer = null;
        // nextRound manages its own isProcessing guard
        if (state.currentView === 'results') {
          await nextRound();
        }
      }
    }, 1000);
  }
}

function render() {
  const app = document.getElementById('app');
  let html = '';

  if (state.isHub) {
    // Hub display rendering
    switch (state.currentView) {
      case 'home':    html = UI.renderHome(); break;
      case 'lobby':   html = UI.renderHubLobby(state); break;
      case 'game':    html = UI.renderHubGame(state); break;
      case 'voting':  html = UI.renderHubVoting(state); break;
      case 'results': html = UI.renderHubResults(state); break;
      case 'gameover':html = UI.renderHubGameOver(state); break;
    }
  } else {
    // Player rendering
    switch (state.currentView) {
      case 'home':    html = UI.renderHome(); break;
      case 'lobby':   html = UI.renderLobby(state); break;
      case 'game':    html = UI.renderGame(state); break;
      case 'voting':  html = UI.renderVoting(state); break;
      case 'results': html = UI.renderResults(state); break;
      case 'gameover':html = UI.renderGameOver(state); break;
      case 'host-ended': html = UI.renderHostEnded(); break;
    }
  }

  // Append confirm-leave overlay if active (shared between hub and phone-host)
  if (state.confirmLeave && state.currentView !== 'home') {
    html += UI.renderConfirmLeave();
  }

  const temp = document.createElement('div');
  temp.innerHTML = html;
  window.morphdom(app, temp, {
    childrenOnly: true,
    onBeforeElUpdated(fromEl, toEl) {
      // Slot-reveal cells are owned by JS once the reveal starts. Skip morphdom
      // updates on rolling/locked cells unless the term itself has changed
      // (different data-final-char). This prevents debouncedRender from yanking
      // the spin back to time 0 or stripping the locked state mid-hold.
      if (fromEl.classList && (fromEl.classList.contains('hub-char--rolling') || fromEl.classList.contains('hub-char--locked'))) {
        if (fromEl.dataset.finalChar !== toEl.dataset?.finalChar) {
          // New term — let morphdom replace the cell, but stop the old reveal first
          // so its lingering interval doesn't clobber the new char on its next tick.
          if (fromEl.classList.contains('hub-char--rolling')) stopSlotReveal();
          return true;
        }
        return false;
      }
      return true;
    },
  });
  updateBadge();

  if (state.isHub && state.currentView === 'lobby') {
    const canvas = document.getElementById('hub-qr');
    if (canvas && canvas.dataset.code !== state.roomCode && window.QRious) {
      const url = `${location.origin}${location.pathname}?join=${state.roomCode}`;
      new window.QRious({ element: canvas, value: url, size: 280, background: 'white', foreground: 'black' });
      canvas.dataset.code = state.roomCode;
    }
  }

  if (state.isHub && state.currentView === 'game' && state.room?.playback_status === 'searching' && !state._showingCurtain && !state._showingCountdown) {
    // startSlotReveal has its own guards: skips if intervals already running OR
    // if no fresh cells (.hub-char without --rolling/--locked) exist. The HTML
    // emits cells without those classes; JS adds --rolling inside startSlotReveal.
    // Guard: while the game-start curtain is still showing, hold the reveal so it
    // starts crisply at curtain-out. The curtain's tail calls triggerSearch which
    // re-renders — that pass kicks the reveal off cleanly.
    startSlotReveal();
  } else {
    stopSlotReveal();
  }

  syncFullscreenButton();
}

function updateBadge() {
  const badge = document.getElementById('room-code-badge');
  const hideViews = ['home', 'lobby', 'game', 'voting', 'results', 'gameover'];
  if (state.isHub) {
    // Hub shows badge differently — it's in the layout
    badge.classList.add('hidden');
  } else if (state.roomCode && !hideViews.includes(state.currentView)) {
    badge.textContent = `ROOM ${state.roomCode}`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function viewForStatus(status) {
  const map = { lobby: 'lobby', playing: 'game', voting: 'voting', results: 'results', gameover: 'gameover' };
  return map[status] || 'lobby';
}

// ============================================================
// HELPERS
// ============================================================
function isHost() { return state.room?.host_id === state.playerId; }
function getMe() { return state.players.find(p => p.id === state.playerId); }

function generateSearchTerm() {
  let t = '';
  for (let i = 0; i < TERM_LENGTH; i++) t += randomChar();
  return t;
}

function randomChar() {
  const roll = Math.floor(Math.random() * 27);
  if (roll < 26) return LETTERS[roll];
  return SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// GAME ACTIONS
// ============================================================

async function startGame() {
  if (!isHost() || state.isProcessing) return;
  state.isProcessing = true;
  try {
    const order = shuffle(state.players.map(p => p.id));
    const term = generateSearchTerm();

    await db.from('yt_players').update({
      ready: false, score: 0,
      has_reroll: true, has_replace: true, has_swap: true,
      selected_video: null, vote_for: null,
      picked_video_id: null, picked_video_title: null, picked_video_thumbnail: null,
    }).eq('room_code', state.roomCode);

    await db.from('yt_rooms').update({
      status: 'playing', player_order: order, current_player_index: 0,
      current_search_term: term, round: 1, past_terms: [],
      search_results: [], selected_video_index: null, selected_video_id: null, playback_status: 'idle',
      last_round_winner: null, streak_count: 0,
    }).eq('code', state.roomCode);

    // Optimistic local update so the curtain (called immediately after) can
    // read player_order without waiting for the realtime echo.
    if (state.room) {
      state.room.player_order = order;
      state.room.current_player_index = 0;
      state.room.current_search_term = term;
      state.room.round = 1;
    }
  } finally {
    state.isProcessing = false;
  }
}

async function toggleReady() {
  const me = getMe();
  if (!me) return;
  await db.from('yt_players').update({ ready: !me.ready })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

// --- Superpowers ---

// Pattern 2: superpower one-shot user actions — consume optimistically before
// the DB writes (matches the cycle-avatar pattern). A fast double-tap of the
// same superpower button then trips the has_* check at the UI layer because
// me.has_reroll/replace/swap is already false locally.

async function useReroll() {
  const me = getMe();
  if (!me?.has_reroll) return;
  // Optimistic local consumption — gates a second tap before the player echo
  // returns. The DB write below is the source of truth; the realtime echo will
  // reconcile (no-op since local already matches).
  me.has_reroll = false;
  render();

  const oldTerm = state.room.current_search_term;
  const newTerm = generateSearchTerm();

  await db.from('yt_rooms').update({
    current_search_term: newTerm,
    past_terms: [...(state.room.past_terms || []), oldTerm],
    playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
  }).eq('code', state.roomCode);

  await db.from('yt_players').update({ has_reroll: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function useReplace(charIndex, chosenChar) {
  const me = getMe();
  if (!me?.has_replace) return;
  // Optimistic local consumption.
  me.has_replace = false;

  const chars = state.room.current_search_term.split('');
  chars[charIndex] = chosenChar.toUpperCase();
  const newTerm = chars.join('');

  state.replaceMode = false;
  state.replaceCharIndex = null;
  render();

  await db.from('yt_rooms').update({
    current_search_term: newTerm,
    playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
  }).eq('code', state.roomCode);

  await db.from('yt_players').update({ has_replace: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function useSwap(idx1, idx2) {
  const me = getMe();
  if (!me?.has_swap) return;
  // Optimistic local consumption.
  me.has_swap = false;

  const chars = state.room.current_search_term.split('');
  [chars[idx1], chars[idx2]] = [chars[idx2], chars[idx1]];
  const newTerm = chars.join('');

  state.swapMode = false;
  state.swapFirstIndex = null;
  render();

  await db.from('yt_rooms').update({
    current_search_term: newTerm,
    playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
  }).eq('code', state.roomCode);

  await db.from('yt_players').update({ has_swap: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

// --- Video Selection (Hub mode) ---

async function selectVideo(index) {
  // Pattern 1: write the room FIRST, then the player. The Hub's
  // handleHubPlaybackChange fires on the room echo (playback_status='playing')
  // and swings the YT player in. The player's picked_video_* echoes arrive
  // after — voting view reads them later. If we wrote the player first, the
  // Hub would re-render the selecting view with the picked tile highlighted
  // before playback started.
  const results = state.room.search_results || [];
  const video = results[index];
  if (!video) {
    toast('Video not found. Try another.', 'error');
    return;
  }

  const me = getMe();
  if (!me) return;

  const videoId = video.type === 'playlist' ? video.firstVideoId : video.videoId;

  // Write A: room (drives the playback transition).
  const { error: roomErr } = await db.from('yt_rooms').update({
    selected_video_index: index,
    selected_video_id: videoId,
    playback_status: 'playing',
  }).eq('code', state.roomCode);
  if (roomErr) {
    console.error('selectVideo room update failed:', roomErr);
    toast('Failed to start playback. Try again.', 'error');
    return;
  }

  // Write B: player (records who picked what — for voting view).
  const { error: playerErr } = await db.from('yt_players').update({
    picked_video_id: videoId,
    picked_video_title: video.title,
    picked_video_thumbnail: video.type === 'playlist' ? video.firstVideoThumbnail : video.thumbnail,
  }).eq('id', state.playerId).eq('room_code', state.roomCode);

  if (playerErr) {
    console.error('selectVideo player update failed:', playerErr);
    toast('Failed to record pick. Reverting...', 'error');
    // Roll back the room write — playback transition has to be undone since
    // the pick wasn't recorded.
    try {
      await db.from('yt_rooms').update({
        selected_video_index: null,
        selected_video_id: null,
        playback_status: 'selecting',
      }).eq('code', state.roomCode);
    } catch (rollbackErr) {
      console.error('selectVideo rollback failed:', rollbackErr);
    }
  }
}

async function stopPlayback() {
  await db.from('yt_rooms').update({ playback_status: 'stopped' })
    .eq('code', state.roomCode);
}

async function stopAndNext() {
  // Single write — finishTurn writes playback_status='idle' alongside the new
  // current_player_index + term, so the Hub gets one realtime echo and the
  // turn banner fires cleanly. Hub.stopVideo() still triggers via
  // handleHubPlaybackChange's playback_status-change branch.
  await finishTurn();
}

// --- Turn management ---

async function finishTurn() {
  const pastTerms = [...(state.room.past_terms || []), state.room.current_search_term];
  const nextIdx = (state.room.current_player_index || 0) + 1;

  if (nextIdx >= (state.room.player_order?.length || 0)) {
    // All players done → voting
    await db.from('yt_rooms').update({
      status: 'voting', past_terms: pastTerms,
      playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
    }).eq('code', state.roomCode);
  } else {
    // Next player's turn
    const term = generateSearchTerm();
    await db.from('yt_rooms').update({
      current_player_index: nextIdx,
      current_search_term: term,
      past_terms: pastTerms,
      playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
    }).eq('code', state.roomCode);
  }
}

// --- Voting & Scoring ---

async function castVote(forPlayerId) {
  if (!state.room?.player_order?.includes(state.playerId)) {
    toast('You joined mid-round. You can vote next round.', 'info');
    return;
  }
  await db.from('yt_players').update({ vote_for: forPlayerId })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function tallyAndAdvance() {
  // Per-round token guards against the realtime echo race: after Call #1 writes
  // the score + status flip, the score-update echo can arrive back at the host
  // AFTER `isProcessing` has been released by the finally but BEFORE the room
  // status echo flips local state.room.status to 'results'. Without this token,
  // Call #2 would re-enter, re-tally the same round, and double the score.
  // Round number alone disambiguates: nextRound increments it, so a stale token
  // from a prior round naturally fails the equality check.
  // Pattern 5: capture roomCode at entry; re-check after each await so we don't
  // mutate state belonging to an old room if the user left mid-tally.
  const code = state.roomCode;
  const round = state.room?.round;
  if (state.isProcessing || (round != null && state._lastTalliedRound === round)) return;
  state.isProcessing = true;
  try {
    const { data: freshPlayers } = await db.from('yt_players').select().eq('room_code', code);
    if (state.roomCode !== code) return;
    state.players = freshPlayers || [];

    const { winnerId, isUnanimous } = UI.tallyVotes(state);

    if (winnerId) {
      const winner = state.players.find(p => p.id === winnerId);
      if (winner) {
        const points = (isUnanimous && state.players.length >= 3) ? 2 : 1;
        const newScore = (winner.score || 0) + points;
        await db.from('yt_players').update({ score: newScore })
          .eq('id', winnerId).eq('room_code', code);
        if (state.roomCode !== code) return;
      }
    }

    // Hot streak tracking (badge-only, no bonus points)
    const lastWinner = state.room.last_round_winner;
    const prevStreak = state.room.streak_count || 0;
    let newStreak = prevStreak;
    if (winnerId) {
      newStreak = (winnerId === lastWinner) ? prevStreak + 1 : 1;
    }
    // Tied/no-winner rounds: preserve the existing streak (don't reset)

    state._lastTalliedRound = round;

    state.revealingVotes = true;
    render();
    await new Promise(r => setTimeout(r, 1500));
    if (state.roomCode !== code) return;

    await new Promise(r => setTimeout(r, 300));
    if (state.roomCode !== code) return;

    // Pattern 6: clear render-only flag in its tight scope, BEFORE the room
    // status write — so a slow room-status echo can't mount the results view
    // while revealingVotes is still true (which would flash vote-reveal styling).
    state.revealingVotes = false;

    const { data: updated } = await db.from('yt_players').select().eq('room_code', code);
    if (state.roomCode !== code) return;
    state.players = updated || [];

    const winScore = state.room.win_score || DEFAULT_WIN_SCORE;
    const gameWinner = state.players.find(p => (p.score || 0) >= winScore);
    await db.from('yt_rooms').update({
      status: gameWinner ? 'gameover' : 'results',
      last_round_winner: winnerId || lastWinner,
      streak_count: newStreak,
    }).eq('code', code);
  } finally {
    state.isProcessing = false;
    state.revealingVotes = false;
  }
}

// --- Round management ---

async function nextRound() {
  if (!isHost() || state.isProcessing) return;
  state.isProcessing = true;
  try {
    // Pattern 1: write the room FIRST (status flip + new term), THEN bulk-reset
    // the players. The Hub transitions on the room echo; subsequent player-reset
    // echoes arrive while the game view is already mounted — no flash of the
    // voting/results view with empty player thumbnails.
    const nextRnd = (state.room.round || 1) + 1;
    const term = generateSearchTerm();

    const { data: currentPlayers } = await db.from('yt_players').select().eq('room_code', state.roomCode);
    const currentIds = new Set((currentPlayers || []).map(p => p.id));

    const oldOrder = state.room.player_order || [];
    const rotated = [...oldOrder.slice(1), oldOrder[0]];
    const cleanOrder = rotated.filter(id => currentIds.has(id));
    const newPlayers = (currentPlayers || []).filter(p => !cleanOrder.includes(p.id)).map(p => p.id);
    const finalOrder = [...cleanOrder, ...newPlayers];

    await db.from('yt_rooms').update({
      status: 'playing', round: nextRnd, current_player_index: 0,
      current_search_term: term, player_order: finalOrder,
      search_results: [], selected_video_index: null, selected_video_id: null, playback_status: 'idle',
    }).eq('code', state.roomCode);

    await db.from('yt_players').update({
      selected_video: null, vote_for: null,
      picked_video_id: null, picked_video_title: null, picked_video_thumbnail: null,
    }).eq('room_code', state.roomCode);
  } finally {
    state.isProcessing = false;
  }
}

async function playAgain() {
  if (!isHost()) return;
  // Pattern 1: write the room FIRST, then the players. Same reasoning as
  // nextRound — the Hub transitions on the room echo without seeing a
  // voting/results view with reset player thumbnails.
  const order = shuffle(state.players.map(p => p.id));
  const term = generateSearchTerm();

  await db.from('yt_rooms').update({
    status: state.isHub ? 'lobby' : 'playing', round: 1, current_player_index: 0,
    current_search_term: term, player_order: order, past_terms: [],
    search_results: [], selected_video_index: null, selected_video_id: null, playback_status: 'idle',
    last_round_winner: null, streak_count: 0,
  }).eq('code', state.roomCode);

  await db.from('yt_players').update({
    score: 0, has_reroll: true, has_replace: true, has_swap: true,
    selected_video: null, vote_for: null, ready: false,
    picked_video_id: null, picked_video_title: null, picked_video_thumbnail: null,
  }).eq('room_code', state.roomCode);
}

async function leaveGame() {
  if (state.isHub || isHost()) {
    // Hub or phone-host leaving — confirm first, then delete room
    state.confirmLeave = true;
    render();
    return;
  }
  await db.from('yt_players').delete()
    .eq('id', state.playerId).eq('room_code', state.roomCode);
  clearSession();
  showView('home');
}

async function confirmEndGame() {
  state.confirmLeave = false;
  await db.from('yt_rooms').delete().eq('code', state.roomCode);
  clearSession();
  showView('home');
}

function cancelEndGame() {
  state.confirmLeave = false;
  render();
}

function dismissEnded() {
  clearSession();
  showView('home');
}

async function kickPlayer(playerId) {
  if (!isHost() || playerId === state.playerId) return;

  // Pattern 1: write the room FIRST (player_order with the kicked id removed),
  // THEN delete the player row. If the player DELETE echo arrived before the
  // room.player_order echo, the auto-tally check would compute votes over a
  // mismatched roster (state.room.player_order still includes the kicked id,
  // but state.players already excludes them).
  if (state.room.status === 'playing' || state.room.status === 'voting') {
    const order = state.room.player_order || [];
    const kickedIdx = order.indexOf(playerId);
    const newOrder = order.filter(id => id !== playerId);

    if (newOrder.length < 2) {
      await db.from('yt_rooms').update({ status: 'lobby', player_order: newOrder })
        .eq('code', state.roomCode);
      await db.from('yt_players').delete()
        .eq('id', playerId).eq('room_code', state.roomCode);
      toast('Not enough players. Returning to lobby.', 'info');
      return;
    }

    if (state.room.status === 'playing' && kickedIdx === (state.room.current_player_index || 0)) {
      let newIdx = state.room.current_player_index || 0;
      if (newIdx >= newOrder.length) {
        await db.from('yt_rooms').update({ status: 'voting', player_order: newOrder })
          .eq('code', state.roomCode);
      } else {
        const term = generateSearchTerm();
        await db.from('yt_rooms').update({
          player_order: newOrder, current_player_index: newIdx,
          current_search_term: term,
          playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
        }).eq('code', state.roomCode);
      }
    } else if (state.room.status === 'playing' && kickedIdx >= 0) {
      let newIdx = state.room.current_player_index || 0;
      if (kickedIdx < newIdx) newIdx--;
      await db.from('yt_rooms').update({ player_order: newOrder, current_player_index: newIdx })
        .eq('code', state.roomCode);
    } else {
      await db.from('yt_rooms').update({ player_order: newOrder })
        .eq('code', state.roomCode);
    }

    await db.from('yt_players').delete()
      .eq('id', playerId).eq('room_code', state.roomCode);
  } else {
    // Lobby/results/gameover — no player_order to keep consistent with the
    // roster. Just delete the row.
    await db.from('yt_players').delete()
      .eq('id', playerId).eq('room_code', state.roomCode);
  }
  toast('Player removed.', 'info');
}

// Hub admin: skip current player's turn
async function skipPlayer() {
  if (!isHost()) return;
  await db.from('yt_rooms').update({ playback_status: 'stopped' })
    .eq('code', state.roomCode);
  await finishTurn();
}

// Hub admin: force re-search
async function reSearch() {
  if (!state.isHub) return;
  // No intermediate 'idle' write — that caused a brief empty-grid flash before
  // the searching view appeared. triggerSearch's optimistic update flips straight
  // to 'searching' and the eventual 'selecting' write replaces search_results.
  await triggerSearch();
}

// Hub admin: force end voting
async function forceEndVoting() {
  if (!isHost() || state.room?.status !== 'voting') return;
  // tallyAndAdvance manages its own isProcessing guard
  await tallyAndAdvance();
}

// ============================================================
// FULLSCREEN HELPER
// ============================================================
function syncFullscreenButton() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.querySelectorAll('.hub-fullscreen-btn').forEach(btn => {
    const enter = btn.querySelector('.fs-icon-enter');
    const exit = btn.querySelector('.fs-icon-exit');
    if (enter) enter.style.display = isFs ? 'none' : '';
    if (exit) exit.style.display = isFs ? '' : 'none';
  });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ============================================================
// EVENT DELEGATION
// ============================================================
function setupEventListeners() {
  const tap = () => { try { navigator.vibrate?.(10); } catch {} };
  const VIBRATE_ACTIONS = new Set(['select-video','cast-vote','reroll','enter-replace','replace-char','enter-swap','swap-char','toggle-ready','finish-turn','stop-and-next','cycle-avatar']);

  document.getElementById('app').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const value = btn.dataset.value;

    if (VIBRATE_ACTIONS.has(action)) tap();

    switch (action) {
      case 'show-create':
        document.getElementById('home-create')?.classList.remove('hidden');
        document.getElementById('home-hub')?.classList.add('hidden');
        document.getElementById('home-join')?.classList.add('hidden');
        document.getElementById('create-name')?.focus();
        break;
      case 'show-hub':
        document.getElementById('home-hub')?.classList.remove('hidden');
        document.getElementById('home-create')?.classList.add('hidden');
        document.getElementById('home-join')?.classList.add('hidden');
        break;
      case 'show-join':
        document.getElementById('home-join')?.classList.remove('hidden');
        document.getElementById('home-create')?.classList.add('hidden');
        document.getElementById('home-hub')?.classList.add('hidden');
        document.getElementById('join-name')?.focus();
        break;
      case 'create-game': {
        const name = document.getElementById('create-name')?.value?.trim();
        const winScore = parseInt(document.getElementById('create-winscore')?.value) || DEFAULT_WIN_SCORE;
        if (!name) { toast('Enter your name!', 'error'); break; }
        btn.disabled = true;
        try {
          await createRoom(name, winScore);
        } finally {
          btn.disabled = false;
        }
        break;
      }
      case 'create-hub': {
        const winScore = parseInt(document.getElementById('hub-winscore')?.value) || DEFAULT_WIN_SCORE;
        btn.disabled = true;
        try {
          await createHubRoom(winScore);
        } finally {
          btn.disabled = false;
        }
        break;
      }
      case 'join-game': {
        const name = document.getElementById('join-name')?.value?.trim();
        const code = document.getElementById('join-code')?.value?.trim();
        if (!name || !code) { toast('Enter your name and room code!', 'error'); break; }
        btn.disabled = true;
        await joinRoom(code, name);
        btn.disabled = false;
        break;
      }
      case 'toggle-ready': await toggleReady(); break;
      case 'cycle-avatar': {
        const me = getMe();
        if (!me) break;
        const currentIdx = EMOJI_AVATARS.indexOf(me.avatar);
        const nextIdx = (currentIdx + 1) % EMOJI_AVATARS.length;
        const nextAvatar = EMOJI_AVATARS[nextIdx];
        me.avatar = nextAvatar;
        render();
        clearTimeout(state._avatarWriteTimer);
        state._avatarWriteTimer = setTimeout(async () => {
          if (!state.roomCode) return;
          await db.from('yt_players').update({ avatar: nextAvatar })
            .eq('id', state.playerId).eq('room_code', state.roomCode);
        }, 300);
        break;
      }
      case 'start-game': await startGame(); break;
      case 'reroll': await useReroll(); break;
      case 'enter-replace':
        state.replaceMode = true;
        state.replaceCharIndex = null;
        render();
        break;
      case 'cancel-replace':
        state.replaceMode = false;
        state.replaceCharIndex = null;
        render();
        break;
      case 'replace-char':
        state.replaceCharIndex = parseInt(value);
        render();
        setTimeout(() => document.getElementById('replace-char-input')?.focus(), 50);
        break;
      case 'enter-swap':
        state.swapMode = true;
        state.swapFirstIndex = null;
        render();
        break;
      case 'cancel-swap':
        state.swapMode = false;
        state.swapFirstIndex = null;
        render();
        break;
      case 'swap-char': {
        const idx = parseInt(value);
        if (state.swapFirstIndex === null) {
          state.swapFirstIndex = idx;
          render();
        } else if (state.swapFirstIndex === idx) {
          state.swapFirstIndex = null;
          render();
        } else {
          await useSwap(state.swapFirstIndex, idx);
        }
        break;
      }
      case 'select-video': await selectVideo(parseInt(value)); break;
      case 'stop-playback': await stopPlayback(); break;
      case 'stop-and-next': await stopAndNext(); break;
      case 'finish-turn': await finishTurn(); break;
      case 'cast-vote': await castVote(value); break;
      case 'next-round': await nextRound(); break;
      case 'play-again': await playAgain(); break;
      case 'leave-game': await leaveGame(); break;
      case 'confirm-end-game': await confirmEndGame(); break;
      case 'cancel-end-game': cancelEndGame(); break;
      case 'dismiss-ended': dismissEnded(); break;
      case 'kick-player': await kickPlayer(value); break;
      case 'hub-fullscreen': {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFs) {
          const el = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          req?.call(el).catch(err => toast('Fullscreen blocked: ' + err.message, 'error'));
          if (!localStorage.getItem('yt_fs_hint_seen')) {
            toast('Press Esc to exit fullscreen.', 'info');
            localStorage.setItem('yt_fs_hint_seen', '1');
          }
        } else {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          exit?.call(document);
        }
        break;
      }
      // Hub admin actions
      case 'skip-player': await skipPlayer(); break;
      case 're-search': await reSearch(); break;
      case 'force-end-voting': await forceEndVoting(); break;
      case 'force-next-round': await nextRound(); break;
    }
  });

  // Replace character input handler
  document.getElementById('app').addEventListener('input', async (e) => {
    if (e.target.id === 'replace-char-input' && state.replaceCharIndex !== null) {
      const val = e.target.value;
      if (val.length > 0) {
        const idx = state.replaceCharIndex;
        e.target.value = '';
        await useReplace(idx, val.slice(-1));
      }
    }
  });

  // Enter key support
  document.getElementById('app').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'create-name') document.querySelector('[data-action="create-game"]')?.click();
    if (e.target.id === 'join-code' || e.target.id === 'join-name') document.querySelector('[data-action="join-game"]')?.click();
  });
}

// ============================================================
// START
// ============================================================
init();
