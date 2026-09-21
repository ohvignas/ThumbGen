import { emptyStudioDraft, parseStudioPageMarkdown } from "./page-template";
import { createStudioVideo, saveStudioDraft } from "./store";
import { isEtiquette, type Etiquette } from "./types";

export type StudioCsvRow = {
  title: string;
  youtubeUrl: string | null;
  etiquette: Etiquette | null;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  const wanted = aliases.map(normalizeHeader);
  return normalized.findIndex((header) => wanted.includes(header));
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim());
}

export function parseStudioCsv(csv: string): StudioCsvRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  const titleIdx = headerIndex(headers, ["Nom", "Title", "title"]);
  const urlIdx = headerIndex(headers, ["URL", "youtubeUrl"]);
  const etiquetteIdx = headerIndex(headers, ["Étiquettes", "Etiquettes", "status"]);
  const rows: StudioCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const title = titleIdx >= 0 ? (cells[titleIdx] ?? "") : "";
    const rawUrl = urlIdx >= 0 ? (cells[urlIdx] ?? "") : "";
    const rawEtiquette = etiquetteIdx >= 0 ? (cells[etiquetteIdx] ?? "") : "";
    rows.push({
      title,
      youtubeUrl: rawUrl || null,
      etiquette: rawEtiquette && isEtiquette(rawEtiquette) ? rawEtiquette : null,
    });
  }
  return rows;
}

export function importStudioCsv(csv: string): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;
  for (const row of parseStudioCsv(csv)) {
    try {
      if (!row.title.trim()) {
        errors.push("Titre manquant");
        continue;
      }
      const created = createStudioVideo({
        title: row.title,
        etiquette: row.etiquette,
        youtubeUrl: row.youtubeUrl,
      });
      saveStudioDraft(created.videoId, emptyStudioDraft());
      imported += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { imported, errors };
}

export function importStudioMarkdown(input: {
  title: string;
  markdown: string;
  etiquette?: Etiquette | null;
  youtubeUrl?: string | null;
}): { videoId: string } {
  const created = createStudioVideo({
    title: input.title,
    etiquette: input.etiquette,
    youtubeUrl: input.youtubeUrl,
  });
  saveStudioDraft(created.videoId, parseStudioPageMarkdown(input.markdown));
  return { videoId: created.videoId };
}
