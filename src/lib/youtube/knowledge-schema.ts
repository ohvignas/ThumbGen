import { z } from "zod";

/** Structured channel bible produced after ingest. Compact enough for a system block. */
export const ChannelKnowledgeJsonSchema = z.object({
  identity: z.object({
    name: z.string().default(""),
    handle: z.string().nullable().default(null),
    niche: z.string().default(""),
    positioning: z.string().default(""),
    uniqueAngle: z.string().default(""),
  }),
  audience: z.object({
    who: z.string().default(""),
    language: z.string().default(""),
    motivations: z.string().default(""),
  }),
  content: z.object({
    pillars: z.array(z.string()).max(8).default([]),
    formats: z.array(z.string()).max(8).default([]),
    titlePatterns: z.array(z.string()).max(8).default([]),
    hookPatterns: z.array(z.string()).max(8).default([]),
  }),
  thumbnails: z.object({
    winningTypes: z.array(z.string()).max(6).default([]),
    visualLanguage: z.string().default(""),
    textStyle: z.string().default(""),
    faceUsage: z.string().default(""),
    avoid: z.array(z.string()).max(6).default([]),
  }),
  performance: z.object({
    summary: z.string().default(""),
    outliers: z
      .array(
        z.object({
          videoId: z.string(),
          title: z.string(),
          why: z.string(),
        }),
      )
      .max(8)
      .default([]),
  }),
  standingInstructions: z.string().default(""),
});

export type ChannelKnowledgeJson = z.output<typeof ChannelKnowledgeJsonSchema>;

export const EMPTY_CHANNEL_KNOWLEDGE: ChannelKnowledgeJson = {
  identity: { name: "", handle: null, niche: "", positioning: "", uniqueAngle: "" },
  audience: { who: "", language: "", motivations: "" },
  content: { pillars: [], formats: [], titlePatterns: [], hookPatterns: [] },
  thumbnails: { winningTypes: [], visualLanguage: "", textStyle: "", faceUsage: "", avoid: [] },
  performance: { summary: "", outliers: [] },
  standingInstructions: "",
};

export const VideoSummarySchema = z.object({
  summary: z.string().max(800).default(""),
  topics: z.array(z.string()).max(8).default([]),
  hook: z.string().max(240).default(""),
});

export type VideoSummary = z.output<typeof VideoSummarySchema>;

export const INGEST_STEPS = ["videos", "analytics", "transcripts", "analysis", "done"] as const;
export type IngestStep = (typeof INGEST_STEPS)[number];

export const INGEST_STATUSES = ["idle", "running", "error"] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];
