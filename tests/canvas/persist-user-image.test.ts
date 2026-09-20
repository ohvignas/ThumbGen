import { afterEach, describe, expect, it, vi } from "vitest";
import { persistUserCanvasImage } from "@/lib/canvas/persist-user-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistUserCanvasImage", () => {
  it("stores a sketch as uploaded: so persist-snapshot can keep a URL", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/chat-uploads") {
        return { ok: true, json: async () => ({ id: "up_abc", source: "uploaded:up_abc" }) };
      }
      return { ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const persisted = await persistUserCanvasImage("data:image/png;base64,AAAA", "sketch");
    expect(persisted).toEqual({
      imageUrl: "/api/chat-uploads/up_abc",
      image_source: "uploaded:up_abc",
    });
  });

  it("stores a swipe upload as a library URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ filename: "sf-1" }),
      })),
    );
    const persisted = await persistUserCanvasImage("data:image/png;base64,AAAA", "swipe", "logo.png");
    expect(persisted).toEqual({
      imageUrl: "/api/swipe-files/image?f=sf-1",
      image_source: "stored:sf_sf-1",
    });
  });
});
