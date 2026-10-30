// Serves the ppt-compress ratio measurement page (index.html) on
// http://localhost:4310 (MEASURE_PORT overrides). The page re-encodes every
// image in the real-file decks, and each loose JPEG/PNG, with the engine's own
// encoder (browser-image-compression, from node_modules) and resizer, and
// reports how much each preset step leaves.
//
// It also encodes lossless originals (PNGs under tests/lossless, e.g. the
// Kodak suite, and the HEIC fixtures) as fresh JPEGs at a range of qualities,
// to measure how much a fresh JPEG of each source quality leaves.
//
// The high-resolution set (tests/hires) holds lossless pictures larger than
// any downsampling target, to calibrate and hold out the downsampled path.
// Its source and licence are documented in index.html.
//
// Run: preview_start "measure-ppt-ratios" (.claude/launch.json), or
//      node scripts/measure-ppt-ratios/serve.mjs, or headless with
//      node scripts/measure-ppt-ratios/run-headless.mjs
// Decks come from tests/fixtures (REAL_FIXTURES_DIR overrides), lossless
// originals from tests/lossless (LOSSLESS_DIR overrides), the high-resolution
// set from tests/hires (HIRES_DIR overrides); all local-only.
// The dev server's tool pages (localhost, any port) may also fetch a deck from
// /fixtures/<name> to check an estimate against a real compression.

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join, basename, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { serveAppModule } from "../lib/appModules.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../..");
const fixtures = process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures");
const PORT = Number(process.env.MEASURE_PORT ?? 4310);

// Folders of lossless PNG originals, each listed at its route and served
// below it.
const pngFolders = {
  "/lossless": resolve(process.env.LOSSLESS_DIR ?? join(root, "tests/lossless")),
  "/hires": resolve(process.env.HIRES_DIR ?? join(root, "tests/hires")),
};

const files = {
  "/": [join(here, "index.html"), "text/html; charset=utf-8"],
  "/lib/bic.js": [
    join(root, "node_modules/browser-image-compression/dist/browser-image-compression.js"),
    "text/javascript",
  ],
  "/lib/jszip.js": [join(root, "node_modules/jszip/dist/jszip.min.js"), "text/javascript"],
  "/lib/cfb.js": [join(root, "node_modules/cfb/dist/cfb.min.js"), "text/javascript"],
  "/lib/heic-to.js": [join(root, "node_modules/heic-to/dist/heic-to.js"), "text/javascript"],
};

// The page runs the app's own code (scripts/lib/appModules.mjs), each
// package at the global its script tag on the page defines (served as
// /lib/global/<package>.js).
const PAGE_GLOBALS = { jszip: "JSZip", "browser-image-compression": "imageCompression", cfb: "CFB" };
const GLOBAL_ROUTE = /^\/lib\/global\/(.+)\.js$/;
const PACKAGES = Object.fromEntries(Object.keys(PAGE_GLOBALS).map((name) => [name, `/lib/global/${name}.js`]));

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const inFolder = /^(\/[^/]+)\/(.+)$/.exec(path); // [, route, file inside it]
    const pageGlobal = PAGE_GLOBALS[GLOBAL_ROUTE.exec(path)?.[1]];
    if (files[path]) {
      const [file, type] = files[path];
      res.writeHead(200, { "content-type": type });
      res.end(await readFile(file));
    } else if (pageGlobal) {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(`export default globalThis.${pageGlobal};`);
    } else if (await serveAppModule(root, path, res, PACKAGES)) {
      // Answered.
    } else if (path === "/fixtures") {
      // Decks, loose images as they would sit in a deck, and HEIC originals.
      const names = (await readdir(fixtures)).filter((n) => /\.(pptx|png|jpe?g|heic)$/i.test(n));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(names));
    } else if (pngFolders[path]) {
      // Lossless PNG originals, nested folders included (one per set).
      const names = (await readdir(pngFolders[path], { recursive: true }))
        .filter((n) => /\.png$/i.test(n))
        .map((n) => n.split(sep).join("/"))
        .sort();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(names));
    } else if (inFolder && pngFolders[inFolder[1]]) {
      const folder = pngFolders[inFolder[1]];
      const file = resolve(folder, inFolder[2]);
      // Keep the request inside the folder (another drive or a UNC path
      // comes back absolute on Windows).
      const inside = relative(folder, file);
      if (inside.startsWith("..") || isAbsolute(inside)) return void res.writeHead(404).end();
      const bytes = await readFile(file); // before the headers, so a miss can still 500
      res.writeHead(200, { "content-type": "image/png" });
      res.end(bytes);
    } else if (path.startsWith("/fixtures/")) {
      // basename() keeps the request inside the fixtures folder.
      const name = basename(path.slice("/fixtures/".length));
      // Any local dev server port: next dev moves off 3000 when it is taken.
      const origin = req.headers.origin ?? "";
      const local = /^http:\/\/localhost:\d+$/.test(origin);
      const bytes = await readFile(join(fixtures, name)); // before the headers, so a miss can still 500
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        ...(local && { "access-control-allow-origin": origin }),
      });
      res.end(bytes);
    } else {
      res.writeHead(404).end();
    }
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
