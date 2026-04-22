import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const FACES_DIR = path.join(process.cwd(), "data", "face-reactions");
const MANIFEST_FILE = path.join(FACES_DIR, "manifest.json");

type FaceEntry = {
  filename: string;
  label: string;
  size: number;
};

function ensureDir() {
  if (!fs.existsSync(FACES_DIR)) {
    fs.mkdirSync(FACES_DIR, { recursive: true });
  }
}

function readManifest(): FaceEntry[] {
  ensureDir();
  if (!fs.existsSync(MANIFEST_FILE)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")) as FaceEntry[];
}

function writeManifest(entries: FaceEntry[]) {
  ensureDir();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// GET /api/face-reactions — list all uploaded faces
export async function GET() {
  const entries = readManifest();
  return NextResponse.json(entries);
}

// POST /api/face-reactions — upload via base64 JSON (bypasses middleware body limit)
export async function POST(request: NextRequest) {
  try {
    const { dataUrl, label = "Face", ext = "jpg" } = await request.json();

    if (!dataUrl) {
      return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });
    }

    // Strip data URL prefix: "data:image/jpeg;base64,..." → raw base64
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const filename = `${uuid()}.${ext}`;

    ensureDir();
    fs.writeFileSync(path.join(FACES_DIR, filename), buffer);

    const entries = readManifest();
    entries.push({ filename, label, size: buffer.length });
    writeManifest(entries);

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    console.error("Upload face error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// DELETE /api/face-reactions?filename=xxx.png — remove a face image
export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) {
      return NextResponse.json({ error: "No filename" }, { status: 400 });
    }

    const filePath = path.join(FACES_DIR, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const entries = readManifest().filter((e) => e.filename !== filename);
    writeManifest(entries);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete face error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
