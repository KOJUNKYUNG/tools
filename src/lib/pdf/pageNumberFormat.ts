export const PAGE_NUMBER_FORMATS = ["plain", "fraction", "dash", "ko"] as const;
export type PageNumberFormat = (typeof PAGE_NUMBER_FORMATS)[number];

export interface FormatPageNumberInput {
  /** 0-based page index within the document. */
  index: number;
  /** Total page count of the document. */
  total: number;
  /** Displayed number for the first page (1 = natural). */
  start: number;
  format: PageNumberFormat;
  /** Unit suffix for the "ko" format. Locale-supplied ("쪽" / "p"). Default "쪽". */
  suffix?: string;
}

/**
 * Map a page index to its displayed string. Pure — drives both the live
 * preview and the export, so they can never disagree.
 */
export function formatPageNumber({
  index,
  total,
  start,
  format,
  suffix,
}: FormatPageNumberInput): string {
  const n = index + start;
  switch (format) {
    case "fraction":
      return `${n} / ${total}`;
    case "dash":
      return `- ${n} -`;
    case "ko":
      return `${n}${suffix ?? "쪽"}`;
    case "plain":
    default:
      return `${n}`;
  }
}
