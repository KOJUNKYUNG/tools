import type { GalleryImage } from "@/lib/gallery/types";
import { filledSize, type SlideSize } from "@/lib/image/slideImage";

/**
 * A gallery image as the file the preparer starts from, fetched from the
 * site's own `public/gallery/` in its own format (JPEG, or PNG for pixel art),
 * so a photo stays a small JPEG instead of being turned into a large PNG first.
 */
export async function galleryImageFile(image: GalleryImage): Promise<File> {
  const response = await fetch(image.url);
  if (!response.ok) throw new Error(`Failed to load gallery image (${response.status})`);
  const blob = await response.blob();
  const ext = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `gallery-${image.id}.${ext}`, { type: blob.type });
}

/**
 * A solid colour as the picture its filters are baked into: the colour at
 * the size a picture of the slide's aspect is stored at, as a PNG (a flat
 * colour is a few KB), handed to the engine as an ordinary picture.
 */
export async function solidPictureFile(rgb: string, slide: SlideSize): Promise<File> {
  const { width, height } = filledSize(slide);
  const canvas = new OffscreenCanvas(width, height);
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.fillStyle = `#${rgb}`;
    ctx.fillRect(0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new File([blob], `solid-${rgb}.png`, { type: "image/png" });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
