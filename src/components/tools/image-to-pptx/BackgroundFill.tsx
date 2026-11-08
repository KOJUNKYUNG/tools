"use client";

import { CroppedImage } from "@/components/image/CroppedImage";
import { LiveCanvas, type LivePicture } from "@/components/image/LiveCanvas";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";

/** The deck's background as the tool shows it: a colour, or a picture cut to its crop. */
export type ShownBackground =
  | {
      kind: "color";
      /** The colour as its colour effects make it (CSS). */
      color: string;
      /** The colour with its filters baked in (grain, a Paper filter), laid over it; none while it stays a fill. */
      filtered?: LivePicture | null;
    }
  | {
      kind: "image";
      url: string;
      crop: CropRect | null;
      sourceSize?: ImageDims;
      /** The live drawing of the pick's recipe edit, laid over the picture; none while it is unedited. */
      live?: LivePicture | null;
      /** The cropped pick with its filters baked in, laid over all; none while it is unfiltered. */
      filtered?: LivePicture | null;
    }
  /** Nothing to show yet (a pick still on its way, or one that failed). */
  | { kind: "empty" };

/**
 * The background filling its box (of the slide's aspect): the colour, or the
 * picture cut to its Background crop, centred to cover until the crop is
 * known, with its recipe edit and filters laid over it as the editor draws
 * them. `className` places each layer (absolutely, over the same box).
 */
export function BackgroundFill({ background, className = "" }: { background: ShownBackground; className?: string }) {
  if (background.kind !== "image") {
    const colour = background.kind === "color" ? background.color : "var(--surface-2)";
    return (
      <>
        <div aria-hidden="true" className={className} style={{ background: colour }} />
        {background.kind === "color" && background.filtered ? <Filtered filtered={background.filtered} className={className} /> : null}
      </>
    );
  }
  const { url, crop, sourceSize, live, filtered } = background;
  return (
    <>
      {crop ? (
        <CroppedImage src={url} alt="" crop={crop} sourceSize={sourceSize} className={className} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} className={`${className} object-cover`} />
      )}
      {live && sourceSize ? <LiveCanvas live={live} crop={crop} sourceSize={sourceSize} className={className} /> : null}
      {filtered ? <Filtered filtered={filtered} className={className} /> : null}
    </>
  );
}

/** A filtered preview, already cut to the crop: the whole canvas fills the box. */
function Filtered({ filtered, className }: { filtered: LivePicture; className: string }) {
  return <LiveCanvas live={filtered} sourceSize={{ w: filtered.canvas.width, h: filtered.canvas.height }} className={className} />;
}
