import { describe, it, expect, beforeAll, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
// Mock it before importing any tool that depends on it.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(async () => []),
  },
}));

import { ensureMcpApiKey } from "@/lib/settings";

// Import the route handlers (note: Next.js handlers are just async functions)
import { POST } from "@/app/api/mcp/route";

function makeReq(opts: {
  method?: string;
  body?: unknown;
  authToken?: string;
  origin?: string;
  contentType?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": opts.contentType ?? "application/json",
    accept: "application/json, text/event-stream",
  };
  if (opts.authToken) headers["authorization"] = `Bearer ${opts.authToken}`;
  if (opts.origin) headers["origin"] = opts.origin;
  return new Request("http://localhost/api/mcp", {
    method: opts.method ?? "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

describe("/api/mcp", () => {
  let key: string;
  beforeAll(() => {
    key = ensureMcpApiKey();
  });

  it("returns 401 without auth", async () => {
    const res = await POST(makeReq({ body: {} }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong bearer", async () => {
    const res = await POST(makeReq({ body: {}, authToken: "tg_wrong" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 with disallowed origin", async () => {
    const res = await POST(makeReq({ body: {}, authToken: key, origin: "https://evil.example.com" }) as never);
    expect(res.status).toBe(403);
  });

  it("accepts a valid initialize request and returns Mcp-Session-Id header", async () => {
    const initBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0" },
      },
    };
    const res = await POST(makeReq({ body: initBody, authToken: key }) as never);
    expect(res.status).toBe(200);
    // The response is either application/json or text/event-stream depending on SDK behavior;
    // either way the session ID should be set.
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
  });

  it("accepts CLI clients without Origin header", async () => {
    const res = await POST(makeReq({
      body: { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "1" } } },
      authToken: key,
      // no origin
    }) as never);
    expect([200, 400]).toContain(res.status);
    // 200 if the transport handles it; 400 if the SDK validates something else (still passing the auth+origin gate is what we test)
  });
});
