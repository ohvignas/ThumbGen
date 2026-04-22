import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const SWIPE_DIR = path.join(process.cwd(), "data", "swipe-files");
const MANIFEST_FILE = path.join(SWIPE_DIR, "manifest.json");

type SwipeEntry = {
  filename: string;
  title: string;
  size: number;
};

function ensureDir() {
  if (!fs.existsSync(SWIPE_DIR)) {
    fs.mkdirSync(SWIPE_DIR, { recursive: true });
  }
}

function readManifest(): SwipeEntry[] {
  ensureDir();
  if (!fs.existsSync(MANIFEST_FILE)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")) as SwipeEntry[];
}

function writeManifest(entries: SwipeEntry[]) {
  ensureDir();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// GET /api/swipe-files — list all uploaded swipe files
export async function GET() {
  const entries = readManifest();
  return NextResponse.json(entries);
}

// POST /api/swipe-files — upload via base64 JSON (bypasses middleware body limit)
export async function POST(request: NextRequest) {
  try {
    const { dataUrl, title = "Reference", ext = "jpg" } = await request.json();

    if (!dataUrl) {
      return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });
    }

    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const filename = `${uuid()}.${ext}`;

    ensureDir();
    fs.writeFileSync(path.join(SWIPE_DIR, filename), buffer);

    const entries = readManifest();
    entries.push({ filename, title, size: buffer.length });
    writeManifest(entries);

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    console.error("Upload swipe file error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// DELETE /api/swipe-files?filename=xxx.png — remove a swipe file
export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) {
      return NextResponse.json({ error: "No filename" }, { status: 400 });
    }

    const filePath = path.join(SWIPE_DIR, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const entries = readManifest().filter((e) => e.filename !== filename);
    writeManifest(entries);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete swipe file error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
