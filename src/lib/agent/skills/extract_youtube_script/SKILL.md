---
name: extract_youtube_script
description: Extracts the spoken transcript of one YouTube video from a full http(s) URL (free, no API key). Use when the user pasted a link or picked an existing video so packaging follows the actual script, not the title. Do not pass bare ids, youtube: refs, or /shorts|/live paths; unpublished videos have no captions. Bodies longer than 8000 characters end with …[truncated].
---

# extract_youtube_script

Spoken captions for **one already-published video**, so title + thumbnail text do not promise what the video does not deliver. Chat label: « Lit la transcription YouTube ».

Not a search, not a thumbnail import, not a channel list. Output is text only: no title, description, channel, or thumbnail (an older spec listed those; the tool does not). No `result_id`. No YouTube Data API key, no quota, no OpenRouter. No database write.

## When

- The user pasted a YouTube link for **this** video (chat, « Autre », or a normal message).
- They picked an existing video (`youtube:<id>` from `list_followed_videos`, or `[videoId]` from `search_youtube` / `search_youtube_channel` / `get_channel_videos`) and you need the spoken content to write the promise, title, or thumbnail text.
- The title is vague or clickbaity and you would otherwise guess.

## When not

- Video not published yet, no captions, or they already pasted the script — ask what it is about; do not fetch.
- You only need the published thumbnail image → `import_youtube_thumbnail` (`video_id`, 11 chars).
- You only need a list of videos → `list_followed_videos` (local, no quota), `search_youtube` / `search_youtube_channel` / `get_channel_videos` (100 quota units, need a YouTube key).
- Competitor **look** (composition, colors) → `find_competitor_thumbnails` then `analyze_thumbnails`. Do not transcribe a dump of competitor videos unless they asked for that video's **words**.
- Bare 11-char id, `youtube:<id>`, or a URL without `http://` / `https://` — the schema is `z.string().url()` and those fail (except `youtube:<id>`, which Zod accepts and the library then rejects — rewrite it).
- Voice messages in chat are a different path (`transcribeAudio`); this tool is YouTube captions only.
- Do not call it "to have context" on every link you see. One video, when the script changes the packaging.

## How

One field:

| Field | Required | Schema | What to pass |
|---|---|---|---|
| `url` | yes | `z.string().url()` | A full URL with protocol |

**Always rewrite to a watch or youtu.be URL before calling:**

- From `youtube:dQw4w9WgXcQ` or `[dQw4w9WgXcQ]` → `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- From `/shorts/<id>` or `/live/<id>` → the same `watch?v=` form. Those paths pass Zod but `youtube-transcript` cannot extract the 11-char id (`Impossible to retrieve Youtube video ID`).
- Keep `https://youtu.be/<id>`, `/embed/<id>`, `/v/<id>`, `m.youtube.com/watch?v=`, `music.youtube.com/watch?v=`, and extra query (`&t=`, `&list=`) — those resolve.

Bare ids work inside the library (`length === 11`) but **never** reach it: Zod returns `Invalid URL` first.

No language argument. The tool calls `YoutubeTranscript.fetchTranscript(url)` with no config, so it takes the **first caption track** (InnerTube Android client, then the watch page). You cannot request `fr` vs `en`.

Captions are joined with a **single space**. Offsets and durations are dropped.

**Success (text, not an error):**

```
Transcript (N segments, M chars):

<body>
```

- `N` = caption cues. `M` = full joined length **before** slicing (so `M` can be > 8000 while the body you see is not).
- Body = `text.slice(0, 8000)`.
- If `M > 8000`, the tool appends a newline then the exact marker `…[truncated]` (Unicode ellipsis U+2026, not `...`). Equality at 8000 is not truncated.
- Empty captions: success with `Transcript (0 segments, 0 chars):` and an empty body — not an error. Ask the user what the video is about.
- No images. `appendResultId` skips this tool. Leave `finish_turn.results` empty unless another visual tool ran.

Also on MCP (not `chatOnly`). MCP schema failures never hit the handler: `Invalid arguments: <zod format JSON>`.

## Errors

Handler catch, `isError: true`, model sees `error-text`:

`Failed to extract transcript: <Error.message>`

Library errors are `YoutubeTranscriptError` subclasses; `.message` is already wrapped as `[YoutubeTranscript] 🚨 <reason>`. Typical reasons:

| Reason (after the 🚨) | Meaning | What you do |
|---|---|---|
| `Impossible to retrieve Youtube video ID.` | URL did not match watch / youtu.be / embed / `/v/`, or `youtube:<id>` was passed raw | Rewrite to `https://www.youtube.com/watch?v=<11-char-id>` and retry **once** |
| `Transcript is disabled on this video (<id>)` | Captions off | Do not retry. Ask what the video is about |
| `No transcripts are available for this video (<id>)` | No tracks | Same |
| `The video is no longer available (<id>)` | Private, deleted, or page had no playability JSON | Same |
| `YouTube is receiving too many requests from this IP and now requires solving a captcha to continue` | Rate limit / captcha | Stop calling this tool this turn; ask the user |

Other thrown messages are prefixed the same way (`Failed to extract transcript: Could not fetch` in tests).

**Do not invent a transcript.** Do not fall back to a paid API. Do not loop. One rewrite retry for a bad URL shape; then ask.

## Chains

1. **URL or picked video** → rewrite to `watch?v=` → `extract_youtube_script`.
2. Distill **subject** (≤300) and a result-oriented **promise** (≤90). Thumbnail text must not promise what this script does not deliver.
3. Distill subject + promise from the spoken **body only** (never the `Transcript (N segments…)` header, never the `…[truncated]` line). If you saw the marker, the body is already 8000 chars. Keep that in this conversation — do not write a Fiche.
4. Same video as a visual reference (max 3 refs): `import_youtube_thumbnail` with the 11-char `video_id`, then swipeFile `kind=reference` `stored:sf_<id>`. That is a different tool; this one does not import images.
5. `research_topic` only if brands/tools are still unclear after the script (paid, max 2 / conversation). Skip if the transcript was enough.
6. Continue `thumbnail-packaging` (packages, then canvas). `finish_turn` last, alone: 1–2 sentences in the reply language about what the video is actually about — **do not paste the transcript**. `results` empty for this tool. `next_actions` can offer to propose packages.

Never the same step as `ask_user` or `finish_turn` when those pause or close the turn. No Étape n/7.

## Example

User: `miniature pour https://youtu.be/dQw4w9WgXcQ`

You: `extract_youtube_script` `{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }`

Tool: `Transcript (214 segments, 9120 chars):\n\nWe're going to break down …\n…[truncated]`

You: `finish_turn` `{ "summary": "La vidéo explique … — je m'appuie sur le script, pas seulement le titre.", "results": [], "next_actions": [] }`
