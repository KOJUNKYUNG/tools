"use client";

import { useEffect, useRef, useState } from "react";
import { openRecipePreview, type RecipePreview } from "@/lib/gallery/drawRecipe";
import type { PaperRecipe } from "@/lib/gallery/recipes";
import type { LivePicture } from "@/components/image/LiveCanvas";

/**
 * The live preview of a recipe edit: a 1280 × 720 canvas on the gallery
 * file's composition, drawn again at once on each change and copied as it is
 * wherever the pick shows (no picture file in between, so it follows a slider
 * as the Paper lab does). `recipe` opens the preview (it loads Paper Shaders;
 * pass it once the edit area opens, so the first change draws quickly);
 * `drawn` is what to show, null while the pick is unedited (the gallery file
 * shows then, and `live` is null). `onError` hears of a preview that failed
 * to open or draw, which would otherwise go on showing the gallery file under
 * the edit. `pending` holds while the preview is still opening.
 */
export function useRecipePreview(
  recipe: PaperRecipe | null,
  drawn: PaperRecipe | null,
  onError: () => void,
): { live: LivePicture | null; pending: boolean } {
  const [preview, setPreview] = useState<RecipePreview | null>(null);
  const [live, setLive] = useState<LivePicture | null>(null);
  /** The recipe whose preview failed (to open, or its context): the next change opens it again. */
  const [failedName, setFailedName] = useState<string | null>(null);
  // The same, for the drawing effect, which must not run again on the failure itself.
  const failedRef = useRef<string | null>(null);
  /** Bumped to open the preview again after a failure. */
  const [attempt, setAttempt] = useState(0);
  const failed = (recipeName: string | null) => {
    failedRef.current = recipeName;
    setFailedName(recipeName);
  };

  const onErrorRef = useRef(onError);
  const recipeRef = useRef(recipe);
  // The latest of each, for the effects below (synced first, as effects run in order).
  useEffect(() => {
    onErrorRef.current = onError;
    recipeRef.current = recipe;
  });
  const fail = (what: string, err: unknown) => {
    console.error(`Recipe preview failed to ${what}`, err);
    onErrorRef.current();
  };

  const name = recipe?.name ?? null;
  useEffect(() => {
    const start = recipeRef.current;
    if (!start) return;
    let open = true;
    let opened: RecipePreview | null = null;
    // A context lost after a drawing (a GPU reset, sleep) blanks the canvas
    // its copies read: drop the preview and say so, rather than show the
    // gallery file. Not the loss dispose causes, so it is let go first.
    const lost = (event: Event) => {
      setPreview(null);
      setLive(null);
      failed(start.name);
      fail("draw", event);
    };
    openRecipePreview(start)
      .then((p) => {
        if (open) {
          opened = p;
          p.canvas.addEventListener("webglcontextlost", lost);
          setPreview(p);
          failed(null);
        } else p.dispose();
      })
      .catch((err: unknown) => {
        if (!open) return;
        failed(start.name);
        fail("open", err);
      });
    return () => {
      open = false;
      opened?.canvas.removeEventListener("webglcontextlost", lost);
      opened?.dispose();
      setPreview(null);
    };
  }, [name, attempt]);

  useEffect(() => {
    // The canvas is drawn here (Paper, outside React), and which drawing it
    // holds is recorded at once, so its copies take it in the same commit.
    /* eslint-disable react-hooks/set-state-in-effect -- records the drawing of a canvas outside React */
    if (!drawn || !preview) {
      setLive(null);
      // A change after a failure tries the preview again, rather than go on
      // showing the gallery file under the edit.
      if (drawn && failedRef.current === name) setAttempt((n) => n + 1);
      return;
    }
    try {
      preview.draw(drawn);
      // A new version tells each copy to take the canvas again.
      setLive((prev) => ({ canvas: preview.canvas, version: (prev?.version ?? 0) + 1 }));
    } catch (err) {
      // The gallery file shows again under the error.
      setLive(null);
      fail("draw", err);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [drawn, preview, name]);

  return { live, pending: !!drawn && failedName !== name && !preview };
}
