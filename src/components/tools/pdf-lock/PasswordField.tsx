"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  showLabel: string;
  hideLabel: string;
  disabled?: boolean;
  autoComplete?: "new-password" | "current-password";
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  showLabel,
  hideLabel,
  disabled = false,
  autoComplete = "new-password",
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  return (
    <label className="flex flex-col gap-1">
      <span
        className="font-display text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </span>
      <div className="relative">
        <input
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          spellCheck={false}
          className="h-9 w-full rounded-[6px] border px-2.5 pr-9 font-body text-[13px] outline-none transition-colors focus:border-[color:var(--accent-electric)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          disabled={disabled}
          aria-label={revealed ? hideLabel : showLabel}
          title={revealed ? hideLabel : showLabel}
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:text-[color:var(--ink-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: "var(--ink-soft)" }}
        >
          {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
    </label>
  );
}
