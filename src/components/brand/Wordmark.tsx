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
        style={{
          background: "linear-gradient(160deg, var(--ink-strong), var(--silver-600))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(20,30,60,0.15)",
        }}
      >
        <div
          className="absolute inset-[5px] rounded-[1px] border"
          style={{ borderColor: "rgba(255,255,255,0.25)" }}
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
