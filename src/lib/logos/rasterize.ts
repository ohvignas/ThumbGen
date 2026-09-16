import { Resvg } from "@resvg/resvg-js";

export const LOGO_PNG_WIDTH = 1024;

export class SvgRasterizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgRasterizeError";
  }
}

/** SVG → PNG of exactly `width` pixels, height following the ratio, transparent background. */
export function svgToPng(svg: string, width: number = LOGO_PNG_WIDTH): Buffer {
  if (!/<svg[\s>]/i.test(svg)) throw new SvgRasterizeError("Ce fichier n'est pas un SVG.");
  try {
    // No system fonts: the Docker image has none and logo SVGs are paths.
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } });
    return resvg.render().asPng();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "conversion impossible";
    throw new SvgRasterizeError(`SVG invalide : ${detail}`);
  }
}
