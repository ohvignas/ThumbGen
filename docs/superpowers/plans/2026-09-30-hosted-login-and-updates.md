# Hosted login, updates, and where to run ThumbGen

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Do not execute this plan in the same PR that only shipped canvas/persona/search-arg fixes.** Auth, VPS, Tailscale, and any Vercel rewrite are later work. This document is the complete plan.

**Goal:** Share one running ThumbGen with other people (URL + real login), keep updates as a host command (optional read-only “nouvelle version” notice), and choose a host that matches the current architecture.

**Architecture:** ThumbGen is a **single long-lived Node process** (`node server.js`) with **one SQLite writer** and **photos/thumbnails as BLOBs inside `data/thumbgen.db`**. Followed-channel RSS + young-video snapshots run on an **in-process 15 min timer**. The supported runtime is **Docker Compose on one machine** (Mini or a small VPS), bind-mount `./data`, optional `SITE_PASSWORD`. **Vercel tel quel = non.**

**Tech Stack:** Next.js 16 standalone, better-sqlite3 (WAL), Docker Compose (`restart: unless-stopped`), middleware password gate, no Vercel adapter, no Turso/Neon, no Blob store, no Vercel Cron.

---

## Verdicts (read this first)

### Vercel tel quel = non

Do **not** lift-and-shift the current app to Vercel serverless / Fluid compute as-is. It would break persistence, the RSS timer, and the 1.7 GB blob database.

Three blockers (file:line evidence):

1. **SQLite file + BLOBs on a bind-mounted disk** — `src/lib/db.ts:8` defaults to `data/thumbgen.db`; `src/lib/db.ts:19` sets WAL; `src/lib/db.ts:41-91` stores generated images, swipe files, logos, faces, persona photos as `BLOB NOT NULL`. Same pattern in `src/lib/agent/migrations.ts` (`chat_uploads`, `generated_sketches`). Compose only mounts that folder: `docker-compose.yml:19-20` (`./data:/app/data`). Vercel’s filesystem is ephemeral; there is no durable local SQLite.
2. **Long-lived process + 15 min timer** — `src/instrumentation.ts:6-11` calls `startRssPollTimer()` on `node server.js` boot. `src/lib/youtube/rss-poll-timer.ts` holds a `setInterval`. Interval is `RSS_POLL_THROTTLE_MS` = 15 min (`src/lib/youtube/jobs.ts:18`). `docker-compose.yml:14-16` and `AGENTS.md` require the container to **stay up**; there is no cron and **no second scraper**. Serverless invocations do not keep that timer.
3. **Native module + standalone Docker image, not a Vercel target** — `next.config.ts:5` is `output: "standalone"`. `Dockerfile:66` is `CMD ["node", "server.js"]`. `Dockerfile:49-55` copies `better-sqlite3` and `@resvg` `.node` binaries. There is **no** `vercel.json`. Git ignores `.vercel` (`.gitignore`). A 1.7 GB DB cannot live in a serverless payload or a 50 MB Hostinger Node archive either.

A later Vercel-shaped rewrite would need **all** of: hosted SQLite or Postgres (Turso/Neon/Postgres), object storage for images (Vercel Blob / S3), Cron or a worker for the 15 min poll, and real auth (not `SITE_PASSWORD` in a build ARG). Honest cost: weeks of migration + monthly DB/blob/cron bills + risk to the live library. **Not this week.**

### Vercel Agent ≠ deploy

[Vercel Agent](https://vercel.com/docs/agent) is **PR code review**, **incident investigation** (Observability Plus), and **free SDK install** (Web Analytics / Speed Insights). It is configured under the Vercel project **AI** settings. It does **not** host ThumbGen and does **not** replace Docker. Optional later: enable Agent on GitHub PRs (~$0.30/review + tokens) if the repo is connected to Vercel for that feature only. Do not treat “Vercel Agent skill” as permission to deploy.

### Vercel Connect ≠ hosting

[Vercel Connect](https://vercel.com/docs/connect) is **scoped OAuth tokens** (Slack, GitHub, MCP, Snowflake, generic OAuth) via Vercel OIDC. It does **not** deploy ThumbGen and does **not** give teammates a URL to the SQLite app. Friends still need the Mini/VPS Docker instance (or their own clone + empty `data/`). Serverless Vercel stays blocked by local BLOBs (`src/lib/db.ts`) and the 15 min in-process RSS timer (`src/instrumentation.ts`). Do **not** add `@vercel/connect` to ThumbGen unless someone names Slack, GitHub, or an MCP server to wire. This machine has no Vercel CLI and no `.vercel` link, so `vercel connect list` cannot run here; do not run `vercel connect create` without explicit approval (it opens a browser).

### Recommended host this week

**Keep Docker on the existing Mac Mini (or one small always-on machine).** Share a URL with Tailscale (Serve/Funnel) or, if the LAN is trusted, bind `0.0.0.0:3000` instead of `127.0.0.1:3000`. Harden later with real login + HTTPS. Lowest friction, lowest energy, data stays on the disk you already have.

### Update path today (already shipped in docs + Réglages)

There is **no** version-check popup and **no** safe in-app “update” button (the container has no `.git`, and the Next process must not run Docker on the host).

Exact command on a machine that already cloned the repo, from the folder that contains `docker-compose.yml`:

```bash
git pull
docker compose up -d --build
```

Same string: `src/lib/update-command.ts`, README « Updating on a machine that already has ThumbGen », INSTALL « Mettre à jour », Réglages → Données & sauvegardes (copy only).

---

## Share model (one Docker vs empty clones)

| Model | What others get | When to use |
|---|---|---|
| **A. One running instance** | Same library, same keys in Réglages, same followed channels | Default. PR/merge ships **code**. The 1.7 GB DB is **not** in git (`.gitignore` `/data/`). |
| **B. Empty clone on another Mac** | App boots with an **empty** `data/thumbgen.db` | Only if they want a **separate** studio. They paste their own API keys. |
| **C. Copy `data/` by hand** | Full library clone | USB / `scp` of `data/` (and `-wal`/`-shm` if you stop the writer). Never commit the DB. Two writers on one file = corruption. |

Do not `git add data/`. Do not run a second `npm run dev` or second Compose stack against the live `thumbgen.db` (`README.md`, `AGENTS.md`).

---

## File structure (future work only)

**Do not create these in the docs-only / canvas PR.**

| Later file | Role |
|---|---|
| `src/lib/auth/users.ts` | Invite list + password hashes (server-only) |
| `src/app/api/auth/login/route.ts` | POST login, set **session** cookie (not the raw password) |
| `src/app/api/auth/logout/route.ts` | Clear session |
| `src/middleware.ts` | Replace query-param password with session verification |
| `src/lib/auth/rate-limit.ts` | In-memory or SQLite login throttle |
| `src/app/api/version/route.ts` | Optional: baked `GIT_SHA` vs GitHub `origin/main` (read-only) |
| `src/components/settings/UpdateAvailableBanner.tsx` | Optional popup: “une mise à jour est disponible” + copy command |
| `docker-compose.yml` | Optional `mem_limit` / `cpus` after measuring; HTTPS via Caddy/Tailscale in front, not a second scraper |

---

## Code reality vs wishful hosting

1. **`SITE_PASSWORD` is a single shared secret.** `src/middleware.ts:3-42` compares the cookie (and `?password=`) to `process.env.SITE_PASSWORD`. The cookie **value is the password**. Login is a GET redirect with the password in the query string (leaks in history, logs, Referer). There is **no** `/login` route; the HTML form is inlined in middleware. `secure: true` is correct for HTTPS; localhost still works. **No rate limit.**
2. **Password is also a Docker build ARG** (`Dockerfile:21-27`, `docker-compose.yml:12`). Changing it needs `docker compose up -d --build`, not `restart` (README). Keys in Réglages live in the `settings` table and win over env (`src/lib/settings.ts`).
3. **Port is loopback.** `docker-compose.yml:17-18` → `127.0.0.1:3000:3000`. Other machines cannot connect until you change the host bind or put Tailscale/Caddy in front.
4. **One timer.** `startRssPollTimer` no-ops if `globalThis.__thumbgen_rss_poll_timer` already exists (`rss-poll-timer.ts:18`). `POST /api/channels/sync-stale` may call it again; it does not start a second interval. Do **not** add cron-in-container loops.
5. **SQLite one writer.** `getDb()` is a process singleton (`src/lib/db.ts:206-210`). Compose runs one `thumbgen` service. Do not add replicas.
6. **No Compose resource limits today.** Idle cost is one Node 20 process + 15 min RSS wakeups. Image generation and agent turns spike CPU/RAM only when someone clicks. `next build` wants ≥4 GB Docker RAM (README troubleshooting).
7. **Hostinger shared Node** (`hosting_deployJsApplication` / 50 MB archive) is the same class of mistake as Vercel: no bind-mounted 1.7 GB SQLite, no guaranteed 15 min process. **Hostinger VPS + Docker** is option B, not hPanel Node.

---

## Hosting options (ranked)

### A) Same Mini, LAN or Tailscale URL — **default this week**

- Keep `restart: unless-stopped` and `./data:/app/data`.
- **Tailscale Serve** (HTTPS on the tailnet) or **Funnel** (public HTTPS) in front of `127.0.0.1:3000`. No need to open the home router.
- Or, trusted LAN only: change ports to `"3000:3000"` or `"0.0.0.0:3000:3000"`.
- Energy: one Mini already on; no extra VM; RSS every 15 min is cheap versus image gen.
- Auth: keep `SITE_PASSWORD` until Chunk 2 (real login). Never expose `/api/mcp` on plain HTTP (`THUMBGEN_PUBLIC_HOST` + bearer).

### B) Small VPS (Hostinger or other) + Docker + volume + HTTPS

- Same Compose file. Copy the repo, `cp .env.example .env`, **rsync `data/`** (stop writer or use in-app backup).
- Volume: bind `./data` or a Docker named volume on a large disk (the DB grows with BLOBs).
- HTTPS: Caddy or Traefik as a **second Compose service** that only proxies; do not add scrapers.
- Cost: ~5–10 €/mo VPS vs Mini electricity you already pay. Use if the Mini must sleep or others need a public URL without Tailscale.
- Do not use Hostinger **shared Node** archive deploy for this app.

### C) Vercel — **only after a rewrite**

Required before any `vercel` production:

- Replace `better-sqlite3` + BLOBs with hosted SQL + object storage.
- Replace `startRssPollTimer` with Vercel Cron hitting a route, or an external worker. Keep **one** poller (AGENTS.md: no second scraper).
- Drop `output: "standalone"` Docker-only assumptions or keep Docker as the real prod and use Vercel only for a future slim UI (not the current monolith).
- Real auth (Chunk 2), not `SITE_PASSWORD` as build ARG.
- Budget: DB + Blob + Cron + egress for thumbnail bytes. Do not start this chunk unless the human says yes to paid hosting APIs **and** the rewrite.

---

## Docker stability / energy (what to add later, not now)

Current tree (verify with `docker compose config` from the **main** repo, never a worktree):

- `restart: unless-stopped` — good.
- One service, one bind mount, no extra scrapers — good.
- No `mem_limit` / `cpus` — optional after `docker stats`.

Suggested Compose limits **only after measuring** on the Mini (do not guess a limit that OOMs `next build`):

```yaml
# Proposal only — measure first. next build needs headroom.
mem_limit: 2g
cpus: 2.0
```

Build stays heavy; runtime idle should stay well below 2 GB if nobody is generating. Prefer limiting **runtime** (deploy `mem_limit` on the running service) and giving Docker Desktop ≥4 GB for **builds**.

Healthcheck (later, optional):

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  interval: 60s
  timeout: 5s
  retries: 3
```

Do not add a sidecar cron. Do not `sqlite3` the live `data/thumbgen.db` from the host while the container writes.

---

## Chunk 1: Optional read-only “une mise à jour est disponible”

Only if someone wants a popup. **Not required** — the command is already documented.

**Why it is not cheap:** the production container is a standalone image. It has **no `.git`**. Comparing `HEAD` to `origin/main` inside the app requires either mounting `.git` (bad) or baking `GIT_SHA` at **build** time and calling GitHub’s API (read-only).

### Task 1: Bake the git SHA at image build

**Files:**
- Modify: `Dockerfile` (ARG `GIT_SHA`)
- Modify: `docker-compose.yml` (`args.GIT_SHA`)
- Create: `src/lib/version.ts` (`process.env.GIT_SHA ?? "unknown"`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/onboarding/version.test.ts
import { describe, expect, it } from "vitest";
import { getBuildSha } from "@/lib/version";

describe("getBuildSha", () => {
  it("returns the baked SHA or unknown", () => {
    const prev = process.env.GIT_SHA;
    delete process.env.GIT_SHA;
    expect(getBuildSha()).toBe("unknown");
    process.env.GIT_SHA = "abc1234";
    expect(getBuildSha()).toBe("abc1234");
    if (prev === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = prev;
  });
});
```

- [ ] **Step 2: Run** `./node_modules/.bin/vitest run tests/onboarding/version.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement `getBuildSha`** and pass `GIT_SHA: ${GIT_SHA:-}` from Compose. Document that `docker compose` users set `GIT_SHA=$(git rev-parse --short HEAD)` in `.env` or a wrapper script. **Do not** run `git` from Next.js.
- [ ] **Step 4: Re-run the test** — expect PASS.
- [ ] **Step 5: Commit** `test + version helper + Dockerfile/compose args only`.

### Task 2: Read-only compare + banner (no shell-out)

**Files:**
- Create: `src/app/api/version/route.ts` — GET `{ localSha, remoteSha, updateAvailable, command }`
- Create: `src/components/settings/UpdateAvailableBanner.tsx`
- Modify: `src/app/reglages/donnees/page.tsx` / `UpdateCommandCard.tsx`
- Test: `tests/settings/version-route.test.ts`

- [ ] **Step 1: Failing test** — route returns `updateAvailable: true` when `remoteSha !== localSha`, body includes `THUMBGEN_UPDATE_COMMAND`, never includes a `script` or `docker` spawn.
- [ ] **Step 2: Fetch `https://api.github.com/repos/ohvignas/ThumbGen/commits/main`** (public, no token required for rate-limited anonymous; cache 1h in memory). If GitHub is down, return `updateAvailable: false` and no error toast spam.
- [ ] **Step 3: UI** — French: « Une mise à jour est disponible. Colle cette commande dans le Terminal, dans le dossier ThumbGen. » Copy button only. **No** « Mettre à jour maintenant » that hits `/api/admin/update`.
- [ ] **Step 4: Tests pass.** Commit.

**Forbidden:** `child_process`, `git pull` from an API route, mounting the Docker socket, host `sudo`.

---

## Chunk 2: Real login (invite list / users)

Replace `SITE_PASSWORD` as the long-term gate. **Do not ship a half-auth** (e.g. still putting the password in `?password=`).

### Task 3: Users table + hashed passwords

**Files:**
- Create: `src/lib/auth/migrations.ts` — `users(id, email, password_hash, role, invited_at, created_at)`
- Create: `src/lib/auth/password.ts` — `scrypt` or `bcrypt` (Node crypto). Never store plaintext.
- Test: `tests/auth/password.test.ts`

- [ ] **Step 1: Failing test** — `hashPassword` / `verifyPassword` round-trip; reject empty passwords.
- [ ] **Step 2: Implement.** Call migration from `src/lib/db.ts` `init` (same pattern as `migrateChannelTables`).
- [ ] **Step 3: Tests pass.** Commit.

### Task 4: Session cookies (not the password)

**Files:**
- Create: `src/lib/auth/sessions.ts` — opaque session id in SQLite `sessions(id, user_id, expires_at)`; cookie `thumbgen_session` httpOnly, `secure` in production, `sameSite=lax`, 7–30 days.
- Create: `src/app/api/auth/login/route.ts` — POST JSON `{ email, password }`; **never** echo the password; no query-string login.
- Create: `src/app/api/auth/logout/route.ts`
- Modify: `src/middleware.ts` — if any user exists, require a valid session; if **zero** users, keep current `SITE_PASSWORD` **or** first-run invite (pick one in the executing session and document it). Delete `/?password=` acceptance.
- Create: `src/lib/auth/rate-limit.ts` — e.g. 5 failures / 10 min / IP (SQLite or memory).
- Test: `tests/auth/login-route.test.ts`

- [ ] **Step 1: Failing tests** — 401 on bad password; 429 after N failures; success sets `thumbgen_session` whose value is **not** the password; `?password=` no longer unlocks.
- [ ] **Step 2: Implement login HTML as a real `/login` page** (not a string in middleware) so it can be French and CSRF-safe (same-origin POST).
- [ ] **Step 3: HTTPS reminder** — cookie `secure: true` already required off localhost (`README.md` troubleshooting). Tailscale Serve / Caddy before opening the port.
- [ ] **Step 4: Invite list** — Réglages (admin only) adds emails; first user is the Mini owner. No public registration.
- [ ] **Step 5: Secrets** — never log keys; `.env` stays gitignored; do not pass user passwords as Docker build ARGs. Phase out `SITE_PASSWORD` build ARG once sessions work.
- [ ] **Step 6: Tests + commit.**

**MCP** stays bearer `MCP_API_KEY` (`/api/mcp` already bypasses the page cookie). Image `<img>` routes stay matcher-exempt (`src/middleware.ts` `config.matcher`).

---

## Chunk 3: Tailscale or VPS (ops, little code)

### Task 5: Mini + Tailscale (preferred)

- [ ] Install Tailscale on the Mini and on each friend’s machine (or Funnel if they should not install Tailscale).
- [ ] `tailscale serve https / http://127.0.0.1:3000` (or Funnel). Leave Compose port as `127.0.0.1:3000`.
- [ ] Set `THUMBGEN_PUBLIC_HOST` to the Serve hostname if MCP is used remotely.
- [ ] Confirm `SITE_PASSWORD` or Chunk 2 login over HTTPS (cookie `Secure`).
- [ ] Do **not** rebuild from a git worktree (`git worktree list`; compose from `/Users/antoinevigneau/thumbgen-real`).

### Task 6: VPS + Docker (if the Mini cannot stay up)

- [ ] Provision Ubuntu VPS (Hostinger VPS or equivalent), Docker + Compose plugin.
- [ ] Clone `https://github.com/ohvignas/ThumbGen.git`, `cp .env.example .env`.
- [ ] Stop Mini writer, copy `data/` (or restore an in-app backup), start Compose on the VPS only (one writer).
- [ ] Caddy in Compose: `thumbgen.example.com` → `thumbgen:3000`. Change app bind if needed (`HOSTNAME=0.0.0.0` already in `Dockerfile:64`). Host port can stay unpublished except via Caddy.
- [ ] UFW: 80/443 only. Optional Compose `mem_limit` after `docker stats`.
- [ ] Same update command on the VPS: `git pull && docker compose up -d --build`.

---

## Chunk 4: Vercel rewrite (do not start unless explicitly requested)

### Task 7: Spike only (design, no production cutover)

- [ ] List every `BLOB` table and every `fs` path under `data/`.
- [ ] Choose Turso **or** Neon **or** Postgres; choose Blob/S3 for bytes.
- [ ] Design **one** Cron (`*/15 * * * *`) that calls the existing `queueSnapshotPoll` path — delete `setInterval` so there are not two pollers.
- [ ] Estimate monthly cost (DB storage + blob + function + cron). Present numbers before writing migration code.
- [ ] If the spike says “too expensive / too risky vs Mini”, **stop**. Keep Docker.

---

## Out of scope

- F3c 7-step wizard / `THUMBNAIL JOURNEY`.
- Paid API calls in the implementing chat unless the human says yes.
- Touching `data/thumbgen.db`.
- A browser button that runs Docker.
- Hostinger shared Node archive deploy.
- Enabling Vercel Agent or Vercel Connect as a substitute for hosting.
- Adding `@vercel/connect` unless the human names Slack, GitHub, or a specific MCP server.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-30-hosted-login-and-updates.md`.

**Ready to execute?** Only after the human picks a chunk (1 popup, 2 login, 3 Tailscale/VPS). Default this week is **no code**: Docker on the Mini + the documented update command.

If executing: use superpowers:subagent-driven-development (fresh subagent per task). Rebuild Docker from the **main** repo only: `docker compose up -d --build`. Tests: `./node_modules/.bin/vitest`. Node: `/opt/homebrew/bin/node` if `node` is missing.
