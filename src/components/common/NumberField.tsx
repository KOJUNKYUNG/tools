"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

interface NumberFieldProps {
  value: number;
  /**
   * Called with the clamped number when typing finishes (blur / Enter), and at
   * once on each step of the field's arrows or arrow keys.
   */
  onCommit: (v: number) => void;
  /** The number a committed one becomes (e.g. the nearest step), shown back in the field. */
  normalize?: (v: number) => number;
  min?: number;
  max?: number;
  /** How far one step of the arrows moves (the browser's 1 by default). */
  step?: number;
  /** Value used when the field is committed empty or invalid. Defaults to min ?? 0. */
  fallback?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /** The on-screen keypad: "decimal" where the value takes a decimal point. */
  inputMode?: "numeric" | "decimal";
}

/**
 * A number input that COMMITS on blur / Enter rather than on every keystroke.
 * While the field is focused the user's literal text is preserved — including an
 * empty field — so clearing a value and typing a new one is never fought by an
 * intermediate clamp or fallback; only a change of `value` from outside (a
 * drag on a preview) replaces it. On commit the text is parsed, clamped to
 * [min, max], and pushed up via `onCommit`, unless the field was left
 * untouched; an empty/invalid field falls back to `fallback` (else `min`,
 * else 0). A step of the field's own arrows or the
 * arrow keys is no typing: it commits at once, as a slider does. This is the
 * one number-entry treatment across tools — the deliberate slider/range still
 * updates live.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step,
  fallback,
  disabled,
  placeholder,
  className,
  style,
  ariaLabel,
  inputMode = "numeric",
  normalize,
}: NumberFieldProps) {
  const [text, setText] = useState(() => String(value));

  // Sync from the external value whenever it changes, mid-edit too: typing
  // never changes it (only a commit does), so a change from outside is a newer
  // intent, e.g. a drag on a preview while this field keeps the focus, and the
  // half-typed text gives way to it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled sync from the external value
    setText((current) => (current === String(value) ? current : String(value)));
  }, [value]);

  function commit(entered = text) {
    const raw = Number(entered);
    let n =
      entered.trim() === "" || !Number.isFinite(raw) ? fallback ?? min ?? 0 : raw;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (normalize) n = normalize(n);
    // Leaving the field untouched is no edit: the value it shows may be a
    // rounding of the parent's, and committing it would move what it reads.
    if (!(entered === String(value) && n === value)) onCommit(n);
    setText(String(n));
  }

  return (
    <input
      type="number"
      inputMode={inputMode}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        // Typing comes with an input type (insertText, deleteContentBackward,
        // insertReplacementText for autofill); a step of the arrows without
        // one (Chrome sends a plain Event).
        const typed = e.nativeEvent instanceof InputEvent && e.nativeEvent.inputType !== "";
        if (typed) setText(e.target.value);
        else commit(e.target.value);
      }}
      onBlur={() => {
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
