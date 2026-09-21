import { beforeEach, describe, expect, it, vi } from "vitest";

const { placeInterviewNode } = vi.hoisted(() => ({
  placeInterviewNode: vi.fn(async () => {
    throw new Error("must not place on studio");
  }),
}));

vi.mock("@/lib/agent/place-node", () => ({
  placeInterviewNode,
  placeNodeInputSchema: { parse: (value: unknown) => value },
}));

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { executePlaceNode } from "@/lib/agent/v2/place-node-tool";

describe("place_node on a writing fiche", () => {
  beforeEach(() => {
    placeInterviewNode.mockClear();
  });

  it("refuses before touching the canvas", async () => {
    const writePatch = vi.fn();
    const result = await executePlaceNode(
      "studio:vid_abc",
      { node: { id: "iv-prompt", type: "prompt", data: { prompt: "A thumbnail" } } },
      writePatch,
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/studio|Vidéos|écriture/i);
    expect(placeInterviewNode).not.toHaveBeenCalled();
    expect(writePatch).not.toHaveBeenCalled();
  });
});
