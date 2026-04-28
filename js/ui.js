// ============================================================
// YouTube Roulette — View Rendering (ui.js)
// Pure functions that return HTML strings for each view.
// ============================================================
import { formatDuration } from './hub.js?v=51';

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

export function avatarContent(p) {
  return p?.avatar || (p?.name?.[0]?.toUpperCase() ?? '?');
}

// ============================================================
// HOME — shared between hub and player
// ============================================================
export function renderHome() {
  return `
    <div class="home-view anim-fade-in">
      <div class="home-view-inner">
      <div class="hero">
        <h1 class="title">
          <span class="title-kicker">youtube</span>
          <span class="title-accent">Roulette</span>
        </h1>
        <p class="subtitle">Find the weirdest videos. Win the game.</p>
      </div>
      <div class="home-buttons">
        <div class="home-host-prompt">
          <span class="home-host-kicker home-host-kicker--mobile">Are you on a TV or desktop?</span>
          <span class="home-host-kicker home-host-kicker--desktop">RECOMMENDED FOR TV</span>
          <button class="btn-text-host" data-action="show-hub">Host the Hub Display →</button>
        </div>
        <button class="btn btn-primary btn-lg btn-full" data-action="show-join">Join Game →</button>
        <button class="btn btn-secondary btn-lg btn-full" data-action="show-create">Create Game (Phone)</button>
      </div>
      <div id="home-hub" class="form-card glass-card hidden">
        <h2>Configure the Hub</h2>
        <p style="color:var(--text-muted);font-size:0.85rem">This screen shows the game. Players join on their phones.</p>
        <div style="display:flex;align-items:center;gap:10px">
          <label for="hub-winscore" style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap">Points to win:</label>
          <input type="number" id="hub-winscore" value="3" min="1" max="20"
            style="width:70px;text-align:center;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font-heading);font-size:1.1rem;font-weight:700">
        </div>
        <button class="btn btn-gold btn-full" data-action="create-hub">Create Hub</button>
      </div>
      <div id="home-create" class="form-card glass-card hidden">
        <h2>Set up your room</h2>
        <input type="text" id="create-name" placeholder="Your name" maxlength="20" autocomplete="off">
        <div style="display:flex;align-items:center;gap:10px">
          <label for="create-winscore" style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap">Points to win:</label>
          <input type="number" id="create-winscore" value="3" min="1" max="20"
            style="width:70px;text-align:center;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font-heading);font-size:1.1rem;font-weight:700">
        </div>
        <button class="btn btn-primary btn-full" data-action="create-game">Create Room</button>
      </div>
      <div id="home-join" class="form-card glass-card hidden">
        <h2>Enter the room code</h2>
        <p style="color:var(--text-muted);font-size:0.8rem;margin:-4px 0 0 0">Get it from the Hub display.</p>
        <input type="text" id="join-name" placeholder="Your name" maxlength="20" autocomplete="off">
        <input type="text" id="join-code" placeholder="Room code" maxlength="4" autocomplete="off" class="code-input">
        <button class="btn btn-primary btn-full" data-action="join-game">Join Room</button>
      </div>
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
            <div class="player-card ${p.ready ? 'ready' : ''}"
                 style="--player-color:${getPlayerColor(p.id)}"
                 ${state._justReadiedIds?.has(p.id) ? 'data-just-readied="true"' : ''}>
              ${p.id === state.playerId
                ? `<div class="player-avatar player-avatar--cyclable" style="background:${getPlayerColor(p.id)}" data-action="cycle-avatar" title="Tap to change avatar">${avatarContent(p)}</div>`
                : `<div class="player-avatar" style="background:${getPlayerColor(p.id)}">${avatarContent(p)}</div>`}
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

  const turnInfoAttrs = `${state._turnJustStartedForMe ? ' data-turn-just-started="true"' : ''}${!isMyTurn && activePlayerId ? ` style="--turn-color:${getPlayerColor(activePlayerId)}"` : ''}`;
  const turnInfoInner = isMyTurn
    ? `<span class="game-turn-kicker">IT'S</span><span class="game-turn-text game-turn-text--mine">Your Turn!</span>`
    : `<span class="game-turn-text game-turn-text--other">${esc(activePlayer?.name || '???')}'s Turn</span>`;

  const header = `
    <div class="game-header">
      ${state.roomCode && !state.isHub ? `<div class="game-header-roomcode">${state.roomCode}</div>` : ''}
      <div class="game-round">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · FIRST TO ${winScore}</div>
      <div class="game-turn-info"${turnInfoAttrs}>${turnInfoInner}</div>
      <div class="mini-scores">
        ${getSortedPlayers(state).map(p => `
          <span class="mini-score ${p.id === activePlayerId ? 'active-player' : ''}" style="--mini-color:${getPlayerColor(p.id)}${p.id === activePlayerId ? `;color:${getPlayerColor(p.id)}` : ''}">${esc(p.name)}: ${p.score || 0} pts</span>
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
    <div class="search-term-section ${modeClass}"${state._termJustRevealed ? ' data-just-revealed="true"' : ''}>
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
    return `<div class="game-view anim-fade-in">${header}<div class="scrollable-content">${termSection}${renderWaitingMessage(activePlayer, playbackStatus, state)}</div>${leaveBtn}</div>`;
  }
}

// Phone-side thumbs-down skip-vote bar.
// Renders only when:
//   - playback_status === 'playing'
//   - the local player is in player_order (mid-game joiners excluded)
// 60s gate disables the button until video_started_at + 60s elapses.
function renderThumbsDownBar(state) {
  if (state.room?.playback_status !== 'playing') return '';
  const orderSet = new Set(state.room?.player_order || []);
  if (!orderSet.has(state.playerId)) return '';
  const me = state.players.find(p => p.id === state.playerId);
  const startedAt = state.room?.video_started_at ? new Date(state.room.video_started_at).getTime() : null;
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const gateOpen = !!startedAt && elapsed >= 60000;
  const remaining = Math.max(0, Math.ceil((60000 - elapsed) / 1000));
  const remainingMMSS = `0:${String(remaining).padStart(2, '0')}`;
  const thumbsCount = state.players.filter(p => orderSet.has(p.id) && p.thumbs_down).length;
  const totalEligible = orderSet.size;
  const threshold = Math.floor(totalEligible / 2) + 1;
  const pressed = !!me?.thumbs_down;
  const label = pressed ? 'I want to skip' : 'Skip this?';
  const countdown = gateOpen ? '' : `<span class="thumbs-gate-countdown">${remainingMMSS}</span>`;
  return `
    <div class="thumbs-down-bar">
      <button class="btn btn-thumbs-down ${pressed ? 'is-pressed' : ''}"
              data-action="toggle-thumbs-down"
              ${gateOpen ? '' : 'disabled'}>
        👎 ${label}
        ${countdown}
      </button>
      <div class="thumbs-down-tally">${thumbsCount}/${threshold} to skip</div>
    </div>`;
}

// Player controls for hub-mode game — numbered grid + playback controls
function renderPlayerHubControls(state, playbackStatus) {
  const me = state.players.find(p => p.id === state.playerId);
  const results = state.room?.search_results || [];

  // Search failed: hub explicitly set status to 'search_failed'.
  // Surface a clear retry path via superpowers (the only way the active player can recover).
  if (playbackStatus === 'search_failed' && !state.replaceMode && !state.swapMode) {
    return `
      <div class="pick-instructions">
        <h3 style="color:var(--red);margin-bottom:6px">Search failed.</h3>
        <p>Try a superpower to change the term, or ask the host to re-search.</p>
      </div>
      <div class="superpowers">
        <button class="btn btn-sm btn-reroll ${me?.has_reroll ? '' : 'btn-superpower-used'}" data-action="reroll">🎲 Reroll</button>
        <button class="btn btn-sm btn-replace ${me?.has_replace ? '' : 'btn-superpower-used'}" data-action="enter-replace">🔄 Replace</button>
        <button class="btn btn-sm btn-swap ${me?.has_swap ? '' : 'btn-superpower-used'}" data-action="enter-swap">↔️ Swap</button>
      </div>`;
  }

  // Show superpowers (only when not playing)
  if (playbackStatus === 'playing') {
    const selectedVideo = results[state.room?.selected_video_index];
    return `
      <div class="playback-controls">
        <p style="color:var(--gold);font-weight:600;text-align:center;margin:12px 0">🎬 Now Playing: ${esc(selectedVideo?.title || 'Video')}</p>
        <button class="btn btn-primary btn-full" data-action="stop-playback">⏹ Stop Video</button>
        <button class="btn btn-gold btn-full" data-action="stop-and-next">⏹ Stop & Next →</button>
        ${renderThumbsDownBar(state)}
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
    const myColor = me ? getPlayerColor(me.id) : 'var(--text-muted)';
    return `
      <div class="waiting-display">
        <div class="waiting-pips">
          <span class="waiting-pip" style="background:${myColor}"></span>
          <span class="waiting-pip" style="background:${myColor}"></span>
          <span class="waiting-pip" style="background:${myColor}"></span>
        </div>
        <div class="waiting-message">Searching YouTube...</div>
        <div class="waiting-status">🔍 Pulling results to the Hub</div>
      </div>`;
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
    ${renderNumberGrid(results.length, state)}`;
}

// Numbered grid for selecting videos (phone UI)
function renderNumberGrid(count, state) {
  const justLoaded = state?._justLoadedCells ? ' data-just-loaded="true"' : '';
  const results = state?.room?.search_results || [];
  let cells = '';
  for (let i = 0; i < 20; i++) {
    const available = i < count;
    const unplayable = available && !!results[i]?.unplayable;
    const tappable = available && !unplayable;
    const loadedAttr = available ? justLoaded : '';
    const cls = !available ? 'num-cell-empty' : (unplayable ? 'num-cell-unplayable' : '');
    cells += `<button class="num-cell ${cls}"${loadedAttr}
      ${tappable ? `data-action="select-video" data-value="${i}"` : 'disabled'}>${i + 1}</button>`;
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

function renderWaitingMessage(activePlayer, playbackStatus, state) {
  const color = activePlayer ? getPlayerColor(activePlayer.id) : 'var(--text-muted)';
  const status =
    playbackStatus === 'searching' ? '🔍 Searching YouTube...' :
    playbackStatus === 'idle' ? 'Picking a video...' :
    playbackStatus === 'playing' ? '🎬 Watching their pick...' :
    playbackStatus === 'stopped' ? 'Wrapping up...' : '';
  return `
    <div class="waiting-display">
      <div class="waiting-pips">
        <span class="waiting-pip" style="background:${color}"></span>
        <span class="waiting-pip" style="background:${color}"></span>
        <span class="waiting-pip" style="background:${color}"></span>
      </div>
      <div class="waiting-message">
        Waiting for <strong style="color:${color}">${esc(activePlayer?.name || '???')}</strong> to finish...
      </div>
      <div class="waiting-status">${status}</div>
      ${state ? renderThumbsDownBar(state) : ''}
    </div>`;
}

// ============================================================
// PLAYER VOTING
// ============================================================
export function renderVoting(state) {
  const me = state.players.find(p => p.id === state.playerId);
  const hasVoted = !!me?.vote_for;
  const playerOrder = state.room?.player_order || [];
  const inRound = playerOrder.includes(state.playerId);
  // Stable order: use player_order so cards don't shuffle when votes come in
  const voteTargets = playerOrder
    .map(id => state.players.find(p => p.id === id))
    .filter(Boolean);
  const orderSet = new Set(playerOrder);
  const votedCount = state.players.filter(p => orderSet.has(p.id) && p.vote_for).length;
  const totalPlayers = playerOrder.length;

  if (!inRound) {
    return `
      <div class="voting-view anim-fade-in">
        <div class="voting-header">
          ${state.roomCode && !state.isHub ? `<div class="game-header-roomcode">${state.roomCode}</div>` : ''}
          <h1>Voting in Progress</h1>
          <p class="voting-subtitle">You joined mid-round — you'll play next round.</p>
          <div class="vote-progress">
            <div class="vote-progress-pips">
              ${Array.from({length: totalPlayers}, (_, i) =>
                `<div class="vote-progress-pip${i < votedCount ? ' filled' : ''}"></div>`
              ).join('')}
            </div>
            <span class="vote-progress-label">${votedCount} of ${totalPlayers} voted</span>
          </div>
        </div>
        <div class="scrollable-content">
          ${voteTargets.map(p => `
            <div class="vote-card">
              <div class="vote-card-player">
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:36px;height:36px;font-size:0.85rem">${avatarContent(p)}</div>
                <span class="vote-card-name">${esc(p.name)}</span>
              </div>
            </div>`).join('')}
          <p class="waiting-text">You'll join the next round automatically.</p>
        </div>
        <button class="btn btn-text" data-action="leave-game">Leave Game</button>
      </div>`;
  }

  const voteSlots = [...voteTargets, { id: 'none', name: 'No Winner', isNone: true }];
  const isHoldout = !hasVoted && votedCount === totalPlayers - 1;
  const myVoteSlotIdx = hasVoted
    ? voteSlots.findIndex(s => s.id === me?.vote_for)
    : -1;
  const myVoteSlot = myVoteSlotIdx >= 0 ? voteSlots[myVoteSlotIdx] : null;

  // Combined list: number badge + name + voting status. Replaces the
  // previous separate legend + pending strip to fit phone viewport without scrolling.
  // Rows are now the tap target (data-action only when !hasVoted).
  const slotListHtml = `
    <div class="vote-slot-list">
      ${voteSlots.map((s, i) => {
        const player = !s.isNone ? state.players.find(p => p.id === s.id) : null;
        const voted = !!player?.vote_for;
        const isMe = s.id === state.playerId;
        const isMyVote = hasVoted && me?.vote_for === s.id;
        const color = s.isNone ? '#FF6B6B' : getPlayerColor(s.id);
        const nameColor = s.isNone ? 'var(--text-muted)' : getPlayerColor(s.id);
        let status = '';
        if (s.isNone) {
          status = '';
        } else if (voted) {
          status = '<span class="vote-slot-status vote-slot-status--voted">✓ Voted</span>';
        } else {
          status = '<span class="vote-slot-status vote-slot-status--waiting">⋯ Waiting</span>';
        }
        const tapAttr = !hasVoted ? ` data-action="cast-vote" data-value="${s.id}"` : '';
        const cls = ['vote-slot-row'];
        if (isMyVote) cls.push('vote-slot-row--mine');
        if (voted) cls.push('vote-slot-row--voted');
        if (s.isNone) cls.push('vote-slot-row--no-winner');
        return `
          <div class="${cls.join(' ')}" style="--row-color:${color}"${tapAttr}>
            <span class="vote-slot-num">${i + 1}</span>
            <span class="vote-slot-name" style="color:${nameColor}">${s.isNone ? '🚫 No Winner' : esc(s.name)}${isMe ? ' (you)' : ''}</span>
            ${status}
          </div>`;
      }).join('')}
    </div>`;

  return `
    <div class="voting-view anim-fade-in">
      <div class="voting-header">
        ${state.roomCode && !state.isHub ? `<div class="game-header-roomcode">${state.roomCode}</div>` : ''}
        <h1>Vote for the Best!</h1>
        <p class="voting-subtitle"${isHoldout ? ' style="color:var(--gold);font-weight:700"' : ''}>${isHoldout ? "Everyone's waiting for you..." : 'Whose video was the most interesting?'}</p>
        <div class="vote-progress">
          <div class="vote-progress-pips">
            ${Array.from({length: totalPlayers}, (_, i) =>
              `<div class="vote-progress-pip${i < votedCount ? ' filled' : ''}"></div>`
            ).join('')}
          </div>
          <span class="vote-progress-label">${votedCount} of ${totalPlayers} voted</span>
        </div>
      </div>
      <div class="scrollable-content">
        ${slotListHtml}
        ${hasVoted ? `
          <div class="vote-confirm">
            ${myVoteSlot && !myVoteSlot.isNone
              ? `<span class="vote-confirm-label" style="color:${getPlayerColor(myVoteSlot.id)}">✓ You voted for ${esc(myVoteSlot.name)}</span>`
              : myVoteSlot?.isNone
                ? '<span class="vote-confirm-label" style="color:var(--text-muted)">✓ You voted No Winner</span>'
                : ''}
          </div>
          <p class="waiting-text">Waiting for other players to vote...</p>
        ` : ''}
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
        ${state.roomCode && !state.isHub ? `<div class="game-header-roomcode">${state.roomCode}</div>` : ''}
        <h1>Round ${state.room?.round || 1} Results</h1>
        <div class="results-announcement"${!state._resultsAnimated ? ' data-results-just-mounted="true"' : ''}>
          ${winner
            ? `<span class="results-star">★</span><span class="points-awarded">${esc(winner.name)} earns ${pointsAwarded} point${pointsAwarded > 1 ? 's' : ''}!${isUnanimous ? ' (Unanimous!)' : ''}</span>${state.room?.streak_count >= 2 ? `<span class="streak-badge">🔥 Hot Streak ×${state.room.streak_count}</span>` : ''}`
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
              <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:32px;height:32px;font-size:0.8rem">${avatarContent(p)}</div>
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
            <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:32px;height:32px;font-size:0.8rem">${avatarContent(p)}</div>
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
          <canvas id="hub-qr" class="hub-qr-canvas"></canvas>
          <p class="hub-subtitle">Join on your phone with this code!</p>
          <div class="hub-player-list">
            <h2>PLAYERS (${playerCount})</h2>
            ${state.players.map(p => `
              <div class="hub-player-item ${p.ready ? 'ready' : ''}"${state._justJoinedIds?.has(p.id) ? ' data-newly-joined="true"' : ''}>
                ${p.id === state.playerId
                  ? `<div class="player-avatar player-avatar--cyclable" style="background:${getPlayerColor(p.id)}" data-action="cycle-avatar" title="Tap to change avatar">${avatarContent(p)}</div>`
                  : `<div class="player-avatar" style="background:${getPlayerColor(p.id)}">${avatarContent(p)}</div>`}
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

  // If playing video, show fullscreen player. EXCEPT during the selection
  // beat / FLIP morph — at those moments room.playback_status is 'playing'
  // but the grid + picked-tile + pick-chip + morph need to stay visible. Fall
  // through to the selecting branch in those cases (it renders the grid).
  if (playbackStatus === 'playing' && !state._showingSelection && !state._launchingVideo) {
    return `
      <div class="hub-layout">
        <div class="hub-top-bar">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · ${esc(activePlayer?.name || '???')}'s Pick</span>
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
        </div>
        <div class="hub-main"></div>
        ${renderHubAdminBar(state)}
      </div>`;
  }

  // Idle — between turns, banner is up. Render an empty main so morphdom
  // doesn't paint the empty selecting grid (gold-bordered hub-grid) behind
  // the turn banner. The banner's setTimeout tail flips status to 'searching'
  // and triggerSearch fires, mounting the slot cells fresh.
  if (playbackStatus === 'idle' || state._showingTurnBanner) {
    return `
      <div class="hub-layout">
        <div class="hub-top-bar">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns}</span>
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
        </div>
        <div class="hub-main"></div>
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
            <div class="hub-search-term">${term.split('').map(ch => `<span class="hub-char" data-final-char="${esc(ch)}">${esc(ch)}</span>`).join('')}</div>
            <div class="hub-searching-spinner">🔍 Searching YouTube...</div>
          </div>
        </div>
        ${renderHubAdminBar(state)}
      </div>`;
  }

  // Search failed
  if (playbackStatus === 'search_failed') {
    return `
      <div class="hub-layout">
        <div class="hub-top-bar">
          <span class="hub-game-info">ROUND ${state.room?.round || 1} · TURN ${turnNum}/${totalTurns} · ${esc(activePlayer?.name || '???')}</span>
          <span class="hub-room-code">ROOM: ${state.roomCode}</span>
        </div>
        <div class="hub-main">
          <div class="hub-stopped-message">
            <div style="font-size:3rem;margin-bottom:16px">⚠️</div>
            <h2>Search Failed</h2>
            <p style="color:var(--text-muted)">${esc(activePlayer?.name || '???')} can use a superpower, or admin can re-search.</p>
          </div>
        </div>
        ${renderHubAdminBar(state)}
      </div>`;
  }

  // Selecting — show thumbnail grid
  const cellCount = Math.max(results.length, 1);
  const cols = results.length <= 4 ? 2 : results.length <= 6 ? 3 : results.length <= 12 ? 4 : 5;
  const rows = Math.ceil(cellCount / cols);
  // Grid AR = (cols × 16) / (rows × 9) — keeps each 1fr cell at 16:9 while the grid fills available space.
  const gridAspect = `${cols * 16} / ${rows * 9}`;
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
      <div class="hub-main" style="--active-color:${getPlayerColor(activePlayerId || '')}">
        <div class="hub-grid" style="grid-template-columns:repeat(${cols}, 1fr); aspect-ratio:${gridAspect}">
          ${Array.from({length: cellCount}, (_, i) => {
            const video = results[i];
            if (!video) return '';
            const thumb = video.type === 'playlist' ? (video.firstVideoThumbnail || video.thumbnail) : video.thumbnail;
            const duration = video.type === 'video' ? formatDuration(video.durationSeconds) : '';
            const badge = video.type === 'playlist' ? '<span class="hub-badge-playlist">PLAYLIST</span>' : '';
            const isPicked = state._showingSelection && i === state.room?.selected_video_index;
            const isOthers = state._showingSelection && i !== state.room?.selected_video_index;
            const isUnplayable = !!video.unplayable;
            const dataMorphSkip = isPicked ? ' data-morph-skip="true"' : '';
            const pickedClass = isPicked ? ' hub-thumb--picked' : '';
            const dimmedClass = isOthers ? ' hub-thumb--others-dimmed' : '';
            const unplayableClass = isUnplayable ? ' hub-thumb--unplayable' : '';
            const pickedColor = isPicked ? getPlayerColor(activePlayerId || '') : '';
            const pickedStyle = isPicked ? ` style="--player-color:${pickedColor}"` : '';
            let pickChip = '';
            if (isPicked && activePlayer) {
              pickChip = `
                <div class="hub-pick-chip" data-morph-skip="true" style="--player-color:${pickedColor}">
                  <div class="hub-pick-chip-avatar" style="background:${pickedColor}">${avatarContent(activePlayer)}</div>
                  <span class="hub-pick-chip-text">${esc(activePlayer.name).toUpperCase()} PICKED <span class="hub-pick-chip-num" style="color:${pickedColor}">#${i + 1}</span></span>
                </div>
              `;
            }
            return `
              <div class="hub-thumb${pickedClass}${dimmedClass}${unplayableClass}" data-thumb-idx="${i}"${dataMorphSkip}${pickedStyle}>
                <span class="hub-thumb-num">${i + 1}</span>
                <img src="${esc(thumb)}" alt="" class="hub-thumb-img" loading="lazy">
                ${video.type === 'video' && duration ? `<span class="hub-thumb-duration">${duration}</span>` : ''}
                <div class="hub-thumb-info">
                  ${badge}
                  <span class="hub-thumb-title">${esc(video.title)}</span>
                  ${video.type === 'playlist' ? `<div class="hub-thumb-meta"><span class="hub-thumb-views">${video.itemCount || '?'} videos</span></div>` : ''}
                </div>
                ${pickChip}
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
  const orderSet = new Set(playerOrder);
  const votedCount = state.players.filter(p => orderSet.has(p.id) && p.vote_for).length;
  const totalPlayers = playerOrder.length;
  const noneVotes = state.players.filter(p => orderSet.has(p.id) && p.vote_for === 'none').length;
  const revealing = state.revealingVotes === true;
  const lastVoter = (votedCount === totalPlayers - 1)
    ? state.players.find(p => orderSet.has(p.id) && !p.vote_for)
    : null;

  const noneIndex = votingPlayers.length;

  return `
    <div class="hub-layout">
      <div class="hub-top-bar">
        <span class="hub-game-info">VOTING · ${votedCount}/${totalPlayers} votes in</span>
        <span class="hub-room-code">ROOM: ${state.roomCode}</span>
      </div>
      <div class="hub-main" style="flex-direction:column;gap:24px;padding:24px">
        <h1 style="text-align:center;font-family:var(--font-heading);font-size:2rem;flex-shrink:0">Cast Your Vote!</h1>
        <div class="hub-vote-grid">
          ${votingPlayers.map((p, i) => {
            const votes = voteCounts[p.id] || 0;
            // Cards are NOT linked to voting state — they show video info and
            // vote count only. The pending strip below the grid is the sole
            // indicator of who has/hasn't voted.
            const countHtml = revealing
              ? `<div class="hub-vote-count hub-vote-count--reveal" data-revealed="true">${votes} vote${votes !== 1 ? 's' : ''}</div>`
              : `<div class="hub-vote-count hub-vote-count--hidden">&nbsp;</div>`;
            return `
              <div class="hub-vote-card">
                <span class="hub-vote-badge">${i + 1}</span>
                ${p.picked_video_thumbnail ? `<img src="${esc(p.picked_video_thumbnail)}" class="hub-vote-thumb">` : '<div class="hub-vote-thumb-empty">🎬</div>'}
                <div class="hub-vote-info">
                  <div class="hub-vote-player" style="color:${getPlayerColor(p.id)}">${esc(p.name)}</div>
                  <div class="hub-vote-title">${esc(p.picked_video_title || 'No video')}</div>
                  ${countHtml}
                </div>
              </div>`;
          }).join('')}
          <div class="hub-vote-card">
            <span class="hub-vote-badge">${noneIndex + 1}</span>
            <div class="hub-vote-thumb-empty">🚫</div>
            <div class="hub-vote-info">
              <div class="hub-vote-player" style="color:var(--text-muted)">No Winner</div>
              <div class="hub-vote-title">&nbsp;</div>
              ${revealing
                ? `<div class="hub-vote-count hub-vote-count--reveal" data-revealed="true">${noneVotes} vote${noneVotes !== 1 ? 's' : ''}</div>`
                : `<div class="hub-vote-count hub-vote-count--hidden">&nbsp;</div>`}
            </div>
          </div>
        </div>
        ${revealing ? '' : `
          <div class="hub-vote-pending-strip">
            ${votingPlayers.map(p => {
              const voted = !!p.vote_for;
              return `
                <div class="hub-vote-pending-card ${voted ? 'hub-vote-pending-card--voted' : ''}">
                  <div class="hub-vote-pending-avatar" style="background:${voted ? getPlayerColor(p.id) : 'var(--surface)'};color:${voted ? 'white' : 'var(--text-dim)'}">${avatarContent(p)}</div>
                  <div class="hub-vote-pending-info">
                    <div class="hub-vote-pending-name" style="color:${voted ? getPlayerColor(p.id) : 'var(--text-muted)'}">${esc(p.name)}</div>
                    <div class="hub-vote-pending-status">${voted ? '✓ Voted' : '⋯ Waiting'}</div>
                  </div>
                </div>`;
            }).join('')}
          </div>`}
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
              ? `<div class="hub-winner-name" style="color:${getPlayerColor(winner.id)}">★ ${esc(winner.name)} earns ${pointsAwarded} point${pointsAwarded > 1 ? 's' : ''}!${isUnanimous ? ' 🔥 Unanimous!' : ''}${state.room?.streak_count >= 2 ? `<span class="streak-badge">🔥 Hot Streak ×${state.room.streak_count}</span>` : ''}</div>`
              : '<div style="color:var(--text-muted);font-size:1.5rem">No winner this round.</div>'}
          </div>
          <div class="hub-scoreboard">
            ${sorted.map((p, i) => `
              <div class="hub-score-row">
                <span class="hub-score-rank">${getRankEmoji(i)}</span>
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:48px;height:48px;font-size:1.2rem">${avatarContent(p)}</div>
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
                <div class="player-avatar" style="background:${getPlayerColor(p.id)};width:48px;height:48px;font-size:1.2rem">${avatarContent(p)}</div>
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

  const fsBtn = `<button class="btn btn-sm btn-secondary hub-fullscreen-btn" data-action="hub-fullscreen" aria-label="Toggle fullscreen" title="Toggle fullscreen"><span class="fs-icon-enter">⛶</span><span class="fs-icon-exit" style="display:none">⤢</span></button>`;

  // Video timer pill — only during playback. data-morph-skip keeps morphdom
  // from clobbering the textContent that Hub.startTick writes every 250ms.
  const timer = playback === 'playing'
    ? `<div id="hub-video-timer" class="hub-video-timer" data-morph-skip="true">0:00</div>`
    : '';

  // Skip-vote tally chip — left-aligned via margin-right: auto (mirrors the
  // timer's right-align pattern). The count is re-rendered from state on every
  // debouncedRender pass, so we let morphdom diff it normally.
  let skipTally = '';
  if (playback === 'playing' && state.room?.video_started_at && state.players.length > 0) {
    const orderSet = new Set(state.room?.player_order || []);
    const eligible = state.players.filter(p => orderSet.has(p.id));
    const yes = eligible.filter(p => p.thumbs_down).length;
    const threshold = Math.floor(eligible.length / 2) + 1;
    skipTally = `<div class="hub-skip-tally">👎 ${yes}/${threshold}</div>`;
  }

  let buttons = '';
  if (isGameOver) {
    buttons = `
      ${fsBtn}
      <button class="btn btn-sm btn-gold" data-action="play-again">🔄 Play Again</button>
      <button class="btn btn-sm btn-text" data-action="leave-game">Leave</button>`;
  } else if (status === 'playing') {
    buttons = `
      ${skipTally}
      ${fsBtn}
      <button class="btn btn-sm btn-secondary" data-action="skip-player">⏭ Skip Player</button>
      <button class="btn btn-sm btn-secondary" data-action="re-search">🔄 Re-Search</button>
      ${playback === 'playing' ? '<button class="btn btn-sm btn-secondary" data-action="stop-playback">⏹ Stop Video</button>' : ''}
      <button class="btn btn-sm btn-text" data-action="leave-game">✕</button>
      ${timer}`;
  } else if (status === 'voting') {
    buttons = `
      ${fsBtn}
      <button class="btn btn-sm btn-secondary" data-action="force-end-voting">⏩ End Voting</button>
      <button class="btn btn-sm btn-text" data-action="leave-game">✕</button>`;
  } else if (status === 'results') {
    buttons = `
      ${fsBtn}
      <button class="btn btn-sm btn-gold" data-action="next-round">Next Round →</button>
      <button class="btn btn-sm btn-text" data-action="leave-game">✕</button>`;
  } else {
    buttons = `${fsBtn}<button class="btn btn-sm btn-text" data-action="leave-game">✕ Close Hub</button>`;
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
  const orderSet = new Set(state.room?.player_order || []);
  state.players.forEach(p => {
    if (!orderSet.has(p.id)) return;
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
