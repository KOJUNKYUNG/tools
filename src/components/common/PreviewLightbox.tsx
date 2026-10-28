"use client";

import { CroppedImage } from "@/components/image/CroppedImage";
import type { CropRect, ImageDims } from "@/lib/image/maxFitCrop";
import { CornerSpinner } from "./CornerSpinner";

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
  /** The size `crop` is held in, when `src` is a smaller stand-in (see CroppedImage). */
  sourceSize?: ImageDims;
  /** The spinner's name while a newer version of the picture is on its way; none when it is current. */
  busyLabel?: string | null;
}

export function PreviewLightbox({ src, alt, aspect, closeLabel, onClose, crop, sourceSize, busyLabel }: PreviewLightboxProps) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklch, var(--surface) 92%, #000)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-full max-w-full overflow-hidden border"
        style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-lg)", aspectRatio: aspect }}
      >
        {crop ? (
          <CroppedImage src={src} alt={alt} crop={crop} sourceSize={sourceSize} className="block max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="size-full object-contain" />
        )}
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
