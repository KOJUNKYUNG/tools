"use client";

import { useEffect, useRef, useState } from "react";
import { openRecipePreview, type RecipePreview } from "@/lib/gallery/drawRecipe";
import type { PaperRecipe } from "@/lib/gallery/recipes";

/**
 * The live preview of a recipe edit, as a blob URL of a 1280 × 720 drawing on
 * the gallery file's composition. `recipe` opens the preview (it loads Paper
 * Shaders; pass it once the edit area opens, so the first change draws
 * quickly); `drawn` is what to show, null while the pick is unedited (the
 * gallery file is shown then). Changes arriving while a drawing is under way
 * are drawn once it ends, the latest only. `onError` hears of a preview that
 * failed to open or draw, which would otherwise go on showing the gallery
 * file under the edit.
 */
export function useRecipePreview(
  recipe: PaperRecipe | null,
  drawn: PaperRecipe | null,
  onError: () => void,
): string | null {
  const [preview, setPreview] = useState<RecipePreview | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const show = (next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setUrl(next);
  };

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fail = (what: string, err: unknown) => {
    console.error(`Recipe preview failed to ${what}`, err);
    onErrorRef.current();
  };

  const name = recipe?.name ?? null;
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;
  useEffect(() => {
    const start = recipeRef.current;
    if (!start) return;
    let live = true;
    let opened: RecipePreview | null = null;
    openRecipePreview(start)
      .then((p) => {
        if (live) {
          opened = p;
          setPreview(p);
        } else p.dispose();
      })
      .catch((err: unknown) => {
        if (live) fail("open", err);
      });
    return () => {
      live = false;
      opened?.dispose();
      setPreview(null);
    };
  }, [name]);

  const latest = useRef(drawn);
  latest.current = drawn;
  const current = useRef(preview);
  current.current = preview;
  /** The preview a drawing loop is running on; that loop picks up later changes itself. */
  const busy = useRef<RecipePreview | null>(null);
  useEffect(() => {
    if (!drawn || !preview) {
      show(null);
      return;
    }
    if (busy.current === preview) return;
    busy.current = preview;
    (async () => {
      try {
        let props: PaperRecipe | null = null;
        // Draw until the latest change is the one drawn.
        while (current.current === preview && latest.current && latest.current !== props) {
          props = latest.current;
          const blob = await preview.draw(props);
          if (current.current === preview && latest.current) show(URL.createObjectURL(blob));
        }
      } catch (err) {
        if (current.current === preview) fail("draw", err);
      } finally {
        if (busy.current === preview) busy.current = null;
      }
    })();
  }, [drawn, preview]);

  useEffect(() => () => show(null), []);

  return url;
}
