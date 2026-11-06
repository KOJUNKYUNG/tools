"use client";

/**
 * A labelled row of tabs for one setting with a few fixed options (DESIGN.md
 * "Selected toggle"). Shared so that tools with the same tab row can adopt
 * it; image-to-pptx's slide options use it first (backlog S8).
 */
export function ChoiceTabs<V extends string>(props: {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px]" style={{ color: "var(--ink-soft)" }}>{props.label}</p>
      <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
        {props.options.map((o) => {
          const active = props.value === o.value;
          return (
            <button key={o.value} type="button"
              onClick={() => props.onChange(o.value)}
              aria-pressed={active}
              className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors"
              style={{
                color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                borderBottomColor: active ? "var(--emphasis)" : "transparent",
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
