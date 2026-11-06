// Serves the picture preparation measurement page (index.html) on
// http://localhost:4340 (MEASURE_IMAGE_PREP_PORT overrides). The page runs
// image-to-pptx's engine entry (buildPptx, as checked out) over real pictures
// at each screen size and reports, per input set, the bytes the deck's
// pictures take, their formats, and the colour difference of each picture
// turned from PNG into JPEG (spec #147, ticket #152). Another tool adopting
// the shared preparation (image-resize, later) can measure the same inputs
// here.
//
// Run: node scripts/measure-image-prep/run-headless.mjs (headless), or
//      preview_start "measure-image-prep" (.claude/launch.json) and open /.
// Inputs come from tests/fixtures (REAL_FIXTURES_DIR overrides), local-only.

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serveAppModule } from "../lib/appModules.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../..");
const fixtures = resolve(process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures"));
const PORT = Number(process.env.MEASURE_IMAGE_PREP_PORT ?? 4340);
const PUBLIC_PDFJS = join(root, "public/pdfjs");

const files = {
  "/": [join(here, "index.html"), "text/html; charset=utf-8"],
  "/colourDifference.js": [join(root, "scripts/lib/colourDifference.js"), "text/javascript"],
  "/lib/jszip.js": [join(root, "node_modules/jszip/dist/jszip.min.js"), "text/javascript"],
};

// Packages the app's modules import by name, each a browser ES module.
// `rewrite` points a package's own bare imports at the same map.
const PACKAGE_FILES = {
  "/pkg/pptxgenjs.js": join(root, "node_modules/pptxgenjs/dist/pptxgen.es.js"),
  "/pkg/heic-to.js": join(root, "node_modules/heic-to/dist/next/heic-to.js"),
  "/pkg/pdfjs.js": join(root, "node_modules/pdfjs-dist/build/pdf.min.mjs"),
};
const PACKAGES = {
  pptxgenjs: "/pkg/pptxgenjs.js",
  "heic-to/next": "/pkg/heic-to.js",
  "pdfjs-dist": "/pkg/pdfjs.js",
  // JSZip's browser build defines a global (its script tag is on the page).
  jszip: "/lib/global/jszip.js",
};
const rewrite = (code) => code.replace(/from\s*(["'])jszip\1/g, `from "${PACKAGES.jszip}"`);

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (files[path]) {
      const [file, type] = files[path];
      res.writeHead(200, { "content-type": type });
      res.end(await readFile(file));
    } else if (path === PACKAGES.jszip) {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end("export default globalThis.JSZip;");
    } else if (PACKAGE_FILES[path]) {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(rewrite(await readFile(PACKAGE_FILES[path], "utf8")));
    } else if (path.startsWith("/pdfjs/")) {
      // pdf.js's worker, cmaps, fonts and decoders, where the app serves them.
      const file = resolve(PUBLIC_PDFJS, path.slice("/pdfjs/".length));
      const inside = relative(PUBLIC_PDFJS, file);
      if (inside.startsWith("..") || isAbsolute(inside)) return void res.writeHead(404).end();
      const bytes = await readFile(file);
      res.writeHead(200, { "content-type": file.endsWith(".mjs") ? "text/javascript" : "application/octet-stream" });
      res.end(bytes);
    } else if (await serveAppModule(root, path, res, PACKAGES)) {
      // Answered.
    } else if (path === "/fixtures") {
      // Pictures and PDFs, nested folders included; the page picks its sets.
      const names = (await readdir(fixtures, { recursive: true }))
        .map((n) => n.split(sep).join("/"))
        .filter((n) => /\.(png|jpe?g|heic|pdf)$/i.test(n))
        .sort();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(names));
    } else if (path.startsWith("/fixtures/")) {
      const file = resolve(fixtures, path.slice("/fixtures/".length));
      // Keep the request inside the folder (another drive or a UNC path
      // comes back absolute on Windows).
      const inside = relative(fixtures, file);
      if (inside.startsWith("..") || isAbsolute(inside)) return void res.writeHead(404).end();
      const bytes = await readFile(file);
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(bytes);
    } else {
      res.writeHead(404).end();
    }
  } catch (error) {
    if (!res.headersSent) res.writeHead(500).end(String(error));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
