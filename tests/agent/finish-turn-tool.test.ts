import { describe, it, expect, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { getTool, listTools } from "@/lib/agent/tools";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  FINISH_TURN_TOOL_NAME,
  appendResultId,
  finishTurnInputSchema,
  isVisualResultTool,
  parseFinishTurnInput,
} from "@/lib/agent/finish-turn";

const VALID = {
  summary: "Deux angles prêts : A choc, B duel.",
  results: ["call_a", "call_b"],
  next_actions: [
    { label: "Angle A", kind: "ask_agent", message: "Je choisis l'angle A." },
    { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
  ],
};

const accepts = (input: unknown) => finishTurnInputSchema.safeParse(input).success;

describe("finish_turn input", () => {
  it("accepts a full input and defaults results and next_actions to empty lists", () => {
    expect(accepts(VALID)).toBe(true);
    expect(finishTurnInputSchema.parse({ summary: " Fini. " })).toEqual({ summary: "Fini.", results: [], next_actions: [] });
  });

  it("needs a summary of 1 to 400 characters", () => {
    expect(accepts({})).toBe(false);
    expect(accepts({ summary: "" })).toBe(false);
    expect(accepts({ summary: "   " })).toBe(false);
    expect(accepts({ summary: "x".repeat(400) })).toBe(true);
    expect(accepts({ summary: "x".repeat(401) })).toBe(false);
  });

  it("caps results at 6 ids", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `call_${i}`);
    expect(accepts({ summary: "ok", results: ids(6) })).toBe(true);
    expect(accepts({ summary: "ok", results: ids(7) })).toBe(false);
  });

  it("caps next_actions at 3 and labels at 40 characters", () => {
    const action = (label: string) => ({ label, kind: "ask_agent", message: "Oui." });
    expect(accepts({ summary: "ok", next_actions: [action("a"), action("b"), action("c")] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [action("a"), action("b"), action("c"), action("d")] })).toBe(false);
    expect(accepts({ summary: "ok", next_actions: [action("x".repeat(40))] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [action("x".repeat(41))] })).toBe(false);
  });

  it("needs a message of at most 300 characters for ask_agent", () => {
    expect(accepts({ summary: "ok", next_actions: [{ label: "A", kind: "ask_agent" }] })).toBe(false);
    expect(accepts({ summary: "ok", next_actions: [{ label: "A", kind: "ask_agent", message: "x".repeat(300) }] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [{ label: "A", kind: "ask_agent", message: "x".repeat(301) }] })).toBe(false);
  });

  it("needs a node_id for focus_node and rejects unknown kinds", () => {
    expect(accepts({ summary: "ok", next_actions: [{ label: "Voir", kind: "focus_node" }] })).toBe(false);
    expect(accepts({ summary: "ok", next_actions: [{ label: "Voir", kind: "focus_node", node_id: "gen-1" }] })).toBe(true);
    expect(accepts({ summary: "ok", next_actions: [{ label: "Go", kind: "generate", node_id: "gen-1" }] })).toBe(false);
  });

  it("parses to null instead of throwing", () => {
    expect(parseFinishTurnInput(VALID)?.next_actions).toHaveLength(2);
    expect(parseFinishTurnInput({ summary: "" })).toBeNull();
    expect(parseFinishTurnInput(undefined)).toBeNull();
  });
});

describe("finish_turn tool", () => {
  it("is registered as a chat-only tool without side effect that answers {ok:true}", async () => {
    const tool = getTool(FINISH_TURN_TOOL_NAME);
    expect(tool?.chatOnly).toBe(true);
    const result = await tool!.handler(finishTurnInputSchema.parse(VALID));
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ ok: true });
  });

  it("is one of the chat-only tools", () => {
    expect(listTools().filter((tool) => tool.chatOnly).map((tool) => tool.name).sort()).toEqual(
      [FINISH_TURN_TOOL_NAME, "list_followed_videos"].sort(),
    );
  });

  it("is not listed to MCP clients, unlike the other registry tools", async () => {
    const server = buildMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("list_logos");
    expect(names).toContain("generate_sketch");
    expect(names).not.toContain(FINISH_TURN_TOOL_NAME);
  });
});

describe("result ids", () => {
  const ok = { content: [{ type: "text" as const, text: "Sketch generated." }, { type: "image" as const, mimeType: "image/png", data: "AAA=" }] };

  it("knows the three visual tools", () => {
    expect(["generate_sketch", "import_youtube_thumbnail", "search_youtube"].every(isVisualResultTool)).toBe(true);
    expect(isVisualResultTool("apply_workflow")).toBe(false);
  });

  it("appends a result_id line to a successful visual output only", () => {
    expect(appendResultId("generate_sketch", ok, "call_1").content.at(-1)).toEqual({ type: "text", text: "result_id: call_1" });
    expect(appendResultId("apply_workflow", ok, "call_1")).toBe(ok);
    const failed = { isError: true, content: [{ type: "text" as const, text: "OpenRouter API error 500" }] };
    expect(appendResultId("generate_sketch", failed, "call_1")).toBe(failed);
  });
});
