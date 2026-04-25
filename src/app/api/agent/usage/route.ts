import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Sum = { c: number };

function sum(query: string): number {
  const row = getDb().prepare(query).get() as Sum;
  return row?.c ?? 0;
}

export async function GET() {
  const messagesToday = sum(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM messages WHERE date(created_at) = date('now')",
  );
  const messagesMonth = sum(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM messages WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
  );
  const generationsToday = sum(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM generations_log WHERE date(created_at) = date('now')",
  );
  const generationsMonth = sum(
    "SELECT COALESCE(SUM(cost_estimate), 0) AS c FROM generations_log WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
  );

  return NextResponse.json({
    today: {
      total: messagesToday + generationsToday,
      messages: messagesToday,
      generations: generationsToday,
    },
    month: {
      total: messagesMonth + generationsMonth,
      messages: messagesMonth,
      generations: generationsMonth,
    },
  });
}
