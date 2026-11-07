"use client";

import { CroppedImage } from "@/components/image/CroppedImage";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";

/** The deck's background as the tool shows it: a colour, or a picture cut to its crop. */
export type ShownBackground =
  | { kind: "color"; color: string }
  | { kind: "image"; url: string; crop: CropRect | null; sourceSize?: ImageDims }
  /** Nothing to show yet (a pick still on its way, or one that failed). */
  | { kind: "empty" };

/**
 * The background filling its box (of the slide's aspect): the colour, or the
 * picture cut to its Background crop, centred to cover until the crop is known.
 */
export function BackgroundFill({ background, className = "" }: { background: ShownBackground; className?: string }) {
  if (background.kind !== "image") {
    const colour = background.kind === "color" ? background.color : "var(--surface-2)";
    return <div aria-hidden="true" className={className} style={{ background: colour }} />;
  }
  return background.crop ? (
    <CroppedImage
      src={background.url}
      alt=""
      crop={background.crop}
      sourceSize={background.sourceSize}
      className={className}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={background.url} alt="" draggable={false} className={`${className} object-cover`} />
  );
}
