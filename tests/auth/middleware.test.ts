import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { AUTH_COOKIE_NAME, authCookieVerifier } from "@/lib/auth/site-session";

const PASSWORD = "test-site-password-xyz";

describe("SITE_PASSWORD middleware", () => {
  const prev = process.env.SITE_PASSWORD;

  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = prev;
  });

  it("returns 401 login HTML without a cookie", async () => {
    const res = await middleware(new NextRequest("http://127.0.0.1:3000/"));
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain("method=\"POST\"");
    expect(body).toContain('action="/login"');
    expect(body).not.toContain("?password=");
  });

  it("does not authenticate via ?password=", async () => {
    const res = await middleware(
      new NextRequest(`http://127.0.0.1:3000/?password=${encodeURIComponent(PASSWORD)}`),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects wrong password POST and does not set the raw password as cookie", async () => {
    const res = await middleware(
      new NextRequest("http://127.0.0.1:3000/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "password=wrong-password",
      }),
    );
    expect(res.status).toBe(401);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain(PASSWORD);
    expect(setCookie).not.toContain(`${AUTH_COOKIE_NAME}=`);
    const body = await res.text();
    expect(body).toContain("Incorrect password");
  });

  it("accepts correct password POST with a verifier cookie (not the password)", async () => {
    const res = await middleware(
      new NextRequest("http://127.0.0.1:3000/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `password=${encodeURIComponent(PASSWORD)}`,
      }),
    );
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location.endsWith("/")).toBe(true);
    expect(location.startsWith("http://")).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toContain("Secure"); // plain HTTP local
    expect(setCookie).not.toContain(PASSWORD);
    const verifier = await authCookieVerifier(PASSWORD);
    expect(setCookie).toContain(verifier);
  });

  it("allows requests with a valid verifier cookie", async () => {
    const verifier = await authCookieVerifier(PASSWORD);
    const res = await middleware(
      new NextRequest("http://127.0.0.1:3000/", {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${verifier}` },
      }),
    );
    // next() → no forced 401
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sets Secure on HTTPS login", async () => {
    const res = await middleware(
      new NextRequest("https://miniature.illith.com/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `password=${encodeURIComponent(PASSWORD)}`,
      }),
    );
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).not.toContain(PASSWORD);
  });
});
