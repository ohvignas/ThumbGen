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

  it("stops on the server through stopFollowUp, and asks the server again before the 10 s local fallback", () => {
    expect(source).toContain("stopFollowUp({ result, status: statusRef.current, retried })");
    expect(source).toContain("void stopAgentRun(conversationId).finally(abandonLocalStream);");
  });

  it("drops a second send, retry or client-request answer started before the first one is under way", () => {
    // onSend, onAskAgent and « Réessayer ».
    expect(source.match(/if \((?:busy \|\| )?sendInFlightRef\.current\) return;/g)).toHaveLength(3);
    expect(source).toContain("answeredToolCallIdsRef.current.has(toolCallId)) return;");
  });

  it("answers a 409 on a client-request continuation with the busy toast, not an error", () => {
    expect(source).toContain('if (status !== "error" || !busyConflictRef.current || sendInFlightRef.current) return;');
    expect(source.match(/recoverFromBusyConflict\(conversationId\)/g)).toHaveLength(2);
  });

  it("leaves the unmount abort to useChat and skips the runs refresh of the first render", () => {
    // useChat already stops its chat on unmount (local stream only).
    expect(source).not.toMatch(/return \(\) => \{\s*void stop\(\);\s*\};/);
    expect(source).toContain("if (refreshedStatusRef.current === status) return;");
  });
});
