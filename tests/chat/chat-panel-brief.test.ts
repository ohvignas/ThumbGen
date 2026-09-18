import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("ChatPanel — thumbnail brief wiring", () => {
  const source = read("src/components/panels/ChatPanel.tsx");

  it("follows brief updates from useChat's onData only, without sending anything", () => {
    const start = source.indexOf("onData: (dataPart) =>");
    const handler = source.slice(start, source.indexOf("onError:", start));
    expect(handler).toContain("applyCanvasPatchPart(dataPart,");
    expect(handler).toContain("applyBriefUpdatedPart(dataPart);");
    expect(handler).not.toMatch(/sendMessage|addToolOutput|regenerate|resumeStream/);
  });

  it("loads the open conversation's brief without piping a journey step into the turn rows", () => {
    expect(source).toContain("useBriefStore.getState().load(activeConversationId)");
    expect(source).not.toMatch(/journeyStep/);
  });

  it("does not show a pipeline step on live lines", () => {
    expect(read("src/components/panels/chat/Message.tsx")).not.toContain("journeyStep");
    expect(read("src/components/panels/chat/MessageList.tsx")).not.toContain("journeyStep");
  });
});
