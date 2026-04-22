import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOGOS_DIR = path.join(process.cwd(), "data", "logos");
const MANIFEST_FILE = path.join(LOGOS_DIR, "manifest.json");

type LogoEntry = { filename: string; label: string; size: number };

export async function POST(request: NextRequest) {
  try {
    const { filename, label } = await request.json();
    if (!filename || !label) {
      return NextResponse.json({ error: "Missing filename or label" }, { status: 400 });
    }

    if (!fs.existsSync(MANIFEST_FILE)) {
      return NextResponse.json({ error: "No logos" }, { status: 404 });
    }

    const entries: LogoEntry[] = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
    const entry = entries.find((e) => e.filename === filename);
    if (!entry) {
      return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    }

    entry.label = label;
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(entries, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Rename logo error:", err);
    return NextResponse.json({ error: "Rename failed" }, { status: 500 });
  }
}
