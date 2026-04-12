// ============================================================
// YouTube Roulette — View Rendering (ui.js)
// Pure functions that return HTML strings for each view.
// ============================================================
import { formatDuration } from './hub.js?v=10';

// --- Player colors ---
const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#FFD93D', '#C9B1FF', '#FF8C94',
  '#63B3ED', '#68D391', '#F6AD55', '#FC8181',
];

export function getPlayerColor(playerId) {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length];
}

// ============================================================
// HOME — shared between hub and player
// ============================================================
export function renderHome() {
  return `
    <div class="home-view anim-fade-in">
      <div class="hero">
        <h1 class="title">YouTube<br><span class="title-accent">Roulette</span></h1>
        <p class="subtitle">Find the weirdest videos. Win the game.</p>
      </div>
      <div class="home-buttons">
        <button class="btn btn-primary btn-lg btn-full" data-action="show-hub">🖥️ Host Game (Hub)</button>
        <button class="btn btn-secondary btn-lg btn-full" data-action="show-create">📱 Create Game (Phone)</button>
        <button class="btn btn-secondary btn-lg btn-full" data-action="show-join">Join Game</button>
      </div>
      <div id="home-hub" class="form-card glass-card hidden">
        <h2>Host Hub Display</h2>
        <p style="color:var(--text-muted);font-size:0.85rem">This screen shows the game. Players join on their phones.</p>
        <div style="display:flex;align-items:center;gap:10px">
          <label for="hub-winscore" style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap">Points to win:</label>
          <input type="number" id="hub-winscore" value="3" min="1" max="20"
            style="width:70px;text-align:center;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font-heading);font-size:1.1rem;font-weight:700">
        </div>
        <button class="btn btn-gold btn-full" data-action="create-hub">Create Hub</button>
      </div>
      <div id="home-create" class="form-card glass-card hidden">
        <h2>Create Game</h2>
        <input type="text" id="create-name" placeholder="Your name" maxlength="20" autocomplete="off">
        <div style="display:flex;align-items:center;gap:10px">
          <label for="create-winscore" style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap">Points to win:</label>
          <input type="number" id="create-winscore" value="3" min="1" max="20"
            style="width:70px;text-align:center;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font-heading);font-size:1.1rem;font-weight:700">
        </div>
        <button class="btn btn-primary btn-full" data-action="create-game">Create Room</button>
      </div>
      <div id="home-join" class="form-card glass-card hidden">
        <h2>Join Game</h2>
        <input type="text" id="join-name" placeholder="Your name" maxlength="20" autocomplete="off">
        <input type="text" id="join-code" placeholder="Room code" maxlength="4" autocomplete="off" class="code-input">
        <button class="btn btn-primary btn-full" data-action="join-game">Join Room</button>
      </div>
    </div>`;
}

// ============================================================
// PLAYER LOBBY (phone-only game)
// ============================================================
export function renderLobby(state) {
  const isHost = state.room?.host_id === state.playerId;
  const me = state.players.find(p => p.id === state.playerId);
  const allReady = state.players.length >= 2 && state.players.every(p => p.ready);

  return `
    <div class="lobby-view anim-fade-in">
      <div class="lobby-header">
        <h1>Game Lobby</h1>
        <div class="room-code-display">
          <span class="room-code-label">ROOM CODE</span>
          <span class="room-code-value">${state.roomCode}</span>
        </div>
        <p class="lobby-hint">Share this code with your friends!</p>
      </div>
      <div class="scrollable-content">
        <div class="players-section">
          <h2>PLAYERS (${state.players.length})</h2>
          ${state.players.map(p => `
            <div class="player-card ${p.ready ? 'ready' : ''}">
              <div class="player-avatar" style="background:${getPlayerColor(p.id)}">${p.name[0].toUpperCase()}</div>
              <span class="player-name">
                ${esc(p.name)}${p.id === state.room?.host_id ? ' <span class="host-badge">HOST</span>' : ''}
              </span>
              <span class="ready-indicator ${p.ready ? 'is-ready' : 'not-ready'}">
                ${p.ready ? '✓ Ready' : '○ Waiting'}
              </span>
              ${(isHost && p.id !== state.playerId) ? `<button class="btn-kick" data-action="kick-player" data-value="${p.id}" title="Remove player">✕</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="lobby-actions">
        ${me ? `<button class="btn btn-full ${me.ready ? 'btn-ready' : 'btn-not-ready'}" data-action="toggle-ready">${me.ready ? '✓ Ready!' : 'Ready Up'}</button>` : ''}
        ${isHost ? `
          <button class="btn btn-gold btn-lg btn-full ${allReady ? '' : 'btn-disabled'}"
            data-action="start-game" ${allReady ? '' : 'disabled'}>
            ${state.players.length < 2 ? 'Need 2+ Players' : !allReady ? 'Waiting for Ready...' : '🎮 Start Game'}
          </button>
        ` : '<p class="waiting-text">Waiting for the host to start...</p>'}
      </div>
      <button class="btn btn-text" data-action="leave-game">Leave Room</button>
    </div>`;
}

// ============================================================
// PLAYER GAME VIEW
// ============================================================
export function renderGame(state) {
  const activePlayerId = state.room?.player_order?.[state.room.current_player_index];
  const activePlayer = state.players.find(p => p.id === activePlayerId);
  const isMyTurn = activePlayerId === state.playerId;
  const turnNum = (state.room?.current_player_index || 0) + 1;
  const totalTurns = state.room?.player_order?.length || 0;
  const term = state.room?.current_search_term || '????';
  const winScore = state.room?.win_score || 3;
  const isHubRoom = state.room?.is_hub;
  const playbackStatus = state.room?.playback_status;

  const header = `
    <div class="game-header">
      <div class="game-round">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · FIRST TO ${winScore}</div>
      <div class="game-turn-info">${isMyTurn ? 'Your Turn!' : `${esc(activePlayer?.name || '???')}'s Turn`}</div>
      <div class="mini-scores">
        ${getSortedPlayers(state).map(p => `
          <span class="mini-score ${p.id === activePlayerId ? 'active-player' : ''}">${esc(p.name)}: ${p.score || 0} pts</span>
        `).join('')}
      </div>
    </div>`;

  // Determine mode classes for char interactivity
  const inReplace = isMyTurn && state.replaceMode && state.replaceCharIndex === null;
  const inSwap = isMyTurn && state.swapMode;
  const modeClass = inReplace ? 'replace-mode' : inSwap ? 'swap-mode' : '';
  const charAction = inReplace ? 'replace-char' : inSwap ? 'swap-char' : '';

  const termLabel = isMyTurn ? 'YOUR SEARCH TERM' : `${esc(activePlayer?.name || '???').toUpperCase()}'S SEARCH TERM`;

  let hintHtml = '';
  if (isMyTurn && state.replaceMode && state.replaceCharIndex === null) {
    hintHtml = '<div class="replace-hint">Tap a character to replace</div>';
  } else if (isMyTurn && state.swapMode && state.swapFirstIndex === null) {
    hintHtml = '<div class="swap-hint">Tap the first character to swap</div>';
  } else if (isMyTurn && state.swapMode && state.swapFirstIndex !== null) {
    hintHtml = '<div class="swap-hint">Now tap the second character</div>';
  }

  const termSection = `
    <div class="search-term-section ${modeClass}">
      <div class="search-term-label">${termLabel}</div>
      <div class="search-term-chars" data-term="${esc(term)}">
        ${term.split('').map((ch, i) => {
          const isSwapFirst = state.swapMode && state.swapFirstIndex === i;
          const isReplaceTarget = state.replaceMode && state.replaceCharIndex === i;
          const extraClass = isSwapFirst ? 'swap-selected' : isReplaceTarget ? 'replace-selected' : '';
          const clickAttr = charAction ? `data-action="${charAction}" data-value="${i}" style="cursor:pointer"` : '';
          return `<div class="search-char ${extraClass}" ${clickAttr}>${ch}</div>`;
        }).join('')}
      </div>
      ${hintHtml}
    </div>`;

  const leaveBtn = '<button class="btn btn-text" data-action="leave-game" style="margin-top:auto;padding-top:8px">Leave Game</button>';

  if (isMyTurn) {
    // Hub room: show numbered grid + playback controls
    if (isHubRoom) {
      return `<div class="game-view anim-fade-in">${header}<div class="scrollable-content">${termSection}${renderPlayerHubControls(state, playbackStatus)}</div>${leaveBtn}</div>`;
    }
    return `<div class="game-view anim-fade-in">${header}<div class="scrollable-content">${termSection}${renderMyControls(state)}</div>${leaveBtn}</div>`;
  } else {
    return `<div class="game-view anim-fade-in">${header}<div class="scrollable-content">${termSection}${renderWaitingMessage(activePlayer)}</div>${leaveBtn}</div>`;
  }
}

// Player controls for hub-mode game — numbered grid + playback controls
function renderPlayerHubControls(state, playbackStatus) {
  const me = state.players.find(p => p.id === state.playerId);
  const results = state.room?.search_results || [];

  // Show superpowers (only when not playing)
  if (playbackStatus === 'playing') {
    const selectedVideo = results[state.room?.selected_video_index];
    return `
      <div class="playback-controls">
        <p style="color:var(--gold);font-weight:600;text-align:center;margin:12px 0">🎬 Now Playing: ${esc(selectedVideo?.title || 'Video')}</p>
        <button class="btn btn-primary btn-full" data-action="stop-playback">⏹ Stop Video</button>
        <button class="btn btn-gold btn-full" data-action="stop-and-next">⏹ Stop & Next →</button>
      </div>`;
  }

  if (playbackStatus === 'stopped') {
    return `
      <div class="playback-controls">
        <p style="color:var(--text-muted);text-align:center;margin:12px 0">Video stopped.</p>
        <button class="btn btn-gold btn-lg btn-full" data-action="finish-turn">Done — Next Player →</button>
      </div>`;
  }

  if (playbackStatus === 'searching') {
    return '<div class="waiting-view"><div class="waiting-spinner">🔍</div><div class="waiting-subtitle">Searching YouTube...</div></div>';
  }

  // Replace input mode
  if (state.replaceMode && state.replaceCharIndex !== null) {
    return `
      <div class="replace-input-section">
        <p style="color:var(--green);font-weight:600;margin-bottom:10px">Replacing character #${state.replaceCharIndex + 1}</p>
        <input type="text" id="replace-char-input" placeholder="Type a letter" maxlength="1" autocomplete="off" class="code-input" style="max-width:100px;margin:0 auto;display:block">
        <button class="btn btn-sm btn-text" data-action="cancel-replace" style="margin-top:10px">Cancel</button>
      </div>`;
  }
  if (state.replaceMode) {
    return '<div class="superpowers"><button class="btn btn-sm btn-secondary" data-action="cancel-replace">Cancel Replace</button></div>';
  }
  if (state.swapMode) {
    return '<div class="superpowers"><button class="btn btn-sm btn-secondary" data-action="cancel-swap">Cancel Swap</button></div>';
  }

  // Selecting mode — show superpowers + numbered grid
  return `
    <div class="superpowers">
      <button class="btn btn-sm btn-reroll ${me?.has_reroll ? '' : 'btn-superpower-used'}" data-action="reroll">🎲 Reroll</button>
      <button class="btn btn-sm btn-replace ${me?.has_replace ? '' : 'btn-superpower-used'}" data-action="enter-replace">🔄 Replace</button>
      <button class="btn btn-sm btn-swap ${me?.has_swap ? '' : 'btn-superpower-used'}" data-action="enter-swap">↔️ Swap</button>
    </div>
    <div class="pick-instructions">
      <p>Pick a video from the screen above!</p>
    </div>
    ${renderNumberGrid(results.length)}`;
}

// Numbered grid for selecting videos (phone UI)
function renderNumberGrid(count) {
  let cells = '';
  for (let i = 0; i < 20; i++) {
    const available = i < count;
    cells += `<button class="num-cell ${available ? '' : 'num-cell-empty'}" 
      ${available ? `data-action="select-video" data-value="${i}"` : 'disabled'}>${i + 1}</button>`;
  }
  return `<div class="number-grid">${cells}</div>`;
}

// Active player's controls (non-hub phone-only game)
function renderMyControls(state) {
  const me = state.players.find(p => p.id === state.playerId);
  const isLastPlayer = (state.room?.current_player_index || 0) >= (state.room?.player_order?.length || 1) - 1;

  if (state.replaceMode && state.replaceCharIndex !== null) {
    return `
      <div class="replace-input-section">
        <p style="color:var(--green);font-weight:600;margin-bottom:10px">Replacing character #${state.replaceCharIndex + 1}</p>
        <input type="text" id="replace-char-input" placeholder="Type a letter" maxlength="1" autocomplete="off" class="code-input" style="max-width:100px;margin:0 auto;display:block">
        <button class="btn btn-sm btn-text" data-action="cancel-replace" style="margin-top:10px">Cancel</button>
      </div>`;
  }
  if (state.replaceMode) {
    return '<div class="superpowers"><button class="btn btn-sm btn-secondary" data-action="cancel-replace">Cancel Replace</button></div>';
  }
  if (state.swapMode) {
    return '<div class="superpowers"><button class="btn btn-sm btn-secondary" data-action="cancel-swap">Cancel Swap</button></div>';
  }

  return `
    <div class="superpowers">
      <button class="btn btn-sm btn-reroll ${me?.has_reroll ? '' : 'btn-superpower-used'}" data-action="reroll">🎲 Reroll</button>
      <button class="btn btn-sm btn-replace ${me?.has_replace ? '' : 'btn-superpower-used'}" data-action="enter-replace">🔄 Replace</button>
      <button class="btn btn-sm btn-swap ${me?.has_swap ? '' : 'btn-superpower-used'}" data-action="enter-swap">↔️ Swap</button>
    </div>
    <div class="turn-instructions"><p>Search YouTube for this term and pick your favorite video!</p></div>
    <button class="btn ${isLastPlayer ? 'btn-gold' : 'btn-primary'} btn-lg btn-full" data-action="finish-turn">
      ${isLastPlayer ? '✓ Done — Start Voting' : '✓ Done — Next Player'}
    </button>`;
}

function renderWaitingMessage(activePlayer) {
  return `
    <div class="waiting-view">
      <div class="waiting-spinner">🔍</div>
      <div class="waiting-subtitle">Waiting for <strong>${esc(activePlayer?.name || '???')}</strong> to finish...</div>
    </div>`;
}

// ============================================================
// PLAYER VOTING
// ============================================================
export function renderVoting(state) {
  const me = state.players.find(p => p.id === state.playerId);
  const hasVoted = !!me?.vote_for;
  const orderSet = new Set(state.room?.player_order || []);
  const voteTargets = state.players.filter(p => orderSet.has(p.id));
  const votedCount = state.players.filter(p => p.vote_for).length;
  const totalPlayers = state.players.length;

  return `
    <div class="voting-view anim-fade-in">
      <div class="voting-header">
        <h1>Vote for the Best!</h1>
        <p class="voting-subtitle">Whose video was the most interesting?</p>
        <div class="vote-progress">${votedCount}/${totalPlayers} votes in</div>
      </div>
      <div class="scrollable-content">
        ${voteTargets.map(p => {
          const isSelf = p.id === state.playerId;
          const votedFor = me?.vote_for === p.id;
          return `
            <div class="vote-card ${votedFor ? 'voted-for' : ''}">
              <div class="vote-card-player">
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:36px;height:36px;font-size:0.85rem">${p.name[0].toUpperCase()}</div>
                <span class="vote-card-name">${esc(p.name)}${isSelf ? ' (you)' : ''}</span>
              </div>
              ${hasVoted
                ? (votedFor ? '<div style="color:var(--teal);font-weight:600;font-size:0.85rem">✓ Your Vote</div>' : '')
                : `<button class="btn btn-sm btn-primary btn-full" data-action="cast-vote" data-value="${p.id}">Vote</button>`
              }
            </div>`;
        }).join('')}
        ${!hasVoted ? `
          <div class="vote-card">
            <div class="vote-card-player">
              <span class="vote-card-name" style="color:var(--text-muted)">🚫 No Winner</span>
            </div>
            <button class="btn btn-sm btn-secondary btn-full" data-action="cast-vote" data-value="none">Vote No Winner</button>
          </div>` : ''}
        ${hasVoted && me?.vote_for === 'none' ? '<div style="color:var(--text-muted);font-weight:600;font-size:0.85rem;text-align:center;padding:8px">✓ You voted No Winner</div>' : ''}
        ${hasVoted ? '<p class="waiting-text">Waiting for other players to vote...</p>' : ''}
      </div>
      <button class="btn btn-text" data-action="leave-game">Leave Game</button>
    </div>`;
}

// ============================================================
// PLAYER RESULTS
// ============================================================
export function renderResults(state) {
  const isHost = state.room?.host_id === state.playerId;
  const { winnerId, voteCounts, isUnanimous } = tallyVotes(state);
  const winner = state.players.find(p => p.id === winnerId);
  const sorted = getSortedPlayers(state);
  const pointsAwarded = (isUnanimous && state.players.length >= 3) ? 2 : 1;

  return `
    <div class="results-view anim-fade-in">
      <div class="results-header">
        <h1>Round ${state.room?.round || 1} Results</h1>
        <div class="results-announcement">
          ${winner
            ? `<span class="points-awarded">★ ${esc(winner.name)} earns ${pointsAwarded} point${pointsAwarded > 1 ? 's' : ''}!${isUnanimous ? ' (Unanimous!)' : ''}</span>`
            : '<span style="color:var(--text-muted)">No winner this round.</span>'}
        </div>
      </div>
      <div class="scrollable-content">
        <div class="vote-breakdown">
          <h3>VOTE BREAKDOWN</h3>
          ${state.players.map(p => {
            const votes = voteCounts[p.id] || 0;
            const isWinner = p.id === winnerId;
            return `
              <div class="breakdown-item ${isWinner ? 'is-winner' : ''}">
                <div class="breakdown-info"><span class="breakdown-player">${isWinner ? '★ ' : ''}${esc(p.name)}</span></div>
                <span class="breakdown-votes">${votes} vote${votes !== 1 ? 's' : ''}</span>
              </div>`;
          }).join('')}
        </div>
        <div class="scoreboard">
          <h3>SCOREBOARD</h3>
          ${sorted.map((p, i) => `
            <div class="score-row">
              <span class="score-rank">${getRankEmoji(i)}</span>
              <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:32px;height:32px;font-size:0.8rem">${p.name[0].toUpperCase()}</div>
              <span class="score-name">${esc(p.name)}</span>
              <span class="score-points">${p.score || 0} pts</span>
            </div>
          `).join('')}
        </div>
      </div>
      ${isHost && !state.room?.is_hub ? `
        <button class="btn btn-gold btn-lg btn-full" data-action="next-round" style="margin-top:4px">Next Round →</button>
      ` : '<p class="waiting-text">Next round starting soon...</p>'}
      <button class="btn btn-text" data-action="leave-game">Leave Game</button>
    </div>`;
}

// ============================================================
// PLAYER GAME OVER
// ============================================================
export function renderGameOver(state) {
  const isHost = state.room?.host_id === state.playerId;
  const sorted = getSortedPlayers(state);
  const winner = sorted[0];

  return `
    <div class="gameover-view anim-fade-in">
      <div class="gameover-emoji">🏆</div>
      <div class="gameover-title">Game Over!</div>
      <div class="gameover-winner">${esc(winner?.name || '???')} Wins!</div>
      <div class="scoreboard" style="width:100%;max-width:400px">
        <h3>FINAL SCORES</h3>
        ${sorted.map((p, i) => `
          <div class="score-row">
            <span class="score-rank">${getRankEmoji(i)}</span>
            <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:32px;height:32px;font-size:0.8rem">${p.name[0].toUpperCase()}</div>
            <span class="score-name">${esc(p.name)}</span>
            <span class="score-points">${p.score || 0} pts</span>
          </div>
        `).join('')}
      </div>
      <div class="gameover-actions">
        ${isHost ? '<button class="btn btn-primary btn-full btn-lg" data-action="play-again">Play Again</button>' : ''}
        <button class="btn btn-secondary btn-full" data-action="leave-game">Leave</button>
      </div>
    </div>`;
}

// ============================================================
// HUB VIEWS
// ============================================================

// --- Hub Lobby ---
export function renderHubLobby(state) {
  const playerCount = state.players.length;
  const allReady = playerCount >= 2 && state.players.every(p => p.ready);

  return `
    <div class="hub-layout">
      <div class="hub-top-bar"><span class="hub-room-code">ROOM: ${state.roomCode}</span></div>
      <div class="hub-main">
        <div class="hub-lobby-content">
          <h1 class="hub-title">YouTube Roulette</h1>
          <div class="hub-room-code-large">${state.roomCode}</div>
          <p class="hub-subtitle">Join on your phone with this code!</p>
          <div class="hub-player-list">
            <h2>PLAYERS (${playerCount})</h2>
            ${state.players.map(p => `
              <div class="hub-player-item ${p.ready ? 'ready' : ''}">
                <div class="player-avatar" style="background:${getPlayerColor(p.id)}">${p.name[0].toUpperCase()}</div>
                <span>${esc(p.name)}</span>
                <span class="ready-indicator ${p.ready ? 'is-ready' : 'not-ready'}">${p.ready ? '✓ Ready' : '○ Waiting'}</span>
              </div>
            `).join('')}
          </div>
          <div class="hub-lobby-status">
            ${playerCount < 2 ? 'Waiting for players...'
              : allReady ? '🎮 All ready! Starting game...'
              : 'Waiting for all players to ready up...'}
          </div>
        </div>
      </div>
      ${renderHubAdminBar(state)}
    </div>`;
}

// --- Hub Game (Grid + Video Player) ---
export function renderHubGame(state) {
  const activePlayerId = state.room?.player_order?.[state.room.current_player_index];
  const activePlayer = state.players.find(p => p.id === activePlayerId);
  const turnNum = (state.room?.current_player_index || 0) + 1;
  const totalTurns = state.room?.player_order?.length || 0;
  const term = state.room?.current_search_term || '????';
  const playbackStatus = state.room?.playback_status || 'idle';
  const results = state.room?.search_results || [];

  // If playing video, show fullscreen player
  if (playbackStatus === 'playing') {
    const selectedVideo = results[state.room?.selected_video_index];
    return `
      <div class="hub-layout">
        <div class="hub-top-bar">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · ${esc(activePlayer?.name || '???')}'s Pick</span>
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
        </div>
        <div class="hub-main">
          <div class="hub-stopped-message">
            <div style="font-size:3rem;margin-bottom:16px">▶️</div>
            <h2>Now Playing</h2>
            <p style="color:var(--text-muted)">${selectedVideo ? esc(selectedVideo.title) : 'Loading video...'}</p>
          </div>
        </div>
        ${renderHubAdminBar(state)}
      </div>`;
  }

  // Stopped — show message
  if (playbackStatus === 'stopped') {
    return `
      <div class="hub-layout">
        <div class="hub-top-bar">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns}</span>
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
        </div>
        <div class="hub-main">
          <div class="hub-stopped-message">
            <div style="font-size:3rem;margin-bottom:16px">⏹</div>
            <h2>${esc(activePlayer?.name || '???')}'s video stopped</h2>
            <p style="color:var(--text-muted)">Waiting for them to advance...</p>
          </div>
        </div>
        ${renderHubAdminBar(state)}
      </div>`;
  }

  // Searching
  if (playbackStatus === 'searching') {
    return `
      <div class="hub-layout">
        <div class="hub-top-bar">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · ${esc(activePlayer?.name || '???')}</span>
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
        </div>
        <div class="hub-main">
          <div class="hub-searching">
            <div class="hub-search-term">${term.split('').map(ch => `<span class="hub-char">${ch}</span>`).join('')}</div>
            <div class="hub-searching-spinner">🔍 Searching YouTube...</div>
          </div>
        </div>
        ${renderHubAdminBar(state)}
      </div>`;
  }

  // Selecting — show thumbnail grid
  return `
    <div class="hub-layout">
      <div class="hub-top-bar">
        <div class="hub-top-left">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns}</span>
          <span class="hub-active-player" style="color:${getPlayerColor(activePlayerId || '')}">${esc(activePlayer?.name || '???')}'s Turn</span>
        </div>
        <div class="hub-top-center">
          <div class="hub-search-term-inline">${term.split('').map(ch => `<span class="hub-char-sm">${ch}</span>`).join('')}</div>
        </div>
        <div class="hub-top-right">
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
          <div class="hub-mini-scores">
            ${getSortedPlayers(state).map(p => `<span class="hub-score">${esc(p.name)}: ${p.score || 0}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="hub-main">
        <div class="hub-grid">
          ${Array.from({length: 20}, (_, i) => {
            const video = results[i];
            if (!video) {
              return `<div class="hub-thumb hub-thumb-empty"><span class="hub-thumb-num">${i + 1}</span></div>`;
            }
            const thumb = video.type === 'playlist' ? (video.firstVideoThumbnail || video.thumbnail) : video.thumbnail;
            const duration = video.type === 'video' ? formatDuration(video.durationSeconds) : '';
            const badge = video.type === 'playlist' ? '<span class="hub-badge-playlist">PLAYLIST</span>' : '';
            const meta = video.type === 'video'
              ? `<span class="hub-thumb-duration">${duration}</span><span class="hub-thumb-views">${formatViews(video.viewCount)} views</span>`
              : `<span class="hub-thumb-duration">${video.itemCount || '?'} videos</span>`;
            return `
              <div class="hub-thumb">
                <span class="hub-thumb-num">${i + 1}</span>
                <img src="${esc(thumb)}" alt="" class="hub-thumb-img" loading="lazy">
                <div class="hub-thumb-info">
                  ${badge}
                  <span class="hub-thumb-title">${esc(video.title)}</span>
                  <div class="hub-thumb-meta">${meta}</div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
      ${renderHubAdminBar(state)}
    </div>`;
}

// --- Hub Voting ---
export function renderHubVoting(state) {
  const { voteCounts } = tallyVotes(state);
  const playerOrder = state.room?.player_order || [];
  // Show players in the order they played (stable, won't reorder on vote)
  const votingPlayers = playerOrder
    .map(id => state.players.find(p => p.id === id))
    .filter(Boolean);
  const votedCount = state.players.filter(p => p.vote_for).length;
  const totalPlayers = state.players.length;
  const noneVotes = state.players.filter(p => p.vote_for === 'none').length;

  return `
    <div class="hub-layout">
      <div class="hub-top-bar">
        <span class="hub-game-info">VOTING · ${votedCount}/${totalPlayers} votes in</span>
        <span class="hub-room-code">ROOM: ${state.roomCode}</span>
      </div>
      <div class="hub-main" style="flex-direction:column;gap:24px;padding:24px">
        <h1 style="text-align:center;font-family:var(--font-heading);font-size:2rem;flex-shrink:0">Cast Your Vote!</h1>
        <div class="hub-vote-grid">
          ${votingPlayers.map(p => {
            const votes = voteCounts[p.id] || 0;
            return `
              <div class="hub-vote-card">
                ${p.picked_video_thumbnail ? `<img src="${esc(p.picked_video_thumbnail)}" class="hub-vote-thumb">` : '<div class="hub-vote-thumb-empty">🎬</div>'}
                <div class="hub-vote-info">
                  <div class="hub-vote-player" style="color:${getPlayerColor(p.id)}">${esc(p.name)}</div>
                  <div class="hub-vote-title">${esc(p.picked_video_title || 'No video')}</div>
                  <div class="hub-vote-count">${votes} vote${votes !== 1 ? 's' : ''}</div>
                </div>
              </div>`;
          }).join('')}
          ${noneVotes > 0 ? `
            <div class="hub-vote-card">
              <div class="hub-vote-thumb-empty">🚫</div>
              <div class="hub-vote-info">
                <div class="hub-vote-player" style="color:var(--text-muted)">No Winner</div>
                <div class="hub-vote-count">${noneVotes} vote${noneVotes !== 1 ? 's' : ''}</div>
              </div>
            </div>` : ''}
        </div>
      </div>
      ${renderHubAdminBar(state)}
    </div>`;
}

// --- Hub Results ---
export function renderHubResults(state) {
  const { winnerId, voteCounts, isUnanimous } = tallyVotes(state);
  const winner = state.players.find(p => p.id === winnerId);
  const sorted = getSortedPlayers(state);
  const winScore = state.room?.win_score || 3;
  const pointsAwarded = (isUnanimous && state.players.length >= 3) ? 2 : 1;

  return `
    <div class="hub-layout">
      <div class="hub-top-bar">
        <span class="hub-game-info">ROUND ${state.room?.round || 1} RESULTS</span>
        <span class="hub-room-code">ROOM: ${state.roomCode}</span>
      </div>
      <div class="hub-main">
        <div class="hub-results-content">
          <div class="hub-results-announcement">
            ${winner
              ? `<div class="hub-winner-name" style="color:${getPlayerColor(winner.id)}">★ ${esc(winner.name)} earns ${pointsAwarded} point${pointsAwarded > 1 ? 's' : ''}!${isUnanimous ? ' 🔥 Unanimous!' : ''}</div>`
              : '<div style="color:var(--text-muted);font-size:1.5rem">No winner this round.</div>'}
          </div>
          <div class="hub-scoreboard">
            ${sorted.map((p, i) => `
              <div class="hub-score-row">
                <span class="hub-score-rank">${getRankEmoji(i)}</span>
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:48px;height:48px;font-size:1.2rem">${p.name[0].toUpperCase()}</div>
                <span class="hub-score-name">${esc(p.name)}</span>
                <div class="hub-score-bar" style="width:${Math.max(5, ((p.score || 0) / winScore) * 100)}%"></div>
                <span class="hub-score-pts">${p.score || 0}/${winScore}</span>
              </div>
            `).join('')}
          </div>
          <div class="hub-auto-advance" id="hub-auto-advance">
            Next round in <span id="hub-countdown">30</span>s
          </div>
        </div>
      </div>
      ${renderHubAdminBar(state)}
    </div>`;
}

// --- Hub Game Over ---
export function renderHubGameOver(state) {
  const sorted = getSortedPlayers(state);
  const winner = sorted[0];

  return `
    <div class="hub-layout">
      <div class="hub-top-bar">
        <span class="hub-game-info">GAME OVER</span>
        <span class="hub-room-code">ROOM: ${state.roomCode}</span>
      </div>
      <div class="hub-main">
        <div class="hub-gameover-content">
          <div style="font-size:5rem;margin-bottom:16px">🏆</div>
          <div class="hub-gameover-title">${esc(winner?.name || '???')} Wins!</div>
          <div class="hub-scoreboard" style="margin-top:32px">
            ${sorted.map((p, i) => `
              <div class="hub-score-row">
                <span class="hub-score-rank">${getRankEmoji(i)}</span>
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:48px;height:48px;font-size:1.2rem">${p.name[0].toUpperCase()}</div>
                <span class="hub-score-name">${esc(p.name)}</span>
                <span class="hub-score-pts">${p.score || 0} pts</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${renderHubAdminBar(state, true)}
    </div>`;
}

// --- Hub Admin Toolbar ---
function renderHubAdminBar(state, isGameOver = false) {
  const status = state.room?.status;
  const playback = state.room?.playback_status;

  let buttons = '';
  if (isGameOver) {
    buttons = `
      <button class="btn btn-sm btn-gold" data-action="play-again">🔄 Play Again</button>
      <button class="btn btn-sm btn-text" data-action="leave-game">Leave</button>`;
  } else if (status === 'playing') {
    buttons = `
      <button class="btn btn-sm btn-secondary" data-action="skip-player">⏭ Skip Player</button>
      <button class="btn btn-sm btn-secondary" data-action="re-search">🔄 Re-Search</button>
      ${playback === 'playing' ? '<button class="btn btn-sm btn-secondary" data-action="stop-playback">⏹ Stop Video</button>' : ''}
      <button class="btn btn-sm btn-text" data-action="leave-game">✕</button>`;
  } else if (status === 'voting') {
    buttons = `
      <button class="btn btn-sm btn-secondary" data-action="force-end-voting">⏩ End Voting</button>
      <button class="btn btn-sm btn-text" data-action="leave-game">✕</button>`;
  } else if (status === 'results') {
    buttons = `
      <button class="btn btn-sm btn-gold" data-action="next-round">Next Round →</button>
      <button class="btn btn-sm btn-text" data-action="leave-game">✕</button>`;
  } else {
    buttons = `<button class="btn btn-sm btn-text" data-action="leave-game">✕ Close Hub</button>`;
  }

  return `<div class="hub-admin-bar">${buttons}</div>`;
}

// ============================================================
// HELPERS
// ============================================================
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getSortedPlayers(state) {
  return [...state.players].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function formatViews(count) {
  if (!count || count === 0) return '0';
  if (count >= 1000000000) return (count / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (count >= 1000000) return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return count.toString();
}

function getRankEmoji(index) {
  return ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
}

// ============================================================
// CONFIRM LEAVE OVERLAY (Hub)
// ============================================================
export function renderConfirmLeave() {
  return `
    <div class="overlay-backdrop">
      <div class="overlay-dialog">
        <div style="font-size:2.5rem;margin-bottom:12px">⚠️</div>
        <h2>End Game?</h2>
        <p style="color:var(--text-muted);margin:8px 0 20px">This will close the room and disconnect all players.</p>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%">
          <button class="btn btn-primary btn-full" data-action="confirm-end-game">Yes, End Game</button>
          <button class="btn btn-secondary btn-full" data-action="cancel-end-game">Cancel</button>
        </div>
      </div>
    </div>`;
}

// ============================================================
// HOST ENDED VIEW (Player)
// ============================================================
export function renderHostEnded() {
  return `
    <div class="home-view anim-fade-in" style="justify-content:center">
      <div style="text-align:center">
        <div style="font-size:3rem;margin-bottom:16px">👋</div>
        <h1 style="font-family:var(--font-heading);font-size:1.6rem;margin-bottom:8px">Host Ended the Game</h1>
        <p style="color:var(--text-muted);margin-bottom:24px">The room has been closed by the host.</p>
        <button class="btn btn-primary btn-lg btn-full" data-action="dismiss-ended">OK</button>
      </div>
    </div>`;
}

export function tallyVotes(state) {
  const voteCounts = {};
  let totalVoters = 0;
  state.players.forEach(p => {
    if (p.vote_for) {
      totalVoters++;
      // 'none' votes count but don't go toward any player
      if (p.vote_for !== 'none') {
        voteCounts[p.vote_for] = (voteCounts[p.vote_for] || 0) + 1;
      }
    }
  });
  const entries = Object.entries(voteCounts);
  if (entries.length === 0) return { winnerId: null, voteCounts, isUnanimous: false };
  const maxVotes = Math.max(...entries.map(([_, c]) => c));
  const winners = entries.filter(([_, c]) => c === maxVotes);
  if (winners.length === 1) {
    const winnerId = winners[0][0];
    const isUnanimous = maxVotes === totalVoters && totalVoters >= 3;
    return { winnerId, voteCounts, isUnanimous };
  }
  return { winnerId: null, voteCounts, isUnanimous: false };
}
