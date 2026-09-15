"use client";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from "@/components/ui/dropdown-menu";

type MenuItem = { label: string; onClick: () => void; icon?: React.ReactNode; disabled?: boolean; hint?: string };
type MenuSection = { title: string; items: MenuItem[] };

export default function ContextMenu({
  x,
  y,
  sections,
  items,
  onClose,
}: {
  x: number;
  y: number;
  sections?: MenuSection[];
  items?: MenuItem[];
  onClose: () => void;
}) {
  const allSections: MenuSection[] = sections ? sections : items ? [{ title: "", items }] : [];

  return (
    <DropdownMenu open onOpenChange={(open) => { if (!open) onClose(); }}>
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
        className="min-w-[220px] max-h-[80vh] overflow-y-auto"
        finalFocus={false}
      >
        {allSections.map((section, si) => (
          <div key={si}>
            {si > 0 && <DropdownMenuSeparator />}
            {/* Base UI's GroupLabel requires a MenuGroupContext ancestor
                (unlike Radix, where DropdownMenuLabel works standalone) —
                wrap the label + its items in DropdownMenuGroup to provide it. */}
            <DropdownMenuGroup>
              {section.title && (
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{section.title}</DropdownMenuLabel>
              )}
              {section.items.map((item, i) => (
                <DropdownMenuItem
                  key={i}
                  disabled={item.disabled}
                  title={item.disabled && item.hint ? item.hint : undefined}
                  onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
                  className="gap-3"
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                  {item.disabled && item.hint && <span className="text-[10px] text-muted-foreground">inactif</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
