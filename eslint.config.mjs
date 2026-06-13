import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// ESLint is Ontab's only linter (Biome was evaluated and rejected — ADR-0005).
// Keep `core-web-vitals` for the rules that matter most: Next-specific checks
// (@next/next/*) and React Hooks correctness (react-hooks/*). The
// `eslint-config-next/typescript` preset was dropped — its typescript-eslint
// rules were ~1600 warnings of noise, not bug detection (ADR-0005).
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
