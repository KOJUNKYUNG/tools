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
    slug: "pdf-merge",
    title: "PDF 합치기",
    description: "여러 PDF 파일을 하나로 정밀하게 병합합니다.",
    i18nKey: "tools.pdf-merge",
    href: "/tools/pdf-merge",
    icon: Files,
    category: "pdf",
  },
  {
    slug: "pdf-split",
    title: "PDF 나누기",
    description: "페이지 단위로 나누거나 구간별로 분리합니다.",
    i18nKey: "tools.pdf-split",
    href: "/tools/pdf-split",
    icon: Split,
    category: "pdf",
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
    slug: "pdf-pages",
    title: "페이지 관리",
    description: "페이지 순서 변경, 회전, 삭제를 한 곳에서.",
    i18nKey: "tools.pdf-pages",
    href: "/tools/pdf-pages",
    icon: LayoutGrid,
    category: "pdf",
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
