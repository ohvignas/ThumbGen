// src/lib/agent/tools/all.ts
// Import side-effects only — each module calls registerTool() on load.
// Import this from anywhere that needs the full registry populated (MCP server, tests).
import "./list-logos";
import "./list-face-reactions";
import "./list-swipe-files";
import "./list-projects";
import "./list-past-generations";
import "./get-canvas-state";
import "./apply-workflow";
import "./generate-sketch";
import "./extract-youtube-script";
import "./search-youtube";
import "./search-youtube-channel";
import "./get-channel-videos";
import "./import-youtube-thumbnail";
