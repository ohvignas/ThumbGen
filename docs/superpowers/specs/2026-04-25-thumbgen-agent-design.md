# ThumbGen — Agent conversationnel constructeur de workflow

**Date :** 2026-04-25
**Auteur :** brainstorming Antoine + Claude
**Statut :** spec validé, prêt pour implementation plan

---

## 1. Contexte et objectif

ThumbGen est une app Next.js mono-utilisateur de génération de miniatures YouTube. L'utilisateur compose un workflow visuel sur un canvas React Flow (références, visage, logo, croquis, prompt → générateur) et déclenche la génération via plusieurs modèles (Ideogram, Grok, nano-banana, OpenAI).

**Problème actuel :** écrire un bon prompt + assembler le bon workflow demande du métier. Les modes existants ("Écrire", "Idées IA") du `PromptNode` ne couvrent que la rédaction du prompt isolément.

**Objectif :** introduire un agent conversationnel dans un panneau latéral droit qui :

1. Discute avec l'utilisateur (texte, images, audio transcrit) pour comprendre l'intention
2. Cherche des informations en temps réel (web, chaîne YouTube de l'utilisateur)
3. Lit l'état actuel du canvas pour décider de créer un nouveau workflow ou modifier l'existant
4. Construit ou modifie le workflow complet sur le canvas (créer/connecter/mettre à jour les nodes)
5. Propose et génère un croquis rapide pour valider la direction
6. Déclenche la génération finale après confirmation

**Contrainte forte :** la même surface de tools doit être exposée comme un **serveur MCP** consommable depuis n'importe quel client distant (Claude Desktop, Claude Code, mobile, Cursor, etc.). Le panneau du browser est juste un client MCP parmi d'autres.

---

## 2. Architecture d'ensemble

```
                       ┌────────────────────────────────┐
                       │  TOOL REGISTRY                 │
                       │  src/lib/agent/tools/*.ts      │
                       │  Pure functions :              │
                       │  (project_id?, input) → output │
                       └────────────────────────────────┘
                                       ▲
                       ┌───────────────┴───────────────┐
                       │  MCP SERVER (@mcp/sdk)        │
                       │  - liste tools                │
                       │  - dispatch vers registry     │
                       │  - bearer auth (HTTP)         │
                       └───────────────────────────────┘
                              ▲                   ▲
                  InMemoryTransport       StreamableHTTPServerTransport
                              │                   │
              ┌───────────────┴────────┐  ┌───────┴───────────────┐
              │ Browser agent loop     │  │ Remote Claude         │
              │ /api/agent/chat (SSE)  │  │ (Desktop / Code /     │
              │ - Claude Sonnet 4.6    │  │  mobile / Cursor)     │
              │ - MCP InMemoryClient   │  │ - configure ce serveur│
              │ - project_id en ctx    │  │   dans son MCP config │
              │ - Stream SSE → browser │  │                       │
              │ + tools UI-only :      │  └───────────────────────┘
              │   request_user_image,  │
              │   request_user_sketch  │
              └────────────────────────┘
                       ▲
                       │ SSE
              ┌────────┴───────┐
              │  ChatPanel.tsx │
              │  (browser)     │
              └────────────────┘
```

**Deux clients, une surface :**
- Le browser parle au registry via le MCP server en transport in-memory (zéro latence réseau, zéro auth, même process)
- Les clients distants parlent au même MCP server via Streamable HTTP avec bearer token

**Pourquoi cette unification :** une seule source de vérité pour les tools, le code path MCP est exercé en permanence par l'usage browser (pas de drift entre les deux), ajouter un tool = un seul fichier dans le registry et il est dispo partout.

---

## 3. Data model (DB SQLite)

**Tables nouvelles :**

```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,           -- uuid
  project_id  TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT,                        -- soft delete
  FOREIGN KEY (project_id) REFERENCES projects_meta(id)
);
CREATE INDEX idx_conv_project ON conversations(project_id, deleted_at);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,           -- 'user' | 'assistant'
  content_json    TEXT NOT NULL,           -- JSON content blocks (text, image, tool_use, tool_result)
  interrupted     INTEGER NOT NULL DEFAULT 0,
  total_input_tokens   INTEGER NOT NULL DEFAULT 0,
  total_output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_estimate   REAL NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);

CREATE TABLE chat_uploads (
  id          TEXT PRIMARY KEY,
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BLOB NOT NULL,
  attached    INTEGER NOT NULL DEFAULT 0,  -- 1 if attached to a node, else GC'd after 24h
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE generated_sketches (
  id          TEXT PRIMARY KEY,
  prompt      TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  data        BLOB NOT NULL,
  attached    INTEGER NOT NULL DEFAULT 0,  -- 1 if attached to a node, else GC'd after 1h
  cost_estimate REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Settings additions :**
```
mcp_api_key      → bearer token unique pour clients MCP distants
anthropic_api_key → existant ou nouveau
openai_api_key   → existant ou nouveau (pour Whisper)
youtube_api_key  → existant
```

**Storage des images entrantes/sortantes :** suit le pattern existant (BLOB SQLite, comme `face_reactions`, `swipe_files`, `logos`, `generated_images`). Pas de R2/disque pour rester cohérent avec l'app actuelle.

---

## 4. Tool registry — surface complète

**Format unifié :** chaque tool est `(input: ZodSchema) → Promise<{ content: ContentBlock[] }>`. Définit dans `src/lib/agent/tools/<name>.ts`. Exporté via `src/lib/agent/tools/index.ts` qui construit le registry `{ name → { schema, description, handler } }`.

### A. Lecture canvas (scope projet)

| Tool | Input | Output | Note |
|---|---|---|---|
| `get_canvas_state` | `{ project_id }` | `{ blueprint: { nodes: [...], edges: [...] } }` | Format compact, pas de base64. Inclut id, type, label, summary par node. |
| `get_node_details` | `{ project_id, node_id }` | Données complètes du node, images en base64 réduites (max 512px) | Pour quand Claude doit voir un node spécifique en détail |

### B. Écriture canvas (scope projet)

| Tool | Input | Output | Note |
|---|---|---|---|
| `apply_workflow` | `{ project_id, blueprint }` | `{ applied: { created, updated, deleted }, current_node_ids }` | **Le seul tool d'écriture canvas.** Diff + apply + auto-layout. Validé par schéma Zod strict. |

### C. Bibliothèque (scope user)

| Tool | Input | Output |
|---|---|---|
| `list_face_references` | `{}` | `[{ id, label, size, created_at, thumbnail_url }]` |
| `list_logos` | `{}` | `[{ id, label, size, created_at, thumbnail_url }]` |
| `list_swipe_files` | `{}` | `[{ id, label, size, created_at, thumbnail_url }]` |
| `list_face_reactions` | `{}` | `[{ id, label, size, thumbnail_url }]` |
| `list_projects` | `{}` | `[{ id, name, updated_at }]` |
| `list_past_generations` | `{ project_id, limit? }` | `[{ id, model, prompt, created_at, thumbnail_url, cost }]` |

### D. Génération et édition images

| Tool | Input | Output | Cost |
|---|---|---|---|
| `generate_sketch` | `{ prompt, aspect_ratio? }` | `{ generated_id, thumbnail_url, prompt_used }` | nano-banana, ~0.04$ |
| `remix_image` | `{ source_id, prompt, aspect_ratio? }` | `{ generated_id, thumbnail_url }` | wraps `/api/remix/ideogram`, ~0.05$ |
| `edit_image` | `{ source_id, prompt }` | `{ generated_id, thumbnail_url }` | wraps `/api/edit/ideogram`, ~0.05$ |
| `trigger_generation` | `{ project_id, generator_id }` | `{ generation_ids, total_cost }` | Lance la génération principale. **Demande confirmation user explicite avant appel.** |

### E. Recherche et contexte externe

| Tool | Input | Output | Cost |
|---|---|---|---|
| `extract_youtube_script` | `{ url }` | `{ title, description, transcript, thumbnail_url, channel }` | gratuit, lib `youtube-transcript` ou équivalent |
| `search_youtube_channel` | `{ handle?, query?, limit? }` | `[{ video_id, title, view_count, published_at, thumbnail_url }]` | YouTube Data API (clé déjà présente) |
| `get_channel_videos` | `{ handle?, limit?, sort? }` | Liste des vidéos triées par date ou par vues | YouTube Data API |

**Note `web_search` :** ce n'est **pas** dans le registry. C'est un *server tool* fourni nativement par Anthropic. Le browser agent l'ajoute directement à la liste de tools passée au SDK Claude. Les MCP clients distants ont leur propre `web_search` côté leur LLM — pas notre responsabilité.

### F. Tools UI-only (browser uniquement, pas exposés en MCP)

| Tool | Input | Output | Note |
|---|---|---|---|
| `request_user_image` | `{ reason, suggested_kind? }` | `{ source_ids: [...] }` ou `{ skipped: true }` | Pause-handshake : émet event SSE qui ouvre le file picker, suspend la boucle agent jusqu'à upload (ou skip user). |
| `request_user_sketch` | `{ initial_image_id?, reason }` | `{ generated_id }` ou `{ skipped: true }` | Pause-handshake : ouvre le `SketchEditor` existant en modal. |

**Note d'implémentation :** les tools UI-only sont enregistrés directement dans la boucle browser (pas dans le registry MCP). La boucle agent voit `[…tools MCP, request_user_image, request_user_sketch]`. Quand Claude appelle un tool UI-only, le serveur émet un event SSE et `await` une promesse résolue par le POST de résultat depuis le browser.

### Schéma blueprint (validé par Zod)

```typescript
type Blueprint = {
  nodes: Array<{
    id: string;                    // unique dans le blueprint, format "type-N"
    type: "faceReference" | "swipeFile" | "sketch" | "prompt" | "generator" | "preview";
    position?: { x: number; y: number };  // optional, auto_layout sinon
    data: Record<string, unknown>;        // shape par type, voir ci-dessous
  }>;
  edges: Array<{
    source: string;                // node id du blueprint
    target: string;
    targetHandle: "face-in" | "logo-in" | "ref-in" | "sketch-in" | "prompt-in" | string;
  }>;
};

// Per-type data schema (validation stricte)
type NodeData =
  | { type: "faceReference", image_source: ImageSource, label?: string }
  | { type: "swipeFile", kind: "logo" | "reference", image_source: ImageSource, label?: string }
  | { type: "sketch", image_source: ImageSource }
  | { type: "prompt", prompt: string, negativePrompt?: string }
  | { type: "generator", model: "ideogram" | "grok" | "nano-banana" | "openai", aspectRatio: "16x9" | "9x16" | "1x1", count?: number }
  | { type: "preview" };  // créé par le runtime, pas par Claude

// ImageSource (string discriminée)
type ImageSource =
  | `stored:fc_${string}`     // face reference de la lib
  | `stored:lg_${string}`     // logo de la lib
  | `stored:sf_${string}`     // swipe file de la lib
  | `stored:fr_${string}`     // face reaction de la lib
  | `stored:gi_${string}`     // generated image (past generation)
  | `generated:${string}`     // sketch généré par generate_sketch
  | `uploaded:${string}`      // upload dans le chat
  | `data:image/${string}`;   // base64 inline (déconseillé sauf petit)
```

**`apply_workflow` côté client :**
1. Validation Zod stricte du blueprint complet → rejet avec erreur claire si invalide
2. Résolution des `image_source` : vérifie que les `stored:*` existent en DB, que les `generated:*` ne sont pas expirés, etc. Erreur avec détail si une référence est cassée.
3. Diff contre l'état canvas actuel (par id de node) : created / updated / deleted
4. Application animée 200-300ms entre opérations
5. Auto-layout (Dagre, ajouté en dépendance) après application
6. Marque les `chat_uploads` et `generated_sketches` référencés comme `attached=1` (skip GC)
7. POST vers `/api/project` pour persister
8. Retour à Claude avec récap

---

## 5. Browser agent — `/api/agent/chat`

**Endpoint :** `POST /api/agent/chat`
**Body :**
```json
{
  "conversation_id": "uuid",
  "project_id": "uuid",
  "message": {
    "text": "...",
    "attachments": [
      { "type": "image", "source": "uploaded:xxx" | "stored:..." }
    ]
  },
  "canvas_snapshot": { /* output de get_canvas_state, fournie par le client pour économiser un tool call */ }
}
```
**Réponse :** SSE stream

**Boucle agent (pseudo) :**

```
1. Charger conversation + messages depuis DB
2. Persister le nouveau message user
3. Construire le prompt :
   - System : persona + checklist + canvas_snapshot injecté en <canvas_state>
   - Messages : historique + nouveau message
4. Instancier MCP InMemoryClient → liste les tools serveur
5. Tools list = [...tools MCP, request_user_image, request_user_sketch, web_search natif]
6. Loop {
     stream = anthropic.messages.stream({ model: "claude-sonnet-4-6", tools, messages, ... })
     pour chaque event SSE :
       - text_delta → forward au browser
       - input_json_delta sur tool_use → forward
       - content_block_stop sur tool_use → identifier le tool
     à message_stop :
       si stop_reason == "tool_use" :
         pour chaque tool_use :
           si tool MCP → exécuter via InMemoryClient → tool_result
           si tool UI-only :
             émettre SSE { type: "tool_call", id, name, input }
             await POST /api/agent/chat/tool-result avec le résultat
             → tool_result
         ajouter à l'historique, continuer la boucle
       si stop_reason == "end_turn" / "stop_sequence" :
         persister message assistant complet
         calculer cost, update DB
         émettre SSE { type: "done" }
         break
       si stop_reason == "pause_turn" (server tools longs) :
         continuer la boucle avec message inchangé
   }
7. Si AbortController déclenché par client → break, persister partiel avec interrupted=1
```

**SSE protocol :**
```
event: text_delta              data: { content: "..." }
event: tool_call               data: { id, name, input, scope: "ui" | "server" }   (informationnel)
event: tool_result             data: { id, content_summary }                       (pour affichage carte)
event: ui_tool_request         data: { id, name, input }                           (action requise)
event: ui_tool_response_ack    data: { id }                                        (résultat reçu)
event: done                    data: { usage, cost }
event: error                   data: { message, recoverable }
```

**Endpoint compagnon :** `POST /api/agent/chat/tool-result` avec `{ conversation_id, tool_use_id, result }` → résout la promesse en attente côté serveur.

**Contexte initial (system prompt, ~700 tokens) :**

```
You are ThumbGen Brainstorm, an expert YouTube thumbnail strategist embedded in a node-based canvas editor.

Your job: collaborate with the creator to design and produce the best thumbnail for their video by progressively building the workflow on their canvas.

Mental checklist (adapt to context, don't follow rigidly) :
1. Understand the video subject + audience + tone (ask if unclear)
2. Check if there are visual references they want (call list_swipe_files OR ask them to upload)
3. Check if their face should appear (call list_face_references / list_face_reactions OR ask)
4. If a brand is mentioned, ask if they want a specific logo (call list_logos OR ask)
5. If web context would help (recent topic, current event), use web_search
6. If they want to leverage their YT channel context, use search_youtube_channel
7. Propose a quick sketch via generate_sketch to validate the visual direction
8. Once validated, build the final workflow via apply_workflow with the right generator + connections
9. Ask explicit confirmation before calling trigger_generation (it costs money)

Rules :
- Always read the current canvas state at the start of each turn (it's injected in <canvas_state>)
- If the canvas already has a workflow and the user wants to "modify" or "iterate", call apply_workflow with a new blueprint that retains existing node IDs you want to keep
- If the user wants a "new thumbnail", build a fresh workflow alongside the existing one (different positions)
- Always announce what you're about to do before calling a tool ("Je vais générer un croquis…")
- French is the user's preferred language unless they switch
- Be concise. The user is creative, not technical. Don't dump JSON in chat.
- Cost-aware: prefer generate_sketch (cheap) for exploration, trigger_generation only after validation
- Cite web sources when you use web_search
```

**Modèle :** `claude-sonnet-4-6` (sweet spot intelligence/coût pour agent multi-tool). Fallback : `claude-opus-4-7` si l'utilisateur active "high-quality mode" dans Settings (option v2).

**Prompt caching :** activé via `cache_control: { type: "ephemeral" }` sur le system prompt + canvas_snapshot. Réduit fortement le coût des tours suivants (canvas state change peu entre deux messages).

**Web search :** tool `web_search_20250305` (compatible Sonnet 4.5/4.6) avec `max_uses: 5`. Si on passe à Opus 4.7 plus tard, on peut switcher à `web_search_20260209` (dynamic filtering).

---

## 6. MCP server — `/api/mcp`

**Stack :** `@modelcontextprotocol/sdk` + `StreamableHTTPServerTransport`

**Endpoint :** `POST /api/mcp` et `GET /api/mcp` (Streamable HTTP single endpoint)

**Auth :** `Authorization: Bearer <THUMBGEN_API_KEY>` validé via le `authenticateRequest` callback de `StreamableHTTPServerTransport`. Token lu depuis `settings.mcp_api_key` en DB. Généré automatiquement au premier démarrage si absent (32 bytes hex).

**Validation `Origin` header :** rejette les origines non-localhost si la valeur de l'env `THUMBGEN_BIND` est `localhost` (cf. recommandations sécurité MCP contre DNS rebinding).

**Tools exposés :** tous ceux du registry (sections 4.A à 4.E). **Pas exposé :** `request_user_image`, `request_user_sketch` (UI-only).

**Notification browser des changements externes :** quand un MCP client distant modifie le canvas via `apply_workflow`, le browser doit refresh. v1 : polling toutes les 2s sur `projects.updated_at`. v2 : SSE dédié `/api/project/:id/events`.

**Settings UI :**
- Section "MCP" dans le `SettingsPanel`
- Affiche le bearer token avec bouton 👁️ révéler / 📋 copier / ↻ régénérer
- Bloc de doc avec config snippet pour Claude Desktop :
  ```json
  {
    "mcpServers": {
      "thumbgen": {
        "url": "http://localhost:3000/api/mcp",
        "auth": { "type": "bearer", "token": "tg_xxxxx" }
      }
    }
  }
  ```
- Note "Pour utiliser à distance, expose l'app via Tailscale, ngrok, ou hébergement (HTTPS recommandé)"

---

## 7. UI — Panneau latéral (ChatPanel)

**Fichier :** `src/components/panels/ChatPanel.tsx` + sous-composants

**Layout :**
```
┌─────────────────────────────────────────────┬──────────────────┐
│                                             │  ╳   Chat        │
│         CANVAS                              │ ┌──────────────┐ │
│         (nodes apparaissent en              │ │ Convos       │ │
│          temps réel pendant la conv         │ │ ─ Brainstorm │ │
│          via apply_workflow)                │ │ ─ Variante 2 │ │
│                                             │ │ + Nouvelle   │ │
│                                             │ └──────────────┘ │
│                                             │                  │
│                                             │  Messages…       │
│                                             │  (virtualisé)    │
│                                             │                  │
│                                             │  ┌────────────┐  │
│                                             │  │ Input + 🎤 │  │
│                                             │  │ + 📎 + ↑   │  │
│                                             │  └────────────┘  │
└─────────────────────────────────────────────┴──────────────────┘
```

**Largeur :** 420px, animation slide-in depuis la droite.
**Toggle :** bouton "✨ Chat IA" dans `SidebarRail`.

**Structure de composants :**
```
ChatPanel
├── ChatPanelHeader        (titre conv éditable, fermer)
├── ConversationList       (déroulant repliable)
│   └── ConversationItem
├── MessageList            (virtualisé)
│   └── Message
│       ├── UserMessage    (texte + attachments thumbnails + badge audio si transcrit)
│       └── AssistantMessage (markdown + ToolCallCard inline + citations)
│           └── ToolCallCard (icône + nom lisible + state spinner/done/error)
├── PendingUiAction        (request_user_image | request_user_sketch UI inline)
└── Composer
    ├── AttachmentTray     (thumbnails images en attente)
    ├── Textarea (autosize)
    ├── MicButton          (push-to-talk OU toggle, MediaRecorder + transcription)
    ├── AttachButton       (file picker + "Depuis ma bibliothèque" modal)
    └── SendButton         (devient ◼ Stop pendant un tour)
```

**Cartes inline pour tool calls :**

| Tool | Affichage |
|---|---|
| `web_search` | 🔍 Recherche : `"requête"` → liste de citations |
| `generate_sketch` | 🎨 Croquis généré → image inline |
| `apply_workflow` | ➕ Workflow mis à jour (+3 nodes, ~1, -0) |
| `extract_youtube_script` | 📺 Vidéo analysée : "titre" |
| `search_youtube_channel` | 📊 Chaîne explorée : N vidéos |
| `list_*` | 📚 Bibliothèque consultée |
| `request_user_image` | Bloc UI : "Drop ton image ici" + file picker + bouton Skip |
| `request_user_sketch` | Bloc UI : "Dessine ton idée" → ouvre `SketchEditor` modal |
| `trigger_generation` | ⚡ Génération en cours… → preview à la fin |

**Trigger d'ouverture initiale :**
- v1 : ne s'ouvre que sur clic du bouton (pas auto). Si un projet est nouveau et vide, badge subtil "✨ Brainstorme avec l'IA" sur le bouton.
- v2 (post-feedback user) : auto-open sur nouveau projet vide.

**Persistance UI :** état "panneau ouvert" stocké en localStorage par projet.

**Audio :**
- `MediaRecorder` → blob webm/opus
- POST multipart vers `POST /api/agent/transcribe`
- Modèle : `gpt-4o-mini-transcribe` (le moins cher, qualité bonne pour FR)
- Texte injecté dans la textarea, badge "🎤" sur le message envoyé

**Polling pour mutations externes :**
- Hook `useCanvasSync(projectId)` poll `GET /api/project/:id?fields=updated_at` toutes les 2s
- Si différent du local, fetch full project et merge dans Zustand
- Désactivable dans Settings (pour devs sans MCP distant)

---

## 8. Auth, sécurité, limites

**Auth :**
- App browser : aucune (mono-user local), comme aujourd'hui
- MCP HTTP : Bearer token unique. Origin validation pour prévenir DNS rebinding.

**Limites par message :**
- 5 images max
- 5 MB par image
- formats : jpeg, png, webp
- 1 audio max, 5 min max

**Limites par conversation (configurables, defaults) :**
- 50 turns
- $5 cumul de coûts
- Si dépassé, message d'avertissement + bouton "Continuer quand même" (pas de hard block)

**Image storage :**
- `chat_uploads` : `attached=0` GC après 24h
- `generated_sketches` : `attached=0` GC après 1h (Claude en génère vite, on évite l'accumulation)
- `attached=1` (référencés par un node) : jamais purgés
- Job de GC : tâche au démarrage du serveur (cron in-process toutes les heures)

**Coût tracking :**
- Réutilise `generations_log` pour les tools de génération (sketches, remix, edit, trigger_generation)
- Coût des appels Claude (input/output tokens) stocké directement dans les colonnes `total_input_tokens`, `total_output_tokens`, `cost_estimate` de la table `messages` (déjà prévues, voir section 3)
- Settings affiche un total $ par jour / par mois (somme des deux sources)

**Rate limits :** aucune protection custom v1 (mono-user). Si erreur Anthropic 429, retry exponentiel 3x puis erreur claire à l'user.

---

## 9. Décisions par sujet (récap des Q1–Q7)

| # | Sujet | Décision |
|---|---|---|
| Q1 | Forme du chat | Panneau latéral droit, 420px |
| Q2 | Niveau d'agence | B — Agent constructeur (manipule directement le canvas via apply_workflow) |
| Q3 | Audio | A — MediaRecorder + Whisper (gpt-4o-mini-transcribe) |
| Q4 | Modèle sketch | A — nano-banana (déjà intégré) |
| Q5 | Web search | A — `web_search_20250305` natif Anthropic |
| Q6 | Persistance | B — Plusieurs convos par projet, listées dans le panneau |
| Q7 | Tools additionnels | A — Tous (extract_youtube_script, search_youtube_channel, get_channel_videos, remix_image, edit_image, list_face_reactions, list_past_generations) |
| MCP | Architecture | Registry pure functions → MCP server avec InMemoryTransport (browser) + StreamableHTTPServerTransport (remote). Bearer auth. |
| Workflow | Représentation | Blueprint JSON unique via `apply_workflow` (pas de tools atomiques d'écriture). Diff côté client + animation. |

---

## 10. Non-goals (explicites)

- Multi-utilisateur : reste mono-user. Pas d'auth user, pas de namespacing.
- Tunnel intégré (ngrok-like) : l'utilisateur configure Tailscale/ngrok lui-même
- Audio natif Claude (en input) : Whisper-only
- Streaming "live" des nodes apparaissant un par un pendant que Claude écrit le blueprint : tout apparaît à l'application du blueprint (avec animation 300ms entre opérations)
- Undo/redo de l'agent : v2 (snapshot du blueprint précédent stocké, bouton "annuler la dernière action de l'IA")
- Édition collaborative temps réel browser ↔ MCP distant : polling 2s suffisant
- Génération de prompt négatif riche : laissé au champ libre
- Gestion multi-projet depuis le chat (le chat reste scopé au projet courant en v1) — sauf via MCP distant qui peut faire `list_projects`

---

## 11. Dépendances à ajouter

```
"@anthropic-ai/sdk": "^x.y.z"
"@modelcontextprotocol/sdk": "^x.y.z"
"openai": "^x.y.z"            // pour Whisper
"zod": "^3.x"                 // schémas tools + blueprint
"youtube-transcript": "^x.y"  // pour extract_youtube_script (ou équivalent)
"@dagrejs/dagre": "^x.y"      // pour auto_layout
```

À installer + mettre à jour `package.json`. Aucun retrait de dépendance existante.

---

## 12. Phases de build (haut niveau)

Ordre proposé pour minimiser le risque et permettre du feedback fréquent. Détail par phase = travail du plan d'implémentation.

**Phase 0 — Fondations (1-2j)**
- Migration SQLite : nouvelles tables (`conversations`, `messages`, `chat_uploads`, `generated_sketches`)
- Settings additions (clés API, mcp_api_key auto-généré)
- Install des dépendances
- Schéma Zod du blueprint + tests unitaires de validation

**Phase 1 — Tool registry (2-3j)**
- `src/lib/agent/tools/*.ts` : tous les tools en pure functions (testables sans HTTP)
- Tests unitaires par tool
- Ne touche pas encore au browser ni à MCP

**Phase 2 — MCP server in-process (1-2j)**
- `src/lib/agent/mcp/server.ts` : construit le McpServer depuis le registry
- `InMemoryClient` helper pour usage browser
- `StreamableHTTPServerTransport` route `/api/mcp` avec auth bearer
- Test end-to-end : un script local qui parle au MCP via HTTP et appelle des tools

**Phase 3 — Browser agent (3-5j)**
- `/api/agent/chat` route SSE
- Boucle agent avec tool dispatch (MCP InMemory + UI-only)
- `/api/agent/chat/tool-result` pour suspend/resume
- `/api/agent/transcribe` pour Whisper
- Pas encore d'UI — testable via curl avec SSE simulé

**Phase 4 — UI ChatPanel (4-6j)**
- Composants React (ChatPanel, ConversationList, Composer, MessageList, ToolCallCard, etc.)
- Hook SSE consumer
- Hook `useCanvasSync` pour polling
- Intégration dans `Canvas.tsx` (slide-in animation)
- `apply_workflow` côté client (validation + diff + animated apply via Zustand actions)

**Phase 5 — Polish & Settings (1-2j)**
- Section MCP dans Settings (bearer token UI)
- Documentation install client distant dans le README
- Cost tracking display
- GC job des uploads/sketches expirés

**Estimation totale : 12-20 jours dev solo.**

---

## 13. Risques et mitigation

| Risque | Mitigation |
|---|---|
| Coût explosif (multimodal + agent + sketches) | Cost cap par conversation, prompt caching, sketches en "draft mode" potentiel v2 (Flux Schnell) |
| Latence perçue côté UX (génération sketch ~5s) | Skeleton inline + message "Je génère le croquis…" avant l'appel |
| Hallucination du blueprint (Claude invente un id qui n'existe pas) | Validation Zod stricte avant apply, erreur retournée à Claude qui corrige au tour suivant |
| Conflit canvas (user modifie pendant que MCP distant modifie) | Last-write-wins. Polling 2s. v2 : optimistic locking via `updated_at` if-match. |
| MCP HTTP exposé sans HTTPS | Doc claire dans Settings + README pour utiliser HTTPS via tunnel |
| Whisper mauvaise qualité FR | gpt-4o-mini-transcribe est multilingue + précisable via `language: "fr"` |
| Image base64 fait exploser les requêtes Anthropic (32MB limit) | Resize côté client à max 1024px avant upload, conversion en webp si lourd |
| Boucle infinie de tool use | `max_iterations` hard cap à 25 par turn. Au-delà, on coupe et on remonte à Claude. |
