"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import Sidebar from "@/components/panels/Sidebar";
import { PROVIDER_COLORS } from "@/lib/model-costs";

type Period = "today" | "7d" | "30d" | "all";

type Totals = {
  totalCost: number;
  totalGenerations: number;
  totalImages: number;
  totalTokens: number;
  avgTimeMs: number;
  errorCount: number;
};

type ModelBreakdown = {
  provider: string;
  model: string;
  count: number;
  images: number;
  cost: number;
  avgTimeMs: number;
  totalTokens: number;
};

type LogRow = {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  endpoint: string;
  cost_estimate: number;
  time_ms: number;
  total_tokens: number;
  image_count: number;
  prompt: string | null;
  status: string;
  error_message: string | null;
};

type DailyPoint = { day: string; cost: number; count: number };

type AgentTotals = {
  totalCost: number;
  totalMessages: number;
  totalConversations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

type AgentDailyPoint = { day: string; cost: number; messages: number };

type ApiResponse = {
  period: Period;
  totals: Totals;
  byModel: ModelBreakdown[];
  log: LogRow[];
  daily: DailyPoint[];
  agentTotals?: AgentTotals;
  agentDaily?: AgentDailyPoint[];
};

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-flash-image": "Gemini 2.5 Flash",
  "gemini-3.1-flash-image-preview": "Gemini 3.1 Flash",
  "gemini-3-pro-image-preview": "Gemini 3 Pro",
  ideogram: "Ideogram v3",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-1.5": "GPT Image 1.5",
  "gpt-image-2": "GPT Image 2",
  "grok-imagine-image": "Grok Imagine",
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
    <div className="usage-shell">
      <Sidebar />

      <main className="usage-main">
        {/* — Page header — */}
        <header className="head">
          <div className="eyebrow">
            <span className="eyebrow-rule" />
            <span>Generation Ledger</span>
          </div>
          <div className="head-row">
            <h1 className="page-title">Usage</h1>
            <nav className="period-pills" aria-label="Time period">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  className="pill"
                  data-active={period === p.id}
                  onClick={() => setPeriod(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {/* — Hero number (grand total) — */}
        <section className="hero">
          <div className="hero-label">Cumulative cost · estimate</div>
          <div className="big-number" aria-label={`${intPart}.${decPart} dollars`}>
            <span className="ccy">$</span>
            {loading ? (
              <span className="bn-skeleton" aria-hidden />
            ) : (
              <>
                <span className="bn-int">{intPart}</span>
                <span className="bn-dot">.</span>
                <span className="bn-dec">{decPart}</span>
                <span className="unit">USD</span>
              </>
            )}
          </div>

          {/* Category split — images vs agent */}
          <div className="cat-split">
            <div className="cat-card">
              <div className="cat-eyebrow">
                <span className="cat-rule" /> Génération · images
              </div>
              <div className="cat-cost">${imagesCost.toFixed(2)}</div>
              <div className="cat-meta">
                <span>{fmtNum(totals?.totalImages ?? 0)} images</span>
                <span>·</span>
                <span>{fmtNum(totals?.totalGenerations ?? 0)} calls</span>
              </div>
            </div>
            <div className="cat-card">
              <div className="cat-eyebrow">
                <span className="cat-rule" /> Agent IA · chat
              </div>
              <div className="cat-cost">${agentCost.toFixed(2)}</div>
              <div className="cat-meta">
                <span>{fmtNum(agentTotals?.totalConversations ?? 0)} conv.</span>
                <span>·</span>
                <span>{fmtNum(agentTotals?.totalMessages ?? 0)} msgs</span>
                <span>·</span>
                <span>{fmtNum(agentTotals?.totalTokens ?? 0)} tokens</span>
              </div>
            </div>
          </div>

          <ul className="meta">
            <li><span className="m-num">{loading ? "—" : fmtNum((totals?.totalGenerations ?? 0) + (agentTotals?.totalMessages ?? 0))}</span><span className="m-lbl">total calls</span></li>
            <li><span className="m-num">{loading ? "—" : fmtNum(totals?.totalImages ?? 0)}</span><span className="m-lbl">images</span></li>
            <li><span className="m-num">{loading ? "—" : fmtNum((totals?.totalTokens ?? 0) + (agentTotals?.totalTokens ?? 0))}</span><span className="m-lbl">tokens</span></li>
            <li><span className="m-num">{loading ? "—" : fmtMs(totals?.avgTimeMs ?? 0)}</span><span className="m-lbl">avg latency</span></li>
            <li><span className="m-num">{loading || costPerImage === 0 ? "—" : `$${costPerImage.toFixed(3)}`}</span><span className="m-lbl">cost / image</span></li>
            {totals && totals.errorCount > 0 && (
              <li className="m-error"><span className="m-num">{totals.errorCount}</span><span className="m-lbl">errors</span></li>
            )}
          </ul>

          {daily.length > 0 && (
            <div className="spark" aria-label="Daily cost trend">
              {daily.map((d) => (
                <span
                  key={d.day}
                  className="spark-bar"
                  style={{ height: `${Math.max(4, (d.cost / maxDaily) * 100)}%` }}
                  title={`${d.day} · $${d.cost.toFixed(2)} · ${d.count} gen`}
                />
              ))}
            </div>
          )}
        </section>

        {/* — Section 01: Breakdown by model — */}
        <section className="section">
          <header className="section-head">
            <span className="section-num">01</span>
            <h2 className="section-title">By model</h2>
            <span className="section-meta">{byModel.length} model{byModel.length !== 1 ? "s" : ""} · sorted by cost</span>
          </header>

          {byModel.length === 0 ? (
            <div className="empty">— No generations in this window —</div>
          ) : (
            <div className="model-list">
              {byModel.map((b) => {
                const color = PROVIDER_COLORS[b.provider] || "#FFFFFF";
                const widthPct = (b.cost / maxBar) * 100;
                return (
                  <div className="model-row" key={`${b.provider}-${b.model}`}>
                    <div className="m-name">
                      <span className="m-swatch" style={{ background: color }} />
                      <span className="m-label">{modelLabel(b.model)}</span>
                      <span className="m-prov">{b.provider}</span>
                    </div>
                    <div className="m-bar"><span className="m-bar-fill" style={{ width: `${widthPct}%`, background: color }} /></div>
                    <div className="m-num cost">${b.cost.toFixed(b.cost < 1 ? 3 : 2)}</div>
                    <div className="m-num">{fmtNum(b.images)} <span className="m-num-tag">img</span></div>
                    <div className="m-num">{fmtMs(b.avgTimeMs)} <span className="m-num-tag">avg</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* — Section 02: Activity log — */}
        <section className="section">
          <header className="section-head">
            <span className="section-num">02</span>
            <h2 className="section-title">Recent activity</h2>
            <span className="section-meta">{log.length} entr{log.length === 1 ? "y" : "ies"} · most recent first</span>
          </header>

          {log.length === 0 ? (
            <div className="empty">— No entries in this window —</div>
          ) : (
            <div className="log-wrap">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th aria-label="Time ago" />
                    <th>Model</th>
                    <th>Prompt</th>
                    <th className="num">Cost</th>
                    <th className="num">Latency</th>
                    <th className="num">Tokens</th>
                    <th className="num">Img</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((row) => {
                    const color = PROVIDER_COLORS[row.provider] || "#fff";
                    return (
                      <tr key={row.id}>
                        <td className="t-time">{fmtTime(row.created_at)}</td>
                        <td className="t-ago">{timeAgo(row.created_at)}</td>
                        <td className="t-model">
                          <span className="badge"><span className="b-swatch" style={{ background: color }} />{modelLabel(row.model)}</span>
                          <span className="endpoint">/{row.endpoint}</span>
                        </td>
                        <td className="t-prompt">
                          {row.status === "error" ? (
                            <span className="t-error" title={row.error_message || ""}>ERR · {row.error_message || "—"}</span>
                          ) : row.prompt ? (
                            <span className="t-clip" title={row.prompt}>{row.prompt}</span>
                          ) : (
                            <span className="t-empty">—</span>
                          )}
                        </td>
                        <td className="num cost">${row.cost_estimate.toFixed(3)}</td>
                        <td className="num">{fmtMs(row.time_ms)}</td>
                        <td className="num">{row.total_tokens > 0 ? fmtNum(row.total_tokens) : <span className="t-empty">—</span>}</td>
                        <td className="num">{row.image_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="page-foot">
          <span className="foot-mark" />
          <span>Costs are estimates from per-image pricing. Real billing may differ.</span>
        </footer>
      </main>

      <style jsx>{`
        .usage-shell {
          position: relative;
          min-height: 100vh;
          background: var(--ink-1);
          color: var(--bone);
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        .usage-main {
          padding: 56px 64px 80px 128px; /* extra left for the 64px sidebar rail */
          max-width: 1344px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }

        /* — Header — */
        .head { margin-bottom: 56px; }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--bone-muted);
          margin-bottom: 18px;
        }
        .eyebrow-rule {
          width: 28px;
          height: 1px;
          background: var(--brand);
        }
        .head-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 32px;
          padding-bottom: 28px;
          border-bottom: 1px solid var(--line);
        }
        .page-title {
          font-family: var(--font-display), 'Fraunces', serif;
          font-style: italic;
          font-weight: 300;
          font-size: 96px;
          line-height: 0.85;
          letter-spacing: -0.04em;
          color: var(--bone);
          margin: 0;
        }
        .period-pills { display: inline-flex; align-items: center; gap: 4px; padding-bottom: 4px; }
        :global(.usage-main .pill) {
          background: transparent;
          border: 0;
          padding: 8px 14px;
          color: var(--bone-muted);
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 12px;
          letter-spacing: 0.06em;
          cursor: pointer;
          position: relative;
          transition: color 0.15s ease;
        }
        :global(.usage-main .pill:hover) { color: var(--bone); }
        :global(.usage-main .pill[data-active="true"]) { color: var(--bone); }
        :global(.usage-main .pill[data-active="true"]::after) {
          content: "";
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: -4px;
          height: 1px;
          background: var(--brand);
        }

        /* — Hero — */
        .hero {
          padding: 56px 0 48px;
          border-bottom: 1px solid var(--line);
          margin-bottom: 56px;
        }
        .hero-label {
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--bone-muted);
          margin-bottom: 22px;
        }

        .big-number {
          font-family: var(--font-display), 'Fraunces', serif;
          font-style: italic;
          font-weight: 300;
          font-size: clamp(96px, 14vw, 200px);
          line-height: 0.86;
          letter-spacing: -0.045em;
          color: var(--bone);
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 0;
        }
        .ccy {
          font-style: normal;
          font-family: var(--font-mono), monospace;
          font-size: 0.22em;
          color: var(--bone-muted);
          letter-spacing: 0;
          margin-right: 14px;
          transform: translateY(-0.55em);
          font-weight: 400;
        }
        .bn-int { display: inline-block; }
        .bn-dot {
          color: var(--brand);
          margin: 0 -0.04em;
          font-style: normal;
        }
        .bn-dec { color: var(--bone-soft); display: inline-block; }
        .unit {
          font-family: var(--font-mono), monospace;
          font-style: normal;
          font-size: 0.13em;
          letter-spacing: 0.12em;
          color: var(--bone-muted);
          margin-left: 18px;
          align-self: flex-end;
          margin-bottom: 0.18em;
        }
        .bn-skeleton {
          display: inline-block;
          width: 0.7em;
          height: 0.7em;
          border-radius: 4px;
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.4s linear infinite;
          align-self: center;
        }
        @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

        /* Category split — Images vs Agent IA */
        .cat-split {
          margin-top: 32px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .cat-card {
          padding: 16px 18px;
          background: var(--ink-2);
          border: 1px solid var(--line-faint);
          border-radius: 10px;
        }
        .cat-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono), monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--bone-muted);
          margin-bottom: 10px;
        }
        .cat-rule {
          width: 18px;
          height: 1px;
          background: var(--brand);
          display: inline-block;
        }
        .cat-cost {
          font-family: var(--font-display), 'Fraunces', serif;
          font-style: italic;
          font-weight: 300;
          font-size: 28px;
          letter-spacing: -0.025em;
          color: var(--bone);
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .cat-meta {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          color: var(--bone-muted);
          letter-spacing: 0.04em;
        }
        @media (max-width: 768px) {
          .cat-split { grid-template-columns: 1fr; }
        }

        /* Meta line */
        .meta {
          list-style: none; padding: 0; margin: 28px 0 0;
          display: flex; flex-wrap: wrap; gap: 32px;
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .meta li { display: flex; align-items: baseline; gap: 8px; }
        .m-num { color: var(--bone); font-variant-numeric: tabular-nums; }
        .m-lbl { color: var(--bone-muted); text-transform: uppercase; letter-spacing: 0.16em; font-size: 10px; }
        .m-error .m-num { color: var(--ember); }

        /* Sparkline */
        .spark {
          margin-top: 32px;
          height: 56px;
          display: flex;
          align-items: flex-end;
          gap: 3px;
        }
        .spark-bar {
          flex: 1;
          min-width: 4px;
          background: var(--bone-faint);
          transition: background 0.15s;
        }
        .spark-bar:hover { background: var(--brand); }

        /* — Section heading — */
        .section { margin-bottom: 80px; }
        .section-head {
          display: flex;
          align-items: baseline;
          gap: 20px;
          padding-bottom: 16px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--line);
        }
        .section-num {
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          color: var(--brand);
        }
        .section-title {
          font-family: var(--font-display), serif;
          font-style: italic;
          font-weight: 400;
          font-size: 28px;
          letter-spacing: -0.015em;
          color: var(--bone);
          margin: 0;
        }
        .section-meta {
          margin-left: auto;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          color: var(--bone-muted);
          letter-spacing: 0.06em;
        }

        /* — By model rows — */
        .model-list { display: flex; flex-direction: column; }
        .model-row {
          display: grid;
          grid-template-columns: 220px 1fr 90px 90px 90px;
          align-items: center;
          gap: 24px;
          padding: 18px 0;
          border-bottom: 1px solid var(--line-faint);
          transition: background 0.1s ease;
        }
        .model-row:last-child { border-bottom: 0; }
        .model-row:hover { background: rgba(255, 255, 255, 0.012); }
        .m-name { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .m-swatch { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .m-label { font-size: 14px; color: var(--bone); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .m-prov {
          font-family: var(--font-mono), monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--bone-faint);
        }
        .m-bar {
          height: 1px;
          background: var(--line);
          position: relative;
          overflow: visible;
        }
        .m-bar-fill {
          position: absolute;
          left: 0;
          top: -1px;
          height: 3px;
          opacity: 0.85;
          animation: barIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes barIn { from { width: 0 !important; } }
        .m-num {
          font-family: var(--font-mono), monospace;
          font-size: 13px;
          text-align: right;
          color: var(--bone-soft);
          font-variant-numeric: tabular-nums;
        }
        .m-num.cost { color: var(--bone); }
        .m-num-tag { color: var(--bone-faint); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }

        /* — Log table — */
        .log-wrap { width: 100%; overflow-x: auto; }
        .log-table {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-mono), monospace;
          font-size: 12px;
        }
        .log-table thead th {
          text-align: left;
          padding: 12px;
          font-weight: 400;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--bone-muted);
          border-bottom: 1px solid var(--line);
          white-space: nowrap;
        }
        .log-table thead th.num { text-align: right; }
        .log-table tbody td {
          padding: 12px;
          border-bottom: 1px solid var(--line-faint);
          color: var(--bone-soft);
          vertical-align: middle;
        }
        .log-table tbody tr { transition: background 0.08s; }
        .log-table tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
        .t-time { color: var(--bone-soft); width: 110px; white-space: nowrap; }
        .t-ago { color: var(--bone-muted); font-size: 10px; width: 56px; text-align: right; }
        .t-model { white-space: nowrap; }
        .badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 9px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--line);
          font-size: 11px;
          letter-spacing: 0.02em;
        }
        .b-swatch { width: 5px; height: 5px; border-radius: 50%; }
        .endpoint { color: var(--bone-faint); margin-left: 8px; font-size: 10px; }
        .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .num.cost { color: var(--bone); }
        .t-prompt { color: var(--bone-soft); max-width: 380px; }
        .t-clip {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .t-empty { color: var(--bone-faint); }
        .t-error { color: var(--ember); font-size: 11px; }

        /* — Empty state — */
        .empty {
          padding: 60px 24px;
          text-align: center;
          border: 1px dashed var(--line-faint);
          color: var(--bone-muted);
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          letter-spacing: 0.1em;
        }

        /* — Footer note — */
        .page-foot {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-top: 24px;
          border-top: 1px solid var(--line-faint);
          font-family: var(--font-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--bone-faint);
          text-transform: uppercase;
        }
        .foot-mark {
          width: 4px; height: 4px; border-radius: 50%;
          background: var(--brand);
        }

        /* — Responsive — */
        @media (max-width: 1024px) {
          .usage-main { padding: 40px 32px 64px 96px; }
          .head-row { flex-direction: column; align-items: flex-start; gap: 24px; }
          .page-title { font-size: 64px; }
          .model-row { grid-template-columns: 1fr; gap: 8px; }
          .m-bar { display: none; }
          .meta { gap: 20px; }
        }
      `}</style>
    </div>
  );
}

export default function UsageView() {
  // ReactFlowProvider lets the shared <Sidebar /> mount safely on this page.
  return (
    <ReactFlowProvider>
      <UsageInner />
    </ReactFlowProvider>
  );
}
