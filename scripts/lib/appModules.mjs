// The app's own modules served to a local measurement page: any module under
// src/ is served from /src/<path>.ts with its types stripped (transform mode,
// so parameter properties work), its "@/" and extensionless relative imports
// pointed back at this route, and each named package at the URL the server
// gives it. Shared by scripts/measure-ppt-ratios, scripts/measure-filters and
// scripts/measure-image-prep.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";

const IMPORT = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;

/**
 * `code`'s imports pointed at the server: a package in `packages` (name →
 * URL) at its URL, "@/" at /src/, an extensionless path at its .ts file.
 * Other packages are left alone; JSON keeps its extension.
 */
function browserImports(code, packages) {
  return code.replace(IMPORT, (all, lead, quote, spec) => {
    if (packages[spec]) return `${lead}${quote}${packages[spec]}${quote}`;
    if (spec.startsWith("@/")) spec = "/src/" + spec.slice(2);
    else if (!spec.startsWith(".")) return all;
    return `${lead}${quote}${/\.([cm]?[jt]s|json)$/.test(spec) ? spec : spec + ".ts"}${quote}`;
  });
}

/**
 * Answer a request for /src/<path>.ts from the repo at `root`; false when
 * `path` is not such a request.
 */
export async function serveAppModule(root, path, res, packages) {
  if (!path.startsWith("/src/") || !path.endsWith(".ts")) return false;
  const file = resolve(root, path.slice(1));
  const inside = relative(join(root, "src"), file);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    res.writeHead(404).end();
    return true;
  }
  // A folder import ("@/types") means its index, at its own URL so the
  // index's relative imports resolve inside the folder.
  if (!existsSync(file) && existsSync(file.slice(0, -3) + "/index.ts")) {
    res.writeHead(302, { location: path.slice(0, -3) + "/index.ts" }).end();
    return true;
  }
  const code = stripTypeScriptTypes(await readFile(file, "utf8"), { mode: "transform" });
  res.writeHead(200, { "content-type": "text/javascript" });
  res.end(browserImports(code, packages));
  return true;
}
