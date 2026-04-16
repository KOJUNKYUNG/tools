import {
  ImageIcon,
  FileOutputIcon,
  MergeIcon,
  ImageDownIcon,
  PaintbrushIcon,
  ArchiveIcon,
  ScissorsIcon,
  FileStackIcon,
  ImageMinusIcon,
  MaximizeIcon,
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
  href: string;
  icon: LucideIcon;
  category: "pdf" | "ppt" | "image";
}

export const TOOLS: ToolInfo[] = [
  {
    slug: "image-to-pdf",
    title: "이미지 → PDF",
    description: "JPG/PNG 이미지를 하나의 PDF 파일로 변환합니다.",
    href: "/tools/image-to-pdf",
    icon: ImageIcon,
    category: "pdf",
  },
  {
    slug: "pdf-to-image",
    title: "PDF → 이미지",
    description: "PDF 페이지를 JPG/PNG 이미지로 추출합니다.",
    href: "/tools/pdf-to-image",
    icon: FileOutputIcon,
    category: "pdf",
  },
  {
    slug: "pdf-merge",
    title: "PDF 합치기",
    description: "여러 PDF 파일을 하나로 병합합니다.",
    href: "/tools/pdf-merge",
    icon: MergeIcon,
    category: "pdf",
  },
  {
    slug: "pdf-compress",
    title: "PDF 압축",
    description: "PDF 파일 용량을 줄입니다. 브라우저에서 안전하게 처리됩니다.",
    href: "/tools/pdf-compress",
    icon: ArchiveIcon,
    category: "pdf",
  },
  {
    slug: "pdf-split",
    title: "PDF 분할",
    description: "페이지 범위 추출 또는 전체 페이지 개별 분리를 지원합니다.",
    href: "/tools/pdf-split",
    icon: ScissorsIcon,
    category: "pdf",
  },
  {
    slug: "pdf-pages",
    title: "PDF 페이지 관리",
    description: "페이지 순서 변경, 회전, 삭제 후 새 PDF로 저장합니다.",
    href: "/tools/pdf-pages",
    icon: FileStackIcon,
    category: "pdf",
  },
  {
    slug: "ppt-extract",
    title: "PPT 이미지 추출",
    description: "PPT/PPTX에서 모든 이미지를 ZIP으로 추출합니다.",
    href: "/tools/ppt-extract",
    icon: ImageDownIcon,
    category: "ppt",
  },
  {
    slug: "ppt-background",
    title: "PPT 배경 변경",
    description: "PPTX 슬라이드 배경을 일괄 교체합니다.",
    href: "/tools/ppt-background",
    icon: PaintbrushIcon,
    category: "ppt",
  },
  {
    slug: "image-compress",
    title: "이미지 압축 · 변환",
    description: "JPG/PNG/WebP 이미지를 압축하거나 포맷을 변환합니다.",
    href: "/tools/image-compress",
    icon: ImageMinusIcon,
    category: "image",
  },
  {
    slug: "image-resize",
    title: "이미지 크기 변경",
    description: "픽셀, 비율, 프리셋으로 이미지 해상도를 조정합니다.",
    href: "/tools/image-resize",
    icon: MaximizeIcon,
    category: "image",
  },
];
