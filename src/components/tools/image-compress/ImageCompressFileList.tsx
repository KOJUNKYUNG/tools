"use client";

import { XIcon } from "lucide-react";
import { template } from "@/lib/common/template";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface IdleEntry {
  name: string;
  size: number;
}

interface DoneEntry {
  name: string;
  originalSize: number;
  compressedSize: number;
}

interface ImageCompressFileListProps {
  mode: "idle" | "done";
  idleFiles: IdleEntry[];
  doneResults: DoneEntry[];
  onRemove: (index: number) => void;
  removeAriaTemplate: string;
  sizeChangeTemplate: string;
}

export function ImageCompressFileList({
  mode,
  idleFiles,
  doneResults,
  onRemove,
  removeAriaTemplate,
  sizeChangeTemplate,
}: ImageCompressFileListProps) {
  return (
    <div
      className="space-y-1.5 overflow-y-auto pr-1"
      style={{ maxHeight: "220px" }}
    >
      {mode === "idle"
        ? idleFiles.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex h-9 items-center gap-2 rounded-[6px] border px-3 font-body text-[12px]"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={{ color: "var(--ink-strong)" }}
              >
                {f.name}
              </span>
              <span className="shrink-0" style={{ color: "var(--ink-soft)" }}>
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={template(removeAriaTemplate, { name: f.name })}
                className="shrink-0 rounded p-0.5 transition-colors hover:text-[color:var(--accent-copper)]"
                style={{ color: "var(--ink-soft)" }}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))
        : doneResults.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="flex h-9 items-center gap-2 rounded-[6px] border px-3 font-body text-[12px]"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate"
                style={{ color: "var(--ink-strong)" }}
              >
                {r.name}
              </span>
              <span className="shrink-0" style={{ color: "var(--ink-soft)" }}>
                {template(sizeChangeTemplate, {
                  from: formatBytes(r.originalSize),
                  to: formatBytes(r.compressedSize),
                })}
              </span>
            </div>
          ))}
    </div>
  );
}
