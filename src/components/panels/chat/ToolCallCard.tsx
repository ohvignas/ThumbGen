"use client";
import type { ReactNode } from "react";
import SearchYoutubeGallery from "./tool-renderers/SearchYoutubeGallery";
import GeneratedImagePreview from "./tool-renderers/GeneratedImagePreview";
import { toolNameOf, type ToolPart } from "./turn-model";

const RESULT_RENDERERS: Record<string, (part: ToolPart) => ReactNode> = {
  search_youtube: (part) => <SearchYoutubeGallery part={part} />,
  generate_sketch: (part) => <GeneratedImagePreview part={part} />,
  import_youtube_thumbnail: (part) => <GeneratedImagePreview part={part} />,
};

export function hasResultRenderer(toolName: string): boolean {
  return Object.hasOwn(RESULT_RENDERERS, toolName);
}

/** The visual card of a finished tool call (sketch, imported thumbnail, YouTube search); nothing for other tools. */
export default function ToolCallCard({ part }: { part: ToolPart }) {
  const toolName = toolNameOf(part);
  if (!hasResultRenderer(toolName) || part.state !== "output-available") return null;
  return <>{RESULT_RENDERERS[toolName](part)}</>;
}
