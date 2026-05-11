import type { ComponentType } from "react";

interface ValuePropProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
}

export function ValueProp({ icon: Icon, label }: ValuePropProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-body text-[11px] tabular-nums tracking-[0.02em]"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--ink-strong)",
        opacity: 1,
        borderStyle: "solid",
        padding: "4px 5px 4px 10px",
        backgroundColor: "rgb(212, 212, 212)",
      }}
    >
      <Icon size={12} />
      <span>{label}</span>
    </div>
  );
}
