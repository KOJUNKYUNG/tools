/**
 * The browser's own decoder, as a second reader of an image. Run time only:
 * Node has no `createImageBitmap`, so a Node caller would crash the check
 * (tests stand one in: `stubBrowserDecoder` in `src/lib/pdf/testImages.ts`).
 */
export async function browserDecodes(blob: Blob): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    return true;
  } catch (err) {
    // A missing decoder is a checker gap, not a broken image.
    if (err instanceof ReferenceError) throw err;
    return false;
  }
}
