import { NextRequest, NextResponse } from "next/server";
import { getTotals, getByModel, getRecentLog, getDailySeries, Period } from "@/lib/generations-log";
import { getAgentTotals, getAgentDailySeries } from "@/lib/agent-usage";

const VALID: Period[] = ["today", "7d", "30d", "all"];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("period") || "all";
  const period: Period = (VALID as string[]).includes(raw) ? (raw as Period) : "all";
  const totals = getTotals(period);
  const byModel = getByModel(period);
  const log = getRecentLog(period, 200);
  const daily = getDailySeries(period);
  const agentTotals = getAgentTotals(period);
  const agentDaily = getAgentDailySeries(period);
  return NextResponse.json({
    period,
    totals,
    byModel,
    log,
    daily,
    agentTotals,
    agentDaily,
  });
}
