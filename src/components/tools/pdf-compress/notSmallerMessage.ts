import { presetNotSmallerMessage, type CompressionPreset } from "@/lib/common/compressionPreset";
import type { PdfCompressLabels } from "./labels";

/**
 * What to tell the user when `preset` could not shrink the file. When images
 * were left as they are to avoid damage, a stronger preset would do the same,
 * so none is suggested.
 */
export function notSmallerMessage(
  preset: CompressionPreset,
  imageReencodeSkipped: boolean,
  labels: PdfCompressLabels,
): string {
  if (imageReencodeSkipped) return labels.notSmallerImagesKept;
  return presetNotSmallerMessage(preset, labels);
}
