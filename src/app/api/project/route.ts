import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getProject, saveProject, getProjectCoverUrl, liveProjectCanvas, FlowNode, FlowEdge, ProjectNotFoundError } from "@/lib/local-storage";
import { persistNodesForSave, PROJECT_SAVE_MAX_BYTES } from "@/lib/canvas/persist-snapshot";
import { parseGeneratedImageIds, rehydratePreviewImages } from "@/lib/canvas/rehydrate-preview-images";
import { listProjectGenerationImages } from "@/lib/generations-log";
import { isOversizedGenerateError, PAYLOAD_TOO_LARGE_FR } from "@/lib/generation/generate-error";
import { debugLog } from "@/lib/debug-log";

const emptyCanvas = {
  nodes: [] as FlowNode[],
  edges: [] as FlowEdge[],
  updatedAt: null as string | null,
  coverImageUrl: null as string | null,
  deletedNodeIds: [] as string[],
  deletedEdgeIds: [] as string[],
};

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("id") || "default";
    const project = getProject(projectId);
    const coverImageUrl = getProjectCoverUrl(projectId);
    if (!project) {
      debugLog("canvas-load", "missing", { projectId });
      return NextResponse.json(emptyCanvas);
    }
    const tombstones = {
      nodeIds: project.deletedNodeIds ?? [],
      edgeIds: project.deletedEdgeIds ?? [],
    };
    const live = liveProjectCanvas(project, tombstones);
    const hydrated = rehydratePreviewImages(
      live.nodes,
      listProjectGenerationImages(projectId).map((row) => ({
        prompt: row.prompt,
        imageIds: parseGeneratedImageIds(row.generatedImageIds),
        createdAt: row.createdAt,
      })),
      { deletedNodeIds: tombstones.nodeIds },
    );
    debugLog("canvas-load", "GET", {
      projectId,
      nodes: hydrated.nodes.length,
      edges: live.edges.length,
      updatedAt: project.updatedAt,
      deletedNodeIds: tombstones.nodeIds,
      restoredPreviews: hydrated.restored,
    });
    return NextResponse.json({
      nodes: hydrated.nodes,
      edges: live.edges,
      updatedAt: project.updatedAt ?? null,
      coverImageUrl,
      deletedNodeIds: tombstones.nodeIds,
      deletedEdgeIds: tombstones.edgeIds,
    });
  } catch (err) {
    console.error("Load project error:", err);
    debugLog("canvas-load", "GET failed", { error: err instanceof Error ? err.message : "error" }, "error");
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

type ProjectSaveBody = {
  projectId?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  /** The `updated_at` the client's canvas was based on (chantier F2): agent nodes placed after it are kept. */
  baseUpdatedAt?: unknown;
  /** Node ids the client deleted on purpose — never reinject, even if the payload is stale. */
  deletedNodeIds?: unknown;
  deletedEdgeIds?: unknown;
};

async function readProjectSaveBody(
  request: NextRequest,
): Promise<{ ok: true; body: ProjectSaveBody } | { ok: false; error: string; status: number }> {
  const headerLen = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(headerLen) && headerLen > PROJECT_SAVE_MAX_BYTES) {
    return { ok: false, error: PAYLOAD_TOO_LARGE_FR, status: 413 };
  }
  let text: string;
  try {
    text = await request.text();
  } catch (err) {
    return {
      ok: false,
      error: isOversizedGenerateError(err) ? PAYLOAD_TOO_LARGE_FR : "Failed to save project",
      status: isOversizedGenerateError(err) ? 413 : 400,
    };
  }
  if (text.length > PROJECT_SAVE_MAX_BYTES) {
    return { ok: false, error: PAYLOAD_TOO_LARGE_FR, status: 413 };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Failed to save project", status: 400 };
    }
    return { ok: true, body: parsed as ProjectSaveBody };
  } catch (err) {
    return {
      ok: false,
      error: isOversizedGenerateError(err) ? PAYLOAD_TOO_LARGE_FR : "Failed to save project",
      status: isOversizedGenerateError(err) ? 413 : 400,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await readProjectSaveBody(request);
    if (!parsed.ok) {
      debugLog("canvas-save", "POST failed", { error: parsed.error, status: parsed.status }, "error");
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const { projectId = "default", nodes, edges, baseUpdatedAt, deletedNodeIds, deletedEdgeIds } = parsed.body;
    const cleanNodes = persistNodesForSave(nodes || []) as FlowNode[];
    const { updatedAt, reinjected, reinjectedEdges, refreshed, removed, deletedNodeIds: savedDeletedNodeIds, deletedEdgeIds: savedDeletedEdgeIds, unchanged } =
      saveProject(
        projectId,
        cleanNodes,
        edges || [],
        typeof baseUpdatedAt === "string" ? baseUpdatedAt : null,
        { nodeIds: deletedNodeIds, edgeIds: deletedEdgeIds },
      );
    if (!unchanged) {
      debugLog("canvas-save", "POST", {
        projectId,
        nodes: (nodes || []).length,
        edges: (edges || []).length,
        baseUpdatedAt: typeof baseUpdatedAt === "string" ? baseUpdatedAt : null,
        deletedNodeIds: savedDeletedNodeIds,
        updatedAt,
        reinjected: reinjected.map((node) => node.id),
        refreshed: refreshed.map((node) => node.id),
        removed,
      });
    }
    return NextResponse.json({
      success: true,
      updatedAt,
      reinjected,
      reinjectedEdges,
      refreshed,
      removed,
      deletedNodeIds: savedDeletedNodeIds,
      deletedEdgeIds: savedDeletedEdgeIds,
      unchanged,
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      debugLog("canvas-save", "POST 404", { error: err.message }, "error");
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (isOversizedGenerateError(err)) {
      debugLog("canvas-save", "POST failed", { error: PAYLOAD_TOO_LARGE_FR, status: 413 }, "error");
      return NextResponse.json({ error: PAYLOAD_TOO_LARGE_FR }, { status: 413 });
    }
    console.error("Save project error:", err);
    debugLog("canvas-save", "POST failed", { error: err instanceof Error ? err.message : "error" }, "error");
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}
