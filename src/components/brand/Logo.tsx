import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  locale: string;
  className?: string;
  withText?: boolean;
}

export function Logo({ locale, className, withText = true }: LogoProps) {
  return (
    <Link
      href={`/${locale}`}
      className={cn("flex items-center gap-2 font-semibold", className)}
      aria-label="Ontab"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        {/* 책상 상판 */}
        <rect x="2" y="18" width="24" height="4" rx="1" fill="var(--wood-400)" />
        {/* 책상 다리 */}
        <rect x="4" y="22" width="2" height="4" fill="var(--wood-500)" />
        <rect x="22" y="22" width="2" height="4" fill="var(--wood-500)" />
        {/* 브라우저 탭 */}
        <path
          d="M6 18 L8 10 L20 10 L22 18 Z"
          fill="var(--wood-200)"
          stroke="var(--wood-600)"
          strokeWidth="1.2"
        />
        {/* 탭 위 도구 점 */}
        <circle cx="11" cy="14" r="1.2" fill="var(--accent-mustard)" />
        <circle cx="14" cy="14" r="1.2" fill="var(--accent-forest)" />
        <circle cx="17" cy="14" r="1.2" fill="var(--wood-600)" />
      </svg>
      {withText && <span className="text-lg tracking-tight">Ontab</span>}
    </Link>
  );
}
