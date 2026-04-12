// ============================================================
// YouTube Roulette — Hub Video Controller (hub.js)
// YouTube IFrame API integration for the hub display
// ============================================================

let player = null;
let playerReady = false;
let onVideoEndCallback = null;
let pendingVideoId = null; // Queue a video to play once player is ready

// Initialize the YouTube IFrame API player
export function initPlayer(containerId, onEnd) {
  onVideoEndCallback = onEnd;

  // Already initialized and ready
  if (player && playerReady) return;

  // If API is already loaded, create player directly
  if (window.YT && window.YT.Player) {
    createPlayer(containerId);
    return;
  }

  // Set up the callback for when the API loads
  window.onYouTubeIframeAPIReady = () => createPlayer(containerId);
}

function createPlayer(containerId) {
  // Don't create if already exists
  if (player) return;

  const el = document.getElementById(containerId);
  if (!el) {
    console.warn('YouTube player container not found:', containerId);
    return;
  }

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
      onReady: () => {
        playerReady = true;
        // Play any queued video
        if (pendingVideoId) {
          const vid = pendingVideoId;
          pendingVideoId = null;
          playVideo(vid);
        }
      },
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
  if (!videoId) return;

  if (!player || !playerReady) {
    // Queue for when the player is ready
    console.log('Queuing video until player is ready:', videoId);
    pendingVideoId = videoId;
    return;
  }

  try {
    player.loadVideoById(videoId);
  } catch (err) {
    console.error('Failed to load video:', err);
    // Retry after a short delay (player may still be initializing)
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
  if (player && playerReady) {
    try { player.stopVideo(); } catch { /* ignore */ }
  }
}

// Destroy the player instance
export function destroyPlayer() {
  pendingVideoId = null;
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

  // Pool is everything up to and including the 3rd video
  const pool = results.slice(0, Math.min(cutoffIndex, 20));
  return pool;
}
