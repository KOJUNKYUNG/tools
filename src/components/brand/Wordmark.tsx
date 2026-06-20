import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";

interface WordmarkProps {
  locale: string;
  className?: string;
}

export function Wordmark({ locale, className }: WordmarkProps) {
  return (
    <Link
      href={`/${locale}`}
      className={`flex items-center gap-2.5 relative ${className ?? ""}`}
      aria-label="Ontab"
    >
      <BrandMark className="w-6 h-6 shrink-0" />
      <span
        className="font-display text-[17px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        Ontab
      </span>
    </Link>
  );
}
