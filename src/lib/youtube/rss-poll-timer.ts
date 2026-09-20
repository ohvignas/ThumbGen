import { queueSnapshotPoll, RSS_POLL_THROTTLE_MS } from "./jobs";

/**
 * In-process RSS + young-video snapshot timer.
 *
 * Compose runs a long-lived `node server.js` (`restart: unless-stopped`).
 * Keep that container up — there is no cron. The interval dies only if the
 * Node process exits.
 */

export function startRssPollTimer(options?: {
  intervalMs?: number;
  now?: () => Date;
  poll?: (opts: { now: Date }) => void;
  kickImmediately?: boolean;
}): { started: boolean } {
  if (process.env.NEXT_PHASE === "phase-production-build") return { started: false };
  if (globalThis.__thumbgen_rss_poll_timer) return { started: false };

  const intervalMs = options?.intervalMs ?? RSS_POLL_THROTTLE_MS;
  const clock = options?.now ?? (() => new Date());
  const poll = options?.poll ?? ((opts) => {
    queueSnapshotPoll(opts);
  });

  const tick = () => {
    try {
      poll({ now: clock() });
    } catch (err) {
      console.error("[channels] RSS poll timer:", err instanceof Error ? err.message : err);
    }
  };

  if (options?.kickImmediately !== false) tick();

  const handle = setInterval(tick, intervalMs);
  if (typeof handle.unref === "function") handle.unref();
  globalThis.__thumbgen_rss_poll_timer = handle;
  if (!options?.poll) {
    console.info("[channels] RSS/snapshot poller every 15 min — keep the container up");
  }
  return { started: true };
}

export function stopRssPollTimer(): void {
  if (!globalThis.__thumbgen_rss_poll_timer) return;
  clearInterval(globalThis.__thumbgen_rss_poll_timer);
  globalThis.__thumbgen_rss_poll_timer = undefined;
}
