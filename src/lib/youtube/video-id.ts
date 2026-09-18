export function youtubeVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const match = parsed.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
      return match?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
