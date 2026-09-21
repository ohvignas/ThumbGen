export const ETIQUETTES = ["Propositions", "Pas commencer", "En cours", "En prod", "Terminer"] as const;
export type Etiquette = (typeof ETIQUETTES)[number];

export function isEtiquette(value: string): value is Etiquette {
  return (ETIQUETTES as readonly string[]).includes(value);
}

export const WRITING_PROJECT_PREFIX = "studio:";
export const STUDIO_VIDEO_ID_PREFIX = "vid_";
export const UNTITLED_STUDIO_VIDEO = "Sans titre";

export function newStudioVideoId(): string {
  return `${STUDIO_VIDEO_ID_PREFIX}${crypto.randomUUID().replace(/-/g, "")}`;
}

export type TitleVariant = {
  title: string;
  thumbText: string;
  visualConcept: string;
};

export type StudioDraft = {
  script: string;
  description: string;
  titleVariants: [TitleVariant, TitleVariant, TitleVariant];
};

export type StudioVideo = {
  videoId: string;
  title: string;
  summary: string;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  etiquette: Etiquette | null;
  createdAt: string;
  updatedAt: string;
  draft: StudioDraft;
};

export type CorpusHit = {
  source: "studio" | "channel";
  videoId?: string;
  youtubeVideoId?: string;
  title: string;
  snippet: string;
  kind: "script" | "description" | "transcript" | "title";
};

export function writingProjectId(videoId: string): string {
  return `${WRITING_PROJECT_PREFIX}${videoId}`;
}

export function isWritingProjectId(projectId: string): boolean {
  return projectId.startsWith(WRITING_PROJECT_PREFIX);
}

export function videoIdFromWritingProject(projectId: string): string | null {
  if (!isWritingProjectId(projectId)) return null;
  return projectId.slice(WRITING_PROJECT_PREFIX.length);
}
