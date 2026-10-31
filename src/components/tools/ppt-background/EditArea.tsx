"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One group of the edit area: its controls and the reset that undoes them alone. */
export interface EditGroup {
  /** Names the group's tab where the area holds more than one. */
  name: string;
  controls: ReactNode;
  resetLabel: string;
  /** The group differs from its start: its reset has something to undo. */
  edited: boolean;
  /** What the group lays now, in a few words, shown in the toggle's row open or closed (the effects in use). */
  summary?: string;
  onReset: () => void;
}

/**
 * The collapsible area under the crop frame (closed by default), holding the
 * pick's edit groups: the recipe edit ("shape") of a Paper gallery item,
 * then the filter set ("effects") of every picture.
 */
export interface EditAreaProps {
  /** The area's toggle. */
  heading: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: EditGroup[];
  /** Shown at the top of the open area, or in its place when it has no group (the recipe edit without WebGL2). */
  note?: string | null;
  /** A run uses the pick: shown as is, nothing responds. */
  locked: boolean;
}

const NOTE = "font-body text-[10.5px] leading-[1.35]";

export function EditArea({ heading, open, onOpenChange, groups, note, locked }: EditAreaProps) {
  // The group shown where there are several, by name; the first until one is chosen.
  const [chosen, setChosen] = useState<string | null>(null);
  if (groups.length === 0) {
    return note ? (
      <p className={NOTE} style={{ color: "var(--ink-soft)" }}>
        {note}
      </p>
    ) : null;
  }
  // Several groups take turns under tabs in the toggle's row, so the area
  // fits the room the picker holds for it (one group at a time) and the
  // toggle, the tabs and the reset never move.
  const shown = groups.find((group) => group.name === chosen) ?? groups[0];
  const tabbed = groups.length > 1;
  const summary = groups
    .map((group) => group.summary)
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          // Locked with the rest of the left pane while a run uses the pick.
          disabled={locked}
          className="flex shrink-0 items-center gap-1 py-0.5 font-body text-[11.5px] font-medium"
          style={{ color: "var(--ink-strong)" }}
        >
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
            style={{ color: "var(--ink-soft)" }}
            aria-hidden="true"
          />
          {heading}
        </button>
        {open && tabbed && (
          <div role="tablist" aria-label={heading} className="flex min-w-0 gap-0.5">
            {groups.map((group) => (
              <button
                key={group.name}
                type="button"
                role="tab"
                aria-selected={group === shown}
                onClick={() => setChosen(group.name)}
                disabled={locked}
                className="border-b-2 px-1.5 py-0.5 font-body text-[11px] font-medium transition-colors"
                style={{
                  color: group === shown ? "var(--ink-strong)" : "var(--ink-soft)",
                  borderBottomColor: group === shown ? "var(--emphasis)" : "transparent",
                }}
              >
                {group.name}
              </button>
            ))}
          </div>
        )}
        {summary && (
          // What is laid, in view while the controls are closed or show another group; cut short, never wrapped.
          <span className="min-w-0 truncate font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }} title={summary}>
            {summary}
          </span>
        )}
        {open && (
          <button
            type="button"
            onClick={shown.onReset}
            disabled={locked || !shown.edited}
            className="subtle-action ml-auto shrink-0 rounded-[5px] px-2.5 py-1 font-body text-[11px]"
          >
            {shown.resetLabel}
          </button>
        )}
      </div>
      {open && note ? (
        <p className={NOTE} style={{ color: "var(--ink-soft)" }}>
          {note}
        </p>
      ) : null}
      {open && (tabbed ? <div role="tabpanel" aria-label={shown.name}>{shown.controls}</div> : shown.controls)}
    </div>
  );
}
