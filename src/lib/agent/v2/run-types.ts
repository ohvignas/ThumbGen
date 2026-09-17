/**
 * Agent runs (chantier F1): types shared by the server registry and the
 * client (chat, indicators, toasts). No import here, so client code can use it.
 */

export type RunStatus = "running" | "done" | "error" | "stopped";
export type EndedRunStatus = Exclude<RunStatus, "running">;

/** What an ended run asks of the user elsewhere in the app. */
export type AttentionKind = "finished" | "error" | "question";

export type RunSummary = {
  conversationId: string;
  projectId: string;
  /** Epoch milliseconds. */
  startedAt: number;
  status: RunStatus;
  endedAt: number | null;
  /** The run paused on request_user_image / request_user_sketch. */
  pendingClientRequest: boolean;
};

export type RunningEntry = { conversationId: string; projectId: string; projectName: string; startedAt: number };
export type AttentionEntry = {
  conversationId: string;
  projectId: string;
  projectName: string;
  kind: AttentionKind;
  endedAt: number;
};

/** Body of GET /api/agent/runs. */
export type AgentRunsSnapshot = { running: RunningEntry[]; attention: AttentionEntry[] };

/** Plain-text body of the 409 answered while a turn already runs in the conversation. */
export const AGENT_BUSY_MESSAGE = "L'agent travaille déjà ici";
