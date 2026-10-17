const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
};

const RENDERABLE = new Set(["png", "jpg", "jpeg", "gif", "bmp"]);

export function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

const EXTRACTABLE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp",
  "tiff", "tif", "svg", "emf", "wmf",
]);

/** A .pptx part ppt-extract extracts: an image file under `ppt/media/`. */
export function isImageMediaPath(path: string): boolean {
  return path.startsWith("ppt/media/") && EXTRACTABLE_EXTENSIONS.has(getExt(path));
}

export function getMime(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

export function isRenderable(ext: string): boolean {
  return RENDERABLE.has(ext.toLowerCase());
}

/**
 * Render a format-count map as a sorted breakdown string,
 * e.g. `{PNG: 12, JPG: 3, EMF: 2}` -> "PNG 12 · JPG 3 · EMF 2".
 * Keys are used verbatim — caller controls case.
 */
export function formatBreakdownString(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, n]) => `${ext} ${n}`)
    .join(" · ");
}
