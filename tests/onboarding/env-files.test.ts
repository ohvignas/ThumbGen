import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("new-machine env onboarding", () => {
  it("does not gitignore .env.example, and still ignores .env", () => {
    const gitignore = read(".gitignore");
    expect(gitignore).toMatch(/^\.env\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);

    const example = spawnSync("git", ["check-ignore", "-q", ".env.example"], { cwd: root });
    expect(example.status, ".env.example must be trackable").not.toBe(0);

    const secret = spawnSync("git", ["check-ignore", "-q", ".env"], { cwd: root });
    expect(secret.status, ".env must stay ignored").toBe(0);
  });

  it("ships an empty .env.example template with no real keys", () => {
    const text = read(".env.example");
    expect(text).toMatch(/^OPENROUTER_API_KEY=$/m);
    expect(text).toMatch(/^OPENAI_API_KEY=$/m);
    expect(text).toMatch(/^YOUTUBE_API_KEY=$/m);
    expect(text).not.toMatch(/sk-or-/);
    expect(text).not.toMatch(/sk-[a-zA-Z0-9]{16,}/);
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it("lets Compose boot without secrets or env_file", () => {
    const compose = read("docker-compose.yml");
    expect(compose).not.toMatch(/^\s*env_file:/m);
    expect(compose).toContain("OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}");
    expect(compose).toContain("OPENAI_API_KEY=${OPENAI_API_KEY:-}");
    expect(compose).toContain("YOUTUBE_API_KEY=${YOUTUBE_API_KEY:-}");
  });

  it("npm run where-env prints the compose-directory .env paths", () => {
    const result = spawnSync("sh", ["scripts/where-env.sh"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(path.join(root, ".env"));
    expect(result.stdout).toContain(path.join(root, ".env.example"));
    expect(result.stdout).toContain(root);
    expect(result.stdout).toMatch(/no env_file/);
  });

  it("keeps comments off the same line as commands in install bash blocks", () => {
    for (const file of ["README.md", "INSTALL.md"]) {
      const blocks = [...read(file).matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
      expect(blocks.length, file).toBeGreaterThan(0);
      for (const block of blocks) {
        for (const line of block.split("\n")) {
          const command = line.trim();
          if (!command || command.startsWith("#")) continue;
          expect(command, `${file}: ${command}`).not.toMatch(/\s#/);
        }
      }
    }
  });

  it("tells a machine that already has ThumbGen to git pull instead of clone", () => {
    const readme = read("README.md");
    const install = read("INSTALL.md");
    expect(readme).toMatch(/already exists/);
    expect(readme).toMatch(/git pull/);
    expect(install).toMatch(/existe déjà/);
    expect(install).toMatch(/git pull/);
  });
});
