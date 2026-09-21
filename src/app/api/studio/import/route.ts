import { NextResponse } from "next/server";
import { importStudioCsv, importStudioMarkdown } from "@/lib/studio/import";
import { isEtiquette } from "@/lib/studio/types";
import { rejectNonJsonRequest } from "@/lib/youtube/route-errors";

export const runtime = "nodejs";

type ImportBody = {
  csv?: unknown;
  title?: unknown;
  markdown?: unknown;
  etiquette?: unknown;
  youtubeUrl?: unknown;
};

export async function POST(request: Request) {
  const notJson = rejectNonJsonRequest(request);
  if (notJson) return notJson;
  const body = (await request.json().catch(() => null)) as ImportBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requête JSON attendue" }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : undefined;
  const markdown = typeof body.markdown === "string" ? body.markdown : undefined;
  const hasCsv = csv !== undefined;
  const hasMarkdown = markdown !== undefined;
  if (hasCsv === hasMarkdown) {
    return NextResponse.json({ error: "Fournir csv ou markdown, pas les deux" }, { status: 400 });
  }

  if (body.etiquette != null && (typeof body.etiquette !== "string" || !isEtiquette(body.etiquette))) {
    return NextResponse.json({ error: "Étiquette inconnue" }, { status: 400 });
  }

  if (hasCsv) {
    return NextResponse.json(importStudioCsv(csv));
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  const result = importStudioMarkdown({
    title,
    markdown: markdown ?? "",
    etiquette: typeof body.etiquette === "string" && isEtiquette(body.etiquette) ? body.etiquette : null,
    youtubeUrl: typeof body.youtubeUrl === "string" ? body.youtubeUrl : null,
  });
  return NextResponse.json(result);
}
