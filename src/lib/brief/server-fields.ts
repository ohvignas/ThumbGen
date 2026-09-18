import { getBrief, replaceBrief } from "./store";
import {
  competitionSchema,
  logoCandidateSchema,
  logoSchema,
  researchSchema,
  type BriefCompetition,
  type BriefLogo,
  type BriefResearch,
  type LogoCandidate,
} from "./schema";

export type ServerFieldResult = { ok: true } | { ok: false };

export function setBriefResearch(conversationId: string, research: BriefResearch): ServerFieldResult {
  const parsed = researchSchema.safeParse(research);
  if (!parsed.success) return { ok: false };
  const existing = getBrief(conversationId);
  if (!existing) return { ok: false };
  return replaceBrief(conversationId, { ...existing.brief, research: parsed.data }) ? { ok: true } : { ok: false };
}

export function setBriefLogoCandidates(conversationId: string, candidates: LogoCandidate[]): ServerFieldResult {
  const parsed = logoCandidateSchema.array().max(36).safeParse(candidates);
  if (!parsed.success) return { ok: false };
  const existing = getBrief(conversationId);
  if (!existing) return { ok: false };
  return replaceBrief(conversationId, { ...existing.brief, logoCandidates: parsed.data }) ? { ok: true } : { ok: false };
}

export function setBriefCompetition(conversationId: string, competition: BriefCompetition): ServerFieldResult {
  const parsed = competitionSchema.safeParse(competition);
  if (!parsed.success) return { ok: false };
  const existing = getBrief(conversationId);
  if (!existing) return { ok: false };
  return replaceBrief(conversationId, { ...existing.brief, competition: parsed.data }) ? { ok: true } : { ok: false };
}

export function appendBriefLogo(conversationId: string, logo: BriefLogo): ServerFieldResult {
  const parsed = logoSchema.safeParse(logo);
  if (!parsed.success) return { ok: false };
  const existing = getBrief(conversationId);
  if (!existing) return { ok: false };
  if (existing.brief.logos.length >= 3) return { ok: false };
  if (existing.brief.logos.some((entry) => entry.source === parsed.data.source)) {
    return replaceBrief(conversationId, existing.brief) ? { ok: true } : { ok: false };
  }
  return replaceBrief(conversationId, { ...existing.brief, logos: [...existing.brief.logos, parsed.data] }) ? { ok: true } : { ok: false };
}
