// Verifies that DESIGN.md front-matter color tokens still mirror the runtime
// source of truth in src/app/globals.css (ADR-0003 sync rule). The official
// `designmd export --format css-tailwind` path is unusable here — it aborts on
// the `2xl` spacing token (not a valid Tailwind v4 identifier) before emitting
// anything — so this custom check parses both files directly.
//
// The DESIGN.md → globals.css mapping is NOT hardcoded: each color line in the
// front matter carries its anchor reference in a trailing comment, e.g.
//   primary: "#242324" # Ink — primary text & primary action (--mono-900)
// We read that `(--mono-NNN)` reference and assert the hex matches the value
// `--mono-NNN` is assigned in the globals.css `:root` block.
//
// Exit 0 when every anchor matches; exit 1 (with a diff) on any drift.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN_MD = join(repoRoot, "DESIGN.md");
const GLOBALS_CSS = join(repoRoot, "src", "app", "globals.css");

/** Parse the front-matter `colors:` block of DESIGN.md.
 * @returns {Array<{ key: string, hex: string, varName: string }>} */
function parseDesignColors(source) {
  const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    throw new Error("DESIGN.md: could not locate YAML front matter.");
  }
  const fm = fmMatch[1];

  // Slice from `colors:` to the next top-level key (a line starting in column 0).
  const colorsStart = fm.search(/^colors:[ \t]*$/m);
  if (colorsStart === -1) {
    throw new Error("DESIGN.md front matter: no `colors:` block found.");
  }
  const afterColors = fm.slice(colorsStart + fm.slice(colorsStart).indexOf("\n") + 1);
  const nextTopKey = afterColors.search(/^[A-Za-z]/m);
  const block = nextTopKey === -1 ? afterColors : afterColors.slice(0, nextTopKey);

  const colors = [];
  // key: "#hex"  # ... (--mono-NNN)
  const lineRe = /^\s+([A-Za-z][\w-]*):\s*"(#[0-9a-fA-F]{3,8})"[^\n]*\(--(mono-\d+)\)/gm;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    colors.push({ key: m[1], hex: m[2].toLowerCase(), varName: m[3] });
  }
  if (colors.length === 0) {
    throw new Error(
      "DESIGN.md `colors:` block: no `key: \"#hex\" ... (--mono-N)` entries matched. " +
        "Did the anchor-reference comment format change?",
    );
  }
  return colors;
}

/** Parse `--mono-N: #hex;` declarations from the `:root` block of globals.css.
 * @returns {Map<string, string>} varName (without leading --) → lowercase hex */
function parseGlobalsMono(source) {
  const rootStart = source.indexOf(":root");
  if (rootStart === -1) {
    throw new Error("globals.css: no `:root` block found.");
  }
  const braceStart = source.indexOf("{", rootStart);
  const braceEnd = source.indexOf("}", braceStart);
  if (braceStart === -1 || braceEnd === -1) {
    throw new Error("globals.css: malformed `:root` block.");
  }
  const block = source.slice(braceStart, braceEnd);

  const map = new Map();
  const declRe = /--(mono-\d+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let m;
  while ((m = declRe.exec(block)) !== null) {
    map.set(m[1], m[2].toLowerCase());
  }
  if (map.size === 0) {
    throw new Error("globals.css `:root`: no `--mono-N: #hex;` declarations found.");
  }
  return map;
}

function main() {
  const colors = parseDesignColors(readFileSync(DESIGN_MD, "utf8"));
  const mono = parseGlobalsMono(readFileSync(GLOBALS_CSS, "utf8"));

  const problems = [];
  const referenced = new Set();

  for (const { key, hex, varName } of colors) {
    referenced.add(varName);
    const actual = mono.get(varName);
    if (actual === undefined) {
      problems.push(
        `  colors.${key} → (--${varName}): referenced anchor is missing from globals.css :root`,
      );
    } else if (actual !== hex) {
      problems.push(
        `  colors.${key} → --${varName}: DESIGN.md ${hex} ≠ globals.css ${actual}`,
      );
    }
  }

  // Anchors defined in globals.css but never mirrored in DESIGN.md.
  for (const varName of mono.keys()) {
    if (!referenced.has(varName)) {
      problems.push(
        `  --${varName} (= ${mono.get(varName)}) exists in globals.css but no DESIGN.md color references it`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(
      `✗ DESIGN.md ↔ globals.css token drift (${problems.length} issue${problems.length > 1 ? "s" : ""}):\n` +
        problems.join("\n") +
        "\n\nThe two MUST stay in sync (ADR-0003). Fix the mismatched value in both files.",
    );
    process.exit(1);
  }

  console.log(
    `✓ DESIGN.md ↔ globals.css in sync — ${colors.length} color anchors verified.`,
  );
}

main();
