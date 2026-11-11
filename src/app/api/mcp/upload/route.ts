import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { verifyLink } from "@/lib/agent/mcp/signed-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stay under the Next.js 16 ~10MB proxy body cap. */
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

function sniffImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * POST /api/mcp/upload?token=… — raw image bytes as the body
 * (`curl --data-binary @file`). The token comes from the `create_upload_link`
 * MCP tool; no cookie or bearer is needed. Stores the image in the
 * inspirations library and answers its `stored:sf_<id>` ref.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const payload = verifyLink(req.nextUrl.searchParams.get("token"), "upload");
  if (!payload) return Response.json({ error: "Lien d'import invalide ou expiré." }, { status: 401 });

  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Image trop lourde (9 Mo maximum)." }, { status: 413 });
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return Response.json({ error: "Corps vide : envoie les octets de l'image." }, { status: 400 });
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Image trop lourde (9 Mo maximum)." }, { status: 413 });
  }
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) return Response.json({ error: "Format non reconnu : PNG, JPEG ou WebP." }, { status: 415 });

  const id = uuid();
  getDb()
    .prepare("INSERT INTO swipe_files (id, title, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, payload.title, mimeType, bytes.length, bytes);

  return Response.json({ ref: `stored:sf_${id}`, title: payload.title, mimeType, bytes: bytes.length });
}
