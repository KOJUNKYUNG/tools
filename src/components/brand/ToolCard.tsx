"use client";
import type { ToolIconProps } from "@/components/brand/ToolIcons";
import type { JSX } from "react";

interface ToolCardProps {
  slug: string;
  title: string;
  description: string;
  Icon: (props: ToolIconProps) => JSX.Element;
  onOpen: (slug: string) => void;
  zooming?: boolean;
}

/**
 * Tool card — an icon-forward launcher tile. A large box-less line icon on the
 * left identifies the tool (the names are similar, so the glyph is the primary
 * scan cue), the title and an always-visible description sit beside it. The icon
 * steps down on the single-column (≤480px) layout. currentColor on the icon and
 * the semantic tokens let the whole card invert with the theme.
 */
export function ToolCard({ slug, title, description, Icon, onOpen, zooming }: ToolCardProps) {
  return (
    <button
      onClick={() => onOpen(slug)}
      className="toolcard focus-ring rounded-[4px] text-left flex gap-3.5 items-center w-full"
      style={{
        height: "var(--tweak-card-height, 96px)",
        padding: "var(--tweak-card-padding, 14px)",
        transform: zooming ? "scale(0.96)" : "scale(1)",
        opacity: zooming ? 0 : 1,
        transition:
          "transform var(--motion-base) var(--ease-settle), opacity var(--motion-base) var(--ease-standard), height var(--motion-base) var(--ease-standard), padding var(--motion-base) var(--ease-standard)",
        zIndex: zooming ? 5 : 1,
      }}
    >
      <span
        className="shrink-0 flex items-center justify-center size-10 min-[481px]:size-11"
        style={{ color: "var(--ink-strong)" }}
      >
        <Icon className="w-full h-full" />
      </span>
      <span className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden">
        <span
          className="font-ko text-[13px] min-[481px]:text-[14px] font-semibold leading-[1.25] tracking-[-0.01em] truncate"
          style={{ color: "var(--headline)" }}
        >
          {title}
        </span>
        <span
          className="mt-1 font-body text-[11.5px] leading-[1.4] tracking-[-0.01em] line-clamp-2"
          style={{ color: "var(--ink)" }}
        >
          {description}
        </span>
      </span>
    </button>
  );
}
