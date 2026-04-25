import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { ToolDefinition, ToolContent } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  query: z.string().min(1),
  sort: z.enum(["relevance", "viewCount", "date"]).optional(),
  limit: z.number().int().min(1).max(12).optional(),
  include_thumbnails: z.boolean().optional(),
  region: z.enum(["FR", "US", "any"]).optional(),
  duration: z.enum(["any", "medium", "long"]).optional(),
});

const MAX_THUMBS_FOR_VISION = 6;
const FALLBACK_THRESHOLD = 4; // if FR returns fewer than this, retry without region

type YtVideoItem = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: { high?: { url: string }; medium?: { url: string } };
  };
};

async function fetchSearch(opts: {
  apiKey: string;
  query: string;
  sort: string;
  limit: number;
  duration: string;
  region: string | null;
}): Promise<YtVideoItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: opts.query,
    order: opts.sort,
    maxResults: String(opts.limit),
    videoDuration: opts.duration,        // "any" | "medium" | "long" (excludes <4min shorts when not "any")
    key: opts.apiKey,
  });
  if (opts.region) {
    params.set("regionCode", opts.region);
    params.set("relevanceLanguage", opts.region.toLowerCase());
  }
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);
  const data = await res.json();
  return (data.items || []) as YtVideoItem[];
}

export const searchYoutubeTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "search_youtube",
  description:
    "Searches YouTube for videos on a topic. ALWAYS USE limit=8 (the default) — fewer results means less material to analyze and weaker pattern recognition. Defaults: region=FR + relevanceLanguage=fr (the user is French) + duration=medium (excludes <4min shorts — we want long-form videos for thumbnail analysis). If the French query returns fewer than 4 results, the tool auto-retries with region=any so you still get inspiration. By default fetches the top thumbnails as images so you can VISUALLY analyze them (composition, color contrast, focal point, text legibility, face placement). Use sort='viewCount' to surface what's most clicked, 'relevance' (default) for topical match. Pass region='US' or 'any' to broaden search; pass duration='long' for >20min content only. Be precise with the query — include exact product names and brands. QUOTA: 100 units per call.",
  inputSchema: InputSchema,
  handler: async ({ query, sort, limit, include_thumbnails, region, duration }) => {
    const apiKey = getSetting("youtubeApiKey");
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: "text", text: "YouTube API key not configured. Add it in Settings." }],
      };
    }

    const wantedSort = sort ?? "relevance";
    const wantedLimit = limit ?? 8;
    const wantedDuration = duration ?? "medium";
    const wantedRegion = region ?? "FR";

    let items: YtVideoItem[] = [];
    let regionUsed: string = wantedRegion;
    let fallbackUsed = false;

    try {
      items = await fetchSearch({
        apiKey,
        query,
        sort: wantedSort,
        limit: wantedLimit,
        duration: wantedDuration,
        region: wantedRegion === "any" ? null : wantedRegion,
      });
      // Auto-fallback to global search if FR returned too few results.
      if (wantedRegion === "FR" && items.length < FALLBACK_THRESHOLD) {
        const fallback = await fetchSearch({
          apiKey,
          query,
          sort: wantedSort,
          limit: wantedLimit,
          duration: wantedDuration,
          region: null,
        });
        if (fallback.length > items.length) {
          items = fallback;
          regionUsed = "any";
          fallbackUsed = true;
        }
      }
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
    }

    if (items.length === 0) {
      return { content: [{ type: "text", text: `Aucun résultat pour "${query}" (région ${wantedRegion}, durée ${wantedDuration}).` }] };
    }

    const fetchThumbs = include_thumbnails !== false; // default true

    // Text summary listing all hits
    const lines = items.map((it, i) => {
      const tn = it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "";
      return `[${i + 1}] [${it.id.videoId}] "${it.snippet.title}" — ${it.snippet.channelTitle} (${it.snippet.publishedAt.slice(0, 10)})\n  thumbnail: ${tn}`;
    });

    const headerBits = [
      `${items.length} vidéo(s) sur "${query}"`,
      `sorted by ${wantedSort}`,
      `région ${regionUsed === "any" ? "globale" : regionUsed}${fallbackUsed ? " (fallback global après FR < 4 résultats)" : ""}`,
      `durée ${wantedDuration === "any" ? "tous formats" : wantedDuration === "long" ? ">20min" : "4-20min (shorts exclus)"}`,
    ];
    const content: ToolContent[] = [
      {
        type: "text",
        text: `${headerBits.join(" · ")}:\n${lines.join("\n")}`,
      },
    ];

    if (!fetchThumbs) return { content };

    // Fetch the top N thumbnails so the agent can visually analyze design patterns.
    // Cap at MAX_THUMBS_FOR_VISION to keep input tokens reasonable.
    const thumbsToFetch = items.slice(0, MAX_THUMBS_FOR_VISION);
    content.push({
      type: "text",
      text: `\n\nThumbnails (top ${thumbsToFetch.length}) loaded for visual analysis. For each: read composition, color palette, focal point, face placement and expression, text size/weight/color, contrast ratio. Articulate WHY each likely earns clicks — don't generalize.`,
    });

    for (let i = 0; i < thumbsToFetch.length; i++) {
      const it = thumbsToFetch[i];
      const url = it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url;
      if (!url) continue;
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") || "image/jpeg";
        const mimeType = ct.split(";")[0].trim();
        content.push({ type: "text", text: `[${i + 1}] "${it.snippet.title}" — ${it.snippet.channelTitle}` });
        content.push({ type: "image", mimeType, data: buf.toString("base64") });
      } catch {
        // skip on fetch failure — partial result is better than failure
      }
    }

    return { content };
  },
};

registerTool(searchYoutubeTool);
