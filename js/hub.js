// ============================================================
// YouTube Roulette — Hub Video Controller (hub.js)
// YouTube IFrame API integration for the hub display
// ============================================================

let player = null;
let playerReady = false;
let onVideoEndCallback = null;

// Initialize the YouTube IFrame API player
export function initPlayer(containerId, onEnd) {
  onVideoEndCallback = onEnd;

  // If API is already loaded, create player directly
  if (window.YT && window.YT.Player) {
    createPlayer(containerId);
    return;
  }

  // Set up the callback for when the API loads
  window.onYouTubeIframeAPIReady = () => createPlayer(containerId);
}

function createPlayer(containerId) {
  player = new window.YT.Player(containerId, {
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
      onReady: () => { playerReady = true; },
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
}

function onPlayerStateChange(event) {
  // YT.PlayerState.ENDED === 0
  if (event.data === 0 && onVideoEndCallback) {
    onVideoEndCallback();
  }
}

function onPlayerError(event) {
  console.error('YouTube player error:', event.data);
  // Trigger end callback on error so the game can continue
  if (onVideoEndCallback) {
    onVideoEndCallback();
  }
}

// Play a video by ID
export function playVideo(videoId) {
  if (!player || !playerReady) {
    console.error('YouTube player not ready');
    return;
  }
  player.loadVideoById(videoId);
}

// Stop playback
export function stopVideo() {
  if (player && playerReady) {
    player.stopVideo();
  }
}

// Destroy the player instance
export function destroyPlayer() {
  if (player) {
    player.destroy();
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

  // Pool is everything up to and including the 3rd video
  const pool = results.slice(0, Math.min(cutoffIndex, 20));
  return pool;
}
