import { isToolUIPart, type UIMessage } from "ai";

// The two client tools PendingUiAction.tsx ever resolves — matches
// route-handler.ts's V2_CLIENT_TOOLS (request_user_sketch is registered
// there too even though nothing currently prompts the model to call it,
// same as v1).
const CLIENT_TOOL_PART_TYPES = new Set(["tool-request_user_image", "tool-request_user_sketch"]);

/**
 * A narrower version of ai's own `lastAssistantMessageIsCompleteWithToolCalls`
 * (same step-scoping logic, copied from `node_modules/ai/dist/index.js`),
 * additionally requiring the last step's completed tool calls to include one
 * of the actual human-in-the-loop client tools. `lastAssistantMessageIsCompleteWithToolCalls`
 * fires for ANY completed tool call in the last step — including a SERVER
 * tool (list_logos, search_youtube, ...) whose completion just happens to
 * coincide with route-handler.ts's `MAX_STEPS` cap. In that case,
 * auto-continuation would resubmit, the server's tool-continuation branch
 * would find no client-tool part to resolve, persist nothing, and re-run
 * `streamText` for up to MAX_STEPS more steps — repeating until the model
 * happens to end a turn on plain text, with no user-visible cap and real
 * API cost. Scoping this to the specific tools `PendingUiAction` actually
 * resolves makes auto-continuation fire only for the case it exists for.
 */
export function lastAssistantMessageIsCompleteWithClientToolCalls({ messages }: { messages: UIMessage[] }): boolean {
  const message = messages[messages.length - 1];
  if (!message || message.role !== "assistant") return false;
  const lastStepStartIndex = message.parts.reduce(
    (lastIndex, part, index) => (part.type === "step-start" ? index : lastIndex),
    -1,
  );
  const lastStepToolInvocations = message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart)
    .filter((part) => !part.providerExecuted);
  return (
    lastStepToolInvocations.some((part) => CLIENT_TOOL_PART_TYPES.has(part.type)) &&
    lastStepToolInvocations.every((part) => part.state === "output-available" || part.state === "output-error")
  );
}
