// Serves the ppt-compress ratio measurement page (index.html) on
// http://localhost:4310. The page re-encodes every image in the real-file
// decks, and each loose JPEG/PNG, with the engine's own encoder (browser-image-compression, from
// node_modules) and reports how much each preset step leaves.
//
// Run: preview_start "measure-ppt-ratios" (.claude/launch.json), or
//      node scripts/measure-ppt-ratios/serve.mjs
// Decks come from tests/fixtures (REAL_FIXTURES_DIR overrides), local-only.

import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../..");
const fixtures = process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures");
const PORT = 4310;

const files = {
  "/": [join(here, "index.html"), "text/html; charset=utf-8"],
  "/lib/bic.js": [
    join(root, "node_modules/browser-image-compression/dist/browser-image-compression.js"),
    "text/javascript",
  ],
  "/lib/jszip.js": [join(root, "node_modules/jszip/dist/jszip.min.js"), "text/javascript"],
};

// The page reads JPEG quality with the estimator's own code.
const QUALITY_MODULE = join(root, "src/lib/image/alreadyCompressed.ts");

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (files[path]) {
      const [file, type] = files[path];
      res.writeHead(200, { "content-type": type });
      res.end(await readFile(file));
    } else if (path === "/lib/alreadyCompressed.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(stripTypeScriptTypes(await readFile(QUALITY_MODULE, "utf8")));
    } else if (path === "/fixtures") {
      // Decks, plus loose images as they would sit in a deck.
      const names = (await readdir(fixtures)).filter((n) => /\.(pptx|png|jpe?g)$/i.test(n));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(names));
    } else if (path.startsWith("/fixtures/")) {
      // basename() keeps the request inside the fixtures folder.
      const name = basename(path.slice("/fixtures/".length));
      // The dev server's tool pages may fetch a deck from here to test with.
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "access-control-allow-origin": "http://localhost:3000",
      });
      res.end(await readFile(join(fixtures, name)));
    } else {
      res.writeHead(404).end();
    }
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
