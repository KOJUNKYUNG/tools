import {
  ToolLockIcon,
  ToolWatermarkIcon,
  ToolArrangeIcon,
  ToolResizeIcon,
  ToolCompressIcon,
  ToolExtractIcon,
  ToolPdfToImageIcon,
  ToolImageToPdfIcon,
  ToolImageToPptxIcon,
  ToolBackgroundIcon,
  type ToolIconProps,
} from "@/components/brand/ToolIcons";
import type { JSX } from "react";

/** A tool icon component — accepts the same `size`/`className` props lucide did. */
type ToolIcon = (props: ToolIconProps) => JSX.Element;

const MB = 1024 * 1024;

/**
 * Per-tool in-browser upload ceiling, in bytes. Everything runs client-side
 * (0-server), so this is a MEMORY guard sized to each tool's processing path —
 * not a transfer limit. There is no auth, so there are no guest/user tiers.
 *
 * Values are recalibrated per processing-path class:
 *  - Streaming / sequential (bounded per item): pdf-to-image streams its output
 *    in batches, so the ceiling is the held source bytes, not the whole output;
 *    image-compress decodes one image at a time; image-resize is single-file.
 *  - Single-artifact reassembly (whole input + whole output in memory, ~3-4×
 *    peak for WASM/pdf-lib): pdf/ppt tools that load and rebuild one document.
 *
 * Read via `uploadLimitFor(slug)`; `DEFAULT_UPLOAD_LIMIT` is the fallback for
 * any slug not listed.
 *
 * Enforcement differs by intent:
 *  - Most tools HARD-block: the dropzone rejects files over the cap.
 *  - The compression tools (pdf-compress, ppt-compress, image-compress) accept
 *    any size and only WARN above their value — shrinking a big file is the
 *    whole point, so blocking it would defeat the tool. (image-compress is
 *    multi-file and warns on the SUM via `totalSizeWarnFor` instead.)
 */
export const DEFAULT_UPLOAD_LIMIT = 10 * MB;

export const UPLOAD_LIMIT: Record<string, number> = {
  // Streaming / sequential — generous (not bound by whole-output memory).
  "pdf-to-image": 80 * MB,
  "image-resize": 30 * MB,
  "image-compress": 25 * MB,
  // Single-artifact reassembly — bounded by input bytes × a memory multiplier.
  "ppt-compress": 100 * MB, // its whole purpose is large decks (church PPT)
  "pdf-compress": 50 * MB,
  "pdf-lock": 50 * MB,
  "pdf-watermark": 50 * MB,
  "pdf-arrange": 50 * MB,
  "ppt-extract": 50 * MB,
  "ppt-background": 50 * MB,
  "image-to-pdf": 25 * MB,
  "image-to-pptx": 25 * MB,
};

export function uploadLimitFor(slug: string): number {
  return UPLOAD_LIMIT[slug] ?? DEFAULT_UPLOAD_LIMIT;
}

/**
 * Per-tool advisory total-size threshold for multi-file tools. The per-file cap
 * bounds each file; this bounds the SUM (the "many medium files" OOM path).
 * Above it, a tool warns that in-browser processing may be slow or run out of
 * memory. Dismissable, never blocks. Read via `totalSizeWarnFor(slug)`.
 *
 * Group B multi-file (pdf-arrange / image-to-pdf / image-to-pptx) hold all
 * inputs + the output at once, so the sum IS the peak → lower threshold.
 * pdf-to-image streams its output and image-compress decodes sequentially, so
 * the sum is less of a peak driver → higher threshold.
 */
const DEFAULT_TOTAL_SIZE_WARN = 100 * MB;

export const TOTAL_SIZE_WARN: Record<string, number> = {
  "pdf-arrange": 120 * MB,
  "image-to-pdf": 120 * MB,
  "image-to-pptx": 120 * MB,
  "image-compress": 150 * MB,
  "pdf-to-image": 200 * MB,
};

export function totalSizeWarnFor(slug: string): number {
  return TOTAL_SIZE_WARN[slug] ?? DEFAULT_TOTAL_SIZE_WARN;
}

/**
 * Cap for a secondary image embedded ONCE into a document — the ppt-background
 * background and the pdf-watermark logo. These bypass the tool's primary
 * UPLOAD_LIMIT (which governs the .pptx/.pdf), and each inflates the output by
 * one copy of itself, so they get their own (tighter) ceiling.
 */
export const EMBEDDED_ASSET_LIMIT = 15 * MB;

/**
 * Target accumulated output bytes per batch for pdf-to-image streaming. When a
 * conversion's running output reaches this (with pages still remaining), the
 * current batch is zipped and downloaded, then memory is released before the
 * next batch. Bounds peak memory to ~one batch instead of the whole job.
 */
export const PDF_TO_IMAGE_BATCH_BYTES = 50 * MB;

export interface ToolInfo {
  slug: string;
  i18nKey: string;
  href: string;
  icon: ToolIcon;
  category: "pdf" | "ppt" | "image";
  seoDescription?: string;
  keywords?: string[];
  ogImage?: string;
  /**
   * When set, this tool is an SEO/sharing alias of the canonical tool with the
   * given slug. Alias routes stay live (and render the canonical tool) but are
   * hidden from the desk grid so only the canonical card shows.
   */
  aliasOf?: string;
}

// User-facing copy (title/description) lives in the i18n dictionaries under
// `tools.<slug>`, keyed by `i18nKey`. Keep names/wording there, not here.
export const TOOLS: ToolInfo[] = [
  {
    slug: "ppt-background",
    i18nKey: "tools.ppt-background",
    href: "/tools/ppt-background",
    icon: ToolBackgroundIcon,
    category: "ppt",
  },
  {
    slug: "ppt-extract",
    i18nKey: "tools.ppt-extract",
    href: "/tools/ppt-extract",
    icon: ToolExtractIcon,
    category: "ppt",
  },
  {
    slug: "ppt-compress",
    i18nKey: "tools.ppt-compress",
    href: "/tools/ppt-compress",
    icon: ToolCompressIcon,
    category: "ppt",
    keywords: ["pptx", "compress", "압축", "용량", "ppt", "줄이기"],
  },
  {
    slug: "pdf-arrange",
    i18nKey: "tools.pdf-arrange",
    href: "/tools/pdf-arrange",
    icon: ToolArrangeIcon,
    category: "pdf",
    keywords: [
      "merge",
      "split",
      "arrange",
      "combine",
      "합치기",
      "나누기",
      "정렬",
      "페이지",
    ],
  },
  {
    slug: "pdf-merge",
    i18nKey: "tools.pdf-merge",
    href: "/tools/pdf-merge",
    icon: ToolArrangeIcon,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "pdf-split",
    i18nKey: "tools.pdf-split",
    href: "/tools/pdf-split",
    icon: ToolArrangeIcon,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "pdf-compress",
    i18nKey: "tools.pdf-compress",
    href: "/tools/pdf-compress",
    icon: ToolCompressIcon,
    category: "pdf",
  },
  {
    slug: "pdf-watermark",
    i18nKey: "tools.pdf-watermark",
    href: "/tools/pdf-watermark",
    icon: ToolWatermarkIcon,
    category: "pdf",
    keywords: [
      "watermark",
      "page number",
      "워터마크",
      "페이지번호",
      "쪽번호",
      "도장",
      "기밀",
    ],
  },
  {
    slug: "pdf-lock",
    i18nKey: "tools.pdf-lock",
    href: "/tools/pdf-lock",
    icon: ToolLockIcon,
    category: "pdf",
    keywords: [
      "lock",
      "unlock",
      "password",
      "encrypt",
      "protect",
      "암호",
      "잠금",
      "비밀번호",
      "보호",
    ],
  },
  {
    slug: "pdf-pages",
    i18nKey: "tools.pdf-pages",
    href: "/tools/pdf-pages",
    icon: ToolArrangeIcon,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "image-to-pdf",
    i18nKey: "tools.image-to-pdf",
    href: "/tools/image-to-pdf",
    icon: ToolImageToPdfIcon,
    category: "pdf",
  },
  {
    slug: "image-to-pptx",
    i18nKey: "tools.image-to-pptx",
    href: "/tools/image-to-pptx",
    icon: ToolImageToPptxIcon,
    category: "ppt",
    keywords: ["pptx", "slides", "ppt", "image to ppt", "이미지", "슬라이드", "악보"],
  },
  {
    slug: "pdf-to-image",
    i18nKey: "tools.pdf-to-image",
    href: "/tools/pdf-to-image",
    icon: ToolPdfToImageIcon,
    category: "pdf",
  },
  {
    slug: "image-compress",
    i18nKey: "tools.image-compress",
    href: "/tools/image-compress",
    icon: ToolCompressIcon,
    category: "image",
    keywords: ["heic", "heif", "iphone", "아이폰", "변환", "convert"],
  },
  {
    slug: "heic-convert",
    i18nKey: "tools.heic-convert",
    href: "/tools/heic-convert",
    icon: ToolCompressIcon,
    category: "image",
    aliasOf: "image-compress",
    keywords: ["heic", "heif", "iphone", "아이폰", "jpg", "png"],
  },
  {
    slug: "image-resize",
    i18nKey: "tools.image-resize",
    href: "/tools/image-resize",
    icon: ToolResizeIcon,
    category: "image",
  },
];
