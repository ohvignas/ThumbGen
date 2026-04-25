import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Default Next.js middleware client body limit is 10MB; bump to 30MB so our
  // /api/chat-uploads (5MB cap) and /api/agent/transcribe (25MB cap) routes
  // can validate the size themselves and return clean 400s instead of being
  // killed by the platform with a 500.
  middlewareClientMaxBodySize: "30mb",
};

export default nextConfig;
