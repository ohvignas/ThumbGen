import { describe, expect, it } from "vitest";
import { consumePendingSend } from "@/lib/studio/pending-send";

describe("consumePendingSend", () => {
  it("ignores empty pending sends", () => {
    expect(consumePendingSend(null)).toBeNull();
    expect(consumePendingSend("   ")).toBeNull();
  });

  it("returns a composer-ready draft with one trailing space", () => {
    expect(consumePendingSend("/ecrire")).toEqual({ draft: "/ecrire " });
    expect(consumePendingSend("  /ecrire  ")).toEqual({ draft: "/ecrire " });
  });
});
