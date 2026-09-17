import { isToolUIPart, type UIMessage } from "ai";
import { clientToolNameOfPartType } from "@/lib/agent/client-tools";

/**
 * A narrower version of ai's own `lastAssistantMessageIsCompleteWithToolCalls`
 * (same step-scoping logic, copied from `node_modules/ai/dist/index.js`),
 * additionally requiring the last step's completed tool calls to include one
 * of the actual human-in-the-loop client tools. `lastAssistantMessageIsCompleteWithToolCalls`
 * fires for ANY completed tool call in the last step — including a SERVER
 * tool (list_logos, search_youtube, ...) whose completion just happens to
 * coincide with route-handler.ts's « Étapes max » cap (the `agentMaxSteps`
 * setting). In that case, auto-continuation would resubmit, the server's
 * tool-continuation branch would find no client-tool part to resolve,
 * persist nothing, and re-run `streamText` for up to `agentMaxSteps` more
 * steps — repeating until the model happens to end a turn on plain text,
 * with no user-visible cap and real API cost. Scoping this to the specific
 * tools `PendingUiAction` actually resolves makes auto-continuation fire
 * only for the case it exists for.
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
    lastStepToolInvocations.some((part) => clientToolNameOfPartType(part.type) !== null) &&
    lastStepToolInvocations.every((part) => part.state === "output-available" || part.state === "output-error")
  );
}
