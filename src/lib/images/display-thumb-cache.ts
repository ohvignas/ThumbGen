import fs from "fs";
import path from "path";
import { getDbFilePath } from "@/lib/db";
import { DISPLAY_THUMB_WIDTH } from "@/lib/images/display-thumb";

const MAX_INPUT_PIXELS = 80_000_000;
/** One resize at a time: a 5504×3072 decode is large, and the VPS container is capped at 2 GB. */
const MAX_CONCURRENT = 1;

type Gate = {
  active: number;
  waiters: Array<() => void>;
  inflight: Map<string, Promise<Buffer>>;
};

function gate(): Gate {
  const g = globalThis as typeof globalThis & { __thumbgenDisplayThumb?: Gate };
  if (!g.__thumbgenDisplayThumb) {
    g.__thumbgenDisplayThumb = { active: 0, waiters: [], inflight: new Map() };
  }
  return g.__thumbgenDisplayThumb;
}

function cacheDir(): string {
  return path.join(path.dirname(getDbFilePath()), "cache", "image-thumbs");
}

export function thumbCacheKey(kind: "gi" | "sk", id: string, byteLength: number): string | null {
  if (!/^[\w-]+$/.test(id)) return null;
  if (!Number.isInteger(byteLength) || byteLength < 0) return null;
  return `${kind}_${id}_${byteLength}_w${DISPLAY_THUMB_WIDTH}`;
}

function cacheFile(key: string): string {
  return path.join(cacheDir(), `${key}.jpg`);
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const state = gate();
  if (state.active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => state.waiters.push(resolve));
  }
  state.active += 1;
  try {
    return await fn();
  } finally {
    state.active -= 1;
    state.waiters.shift()?.();
  }
}

async function readCached(file: string): Promise<Buffer | null> {
  try {
    const buf = await fs.promises.readFile(file);
    if (buf.length < 32 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return buf;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

async function writeCached(file: string, body: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, body);
  await fs.promises.rename(tmp, file);
}

/** Baseline (non-progressive) JPEG, longest edge DISPLAY_THUMB_WIDTH, never enlarging. */
export async function encodeBaselineThumb(input: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true, failOn: "none" })
    .rotate()
    .resize({
      width: DISPLAY_THUMB_WIDTH,
      height: DISPLAY_THUMB_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 80, progressive: false, mozjpeg: false, chromaSubsampling: "4:2:0" })
    .toBuffer();
}

/**
 * Disk cache under data/cache/image-thumbs (gitignored with data/). Does not write the SQLite file.
 * `readOriginal` runs only on a cache miss, inside the resize slot.
 */
export async function displayThumbJpeg(cacheKey: string, readOriginal: () => Buffer): Promise<Buffer> {
  if (!/^[\w-]+$/.test(cacheKey)) throw new Error("unsafe thumb cache key");
  const file = cacheFile(cacheKey);
  const hit = await readCached(file);
  if (hit) return hit;

  const state = gate();
  const pending = state.inflight.get(cacheKey);
  if (pending) return pending;

  const job = withSlot(async () => {
    const again = await readCached(file);
    if (again) return again;
    const jpeg = await encodeBaselineThumb(readOriginal());
    if (jpeg.length < 32 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new Error("thumb encode produced no jpeg");
    }
    await writeCached(file, jpeg);
    return jpeg;
  }).finally(() => {
    if (state.inflight.get(cacheKey) === job) state.inflight.delete(cacheKey);
  });

  state.inflight.set(cacheKey, job);
  return job;
}
