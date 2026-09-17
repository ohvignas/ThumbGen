export const UNKNOWN_LIBRARY_IMAGE_ERROR = "Cette image de la bibliothèque ne peut pas être jointe.";

/** A chat attachment: an image-source reference the agent route resolves, and its preview. */
export type LibraryAttachment = { source: string; preview_url: string };

/** Library image routes → the `stored:` prefix resolveImageSource reads, and the query param holding the id. */
const ROUTES: Record<string, { prefix: string; param: string }> = {
  "/api/swipe-files/image": { prefix: "sf_", param: "f" },
  "/api/logos/image": { prefix: "lg_", param: "f" },
  "/api/personas/image": { prefix: "persona_", param: "id" },
};

/**
 * A LibraryPickerDialog pick (an image URL of this app) as a chat attachment,
 * or null when the URL is not a library image the agent can resolve. Pure.
 */
export function libraryPickToAttachment(pick: { imageUrl: string; label?: string }): LibraryAttachment | null {
  const { imageUrl } = pick;
  // Same-origin paths only (not `//host/...`).
  if (!imageUrl.startsWith("/") || imageUrl.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(imageUrl, "http://thumbgen.local");
  } catch {
    return null;
  }
  const route = ROUTES[url.pathname];
  if (!route) return null;
  const raw = url.searchParams.get(route.param) ?? "";
  // The swipe-file and logo routes ignore a legacy extension (`<id>.png`).
  const id = route.prefix === "persona_" ? raw : raw.split(".")[0];
  if (!id) return null;
  return { source: `stored:${route.prefix}${id}`, preview_url: imageUrl };
}
