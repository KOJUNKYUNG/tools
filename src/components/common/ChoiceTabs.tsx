"use client";

/**
 * A labelled row of tabs for one setting with a few fixed options (DESIGN.md
 * "Selected toggle"). Shared so that tools with the same tab row can adopt
 * it; image-to-pptx's slide options use it first (backlog S8).
 *
 * `labelBeside` puts the label to the left of the tabs instead of above them,
 * for a compact block of settings (image-to-pptx's 2×2 block).
 */
export function ChoiceTabs<V extends string>(props: {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  labelBeside?: boolean;
}) {
  const beside = props.labelBeside ?? false;
  return (
    <div className={beside ? "flex min-w-0 items-center gap-2" : undefined}>
      <p
        className={
          beside
            ? "min-w-10 shrink-0 whitespace-nowrap font-mono text-[11px]"
            : "mb-1.5 font-mono text-[11px]"
        }
        style={{ color: "var(--ink-soft)" }}
      >
        {props.label}
      </p>
      <div
        className={beside ? "flex min-w-0 flex-1 border-b" : "flex border-b"}
        style={{ borderColor: "var(--hairline)" }}
      >
        {props.options.map((o) => {
          const active = props.value === o.value;
          return (
            <button key={o.value} type="button"
              onClick={() => props.onChange(o.value)}
              aria-pressed={active}
              className={`flex-1 whitespace-nowrap border-b-2 font-body text-[12px] font-medium transition-colors ${beside ? "py-1.5" : "py-2"}`}
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
