import { z, type ZodError } from "zod";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "@/lib/agent/models";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_IDS, IMAGE_RESOLUTIONS } from "@/lib/image-models";

/**
 * Single source of truth for every persisted setting: type, bounds, default
 * and secret marker. Client-safe (no DB import) so the Réglages forms reuse
 * the option lists; reading and writing the settings table lives in
 * src/lib/settings.ts.
 */

export { IMAGE_RESOLUTIONS, isImageResolution, type ImageResolution } from "@/lib/image-models";

export const LANGUAGE_CODES = ["fr", "en", "es", "de", "pt", "it"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGES: ReadonlyArray<{ code: LanguageCode; label: string; englishName: string }> = [
  { code: "fr", label: "Français", englishName: "French" },
  { code: "en", label: "English", englishName: "English" },
  { code: "es", label: "Español", englishName: "Spanish" },
  { code: "de", label: "Deutsch", englishName: "German" },
  { code: "pt", label: "Português", englishName: "Portuguese" },
  { code: "it", label: "Italiano", englishName: "Italian" },
];

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const ASPECT_RATIOS = ["16x9", "9x16", "1x1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Settings holding credentials: never sent to the browser, only their status. */
export const SECRET_KEYS = [
  "openrouterApiKey",
  "openaiApiKey",
  "youtubeApiKey",
  "mcpApiKey",
  "brandfetchApiKey",
  "perplexityApiKey",
  "typesafeApiKey",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export function isSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

/** Environment variable read when a secret is not stored in the settings table. */
export const ENV_FALLBACK: Record<SecretKey, string> = {
  openrouterApiKey: "OPENROUTER_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  youtubeApiKey: "YOUTUBE_API_KEY",
  mcpApiKey: "MCP_API_KEY",
  brandfetchApiKey: "BRANDFETCH_API_KEY",
  perplexityApiKey: "PERPLEXITY_API_KEY",
  typesafeApiKey: "TYPESAFE_API_KEY",
};

export const BRAND_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const ChannelProfileSchema = z.object({
  name: z.string().trim().max(100, "100 caractères maximum").default(""),
  niche: z.string().trim().max(200, "200 caractères maximum").default(""),
  audience: z.string().trim().max(500, "500 caractères maximum").default(""),
  tone: z.string().trim().max(500, "500 caractères maximum").default(""),
  brandColors: z
    .array(z.string().regex(BRAND_COLOR_PATTERN, "Couleur au format #RRGGBB"))
    .max(3, "3 couleurs maximum")
    .default([]),
  defaultPersonaId: z.string().min(1).nullable().default(null),
  agentInstructions: z.string().trim().max(2000, "2000 caractères maximum").default(""),
});

export type ChannelProfile = z.output<typeof ChannelProfileSchema>;

export const EMPTY_CHANNEL_PROFILE: ChannelProfile = {
  name: "",
  niche: "",
  audience: "",
  tone: "",
  brandColors: [],
  defaultPersonaId: null,
  agentInstructions: "",
};

export function emptyChannelProfile(): ChannelProfile {
  return { ...EMPTY_CHANNEL_PROFILE, brandColors: [] };
}

const secret = () => z.string().trim().max(1000, "Clé trop longue").optional();

// Stored as text: "true"/"false" (written) and legacy "1"/"0" (agentWebSearch).
const flag = (defaultValue: boolean) =>
  z
    .preprocess((value) => {
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      return value;
    }, z.boolean({ error: "Valeur oui/non attendue" }))
    .default(defaultValue);

const intRange = (min: number, max: number, defaultValue: number, message: string) =>
  z.coerce.number().int(message).min(min, message).max(max, message).default(defaultValue);

const AGENT_MODEL_IDS = AGENT_MODELS.map((model) => model.id) as [string, ...string[]];

export const SettingsSchema = z.object({
  openrouterApiKey: secret(),
  openaiApiKey: secret(),
  youtubeApiKey: secret(),
  mcpApiKey: secret(),
  // Brandfetch « Client ID » (sent as ?c=), optional: adds Brandfetch to the logo search.
  brandfetchApiKey: secret(),
  perplexityApiKey: secret(),
  typesafeApiKey: secret(),
  agentModel: z.enum(AGENT_MODEL_IDS, { error: "Modèle d'agent inconnu" }).default(DEFAULT_AGENT_MODEL),
  agentWebSearch: flag(true),
  agentReasoningEffort: z.enum(REASONING_EFFORTS, { error: "Effort de réflexion inconnu" }).default("medium"),
  agentMaxSteps: intRange(5, 50, 25, "Entre 5 et 50 étapes"),
  agentAutoTitle: flag(true),
  agentResponseLanguage: z.enum(LANGUAGE_CODES, { error: "Langue inconnue" }).default("fr"),
  favoriteModel: z.enum(IMAGE_MODEL_IDS, { error: "Modèle d'image inconnu" }).default(DEFAULT_IMAGE_MODEL),
  defaultAspectRatio: z.enum(ASPECT_RATIOS, { error: "Format inconnu" }).default("16x9"),
  defaultImageCount: intRange(1, 4, 1, "Entre 1 et 4 images"),
  defaultResolution: z.enum(IMAGE_RESOLUTIONS, { error: "Résolution inconnue" }).default("2K"),
  language: z.enum(LANGUAGE_CODES, { error: "Langue inconnue" }).default("fr"),
  inspirationAutoClassify: flag(true),
  youtubePlaylistId: z.string().trim().max(300, "300 caractères maximum").default(""),
  channelProfile: ChannelProfileSchema.default(emptyChannelProfile),
  theme: z.enum(THEMES, { error: "Thème inconnu" }).default("dark"),
  currentProjectId: z.string().trim().min(1).max(200).default("default"),
});

export type TypedSettings = z.output<typeof SettingsSchema>;

export const SETTING_KEYS = Object.keys(SettingsSchema.shape) as Array<keyof TypedSettings>;

/**
 * Validates a POST body. Caution: zod 4 still fills the defaults of omitted
 * fields inside a .partial() object — writers must only persist the keys the
 * caller actually sent.
 */
export const SettingsUpdateSchema = SettingsSchema.partial().strict();

export type SecretStatus = {
  configured: boolean;
  preview: string | null;
  source: "settings" | "env" | null;
};

export type SettingsValues = Omit<TypedSettings, SecretKey>;

export type SettingsResponse = SettingsValues & Record<SecretKey, SecretStatus> & { sitePasswordEnabled: boolean };

export type SettingsIssue = { path: string; message: string };

export function toSettingsIssues(error: ZodError): SettingsIssue[] {
  return error.issues.map((issue) => {
    if (issue.code === "unrecognized_keys") {
      return { path: issue.keys.join(","), message: `Réglage inconnu : ${issue.keys.join(", ")}` };
    }
    return { path: issue.path.map(String).join("."), message: issue.message };
  });
}

export function previewSecret(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 8 ? `…${trimmed.slice(-4)}` : "…";
}
