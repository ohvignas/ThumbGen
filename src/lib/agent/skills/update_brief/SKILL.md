---
name: update_brief
description: Writes optional memory into this chat's Fiche (promise, packages, logos, composition). Use after a decision worth keeping. Send only changed fields. Omit step — do not drive a 7-step wizard. Trust <thumbnail_brief> over chat history for those fields.
---

# update_brief

Chat-only write of this conversation's **Fiche** (optional structured memory). Conversation and project are injected; never send them. Not on MCP.

The Fiche is **not** a pipeline. A `<thumbnail_brief>` block, when present, is the truth for those fields — trust it over chat history. The user can also edit the sheet in the UI. Chat label: « Met à jour la fiche ».

Load this skill before the first `update_brief` in a conversation. Do not mention « Étape n/7 », « step 3 of 7 », or a numbered interview.

Packaging constraints this tool **enforces** (full rubric: `thumbnail-packaging`): promise result-oriented and ≤90 characters; each kept package is a title (≤60) plus `thumbnailText` of **0–4 words and ≤20 characters** (`""` = no text) that **complements** the title and never promises what the video does not deliver; one focal subject; **≤3 elements including the hero**; readable at 168×94.

## When

- A decision has **stabilized**: video promise, kept packages A/B/C, persona, logos, references, composition card, or a sketch id worth remembering.
- After `ask_user` / a clear deduction (one obvious logo, channel default Personnage they did not refuse).
- After `generate_sketch` when you are keeping a fiche: store `generated:sk_<id>` on that variant.
- After `import_youtube_thumbnail` when that thumb is a kept reference (max 3).
- First write creates the row if none exists. Later writes merge.

## When not

- Every half-formed thought. Wait until they kept it (or it is the one obvious package).
- **Do not send `step`.** It is a leftover integer 1–7. Sending it stores a number; it does **not** advance a wizard. Never teach or narrate a 7-step journey.
- Overwrite `research_topic` / `analyze_thumbnails` output unless you are correcting a field they asked to change. Those tools already write the Fiche.
- `logoCandidates` and `usage` are **server-only**. This tool cannot patch them.
- Empty `{}` just to "create a fiche". Write when there is something to remember.
- Same model step as `ask_user` or `finish_turn`. Record the decision after the answer; `finish_turn` last and alone.
- Dump the returned JSON in chat. The user sees the sheet; you summarize in `finish_turn`.
- Invent `stored:lg_`, `stored:sf_`, `stored:persona_`, or `generated:sk_` ids. Copy them from list/find/import/sketch tools.
- Four logos, four references, or a fourth variant. Caps are 3.

## How

Argument: one object. **Send only changed fields.** Omitted keys stay. The merge runs, then the **full** brief schema validates. If anything breaks a rule, **nothing is saved**.

Do not send `conversationId`, `projectId`, `logoCandidates`, `usage`, `analyzedAt`, `fetchedAt`, or research `sources`.

### Merge

| Patch | Behavior |
|---|---|
| `video`, `common`, `competition` | Field by field. `null` **clears** that field. `undefined` / omitted = leave it. |
| `research` | Merges `summary`, `keyPoints`, `entities`. **Keeps** stored `sources` and `fetchedAt` (or `[]` / now if creating the object). You cannot set sources. |
| `abStrategy`, `abVariable` | Set the enum, or `null` to delete. |
| `logos`, `references` | **Replace the whole array** (max 3). Sending `[]` clears them. |
| `variant` | `{ key: "A"\|"B"\|"C", set }`. Merge **that** variant by key (create if missing). Variants are stored sorted A, B, C. |
| `variant.set.composition` / `set.sketch` | **Replace the whole card or sketch** (not field-by-field). `null` deletes it. |
| `removeVariant` | Drop A, B, or C. If the same call also has `variant`, remove runs **first**, then the variant may re-add that key. |

A **new** variant needs every required package field in that same `set` (partial create → `Champ requis`). An **existing** variant accepts a partial `set`.

### `step` — omit

Optional leftover `1–7`. **Do not send it.** Do not increment it. Do not tell the user which "étape" they are on.

### `video`

Field-by-field. `null` clears.

| Field | Max | Notes |
|---|---|---|
| `subject` | 300 | What the video is about |
| `workingTitle` | 120 | Working video title (not the thumbnail line) |
| `script` | 8000 | Stored; the tool **answer omits** the full script |
| `promise` | 90 | Result for the viewer. Required in spirit before packages; schema allows empty until you set it |
| `audience` | 120 | Who it is for |

### `research`

Prefer `research_topic` (paid, writes summary / keyPoints / entities / sources). Patch only to correct:

- `summary` ≤ 1200
- `keyPoints`: ≤6 strings, each ≤200
- `entities`: ≤12 `{ name` ≤80, `kind`: `company` \| `tool` \| `product` \| `other` `}`

Do not invent URLs. Sources stay whatever `research_topic` stored.

### `common`

| Field | Values | Notes |
|---|---|---|
| `persona` | `stored:persona_<id>` **or** `"none"` | From `list_personas`. `"none"` = faceless. `null` clears. Malformed → `Personnage au format stored:persona_<id>` |
| `style` | ≤300 | Shared look |
| `colors` | ≤3 `#RRGGBB` or `null` | Brand colors for the brief, not the per-card palette |
| `textMode` | `rendered` (default) \| `overlay` | `rendered` = model paints the words. `overlay` = leave the text zone empty for later |
| `model` | `nano-banana` \| `openai` \| `seedream` or `null` | Hint. Canvas generator is still what they click. Accents / >2 words of thumb text → `openai`. Personnage and no text → `seedream`. Else `nano-banana` |

Emotion on a card is refused when `persona` is **`"none"`** (`Pas d'émotion sans personnage`). Unset persona does not trigger that rule; still do not put a face emotion on a faceless package.

### `competition`

Prefer `analyze_thumbnails` (server writes patterns / saturation / `dominantPalette` / `analyzedAt`). You may patch:

- `patterns`: ≤3 × 120
- `saturation`: ≤3 × 120 (what everyone already does)
- `dominantPalette`: ≤3 `#RRGGBB`

`analyzedAt` is preserved (or set to now if this object is new). You cannot send it.

### `abStrategy` / `abVariable`

- `abStrategy`: `concepts` (packages must really differ) \| `single-variable` (one knob vs A)
- `abVariable`: `text` \| `emotion` \| `background` \| `hero` — only meaningful with `single-variable`
- `null` clears

Single-variable **allowed** diffs vs A:

| Variable | May differ |
|---|---|
| `text` | `thumbnailText`, `textZone` |
| `emotion` | `emotion` |
| `background` | `background`, `palette` |
| `hero` | `focal`, `elements` |

Compared extras (layout, layoutNote, and the other card fields) trigger a **warning**, not a refusal. Concepts with the same layout **and** the same focal (normalized words) also warn.

### `logos` — whole array, max 3

Each: `{ name` ≤80, `source: "stored:lg_<id>"` `}`. Regex `^stored:lg_[\w-]+$`. Else `Logo au format stored:lg_<id>`. Fourth → `3 logos maximum`.

`add_logo` **already appends** to the Fiche. Skip a second write if that source is already there. To drop one, send the remaining list (replace). Never put `logo-candidate:` here.

### `references` — whole array, max 3

Each object is complete (not a per-field merge):

| Field | Rule |
|---|---|
| `videoId` | `^[\w-]{6,20}$` else `Identifiant de vidéo invalide` |
| `title` | ≤200 |
| `channel` | ≤120 |
| `lang` | `fr` \| `en` |
| `views`, `ageDays` | integer ≥0 |
| `score` | number or `null` |
| `source` | `stored:sf_<id>` (`^stored:sf_[\w-]+$`) else `Référence au format stored:sf_<id>` |
| `analysis` | optional; leave off unless you have a real classify payload |

Fourth → `3 références maximum`. Copy `stored:sf_<id>` from `import_youtube_thumbnail` / `list_swipe_files`. Cap at 3 kept refs.

### `variant`

```
{ "key": "A" | "B" | "C", "set": { ... } }
```

`set` fields (all optional on patch; required on a **new** card):

| Field | Max / rule |
|---|---|
| `direction` | required ≤60 — the angle in one line |
| `title` | required ≤60 — YouTube title for this package |
| `thumbnailText` | **0–4 words, ≤20 characters**; `""` = no text. Count is trimmed; extra words → `Texte de miniature : 4 mots maximum`; extra chars → `Texte de miniature : 20 caractères maximum` |
| `visualIdea` | required ≤120 |
| `titleRole` | required ≤80 — what the title does |
| `thumbRole` | required ≤80 — what the thumb does |
| `composition` | whole card or `null` (see below) |
| `sketch` | whole sketch or `null` |

Duplicate keys after merge → `Variante A en double` (should not happen if you only send A/B/C once). Max 3 variants.

Thumbnail text must **complement** the title (packaging). More than one overlapping content word (accents stripped, FR/EN stop words ignored; research entity names and logo names excluded) is a **warning**, not a refusal. One shared word is fine. `""` is valid.

### `set.composition` — whole card

Replaces the previous card. Send a **complete** valid object, or `null` to clear. A half-card wipes the old one and is refused.

| Field | Rule |
|---|---|
| `layout` | One of: `face-left_object-right`, `face-right_object-left`, `center-hero_text-top`, `split-versus`, `before-after`, `screen-hero_face-corner`, `object-hero_no-face`, `other` |
| `layoutNote` | optional ≤120 |
| `focal` | required ≤80 — the one subject the eye hits at 168×94 |
| `elements` | **1–3**. `Au moins un élément` / `3 éléments maximum : retire-en un` |
| `textZone` | `{ position, heightPct }` or `null`. `heightPct` integer **12–30** (`Zone de texte : 12 % minimum` / `30 % maximum`) |
| `background` | `{ kind: solid\|gradient\|blurred-scene\|scene, color?: #RRGGBB, note?: ≤120 }` |
| `emotion` | optional `{ label, intensity?, mouth? }` — see below |
| `palette` | `{ dominant, accent, highlight }` each `#RRGGBB` |

Each element:

| Field | Rule |
|---|---|
| `what` | required ≤80 |
| `role` | `hero` \| `support` |
| `sizePct` | integer **5–70** (`Taille minimale : 5 %` / `Taille maximale : 70 %` / `Taille entière en %`) |
| `position` | 9-grid: `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right` |

**Cross-field (refused if broken):**

- **Exactly one hero.** `Exactement un élément héros`
- **Sum of `sizePct` ≤ 110.** `La somme des tailles (N %) dépasse 110 %`
- **Text zone not on the hero's cell.** `La zone de texte ne peut pas être sur la case du héros`
- **No emotion without a character.** If `common.persona === "none"` and the card has `emotion` → `Pas d'émotion sans personnage`

`emotion.label`: `curiosité` \| `surprise` \| `satisfaction` \| `inquiétude` \| `concentration` \| `déterminé`. `intensity` 1–3 (default 2). `mouth` `closed` (default) \| `open`. Faceless packages (`object-hero_no-face`, persona `"none"`): omit `emotion`.

Hex anywhere: `Couleur au format #RRGGBB` (`#RRGGBB` only).

Empty required strings: `Champ requis`. Over-long strings: `N caractères maximum`.

### `set.sketch` — whole record

```
{ "source": "generated:sk_<id>", "status": "pending" | "validated" | "retouch", "autoFixed": false }
```

`source` must match `^generated:sk_[A-Za-z0-9]+$` else `Esquisse au format generated:sk_<id>`. Copy the id from `generate_sketch` (`sk_` + hex, no dashes). Typical first write: `status: "pending"`. They keep it → `validated`. They want a redo → `retouch`. Optional `review` (booleans / counts / `contrast` / `note` ≤200) is for later review tools — omit unless you have it. `null` clears the sketch.

### `removeVariant`

`"A"` \| `"B"` \| `"C"`. Use when they drop a package. Do not leave an orphan sketch on a removed key.

### Success

Text (not a visual `result_id`):

```
Fiche enregistrée.
{compact JSON of the saved brief, script omitted}
```

If there are warnings:

```
Avertissements (reformule une fois, puis continue) :
- …
```

The JSON is for **you**. Do not paste it. Next `<thumbnail_brief>` will include it (script truncated there). Broadcast to the Fiche panel can fail; the row is still saved — do not retry for that.

## Errors

Quote / paraphrase the named path and message. The whole write is rolled back (`Fiche refusée, rien n'a été enregistré`). **Fix what it names and retry once.** Do not retry the same payload. Do not dump Zod JSON to the user.

Format:

```
Fiche refusée, rien n'a été enregistré :
- <path> : <message>
```

Variant paths use the **key**, not an index (`variants.A.thumbnailText`, `variants.B.composition.elements`). Empty path → `fiche`.

| Message (theme) | Meaning | Do |
|---|---|---|
| `Texte de miniature : 4 mots maximum` | More than 4 words after trim | Cut to ≤4 words, ≤20 chars, or `""` |
| `Texte de miniature : 20 caractères maximum` | Over 20 characters | Shorten |
| `Exactement un élément héros` | 0 or 2+ heroes | One `role: "hero"`, others `support` |
| `3 éléments maximum : retire-en un` / `Au moins un élément` | 4+ or 0 elements | 1–3 including the hero |
| `La somme des tailles (N %) dépasse 110 %` | `sizePct` sum > 110 | Shrink; each still 5–70 |
| `La zone de texte ne peut pas être sur la case du héros` | `textZone.position` == hero `position` | Move the zone (often `top-left` / `top-right`) or the hero |
| `Pas d'émotion sans personnage` | `emotion` while `common.persona` is `"none"` | Drop `emotion`, or set a real `stored:persona_<id>` |
| `Personnage au format stored:persona_<id>` | Bad `common.persona` | `list_personas`; `"none"` if faceless. Never `stored:fr_`, upload, swipe |
| `Logo au format stored:lg_<id>` / `3 logos maximum` | Bad or fourth logo | `list_logos` / `add_logo`; replace the array with ≤3 |
| `Référence au format stored:sf_<id>` / `Identifiant de vidéo invalide` / `3 références maximum` | Bad or fourth ref | Import / list first; ≤3 complete objects |
| `Esquisse au format generated:sk_<id>` | Bad sketch source | Copy `generated:sk_…` from `generate_sketch` |
| `Champ requis` / `N caractères maximum` | Missing/over-long required string | Fill or shorten that path |
| `Couleur au format #RRGGBB` | Not `#` + 6 hex | Fix the color |
| `Taille minimale : 5 %` / `Taille maximale : 70 %` / `Taille entière en %` | Bad `sizePct` | Integer 5–70 |
| `Zone de texte : 12 % minimum` / `30 % maximum` | Bad `heightPct` | Integer 12–30 |
| `Variante X en double` | Two variants with the same key | One A, one B, one C |
| `Conversation introuvable` (`fiche`) | Conversation gone / deleted | Stop. Do not retry |
| Schema reject on `step: 8` | Leftover out of 1–7 | **Omit `step`** |

Patch input is shape-only; the brief schema is what you must satisfy **after** merge. A new variant with only `direction` fails on `title`, `thumbnailText`, etc.

## Warnings

Saved **anyway**. Prefix: `Avertissements (reformule une fois, puis continue)`. Rephrase **once**, then continue. Do not loop.

Emitted only if this call touched a variant, `abStrategy`, or `abVariable`.

| Theme | Exact shape | Do |
|---|---|---|
| Thumb text repeats the title | `Variante A : le texte « FIGMA DESIGN » répète le titre (figma, design). Reformule-le pour qu'il complète le titre.` | New `thumbnailText` that adds what the title leaves unsaid. Overlap ignores stop words; entity and logo names do not count. **>1** shared content word warns |
| Concepts too close | `Variantes A et B : même mise en page et même sujet focal. Choisis des concepts vraiment différents.` | Change `layout` and/or `focal` so the concepts diverge |
| Single-variable leaked | `Variante B : diffère de A sur le fond, alors que le test ne change que le texte.` | Align the extra fields with A, or change `abVariable` / strategy. Extra labels: le texte, la mise en page, la note de mise en page, le sujet focal, les éléments, la zone de texte, le fond, l'émotion, la palette |

## Chains

1. `read_skill thumbnail-packaging` if the promise / packages are still fuzzy. Ask only what you lack (`ask_user` alone in its step).
2. `update_brief` with `video` (promise, subject, audience) when that is known.
3. Propose 1–3 packages → they keep some → `update_brief` `variant` per key (and `abStrategy` / `abVariable` if A/B). Omit `step`.
4. Face: `list_personas` → optional `ask_user` → `common.persona` (`stored:persona_<id>` or `"none"`). Emotion only with a character.
5. Logos: `list_logos` / `find_logos` → `add_logo` → `logos` only if the array still needs a replace. Refs: `import_youtube_thumbnail` / `list_swipe_files` → `references` (whole list, ≤3).
6. Optional `research_topic` / `find_competitor_thumbnails` → `analyze_thumbnails`. Do not re-write those blobs unless correcting.
7. Composition card on the kept variant (exactly one hero, ≤3 elements, sizes ≤110%, text zone off the hero cell). Then optional `generate_sketch` → `set.sketch` `{ source, status: "pending" }`.
8. Canvas: `place_node` (one `iv-*`) or `apply_workflow` (A/B graph). `finish_turn` last, alone. Paid generation = their click on « Générer ».

Existing canvas: `existing-workflow` first. Still write the Fiche when a decision is worth keeping; do not rebuild the graph to "sync" it.

`ask_user` → (resume) `update_brief` → `finish_turn`. Never `update_brief` in the same step as `ask_user` or `finish_turn`.

## Example

They confirmed: promise « Savoir choisir un outil d'IA », package A title « J'ai remplacé Figma par Claude pendant 7 jours », thumb text « ADIEU ? », Personnage `stored:persona_a1b2`, logo `stored:lg_claude` already on the Fiche from `add_logo`.

```json
{
  "video": { "promise": "Savoir choisir un outil d'IA", "subject": "Claude vs Figma pour le design" },
  "common": { "persona": "stored:persona_a1b2", "textMode": "rendered" },
  "abStrategy": "concepts",
  "variant": {
    "key": "A",
    "set": {
      "direction": "Adieu à l'ancien outil",
      "title": "J'ai remplacé Figma par Claude pendant 7 jours",
      "thumbnailText": "ADIEU ?",
      "visualIdea": "Visage à droite, logo Claude en main, Figma fêlé derrière.",
      "titleRole": "Raconte l'expérience",
      "thumbRole": "Pose la question que le titre n'écrit pas",
      "composition": {
        "layout": "face-right_object-left",
        "focal": "Visage sceptique",
        "elements": [
          { "what": "Visage sceptique", "role": "hero", "sizePct": 45, "position": "right" },
          { "what": "Logo Claude", "role": "support", "sizePct": 14, "position": "center" },
          { "what": "Logo Figma fêlé", "role": "support", "sizePct": 18, "position": "left" }
        ],
        "textZone": { "position": "top-left", "heightPct": 18 },
        "background": { "kind": "scene", "color": "#0F172A" },
        "emotion": { "label": "curiosité", "intensity": 2, "mouth": "closed" },
        "palette": { "dominant": "#0F172A", "accent": "#D97706", "highlight": "#FFFFFF" }
      }
    }
  }
}
```

No `step`. Hero is not on `top-left`. Sizes 45+14+18 = 77 ≤ 110. Three elements, one hero. Text is 2 words / 7 chars and shares no content word with the title.

After `generate_sketch` returns `generated:sk_abc123`:

```json
{
  "variant": {
    "key": "A",
    "set": { "sketch": { "source": "generated:sk_abc123", "status": "pending", "autoFixed": false } }
  }
}
```

If the first call comes back `Texte de miniature : 4 mots maximum`, shorten `thumbnailText` and retry **once**. If it warns that the text repeats the title, change the words once, then continue to canvas / `finish_turn`.
