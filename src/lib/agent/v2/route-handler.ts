import { NextRequest } from "next/server";
import { streamText, isStepCount } from "ai";
import { getOpenRouterProvider } from "./openrouter-provider";
import { buildAiSdkTools } from "./tool-adapter";
import { V2_CLIENT_TOOLS } from "./browser-client-tools";
import { webSearchProviderOptions } from "./web-search-tool";
import { persistAssistantTurn } from "./persist-turn";
import { buildSystemMessages } from "@/lib/agent/system-prompt";
import { appendMessage, listMessages } from "@/lib/agent/conversation/store";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";
import { getSetting } from "@/lib/settings";
import { getModelById, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";

const MAX_STEPS = 25;

export async function postV2(req: NextRequest): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | {
        conversation_id?: string;
        project_id?: string;
        message?: { text?: string; attachments?: Array<{ type: "image"; source: string }> };
        canvas_snapshot?: unknown;
      }
    | null;

  if (!body?.conversation_id || !body?.project_id) {
    return new Response("Missing conversation_id or project_id", { status: 400 });
  }

  const provider = getOpenRouterProvider();
  if (!provider) {
    return new Response(
      "Clé OpenRouter non configurée. Ajoute OPENROUTER_API_KEY dans Settings.",
      { status: 400 },
    );
  }

  const modelId = getSetting("agentModel") || DEFAULT_AGENT_MODEL;
  const modelInfo = getModelById(modelId);
  const conversationId = body.conversation_id;

  const userParts: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  > = [];
  if (body.message?.text) userParts.push({ type: "text", text: body.message.text });
  for (const a of body.message?.attachments ?? []) {
    if (a.type !== "image") continue;
    const img = await resolveImageSource(a.source);
    userParts.push({ type: "file", mediaType: img.mimeType, data: img.bytes.toString("base64") });
  }

  appendMessage({
    conversation_id: conversationId,
    role: "user",
    content_json: JSON.stringify([{ role: "user", content: userParts }]),
    interrupted: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    cost_estimate: 0,
  });

  // Every prior row is assumed to already be ModelMessage-shaped — true once
  // scripts/migrate-chat-messages-to-uimessage.ts has run for real (Plan 2's
  // cutover sequencing: migrate, THEN flip THUMBGEN_AGENT_V2, THEN swap the
  // frontend — never true for a conversation continued under v2 before that
  // migration runs, which the cutover sequencing exists specifically to
  // prevent).
  const priorMessages = listMessages(conversationId)
    .slice(0, -1)
    .flatMap((m) => JSON.parse(m.content_json));

  const systemBlocks = buildSystemMessages(body.canvas_snapshot, body.project_id);
  const systemText = systemBlocks.map((b) => b.text).join("\n\n");

  const result = streamText({
    model: provider(modelId),
    system: systemText,
    messages: [...priorMessages, { role: "user", content: userParts }],
    tools: { ...buildAiSdkTools(), ...V2_CLIENT_TOOLS },
    stopWhen: isStepCount(MAX_STEPS),
    // v1 checks abort only at the outer-iteration and token-streaming
    // boundaries, never inside the per-tool-call dispatch loop — a Stop
    // click lets any tool calls already in flight for the current batch
    // finish before the next iteration notices. Passing the request's own
    // signal here reproduces that same "finish current batch, then stop"
    // granularity as the starting point (whatever AI SDK's own abortSignal
    // handling does internally), not a tightened version — see spec §6.1.
    abortSignal: req.signal,
    providerOptions: {
      openrouter: {
        ...(modelInfo?.supportsThinking ? { reasoning: { effort: "medium" as const } } : {}),
        ...webSearchProviderOptions(),
      },
    },
    onFinish: async ({ response, totalUsage, finishReason }) => {
      persistAssistantTurn({
        conversationId,
        responseMessages: response.messages,
        totalUsage,
        finishReason,
        modelInfo,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
