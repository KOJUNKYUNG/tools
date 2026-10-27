import { CheckIcon } from "lucide-react";

/** The selected tile's border colour; pair with `<TileSelectionMark />`. */
export const selectedTileBorder = "var(--emphasis)";

/**
 * The selection marks of a gallery tile (gallery picture or colour swatch):
 * an `--emphasis` ring and the corner check. Render it as the tile's last
 * child, with the tile's border set to `selectedTileBorder`. The ring is a
 * layer above the tile's content, so it is 2px all round; an outline on the
 * tile itself was painted under the positioned picture, showing 1px there.
 */
export function TileSelectionMark() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{ boxShadow: `inset 0 0 0 1px ${selectedTileBorder}` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
        // The surface-coloured rim keeps the badge apart from a swatch of its
        // own colour (white in dark mode, black in light mode).
        style={{ background: "var(--emphasis)", color: "var(--surface)", boxShadow: "0 0 0 1.5px var(--surface)" }}
      >
        <CheckIcon className="size-3" />
      </span>
    </>
  );
}
