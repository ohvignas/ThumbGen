import { describe, it, expect, beforeEach } from "vitest";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { POST } from "@/app/api/swipe-files/rename/route";

let id: string;

function rename(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/swipe-files/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const titleOf = (swipeId: string) =>
  (getDb().prepare("SELECT title FROM swipe_files WHERE id = ?").get(swipeId) as { title: string }).title;

beforeEach(() => {
  getDb().exec("DELETE FROM swipe_files");
  id = uuid();
  getDb()
    .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, "Ancien titre", "image/jpeg", 3, Buffer.from([1, 2, 3]));
});

describe("POST /api/swipe-files/rename", () => {
  it("renames an image with a trimmed title", async () => {
    const res = await rename({ filename: id, title: "  Nouveau titre  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(titleOf(id)).toBe("Nouveau titre");
  });

  it("accepts a legacy <id>.<ext> filename", async () => {
    expect((await rename({ filename: `${id}.jpg`, title: "Avec extension" })).status).toBe(200);
    expect(titleOf(id)).toBe("Avec extension");
  });

  it("rejects a missing, blank or too long title and a bad body", async () => {
    expect((await rename({ filename: id })).status).toBe(400);
    expect((await rename({ filename: id, title: "   " })).status).toBe(400);
    expect((await rename({ title: "Sans fichier" })).status).toBe(400);
    expect((await rename({ filename: id, title: "x".repeat(201) })).status).toBe(400);
    expect((await rename("pas du json")).status).toBe(400);
    expect(titleOf(id)).toBe("Ancien titre");
  });

  it("answers 404 for an unknown image", async () => {
    const res = await rename({ filename: "inconnu", title: "Titre" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Image introuvable" });
  });
});
