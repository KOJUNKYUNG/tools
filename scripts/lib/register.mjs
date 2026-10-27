// Lets Node run the app's TypeScript modules as they are written: resolves
// the `@/` alias to `src/` and extensionless imports to their `.ts` file, and
// loads `.ts` as ES modules (Node strips the types). No bundler, no package.
//
// Used as: node --import ./scripts/lib/register.mjs <script.ts>

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = pathToFileURL(fileURLToPath(new URL("../../src/", import.meta.url))).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    let spec = specifier.startsWith("@/") ? SRC + specifier.slice(2) : specifier;
    if ((spec.startsWith(".") || spec.startsWith("file:")) && !/\.[cm]?[jt]sx?$/.test(spec)) {
      const url = new URL(spec, context.parentURL);
      if (existsSync(fileURLToPath(url) + ".ts")) spec = url.href + ".ts";
    }
    return nextResolve(spec, context);
  },
  load(url, context, nextLoad) {
    // The repo's package.json declares no module type; say it, rather than
    // have Node guess and warn on every file.
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      return nextLoad(url, { ...context, format: "module-typescript" });
    }
    return nextLoad(url, context);
  },
});
