interface BiProps {
  ko: string;
  en: string;
  locale?: "ko" | "en";
  size?: "xl" | "lg" | "md" | "sm" | "xs";
  className?: string;
  align?: "left" | "center" | "right";
}

const sizes = {
  xl: "text-[44px] font-display font-semibold tracking-[0.08em] leading-[1.05]",
  lg: "text-[22px] font-display font-semibold tracking-[0.02em] leading-[1.2]",
  md: "text-[14px] font-display font-semibold tracking-[0.01em] leading-[1.25]",
  sm: "text-[12px] font-body font-medium tracking-[0.02em] leading-[1.2]",
  xs: "text-[11px] font-body font-medium tracking-[0.05em] leading-[1.2]",
} as const;

export function Bi({ ko, en, locale = "ko", size = "md", className = "", align = "center" }: BiProps) {
  const ta = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  const text = locale === "en" ? en || ko : ko;
  const fontClass = locale === "en" ? "font-display" : "font-ko";
  return (
    <div className={`${ta} ${className}`}>
      <div className={`${sizes[size]} ${fontClass}`} style={{ color: "var(--headline)" }}>
        {text}
      </div>
    </div>
  );
}
