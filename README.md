# ThumbGen

An open-source, node-based YouTube thumbnail generator built on an infinite canvas. Connect face references, style references, and text prompts to AI models (Google Gemini and Ideogram v3) to generate thumbnails.

## Demo

![ThumbGen Demo](demo.gif)

## How It Works

ThumbGen uses a visual node editor where you wire together inputs and AI models:

1. **Face Reference** - Upload a photo of the person who should appear in the thumbnail
2. **Swipe File / Reference Thumbnail** - Upload or import a thumbnail whose style/composition you want to match
3. **Text Prompt** - Optionally describe customizations (change text, colors, background, etc.)
4. **Generator** - Pick Nano Banana (Gemini) or Ideogram v3, connect your inputs, and hit Run

The system automatically constructs the right prompts and API calls. When both a face and reference thumbnail are connected, it tells the AI: "Recreate this thumbnail's style but with this person's face." No prompt engineering needed.

### Node Types

| Node | Purpose |
|------|---------|
| **Face Reference** | Upload a face photo. Connected to a generator's "Face" input. |
| **Swipe File** | Upload or import a reference thumbnail. Connected to "Reference" input. |
| **Prompt** | Write a text prompt and/or negative prompt. Connected to "Prompt" input. |
| **Generator** | Runs the AI model. Has three input handles (Prompt, Face, Reference) and one output (Result). |
| **Preview** | Displays the generated thumbnail. Download or iterate. |

### Workflow Example

```
[Face Photo] ----\
                  \
[Reference Thumb] --> [Generator (Nano Banana)] --> [Preview] --> Download
                  /
[Text Prompt] ---/
```

## Features

- Infinite canvas with pan, zoom, snap-to-grid
- Drag-and-drop or click-to-add node creation
- Edge-drop menu: drag from a handle to empty space to create a connected node
- Swipe file panel: import thumbnails from Notion or YouTube playlists
- Two AI models: Google Gemini (Nano Banana Pro 2) and Ideogram v3
- Undo/redo with Cmd+Z / Cmd+Shift+Z
- Right-click context menu for quick node creation
- Auto-save to Cloudflare D1 (optional)
- Image storage via Cloudflare R2 (optional)
- Simple password gate (optional)

## Getting Started

### Prerequisites

- Node.js 18+
- A Google Gemini API key and/or an Ideogram API key

### Setup

```bash
# Clone the repo
git clone https://github.com/pat-pivot/thumbgen.git
cd thumbgen

# Install dependencies
npm install

# Copy the example env and add your API keys
cp .env.example .env.local

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

See `.env.example` for all available configuration. Only `GEMINI_API_KEY` or `IDEOGRAM_API_KEY` is required to start generating.

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes* | Google Gemini API key ([get one](https://aistudio.google.com/apikey)) |
| `IDEOGRAM_API_KEY` | Yes* | Ideogram v3 API key ([get one](https://ideogram.ai/manage-api)) |
| `NOTION_API_KEY` | No | Import swipe files from Notion |
| `YOUTUBE_API_KEY` | No | Import thumbnails from a YouTube playlist |
| `SITE_PASSWORD` | No | Simple auth gate |
| `R2_*` | No | Cloudflare R2 for persistent image storage |
| `D1_DATABASE_ID` | No | Cloudflare D1 for persistent project storage |

*At least one model API key is required.

### Deploy to Cloudflare

```bash
# Build and deploy
npm run deploy
```

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to be authenticated. Environment variables should be set as secrets in your Cloudflare dashboard.

## Tech Stack

- **Next.js 16** (App Router)
- **React 19**
- **@xyflow/react** - Infinite canvas / node editor
- **Zustand** - State management
- **Tailwind CSS v4** - Styling
- **OpenNextJS + Cloudflare Workers** - Deployment
- **Cloudflare R2** - Image storage (optional)
- **Cloudflare D1** - Project persistence (optional)

## Conversational Agent + MCP server

ThumbGen ships with a built-in chat panel (✨ icon in the sidebar) powered by Claude Sonnet 4.6. The agent can read your canvas, build/modify the workflow, search the web, query your YouTube channel, generate quick draft sketches, and trigger the full thumbnail generation. All tools are also exposed as an **MCP server**, so you can drive ThumbGen from any external MCP client (Claude Desktop, Claude Code, Cursor, mobile, etc.).

### In-app chat

Click the ✨ icon in the sidebar. Discuss your video idea in natural language — Claude will:
- Ask clarifying questions about the subject, audience, tone
- Browse your stored visual references / face images / logos when relevant
- Search YouTube for context on your channel or competitor thumbnails
- Generate a quick draft sketch for visual validation
- Build the workflow on your canvas (creates and connects the right nodes)
- Ask explicit confirmation before triggering the final paid generation

You can attach images, paste from your library, or record a voice note (transcribed by Whisper).

Conversations are persisted per project — open the panel anytime to continue an old thread or start a new one.

### Connect a remote MCP client

To use ThumbGen's tools from Claude Desktop or any MCP client:

1. **Get your API key.** Open the Settings panel in ThumbGen → "Serveur MCP" section → reveal and copy the bearer token.

2. **Configure your client.** For Claude Desktop, edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS — see Claude docs for other OS) and add:

   ```json
   {
     "mcpServers": {
       "thumbgen": {
         "url": "http://localhost:3000/api/mcp",
         "auth": { "type": "bearer", "token": "tg_xxxxx" }
       }
     }
   }
   ```

   Restart the client. The ThumbGen tools should appear in its tool list.

3. **Remote access (optional).** To use ThumbGen from another device, expose the local server via:
   - **Tailscale** (recommended): `tailscale serve https / http://localhost:3000` — auto HTTPS within your tailnet
   - **ngrok**: `ngrok http 3000` then use the HTTPS URL it prints
   - **Self-hosted**: deploy with proper HTTPS (the bearer token is your auth — HTTPS is mandatory for remote use)

   Then set `THUMBGEN_PUBLIC_HOST=your.host.example.com` in your environment so ThumbGen accepts the new origin (it rejects non-localhost origins by default to prevent DNS rebinding attacks).

### Available tools

The MCP server exposes 11 tools:

| Tool | Purpose |
|------|---------|
| `list_projects` | List all ThumbGen projects |
| `list_logos` / `list_face_reactions` / `list_swipe_files` | Browse stored library by kind |
| `list_past_generations` | Past generations of a project (with `stored:gi_<id>` refs) |
| `get_canvas_state` | Read the current workflow blueprint |
| `apply_workflow` | Replace or modify the canvas — single keystone tool with full validation + diff |
| `generate_sketch` | Quick cheap draft via Gemini Flash Image (~$0.02/sketch) |
| `extract_youtube_script` | Get the transcript of a YouTube video |
| `search_youtube_channel` / `get_channel_videos` | Query a YouTube channel (uses 100 quota units per call) |

The chat-only tool `request_user_image` lets the agent ask for an upload interactively — only available in the in-app chat (skipped for remote MCP clients).

### Environment variables

The chat agent and MCP server need a few extra env vars beyond the standard generation API keys (`GEMINI_API_KEY`, `IDEOGRAM_API_KEY`, `OPENAI_API_KEY`, `GROK_API_KEY`, `YOUTUBE_API_KEY`):

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | The chat agent (Claude Sonnet 4.6). Settable via Settings UI too. |
| `OPENAI_API_KEY` | Whisper transcription (`gpt-4o-mini-transcribe`). Reused if you already have it for OpenAI image gen. |
| `THUMBGEN_PUBLIC_HOST` | Hostname allowed by the MCP server's Origin check for remote use. |
| `THUMBGEN_DB_PATH` | Override the SQLite file location. Used by tests; production defaults to `data/thumbgen.db`. |

The MCP bearer token is auto-generated on first start and stored in the `settings` table — no env var needed.

## Importing a Swipe File from Notion

1. Create a Notion integration at [notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Share your thumbnail database with the integration
3. Add your `NOTION_API_KEY` to `.env.local`
4. The swipe file panel will load your thumbnails automatically

## License

MIT
