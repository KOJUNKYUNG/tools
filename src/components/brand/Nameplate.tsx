"use client";
import type { ReactNode, CSSProperties } from "react";

interface NameplateProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
}

export function Nameplate({ active, onClick, children, style }: NameplateProps) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="nameplate glint focus-ring rounded-[4px] px-5 py-2.5 font-display text-[13px] font-medium tracking-[0.05em]"
      style={{
        color: "var(--ink-strong)",
        ...style,
        fontWeight: 600,
        lineHeight: "1.5",
        letterSpacing: "0.65px",
        width: "150px",
        height: "50px",
        fontSize: "12px",
      }}
    >
      {children}
    </button>
  );
}
