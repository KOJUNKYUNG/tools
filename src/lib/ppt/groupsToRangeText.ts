// src/lib/ppt/groupsToRangeText.ts
import { serializeRange } from "@/lib/common/pageRange";
import type { BackgroundGroup } from "./groupBackgrounds";

/** Union the slideIndexes of every checked group into a canonical "1-4, 7" string. */
export function groupsToRangeText(
  groups: BackgroundGroup[],
  checkedKeys: Set<string>,
): string {
  const set = new Set<number>();
  for (const grp of groups) {
    if (checkedKeys.has(grp.key)) {
      for (const i of grp.slideIndexes) set.add(i);
    }
  }
  return serializeRange(set);
}
