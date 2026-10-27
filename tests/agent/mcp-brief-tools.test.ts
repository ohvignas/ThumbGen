import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));
vi.mock("@/lib/agent/v2/fake-agent-model", () => ({ isFakeAgentEnabled: vi.fn(() => false) }));
vi.mock("@/lib/logos/search", () => ({
  defaultLogoProviders: () => [],
  searchLogos: vi.fn(async () => ({
    results: [
      { key: "simple-icons:claude", source: "simple-icons", name: "Claude", detail: null, variant: "color", previewUrl: "data:image/svg+xml;base64,AAAA", ref: "claude" },
    ],
  })),
}));

import "@/lib/agent/tools/all";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { mcpConversationId } from "@/lib/agent/mcp/brief-tools";
import { getDb } from "@/lib/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

async function client() {
  const server = buildMcpServer();
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const cl = new Client({ name: "t", version: "1" });
  await cl.connect(c);
  return cl;
}

const text = (r: unknown) =>
  ((r as { content: Array<{ type: string; text?: string }> }).content ?? [])
    .flatMap((p) => (p.type === "text" && p.text ? [p.text] : []))
    .join("\n");

let projectId: string;
beforeEach(() => {
  projectId = `proj_mcp_${Math.random().toString(36).slice(2, 10)}`;
  getDb().prepare("INSERT INTO projects_meta (id, name) VALUES (?, ?)").run(projectId, "MCP test");
});

describe("MCP brief tools", () => {
  it("lists the four brief tools with a project_id argument", async () => {
    const { tools } = await (await client()).listTools();
    for (const name of ["find_logos", "add_logo", "find_competitor_thumbnails", "analyze_thumbnails"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeTruthy();
      expect((tool!.inputSchema as { required?: string[] }).required).toContain("project_id");
    }
  });

  it("refuses an unknown project_id", async () => {
    const r = await (await client()).callTool({ name: "find_logos", arguments: { project_id: "proj_nope", names: ["Claude"] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Unknown project_id");
  });

  it("reuses one MCP conversation per project", () => {
    const a = mcpConversationId(projectId);
    expect(a).toBeTruthy();
    expect(mcpConversationId(projectId)).toBe(a);
  });

  it("find_logos stores candidates that add_logo can see on the same project", async () => {
    const cl = await client();
    const found = await cl.callTool({ name: "find_logos", arguments: { project_id: projectId, names: ["Claude"] } });
    expect(found.isError).toBeFalsy();
    const id = text(found).match(/logo-candidate:(\S+)/)?.[1];
    expect(id).toBeTruthy();
    const other = await cl.callTool({ name: "add_logo", arguments: { project_id: projectId, candidate_id: "missing" } });
    expect(other.isError).toBe(true);
  });

  it("analyze_thumbnails without a prior search says so instead of calling a model", async () => {
    const r = await (await client()).callTool({ name: "analyze_thumbnails", arguments: { project_id: projectId, video_ids: ["dQw4w9WgXcQ"] } });
    expect(r.isError).toBe(true);
  });
});
