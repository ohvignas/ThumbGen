import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// youtube-transcript ships a CJS bundle that breaks under Vitest's ESM transform.
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: vi.fn(async () => []) },
}));

import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { consumeOauthState, getOauth, saveOauthState, upsertOauth } from "@/lib/youtube/oauth-store";
import { GET as startOauth } from "@/app/api/youtube/oauth/start/route";
import { GET as connectionGet } from "@/app/api/youtube/connection/route";
import { POST as ingestPost } from "@/app/api/youtube/ingest/route";
import * as ingest from "@/lib/youtube/ingest";
import { youtubeVideoIdFromUrl } from "@/lib/youtube/video-id";
import { resetChannelRuntime } from "@/lib/youtube/runtime";

beforeEach(() => {
  getDb().exec("DELETE FROM youtube_oauth");
  getDb().exec("DELETE FROM youtube_oauth_state");
  getDb().exec("DELETE FROM settings");
  resetChannelRuntime();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("oauth state store", () => {
  it("returns the origin once then forgets the state", () => {
    saveOauthState("abc", "http://localhost:3000", new Date("2026-09-18T10:00:00Z"));
    expect(consumeOauthState("abc", new Date("2026-09-18T10:02:00Z"))).toBe("http://localhost:3000");
    expect(consumeOauthState("abc", new Date("2026-09-18T10:03:00Z"))).toBeNull();
  });

  it("rejects a state older than 10 minutes", () => {
    saveOauthState("old", "http://localhost:3000", new Date("2026-09-18T09:00:00Z"));
    expect(consumeOauthState("old", new Date("2026-09-18T09:11:00Z"))).toBeNull();
  });
});

describe("GET /api/youtube/oauth/start", () => {
  it("sends the user to Connexions when the Google client is missing", async () => {
    const res = await startOauth(new Request("http://localhost:3000/api/youtube/oauth/start"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/reglages/connexions");
  });

  it("does not start Google OAuth when the client id is an email", async () => {
    setSetting("googleOAuthClientId", "contact@example.com");
    setSetting("googleOAuthClientSecret", "password");
    const res = await startOauth(new Request("http://localhost:3000/api/youtube/oauth/start"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/reglages/connexions");
  });

  it("redirects to Google and stores a CSRF state", async () => {
    setSetting("googleOAuthClientId", "id.apps.googleusercontent.com");
    setSetting("googleOAuthClientSecret", "secret");
    const res = await startOauth(new Request("http://localhost:3000/api/youtube/oauth/start"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("youtube.readonly");
    expect(location).toContain("yt-analytics.readonly");
    expect(location).not.toContain("force-ssl");
    const state = new URL(location).searchParams.get("state");
    expect(state).toBeTruthy();
    expect(consumeOauthState(state!)).toBe("http://localhost:3000");
  });
});

describe("GET /api/youtube/connection", () => {
  it("reports disconnected until OAuth tokens exist", async () => {
    const body = await (await connectionGet()).json();
    expect(body.connected).toBe(false);
    expect(body.knowledge).toBeNull();
    expect(body.canIngest).toBe(false);
  });

  it("can ingest Ma chaîne with the YouTube Data API key already in settings", async () => {
    setSetting("youtubeApiKey", "AIzaSyTestKey");
    setSetting("youtubePlaylistId", "https://www.youtube.com/@AntoineVigneau");
    const body = await (await connectionGet()).json();
    expect(body.oauthConfigured).toBe(false);
    expect(body.canIngest).toBe(true);
    expect(body.connected).toBe(false);
  });

  it("reports the connected channel without leaking tokens", async () => {
    upsertOauth({
      refreshToken: "refresh-secret",
      accessToken: "access-secret",
      expiresAtMs: Date.now() + 60_000,
      scopes: "https://www.googleapis.com/auth/youtube.readonly",
      connectedAt: "2026-09-18T10:00:00.000Z",
      channelYoutubeId: "UCabcdefghijklmnopqrstuv",
      channelTitle: "Antoine",
      channelHandle: "@antoine",
    });
    const res = await connectionGet();
    const body = await res.json();
    const raw = JSON.stringify(body);
    expect(body.connected).toBe(true);
    expect(body.channelTitle).toBe("Antoine");
    expect(raw).not.toContain("refresh-secret");
    expect(raw).not.toContain("access-secret");
    expect(getOauth()?.refresh_token).toBe("refresh-secret");
  });
});

describe("POST /api/youtube/ingest", () => {
  it("starts ingest when the YouTube API key and channel URL are set", async () => {
    setSetting("youtubeApiKey", "AIzaSyTestKey");
    setSetting("youtubePlaylistId", "https://www.youtube.com/@AntoineVigneau");
    const start = vi.spyOn(ingest, "startChannelIngest").mockReturnValue(true);
    const res = await ingestPost();
    expect(res.status).toBe(200);
    expect(start).toHaveBeenCalled();
    const body = await res.json();
    expect(body.canIngest).toBe(true);
  });

  it("rejects ingest when neither Google OAuth nor the API key is ready", async () => {
    const res = await ingestPost();
    expect(res.status).toBe(401);
  });
});

describe("youtubeVideoIdFromUrl", () => {
  it("reads watch, short and youtu.be urls", () => {
    expect(youtubeVideoIdFromUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeVideoIdFromUrl("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeVideoIdFromUrl("https://youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeVideoIdFromUrl("https://youtube.com/watch?v=ok")).toBeNull();
  });
});
