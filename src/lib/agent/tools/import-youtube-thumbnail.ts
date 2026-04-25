import { z } from "zod";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  video_id: z.string().min(1),
  label: z.string().optional(),
});

// Fetch the highest-resolution thumbnail Google serves for a video, falling
// back through the conventional sizes. maxresdefault is only present when the
// uploader supplied a 1280×720 master; otherwise we drop down.
const THUMB_SIZES = ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"] as const;

async function fetchBestThumbnail(videoId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  for (const size of THUMB_SIZES) {
    const url = `https://i.ytimg.com/vi/${videoId}/${size}.jpg`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const ab = await res.arrayBuffer();
    // YouTube returns a tiny placeholder for missing sizes — skip those.
    if (ab.byteLength < 2000) continue;
    return { bytes: Buffer.from(ab), mime: "image/jpeg" };
  }
  return null;
}

export const importYoutubeThumbnailTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "import_youtube_thumbnail",
  description:
    "Imports the published YouTube thumbnail of a video as a reference swipe-file in the user's library. Use this when the user wants to reuse one of THEIR OWN past video thumbnails (or any reference YT thumbnail) as visual inspiration in the workflow. Pass video_id (the 11-char ID, e.g. 'dQw4w9WgXcQ'). Returns a stored:sf_<id> reference you can immediately wire as a swipeFile (kind=\"reference\") in apply_workflow. Idempotent on the YouTube side (always fetches the current published thumbnail).",
  inputSchema: InputSchema,
  handler: async ({ video_id, label }) => {
    const apiKey = getSetting("youtubeApiKey");

    // Best-effort metadata lookup for a sensible label
    let derivedLabel = label || `YT ${video_id}`;
    if (apiKey && !label) {
      try {
        const meta = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video_id}&key=${apiKey}`,
        );
        if (meta.ok) {
          const data = await meta.json();
          const title = data.items?.[0]?.snippet?.title;
          if (title) derivedLabel = `YT — ${title.slice(0, 60)}`;
        }
      } catch {
        // Metadata fetch is best-effort; failure is fine.
      }
    }

    const thumb = await fetchBestThumbnail(video_id);
    if (!thumb) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `No thumbnail found for video_id=${video_id}` }],
      };
    }

    const id = uuid();
    getDb()
      .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
      .run(id, derivedLabel, thumb.mime, thumb.bytes.length, thumb.bytes);

    return {
      content: [
        {
          type: "text" as const,
          text: `Thumbnail imported. Reference: stored:sf_${id} (label: "${derivedLabel}", ${Math.round(
            thumb.bytes.length / 1024,
          )} KB). Wire this as a swipeFile (kind="reference") in apply_workflow.`,
        },
        { type: "image" as const, mimeType: thumb.mime, data: thumb.bytes.toString("base64") },
      ],
    };
  },
};

registerTool(importYoutubeThumbnailTool);
