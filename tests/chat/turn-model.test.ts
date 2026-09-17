import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
  INTERRUPTED_TURN_ERROR,
  currentStepLabel,
  emptyAssistantTurn,
  formatElapsed,
  formatTurnDuration,
  isBusyStatus,
  splitAssistantTurn,
  toolStatus,
  turnDisplay,
  turnHeaderLabel,
  type ToolPart,
} from "@/components/panels/chat/turn-model";

const PNG = "iVBORw0KGgo=";

function assistant(parts: unknown[], metadata?: unknown): UIMessage {
  return { id: "a1", role: "assistant", parts, ...(metadata === undefined ? {} : { metadata }) } as unknown as UIMessage;
}

const text = (value: string) => ({ type: "text", text: value });

const tool = (name: string, toolCallId: string, extra: Record<string, unknown> = {}) => ({
  type: `tool-${name}`,
  toolCallId,
  state: "output-available",
  input: {},
  output: { content: [{ type: "text", text: "ok" }] },
  ...extra,
});

const sketch = (toolCallId: string) =>
  tool("generate_sketch", toolCallId, {
    input: { prompt: toolCallId },
    output: {
      content: [
        { type: "text", text: `Sketch generated. Reference: generated:sk_${toolCallId}` },
        { type: "image", mimeType: "image/png", data: PNG },
        { type: "text", text: `result_id: ${toolCallId}` },
      ],
    },
  });

const finish = (input: unknown) => tool("finish_turn", "fin", { input, output: { content: [{ type: "text", text: '{"ok":true}' }] } });

const ids = (parts: ToolPart[]) => parts.map((part) => part.toolCallId);

const stepNames = (message: UIMessage) =>
  splitAssistantTurn(message).steps.map((step) => (step.kind === "tool" ? `tool:${step.toolName}` : `${step.kind}:${step.text}`));

describe("splitAssistantTurn with finish_turn", () => {
  const message = assistant([
    { type: "step-start" },
    { type: "reasoning", text: "Je réfléchis." },
    text("Je dessine deux croquis."),
    sketch("c1"),
    sketch("c2"),
    tool("apply_workflow", "c3"),
    { type: "step-start" },
    finish({
      summary: "Deux angles prêts.",
      results: ["c2", "c1", "c2", "inconnu", "c3"],
      next_actions: [
        { label: "Angle A", kind: "ask_agent", message: "Je choisis l'angle A." },
        { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
      ],
    }),
  ]);

  it("answers with the summary and keeps finish_turn out of the steps", () => {
    const turn = splitAssistantTurn(message);
    expect(turn.hasFinishTurn).toBe(true);
    expect(turn.answer).toBe("Deux angles prêts.");
    expect(stepNames(message)).toEqual([
      "reasoning:Je réfléchis.",
      "text:Je dessine deux croquis.",
      "tool:generate_sketch",
      "tool:generate_sketch",
      "tool:apply_workflow",
    ]);
    expect(turn.stepCount).toBe(5);
  });

  it("shows the listed visual results in order, once, ignoring unknown and non-visual ids", () => {
    const turn = splitAssistantTurn(message);
    expect(ids(turn.results)).toEqual(["c2", "c1"]);
    expect(turn.steps.flatMap((step) => (step.kind === "tool" ? [step.shownInResults] : []))).toEqual([true, true, false]);
  });

  it("maps next actions", () => {
    expect(splitAssistantTurn(message).nextActions).toEqual([
      { kind: "ask_agent", label: "Angle A", message: "Je choisis l'angle A." },
      { kind: "focus_node", label: "Voir le générateur", nodeId: "gen-1" },
    ]);
  });

  it("keeps every text as a step", () => {
    const turn = splitAssistantTurn(assistant([tool("get_canvas_state", "c1"), text("Voilà le plan."), finish({ summary: "Plan prêt." })]));
    expect(turn.answer).toBe("Plan prêt.");
    expect(turn.steps.map((step) => step.kind)).toEqual(["tool", "text"]);
  });

  it("shows no result when finish_turn lists none", () => {
    const turn = splitAssistantTurn(assistant([sketch("c1"), finish({ summary: "Rien à montrer." })]));
    expect(turn.results).toEqual([]);
    expect(turn.steps[0]).toMatchObject({ kind: "tool", shownInResults: false });
  });

  it("falls back silently when the finish_turn input is invalid", () => {
    const invalid = assistant([text("Je cherche."), sketch("c1"), text("Voici un croquis."), finish({ summary: "" })]);
    const turn = splitAssistantTurn(invalid);
    expect(turn.hasFinishTurn).toBe(false);
    expect(turn.answer).toBe("Voici un croquis.");
    expect(ids(turn.results)).toEqual(["c1"]);
    expect(turn.nextActions).toEqual([]);
    expect(stepNames(invalid)).toEqual(["text:Je cherche.", "tool:generate_sketch"]);
  });
});

describe("splitAssistantTurn without finish_turn", () => {
  it("answers with the texts after the last tool", () => {
    const message = assistant([text("Je lis."), tool("get_canvas_state", "c1"), text("Le canvas est vide."), text("On commence ?")]);
    expect(splitAssistantTurn(message).answer).toBe("Le canvas est vide.\n\nOn commence ?");
    expect(stepNames(message)).toEqual(["text:Je lis.", "tool:get_canvas_state"]);
  });

  it("answers with the last text when the turn ends on a tool", () => {
    const message = assistant([text("Je construis."), tool("apply_workflow", "c1")]);
    expect(splitAssistantTurn(message).answer).toBe("Je construis.");
    expect(stepNames(message)).toEqual(["tool:apply_workflow"]);
  });

  it("keeps a plain reply without any step", () => {
    const turn = splitAssistantTurn(assistant([text("Salut !")]));
    expect(turn.answer).toBe("Salut !");
    expect(turn.stepCount).toBe(0);
  });

  it("states the failure when the turn stops on a failed tool", () => {
    const message = assistant([
      text("Je dessine."),
      { type: "tool-generate_sketch", toolCallId: "c1", state: "output-error", input: {}, errorText: "OpenRouter API error 500" },
    ]);
    const turn = splitAssistantTurn(message);
    expect(turn.answer).toBe("Échec de l'étape « Dessine le croquis » : OpenRouter API error 500");
    expect(stepNames(message)).toEqual(["text:Je dessine.", "tool:generate_sketch"]);
    expect(turn.steps[1]).toMatchObject({ status: "error", errorText: "OpenRouter API error 500" });
  });

  it("shows every successful visual output as a result", () => {
    const turn = splitAssistantTurn(
      assistant([
        tool("search_youtube", "c1"),
        sketch("c2"),
        tool("generate_sketch", "c3", { output: { isError: true, content: [{ type: "text", text: "boom" }] } }),
        tool("apply_workflow", "c4"),
      ]),
    );
    expect(ids(turn.results)).toEqual(["c1", "c2"]);
  });
});

describe("client requests", () => {
  it("keeps a pending request out of the steps", () => {
    const turn = splitAssistantTurn(
      assistant([
        text("Il me faut ton logo."),
        { type: "tool-request_user_image", toolCallId: "c1", state: "input-available", input: { reason: "logo" } },
      ]),
    );
    expect(ids(turn.pending)).toEqual(["c1"]);
    expect(turn.steps).toEqual([]);
    expect(turn.answer).toBe("Il me faut ton logo.");
  });

  it("lists an answered request as a step", () => {
    const message = assistant([tool("request_user_image", "c1", { output: { source_ids: ["stored:lg_1"] } })]);
    expect(splitAssistantTurn(message).pending).toEqual([]);
    expect(stepNames(message)).toEqual(["tool:request_user_image"]);
  });
});

describe("turn metadata", () => {
  it("reads the duration and the interruption", () => {
    const turn = splitAssistantTurn(assistant([text("x")], { durationMs: 12_000, interrupted: true }));
    expect(turn.durationMs).toBe(12_000);
    expect(turn.interrupted).toBe(true);
  });

  it("ignores malformed metadata", () => {
    const turn = splitAssistantTurn(assistant([text("x")], { durationMs: -1, interrupted: "oui" }));
    expect(turn.durationMs).toBeNull();
    expect(turn.interrupted).toBe(false);
  });
});

describe("toolStatus", () => {
  const status = (part: unknown) => toolStatus(part as ToolPart);

  it("is running until an output arrives", () => {
    expect(status({ type: "tool-x", toolCallId: "c", state: "input-streaming" })).toEqual({ status: "running", errorText: null });
    expect(status({ type: "tool-x", toolCallId: "c", state: "input-available", input: {} })).toEqual({ status: "running", errorText: null });
  });

  it("detects every error shape", () => {
    expect(status({ type: "tool-x", toolCallId: "c", state: "output-error", errorText: "boom" })).toEqual({ status: "error", errorText: "boom" });
    expect(status({ type: "tool-x", toolCallId: "c", state: "output-denied" })).toEqual({ status: "error", errorText: "Refusé" });
    expect(status(tool("x", "c", { output: { isError: true, content: [{ type: "text", text: "clé absente" }] } }))).toEqual({ status: "error", errorText: "clé absente" });
    expect(status(tool("x", "c", { output: { type: "error-text", value: "abandon" } }))).toEqual({ status: "error", errorText: "abandon" });
    expect(status(tool("x", "c"))).toEqual({ status: "done", errorText: null });
  });
});

describe("currentStepLabel", () => {
  it("says Réfléchit when nothing more precise is known", () => {
    expect(currentStepLabel(undefined, "submitted")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([text("x")]), "submitted")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([{ type: "reasoning", text: "…" }]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([text("x"), { type: "step-start" }]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel(assistant([tool("search_youtube", "c1")]), "streaming")).toBe("Réfléchit");
    expect(currentStepLabel({ id: "u", role: "user", parts: [] } as UIMessage, "streaming")).toBe("Réfléchit");
  });

  it("names the running tool and the answer being written", () => {
    const running = (name: string) => assistant([{ type: `tool-${name}`, toolCallId: "c1", state: "input-available", input: {} }]);
    expect(currentStepLabel(running("search_youtube"), "streaming")).toBe("Cherche sur YouTube");
    expect(currentStepLabel(running("finish_turn"), "streaming")).toBe("Rédige la réponse");
    expect(currentStepLabel(assistant([text("Je")]), "streaming")).toBe("Rédige la réponse");
  });
});

describe("formatting", () => {
  it("formats durations and the live timer", () => {
    expect(formatTurnDuration(400)).toBe("1 s");
    expect(formatTurnDuration(12_400)).toBe("12 s");
    expect(formatTurnDuration(60_000)).toBe("1 min");
    expect(formatTurnDuration(75_000)).toBe("1 min 15 s");
    expect(formatElapsed(-5)).toBe("0:00");
    expect(formatElapsed(9_999)).toBe("0:09");
    expect(formatElapsed(75_000)).toBe("1:15");
  });

  it("builds the folded header", () => {
    expect(turnHeaderLabel({ durationMs: 12_000, stepCount: 1 })).toBe("12 s · 1 étape");
    expect(turnHeaderLabel({ durationMs: null, stepCount: 4 })).toBe("4 étapes");
  });
});

describe("turnDisplay", () => {
  const base = { isLast: true, status: "ready" as const, errorMessage: null, stoppedLive: false, interrupted: false };

  it("shows the live line only on the last message of a running turn", () => {
    expect(turnDisplay({ ...base, status: "streaming" }).mode).toBe("progress");
    expect(turnDisplay({ ...base, status: "submitted" }).mode).toBe("progress");
    expect(turnDisplay({ ...base, isLast: false, status: "streaming" })).toEqual({ mode: "done", error: null, showActions: false, canRetry: false });
  });

  it("offers actions on the last finished turn only", () => {
    expect(turnDisplay(base)).toEqual({ mode: "done", error: null, showActions: true, canRetry: false });
    expect(turnDisplay({ ...base, isLast: false }).showActions).toBe(false);
  });

  it("turns a failed or stopped last turn into an error with Réessayer", () => {
    expect(turnDisplay({ ...base, status: "error", errorMessage: "Clé absente" })).toEqual({
      mode: "done",
      error: { title: "Erreur", description: "Clé absente" },
      showActions: false,
      canRetry: true,
    });
    expect(turnDisplay({ ...base, status: "error" }).error?.description).toBe("Une erreur est survenue.");
    expect(turnDisplay({ ...base, stoppedLive: true }).error).toEqual(INTERRUPTED_TURN_ERROR);
    expect(turnDisplay({ ...base, isLast: false, interrupted: true })).toEqual({
      mode: "done",
      error: INTERRUPTED_TURN_ERROR,
      showActions: false,
      canRetry: false,
    });
  });

  it("knows busy statuses and the empty turn", () => {
    expect(["submitted", "streaming"].every((s) => isBusyStatus(s as "submitted"))).toBe(true);
    expect(isBusyStatus("ready")).toBe(false);
    expect(emptyAssistantTurn()).toMatchObject({ answer: "", stepCount: 0, steps: [], results: [] });
  });
});
