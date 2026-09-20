import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Nested git worktrees under `.worktrees/` are other checkouts; their tests
    // must not run against this tree's `src/` via the `@` alias.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.worktrees/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
