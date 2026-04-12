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
const ROOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SPECIALS = '1234567890&#()@!?:._"-\',';  // 22 special characters
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
  replaceCharIndex: null,
  swapMode: false,
  swapFirstIndex: null,
  isProcessing: false,
};

// ============================================================
// INIT
// ============================================================
async function init() {
  state.playerId = localStorage.getItem('yt_player_id');
  if (!state.playerId) {
    state.playerId = crypto.randomUUID();
    localStorage.setItem('yt_player_id', state.playerId);
  }

  setupEventListeners();

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
  state.replaceCharIndex = null;
  state.swapMode = false;
  state.swapFirstIndex = null;
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
  for (let i = 0; i < 4; i++) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
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

  state.replaceMode = false;
  state.replaceCharIndex = null;
  state.swapMode = false;
  state.swapFirstIndex = null;

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

  // Host auto-tally: when all players have voted
  if (isHost() && state.room?.status === 'voting' && !state.isProcessing) {
    const allVoted = state.players.every(p => p.vote_for);
    if (allVoted && state.players.length > 0) {
      state.isProcessing = true;
      await tallyAndAdvance();
      state.isProcessing = false;
    }
  }

  debouncedRender();
}

// ============================================================
// VIEW MANAGEMENT — uses morphdom for flicker-free updates
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
  let html = '';
  switch (state.currentView) {
    case 'home': html = UI.renderHome(); break;
    case 'lobby': html = UI.renderLobby(state); break;
    case 'game': html = UI.renderGame(state); break;
    case 'voting': html = UI.renderVoting(state); break;
    case 'results': html = UI.renderResults(state); break;
    case 'gameover': html = UI.renderGameOver(state); break;
  }

  // morphdom patches the DOM in-place — no flicker, preserves focus/scroll
  const temp = document.createElement('div');
  temp.innerHTML = html;
  window.morphdom(app, temp, { childrenOnly: true });
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

function generateSearchTerm() {
  let t = '';
  for (let i = 0; i < TERM_LENGTH; i++) t += randomChar();
  return t;
}

// 26/27 chance of a letter, 1/27 chance of a special character
function randomChar() {
  const roll = Math.floor(Math.random() * 27);
  if (roll < 26) {
    return LETTERS[roll];
  }
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
  if (!isHost()) return;
  const order = shuffle(state.players.map(p => p.id));
  const term = generateSearchTerm();

  await db.from('yt_players').update({
    ready: false, score: 0,
    has_reroll: true, has_replace: true, has_swap: true,
    selected_video: null, vote_for: null,
  }).eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: 'playing', player_order: order, current_player_index: 0,
    current_search_term: term, round: 1, past_terms: [],
  }).eq('code', state.roomCode);
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

  await db.from('yt_rooms').update({ current_search_term: newTerm })
    .eq('code', state.roomCode);

  await db.from('yt_players').update({ has_replace: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);

  state.replaceMode = false;
  state.replaceCharIndex = null;
}

async function useSwap(idx1, idx2) {
  const me = getMe();
  if (!me?.has_swap) return;
  const chars = state.room.current_search_term.split('');
  [chars[idx1], chars[idx2]] = [chars[idx2], chars[idx1]];
  const newTerm = chars.join('');

  await db.from('yt_rooms').update({ current_search_term: newTerm })
    .eq('code', state.roomCode);

  await db.from('yt_players').update({ has_swap: false })
    .eq('id', state.playerId).eq('room_code', state.roomCode);

  state.swapMode = false;
  state.swapFirstIndex = null;
}

// --- Turn management ---

async function finishTurn() {
  const pastTerms = [...(state.room.past_terms || []), state.room.current_search_term];
  const nextIdx = (state.room.current_player_index || 0) + 1;

  if (nextIdx >= (state.room.player_order?.length || 0)) {
    // All players done → voting
    await db.from('yt_rooms').update({ status: 'voting', past_terms: pastTerms })
      .eq('code', state.roomCode);
  } else {
    // Next player's turn
    const term = generateSearchTerm();
    await db.from('yt_rooms').update({
      current_player_index: nextIdx,
      current_search_term: term,
      past_terms: pastTerms,
    }).eq('code', state.roomCode);
  }
}

// --- Voting & Scoring ---

async function castVote(forPlayerId) {
  await db.from('yt_players').update({ vote_for: forPlayerId })
    .eq('id', state.playerId).eq('room_code', state.roomCode);
}

async function tallyAndAdvance() {
  const { data: freshPlayers } = await db.from('yt_players').select().eq('room_code', state.roomCode);
  state.players = freshPlayers || [];

  const { winnerId } = UI.tallyVotes(state);

  if (winnerId) {
    const winner = state.players.find(p => p.id === winnerId);
    if (winner) {
      await db.from('yt_players').update({ score: winner.score + 1 })
        .eq('id', winnerId).eq('room_code', state.roomCode);
    }
  }

  // Re-fetch updated scores
  const { data: updated } = await db.from('yt_players').select().eq('room_code', state.roomCode);
  state.players = updated || [];

  const gameWinner = state.players.find(p => p.score >= WIN_SCORE);
  await db.from('yt_rooms').update({ status: gameWinner ? 'gameover' : 'results' })
    .eq('code', state.roomCode);
}

// --- Round management ---

async function nextRound() {
  if (!isHost()) return;
  const nextRnd = (state.room.round || 1) + 1;
  const term = generateSearchTerm();

  // Round-robin: rotate player_order so next player starts
  const oldOrder = state.room.player_order || [];
  const rotated = [...oldOrder.slice(1), oldOrder[0]];

  await db.from('yt_players').update({ selected_video: null, vote_for: null })
    .eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: 'playing', round: nextRnd, current_player_index: 0,
    current_search_term: term, player_order: rotated,
  }).eq('code', state.roomCode);
}

async function playAgain() {
  if (!isHost()) return;
  const order = shuffle(state.players.map(p => p.id));
  const term = generateSearchTerm();

  await db.from('yt_players').update({
    score: 0, has_reroll: true, has_replace: true, has_swap: true,
    selected_video: null, vote_for: null, ready: false,
  }).eq('room_code', state.roomCode);

  await db.from('yt_rooms').update({
    status: 'playing', round: 1, current_player_index: 0,
    current_search_term: term, player_order: order, past_terms: [],
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
        } else if (state.swapFirstIndex !== idx) {
          await useSwap(state.swapFirstIndex, idx);
        }
        break;
      }
      case 'finish-turn': await finishTurn(); break;
      case 'cast-vote': await castVote(value); break;
      case 'next-round': await nextRound(); break;
      case 'play-again': await playAgain(); break;
      case 'leave-game': await leaveGame(); break;
    }
  });

  // Replace character input handler
  document.getElementById('app').addEventListener('input', async (e) => {
    if (e.target.id === 'replace-char-input' && state.replaceCharIndex !== null) {
      const val = e.target.value;
      if (val.length > 0) {
        await useReplace(state.replaceCharIndex, val.slice(-1));
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
