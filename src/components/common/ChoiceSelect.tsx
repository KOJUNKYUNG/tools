"use client";

import { Fragment } from "react";

/**
 * A dropdown for one setting with too many options for a tab row (DESIGN.md
 * "Dropdown"): a native `<select>`, so phones open their own picker, in the
 * input-field treatment. Options may come in labelled groups. image-to-pdf's
 * page size presets use it first; `ChoiceTabs` stays the choice for a few
 * short options.
 */
export function ChoiceSelect<V extends string>(props: {
  /** The accessible name; the setting's visible label sits outside, if any. */
  ariaLabel: string;
  /** Options in order; a group with a label is shown under it. */
  groups: readonly { label?: string; options: readonly { value: V; label: string }[] }[];
  value: V;
  onChange: (value: V) => void;
}) {
  const values = new Set<string>(props.groups.flatMap((g) => g.options.map((o) => o.value)));
  return (
    <select
      value={props.value}
      onChange={(e) => {
        // Narrowed by the check: only the listed option values are V.
        if (values.has(e.target.value)) props.onChange(e.target.value as V);
      }}
      aria-label={props.ariaLabel}
      className="h-8 w-full rounded-[3px] border px-2 font-body text-[12px] tabular-nums outline-none focus:border-transparent focus:outline-2 focus:outline-[color:var(--emphasis)]"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
        color: "var(--ink-strong)",
      }}
    >
      {props.groups.map((g, i) => {
        const options = g.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ));
        return g.label ? (
          <optgroup key={g.label} label={g.label}>
            {options}
          </optgroup>
        ) : (
          <Fragment key={i}>{options}</Fragment>
        );
      })}
    </select>
  );
}
