import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

beforeEach(() => {
  // Clean both tables to keep totals deterministic
  getDb().exec("DELETE FROM messages");
  getDb().exec("DELETE FROM generations_log");
});

describe("GET /api/agent/usage", () => {
  it("returns zeros when nothing has happened", async () => {
    const { GET } = await import("@/app/api/agent/usage/route");
    const res = await GET();
    const body = await res.json();
    expect(body.today.total).toBe(0);
    expect(body.month.total).toBe(0);
  });

  it("sums message costs and generation costs", async () => {
    // Need a conversation row first because messages.conversation_id is FK-ish
    const convId = uuid();
    getDb()
      .prepare("INSERT INTO conversations (id, project_id, title) VALUES (?, ?, ?)")
      .run(convId, "p", "test");

    // Two messages today
    for (const cost of [0.05, 0.10]) {
      getDb()
        .prepare(
          "INSERT INTO messages (id, conversation_id, role, content_json, cost_estimate) VALUES (?, ?, ?, ?, ?)",
        )
        .run(uuid(), convId, "assistant", "[]", cost);
    }
    // One generation today
    getDb()
      .prepare(
        "INSERT INTO generations_log (id, provider, model, endpoint, cost_estimate) VALUES (?, ?, ?, ?, ?)",
      )
      .run(uuid(), "gemini", "x", "generate", 0.20);

    const { GET } = await import("@/app/api/agent/usage/route");
    const res = await GET();
    const body = await res.json();

    expect(body.today.messages).toBeCloseTo(0.15, 4);
    expect(body.today.generations).toBeCloseTo(0.20, 4);
    expect(body.today.total).toBeCloseTo(0.35, 4);
    expect(body.month.total).toBeCloseTo(0.35, 4);
  });
});
