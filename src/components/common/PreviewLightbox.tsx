"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { CroppedImage } from "@/components/image/CroppedImage";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";
import { CornerSpinner } from "./CornerSpinner";
import { LiveCanvas, type LivePicture } from "@/components/image/LiveCanvas";

interface PreviewLightboxProps {
  /** Image URL to enlarge, or a solid colour shown in its place at a picture's size. */
  src: string | { colour: string; size: ImageDims };
  alt: string;
  /** Aspect ratio value for the box, e.g. "16 / 9" | "4 / 3". */
  aspect: string;
  closeLabel: string;
  onClose: () => void;
  /**
   * Names of the toggle that fills the whole screen with the picture, as a
   * slide show does, and back; no toggle without them.
   */
  fullscreenLabels?: { enter: string; exit: string };
  /** Told when the lightbox starts or stops filling the screen, so the picture can be drawn for it. */
  onFullscreenChange?: (fullscreen: boolean) => void;
  /** The finished picture itself (a URL), shown over all while the lightbox fills the screen. */
  actual?: string | null;
  /** Show only this part of the image (its aspect is then the box's). */
  crop?: CropRect | null;
  /** The size `crop` is held in, when known before `src` loads (see CroppedImage). */
  sourceSize?: ImageDims;
  /** A live drawing standing in for `src`, laid over the part inside `crop` (needs both and `sourceSize`). */
  live?: LivePicture | null;
  /** The spinner's name while a newer version of the picture is on its way; none when it is current. */
  busyLabel?: string | null;
  /** The part to show already cut and finished (filters baked in), laid over all. */
  finished?: LivePicture | null;
}

/** A square corner button over the lightbox. */
const CORNER_BUTTON = "flex size-8 items-center justify-center rounded-[8px] border";
const CORNER_STYLE = { background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-strong)" };

export function PreviewLightbox({
  src,
  alt,
  aspect,
  closeLabel,
  onClose,
  fullscreenLabels,
  onFullscreenChange,
  actual,
  crop,
  sourceSize,
  busyLabel,
  live,
  finished,
}: PreviewLightboxProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Whether the lightbox fills the screen: the browser's state, which Esc also ends.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const sync = () => {
      const now = el !== null && document.fullscreenElement === el;
      setFullscreen(now);
      onFullscreenChange?.(now);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      // Closed while filling the screen: the screen is given back.
      if (el && document.fullscreenElement === el) void document.exitFullscreen();
      // Always told, as the close button's exit may end after this listener
      // is gone: a full screen left recorded would keep the file being made.
      onFullscreenChange?.(false);
    };
  }, [onFullscreenChange]);
  const toggleFullscreen = () => {
    if (fullscreen) void document.exitFullscreen();
    // Refused (a browser or frame without it): the lightbox stays as it is.
    else void ref.current?.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={ref}
      className={fullscreen ? "flex items-center justify-center" : "absolute inset-0 z-10 flex items-center justify-center p-4"}
      // On the full screen the picture sits on black, as a slide show's slide does.
      style={{ background: fullscreen ? "#000" : "color-mix(in oklch, var(--surface) 92%, #000)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={fullscreen ? "relative max-h-full max-w-full overflow-hidden" : "relative max-h-full max-w-full overflow-hidden border"}
        style={{
          borderColor: "var(--border)",
          boxShadow: fullscreen ? undefined : "var(--shadow-lg)",
          aspectRatio: aspect,
          // Filled to the screen's height or width, whichever the slide's aspect meets first.
          ...(fullscreen ? { width: `min(100vw, calc(100vh * (${aspect})))` } : {}),
        }}
      >
        {typeof src !== "string" ? (
          // Sized like an image of that size, as CroppedImage is.
          <svg
            role="img"
            aria-label={alt}
            viewBox={`0 0 ${src.size.w} ${src.size.h}`}
            width={src.size.w}
            height={src.size.h}
            className={fullscreen ? "block size-full" : "block max-h-full max-w-full"}
          >
            <rect width="100%" height="100%" fill={src.colour} />
          </svg>
        ) : crop ? (
          <CroppedImage
            src={src}
            alt={alt}
            crop={crop}
            sourceSize={sourceSize}
            className={fullscreen ? "block size-full" : "block max-h-full max-w-full"}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="size-full object-contain" />
        )}
        {live && crop && sourceSize ? (
          <LiveCanvas live={live} crop={crop} sourceSize={sourceSize} className="pointer-events-none absolute inset-0 size-full" />
        ) : null}
        {finished ? (
          <LiveCanvas
            live={finished}
            sourceSize={{ w: finished.canvas.width, h: finished.canvas.height }}
            className="pointer-events-none absolute inset-0 size-full"
          />
        ) : null}
        {fullscreen && actual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actual} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
        ) : null}
      </div>
      {busyLabel ? <CornerSpinner label={busyLabel} className="left-2.5 top-2.5" /> : null}
      <div className="absolute right-2.5 top-2.5 flex gap-1.5">
        {fullscreenLabels && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? fullscreenLabels.exit : fullscreenLabels.enter}
            title={fullscreen ? fullscreenLabels.exit : fullscreenLabels.enter}
            className={CORNER_BUTTON}
            style={CORNER_STYLE}
          >
            {fullscreen ? <Minimize2Icon className="size-4" aria-hidden="true" /> : <Maximize2Icon className="size-4" aria-hidden="true" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (fullscreen) void document.exitFullscreen();
            onClose();
          }}
          aria-label={closeLabel}
          className={CORNER_BUTTON}
          style={CORNER_STYLE}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
