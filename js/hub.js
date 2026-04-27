// ============================================================
// YouTube Roulette — Hub Video Controller (hub.js)
// YouTube IFrame API integration for the hub display
// Player lives in a persistent #yt-player-wrapper outside #app
// ============================================================

let player = null;
let playerReady = false;
let onVideoEndCallback = null;
let pendingVideoId = null;
let initAttempted = false;
let onFirstPlayCallback = null;
let firstPlayFired = false;

export function setFirstPlayCallback(fn) { onFirstPlayCallback = fn; }

// ---- Per-video elapsed timer (drives #hub-video-timer pill) ----
let elapsedMs = 0;
let segmentStart = null;
let tickInterval = null;

function formatMMSS(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getElapsedSeconds() {
  return Math.floor((elapsedMs + (segmentStart ? performance.now() - segmentStart : 0)) / 1000);
}

export function resetTimer() {
  elapsedMs = 0;
  segmentStart = null;
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  const el = document.getElementById('hub-video-timer');
  if (el) {
    el.textContent = '0:00';
    el.classList.add('hidden');
  }
}

function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  const el = document.getElementById('hub-video-timer');
  if (el) {
    el.textContent = formatMMSS(getElapsedSeconds());
    el.classList.remove('hidden');
  }
  tickInterval = setInterval(() => {
    const node = document.getElementById('hub-video-timer');
    if (node) node.textContent = formatMMSS(getElapsedSeconds());
  }, 250);
}

// Initialize the YouTube IFrame API player (call once at hub startup)
export function initPlayer(onEnd) {
  if (initAttempted) return;
  initAttempted = true;
  onVideoEndCallback = onEnd;

  if (window.YT && window.YT.Player) {
    createPlayer();
  } else {
    window.onYouTubeIframeAPIReady = () => createPlayer();
  }
}

function createPlayer() {
  const el = document.getElementById('yt-player');
  if (!el) {
    console.error('yt-player element not found');
    return;
  }

  player = new window.YT.Player('yt-player', {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      fs: 1,
      playsinline: 1,
    },
    events: {
      onReady: () => {
        console.log('YouTube player ready');
        playerReady = true;
        if (pendingVideoId) {
          const vid = pendingVideoId;
          pendingVideoId = null;
          playVideo(vid);
        }
      },
      onStateChange: (event) => {
        // 1=play, 2=pause, 0=end
        if (event.data === 1) {
          segmentStart = performance.now();
          startTick();
          if (!firstPlayFired) {
            firstPlayFired = true;
            if (onFirstPlayCallback) onFirstPlayCallback();
          }
        } else if (event.data === 2 || event.data === 0) {
          if (segmentStart) {
            elapsedMs += performance.now() - segmentStart;
            segmentStart = null;
          }
          // Keep showing frozen value on pause; only fully clear on end.
          if (event.data === 0 && tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
          }
          if (event.data === 0 && onVideoEndCallback) onVideoEndCallback();
        }
      },
      onError: (event) => {
        console.error('YouTube player error:', event.data);
        if (onVideoEndCallback) onVideoEndCallback();
      },
    },
  });
}

// Show the player wrapper (fullscreen over the hub area)
export function showPlayer() {
  document.getElementById('yt-player-wrapper')?.classList.remove('hidden');
}

// Hide the player wrapper
export function hidePlayer() {
  document.getElementById('yt-player-wrapper')?.classList.add('hidden');
  resetTimer();
  if (player && playerReady) {
    try { player.stopVideo(); } catch { /* ignore */ }
  }
}

// Play a video by ID
export function playVideo(videoId) {
  if (!videoId) return;
  firstPlayFired = false;
  resetTimer();

  if (!player || !playerReady) {
    console.log('Queuing video until player is ready:', videoId);
    pendingVideoId = videoId;
    return;
  }

  showPlayer();
  try {
    player.loadVideoById(videoId);
    pendingVideoId = null;
  } catch (err) {
    console.error('Failed to load video:', err);
    pendingVideoId = videoId;
    setTimeout(() => {
      if (pendingVideoId === videoId && player && playerReady) {
        pendingVideoId = null;
        try { player.loadVideoById(videoId); } catch { /* give up */ }
      }
    }, 1000);
  }
}

// Stop playback
export function stopVideo() {
  pendingVideoId = null;
  resetTimer();
  hidePlayer();
}

// Destroy the player instance
export function destroyPlayer() {
  pendingVideoId = null;
  initAttempted = false;
  resetTimer();
  hidePlayer();
  if (player) {
    try { player.destroy(); } catch { /* ignore */ }
    player = null;
    playerReady = false;
  }
}

// Check if player is ready
export function isPlayerReady() {
  return playerReady;
}

// ============================================================
// Duration formatting helper
// ============================================================
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ============================================================
// Video Pool Algorithm — "3 normal videos" rule
// ============================================================
export function buildPool(results) {
  if (!results || results.length === 0) return [];

  let videoCount = 0;
  let cutoffIndex = results.length;

  for (let i = 0; i < results.length; i++) {
    if (results[i].type === 'video') {
      videoCount++;
      if (videoCount >= 3) {
        cutoffIndex = i + 1;
        break;
      }
    }
  }

  const pool = results.slice(0, Math.min(cutoffIndex, 20));
  return pool;
}
