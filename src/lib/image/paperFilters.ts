/**
 * The filter set's Paper image filters (CONTEXT "Filter set"): which Paper
 * shader and preset each one draws, and the preset's props made to fill the
 * slide. Pure: the props come from the gallery scripts' prop table
 * (scripts/gallery/paper-props.json), which the drawing loads on first use.
 */

/** Each Paper filter: its shader's key in the prop table, and the Paper preset it is drawn at. */
export const PAPER_FILTERS = {
  flutedGlass: { shader: "flutedGlass", preset: "Default" },
  paperTexture: { shader: "paperTexture", preset: "Default" },
  // One shader, two looks: dots in two colours, or in the picture's own.
  halftoneDuotone: { shader: "halftoneDots", preset: "Default" },
  halftoneMosaic: { shader: "halftoneDots", preset: "Mosaic" },
  halftoneCmyk: { shader: "halftoneCmyk", preset: "Default" },
} as const satisfies Record<string, { shader: string; preset: string }>;

/** One of the Paper filters, by the filter set's own name. */
export type PaperFilter = keyof typeof PAPER_FILTERS;

/** The Paper filters, in the order the effects group lists them. */
// Object.keys types its result as string[]; the keys are the table's own.
export const PAPER_FILTER_NAMES = Object.keys(PAPER_FILTERS) as PaperFilter[];

/**
 * A preset's props made to fill the slide: drawn to cover it, never shrunk
 * below it. Some presets frame the picture smaller (paper texture's are
 * contain at 0.9), which on a background would leave an edge around it.
 */
export function fillingProps<P extends { fit?: unknown; scale?: unknown }>(params: P): P & { fit: "cover"; scale: number } {
  const scale = typeof params.scale === "number" ? params.scale : 1;
  return { ...params, fit: "cover", scale: Math.max(1, scale) };
}
