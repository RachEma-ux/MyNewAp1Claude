import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // The React plugin enables the automatic JSX runtime for *.tsx
  // files (no explicit `import React` needed) and matches the
  // production vite.config.ts build pipeline. Server *.ts tests
  // are not affected — the plugin only transforms JSX/TSX.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "tests/**/*.test.ts", "client/**/*.test.tsx"],
    // tests/integration/** require live staging infrastructure
    // (DBs, OPA, workers). They are excluded from local-unit mode
    // and only included when invoked via the staging-integration
    // script which sets TEST_MODE=staging-integration.
    exclude: process.env.TEST_MODE === "staging-integration"
      ? ["**/node_modules/**", "**/dist/**"]
      : ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.test.ts", "server/**/*.spec.ts"],
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
});
