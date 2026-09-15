# ThumbGen — Migration de l'agent chat vers Vercel AI SDK + AI Elements

**Date :** 2026-09-14
**Auteur :** brainstorming Antoine + Claude (avec review adversariale : agent Challenger + agent Reviewer doc)
**Statut :** spec validé, prêt pour implementation plan
**Précède :** [2026-04-25-thumbgen-agent-design.md](./2026-04-25-thumbgen-agent-design.md) — ce document ne remplace pas l'architecture MCP d'origine, il migre uniquement le consommateur browser.

---

## 1. Contexte et objectif

L'agent conversationnel "Brainstorm" (panneau latéral du canvas) tourne aujourd'hui sur une stack 100% maison : client `openai` brut pointé sur OpenRouter, boucle de tool-calling manuelle (`src/lib/agent/loop.ts`, 415 lignes), streaming SSE écrit à la main côté serveur (`src/app/api/agent/chat/route.ts`) et parsé à la main côté client (`src/hooks/useChat.ts`). Aucune brique Vercel AI SDK, aucun composant shadcn.

**Objectif :** migrer vers `ai` (Vercel AI SDK v7) + `@ai-sdk/react` côté logique, et shadcn **AI Elements** (`elements.ai-sdk.dev`) côté UI, pour un panneau visuellement pro et un code de boucle d'agent standard plutôt que maison.

**Portée validée avec l'utilisateur (3 questions de cadrage, réponses "Recommandé" à chaque fois) :**
- Migration **complète** du backend (pas juste un adaptateur fin autour de l'existant)
- **Parité fonctionnelle totale** — rien de ce qui marche aujourd'hui ne doit régresser
- **Reskin visuel complet** aux couleurs/typo ThumbGen (pas le thème par défaut d'AI Elements)

**Important — ce que "parité" veut dire ici :** l'audit (ci-dessous) a trouvé deux bugs déjà présents en prod. Décision validée : on les corrige dans le cadre de cette migration, pas après. "Parité" = les fonctionnalités décrites marchent, pas qu'elles reproduisent un bug silencieux.

---

## 2. Constat — audit du système actuel

Deux agents ont travaillé en parallèle sur cette spec : un **Challenger** (a relu le code source réel — pas seulement ce brouillon — pour attaquer l'architecture proposée) et un **Reviewer** (a vérifié 9 affirmations techniques contre la documentation officielle réelle d'AI SDK / AI Elements / OpenRouter, avec sources citées). Leurs trouvailles ont changé la conception initiale sur deux points.

### 2.1 Deux bugs confirmés, indépendants de la migration

**Bug A — le handshake "demande une photo/un sketch à l'utilisateur" est cassé.**
`loop.ts:283-289` enregistre la promesse d'attente sous un `requestId = uuid()` fraîchement généré (`registerPending(requestId)`), mais envoie à la fois `id` (le tool_call id du LLM) et `request_id` dans l'événement SSE `ui_tool_request`. Le champ `request_id` n'est lu **nulle part** ailleurs dans le code — `useChat.ts` ne le déclare même pas dans son type `ChatEvent`. Tous les consommateurs (`ChatPanel.tsx`, `PendingUiAction.tsx`) utilisent `.id`, qui repart vers `POST /api/agent/chat/tool-result` avec `tool_use_id: c.id`, qui cherche dans le registre une clé (`c.id`) qui n'a jamais été enregistrée (la clé enregistrée était `requestId`). `resolvePending` échoue silencieusement, et **aucun timeout n'existe** dans `pending-actions.ts`. Résultat : si l'agent appelle un jour réellement `request_user_image`, la boucle reste bloquée indéfiniment sur ce tool call.

**Bug B — les images de résultats d'outils ne survivent pas à la persistance.**
`ChatPanel.tsx`'s `rowToDisplay` lit des champs `_images`/`_summary` sur les blocs `tool_use` persistés, avec un commentaire affirmant que `loop.ts` les attache. Il ne le fait jamais — le bloc `tool_use` réellement persisté (`loop.ts:264`) est `{type, id, name, input}`, rien d'autre. La vraie donnée (images, résumé) vit dans un bloc `tool_result` séparé, dans le message `user` suivant — que `rowToDisplay` ignore explicitement. Conséquence concrète : la grille de 8 miniatures YouTube de `search_youtube`, les previews de `generate_sketch`, disparaissent dès que le tour se termine et que `ChatPanel.tsx` refetch l'historique, ou à la réouverture d'une conversation. Visibles seulement pendant le streaming live.

**Décision validée :** corriger les deux dans le cadre de cette migration (voir §4.3 et §5.3), pas les porter tels quels.

### 2.2 Erreur évitée dans la conception initiale

Le premier brouillon proposait de supprimer la couche MCP-en-mémoire du chat ("aucun client externe ne parle MCP à cette app"). **C'est faux.** `src/app/api/mcp/route.ts` est un vrai serveur MCP externe en prod, authentifié par bearer token (`WebStandardStreamableHTTPServerTransport`), exposant exactement le même registre de tools — c'était même **la contrainte n°1 de la spec d'origine d'avril 2026** ("la même surface de tools doit être exposée comme un serveur MCP consommable depuis n'importe quel client distant : Claude Desktop, Claude Code, mobile, Cursor"). `src/lib/settings.ts` a `ensureMcpApiKey`/`regenerateMcpApiKey`, et `McpSettingsSection.tsx` a une UI réelle avec confirmation ("Régénérer la clé invalidera toute configuration existante de Claude Desktop ou autre client MCP"). Supprimer la couche MCP aurait cassé cette fonctionnalité livrée, en effet de bord non discuté d'un redesign de panneau chat.

**Décision :** le registre de tools (`src/lib/agent/tools/*.ts`, `tools/index.ts`, `tools/all.ts`) et le serveur MCP (`mcp/server.ts`, `api/mcp/route.ts`) restent **intouchés**. Seule la façon dont le panneau chat *consomme* ce registre change.

---

## 3. Architecture cible

```
                       ┌────────────────────────────────┐
                       │  TOOL REGISTRY (INTOUCHÉ)      │
                       │  src/lib/agent/tools/*.ts      │
                       │  tools/index.ts (registre)     │
                       └────────────────────────────────┘
                                       ▲
                    ┌──────────────────┴──────────────────┐
                    │                                      │
         NOUVEAU adaptateur direct              MCP SERVER (INTOUCHÉ)
         registry → AI SDK tool()                mcp/server.ts
         (remplace mcp/in-memory-client.ts)       api/mcp/route.ts
                    │                              ▲
         ┌──────────┴──────────┐          StreamableHTTPServerTransport
         │  streamText()       │                    │
         │  src/app/api/       │           ┌────────┴───────────────┐
         │  agent/chat/route.ts│           │ Remote MCP clients     │
         │  - AI SDK v7        │           │ (Claude Desktop, etc.) │
         │  - @openrouter/     │           └────────────────────────┘
         │    ai-sdk-provider  │
         │  - onFinish →       │
         │    persist UIMessage│
         └──────────┬──────────┘
                     │ AI SDK UI Message Stream (SSE)
         ┌───────────┴────────────┐
         │  ChatPanel.tsx         │
         │  @ai-sdk/react useChat │
         │  + AI Elements         │
         └─────────────────────────┘
```

### 3.1 Ce qui change vs ce qui ne change pas

| Composant | Sort |
|---|---|
| `tools/*.ts` (14 tools, schémas zod + handlers) | **Intouché** |
| `tools/index.ts` (registre, `registerTool`) | **Intouché** |
| `tools/all.ts` | **Intouché** |
| `mcp/server.ts`, `api/mcp/route.ts` | **Intouché** — infra externe réelle |
| `mcp/in-memory-client.ts` | **Supprimé**, remplacé par un adaptateur direct registre → `tool()` AI SDK (pas de faux aller-retour MCP pour un appelant in-process) |
| `browser-tools/*.ts` (request_user_image, request_user_sketch) | **Réécrit** en AI SDK client tools (sans `execute`, résolus via `addToolOutput`) |
| `pending-actions.ts`, `/api/agent/chat/tool-result` | **Supprimés** — `addToolOutput` corrèle par un seul `toolCallId`, plus besoin du double-ID qui causait le Bug A |
| `llm-client.ts` | **Réécrit** — `@openrouter/ai-sdk-provider` au lieu du SDK `openai` brut. Garde la lecture fraîche de `getSetting("openrouterApiKey")` à chaque requête (pas de singleton module-scope — voir §6.4) |
| `translate.ts` | **Supprimé** — AI SDK gère nativement le format des messages, plus besoin de traducteur Anthropic↔OpenAI maison |
| `loop.ts` | **Supprimé**, remplacé par un appel `streamText()` avec `stopWhen: isStepCount(25)` dans le route handler |
| `route.ts` (`/api/agent/chat`) | **Réécrit** — `streamText(...).toUIMessageStreamResponse()` |
| `useChat.ts` (hook maison) | **Supprimé**, remplacé par `@ai-sdk/react`'s `useChat` |
| `ChatPanel.tsx` + tous les sous-composants `chat/*.tsx` | **Réécrits** avec AI Elements (mapping détaillé §5) |
| `conversation/store.ts` (persistence SQLite) | **Modifié** — stocke des `UIMessage` JSON au lieu de blocs Anthropic (voir §4) |
| `gc.ts` (`startGcLoop`) | **Déplacé** — était bootstrapped comme effet de bord de l'import de `loop.ts`; doit être ré-hébergé ailleurs (ex. instrumentation Next.js ou le nouveau route handler) pour ne pas être perdu silencieusement |

### 3.2 Tool calls humains-dans-la-boucle (browser tools)

Aujourd'hui : deux IDs (tool_call id + request_id généré), résolution par POST séparé, aucun timeout, cassé (Bug A).

Cible : les deux tools (`request_user_image`, `request_user_sketch`) deviennent des **AI SDK client tools** — définis sans fonction `execute` côté serveur. Quand le modèle les appelle, `@ai-sdk/react`'s `useChat` expose l'appel via `onToolCall`, le client affiche la modale existante (`PendingUiAction.tsx`, réutilisée), et la résolution se fait via `addToolOutput({tool, toolCallId, output})` — `output` accepte une donnée arbitraire construite côté client (pas seulement un "j'approuve/je refuse" d'une valeur déjà proposée par le modèle — vérifié contre la doc réelle, c'est le mécanisme `addToolOutput`, pas le mécanisme `toolApproval` plus étroit). Ceci corrige le Bug A **par construction** : un seul `toolCallId` sert à la fois d'ID d'enregistrement et de résolution, il n'y a plus de second ID synthétique à réconcilier.

`request_user_sketch` reste exclu de la liste active tant que `SketchEditor` n'a pas de callback de sauvegarde (limitation pré-existante, non liée à la migration — notée comme suivi séparé, pas bloquant ici).

### 3.3 Recherche web

Le mécanisme actuel (`plugins: [{id:"web"}]` sur le client OpenRouter, activé/désactivé par le réglage `agentWebSearch`) est confirmé **déprécié par OpenRouter lui-même** au profit de `tools: [{type: "openrouter:web_search"}]` — un vrai tool que le modèle décide d'appeler 0 à N fois, plutôt qu'un flag qui force toujours exactement une recherche.

**Décision validée :** migrer vers le nouveau mécanisme. Effet secondaire utile : ça corrige au passage le bug du system prompt qui prétend que `web_search` est un tool appelable (`system-prompt.ts:44`, `"Cite web sources when you use web_search"`) — avec le nouveau mécanisme, ça devient vrai. Le réglage `agentWebSearch` continue de piloter si ce tool est inclus dans la liste passée au modèle pour le tour en cours.

---

## 4. Persistence (SQLite)

### 4.1 Format de stockage

Aujourd'hui : `messages.content_json` stocke des blocs au format Anthropic (`{type:"text"}`, `{type:"tool_use"}`, `{type:"tool_result"}`, `{type:"image", source:{...}}`).

Cible : `messages.content_json` stocke directement des `UIMessage` (format AI SDK), sérialisés en JSON. Le hook `onFinish` de `streamText` (ou de `toUIMessageStreamResponse`) fournit le résultat complet côté serveur, indépendamment de ce qui est streamé au client — c'est le point d'écriture DB.

### 4.2 Migration des lignes existantes

**Décision :** script de migration ponctuel (pas une branche de lecture double permanente). Au déploiement, un script parcourt les lignes existantes en format Anthropic-blocks et les réécrit en `UIMessage`. Après le script, le code de lecture n'a plus qu'un seul format à comprendre — pas de `if (ancien format) ... else ...` qui traîne indéfiniment dans la codebase.

Le script de migration doit aussi **tenter de récupérer les données actuellement perdues par le Bug B** : pour chaque tour assistant historique, retrouver le bloc `tool_result` correspondant (dans le message `user` suivant, aujourd'hui ignoré par `rowToDisplay`) et le fusionner dans le `UIMessage` reconstruit, plutôt que d'accepter que ces images soient perdues définitivement pour l'historique pré-migration.

### 4.3 Stockage des images de résultats d'outils

Aujourd'hui : inline base64 dans `content_json`, sauf `generate_sketch` qui a déjà un stockage dédié (`generated:sk_<id>` + route `/api/generated-sketches/<id>`).

**Décision validée :** généraliser le pattern de `generate_sketch` à tous les tools qui renvoient des images (`search_youtube` — jusqu'à 8 miniatures par appel —, `import_youtube_thumbnail`). Chaque image de résultat est stockée une fois dans une table dédiée (ou réutilise une table existante comme `generated_images`/`chat_uploads` selon le cas) et référencée par une URL fetchable dans le `UIMessage` persisté, plutôt que ré-encodée inline à chaque fois. Ça règle à la fois le Bug B (les données ne sont plus jetées, elles sont dans une vraie table) et le risque de gonflement de la colonne `content_json` (une conversation avec plusieurs recherches YouTube à 8 miniatures grossirait vite en inline base64).

---

## 5. Frontend — mapping vers AI Elements

Liste réelle des composants AI Elements vérifiée contre le code source du repo `vercel/ai-elements` (pas une liste de mémoire) : `agent`, `artifact`, `attachments`, `audio-player`, `canvas`, `chain-of-thought`, `checkpoint`, `code-block`, `commit`, `confirmation`, `connection`, `context`, `controls`, `conversation`, `edge`, `environment-variables`, `file-tree`, `image`, `inline-citation`, `jsx-preview`, `message`, `mic-selector`, `model-selector`, `node`, `open-in-chat`, `package-info`, `panel`, `persona`, `plan`, `prompt-input`, `question`, `queue`, `reasoning`, `sandbox`, `schema-display`, `shimmer`, `snippet`, `sources`, `speech-input`, `stack-trace`, `suggestion`, `task`, `terminal`, `test-results`, `tool`, `toolbar`, `transcription`, `voice-selector`, `web-preview`.

### 5.1 Mapping direct (remplacent un composant maison existant)

| Composant maison actuel | AI Element | Notes |
|---|---|---|
| `MessageList.tsx` | `conversation` | Container scrollable |
| `Message.tsx` | `message` | Bulle de message |
| `Composer.tsx` | `prompt-input` | Inclut probablement déjà les slots attach/submit/stop |
| `AttachButton.tsx` | `attachments` | Strip de prévisualisation des pièces jointes |
| Tools texte simples (`list_projects`, `get_canvas_state`, `apply_workflow`, `list_logos`, `list_swipe_files`, `list_face_reactions`, `list_personas`, `extract_youtube_script`, `search_youtube_channel`, `get_channel_videos`) | `tool` (`ToolHeader`/`ToolContent`/`ToolInput`/`ToolOutput`) | Rendu générique collapsible, suffisant — sortie texte uniquement |
| Citations web (nouveau, via §3.3) | `sources` / `inline-citation` | N'existait pas avant — le mécanisme actuel n'a pas de vrai tool_result à citer |
| Thinking du modèle (si `modelInfo.supportsThinking`) | `reasoning` | Se lie à `message.parts` de type `reasoning`, prop `isStreaming` |

### 5.2 Rendus custom (résultats riches en images — décision validée §2.1/§4.3)

`ToolOutput` (sous-composant de `tool`) accepte du contenu React arbitraire dans sa prop `output` — vérifié contre la doc réelle, pas juste du texte/JSON. Mais une grille de 8 miniatures YouTube avec légende (titre + chaîne) mérite mieux qu'un rendu générique de dev-tool replié par défaut : **renderers custom par nom de tool**, construits avec les primitives AI Elements (`image`, layout de grille maison) :

- `search_youtube` → grille de miniatures avec légende par image (aujourd'hui : légende perdue, tout est aplati dans un tableau `images: string[]` sans lien vers le texte — `loop.ts:361-369`). À corriger dans la nouvelle implémentation : préserver la paire (image, légende) jusqu'au rendu.
- `generate_sketch` → preview large, éventuellement avec bouton d'action (annoter, régénérer)
- `import_youtube_thumbnail` → preview + lien vers la vidéo source

### 5.3 Remplacement de logique bespoke

- **`AgentActivity.tsx`** (heuristique maison à 4 états : thinking / writing / using-tool-X / waiting-on-you, dérivée par scan inversé du log d'événements) → à reconstruire à partir du `status` exposé par `useChat` d'AI SDK, potentiellement enrichi avec les composants `task`/`plan`/`chain-of-thought` pour visualiser la progression multi-étapes de la checklist mentale du system prompt (§ "Mental checklist" dans `system-prompt.ts`).
- **`ToolCallCard.tsx` et `AgentActivity.tsx`** ont chacun leur propre table `FRIENDLY_NAMES` de noms d'outils, **déjà en drift l'une par rapport à l'autre** et par rapport au registre réel (toutes deux référencent des tools qui n'existent pas — `get_node_details`, `remix_image`, `edit_image`, `trigger_generation` — et aucune n'a d'entrée pour `list_personas`/`import_youtube_thumbnail`). **Décision :** une seule table de libellés, dérivée ou vérifiée contre `tools/all.ts` (les 14 imports réels), utilisée par tous les rendus de tool.
- **"PROPOSING ANGLES"** (system prompt, l'agent propose 2-3 angles avec sketch chacun, l'utilisateur choisit) → bon candidat pour le composant `suggestion`, remplace le pattern actuel ad-hoc de markdown + images inline.
- **Confirmation avant génération payante** (system prompt règle 11, "ask explicit confirmation before... it costs money") → aujourd'hui aucune UI dédiée, juste une instruction textuelle au modèle. Bon candidat pour le composant `confirmation` — devient une vraie UI plutôt qu'une convention textuelle espérée.
- **`conversation_renamed`** (auto-titre au premier tour) : **retiré du flux de streaming.** C'est un effet de bord fire-and-forget de la persistance du premier tour, indépendant du contenu du tour assistant — aujourd'hui déjà une vraie race condition (écrit sur le même contrôleur SSE que la boucle principale, sans attente). Plutôt que de forcer ça dans le vocabulaire des parts `UIMessage`, le client refetch les métadonnées de conversation après la fin du stream (ou via un petit polling dédié) — pas de tentative de le faire "proprement" rentrer dans le stream AI SDK, ce serait résoudre un problème qu'on s'impose soi-même.

### 5.4 Reskin visuel

Les tokens de marque existants observés dans `ChatPanel.tsx` : `--node-bg`, `--line`, `--line-faint`, `--text-primary`, `--text-muted`, `--brand`, police mono (`--font-mono`, JetBrains Mono) pour les libellés techniques, police display (`--font-display`, Fraunces serif italique) pour les titres. AI Elements/shadcn utilise ses propres variables CSS (`--background`, `--foreground`, `--primary`, etc. selon convention shadcn). **Stratégie :** remapper les variables CSS shadcn vers les custom properties ThumbGen existantes au niveau du thème global, plutôt que resurcharger chaque instance de composant individuellement. Le mapping exact (table complète des variables) est une tâche d'implémentation — nécessite de lire le fichier de thème global (`globals.css` ou équivalent, pas encore lu à ce stade de la spec) pendant l'écriture du plan.

---

## 6. Gestion des erreurs / edge cases

### 6.1 Arrêt (stop) pendant un batch de tool calls

Aujourd'hui : `abort.aborted` n'est vérifié qu'en tête de boucle d'itération et dans la boucle de streaming de tokens — **pas** à l'intérieur de la boucle de dispatch par tool call. Si le modèle déclenche 3 tool calls et que l'utilisateur clique Stop pendant le call #1, les calls #2 et #3 s'exécutent quand même une fois #1 réglé.

**Décision :** comportement à documenter explicitement dans le plan d'implémentation (pas laissé tomber par accident selon ce que fait le AbortSignal wiring d'AI SDK par défaut) — reproduire le comportement actuel ("termine le batch en cours, puis stoppe") comme point de départ, resserrer dans un suivi séparé si besoin.

### 6.2 Concurrence des tool calls dans un même tour

Le system prompt (`system-prompt.ts`, règle "PROPOSING ANGLES") demande explicitement au modèle d'appeler `generate_sketch` "en parallèle — plusieurs tool calls dans le même tour" pour chaque angle proposé. Aujourd'hui, c'est un parallélisme fictif : le serveur exécute quand même chaque call séquentiellement (boucle `for` stricte). Si AI SDK exécute par défaut les tool calls d'un même step en parallèle (comportement probable mais à vérifier en implémentation), ça devient un vrai parallélisme — plusieurs appels concurrents vers le provider de génération d'images. C'est probablement un gain de latence, mais c'est aussi un pattern de charge jamais testé (la sérialisation accidentelle actuelle protège peut-être d'une limite de débit jamais rencontrée).

**Suivi :** à surveiller à l'implémentation — si le provider de génération d'images a une limite de débit stricte, prévoir un throttle explicite (ex. `p-limit`) autour des tools de génération plutôt que de compter sur AI SDK pour le faire.

### 6.3 Usage/coût agrégé sur la boucle multi-étapes

`estimateCost()` actuel accumule `totalInput`/`totalOutput` sur les jusqu'à 25 itérations de la boucle avant de calculer le coût. Vérifié contre la doc réelle : le résultat de `onFinish` sur `streamText` expose à la fois `usage` (probablement par étape) et **`totalUsage`** (agrégé) — utiliser `totalUsage`, pas `usage`, pour ne pas faire dériver silencieusement le badge de coût affiché à l'utilisateur (`UsageBadge.tsx`).

### 6.4 Fraîcheur de la clé API / réglages

`llm-client.ts` actuel lit `getSetting("openrouterApiKey")` à chaque appel (pas de cache) — un changement de clé dans Settings s'applique immédiatement, sans redémarrage. Le pattern idiomatique le plus courant pour `@openrouter/ai-sdk-provider` dans les exemples de doc est un singleton créé une fois au chargement du module. Sur un process Next.js chaud, un singleton naïf figerait la clé présente au démarrage, cassant silencieusement ce comportement.

**Exigence explicite pour le plan d'implémentation :** ne pas utiliser de singleton module-scope pour le client OpenRouter — recréer le provider à partir du réglage courant à chaque requête, comme aujourd'hui. Même chose pour `agentModel` et `agentWebSearch`, déjà lus à chaque tour. **Test de non-régression à inclure explicitement :** changer la clé API dans Settings en cours de session, sans redémarrer, et vérifier que le message suivant utilise la nouvelle clé.

### 6.5 Cap sur la boucle d'agent

`MAX_ITER = 25` → `stopWhen: isStepCount(25)` (nom vérifié contre la doc v7 réelle — l'ancien nom `stepCountIs` a été renommé, la doc à cet ancien nom retourne 404).

### 6.6 Nom de tool fantôme dans le system prompt

`system-prompt.ts` référence `trigger_generation` comme s'il s'agissait d'un tool appelable (règle 11) — il n'a jamais été enregistré dans `tools/all.ts`. **Décision :** corriger la formulation (le déclenchement de génération reste une action utilisateur directe sur le node generator du canvas, pas un tool agent) dans le cadre de cette migration, en même temps que la réécriture du system prompt pour refléter les nouveaux mécanismes (client tools, nouveau tool de recherche web).

---

## 7. Rollout

**Décision validée :** un seul cutover coordonné (pas de système parallèle permanent à la `/api/agent/v2/chat`) — l'app est mono-utilisateur/petite échelle, pas de trafic production à protéger justifiant une migration progressive prolongée. Mais **kill-switch** : un flag booléen simple (réglage ou variable d'environnement) permettant de revenir instantanément à l'ancien chemin (`loop.ts` + `useChat.ts` maison) pendant les 1-2 premières sessions réelles post-cutover, au cas où un troisième bug caché émergerait à l'usage — retour arrière immédiat plutôt qu'un `git revert` sous pression. Le flag et l'ancien code sont supprimés une fois le nouveau chemin validé en usage réel (pas un legacy permanent).

---

## 8. Dépendances à installer

- `ai` (Vercel AI SDK) **v7** — le provider officiel OpenRouter cible `^7.0.0` en peer dependency, pas v5/v6
- `@ai-sdk/react`
- `@openrouter/ai-sdk-provider` (dernière version majeure, actuellement `3.0.0`)
- AI Elements via `npx ai-elements@latest` (ou `npx shadcn@latest add <registry-url>`) — met en place `components.json`/shadcn automatiquement si absent. Cible documentée : React 19 + Tailwind v4, correspond exactement à la stack actuelle (React 19.2.4, Tailwind v4) — pas d'incompatibilité signalée dans la doc.

---

## 9. Tests

- **Non-régression clé API à chaud** (§6.4) — changer la clé en cours de session sans redémarrer.
- **Handshake human-in-the-loop réellement exercé** — avant de considérer le portage du pattern "terminé", déclencher réellement `request_user_image` (aujourd'hui jamais vérifié en usage réel selon l'audit — le Bug A suggère qu'il n'a peut-être jamais fonctionné depuis son introduction) et confirmer que la modale se résout et que l'agent reprend avec la donnée fournie.
- **Persistance d'images de tool results à travers un refetch/réouverture** — reproduire le scénario exact du Bug B (recherche YouTube, fermer/rouvrir la conversation) et vérifier que les miniatures sont toujours là.
- **Script de migration DB** — exécuter sur une copie de la base réelle, vérifier que les conversations historiques se rechargent sans erreur et affichent leur contenu (texte + images récupérées) correctement.
- **Cap `stopWhen: isStepCount(25)`** — scénario avec beaucoup d'itérations d'outils, vérifier que la boucle s'arrête proprement au lieu de tourner indéfiniment.
- **Table de libellés d'outils unifiée** — vérifier que les 14 tools réels ont tous une entrée, et qu'aucune entrée ne référence un tool inexistant.
- **Kill-switch** — vérifier que basculer le flag revient effectivement à un chemin fonctionnel (donc : ne pas supprimer l'ancien code avant que le nouveau soit validé en usage réel).

---

## 10. Risques ouverts (non bloquants, à trancher en implémentation)

1. Citations web (§3.3) : forme exacte de la part `UIMessage` que prend une citation OpenRouter via le nouveau tool `openrouter:web_search` — à vérifier à l'implémentation, dégrade proprement en texte simple si aucune part dédiée n'existe.
2. Concurrence des tool calls (§6.2) — comportement par défaut d'AI SDK à confirmer, throttle à ajouter si besoin.
3. Composant `persona` d'AI Elements — nom en collision avec notre fonctionnalité "Personnage", à vérifier s'il est réellement applicable ou juste une coïncidence de nommage (probablement un composant d'affichage d'identité d'agent IA, pas lié).
4. Table complète de mapping variables CSS shadcn → tokens ThumbGen (§5.4) — nécessite lecture du fichier de thème global, à faire en phase de plan.
5. Ré-hébergement de `startGcLoop()` (§3.1) — à câbler explicitement dans le nouveau point d'entrée, pas oublié en supprimant `loop.ts`.

## 11. Hors scope (explicitement reporté)

- Auto-recherche et téléchargement de logos depuis le web (nécessite une nouvelle API/dépendance externe — demandé par l'utilisateur mais explicitement mis de côté de la priorité crash/redesign).
- `request_user_sketch` : reste désactivé tant que `SketchEditor` n'a pas de callback de sauvegarde — pré-existant, non lié à cette migration.
- Entrée/sortie vocale (`MicButton.tsx`, composants AI Elements `audio-player`/`mic-selector`/`speech-input`/`voice-selector`/`transcription`) — existe déjà côté input, pas dans le périmètre de ce redesign.
