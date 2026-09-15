"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AppSidebar from "@/components/panels/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { PROVIDER_COLORS } from "@/lib/model-costs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

type Period = "today" | "7d" | "30d" | "all";

type Totals = { totalCost: number; totalGenerations: number; totalImages: number; totalTokens: number; avgTimeMs: number; errorCount: number };
type ModelBreakdown = { provider: string; model: string; count: number; images: number; cost: number; avgTimeMs: number; totalTokens: number };
type LogRow = {
  id: string; created_at: string; provider: string; model: string; endpoint: string;
  cost_estimate: number; time_ms: number; total_tokens: number; image_count: number;
  prompt: string | null; status: string; error_message: string | null;
};
type DailyPoint = { day: string; cost: number; count: number };
type AgentTotals = { totalCost: number; totalMessages: number; totalConversations: number; totalInputTokens: number; totalOutputTokens: number; totalTokens: number };
type AgentDailyPoint = { day: string; cost: number; messages: number };
type ApiResponse = {
  period: Period; totals: Totals; byModel: ModelBreakdown[]; log: LogRow[]; daily: DailyPoint[];
  agentTotals?: AgentTotals; agentDaily?: AgentDailyPoint[];
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-flash-image": "Gemini 2.5 Flash",
  "gemini-3.1-flash-image": "Gemini 3.1 Flash",
  "gemini-3.1-flash-lite-image": "Gemini 3.1 Flash Lite",
  "gemini-3-pro-image": "Gemini 3 Pro",
  ideogram: "Ideogram v3",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-1.5": "GPT Image 1.5",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2.5-flare": "GPT Image 2.5 Flare",
  "gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst",
  "grok-imagine-image-2.0": "Grok Imagine 2.0",
  "bytedance-seed/seedream-4.5": "Seedream 4.5",
};

const modelLabel = (m: string) => MODEL_LABELS[m] || m;
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)}s`);

function splitCost(n: number): [string, string] {
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split(".");
  return [Number(int).toLocaleString("en-US"), dec];
}

function fmtTime(iso: string) {
  const isoNorm = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(isoNorm);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const isoNorm = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(isoNorm);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

function UsageInner() {
  const [period, setPeriod] = useState<Period>("all");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/generations?period=${period}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => setData(d))
      .finally(() => setLoading(false));
  }, [period]);

  const totals = data?.totals;
  const byModel = data?.byModel ?? [];
  const log = data?.log ?? [];
  const daily = data?.daily ?? [];
  const agentTotals = data?.agentTotals;

  const imagesCost = totals?.totalCost ?? 0;
  const agentCost = agentTotals?.totalCost ?? 0;
  const grandTotal = imagesCost + agentCost;

  const maxBar = useMemo(() => Math.max(0.0001, ...byModel.map((b) => b.cost)), [byModel]);
  const maxDaily = useMemo(() => Math.max(0.0001, ...daily.map((d) => d.cost)), [daily]);
  const [intPart, decPart] = splitCost(grandTotal);
  const costPerImage = totals && totals.totalImages > 0 ? totals.totalCost / totals.totalImages : 0;

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <main className="px-6 sm:px-8 py-10 sm:py-14 max-w-[1200px] mx-auto w-full">
          {/* Header */}
          <header className="mb-14">
            <div className="inline-flex items-center gap-3 text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-4">
              <span className="w-7 h-px bg-primary" />
              <span>Generation Ledger</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-8 pb-7 border-b border-border">
              <h1 className="text-4xl sm:text-5xl font-bold text-foreground">Usage</h1>
              <ToggleGroup
                value={[period]}
                onValueChange={(v) => {
                  const next = v[0] as Period | undefined;
                  if (next) setPeriod(next);
                }}
                aria-label="Time period"
              >
                {PERIODS.map((p) => (
                  <ToggleGroupItem key={p.id} value={p.id} className="text-xs">
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </header>

          {/* Hero */}
          <section className="pb-12 mb-14 border-b border-border">
            <div className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground mb-5">Cumulative cost · estimate</div>
            <div className="flex items-baseline gap-1 flex-wrap" aria-label={`${intPart}.${decPart} dollars`}>
              <span className="text-2xl text-muted-foreground font-mono mr-3 self-start">$</span>
              {loading ? (
                <Skeleton className="h-16 w-48" />
              ) : (
                <>
                  <span className="text-6xl sm:text-7xl font-bold text-foreground tabular-nums">{intPart}</span>
                  <span className="text-6xl sm:text-7xl font-bold text-primary">.</span>
                  <span className="text-6xl sm:text-7xl font-bold text-muted-foreground tabular-nums">{decPart}</span>
                  <span className="text-xs font-mono tracking-widest text-muted-foreground ml-4 self-end mb-2">USD</span>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span className="w-4 h-px bg-primary" /> Génération · images
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">${imagesCost.toFixed(2)}</div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs font-mono text-muted-foreground">
                    <span>{fmtNum(totals?.totalImages ?? 0)} images</span>
                    <span>·</span>
                    <span>{fmtNum(totals?.totalGenerations ?? 0)} calls</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span className="w-4 h-px bg-primary" /> Agent IA · chat
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground tabular-nums">${agentCost.toFixed(2)}</div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs font-mono text-muted-foreground">
                    <span>{fmtNum(agentTotals?.totalConversations ?? 0)} conv.</span>
                    <span>·</span>
                    <span>{fmtNum(agentTotals?.totalMessages ?? 0)} msgs</span>
                    <span>·</span>
                    <span>{fmtNum(agentTotals?.totalTokens ?? 0)} tokens</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <ul className="flex flex-wrap gap-6 sm:gap-8 mt-7 list-none p-0 font-mono text-xs">
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtNum((totals?.totalGenerations ?? 0) + (agentTotals?.totalMessages ?? 0))}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">total calls</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtNum(totals?.totalImages ?? 0)}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">images</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtNum((totals?.totalTokens ?? 0) + (agentTotals?.totalTokens ?? 0))}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">tokens</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading ? "—" : fmtMs(totals?.avgTimeMs ?? 0)}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">avg latency</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-foreground tabular-nums">{loading || costPerImage === 0 ? "—" : `$${costPerImage.toFixed(3)}`}</span>
                <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">cost / image</span>
              </li>
              {totals && totals.errorCount > 0 && (
                <li className="flex items-baseline gap-2">
                  <span className="text-destructive tabular-nums">{totals.errorCount}</span>
                  <span className="text-muted-foreground uppercase tracking-[0.16em] text-[10px]">errors</span>
                </li>
              )}
            </ul>

            {daily.length > 0 && (
              <div className="flex items-end gap-[3px] h-14 mt-8" aria-label="Daily cost trend">
                {daily.map((d) => (
                  <span
                    key={d.day}
                    className="flex-1 min-w-1 bg-muted-foreground/30 hover:bg-primary transition-colors"
                    style={{ height: `${Math.max(4, (d.cost / maxDaily) * 100)}%` }}
                    title={`${d.day} · $${d.cost.toFixed(2)} · ${d.count} gen`}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Section 01: Breakdown by model */}
          <section className="mb-20">
            <header className="flex items-baseline gap-5 pb-4 mb-6 border-b border-border flex-wrap">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary">01</span>
              <h2 className="text-2xl font-semibold text-foreground">By model</h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{byModel.length} model{byModel.length !== 1 ? "s" : ""} · sorted by cost</span>
            </header>

            {byModel.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle className="text-xs font-mono tracking-widest text-muted-foreground">— No generations in this window —</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col">
                {byModel.map((b) => {
                  const color = PROVIDER_COLORS[b.provider] || "#FFFFFF";
                  const widthPct = (b.cost / maxBar) * 100;
                  return (
                    <div key={`${b.provider}-${b.model}`} className="grid grid-cols-2 lg:grid-cols-[220px_1fr_90px_90px_90px] items-center gap-3 lg:gap-6 py-4 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-3 min-w-0 col-span-2 lg:col-span-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-sm text-foreground truncate">{modelLabel(b.model)}</span>
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/70">{b.provider}</span>
                      </div>
                      <div className="h-px bg-border relative hidden lg:block">
                        <span className="absolute left-0 -top-[1px] h-[3px] opacity-85" style={{ width: `${widthPct}%`, background: color }} />
                      </div>
                      <div className="font-mono text-[13px] text-right text-foreground tabular-nums">${b.cost.toFixed(b.cost < 1 ? 3 : 2)}</div>
                      <div className="font-mono text-[13px] text-right text-muted-foreground tabular-nums">{fmtNum(b.images)} <span className="text-[10px] uppercase text-muted-foreground/70">img</span></div>
                      <div className="font-mono text-[13px] text-right text-muted-foreground tabular-nums">{fmtMs(b.avgTimeMs)} <span className="text-[10px] uppercase text-muted-foreground/70">avg</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 02: Activity log */}
          <section className="mb-20">
            <header className="flex items-baseline gap-5 pb-4 mb-6 border-b border-border flex-wrap">
              <span className="font-mono text-[11px] tracking-[0.2em] text-primary">02</span>
              <h2 className="text-2xl font-semibold text-foreground">Recent activity</h2>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{log.length} entr{log.length === 1 ? "y" : "ies"} · most recent first</span>
            </header>

            {log.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle className="text-xs font-mono tracking-widest text-muted-foreground">— No entries in this window —</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead aria-label="Time ago" />
                      <TableHead>Model</TableHead>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Img</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.map((row) => {
                      const color = PROVIDER_COLORS[row.provider] || "#fff";
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{fmtTime(row.created_at)}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground/70 text-right">{timeAgo(row.created_at)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="outline" className="gap-1.5">
                              <span className="w-1 h-1 rounded-full" style={{ background: color }} />
                              {modelLabel(row.model)}
                            </Badge>
                            <span className="text-muted-foreground/70 text-[10px] ml-2">/{row.endpoint}</span>
                          </TableCell>
                          <TableCell className="max-w-[380px] text-muted-foreground">
                            {row.status === "error" ? (
                              <span className="text-destructive text-[11px]" title={row.error_message || ""}>ERR · {row.error_message || "—"}</span>
                            ) : row.prompt ? (
                              <span className="line-clamp-1" title={row.prompt}>{row.prompt}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">${row.cost_estimate.toFixed(3)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMs(row.time_ms)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {row.total_tokens > 0 ? fmtNum(row.total_tokens) : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{row.image_count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <footer className="flex items-center gap-3 pt-6 border-t border-border font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground/70">
            <span className="w-1 h-1 rounded-full bg-primary" />
            <span>Costs are estimates from per-image pricing. Real billing may differ.</span>
          </footer>
        </main>
      </SidebarInset>
    </>
  );
}

export default function UsageView() {
  // ReactFlowProvider lets AppSidebar mount safely on this page (it calls
  // useReactFlow() internally for its addAtCenter helper).
  return (
    <ReactFlowProvider>
      <UsageInner />
    </ReactFlowProvider>
  );
}
