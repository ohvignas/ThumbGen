"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContextMenuItem } from "@/lib/canvas/context-menus";

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Invisible 1x1 anchor at the captured click point. DropdownMenuContent
          positions itself against this anchor via Base UI's own Popper-style
          positioner (side/align/offset below) rather than a plain fixed style —
          a literal `style={{position:"fixed", left, top}}` on DropdownMenuContent
          lands offset, because the Positioner wraps it in a `transform`-ed
          ancestor, which becomes the containing block for a nested `fixed`
          child per the CSS spec (verified in-browser: menu opened ~2x offset
          from the click point). */}
      <DropdownMenuTrigger
        nativeButton={false}
        render={<span style={{ position: "fixed", left: x, top: y, width: 1, height: 1 }} />}
      />
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={0}
        alignOffset={0}
        className="min-w-[240px]"
        finalFocus={false}
      >
        {items.map((item, index) =>
          item.type === "separator" ? (
            <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              variant={item.destructive ? "destructive" : "default"}
              onClick={() => {
                if (item.disabled) return;
                item.action();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
