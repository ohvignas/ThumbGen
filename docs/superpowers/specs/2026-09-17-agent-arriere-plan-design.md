# Agent en arrière-plan (chantier F1) — design

Date : 2026-09-17. Statut : validé en brainstorming avec Antoine, corrigé après revue du code. F2 (interview guidée, nœuds posés par le serveur) s'appuie sur ce chantier.

## Problème

Le tour de l'agent ne tourne que tant que la page de la miniature est ouverte :
- `ChatPanel` n'est monté que sur `/m/[id]` ;
- le transport `DefaultChatTransport` lie le flux à la requête HTTP ;
- `route-handler.ts` passe `abortSignal: req.signal` à `streamText`.

Quitter la page (Mes miniatures, Bibliothèque, Réglages) ferme la requête. Next annule alors `req.signal` et le corps de la réponse. L'IA est coupée et le tour est enregistré `interrupted: 1`.

## Objectif

1. Un tour lancé continue jusqu'au bout sur le serveur, quelle que soit la page ouverte, même si l'onglet est fermé.
2. En revenant sur la miniature, le chat se reconnecte au tour en cours et affiche la ligne d'étape en direct, puis la réponse.
3. Ailleurs dans l'app : un indicateur sur les miniatures où l'agent travaille ou attend, et un toast quand un tour se termine, échoue ou pose une question.
4. Plusieurs tours en parallèle, **un par conversation**.

## Hors périmètre

- Chat utilisable depuis les autres pages (le panneau reste sur la page miniature).
- Survie d'un tour à un redémarrage du serveur ou du conteneur.
- Nœuds posés par le serveur et `ask_user` (chantier F2).

## Architecture

### Registre des tours (serveur)

Nouveau module `src/lib/agent/v2/run-registry.ts`, stocké sur `globalThis` comme `src/lib/youtube/runtime.ts` :

- `AgentRun` : `{ conversationId, projectId, startedAt, status: "running" | "done" | "error" | "stopped", abort: AbortController, chunks: UIMessageChunk[], subscribers, endedAt?, cleanupTimer? }`.
- `startRun(conversationId, projectId)` : vérification et enregistrement **synchrones**, sans `await` entre les deux. Renvoie `null` si un run `running` existe pour la conversation. Sinon remplace un éventuel run terminé (en annulant son timer) et renvoie le nouveau run.
- `discardRun(run)` : retire l'entrée tout de suite, sans « attention » ni toast. Sert aux sorties anticipées avant `streamText`.
- `appendChunk(run, chunk)` : ajoute le chunk au buffer et le diffuse aux abonnés.
- `subscribe(run)` : prend l'objet run, pas un `conversationId`. Renvoie un `ReadableStream<UIMessageChunk>` : tout le buffer depuis le début, puis la suite en direct, fermé à la fin du run. Son `cancel()` désabonne seulement et ne touche jamais le run.
- `stopRun(conversationId)` : `abort.abort()` si le run est `running`. Renvoie `true` dans ce cas.
- `finishRun(run, status)` :
  - passe le statut et `endedAt` ;
  - ferme les abonnés ;
  - programme le retrait **5 minutes** plus tard.

  Le timer ne retire l'entrée que si `runs.get(conversationId) === run`, pour ne jamais effacer un run plus récent.
- `listRuns()` : `{ conversationId, projectId, startedAt, status, endedAt, pendingClientRequest }[]`, sans les chunks.
  - `pendingClientRequest` est vrai si le dernier message du run contient un `tool-input-available` d'un outil client (`request_user_image`, `request_user_sketch`) sans `tool-output-available`.
- **Taille du buffer :** plafond souple de **2 000 chunks** par run.
  - Au-delà, les deltas consécutifs de même type et de même `id` sont fusionnés : `text-delta`, `reasoning-delta`, `tool-input-delta`.
  - Un chunk structurel (`start`, `start-step`, `tool-input-available`, `tool-output-available`, `finish`…) n'est jamais jeté.
  - Les sorties d'outils contiennent des images en base64. La mémoire correspondante est acceptée : un seul utilisateur, rétention de 5 minutes.

### Route de chat

`POST /api/agent/chat` (`postV2`) :

1. `rejectNonJsonRequest` (415 sans `Content-Type: application/json`), comme les routes de chaînes. Un site tiers ne peut donc pas lancer un tour payant.
2. Validation du corps et de la clé OpenRouter (400 existants).
3. `projectId` vient de `getConversation(conversationId)?.project_id`, pas du corps. **404** si la conversation n'existe pas ou est supprimée.
4. `startRun` **avant toute lecture ou écriture en base** :
   - lecture et écriture : `listMessages`, lignes « abandoned », ligne utilisateur ;
   - pas de titre auto non plus (`generateAndPersistTitle`).

   Si un run tourne déjà : **409** en texte brut `L'agent travaille déjà ici`, sans écriture ni appel de modèle.
5. Toute sortie anticipée entre `startRun` et `streamText` (400 de préparation, de continuation vide ou d'ancien format) appelle `discardRun(run)`.
6. `streamText` reçoit `abortSignal: run.abort.signal` **uniquement**. `req.signal` n'est plus passé : une déconnexion du navigateur n'arrête plus le tour.
7. `onEnd` et `onAbort` de `streamText` sauvegardent le tour comme aujourd'hui. `streamText` attend `onAbort` avant d'émettre le chunk `abort`.
8. Le serveur lit lui-même `result.toUIMessageStream({ onError, onEnd })` jusqu'au bout, dans une boucle non attendue par la réponse :
   - chaque chunk passe par `appendChunk` ;
   - `onError` reste un simple log qui renvoie « An error occurred. » : il est appelé pour chaque chunk d'erreur, y compris un `tool-error` après lequel le tour continue ;
   - la sauvegarde de secours `interrupted: 1` (échec sans ligne déjà écrite, garde `turnPersisted`) passe de `toUIMessageStreamResponse` à cet `onEnd` ;
   - `onEnd` retient `outcome` : `completed` → `done`, `aborted` → `stopped`, `failed` → `error` ;
   - dans le `finally` de la boucle, `finishRun(run, statut)` est appelé **une seule fois**, après la sauvegarde. Une exception de lecture donne `error`.
9. La réponse HTTP est `createUIMessageStreamResponse({ stream: subscribe(run) })`. L'émetteur voit le même flux que les reconnexions. Si Next annule la réponse, seul cet abonné disparaît.

L'appel `void result.consumeStream()` devient inutile : la boucle du point 8 lit déjà tout le flux.

### Nouvelles routes

- `GET /api/agent/chat/[conversationId]/stream` : **204** si aucun run `running` pour cet id, id inconnu compris. Sinon `createUIMessageStreamResponse({ stream: subscribe(run) })`. C'est l'URL par défaut de `reconnectToStream` d'AI SDK v7 (`${api}/${id}/stream`, en GET, 204 → pas de reprise).
- `POST /api/agent/chat/[conversationId]/stop` : `rejectNonJsonRequest` (415), puis `stopRun`. Réponse **200** `{ stopped: boolean }`.
- `GET /api/agent/runs` renvoie :
  - `running: [{ conversationId, projectId, projectName, startedAt }]` ;
  - `attention: [{ conversationId, projectId, projectName, kind: "finished" | "error" | "question", endedAt }]`.

  Pour chaque run terminé encore dans le registre :
  - `kind` vaut `question` si `pendingClientRequest`, `error` si `status === "error"`, `finished` sinon (`done` ou `stopped`) ;
  - une question reste listée jusqu'à la réponse de l'utilisateur, qui lance un nouveau run et remplace l'ancien, ou jusqu'au retrait par le timer.

  La route renvoie tout. Le client filtre ce qu'il a déjà vu.
- `DELETE /api/agent/conversations/[id]` appelle en plus `stopRun(id)`.

### Redémarrage

Après un redémarrage, le registre est vide et `GET stream` répond 204. Un tour coupé laisse une ligne utilisateur sans réponse. Rien n'est réécrit en base. Le client l'affiche comme interrompu, avec « Réessayer » (voir Chat). `findRetriedUserRowIndex` réutilise alors la ligne existante.

### Chat (client)

`ChatPanel.tsx` :
- **Transport.**
  - Pas de `resume: true`, qui lancerait une reprise au montage, avant que la conversation active soit connue.
  - `prepareReconnectToStreamRequest` construit l'URL `/api/agent/chat/${useChatStore.getState().activeConversationId}/stream`.
- **Ouverture d'une conversation.**
  1. L'effet d'historique fait son `setMessages(rowsToUIMessages(rows))`.
  2. Si la conversation active n'a pas changé entre-temps, il appelle `resumeStream()`. Un 204 coûte peu, pas besoin de consulter `/api/agent/runs` avant.
  3. Juste avant `resumeStream()` :
     - `setLiveTurn(liveTurnStart(messages))` ;
     - `setTurnStartedAt(startedAt du run)`, lu dans le fournisseur des runs, `Date.now()` à défaut ;
     - `turnFailedRef.current = false` ;
     - `resumedConversationIdRef.current = conversationId` ;
     - `setStoppedConversationId(null)`.

  La relecture canonique existante (effet de statut) s'applique à la fin de la reprise.
- **Reprise sans flux (204).**
  - Si la conversation était listée `running`, le tour vient de finir : on relit l'historique.
  - Si le dernier message est un message utilisateur, la ligne de fin affiche « Tour interrompu » avec « Réessayer ». C'est le cas après un redémarrage. `trailingAssistantRow` reçoit pour cela un indicateur `orphanUserTurn`.
- **Message de reprise.** Une reprise crée un nouveau message assistant : `lastMessage` n'est pas repris pour `resume-stream`, et le chunk `start` n'a pas de `messageId`. Pour un tour de continuation, deux messages assistant se suivent jusqu'à la relecture canonique. Ils sont regroupés à l'affichage.
- **« Arrêter ».**
  1. `setStoppedConversationId(activeConversationId)`, puis `POST .../stop`.
  2. Pas de `stop()` local : le flux se termine de lui-même (chunk `abort`) après la sauvegarde de la ligne interrompue, puis la relecture la montre.
  3. `stop()` local seulement si la route échoue, ou après 10 s sans fin de flux.
- **409 à l'envoi.**
  1. Le message optimiste est retiré.
  2. Le texte revient dans le brouillon.
  3. `resumeStream()` est relancé.
  4. Un toast « L'agent travaille déjà ici » s'affiche. Pas d'Alert : `resumeStream()` efface l'erreur du tour.
- **Changement de conversation et démontage.** Le flux local est abandonné (`stop()` existant) sans appeler la route stop. Le tour continue sur le serveur.
- **Rafraîchissement des runs.** Après un envoi, une réponse à une requête client ou une reprise, ChatPanel appelle `refreshRuns()` du fournisseur des runs.
- **Continuation après une reprise.** Une reprise ne peut pas produire de requête client résolue. `sendAutomaticallyWhen`, appelé aussi après une reprise, ne relance donc aucun appel de modèle. Un test le vérifie.

`useConversations` : en ouvrant une miniature, la conversation active est d'abord celle qui a un run `running`, puis celle qui a une attention non vue, sinon la plus récente.

### Indicateur et toasts (hors page miniature)

- **`AgentRunsProvider`** (composant client, contexte) enveloppe `children` dans `layout.tsx`, dans `SidebarProvider`, à côté de `<Toaster />` :
  - il interroge `GET /api/agent/runs` toutes les **3 s** tant que `running` n'est pas vide, sinon toutes les **30 s** ;
  - `refreshRuns()` force un appel immédiat ;
  - il expose les runs, les attentions non vues et `markSeen(conversationIds)`.
  - « Vu » : en localStorage, le dernier `endedAt` vu par conversation (lecture et écriture dans try/catch).
- **Barre latérale et « Mes miniatures »** lisent ce contexte. `AppSidebar` est rendu par chaque page.
  - Point animé (`animate-pulse motion-reduce:animate-none`) sur un projet avec un run `running`.
  - Point fixe sur un projet avec une attention non vue.
  - Tant que `/m/<projectId>` est ouverte, les attentions de ce projet sont marquées vues en continu.
- **Toast** : Base UI Toast via `./node_modules/.bin/shadcn add toast`. Le style `base-nova` masque `sonner` et propose `toast`. À vérifier au début du plan ; à défaut, `sonner` avec le thème lu depuis `data-theme`, sans `next-themes`.
  - Un toast part pour chaque attention non vue et pas encore toastée (clé `conversationId + endedAt`), dont le projet **n'est pas** la page ouverte. Il ne dépend pas d'un passage `running` → fini observé par le polling, qui raterait les tours courts.
  - Textes, avec un bouton « Ouvrir » vers `/m/<projectId>` :
    - « L'agent a fini — <nom> » ;
    - « L'agent s'est arrêté sur une erreur — <nom> » ;
    - « L'agent te pose une question — <nom> ».

## Coût et sécurité

- Aucune reprise automatique n'est ajoutée. Une pause sur requête client attend toujours la réponse de l'utilisateur.
- La limite d'étapes (`agentMaxSteps`) et `hasToolCall("finish_turn")` restent les conditions d'arrêt.
- La 409 est décidée avant toute écriture et tout appel de modèle, titre auto compris. La vérification et l'enregistrement sont synchrones dans un seul processus Node. Deux tours payants ne peuvent donc pas tourner en même temps sur une conversation, même avec deux onglets.
- Le verrou n'est libéré que par `finishRun`, à la fin réelle du flux, ou par `discardRun` avant `streamText`. Jamais par un chunk d'erreur, jamais par le timer d'un run plus ancien.
- `POST /api/agent/chat` et `POST .../stop` exigent du JSON (415 sinon).
- Le buffer ne contient pas de clés. Les routes de lecture renvoient les mêmes données que l'historique existant.

## Tests

- **run-registry :**
  - un seul run `running` par conversation ;
  - remplacement d'un run terminé ;
  - le timer d'un ancien run ne retire pas le nouveau ;
  - rediffusion complète pour un abonné tardif ;
  - l'annulation d'un abonné n'arrête pas le run ;
  - fermeture des abonnés à la fin ;
  - `stopRun` déclenche l'abort ;
  - `discardRun` ;
  - retrait après 5 min (fake timers) ;
  - fusion des deltas au-delà du plafond, sans perte de chunk structurel ;
  - `pendingClientRequest`.
- **Route POST** (`streamText` mocké) :
  - la déconnexion de la requête n'annule pas le run ;
  - 409 pendant un run, sans ligne écrite ni titre auto ;
  - 415 sans JSON ;
  - 404 conversation inconnue ;
  - `discardRun` sur chaque 400 ;
  - un `tool-error` suivi d'une réponse ne termine pas le run ;
  - persistance inchangée en fin de tour, en arrêt et en échec ;
  - `finishRun` après la sauvegarde.
- **Route GET stream :** 204 sans run ou pour un id inconnu, rediffusion avec run.
- **Route stop :** arrêt, et 415 sans JSON.
- **Route runs :** `running`, `attention` de chaque kind (`finished`, `error`, `question`).
- **Client :**
  - reprise après chargement de l'historique (état du tour, relecture canonique) ;
  - 204 après `running` → relecture ;
  - tour orphelin → « Tour interrompu » + « Réessayer » ;
  - 409 → brouillon restauré ;
  - aucun envoi automatique après une reprise ;
  - choix de la conversation `running` en ouvrant une miniature.
- **Rendu :** point d'activité dans la barre latérale, toast sur attention non vue.
- **Navigateur**, avec un modèle simulé côté serveur :
  - Le modèle simulé (`MockLanguageModelV3` / `simulateReadableStream` de `ai/test`) produit un « tour lent » sans appel réseau.
  - Il n'est actif que si `NODE_ENV !== "production"` **et** `THUMBGEN_FAKE_AGENT` est défini. Il doit être impossible dans l'image Docker : build de production, et variable absente du Dockerfile et de `docker-compose.yml`.
  - Parcours :
    - lancer un tour ;
    - aller dans la Bibliothèque : point animé, puis toast à la fin ;
    - revenir : réponse affichée ;
    - relancer, revenir pendant le tour : ligne d'étape reconnectée ;
    - « Arrêter » : ligne interrompue affichée ;
    - aucun appel réel à un modèle.

## Vérification live

Après la reconstruction Docker, un vrai message court est payant et demande l'accord explicite d'Antoine dans la session : envoi, navigation vers la Bibliothèque, retour.

## Historique

- 2026-09-17 : spec corrigée après revue du code et de la bibliothèque AI SDK v7.
