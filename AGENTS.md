# ThumbGen — notes for coding agents (Cursor, Codex)

This file is for **people and coding agents that edit this repository**. It is **not** injected into ThumbGen Brainstorm (the in-app chat agent). Brainstorm skills live in `src/lib/agent/skills/*/SKILL.md` and load at runtime via `read_skill`.

## Stack

- Next.js app, SQLite (`data/thumbgen.db` on the machine that runs Docker / the host app).
- Node: `/opt/homebrew/bin/node` when the worktree’s `node` is missing.
- Tests: `./node_modules/.bin/vitest` (no `npx`).

## Do not

- Call paid APIs (OpenRouter, Perplexity, YouTube, image models) unless the human explicitly said yes in **this** chat.
- Rebuild Docker from a git worktree.
- Touch `data/thumbgen.db` or other live user data.
- Push, merge, or open a PR unless asked.
- Merge F3c (`feat/f3c`) as a 7-step wizard. F3b research/logo/competitor **tools** may be used; their journey prompt wiring must not come back.

## Agent skills (Brainstorm)

- Catalog: `src/lib/agent/skills/catalog.ts` (`name` + `description` only in the system prompt).
- Body: `read_skill` (`src/lib/agent/tools/read-skill.ts`), chat-only, not MCP.
- One folder per tool plus `thumbnail-packaging` and `existing-workflow`.
- System prompt: `src/lib/agent/system-prompt.ts` — identity, cost, `finish_turn`, catalog. No `THUMBNAIL JOURNEY` / `STEPS` 1–7.
- In-app `/` picker: `src/lib/agent/skills/slash-catalog.ts` (user-facing aliases; `/croquis` → `generate_sketch`; `/create-prompt` / `/create-propt` → `create-prompt`). Not Cursor personal skills.

## Fake agent

`THUMBGEN_FAKE_AGENT=journey` (dev only) plays a short free conversation. It must never call `generate_sketch`.
