import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Parent repo lockfile would otherwise make `next dev` compile F3a, not this worktree.
  outputFileTracingRoot: path.join(__dirname),
  // @resvg/resvg-js (library logos, SVG → PNG) loads a platform-specific native
  // binary with a runtime require(): it must not be bundled. Next only knows
  // sharp, better-sqlite3, … by default.
  serverExternalPackages: ["@resvg/resvg-js"],
  // NOTE: Next.js 16 default middleware/proxy client body limit is 10MB. Our
  // /api/chat-uploads route caps at 5MB and /api/agent/transcribe at 25MB.
  // The transcribe ceiling could be hit by long voice notes — if so we'll
  // need to revisit (the option key changed name across Next versions and
  // isn't recognized in 16; leaving the 10MB platform default for now).
};

export default nextConfig;
