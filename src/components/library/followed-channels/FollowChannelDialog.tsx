"use client";

import { useRef, useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ChannelPreview } from "@/lib/youtube/types";
import { ApiError, channelsApi } from "./api";
import { formatCount, formatSubscribers } from "./view";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onFollowed: () => void };

export default function FollowChannelDialog({ open, onOpenChange, onFollowed }: Props) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [following, setFollowing] = useState(false);
  // State updates land on the next render: a double Enter or double click must not send two requests.
  const searchingRef = useRef(false);
  const followingRef = useRef(false);

  const close = () => {
    setInput("");
    setPreview(null);
    setError(null);
    setSearching(false);
    setFollowing(false);
    onOpenChange(false);
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value || searchingRef.current) return;
    searchingRef.current = true;
    setSearching(true);
    setError(null);
    setPreview(null);
    try {
      const { channel } = await channelsApi.preview(value);
      setPreview(channel);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Recherche impossible");
    } finally {
      searchingRef.current = false;
      setSearching(false);
    }
  };

  const follow = async () => {
    if (!preview || followingRef.current) return;
    followingRef.current = true;
    setFollowing(true);
    setError(null);
    try {
      await channelsApi.follow(preview.youtubeChannelId);
      onFollowed();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de suivre cette chaîne");
      setFollowing(false);
    } finally {
      followingRef.current = false;
    }
  };

  const details = preview
    ? [
        preview.handle,
        formatSubscribers(preview.subscriberCount),
        preview.videoCount !== null ? `${formatCount(preview.videoCount)} vidéos` : null,
      ].filter(Boolean)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suivre une chaîne</DialogTitle>
          <DialogDescription>
            Colle l&apos;URL de la chaîne, son @handle ou son identifiant (UC…). Toutes ses vidéos longues seront importées
            avec leurs vues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void search(event)} className="flex gap-2">
          <Input
            autoFocus
            aria-label="Chaîne YouTube"
            placeholder="https://youtube.com/@chaine"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setPreview(null);
            }}
          />
          <Button type="submit" variant="outline" disabled={searching || !input.trim()}>
            {searching ? <Loader2 className="animate-spin" /> : <Search />}
            Chercher
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {preview && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar size="lg">
              {preview.avatarUrl && <AvatarImage src={preview.avatarUrl} alt="" />}
              <AvatarFallback>{preview.title.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{preview.title}</span>
              <span className="truncate text-sm text-muted-foreground">{details.join(" · ")}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Annuler
          </Button>
          <Button type="button" disabled={!preview || preview.alreadyFollowed || following} onClick={() => void follow()}>
            {preview?.alreadyFollowed ? "Déjà suivie" : following ? "Ajout…" : "Suivre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
