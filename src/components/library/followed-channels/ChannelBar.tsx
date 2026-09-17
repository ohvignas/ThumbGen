"use client";

import { useEffect, useState } from "react";
import { Loader2, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "cn";
import ConfirmDialog from "@/components/settings/ConfirmDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QUOTA_SYNC_ERROR, type ChannelListItem } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { channelStatusLabel } from "./view";

type Props = { channels: ChannelListItem[]; onFollow: () => void; onChanged: () => void };

export default function ChannelBar({ channels, onFollow, onChanged }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState<string | null>(null);
  const [toUnfollow, setToUnfollow] = useState<ChannelListItem | null>(null);
  const [unfollowing, setUnfollowing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = async (channel: ChannelListItem) => {
    setMessage(null);
    try {
      await channelsApi.sync(channel.id);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Actualisation impossible");
    }
    onChanged();
  };

  const refreshAll = async () => {
    setMessage(null);
    try {
      await channelsApi.syncAll();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Actualisation impossible");
    }
    onChanged();
  };

  const unfollow = async () => {
    if (!toUnfollow) return;
    setUnfollowing(true);
    try {
      await channelsApi.unfollow(toUnfollow.id);
      setToUnfollow(null);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Impossible de ne plus suivre cette chaîne");
      setToUnfollow(null);
    } finally {
      setUnfollowing(false);
      onChanged();
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {channels.map((channel) => {
          const failed = channel.syncStatus === "error" && channel.syncError !== QUOTA_SYNC_ERROR;
          return (
            <div key={channel.id} className="flex items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-1.5">
              <Avatar size="sm">
                {channel.avatarUrl && <AvatarImage src={channel.avatarUrl} alt="" />}
                <AvatarFallback>{channel.title.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="grid leading-tight">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {channel.title}
                  {channel.isMine && <Badge variant="secondary">Ma chaîne</Badge>}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs text-muted-foreground",
                    channel.syncStatus === "error" && "text-destructive",
                  )}
                  title={channel.syncStatus === "error" ? (channel.syncError ?? undefined) : undefined}
                >
                  {channel.syncStatus === "syncing" && <Loader2 className="size-3 animate-spin" />}
                  {channelStatusLabel(channel, now)}
                </span>
              </div>
              {failed && (
                <Button variant="ghost" size="xs" onClick={() => void refresh(channel)}>
                  Réessayer
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${channel.title}`}>
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem disabled={channel.syncStatus === "syncing"} onClick={() => void refresh(channel)}>
                      <RefreshCw />
                      {failed ? "Réessayer" : "Actualiser"}
                    </DropdownMenuItem>
                    {!channel.isMine && (
                      <DropdownMenuItem variant="destructive" onClick={() => setToUnfollow(channel)}>
                        <Trash2 />
                        Ne plus suivre
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={onFollow}>
          <Plus />
          Suivre une chaîne
        </Button>
        {channels.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void refreshAll()}>
            <RefreshCw />
            Tout actualiser
          </Button>
        )}
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      <ConfirmDialog
        open={toUnfollow !== null}
        onOpenChange={(open) => {
          if (!open) setToUnfollow(null);
        }}
        title={`Ne plus suivre « ${toUnfollow?.title ?? ""} » ?`}
        description="La chaîne et ses vidéos disparaissent de ThumbGen. Les miniatures déjà copiées dans ta bibliothèque restent."
        confirmLabel="Ne plus suivre"
        busy={unfollowing}
        onConfirm={() => void unfollow()}
      />
    </div>
  );
}
