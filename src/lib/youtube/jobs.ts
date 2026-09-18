import { getTypedSettings } from "@/lib/settings";
import * as store from "./channel-store";
import { buildClassificationStatus, runClassificationQueue } from "./classify";
import { getOauth } from "./oauth-store";
import { channelRuntime, isChannelLocked, isQuotaBlocked } from "./runtime";
import { syncChannel } from "./sync";
import { getValidAccessToken } from "./tokens";
import type { ClassificationStatus } from "./types";

/**
 * Fire-and-forget background work started by route handlers. Promises live on
 * the globalThis runtime (see runtime.ts) so later requests can observe them.
 */

export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
export const STALE_TRIGGER_THROTTLE_MS = 10 * 60 * 1000;

function logFailure(what: string, err: unknown) {
  console.error(`[channels] ${what}:`, err instanceof Error ? err.message : err);
}

export function kickClassification(): void {
  const runtime = channelRuntime();
  runtime.classificationRequested = true;
  if (runtime.classification) return;
  runtime.classification = (async () => {
    while (runtime.classificationRequested) {
      runtime.classificationRequested = false;
      await runClassificationQueue();
    }
  })()
    .catch((err) => logFailure("classification failed", err))
    .finally(() => {
      runtime.classification = null;
      if (runtime.classificationRequested) kickClassification();
    });
}

async function accessTokenFor(channelId: string): Promise<string | null> {
  const channel = store.getChannel(channelId);
  if (channel?.is_mine !== 1) return null;
  try {
    return await getValidAccessToken();
  } catch (err) {
    logFailure("oauth refresh", err);
    return null;
  }
}

function runSync(channelId: string): Promise<void> {
  const runtime = channelRuntime();
  store.setSyncState(channelId, { status: "syncing", error: null });
  const job: Promise<void> = accessTokenFor(channelId)
    .then((token) => syncChannel(channelId, () => new Date(), token))
    .then((outcome) => {
      if (outcome.status === "quota" || isQuotaBlocked(new Date())) runtime.staleQueue.length = 0;
    })
    .catch((err) => logFailure(`sync ${channelId} failed`, err))
    .finally(() => {
      if (runtime.running.get(channelId) === job) runtime.running.delete(channelId);
      // Whatever the outcome: rows are imported page by page, and the worker never approves while a lock is
      // held, so thumbnails another sync added meanwhile must be re-evaluated once this one lets go.
      kickClassification();
    });
  runtime.running.set(channelId, job);
  return job;
}

/** Starts a background sync; false when this channel is already syncing. */
export function startChannelSync(channelId: string): boolean {
  if (isChannelLocked(channelId) || channelRuntime().running.has(channelId)) return false;
  void runSync(channelId);
  return true;
}

function drainQueue(): void {
  const runtime = channelRuntime();
  if (runtime.staleDrain) return;
  runtime.staleDrain = (async () => {
    while (runtime.staleQueue.length > 0) {
      const channelId = runtime.staleQueue.shift() as string;
      if (isChannelLocked(channelId) || !store.channelExists(channelId)) continue;
      await runSync(channelId);
    }
  })()
    .catch((err) => logFailure("stale sync queue failed", err))
    .finally(() => {
      runtime.staleDrain = null;
    });
}

/**
 * App-open trigger: queues channels last synced more than 12 hours ago
 * (throttled to once per 10 minutes, skipped while the quota is exhausted).
 * `all` (« Tout actualiser ») queues every channel. Syncs run one after the other.
 */
export function queueChannelSyncs(options: { all?: boolean; now?: Date } = {}): { queued: number; throttled: boolean } {
  const runtime = channelRuntime();
  const now = options.now ?? new Date();
  if (!getTypedSettings().youtubeApiKey && !getOauth()) return { queued: 0, throttled: false };
  if (!options.all) {
    if (now.getTime() - runtime.lastStaleTriggerAt < STALE_TRIGGER_THROTTLE_MS || isQuotaBlocked(now)) {
      return { queued: 0, throttled: true };
    }
    runtime.lastStaleTriggerAt = now.getTime();
  }
  const candidates = options.all
    ? store.allChannelIds()
    : store.staleChannelIds(new Date(now.getTime() - STALE_AFTER_MS).toISOString());
  const added = candidates.filter(
    (channelId) =>
      !isChannelLocked(channelId) && !runtime.running.has(channelId) && !runtime.staleQueue.includes(channelId),
  );
  runtime.staleQueue.push(...added);
  if (added.length > 0) drainQueue();
  return { queued: added.length, throttled: false };
}

export function getClassificationStatus(): ClassificationStatus {
  return buildClassificationStatus(channelRuntime().classification !== null);
}

/** « Lancer le classement »: approves every pending thumbnail and starts the worker. */
export function approveClassification(): number {
  const approved = store.approvePendingClassification();
  kickClassification();
  return approved;
}

/** A « syncing » status with no sync behind it (server restarted mid-sync) goes back to idle. */
export function reconcileSyncStatuses(): void {
  const runtime = channelRuntime();
  for (const channelId of store.syncingChannelIds()) {
    if (!isChannelLocked(channelId) && !runtime.running.has(channelId)) {
      store.setSyncState(channelId, { status: "idle", error: null });
    }
  }
}

/** Tests: resolves once no sync, queue or classification is running. */
export async function waitForChannelJobs(): Promise<void> {
  const runtime = channelRuntime();
  for (;;) {
    const pending: Promise<unknown>[] = [...runtime.running.values()];
    if (runtime.staleDrain) pending.push(runtime.staleDrain);
    if (runtime.classification) pending.push(runtime.classification);
    if (runtime.ingest) pending.push(runtime.ingest);
    if (pending.length === 0) return;
    await Promise.allSettled(pending);
  }
}
