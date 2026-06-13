import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Biome owns formatting + general JS/TS linting (see biome.json). ESLint is
// kept ONLY for the rules Biome cannot replicate: Next-specific checks
// (@next/next/*) and the React Hooks correctness rules (react-hooks/*), both
// bundled in core-web-vitals. The `eslint-config-next/typescript` preset was
// dropped — its typescript-eslint rules overlapped Biome and produced ~1600
// warnings of noise (ADR-0005).
const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
