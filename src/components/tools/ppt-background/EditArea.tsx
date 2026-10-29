"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One group of the edit area: its controls and the reset that undoes them alone. */
export interface EditGroup {
  /** Names the group above its controls where the area holds more than one. */
  name: string;
  controls: ReactNode;
  resetLabel: string;
  /** The group differs from its start: its reset has something to undo. */
  edited: boolean;
  onReset: () => void;
}

/**
 * The collapsible area under the crop frame (closed by default), holding the
 * pick's edit groups: the recipe edit ("shape") of a Paper gallery item.
 */
export interface EditAreaProps {
  /** The area's toggle. */
  heading: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: EditGroup[];
  /** Shown in place of the area when it has no group to offer (the recipe edit without WebGL2). */
  note?: string | null;
  /** A run uses the pick: shown as is, nothing responds. */
  locked: boolean;
}

const GROUP_LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em]";

export function EditArea({ heading, open, onOpenChange, groups, note, locked }: EditAreaProps) {
  if (groups.length === 0) {
    return note ? (
      <p className="font-body text-[10.5px] leading-[1.35]" style={{ color: "var(--ink-soft)" }}>
        {note}
      </p>
    ) : null;
  }
  // A lone group's name would only repeat the toggle: its reset takes the
  // toggle's row and its controls follow without a heading.
  const lone = groups.length === 1 ? groups[0] : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          // Locked with the rest of the left pane while a run uses the pick.
          disabled={locked}
          className="flex items-center gap-1 py-0.5 font-body text-[11.5px] font-medium"
          style={{ color: "var(--ink-strong)" }}
        >
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
            style={{ color: "var(--ink-soft)" }}
            aria-hidden="true"
          />
          {heading}
        </button>
        {open && lone && <ResetButton group={lone} locked={locked} />}
      </div>
      {open &&
        (lone
          ? lone.controls
          : groups.map((group) => (
              <section key={group.name} aria-label={group.name} className="flex flex-col gap-1.5">
                <div className="flex h-6 items-center justify-between gap-2">
                  <h3 className={GROUP_LABEL} style={{ color: "var(--ink-soft)" }}>
                    {group.name}
                  </h3>
                  <ResetButton group={group} locked={locked} />
                </div>
                {group.controls}
              </section>
            )))}
    </div>
  );
}

function ResetButton({ group, locked }: { group: EditGroup; locked: boolean }) {
  return (
    <button
      type="button"
      onClick={group.onReset}
      disabled={locked || !group.edited}
      className="subtle-action rounded-[5px] px-2.5 py-1 font-body text-[11px]"
    >
      {group.resetLabel}
    </button>
  );
}
