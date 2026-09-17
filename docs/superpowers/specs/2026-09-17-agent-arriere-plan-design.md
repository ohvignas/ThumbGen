# Agent en arrière-plan (chantier F1) — design

Date : 2026-09-17. Statut : validé en brainstorming avec Antoine. F2 (interview guidée, nœuds posés par le serveur) s'appuie sur ce chantier.

## Problème

Le tour de l'agent ne tourne que tant que la page de la miniature est ouverte :
- `ChatPanel` n'est monté que sur `/m/[id]` ;
- le transport `DefaultChatTransport` lie le flux à la requête HTTP ;
- `route-handler.ts` passe `abortSignal: req.signal` à `streamText`.

Quitter la page (Mes miniatures, Bibliothèque, Réglages) ferme la requête. L'IA est coupée et le tour est enregistré `interrupted: 1`.

## Objectif

1. Un tour lancé continue jusqu'au bout sur le serveur, quelle que soit la page ouverte, même si l'onglet est fermé.
2. En revenant sur la miniature, le chat se reconnecte au tour en cours et affiche la ligne d'étape en direct, puis la réponse.
3. Ailleurs dans l'app : un indicateur sur les miniatures où l'agent travaille ou attend, et un toast quand un tour se termine ou pose une question.
4. Plusieurs tours en parallèle, **un par conversation**.

## Hors périmètre

- Chat utilisable depuis les autres pages (le panneau reste sur la page miniature).
- Survie à un redémarrage du serveur ou du conteneur.
- Nœuds posés par le serveur et `ask_user` (chantier F2).

## Architecture

### Registre des tours (serveur)

Nouveau module `src/lib/agent/v2/run-registry.ts`, stocké sur `globalThis` comme le runtime des chaînes suivies :

- `AgentRun` : `{ conversationId, projectId, startedAt, status: "running" | "done" | "error" | "stopped", abort: AbortController, chunks: UIMessageChunk[], subscribers, endedAt? }`.
- `startRun(conversationId, projectId)` échoue si un run `running` existe déjà pour cette conversation.
- `appendChunk(run, chunk)` pousse le chunk dans le buffer et le diffuse aux abonnés.
- `subscribe(conversationId)` renvoie un `ReadableStream<UIMessageChunk>` : tous les chunks du buffer depuis le début, puis la suite en direct, fermé à la fin du run.
- `stopRun(conversationId)` appelle `abort.abort()`.
- `finishRun(run, status)` passe le statut, ferme les abonnés et programme la suppression du run **5 minutes** après sa fin.
- `listActiveRuns()` renvoie `{ conversationId, projectId, startedAt, status }[]`, sans les chunks.
- **Taille du buffer :** plafond de **2 000 chunks** par run. Au-delà, les deltas de texte et de raisonnement consécutifs sont fusionnés pour rester sous le plafond.

### Route de chat

`POST /api/agent/chat` (route-handler v2) :
- `startRun` avant `streamText`. Si un run tourne déjà sur la conversation, réponse **409** `{ error: "L'agent travaille déjà ici" }`, sans appel au modèle.
- `abortSignal` = le signal du run, **plus `req.signal`**. Une déconnexion du navigateur n'arrête plus le tour.
- Le flux UI-message du résultat est lu côté serveur (`consumeStream` existe déjà) et chaque chunk passe par `appendChunk`. La réponse HTTP renvoie `subscribe(conversationId)`, pour que l'émetteur voie le même flux que les reconnexions.
- `onEnd` / `onAbort` / `onError` et la persistance existante restent inchangés, et appellent en plus `finishRun`.

### Nouvelles routes

- `GET /api/agent/chat/[conversationId]/stream` : **204** si aucun run `running`, sinon le flux `subscribe(...)` au format UI-message SSE, identique à la réponse du POST. C'est la route attendue par `prepareReconnectToStreamRequest` / `resumeStream` d'AI SDK v7.
- `POST /api/agent/chat/[conversationId]/stop` : `stopRun`. Réponse **200** `{ stopped: boolean }`. Protection cross-site : `Content-Type: application/json` exigé, comme les routes de chaînes.
- `GET /api/agent/runs` : `{ running: [{ conversationId, projectId, startedAt }], attention: [{ conversationId, projectId, kind: "finished" | "question", endedAt }] }`.
  - `attention` liste les tours terminés depuis moins de 5 minutes, ou en pause sur une requête client (`request_user_image` aujourd'hui, `ask_user` en F2), que le client n'a pas encore vus.
  - « Vu » est géré côté client : en localStorage, le dernier `endedAt` vu par conversation. Pas de persistance serveur.

### Redémarrage

Au premier accès à la base après un démarrage, un tour qui avait commencé (ligne utilisateur sans ligne assistant après) n'est **pas** réécrit : le comportement existant (message utilisateur sans réponse, « Réessayer ») suffit. Le registre est vide après un redémarrage, donc `GET stream` répond 204.

### Chat (client)

`ChatPanel.tsx` :
- `useChat` avec `resume: true`. Le transport reçoit `prepareReconnectToStreamRequest` vers `GET /api/agent/chat/[activeConversationId]/stream`.
- À l'ouverture d'une conversation, ou au retour sur la page, `resumeStream()` est appelé si `GET /api/agent/runs` liste cette conversation en `running`. La ligne d'étape reprend, avec un chronomètre calé sur `startedAt` du run.
- « Arrêter » appelle `POST .../stop`, puis `stop()` local.
- Un envoi qui reçoit **409** affiche l'erreur du tour (Alert existante) et relance `resumeStream()`.
- Démontage (navigation) : le flux local est abandonné sans appeler la route stop.

### Indicateur et toasts (hors page miniature)

- **Hook `useAgentRuns()`** monté une fois dans le layout (comme `ChannelSyncTrigger`) :
  - interroge `GET /api/agent/runs` toutes les **3 s** tant que `running` n'est pas vide, sinon toutes les **30 s** ;
  - expose les runs et les « attentions » non vues.
- **Barre latérale et « Mes miniatures » :**
  - point animé (`animate-pulse motion-reduce:animate-none`) sur un projet avec un run `running` ;
  - point fixe sur un projet avec une attention non vue ;
  - en ouvrant la miniature, les attentions de ses conversations sont marquées vues.
- **Toast** : aucun composant toast n'existe encore dans le repo. On ajoute le composant shadcn `sonner` (`./node_modules/.bin/shadcn add sonner`, nouvelle dépendance `sonner`) et `<Toaster />` dans le layout :
  - quand un run passe de `running` à terminé, ou à une pause sur requête client, pour une conversation dont la miniature **n'est pas** la page ouverte ;
  - textes « L'agent a fini — <nom de la miniature> » / « L'agent te pose une question — <nom> », bouton « Ouvrir » vers `/m/<projectId>`.

## Coût et sécurité

- Aucune reprise automatique n'est ajoutée. Une pause sur requête client attend toujours la réponse de l'utilisateur.
- La limite d'étapes (`agentMaxSteps`) et `hasToolCall("finish_turn")` restent les conditions d'arrêt.
- Le 409 empêche deux tours payants simultanés sur une même conversation, par exemple via deux onglets.
- Le buffer ne contient pas de clés. Les routes de lecture renvoient les mêmes données que l'historique existant.

## Tests

- **run-registry :**
  - un seul run par conversation ;
  - rediffusion complète pour un abonné tardif ;
  - fermeture des abonnés à la fin ;
  - `stopRun` déclenche l'abort ;
  - suppression après 5 min (fake timers) ;
  - plafond de chunks.
- **Route POST** (streamText mocké) :
  - la déconnexion de la requête n'annule pas le run ;
  - 409 pendant un run ;
  - persistance inchangée en fin de tour.
- **Route GET stream :** 204 sans run, rediffusion avec run.
- **Route stop :** arrêt, et 415 sans JSON.
- **Route runs :** `running` et `attention`, question en pause.
- **Rendu :** point d'activité dans la barre latérale.
- **Navigateur**, avec `scripts/chat-fixtures` étendu d'un mode « tour lent » simulé côté serveur de dev, sans modèle :
  - lancer un tour ;
  - aller dans la Bibliothèque : point animé, puis toast à la fin ;
  - revenir : réponse affichée ;
  - relancer, revenir pendant le tour : ligne d'étape reconnectée ;
  - « Arrêter » ;
  - aucun `POST /api/agent/chat` réel vers un modèle.

## Vérification live

Après la reconstruction Docker, un vrai message court est payant et demande l'accord explicite d'Antoine dans la session : envoi, navigation vers la Bibliothèque, retour.
