export type YoutubeIngestPublic = {
  status: "idle" | "running" | "error";
  step: string | null;
  error: string | null;
  videosTotal: number;
  videosDone: number;
  transcriptsDone: number;
  transcriptsFailed: number;
  analysisDone: boolean;
  lastIngestAt: string | null;
};

export type YoutubeKnowledgePublic = {
  generatedAt: string;
  documentMd: string;
  videoCount: number;
  transcriptCount: number;
};

export type YoutubeConnectionPublic = {
  oauthConfigured: boolean;
  canIngest: boolean;
  connected: boolean;
  channelTitle: string | null;
  channelHandle: string | null;
  channelYoutubeId: string | null;
  connectedAt: string | null;
  ingest: YoutubeIngestPublic;
  knowledge: YoutubeKnowledgePublic | null;
};
