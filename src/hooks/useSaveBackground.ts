"use client";

import { useState } from "react";
import { savedBackgroundFile, type SavedBackground } from "@/lib/background/savedBackground";
import { downloadBlobObject } from "@/lib/pdf/downloadBlob";

/**
 * The result card's "save background" action, shared by the tools that build
 * a deck on a background: absent when the run offers nothing to save ("no
 * background"), busy while a solid colour is drawn, so a second click does
 * not save it twice.
 */
export function useSaveBackground(
  saved: SavedBackground | null,
  deckName: string,
  label: string,
): { label: string; onClick: () => void; busy: boolean } | undefined {
  const [busy, setBusy] = useState(false);
  if (!saved) return undefined;
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await savedBackgroundFile(saved, deckName);
      downloadBlobObject(file, file.name);
    } finally {
      setBusy(false);
    }
  };
  return { label, onClick: () => void onClick(), busy };
}
