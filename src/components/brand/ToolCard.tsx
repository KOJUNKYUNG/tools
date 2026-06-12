"use client";
import type { LucideIcon } from "lucide-react";

interface ToolCardProps {
  slug: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  onOpen: (slug: string) => void;
  zooming?: boolean;
}

export function ToolCard({ slug, title, description, Icon, onOpen, zooming }: ToolCardProps) {
  return (
    <button
      onClick={() => onOpen(slug)}
      className="toolcard focus-ring rounded-[4px] text-left flex gap-3 items-start w-full"
      style={{
        height: "var(--tweak-card-height, 96px)",
        padding: "var(--tweak-card-padding, 14px)",
        transform: zooming ? "scale(0.96)" : "scale(1)",
        opacity: zooming ? 0 : 1,
        transition:
          "transform 280ms cubic-bezier(.4,0,.2,1), opacity 240ms ease, height 200ms ease, padding 200ms ease",
        zIndex: zooming ? 5 : 1,
        alignItems: "flex-start",
      }}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-[4px] flex items-center justify-center"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--ink-strong)",
        }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5 overflow-hidden">
        <div
          className="font-ko text-[13.5px] font-semibold leading-[1.25] tracking-[0.005em] truncate"
          style={{ color: "var(--headline)" }}
        >
          {title}
        </div>
        <div
          className="mt-1.5 font-body text-[11.5px] leading-[1.4] line-clamp-2"
          style={{ color: "var(--ink)" }}
        >
          {description}
        </div>
      </div>
    </button>
  );
}
