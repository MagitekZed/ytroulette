// ============================================================
// YouTube Roulette — Main Application (app.js)
// State management, Supabase integration, game logic, events
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as UI from './ui.js?v=14';
import * as Hub from './hub.js?v=14';

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
const DEFAULT_WIN_SCORE = 3;
const TERM_LENGTH = 4;

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
};

// Expose state for UI rendering
export { state, db };

// ============================================================
// INIT
// ============================================================
async function init() {
  state.playerId = localStorage.getItem('yt_player_id');
  if (!state.playerId) {
    state.playerId = crypto.randomUUID();
    localStorage.setItem('yt_player_id', state.playerId);
  }

  // Check if we had a hub session
  state.isHub = localStorage.getItem('yt_is_hub') === 'true';

  setupEventListeners();

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
      // Safe with concurrent realtime path because startGame has its own isProcessing guard.
      if (state.isHub && state.room?.status === 'lobby'
          && state.players.length >= 2 && state.players.every(p => p.ready)) {
        await startGame();
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
  const { data: room } = await db.from('yt_rooms').select().eq('code', roomCode).single();
  const { data: players } = await db.from('yt_players').select().eq('room_code', roomCode);
  state.room = room;
  state.players = players || [];
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
    .subscribe();
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
  state.room = payload.new;

  // Only reset superpower interaction state when the term or game status changes,
  // so unrelated room updates don't interrupt mid-superpower interaction
  if (oldStatus !== state.room.status || oldTerm !== state.room.current_search_term) {
    state.replaceMode = false;
    state.replaceCharIndex = null;
    state.swapMode = false;
    state.swapFirstIndex = null;
  }

  if (oldStatus !== state.room.status) {
    state.isProcessing = false;
    // Always hide the YouTube player when status changes (e.g., playing → voting)
    if (state.isHub) Hub.stopVideo();
    const { data: players } = await db.from('yt_players').select().eq('room_code', state.roomCode);
    if (players) state.players = players;
    showView(viewForStatus(state.room.status));
  } else if (state.isHub && !state.isSearching && oldTerm !== state.room.current_search_term) {
    // Search term changed (superpower used) — re-search takes priority
    await triggerSearch();
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
  } else if (payload.eventType === 'UPDATE') {
    const idx = state.players.findIndex(p => p.id === payload.new.id);
    if (idx >= 0) state.players[idx] = payload.new;
    else state.players.push(payload.new);
  } else if (payload.eventType === 'DELETE') {
    state.players = state.players.filter(p => p.id !== payload.old?.id);
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
  // (startGame manages its own isProcessing guard)
  if (state.isHub && state.room?.status === 'lobby') {
    if (state.players.length >= 2 && state.players.every(p => p.ready)) {
      await startGame();
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

  await db.from('yt_rooms').update({ playback_status: 'searching' })
    .eq('code', state.roomCode);
  debouncedRender();

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

  state.currentView = name;
  render();

  // When hub enters game view, trigger the first search
  if (state.isHub && name === 'game' && state.room?.playback_status === 'idle') {
    triggerSearch();
  }

  // Hub results auto-advance: 30-second countdown
  if (state.isHub && name === 'results') {
    let countdown = 30;
    state._autoAdvanceTimer = setInterval(async () => {
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
  window.morphdom(app, temp, { childrenOnly: true });
  updateBadge();
}

function updateBadge() {
  const badge = document.getElementById('room-code-badge');
  if (state.isHub) {
    // Hub shows badge differently — it's in the layout
    badge.classList.add('hidden');
  } else if (state.roomCode && state.currentView !== 'home') {
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
    }).eq('code', state.roomCode);
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

async function useReroll() {
  const me = getMe();
  if (!me?.has_reroll) return;
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
  const chars = state.room.current_search_term.split('');
  chars[charIndex] = chosenChar.toUpperCase();
  const newTerm = chars.join('');

  state.replaceMode = false;
  state.replaceCharIndex = null;

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
  const chars = state.room.current_search_term.split('');
  [chars[idx1], chars[idx2]] = [chars[idx2], chars[idx1]];
  const newTerm = chars.join('');

  await db.from('yt_rooms').update({
    current_search_term: newTerm,
    playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
  }).eq('code', state.roomCode);

  await db.from('yt_players').update({ has_swap: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);

  state.swapMode = false;
  state.swapFirstIndex = null;
}

// --- Video Selection (Hub mode) ---

async function selectVideo(index) {
  // Store picked video info on the player's row
  const results = state.room.search_results || [];
  const video = results[index];
  if (!video) {
    toast('Video not found. Try another.', 'error');
    return;
  }

  const me = getMe();
  if (!me) return;

  const videoId = video.type === 'playlist' ? video.firstVideoId : video.videoId;

  await db.from('yt_players').update({
    picked_video_id: videoId,
    picked_video_title: video.title,
    picked_video_thumbnail: video.type === 'playlist' ? video.firstVideoThumbnail : video.thumbnail,
  }).eq('id', state.playerId).eq('room_code', state.roomCode);

  // Store video ID directly on room — avoids stale index lookups
  try {
    const { error } = await db.from('yt_rooms').update({
      selected_video_index: index,
      selected_video_id: videoId,
      playback_status: 'playing',
    }).eq('code', state.roomCode);
    if (error) throw error;
  } catch (err) {
    console.error('selectVideo room update failed:', err);
    toast('Failed to start playback. Try again.', 'error');
    // Roll back the player's picked_video_* fields so the pick can be retried
    try {
      await db.from('yt_players').update({
        picked_video_id: null,
        picked_video_title: null,
        picked_video_thumbnail: null,
      }).eq('id', state.playerId).eq('room_code', state.roomCode);
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
  await db.from('yt_rooms').update({ playback_status: 'stopped' })
    .eq('code', state.roomCode);
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
  if (state.isProcessing) return;
  state.isProcessing = true;
  try {
    const { data: freshPlayers } = await db.from('yt_players').select().eq('room_code', state.roomCode);
    state.players = freshPlayers || [];

    const { winnerId, isUnanimous } = UI.tallyVotes(state);

    if (winnerId) {
      const winner = state.players.find(p => p.id === winnerId);
      if (winner) {
        const points = (isUnanimous && state.players.length >= 3) ? 2 : 1;
        const newScore = (winner.score || 0) + points;
        await db.from('yt_players').update({ score: newScore })
          .eq('id', winnerId).eq('room_code', state.roomCode);
      }
    }

    await new Promise(r => setTimeout(r, 300));

    const { data: updated } = await db.from('yt_players').select().eq('room_code', state.roomCode);
    state.players = updated || [];

    const winScore = state.room.win_score || DEFAULT_WIN_SCORE;
    const gameWinner = state.players.find(p => (p.score || 0) >= winScore);
    await db.from('yt_rooms').update({ status: gameWinner ? 'gameover' : 'results' })
      .eq('code', state.roomCode);
  } finally {
    state.isProcessing = false;
  }
}

// --- Round management ---

async function nextRound() {
  if (!isHost() || state.isProcessing) return;
  state.isProcessing = true;
  try {
    const nextRnd = (state.room.round || 1) + 1;
    const term = generateSearchTerm();

    const { data: currentPlayers } = await db.from('yt_players').select().eq('room_code', state.roomCode);
    const currentIds = new Set((currentPlayers || []).map(p => p.id));

    const oldOrder = state.room.player_order || [];
    const rotated = [...oldOrder.slice(1), oldOrder[0]];
    const cleanOrder = rotated.filter(id => currentIds.has(id));
    const newPlayers = (currentPlayers || []).filter(p => !cleanOrder.includes(p.id)).map(p => p.id);
    const finalOrder = [...cleanOrder, ...newPlayers];

    await db.from('yt_players').update({
      selected_video: null, vote_for: null,
      picked_video_id: null, picked_video_title: null, picked_video_thumbnail: null,
    }).eq('room_code', state.roomCode);

    await db.from('yt_rooms').update({
      status: 'playing', round: nextRnd, current_player_index: 0,
      current_search_term: term, player_order: finalOrder,
      search_results: [], selected_video_index: null, selected_video_id: null, playback_status: 'idle',
    }).eq('code', state.roomCode);
  } finally {
    state.isProcessing = false;
  }
}

async function playAgain() {
  if (!isHost()) return;
  const order = shuffle(state.players.map(p => p.id));
  const term = generateSearchTerm();

  await db.from('yt_players').update({
    score: 0, has_reroll: true, has_replace: true, has_swap: true,
    selected_video: null, vote_for: null, ready: false,
    picked_video_id: null, picked_video_title: null, picked_video_thumbnail: null,
  }).eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: state.isHub ? 'lobby' : 'playing', round: 1, current_player_index: 0,
    current_search_term: term, player_order: order, past_terms: [],
    search_results: [], selected_video_index: null, selected_video_id: null, playback_status: 'idle',
  }).eq('code', state.roomCode);
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
  await db.from('yt_players').delete()
    .eq('id', playerId).eq('room_code', state.roomCode);

  if (state.room.status === 'playing' || state.room.status === 'voting') {
    const order = state.room.player_order || [];
    const kickedIdx = order.indexOf(playerId);
    const newOrder = order.filter(id => id !== playerId);

    if (newOrder.length < 2) {
      await db.from('yt_rooms').update({ status: 'lobby', player_order: newOrder })
        .eq('code', state.roomCode);
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
  await db.from('yt_rooms').update({
    playback_status: 'idle', search_results: [], selected_video_index: null, selected_video_id: null,
  }).eq('code', state.roomCode);
  await triggerSearch();
}

// Hub admin: force end voting
async function forceEndVoting() {
  if (!isHost() || state.room?.status !== 'voting') return;
  // tallyAndAdvance manages its own isProcessing guard
  await tallyAndAdvance();
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
  document.getElementById('app').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const value = btn.dataset.value;

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
