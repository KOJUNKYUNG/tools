// Renders the Paper shader gradients listed in shaders.json to PNG sources for
// pnpm gallery:build: scripts/gallery/sources/{category}/{name}.png (category
// gradient by default, or pattern).
//
// Each entry is { name, shader, frame, ...props }: `shader` is the shader's key
// in paper-props.json (meshGradient, dotGrid…) or its React component name
// (MeshGradient, DotGrid…), and the props are the React component's, so props
// copied from shaders.paper.design or saved from the lab (pnpm gallery:lab)
// mean the same here. The still is drawn at 1280 × 720 CSS px at 2× (2560 × 1440)
// by paper-still.js; `frame` fixes the moment of an animated shader.
//
// Run: pnpm gallery:shaders [--only=name,name] [--out=dir] [--specs=file.json] [--pixel-ratio=2]
// Needs Chrome (CHROME_PATH overrides); WebGL runs on SwiftShader headless.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openHeadless } from "../lib/headlessChrome.mjs";
import { startGalleryServer } from "./server.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const only = args.only?.split(",");
const pixelRatio = Number(args["pixel-ratio"] ?? 2);
const outDirFor = (spec) => args.out ?? join(here, "sources", spec.category ?? "gradient");

const specs = JSON.parse(await readFile(args.specs ?? join(here, "shaders.json"), "utf8")).filter(
  (s) => !only || only.includes(s.name),
);
const server = await startGalleryServer({ page: "shader-page.html" });
const chrome = await openHeadless(server.origin, [
  "--window-size=1400,900",
  // Room for a 3× still (3840 × 2160) in one WebGL canvas.
  "--force-gpu-mem-available-mb=2048",
  "--force-device-scale-factor=1",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
]);
let failed = 0;
try {
  for (let i = 0; i < 100 && !(await chrome.evaluate("window.ready === true")); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const spec of specs) {
    try {
      const dataUrl = await chrome.evaluate(`window.render(${JSON.stringify(spec)}, ${pixelRatio})`);
      const dir = outDirFor(spec);
      await mkdir(dir, { recursive: true });
      const out = join(dir, `${spec.name}.png`);
      await writeFile(out, Buffer.from(dataUrl.split(",")[1], "base64"));
      console.log(`${spec.name.padEnd(20)} → ${out}`);
    } catch (e) {
      failed++;
      console.error(`${spec.name.padEnd(20)} FAILED: ${e.message}`);
    }
  }
} finally {
  await chrome.close();
  server.close();
}
if (failed) process.exit(1);
