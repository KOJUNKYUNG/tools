// A local static server for the gallery's browser pages: the page at /, the
// shared renderer and prop data, and @paper-design/shaders at /shaders/.
// Used by render-shaders.mjs (headless renders) and lab.mjs (the lab).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const DIST = fileURLToPath(new URL("../../node_modules/@paper-design/shaders/dist/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".map": "application/json" };
const SHARED = { "/paper-still.js": "paper-still.js", "/paper-draw.js": "paper-draw.js", "/paper-props.json": "paper-props.json" };

/**
 * Serve `page` (a file in scripts/gallery/) at / on 127.0.0.1. `handle(req, res, path)`
 * may answer other routes first by returning true. Resolves to the origin URL and a close().
 */
export async function startGalleryServer({ page, port = 0, handle }) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    try {
      if (handle && (await handle(req, res, path))) return;
      let file = null;
      if (path === "/") file = join(here, page);
      else if (SHARED[path]) file = join(here, SHARED[path]);
      else if (path.startsWith("/shaders/")) {
        const p = join(DIST, normalize(path.slice("/shaders/".length)));
        if (p.startsWith(DIST)) file = p;
      }
      if (!file) return res.writeHead(404).end();
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
    } catch (e) {
      if (!res.headersSent) res.writeHead(e.code === "ENOENT" ? 404 : 500).end(String(e.message ?? e));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { origin: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}
