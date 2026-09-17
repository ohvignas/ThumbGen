import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inflateSync } from "zlib";
import { getDb } from "@/lib/db";
import { LOGO_PNG_WIDTH, SvgRasterizeError, svgToPng } from "@/lib/logos/rasterize";
import { LogoAddError, addLogoFromSearch } from "@/lib/logos/add-logo";
import { POST } from "@/app/api/logos/add/route";

const CIRCLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><circle cx="50" cy="25" r="20" fill="#ff0000"/></svg>';
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkqfO0AAAAASUVORK5CYII=",
  "base64",
);
const fetchMock = vi.fn<typeof fetch>();

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
  const pixel = (x: number, y: number) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
  return { width, height, colorType, pixel };
}

// No `remote_url` column: Task 5 (Brandfetch remote-logo storage) was skipped
// — Brandfetch's guidelines forbid storing or fetching their logo images.
type LogoRow = { label: string; mime_type: string; size: number; data: Buffer };
const row = (id: string) =>
  getDb().prepare("SELECT label, mime_type, size, data FROM logos WHERE id = ?").get(id) as LogoRow;
const logoCount = () => (getDb().prepare("SELECT COUNT(*) AS n FROM logos").get() as { n: number }).n;
const svgResponse = (svg: string) => new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml" } });

beforeEach(() => {
  getDb().exec("DELETE FROM logos; DELETE FROM settings;");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("svgToPng", () => {
  it("renders a 1024 px wide PNG with a transparent background", () => {
    const png = decodePng(svgToPng(CIRCLE_SVG));
    expect(LOGO_PNG_WIDTH).toBe(1024);
    expect(png.width).toBe(1024);
    expect(png.height).toBe(512);
    expect(png.colorType).toBe(6);
    expect(png.pixel(0, 0)[3]).toBe(0);
    expect(png.pixel(512, 256)).toEqual([255, 0, 0, 255]);
  });

  it("rejects what is not a valid SVG", () => {
    expect(() => svgToPng("<svg><<<")).toThrow(SvgRasterizeError);
    expect(() => svgToPng("bonjour")).toThrow(SvgRasterizeError);
  });
});

describe("addLogoFromSearch", () => {
  it("Simple Icons: stores the coloured icon as a 1024 px PNG without any request", async () => {
    const logo = await addLogoFromSearch({ source: "simple-icons", ref: "youtube", name: " YouTube " });
    expect(logo).toMatchObject({ label: "YouTube" });
    const saved = row(logo.id);
    expect(saved.mime_type).toBe("image/png");
    expect(saved.size).toBe(saved.data.length);
    expect(decodePng(saved.data).width).toBe(1024);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SVGL: downloads the SVG and stores a transparent PNG", async () => {
    fetchMock.mockResolvedValue(svgResponse(CIRCLE_SVG));
    const logo = await addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://svgl.app/library/notion.svg");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/^ThumbGen\//);
    const png = decodePng(row(logo.id).data);
    expect(png.width).toBe(1024);
    expect(png.pixel(0, 0)[3]).toBe(0);
    expect(png.pixel(512, 256)).toEqual([255, 0, 0, 255]);
  });

  it("Wikimedia: rasterises an SVG and keeps a PNG as is", async () => {
    fetchMock.mockResolvedValueOnce(svgResponse(CIRCLE_SVG));
    const svgLogo = await addLogoFromSearch({ source: "wikimedia", ref: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg", name: "Logo NIKE" });
    expect(decodePng(row(svgLogo.id).data).width).toBe(1024);

    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(TINY_PNG), { status: 200, headers: { "content-type": "image/png" } }));
    const pngLogo = await addLogoFromSearch({ source: "wikimedia", ref: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Nik%C3%A9_logo.png", name: "Niké logo" });
    expect(row(pngLogo.id).data.equals(TINY_PNG)).toBe(true);
    expect(row(pngLogo.id).mime_type).toBe("image/png");
  });

  it("refuses an invalid SVG and saves nothing", async () => {
    fetchMock.mockResolvedValue(svgResponse("<svg><<<"));
    await expect(addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/broken.svg", name: "Cassé" })).rejects.toMatchObject({
      name: "LogoAddError",
      status: 422,
    });
    expect(logoCount()).toBe(0);
  });

  it("refuses a Wikimedia file that is not a PNG despite its name", async () => {
    fetchMock.mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(
      addLogoFromSearch({ source: "wikimedia", ref: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Faux.png", name: "Faux" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(logoCount()).toBe(0);
  });

  it("refuses addresses outside each source without downloading", async () => {
    await expect(addLogoFromSearch({ source: "svgl", ref: "https://evil.example/logo.svg", name: "x" })).rejects.toBeInstanceOf(LogoAddError);
    await expect(addLogoFromSearch({ source: "wikimedia", ref: "http://169.254.169.254/latest.png", name: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(addLogoFromSearch({ source: "simple-icons", ref: "does-not-exist", name: "x" })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logoCount()).toBe(0);
  });

  it("reports a failed download", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" })).rejects.toMatchObject({
      status: 502,
      message: "Téléchargement du logo impossible (HTTP 500).",
    });
  });

  // Controller ruling: Task 5 (logos.remote_url + Brandfetch remote storage) was
  // skipped — Brandfetch's guidelines forbid storing or programmatically fetching
  // their logo images. Brandfetch results are refused outright, no request made.
  it("Brandfetch: refuses immediately, without any request", async () => {
    await expect(addLogoFromSearch({ source: "brandfetch", ref: "id_0dwKPKT", name: "Nike" })).rejects.toMatchObject({
      name: "LogoAddError",
      status: 400,
      message:
        "Les logos Brandfetch ne s'ajoutent pas automatiquement : ouvre-le sur Brandfetch, télécharge le fichier puis importe-le.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logoCount()).toBe(0);
  });

  // Fix round: fetch() follows 3xx redirects to any host by default, which
  // would bypass the SVGL/Wikimedia address allowlist. download() must ask
  // for `redirect: "manual"` and refuse any 3xx outright rather than follow it.
  it("asks fetch not to follow redirects, and refuses a leaked 3xx status", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://evil.example/payload.svg" } }),
    );
    await expect(
      addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" }),
    ).rejects.toMatchObject({ name: "LogoAddError", status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://svgl.app/library/notion.svg");
    expect(init?.redirect).toBe("manual");
    expect(logoCount()).toBe(0);
  });

  // With `redirect: "manual"`, a real fetch implementation (undici/WHATWG)
  // surfaces a redirect as an opaque response — status 0, type
  // "opaqueredirect", the Location header hidden from JS — precisely so the
  // caller can never see or follow the target host. Duck-typed here since a
  // real Response can't be constructed with that type.
  it("refuses an opaque redirect (the real redirect: manual behaviour) without following it", async () => {
    const opaqueRedirect = {
      type: "opaqueredirect",
      status: 0,
      ok: false,
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
    fetchMock.mockResolvedValue(opaqueRedirect);
    await expect(
      addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" }),
    ).rejects.toMatchObject({ name: "LogoAddError", status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logoCount()).toBe(0);
  });

  // Fix round: the 5 MB cap must be enforced while reading the body, not only
  // after buffering it all — a server that omits Content-Length could still
  // stream an unbounded response otherwise.
  it("enforces the size cap while streaming, without Content-Length, and cancels the reader", async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(3 * 1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
      },
      cancel,
    });
    fetchMock.mockResolvedValue(new Response(stream, { status: 200, headers: { "content-type": "image/svg+xml" } }));
    await expect(
      addLogoFromSearch({ source: "svgl", ref: "https://svgl.app/library/notion.svg", name: "Notion" }),
    ).rejects.toMatchObject({ name: "LogoAddError", status: 413 });
    expect(cancel).toHaveBeenCalled();
    expect(logoCount()).toBe(0);
  });
});

describe("POST /api/logos/add", () => {
  const add = (body: unknown) =>
    POST(new Request("http://localhost/api/logos/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("rejects a malformed body", async () => {
    expect((await add({ source: "google", ref: "x", name: "x" })).status).toBe(400);
    expect((await add({ source: "svgl", name: "x" })).status).toBe(400);
  });

  it("adds a Simple Icons logo and returns its filename", async () => {
    const res = await add({ source: "simple-icons", ref: "nike", name: "Nike" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { filename: string; label: string };
    expect(body).toMatchObject({ label: "Nike" });
    expect(row(body.filename).mime_type).toBe("image/png");
  });

  it("passes a LogoAddError through with its status and French message", async () => {
    const res = await add({ source: "brandfetch", ref: "id_0dwKPKT", name: "Nike" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Les logos Brandfetch ne s'ajoutent pas automatiquement : ouvre-le sur Brandfetch, télécharge le fichier puis importe-le.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
