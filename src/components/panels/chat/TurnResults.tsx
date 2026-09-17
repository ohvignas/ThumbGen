"use client";
import { cn } from "cn";
import ToolCallCard from "./ToolCallCard";
import { toolNameOf, type ToolPart } from "./turn-model";

/** Visual outputs of the turn (sketches, imported thumbnails, YouTube searches) in a compact grid. */
export default function TurnResults({ results }: { results: ToolPart[] }) {
  if (results.length === 0) return null;

  return (
    <div role="group" aria-label="Résultats" className="grid grid-cols-2 gap-2">
      {results.map((part) => (
        <div
          key={part.toolCallId}
          className={cn("min-w-0", (results.length === 1 || toolNameOf(part) === "search_youtube") && "col-span-2")}
        >
          <ToolCallCard part={part} />
        </div>
      ))}
    </div>
  );
}
