// Renders the Paper shader gradients listed in shaders.json to PNG sources for
// pnpm gallery:build: scripts/gallery/sources/gradient/{name}.png.
//
// Each entry is { name, shader, ...props }: `shader` is the package's shader
// name (grainGradient, staticMeshGradient, meshGradient…) and the props use the
// React component's names (colors, colorBack, softness, shape…), so props
// copied from shaders.paper.design drop straight in. The still is drawn at
// 1280 × 720 CSS px at pixel ratio 2 (2560 × 1440), the way the playground
// shows it on a high-DPI screen; `frame` fixes the time of animated shaders.
//
// Run: pnpm gallery:shaders [--only=name,name] [--out=dir] [--specs=file.json]
// Needs Chrome (CHROME_PATH overrides); WebGL runs on SwiftShader headless.

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openHeadless } from "../lib/headlessChrome.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const DIST = fileURLToPath(new URL("../../node_modules/@paper-design/shaders/dist/", import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const only = args.only?.split(",");
const outDir = args.out ?? join(here, "sources", "gradient");

const SIZE = { cssWidth: 1280, cssHeight: 720, pixelRatio: 2 };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json" };

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const file = path === "/" ? join(here, "shader-page.html") : path.startsWith("/shaders/") ? join(DIST, normalize(path.slice(9))) : null;
  if (!file || (path !== "/" && !file.startsWith(DIST))) return res.writeHead(404).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

const specs = JSON.parse(await readFile(args.specs ?? join(here, "shaders.json"), "utf8")).filter(
  (s) => !only || only.includes(s.name),
);
const chrome = await openHeadless(origin, [
  "--window-size=1400,900",
  "--force-device-scale-factor=1",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
]);
let failed = 0;
try {
  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < 100 && !(await chrome.evaluate("window.ready === true")); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const { name, ...spec } of specs) {
    try {
      const dataUrl = await chrome.evaluate(`window.render(${JSON.stringify({ ...SIZE, ...spec })})`);
      const out = join(outDir, `${name}.png`);
      await writeFile(out, Buffer.from(dataUrl.split(",")[1], "base64"));
      console.log(`${name.padEnd(20)} → ${out}`);
    } catch (e) {
      failed++;
      console.error(`${name.padEnd(20)} FAILED: ${e.message}`);
    }
  }
} finally {
  await chrome.close();
  server.close();
}
if (failed) process.exit(1);
