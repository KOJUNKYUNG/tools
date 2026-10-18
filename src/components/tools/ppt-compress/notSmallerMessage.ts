import { presetNotSmallerMessage, type CompressionPreset } from "@/lib/common/compressionPreset";
import type { PptCompressLabels } from "./labels";

/**
 * What to tell the user when `preset` could not shrink the deck. When no image
 * could be re-encoded, every preset gives the same result, so none is
 * suggested.
 */
export function notSmallerMessage(
  preset: CompressionPreset,
  anyImageReencoded: boolean,
  labels: PptCompressLabels,
): string {
  if (!anyImageReencoded) return labels.notSmallerNoImages;
  return presetNotSmallerMessage(preset, labels);
}
