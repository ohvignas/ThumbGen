"use client";
import { useChatStore } from "@/store/chat-store";

/**
 * A tool part's `output` carries TWO different shapes depending on whether
 * it's live or reloaded from persisted history — verified directly against
 * source (see normalizeToolContent below) rather than assumed:
 *
 *  - LIVE (this chat session, right after the tool resolves): `output` is
 *    the raw return value of the tool handler's execute() — `ToolResult =
 *    {content: ToolContent[]}` per src/lib/agent/tools/types.ts, where an
 *    image entry is `{type:"image", mimeType, data}`. Confirmed by reading
 *    types.ts and search-youtube.ts directly, and by tracing
 *    node_modules/ai's executeToolCall/updateToolPartState, which enqueue
 *    the tool's execute() return value onto the UI stream's `output` field
 *    completely untransformed.
 *  - RELOADED (page refresh, history restored via Task 4's
 *    rowsToUIMessages): `output` is assigned verbatim from the persisted
 *    ModelMessage's tool-result `output` field, which this app's
 *    `toModelOutput` (src/lib/agent/v2/tool-adapter.ts) built as
 *    `{type:"content", value: ContentPart[]}` — where an image entry there
 *    IS `{type:"file", mediaType, data}`. Confirmed against a real
 *    search_youtube row in data/thumbgen.db (id
 *    290773ef-4f32-4d33-8b42-45f75c7ee4e7): its persisted tool-result output
 *    is literally `{"type":"content","value":[{"type":"text",...},
 *    {"type":"file","mediaType":"image/jpeg","data":"..."},...]}`.
 *
 * Both shapes are real and both occur within the same browsing session (old
 * messages reload in the second shape, new tool calls in this session arrive
 * in the first), so both are normalized into one internal representation
 * below rather than assuming either one is "the" shape.
 */
type NormalizedItem = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };

function normalizeToolContent(output: unknown): NormalizedItem[] {
  if (!output || typeof output !== "object") return [];
  const o = output as Record<string, unknown>;
  const items = Array.isArray(o.content)
    ? (o.content as unknown[]) // live shape: {content: [...]}
    : o.type === "content" && Array.isArray(o.value)
      ? (o.value as unknown[]) // reloaded shape: {type:"content", value: [...]}
      : [];
  const out: NormalizedItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (c.type === "text" && typeof c.text === "string") {
      out.push({ type: "text", text: c.text });
    } else if (c.type === "image" && typeof c.data === "string") {
      out.push({ type: "image", mediaType: typeof c.mimeType === "string" ? c.mimeType : "image/jpeg", data: c.data });
    } else if (c.type === "file" && typeof c.data === "string" && typeof c.mediaType === "string" && c.mediaType.startsWith("image/")) {
      out.push({ type: "image", mediaType: c.mediaType, data: c.data });
    }
  }
  return out;
}

export default function SearchYoutubeGallery({ part }: { part: { output?: unknown } }) {
  const openAnnotate = useChatStore((s) => s.openAnnotate);
  const items = normalizeToolContent(part.output);

  // Walk the interleaved text/image content array, pairing each image with
  // its immediately-preceding caption (search_youtube emits `"[i] title —
  // channel"` right before each thumbnail — confirmed in both
  // search-youtube.ts's source and the real persisted row inspected above).
  const pairs: { caption: string; url: string }[] = [];
  let pendingCaption = "";
  for (const c of items) {
    if (c.type === "text") pendingCaption = c.text;
    else if (c.type === "image") {
      pairs.push({ caption: pendingCaption, url: `data:${c.mediaType};base64,${c.data}` });
      pendingCaption = "";
    }
  }

  if (pairs.length === 0) return <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Aucune miniature.</p>;

  return (
    <div className="grid grid-cols-2 gap-2">
      {pairs.map((p, i) => (
        <button key={i} type="button" onClick={() => openAnnotate(p.url)} className="text-left rounded-md overflow-hidden" style={{ border: "1px solid var(--line)", background: "var(--ink-3)", cursor: "zoom-in" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.caption} loading="lazy" className="w-full aspect-video object-cover" />
          <p className="text-[10px] p-1.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{p.caption}</p>
        </button>
      ))}
    </div>
  );
}
