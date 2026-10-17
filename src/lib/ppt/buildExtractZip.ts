import JSZip from "jszip";
import { uniqueNames } from "@/lib/common/uniqueNames";
import type { ExtractedImage } from "./extractImages";

export async function buildExtractZip(images: ExtractedImage[]): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new Error("No images to package.");
  }
  const zip = new JSZip();
  const names = uniqueNames(images.map((img) => img.name));
  images.forEach((img, i) => zip.file(names[i], img.data));
  return zip.generateAsync({ type: "uint8array" });
}
