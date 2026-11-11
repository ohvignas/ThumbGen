import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { ensureMcpApiKey } from "@/lib/settings";

/**
 * Short-lived signed links for MCP clients. An MCP tool call cannot carry a
 * local file in or out, so `create_upload_link` and `export_image` hand the
 * client a URL it can `curl`. The link is an HMAC over its payload, keyed by
 * the MCP API key: only someone who could already call the MCP server can
 * mint one, and regenerating the key voids every outstanding link. Stateless,
 * so it survives the per-route module instances of a Next.js build.
 */

export type UploadLinkPayload = { t: "upload"; title: string; n: string };
export type ExportLinkPayload = {
  t: "export";
  src: string;
  w: number;
  h: number;
  fmt: "jpg" | "png";
  name: string;
};
export type SignedLinkPayload = UploadLinkPayload | ExportLinkPayload;

export const SIGNED_LINK_TTL_SECONDS = 15 * 60;

function hmac(body: string): string {
  return crypto.createHmac("sha256", ensureMcpApiKey()).update(body).digest("base64url");
}

export function signLink(payload: SignedLinkPayload, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SIGNED_LINK_TTL_SECONDS;
  const body = Buffer.from(JSON.stringify({ ...payload, exp }), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

/** The payload of a valid, unexpired token of the wanted kind; null otherwise. */
export function verifyLink<K extends SignedLinkPayload["t"]>(
  token: string | null | undefined,
  kind: K,
  nowMs: number = Date.now(),
): Extract<SignedLinkPayload, { t: K }> | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(hmac(body));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedLinkPayload & { exp?: number };
    if (parsed.t !== kind) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < nowMs) return null;
    return parsed as Extract<SignedLinkPayload, { t: K }>;
  } catch {
    return null;
  }
}

/** Origin the MCP client reached us on, set by /api/mcp around each request. */
export const mcpRequestOrigin = new AsyncLocalStorage<string>();

/** `https://host` as the reverse proxy saw it, or null when the headers are unusable. */
export function originFromHeaders(headers: Headers, fallbackUrl: string): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!/^[\w.-]+(:\d+)?$/.test(host)) return null;
  let proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  if (proto !== "http" && proto !== "https") {
    try {
      proto = new URL(fallbackUrl).protocol.replace(":", "");
    } catch {
      proto = "http";
    }
  }
  return `${proto}://${host}`;
}

/** Absolute URL when the origin is known, else the bare path (same origin as the MCP endpoint). */
export function absoluteLink(path: string): string {
  const origin =
    mcpRequestOrigin.getStore() ??
    (process.env.THUMBGEN_PUBLIC_HOST ? `https://${process.env.THUMBGEN_PUBLIC_HOST}` : null);
  return origin ? `${origin}${path}` : path;
}
