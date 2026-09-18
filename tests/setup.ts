import path from "path";
import fs from "fs";
import os from "os";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbgen-test-"));
process.env.THUMBGEN_DB_PATH = path.join(dir, "thumbgen.db");

// Secrets fall back to env in getTypedSettings(). Tests that assert "no key"
// would otherwise pick up the developer's shell. Files that need a fallback
// set the variable themselves in beforeEach.
for (const name of [
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "YOUTUBE_API_KEY",
  "MCP_API_KEY",
  "BRANDFETCH_API_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "SITE_PASSWORD",
]) {
  delete process.env[name];
}
