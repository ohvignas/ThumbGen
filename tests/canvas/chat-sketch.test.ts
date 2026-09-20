import { describe, it, expect } from "vitest";
import { chatSketchNodeData, isWorkflowSketchSlotId } from "@/lib/canvas/chat-sketch";

describe("chatSketchNodeData", () => {
  it("stores a generated ref and same-origin URL, not inline pixels", () => {
    expect(chatSketchNodeData("sk_abc", "Draft")).toEqual({
      image_source: "generated:sk_abc",
      imageUrl: "/api/generated-sketches/sk_abc",
      label: "Draft",
    });
    expect(isWorkflowSketchSlotId("sketch-a")).toBe(true);
    expect(isWorkflowSketchSlotId("sketch-4a242b6b")).toBe(false);
  });
});
