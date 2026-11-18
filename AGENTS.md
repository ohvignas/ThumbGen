# ThumbGen — notes for coding agents (Cursor, Codex)

This file is for **people and coding agents that edit this repository**. It is **not** injected into ThumbGen Brainstorm (the in-app chat agent). Brainstorm skills live in `src/lib/agent/skills/*/SKILL.md` and load at runtime via `read_skill`.

## Stack

- Next.js app, SQLite (`data/thumbgen.db` on the machine that runs Docker / the host app).
- Node: `/opt/homebrew/bin/node` when the worktree’s `node` is missing.
- Tests: `./node_modules/.bin/vitest` (no `npx`).
- Compose bind-mounts `./data` only. A container restart **without** `--build` does **not** pick up JS/TS source changes. This holds on the production server too.
- Followed-channel RSS + young-video snapshots: in-process timer every **15 min** (`startRssPollTimer` from `src/instrumentation.ts` on `node server.js` boot, also from `POST /api/channels/sync-stale`). **The container must stay up** (`restart: unless-stopped`). No cron. Page load still POSTs `sync-stale` for the 12 h full playlist backfill. Young `videos.list` stays ≤7 d / last snapshot >4 h. Do not add a second scraper.

## Deploy (production)

The human works on **https://miniature.illith.com**, not on `localhost:3000`. "Mets en prod", "ship it", "I want to see it" all mean this site.

1. Tests green (`./node_modules/.bin/vitest run`), change committed on a branch, PR merged into `main`. Merging and deploying still need the human's go-ahead in **this** chat (see **Do not**).
2. On the server (SSH alias `hostinger-illith`, checkout in `/opt/thumbgen`):
   ```bash
   cd /opt/thumbgen && git pull --ff-only && docker compose up -d --build
   ```
   The build takes more than 10 minutes: run it in the background and wait for it, do not start a second one. The site is down for a few seconds while the container is recreated; `./data` is bind-mounted and survives.
3. Check before saying it is live: `git log --oneline -1` on the server matches `origin/main`, `docker inspect thumbgen` shows `running` with `RestartCount` 0, and the site answers. **HTTP 401 is the normal answer** without the site password (`SITE_PASSWORD` gate), not a failure.

Server-local, leave them alone: `/opt/thumbgen/docker-compose.override.yml` (untracked; Traefik labels for the domain, `mem_limit`), `/opt/thumbgen/.env`, and `/opt/thumbgen/data` (live user data). The same host runs other, unrelated stacks — touch only the `thumbgen` container, and never run a blanket `docker system prune` there.

## Do not

- Call paid APIs (OpenRouter, Perplexity, YouTube, image models) unless the human explicitly said yes in **this** chat.
- Start Docker Desktop or rebuild Docker locally to "show" a change. The human does not run ThumbGen on this machine; they use the production site. A change is visible once it is deployed (see **Deploy (production)**). Rebuild locally only if the human asks for a local instance in this chat.
- Deploy anything that is not on `origin/main`. The server builds from a clean `main` checkout — never copy files to it, never build there from a branch or a worktree.
- Touch `data/thumbgen.db` or other live user data.
- Push, merge, or open a PR unless asked.
- Merge F3c (`feat/f3c`) as a 7-step wizard. F3b research/logo/competitor **tools** may be used; their journey prompt wiring must not come back.

## Agent skills (Brainstorm)

- Catalog: `src/lib/agent/skills/catalog.ts` (`name` + `description` only in the system prompt).
- Body: `read_skill` (`src/lib/agent/tools/read-skill.ts`), chat-only. MCP clients have their own `list_skills` / `read_skill` in `src/lib/agent/mcp/workflow-tools.ts`, which add the `mcp-workflow` guide.
- MCP-only tools (`src/lib/agent/mcp/workflow-tools.ts`): `create_project`, `create_upload_link`, `run_generator` (paid, server-side twin of « Générer »), `export_image`. Not in the chat registry: in the app the user does those things. Upload and export go through signed links (`/api/mcp/upload`, `/api/mcp/export`, HMAC keyed by the MCP API key, 15 min).
- One folder per tool plus `thumbnail-packaging` and `existing-workflow`.
- System prompt: `src/lib/agent/system-prompt.ts` — identity, cost, `finish_turn`, catalog. No `THUMBNAIL JOURNEY` / `STEPS` 1–7.
- In-app `/` picker: `src/lib/agent/skills/slash-catalog.ts` (user-facing aliases; `/croquis` → `generate_sketch`; `/create-prompt` / `/create-propt` → `create-prompt`). Not Cursor personal skills.

## Fake agent

`THUMBGEN_FAKE_AGENT=journey` (dev only) plays a short free conversation. It must never call `generate_sketch`.
