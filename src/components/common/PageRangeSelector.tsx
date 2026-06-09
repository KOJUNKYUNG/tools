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

/**
 * Two-way sync between a text input ("1, 3, 5-7") and a parent-owned Set.
 *
 * - While the input is focused, the user's literal text is preserved verbatim;
 *   external selection changes (e.g. thumbnail clicks elsewhere) do NOT rewrite
 *   what the user is typing.
 * - The parent's `onChange(set)` still fires while typing, debounced 300 ms,
 *   so a grid hilight in `children` follows along live.
 * - Normalisation to canonical form ("1, 2, 3" → "1-3") happens only on
 *   blur or Enter — never mid-typing.
 */
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
  const editingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External -> input: only when the user is NOT editing.
  useEffect(() => {
    if (editingRef.current) return;
    const canonical = serializeRange(selected);
    setText((current) => (current === canonical ? current : canonical));
  }, [selected]);

  function cancelDebounce() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  function handleInput(next: string) {
    setText(next);
    editingRef.current = true;
    cancelDebounce();
    debounceRef.current = setTimeout(() => {
      onChange(parseRange(next, totalPages));
      // NOTE: editingRef stays true until blur/Enter, so the useEffect above
      // won't rewrite the input while the user is still in the field.
    }, DEBOUNCE_MS);
  }

  function commit() {
    cancelDebounce();
    editingRef.current = false;
    const finalSet = parseRange(text, totalPages);
    onChange(finalSet);
    setText(serializeRange(finalSet));
  }

  function handleFocus() {
    editingRef.current = true;
  }

  function handleBlur() {
    commit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur(); // triggers commit via onBlur
    }
  }

  function selectAll() {
    cancelDebounce();
    editingRef.current = false;
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    onChange(all);
  }

  function clear() {
    cancelDebounce();
    editingRef.current = false;
    onChange(new Set());
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          className="flex-1 rounded-[5px] border px-2.5 py-1.5 font-body text-[12px] outline-none focus:border-[color:var(--emphasis)]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        />
        <button
          type="button"
          onClick={selectAll}
          className="rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)]"
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
          className="rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)]"
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
