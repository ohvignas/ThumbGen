"use client";

import { useEffect } from "react";

// Once per document load: StrictMode runs effects twice and the root layout
// never remounts on client navigation. The server throttles it as well.
let triggered = false;

/** Asks the server to refresh followed channels last synced more than 12 hours ago.
 *  RSS + young-video snapshots also run on a server 15 min timer (instrumentation). */
export default function ChannelSyncTrigger() {
  useEffect(() => {
    if (triggered) return;
    triggered = true;
    fetch("/api/channels/sync-stale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, []);
  return null;
}
