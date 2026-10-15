/**
 * Fixture discovery for the real-file regression set (`pnpm test:real`).
 *
 * The real files live in a local, gitignored folder (the repo is public), so
 * nothing here is committed. "No files" must never read as "all good": a
 * missing folder or a folder with nothing the tool accepts is an error.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** `tests/fixtures` at the repo root; `REAL_FIXTURES_DIR` overrides it. */
export function realFixtureDir(): string {
  return path.resolve(process.env.REAL_FIXTURES_DIR ?? "tests/fixtures");
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * Every file under `dir`, nested folders included, whose extension is one of
 * `extensions` (case-insensitive), in a stable order. Throws when the folder
 * is missing or holds no applicable file.
 */
export function findRealFixtures(dir: string, extensions: readonly string[]): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`fixture folder not found: ${dir}`);
  }
  const wanted = extensions.map((e) => e.toLowerCase());
  const files = walk(dir)
    .filter((f) => wanted.includes(path.extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    throw new Error(`no ${extensions.join("/")} fixtures in ${dir}`);
  }
  return files;
}
