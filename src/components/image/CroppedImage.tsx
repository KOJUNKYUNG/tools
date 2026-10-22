"use client";

import { useEffect, useState } from "react";
import type { CropRect } from "@/lib/image/maxFitCrop";

interface CroppedImageProps {
  src: string;
  alt: string;
  /** The part to show, in the picture's upright pixels. */
  crop: CropRect;
  className?: string;
}

/**
 * The part of `src` inside `crop`, as an SVG whose viewBox is the crop: it
 * fills a box of the crop's aspect (`size-full`) or, with `max-h-full
 * max-w-full`, sizes itself to the crop's aspect like an image. Nothing is
 * re-encoded, so it follows every move of a crop frame.
 */
export function CroppedImage({ src, alt, crop, className }: CroppedImageProps) {
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null);

  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) setNatural({ src, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);

  const size = natural?.src === src ? natural : null;
  return (
    <svg
      role="img"
      aria-label={alt}
      viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
      width={crop.width}
      height={crop.height}
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      {size && <image href={src} x={0} y={0} width={size.w} height={size.h} />}
    </svg>
  );
}
