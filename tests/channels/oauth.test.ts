import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import {
  buildGoogleAuthUrl,
  oauthClientConfigured,
  oauthClientCredentials,
  requestOrigin,
  YOUTUBE_OAUTH_SCOPES,
  youtubeOauthRedirectUri,
} from "@/lib/youtube/oauth";

describe("youtube OAuth helpers", () => {
  beforeEach(() => {
    getDb().exec("DELETE FROM settings");
  });

  it("ignores an email or password pasted in the OAuth client fields", () => {
    setSetting("googleOAuthClientId", "contact@example.com");
    setSetting("googleOAuthClientSecret", "not-a-client-secret");
    expect(oauthClientConfigured()).toBe(false);
    expect(oauthClientCredentials()).toBeNull();
  });

  it("accepts a real Google Cloud web client id", () => {
    setSetting("googleOAuthClientId", "123-abc.apps.googleusercontent.com");
    setSetting("googleOAuthClientSecret", "GOCSPX-test");
    expect(oauthClientConfigured()).toBe(true);
    expect(oauthClientCredentials()).toEqual({
      clientId: "123-abc.apps.googleusercontent.com",
      clientSecret: "GOCSPX-test",
    });
  });

  it("builds the Studio-style redirect on the current origin", () => {
    expect(youtubeOauthRedirectUri("http://localhost:3000")).toBe("http://localhost:3000/api/youtube/oauth/callback");
    expect(youtubeOauthRedirectUri("http://localhost:3000/")).toBe("http://localhost:3000/api/youtube/oauth/callback");
  });

  it("asks Google for offline YouTube + Analytics read scopes and a refresh token", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "abc.apps.googleusercontent.com",
        redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
        state: "s".repeat(32),
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("abc.apps.googleusercontent.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([...YOUTUBE_OAUTH_SCOPES].sort());
    expect(url.searchParams.get("scope")).not.toContain("force-ssl");
  });

  it("prefers the forwarded host when the app sits behind a proxy", () => {
    const request = new Request("http://127.0.0.1:3000/api/youtube/oauth/start", {
      headers: { "x-forwarded-host": "thumbgen.example", "x-forwarded-proto": "https" },
    });
    expect(requestOrigin(request)).toBe("https://thumbgen.example");
  });
});
