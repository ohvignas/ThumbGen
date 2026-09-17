"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChannelsResponse } from "@/lib/youtube/types";
import { channelsApi } from "./api";
import { channelsDataVersion } from "./view";

export const CHANNELS_POLL_MS = 3000;

/** Channels + classification status; polls while something runs in the background. */
export function useFollowedChannels() {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A slow GET (it may resolve « Ma chaîne » on YouTube) must not pile up behind 3 s poll ticks.
  const inFlight = useRef(0);

  const reload = useCallback(() => {
    inFlight.current += 1;
    return channelsApi
      .list()
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch(() => {
        setError("Impossible de charger les chaînes suivies.");
      })
      .finally(() => {
        inFlight.current -= 1;
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
    const timer = setInterval(() => {
      if (inFlight.current === 0) void reload();
    }, CHANNELS_POLL_MS);
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
