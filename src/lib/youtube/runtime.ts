/**
 * In-process state for followed-channel background work.
 *
 * ThumbGen runs as one long-lived Node process (Docker, Next standalone
 * server). Plain module state is not guaranteed to be shared across route
 * bundles and is lost on dev hot reload, so — like src/lib/db.ts and
 * src/lib/data-admin.ts — everything lives on globalThis. Anything that must
 * survive a restart (backfill position, classification approvals/attempts)
 * is stored in SQLite instead.
 */

export type ChannelRuntime = {
  /** Channels with a sync in progress (one at a time per channel, across tabs). */
  locks: Set<string>;
  /** Background sync promises by channel id. */
  running: Map<string, Promise<void>>;
  /** Channels waiting for the one-after-the-other stale sync. */
  staleQueue: string[];
  staleDrain: Promise<void> | null;
  /** Last automatic trigger (ms since epoch), for the 10-minute throttle. */
  lastStaleTriggerAt: number;
  /** YouTube quota exhausted until this instant (ms since epoch). */
  quotaBlockedUntil: number;
  classification: Promise<void> | null;
  classificationRequested: boolean;
  /** « Ma chaîne » setting value last resolved, and the channel it points to. */
  myChannel: { input: string; youtubeChannelId: string | null } | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __thumbgen_channel_runtime: ChannelRuntime | undefined;
}

function createRuntime(): ChannelRuntime {
  return {
    locks: new Set(),
    running: new Map(),
    staleQueue: [],
    staleDrain: null,
    lastStaleTriggerAt: 0,
    quotaBlockedUntil: 0,
    classification: null,
    classificationRequested: false,
    myChannel: null,
  };
}

export function channelRuntime(): ChannelRuntime {
  if (!globalThis.__thumbgen_channel_runtime) globalThis.__thumbgen_channel_runtime = createRuntime();
  return globalThis.__thumbgen_channel_runtime;
}

/** Tests only: forget locks, queues, throttles and caches. */
export function resetChannelRuntime(): void {
  globalThis.__thumbgen_channel_runtime = createRuntime();
}

export function acquireChannelLock(channelId: string): boolean {
  const { locks } = channelRuntime();
  if (locks.has(channelId)) return false;
  locks.add(channelId);
  return true;
}

export function releaseChannelLock(channelId: string): void {
  channelRuntime().locks.delete(channelId);
}

export function isChannelLocked(channelId: string): boolean {
  return channelRuntime().locks.has(channelId);
}

/**
 * YouTube quotas reset at midnight Pacific Time: 08:00 UTC in winter, 07:00
 * UTC in summer. Waiting until 08:00 UTC is right in winter and one hour late
 * in summer.
 */
export function nextQuotaReset(now: Date): Date {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0));
  if (reset.getTime() <= now.getTime()) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}

export function markQuotaBlocked(now: Date): void {
  channelRuntime().quotaBlockedUntil = nextQuotaReset(now).getTime();
}

export function isQuotaBlocked(now: Date): boolean {
  return now.getTime() < channelRuntime().quotaBlockedUntil;
}
