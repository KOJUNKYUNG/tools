"use client";
import type { ReactNode } from "react";

interface GlassButtonProps {
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}

export function GlassButton({ onClick, children, active = false }: GlassButtonProps) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="focus-ring rounded-[6px] font-display font-semibold glass-btn"
      style={{
        width: "100%",
        minWidth: 0,
        height: 36,
        padding: "0 clamp(8px, 2vw, 16px)",
        fontSize: "clamp(11px, 2.6vw, 13px)",
        whiteSpace: "nowrap",
        fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: active ? "var(--ink-strong)" : "rgba(28,36,52,0.78)",
        background: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)",
        backdropFilter: "blur(8px) saturate(1.1)",
        WebkitBackdropFilter: "blur(8px) saturate(1.1)",
        border: active ? "1px solid rgba(255,255,255,0.9)" : "1px solid rgba(255,255,255,0.45)",
        boxShadow: active
          ? "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 8px -2px rgba(20,30,60,0.18)"
          : "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(20,30,60,0.06), 0 1px 4px -1px rgba(20,30,60,0.14)",
        cursor: active ? "default" : "pointer",
        transition:
          "transform 180ms ease, background 180ms ease, box-shadow 180ms ease, color 180ms ease",
      }}
    >
      {children}
    </button>
  );
}
