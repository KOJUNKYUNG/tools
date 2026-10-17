/**
 * `names` with repeats renamed `stem (2).ext`, `stem (3).ext`, … in order, so
 * no zip entry overwrites another. The first of each name keeps it.
 */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let unique = name;
    if (used.has(unique)) {
      const dot = name.lastIndexOf(".");
      const stem = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? "" : name.slice(dot);
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n++;
      unique = `${stem} (${n})${ext}`;
    }
    used.add(unique);
    return unique;
  });
}
