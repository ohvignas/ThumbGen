import { describe, expect, it } from "vitest";
import { DEFAULT_WORKING_PERIOD, parseWorkingPeriod } from "@/lib/youtube/theme-display";

describe("working period prefs", () => {
  it("accepts 7d / 30d / 6m and rejects unknown values", () => {
    expect(parseWorkingPeriod("7d")).toBe("7d");
    expect(parseWorkingPeriod("30d")).toBe("30d");
    expect(parseWorkingPeriod("6m")).toBe("6m");
    expect(parseWorkingPeriod("12m")).toBe(DEFAULT_WORKING_PERIOD);
    expect(parseWorkingPeriod(null)).toBe(DEFAULT_WORKING_PERIOD);
  });
});
