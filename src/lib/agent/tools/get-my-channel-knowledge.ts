import { z } from "zod";
import { compactKnowledgeBlock } from "@/lib/youtube/knowledge";
import { getKnowledge, listChannelAnalytics, mineChannelId, parseKnowledgeJson } from "@/lib/youtube/knowledge-store";
import * as store from "@/lib/youtube/channel-store";
import { ToolDefinition } from "./types";
import { registerTool } from "./index";

const InputSchema = z.object({});

export function formatMyChannelKnowledge(): string {
  const channelId = mineChannelId();
  if (!channelId) {
    return "Aucune chaîne n'est marquée « Ma chaîne ». Connecte YouTube dans Réglages → Ma chaîne.";
  }
  const channel = store.getChannel(channelId);
  const knowledge = getKnowledge(channelId);
  const analytics = listChannelAnalytics(channelId);
  const lines = [
    channel ? `Chaîne : ${channel.title}${channel.handle ? ` (${channel.handle})` : ""} · ${channel.subscriber_count ?? "?"} abonnés` : "",
    analytics.length
      ? analytics
          .map(
            (row) =>
              `${row.period} : ${row.views ?? "?"} vues, AVD ${row.average_view_duration ?? "?"} s, +${row.subscribers_gained ?? "?"} / -${row.subscribers_lost ?? "?"} abo`,
          )
          .join("\n")
      : "",
  ].filter(Boolean);
  if (!knowledge) {
    return [...lines, "Le document de chaîne n'a pas encore été généré (lance l'analyse dans Réglages → Ma chaîne)."].join("\n");
  }
  return [
    ...lines,
    `Document généré le ${knowledge.generated_at} (${knowledge.video_count} vidéos, ${knowledge.transcript_count} transcripts).`,
    compactKnowledgeBlock(parseKnowledgeJson(knowledge.json)) || knowledge.document_md.slice(0, 6000),
  ].join("\n\n");
}

export const getMyChannelKnowledgeTool: ToolDefinition<z.infer<typeof InputSchema>> = {
  name: "get_my_channel_knowledge",
  description:
    "Returns the connected YouTube channel bible: identity, audience, content pillars, thumbnail language, performance summary and Studio analytics already stored locally (no YouTube quota). Use this to ground thumbnail ideas and writing (scripts, titles) in the creator's real channel.",
  inputSchema: InputSchema,
  handler: async () => ({ content: [{ type: "text", text: formatMyChannelKnowledge() }] }),
};

registerTool(getMyChannelKnowledgeTool);
