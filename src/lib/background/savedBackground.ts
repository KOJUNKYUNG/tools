import { markPrepared } from "@/lib/image/preparedMark";
import type { PreparedImage, ScreenSize, SlideSize } from "@/lib/image/slideImage";
import { solidPictureFile } from "./backgroundFiles";
import type { RunBackground } from "./resolveBackground";

/**
 * The background a run used, as the result card offers it to save, so it can
 * be used again (the site keeps no presets) or shown on a screen elsewhere:
 * the picture byte for byte as the deck holds it, which goes back in
 * unchanged when uploaded again for a slide of the same shape and screen; or
 * a solid colour, which the deck holds as a fill, drawn as a picture of the
 * colour at the size the run's pictures take.
 */
export type SavedBackground =
  | { kind: "picture"; picture: PreparedImage }
  | { kind: "colour"; rgb: string; slide: SlideSize; screen: ScreenSize };

/**
 * What a run with `background` offers to save: `picture` is what the engine
 * put in the deck, null for a fill. "No background" is the theme's colour,
 * not a file, so it offers nothing.
 */
export function savedBackground(
  background: RunBackground,
  picture: PreparedImage | null,
  slide: SlideSize,
  screen: ScreenSize,
): SavedBackground | null {
  if (picture) return { kind: "picture", picture };
  if (background.kind === "fill" && background.fill.kind === "colour") {
    return { kind: "colour", rgb: background.fill.rgb, slide, screen };
  }
  return null;
}

/** `<deck>-background.jpg` or `.png`. */
export function savedBackgroundName(deckName: string, format: PreparedImage["format"]): string {
  return `${deckName}-background.${format === "jpeg" ? "jpg" : "png"}`;
}

/** The file to save, named after the deck (its name without the extension). */
export async function savedBackgroundFile(saved: SavedBackground, deckName: string): Promise<File> {
  if (saved.kind === "picture") {
    const { bytes, format } = saved.picture;
    return new File([Uint8Array.from(bytes)], savedBackgroundName(deckName, format), { type: `image/${format}` });
  }
  // Marked as settled: a flat colour's JPEG is far smaller than its PNG, so
  // measured again on re-upload it would turn into JPEG.
  const drawn = markPrepared(new Uint8Array(await (await solidPictureFile(saved.rgb, saved.slide, saved.screen)).arrayBuffer()));
  return new File([Uint8Array.from(drawn)], savedBackgroundName(deckName, "png"), { type: "image/png" });
}
