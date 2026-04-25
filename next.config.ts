import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // NOTE: Next.js 16 default middleware/proxy client body limit is 10MB. Our
  // /api/chat-uploads route caps at 5MB and /api/agent/transcribe at 25MB.
  // The transcribe ceiling could be hit by long voice notes — if so we'll
  // need to revisit (the option key changed name across Next versions and
  // isn't recognized in 16; leaving the 10MB platform default for now).
};

export default nextConfig;
