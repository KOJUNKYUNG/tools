"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface NumberFieldProps {
  value: number;
  /** Called with the clamped number only when editing finishes (blur / Enter). */
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  /** Value used when the field is committed empty or invalid. Defaults to min ?? 0. */
  fallback?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/**
 * A number input that COMMITS on blur / Enter rather than on every keystroke.
 * While the field is focused the user's literal text is preserved — including an
 * empty field — so clearing a value and typing a new one is never fought by an
 * intermediate clamp or fallback. On commit the text is parsed, clamped to
 * [min, max], and pushed up via `onCommit`; an empty/invalid field falls back to
 * `fallback` (else `min`, else 0). This is the one number-entry treatment across
 * tools — the deliberate slider/range still updates live.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  fallback,
  disabled,
  placeholder,
  className,
  style,
  ariaLabel,
}: NumberFieldProps) {
  const [text, setText] = useState(() => String(value));
  const focusedRef = useRef(false);

  // Sync from the external value only when the user is NOT mid-edit, so a live
  // parent update (e.g. a paired slider) reflects here without clobbering typing.
  useEffect(() => {
    if (focusedRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled sync, guarded against clobbering an active edit
    setText((current) => (current === String(value) ? current : String(value)));
  }, [value]);

  function commit() {
    const raw = Number(text);
    let n =
      text.trim() === "" || !Number.isFinite(raw) ? fallback ?? min ?? 0 : raw;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onCommit(n);
    setText(String(n));
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={className}
      style={style}
    />
  );
}
