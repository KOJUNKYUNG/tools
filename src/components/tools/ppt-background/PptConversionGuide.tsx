"use client";

import { useState } from "react";
import { ChevronDownIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConversionMethodLabels {
  title: string;
  steps: string[];
  linkLabel?: string;
  linkHref?: string;
}

interface PptConversionGuideProps {
  heading: string;
  methods: ConversionMethodLabels[];
  note: string;
  defaultOpen?: boolean;
}

export function PptConversionGuide({
  heading,
  methods,
  note,
  defaultOpen = true,
}: PptConversionGuideProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-[12px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-copper)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ color: "var(--ink-strong)" }}
      >
        <div className="flex items-center gap-2">
          <InfoIcon className="size-4" style={{ color: "var(--accent-copper)" }} />
          <span className="font-display text-[13px] font-semibold">{heading}</span>
        </div>
        <ChevronDownIcon
          className={cn("size-4 transition-transform", open && "rotate-180")}
          style={{ color: "var(--ink-soft)" }}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          {methods.map((m, idx) => (
            <div
              key={idx}
              className="rounded-[8px] border px-3 py-2"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="font-display text-[12px] font-semibold"
                style={{ color: "var(--headline)" }}
              >
                {m.title}
              </div>
              <ol
                className="mt-1 list-inside list-decimal space-y-0.5 font-body text-[11.5px]"
                style={{ color: "var(--ink)" }}
              >
                {m.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {m.linkHref && m.linkLabel && (
                <a
                  href={m.linkHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-body text-[11.5px] underline"
                  style={{ color: "var(--accent-electric)" }}
                >
                  {m.linkLabel}
                </a>
              )}
            </div>
          ))}
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
