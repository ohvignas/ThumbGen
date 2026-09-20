"use client";
import { cn } from "cn";
import type { MentionableImage } from "@/lib/canvas/mentionable-images";

export default function MentionPicker({
  items,
  activeIndex,
  onHover,
  onPick,
}: {
  items: MentionableImage[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (item: MentionableImage) => void;
}) {
  return (
    <div
      id="brainstorm-mention-picker"
      role="listbox"
      aria-label="Miniatures"
      className="relative z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-background p-1 text-foreground shadow-lg ring-1 ring-foreground/15"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucune miniature</p>
      ) : (
        items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={`${item.image}-${item.imageNode}`}
              type="button"
              role="option"
              id={`mention-image-${item.visibleId.replace("#", "")}`}
              aria-selected={active}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                active ? "bg-muted" : "bg-transparent",
              )}
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-8 w-14 shrink-0 rounded border border-border object-cover"
                />
              ) : (
                <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded border border-dashed border-border text-[9px] text-muted-foreground">
                  img
                </span>
              )}
              <span className="min-w-0">
                <span className="font-mono text-muted-foreground">{item.visibleId}</span>
                <span className="ml-2 truncate">{item.label}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
