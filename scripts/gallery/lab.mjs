// The shader lab: pick a Paper shader, tune its props and the frame on the
// gallery's 1280 × 720 composition, and save it to shaders.json for
// pnpm gallery:shaders. Local only (127.0.0.1).
//
// Run: pnpm gallery:lab   then open http://127.0.0.1:4320/ (GALLERY_LAB_PORT overrides)

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startGalleryServer } from "./server.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const SPECS = join(here, "shaders.json");

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

const server = await startGalleryServer({
  page: "lab.html",
  port: Number(process.env.GALLERY_LAB_PORT ?? 4320),
  async handle(req, res, path) {
    if (path !== "/api/specs") return false;
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(await readFile(SPECS, "utf8"));
      return true;
    }
    if (req.method === "PUT") {
      const specs = JSON.parse(await body(req));
      const ok = Array.isArray(specs) && specs.every((s) => s && typeof s.name === "string" && /^[a-z0-9-]+$/.test(s.name) && typeof s.shader === "string");
      if (!ok) {
        res.writeHead(400).end("Each spec needs a lowercase name (a-z, 0-9, -) and a shader.");
        return true;
      }
      await writeFile(SPECS, JSON.stringify(specs, null, 2) + "\n");
      res.writeHead(204).end();
      return true;
    }
    res.writeHead(405).end();
    return true;
  },
});
console.log(`Shader lab: ${server.origin}`);
