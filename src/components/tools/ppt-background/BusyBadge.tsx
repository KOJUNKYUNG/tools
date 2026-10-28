import { Loader2Icon } from "lucide-react";

/** A spinner in a picture's corner while a newer drawing of it is on its way. */
export function BusyBadge({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="pointer-events-none absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-[6px]"
      style={{ background: "color-mix(in oklch, var(--surface) 85%, transparent)", color: "var(--ink-strong)" }}
    >
      <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
    </span>
  );
}
