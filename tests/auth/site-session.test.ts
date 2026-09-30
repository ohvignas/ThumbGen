import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  authCookieVerifier,
  isValidAuthCookie,
  passwordMatches,
  shouldSecureCookie,
  timingSafeEqualStr,
} from "@/lib/auth/site-session";
import { NextRequest } from "next/server";

describe("site-session", () => {
  it("derives a verifier that is not the raw password", async () => {
    const password = "hunter2-secret";
    const verifier = await authCookieVerifier(password);
    expect(verifier).not.toBe(password);
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(await isValidAuthCookie(verifier, password)).toBe(true);
    expect(await isValidAuthCookie(password, password)).toBe(false);
    expect(await isValidAuthCookie("deadbeef", password)).toBe(false);
  });

  it("compares passwords in a length-stable way via digests", async () => {
    expect(await passwordMatches("hunter2-secret", "hunter2-secret")).toBe(true);
    expect(await passwordMatches("wrong", "hunter2-secret")).toBe(false);
    expect(await passwordMatches("", "hunter2-secret")).toBe(false);
  });

  it("timingSafeEqualStr rejects different lengths and values", () => {
    expect(timingSafeEqualStr("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualStr("abcd", "abce")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });

  it("sets Secure only for HTTPS (incl. x-forwarded-proto)", () => {
    const httpsReq = new NextRequest("https://miniature.illith.com/");
    expect(shouldSecureCookie(httpsReq)).toBe(true);

    const httpReq = new NextRequest("http://127.0.0.1:3000/");
    expect(shouldSecureCookie(httpReq)).toBe(false);

    const proxied = new NextRequest("http://127.0.0.1:3000/", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(shouldSecureCookie(proxied)).toBe(true);

    const opts = authCookieOptions(false);
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
    expect(AUTH_COOKIE_NAME).toBe("thumbgen_auth");
  });
});
