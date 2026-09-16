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
// `remote` is kept in the shape (mirrored by the API's AddedLogo) even though
// this task never sets it to true: logos.remote_url doesn't exist (see below).
export type AddedLogoRow = { id: string; label: string; remote: boolean };

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Brandfetch's guidelines forbid storing or programmatically fetching their
// logo images, so this project never persists a Brandfetch file or reference
// (no `logos.remote_url` column, no client ID handling here).
const BRANDFETCH_MANUAL_MESSAGE =
  "Les logos Brandfetch ne s'ajoutent pas automatiquement : ouvre-le sur Brandfetch, télécharge le fichier puis importe-le.";

async function download(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": THUMBGEN_USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch {
    throw new LogoAddError("Téléchargement du logo impossible — réessaie.", 502);
  }
  if (!res.ok) throw new LogoAddError(`Téléchargement du logo impossible (HTTP ${res.status}).`, 502);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new LogoAddError("Le fichier du logo est vide.", 502);
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new LogoAddError("Fichier trop lourd (5 Mo maximum).", 413);
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
  return { id, label, remote: false };
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
