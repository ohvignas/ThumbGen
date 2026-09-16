import { Resvg } from "@resvg/resvg-js";

export const LOGO_PNG_WIDTH = 1024;

/** Above this max/min side ratio, a viewBox is treated as unusable as a logo. */
const MAX_ASPECT_RATIO = 8;

export class SvgRasterizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgRasterizeError";
  }
}

const IMAGE_TAG = /<image[\s>]/i;
const TEXT_TAG = /<text[\s>]/i;
// Matches both `href` and `xlink:href` attributes (single or double quoted).
const HREF_ATTR = /(?:xlink:href|href)\s*=\s*(["'])([^"']*)\1/gi;

const NOT_USABLE_MESSAGE = "Ce SVG n'est pas utilisable comme logo.";
const TEXT_MESSAGE = "Ce logo contient du texte non vectorisé : importe plutôt une image.";

/**
 * Untrusted SVGs (SVGL, Wikimedia) can otherwise smuggle a reference to a
 * local file or an arbitrary remote URL via `<image>`/`href`, or contain text
 * that renders as nothing without fonts. Checked on the raw source, before
 * resvg ever parses it.
 */
function assertSafeSvg(svg: string): void {
  if (IMAGE_TAG.test(svg)) throw new SvgRasterizeError(NOT_USABLE_MESSAGE);

  HREF_ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_ATTR.exec(svg))) {
    const value = match[2].trim();
    if (!value.startsWith("#") && !value.toLowerCase().startsWith("data:")) {
      throw new SvgRasterizeError(NOT_USABLE_MESSAGE);
    }
  }

  if (TEXT_TAG.test(svg)) throw new SvgRasterizeError(TEXT_MESSAGE);
}

/** SVG → PNG whose longest side is `targetSize` px, transparent background. */
export function svgToPng(svg: string, targetSize: number = LOGO_PNG_WIDTH): Buffer {
  if (!/<svg[\s>]/i.test(svg)) throw new SvgRasterizeError("Ce fichier n'est pas un SVG.");
  assertSafeSvg(svg);
  try {
    // Probe the natural size first (no render): refuses a degenerate or
    // wildly disproportionate SVG before spending any rasterising work on it.
    // No system fonts: the Docker image has none and logo SVGs are paths.
    const probe = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } });
    const { width, height } = probe;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new SvgRasterizeError(NOT_USABLE_MESSAGE);
    }
    const ratio = Math.max(width, height) / Math.min(width, height);
    if (!Number.isFinite(ratio) || ratio > MAX_ASPECT_RATIO) {
      throw new SvgRasterizeError(NOT_USABLE_MESSAGE);
    }

    const fitTo = width >= height ? ({ mode: "width", value: targetSize } as const) : ({ mode: "height", value: targetSize } as const);
    const resvg = new Resvg(svg, { fitTo, font: { loadSystemFonts: false } });
    return resvg.render().asPng();
  } catch (error) {
    if (error instanceof SvgRasterizeError) throw error;
    const detail = error instanceof Error ? error.message : "conversion impossible";
    throw new SvgRasterizeError(`SVG invalide : ${detail}`);
  }
}
