import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createProject } from "@/lib/local-storage";
import { createConversation } from "@/lib/agent/conversation/store";
import { appendChunk, finishRun, getRun, resetRunRegistry, startRun } from "@/lib/agent/v2/run-registry";
import { buildRunsSnapshot } from "@/lib/agent/v2/runs-snapshot";
import type { AgentRunsSnapshot, RunSummary } from "@/lib/agent/v2/run-types";
import { GET as getStream } from "@/app/api/agent/chat/[conversationId]/stream/route";
import { POST as postStop } from "@/app/api/agent/chat/[conversationId]/stop/route";
import { GET as getRuns } from "@/app/api/agent/runs/route";
import { DELETE as deleteConversation } from "@/app/api/agent/conversations/[id]/route";

const params = (conversationId: string) => ({ params: Promise.resolve({ conversationId }) });
const jsonPost = (url: string) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

// createProject ids are `proj_<Date.now()>`: one project for the whole file.
let projectId = "";
beforeAll(() => {
  projectId = createProject("Vidéo F1").id;
});
beforeEach(() => resetRunRegistry());

const newConversation = () => createConversation(projectId).id;

describe("GET /api/agent/chat/[conversationId]/stream", () => {
  it("answers 204 when nothing runs, for an unknown id or an ended run", async () => {
    expect((await getStream(new Request("http://localhost/x"), params("unknown"))).status).toBe(204);
    const id = newConversation();
    finishRun(startRun(id, projectId)!, "done");
    expect((await getStream(new Request("http://localhost/x"), params(id))).status).toBe(204);
  });

  it("replays the run from its start, then streams it live until it ends", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    appendChunk(run, { type: "start" });
    const res = await getStream(new Request("http://localhost/x"), params(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    appendChunk(run, { type: "text-delta", id: "t", delta: "Bonjour" });
    finishRun(run, "done");
    const body = await res.text();
    expect(body).toContain('"type":"start"');
    expect(body).toContain('"delta":"Bonjour"');
  });
});

describe("POST /api/agent/chat/[conversationId]/stop", () => {
  it("refuses a non-JSON request", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    const res = await postStop(new Request("http://localhost/x", { method: "POST", body: "{}" }), params(id));
    expect(res.status).toBe(415);
    expect(run.abort.signal.aborted).toBe(false);
  });

  it("aborts a running run and says whether it did", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    const res = await postStop(jsonPost("http://localhost/x"), params(id));
    expect(await res.json()).toEqual({ stopped: true });
    expect(run.abort.signal.aborted).toBe(true);
    expect(await (await postStop(jsonPost("http://localhost/x"), params("unknown"))).json()).toEqual({ stopped: false });
  });
});

describe("GET /api/agent/runs", () => {
  it("lists running turns and ended ones by kind, with the project name", async () => {
    const running = newConversation();
    const finished = newConversation();
    const failed = newConversation();
    const question = newConversation();
    const stopped = newConversation();
    const runningRun = startRun(running, projectId)!;
    finishRun(startRun(finished, projectId)!, "done");
    finishRun(startRun(failed, projectId)!, "error");
    const asking = startRun(question, projectId)!;
    appendChunk(asking, { type: "tool-input-available", toolCallId: "r1", toolName: "request_user_image", input: {} });
    finishRun(asking, "done");
    finishRun(startRun(stopped, projectId)!, "stopped");

    const snapshot = (await (await getRuns()).json()) as AgentRunsSnapshot;
    expect(snapshot.running).toEqual([{ conversationId: running, projectId, projectName: "Vidéo F1", startedAt: runningRun.startedAt }]);
    const kinds = Object.fromEntries(snapshot.attention.map((entry) => [entry.conversationId, entry.kind]));
    expect(kinds).toEqual({ [finished]: "finished", [failed]: "error", [question]: "question", [stopped]: "finished" });
    expect(snapshot.attention.every((entry) => entry.projectName === "Vidéo F1" && typeof entry.endedAt === "number")).toBe(true);
  });

  it("skips runs of deleted conversations and names unknown projects", () => {
    const base: RunSummary = { conversationId: "gone", projectId: "p-x", startedAt: 1, status: "running", endedAt: null, pendingClientRequest: false };
    const snapshot = buildRunsSnapshot(
      [base, { ...base, conversationId: "kept", status: "done", endedAt: 5 }],
      { conversationExists: (id) => id === "kept", projectName: () => null },
    );
    expect(snapshot).toEqual({
      running: [],
      attention: [{ conversationId: "kept", projectId: "p-x", projectName: "Miniature sans nom", kind: "finished", endedAt: 5 }],
    });
  });
});

describe("DELETE /api/agent/conversations/[id]", () => {
  it("stops the conversation's running turn", async () => {
    const id = newConversation();
    const run = startRun(id, projectId)!;
    const res = await deleteConversation(new Request("http://localhost/x", { method: "DELETE" }) as never, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(run.abort.signal.aborted).toBe(true);
    expect(getRun(id)?.status).toBe("running"); // ends when its stream ends, like any stop
  });
});
