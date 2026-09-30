import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applySetupPassword,
  generateSetupToken,
  hashSetupToken,
  passwordSetupTokenHashPath,
  readStoredSetupTokenHash,
  setupTokenIsValid,
  sitePasswordFilePath,
  writeSetupTokenHash,
} from "@/lib/auth/password-setup";
import { setupTokenMatchesHash } from "@/lib/auth/setup-token-edge";
import { GET, POST } from "@/app/definir-mot-de-passe/route";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("password setup token store", () => {
  let tmp: string;
  const prevData = process.env.THUMBGEN_DATA_DIR;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-setup-"));
    process.env.THUMBGEN_DATA_DIR = tmp;
  });

  afterEach(() => {
    if (prevData === undefined) delete process.env.THUMBGEN_DATA_DIR;
    else process.env.THUMBGEN_DATA_DIR = prevData;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("stores only the hash and validates the raw token", async () => {
    const token = generateSetupToken();
    writeSetupTokenHash(hashSetupToken(token));
    expect(readStoredSetupTokenHash()).toBe(hashSetupToken(token));
    expect(fs.readFileSync(passwordSetupTokenHashPath(), "utf8")).not.toContain(token);
    expect(setupTokenIsValid(token)).toBe(true);
    expect(setupTokenIsValid("nope")).toBe(false);
    expect(await setupTokenMatchesHash(token, hashSetupToken(token))).toBe(true);
  });

  it("rejects mismatch without consuming the token", () => {
    const token = generateSetupToken();
    writeSetupTokenHash(hashSetupToken(token));
    const result = applySetupPassword({
      token,
      password: "long-enough",
      confirm: "different!!",
      envPath: path.join(tmp, "no-env"),
    });
    expect(result).toEqual({ ok: false, error: "mismatch" });
    expect(setupTokenIsValid(token)).toBe(true);
  });

  it("consumes the token then writes the site password file", () => {
    const token = generateSetupToken();
    writeSetupTokenHash(hashSetupToken(token));
    const envPath = path.join(tmp, ".env.host");
    fs.writeFileSync(envPath, "SITE_PASSWORD=old-value\n", "utf8");
    const result = applySetupPassword({
      token,
      password: "memorable1",
      confirm: "memorable1",
      envPath,
    });
    expect(result).toEqual({ ok: true });
    expect(setupTokenIsValid(token)).toBe(false);
    expect(fs.existsSync(passwordSetupTokenHashPath())).toBe(false);
    expect(fs.readFileSync(sitePasswordFilePath(), "utf8").trim()).toBe("memorable1");
    expect(fs.readFileSync(envPath, "utf8")).toContain("SITE_PASSWORD=memorable1");
    expect(fs.readFileSync(envPath, "utf8")).not.toContain("old-value");
  });

  it("rejects short passwords without consuming", () => {
    const token = generateSetupToken();
    writeSetupTokenHash(hashSetupToken(token));
    expect(
      applySetupPassword({ token, password: "short", confirm: "short", envPath: path.join(tmp, "e") }),
    ).toEqual({ ok: false, error: "short" });
    expect(setupTokenIsValid(token)).toBe(true);
  });
});

describe("definir-mot-de-passe route", () => {
  let tmp: string;
  const prevData = process.env.THUMBGEN_DATA_DIR;
  let token: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-setup-route-"));
    process.env.THUMBGEN_DATA_DIR = tmp;
    token = generateSetupToken();
    writeSetupTokenHash(hashSetupToken(token));
  });

  afterEach(() => {
    if (prevData === undefined) delete process.env.THUMBGEN_DATA_DIR;
    else process.env.THUMBGEN_DATA_DIR = prevData;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("GET with valid token returns the French form", async () => {
    const res = await GET(new NextRequest(`http://127.0.0.1/definir-mot-de-passe?t=${token}`));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Choisir le mot de passe");
    expect(body).toContain('method="POST"');
    expect(body).not.toContain("?password=");
  });

  it("GET with bad token is 404", async () => {
    const res = await GET(new NextRequest("http://127.0.0.1/definir-mot-de-passe?t=bad"));
    expect(res.status).toBe(404);
  });

  it("GET without token is 404", async () => {
    const res = await GET(new NextRequest("http://127.0.0.1/definir-mot-de-passe"));
    expect(res.status).toBe(404);
  });

  it("POST mismatch keeps token and shows error", async () => {
    const res = await POST(
      new NextRequest("http://127.0.0.1/definir-mot-de-passe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          t: token,
          password: "long-enough",
          confirm: "no-match!!",
        }).toString(),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("ne correspondent pas");
    expect(setupTokenIsValid(token)).toBe(true);
  });
});

describe("middleware setup gate", () => {
  const prevPw = process.env.SITE_PASSWORD;
  const prevHash = process.env.SITE_PASSWORD_SETUP_TOKEN_HASH;

  afterEach(() => {
    if (prevPw === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = prevPw;
    if (prevHash === undefined) delete process.env.SITE_PASSWORD_SETUP_TOKEN_HASH;
    else process.env.SITE_PASSWORD_SETUP_TOKEN_HASH = prevHash;
  });

  it("404s setup path when no setup hash is configured", async () => {
    process.env.SITE_PASSWORD = "gate-password";
    delete process.env.SITE_PASSWORD_SETUP_TOKEN_HASH;
    const res = await middleware(
      new NextRequest("http://127.0.0.1/definir-mot-de-passe?t=anything"),
    );
    expect(res.status).toBe(404);
  });

  it("allows GET when token matches setup hash", async () => {
    process.env.SITE_PASSWORD = "gate-password";
    const token = "one-time-capability-token-value";
    process.env.SITE_PASSWORD_SETUP_TOKEN_HASH = hashSetupToken(token);
    const res = await middleware(
      new NextRequest(`http://127.0.0.1/definir-mot-de-passe?t=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("404s GET when token does not match setup hash", async () => {
    process.env.SITE_PASSWORD = "gate-password";
    process.env.SITE_PASSWORD_SETUP_TOKEN_HASH = hashSetupToken("expected-token");
    const res = await middleware(
      new NextRequest("http://127.0.0.1/definir-mot-de-passe?t=wrong"),
    );
    expect(res.status).toBe(404);
  });
});
