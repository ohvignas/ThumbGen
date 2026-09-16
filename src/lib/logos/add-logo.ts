import { v4 as uuid } from "uuid";
import { getDb } from "@/lib/db";
import { THUMBGEN_USER_AGENT } from "@/lib/user-agent";
import { simpleIconSvg } from "./providers/simple-icons";
import { isSvglAssetUrl } from "./providers/svgl";
import { isCommonsFileUrl } from "./providers/wikimedia";
import { SvgRasterizeError, svgToPng } from "./rasterize";
import type { LogoSource } from "./shared";

export class LogoAddError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LogoAddError";
    this.status = status;
  }
}

export type AddLogoInput = { source: LogoSource; ref: string; name: string };
export type AddedLogoRow = { id: string; label: string };

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Brandfetch's guidelines forbid storing or programmatically fetching their
// logo images, so this project never persists a Brandfetch file or reference.
const BRANDFETCH_MANUAL_MESSAGE =
  "Les logos Brandfetch ne s'ajoutent pas automatiquement : ouvre-le sur Brandfetch, télécharge le fichier puis importe-le.";

/**
 * Reads a response body accumulating chunks, aborting as soon as the total
 * exceeds the cap — so an oversized download is rejected while it streams,
 * not only after it has all been buffered in memory.
 */
async function readWithCap(res: Response): Promise<Buffer> {
  if (!res.body) {
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw new LogoAddError("Fichier trop lourd (5 Mo maximum).", 413);
    return bytes;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new LogoAddError("Fichier trop lourd (5 Mo maximum).", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function download(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": THUMBGEN_USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      // Never follow a redirect: SVGL/Wikimedia addresses are validated
      // before fetching, and a 3xx response could otherwise silently hand
      // the download off to an unvalidated host (SSRF via redirect).
      redirect: "manual",
    });
  } catch {
    throw new LogoAddError("Téléchargement du logo impossible — réessaie.", 502);
  }
  // With `redirect: "manual"`, a real fetch implementation surfaces a
  // redirect as an opaque response (status 0, type "opaqueredirect", no
  // Location exposed to JS). A leaked 3xx status (e.g. from a test double, or
  // a runtime that doesn't honour the option) is refused the same way.
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new LogoAddError("Téléchargement du logo impossible (redirection refusée).", 502);
  }
  if (!res.ok) throw new LogoAddError(`Téléchargement du logo impossible (HTTP ${res.status}).`, 502);

  const contentLength = res.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > MAX_DOWNLOAD_BYTES) {
    throw new LogoAddError("Fichier trop lourd (5 Mo maximum).", 413);
  }

  const bytes = await readWithCap(res);
  if (bytes.length === 0) throw new LogoAddError("Le fichier du logo est vide.", 502);
  return bytes;
}

function rasterize(svg: string): Buffer {
  try {
    return svgToPng(svg);
  } catch (error) {
    if (error instanceof SvgRasterizeError) throw new LogoAddError(error.message, 422);
    throw error;
  }
}

function insertLogo(label: string, png: Buffer): AddedLogoRow {
  const id = uuid();
  getDb()
    .prepare("INSERT INTO logos (id, label, mime_type, size, data) VALUES (?, ?, ?, ?, ?)")
    .run(id, label, "image/png", png.length, png);
  return { id, label };
}

/**
 * Saves a search result in the library. Simple Icons / SVGL / Wikimedia: the
 * file is downloaded (validated address only) and an SVG becomes a 1024 px
 * transparent PNG. Brandfetch results are refused outright — their logos
 * cannot be stored or fetched programmatically.
 */
export async function addLogoFromSearch(input: AddLogoInput): Promise<AddedLogoRow> {
  const label = input.name.trim().slice(0, 100) || "Logo";
  switch (input.source) {
    case "simple-icons": {
      const svg = simpleIconSvg(input.ref);
      if (!svg) throw new LogoAddError("Logo Simple Icons introuvable.", 404);
      return insertLogo(label, rasterize(svg));
    }
    case "svgl": {
      if (!isSvglAssetUrl(input.ref)) throw new LogoAddError("Adresse SVGL refusée.", 400);
      const svg = (await download(input.ref)).toString("utf8");
      return insertLogo(label, rasterize(svg));
    }
    case "wikimedia": {
      if (!isCommonsFileUrl(input.ref)) throw new LogoAddError("Adresse Wikimedia refusée.", 400);
      const bytes = await download(input.ref);
      if (/\.svg$/i.test(input.ref)) return insertLogo(label, rasterize(bytes.toString("utf8")));
      if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new LogoAddError("Ce fichier n'est pas un PNG.", 422);
      }
      return insertLogo(label, bytes);
    }
    case "brandfetch":
      throw new LogoAddError(BRANDFETCH_MANUAL_MESSAGE, 400);
  }
  throw new LogoAddError("Source de logo inconnue.", 400);
}
