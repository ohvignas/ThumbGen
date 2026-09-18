import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ASK_USER_TOOL_NAME,
  askUserAnswerText,
  askUserInputSchema,
  askUserMaxSelected,
  askUserOptionImage,
  askUserStepLabel,
  askUserToolInputSchema,
  parseAskUserInput,
  parseStoredAskUserInput,
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
    expect(accepts({ question: "Quel angle ?", options: [option("a"), option("b")] })).toBe(true);
    expect(accepts({ ...base, step: 0 })).toBe(false);
    expect(accepts({ ...base, step: 7 })).toBe(true);
    expect(accepts({ ...base, step: 8 })).toBe(false);
    expect(accepts({ ...base, step: 1.5 })).toBe(false);
    expect(accepts({ ...base, options: [] })).toBe(true);
    expect(accepts({ ...base, multiple: true, options: [] })).toBe(false);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => option(String(i + 1)));
    expect(accepts({ ...base, options: ids(12) })).toBe(true);
    expect(accepts({ ...base, options: ids(13) })).toBe(false);
    expect(accepts({ ...base, options: [{ id: "a", label: "x".repeat(60) }] })).toBe(true);
    expect(accepts({ ...base, options: [{ id: "a", label: "x".repeat(61) }] })).toBe(false);
    expect(accepts({ ...base, options: [option("a", { description: "x".repeat(140) })] })).toBe(true);
    expect(accepts({ ...base, options: [option("a", { description: "x".repeat(141) })] })).toBe(false);
    expect(accepts({ ...base, options: [option("a"), option("a")] })).toBe(false);
  });

  it("only allows max_selected 1 to 5 on a multiple question", () => {
    expect(accepts({ ...base, multiple: true, max_selected: 5 })).toBe(true);
    expect(accepts({ ...base, multiple: true, max_selected: 0 })).toBe(false);
    expect(accepts({ ...base, multiple: true, max_selected: 6 })).toBe(false);
    expect(accepts({ ...base, multiple: false, max_selected: 2 })).toBe(false);
    expect(accepts({ ...base, max_selected: 2 })).toBe(false);
  });

  it("computes how many options can be selected", () => {
    const single = parseAskUserInput(base) as AskUserInput;
    expect(askUserMaxSelected(single)).toBe(1);
    expect(askUserMaxSelected(parseAskUserInput({ ...base, multiple: true }) as AskUserInput)).toBe(2);
    const many = { ...base, multiple: true, options: ["1", "2", "3", "4", "5", "6", "7"].map((id) => option(id)) };
    expect(askUserMaxSelected(parseAskUserInput(many) as AskUserInput)).toBe(5);
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
    const free = parseAskUserInput({ question: "De quoi parle la vidéo ?", step: 1, options: [] });
    expect(askUserAnswerText(free, { other: "Les miniatures" })).toBe("Les miniatures");
  });

  it("builds the folded step line from a persisted answer", () => {
    const input = { ...base, options: [option("a", { label: "Choc" })] };
    expect(askUserStepLabel(input, { type: "json", value: { selected: ["a"] } })).toBe("Quel angle ? : Choc");
    expect(askUserStepLabel(input, undefined)).toBeNull();
    expect(askUserStepLabel({ nope: true }, { selected: ["a"] })).toBeNull();
  });

  it("still folds an F2 question stored with step 8", () => {
    const f2 = { question: "Quel modèle ?", step: 8, options: [option("nb", { label: "Nano Banana · ~0,02 $ / image" })] };
    expect(askUserStepLabel(f2, { type: "json", value: { selected: ["nb"] } })).toBe("Quel modèle ? : Nano Banana · ~0,02 $ / image");
    expect(parseStoredAskUserInput(f2)).not.toBeNull();
    expect(parseStoredAskUserInput({ ...f2, step: 9 })).toBeNull();
    expect(parseAskUserInput(f2)).toBeNull();
    expect(accepts(f2)).toBe(false);
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
    expect(askUserOptionImage("generated:sk_abc123")).toEqual({ src: "/api/generated-sketches/sk_abc123", shape: "wide" });
    expect(askUserOptionImage("logo-candidate:lc_aaa", "conv-1")).toEqual({
      src: "/api/briefs/conv-1/logo-candidates/lc_aaa",
      shape: "square",
    });
    expect(askUserOptionImage("logo-candidate:lc_aaa")).toBeNull();
    expect(askUserOptionImage("logo-candidate:../x", "conv-1")).toBeNull();
  });

  it("ignores anything else", () => {
    expect(askUserOptionImage(undefined)).toBeNull();
    expect(askUserOptionImage("https://example.com/a.png")).toBeNull();
    expect(askUserOptionImage("stored:gi_1")).toBeNull();
    expect(askUserOptionImage("youtube:bad id/..")).toBeNull();
    expect(askUserOptionImage("stored:persona_../x")).toBeNull();
    expect(askUserOptionImage("generated:sk_../x")).toBeNull();
    expect(askUserOptionImage("generated:gi_1")).toBeNull();
  });
});

describe("ask_user rejection paths", () => {
  const issues = (value: unknown) => {
    const result = askUserInputSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  };

  it("names the duplicate option id", () => {
    expect(issues({ ...base, options: [option("a"), option("b"), option("a")] })).toEqual([
      { path: "options.2.id", message: "Duplicate option id: a" },
    ]);
  });

  it("names a multiple question without options", () => {
    expect(issues({ ...base, multiple: true, options: [] })).toEqual([{ path: "multiple", message: "multiple requires at least one option" }]);
  });

  it("names max_selected without multiple", () => {
    expect(issues({ ...base, max_selected: 2 })).toEqual([{ path: "max_selected", message: "max_selected requires multiple: true" }]);
    expect(issues({ ...base, multiple: false, max_selected: 1 })).toHaveLength(1);
  });

  it("rejects both through the client tool the model calls", async () => {
    const schema = V2_CLIENT_TOOLS.ask_user.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ ...base, options: [option("a"), option("a")] }).success).toBe(false);
    expect(schema.safeParse({ ...base, max_selected: 2 }).success).toBe(false);
    expect(parseAskUserInput({ ...base, max_selected: 2 })).toBeNull();
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

  it("omits leftover step from the JSON schema the model sees", () => {
    const json = z.toJSONSchema(askUserToolInputSchema) as { properties?: Record<string, unknown> };
    expect(json.properties?.step).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("pipeline");
    expect(V2_CLIENT_TOOLS.ask_user.description).not.toMatch(/Étape|numbered pipeline|Omit step/);
  });
});
