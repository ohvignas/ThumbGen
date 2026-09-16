import fs from "fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolveBackupPath } from "@/lib/data-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const filePath = resolveBackupPath(name);
  if (!filePath) return NextResponse.json({ error: "Sauvegarde inconnue" }, { status: 400 });
  try {
    const size = fs.statSync(filePath).size;
    const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    console.error("Download backup error:", err);
    return NextResponse.json({ error: "Téléchargement impossible" }, { status: 500 });
  }
}
