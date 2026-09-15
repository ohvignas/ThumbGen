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
 *    `toModelOutput` (src/lib/agent/v2/tool-adapter.ts) builds as
 *    `{type:"content", value: ContentPart[]}` — where an image entry's
 *    `data` field is itself EITHER a bare base64 string (rows persisted
 *    before Task 14's Bug 2 schema fix, and any row a future migration
 *    script hasn't touched) OR the tagged `{type:"data", data:<string>}`
 *    object (rows persisted after that fix — `type:"file"`'s real,
 *    non-deprecated schema per @ai-sdk/provider-utils requires the tagged
 *    form; a bare string there fails ModelMessage[] validation on the next
 *    model turn, which is exactly the bug that fix addressed). Both
 *    variants are real, persisted, and currently coexist in this app's own
 *    database — normalizeToolContent below accepts either rather than
 *    assuming only the newer one, which is what silently emptied this
 *    gallery on reload when the schema fix first landed (a real regression,
 *    caught in review — see task-14-report.md's continuation for the
 *    trace).
 *
 * Both LIVE/RELOADED shapes are real and both occur within the same
 * browsing session (old messages reload in the second shape, new tool
 * calls in this session arrive in the first), so both are normalized into
 * one internal representation below rather than assuming either one is
 * "the" shape.
 */
type NormalizedItem = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };

/** Reloaded file parts carry `data` as either a bare base64 string (pre-fix
 * / unmigrated rows) or the tagged `{type:"data", data}` object (current,
 * schema-correct rows) — accept both. */
function extractFileData(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { data?: unknown }).data === "string") {
    return (data as { data: string }).data;
  }
  return undefined;
}

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
    } else if (c.type === "file" && typeof c.mediaType === "string" && c.mediaType.startsWith("image/")) {
      const d = extractFileData(c.data);
      if (d) out.push({ type: "image", mediaType: c.mediaType, data: d });
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
