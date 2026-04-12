// ============================================================
// YouTube Roulette — View Rendering (ui.js)
// Pure functions that return HTML strings for each view.
// ============================================================

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
            </div>
          `).join('')}
        </div>
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
// GAME VIEW
// ============================================================
export function renderGame(state) {
  const activePlayerId = state.room?.player_order?.[state.room.current_player_index];
  const activePlayer = state.players.find(p => p.id === activePlayerId);
  const isMyTurn = activePlayerId === state.playerId;
  const turnNum = (state.room?.current_player_index || 0) + 1;
  const totalTurns = state.room?.player_order?.length || 0;
  const term = state.room?.current_search_term || '????';

  const winScore = state.room?.win_score || 3;

  const header = `
    <div class="game-header">
      <div class="game-round">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · FIRST TO ${winScore}</div>
      <div class="game-turn-info">${isMyTurn ? 'Your Turn!' : `${esc(activePlayer?.name || '???')}'s Turn`}</div>
      <div class="mini-scores">
        ${getSortedPlayers(state).map(p => `
          <span class="mini-score ${p.id === activePlayerId ? 'active-player' : ''}">${esc(p.name)}: ${p.score}</span>
        `).join('')}
      </div>
    </div>`;

  // Determine mode classes and char interactivity
  const inReplace = isMyTurn && state.replaceMode && state.replaceCharIndex === null;
  const inSwap = isMyTurn && state.swapMode;
  const modeClass = inReplace ? 'replace-mode' : inSwap ? 'swap-mode' : '';
  const charAction = inReplace ? 'replace-char' : inSwap ? 'swap-char' : '';

  const termLabel = isMyTurn ? 'YOUR SEARCH TERM' : `${esc(activePlayer?.name || '???').toUpperCase()}'S SEARCH TERM`;

  // Build hint text
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
    return `<div class="game-view anim-fade-in">${header}<div class="scrollable-content">${termSection}${renderMyControls(state)}</div>${leaveBtn}</div>`;
  } else {
    return `<div class="game-view anim-fade-in">${header}<div class="scrollable-content">${termSection}${renderWaitingMessage(activePlayer)}</div>${leaveBtn}</div>`;
  }
}

// Active player's controls
function renderMyControls(state) {
  const me = state.players.find(p => p.id === state.playerId);
  const isLastPlayer = (state.room?.current_player_index || 0) >= (state.room?.player_order?.length || 1) - 1;

  // Replace mode with char selected → show input
  if (state.replaceMode && state.replaceCharIndex !== null) {
    return `
      <div class="replace-input-section">
        <p style="color:var(--green);font-weight:600;margin-bottom:10px">
          Replacing character #${state.replaceCharIndex + 1}
        </p>
        <input type="text" id="replace-char-input" placeholder="Type a letter"
          maxlength="1" autocomplete="off" class="code-input"
          style="max-width:100px;margin:0 auto;display:block">
        <button class="btn btn-sm btn-text" data-action="cancel-replace" style="margin-top:10px">Cancel</button>
      </div>`;
  }

  // Replace mode (no char selected yet) → chars are tappable, show cancel
  if (state.replaceMode) {
    return `
      <div class="superpowers">
        <button class="btn btn-sm btn-secondary" data-action="cancel-replace">Cancel Replace</button>
      </div>`;
  }

  // Swap mode → chars are tappable, show cancel
  if (state.swapMode) {
    return `
      <div class="superpowers">
        <button class="btn btn-sm btn-secondary" data-action="cancel-swap">Cancel Swap</button>
      </div>`;
  }

  // Normal mode — show superpowers + Done
  return `
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
    </div>

    <div class="turn-instructions">
      <p>Search YouTube for this term and pick your favorite video to show the group!</p>
    </div>

    <button class="btn ${isLastPlayer ? 'btn-gold' : 'btn-primary'} btn-lg btn-full" data-action="finish-turn">
      ${isLastPlayer ? '✓ Done — Start Voting' : '✓ Done — Next Player'}
    </button>`;
}

// Waiting players see the search term + a waiting message
function renderWaitingMessage(activePlayer) {
  return `
    <div class="waiting-view">
      <div class="waiting-spinner">🔍</div>
      <div class="waiting-subtitle">Waiting for <strong>${esc(activePlayer?.name || '???')}</strong> to finish searching...</div>
    </div>`;
}

// ============================================================
// VOTING — vote for a player
// ============================================================
export function renderVoting(state) {
  const me = state.players.find(p => p.id === state.playerId);
  const hasVoted = !!me?.vote_for;
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
        ${state.players.map(p => {
          const isSelf = p.id === state.playerId;
          const votedFor = me?.vote_for === p.id;
          return `
            <div class="vote-card ${votedFor ? 'voted-for' : ''}">
              <div class="vote-card-player">
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:36px;height:36px;font-size:0.85rem">
                  ${p.name[0].toUpperCase()}
                </div>
                <span class="vote-card-name">${esc(p.name)}${isSelf ? ' (you)' : ''}</span>
              </div>
              ${hasVoted
                ? (votedFor
                  ? '<div style="color:var(--teal);font-weight:600;font-size:0.85rem">✓ Your Vote</div>'
                  : '')
                : `<button class="btn btn-sm btn-primary btn-full" data-action="cast-vote" data-value="${p.id}">Vote</button>`
              }
            </div>`;
        }).join('')}
        ${hasVoted ? '<p class="waiting-text">Waiting for other players to vote...</p>' : ''}
      </div>
      <button class="btn btn-text" data-action="leave-game">Leave Game</button>
    </div>`;
}

// ============================================================
// RESULTS
// ============================================================
export function renderResults(state) {
  const isHost = state.room?.host_id === state.playerId;
  const { winnerId, voteCounts } = tallyVotes(state);
  const winner = state.players.find(p => p.id === winnerId);
  const sorted = getSortedPlayers(state);

  return `
    <div class="results-view anim-fade-in">
      <div class="results-header">
        <h1>Round ${state.room?.round || 1} Results</h1>
        <div class="results-announcement">
          ${winner
            ? `<span class="points-awarded">★ ${esc(winner.name)} earns 1 point!</span>`
            : '<span style="color:var(--text-muted)">It\'s a tie! No points awarded.</span>'
          }
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
                <div class="breakdown-info">
                  <span class="breakdown-player">${isWinner ? '★ ' : ''}${esc(p.name)}</span>
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
      </div>

      ${isHost ? `
        <button class="btn btn-gold btn-lg btn-full" data-action="next-round" style="margin-top:4px">
          Next Round →
        </button>
      ` : '<p class="waiting-text">Host is starting the next round...</p>'}
      <button class="btn btn-text" data-action="leave-game">Leave Game</button>
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

// Vote tally: most votes = winner. Tie = no winner. Always 1 point.
export function tallyVotes(state) {
  const voteCounts = {};
  state.players.forEach(p => {
    if (p.vote_for) {
      voteCounts[p.vote_for] = (voteCounts[p.vote_for] || 0) + 1;
    }
  });

  const entries = Object.entries(voteCounts);
  if (entries.length === 0) {
    return { winnerId: null, voteCounts };
  }

  const maxVotes = Math.max(...entries.map(([_, c]) => c));
  const winners = entries.filter(([_, c]) => c === maxVotes);

  if (winners.length === 1) {
    return { winnerId: winners[0][0], voteCounts };
  }

  return { winnerId: null, voteCounts };
}
