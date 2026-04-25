import { z } from "zod";

export const requestUserSketchInputSchema = z.object({
  reason: z.string(),
  initial_image_id: z.string().optional(),
});

export type RequestUserSketchInput = z.infer<typeof requestUserSketchInputSchema>;
export type RequestUserSketchOutput = { generated_id: string } | { skipped: true };

export const requestUserSketchTool = {
  name: "request_user_sketch" as const,
  description:
    "Asks the user to draw a quick sketch of their thumbnail idea. The browser opens the SketchEditor. The conversation suspends until the user validates OR skips. NOT available to remote MCP clients — only the in-app chat panel. If `initial_image_id` is provided, the editor opens with that image as a starting point.",
  inputSchema: requestUserSketchInputSchema,
};
