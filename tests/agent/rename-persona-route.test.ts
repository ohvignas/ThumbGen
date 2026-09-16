import { describe, it, expect } from "vitest";

async function call(
  handler: (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>,
  opts: { method?: string; url: string; body?: unknown; paramsId?: string },
) {
  const req = new Request(opts.url, {
    method: opts.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ctx = opts.paramsId ? { params: Promise.resolve({ id: opts.paramsId }) } : undefined;
  return handler(req, ctx);
}

describe("PATCH /api/personas/:id (rename)", () => {
  it("renames an existing persona", async () => {
    const { POST } = await import("@/app/api/personas/route");
    const created = (await (
      await call(POST as never, { method: "POST", url: "http://localhost/api/personas", body: { label: "Old name", photos: { front: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=" } } })
    ).json()) as { id: string };

    const { PATCH } = await import("@/app/api/personas/[id]/route");
    const res = await call(PATCH as never, {
      method: "PATCH",
      url: `http://localhost/api/personas/${created.id}`,
      body: { label: "New name" },
      paramsId: created.id,
    });
    expect(res.status).toBe(200);

    const { GET } = await import("@/app/api/personas/route");
    const list = (await (await call(GET as never, { method: "GET", url: "http://localhost/api/personas" })).json()) as { id: string; label: string }[];
    expect(list.find((p) => p.id === created.id)?.label).toBe("New name");
  });

  it("404s for an unknown id", async () => {
    const { PATCH } = await import("@/app/api/personas/[id]/route");
    const res = await call(PATCH as never, {
      method: "PATCH",
      url: "http://localhost/api/personas/does-not-exist",
      body: { label: "x" },
      paramsId: "does-not-exist",
    });
    expect(res.status).toBe(404);
  });
});
