---
name: ask_user
description: Asks the user one clickable chat-card question (0-12 text options with a full label plus one-line description, always Autre, optional Passer) and pauses until they pick, type, or skip. Never photos or persona/logo tiles. Use when a real choice or a free question is still needed. Omit leftover step — there is no numbered interview. Never the same model step as place_node or finish_turn; not for file uploads (request_user_image) or facts already known.
---

# ask_user

Client tool (no `execute`). The chat renders `AskUserCard` and the turn **pauses** until the user answers. You receive `{ selected }`, `{ other }` or `{ skipped }` — you never invent that payload.

Call it **alone in its model step**. Never with `place_node` or `finish_turn` (the turn resumes after the answer; finish then). Before the call, at most one short sentence (or nothing).

There is **no** numbered thumbnail pipeline. Do **not** mention « Étape n/7 », « question 3/7 », or a leftover journey counter. Do not send `step`. The card ignores a leftover `step` if one is present.

## When

- A short **choice** is faster than typing: packages to keep, which Personnage, which logos, which refs, which sketch to keep.
- A **free question** (`options: []`): they type in the card (« Ta réponse… »), not in the composer.
- After `list_personas` / `list_logos` / `list_swipe_files` / `find_logos` / `search_youtube` / `list_followed_videos` / `generate_sketch`, when they must pick among those refs — name them in the label, do not attach their photo.

## When not

- You can already deduce it (clear promise, brand colors in `<channel_profile>`, a single obvious logo).
- Same model step as `place_node` or `finish_turn`.
- They must **upload a file** → `request_user_image` (picker / library). Faces of the creator are Personnages only (`list_personas`), never a one-off photo.
- A long script or pasted brief — that is a normal message, not this card.
- Do not run a 7-question interview. Ask only what you still lack.

## How

### Input (you send)

| Field | Required | Rules |
| --- | --- | --- |
| `question` | yes | Trimmed, 1–200 characters. The card title. |
| `step` | **OMIT** | Leftover 1–7 integer, not in the tool schema. Do not send it. The card never shows « Étape n/7 ». |
| `options` | yes (array) | **0–12** items. `[]` = free question. The stale tool blurb that says « 1 to 6 » is wrong — follow 0–12. |
| `multiple` | no | Default `false`. `true` lets them pick several, then « Valider ». Forbidden when `options` is empty. |
| `max_selected` | no | Only with `multiple: true`. Integer **1–5**. Omit to use `min(5, options.length)`. Sending it when `multiple` is false is refused. |
| `allow_skip` | no | Default `true` → « Passer ». Set `false` when they really must answer (typical for a free question about the video). |

Each option is a **short clear French sentence**, not an image chip:

| Field | Required | Rules |
| --- | --- | --- |
| `id` | yes | Trimmed, 1–40 characters, **unique** in the list. This is what comes back in `selected`. Use the stable source id (persona id, `stored:lg_` id, `lc_…` candidate id, YouTube videoId) — not the label. |
| `label` | yes | Trimmed, 1–60 characters. The full readable title — a complete phrase they can understand without a photo. Not a truncated chip (« Texte : 'C'EST FI… »). |
| `description` | yes when the label needs context | Trimmed, max 140 characters. One full line under the label: what changes if they pick this. |
| `image` / `image_url` | **OMIT** | The card is **text only**. Photos, `image`, `image_url`, persona, logo, canvas, YouTube and sketch refs are **ignored**. Never decorate a choice with a character photo, a logo, a broken tile, or a canvas thumbnail. |

### Write the options (not the pictures)

The card shows the **question**, then one row per option: **full label** + **one-line description**. No thumbnails. More than 6 options → two text columns.

- Conceptual choices (A/B variable, package, emotion, text vs visuel): name the variable in the label, say what would change in the description. Do **not** attach the current thumb, the Personnage, or a logo to “illustrate” it — those pictures make the question unreadable.
- Picking a Personnage / logo / vidéo / esquisse: `label` = the human name, `description` = one cue (source, rôle). Still **no** `image`.
- French, same language as the question. One idea per option.

### Card (what they see)

- **Question** always visible at the top (never hide it).
- **0 options:** only the text field, placeholder « Ta réponse… », plus « Envoyer ». No option buttons.
- **1+ options:** text rows (full label + description), plus a field placeholder « Autre… » (always). « Envoyer » stays disabled until the field is non-blank (max 300 characters). No photos.
- **Single** (`multiple` false): one click on an option answers immediately `{ selected: [that id] }`. No « Valider ».
- **Multiple:** toggles, helper « Jusqu'à N choix ». Extra options disable once N are on. « Valider » stays disabled until at least one pick. Submit sends `{ selected }` in **options-array order**, not click order.
- **« Passer »:** only if `allow_skip` is true (the default). Sends `{ skipped: true }`.
- The card answers **once**, then locks. The composer is still usable — a new user message abandons the question (see Output).

Folded history (not your job to write): `« <question> : <labels> »`, `« Autre : … »`, `« Passé »`, or `« sans réponse »`. Chat step label: « Te pose une question ».

### Output (you receive)

Exactly one of:

```json
{ "selected": ["id", "id"] }
{ "other": "typed text" }
{ "skipped": true }
{ "skipped": true, "reason": "abandoned" }
```

- `{ selected }` — clicked option ids. Single click → one id. Multiple + « Valider » → 1–`max_selected` ids, in the order you listed the options. Unknown ids are still returned as-is (use your own ids).
- `{ other }` — « Autre » / free field, trimmed. With **no** options this **is** the answer (folded without an « Autre : » prefix). With options it means they refused every row and typed instead.
- `{ skipped: true }` — they clicked « Passer ».
- `{ skipped: true, reason: "abandoned" }` — they sent a **composer message** instead of answering. Treat as « sans réponse »: read that message; do not wait on the card. Do not re-ask the same question unless it is still needed.

Persisted history may wrap the same object as `{ type: "json", value: { … } }`. Read the inner object.

## Errors

No server `execute`. Failures are schema / card parse:

- Duplicate `options[].id` → `Duplicate option id: <id>`.
- `multiple: true` with `options: []` → `multiple requires at least one option`.
- `max_selected` without `multiple: true` → `max_selected requires multiple: true`.
- Limits: `question` 1–200; `options` ≤ 12; `id` 1–40; `label` 1–60; `description` ≤ 140; `max_selected` 1–5.
- Sending leftover `step` 8 (old F2 last question) is refused for new calls. Do not send `step` at all.
- If the card cannot parse the input → « Question illisible » and « Passer » (`{ skipped: true }`). Fix the input and ask again only if you still need the answer.
- `image` / `image_url` on an option is silent (the card never shows it), not a tool error.

## Chains

Typical: list/find/sketch in an **earlier** step of the turn → `ask_user` **alone** in the next step → turn pauses.

After the answer, in **later** steps of the resumed turn:

1. `{ selected }` from logo-candidate **text** options → `add_logo` with each `candidate_id` (the option id) → you get `stored:lg_<id>`. One obvious `find_logos` hit: skip the question, `add_logo` directly.
2. `{ selected }` Personnage → `stored:persona_<id>` on `face_source` / `iv-persona`. Include an « Aucun » option (`id: "none"`) when a face is optional.
3. `{ selected }` sketches → keep those `generated:sk_<id>` (ids, not pictures on the card). `{ other }` / skip → listen and continue without forcing a pick.
4. End the resumed turn with `finish_turn` **once, alone** (summary; `next_actions` if useful). Never `finish_turn` in the same step as this tool. Do not write a Fiche.

Do not `place_node` / `apply_workflow` in the same step as `ask_user`. Do not start a paid generation; « Générer » is the user's click on `finish_turn` kind `generate`.

## Example

Conceptual A/B (never decorate with the current thumb, the Personnage, or a logo):

```json
{
  "question": "La miniature actuelle a une superbe énergie. Quelle variable veux-tu tester en priorité pour ta variante B ?",
  "options": [
    { "id": "text", "label": "Le texte de la miniature", "description": "Remplacer « C'EST FINI » par un autre hook, garder le reste." },
    { "id": "emotion", "label": "L'émotion du regard", "description": "Changer l'expression du personnage, garder texte et composition." },
    { "id": "visual", "label": "Le sujet visuel", "description": "Remplacer le visuel (Pierre / mascotte), garder texte et émotion." }
  ]
}
```

User named Claude and Notion; `find_logos` returned two non-obvious hits each. Ask which to keep (skip allowed). **Omit `step`. No `image`.**

```json
{
  "question": "Quels logos garder ?",
  "multiple": true,
  "max_selected": 3,
  "allow_skip": true,
  "options": [
    { "id": "lc_aaa111", "label": "Logo Claude", "description": "Simple Icons — à garder sur la miniature." },
    { "id": "lc_bbb222", "label": "Logo Anthropic", "description": "SVGL — variante du même outil." },
    { "id": "lc_ccc333", "label": "Logo Notion", "description": "Simple Icons — à garder sur la miniature." },
    { "id": "lc_ddd444", "label": "Logo Notion Calendar", "description": "Wikimedia — seulement si tu parles de l'agenda." }
  ]
}
```

They toggle Claude + Notion, then « Valider » → `{ "selected": ["lc_aaa111", "lc_ccc333"] }` (option order). Next steps: `add_logo` twice, then `finish_turn` alone.

Free question (must answer — no Passer):

```json
{
  "question": "De quoi parle la vidéo, et qu'est-ce que le spectateur saura faire à la fin ?",
  "options": [],
  "allow_skip": false
}
```

They type in « Ta réponse… » → `{ "other": "…" }`.
