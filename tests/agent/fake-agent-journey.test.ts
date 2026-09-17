import { describe, it, expect, afterEach, vi } from "vitest";
import { hasToolCall, isStepCount, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { askUserInputSchema } from "@/lib/agent/browser-tools/ask-user";
import { finishTurnInputSchema } from "@/lib/agent/finish-turn";
import { applyBriefUpdate, briefUpdateInputSchema } from "@/lib/brief/merge";
import { emptyBrief } from "@/lib/brief/schema";
import { FAKE_JOURNEY_SCENARIO, createFakeAgentModel, fakeAgentScenario, isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import { resolveAgentLanguageModel } from "@/lib/agent/v2/agent-model";
import { setSetting } from "@/lib/settings";
import { buildSystemMessages } from "@/lib/agent/system-prompt";

const SYSTEM = (canvas: unknown, brief = "") =>
  `<project_id>proj_fake</project_id>\n\n<canvas_state>\n${JSON.stringify(canvas, null, 2)}\n</canvas_state>${brief}`;

type Call = { toolName: string; input: Record<string, unknown> };
type Options = Array<{ id: string }>;

/** Plays the journey like the chat does: each ask_user pauses the turn, the "user" answers, the turn resumes. */
async function playJourney(
  answer: (input: Record<string, unknown>) => unknown,
  { canvas = { nodes: [], edges: [] }, personas = [{ id: "p1", label: "Antoine" }], system }: { canvas?: unknown; personas?: Array<{ id: string; label: string }>; system?: string } = {},
): Promise<Call[]> {
  const calls: Call[] = [];
  const messages: ModelMessage[] = [{ role: "user", content: "Aide-moi à construire la miniature de ma vidéo." }];
  const tools = {
    ask_user: tool({ inputSchema: askUserInputSchema }),
    update_brief: tool({ inputSchema: z.looseObject({}), execute: async () => "Fiche enregistrée." }),
    place_node: tool({ inputSchema: z.looseObject({ node: z.looseObject({ id: z.string() }) }), execute: async ({ node }) => `node id: ${node.id}` }),
    apply_workflow: tool({ inputSchema: z.looseObject({ project_id: z.string() }), execute: async () => "Applied" }),
    finish_turn: tool({ inputSchema: finishTurnInputSchema, execute: async () => ({ ok: true }) }),
  };
  for (let turn = 0; turn < 12; turn++) {
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 0, scenario: FAKE_JOURNEY_SCENARIO, personas: () => personas }),
      system: system ?? SYSTEM(canvas),
      messages,
      tools,
      stopWhen: [isStepCount(20), hasToolCall("finish_turn")],
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
  throw new Error("the journey never finished");
}

const answers = (packages: string[]) => (input: Record<string, unknown>) => {
  const options = input.options as Options;
  if (options.length === 0) return { other: "Une vidéo sur les miniatures YouTube" };
  if (options.some((option) => option.id === "pkg-a")) return { selected: packages };
  return { selected: [options[0].id] };
};

/** Every update_brief of the scenario, applied in order, must give a valid brief without warnings. */
function foldBrief(calls: Call[]) {
  let brief = emptyBrief();
  for (const call of calls.filter((c) => c.toolName === "update_brief")) {
    const result = applyBriefUpdate(brief, briefUpdateInputSchema.parse(call.input), "2026-09-17T10:00:00.000Z");
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
    brief = result.brief;
  }
  return brief;
}

afterEach(() => vi.unstubAllEnvs());

describe("fake agent — journey scenario", () => {
  it("is selected by THUMBGEN_FAKE_AGENT=journey only", () => {
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "journey");
    expect(fakeAgentScenario()).toBe("journey");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "interview");
    expect(fakeAgentScenario()).toBe("slow");
  });

  it("stays impossible in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("THUMBGEN_FAKE_AGENT", "journey");
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    setSetting("openrouterApiKey", "");
    expect(isFakeAgentEnabled()).toBe(false);
    expect(resolveAgentLanguageModel("anthropic/claude-sonnet-4.6")).toBeNull();
    if (previousKey !== undefined) process.env.OPENROUTER_API_KEY = previousKey;
  });

  it("plays steps 1, 4, 5, 6 then ships an A/B workflow, never sketching nor generating", async () => {
    const calls = await playJourney(answers(["pkg-a", "pkg-b"]));
    expect(calls.map((c) => c.toolName)).toEqual([
      "ask_user",
      "update_brief",
      "ask_user",
      "update_brief",
      "ask_user",
      "update_brief",
      "update_brief",
      "ask_user",
      "update_brief",
      "update_brief",
      "ask_user",
      "update_brief",
      "ask_user",
      "update_brief",
      "apply_workflow",
      "finish_turn",
    ]);
    const asks = calls.filter((c) => c.toolName === "ask_user").map((c) => c.input);
    expect(asks.map((a) => a.step)).toEqual([1, 4, 4, 5, 6, 6]);
    for (const ask of asks) expect(askUserInputSchema.safeParse(ask).success).toBe(true);
    expect(asks[0]).toMatchObject({ options: [], allow_skip: false });
    expect(asks[2]).toMatchObject({ multiple: true, max_selected: 3 });
    expect(asks[3].options).toEqual([
      { id: "p1", label: "Antoine", image: "stored:persona_p1" },
      { id: "none", label: "Aucun" },
    ]);

    const brief = foldBrief(calls);
    expect(brief.step).toBe(7);
    expect(brief.video.subject).toBe("Une vidéo sur les miniatures YouTube");
    expect(brief.abStrategy).toBe("concepts");
    expect(brief.common.persona).toBe("stored:persona_p1");
    expect(brief.variants.map((v) => v.key)).toEqual(["A", "B"]);
    expect(brief.variants.every((v) => v.composition)).toBe(true);

    const workflow = calls.find((c) => c.toolName === "apply_workflow")!.input as {
      blueprint: { nodes: Array<{ id: string; data: Record<string, unknown> }>; edges: Array<{ targetHandle: string }> };
    };
    expect(workflow.blueprint.nodes.find((n) => n.id === "journey-generator")!.data.abTest).toEqual({ variants: ["A", "B"] });
    expect(workflow.blueprint.edges.map((e) => e.targetHandle)).toEqual(["prompt-in", "prompt-in-b"]);
    expect(calls.at(-1)!.input.next_actions).toEqual([{ kind: "generate", node_id: "journey-generator" }]);
    expect(calls.some((c) => /generate_sketch|trigger|generation/.test(c.toolName))).toBe(false);
  });

  it("places one prompt and the generator for a single package, and writes no emotion without a character", async () => {
    const calls = await playJourney(answers(["pkg-c"]), { personas: [] });
    expect(calls.filter((c) => c.toolName === "place_node").map((c) => (c.input.node as { id: string }).id)).toEqual(["iv-prompt", "iv-generator"]);
    expect(calls.at(-1)!.input.next_actions).toEqual([{ kind: "generate", node_id: "iv-generator" }]);
    const brief = foldBrief(calls);
    expect(brief.common.persona).toBe("none");
    expect(brief.variants).toHaveLength(1);
    expect(brief.variants[0].composition?.emotion).toBeUndefined();
  });

  it("asks to resume or restart F2 interview nodes without a brief, and restarts on request", async () => {
    const canvas = { nodes: [{ id: "iv-prompt", type: "prompt" }, { id: "user-1", type: "prompt" }], edges: [] };
    const calls = await playJourney(
      (input) =>
        (input.options as Options).some((o) => o.id === "restart") ? { selected: ["restart"] } : { skipped: true },
      { canvas },
    );
    // The skipped free question then ends the simulated journey.
    const started = calls;
    expect(started[0]).toMatchObject({ toolName: "ask_user", input: { step: 1, options: [{ id: "resume" }, { id: "restart" }] } });
    expect(started[1]).toEqual({
      toolName: "apply_workflow",
      input: { project_id: "proj_fake", blueprint: { nodes: [], edges: [] }, remove_node_ids: ["iv-prompt"] },
    });
    expect(started[2]).toMatchObject({ toolName: "ask_user", input: { step: 1, options: [] } });
  });

  it("starts the journey under the real system prompt, whose static text names <thumbnail_brief>", async () => {
    const system = buildSystemMessages({ nodes: [], edges: [] }, "proj_fake")
      .map((block) => block.text)
      .join("\n\n");
    expect(system).toContain("<thumbnail_brief>");
    const calls = await playJourney(() => ({ skipped: true }), { system });
    expect(calls.map((c) => c.toolName)).toEqual(["ask_user", "finish_turn"]);
    expect(calls[0].input).toMatchObject({ step: 1, options: [] });
  });

  it("does not offer the restart when the conversation already has a brief", async () => {
    const canvas = { nodes: [{ id: "iv-prompt", type: "prompt" }], edges: [] };
    const calls = await playJourney(() => ({ skipped: true }), { system: SYSTEM(canvas, '\n\n<thumbnail_brief>\n{"step":4}\n</thumbnail_brief>') });
    expect(calls.map((c) => c.toolName)).toEqual(["finish_turn"]);
  });
});
