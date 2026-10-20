// Single source of browser-image-compression's Web Worker options. Its worker
// is a blob: script that importScripts() the library's UMD bundle from
// `libURL`, which defaults to cdn.jsdelivr.net. The bundle is self-hosted from
// public/browser-image-compression/ (copied by
// scripts/copy-image-compression.mjs on postinstall) so compressing makes no
// third-party request and works offline and behind network filters.

/** Self-hosted UMD bundle (same-origin, served from public/). */
export const IMAGE_COMPRESSION_LIB_PATH =
  "/browser-image-compression/browser-image-compression.js";

/**
 * Options to spread into an `imageCompression` call. `libURL` is absolute:
 * a root-relative path does not resolve against the worker's blob: URL.
 */
export function imageCompressionWorker(origin: string = self.location.origin): {
  useWebWorker: true;
  libURL: string;
} {
  return { useWebWorker: true, libURL: new URL(IMAGE_COMPRESSION_LIB_PATH, origin).href };
}
