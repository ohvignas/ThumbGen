import { describe, it, expect, vi } from "vitest";
import { v4 as uuid } from "uuid";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { getDb } from "@/lib/db";
import { createConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief } from "@/lib/brief/store";
import { TOOL_LABELS } from "@/lib/agent/tool-labels";
import { UPDATE_BRIEF_TOOL_NAME, buildUpdateBriefTool, executeUpdateBrief } from "@/lib/agent/v2/update-brief-tool";
import { pkg } from "../brief/fixtures";

const text = (result: { content: Array<{ type: string; text?: string }> }) => result.content.map((c) => c.text ?? "").join("\n");

function context() {
  const conversation = createConversation("proj-update-brief");
  const writeBriefUpdated = vi.fn();
  return { conversationId: conversation.id, projectId: conversation.project_id, writeBriefUpdated };
}

describe("update_brief", () => {
  it("writes the brief, answers its summary and broadcasts the new step", () => {
    const ctx = context();
    const result = executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ step: 4, video: { promise: "Savoir cliquer", script: "long script" } }));
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/^Fiche enregistrée \(étape 4\/7\)\./);
    expect(text(result)).not.toContain("long script");
    const stored = getBrief(ctx.conversationId)!;
    expect(stored.brief.video.promise).toBe("Savoir cliquer");
    expect(ctx.writeBriefUpdated).toHaveBeenCalledWith({ conversationId: ctx.conversationId, step: 4, updatedAt: stored.updatedAt });
  });

  it("refuses an invalid brief with readable reasons, without writing nor broadcasting", () => {
    const ctx = context();
    const result = executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ variant: { key: "A", set: pkg({ thumbnailText: "a b c d e" }) } }));
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Fiche refusée, rien n'a été enregistré :\n- variants.A.thumbnailText : Texte de miniature : 4 mots maximum");
    expect(getBrief(ctx.conversationId)).toBeNull();
    expect(ctx.writeBriefUpdated).not.toHaveBeenCalled();
  });

  it("keeps the write when the broadcast fails", () => {
    const ctx = context();
    ctx.writeBriefUpdated.mockImplementation(() => {
      throw new Error("stream closed");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ step: 2 }));
    errorSpy.mockRestore();
    expect(result.isError).toBeFalsy();
    expect(getBrief(ctx.conversationId)?.brief.step).toBe(2);
  });

  it("returns the warnings to rephrase", () => {
    const ctx = context();
    const result = executeUpdateBrief(
      ctx,
      briefUpdateInputSchema.parse({ variant: { key: "A", set: pkg({ title: "Claude remplace Figma pour le design", thumbnailText: "FIGMA DESIGN" }) } }),
    );
    expect(text(result)).toContain("- Variante A : le texte « FIGMA DESIGN » répète le titre (figma, design).");
  });

  it("attaches a recorded sketch", () => {
    const ctx = context();
    const id = `sk_${uuid().replace(/-/g, "")}`;
    getDb().prepare("INSERT INTO generated_sketches (id, prompt, mime_type, data) VALUES (?, 'p', 'image/png', ?)").run(id, Buffer.from("x"));
    executeUpdateBrief(ctx, briefUpdateInputSchema.parse({ variant: { key: "A", set: { ...pkg(), sketch: { source: `generated:${id}`, status: "pending" } } } }));
    expect((getDb().prepare("SELECT attached FROM generated_sketches WHERE id = ?").get(id) as { attached: number }).attached).toBe(1);
  });

  it("is an AI SDK tool with the update schema and a label", async () => {
    const ctx = context();
    const tool = buildUpdateBriefTool(ctx);
    const schema = tool.inputSchema as { safeParse: (value: unknown) => { success: boolean } };
    expect(schema.safeParse({ variant: { key: "A", set: pkg() } }).success).toBe(true);
    expect(schema.safeParse({ step: 8 }).success).toBe(false);
    const output = await tool.execute!({ step: 3 }, { toolCallId: "u1", messages: [] } as never);
    expect(text(output as never)).toMatch(/étape 3\/7/);
    expect(UPDATE_BRIEF_TOOL_NAME).toBe("update_brief");
    expect(TOOL_LABELS.update_brief).toBe("Met à jour la fiche");
  });
});
