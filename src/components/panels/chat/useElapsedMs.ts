"use client";
import { useEffect, useState } from "react";

/** Milliseconds since `startedAt`, refreshed every second; 0 without a start. */
export function useElapsedMs(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
