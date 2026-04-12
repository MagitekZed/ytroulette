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
    const videoIds: string[] = [];
    const playlistIds: string[] = [];
    const rawResults: any[] = [];

    for (const item of items) {
      if (item.id.kind === "youtube#video") {
        videoIds.push(item.id.videoId);
        rawResults.push({
          type: "video",
          videoId: item.id.videoId,
          channelId: item.snippet.channelId,
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

    // Step 2: Batch fetch video details — duration + embeddable status (1 quota unit per batch)
    const videoDetails: Record<string, { duration: string; embeddable: boolean }> = {};
    if (videoIds.length > 0) {
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
    const playlistFirstVideo: Record<string, { videoId: string; thumbnail: string; title: string }> = {};
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

    // Step 4: Build enriched results (filter non-embeddable + title-based #shorts)
    const enriched: any[] = [];
    const videosToShortsCheck: { videoId: string; channelId: string }[] = [];

    for (const r of rawResults) {
      if (r.type === "video") {
        const details = videoDetails[r.videoId];
        if (!details || !details.embeddable) continue; // Skip non-embeddable

        // Quick filter: skip videos with #shorts in the title
        if (r.title.toLowerCase().includes("#shorts") || r.title.toLowerCase().includes("#short")) {
          continue;
        }

        enriched.push({
          ...r,
          duration: details.duration,
          durationSeconds: parseDuration(details.duration),
        });

        // Queue for UUSH playlist short-detection check
        if (r.channelId) {
          videosToShortsCheck.push({ videoId: r.videoId, channelId: r.channelId });
        }
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

    // Step 5: Check for YouTube Shorts via UUSH playlist method (1 quota unit each)
    // Construct each channel's Shorts playlist ID by replacing "UC" prefix with "UUSH"
    const shortsSet = new Set<string>();

    if (videosToShortsCheck.length > 0) {
      const checks = videosToShortsCheck.map(async ({ videoId, channelId }) => {
        try {
          // Only works for channels with UC-prefixed IDs
          if (!channelId.startsWith("UC")) return;

          const shortsPlaylistId = "UUSH" + channelId.slice(2);
          const checkUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
          checkUrl.searchParams.set("part", "id");
          checkUrl.searchParams.set("playlistId", shortsPlaylistId);
          checkUrl.searchParams.set("videoId", videoId);
          checkUrl.searchParams.set("maxResults", "1");
          checkUrl.searchParams.set("key", YOUTUBE_API_KEY);

          const res = await fetch(checkUrl.toString());
          const data = await res.json();

          // If the API returns items, this video is in the Shorts playlist
          if (data.items && data.items.length > 0) {
            shortsSet.add(videoId);
          }
        } catch {
          // If the check fails (playlist doesn't exist, etc.), assume it's not a Short
        }
      });

      await Promise.allSettled(checks);
    }

    // Filter out detected Shorts
    const finalResults = enriched.filter(r => {
      if (r.type === "video" && shortsSet.has(r.videoId)) return false;
      return true;
    });

    const videoCount = finalResults.filter(r => r.type === "video").length;
    const shortsRemoved = shortsSet.size;
    console.log(`Shorts detection: checked ${videosToShortsCheck.length} videos, found ${shortsRemoved} Shorts, ${videoCount} videos remain`);

    // Step 6: Supplementary search if too few videos after filtering
    // Use videoDuration=medium (4-20min) which inherently excludes Shorts
    if (videoCount < 5) {
      console.log(`Only ${videoCount} videos — running supplementary video-only search`);
      const existingIds = new Set(finalResults.filter(r => r.type === "video").map(r => r.videoId));

      const suppUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      suppUrl.searchParams.set("part", "snippet");
      suppUrl.searchParams.set("q", term);
      suppUrl.searchParams.set("type", "video");
      suppUrl.searchParams.set("videoDuration", "medium"); // 4-20 min, no Shorts
      suppUrl.searchParams.set("maxResults", "20");
      suppUrl.searchParams.set("safeSearch", "none");
      suppUrl.searchParams.set("key", YOUTUBE_API_KEY);

      try {
        const suppRes = await fetch(suppUrl.toString());
        const suppData = await suppRes.json();
        const suppItems = (suppData.items || []).filter(
          (item: any) => item.id?.videoId && !existingIds.has(item.id.videoId)
        );

        if (suppItems.length > 0) {
          // Batch fetch details for supplementary videos
          const suppVideoIds = suppItems.map((item: any) => item.id.videoId);
          const suppDetailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
          suppDetailsUrl.searchParams.set("part", "contentDetails,status");
          suppDetailsUrl.searchParams.set("id", suppVideoIds.join(","));
          suppDetailsUrl.searchParams.set("key", YOUTUBE_API_KEY);

          const suppDetailsRes = await fetch(suppDetailsUrl.toString());
          const suppDetailsData = await suppDetailsRes.json();
          const suppDetails: Record<string, { duration: string; embeddable: boolean }> = {};
          for (const v of (suppDetailsData.items || [])) {
            suppDetails[v.id] = {
              duration: v.contentDetails?.duration || "PT0S",
              embeddable: v.status?.embeddable ?? false,
            };
          }

          for (const item of suppItems) {
            const vid = item.id.videoId;
            const details = suppDetails[vid];
            if (!details || !details.embeddable) continue;
            finalResults.push({
              type: "video",
              videoId: vid,
              channelId: item.snippet.channelId,
              title: item.snippet.title,
              thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
              channelTitle: item.snippet.channelTitle,
              publishedAt: item.snippet.publishedAt,
              duration: details.duration,
              durationSeconds: parseDuration(details.duration),
            });
          }
          console.log(`Supplementary search added ${finalResults.filter(r => r.type === "video").length - videoCount} more videos`);
        }
      } catch (e) {
        console.error("Supplementary search failed:", e);
      }
    }

    return new Response(JSON.stringify({ results: finalResults }), {
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
function parseDuration(iso: string): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  return h * 3600 + m * 60 + s;
}
