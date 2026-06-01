import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The @neslinesli93/qpdf-wasm Emscripten glue contains `require("fs")`,
    // `require("path")`, and `require("crypto")` inside a node-only runtime
    // branch. The browser never executes that branch, but Turbopack's static
    // resolver still tries to resolve the specifiers and would fail the build
    // with "Module not found: Can't resolve 'fs'". Alias them to an empty
    // module for browser bundles. (Next 16 build uses Turbopack by default;
    // a webpack() config would make `next build` fail, so do NOT add one.)
    resolveAlias: {
      fs: { browser: "./src/lib/empty-module.ts" },
      path: { browser: "./src/lib/empty-module.ts" },
      crypto: { browser: "./src/lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
