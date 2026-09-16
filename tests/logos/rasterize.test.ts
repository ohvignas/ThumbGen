import { describe, it, expect } from "vitest";
import { inflateSync } from "zlib";
import { LOGO_PNG_WIDTH, SvgRasterizeError, svgToPng } from "@/lib/logos/rasterize";

/** Minimal decoder for the 8-bit RGBA, non-interlaced PNGs resvg writes. */
function decodePng(png: Buffer) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, colorType };
}

describe("svgToPng — untrusted SVG safety (F1)", () => {
  it("refuses an SVG containing <image>, without rendering", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image href="/etc/hosts" width="10" height="10"/></svg>';
    expect(() => svgToPng(svg)).toThrow(SvgRasterizeError);
    expect(() => svgToPng(svg)).toThrow("Ce SVG n'est pas utilisable comme logo.");
  });

  it("refuses an xlink:href pointing outside the document", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' +
      '<use xlink:href="https://evil.example/payload.svg#a"/></svg>';
    expect(() => svgToPng(svg)).toThrow(SvgRasterizeError);
    expect(() => svgToPng(svg)).toThrow("Ce SVG n'est pas utilisable comme logo.");
  });

  it("allows a local #id href and a data: href", () => {
    const localHref =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><circle id="dot" cx="50" cy="50" r="40" fill="#ff0000"/></defs><use href="#dot"/></svg>';
    expect(() => svgToPng(localHref)).not.toThrow();

    const dataHref =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' +
      '<a xlink:href="data:text/plain,hello"><rect width="100" height="100" fill="#00ff00"/></a></svg>';
    expect(() => svgToPng(dataHref)).not.toThrow();
  });

  it("refuses an SVG containing <text> (not vectorised)", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">Hi</text></svg>';
    expect(() => svgToPng(svg)).toThrow(SvgRasterizeError);
    expect(() => svgToPng(svg)).toThrow("Ce logo contient du texte non vectorisé : importe plutôt une image.");
  });

  it("refuses a wildly disproportionate viewBox quickly, without rendering", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 5"><rect width="1000" height="5" fill="#000"/></svg>';
    expect(() => svgToPng(svg)).toThrow(SvgRasterizeError);
  });

  it("refuses an SVG with zero-size dimensions", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 100 100"><rect width="100" height="100" fill="#000"/></svg>';
    expect(() => svgToPng(svg)).toThrow(SvgRasterizeError);
  });

  it("renders a portrait SVG (1:2) at 512x1024 — longest side is 1024", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200"><rect width="100" height="200" fill="#0000ff"/></svg>';
    const png = decodePng(svgToPng(svg));
    expect(png.width).toBe(512);
    expect(png.height).toBe(1024);
  });

  it("renders a square SVG at 1024x1024", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0000ff"/></svg>';
    const png = decodePng(svgToPng(svg));
    expect(png.width).toBe(1024);
    expect(png.height).toBe(1024);
    expect(LOGO_PNG_WIDTH).toBe(1024);
  });
});
