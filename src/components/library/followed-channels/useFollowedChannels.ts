"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChannelsResponse } from "@/lib/youtube/types";
import { channelsApi } from "./api";
import { channelsDataVersion } from "./view";

export const CHANNELS_POLL_MS = 3000;

/** Channels + classification status; polls while something runs in the background. */
export function useFollowedChannels() {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return channelsApi
      .list()
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch(() => {
        setError("Impossible de charger les chaînes suivies.");
      });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const busy = Boolean(
    data && (data.channels.some((channel) => channel.syncStatus === "syncing") || data.classification.running),
  );

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void reload(), CHANNELS_POLL_MS);
    return () => clearInterval(timer);
  }, [busy, reload]);

  // Réglages → Ma chaîne fires this after a save; GET /api/channels then follows the new channel.
  useEffect(() => {
    const onSaved = () => void reload();
    window.addEventListener("youtube-channel-saved", onSaved);
    return () => window.removeEventListener("youtube-channel-saved", onSaved);
  }, [reload]);

  const version = useMemo(() => (data ? channelsDataVersion(data) : ""), [data]);

  return { data, error, reload, version };
}
