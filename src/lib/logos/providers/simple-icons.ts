import * as simpleIcons from "simple-icons";
import * as simpleIconsJson from "simple-icons/icons.json";
import type { SimpleIcon } from "simple-icons";
import { normalizeSearchText } from "@/lib/search-text";
import type { LogoSearchResult } from "../shared";

export const SIMPLE_ICONS_LIMIT = 8;

type IconAliases = { aka?: unknown[]; dup?: { title?: unknown }[]; loc?: Record<string, unknown> };
type IconDataEntry = { slug?: unknown; aliases?: IconAliases };
type IndexedIcon = { icon: SimpleIcon; names: string[] };

let iconsBySlug: Map<string, SimpleIcon> | null = null;
let searchIndex: IndexedIcon[] | null = null;

function isSimpleIcon(value: unknown): value is SimpleIcon {
  return (
    typeof value === "object" && value !== null && "slug" in value && "title" in value && "hex" in value && "svg" in value
  );
}

function icons(): Map<string, SimpleIcon> {
  if (!iconsBySlug) {
    iconsBySlug = new Map();
    for (const value of Object.values(simpleIcons) as unknown[]) {
      if (isSimpleIcon(value)) iconsBySlug.set(value.slug, value);
    }
  }
  return iconsBySlug;
}

/** Aliases (aka, duplicates, localised names) by slug — only data/simple-icons.json has them. */
function aliasesBySlug(): Map<string, string[]> {
  // The icons.json export is typed by a .d.ts without a default export; at
  // runtime (Next and Vitest) the JSON array is the module's default.
  const moduleValue = simpleIconsJson as unknown as { default?: unknown };
  const data = Array.isArray(moduleValue) ? moduleValue : moduleValue.default;
  const aliases = new Map<string, string[]>();
  for (const entry of Array.isArray(data) ? (data as IconDataEntry[]) : []) {
    if (typeof entry.slug !== "string" || !entry.aliases) continue;
    const names = [
      ...(entry.aliases.aka ?? []),
      ...(entry.aliases.dup ?? []).map((duplicate) => duplicate.title),
      ...Object.values(entry.aliases.loc ?? {}),
    ].filter((name): name is string => typeof name === "string" && name.length > 0);
    if (names.length > 0) aliases.set(entry.slug, names);
  }
  return aliases;
}

function index(): IndexedIcon[] {
  if (!searchIndex) {
    const aliases = aliasesBySlug();
    searchIndex = [...icons().values()].map((icon) => ({
      icon,
      names: [icon.title, ...(aliases.get(icon.slug) ?? [])].map(normalizeSearchText),
    }));
  }
  return searchIndex;
}

const HEX_COLOR_PATTERN = /^[0-9A-Fa-f]{6}$/;

/** Brand-coloured SVG, or the unmodified SVG when `hex` isn't a safe 6-digit colour. */
export function colouredSvg(icon: Pick<SimpleIcon, "svg" | "hex">): string {
  if (!HEX_COLOR_PATTERN.test(icon.hex)) return icon.svg;
  return icon.svg.replace("<svg ", `<svg fill="#${icon.hex}" `);
}

/** The brand-coloured SVG of an icon (Simple Icons SVGs have no fill), or null. */
export function simpleIconSvg(slug: string): string | null {
  const icon = icons().get(slug);
  return icon ? colouredSvg(icon) : null;
}

function toResult(icon: SimpleIcon): LogoSearchResult {
  return {
    key: `simple-icons:${icon.slug}`,
    source: "simple-icons",
    name: icon.title,
    detail: null,
    variant: "color",
    previewUrl: `data:image/svg+xml;base64,${Buffer.from(colouredSvg(icon)).toString("base64")}`,
    ref: icon.slug,
  };
}

/** Local search on title, slug and aliases: exact match, then prefix, then substring. No network. */
export function searchSimpleIcons(query: string, limit: number = SIMPLE_ICONS_LIMIT): LogoSearchResult[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const matches: { icon: SimpleIcon; rank: number }[] = [];
  for (const { icon, names } of index()) {
    let rank = -1;
    if (names.includes(normalized) || (compact !== "" && icon.slug === compact)) rank = 0;
    else if (names.some((name) => name.startsWith(normalized)) || (compact !== "" && icon.slug.startsWith(compact))) rank = 1;
    else if (names.some((name) => name.includes(normalized))) rank = 2;
    if (rank >= 0) matches.push({ icon, rank });
  }
  matches.sort((a, b) => a.rank - b.rank || a.icon.title.localeCompare(b.icon.title));
  return matches.slice(0, limit).map(({ icon }) => toResult(icon));
}
