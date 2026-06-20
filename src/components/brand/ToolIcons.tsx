import type { SVGProps, JSX, ReactNode } from "react";

/**
 * Ontab tool icons — a custom Line set replacing lucide-react for the tool
 * registry. Built on a 24 grid, single-color (currentColor) so each icon
 * inverts with the active theme, hairline stroke (1.0), round caps/joins.
 *
 * Simplified vocabulary (calm, single-concept glyphs):
 *  - PDF = page (folded corner), slide = 16:9 + a title line, image = square
 *    frame + sun + a single peak.
 *  - Recurring verbs are one shape: compress = four corner arrows pulling to
 *    centre (identical for every compress tool — they never appear together, so
 *    no format mark is needed). Convert = an arrow into the target format.
 *  - lock / watermark / extract are a single object (padlock / stamp / funnel).
 *  - Overlapping marks omit the occluded edges so the back element reads as
 *    behind.
 */

export type ToolIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  size?: number | string;
};

function Icon({ size = 24, children, ...rest }: ToolIconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** pdf-lock — a padlock. */
export const ToolLockIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M8.5,11 V8 a3.5,3.5 0 0 1 7,0 V11" />
    <path d="M8,11 h8 a2,2 0 0 1 2,2 v5 a2,2 0 0 1 -2,2 h-8 a2,2 0 0 1 -2,-2 v-5 a2,2 0 0 1 2,-2 z" />
    <path d="M10.7,15 a1.3,1.3 0 1,0 2.6,0 a1.3,1.3 0 1,0 -2.6,0" />
    <path d="M12,16.3 V18" />
  </Icon>
);

/** pdf-watermark — a rubber stamp. */
export const ToolWatermarkIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9.5,11 V9.5 a2.5,2.5 0 0 1 5,0 V11" />
    <path d="M7,11 h10 a1.5,1.5 0 0 1 1.5,1.5 v1.5 a1.5,1.5 0 0 1 -1.5,1.5 h-10 a1.5,1.5 0 0 1 -1.5,-1.5 v-1.5 a1.5,1.5 0 0 1 1.5,-1.5 z" />
    <path d="M8.5,18 H15.5" />
  </Icon>
);

/** pdf-arrange (merge / split / pages) — two stacked pages. */
export const ToolArrangeIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9,8 H15 L17.5,10.5 V20.5 H9 Z" />
    <path d="M15,8 V10.5 H17.5" />
    <path d="M9,15 H5 V4 H11 L13,6 V8" />
    <path d="M11,4 V6 H13" />
  </Icon>
);

/** Compress (pdf / ppt / image) — four corner arrows pulling to centre. One
 *  glyph for every compress tool; they never share a screen, so no format mark. */
export const ToolCompressIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4.5,4.5 L9.3,9.3 M9.3,6.4 V9.3 H6.4" />
    <path d="M19.5,4.5 L14.7,9.3 M14.7,6.4 V9.3 H17.6" />
    <path d="M4.5,19.5 L9.3,14.7 M9.3,17.6 V14.7 H6.4" />
    <path d="M19.5,19.5 L14.7,14.7 M14.7,17.6 V14.7 H17.6" />
  </Icon>
);

/** ppt-extract — a funnel. */
export const ToolExtractIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4.5,4 H19.5 L13,11.5 V18 L11,17 V11.5 Z" />
  </Icon>
);

/** pdf-to-image — arrow into an image. */
export const ToolPdfToImageIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M2.5,12 H8.7 M6.5,9.7 L8.9,12 L6.5,14.3" />
    <path d="M10.5,7 H21.5 V17 H10.5 Z" />
    <path d="M12.8,9.7 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0" />
    <path d="M11,16 L15,10.5 L21,16" />
  </Icon>
);

/** image-to-pdf — arrow into a page. */
export const ToolImageToPdfIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M2.5,12 H8.7 M6.5,9.7 L8.9,12 L6.5,14.3" />
    <path d="M11.5,5 H17.5 L20.5,8 V18.5 H11.5 Z" />
    <path d="M17.5,5 V8 H20.5" />
  </Icon>
);

/** image-to-pptx — arrow into a slide. */
export const ToolImageToPptxIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M2.5,12 H8.7 M6.5,9.7 L8.9,12 L6.5,14.3" />
    <path d="M10.5,8 H21.5 V16 H10.5 Z" />
    <path d="M13,11 H17.5" />
  </Icon>
);

/** image-resize — crop brackets over an image. */
export const ToolResizeIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M5,9 V5 H9" />
    <path d="M19,15 V19 H15" />
    <path d="M9.3,9.8 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0" />
    <path d="M6.5,16 L11,11 L17.5,16" />
  </Icon>
);

/** ppt-background — a slide over a background layer. */
export const ToolBackgroundIcon = (p: ToolIconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M16.5,9.5 V4.5 H3.5 V14.5 H7.5" />
    <path d="M7.5,9.5 H20.5 V19.5 H7.5 Z" />
    <path d="M10,12.5 H15.5" />
  </Icon>
);
