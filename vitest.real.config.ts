import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Real-file regression set (`pnpm test:real`): local fixtures only, never
// part of `pnpm test` / `pnpm verify` / CI. See src/lib/output-check/realFileSuite.ts.
// Spread, not mergeConfig: mergeConfig would append to `include`, pulling the
// unit tests in.
export default defineConfig({
  ...base,
  test: {
    environment: "node",
    include: ["src/**/*.real.ts"],
    setupFiles: base.test?.setupFiles,
    // Real decks run several requests each; one file can take a while.
    testTimeout: 300_000,
  },
});
