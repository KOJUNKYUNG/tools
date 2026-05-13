"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseRange, serializeRange } from "@/lib/common/pageRange";

interface PageRangeSelectorProps {
  totalPages: number;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  inputPlaceholder: string;
  selectAllLabel: string;
  clearLabel: string;
  /** Grid slot — typically a tool-specific thumbnail grid that mirrors `selected`. */
  children?: ReactNode;
}

const DEBOUNCE_MS = 300;

export function PageRangeSelector({
  totalPages,
  selected,
  onChange,
  inputPlaceholder,
  selectAllLabel,
  clearLabel,
  children,
}: PageRangeSelectorProps) {
  const [text, setText] = useState(() => serializeRange(selected));
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External -> input (only when user is not actively editing).
  useEffect(() => {
    if (composingRef.current) return;
    const canonical = serializeRange(selected);
    setText((current) => (current === canonical ? current : canonical));
  }, [selected]);

  // Input -> external (debounced).
  function handleInput(next: string) {
    setText(next);
    composingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      composingRef.current = false;
      onChange(parseRange(next, totalPages));
    }, DEBOUNCE_MS);
  }

  function selectAll() {
    composingRef.current = false;
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    onChange(all);
  }

  function clear() {
    composingRef.current = false;
    onChange(new Set());
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={inputPlaceholder}
          className="flex-1 rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        />
        <button
          type="button"
          onClick={selectAll}
          className="rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {selectAllLabel}
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {clearLabel}
        </button>
      </div>
      {children}
    </div>
  );
}
