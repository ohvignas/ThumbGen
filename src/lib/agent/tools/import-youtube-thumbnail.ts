import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { fetchBestThumbnail, saveThumbnailToLibrary } from "@/lib/youtube/thumbnails";
import { copyVideoThumbnailToLibrary } from "@/lib/youtube/use-thumbnail";
import { getCopiedSwipeFile, rememberCopy } from "@/lib/brief/youtube-thumbnail-copies";
import { ToolDefinition, type ToolResult } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({
  video_id: z.string().min(1),
  label: z.string().optional(),
});

function importedResult(swipeFileId: string, label: string, mime: string, bytes: Buffer): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: `Thumbnail imported. Reference: stored:sf_${swipeFileId} (label: "${label}", ${Math.round(
          bytes.length / 1024,
        )} KB). Wire this as a swipeFile (kind="reference") in apply_workflow.`,
      },
      { type: "image" as const, mimeType: mime, data: bytes.toString("base64") },
    ],
  };
}

export const importYoutubeThumbnailTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "import_youtube_thumbnail",
  description:
    "Copies a published YouTube thumbnail into the library as stored:sf_<id>. Use when they want that exact thumb as a canvas reference. Pass the 11-char video_id, not a URL. Followed-channel copies are deduplicated. Not a search — get the id first. Competitor composition JSON: analyze_thumbnails.",
  inputSchema: InputSchema,
  handler: async ({ video_id, label }) => {
    // A followed-channel video: same library copy as « Utiliser comme référence » (deduplicated).
    const outcome = await copyVideoThumbnailToLibrary(video_id);
    if (outcome.status === "existing" || outcome.status === "created") {
      const row = getDb().prepare("SELECT mime_type, data FROM swipe_files WHERE id = ?").get(outcome.swipeFileId) as
        | { mime_type: string; data: Buffer }
        | undefined;
      if (row) return importedResult(outcome.swipeFileId, outcome.label, row.mime_type, row.data);
    }
    if (outcome.status === "not-found" || outcome.status === "unreachable") {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              outcome.status === "not-found"
                ? `No thumbnail found for video_id=${video_id}`
                : `YouTube is unreachable, could not import video_id=${video_id}`,
          },
        ],
      };
    }

    const copied = getCopiedSwipeFile(video_id);
    if (copied) {
      const row = getDb().prepare("SELECT mime_type, data, title FROM swipe_files WHERE id = ?").get(copied) as
        | { mime_type: string; data: Buffer; title: string }
        | undefined;
      if (row) return importedResult(copied, label || row.title, row.mime_type, row.data);
    }

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

    const id = saveThumbnailToLibrary(derivedLabel, thumb);
    rememberCopy(video_id, id);
    return importedResult(id, derivedLabel, thumb.mime, thumb.bytes);
  },
};

registerTool(importYoutubeThumbnailTool);
