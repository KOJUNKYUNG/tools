"use client";
import { GlassButton } from "./GlassButton";

interface PhotoLidProps {
  state: "closed" | "opening" | "open";
  locale: "ko" | "en";
  theme?: "light" | "dark";
  labels: {
    presentation: string;
    document: string;
    image: string;
    selectCategory: string;
    descriptor: string;
  };
  onOpen: (cat: "presentation" | "document" | "image") => void;
}

export function PhotoLid({ state, locale, theme = "light", labels, onOpen }: PhotoLidProps) {
  const isDark = theme === "dark";
  const labelColor = isDark ? "rgba(235,240,250,0.62)" : "rgba(40,48,64,0.55)";
  const wordmarkColor = isDark ? "rgba(245,248,255,0.94)" : "rgba(28,36,52,0.92)";
  const descriptorColor = isDark ? "rgba(220,228,240,0.72)" : "rgba(40,48,64,0.72)";
  const blend: "normal" | "multiply" = isDark ? "normal" : "multiply";
  const wordmarkShadow = isDark ? "0 1px 0 rgba(0,0,0,0.35)" : "0 1px 0 rgba(255,255,255,0.45)";
  const titleFade = state === "closed" ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ pointerEvents: state === "closed" ? "auto" : "none" }}
    >
      <div
        className="absolute left-1/2 flex flex-col items-center gap-4"
        style={{
          top: "calc(18% + var(--tweak-categories-y, 0px))",
          transform: "translateX(-50%)",
          transition: "top 200ms ease",
          pointerEvents: "auto",
        }}
      >
        <div
          className="font-body text-[9px] tracking-[0.32em] uppercase flex items-center"
          style={{ color: labelColor, mixBlendMode: blend, lineHeight: "1", height: 12 }}
        >
          {labels.selectCategory}
        </div>
        <div className="grid grid-cols-3 gap-2.5 items-center" style={{ gridAutoColumns: "1fr" }}>
          <div className="flex justify-end">
            <GlassButton onClick={() => onOpen("presentation")}>{labels.presentation}</GlassButton>
          </div>
          <div className="flex justify-center">
            <GlassButton onClick={() => onOpen("document")}>{labels.document}</GlassButton>
          </div>
          <div className="flex justify-start">
            <GlassButton onClick={() => onOpen("image")}>{labels.image}</GlassButton>
          </div>
        </div>
      </div>

      <div
        className="absolute left-1/2 flex flex-col items-center"
        style={{
          top: "50%",
          transform: `translate(-50%, calc(-50% + var(--tweak-title-y, 0px))) scale(${titleFade.scale})`,
          opacity: titleFade.opacity,
          transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 240ms ease",
        }}
      >
        <div
          style={{
            color: wordmarkColor,
            textShadow: isDark
              ? `0 calc(var(--tweak-emboss-depth, 0.5) * -1px) 0 rgba(0,0,0, calc(var(--tweak-emboss-depth, 0.5) * 0.7)), 0 calc(var(--tweak-emboss-depth, 0.5) * 1px) 0 rgba(255,255,255, calc(var(--tweak-emboss-depth, 0.5) * 0.18)), ${wordmarkShadow}`
              : `0 calc(var(--tweak-emboss-depth, 0.5) * 1px) 0 rgba(255,255,255, calc(var(--tweak-emboss-depth, 0.5) * 0.95)), 0 calc(var(--tweak-emboss-depth, 0.5) * -1px) 0 rgba(0,0,0, calc(var(--tweak-emboss-depth, 0.5) * 0.32))`,
            mixBlendMode: blend,
            lineHeight: 1,
            fontSize: 78,
            fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            textAlign: "center",
          }}
        >
          ONTAB
        </div>
        <div
          className="mt-3 font-body"
          style={{
            color: descriptorColor,
            mixBlendMode: blend,
            fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
            fontSize: 13,
            letterSpacing: "0.01em",
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {labels.descriptor}
        </div>
      </div>
    </div>
  );
}
