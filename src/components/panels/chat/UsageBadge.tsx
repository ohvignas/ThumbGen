"use client";
import { useEffect, useState } from "react";

type Usage = {
  today: { total: number; messages: number; generations: number };
  month: { total: number; messages: number; generations: number };
};

const REFRESH_MS = 30_000;

export default function UsageBadge() {
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
        // silent
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

  const fmt = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

  return (
    <div
      className="text-[10px] text-gray-500 flex items-center gap-2"
      title={`Aujourd'hui : chat ${fmt(usage.today.messages)} + générations ${fmt(usage.today.generations)}\nMois : chat ${fmt(usage.month.messages)} + générations ${fmt(usage.month.generations)}`}
    >
      <span>
        Auj. <span className="font-mono text-gray-700">{fmt(usage.today.total)}</span>
      </span>
      <span className="text-gray-300">·</span>
      <span>
        Mois <span className="font-mono text-gray-700">{fmt(usage.month.total)}</span>
      </span>
    </div>
  );
}
