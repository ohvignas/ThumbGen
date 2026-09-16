import { NextResponse } from "next/server";
import { getStorageStats } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getStorageStats());
  } catch (err) {
    console.error("Storage stats error:", err);
    return NextResponse.json({ error: "Lecture des statistiques impossible" }, { status: 500 });
  }
}
