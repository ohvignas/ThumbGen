// Dev-only fixture (chantier E). Paste this whole file into the browser's
// JavaScript tool on a ThumbGen canvas page (/m/<id>). It replaces
// POST /api/agent/chat with a scripted, slow UI-message stream — no model is
// ever called — and serves matching rows to the history refetch that follows.
// Reload the page to remove it.
//   window.__thumbgenChatStub.mode = "turn"   // default: a 4-step turn ending with finish_turn
//   window.__thumbgenChatStub.mode = "error"  // the chat route answers 400 before streaming
(() => {
  if (window.__thumbgenChatStub?.installed) return "already installed";

  const realFetch = window.fetch.bind(window);
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  const stub = { installed: true, mode: "turn", calls: 0, rows: new Map() };
  window.__thumbgenChatStub = stub;

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });

  const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

  function script(n) {
    const id = (name) => `stub-${n}-${name}`;
    const reasoning = "Je regarde le canvas avant de dessiner.";
    const sketchText = "Sketch generated. Reference: generated:sk_stub (cost: $0.000)";
    const finishInput = {
      summary: "Croquis prêt : **visage choqué** devant le MacBook.",
      results: [id("sketch")],
      next_actions: [
        { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
        { label: "Un autre croquis", kind: "ask_agent", message: "Fais un autre croquis." },
      ],
    };
    const chunks = [
      { type: "start" },
      { type: "start-step" },
      { type: "reasoning-start", id: id("r") },
      { type: "reasoning-delta", id: id("r"), delta: reasoning },
      { type: "reasoning-end", id: id("r") },
      { type: "text-start", id: id("t") },
      { type: "text-delta", id: id("t"), delta: "Je lis le canvas." },
      { type: "text-end", id: id("t") },
      { type: "tool-input-available", toolCallId: id("canvas"), toolName: "get_canvas_state", input: {} },
      { type: "tool-output-available", toolCallId: id("canvas"), output: { content: [{ type: "text", text: "2 nœuds : prompt-1, gen-1" }] } },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: id("sketch"), toolName: "generate_sketch", input: { prompt: "Visage choqué devant un MacBook" } },
      {
        type: "tool-output-available",
        toolCallId: id("sketch"),
        output: { content: [{ type: "text", text: sketchText }, { type: "image", mimeType: "image/png", data: PNG }, { type: "text", text: `result_id: ${id("sketch")}` }] },
      },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "tool-input-available", toolCallId: id("finish"), toolName: "finish_turn", input: finishInput },
      { type: "tool-output-available", toolCallId: id("finish"), output: { content: [{ type: "text", text: '{"ok":true}' }] } },
      { type: "finish-step" },
      { type: "finish", finishReason: "tool-calls" },
    ];
    const resultRow = (toolCallId, toolName, value) => ({ role: "tool", content: [{ type: "tool-result", toolCallId, toolName, output: { type: "content", value } }] });
    const assistantContent = [
      { role: "assistant", content: [{ type: "reasoning", text: reasoning }, { type: "text", text: "Je lis le canvas." }, { type: "tool-call", toolCallId: id("canvas"), toolName: "get_canvas_state", input: {} }] },
      resultRow(id("canvas"), "get_canvas_state", [{ type: "text", text: "2 nœuds : prompt-1, gen-1" }]),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: id("sketch"), toolName: "generate_sketch", input: { prompt: "Visage choqué devant un MacBook" } }] },
      resultRow(id("sketch"), "generate_sketch", [{ type: "text", text: sketchText }, { type: "file", mediaType: "image/png", data: { type: "data", data: PNG } }, { type: "text", text: `result_id: ${id("sketch")}` }]),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: id("finish"), toolName: "finish_turn", input: finishInput }] },
      resultRow(id("finish"), "finish_turn", [{ type: "text", text: '{"ok":true}' }]),
    ];
    return { id, chunks, assistantContent };
  }

  function remember(conversationId, rows) {
    stub.rows.set(conversationId, [...(stub.rows.get(conversationId) ?? []), ...rows]);
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (url.pathname === "/api/agent/chat" && method === "POST") {
      stub.calls += 1;
      const n = stub.calls;
      if (stub.mode === "error") {
        return new Response("Clé OpenRouter non configurée. Ajoute-la dans Réglages → Connexions des modèles.", { status: 400 });
      }
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
      const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
      const userText = (lastUser?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("");
      const { id, chunks, assistantContent } = script(n);
      const startedAt = Date.now();
      const userRow = { id: id("user"), role: "user", interrupted: 0, created_at: stamp(startedAt), content_json: JSON.stringify([{ role: "user", content: [{ type: "text", text: userText }] }]) };
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (const chunk of chunks) {
              await sleep(chunk.type === "tool-output-available" ? 3000 : 400, init.signal);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            remember(body.conversation_id, [
              userRow,
              { id: id("assistant"), role: "assistant", interrupted: 0, created_at: stamp(Date.now()), content_json: JSON.stringify(assistantContent) },
            ]);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            // « Arrêter »: store what the server would, an empty interrupted turn.
            remember(body.conversation_id, [
              userRow,
              { id: id("assistant"), role: "assistant", interrupted: 1, created_at: stamp(Date.now()), content_json: "[]" },
            ]);
            controller.error(error);
          }
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
    }

    const history = url.pathname.match(/^\/api\/agent\/conversations\/([^/]+)\/messages$/);
    if (history && method === "GET" && stub.rows.has(history[1])) {
      const rows = await (await realFetch(input, init)).json();
      return new Response(JSON.stringify([...rows, ...stub.rows.get(history[1])]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return realFetch(input, init);
  };

  return "installed";
})();
