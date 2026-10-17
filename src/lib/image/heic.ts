const HEIC_EXT = /\.(heic|heif)$/i;

/** JPEGs this module made from HEIC/HEIF files (see `isConvertedFromHeic`). */
const convertedFromHeic = new WeakSet<File>();

/** True if `file` is a JPEG that `normalizeImageFile` made from a HEIC/HEIF:
 *  its format is not the one the user picked, so turning it into JPEG is a
 *  conversion, not a compression. */
export function isConvertedFromHeic(file: File): boolean {
  return convertedFromHeic.has(file);
}

/** True if the file looks like HEIC/HEIF (browsers often report an empty MIME
 *  type for these, so the extension is the reliable signal). */
export function isHeicFile(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    HEIC_EXT.test(file.name)
  );
}

/** Convert a HEIC/HEIF file to a JPEG File. Lazy-loads `heic-to` (the Next.js
 *  build variant, `heic-to/next`) so its libheif wasm only downloads when a HEIC
 *  is actually present. Non-HEIC files are returned unchanged. Throws on decode
 *  failure so callers can surface it. */
export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const { heicTo } = await import("heic-to/next");
  const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  const name = file.name.replace(HEIC_EXT, "") + ".jpg";
  const jpeg = new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  convertedFromHeic.add(jpeg);
  return jpeg;
}

/** Normalize a batch sequentially (bounds memory for multi-photo HEIC dumps). */
export async function normalizeImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) out.push(await normalizeImageFile(f));
  return out;
}
