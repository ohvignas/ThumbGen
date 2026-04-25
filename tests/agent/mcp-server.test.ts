import { describe, it, expect, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
// Mock it before importing any tool that depends on it.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(async () => []),
  },
}));

import "@/lib/agent/tools/all"; // populate registry first
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("MCP server (in-memory)", () => {
  async function connectPair() {
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
    return { server, client };
  }

  it("lists all 11 tools from the registry", async () => {
    const { client } = await connectPair();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    [
      "list_logos",
      "list_face_reactions",
      "list_swipe_files",
      "list_projects",
      "list_past_generations",
      "get_canvas_state",
      "apply_workflow",
      "generate_sketch",
      "extract_youtube_script",
      "search_youtube_channel",
      "get_channel_videos",
    ].forEach((n) => expect(names).toContain(n));
  });

  it("calls list_logos through the transport (returns text content)", async () => {
    const { client } = await connectPair();
    const r = await client.callTool({ name: "list_logos", arguments: {} });
    expect(Array.isArray(r.content)).toBe(true);
    const first = (r.content as { type: string; text?: string }[])[0];
    expect(first.type).toBe("text");
    expect(typeof first.text).toBe("string");
  });

  it("rejects unknown tools", async () => {
    const { client } = await connectPair();
    // The MCP SDK returns isError:true with an error message rather than rejecting
    // the promise for unknown tools (it's an MCP protocol-level error response).
    const result = await client.callTool({ name: "does_not_exist", arguments: {} });
    expect((result as { isError?: boolean }).isError).toBe(true);
    const first = (result.content as { type: string; text?: string }[])[0];
    expect(first.type).toBe("text");
    expect(first.text).toMatch(/does_not_exist/);
  });
});

describe("getInMemoryMcpClient (caching)", () => {
  it("returns the same client instance on repeated calls", async () => {
    const { getInMemoryMcpClient } = await import("@/lib/agent/mcp/in-memory-client");
    const a = await getInMemoryMcpClient();
    const b = await getInMemoryMcpClient();
    expect(a).toBe(b);
  });

  it("client can list tools end-to-end", async () => {
    const { getInMemoryMcpClient } = await import("@/lib/agent/mcp/in-memory-client");
    const c = await getInMemoryMcpClient();
    const { tools } = await c.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(11);
  });
});
