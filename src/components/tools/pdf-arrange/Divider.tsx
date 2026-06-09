"use client";

interface DividerProps {
  active: boolean;
  onToggle: () => void;
  label: string;
}

/**
 * Edge-mark divider sitting in the gutter to the right of a page. Idle = faint
 * thin bar; hover = thicker; active = emphasis bar with scissors. State
 * changes color/width only (no layout-affecting size jump on the page itself).
 */
export function Divider({ active, onToggle, label }: DividerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className="group/div relative flex h-[204px] w-[18px] shrink-0 cursor-pointer items-center justify-center self-center bg-transparent"
    >
      <span
        className={
          active
            ? "h-[204px] w-1 rounded-full"
            : "h-[150px] w-0.5 rounded-full opacity-45 transition-all group-hover/div:w-[3px] group-hover/div:opacity-90"
        }
        style={
          active
            ? { background: "var(--emphasis)" }
            : { background: "var(--hairline)" }
        }
      />
      {active && (
        <span
          className="pointer-events-none absolute text-[11px] leading-none"
          style={{ color: "var(--emphasis)", marginTop: "-92px" }}
        >
          ✂
        </span>
      )}
    </button>
  );
}
