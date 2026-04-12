// YouTube Roulette — YouTube Search Edge Function
// Deploy: supabase functions deploy youtube-search
// Secret: supabase secrets set YOUTUBE_API_KEY=<your-key>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
    if (!YOUTUBE_API_KEY) {
      return new Response(JSON.stringify({ error: "YouTube API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { term, videoOnly } = await req.json();
    if (!term) {
      return new Response(JSON.stringify({ error: "Missing search term" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const type = videoOnly ? "video" : "video,playlist";

    // Step 1: Search YouTube (100 quota units)
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", term);
    searchUrl.searchParams.set("type", type);
    searchUrl.searchParams.set("maxResults", "50");
    searchUrl.searchParams.set("safeSearch", "none");
    searchUrl.searchParams.set("key", YOUTUBE_API_KEY);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      console.error("YouTube Search API error:", searchData);
      return new Response(JSON.stringify({ error: "YouTube API error", details: searchData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = searchData.items || [];

    // Separate videos and playlists
    const videoIds = [];
    const playlistIds = [];
    const rawResults = [];

    for (const item of items) {
      if (item.id.kind === "youtube#video") {
        videoIds.push(item.id.videoId);
        rawResults.push({
          type: "video",
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
        });
      } else if (item.id.kind === "youtube#playlist") {
        playlistIds.push(item.id.playlistId);
        rawResults.push({
          type: "playlist",
          playlistId: item.id.playlistId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
        });
      }
    }

    // Step 2: Batch fetch video details — duration + embeddable status (1 quota unit)
    const videoDetails = {};
    if (videoIds.length > 0) {
      // Process in batches of 50
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        detailsUrl.searchParams.set("part", "contentDetails,status");
        detailsUrl.searchParams.set("id", batch.join(","));
        detailsUrl.searchParams.set("key", YOUTUBE_API_KEY);

        const detailsRes = await fetch(detailsUrl.toString());
        const detailsData = await detailsRes.json();

        for (const v of (detailsData.items || [])) {
          videoDetails[v.id] = {
            duration: v.contentDetails?.duration || "PT0S",
            embeddable: v.status?.embeddable ?? false,
          };
        }
      }
    }

    // Step 3: Fetch first video of each playlist (1 quota unit each)
    const playlistFirstVideo = {};
    for (const plId of playlistIds) {
      try {
        const plUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
        plUrl.searchParams.set("part", "snippet");
        plUrl.searchParams.set("playlistId", plId);
        plUrl.searchParams.set("maxResults", "1");
        plUrl.searchParams.set("key", YOUTUBE_API_KEY);

        const plRes = await fetch(plUrl.toString());
        const plData = await plRes.json();

        const firstItem = plData.items?.[0];
        if (firstItem) {
          playlistFirstVideo[plId] = {
            videoId: firstItem.snippet.resourceId?.videoId,
            thumbnail: firstItem.snippet.thumbnails?.medium?.url || firstItem.snippet.thumbnails?.default?.url || "",
            title: firstItem.snippet.title,
          };
        }
      } catch (e) {
        console.error(`Failed to fetch playlist ${plId}:`, e);
      }
    }

    // Step 4: Build enriched results
    const enriched = [];
    for (const r of rawResults) {
      if (r.type === "video") {
        const details = videoDetails[r.videoId];
        if (!details || !details.embeddable) continue; // Skip non-embeddable
        enriched.push({
          ...r,
          duration: details.duration,
          durationSeconds: parseDuration(details.duration),
        });
      } else if (r.type === "playlist") {
        const firstVid = playlistFirstVideo[r.playlistId];
        enriched.push({
          ...r,
          firstVideoId: firstVid?.videoId || null,
          firstVideoThumbnail: firstVid?.thumbnail || r.thumbnail,
          firstVideoTitle: firstVid?.title || "",
        });
      }
    }

    return new Response(JSON.stringify({ results: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Parse ISO 8601 duration (PT1H2M3S) to seconds
function parseDuration(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  return h * 3600 + m * 60 + s;
}
