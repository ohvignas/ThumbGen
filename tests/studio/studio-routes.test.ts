import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createStudioVideo } from "@/lib/studio/store";
import { GET as listVideos, POST as createVideo } from "@/app/api/studio/videos/route";
import { GET as getVideo, PATCH as patchVideo, DELETE as deleteVideo } from "@/app/api/studio/videos/[videoId]/route";
import { POST as importVideos } from "@/app/api/studio/import/route";

beforeEach(() => {
  getDb().exec("DELETE FROM studio_drafts");
  getDb().exec("DELETE FROM studio_videos");
  createStudioVideo({ title: "Grok Bot", etiquette: "En prod" });
});

describe("studio routes", () => {
  it("lists videos, creates one, and patches a draft", async () => {
    const listed = await (await listVideos()).json();
    expect(listed).toHaveLength(1);
    expect(listed[0].etiquette).toBe("En prod");
    expect(listed[0].videoId).toMatch(/^vid_/);

    const createdRes = await createVideo(
      new Request("http://localhost/api/studio/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Nouvelle idée", etiquette: "Propositions" }),
      }),
    );
    const created = await createdRes.json();
    expect(created.title).toBe("Nouvelle idée");
    expect(created.summary).toBe("");
    expect(created.draft.description).toBe("");

    const req = new Request(`http://localhost/api/studio/videos/${created.videoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ script: "## 1. Introduction\nHook." }),
    });
    const patched = await (await patchVideo(req, { params: Promise.resolve({ videoId: created.videoId }) })).json();
    expect(patched.draft.script).toContain("Hook");
  });

  it("imports a CSV once", async () => {
    const res = await importVideos(
      new Request("http://localhost/api/studio/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: "Nom,URL,Étiquettes\nImportée,,Pas commencer\n" }),
      }),
    );
    const body = await res.json();
    expect(body.imported).toBe(1);
  });

  it("accepts a create-dialog description as project summary, not YouTube copy", async () => {
    const createdRes = await createVideo(
      new Request("http://localhost/api/studio/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "OpenClaw est mort",
          description: "Le sujet, l'angle, le public visé…",
          etiquette: "Propositions",
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json();
    expect(created.title).toBe("OpenClaw est mort");
    expect(created.summary).toBe("Le sujet, l'angle, le public visé…");
    expect(created.draft.description).toBe("");
    expect(created.etiquette).toBe("Propositions");
  });

  it("creates with Sans titre when the title is empty", async () => {
    const createdRes = await createVideo(
      new Request("http://localhost/api/studio/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "  ", description: "Note de projet" }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json();
    expect(created.title).toBe("Sans titre");
    expect(created.summary).toBe("Note de projet");
  });

  it("patches title and project summary, and keeps YouTube description on draft patches", async () => {
    const listed = await (await listVideos()).json();
    const videoId = listed[0].videoId as string;

    const summaryRes = await patchVideo(
      new Request(`http://localhost/api/studio/videos/${videoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Grok Bot v2", summary: "Nouveau résumé" }),
      }),
      { params: Promise.resolve({ videoId }) },
    );
    const withSummary = await summaryRes.json();
    expect(withSummary.title).toBe("Grok Bot v2");
    expect(withSummary.summary).toBe("Nouveau résumé");
    expect(withSummary.draft.description).toBe("");

    const aliasRes = await patchVideo(
      new Request(`http://localhost/api/studio/videos/${videoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: "Résumé via description" }),
      }),
      { params: Promise.resolve({ videoId }) },
    );
    expect((await aliasRes.json()).summary).toBe("Résumé via description");

    const draftRes = await patchVideo(
      new Request(`http://localhost/api/studio/videos/${videoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script: "## Hook", description: "Description YouTube" }),
      }),
      { params: Promise.resolve({ videoId }) },
    );
    const drafted = await draftRes.json();
    expect(drafted.summary).toBe("Résumé via description");
    expect(drafted.draft.description).toBe("Description YouTube");
  });

  it("deletes a video then 404s on GET", async () => {
    const listed = await (await listVideos()).json();
    const videoId = listed[0].videoId as string;
    const deleted = await deleteVideo(new Request(`http://localhost/api/studio/videos/${videoId}`), {
      params: Promise.resolve({ videoId }),
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ success: true });

    const missing = await getVideo(new Request(`http://localhost/api/studio/videos/${videoId}`), {
      params: Promise.resolve({ videoId }),
    });
    expect(missing.status).toBe(404);

    const again = await deleteVideo(new Request(`http://localhost/api/studio/videos/${videoId}`), {
      params: Promise.resolve({ videoId }),
    });
    expect(again.status).toBe(404);
  });
});
