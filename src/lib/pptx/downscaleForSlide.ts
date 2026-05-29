/**
 * Downscale `file` so its long edge is at most `maxLongEdgePx`, then encode.
 * Returns a data URL (for pptxgenjs addImage({ data })). Keeps aspect ratio.
 * Images already smaller are re-encoded at native size (no upscale).
 */
export async function downscaleForSlide(
  file: File, maxLongEdgePx: number,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > maxLongEdgePx ? maxLongEdgePx / longEdge : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const nativeW = bitmap.width; const nativeH = bitmap.height;
  bitmap.close();
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mime, 0.9);
  canvas.width = 0; canvas.height = 0;
  return { dataUrl, w: nativeW, h: nativeH };
}
/** Long-edge cap for embedded images (≈ 16:9 slide width at ~144 DPI). */
export const SLIDE_IMAGE_MAX_LONG_EDGE = 1920;
