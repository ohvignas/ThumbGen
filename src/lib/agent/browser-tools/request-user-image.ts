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
    "Asks the user to upload an image (logo or reference). The browser opens a file picker. Never for the creator's face — Personnages only. The conversation suspends until they upload OR skip. Chat-only, not MCP. Don't call finish_turn in the same step.",
  inputSchema: requestUserImageInputSchema,
};
