import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { v4 as uuid } from "uuid";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import "@/lib/agent/tools/all";
import { listTools } from "@/lib/agent/tools";
import { getDb } from "@/lib/db";
import { listCanvasSnapshots } from "@/lib/canvas-snapshots";
import { interviewHandle, placeInterviewNode, placeNodeInputSchema } from "@/lib/agent/place-node";
import { PLACE_NODE_TOOL_NAME, buildPlaceNodeTool } from "@/lib/agent/v2/place-node-tool";
import { nextUpdatedAt, type CanvasPatch } from "@/lib/canvas/canvas-patch";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type Node = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type Edge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string };

let projectId: string;
let personaId: string;
let logoId: string;
let swipeId: string;

function canvas() {
  const row = getDb().prepare("SELECT nodes, edges, updated_at FROM projects WHERE id = ?").get(projectId) as {
    nodes: string;
    edges: string;
    updated_at: string;
  };
  return { nodes: JSON.parse(row.nodes) as Node[], edges: JSON.parse(row.edges) as Edge[], updatedAt: row.updated_at };
}

/** A user save: like saveProject, updated_at never goes back (placements can stamp a few ms ahead of the clock). */
function setCanvas(nodes: unknown[], edges: unknown[] = []) {
  const row = getDb().prepare("SELECT updated_at FROM projects WHERE id = ?").get(projectId) as { updated_at: string } | undefined;
  getDb()
    .prepare("UPDATE projects SET nodes = ?, edges = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(nodes), JSON.stringify(edges), nextUpdatedAt(row?.updated_at), projectId);
}

const node = (id: string) => canvas().nodes.find((n) => n.id === id);
const place = (value: unknown) => placeInterviewNode(projectId, placeNodeInputSchema.parse({ node: value }));

async function placed(value: unknown) {
  const outcome = await place(value);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

beforeEach(() => {
  // createProject's id is proj_<Date.now()>: two tests in the same millisecond would collide.
  projectId = `proj_test_${uuid()}`;
  const createdAt = new Date().toISOString();
  getDb().prepare("INSERT INTO projects_meta (id, name, description, created_at, updated_at) VALUES (?, ?, '', ?, ?)").run(projectId, "Interview", createdAt, createdAt);
  getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(projectId, createdAt);
  personaId = uuid();
  getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(personaId, "Antoine");
  getDb()
    .prepare("INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)")
    .run(uuid(), personaId, "front", "image/png", PNG.length, PNG);
  logoId = uuid();
  getDb().prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)").run(logoId, "Claude", "image/png", PNG.length, PNG);
  swipeId = uuid();
  getDb().prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)").run(swipeId, "Réf", "image/png", PNG.length, PNG);
  setCanvas([{ id: "user-1", type: "prompt", position: { x: 100, y: 50 }, data: { prompt: "Mon idée" } }]);
});

describe("place_node — merge into the project", () => {
  it("creates iv-prompt right of the existing canvas with one ISO timestamp everywhere", async () => {
    const previousUpdatedAt = canvas().updatedAt;
    const outcome = await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "Un visage choqué" } });
    const saved = canvas();
    const prompt = node("iv-prompt")!;
    expect(prompt.position).toEqual({ x: 100 + 320 + 200 + 420, y: 50 });
    expect(prompt.data.prompt).toBe("Un visage choqué");
    expect(saved.updatedAt).toMatch(ISO);
    expect(prompt.data.placedByAgentAt).toBe(saved.updatedAt);
    const meta = getDb().prepare("SELECT updated_at FROM projects_meta WHERE id = ?").get(projectId) as { updated_at: string };
    expect(meta.updated_at).toBe(saved.updatedAt);
    expect(outcome.created).toBe(true);
    expect(outcome.patch).toEqual({
      projectId,
      updatedAt: saved.updatedAt,
      previousUpdatedAt,
      created: true,
      node: prompt,
      removedDataKeys: [],
      edges: [],
    });
    expect(prompt.data.agentCreatedAt).toBe(saved.updatedAt);
    expect(node("user-1")).toEqual({ id: "user-1", type: "prompt", position: { x: 100, y: 50 }, data: { prompt: "Mon idée" } });
    expect(listCanvasSnapshots(projectId).map((s) => s.reason)).toEqual(["place_node"]);
  });

  it("updates an existing node: position and other fields kept", async () => {
    await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "Premier jet" } });
    const moved = canvas();
    const prompt = moved.nodes.find((n) => n.id === "iv-prompt")!;
    prompt.position = { x: 5, y: 6 };
    prompt.data.negativePrompt = "flou";
    setCanvas(moved.nodes, moved.edges);

    const outcome = await placed({ id: "iv-prompt", type: "prompt", prompt: "Texte « ÇA CHANGE TOUT »" });
    const updated = node("iv-prompt")!;
    expect(outcome.created).toBe(false);
    expect(updated.position).toEqual({ x: 5, y: 6 });
    expect(updated.data).toMatchObject({ prompt: "Texte « ÇA CHANGE TOUT »", negativePrompt: "flou" });
    expect(updated.data.placedByAgentAt).toBe(canvas().updatedAt);
    // The patch carries only what changed.
    expect(outcome.patch).toMatchObject({ created: false, removedDataKeys: [] });
    expect(outcome.patch.node.data).toEqual({ prompt: "Texte « ÇA CHANGE TOUT »", placedByAgentAt: canvas().updatedAt });
    expect(outcome.patch.node.position).toEqual({ x: 5, y: 6 });
  });

  it("lists the data keys a replaced image removes", async () => {
    await placed({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${swipeId}` } });
    const inline = `data:image/png;base64,${PNG.toString("base64")}`;
    const outcome = await placed({ id: "iv-ref-1", type: "swipeFile", data: { image_source: inline } });
    expect(outcome.patch.removedDataKeys).toEqual(["imageUrl"]);
    expect(outcome.patch.node.data).toMatchObject({ imageBase64: inline, image_source: inline });
    expect(node("iv-ref-1")!.data.imageUrl).toBeUndefined();
  });

  it("refuses to update a node deleted while the call was running", async () => {
    await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "x" } });
    const pending = place({ id: "iv-prompt", type: "prompt", data: { prompt: "y" } });
    const current = canvas();
    setCanvas(current.nodes.filter((n) => n.id !== "iv-prompt"), current.edges);
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toContain("nœud supprimé entre-temps");
    expect(node("iv-prompt")).toBeUndefined();
  });

  it("stacks the inputs in the left column with library URLs and persona angles", async () => {
    await placed({ id: "iv-persona", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } });
    await placed({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${swipeId}` } });
    await placed({ id: "iv-logo-1", type: "swipeFile", data: { image_source: `stored:lg_${logoId}` } });
    const left = 100 + 320 + 200;
    expect(node("iv-persona")!.position).toEqual({ x: left, y: 50 });
    expect((node("iv-persona")!.data.personaAngles as Record<string, string>).front).toBe(
      `/api/personas/image?id=${personaId}&angle=front`,
    );
    expect(node("iv-ref-1")!.position).toEqual({ x: left, y: 50 + 240 });
    expect(node("iv-ref-1")!.data).toMatchObject({ imageUrl: `/api/swipe-files/image?f=${swipeId}`, kind: "reference" });
    expect(node("iv-ref-1")!.data.imageBase64).toBeUndefined();
    expect(node("iv-logo-1")!.position).toEqual({ x: left, y: 50 + 480 });
    expect(node("iv-logo-1")!.data).toMatchObject({ imageUrl: `/api/logos/image?f=${logoId}`, kind: "logo" });
  });

  it("links every interview node once the generator arrives, then each new input", async () => {
    await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "x" } });
    await placed({ id: "iv-persona", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } });
    await placed({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${swipeId}` } });
    await placed({ id: "iv-logo-1", type: "swipeFile", data: { kind: "logo", image_source: `stored:lg_${logoId}` } });
    expect(canvas().edges).toEqual([]);

    const generator = await placed({ id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } });
    const left = 100 + 320 + 200;
    expect(node("iv-generator")!.position).toEqual({ x: left + 840, y: 50 });
    expect(node("iv-generator")!.data).toMatchObject({ model: "gemini-3.1-flash-image", numImages: 1 });
    const links = (edges: Edge[]) => edges.map((e) => `${e.source}>${e.target}:${e.targetHandle}`).sort();
    const expected = [
      "iv-logo-1>iv-generator:logo-in",
      "iv-persona>iv-generator:face-in",
      "iv-prompt>iv-generator:prompt-in",
      "iv-ref-1>iv-generator:ref-in",
    ];
    expect(links(canvas().edges)).toEqual(expected);
    expect(links(generator.patch.edges)).toEqual(expected);
    expect(generator.patch.edges.every((e) => e.sourceHandle === null && /^e-/.test(e.id))).toBe(true);
    expect(generator.linkedToGenerator).toBe(true);

    const again = await placed({ id: "iv-generator", type: "generator", data: { count: 2 } });
    expect(again.patch.edges).toEqual([]);
    expect(canvas().edges).toHaveLength(4);

    const ref2 = await placed({ id: "iv-ref-2", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${swipeId}` } });
    expect(links(ref2.patch.edges)).toEqual(["iv-ref-2>iv-generator:ref-in"]);
    expect(ref2.linkedToGenerator).toBe(true);
    expect(canvas().edges).toHaveLength(5);
  });

  it("never re-adds a link the user removed, but links recreated nodes", async () => {
    await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "x" } });
    await placed({ id: "iv-persona", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } });
    await placed({ id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } });
    expect(canvas().edges).toHaveLength(2);

    // Antoine disconnects the prompt; the agent keeps completing the interview.
    let current = canvas();
    setCanvas(current.nodes, current.edges.filter((e) => e.source !== "iv-prompt"));
    const promptUpdate = await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "y" } });
    expect(promptUpdate.patch.edges).toEqual([]);
    expect(promptUpdate.linkedToGenerator).toBe(false);
    const generatorUpdate = await placed({ id: "iv-generator", type: "generator", data: { count: 2 } });
    expect(generatorUpdate.patch.edges).toEqual([]);
    expect(canvas().edges.map((e) => e.source)).toEqual(["iv-persona"]);

    // A new input is linked once; a recreated input is linked again.
    const ref = await placed({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${swipeId}` } });
    expect(ref.patch.edges.map((e) => e.targetHandle)).toEqual(["ref-in"]);
    expect(ref.patch.node.data.agentLinks).toEqual([{ node: "iv-generator", handle: "ref-in", at: ref.patch.updatedAt }]);
    current = canvas();
    setCanvas(current.nodes.filter((n) => n.id !== "iv-prompt"), current.edges);
    const recreated = await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "z" } });
    expect(recreated.patch.edges.map((e) => e.source)).toEqual(["iv-prompt"]);

    // A recreated generator (second interview after « repartir de zéro ») links everything again.
    current = canvas();
    setCanvas(current.nodes.filter((n) => n.id !== "iv-generator"), []);
    const generator = await placed({ id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } });
    expect(generator.patch.edges.map((e) => e.source).sort()).toEqual(["iv-persona", "iv-prompt", "iv-ref-1"]);
  });

  it("never duplicates an edge the user already drew", async () => {
    await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "x" } });
    const current = canvas();
    setCanvas(
      [...current.nodes, { id: "iv-generator", type: "generator", position: { x: 0, y: 0 }, data: { model: "gemini-3.1-flash-image" } }],
      [{ id: "user-edge", source: "iv-prompt", target: "iv-generator", sourceHandle: null, targetHandle: "prompt-in" }],
    );
    const outcome = await placed({ id: "iv-prompt", type: "prompt", data: { prompt: "y" } });
    expect(outcome.patch.edges).toEqual([]);
    expect(canvas().edges.map((e) => e.id)).toEqual(["user-edge"]);
  });

  it("recreates a deleted input at the first free slot", async () => {
    await placed({ id: "iv-persona", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } });
    await placed({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: `stored:sf_${swipeId}` } });
    const current = canvas();
    setCanvas(current.nodes.filter((n) => n.id !== "iv-persona"), current.edges);
    const outcome = await placed({ id: "iv-persona", type: "faceReference", data: { image_source: `stored:persona_${personaId}` } });
    expect(outcome.created).toBe(true);
    expect(node("iv-persona")!.position).toEqual({ x: 100 + 320 + 200, y: 50 });
  });

  it("places on an empty canvas from the origin", async () => {
    setCanvas([]);
    await placed({ id: "iv-generator", type: "generator", data: { model: "seedream", aspectRatio: "16x9" } });
    expect(node("iv-generator")!.position).toEqual({ x: 840, y: 0 });
  });
});

describe("place_node — errors write nothing", () => {
  const unchanged = async (value: unknown, message: RegExp) => {
    const before = canvas();
    const outcome = await placeInterviewNode(projectId, { node: value } as never);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatch(message);
    expect(canvas()).toEqual(before);
  };

  it("rejects ids, types and kinds outside the interview", async () => {
    await unchanged({ id: "prompt-1", type: "prompt", data: { prompt: "x" } }, /iv-/);
    await unchanged({ id: "iv-ref-1", type: "swipeFile", data: { kind: "logo", image_source: `stored:lg_${logoId}` } }, /reference/);
    await unchanged({ id: "iv-prompt", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } }, /prompt/);
    await unchanged(
      { id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9", abTest: { variants: ["A", "B"] } } },
      /A\/B/,
    );
  });

  it("rejects invalid data and missing images", async () => {
    await unchanged({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference" } }, /image_source/);
    await unchanged({ id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: "stored:sf_missing" } }, /not found/);
    await unchanged({ id: "iv-generator", type: "generator", data: { model: "grok", aspectRatio: "16x9" } }, /model/);
  });

  it("refuses to change the type of an existing node and an unknown project", async () => {
    setCanvas([{ id: "iv-prompt", type: "sketch", position: { x: 0, y: 0 }, data: {} }]);
    await unchanged({ id: "iv-prompt", type: "prompt", data: { prompt: "x" } }, /already exists/);
    const outcome = await placeInterviewNode("proj_missing", { node: { id: "iv-prompt", type: "prompt", data: { prompt: "x" } } } as never);
    expect(outcome).toEqual({ ok: false, error: expect.stringMatching(/Project not found/) });
  });
});

describe("buildPlaceNodeTool", () => {
  const options = { toolCallId: "call-1", messages: [] } as never;

  it("writes the patch once on success and answers the node id", async () => {
    const writePatch = vi.fn<(patch: CanvasPatch) => void>();
    const tool = buildPlaceNodeTool({ projectId, writePatch });
    const output = await tool.execute!({ node: { id: "iv-prompt", type: "prompt", data: { prompt: "x" } } }, options);
    expect(writePatch).toHaveBeenCalledTimes(1);
    expect(writePatch.mock.calls[0][0]).toMatchObject({ projectId, node: { id: "iv-prompt" } });
    expect(output).toEqual({ content: [{ type: "text", text: "node id: iv-prompt" }] });
    const model = await tool.toModelOutput!({ toolCallId: "call-1", input: {}, output } as never);
    expect(model).toEqual({ type: "content", value: [{ type: "text", text: "node id: iv-prompt" }] });
  });

  it("mentions the generator link", async () => {
    const tool = buildPlaceNodeTool({ projectId, writePatch: () => {} });
    await tool.execute!({ node: { id: "iv-prompt", type: "prompt", data: { prompt: "x" } } }, options);
    const output = await tool.execute!({ node: { id: "iv-generator", type: "generator", data: { model: "nano-banana", aspectRatio: "16x9" } } }, options);
    expect(JSON.stringify(output)).toContain("linked to iv-generator");
  });

  it("never writes a patch on failure and gives the model an error text", async () => {
    const writePatch = vi.fn();
    const tool = buildPlaceNodeTool({ projectId, writePatch });
    const output = await tool.execute!({ node: { id: "iv-ref-1", type: "swipeFile", data: { kind: "reference", image_source: "stored:sf_missing" } } }, options);
    expect(writePatch).not.toHaveBeenCalled();
    const model = await tool.toModelOutput!({ toolCallId: "call-1", input: {}, output } as never);
    expect(model).toMatchObject({ type: "error-text" });
  });

  it("keeps the success when the patch cannot be broadcast", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const tool = buildPlaceNodeTool({
      projectId,
      writePatch: () => {
        throw new Error("stream closed");
      },
    });
    const output = await tool.execute!({ node: { id: "iv-prompt", type: "prompt", data: { prompt: "x" } } }, options);
    error.mockRestore();
    expect(output).toEqual({ content: [{ type: "text", text: "node id: iv-prompt" }] });
    expect(node("iv-prompt")).toBeDefined();
  });

  it("has a JSON-schema-convertible input and stays out of the registry", () => {
    expect(() => z.toJSONSchema(placeNodeInputSchema)).not.toThrow();
    expect(listTools().map((t) => t.name)).not.toContain(PLACE_NODE_TOOL_NAME);
    expect(interviewHandle({ type: "swipeFile", data: { kind: "logo" } })).toBe("logo-in");
    expect(interviewHandle({ type: "swipeFile", data: { kind: "reference" } })).toBe("ref-in");
    expect(interviewHandle({ type: "faceReference", data: {} })).toBe("face-in");
    expect(interviewHandle({ type: "prompt", data: {} })).toBe("prompt-in");
    expect(interviewHandle({ type: "generator", data: {} })).toBeNull();
  });
});
