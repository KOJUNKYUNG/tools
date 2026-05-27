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

export function getMime(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

export function isRenderable(ext: string): boolean {
  return RENDERABLE.has(ext.toLowerCase());
}
