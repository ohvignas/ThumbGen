import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { createConversation } from "@/lib/agent/conversation/store";
import { executeFindLogos } from "@/lib/agent/v2/find-logos-tool";
import { executeAddLogo } from "@/lib/agent/v2/add-logo-tool";
import { addLogoInputSchema } from "@/lib/agent/v2/add-logo-tool";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { getBrief, updateBrief } from "@/lib/brief/store";
import { setBriefLogoCandidates } from "@/lib/brief/server-fields";
import type { LogoSearchResult } from "@/lib/logos/shared";
import { isFakeAgentEnabled } from "@/lib/agent/v2/fake-agent-model";
import * as generationsLog from "@/lib/generations-log";

vi.mock("@/lib/agent/v2/fake-agent-model", () => ({
  isFakeAgentEnabled: vi.fn(() => false),
}));

const fetchMock = vi.fn();

function hit(source: LogoSearchResult["source"], name: string, ref: string): LogoSearchResult {
  return { key: `${source}:${ref}`, source, name, detail: null, variant: "color", previewUrl: `data:image/svg+xml;base64,AAAA`, ref };
}

function conversationWithBrief() {
  const conversation = createConversation("proj-logos");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 2 }));
  return conversation.id;
}

const text = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n");

beforeEach(() => {
  vi.mocked(isFakeAgentEnabled).mockReturnValue(false);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("find_logos", () => {
  it("keeps 3 candidates per name, never returns base64, and stores them on the brief", async () => {
    const conversationId = conversationWithBrief();
    const search = vi.fn(async () => ({
      results: [
        hit("simple-icons", "Claude", "anthropic"),
        hit("svgl", "Claude", "https://svgl.app/library/claude.svg"),
        hit("wikimedia", "Claude", "https://upload.wikimedia.org/wikipedia/commons/a/ab/Claude.png"),
        hit("simple-icons", "Extra", "extra"),
        hit("brandfetch", "Claude Brand", "brand"),
      ],
    }));
    const result = await executeFindLogos({ conversationId, search }, { names: ["Claude"] });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/^logo-candidate:lc_/);
    expect(text(result)).not.toMatch(/base64|data:/i);
    expect(text(result)).not.toContain("brandfetch");
    const candidates = getBrief(conversationId)!.brief.logoCandidates;
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.source)).toEqual(["simple-icons", "svgl", "wikimedia"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("add_logo", () => {
  it("saves a candidate id and refuses an unknown id or a supplied URL", async () => {
    const conversationId = conversationWithBrief();
    setBriefLogoCandidates(conversationId, [
      { id: "lc_known", name: "Claude", source: "simple-icons", ref: "anthropic", previewUrl: "/p" },
    ]);
    const add = vi.fn(async () => ({ id: "logo-1", label: "Claude" }));
    const ok = await executeAddLogo({ conversationId, add }, { candidate_id: "lc_known" });
    expect(text(ok)).toBe("stored:lg_logo-1");
    expect(getBrief(conversationId)!.brief.logos).toEqual([{ name: "Claude", source: "stored:lg_logo-1" }]);

    const unknown = await executeAddLogo({ conversationId, add }, { candidate_id: "lc_nope" });
    expect(unknown.isError).toBe(true);
    expect(unknown.requestNotSent).toBe(true);

    expect(addLogoInputSchema.safeParse({ url: "https://evil.example/logo.svg" }).success).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe("fake logos", () => {
  it("does not fetch or logGeneration", async () => {
    vi.mocked(isFakeAgentEnabled).mockReturnValue(true);
    const spy = vi.spyOn(generationsLog, "logGeneration");
    const conversationId = conversationWithBrief();
    const search = vi.fn();
    await executeFindLogos({ conversationId, search }, { names: ["Claude"] });
    expect(search).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
