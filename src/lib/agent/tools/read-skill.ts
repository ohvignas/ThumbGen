import { z } from "zod";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";
import { listSkillCatalog, readSkillBody } from "@/lib/agent/skills/catalog";

export const READ_SKILL_TOOL_NAME = "read_skill";

const InputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Exact skill name from the SKILLS catalog (e.g. apply_workflow, thumbnail-packaging)."),
});

export const readSkillTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: READ_SKILL_TOOL_NAME,
  description:
    "Loads the full instructions for one skill. Call it before using an unfamiliar tool or workflow (new thumbnail, existing canvas, research, competitors, sketches). Pass the name exactly as listed under SKILLS. Do not load every skill at once. Unknown name is refused.",
  inputSchema: InputSchema,
  chatOnly: true,
  handler: async ({ name }) => {
    const body = readSkillBody(name);
    if (!body) {
      const known = listSkillCatalog()
        .map((skill) => skill.name)
        .join(", ");
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown skill "${name}". Known: ${known}` }],
      };
    }
    return { content: [{ type: "text", text: body }] };
  },
};

registerTool(readSkillTool);
