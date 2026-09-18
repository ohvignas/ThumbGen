import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // This checkout lives under .worktrees/; do not exclude `**/.worktrees/**`
    // or every test file here is skipped. Parent repo config still excludes worktrees.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
