import { cn } from "@/lib/utils";

interface CornerSpinnerProps {
  /** Its name for assistive tech; without one it is decoration beside a busy label elsewhere. */
  label?: string;
  /** The corner, as position classes; top right by default. */
  className?: string;
}

/**
 * A small spinner over a picture's corner while a newer version of the
 * picture is on its way (a re-compression, a recipe edit's preview). The
 * spinner is in `--emphasis`, as every busy state (DESIGN.md).
 */
export function CornerSpinner({ label, className = "right-2 top-2" }: CornerSpinnerProps) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-label={label}
      title={label}
      className={cn("pointer-events-none absolute rounded-full bg-[color:var(--surface)] p-1 opacity-80 shadow-sm", className)}
    >
      <span className="block size-3 animate-spin rounded-full border-2 border-[color:var(--emphasis)] border-t-transparent" />
    </div>
  );
}
