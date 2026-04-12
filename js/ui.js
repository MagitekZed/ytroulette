// ============================================================
// YouTube Roulette — View Rendering (ui.js)
// Pure functions that return HTML strings for each view.
// ============================================================

// --- Player color assignment (deterministic by ID) ---
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
// HOME
// ============================================================
export function renderHome() {
  return `
    <div class="home-view anim-fade-in">
      <div class="hero">
        <h1 class="title">YouTube<br><span class="title-accent">Roulette</span></h1>
        <p class="subtitle">Find the weirdest videos. Win the game.</p>
      </div>
      <div class="home-buttons">
        <button class="btn btn-primary btn-lg btn-full" data-action="show-create">Create Game</button>
        <button class="btn btn-secondary btn-lg btn-full" data-action="show-join">Join Game</button>
      </div>
      <div id="home-create" class="form-card glass-card hidden">
        <h2>Create Game</h2>
        <input type="text" id="create-name" placeholder="Your name" maxlength="20" autocomplete="off">
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
// LOBBY
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
          </div>
        `).join('')}
      </div>
      <div class="lobby-actions">
        ${me ? `
          <button class="btn btn-full ${me.ready ? 'btn-ready' : 'btn-not-ready'}" data-action="toggle-ready">
            ${me.ready ? '✓ Ready!' : 'Ready Up'}
          </button>
        ` : ''}
        ${isHost ? `
          <button class="btn btn-gold btn-lg btn-full ${allReady ? '' : 'btn-disabled'}"
            data-action="start-game" ${allReady ? '' : 'disabled'}>
            ${state.players.length < 2 ? 'Need 2+ Players' : !allReady ? 'Waiting for All Ready...' : '🎮 Start Game'}
          </button>
        ` : '<p class="waiting-text">Waiting for the host to start the game...</p>'}
      </div>
      <button class="btn btn-text" data-action="leave-game">Leave Room</button>
    </div>`;
}

// ============================================================
// GAME — Active Player Turn
// ============================================================
export function renderGame(state) {
  const isMyTurn = state.room?.player_order?.[state.room.current_player_index] === state.playerId;
  const activePlayerId = state.room?.player_order?.[state.room.current_player_index];
  const activePlayer = state.players.find(p => p.id === activePlayerId);
  const me = state.players.find(p => p.id === state.playerId);
  const turnNum = (state.room?.current_player_index || 0) + 1;
  const totalTurns = state.room?.player_order?.length || 0;

  const header = `
    <div class="game-header">
      <div class="game-round">ROUND ${state.room?.round || 1} • TURN ${turnNum}/${totalTurns}</div>
      <div class="mini-scores">
        ${getSortedPlayers(state).map(p => `
          <span class="mini-score ${p.id === activePlayerId ? 'active-player' : ''}">${esc(p.name)}: ${p.score}</span>
        `).join('')}
      </div>
    </div>`;

  if (isMyTurn) {
    return `<div class="game-view anim-fade-in">${header}${renderMyTurn(state, me)}</div>`;
  } else {
    return `<div class="game-view anim-fade-in">${header}${renderWaitingTurn(state, activePlayer)}</div>`;
  }
}

function renderMyTurn(state, me) {
  const term = state.room?.current_search_term || '????';
  const videos = state.room?.videos || [];
  const standardVideos = videos.filter(v => v.type === 'standard');
  const wildcardVideos = videos.filter(v => v.type === 'wildcard');

  // Swap mode overlay
  if (state.swapMode) {
    return renderSwapModal(state);
  }

  const replaceClass = state.replaceMode ? 'replace-mode' : '';

  return `
    <div class="search-term-section ${replaceClass}">
      <div class="search-term-label">YOUR SEARCH TERM</div>
      <div class="search-term-chars">
        ${term.split('').map((ch, i) => `
          <div class="search-char"
            ${state.replaceMode ? `data-action="replace-char" data-value="${i}" style="cursor:pointer"` : ''}>
            ${ch}
          </div>
        `).join('')}
      </div>
      ${state.replaceMode ? '<div class="replace-hint">Tap a character to replace it</div>' : ''}
    </div>

    ${!state.replaceMode ? `
    <div class="superpowers">
      <button class="btn btn-sm btn-reroll ${me?.has_reroll ? '' : 'btn-superpower-used'}" data-action="reroll">
        🎲 Reroll
      </button>
      <button class="btn btn-sm btn-replace ${me?.has_replace ? '' : 'btn-superpower-used'}" data-action="enter-replace">
        🔄 Replace
      </button>
      <button class="btn btn-sm btn-swap ${me?.has_swap ? '' : 'btn-superpower-used'}" data-action="enter-swap">
        ↔️ Swap
      </button>
    </div>` : `
    <div class="superpowers">
      <button class="btn btn-sm btn-secondary" data-action="cancel-replace">Cancel Replace</button>
    </div>`}

    <div class="video-options-section anim-slide-up">
      <h3>STANDARD</h3>
      <div class="video-grid">
        ${standardVideos.map(v => `
          <button class="video-option" data-action="select-video" data-value="${esc(v.title)}">
            <span class="video-type-badge badge-standard">STD</span>
            ${esc(v.title)}
          </button>
        `).join('')}
      </div>
    </div>
    <div class="video-options-section">
      <h3>WILDCARDS</h3>
      <div class="video-grid">
        ${wildcardVideos.map(v => `
          <button class="video-option" data-action="select-video" data-value="${esc(v.title)}">
            <span class="video-type-badge badge-wildcard">WILD</span>
            ${esc(v.title)}
          </button>
        `).join('')}
      </div>
    </div>`;
}

function renderSwapModal(state) {
  const pastTerms = state.room?.past_terms || [];
  return `
    <div class="swap-modal glass-card">
      <h3 style="font-family:var(--font-heading);margin-bottom:12px;color:var(--purple)">↔️ Swap Search Term</h3>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">Choose a term from a previous turn, or generate a fresh one.</p>
      <div class="video-grid">
        ${pastTerms.map((t, i) => `
          <button class="swap-option" data-action="swap-term" data-value="${i}">${t}</button>
        `).join('')}
        <button class="swap-option" data-action="swap-fresh" style="color:var(--blue);border-color:rgba(99,179,237,0.25)">
          🎲 Fresh Random Term
        </button>
      </div>
      <button class="btn btn-sm btn-text" data-action="cancel-swap" style="margin-top:12px">Cancel</button>
    </div>`;
}

function renderWaitingTurn(state, activePlayer) {
  // Show what other players have already selected this round
  const playerOrder = state.room?.player_order || [];
  const currentIdx = state.room?.current_player_index || 0;
  const selections = [];
  for (let i = 0; i < currentIdx; i++) {
    const pid = playerOrder[i];
    const p = state.players.find(pl => pl.id === pid);
    if (p?.selected_video) {
      selections.push(p);
    }
  }

  return `
    <div class="waiting-view">
      <div class="waiting-spinner">🎰</div>
      <div class="waiting-name">${esc(activePlayer?.name || '???')}</div>
      <div class="waiting-subtitle">is choosing a video...</div>

      ${selections.length > 0 ? `
        <div class="selections-so-far">
          <h3>SELECTED THIS ROUND</h3>
          ${selections.map(p => `
            <div class="selection-item">
              <span class="selection-player">${esc(p.name)}</span>
              <span class="selection-video">${esc(p.selected_video)}</span>
            </div>
          `).join('')}
        </div>` : ''}
    </div>`;
}

// ============================================================
// VOTING
// ============================================================
export function renderVoting(state) {
  const me = state.players.find(p => p.id === state.playerId);
  const hasVoted = !!me?.vote_for;
  const votedCount = state.players.filter(p => p.vote_for).length;
  const totalPlayers = state.players.length;

  // Only show players who have a selected video
  const votablePlayers = state.players.filter(p => p.selected_video);

  return `
    <div class="voting-view anim-fade-in">
      <div class="voting-header">
        <h1>Vote for Your Favorite!</h1>
        <p class="voting-subtitle">Which video would you most want to watch?</p>
        <div class="vote-progress">${votedCount}/${totalPlayers} votes in</div>
      </div>
      ${votablePlayers.map(p => `
        <div class="vote-card ${me?.vote_for === p.id ? 'voted-for' : ''}">
          <div class="vote-card-player">
            <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:32px;height:32px;font-size:0.85rem">
              ${p.name[0].toUpperCase()}
            </div>
            <span class="vote-card-name">${esc(p.name)}</span>
          </div>
          <div class="vote-card-video">"${esc(p.selected_video)}"</div>
          ${hasVoted
            ? (me?.vote_for === p.id
              ? '<div style="color:var(--teal);font-weight:600;font-size:0.85rem">✓ Your Vote</div>'
              : '')
            : `<button class="btn btn-sm btn-primary btn-full" data-action="cast-vote" data-value="${p.id}">Vote</button>`
          }
        </div>
      `).join('')}
      ${hasVoted ? '<p class="waiting-text">Waiting for other players to vote...</p>' : ''}
    </div>`;
}

// ============================================================
// RESULTS
// ============================================================
export function renderResults(state) {
  const isHost = state.room?.host_id === state.playerId;
  const { winnerId, points, isUnanimous, voteCounts } = tallyVotes(state);

  const winner = state.players.find(p => p.id === winnerId);
  const sorted = getSortedPlayers(state);

  return `
    <div class="results-view anim-fade-in">
      <div class="results-header">
        <h1>Round ${state.room?.round || 1} Results</h1>
        <div class="results-announcement">
          ${winner
            ? `<span class="points-awarded">${esc(winner.name)} earns ${points} point${points > 1 ? 's' : ''}!${isUnanimous ? ' 🌟 Unanimous!' : ''}</span>`
            : '<span style="color:var(--text-muted)">It\'s a tie! No points awarded.</span>'
          }
        </div>
      </div>

      <div class="vote-breakdown">
        <h3>VOTE BREAKDOWN</h3>
        ${state.players.filter(p => p.selected_video).map(p => {
          const votes = voteCounts[p.id] || 0;
          const isWinner = p.id === winnerId;
          return `
            <div class="breakdown-item ${isWinner ? 'is-winner' : ''}">
              <div class="breakdown-info">
                <span class="breakdown-player">${isWinner ? '★ ' : ''}${esc(p.name)}</span>
                <span class="breakdown-video">${esc(p.selected_video)}</span>
              </div>
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
            <span class="score-points">${p.score}</span>
          </div>
        `).join('')}
      </div>

      ${isHost ? `
        <button class="btn btn-gold btn-lg btn-full" data-action="next-round" style="margin-top:8px">
          Next Round →
        </button>
      ` : '<p class="waiting-text">Host is starting the next round...</p>'}
    </div>`;
}

// ============================================================
// GAME OVER
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
            <span class="score-points">${p.score}</span>
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
// HELPERS
// ============================================================
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getSortedPlayers(state) {
  return [...state.players].sort((a, b) => b.score - a.score);
}

function getRankEmoji(index) {
  return ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
}

// Vote tally (also used in app.js, exported for reuse)
export function tallyVotes(state) {
  const voteCounts = {};
  state.players.forEach(p => {
    if (p.vote_for) {
      voteCounts[p.vote_for] = (voteCounts[p.vote_for] || 0) + 1;
    }
  });

  const voteValues = Object.values(voteCounts);
  if (voteValues.length === 0) {
    return { winnerId: null, points: 0, isUnanimous: false, voteCounts };
  }

  const maxVotes = Math.max(...voteValues);
  const winners = Object.entries(voteCounts).filter(([_, c]) => c === maxVotes);

  if (winners.length === 1) {
    const winnerId = winners[0][0];
    const isUnanimous = maxVotes === state.players.length;
    const points = isUnanimous ? 2 : 1;
    return { winnerId, points, isUnanimous, voteCounts };
  }

  // Tie — no points
  return { winnerId: null, points: 0, isUnanimous: false, voteCounts };
}
