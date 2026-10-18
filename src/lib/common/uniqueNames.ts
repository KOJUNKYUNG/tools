/**
 * `names` with repeats renamed `stem (2).ext`, `stem (3).ext`, … in order, so
 * no zip entry overwrites another. The first of each name keeps it. Names
 * that differ only in case count as repeats: Windows and macOS extract them
 * onto the same file.
 */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  const taken = (name: string) => used.has(name.toLowerCase());
  return names.map((name) => {
    let unique = name;
    if (taken(unique)) {
      const dot = name.lastIndexOf(".");
      const stem = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? "" : name.slice(dot);
      let n = 2;
      while (taken(`${stem} (${n})${ext}`)) n++;
      unique = `${stem} (${n})${ext}`;
    }
    used.add(unique.toLowerCase());
    return unique;
  });
}
