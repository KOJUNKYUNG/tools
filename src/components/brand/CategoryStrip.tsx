"use client";
import { memo } from "react";
import { ArrowLeft } from "lucide-react";
import { GlassButton } from "./GlassButton";

interface CategoryStripProps {
  active: "presentation" | "document" | "image";
  labels: { presentation: string; document: string; image: string };
  backLabel: string;
  theme?: "light" | "dark";
  onSelect: (cat: "presentation" | "document" | "image") => void;
  onBack: () => void;
}

const ORDER: Array<"presentation" | "document" | "image"> = ["presentation", "document", "image"];

function CategoryStripImpl({ active, labels, backLabel, theme = "light", onSelect, onBack }: CategoryStripProps) {
  const isDark = theme === "dark";
  const labelColor = isDark ? "rgba(235,240,250,0.62)" : "rgba(40,48,64,0.55)";
  const blend: "normal" | "multiply" = isDark ? "normal" : "multiply";
  return (
    <div
      className="absolute left-1/2 flex flex-col items-center gap-4"
      style={{
        top: "calc(18% + var(--tweak-categories-y, 0px))",
        transform: "translateX(-50%)",
        transition: "top 200ms ease",
      }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 font-body text-[9px] tracking-[0.32em] uppercase focus-ring rounded-[3px]"
        style={{ color: labelColor, mixBlendMode: blend, padding: 0, lineHeight: "1", height: 12 }}
      >
        <ArrowLeft size={11} />
        <span>{backLabel}</span>
      </button>
      <div className="grid grid-cols-3 gap-2.5 items-center">
        {ORDER.map((cat, i) => (
          <div
            key={cat}
            className={i === 0 ? "flex justify-end" : i === 1 ? "flex justify-center" : "flex justify-start"}
          >
            <GlassButton active={cat === active} onClick={() => onSelect(cat)}>
              {labels[cat]}
            </GlassButton>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CategoryStrip = memo(CategoryStripImpl);
