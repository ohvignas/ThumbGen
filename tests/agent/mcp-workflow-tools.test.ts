import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "@/lib/agent/mcp/server";
import { signLink, verifyLink, SIGNED_LINK_TTL_SECONDS, mcpRequestOrigin } from "@/lib/agent/mcp/signed-links";
import { applyWorkflowTool } from "@/lib/agent/tools/apply-workflow";
import { POST as uploadRoute } from "@/app/api/mcp/upload/route";
import { GET as exportRoute } from "@/app/api/mcp/export/route";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";

type TextResult = { isError?: boolean; content: { type: string; text?: string }[] };

async function connect() {
  const server = buildMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; text: string }> {
  const client = await connect();
  const result = (await client.callTool({ name, arguments: args })) as TextResult;
  return { isError: Boolean(result.isError), text: result.content.map((part) => part.text ?? "").join("\n") };
}

const tokenOf = (text: string) => text.match(/token=([\w.-]+)/)?.[1] ?? "";

async function pngBytes(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 60 } } }).png().toBuffer();
}

describe("MCP workflow tools", () => {
  it("lists them next to the registry tools and announces the workflow in the server instructions", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    for (const name of ["list_skills", "read_skill", "create_project", "create_upload_link", "run_generator", "export_image"]) {
      expect(names, name).toContain(name);
    }
    expect(names.filter((name) => name === "read_skill")).toHaveLength(1);
    expect(client.getInstructions()).toContain("mcp-workflow");
  });

  it("list_skills names mcp-workflow first and read_skill returns skill bodies", async () => {
    const listed = await call("list_skills");
    expect(listed.isError).toBe(false);
    expect(listed.text.split("\n")[1]).toMatch(/^- mcp-workflow — /);
    expect(listed.text).toContain("- apply_workflow — ");

    const guide = await call("read_skill", { name: "mcp-workflow" });
    expect(guide.text).toContain("run_generator");
    expect(guide.text).toContain("export_image");

    const skill = await call("read_skill", { name: "apply_workflow" });
    expect(skill.isError).toBe(false);
    expect(skill.text).toContain("# apply_workflow");

    const unknown = await call("read_skill", { name: "nope" });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain("mcp-workflow");
  });

  it("create_project makes a named empty miniature", async () => {
    const result = await call("create_project", { name: "SEO + GEO – Claude Code – nov. 2026" });
    expect(result.isError).toBe(false);
    const id = result.text.match(/proj_\d+/)?.[0];
    expect(id).toBeTruthy();
    expect(result.text).toContain(`/m/${id}`);
    const meta = getDb().prepare("SELECT name FROM projects_meta WHERE id = ?").get(id) as { name: string };
    expect(meta.name).toBe("SEO + GEO – Claude Code – nov. 2026");
    const canvas = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(id) as { nodes: string; edges: string };
    expect(canvas).toEqual({ nodes: "[]", edges: "[]" });

    expect((await call("create_project", { name: "   " })).isError).toBe(true);
  });
});

describe("signed links", () => {
  it("round-trips a payload, and refuses a tampered, expired or wrong-kind token", () => {
    const now = Date.UTC(2026, 10, 11);
    const token = signLink({ t: "upload", title: "A.png", n: "abc" }, now);
    expect(verifyLink(token, "upload", now)).toMatchObject({ t: "upload", title: "A.png" });
    expect(verifyLink(token, "export", now)).toBeNull();
    expect(verifyLink(token, "upload", now + (SIGNED_LINK_TTL_SECONDS + 1) * 1000)).toBeNull();
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ t: "upload", title: "B.png", n: "abc", exp: 9999999999 })).toString("base64url");
    expect(verifyLink(`${forged}.${signature}`, "upload", now)).toBeNull();
    expect(verifyLink(`${body}.`, "upload", now)).toBeNull();
    expect(verifyLink("", "upload", now)).toBeNull();
  });

  it("a regenerated MCP key voids outstanding links", () => {
    const token = signLink({ t: "upload", title: "A.png", n: "abc" });
    expect(verifyLink(token, "upload")).not.toBeNull();
    setSetting("mcpApiKey", "tg_rotated");
    expect(verifyLink(token, "upload")).toBeNull();
  });
});

describe("create_upload_link → /api/mcp/upload", () => {
  const post = (token: string, body: Buffer) =>
    uploadRoute(
      new NextRequest(`http://localhost/api/mcp/upload?token=${token}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array(body),
      }),
    );

  it("stores the image in the library under the link's title", async () => {
    const link = await mcpRequestOrigin.run("https://thumbgen.example", () => call("create_upload_link", { title: "A_maquette.png" }));
    expect(link.text).toContain("https://thumbgen.example/api/mcp/upload?token=");
    expect(link.text).toContain("curl -sS -X POST --data-binary");

    const bytes = await pngBytes(64, 36);
    const res = await post(tokenOf(link.text), bytes);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ref: string; mimeType: string; bytes: number };
    expect(json.ref).toMatch(/^stored:sf_[\w-]+$/);
    expect(json).toMatchObject({ mimeType: "image/png", bytes: bytes.length });

    const row = getDb().prepare("SELECT title, mime_type, size FROM swipe_files WHERE id = ?").get(json.ref.slice("stored:sf_".length));
    expect(row).toEqual({ title: "A_maquette.png", mime_type: "image/png", size: bytes.length });
  });

  it("refuses a missing or forged token, and a body that is not an image", async () => {
    const bytes = await pngBytes(8, 8);
    expect((await post("", bytes)).status).toBe(401);
    expect((await post("abc.def", bytes)).status).toBe(401);
    const exportToken = signLink({ t: "export", src: "stored:gi_x", w: 10, h: 10, fmt: "jpg", name: "x.jpg" });
    expect((await post(exportToken, bytes)).status).toBe(401);

    const token = signLink({ t: "upload", title: "x", n: "1" });
    expect((await post(token, Buffer.from("<html>not an image</html>"))).status).toBe(415);
    expect((await post(token, Buffer.alloc(0))).status).toBe(400);
  });
});

describe("export_image → /api/mcp/export", () => {
  const fetchExport = (token: string) => exportRoute(new NextRequest(`http://localhost/api/mcp/export?token=${token}`));

  async function storeGenerated(id: string, width: number, height: number) {
    getDb()
      .prepare("INSERT OR REPLACE INTO generated_images (id, mime_type, data) VALUES (?, ?, ?)")
      .run(id, "image/png", await pngBytes(width, height));
  }

  it("serves the image at exactly 1280×720 by default, as a JPEG under 2 MB", async () => {
    await storeGenerated("export-a", 1536, 1024);
    const link = await call("export_image", { source: "stored:gi_export-a", filename: "A_seo geo.png" });
    expect(link.isError).toBe(false);
    expect(link.text).toContain('-o "A_seo_geo.jpg"');

    const res = await fetchExport(tokenOf(link.text));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toContain('filename="A_seo_geo.jpg"');
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1280, 720, "jpeg"]);
  });

  it("honours a custom size and PNG", async () => {
    await storeGenerated("export-b", 800, 800);
    const link = await call("export_image", { source: "stored:gi_export-b", width: 336, height: 189, format: "png" });
    const res = await fetchExport(tokenOf(link.text));
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([336, 189, "png"]);
  });

  it("refuses an unknown image and an invalid token", async () => {
    const unknown = await call("export_image", { source: "stored:gi_does-not-exist" });
    expect(unknown.isError).toBe(true);
    expect((await call("export_image", { source: "https://example.com/a.png" })).isError).toBe(true);
    expect((await fetchExport("nope")).status).toBe(401);
  });
});

describe("run_generator", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let projectId: string;
  let imageCounter = 0;

  beforeEach(async () => {
    setSetting("openrouterApiKey", "test-key");
    setSetting("openaiApiKey", "");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => {
      imageCounter += 1;
      const b64 = (await pngBytes(16 + imageCounter, 9)).toString("base64");
      return new Response(JSON.stringify({ data: [{ b64_json: b64, media_type: "image/png" }], usage: { total_tokens: 7 } }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const created = await call("create_project", { name: `run-${Date.now()}-${Math.random()}` });
    projectId = created.text.match(/proj_\d+/)![0];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function canvas() {
    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(projectId) as { nodes: string; edges: string };
    return {
      nodes: JSON.parse(row.nodes) as Array<{ id: string; type: string; data: Record<string, unknown> }>,
      edges: JSON.parse(row.edges) as Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
    };
  }

  const sentPrompts = () => fetchMock.mock.calls.map((callArgs) => (JSON.parse(String(callArgs[1]?.body)) as { prompt: string }).prompt);

  it("generates one image per A/B/C variant with that variant's prompt, and writes the Aperçus to the canvas", async () => {
    const applied = await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "prompt-a", type: "prompt", data: { prompt: "Concept A violet" } },
          { id: "prompt-b", type: "prompt", data: { prompt: "Concept B rouge" } },
          { id: "prompt-c", type: "prompt", data: { prompt: "Concept C vert" } },
          { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B", "C"] } } },
        ],
        edges: [
          { source: "prompt-a", target: "gen", targetHandle: "prompt-in" },
          { source: "prompt-b", target: "gen", targetHandle: "prompt-in-b" },
          { source: "prompt-c", target: "gen", targetHandle: "prompt-in-c" },
        ],
      },
    });
    expect(applied.isError).toBeFalsy();

    const result = await call("run_generator", { project_id: projectId });
    expect(result.isError).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const prompts = sentPrompts();
    for (const expected of ["Concept A violet", "Concept B rouge", "Concept C vert"]) {
      expect(prompts.filter((prompt) => prompt.includes(expected)), expected).toHaveLength(1);
    }
    const refs = result.text.match(/stored:gi_[\w-]+/g) ?? [];
    expect(new Set(refs).size).toBe(3);
    expect(result.text).toMatch(/3\/3 image\(s\)/);
    for (const variant of ["A", "B", "C"]) expect(result.text).toContain(`variant ${variant}: stored:gi_`);

    const { nodes, edges } = canvas();
    const previews = nodes.filter((node) => node.type === "preview");
    expect(previews.map((node) => node.data.label).sort()).toEqual(["Variante A", "Variante B", "Variante C"]);
    for (const preview of previews) {
      expect(preview.data.genStatus).toBe("done");
      expect((preview.data.generatedImages as string[])[0]).toMatch(/^\/api\/generated-images\/image\?id=/);
    }
    expect(edges.filter((edge) => edge.source === "gen").map((edge) => edge.sourceHandle).sort()).toEqual(["result", "result-b", "result-c"]);
    const generator = nodes.find((node) => node.id === "gen")!;
    expect(Object.keys(generator.data.generatedImagesByVariant as object).sort()).toEqual(["A", "B", "C"]);
    expect(generator.data.generatedImages).toEqual((generator.data.generatedImagesByVariant as Record<string, string[]>).A);

    const tied = getDb().prepare("SELECT COUNT(*) AS n FROM generated_images WHERE project_id = ?").get(projectId) as { n: number };
    expect(tied.n).toBe(3);
    expect(nodes.filter((node) => node.type === "prompt")).toHaveLength(3);
  });

  it("redoes a single variant when asked", async () => {
    await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "prompt-a", type: "prompt", data: { prompt: "Concept A" } },
          { id: "prompt-b", type: "prompt", data: { prompt: "Concept B" } },
          { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
        ],
        edges: [
          { source: "prompt-a", target: "gen", targetHandle: "prompt-in" },
          { source: "prompt-b", target: "gen", targetHandle: "prompt-in-b" },
        ],
      },
    });
    const result = await call("run_generator", { project_id: projectId, node_id: "gen", variants: ["B"] });
    expect(result.isError).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentPrompts()[0]).toContain("Concept B");
    expect(canvas().nodes.filter((node) => node.type === "preview").map((node) => node.data.label)).toEqual(["Variante B"]);
  });

  it("spends nothing when a variant has no prompt, the project is unknown or there is no generator", async () => {
    expect((await call("run_generator", { project_id: "proj_missing" })).isError).toBe(true);
    const empty = await call("run_generator", { project_id: projectId });
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain("no generator");

    await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: { nodes: [{ id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } }], edges: [] },
    });
    const noPrompt = await call("run_generator", { project_id: projectId });
    expect(noPrompt.isError).toBe(true);
    expect(noPrompt.text).toContain("no prompt");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(canvas().nodes.filter((node) => node.type === "preview")).toHaveLength(0);
  });

  it("reports a provider failure without touching the canvas", async () => {
    await applyWorkflowTool.handler({
      project_id: projectId,
      blueprint: {
        nodes: [
          { id: "prompt-a", type: "prompt", data: { prompt: "Concept A" } },
          { id: "gen", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } },
        ],
        edges: [{ source: "prompt-a", target: "gen", targetHandle: "prompt-in" }],
      },
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "insufficient credits" } }), { status: 402 }));
    const result = await call("run_generator", { project_id: projectId });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("FAILED");
    expect(canvas().nodes.filter((node) => node.type === "preview")).toHaveLength(0);
  });
});
