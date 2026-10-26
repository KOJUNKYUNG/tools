// Writes scripts/gallery/paper-props.json: for every Paper shader that needs
// no input image, the React component's props (names, kinds, ranges), how each
// prop becomes a shader uniform, and Paper's own presets. The lab and the
// headless renderer read it, so props copied from shaders.paper.design mean
// exactly what they mean there.
//
// Source: @paper-design/shaders-react at the version of the installed
// @paper-design/shaders (Apache-2.0, © Lost Coast Labs), fetched with
// `npm pack` into a temp folder; nothing is installed. Ranges come from the
// uniform docs in @paper-design/shaders' .d.ts files.
//
// Run after bumping @paper-design/shaders: node scripts/gallery/extract-paper-props.mjs

import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as paper from "@paper-design/shaders";

const here = fileURLToPath(new URL(".", import.meta.url));
const vanillaDir = fileURLToPath(new URL("../../node_modules/@paper-design/shaders/", import.meta.url));
const version = JSON.parse(readFileSync(join(vanillaDir, "package.json"), "utf8")).version;

const tmp = mkdtempSync(join(tmpdir(), "paper-react-"));
try {
  const tgz = execSync(`npm pack @paper-design/shaders-react@${version} --silent`, { cwd: tmp, encoding: "utf8" })
    .trim().split("\n").pop();
  execFileSync("tar", ["-xzf", tgz], { cwd: tmp });
  const reactDir = join(tmp, "package", "dist", "shaders");

  /** Ranges and option docs per uniform, from `- u_name (type): text (min to max)`. */
  function uniformDocs(file) {
    const docs = {};
    let text;
    try { text = readFileSync(join(vanillaDir, "dist", "shaders", file.replace(/\.js$/, ".d.ts")), "utf8"); } catch { return docs; }
    for (const m of text.matchAll(/- (u_\w+) \(([^)]+)\): (.*)/g)) {
      const range = m[3].match(/\((-?[\d.]+) to (-?[\d.]+)\)\s*$/);
      docs[m[1]] = { type: m[2], text: m[3].trim(), min: range ? Number(range[1]) : undefined, max: range ? Number(range[2]) : undefined };
    }
    return docs;
  }

  const shaders = {};
  for (const file of readdirSync(reactDir).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(reactDir, file), "utf8");
    if (src.includes("u_image")) continue; // filters and logo effects need an input picture
    const component = src.match(/const (\w+) = memo\(function/)?.[1];
    const fragment = src.match(/\b(\w+FragmentShader)\b/)?.[1];
    const block = src.match(/const uniforms = \{([\s\S]*?)\n  \};/)?.[1];
    if (!component || !fragment || !block) throw new Error(`cannot read ${file}`);
    const name = fragment.replace(/FragmentShader$/, "");
    const docs = uniformDocs(file);

    const props = {};
    let noiseTexture = false;
    for (const line of block.split("\n")) {
      const m = line.match(/^\s*(u_\w+): (.+?),?\s*$/);
      if (!m) continue;
      const [, uniform, expr] = m;
      const doc = docs[uniform] ?? {};
      let match;
      if (expr === "getShaderNoiseTexture()") noiseTexture = true;
      else if ((match = expr.match(/^(\w+)\.map\(getShaderColorFromString\)$/))) {
        const meta = paper[`${name}Meta`];
        props[match[1]] = { uniform, kind: "colors", max: meta?.maxColorCount ?? 10, doc: doc.text };
      } else if (/^\w+\.length$/.test(expr)) {
        // u_colorsCount follows the colors list
      } else if ((match = expr.match(/^getShaderColorFromString\((\w+)\)$/))) {
        props[match[1]] = { uniform, kind: "color", doc: doc.text };
      } else if ((match = expr.match(/^(\w+)\[(\w+)\]$/))) {
        props[match[2]] = { uniform, kind: "enum", enum: match[1], options: Object.keys(paper[match[1]]), doc: doc.text };
      } else if ((match = expr.match(/^(\w+)(?: \?\? .*)?$/))) {
        props[match[1]] = { uniform, kind: "number", min: doc.min, max: doc.max, doc: doc.text };
      } else {
        throw new Error(`${file}: unknown uniform expression ${uniform}: ${expr}`);
      }
    }

    // Presets: evaluate each preset object literal with the vanilla exports in scope.
    const presetNames = src.match(/const \w+Presets = \[([^\]]*)\]/)?.[1].split(",").map((s) => s.trim()) ?? [];
    const scope = Object.keys(paper).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
    const presets = presetNames.map((v) => {
      const literal = src.match(new RegExp(`const ${v} = (\\{[\\s\\S]*?\\n\\});`))?.[1];
      if (!literal) throw new Error(`${file}: preset ${v} not found`);
      return new Function(...scope, `return (${literal});`)(...scope.map((k) => paper[k]));
    });
    const sizing = /\.\.\.defaultPatternSizing/.test(src) ? "pattern" : "object";
    shaders[name] = { component, fragment, sizing, noiseTexture, props, presets };
  }
  const out = join(here, "paper-props.json");
  writeFileSync(out, JSON.stringify({ source: `@paper-design/shaders-react@${version} (Apache-2.0, Lost Coast Labs)`, version, shaders }, null, 1) + "\n");
  console.log(`wrote ${out}: ${Object.keys(shaders).length} shaders`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
