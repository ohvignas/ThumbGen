import { NextRequest } from "next/server";
import { verifyLink } from "@/lib/agent/mcp/signed-links";
import { resolveImageSource } from "@/lib/agent/tools/_helpers/image-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_PIXELS = 80_000_000;
/** YouTube refuses thumbnails over 2 MB. */
const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITIES = [92, 88, 84, 78, 70, 60];

/**
 * GET /api/mcp/export?token=… — the image named by an `export_image` MCP
 * link, cropped to the exact requested size and kept under 2 MB.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const payload = verifyLink(req.nextUrl.searchParams.get("token"), "export");
  if (!payload) return Response.json({ error: "Lien d'export invalide ou expiré." }, { status: 401 });

  let source: { mimeType: string; bytes: Buffer };
  try {
    source = await resolveImageSource(payload.src);
  } catch {
    return Response.json({ error: `Image introuvable : ${payload.src}` }, { status: 404 });
  }

  try {
    const { default: sharp } = await import("sharp");
    const base = () =>
      sharp(source.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: payload.w, height: payload.h, fit: "cover", position: "centre" });

    let out: Buffer;
    let mimeType: string;
    if (payload.fmt === "png") {
      out = await base().png({ compressionLevel: 9 }).toBuffer();
      mimeType = "image/png";
      if (out.length > MAX_EXPORT_BYTES) {
        // Palette PNG keeps flat thumbnail colours and usually lands well under the cap.
        out = await base().png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
      }
    } else {
      mimeType = "image/jpeg";
      out = Buffer.alloc(0);
      for (const quality of JPEG_QUALITIES) {
        out = await base().flatten({ background: "#000000" }).jpeg({ quality, mozjpeg: true }).toBuffer();
        if (out.length <= MAX_EXPORT_BYTES) break;
      }
    }

    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(out.length),
        "Content-Disposition": `attachment; filename="${payload.name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[mcp-export] failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "Export impossible (redimensionnement en échec)." }, { status: 500 });
  }
}
