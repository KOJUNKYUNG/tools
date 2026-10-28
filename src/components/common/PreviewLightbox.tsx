"use client";

import { CroppedImage } from "@/components/image/CroppedImage";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";
import { CornerSpinner } from "./CornerSpinner";
import { LiveCanvas, type LivePicture } from "@/components/image/LiveCanvas";

interface PreviewLightboxProps {
  /** Image URL to enlarge. */
  src: string;
  alt: string;
  /** Aspect ratio value for the box, e.g. "16 / 9" | "4 / 3". */
  aspect: string;
  closeLabel: string;
  onClose: () => void;
  /** Show only this part of the image (its aspect is then the box's). */
  crop?: CropRect | null;
  /** The size `crop` is held in, when known before `src` loads (see CroppedImage). */
  sourceSize?: ImageDims;
  /** A live drawing standing in for `src`, laid over the part inside `crop` (needs both and `sourceSize`). */
  live?: LivePicture | null;
  /** The spinner's name while a newer version of the picture is on its way; none when it is current. */
  busyLabel?: string | null;
}

export function PreviewLightbox({ src, alt, aspect, closeLabel, onClose, crop, sourceSize, busyLabel, live }: PreviewLightboxProps) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklch, var(--surface) 92%, #000)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-full max-w-full overflow-hidden border"
        style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-lg)", aspectRatio: aspect }}
      >
        {crop ? (
          <CroppedImage src={src} alt={alt} crop={crop} sourceSize={sourceSize} className="block max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="size-full object-contain" />
        )}
        {live && crop && sourceSize ? (
          <LiveCanvas live={live} crop={crop} sourceSize={sourceSize} className="pointer-events-none absolute inset-0 size-full" />
        ) : null}
      </div>
      {busyLabel ? <CornerSpinner label={busyLabel} className="left-2.5 top-2.5" /> : null}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-[8px] border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-strong)" }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
      </button>
    </div>
  );
}
