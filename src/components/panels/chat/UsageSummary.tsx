"use client";
import { useEffect, useState } from "react";

type Usage = {
  today: { total: number; messages: number; generations: number };
  month: { total: number; messages: number; generations: number };
};

const REFRESH_MS = 30_000;

const fmt = (n: number) => `$${n.toFixed(n < 0.01 && n > 0 ? 4 : 2)}`;

/** Today / this month spend (chat + image generations), polled while mounted. */
export default function UsageSummary() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/agent/usage");
        if (!r.ok) return;
        const data = (await r.json()) as Usage;
        if (!cancelled) setUsage(data);
      } catch {
        // Usage is informational; a failed poll just keeps the last value.
      }
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!usage) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs text-muted-foreground tabular-nums"
      title={`Aujourd'hui : chat ${fmt(usage.today.messages)} + images ${fmt(usage.today.generations)}\nCe mois : chat ${fmt(usage.month.messages)} + images ${fmt(usage.month.generations)}`}
    >
      <span>
        Aujourd&apos;hui <span className="text-foreground">{fmt(usage.today.total)}</span>
      </span>
      <span>
        Ce mois <span className="text-foreground">{fmt(usage.month.total)}</span>
      </span>
    </div>
  );
}
