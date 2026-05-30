export type SlideKind = "16:9" | "4:3";
/** Slide dimensions in inches (pptxgenjs unit). */
export const SLIDE_SIZES: Record<SlideKind, { w: number; h: number }> = {
  "16:9": { w: 13.333, h: 7.5 },
  "4:3": { w: 10, h: 7.5 },
};
