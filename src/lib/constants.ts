import {
  Layers,
  ImageDown,
  Files,
  Split,
  Archive,
  LayoutGrid,
  ImagePlus,
  FileImage,
  Shrink,
  Expand,
  Presentation,
  Minimize2,
  Stamp,
  Lock,
  type LucideIcon,
} from "lucide-react";

const MB = 1024 * 1024;

/**
 * Per-tool in-browser upload ceiling, in bytes. Everything runs client-side
 * (0-server), so this is a MEMORY guard sized to each tool's processing path —
 * not a transfer limit. There is no auth, so there are no guest/user tiers.
 *
 * `UPLOAD_LIMIT` lists only the tools whose path safely handles more than the
 * default; everything else uses `DEFAULT_UPLOAD_LIMIT`. Read via
 * `uploadLimitFor(slug)` so the per-tool value is the single source.
 *
 * TODO(limits): values are the historical caps, pending empirical per-path
 * recalibration (memory smoke test per tool).
 */
export const DEFAULT_UPLOAD_LIMIT = 10 * MB;

export const UPLOAD_LIMIT: Record<string, number> = {
  "ppt-compress": 50 * MB,
  "pdf-watermark": 50 * MB,
  "pdf-lock": 50 * MB,
};

export function uploadLimitFor(slug: string): number {
  return UPLOAD_LIMIT[slug] ?? DEFAULT_UPLOAD_LIMIT;
}

/**
 * Advisory total-size threshold for multi-file tools. The per-file cap bounds
 * each file; this bounds the SUM (the "many medium files" OOM path). Above it,
 * a tool warns that in-browser processing may be slow or run out of memory.
 * Dismissable, never blocks.
 */
export const TOTAL_SIZE_WARN = 100 * MB;

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
  icon: LucideIcon;
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
    icon: Layers,
    category: "ppt",
  },
  {
    slug: "ppt-extract",
    i18nKey: "tools.ppt-extract",
    href: "/tools/ppt-extract",
    icon: ImageDown,
    category: "ppt",
  },
  {
    slug: "ppt-compress",
    i18nKey: "tools.ppt-compress",
    href: "/tools/ppt-compress",
    icon: Minimize2,
    category: "ppt",
    keywords: ["pptx", "compress", "압축", "용량", "ppt", "줄이기"],
  },
  {
    slug: "pdf-arrange",
    i18nKey: "tools.pdf-arrange",
    href: "/tools/pdf-arrange",
    icon: LayoutGrid,
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
    icon: Files,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "pdf-split",
    i18nKey: "tools.pdf-split",
    href: "/tools/pdf-split",
    icon: Split,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "pdf-compress",
    i18nKey: "tools.pdf-compress",
    href: "/tools/pdf-compress",
    icon: Archive,
    category: "pdf",
  },
  {
    slug: "pdf-watermark",
    i18nKey: "tools.pdf-watermark",
    href: "/tools/pdf-watermark",
    icon: Stamp,
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
    icon: Lock,
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
    icon: LayoutGrid,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "image-to-pdf",
    i18nKey: "tools.image-to-pdf",
    href: "/tools/image-to-pdf",
    icon: ImagePlus,
    category: "pdf",
  },
  {
    slug: "image-to-pptx",
    i18nKey: "tools.image-to-pptx",
    href: "/tools/image-to-pptx",
    icon: Presentation,
    category: "ppt",
    keywords: ["pptx", "slides", "ppt", "image to ppt", "이미지", "슬라이드", "악보"],
  },
  {
    slug: "pdf-to-image",
    i18nKey: "tools.pdf-to-image",
    href: "/tools/pdf-to-image",
    icon: FileImage,
    category: "pdf",
  },
  {
    slug: "image-compress",
    i18nKey: "tools.image-compress",
    href: "/tools/image-compress",
    icon: Shrink,
    category: "image",
    keywords: ["heic", "heif", "iphone", "아이폰", "변환", "convert"],
  },
  {
    slug: "heic-convert",
    i18nKey: "tools.heic-convert",
    href: "/tools/heic-convert",
    icon: Shrink,
    category: "image",
    aliasOf: "image-compress",
    keywords: ["heic", "heif", "iphone", "아이폰", "jpg", "png"],
  },
  {
    slug: "image-resize",
    i18nKey: "tools.image-resize",
    href: "/tools/image-resize",
    icon: Expand,
    category: "image",
  },
];
