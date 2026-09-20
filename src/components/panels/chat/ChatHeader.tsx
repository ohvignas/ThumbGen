"use client";
import { History, Minus, Plus, Trash2 } from "lucide-react";
import type { ChatStatus } from "ai";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import AgentAvatar from "./AgentAvatar";
import UsageSummary from "./UsageSummary";
import { useConversations } from "./useConversations";

const STATUS: Record<ChatStatus, { label: string; dot: string }> = {
  ready: { label: "Prêt", dot: "bg-emerald-500" },
  submitted: { label: "Réfléchit…", dot: "bg-amber-400 animate-pulse" },
  streaming: { label: "Répond…", dot: "bg-violet-400 animate-pulse" },
  error: { label: "Erreur", dot: "bg-destructive" },
};

function HeaderButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function ChatHeader({
  projectId,
  status,
  onMinimize,
}: {
  projectId: string;
  status: ChatStatus;
  onMinimize: () => void;
}) {
  const { conversations, active, activeConversationId, create, remove, select } = useConversations(projectId);
  const { label, dot } = STATUS[status];

  return (
    <div className="flex items-center gap-3 border-b px-3 py-2.5">
      <AgentAvatar />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{active?.title ?? "Nouvelle conversation"}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs leading-tight text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
          <span className="truncate">Agent ThumbGen</span>
          <span className="shrink-0">· {label}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <HeaderButton label="Nouvelle conversation" onClick={create}>
          <Plus />
        </HeaderButton>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Historique des conversations">
                      <History />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent>
              <p>Historique</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {conversations.length} conversation{conversations.length > 1 ? "s" : ""}
              </DropdownMenuLabel>
              {conversations.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucune conversation pour ce projet.</p>
              )}
            </DropdownMenuGroup>
            <div className="max-h-72 overflow-y-auto">
              <DropdownMenuGroup>
                {conversations.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => select(c.id)}
                    className={cn("group/conv gap-2", c.id === activeConversationId && "bg-accent")}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <button
                      type="button"
                      aria-label={`Supprimer « ${c.title} »`}
                      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/conv:opacity-100 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Supprimer « ${c.title} » ?`)) remove(c.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </div>
            <DropdownMenuSeparator />
            <UsageSummary />
          </DropdownMenuContent>
        </DropdownMenu>

        <HeaderButton label="Réduire" onClick={onMinimize}>
          <Minus />
        </HeaderButton>
      </div>
    </div>
  );
}
