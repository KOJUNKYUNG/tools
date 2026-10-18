"use client";

import { ResultCard } from "./ResultCard";

interface NotSmallerCardProps {
  title: string;
  /** The tool's advice: what to change, or that nothing will help. */
  message: string;
}

/**
 * The compressors' "could not shrink" result (pdf-, ppt- and image-compress):
 * nothing to download, so no actions. Each tool builds its own message.
 */
export function NotSmallerCard({ title, message }: NotSmallerCardProps) {
  return (
    <ResultCard title={title}>
      <p className="font-body text-[12px] leading-[1.6]" style={{ color: "var(--ink)" }}>
        {message}
      </p>
    </ResultCard>
  );
}
