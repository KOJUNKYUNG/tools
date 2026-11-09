"use client";

import { useEffect, useState } from "react";
import { bakesPicture } from "@/lib/image/filterSet";
import type { RunPicture } from "@/lib/background/resolveBackground";
import type { ScreenSize, SlideSize } from "@/lib/image/slideImage";
import type { BackgroundEditorState } from "./useBackgroundEditor";

/**
 * The picture a tool's run would put in its deck, made by the run's own steps
 * (`resolveForRun`, then the tool's `prepare`: cut, fitted, filtered, saved as
 * PNG or JPEG), while `active` (the zoom fills the screen): the preview is
 * drawn at Full HD from stand-ins, and grain and dots show differently when
 * stretched to a screen, so the full screen shows the file itself. `url` is
 * null until it is made, and where the background is a fill.
 */
export function useActualBackground(
  editor: BackgroundEditorState,
  {
    active,
    slide,
    screen,
    prepare,
  }: {
    active: boolean;
    slide: SlideSize;
    screen?: ScreenSize;
    /** The picture as the tool's engine prepares it. */
    prepare: (picture: RunPicture) => Promise<Blob>;
  },
): { url: string | null; pending: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { fill, filters, resolveForRun } = editor;
  const { w, h } = slide;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the last picture goes the moment its inputs change; the new one is drawn async below
    setUrl(null);
    setPending(false);
    if (!active) return;
    // A fill (no background, or a colour its effects keep a colour) shows as its colour.
    if (fill && !(fill.kind === "colour" && bakesPicture(filters, "solid"))) return;
    let current = true;
    let made: string | null = null;
    setPending(true);
    void (async () => {
      const { background } = await resolveForRun({ slide: { w, h }, screen });
      if (background.kind !== "picture" || !current) return;
      const blob = await prepare(background);
      if (!current) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    })()
      .catch((err) => {
        // The preview stays in its place; the run reports its own failure.
        console.error("Full-screen picture failed to draw", err);
      })
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [active, fill, filters, resolveForRun, prepare, w, h, screen]);
  return { url, pending };
}
