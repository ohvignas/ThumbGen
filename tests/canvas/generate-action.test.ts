import { describe, it, expect, vi, afterEach } from "vitest";
import { formatUsdEstimate, generateActionState } from "@/lib/canvas/generate-action";

const generator = (data: Record<string, unknown>) => ({ id: "iv-generator", type: "generator", data });
const prompt = { id: "iv-prompt", type: "prompt", data: { prompt: "x" } };
const edge = (source: string, targetHandle: string) => ({ source, target: "iv-generator", targetHandle });

describe("generateActionState", () => {
  it("computes the label and the cost of a normal generator", () => {
    expect(generateActionState("iv-generator", [prompt, generator({ model: "gemini-3.1-flash-image" })], [edge("iv-prompt", "prompt-in")])).toEqual({
      status: "ready",
      label: "Générer · 1 image · ~0,02 $",
      costUsd: 0.02,
    });
    const three = generateActionState("iv-generator", [generator({ model: "gemini-3.1-flash-image", numImages: 3 })], []);
    expect(three).toMatchObject({ status: "ready", label: "Générer · 3 images · ~0,06 $" });
    expect(generateActionState("iv-generator", [generator({ model: "gpt-image-2.5-sunburst" })], [])).toMatchObject({
      label: "Générer · 1 image · ~0,05 $",
    });
  });

  it("counts every variant of an A/B test", () => {
    const state = generateActionState(
      "iv-generator",
      [generator({ model: "gemini-3.1-flash-image", abTest: { variants: ["A", "B"] } })],
      [],
    );
    expect(state).toMatchObject({ status: "ready", label: "Générer · 2 variantes × 1 image · 2 images · ~0,04 $" });
  });

  it("uses the default model and omits an unknown cost", () => {
    expect(generateActionState("iv-generator", [generator({})], [])).toMatchObject({ label: "Générer · 1 image · ~0,02 $" });
    expect(generateActionState("iv-generator", [generator({ model: "mystery-model" })], [])).toEqual({
      status: "ready",
      label: "Générer · 1 image",
      costUsd: 0,
    });
  });

  it("is missing for an absent node or another type, generating while it runs", () => {
    expect(generateActionState("iv-generator", [], [])).toEqual({ status: "missing" });
    expect(generateActionState("iv-prompt", [prompt], [])).toEqual({ status: "missing" });
    expect(generateActionState("iv-generator", [generator({ isGenerating: true })], [])).toEqual({ status: "generating" });
  });

  it("formats French estimates", () => {
    expect(formatUsdEstimate(0.02)).toBe("~0,02 $");
    expect(formatUsdEstimate(0.06000000000000001)).toBe("~0,06 $");
    expect(formatUsdEstimate(0.1)).toBe("~0,10 $");
    expect(formatUsdEstimate(0.045)).toBe("~0,045 $");
  });
});

describe("generate node event", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls back only for its node, until unsubscribed", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const { requestNodeGeneration, subscribeNodeGeneration } = await import("@/lib/canvas/generate-node-event");
    const onRequest = vi.fn();
    const unsubscribe = subscribeNodeGeneration("iv-generator", onRequest);
    requestNodeGeneration("other");
    expect(onRequest).not.toHaveBeenCalled();
    requestNodeGeneration("iv-generator");
    expect(onRequest).toHaveBeenCalledTimes(1);
    unsubscribe();
    requestNodeGeneration("iv-generator");
    expect(onRequest).toHaveBeenCalledTimes(1);
  });
});
