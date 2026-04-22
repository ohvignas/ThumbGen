import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const LOGOS_DIR = path.join(process.cwd(), "data", "logos");
const MANIFEST_FILE = path.join(LOGOS_DIR, "manifest.json");

type LogoEntry = {
  filename: string;
  label: string;
  size: number;
};

function ensureDir() {
  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
  }
}

function readManifest(): LogoEntry[] {
  ensureDir();
  if (!fs.existsSync(MANIFEST_FILE)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")) as LogoEntry[];
}

function writeManifest(entries: LogoEntry[]) {
  ensureDir();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readManifest());
}

export async function POST(request: NextRequest) {
  try {
    const { dataUrl, label = "Logo", ext = "png" } = await request.json();
    if (!dataUrl) {
      return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });
    }

    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const filename = `${uuid()}.${ext}`;

    ensureDir();
    fs.writeFileSync(path.join(LOGOS_DIR, filename), buffer);

    const entries = readManifest();
    entries.push({ filename, label, size: buffer.length });
    writeManifest(entries);

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    console.error("Upload logo error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename");
    if (!filename) {
      return NextResponse.json({ error: "No filename" }, { status: 400 });
    }

    const filePath = path.join(LOGOS_DIR, path.basename(filename));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    const entries = readManifest().filter((e) => e.filename !== filename);
    writeManifest(entries);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete logo error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
