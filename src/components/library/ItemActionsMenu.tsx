"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ItemAction = { label: string; icon: LucideIcon; onClick: () => void; destructive?: boolean };

/** The « … » menu of a library card. */
export default function ItemActionsMenu({ itemLabel, actions }: { itemLabel: string; actions: ItemAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${itemLabel}`}>
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {actions.map(({ label, icon: Icon, onClick, destructive }) => (
            <DropdownMenuItem key={label} variant={destructive ? "destructive" : "default"} onClick={onClick}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
