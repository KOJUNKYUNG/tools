import Link from "next/link";

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
      <div
        className="w-6 h-6 rounded-[3px] relative"
        style={{ background: "var(--ink-strong)" }}
      >
        <div
          className="absolute inset-[5px] rounded-[1px] border"
          style={{ borderColor: "var(--surface)" }}
        />
      </div>
      <span
        className="font-display text-[17px] font-semibold tracking-[0.08em]"
        style={{ color: "var(--headline)" }}
      >
        ONTAB
      </span>
    </Link>
  );
}
