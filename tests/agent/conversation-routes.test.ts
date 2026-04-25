import { describe, it, expect } from "vitest";

async function call(handler: (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>, opts: {
  method?: string;
  url: string;
  body?: unknown;
  paramsId?: string;
}) {
  const req = new Request(opts.url, {
    method: opts.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ctx = opts.paramsId ? { params: Promise.resolve({ id: opts.paramsId }) } : undefined;
  return handler(req, ctx);
}

describe("/api/agent/conversations", () => {
  it("POST without project_id → 400", async () => {
    const { POST } = await import("@/app/api/agent/conversations/route");
    const res = await call(POST as never, { method: "POST", url: "http://localhost/api/agent/conversations", body: {} });
    expect(res.status).toBe(400);
  });

  it("POST then GET round-trip", async () => {
    const { POST, GET } = await import("@/app/api/agent/conversations/route");
    const create = await call(POST as never, {
      method: "POST",
      url: "http://localhost/api/agent/conversations",
      body: { project_id: "test-routes", title: "Round trip" },
    });
    expect(create.status).toBe(200);
    const created = await create.json();

    const list = await call(GET as never, {
      method: "GET",
      url: "http://localhost/api/agent/conversations?project_id=test-routes",
    });
    const items = (await list.json()) as { id: string; title: string }[];
    expect(items.find((c) => c.id === created.id)?.title).toBe("Round trip");
  });

  it("PATCH renames; DELETE soft-deletes", async () => {
    const { POST } = await import("@/app/api/agent/conversations/route");
    const created = (await (await call(POST as never, {
      method: "POST",
      url: "http://localhost/api/agent/conversations",
      body: { project_id: "test-routes", title: "Old" },
    })).json()) as { id: string };

    const { PATCH, DELETE } = await import("@/app/api/agent/conversations/[id]/route");
    const patched = await call(PATCH as never, {
      method: "PATCH",
      url: `http://localhost/api/agent/conversations/${created.id}`,
      body: { title: "New" },
      paramsId: created.id,
    });
    expect(patched.status).toBe(200);
    const renamed = await patched.json();
    expect(renamed.title).toBe("New");

    const del = await call(DELETE as never, {
      method: "DELETE",
      url: `http://localhost/api/agent/conversations/${created.id}`,
      paramsId: created.id,
    });
    expect(del.status).toBe(200);
  });

  it("PATCH with no title → 400; PATCH on missing → 404", async () => {
    const { PATCH } = await import("@/app/api/agent/conversations/[id]/route");
    const noBody = await call(PATCH as never, {
      method: "PATCH",
      url: "http://localhost/api/agent/conversations/whatever",
      body: {},
      paramsId: "whatever",
    });
    expect(noBody.status).toBe(400);

    const noFound = await call(PATCH as never, {
      method: "PATCH",
      url: "http://localhost/api/agent/conversations/missing-id",
      body: { title: "x" },
      paramsId: "missing-id",
    });
    expect(noFound.status).toBe(404);
  });

  it("GET messages returns [] for empty conversation", async () => {
    const { POST } = await import("@/app/api/agent/conversations/route");
    const created = (await (await call(POST as never, {
      method: "POST",
      url: "http://localhost/api/agent/conversations",
      body: { project_id: "test-routes" },
    })).json()) as { id: string };

    const { GET } = await import("@/app/api/agent/conversations/[id]/messages/route");
    const res = await call(GET as never, {
      method: "GET",
      url: `http://localhost/api/agent/conversations/${created.id}/messages`,
      paramsId: created.id,
    });
    expect(res.status).toBe(200);
    const msgs = await res.json();
    expect(msgs).toEqual([]);
  });
});
