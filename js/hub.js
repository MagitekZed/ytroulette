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
        if (event.data === 0 && onVideoEndCallback) {
          onVideoEndCallback();
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
  if (player && playerReady) {
    try { player.stopVideo(); } catch { /* ignore */ }
  }
}

// Play a video by ID
export function playVideo(videoId) {
  if (!videoId) return;

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
  hidePlayer();
}

// Destroy the player instance
export function destroyPlayer() {
  pendingVideoId = null;
  initAttempted = false;
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
