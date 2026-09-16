import { describe, it, expect } from "vitest";
import { GET as listPersonas, POST as createPersona } from "@/app/api/personas/route";
import { DELETE as deletePersona, PATCH as renamePersona } from "@/app/api/personas/[id]/route";
import { POST as savePhoto } from "@/app/api/personas/[id]/photos/route";
import { getDb } from "@/lib/db";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=";

function jsonRequest(url: string, method: string, body?: unknown): never {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) });

type PersonaRow = { id: string; label: string; angles: string[] };

async function personas(): Promise<PersonaRow[]> {
  return (await (await listPersonas()).json()) as PersonaRow[];
}

async function create(label: string, photos: Record<string, string>): Promise<Response> {
  return createPersona(jsonRequest("http://localhost/api/personas", "POST", { label, photos }));
}

describe("POST /api/personas", () => {
  it("refuses a Personnage without any photo", async () => {
    const before = (getDb().prepare("SELECT COUNT(*) AS n FROM personas").get() as { n: number }).n;
    const res = await create("Sans photo", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Ajoute au moins une photo du personnage.");
    const noPhotosKey = await createPersona(jsonRequest("http://localhost/api/personas", "POST", { label: "Rien" }));
    expect(noPhotosKey.status).toBe(400);
    const after = (getDb().prepare("SELECT COUNT(*) AS n FROM personas").get() as { n: number }).n;
    expect(after).toBe(before);
  });

  it("creates a Personnage from the front photo alone", async () => {
    const res = await create("Face seule", { front: PNG });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect((await personas()).find((persona) => persona.id === id)?.angles).toEqual(["front"]);
  });
});

describe("managing a Personnage", () => {
  it("renames, replaces an angle and deletes with its photos", async () => {
    const { id } = (await (await create("Avant", { front: PNG })).json()) as { id: string };

    const renamed = await renamePersona(jsonRequest(`http://localhost/api/personas/${id}`, "PATCH", { label: "Après" }), withId(id));
    expect(renamed.status).toBe(200);
    expect((await personas()).find((persona) => persona.id === id)?.label).toBe("Après");

    const left = await savePhoto(jsonRequest(`http://localhost/api/personas/${id}/photos`, "POST", { angle: "left", dataUrl: PNG }), withId(id));
    expect(left.status).toBe(200);
    const front = await savePhoto(jsonRequest(`http://localhost/api/personas/${id}/photos`, "POST", { angle: "front", dataUrl: PNG }), withId(id));
    expect(front.status).toBe(200);
    expect((await personas()).find((persona) => persona.id === id)?.angles).toEqual(["front", "left"]);
    const frontRows = getDb().prepare("SELECT COUNT(*) AS n FROM persona_photos WHERE persona_id = ? AND angle = 'front'").get(id) as { n: number };
    expect(frontRows.n).toBe(1);

    const removed = await deletePersona(jsonRequest(`http://localhost/api/personas/${id}`, "DELETE"), withId(id));
    expect(removed.status).toBe(200);
    expect((await personas()).some((persona) => persona.id === id)).toBe(false);
    const photos = getDb().prepare("SELECT COUNT(*) AS n FROM persona_photos WHERE persona_id = ?").get(id) as { n: number };
    expect(photos.n).toBe(0);
  });
});
