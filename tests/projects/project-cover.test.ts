import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { getProjectCoverUrl, listProjects, setProjectCover } from "@/lib/local-storage";
import { saveGeneratedImage } from "@/lib/generated-images";
import { PATCH } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/project/route";
import { GET as getMiniatures } from "@/app/api/miniatures/route";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeProject(name: string): { id: string } {
  const id = `proj_cover_${uuid()}`;
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO projects_meta (id, name, description, created_at, updated_at) VALUES (?, ?, '', ?, ?)").run(id, name, now, now);
  getDb().prepare("INSERT INTO projects (id, nodes, edges, updated_at) VALUES (?, '[]', '[]', ?)").run(id, now);
  return { id };
}

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/projects?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("setProjectCover", () => {
  it("stores one winner per project and replaces the previous", () => {
    const { id } = makeProject("Cover me");
    const first = saveGeneratedImage(PNG, id);
    const second = saveGeneratedImage(PNG, id);

    expect(getProjectCoverUrl(id)).toBeNull();
    expect(setProjectCover(id, first.url)).toBe("ok");
    expect(getProjectCoverUrl(id)).toBe(first.url);
    expect(listProjects().find((p) => p.id === id)?.coverImageUrl).toBe(first.url);

    expect(setProjectCover(id, second.url)).toBe("ok");
    expect(getProjectCoverUrl(id)).toBe(second.url);
  });

  it("rejects data URLs, missing images, and images from another project", () => {
    const a = makeProject("Cover A");
    const b = makeProject("Cover B");
    const other = saveGeneratedImage(PNG, b.id);

    expect(setProjectCover(a.id, "data:image/png;base64,AAAA")).toBe("invalid");
    expect(setProjectCover(a.id, "/api/generated-images/image?id=00000000-0000-0000-0000-000000000000")).toBe("invalid");
    expect(setProjectCover(a.id, other.url)).toBe("invalid");
    expect(setProjectCover("proj_missing", other.url)).toBe("not_found");
    expect(getProjectCoverUrl(a.id)).toBeNull();
  });
});

describe("PATCH /api/projects coverImageUrl", () => {
  it("sets the cover through the project API", async () => {
    const { id } = makeProject("API cover");
    const image = saveGeneratedImage(PNG, id);
    const res = await patch(id, { coverImageUrl: image.url });
    expect(res.status).toBe(200);
    expect(getProjectCoverUrl(id)).toBe(image.url);
  });

  it("returns 400 for a sketch or data URL", async () => {
    const { id } = makeProject("Bad cover");
    const res = await patch(id, { coverImageUrl: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(400);
    expect(getProjectCoverUrl(id)).toBeNull();
  });
});

describe("cover on load and gallery", () => {
  it("GET /api/project and /api/miniatures expose the cover URL", async () => {
    const { id } = makeProject("Gallery cover");
    const image = saveGeneratedImage(PNG, id);
    expect(setProjectCover(id, image.url)).toBe("ok");

    const projectRes = await getProject(new NextRequest(`http://localhost/api/project?id=${id}`));
    expect(await projectRes.json()).toMatchObject({ coverImageUrl: image.url });

    const gallery = (await (await getMiniatures()).json()) as Array<{ id: string; coverImageUrl: string | null }>;
    expect(gallery.find((p) => p.id === id)?.coverImageUrl).toBe(image.url);
  });

  it("GET /api/project answers coverImageUrl null when none is set", async () => {
    const { id } = makeProject("No cover");
    const res = await getProject(new NextRequest(`http://localhost/api/project?id=${id}`));
    expect(await res.json()).toMatchObject({ coverImageUrl: null });
  });
});
