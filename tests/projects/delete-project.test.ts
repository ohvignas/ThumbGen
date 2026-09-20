import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createProject, deleteProject, saveProject, ProjectNotFoundError } from "@/lib/local-storage";
import { createConversation, appendMessage } from "@/lib/agent/conversation/store";
import { saveGeneratedImage } from "@/lib/generated-images";
import { saveCompetitorSearch } from "@/lib/brief/competitor-search-store";
import { DELETE } from "@/app/api/projects/route";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function count(sql: string, id: string): number {
  return (getDb().prepare(sql).get(id) as { n: number }).n;
}

describe("deleteProject", () => {
  it("removes conversations, messages, images and competitor searches with the project", () => {
    const { id } = createProject("À supprimer");
    const conversation = createConversation(id, "Chat");
    appendMessage({
      conversation_id: conversation.id,
      role: "user",
      content_json: '[{"type":"text","text":"hi"}]',
      interrupted: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cost_estimate: 0,
    });
    saveCompetitorSearch(conversation.id, []);
    saveGeneratedImage(PNG, id);

    deleteProject(id);

    expect(count("SELECT COUNT(*) AS n FROM projects_meta WHERE id = ?", id)).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM projects WHERE id = ?", id)).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM conversations WHERE project_id = ?", id)).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?", conversation.id)).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM generated_images WHERE project_id = ?", id)).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM competitor_search_results WHERE conversation_id = ?", conversation.id)).toBe(0);
  });

  it("does not let a later save recreate a gallery card named after the id", () => {
    const { id } = createProject("Ghost");
    deleteProject(id);
    expect(() => saveProject(id, [], [])).toThrow(ProjectNotFoundError);
    expect(getDb().prepare("SELECT name FROM projects_meta WHERE id = ?").get(id)).toBeUndefined();
  });
});

describe("DELETE /api/projects", () => {
  it("deletes the project through the gallery API", async () => {
    const { id } = createProject("API delete");
    const res = await DELETE(new NextRequest(`http://localhost/api/projects?id=${id}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(getDb().prepare("SELECT 1 AS ok FROM projects_meta WHERE id = ?").get(id)).toBeUndefined();
  });
});
