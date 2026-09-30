import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MIN_SETUP_PASSWORD_LENGTH, SETUP_TOKEN_QUERY } from "@/lib/auth/setup-token-edge";

export { MIN_SETUP_PASSWORD_LENGTH, SETUP_TOKEN_QUERY };

function dataDir(): string {
  return process.env.THUMBGEN_DATA_DIR || path.join(process.cwd(), "data");
}

export function passwordSetupTokenHashPath(): string {
  return path.join(dataDir(), "password-setup-token.sha256");
}

export function sitePasswordFilePath(): string {
  return path.join(dataDir(), "site-password");
}

/** SHA-256 hex of the raw one-time token (store this, never the raw token). */
export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

export function readStoredSetupTokenHash(): string | null {
  try {
    const raw = fs.readFileSync(passwordSetupTokenHashPath(), "utf8").trim();
    return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Persist only the hash; call on the server when minting the link. */
export function writeSetupTokenHash(tokenHash: string): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(passwordSetupTokenHashPath(), `${tokenHash.toLowerCase()}\n`, { mode: 0o600 });
}

/** Invalidate the one-time capability (delete hash file). */
export function consumeSetupTokenHash(): void {
  try {
    fs.unlinkSync(passwordSetupTokenHashPath());
  } catch {
    // already gone
  }
}

export function setupTokenIsValid(rawToken: string): boolean {
  const stored = readStoredSetupTokenHash();
  if (!stored || !rawToken) return false;
  const got = hashSetupToken(rawToken);
  try {
    return timingSafeEqual(Buffer.from(stored, "utf8"), Buffer.from(got, "utf8"));
  } catch {
    return false;
  }
}

export function writeSitePasswordFile(password: string): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(sitePasswordFilePath(), `${password}\n`, { mode: 0o600 });
}

/** Update SITE_PASSWORD= in a dotenv file when the path is writable (host .env mount). */
export function upsertEnvSitePassword(envPath: string, password: string): boolean {
  try {
    let text = "";
    try {
      text = fs.readFileSync(envPath, "utf8");
    } catch {
      text = "";
    }
    const line = `SITE_PASSWORD=${password}`;
    if (/^SITE_PASSWORD=/m.test(text)) {
      text = text.replace(/^SITE_PASSWORD=.*$/m, line);
    } else {
      text = `${text.replace(/\s*$/, "")}\n${line}\n`;
    }
    text = text.replace(/^SITE_PASSWORD_SETUP_TOKEN_HASH=.*$/gm, "");
    fs.writeFileSync(envPath, text, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export type SetupPasswordResult =
  | { ok: true }
  | { ok: false; error: "token" | "mismatch" | "short" | "missing" };

/**
 * Consume the one-time token then persist the new site password.
 * Token is invalidated before the password file is written.
 */
export function applySetupPassword(opts: {
  token: string;
  password: string;
  confirm: string;
  envPath?: string;
}): SetupPasswordResult {
  if (!setupTokenIsValid(opts.token)) return { ok: false, error: "token" };
  if (!opts.password || !opts.confirm) return { ok: false, error: "missing" };
  if (opts.password.length < MIN_SETUP_PASSWORD_LENGTH) return { ok: false, error: "short" };
  if (opts.password !== opts.confirm) return { ok: false, error: "mismatch" };

  consumeSetupTokenHash();
  writeSitePasswordFile(opts.password);
  const envPath = opts.envPath ?? path.join(process.cwd(), ".env.host");
  upsertEnvSitePassword(envPath, opts.password);
  if (envPath !== path.join(process.cwd(), ".env")) {
    upsertEnvSitePassword(path.join(process.cwd(), ".env"), opts.password);
  }
  return { ok: true };
}
