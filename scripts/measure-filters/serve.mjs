// Serves the filter measurement page (index.html) on http://localhost:4330
// (MEASURE_FILTERS_PORT overrides). The page runs ppt-background's filter set
// (spec #123) over real photos with the app's own code, through the same
// preparation the tool applies, and reports per filter the colour difference
// the final encode adds, the file size against the unfiltered result, and
// the 4K filter time.
//
// It also serves the filter set's tuning lab at /lab (lab.html): the
// spec-end visual QA's [임시] ranges, Paper filter settings and copy, tried on
// real pictures and saved to tuning.json beside this file.
//
// Run: node scripts/measure-filters/run-headless.mjs (headless, real GPU),
//      or preview_start "measure-filters" (.claude/launch.json) and open / or /lab.
// Photos come from tests/fixtures (REAL_FIXTURES_DIR overrides): the loose
// JPEG/PNG files, subfolders included, and the pictures inside its decks;
// from the high-resolution set in tests/hires (HIRES_DIR overrides), both
// local-only; and from the site's own gallery (public/gallery).

import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serveAppModule } from "../lib/appModules.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../..");
// Each folder of pictures: listed at its route (nested folders included), its files served below it.
const folders = {
  "/fixtures": {
    dir: resolve(process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures")),
    keep: (name) => /\.(pptx|png|jpe?g)$/i.test(name),
  },
  "/hires": {
    dir: resolve(process.env.HIRES_DIR ?? join(root, "tests/hires")),
    keep: (name) => /\.png$/i.test(name),
  },
  // The gallery's full pictures, not their thumbnails.
  "/gallery": {
    dir: join(root, "public/gallery"),
    keep: (name) => /\.(png|jpe?g)$/i.test(name) && !/-thumb\./i.test(name),
  },
};
const PORT = Number(process.env.MEASURE_FILTERS_PORT ?? 4330);
const PAPER_DIST = join(root, "node_modules/@paper-design/shaders/dist");

const TUNING = join(here, "tuning.json");

const files = {
  "/": [join(here, "index.html"), "text/html; charset=utf-8"],
  "/lab": [join(here, "lab.html"), "text/html; charset=utf-8"],
  "/colourDifference.js": [join(here, "colourDifference.js"), "text/javascript"],
  // The tool's copy, which the lab edits.
  "/i18n/ko.json": [join(root, "src/i18n/dictionaries/ko.json"), "application/json"],
  "/i18n/en.json": [join(root, "src/i18n/dictionaries/en.json"), "application/json"],
  "/lib/jszip.js": [join(root, "node_modules/jszip/dist/jszip.min.js"), "text/javascript"],
  // The gallery scripts' drawing code, which the app's Paper runtime imports.
  "/scripts/gallery/paper-draw.js": [join(root, "scripts/gallery/paper-draw.js"), "text/javascript"],
};
// The app's modules import Paper by name; its files import each other relatively.
const PACKAGES = { "@paper-design/shaders": "/paper/index.js" };

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const route = /^\/[^/]+/.exec(path)?.[0]; // a picture folder's route, for a file below it
    if (path === "/api/tuning") {
      if (req.method === "PUT") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const tuning = JSON.parse(Buffer.concat(chunks).toString("utf8")); // a malformed body fails here, unsaved
        await writeFile(TUNING, JSON.stringify(tuning, null, 2) + "\n");
        return void res.writeHead(204).end();
      }
      // Nothing saved yet: the lab starts from the app's own values.
      const saved = await readFile(TUNING, "utf8").catch(() => "null");
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(saved);
    } else if (files[path]) {
      const [file, type] = files[path];
      res.writeHead(200, { "content-type": type });
      res.end(await readFile(file));
    } else if (path === "/scripts/gallery/paper-props.json") {
      // Imported as a module by the Paper runtime (a bundler's JSON import).
      const json = await readFile(join(root, "scripts/gallery/paper-props.json"), "utf8");
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(`export default ${json};`);
    } else if (path.startsWith("/paper/")) {
      const file = resolve(PAPER_DIST, path.slice("/paper/".length));
      const inside = relative(PAPER_DIST, file);
      if (inside.startsWith("..") || isAbsolute(inside)) return void res.writeHead(404).end();
      const bytes = await readFile(file);
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(bytes);
    } else if (await serveAppModule(root, path, res, PACKAGES)) {
      // Answered.
    } else if (folders[path]) {
      const { dir, keep } = folders[path];
      const names = (await readdir(dir, { recursive: true }))
        .filter(keep)
        .map((n) => n.split(sep).join("/"))
        .sort();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(names));
    } else if (folders[route]) {
      const { dir } = folders[route];
      const file = resolve(dir, path.slice(route.length + 1));
      // Keep the request inside the folder (another drive or a UNC path
      // comes back absolute on Windows).
      const inside = relative(dir, file);
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
