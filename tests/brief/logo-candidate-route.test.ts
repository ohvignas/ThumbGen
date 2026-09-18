import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/briefs/[conversationId]/logo-candidates/[id]/route";
import { createConversation, softDeleteConversation } from "@/lib/agent/conversation/store";
import { briefUpdateInputSchema } from "@/lib/brief/merge";
import { updateBrief } from "@/lib/brief/store";
import { setBriefLogoCandidates } from "@/lib/brief/server-fields";
import { simpleIconSvg } from "@/lib/logos/providers/simple-icons";

const ctx = (conversationId: string, id: string) => ({ params: Promise.resolve({ conversationId, id }) });

function withCandidate(candidate: Parameters<typeof setBriefLogoCandidates>[1][number]) {
  const conversation = createConversation("proj-logo-preview");
  updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 2 }));
  setBriefLogoCandidates(conversation.id, [candidate]);
  return conversation.id;
}

describe("GET /api/briefs/.../logo-candidates/[id]", () => {
  it("returns the decoded Simple Icons SVG", async () => {
    const conversationId = withCandidate({
      id: "lc_si",
      name: "GitHub",
      source: "simple-icons",
      ref: "github",
      previewUrl: "/p",
    });
    const res = await GET(new Request("http://localhost/x") as never, ctx(conversationId, "lc_si"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/svg\+xml/);
    expect(await res.text()).toBe(simpleIconSvg("github"));
  });

  it("redirects SVGL and Wikimedia refs", async () => {
    const svgl = "https://svgl.app/library/claude.svg";
    const commons = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Claude.svg";
    const a = withCandidate({ id: "lc_sv", name: "C", source: "svgl", ref: svgl, previewUrl: "/p" });
    const b = withCandidate({ id: "lc_wm", name: "C", source: "wikimedia", ref: commons, previewUrl: "/p" });
    const sv = await GET(new Request("http://localhost/x") as never, ctx(a, "lc_sv"));
    expect(sv.status).toBe(302);
    expect(sv.headers.get("location")).toBe(svgl);
    const wm = await GET(new Request("http://localhost/x") as never, ctx(b, "lc_wm"));
    expect(wm.status).toBe(302);
    expect(wm.headers.get("location")).toBe(commons);
  });

  it("answers 404 for a missing conversation, brief or id", async () => {
    const conversation = createConversation("proj-logo-preview");
    expect((await GET(new Request("http://localhost/x") as never, ctx("nope", "lc_x"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/x") as never, ctx(conversation.id, "lc_x"))).status).toBe(404);
    updateBrief(conversation.id, conversation.project_id, briefUpdateInputSchema.parse({ step: 2 }));
    expect((await GET(new Request("http://localhost/x") as never, ctx(conversation.id, "lc_x"))).status).toBe(404);
    softDeleteConversation(conversation.id);
    expect((await GET(new Request("http://localhost/x") as never, ctx(conversation.id, "lc_x"))).status).toBe(404);
  });
});
