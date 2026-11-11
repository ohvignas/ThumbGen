import crypto from "crypto";
import { z } from "zod";
import { createProject } from "@/lib/local-storage";
import { listSkillCatalog, readSkillBody } from "@/lib/agent/skills/catalog";
import { imageExists } from "@/lib/agent/tools/_helpers/image-source";
import type { ToolResult } from "@/lib/agent/tools/types";
import { absoluteLink, signLink, SIGNED_LINK_TTL_SECONDS } from "./signed-links";
import { runGeneratorOnServer } from "./run-generator";

/**
 * Tools only an external MCP client needs: it has no ThumbGen window, so it
 * cannot read the skills catalog from a system prompt, create a miniature from
 * the gallery, drop a file on the canvas, click « Générer » or download a
 * result. Kept out of the chat registry on purpose — in the app the user does
 * those things, and the chat agent never starts a paid generation.
 */

export const MCP_WORKFLOW_SKILL = "mcp-workflow";

const MCP_WORKFLOW_GUIDE = `# mcp-workflow

End-to-end thumbnail production from an MCP client (Claude Code, Claude Desktop…), with no ThumbGen window open.

## Order

1. \`create_project\` — one miniature (canvas) per video. Returns \`proj_<id>\` and its page \`/m/<id>\`.
2. References
   - Face: \`list_personas\` → \`stored:persona_<id>\`. A face is always a Personnage, never a one-off photo. No Personnage yet: the user creates it in Bibliothèque → Personnages.
   - Local image (mockup, screenshot, inspiration): \`create_upload_link\`, then run the curl command it returns. The response gives \`stored:sf_<id>\`.
   - Already in the library: \`list_swipe_files\`, \`list_logos\`, \`list_past_generations\`.
3. \`apply_workflow\` — put the nodes on the canvas (read the \`apply_workflow\` and \`create-prompt\` skills first). Several concepts for one video: ONE generator with \`abTest: { variants: ["A","B","C"] }\`, a shared \`faceReference\` on \`face-in\`, and one prompt + one reference per variant (\`prompt-in\` / \`ref-in\`, \`prompt-in-b\` / \`ref-in-b\`, \`prompt-in-c\` / \`ref-in-c\`).
4. \`run_generator\` — PAID. Only when the user asked for images. One image per variant × \`count\`. Returns one \`stored:gi_<id>\` per image and adds the Aperçu nodes to the canvas.
5. \`view_canvas_images\` — look at every result before showing it: face unchanged, every word spelled exactly, nothing important in the bottom-right corner (YouTube duration badge).
6. Fix: update the prompt node with \`apply_workflow\` (same node id), then \`run_generator\` again with \`variants: ["B"]\` to redo one variant only. Do not loop: two retries, then report.
7. \`export_image\` — a download link cropped to the exact size (default 1280×720, under 2 MB). Fetch it with the curl command returned.

## Rules

- Never call \`run_generator\` or \`generate_sketch\` to explore. Each call costs money.
- \`generate_sketch\` is a draft (composition check). The deliverable comes from \`run_generator\`.
- Text on the thumbnail: write the exact words in the prompt, in quotes, accents included, and say that no other text may appear. Prefer the \`openai\` model when the text has accents or more than two words.
- Links from \`create_upload_link\` and \`export_image\` expire after ${SIGNED_LINK_TTL_SECONDS / 60} minutes. Ask for a new one rather than reusing an old one.
- Skills marked chat-only (\`finish_turn\`, \`ask_user\`, \`place_node\`, \`request_user_image\`, \`list_followed_videos\`, \`research_topic\`) describe tools of the in-app chat that this server does not expose.
`;

const VARIANT = z.enum(["A", "B", "C"]);

const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });
const error = (value: string): ToolResult => ({ isError: true, content: [{ type: "text", text: value }] });

function safeFileName(raw: string | undefined, fallback: string, ext: string): string {
  const stem = (raw ?? "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${stem || fallback}.${ext}`;
}

export type McpWorkflowTool = {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
};

function tool<S extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  shape: S;
  run: (input: z.output<z.ZodObject<S>>) => Promise<ToolResult>;
}): McpWorkflowTool {
  const schema = z.object(def.shape);
  return {
    name: def.name,
    description: def.description,
    shape: def.shape,
    run: async (args) => {
      const parsed = schema.safeParse(args ?? {});
      if (!parsed.success) {
        return error(`Invalid arguments: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
      }
      return def.run(parsed.data);
    },
  };
}

export const MCP_WORKFLOW_TOOLS: McpWorkflowTool[] = [
  tool({
    name: "list_skills",
    description:
      "Lists ThumbGen's skills (name + one-line description): how each tool and workflow is meant to be used. Call it first, then read_skill for the ones you need. Start with mcp-workflow: the end-to-end order from an MCP client.",
    shape: {},
    run: async () => {
      const lines = [
        `- ${MCP_WORKFLOW_SKILL} — End-to-end thumbnail production from an MCP client: create_project, create_upload_link, apply_workflow, run_generator, view_canvas_images, export_image. Read this one first.`,
        ...listSkillCatalog().map((skill) => `- ${skill.name} — ${skill.description}`),
      ];
      return text(`${lines.length} skill(s). Load one with read_skill(name):\n${lines.join("\n")}`);
    },
  }),
  tool({
    name: "read_skill",
    description:
      "Loads the full instructions of one skill by its exact name from list_skills (e.g. mcp-workflow, apply_workflow, create-prompt, thumbnail-packaging). Read a skill before the first use of that tool or workflow. Unknown name is refused.",
    shape: { name: z.string().trim().min(1).max(80).describe("Exact skill name from list_skills.") },
    run: async ({ name }) => {
      if (name === MCP_WORKFLOW_SKILL) return text(MCP_WORKFLOW_GUIDE);
      const body = readSkillBody(name);
      if (body) return text(body);
      const known = [MCP_WORKFLOW_SKILL, ...listSkillCatalog().map((skill) => skill.name)].join(", ");
      return error(`Unknown skill "${name}". Known: ${known}`);
    },
  }),
  tool({
    name: "create_project",
    description:
      "Creates a new empty miniature (project + canvas) with the given name and returns its proj_<id> and page URL. Use when the user asks for a new project. Then build its canvas with apply_workflow. Not linked to a video fiche (for that: link_studio_miniature).",
    shape: {
      name: z.string().trim().min(1).max(120).describe("Project name as shown in the Miniatures gallery."),
      description: z.string().trim().max(2000).optional(),
    },
    run: async ({ name, description }) => {
      const created = createProject(name, description ?? "");
      return text(`Project created: ${created.id} — "${created.name}"\nPage: ${absoluteLink(`/m/${created.id}`)}`);
    },
  }),
  tool({
    name: "create_upload_link",
    description:
      "Returns a one-time-use style signed link to import ONE local image (PNG, JPEG or WebP, 9 MB max) into the inspirations library, plus the curl command to run. The upload answers stored:sf_<id>: wire it as swipeFile kind=reference (or sketch) with apply_workflow. Use for a mockup, a screenshot or a reference file that sits on the user's machine. Not for a face (Personnages only). One link per file; the link expires after 15 minutes.",
    shape: {
      title: z.string().trim().min(1).max(160).describe("Name of the image in the library, e.g. the file name."),
    },
    run: async ({ title }) => {
      const token = signLink({ t: "upload", title, n: crypto.randomBytes(8).toString("hex") });
      const url = absoluteLink(`/api/mcp/upload?token=${token}`);
      return text(
        [
          `Upload link for "${title}" (valid ${SIGNED_LINK_TTL_SECONDS / 60} min):`,
          url,
          "",
          "Send the file as the raw request body:",
          `curl -sS -X POST --data-binary @"/path/to/file" -H "Content-Type: application/octet-stream" "${url}"`,
          "",
          'The JSON answer holds "ref": "stored:sf_<id>".',
        ].join("\n"),
      );
    },
  }),
  tool({
    name: "run_generator",
    description:
      "PAID. Runs a canvas generator node as the « Générer » button does and returns one stored:gi_<id> per image; the Aperçu nodes are added to the canvas. Use only when the user asked for the images to be generated, after apply_workflow built the workflow. Cost = model price × images (count × variants). node_id may be omitted when the canvas has a single generator. variants limits an A/B/C generator to some variants (e.g. [\"B\"] to redo one). Takes 30–120 s. Never call it to explore, and do not loop retries.",
    shape: {
      project_id: z.string().min(4).max(80),
      node_id: z.string().min(1).max(120).optional().describe("Generator node id from apply_workflow / get_canvas_state."),
      variants: z.array(VARIANT).min(1).max(3).optional().describe("Only these variants of an A/B/C generator."),
    },
    run: async (input) => runGeneratorOnServer(input),
  }),
  tool({
    name: "export_image",
    description:
      "Returns a signed download link for one image at an exact pixel size (centre-cropped to fit), plus the curl command to save it. Use to deliver a final thumbnail as a file. source is a stored:gi_<id> from run_generator / list_past_generations (also accepts generated:sk_<id>, stored:sf_<id>). Defaults: 1280×720 JPEG, kept under 2 MB (YouTube's limit). The link expires after 15 minutes.",
    shape: {
      source: z.string().min(4).max(200).describe("stored:gi_<id>, generated:sk_<id> or stored:sf_<id>."),
      width: z.number().int().min(64).max(3840).optional(),
      height: z.number().int().min(64).max(2160).optional(),
      format: z.enum(["jpg", "png"]).optional(),
      filename: z.string().max(120).optional().describe("File name without path, e.g. A_seo-geo."),
    },
    run: async ({ source, width, height, format, filename }) => {
      if (!/^(stored:(gi|sf|lg)_[\w-]+|generated:[\w-]+)$/.test(source) || !imageExists(source)) {
        return error(`Image not found: ${source}. Pass a stored:gi_<id> from run_generator or list_past_generations.`);
      }
      const fmt = format ?? "jpg";
      const w = width ?? 1280;
      const h = height ?? 720;
      const name = safeFileName(filename, "miniature", fmt);
      const token = signLink({ t: "export", src: source, w, h, fmt, name });
      const url = absoluteLink(`/api/mcp/export?token=${token}`);
      return text(
        [
          `Export link for ${source} — ${w}×${h} ${fmt.toUpperCase()}, under 2 MB (valid ${SIGNED_LINK_TTL_SECONDS / 60} min):`,
          url,
          "",
          `curl -sS -f -o "${name}" "${url}"`,
        ].join("\n"),
      );
    },
  }),
];
