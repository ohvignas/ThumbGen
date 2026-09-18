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

async function play(
  answer: (input: Record<string, unknown>) => unknown,
  { canvas = { nodes: [], edges: [] }, system }: { canvas?: unknown; system?: string } = {},
): Promise<Call[]> {
  const calls: Call[] = [];
  const messages: ModelMessage[] = [{ role: "user", content: "Aide-moi à construire la miniature de ma vidéo." }];
  const tools = {
    read_skill: tool({ inputSchema: z.object({ name: z.string() }), execute: async () => "skill body" }),
    ask_user: tool({ inputSchema: askUserInputSchema }),
    update_brief: tool({ inputSchema: z.looseObject({}), execute: async () => "Fiche enregistrée." }),
    finish_turn: tool({ inputSchema: finishTurnInputSchema, execute: async () => ({ ok: true }) }),
  };
  for (let turn = 0; turn < 8; turn++) {
    const result = streamText({
      model: createFakeAgentModel({ chunkDelayMs: 0, scenario: FAKE_JOURNEY_SCENARIO, personas: () => [] }),
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
    if (last.toolName === "ask_user") {
      const toolCallId = (response.messages.at(-1)!.content as Array<{ type: string; toolCallId: string }>).find((c) => c.type === "tool-call")!.toolCallId;
      messages.push({
        role: "tool",
        content: [{ type: "tool-result", toolCallId, toolName: "ask_user", output: { type: "json", value: answer(last.input) as never } }],
      });
      continue;
    }
    const toolCallId = (response.messages.at(-1)!.content as Array<{ type: string; toolCallId: string }>).find((c) => c.type === "tool-call")!.toolCallId;
    messages.push({
      role: "tool",
      content: [{ type: "tool-result", toolCallId, toolName: last.toolName, output: { type: "text", value: "ok" } }],
    });
  }
  throw new Error("the fake conversation never finished");
}

afterEach(() => vi.unstubAllEnvs());

describe("fake agent — free conversation", () => {
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

  it("loads a skill, asks once, writes the fiche, finishes — never sketches", async () => {
    const calls = await play((input) => (input.options as unknown[]).length === 0 ? { other: "Une vidéo sur les miniatures YouTube" } : { skipped: true });
    expect(calls.map((c) => c.toolName)).toEqual(["read_skill", "ask_user", "update_brief", "finish_turn"]);
    expect(calls[0].input).toEqual({ name: "thumbnail-packaging" });
    expect(calls[1].input.step).toBeUndefined();
    expect(askUserInputSchema.safeParse(calls[1].input).success).toBe(true);
    const brief = applyBriefUpdate(emptyBrief(), briefUpdateInputSchema.parse(calls[2].input), "2026-09-17T10:00:00.000Z");
    expect(brief.ok).toBe(true);
    if (brief.ok) expect(brief.brief.video.subject).toBe("Une vidéo sur les miniatures YouTube");
    expect(calls.some((c) => /generate_sketch|trigger|generation/.test(c.toolName))).toBe(false);
  });

  it("runs under the real system prompt", async () => {
    const system = buildSystemMessages({ nodes: [], edges: [] }, "proj_fake")
      .map((block) => block.text)
      .join("\n\n");
    expect(system).toContain("SKILLS");
    const calls = await play(() => ({ skipped: true }), { system });
    expect(calls[0].toolName).toBe("read_skill");
    expect(calls.at(-1)!.toolName).toBe("finish_turn");
  });

  it("does not restart a wizard when a brief already exists", async () => {
    const calls = await play(() => ({ skipped: true }), {
      system: SYSTEM({ nodes: [{ id: "iv-prompt", type: "prompt" }], edges: [] }, '\n\n<thumbnail_brief>\n{"video":{"promise":"Savoir cliquer"}}\n</thumbnail_brief>'),
    });
    expect(calls.map((c) => c.toolName)).toEqual(["finish_turn"]);
  });
});
