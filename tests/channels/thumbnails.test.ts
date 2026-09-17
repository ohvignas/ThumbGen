import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as swipeImage } from "@/app/api/swipe-files/image/route";
import { fetchBestThumbnail, getSwipeFileTitle, saveThumbnailToLibrary } from "@/lib/youtube/thumbnails";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubThumbnails(bytesBySize: Record<string, number>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const size = String(input).split("/").pop()?.replace(".jpg", "") ?? "";
    const bytes = bytesBySize[size];
    return bytes === undefined ? new Response("missing", { status: 404 }) : new Response(new Uint8Array(bytes).fill(1), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchBestThumbnail", () => {
  it("takes the largest size YouTube really serves, skipping tiny placeholders", async () => {
    const fetchMock = stubThumbnails({ sddefault: 900, hqdefault: 40_000, mqdefault: 20_000 });
    const thumbnail = await fetchBestThumbnail("abcdefghijk");
    expect(thumbnail?.bytes.length).toBe(40_000);
    expect(thumbnail?.mime).toBe("image/jpeg");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg",
      "https://i.ytimg.com/vi/abcdefghijk/sddefault.jpg",
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    ]);
  });

  it("returns null when no size exists", async () => {
    stubThumbnails({});
    expect(await fetchBestThumbnail("abcdefghijk")).toBeNull();
  });
});

describe("saveThumbnailToLibrary", () => {
  it("stores the image as an inspiration served by the library image route", async () => {
    const id = saveThumbnailToLibrary("Ma meilleure vidéo", { bytes: Buffer.from([1, 2, 3, 4]), mime: "image/jpeg" });
    expect(getSwipeFileTitle(id)).toBe("Ma meilleure vidéo");
    expect(getSwipeFileTitle("does-not-exist")).toBeNull();

    const res = await swipeImage(new NextRequest(`http://localhost/api/swipe-files/image?f=${id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
