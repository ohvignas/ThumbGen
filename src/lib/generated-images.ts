import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const GEN_DIR = path.join(process.cwd(), "data", "generated");

function ensureDir() {
  if (!fs.existsSync(GEN_DIR)) {
    fs.mkdirSync(GEN_DIR, { recursive: true });
  }
}

/**
 * Save a base64 data URL image to disk.
 * Returns { id, url } where url is the API path to serve the image.
 */
export function saveGeneratedImage(dataUrl: string): { id: string; url: string } {
  ensureDir();

  const id = uuid();
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");

  // Detect format from data URL
  const mimeMatch = dataUrl.match(/^data:image\/(\w+);/);
  const ext = mimeMatch?.[1] === "jpeg" ? "jpg" : mimeMatch?.[1] || "png";
  const filename = `${id}.${ext}`;

  fs.writeFileSync(path.join(GEN_DIR, filename), buffer);

  return {
    id,
    url: `/api/generated-images/image?f=${filename}`,
  };
}

/**
 * Get the file path for a generated image by filename.
 */
export function getGeneratedImagePath(filename: string): string | null {
  const safeName = path.basename(filename);
  const filePath = path.join(GEN_DIR, safeName);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}
