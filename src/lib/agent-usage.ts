import { getDb } from "./db";

export type Period = "today" | "7d" | "30d" | "all";

function periodClause(period: Period): string {
  switch (period) {
    case "today":
      return "WHERE date(created_at) = date('now')";
    case "7d":
      return "WHERE created_at >= datetime('now', '-7 days')";
    case "30d":
      return "WHERE created_at >= datetime('now', '-30 days')";
    case "all":
    default:
      return "";
  }
}

export type AgentTotals = {
  totalCost: number;
  totalMessages: number;
  totalConversations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
};

export function getAgentTotals(period: Period): AgentTotals {
  const where = periodClause(period);
  const row = getDb()
    .prepare(`
      SELECT
        COALESCE(SUM(cost_estimate), 0)        AS totalCost,
        COUNT(*)                               AS totalMessages,
        COUNT(DISTINCT conversation_id)        AS totalConversations,
        COALESCE(SUM(total_input_tokens), 0)   AS totalInputTokens,
        COALESCE(SUM(total_output_tokens), 0)  AS totalOutputTokens,
        COALESCE(SUM(total_input_tokens + total_output_tokens), 0) AS totalTokens
      FROM messages
      ${where}
    `)
    .get() as AgentTotals;
  return row;
}

export type AgentDailyPoint = { day: string; cost: number; messages: number };

export function getAgentDailySeries(period: Period): AgentDailyPoint[] {
  const where = periodClause(period);
  return getDb()
    .prepare(`
      SELECT
        date(created_at)                AS day,
        COALESCE(SUM(cost_estimate), 0) AS cost,
        COUNT(*)                        AS messages
      FROM messages
      ${where}
      GROUP BY day
      ORDER BY day ASC
    `)
    .all() as AgentDailyPoint[];
}
