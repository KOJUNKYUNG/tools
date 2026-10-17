// Test-only stand-in for the canvas downscaler (never imported by the app).
import { readImageHeader } from "@/lib/output-check/imageHeader";
import type { DownscaleForSlide, PlacedImage } from "./assemblePptx";

/**
 * Node has no canvas, so the file's bytes stand in for the downscaled image,
 * sized as displayed (EXIF orientations 5–8 swap the stored sides), as the
 * browser's `createImageBitmap` reports it.
 */
export const embedAsIs: DownscaleForSlide = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) throw new Error(`cannot read the image header of ${file.name}`);
  const quarterTurned = header.orientation >= 5;
  return {
    dataUrl: `data:image/${header.format};base64,${Buffer.from(bytes).toString("base64")}`,
    w: quarterTurned ? header.height : header.width,
    h: quarterTurned ? header.width : header.height,
  };
};

/** The checker's view of a run: the images as embedded, in slide order (placement is not checked). */
export const placedAs = (dataUrls: string[]): PlacedImage[] =>
  dataUrls.map((dataUrl) => ({ dataUrl, placement: { x: 0, y: 0, w: 0, h: 0 } }));
