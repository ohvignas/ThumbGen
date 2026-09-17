import { describe, it, expect, afterEach, vi } from "vitest";
import { hasToolCall, isStepCount, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { askUserInputSchema } from "@/lib/agent/browser-tools/ask-user";
import { finishTurnInputSchema } from "@/lib/agent/finish-turn";
import { FAKE_INTERVIEW_SCENARIO, createFakeAgentModel, fakeAgentScenario, isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import { resolveAgentLanguageModel } from "@/lib/agent/v2/agent-model";
import { setSetting } from "@/lib/settings";

const SYSTEM = (canvas: unknown) =>
  `<project_id>proj_fake</project_id>\n\n<canvas_state>\n${JSON.stringify(canvas, null, 2)}\n</canvas_state>`;

type Call = { toolName: string; input: Record<string, unknown> };

/** Plays the interview like the chat does: each ask_user pauses the turn, the "user" answers, the turn resumes. */
async function playInterview(
  canvas: unknown,
  answer: (input: Record<string, unknown>) => unknown,
  library = [{ id: "sf-1", title: "Réf 1" }],
): Promise<Call[]> {
  const calls: Call[] = [];
  const messages: ModelMessage[] = [{ role: "user", content: "Aide-moi à construire la miniature de ma vidéo." }];
  const tools = {
    ask_user: tool({ inputSchema: askUserInputSchema }),
    place_node: tool({ inputSchema: z.looseObject({ node: z.looseObject({ id: z.string() }) }), execute: async ({ node }) => `node id: ${node.id}` }),
    apply_workflow: tool({ inputSchema: z.looseObject({ project_id: z.string() }), execute: async () => "Applied" }),
    finish_turn: tool({ inputSchema: finishTurnInputSchema, execute: async () => ({ ok: true }) }),
  };
  for (let turn = 0; turn < 10; turn++) {
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 0, scenario: FAKE_INTERVIEW_SCENARIO, library: () => library }),
      system: SYSTEM(canvas),
      messages,
      tools,
      stopWhen: [isStepCount(10), hasToolCall("finish_turn")],
    });
    for await (const chunk of result.toUIMessageStream()) {
      if (chunk.type === "tool-input-available") calls.push({ toolName: chunk.toolName, input: chunk.input as Record<string, unknown> });
    }
    const response = await result.response;
    messages.push(...(response.messages as ModelMessage[]));
    const last = calls.at(-1)!;
    if (last.toolName === "finish_turn") return calls;
    expect(last.toolName).toBe("ask_user");
    const toolCallId = (response.messages.at(-1)!.content as Array<{ type: string; toolCallId: string }>).find((c) => c.type === "tool-call")!.toolCallId;
    messages.push({
      role: "tool",
      content: [{ type: "tool-result", toolCallId, toolName: "ask_user", output: { type: "json", value: answer(last.input) as never } }],
    });
  }
  throw new Error("the interview never finished");
}

afterEach(() => vi.unstubAllEnvs());

// F2 interview (step 8) — replaced by the « journey » scenario in Task 11 of the F3a plan.
describe.skip("fake agent — interview scenario", () => {
  it("is selected by THUMBGEN_FAKE_AGENT=interview only", () => {
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "interview");
    expect(fakeAgentScenario()).toBe("interview");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "1");
    expect(fakeAgentScenario()).toBe("slow");
  });

  it("stays impossible in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "interview");
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    expect(isFakeAgentEnabled()).toBe(false);
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")).toBeNull();
    if (previousKey !== undefined) process.env.OPENROUTER_API_KEY = previousKey;
  });

  it("asks, places nodes after answers and ends on a generate action, never generating", async () => {
    const calls = await playInterview({ nodes: [], edges: [] }, (input) => ({
      selected: [(input.options as Array<{ id: string }>)[0].id],
    }));
    expect(calls.map((c) => c.toolName)).toEqual([
      "ask_user",
      "ask_user",
      "place_node",
      "ask_user",
      "place_node",
      "ask_user",
      "place_node",
      "finish_turn",
    ]);
    const asks = calls.filter((c) => c.toolName === "ask_user").map((c) => c.input);
    expect(asks.map((a) => a.step)).toEqual([1, 2, 4, 8]);
    for (const ask of asks) expect(askUserInputSchema.safeParse(ask).success).toBe(true);
    expect(asks[2]).toMatchObject({ multiple: true, options: [{ id: "sf-1", image: "stored:sf_sf-1" }] });
    expect(calls.filter((c) => c.toolName === "place_node").map((c) => (c.input.node as { id: string }).id)).toEqual([
      "iv-prompt",
      "iv-ref-1",
      "iv-generator",
    ]);
    expect(calls.find((c) => c.toolName === "place_node" && (c.input.node as { id: string }).id === "iv-ref-1")!.input.node).toMatchObject({
      data: { image_source: "stored:sf_sf-1" },
    });
    expect(calls.at(-1)!.input.next_actions).toEqual([{ kind: "generate", node_id: "iv-generator" }]);
    expect(calls.some((c) => /generate_sketch|trigger|generation/.test(c.toolName))).toBe(false);
  });

  it("skips the references question without a library", async () => {
    const calls = await playInterview({ nodes: [], edges: [] }, (input) => ({ selected: [(input.options as Array<{ id: string }>)[0].id] }), []);
    expect(calls.filter((c) => c.toolName === "ask_user").map((c) => c.input.step)).toEqual([1, 2, 8]);
  });

  it("asks to resume or restart when interview nodes exist, and restarts with apply_workflow on request", async () => {
    const canvas = { nodes: [{ id: "iv-prompt", type: "prompt" }, { id: "user-1", type: "prompt" }], edges: [] };
    const calls = await playInterview(canvas, (input) =>
      input.step === 1 && (input.options as Array<{ id: string }>).some((o) => o.id === "restart")
        ? { selected: ["restart"] }
        : { skipped: true },
    );
    expect(calls[0].input).toMatchObject({ step: 1, options: [{ id: "resume" }, { id: "restart" }] });
    expect(calls[1]).toEqual({ toolName: "apply_workflow", input: { project_id: "proj_fake", blueprint: { nodes: [], edges: [] }, remove_node_ids: ["iv-prompt"] } });
    expect(calls[2]).toMatchObject({ toolName: "ask_user", input: { step: 1, question: "De quoi parle la vidéo ?" } });
  });

  it("resumes without touching anything when asked to", async () => {
    const canvas = { nodes: [{ id: "iv-prompt", type: "prompt" }], edges: [] };
    const calls = await playInterview(canvas, () => ({ selected: ["resume"] }));
    expect(calls.map((c) => c.toolName)).toEqual(["ask_user", "finish_turn"]);
  });
});
