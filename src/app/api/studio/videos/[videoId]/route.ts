import { NextResponse } from "next/server";
import { emptyStudioDraft } from "@/lib/studio/page-template";
import { deleteStudioVideo, getStudioVideo, saveStudioDraft, updateStudioVideo } from "@/lib/studio/store";
import { isEtiquette, type StudioDraft, type TitleVariant } from "@/lib/studio/types";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

type VideoParams = { params: Promise<{ videoId: string }> };

type PatchBody = {
  script?: unknown;
  description?: unknown;
  summary?: unknown;
  titleVariants?: unknown;
  etiquette?: unknown;
  title?: unknown;
  youtubeUrl?: unknown;
};

function parseTitleVariants(value: unknown): StudioDraft["titleVariants"] | null {
  if (!Array.isArray(value)) return null;
  const variants = emptyStudioDraft().titleVariants;
  for (let i = 0; i < 3; i += 1) {
    const row = value[i] as TitleVariant | undefined;
    variants[i] = {
      title: typeof row?.title === "string" ? row.title : "",
      thumbText: typeof row?.thumbText === "string" ? row.thumbText : "",
      visualConcept: typeof row?.visualConcept === "string" ? row.visualConcept : "",
    };
  }
  return variants;
}

export async function GET(_request: Request, { params }: VideoParams) {
  const { videoId } = await params;
  const video = getStudioVideo(videoId);
  if (!video) return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
  return NextResponse.json(video);
}

export async function PATCH(request: Request, { params }: VideoParams) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const { videoId } = await params;
  const existing = getStudioVideo(videoId);
  if (!existing) return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requête JSON attendue" }, { status: 400 });
  }

  if (body.etiquette !== undefined && body.etiquette !== null && (typeof body.etiquette !== "string" || !isEtiquette(body.etiquette))) {
    return NextResponse.json({ error: "Étiquette inconnue" }, { status: 400 });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  }
  if (body.youtubeUrl !== undefined && body.youtubeUrl !== null && typeof body.youtubeUrl !== "string") {
    return NextResponse.json({ error: "URL YouTube invalide" }, { status: 400 });
  }

  const hasDraftFields = body.script !== undefined || body.titleVariants !== undefined;
  const descriptionIsDraft = body.description !== undefined && hasDraftFields;
  const summaryFromDescription =
    !descriptionIsDraft && body.summary === undefined && typeof body.description === "string";

  if (hasDraftFields || descriptionIsDraft) {
    const titleVariants =
      body.titleVariants !== undefined ? parseTitleVariants(body.titleVariants) : existing.draft.titleVariants;
    if (body.titleVariants !== undefined && !titleVariants) {
      return NextResponse.json({ error: "titleVariants invalides" }, { status: 400 });
    }
    saveStudioDraft(videoId, {
      script: typeof body.script === "string" ? body.script : existing.draft.script,
      description: descriptionIsDraft && typeof body.description === "string" ? body.description : existing.draft.description,
      titleVariants: titleVariants ?? existing.draft.titleVariants,
    });
  }

  const summary =
    typeof body.summary === "string"
      ? body.summary.trim()
      : summaryFromDescription && typeof body.description === "string"
        ? body.description.trim()
        : undefined;

  const hasMetaPatch =
    body.title !== undefined || summary !== undefined || body.etiquette !== undefined || body.youtubeUrl !== undefined;
  if (hasMetaPatch) {
    try {
      const updated = updateStudioVideo(videoId, {
        title: typeof body.title === "string" ? body.title : undefined,
        summary,
        etiquette:
          body.etiquette === undefined
            ? undefined
            : body.etiquette === null
              ? null
              : isEtiquette(body.etiquette)
                ? body.etiquette
                : undefined,
        youtubeUrl:
          body.youtubeUrl === undefined ? undefined : typeof body.youtubeUrl === "string" ? body.youtubeUrl : undefined,
      });
      if (!updated) return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      if (message === "Étiquette inconnue") {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw err;
    }
  }

  return NextResponse.json(getStudioVideo(videoId));
}

export async function DELETE(_request: Request, { params }: VideoParams) {
  const { videoId } = await params;
  if (!deleteStudioVideo(videoId)) {
    return NextResponse.json({ error: "Vidéo introuvable" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
