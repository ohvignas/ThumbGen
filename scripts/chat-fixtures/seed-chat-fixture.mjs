// Dev-only fixture (chantier E): seeds a THROWAWAY ThumbGen database with chat
// conversations covering every layout of the chat panel, without any model call.
//
// Run it while `next dev` serves the same database:
//   BASE_URL=http://localhost:3100 THUMBGEN_DB_PATH=/abs/path/thumbgen.db \
//     /opt/homebrew/bin/node scripts/chat-fixtures/seed-chat-fixture.mjs
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const DB_PATH = process.env.THUMBGEN_DB_PATH;

if (!DB_PATH) {
  console.error("THUMBGEN_DB_PATH is required: the dev server's throwaway database.");
  process.exit(1);
}
if (path.resolve(DB_PATH).startsWith(path.resolve("data") + path.sep)) {
  console.error("Refusing to seed ./data: that is the Docker database with the user's real projects.");
  process.exit(1);
}

// 1×1 transparent PNG, enough for the image previews.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

async function post(route, body) {
  const res = await fetch(`${BASE_URL}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${route} → ${res.status} ${await res.text()}`);
  return res.json();
}

const project = await post("/api/projects", { name: "Chat propre (fixture)" });
await post("/api/project", {
  projectId: project.id,
  nodes: [
    { id: "prompt-1", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "Miniature de test" } },
    { id: "gen-1", type: "generator", position: { x: 420, y: 0 }, data: { model: "gemini-3.1-flash-image", aspectRatio: "16x9", numImages: 1 } },
  ],
  edges: [{ id: "e-prompt-gen", source: "prompt-1", sourceHandle: null, target: "gen-1", targetHandle: "prompt-in" }],
});

const db = new DatabaseSync(DB_PATH);
const insertMessage = db.prepare(
  "INSERT INTO messages (id, conversation_id, role, content_json, interrupted, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const touchConversation = db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?");

/** SQLite datetime('now') format, `seconds` after a base time `minutesAgo` minutes ago. */
const at = (minutesAgo, seconds = 0) =>
  new Date(Date.now() - minutesAgo * 60_000 + seconds * 1000).toISOString().slice(0, 19).replace("T", " ");

const text = (value) => ({ type: "text", text: value });
const image = () => ({ type: "file", mediaType: "image/png", data: { type: "data", data: PNG } });
const call = (toolCallId, toolName, input) => ({ type: "tool-call", toolCallId, toolName, input });
const result = (toolCallId, toolName, value) => ({ type: "tool-result", toolCallId, toolName, output: { type: "content", value } });
const assistant = (...content) => ({ role: "assistant", content });
const tool = (...content) => ({ role: "tool", content });
const finish = (toolCallId, input) => [
  assistant(call(toolCallId, "finish_turn", input)),
  tool(result(toolCallId, "finish_turn", [text('{"ok":true}')])),
];

async function conversation(title, updatedMinutesAgo, rows) {
  const conv = await post("/api/agent/conversations", { project_id: project.id, title });
  for (const row of rows) {
    insertMessage.run(randomUUID(), conv.id, row.role, JSON.stringify(row.content), row.interrupted ?? 0, row.createdAt);
  }
  touchConversation.run(at(updatedMinutesAgo), conv.id);
}

// A. Two finished turns with finish_turn: results, « Et maintenant » on the last one only.
await conversation("Fixture — réponse organisée", 1, [
  { role: "user", createdAt: at(30), content: [{ role: "user", content: [text("Propose-moi deux angles pour ma vidéo sur le nouveau MacBook.")] }] },
  {
    role: "assistant",
    createdAt: at(30, 14),
    content: [
      assistant({ type: "reasoning", text: "Je regarde le canvas puis je dessine deux croquis." }, text("Je lis le canvas."), call("fx-canvas", "get_canvas_state", { project_id: project.id })),
      tool(result("fx-canvas", "get_canvas_state", [text("2 nœuds : prompt-1, gen-1")])),
      assistant(text("Je dessine deux croquis."), call("fx-sk-a", "generate_sketch", { prompt: "Visage choqué devant un MacBook" }), call("fx-sk-b", "generate_sketch", { prompt: "Duel MacBook contre PC" })),
      tool(
        result("fx-sk-a", "generate_sketch", [text("Sketch generated. Reference: generated:sk_fixturea (cost: $0.000)"), image(), text("result_id: fx-sk-a")]),
        result("fx-sk-b", "generate_sketch", [text("Sketch generated. Reference: generated:sk_fixtureb (cost: $0.000)"), image(), text("result_id: fx-sk-b")]),
      ),
      ...finish("fx-finish-1", {
        summary: "Deux angles prêts : **A** choc, **B** duel. Lequel te parle ?",
        results: ["fx-sk-a", "fx-sk-b"],
        next_actions: [
          { label: "Angle A — Choc", kind: "ask_agent", message: "Je choisis l'angle A." },
          { label: "Angle B — Duel", kind: "ask_agent", message: "Je choisis l'angle B." },
        ],
      }),
    ],
  },
  { role: "user", createdAt: at(29), content: [{ role: "user", content: [text("Je choisis l'angle A.")] }] },
  {
    role: "assistant",
    createdAt: at(29, 9),
    content: [
      assistant(call("fx-apply", "apply_workflow", { project_id: project.id, blueprint: { nodes: [], edges: [] } })),
      tool(result("fx-apply", "apply_workflow", [text("Workflow appliqué : 2 nœuds.")])),
      ...finish("fx-finish-2", {
        summary: "Le workflow est sur le canvas : clique **Générer** sur le générateur pour lancer la miniature finale (ça a un coût).",
        results: [],
        next_actions: [
          { label: "Voir le générateur", kind: "focus_node", node_id: "gen-1" },
          { label: "Ancien générateur", kind: "focus_node", node_id: "gen-supprime" },
          { label: "Change le fond", kind: "ask_agent", message: "Change le fond en orange." },
        ],
      }),
    ],
  },
]);

// B. An older conversation without finish_turn, ending on an interrupted turn.
await conversation("Fixture — ancienne conversation", 60, [
  { role: "user", createdAt: at(120), content: [{ role: "user", content: [text("Qu'est-ce qui marche sur YouTube pour les MacBook ?")] }] },
  {
    role: "assistant",
    createdAt: at(120, 20),
    content: [
      assistant(text("Je cherche sur YouTube."), call("fx-search", "search_youtube", { query: "MacBook", limit: 8 })),
      tool(result("fx-search", "search_youtube", [text('[1] "MacBook M5 : le test" — Chaîne A'), image(), text('[2] "Faut-il acheter le MacBook ?" — Chaîne B'), image()])),
      assistant(text("Trois patterns ressortent : **visage choqué**, flèche rouge, fond très contrasté.")),
    ],
  },
  { role: "user", createdAt: at(119), content: [{ role: "user", content: [text("Et pour les tutoriels ?")] }] },
  { role: "assistant", createdAt: at(119, 3), interrupted: 1, content: [] },
]);

// C. A turn paused on a pending image request.
await conversation("Fixture — demande d'image", 90, [
  { role: "user", createdAt: at(200), content: [{ role: "user", content: [text("Ajoute mon logo.")] }] },
  {
    role: "assistant",
    createdAt: at(200, 4),
    content: [assistant(text("Il me faut ton logo pour la miniature."), call("fx-request", "request_user_image", { reason: "Ton logo, en PNG de préférence.", suggested_kind: "logo" }))],
  },
]);

db.close();
console.log(`Seeded project ${project.id}`);
console.log(`Open ${BASE_URL}/m/${project.id}`);
