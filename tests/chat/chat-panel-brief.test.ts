import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("ChatPanel — fiche miniature is gone", () => {
  const source = read("src/components/panels/ChatPanel.tsx");
  const header = read("src/components/panels/chat/ChatHeader.tsx");

  it("follows canvas patches from useChat's onData only, without sending anything", () => {
    const start = source.indexOf("onData: (dataPart) =>");
    const handler = source.slice(start, source.indexOf("onError:", start));
    expect(handler).toContain("applyAgentCanvasStreamPart(dataPart,");
    expect(handler).not.toContain("applyBriefUpdatedPart");
    expect(handler).not.toMatch(/sendMessage|addToolOutput|regenerate|resumeStream/);
  });

  it("does not load or open a thumbnail brief / Fiche", () => {
    expect(source).not.toContain("useBriefStore");
    expect(source).not.toContain("applyBriefUpdatedPart");
    expect(header).not.toContain("BriefButton");
    expect(header).not.toContain("Fiche");
    expect(header).not.toContain("Fiche miniature");
  });

  it("does not show a pipeline step on live lines", () => {
    expect(read("src/components/panels/chat/Message.tsx")).not.toContain("journeyStep");
    expect(read("src/components/panels/chat/MessageList.tsx")).not.toContain("journeyStep");
  });
});
