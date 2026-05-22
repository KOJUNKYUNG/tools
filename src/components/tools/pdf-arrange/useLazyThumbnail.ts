"use client";

import { useEffect, useRef, useState } from "react";
import type { PageKind } from "@/lib/pdf/pageItem";
import { getImageUrl, renderPdfThumbnail } from "./thumbnailCache";

export type ThumbnailStatus = "idle" | "loading" | "ready" | "error";

interface UseLazyThumbnailArgs {
  fileId: string;
  pageIndex: number;
  kind: PageKind;
  /** Raw bytes of the source file (pdf or image). */
  bytes: Uint8Array | undefined;
}

interface LazyThumbnail {
  /** Attach to the element whose visibility gates rendering. */
  ref: React.RefObject<HTMLDivElement | null>;
  src: string | null;
  status: ThumbnailStatus;
}

/**
 * Render a page thumbnail only once its card scrolls near the viewport.
 * Results are cached at module scope (see thumbnailCache), so a card that
 * re-mounts after a reorder shows instantly with no re-render.
 */
export function useLazyThumbnail({
  fileId,
  pageIndex,
  kind,
  bytes,
}: UseLazyThumbnailArgs): LazyThumbnail {
  const ref = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<ThumbnailStatus>("idle");
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || startedRef.current || !bytes) return;

    let cancelled = false;

    const render = async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      setStatus("loading");
      try {
        const result =
          kind === "image"
            ? getImageUrl(fileId, bytes)
            : await renderPdfThumbnail(fileId, pageIndex, bytes);
        if (cancelled) return;
        setSrc(result);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void render();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [fileId, pageIndex, kind, bytes]);

  return { ref, src, status };
}
