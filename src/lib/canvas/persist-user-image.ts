import { imageDisplayUrl, toImageSourceRef } from "@/lib/canvas/image-refs";

export type PersistedUserImage = {
  imageUrl: string;
  image_source: string;
};

async function persistSwipeFile(dataUrl: string, title: string): Promise<PersistedUserImage | null> {
  const res = await fetch("/api/swipe-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, title }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { filename?: string };
  if (!json.filename) return null;
  const imageUrl = `/api/swipe-files/image?f=${encodeURIComponent(json.filename)}`;
  return { imageUrl, image_source: toImageSourceRef(imageUrl) ?? `stored:sf_${json.filename}` };
}

async function persistChatUpload(dataUrl: string, title: string): Promise<PersistedUserImage | null> {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], `${title}.png`, { type: blob.type || "image/png" });
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/chat-uploads", { method: "POST", body });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: string; source?: string };
  if (!json.id || !json.source) return null;
  const imageUrl = `/api/chat-uploads/${json.id}`;
  return { imageUrl, image_source: json.source };
}

/** Store a user-drawn / uploaded canvas image so persist-snapshot can keep a ref. */
export async function persistUserCanvasImage(
  dataUrl: string,
  kind: "sketch" | "swipe",
  title = kind === "sketch" ? "Croquis" : "Reference",
): Promise<PersistedUserImage | null> {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  try {
    const persisted = kind === "swipe" ? await persistSwipeFile(dataUrl, title) : await persistChatUpload(dataUrl, title);
    if (!persisted) return null;
    return {
      imageUrl: imageDisplayUrl(persisted.image_source) ?? persisted.imageUrl,
      image_source: persisted.image_source,
    };
  } catch {
    return null;
  }
}
