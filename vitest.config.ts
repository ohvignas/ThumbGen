import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Exclude worktrees to prevent vitest from running duplicate tests from
    // any active git worktree under .worktrees/ (vitest doesn't respect .gitignore).
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
