import { z } from "zod";
import { getDb } from "@/lib/db";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { BlueprintSchema } from "@/lib/agent/blueprint/schema";
import { diffBlueprints } from "@/lib/agent/blueprint/diff";
import { autoLayout } from "./_helpers/auto-layout";
import { resolveImageSource, markAttached } from "./_helpers/image-source";

const InputSchema = z.object({
  project_id: z.string(),
  blueprint: z.unknown(),  // validated via BlueprintSchema below for better error formatting
});

export const applyWorkflowTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "apply_workflow",
  description:
    "Replaces or modifies the canvas workflow for a project. Provide a complete Blueprint (nodes + edges) and the diff against the current state determines what's created/updated/deleted. Always read get_canvas_state first if you want to preserve existing nodes (re-include their ids in the new blueprint). Image references must be valid `stored:<lg|sf|fr|gi>_<id>`, `generated:<id>`, `uploaded:<id>` or `data:image/...` URIs.",
  inputSchema: InputSchema,
  handler: async ({ project_id, blueprint }) => {
    // 1. Validate the blueprint structure
    const parsed = BlueprintSchema.safeParse(blueprint);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `Invalid blueprint:\n${JSON.stringify(parsed.error.format(), null, 2)}` }],
      };
    }
    const target = parsed.data;

    // 2. Validate every image_source resolves
    for (const node of target.nodes) {
      const src = (node.data as { image_source?: string }).image_source;
      if (src) {
        try {
          await resolveImageSource(src);
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text", text: `Image source unresolvable on node ${node.id}: ${(e as Error).message}` }],
          };
        }
      }
    }

    // 3. Load current canvas state
    const row = getDb().prepare("SELECT nodes, edges FROM projects WHERE id = ?").get(project_id) as
      | { nodes: string; edges: string }
      | undefined;
    const current = row
      ? { nodes: JSON.parse(row.nodes), edges: JSON.parse(row.edges) }
      : { nodes: [], edges: [] };

    // 4. Compute the diff (logical only — apply still replaces wholesale)
    const ops = diffBlueprints(current, target);

    // 5. Auto-layout the target (v1: re-layout everything; existing positions not preserved)
    const positioned = autoLayout(target.nodes, target.edges);

    // 6. Persist (UPDATE for existing projects, INSERT for new)
    if (row) {
      getDb()
        .prepare("UPDATE projects SET nodes = ?, edges = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(positioned), JSON.stringify(target.edges), project_id);
    } else {
      getDb()
        .prepare("INSERT INTO projects (id, nodes, edges) VALUES (?, ?, ?)")
        .run(project_id, JSON.stringify(positioned), JSON.stringify(target.edges));
    }

    // 7. Mark referenced uploads/sketches as attached (skip GC)
    for (const node of target.nodes) {
      const src = (node.data as { image_source?: string }).image_source;
      if (src) markAttached(src);
    }

    // 8. Return summary to the agent
    const summary = `Applied: ${ops.create.length} created, ${ops.update.length} updated, ${ops.delete.length} deleted.`;
    return {
      content: [
        { type: "text", text: `${summary}\nCurrent nodes: ${target.nodes.map((n) => n.id).join(", ")}` },
      ],
    };
  },
};

registerTool(applyWorkflowTool);
