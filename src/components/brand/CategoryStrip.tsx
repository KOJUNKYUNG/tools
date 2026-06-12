"use client";
import { memo } from "react";
import { ArrowLeft } from "lucide-react";

type Category = "presentation" | "document" | "image";

interface CategoryStripProps {
  /** Active category. Omit / null (Screen 1) renders the row with nothing selected. */
  active?: Category | null;
  labels: { presentation: string; document: string; image: string };
  /** Hint line above the tabs (Screen 1). Ignored when onBack is provided. */
  eyebrow?: string;
  backLabel?: string;
  onSelect: (cat: Category) => void;
  onBack?: () => void;
}

const ORDER: Category[] = ["presentation", "document", "image"];

function CategoryStripImpl({
  active = null,
  labels,
  eyebrow,
  backLabel,
  onSelect,
  onBack,
}: CategoryStripProps) {
  return (
    <div
      className="absolute left-1/2 flex flex-col items-center gap-4"
      style={{
        top: "calc(18% + var(--tweak-categories-y, 0px))",
        transform: "translateX(-50%)",
        transition: "top 200ms ease",
      }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-body text-[9px] tracking-[0.32em] uppercase focus-ring rounded-[3px]"
          style={{ color: "var(--ink-soft)", padding: 0, lineHeight: "1", height: 12 }}
        >
          <ArrowLeft size={11} />
          <span>{backLabel}</span>
        </button>
      ) : (
        <div
          className="font-body text-[9px] tracking-[0.32em] uppercase flex items-center"
          style={{ color: "var(--ink-soft)", lineHeight: "1", height: 12 }}
        >
          {eyebrow ?? " "}
        </div>
      )}
      {/* Underline is a real border (not an inset shadow): zero-blur inset
          shadows bleed a 1px line on the side edges at fractional Windows DPR.
          Every tab carries a transparent 2px border so activation never
          shifts layout. */}
      <div className="grid grid-cols-3 border-b" style={{ borderColor: "var(--hairline)" }}>
        {ORDER.map((cat) => {
          const isActive = active === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelect(cat)}
              className="px-4 py-2 font-body text-[13px] font-medium whitespace-nowrap text-center transition-colors focus-ring border-b-2"
              style={{
                color: isActive ? "var(--ink-strong)" : "var(--ink-soft)",
                borderBottomColor: isActive ? "var(--emphasis)" : "transparent",
              }}
            >
              {labels[cat]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const CategoryStrip = memo(CategoryStripImpl);
