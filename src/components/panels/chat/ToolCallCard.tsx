"use client";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";
import SimpleToolPart from "./tool-renderers/SimpleToolPart";
import SearchYoutubeGallery from "./tool-renderers/SearchYoutubeGallery";
import GeneratedImagePreview from "./tool-renderers/GeneratedImagePreview";
import type { UIMessage } from "ai";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

const CUSTOM_RENDERERS: Record<string, (part: ToolPart) => React.ReactNode> = {
  search_youtube: (part) => <SearchYoutubeGallery part={part} />,
  generate_sketch: (part) => <GeneratedImagePreview part={part} />,
  import_youtube_thumbnail: (part) => <GeneratedImagePreview part={part} />,
};

export default function ToolCallCard({ part }: { part: ToolPart }) {
  const toolName = part.type.slice("tool-".length);
  const label = TOOL_LABELS[toolName] ?? toolName;
  const custom = CUSTOM_RENDERERS[toolName];

  if (custom && part.state === "output-available") return <>{custom(part)}</>;
  return <SimpleToolPart part={part} label={label} />;
}
