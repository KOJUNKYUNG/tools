"use client";

import type { ComponentType, CSSProperties, ReactNode } from "react";

interface ResultCardProps {
  title: string;
  /** Optional leading icon in the title row (e.g. lock / unlock). */
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  /** Tool-specific summary body (stats grid, size line, breakdown, …). */
  children?: ReactNode;
  /** The action row — typically `<ResultActions … />`. */
  actions?: ReactNode;
}

/**
 * The one result summary-card shell — flat `--surface`, a left `--emphasis` bar,
 * and the bounded `result-pop` reward (the single place motion enters tool UI;
 * `.result-pop` stays card-only — see [[result-pop-card-only]]). Size and
 * position are unified by composing this; only the body (`children`) and the
 * `actions` vary per tool. The 2-column tools (pdf-arrange, ppt-extract, …) keep
 * their own grid + left list and render this as the right-hand summary card.
 */
export function ResultCard({ title, icon: Icon, children, actions }: ResultCardProps) {
  return (
    <div
      className="result-pop flex flex-col gap-2.5 rounded-[8px] border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--emphasis)",
      }}
    >
      <div
        className="flex items-center gap-1.5 font-ko text-[13px] font-medium"
        style={{ color: "var(--headline)" }}
      >
        {Icon && <Icon className="size-4" style={{ color: "var(--headline)" }} />}
        {title}
      </div>
      {children}
      {actions}
    </div>
  );
}
