/**
 * Next.js server boot hook (standalone `node server.js` in Docker).
 * Starts the followed-channel RSS + young-video snapshot interval so polls
 * keep running while the container is up — even if no tab is open.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.VITEST) return;
  const { startRssPollTimer } = await import("./lib/youtube/rss-poll-timer");
  startRssPollTimer();
}
