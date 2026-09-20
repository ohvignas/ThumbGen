import { describe, expect, it } from "vitest";
import { holdBandFromNoul, isWhyCategory, whyCategoryLabel } from "@/lib/youtube/why-categories";

describe("why categories", () => {
  it("accepts the closed packaging set and rejects format ids", () => {
    expect(isWhyCategory("curiosity_gap")).toBe(true);
    expect(isWhyCategory("tutorial")).toBe(false);
    expect(whyCategoryLabel("specific_payoff")).toBe("Résultat concret");
    expect(whyCategoryLabel("nope")).toBe("Autre accroche");
  });
});

describe("holdBandFromNoul", () => {
  it("maps noul away from 0.5 so 0.5 is unsure not medium hold", () => {
    expect(holdBandFromNoul(0.8)).toBe("holds");
    expect(holdBandFromNoul(0.2)).toBe("drops");
    expect(holdBandFromNoul(0.5)).toBe("unsure");
    expect(holdBandFromNoul(0.65)).toBe("holds");
    expect(holdBandFromNoul(0.35)).toBe("drops");
  });
});
