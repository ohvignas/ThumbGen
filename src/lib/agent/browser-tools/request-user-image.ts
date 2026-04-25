import { z } from "zod";

export const requestUserImageInputSchema = z.object({
  reason: z.string(),
  suggested_kind: z.enum(["face", "logo", "reference", "any"]).optional(),
});

export type RequestUserImageInput = z.infer<typeof requestUserImageInputSchema>;
export type RequestUserImageOutput = { source_ids: string[] } | { skipped: true };

export const requestUserImageTool = {
  name: "request_user_image" as const,
  description:
    "Asks the user to upload an image (face, logo, or reference). The browser opens a file picker. The conversation suspends until the user uploads OR explicitly skips. NOT available to remote MCP clients — only the in-app chat panel.",
  inputSchema: requestUserImageInputSchema,
};
