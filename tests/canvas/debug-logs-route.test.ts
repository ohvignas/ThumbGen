import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/debug-logs/route";
import { debugLog, resetDebugLogs } from "@/lib/debug-log";

beforeEach(() => {
  resetDebugLogs();
});

describe("GET /api/debug-logs", () => {
  it("returns the server ring buffer for one project", async () => {
    debugLog("agent", "tool start", { name: "apply_workflow", projectId: "proj-1" });
    debugLog("generate", "start", { projectId: "proj-2", model: "openai" });
    const res = await GET(new NextRequest("http://localhost/api/debug-logs?projectId=proj-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ message: string; data?: { projectId?: string } }> };
    expect(body.entries.map((entry) => entry.message)).toEqual(["tool start"]);
    expect(body.entries[0].data?.projectId).toBe("proj-1");
  });
});
