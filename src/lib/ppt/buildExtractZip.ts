import JSZip from "jszip";
import type { ExtractedImage } from "./extractImages";

export async function buildExtractZip(images: ExtractedImage[]): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new Error("No images to package.");
  }
  const zip = new JSZip();
  const used = new Set<string>();
  for (const img of images) {
    let name = img.name;
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? "" : name.slice(dot);
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n++;
      name = `${stem} (${n})${ext}`;
    }
    used.add(name);
    zip.file(name, img.data);
  }
  return zip.generateAsync({ type: "uint8array" });
}
