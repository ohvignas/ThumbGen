import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Fiche button is gone", () => {
  it("is not mounted from the chat header and the BriefButton file is deleted", () => {
    const header = read("src/components/panels/chat/ChatHeader.tsx");
    expect(header).not.toContain("BriefButton");
    expect(header).not.toContain("Fiche");
    expect(fs.existsSync(path.join(process.cwd(), "src/components/brief/BriefButton.tsx"))).toBe(false);
  });
});
