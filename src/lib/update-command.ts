/** Host-side update. The Next app must never shell this out. */
export const THUMBGEN_UPDATE_LINES = ["git pull", "docker compose up -d --build"] as const;

export const THUMBGEN_UPDATE_COMMAND = THUMBGEN_UPDATE_LINES.join("\n");
