import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Agent Skills for ThumbGen Brainstorm (not Cursor AGENTS.md).
 * At boot the model only sees name + description; read_skill loads the body.
 */

export type SkillIndexEntry = { name: string; description: string };

function resolveSkillsRoot(): string {
  const fromModule = path.dirname(fileURLToPath(import.meta.url));
  const fromCwd = path.join(process.cwd(), "src/lib/agent/skills");
  for (const candidate of [fromModule, fromCwd]) {
    try {
      if (fs.existsSync(candidate) && fs.readdirSync(candidate).some((name) => fs.existsSync(path.join(candidate, name, "SKILL.md")))) {
        return candidate;
      }
    } catch {
      /* ignore unreadable roots */
    }
  }
  return fromCwd;
}

const SKILLS_ROOT = resolveSkillsRoot();

function skillDirNames(): string[] {
  if (!fs.existsSync(SKILLS_ROOT)) return [];
  return fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SKILLS_ROOT, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(markdown: string): { name: string; description: string; body: string } | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const name = match[1].match(/^name:\s*(.+)$/m)?.[1];
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1];
  if (!name || !description) return null;
  return { name: unquote(name), description: unquote(description), body: match[2].trim() };
}

function readFile(skillDir: string): string | null {
  const file = path.join(SKILLS_ROOT, skillDir, "SKILL.md");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function listSkillCatalog(): SkillIndexEntry[] {
  const entries: SkillIndexEntry[] = [];
  for (const dir of skillDirNames()) {
    const raw = readFile(dir);
    if (!raw) continue;
    const parsed = parseFrontmatter(raw);
    if (parsed) entries.push({ name: parsed.name, description: parsed.description });
  }
  return entries;
}

/** Full markdown body (no frontmatter), or null when the name is unknown. */
export function readSkillBody(name: string): string | null {
  const safe = name.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/.test(safe)) return null;
  for (const dir of skillDirNames()) {
    const raw = readFile(dir);
    if (!raw) continue;
    const parsed = parseFrontmatter(raw);
    if (parsed?.name === safe) return parsed.body;
  }
  return null;
}

export function buildSkillsCatalogBlock(): string {
  const lines = listSkillCatalog().map((skill) => `- ${skill.name} — ${skill.description}`);
  return [
    "SKILLS — load with read_skill before the first use of that tool or workflow in this conversation. Do not load every skill up front. Catalog:",
    ...lines,
  ].join("\n");
}
