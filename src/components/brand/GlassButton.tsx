"use client";
import { memo, useMemo, type ReactNode } from "react";

interface GlassButtonProps {
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}

function GlassButtonImpl({ onClick, children, active = false }: GlassButtonProps) {
  const style = useMemo<React.CSSProperties>(
    () => ({
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
      background: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.3)",
      backdropFilter: active ? "blur(8px) saturate(1.1)" : "none",
      WebkitBackdropFilter: active ? "blur(8px) saturate(1.1)" : "none",
      border: active ? "1px solid rgba(255,255,255,0.95)" : "1px solid rgba(255,255,255,0.5)",
      boxShadow: active
        ? "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 8px -2px rgba(20,30,60,0.2)"
        : "inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 3px -1px rgba(20,30,60,0.14)",
      cursor: active ? "default" : "pointer",
      transition: "transform 180ms ease, background 180ms ease, color 180ms ease",
      isolation: "isolate",
    }),
    [active],
  );

  return (
    <button
      onClick={onClick}
      data-active={active}
      className="focus-ring rounded-[6px] font-display font-semibold glass-btn"
      style={style}
    >
      {children}
    </button>
  );
}

export const GlassButton = memo(GlassButtonImpl);
