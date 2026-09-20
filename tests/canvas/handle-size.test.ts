import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("canvas connection handles", () => {
  it("keeps a large visible handle and a larger hit box", () => {
    expect(css).toMatch(/--handle-size:\s*30px/);
    expect(css).toMatch(/--handle-hit:\s*40px/);
    expect(css).toMatch(/width:\s*var\(--handle-hit\)/);
    expect(css).toMatch(/\.react-flow__handle::after/);
  });
});
