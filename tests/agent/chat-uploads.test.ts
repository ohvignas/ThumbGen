import { describe, it, expect } from "vitest";

async function makeUploadReq(file: File | undefined): Promise<Request> {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new Request("http://localhost/api/chat-uploads", {
    method: "POST",
    body: fd,
  });
}

describe("POST /api/chat-uploads", () => {
  it("returns 400 when no file is provided", async () => {
    const { POST } = await import("@/app/api/chat-uploads/route");
    const req = await makeUploadReq(undefined);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty file", async () => {
    const { POST } = await import("@/app/api/chat-uploads/route");
    const req = await makeUploadReq(new File([], "empty.png", { type: "image/png" }));
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported mime type", async () => {
    const { POST } = await import("@/app/api/chat-uploads/route");
    const req = await makeUploadReq(new File([new Uint8Array([1, 2, 3])], "x.gif", { type: "image/gif" }));
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("uploads a valid PNG and returns a uploaded:* source", async () => {
    const { POST } = await import("@/app/api/chat-uploads/route");
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    const req = await makeUploadReq(new File([png], "ok.png", { type: "image/png" }));
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; source: string; size: number; mimeType: string };
    expect(body.id).toMatch(/^up_/);
    expect(body.source).toBe(`uploaded:${body.id}`);
    expect(body.size).toBe(5);
    expect(body.mimeType).toBe("image/png");
  });

  it("rejects files over the 5 MB limit", async () => {
    const { POST } = await import("@/app/api/chat-uploads/route");
    const big = new Uint8Array(6 * 1024 * 1024); // 6 MB
    const req = await makeUploadReq(new File([big], "big.png", { type: "image/png" }));
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/chat-uploads/[id]", () => {
  it("returns 404 for unknown id", async () => {
    const { GET } = await import("@/app/api/chat-uploads/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/chat-uploads/missing") as never,
      { params: Promise.resolve({ id: "missing" }) } as never,
    );
    expect(res.status).toBe(404);
  });

  it("upload then GET returns the same bytes and mime type", async () => {
    const { POST } = await import("@/app/api/chat-uploads/route");
    const { GET } = await import("@/app/api/chat-uploads/[id]/route");

    const original = new Uint8Array([10, 20, 30, 40]);
    const fd = new FormData();
    fd.append("file", new File([original], "rt.png", { type: "image/png" }));
    const upRes = await POST(new Request("http://localhost/api/chat-uploads", { method: "POST", body: fd }) as never);
    const { id } = (await upRes.json()) as { id: string };

    const getRes = await GET(
      new Request(`http://localhost/api/chat-uploads/${id}`) as never,
      { params: Promise.resolve({ id }) } as never,
    );
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toBe("image/png");
    const got = new Uint8Array(await getRes.arrayBuffer());
    expect(Array.from(got)).toEqual(Array.from(original));
  });
});
