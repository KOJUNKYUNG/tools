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
  type LucideIcon,
} from "lucide-react";

export const FILE_SIZE_LIMIT = {
  guest: 10 * 1024 * 1024,
  user: 50 * 1024 * 1024,
} as const;

export interface ToolInfo {
  slug: string;
  title: string;
  description: string;
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

export const TOOLS: ToolInfo[] = [
  {
    slug: "ppt-background",
    title: "PPT 배경 바꾸기",
    description: "PPTX 슬라이드 배경을 한 번에 일괄 교체합니다.",
    i18nKey: "tools.ppt-background",
    href: "/tools/ppt-background",
    icon: Layers,
    category: "ppt",
  },
  {
    slug: "ppt-extract",
    title: "PPT 이미지 추출",
    description: "프레젠테이션에 포함된 모든 이미지를 꺼내옵니다.",
    i18nKey: "tools.ppt-extract",
    href: "/tools/ppt-extract",
    icon: ImageDown,
    category: "ppt",
  },
  {
    slug: "ppt-compress",
    title: "PPT 용량 줄이기",
    description: "PPTX 속 이미지를 다시 압축해 파일 크기를 줄입니다.",
    i18nKey: "tools.ppt-compress",
    href: "/tools/ppt-compress",
    icon: Minimize2,
    category: "ppt",
    keywords: ["pptx", "compress", "압축", "용량", "ppt", "줄이기"],
  },
  {
    slug: "pdf-arrange",
    title: "PDF 합치기 / 나누기 / 정렬",
    description: "여러 PDF를 하나로 합치거나, 구분선으로 여러 파일로 나눕니다.",
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
    title: "PDF 합치기",
    description: "여러 PDF 파일을 하나로 정밀하게 병합합니다.",
    i18nKey: "tools.pdf-merge",
    href: "/tools/pdf-merge",
    icon: Files,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "pdf-split",
    title: "PDF 나누기",
    description: "페이지 단위로 나누거나 구간별로 분리합니다.",
    i18nKey: "tools.pdf-split",
    href: "/tools/pdf-split",
    icon: Split,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "pdf-compress",
    title: "PDF 용량 줄이기",
    description: "품질 손실 없이 파일 크기를 줄입니다.",
    i18nKey: "tools.pdf-compress",
    href: "/tools/pdf-compress",
    icon: Archive,
    category: "pdf",
  },
  {
    slug: "pdf-watermark",
    title: "PDF 워터마크 / 페이지번호",
    description: "PDF에 페이지 번호를 찍거나 워터마크를 넣습니다.",
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
    slug: "pdf-pages",
    title: "페이지 관리",
    description: "페이지 순서 변경, 회전, 삭제를 한 곳에서.",
    i18nKey: "tools.pdf-pages",
    href: "/tools/pdf-pages",
    icon: LayoutGrid,
    category: "pdf",
    aliasOf: "pdf-arrange",
  },
  {
    slug: "image-to-pdf",
    title: "이미지 → PDF",
    description: "이미지 여러 장을 하나의 PDF로 묶습니다.",
    i18nKey: "tools.image-to-pdf",
    href: "/tools/image-to-pdf",
    icon: ImagePlus,
    category: "pdf",
  },
  {
    slug: "image-to-pptx",
    title: "이미지 → PPT",
    description: "이미지를 배경 위 원하는 위치·크기로 배치해 PPTX로 만듭니다.",
    i18nKey: "tools.image-to-pptx",
    href: "/tools/image-to-pptx",
    icon: Presentation,
    category: "ppt",
    keywords: ["pptx", "slides", "ppt", "image to ppt", "이미지", "슬라이드", "악보"],
  },
  {
    slug: "pdf-to-image",
    title: "PDF → 이미지",
    description: "PDF의 각 페이지를 고해상도 이미지로 변환합니다.",
    i18nKey: "tools.pdf-to-image",
    href: "/tools/pdf-to-image",
    icon: FileImage,
    category: "pdf",
  },
  {
    slug: "image-compress",
    title: "이미지 압축·변환",
    description: "여러 이미지를 한 번에 압축하고 포맷을 바꿉니다.",
    i18nKey: "tools.image-compress",
    href: "/tools/image-compress",
    icon: Shrink,
    category: "image",
    keywords: ["heic", "heif", "iphone", "아이폰", "변환", "convert"],
  },
  {
    slug: "heic-convert",
    title: "HEIC 변환",
    description: "아이폰 HEIC 사진을 JPG·PNG로 변환합니다.",
    i18nKey: "tools.heic-convert",
    href: "/tools/heic-convert",
    icon: Shrink,
    category: "image",
    aliasOf: "image-compress",
    keywords: ["heic", "heif", "iphone", "아이폰", "jpg", "png"],
  },
  {
    slug: "image-resize",
    title: "이미지 크기 변경",
    description: "픽셀·비율을 유지하며 일괄 리사이즈합니다.",
    i18nKey: "tools.image-resize",
    href: "/tools/image-resize",
    icon: Expand,
    category: "image",
  },
];
