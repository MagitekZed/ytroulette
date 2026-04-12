// ============================================================
// YouTube Roulette — Main Application (app.js)
// State management, Supabase integration, game logic, events
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as UI from './ui.js';

// ============================================================
// SUPABASE CLIENT
// ============================================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// CONSTANTS
// ============================================================
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const WIN_SCORE = 3;
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
  replaceMode: false,
  swapMode: false,
  isProcessing: false,
};

// ============================================================
// INIT
// ============================================================
async function init() {
  // Generate or retrieve persistent player ID
  state.playerId = localStorage.getItem('yt_player_id');
  if (!state.playerId) {
    state.playerId = crypto.randomUUID();
    localStorage.setItem('yt_player_id', state.playerId);
  }

  setupEventListeners();

  // Try to rejoin an existing session
  const savedRoom = localStorage.getItem('yt_room_code');
  const savedName = localStorage.getItem('yt_player_name');

  if (savedRoom && savedName) {
    state.playerName = savedName;
    const ok = await attemptRejoin(savedRoom);
    if (!ok) {
      clearSession();
      showView('home');
    }
  } else {
    showView('home');
  }
}

// ============================================================
// SESSION
// ============================================================
function clearSession() {
  localStorage.removeItem('yt_room_code');
  localStorage.removeItem('yt_player_name');
  state.roomCode = null;
  state.room = null;
  state.players = [];
  state.playerName = null;
  state.replaceMode = false;
  state.swapMode = false;
  if (state.channel) {
    db.removeChannel(state.channel);
    state.channel = null;
  }
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
  } catch {
    return false;
  }
}

// ============================================================
// ROOM MANAGEMENT
// ============================================================
function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

async function createRoom(playerName) {
  const code = generateRoomCode();

  const { error: roomErr } = await db.from('yt_rooms').insert({ code, host_id: state.playerId, status: 'lobby' });
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

async function joinRoom(roomCode, playerName) {
  roomCode = roomCode.toUpperCase().trim();

  const { data: room } = await db.from('yt_rooms').select().eq('code', roomCode).single();
  if (!room) { toast('Room not found. Check the code.', 'error'); return; }
  if (room.status !== 'lobby') { toast('Game already in progress.', 'error'); return; }

  const { data: existing } = await db.from('yt_players').select().eq('room_code', roomCode);
  if (existing?.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    toast('That name is taken. Choose another.', 'error'); return;
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
  showView('lobby');
  toast('Joined room!', 'success');
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

function handleRoomChange(payload) {
  if (payload.eventType === 'DELETE') return;
  const oldStatus = state.room?.status;
  state.room = payload.new;

  // Reset local UI modes on turn/status change
  state.replaceMode = false;
  state.swapMode = false;

  if (oldStatus !== state.room.status) {
    showView(viewForStatus(state.room.status));
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

  // Host checks: all voted → tally
  if (isHost() && state.room?.status === 'voting' && !state.isProcessing) {
    const allVoted = state.players.every(p => p.vote_for);
    if (allVoted) {
      state.isProcessing = true;
      await tallyAndAdvance();
      state.isProcessing = false;
    }
  }

  debouncedRender();
}

// ============================================================
// VIEW MANAGEMENT
// ============================================================
let renderTimer = null;
function debouncedRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => render(), 40);
}

function showView(name) {
  state.currentView = name;
  render();
}

function render() {
  const app = document.getElementById('app');
  switch (state.currentView) {
    case 'home': app.innerHTML = UI.renderHome(); break;
    case 'lobby': app.innerHTML = UI.renderLobby(state); break;
    case 'game': app.innerHTML = UI.renderGame(state); break;
    case 'voting': app.innerHTML = UI.renderVoting(state); break;
    case 'results': app.innerHTML = UI.renderResults(state); break;
    case 'gameover': app.innerHTML = UI.renderGameOver(state); break;
  }
  updateBadge();
}

function updateBadge() {
  const badge = document.getElementById('room-code-badge');
  if (state.roomCode && state.currentView !== 'home') {
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

// ============================================================
// SEARCH TERM & MOCK VIDEOS
// ============================================================
function generateSearchTerm() {
  let t = '';
  for (let i = 0; i < TERM_LENGTH; i++) t += CHARS[Math.floor(Math.random() * CHARS.length)];
  return t;
}

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateMockVideos(term) {
  const t2 = generateSearchTerm();
  const std = shuffle([
    `What happens when you search "${term}"`,
    `"${term}" — Nobody expected this...`,
    `Searching "${term}" at 3AM (DO NOT TRY)`,
    `I tried "${term}" for 24 hours straight`,
    `Top 10 "${term}" moments caught on camera`,
    `"${term}" explained in under 60 seconds`,
    `Why "${term}" is trending worldwide right now`,
    `"${term}" — The Documentary`,
    `Reacting to "${term}" for the very first time`,
    `"${term}" fails compilation #47`,
    `POV: You just discovered "${term}"`,
    `I let "${term}" control my life for a day`,
  ]).slice(0, 3).map(title => ({ title, type: 'standard' }));

  const wild = shuffle([
    `♫ "${term}" (Official Music Video) ♫`,
    `"${term}" ASMR — 10 Hours Relaxation`,
    `"${term}" Speedrun World Record 4:32`,
    `Gordon Ramsay tries "${term}"`,
    `"${term}" vs "${t2}" — Epic Battle`,
    `Baby's first "${term}" reaction`,
    `Making "${term}" out of LEGO in real life`,
    `"${term}" conspiracy theories that might be true`,
    `"${term}" workout challenge — can you survive?`,
  ]).slice(0, 3).map(title => ({ title, type: 'wildcard' }));

  return [...std, ...wild];
}

// ============================================================
// GAME ACTIONS
// ============================================================
async function startGame() {
  if (!isHost()) return;
  const order = shuffle(state.players.map(p => p.id));
  const term = generateSearchTerm();
  const videos = generateMockVideos(term);

  // Reset all players
  await db.from('yt_players').update({
    ready: false, score: 0,
    has_reroll: true, has_replace: true, has_swap: true,
    selected_video: null, vote_for: null,
  }).eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: 'playing', player_order: order, current_player_index: 0,
    current_search_term: term, round: 1, videos, past_terms: [],
  }).eq('code', state.roomCode);
}

async function toggleReady() {
  const me = getMe();
  if (!me) return;
  await db.from('yt_players').update({ ready: !me.ready })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function useReroll() {
  const me = getMe();
  if (!me?.has_reroll) return;
  const oldTerm = state.room.current_search_term;
  const newTerm = generateSearchTerm();
  const videos = generateMockVideos(newTerm);

  await db.from('yt_rooms').update({
    current_search_term: newTerm, videos,
    past_terms: [...(state.room.past_terms || []), oldTerm],
  }).eq('code', state.roomCode);

  await db.from('yt_players').update({ has_reroll: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function useReplace(charIndex) {
  const me = getMe();
  if (!me?.has_replace) return;
  const chars = state.room.current_search_term.split('');
  chars[charIndex] = randomChar();
  const newTerm = chars.join('');
  const videos = generateMockVideos(newTerm);

  await db.from('yt_rooms').update({ current_search_term: newTerm, videos })
    .eq('code', state.roomCode);

  await db.from('yt_players').update({ has_replace: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);

  state.replaceMode = false;
}

async function useSwap(termIndex) {
  const me = getMe();
  if (!me?.has_swap) return;
  const past = state.room.past_terms || [];
  const newTerm = (termIndex !== undefined && past[termIndex]) ? past[termIndex] : generateSearchTerm();
  const videos = generateMockVideos(newTerm);

  await db.from('yt_rooms').update({ current_search_term: newTerm, videos })
    .eq('code', state.roomCode);

  await db.from('yt_players').update({ has_swap: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);

  state.swapMode = false;
}

async function selectVideo(title) {
  await db.from('yt_players').update({ selected_video: title })
    .eq('id', state.playerId).eq('room_code', state.roomCode);

  const pastTerms = [...(state.room.past_terms || []), state.room.current_search_term];
  const nextIdx = (state.room.current_player_index || 0) + 1;

  if (nextIdx >= (state.room.player_order?.length || 0)) {
    // All done → voting
    await db.from('yt_rooms').update({ status: 'voting', past_terms: pastTerms })
      .eq('code', state.roomCode);
  } else {
    // Next turn
    const term = generateSearchTerm();
    const videos = generateMockVideos(term);
    await db.from('yt_rooms').update({
      current_player_index: nextIdx, current_search_term: term, videos, past_terms: pastTerms,
    }).eq('code', state.roomCode);
  }
}

async function castVote(forPlayerId) {
  await db.from('yt_players').update({ vote_for: forPlayerId })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function tallyAndAdvance() {
  // Recompute tally from current player data
  const { data: freshPlayers } = await db.from('yt_players').select().eq('room_code', state.roomCode);
  state.players = freshPlayers || [];

  const { winnerId, points } = UI.tallyVotes(state);

  if (winnerId && points > 0) {
    const winner = state.players.find(p => p.id === winnerId);
    if (winner) {
      await db.from('yt_players').update({ score: winner.score + points })
        .eq('id', winnerId).eq('room_code', state.roomCode);
    }
  }

  // Re-fetch to get updated score
  const { data: updated } = await db.from('yt_players').select().eq('room_code', state.roomCode);
  state.players = updated || [];

  const gameWinner = state.players.find(p => p.score >= WIN_SCORE);
  await db.from('yt_rooms').update({ status: gameWinner ? 'gameover' : 'results' })
    .eq('code', state.roomCode);
}

async function nextRound() {
  if (!isHost()) return;
  const nextRnd = (state.room.round || 1) + 1;
  const term = generateSearchTerm();
  const videos = generateMockVideos(term);

  await db.from('yt_players').update({ selected_video: null, vote_for: null })
    .eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: 'playing', round: nextRnd, current_player_index: 0,
    current_search_term: term, videos,
  }).eq('code', state.roomCode);
}

async function playAgain() {
  if (!isHost()) return;
  const order = shuffle(state.players.map(p => p.id));
  const term = generateSearchTerm();
  const videos = generateMockVideos(term);

  await db.from('yt_players').update({
    score: 0, has_reroll: true, has_replace: true, has_swap: true,
    selected_video: null, vote_for: null, ready: false,
  }).eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: 'playing', round: 1, current_player_index: 0,
    current_search_term: term, player_order: order, videos, past_terms: [],
  }).eq('code', state.roomCode);
}

async function leaveGame() {
  await db.from('yt_players').delete()
    .eq('id', state.playerId).eq('room_code', state.roomCode);
  clearSession();
  showView('home');
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
        document.getElementById('home-join')?.classList.add('hidden');
        document.getElementById('create-name')?.focus();
        break;
      case 'show-join':
        document.getElementById('home-join')?.classList.remove('hidden');
        document.getElementById('home-create')?.classList.add('hidden');
        document.getElementById('join-name')?.focus();
        break;
      case 'create-game': {
        const name = document.getElementById('create-name')?.value?.trim();
        if (!name) { toast('Enter your name!', 'error'); break; }
        btn.disabled = true;
        await createRoom(name);
        break;
      }
      case 'join-game': {
        const name = document.getElementById('join-name')?.value?.trim();
        const code = document.getElementById('join-code')?.value?.trim();
        if (!name || !code) { toast('Enter your name and room code!', 'error'); break; }
        btn.disabled = true;
        await joinRoom(code, name);
        break;
      }
      case 'toggle-ready': await toggleReady(); break;
      case 'start-game': await startGame(); break;
      case 'reroll': await useReroll(); break;
      case 'enter-replace': state.replaceMode = true; render(); break;
      case 'cancel-replace': state.replaceMode = false; render(); break;
      case 'replace-char': await useReplace(parseInt(value)); break;
      case 'enter-swap':
        if (!(state.room?.past_terms?.length)) { await useSwap(); }
        else { state.swapMode = true; render(); }
        break;
      case 'cancel-swap': state.swapMode = false; render(); break;
      case 'swap-term': await useSwap(parseInt(value)); break;
      case 'swap-fresh': await useSwap(); break;
      case 'select-video': await selectVideo(value); break;
      case 'cast-vote': await castVote(value); break;
      case 'next-round': await nextRound(); break;
      case 'play-again': await playAgain(); break;
      case 'leave-game': await leaveGame(); break;
    }
  });

  // Enter key support for inputs
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
