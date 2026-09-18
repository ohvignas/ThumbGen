"use client";
import { cn } from "cn";
import type { SlashSkill } from "@/lib/agent/skills/slash-catalog";

export default function SkillPicker({
  items,
  activeIndex,
  onHover,
  onPick,
}: {
  items: SlashSkill[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (skill: SlashSkill) => void;
}) {
  return (
    <div
      id="brainstorm-slash-picker"
      role="listbox"
      aria-label="Skills"
      className="relative z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-background p-1 text-foreground shadow-lg ring-1 ring-foreground/15"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucune skill</p>
      ) : (
        items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={item.slash}
              type="button"
              role="option"
              id={`slash-skill-${item.slash}`}
              aria-selected={active}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item);
              }}
              className={cn(
                "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm",
                active ? "bg-muted" : "bg-transparent",
              )}
            >
              <span className="font-medium">
                <span className="font-mono text-muted-foreground">/{item.slash}</span>
                <span className="ml-2">{item.title}</span>
              </span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
