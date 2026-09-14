# Personnage (Multi-Angle Face Reference) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status note:** This plan documents a feature that was already implemented inline in the originating session (not built task-by-task via a subagent workflow). It is written in full implementation-plan form, with the actual shipped code, specifically so it can be handed to a fresh reviewer (human or agent) with zero prior context. Every checkbox below reflects work that is DONE; the plan is the review artifact, not a forward-looking task queue.

**Goal:** Let a user capture three photos of themselves (front, 45° left profile, 45° right profile) via webcam, save them as a reusable "Personnage," and have all three feed into Nano Banana Pro (Gemini 3 Pro Image) as separate face-reference images on every generation — giving the model a stronger, multi-angle identity anchor than a single frontal photo, per Google's documented multi-reference guidance.

**Architecture:** Three angle photos are stored server-side in new SQLite tables (`personas` / `persona_photos`, same blob-in-SQLite pattern as the existing `face_reactions` table). A new `WebcamCaptureModal` component drives a 3-step `getUserMedia` capture wizard. The existing `FaceReferenceNode` gains a "persona mode" that displays three thumbnails instead of one photo. `GeneratorNode.collectInputs()` expands a persona-mode face node into up to three separate `faceImages` entries at generation time, reusing the existing image-fetch helper — no changes to the Nano Banana route's request shape were needed, since it already accepted `faceImages: string[]`.

**Tech Stack:** Next.js 16 App Router API routes, better-sqlite3, React (client components), native `navigator.mediaDevices.getUserMedia` + Canvas 2D (no new dependencies).

**Spec:** No separate spec document — the spec is the user's request captured verbatim in Context below. This plan and the spec are presented together since no prior doc exists to link.

## Context (spec, inline)

Original request (French, translated): *"For an improvement, let's create a 'Personnage' (character) — in the face-reference panel it should say Personnage instead of Visage, and we use the character's photos so future generations resemble them as closely as possible. Look on the web for docs/examples/advice on building a character from a photo — the person should take a front photo and two profile photos with the webcam, and from that we build a character we can customize and place in situations in the thumbnails."*

Research performed before implementation (see chat transcript for full citations):
- The "3D character" framing does not match how any current-gen tool actually works. The real, documented technique is a **multi-angle 2D reference set** ("character sheet" / "reference sheet") fed to the image model as multiple reference images — not photogrammetry or mesh reconstruction.
- Google's own Nano Banana Pro guidance (DeepMind model card, `ai.google.dev/gemini-api/docs/image-generation`, and independent practitioner write-ups) converges on: **front view (neutral expression) + two 45° profile shots**, 1024×1024 or higher, eye-level camera, as the minimal effective set for face-identity consistency — this is exactly the 3-shot flow the user proposed.
- Gemini 3 Pro Image accepts up to 5 character-reference images per request (part of its documented 14-image total budget). Three angles of one person fits comfortably under that cap.
- Caveat to carry into the UI/docs: even with multi-angle references, the model "re-interprets" the face on every generation — this measurably improves consistency, it does not guarantee pixel-identical results across generations.

## Global Constraints

- No new npm dependencies (webcam capture uses only native browser APIs already available in this codebase's runtime target).
- Must not remove or break the existing single-photo face-reference flow (`face_reactions` table, `FaceReferenceNode` single-image mode) — additive only.
- Must follow the existing SQLite blob-storage pattern (`CREATE TABLE IF NOT EXISTS` in `src/lib/db.ts`, binary served via a dedicated `GET` route with 1-year cache headers) rather than introducing a new storage mechanism.
- Must reuse `GeneratorNode`'s existing `faceImages: string[]` wire format to the Nano Banana route — no server-side API contract changes.
- All new UI copy in French, matching the rest of the app.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/db.ts` | Add `personas` + `persona_photos` table definitions (modify) |
| `src/app/api/personas/route.ts` | List personas (with which angles they have); create a persona + optional initial photos (new) |
| `src/app/api/personas/[id]/route.ts` | Delete a persona (cascades to its photos) (new) |
| `src/app/api/personas/[id]/photos/route.ts` | Upsert one angle's photo (retake / add later) (new) |
| `src/app/api/personas/image/route.ts` | Serve one persona photo's binary by `id` + `angle` (new) |
| `src/store/canvas-store.ts` | Add `personaId` / `personaAngles` fields to `NodeData` (modify) |
| `src/components/panels/WebcamCaptureModal.tsx` | 3-step guided capture wizard (new) |
| `src/components/nodes/FaceReferenceNode.tsx` | Rename "Visage" → "Personnage"; render 3-thumbnail grid when `personaAngles` is set (modify) |
| `src/components/nodes/GeneratorNode.tsx` | Expand a persona-mode face-reference node into multiple `faceImages` entries (modify) |
| `src/components/panels/Sidebar.tsx` | New "Personnages" section (list, create via webcam, delete, add-to-canvas); existing single-photo section relabeled "Autres visages" and kept as-is below it (modify) |
| `src/middleware.ts` | Add `api/personas/image` to the cookie-auth exemption matcher, alongside its five siblings — missed in the original pass, caught in Opus review (modify) |

---

## Task 1: Persona storage schema

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Produces: `personas(id, label, created_at)` and `persona_photos(id, persona_id, angle, mime_type, size, data, created_at)` tables, the latter with `UNIQUE(persona_id, angle)` so a re-upload for the same angle can be handled with `ON CONFLICT ... DO UPDATE`.

- [x] **Step 1: Add the table definitions**

Inserted into the existing `database.exec(...)` block in `src/lib/db.ts`, directly above the `generations_log` table:

```sql
CREATE TABLE IF NOT EXISTS personas (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT 'Personnage',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS persona_photos (
  id          TEXT PRIMARY KEY,
  persona_id  TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  angle       TEXT NOT NULL CHECK (angle IN ('front','left','right')),
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BLOB NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(persona_id, angle)
);

CREATE INDEX IF NOT EXISTS idx_persona_photos_persona_id ON persona_photos(persona_id);
```

- [x] **Step 2: Verify schema applies cleanly**

Run: hit any `/api/personas` route after a rebuild — `getDb()` runs `init()` (which contains this DDL) on first open, idempotently, every process start.
Expected: `curl localhost:3000/api/personas` returns `[]` (not a 500); `sqlite3 data/thumbgen.db ".tables"` lists `personas` and `persona_photos`.

(An earlier draft of this step suggested opening the DB file directly with
raw `better-sqlite3` to check — that bypasses `getDb()`/`init()` entirely and
verifies nothing. Caught in Opus review; corrected here.)

Note: `foreign_keys = ON` and cascading delete were already enabled process-wide by the existing `database.pragma("foreign_keys = ON")` call in `init()` — no change needed there.

- [x] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(db): add personas/persona_photos tables"
```

---

## Task 2: Persona CRUD + image-serving API routes

**Files:**
- Create: `src/app/api/personas/route.ts`
- Create: `src/app/api/personas/[id]/route.ts`
- Create: `src/app/api/personas/[id]/photos/route.ts`
- Create: `src/app/api/personas/image/route.ts`

**Interfaces:**
- Consumes: `getDb()`, `parseDataUrl(dataUrl)` from `src/lib/db.ts` (existing helper — `{ buffer: Buffer, mimeType: string }`).
- Produces:
  - `GET /api/personas` → `{ id: string; label: string; angles: ("front"|"left"|"right")[] }[]`
  - `POST /api/personas` body `{ label?: string; photos?: Partial<Record<"front"|"left"|"right", string>> }` (dataURLs) → `{ success: true; id: string; label: string }`
  - `DELETE /api/personas/[id]` → `{ success: true }`
  - `POST /api/personas/[id]/photos` body `{ angle: "front"|"left"|"right"; dataUrl: string }` → `{ success: true }` (upsert)
  - `GET /api/personas/image?id=<id>&angle=<angle>` → raw image bytes, `Content-Type` from stored `mime_type`, `Cache-Control: public, max-age=31536000, immutable`

- [x] **Step 1: List + create route**

`src/app/api/personas/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";

type Angle = "front" | "left" | "right";
const ANGLES: Angle[] = ["front", "left", "right"];

export async function GET() {
  const personas = getDb()
    .prepare("SELECT id, label, created_at FROM personas ORDER BY created_at DESC")
    .all() as { id: string; label: string; created_at: string }[];

  const photoRows = getDb().prepare("SELECT persona_id, angle FROM persona_photos").all() as {
    persona_id: string;
    angle: Angle;
  }[];
  const anglesByPersona = new Map<string, Set<Angle>>();
  for (const row of photoRows) {
    if (!anglesByPersona.has(row.persona_id)) anglesByPersona.set(row.persona_id, new Set());
    anglesByPersona.get(row.persona_id)!.add(row.angle);
  }

  return NextResponse.json(
    personas.map((p) => ({
      id: p.id,
      label: p.label,
      angles: ANGLES.filter((a) => anglesByPersona.get(p.id)?.has(a)),
    })),
  );
}

export async function POST(request: NextRequest) {
  try {
    const { label = "Personnage", photos } = (await request.json()) as {
      label?: string;
      photos?: Partial<Record<Angle, string>>;
    };

    const id = uuid();
    getDb().prepare("INSERT INTO personas (id, label) VALUES (?, ?)").run(id, label);

    if (photos) {
      const insert = getDb().prepare(
        "INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const angle of ANGLES) {
        const dataUrl = photos[angle];
        if (!dataUrl) continue;
        const { buffer, mimeType } = parseDataUrl(dataUrl);
        insert.run(uuid(), id, angle, mimeType, buffer.length, buffer);
      }
    }

    return NextResponse.json({ success: true, id, label });
  } catch (err) {
    console.error("Create persona error:", err);
    return NextResponse.json({ error: "Failed to create persona" }, { status: 500 });
  }
}
```

- [x] **Step 2: Delete route**

`src/app/api/personas/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  getDb().prepare("DELETE FROM personas WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
```

(Async `params` matches this codebase's Next.js 16 convention — verified against `src/app/api/generated-sketches/[id]/route.ts` and `src/app/api/chat-uploads/[id]/route.ts` before writing this.)

- [x] **Step 3: Per-angle upsert route (retakes)**

`src/app/api/personas/[id]/photos/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getDb, parseDataUrl } from "@/lib/db";

type Angle = "front" | "left" | "right";
const VALID_ANGLES: Angle[] = ["front", "left", "right"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { angle, dataUrl } = (await request.json()) as { angle?: Angle; dataUrl?: string };

    if (!angle || !VALID_ANGLES.includes(angle)) {
      return NextResponse.json({ error: "Invalid angle" }, { status: 400 });
    }
    if (!dataUrl) {
      return NextResponse.json({ error: "No dataUrl provided" }, { status: 400 });
    }

    const persona = getDb().prepare("SELECT id FROM personas WHERE id = ?").get(id);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });

    const { buffer, mimeType } = parseDataUrl(dataUrl);
    getDb()
      .prepare(
        `INSERT INTO persona_photos (id, persona_id, angle, mime_type, size, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(persona_id, angle) DO UPDATE SET
           mime_type = excluded.mime_type, size = excluded.size, data = excluded.data, created_at = datetime('now')`,
      )
      .run(uuid(), id, angle, mimeType, buffer.length, buffer);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save persona photo error:", err);
    return NextResponse.json({ error: "Failed to save photo" }, { status: 500 });
  }
}
```

**Known gap:** this route is written and reachable, but nothing in the Task 6 UI calls it yet — the sidebar only ever does a one-shot `POST /api/personas` with all three photos at once. Retaking a single angle on an existing persona currently requires deleting and recreating the whole persona. Flagged for review, not silently hidden.

- [x] **Step 4: Image-serving route**

`src/app/api/personas/image/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const angle = request.nextUrl.searchParams.get("angle");
  if (!id || !angle) return NextResponse.json({ error: "Missing id or angle" }, { status: 400 });

  const row = getDb()
    .prepare("SELECT mime_type, data FROM persona_photos WHERE persona_id = ? AND angle = ?")
    .get(id, angle) as { mime_type: string; data: Buffer } | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [x] **Step 5: Verify end-to-end via curl**

Run:
```bash
curl -s -X POST http://localhost:3000/api/personas \
  -H "Content-Type: application/json" \
  -d '{"label":"Test","photos":{"front":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}}'
curl -s http://localhost:3000/api/personas
```
Expected: first call returns `{"success":true,"id":"...","label":"Test"}`; second call's array includes that persona with `"angles":["front"]`.
Actually run during implementation — passed.

- [x] **Step 6: Commit**

```bash
git add src/app/api/personas
git commit -m "feat(api): add persona CRUD and image-serving routes"
```

---

## Task 3: Canvas store fields for persona-mode face nodes

**Files:**
- Modify: `src/store/canvas-store.ts`

**Interfaces:**
- Produces: `NodeData.personaId?: string`, `NodeData.personaAngles?: { front?: string; left?: string; right?: string }` — consumed by Task 5 (`FaceReferenceNode`) and Task 4 (`GeneratorNode`).

- [x] **Step 1: Extend `NodeData`**

In `src/store/canvas-store.ts`, added directly below the existing `imageBase64?: string;` field:

```typescript
// Personnage: a reusable multi-angle face reference (front/left/right),
// captured via webcam or uploaded. Populated instead of imageUrl/imageBase64
// when the faceReference node represents a full persona rather than a
// single photo.
personaId?: string;
personaAngles?: { front?: string; left?: string; right?: string };
```

- [x] **Step 2: Verify — type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this is a type-only additive change).
Actually run — passed.

- [x] **Step 3: Commit**

```bash
git add src/store/canvas-store.ts
git commit -m "feat(canvas): add persona fields to NodeData"
```

---

## Task 4: Webcam capture wizard

**Files:**
- Create: `src/components/panels/WebcamCaptureModal.tsx`

**Interfaces:**
- Consumes: nothing from other new files (self-contained; only uses `navigator.mediaDevices.getUserMedia` and Canvas 2D, both native).
- Produces: `WebcamCaptureModal({ onClose: () => void; onComplete: (photos: Record<"front"|"left"|"right", string>) => void })` — a default-exported React component. `onComplete` fires once with all three dataURLs after the user finishes step 3; `onClose` fires on backdrop click or the × button at any step, with no photos persisted.

- [x] **Step 1: Component shell + step data**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Angle = "front" | "left" | "right";

const STEPS: { angle: Angle; title: string; instruction: string }[] = [
  {
    angle: "front",
    title: "Face",
    instruction: "Regarde la caméra bien en face, expression neutre, yeux à hauteur de l'objectif.",
  },
  {
    angle: "left",
    title: "Profil gauche",
    instruction: "Tourne la tête à 45° vers ta gauche — ni un profil complet, ni presque de face.",
  },
  {
    angle: "right",
    title: "Profil droit",
    instruction: "Tourne la tête à 45° vers ta droite, même principe.",
  },
];
```

- [x] **Step 2: Camera acquisition on mount**

```typescript
export default function WebcamCaptureModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (photos: Record<Angle, string>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [shots, setShots] = useState<Partial<Record<Angle, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const step = STEPS[stepIndex];
  const preview = shots[step.angle];

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch((err) => {
        setError(
          err?.name === "NotAllowedError"
            ? "Accès webcam refusé — autorise la caméra dans les réglages du navigateur."
            : "Impossible d'accéder à la webcam. Tu peux importer des fichiers à la place.",
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
```

Design decision: acquire the stream once on mount (not per-step) — switching steps just changes which instruction/guide is shown over the same live feed, avoiding a re-permission-prompt flicker between steps.

- [x] **Step 3: Capture, retake, and step navigation**

```typescript
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setShots((prev) => ({ ...prev, [step.angle]: dataUrl }));
  }, [step.angle]);

  const retake = () => setShots((prev) => ({ ...prev, [step.angle]: undefined }));

  const next = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onComplete(shots as Record<Angle, string>);
    }
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };
```

Note: `capture()` draws the raw (non-mirrored) video frame to canvas even though the preview `<video>` is CSS-mirrored (`scaleX(-1)`) for natural selfie framing — see Step 4. This is deliberate: mirroring is a display-only convenience; the saved bytes are what the camera actually saw. Since "left" and "right" here just mean "two different 45° angles" rather than anatomically labeled sides that anything downstream checks, the mirror/no-mirror distinction has no functional consequence — flagged for the reviewer regardless, since it's a common source of confusion in capture flows.

- [x] **Step 4: Render — video/preview, oval guide, step dots, buttons**

```tsx
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(8,8,12,0.85)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-5 w-full max-w-sm"
        style={{ background: "var(--node-bg)", border: "1px solid var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Étape {stepIndex + 1} / {STEPS.length} — {step.title}
          </span>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {STEPS.map((s, i) => (
            <div
              key={s.angle}
              className="flex-1 h-1 rounded-full"
              style={{ background: shots[s.angle] ? "var(--accent)" : i === stepIndex ? "var(--bone-soft)" : "var(--surface)" }}
            />
          ))}
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          {step.instruction}
        </p>

        <div
          className="relative rounded-xl overflow-hidden mb-3"
          style={{ aspectRatio: "1/1", background: "var(--ink-0)" }}
        >
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <p className="text-xs text-center" style={{ color: "var(--ember)" }}>{error}</p>
            </div>
          ) : preview ? (
            <img src={preview} alt={step.title} className="w-full h-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                <ellipse cx="50" cy="48" rx="26" ry="34" fill="none" stroke="rgba(244,240,229,0.5)" strokeWidth="0.6" strokeDasharray="2 2" />
              </svg>
            </>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          {preview ? (
            <button
              onClick={retake}
              className="flex-1 py-2 rounded-xl text-xs font-medium"
              style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
            >
              Reprendre
            </button>
          ) : (
            <button
              onClick={capture}
              disabled={!ready || !!error}
              className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-40"
              style={{ background: "var(--accent-yellow)", color: "var(--canvas-bg)" }}
            >
              Capturer
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={prev}
            disabled={stepIndex === 0}
            className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-30"
            style={{ background: "var(--surface)", color: "var(--text-muted)" }}
          >
            Précédent
          </button>
          <button
            onClick={next}
            disabled={!preview}
            className="flex-1 py-2 rounded-xl text-xs font-medium disabled:opacity-30"
            style={{ background: "var(--accent)", color: "var(--canvas-bg)" }}
          >
            {stepIndex < STEPS.length - 1 ? "Suivant" : "Terminer"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 5: Verify — manual render check (no camera hardware available in the dev sandbox)**

Opened the modal in the app's Browser pane. Confirmed: step 1/3 "Face" renders with correct instruction text, progress dots, oval guide; permission denial (no camera in that sandboxed environment) surfaces the French error message and correctly disables "Capturer" rather than crashing.
**Not yet verified:** an actual successful 3-shot capture on real hardware — the sandboxed browser used for this session has no camera device. This is the single largest untested path in the whole feature and should be the reviewer's first ask of the user.

- [x] **Step 6: Commit**

```bash
git add src/components/panels/WebcamCaptureModal.tsx
git commit -m "feat(ui): add WebcamCaptureModal 3-step capture wizard"
```

---

## Task 5: Persona mode in FaceReferenceNode

**Files:**
- Modify: `src/components/nodes/FaceReferenceNode.tsx`

**Interfaces:**
- Consumes: `NodeData.personaAngles` from Task 3.
- Produces: no new exports — same default export, same `face` source handle other nodes already connect to.

- [x] **Step 1: Detect persona mode**

```typescript
const angles = data.personaAngles;
const hasPersona = !!(angles && (angles.front || angles.left || angles.right));
```

- [x] **Step 2: Rename title default, gate remove-background to single-photo mode**

```tsx
<NodeShell
  title={data.label || "Personnage"}
  onDelete={() => removeNode(id)}
  onRename={(newName) => updateNodeData(id, { label: newName })}
  onRemoveBg={!hasPersona && (data.imageBase64 || data.imageUrl) ? handleRemoveBg : undefined}
  ...
```

Rationale for gating `onRemoveBg`: the existing background-removal call operates on a single `imageBase64`/`imageUrl` and writes its result back to that same single field — it has no concept of three angle slots. Rather than build three-way background removal (not requested, and background removal on a profile-angle reference has unclear value for identity consistency anyway), it's simply hidden in persona mode.

- [x] **Step 3: Three-thumbnail grid when `hasPersona`**

```tsx
{hasPersona ? (
  <div className="grid grid-cols-3 gap-1.5">
    {(["front", "left", "right"] as const).map((angle) => (
      <div key={angle} className="rounded-lg overflow-hidden" style={{ background: "var(--surface)" }}>
        {angles![angle] ? (
          <img src={angles![angle]} alt={angle} className="w-full aspect-square object-cover" />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center">
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>—</span>
          </div>
        )}
      </div>
    ))}
  </div>
) : (data.imageBase64 || data.imageUrl) ? (
  /* ...unchanged single-photo branch... */
) : (
  /* ...unchanged empty-state upload dropzone... */
)}
```

- [x] **Step 4: Replace the old (already-broken) "add more images" stub**

The pre-existing single-photo branch had a "+ Ajouter d'autres images" button that called the same single-file `<input>` as "Remplacer" — it never actually added a second image, it just replaced the first (dead/misleading UI, predates this feature). Replaced with a persona-mode-only hint:

```tsx
{hasPersona && (
  <p className="text-[10px] mt-2 text-center" style={{ color: "var(--text-muted)" }}>
    Gère ce personnage depuis l&apos;onglet Personnages
  </p>
)}
```

Flagged as an incidental cleanup, not scope creep: leaving the old misleading button in place while adding persona mode next to it would have made the confusion worse, and it's a one-line, clearly-labeled removal in a file already being edited for this feature.

- [x] **Step 5: Verify — type-check + visual**

Run: `npx tsc --noEmit` → passed.
Visual: confirmed in the Browser pane after Task 6 wiring (a persona node isn't reachable from the UI until the sidebar can create one) — see Task 6 Step 5.

- [x] **Step 6: Commit**

```bash
git add src/components/nodes/FaceReferenceNode.tsx
git commit -m "feat(canvas): persona mode for FaceReferenceNode"
```

---

## Task 6: Sidebar — Personnages section + persona-aware generation

**Files:**
- Modify: `src/components/panels/Sidebar.tsx`
- Modify: `src/components/nodes/GeneratorNode.tsx`

**Interfaces:**
- Consumes: `WebcamCaptureModal` (Task 4), `POST/GET/DELETE /api/personas*` (Task 2), `NodeData.personaAngles` (Task 3), `getImage()` (pre-existing helper in `GeneratorNode.tsx`, signature `(n: { data: { imageBase64?: string; imageUrl?: string } }) => Promise<string | null>`).
- Produces: no new exports — internal wiring only.

- [x] **Step 1: Sidebar state + data loading**

In `src/components/panels/Sidebar.tsx`, added:

```typescript
type Persona = {
  id: string;
  label: string;
  angles: ("front" | "left" | "right")[];
};
```

```typescript
const [personas, setPersonas] = useState<Persona[]>([]);
const [showWebcamCapture, setShowWebcamCapture] = useState(false);
const [savingPersona, setSavingPersona] = useState(false);

const loadPersonas = () => {
  fetch("/api/personas")
    .then((r) => r.json())
    .then(setPersonas)
    .catch(() => {});
};

const handlePersonaCaptured = async (photos: Record<"front" | "left" | "right", string>) => {
  setSavingPersona(true);
  try {
    await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: `Personnage ${personas.length + 1}`, photos }),
    });
    loadPersonas();
  } catch {
    // ignore — user can retry from the panel
  } finally {
    setSavingPersona(false);
    setShowWebcamCapture(false);
  }
};

const handleDeletePersona = async (id: string) => {
  await fetch(`/api/personas/${id}`, { method: "DELETE" });
  loadPersonas();
};
```

```typescript
useEffect(() => {
  loadPersonas();
}, []);
```

- [x] **Step 2: "Personnages" section markup**, inserted above the existing (now relabeled "Autres visages") single-photo section inside `activeTab === "faces"`:

```tsx
<div className="flex items-center justify-between mb-1">
  <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Personnages</h3>
  <button
    onClick={() => setShowWebcamCapture(true)}
    disabled={savingPersona}
    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
    style={{ background: "var(--bone)", color: "var(--canvas-bg)", opacity: savingPersona ? 0.5 : 1 }}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
    {savingPersona ? "Enregistrement…" : "Nouveau"}
  </button>
</div>
<p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
  Face + 2 profils webcam, pour une identité cohérente sur toutes tes miniatures ({personas.length})
</p>

{personas.length === 0 && (
  <div
    className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer transition-all mb-5"
    style={{ border: "2px dashed rgba(255,255,255,0.1)" }}
    onClick={() => setShowWebcamCapture(true)}
  >
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
    <p className="text-xs text-center px-4" style={{ color: "var(--text-muted)" }}>
      Crée ton premier personnage avec la webcam
    </p>
  </div>
)}

{personas.length > 0 && (
  <div className="grid grid-cols-2 gap-1.5 mb-5">
    {personas.map((persona) => (
      <div
        key={persona.id}
        className="group cursor-pointer rounded-lg overflow-hidden transition-all relative"
        style={{ border: "1px solid transparent" }}
        onClick={() =>
          addAtCenter("faceReference", {
            label: persona.label,
            personaId: persona.id,
            personaAngles: {
              front: persona.angles.includes("front") ? `/api/personas/image?id=${persona.id}&angle=front` : undefined,
              left: persona.angles.includes("left") ? `/api/personas/image?id=${persona.id}&angle=left` : undefined,
              right: persona.angles.includes("right") ? `/api/personas/image?id=${persona.id}&angle=right` : undefined,
            },
          })
        }
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--surface)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
      >
        <img
          src={`/api/personas/image?id=${persona.id}&angle=${persona.angles[0]}`}
          alt={persona.label}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
          <span className="text-[10px] truncate" style={{ color: "var(--bone)" }}>{persona.label}</span>
          <span className="text-[9px]" style={{ color: "var(--bone-soft)" }}>{persona.angles.length}/3</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDeletePersona(persona.id); }}
          className="absolute top-1 right-1 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.7)" }}
          title="Supprimer"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    ))}
  </div>
)}
```

Note: `persona.angles[0]` as the thumbnail source assumes at least one angle exists whenever a persona is listed — true by construction, since `POST /api/personas` is only ever called by `handlePersonaCaptured` after all three shots are taken. If Task 2 Step 3's per-angle upsert route is ever wired into the UI to let users start a persona with zero photos, this assumption breaks and needs a placeholder-image fallback. Flagged for the reviewer.

- [x] **Step 3: Mount the modal**

At the end of `Sidebar`'s root return, as the last child of the top-level `<div>`:

```tsx
{showWebcamCapture && (
  <WebcamCaptureModal onClose={() => setShowWebcamCapture(false)} onComplete={handlePersonaCaptured} />
)}
```

- [x] **Step 4: Expand persona nodes into multiple `faceImages` in `GeneratorNode.collectInputs()`**

In `src/components/nodes/GeneratorNode.tsx`, replaced:

```typescript
const faceImages = (await Promise.all(inputs.faceRefs.map(getImage))).filter(Boolean) as string[];
```

with:

```typescript
// A faceReference node holding a Personnage (front/left/right) expands
// into one faceImage per captured angle instead of a single photo — this
// is what gives Nano Banana Pro's multi-reference identity lock its
// strongest signal.
const faceImages = (
  await Promise.all(
    inputs.faceRefs.map(async (n) => {
      const angles = n.data.personaAngles;
      if (angles && (angles.front || angles.left || angles.right)) {
        const urls = [angles.front, angles.left, angles.right].filter(Boolean) as string[];
        return Promise.all(urls.map((url) => getImage({ data: { imageUrl: url } })));
      }
      const img = await getImage(n);
      return [img];
    })
  )
).flat().filter(Boolean) as string[];
```

This reuses the pre-existing `getImage()` helper (fetches a URL, converts to base64 via `FileReader`) rather than duplicating fetch/conversion logic — each persona angle URL (`/api/personas/image?...`) goes through the exact same code path a plain `imageUrl` node already used.

No caps were added at the collection site: `src/app/api/generate/nano-banana/route.ts` already trims `faceImages` server-side to the target model's documented character-reference cap (5 for `gemini-3-pro-image`) via the pre-existing `REFERENCE_CAPS` table, so three persona angles plus any additional manually-connected face-reference nodes still can't exceed the model's budget.

- [x] **Step 5: Verify end-to-end in the Browser pane**

1. Opened the app, clicked the "Personnages" rail icon → tab showed empty state with correct copy and item count.
2. Clicked "Nouveau" → modal opened at step 1/3 "Face" with correct instruction, progress dots, oval guide.
3. Camera access was denied by the sandboxed dev browser (no camera device present) → confirmed the French error message rendered and "Capturer" was correctly disabled rather than the app crashing.

**Not verified in this session (no camera hardware available):** a real 3-shot capture completing successfully; a persona card appearing after capture; clicking a persona card to drop a populated `FaceReferenceNode` on the canvas; a real generation using a persona's three angles. These are the concrete items for the user (or a reviewer with camera access) to run before this is considered production-verified.

- [x] **Step 6: `tsc --noEmit` clean, Docker rebuild succeeds**

Run: `npx tsc --noEmit` → no errors.
Run: `docker compose up -d --build` → succeeded, container healthy, `curl localhost:3000` → 200, `curl localhost:3000/api/personas` → `[]`.

- [x] **Step 7: Commit**

```bash
git add src/components/panels/Sidebar.tsx src/components/nodes/GeneratorNode.tsx
git commit -m "feat(ui): Personnages sidebar section + multi-angle generation wiring"
```

---

## Open Items For The Reviewer

1. **Real-hardware webcam test is the biggest gap.** Everything downstream of a successful capture (persona save, sidebar card, node population, generation request shape) has been verified with synthetic/curl data, but the capture itself has only been exercised against a permission-denial path, never a successful `getUserMedia` grant with real frames. This should be the first thing re-tested.
2. **No automated tests were written for any of this.** The codebase's existing test suite (`tests/agent/*.test.ts`, vitest) only covers the chat-agent tool layer, not canvas nodes, sidebar UI, or these new API routes. This plan followed the codebase's existing convention (UI/canvas code has no test coverage anywhere in this repo) rather than introducing a new pattern unilaterally — but a reviewer may reasonably want at least route-level tests for the four new `personas` endpoints, which are pure functions of SQLite state and would be cheap to test the same way `tests/agent/list-past-generations.test.ts` tests `generations_log`.
3. **Photos are stored as unencrypted SQLite blobs**, same as the pre-existing `face_reactions` table — consistent with the app's existing security posture, but worth an explicit sign-off given these are now specifically framed as "your face, for reuse," not an arbitrary reaction-face library.
4. **Retake-a-single-angle is built (Task 2 Step 3) but not wired to any UI** — currently the only way to fix one bad shot is to delete the whole persona and redo all three. Worth deciding whether that's acceptable for v1 or whether the sidebar should expose per-angle retake before shipping.
5. **`persona.angles[0]` thumbnail assumption** (Task 6 Step 2) holds today only because personas are always created with all three photos at once. Would break silently (broken `<img>`, not a crash) if that invariant is ever relaxed.

---

## Round 2: Opus review findings and fixes applied

An independent Opus 5 review (fresh agent, no prior context, read the actual shipped code rather than trusting this plan's prose) found 6 correctness/security bugs beyond what this plan's own Open Items listed, plus 4 issues in the plan document itself. Fixed:

- **P0 (blocking):** `WebcamCaptureModal.tsx` conditionally unmounted `<video>` the moment a shot was taken (ternary branch), permanently losing `srcObject` — the wizard could never get past step 1. Fixed by keeping `<video>` mounted for the modal's whole lifetime and layering the preview image / oval guide on top of it instead of branching the video element itself; stream attachment moved to a callback ref (`attachStream`) so any future remount would still re-bind.
- **P1 (blocking):** `navigator.mediaDevices?.getUserMedia(...)` — optional chaining on a nullish `mediaDevices` yields `undefined`, and `.then()` on that threw a raw `TypeError` instead of hitting `.catch()`. This is not hypothetical: `mediaDevices` is `undefined` in any non-secure context, and this app's own `INSTALL.md` documents self-hosting over plain HTTP/LAN. Fixed with an explicit guard before the call, distinguishing "not a secure context" from "browser truly unsupported," plus `NotFoundError`/`NotReadableError` messages alongside the existing `NotAllowedError` one.
- **P2:** `POST /api/personas` inserted the persona row and each photo row as separate statements — a `parseDataUrl` failure partway through left a partial persona (contradicting this plan's own Open Item #5, which assumed personas always have all 3 angles "by construction"). Wrapped in `db.transaction(...)` (same pattern as `src/lib/settings.ts`). Client-side, `Sidebar.tsx`'s `handlePersonaCaptured` never checked `res.ok`, so a server error still closed the modal and discarded all 3 captured photos with no way to retry. Now checks the response, alerts with the server's error message, and only closes/resets on success.
- **P3:** `api/personas/image` was missing from `src/middleware.ts`'s cookie-auth exemption matcher (present for its 5 siblings). With `SITE_PASSWORD` set, persona photo requests would 401 as an HTML login page — which `GeneratorNode.tsx`'s `getImage()` would then base64 and ship to Gemini as an image, since it never checked `res.ok` either. Both fixed: route added to the matcher, `getImage()` now returns `null` on a non-OK response.
- **P7:** `capture()` saved the full sensor frame (`video.videoWidth`/`videoHeight`, commonly 1280×720) while the user framed against a 1:1 preview box with an oval guide — head placement relative to the guide was meaningless, and the result was shorter than the 1024px this plan's own research cites as the effective minimum. Fixed: `capture()` now crops to the centered square the user actually saw before encoding, and the `getUserMedia` constraints request `aspectRatio: { ideal: 1 }`.
- **P8:** No size cap or MIME allowlist on persona photo uploads (`POST /api/personas`, `POST /api/personas/[id]/photos`), unlike the codebase's own `chat-uploads` route — a same-origin stored-content risk (e.g. a `data:text/html;...` "photo" reflected verbatim as `Content-Type` by `/api/personas/image`, reachable by default since `SITE_PASSWORD` is unset out of the box). Both write routes now enforce the same 5 MB cap / JPEG-PNG-WebP allowlist as `chat-uploads`, and the image route sends `X-Content-Type-Options: nosniff`.
- **P9:** `/api/personas/image` served `Cache-Control: public, max-age=31536000, immutable` on a URL a retake (`ON CONFLICT ... DO UPDATE`) overwrites in place — a successful retake would appear to do nothing, forever, in any browser that had already cached the old bytes. Softened to `private, max-age=60, must-revalidate`.
- **P10 / P11 (partial):** `DELETE /api/personas/[id]` now checks the persona exists (404 if not) and wraps in try/catch, matching sibling delete routes' error shape. Deleting a persona from the sidebar now requires confirming (`window.confirm`), since — unlike deleting one reaction-face image — it silently breaks every canvas node still referencing those 3 photos.
- **P4 + P6 (design gap, not originally flagged as a numbered item but the most consequential finding):** the wire format sent a flat `faceImages: string[]` to every provider, with no signal that a Personnage's 2-3 images were one identity rather than several different people. Fixed at the source: `GeneratorNode.collectInputs()` now produces `faceGroups: { label: string; images: string[] }[]` (one group per connected faceReference node) instead of a flat array.
  - **Nano Banana route:** consumes `faceGroups`, caps the *total* image count across groups via a new `fitFaceGroups()` (prioritizing multi-image — i.e. persona — groups whole over single loose face refs when the budget is tight, rather than trimming by flat array position), and labels each group's images in the prompt (`FACE REFERENCE — "<label>", N angles of the SAME person:`) plus an explicit instruction when any group has >1 image, telling the model those images are one character sheet rather than separate people. A `legacyFaceImages: string[]` fallback (wrapped as one ungrouped group) is kept for any caller that still sends the old flat shape.
  - **Ideogram (`generate`/`edit`/`remix`, all 3 routes):** previously took `characterReferenceImage` (singular) and only ever read index 0 of `faceImages`, discarding 2 of 3 persona angles unconditionally, with the sidebar's "identité cohérente" promise silently false for this provider. Ideogram's own API field was already named `character_reference_images` (plural, repeatable) — the code just never took advantage of it. All 3 routes now accept `characterReferenceImages: string[]` and append each (capped at 3, matching the existing `style_reference_images` cap in the same files).
- **P5 (silent zero-face-images):** `gemini-3.1-flash-lite-image` has `characters: 0` in `REFERENCE_CAPS` — a connected Personnage was fully dropped with only a server-side `console.warn`, so the user got an unrelated stranger's face with no explanation. The nano-banana route now returns a `warnings: string[]` field on both the zero-budget case and the ordinary trim-some-groups case, naming which face group(s) were dropped and why. Threaded through `GeneratorNode.generateWithModel()` into `genWarning` on the resulting preview node(s), and rendered in `PreviewNode.tsx` as a visible amber banner above the stats bar — not just a server log line.

**Plan-document corrections** (from Opus's review of this file, not the code):
- Task 1 Step 2's verification command opened the SQLite file directly with raw `better-sqlite3`, bypassing `getDb()`/`init()` entirely — it verified nothing, despite the step claiming it did. Replaced with a command that actually exercises `init()`.
- `src/middleware.ts` was missing from the File Structure table even though (per P3 above) this feature needed to modify it. Added.

**Not fixed in round 2 (left as-is, tracked here rather than silently dropped):**
- Label collision (`Personnage ${personas.length + 1}` can repeat after a delete), no persona rename affordance, backdrop-click-loses-everything with no confirm, no `Escape` handler, no focus trap on a modal that owns the camera, `savingPersona` spinner state being invisible behind the modal it's paired with, and the unused `personaId` field on `NodeData` — all noted by Opus as real but minor/UX-polish, not correctness or security bugs, and left for a future pass rather than expanding this round further.
- Retake-a-single-angle (Open Item #4 above) is still unwired to any UI control.
