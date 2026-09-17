import { describe, it, expect } from "vitest";
import {
  ASK_USER_TOOL_NAME,
  askUserAnswerText,
  askUserInputSchema,
  askUserMaxSelected,
  askUserOptionImage,
  askUserStepLabel,
  parseAskUserInput,
  readAskUserOutput,
  type AskUserInput,
} from "@/lib/agent/browser-tools/ask-user";
import { V2_CLIENT_TOOLS, V2_CLIENT_TOOL_NAMES } from "@/lib/agent/v2/browser-client-tools";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";

const option = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: `Option ${id}`, ...extra });
const base = { question: "Quel angle ?", step: 2, options: [option("a"), option("b")] };
const accepts = (value: unknown) => askUserInputSchema.safeParse(value).success;

describe("ask_user input schema", () => {
  it("accepts a minimal question and applies the defaults", () => {
    const parsed = parseAskUserInput(base);
    expect(parsed).toMatchObject({ multiple: false, allow_skip: true, step: 2 });
    expect(parsed?.max_selected).toBeUndefined();
  });

  it("enforces the limits", () => {
    expect(accepts({ ...base, question: "" })).toBe(false);
    expect(accepts({ ...base, question: "x".repeat(200) })).toBe(true);
    expect(accepts({ ...base, question: "x".repeat(201) })).toBe(false);
    expect(accepts({ ...base, step: 0 })).toBe(false);
    expect(accepts({ ...base, step: 9 })).toBe(false);
    expect(accepts({ ...base, step: 1.5 })).toBe(false);
    expect(accepts({ ...base, options: [] })).toBe(false);
    expect(accepts({ ...base, options: ["1", "2", "3", "4", "5", "6"].map((id) => option(id)) })).toBe(true);
    expect(accepts({ ...base, options: ["1", "2", "3", "4", "5", "6", "7"].map((id) => option(id)) })).toBe(false);
    expect(accepts({ ...base, options: [{ id: "a", label: "x".repeat(60) }] })).toBe(true);
    expect(accepts({ ...base, options: [{ id: "a", label: "x".repeat(61) }] })).toBe(false);
    expect(accepts({ ...base, options: [option("a", { description: "x".repeat(140) })] })).toBe(true);
    expect(accepts({ ...base, options: [option("a", { description: "x".repeat(141) })] })).toBe(false);
    expect(accepts({ ...base, options: [option("a"), option("a")] })).toBe(false);
  });

  it("only allows max_selected 1 to 3 on a multiple question", () => {
    expect(accepts({ ...base, multiple: true, max_selected: 3 })).toBe(true);
    expect(accepts({ ...base, multiple: true, max_selected: 0 })).toBe(false);
    expect(accepts({ ...base, multiple: true, max_selected: 4 })).toBe(false);
    expect(accepts({ ...base, multiple: false, max_selected: 2 })).toBe(false);
    expect(accepts({ ...base, max_selected: 2 })).toBe(false);
  });

  it("computes how many options can be selected", () => {
    const single = parseAskUserInput(base) as AskUserInput;
    expect(askUserMaxSelected(single)).toBe(1);
    expect(askUserMaxSelected(parseAskUserInput({ ...base, multiple: true }) as AskUserInput)).toBe(2);
    const many = { ...base, multiple: true, options: ["1", "2", "3", "4", "5"].map((id) => option(id)) };
    expect(askUserMaxSelected(parseAskUserInput(many) as AskUserInput)).toBe(3);
    expect(askUserMaxSelected(parseAskUserInput({ ...many, max_selected: 2 }) as AskUserInput)).toBe(2);
  });

  it("returns null for an unreadable input", () => {
    expect(parseAskUserInput(undefined)).toBeNull();
    expect(parseAskUserInput({ question: "?" })).toBeNull();
  });
});

describe("ask_user output", () => {
  it("reads the raw and the persisted json forms", () => {
    expect(readAskUserOutput({ selected: ["a"] })).toEqual({ selected: ["a"] });
    expect(readAskUserOutput({ type: "json", value: { other: "Mon lien" } })).toEqual({ other: "Mon lien" });
    expect(readAskUserOutput({ skipped: true })).toEqual({ skipped: true });
    expect(readAskUserOutput({ type: "json", value: { skipped: true, reason: "abandoned" } })).toEqual({
      skipped: true,
      reason: "abandoned",
    });
    expect(readAskUserOutput({ selected: "a" })).toBeNull();
    expect(readAskUserOutput(null)).toBeNull();
  });

  it("describes the answer", () => {
    const input = parseAskUserInput({ ...base, options: [option("a", { label: "Choc" }), option("b", { label: "Démo" })] });
    expect(askUserAnswerText(input, { selected: ["b", "a"] })).toBe("Démo, Choc");
    expect(askUserAnswerText(input, { selected: ["zz"] })).toBe("zz");
    expect(askUserAnswerText(input, { other: "Ma vidéo" })).toBe("Autre : Ma vidéo");
    expect(askUserAnswerText(input, { skipped: true })).toBe("Passé");
    expect(askUserAnswerText(input, { skipped: true, reason: "abandoned" })).toBe("sans réponse");
    expect(askUserAnswerText(input, null)).toBeNull();
  });

  it("builds the folded step line from a persisted answer", () => {
    const input = { ...base, options: [option("a", { label: "Choc" })] };
    expect(askUserStepLabel(input, { type: "json", value: { selected: ["a"] } })).toBe("Quel angle ? : Choc");
    expect(askUserStepLabel(input, undefined)).toBeNull();
    expect(askUserStepLabel({ nope: true }, { selected: ["a"] })).toBeNull();
  });
});

describe("ask_user option images", () => {
  it("maps the list tools' references to app routes and thumbnails", () => {
    expect(askUserOptionImage("stored:persona_p-1")).toEqual({ src: "/api/personas/image?id=p-1&angle=front", shape: "square" });
    expect(askUserOptionImage("stored:sf_1234-abcd")).toEqual({ src: "/api/swipe-files/image?f=1234-abcd", shape: "wide" });
    expect(askUserOptionImage("stored:lg_9f")).toEqual({ src: "/api/logos/image?f=9f", shape: "square" });
    expect(askUserOptionImage("youtube:dQw4w9WgXcQ")).toEqual({
      src: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      shape: "wide",
    });
  });

  it("ignores anything else", () => {
    expect(askUserOptionImage(undefined)).toBeNull();
    expect(askUserOptionImage("https://example.com/a.png")).toBeNull();
    expect(askUserOptionImage("stored:gi_1")).toBeNull();
    expect(askUserOptionImage("youtube:bad id/..")).toBeNull();
    expect(askUserOptionImage("stored:persona_../x")).toBeNull();
  });
});

describe("ask_user client tool", () => {
  it("is declared without execute, with its schema and a label", () => {
    expect(ASK_USER_TOOL_NAME).toBe("ask_user");
    expect(V2_CLIENT_TOOL_NAMES.has("ask_user")).toBe(true);
    expect(V2_CLIENT_TOOLS.ask_user.execute).toBeUndefined();
    const schema = V2_CLIENT_TOOLS.ask_user.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(true);
    expect(TOOL_LABELS.ask_user).toBe("Te pose une question");
  });
});
