import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Paid-call guards on the panel's wiring (behaviour itself is tested on the
// pure modules it uses and checked in the browser with the fake model).
const source = fs.readFileSync(path.join(process.cwd(), "src/components/panels/ChatPanel.tsx"), "utf8");

describe("ChatPanel wiring", () => {
  it("never lets useChat resume or send on its own", () => {
    expect(source).not.toMatch(/\bresume\s*:/);
    expect(source).toContain("sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithClientToolCalls");
    expect(source.match(/sendAutomaticallyWhen/g)).toHaveLength(1);
  });

  it("reconnects through the conversation transport and stops on the server", () => {
    expect(source).toContain("createAgentChatTransport(");
    expect(source).not.toContain("new DefaultChatTransport");
    expect(source).toContain("resumeStream()");
    expect(source).toContain("stopAgentRun(");
    expect(source).toContain("orphanUserTurn");
  });
});
