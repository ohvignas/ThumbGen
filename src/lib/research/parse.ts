import { z } from "zod";
import { ENTITY_KINDS, type BriefResearch } from "@/lib/brief/schema";

const entityKind = z
  .string()
  .transform((value) => (ENTITY_KINDS.includes(value as (typeof ENTITY_KINDS)[number]) ? (value as BriefResearch["entities"][number]["kind"]) : "other"));

const payloadSchema = z.object({
  summary: z.string().trim().max(1200).default(""),
  keyPoints: z.array(z.unknown()).max(20).default([]).transform((items) =>
    items.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 200)).filter(Boolean).slice(0, 6),
  ),
  entities: z.array(z.unknown()).max(24).default([]).transform((items) =>
    items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { name?: unknown; kind?: unknown };
      if (typeof record.name !== "string" || record.name.trim() === "") return [];
      const kind = entityKind.catch("other").parse(typeof record.kind === "string" ? record.kind : "other");
      return [{ name: record.name.trim().slice(0, 80), kind }];
    }).slice(0, 12),
  ),
});

/** First JSON object in `text`, stripping markdown fences. */
export function extractJsonObject(text: string | null | undefined): unknown {
  if (!text) return null;
  const unfenced = text.replace(/```(?:json)?/gi, "```").replace(/```/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export function parseResearchPayload(text: string | null | undefined): Omit<BriefResearch, "sources" | "fetchedAt"> | null {
  const parsed = payloadSchema.safeParse(extractJsonObject(text));
  if (!parsed.success || parsed.data.summary.trim() === "") return null;
  return { summary: parsed.data.summary, keyPoints: parsed.data.keyPoints, entities: parsed.data.entities };
}

const sourceSchema = z.object({ title: z.string().trim().max(200), url: z.url() });

type Annotation = { type?: unknown; url_citation?: { url?: unknown; title?: unknown } };
type CompletionLike = {
  citations?: unknown;
  choices?: Array<{ message?: { annotations?: Annotation[]; citations?: unknown } }>;
};

function sourceFromUrl(url: string, title?: string): { title: string; url: string } | null {
  const parsed = sourceSchema.safeParse({ title: (title?.trim() || hostnameTitle(url)).slice(0, 200), url });
  return parsed.success ? parsed.data : null;
}

function hostnameTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Sources come from the API citations, never from the model JSON. */
export function citationsFromCompletion(completion: CompletionLike): BriefResearch["sources"] {
  const message = completion.choices?.[0]?.message;
  const seen = new Set<string>();
  const sources: BriefResearch["sources"] = [];
  const push = (url: unknown, title?: unknown) => {
    if (typeof url !== "string" || seen.has(url)) return;
    const source = sourceFromUrl(url, typeof title === "string" ? title : undefined);
    if (!source) return;
    seen.add(url);
    sources.push(source);
  };
  for (const annotation of message?.annotations ?? []) {
    if (annotation?.type !== "url_citation") continue;
    push(annotation.url_citation?.url, annotation.url_citation?.title);
  }
  if (sources.length === 0) {
    const raw = completion.citations ?? message?.citations;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") push(item);
        else if (item && typeof item === "object" && "url" in item) {
          push((item as { url?: unknown }).url, (item as { title?: unknown }).title);
        }
      }
    }
  }
  return sources.slice(0, 8);
}
