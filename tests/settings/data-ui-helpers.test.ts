import { describe, it, expect } from "vitest";
import { readApiError } from "@/components/settings/api";
import { formatBytes, formatDateTime } from "@/components/settings/format";

describe("formatBytes", () => {
  it("uses French units with a decimal comma", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(1536)).toBe("1,5 Ko");
    expect(formatBytes(80 * 1024 * 1024)).toBe("80,0 Mo");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3,0 Go");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO date and leaves garbage untouched", () => {
    expect(formatDateTime("2026-09-16T10:05:00.000Z")).toContain("2026");
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});

describe("readApiError", () => {
  it("returns the API error message or the fallback", async () => {
    expect(await readApiError(new Response(JSON.stringify({ error: "Sauvegarde inconnue" }), { status: 400 }), "x")).toBe(
      "Sauvegarde inconnue",
    );
    expect(await readApiError(new Response("oops", { status: 500 }), "Erreur générique")).toBe("Erreur générique");
  });
});
