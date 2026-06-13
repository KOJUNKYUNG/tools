"use client";

import type { LockPermissions } from "@/lib/pdf/qpdfArgs";
import { PasswordField } from "./PasswordField";
import type { PdfLockLabels } from "./labels";

export interface LockState {
  password: string;
  confirm: string;
  permissions: LockPermissions;
}

interface LockControlsProps {
  value: LockState;
  onChange: (patch: Partial<LockState>) => void;
  labels: PdfLockLabels;
  disabled?: boolean;
}

export function LockControls({ value, onChange, labels, disabled = false }: LockControlsProps) {
  const setPerm = (patch: Partial<LockPermissions>) =>
    onChange({ permissions: { ...value.permissions, ...patch } });

  return (
    <div className="space-y-3">
      <PasswordField
        label={labels.passwordLabel}
        value={value.password}
        onChange={(password) => onChange({ password })}
        placeholder={labels.passwordPlaceholder}
        showLabel={labels.showPassword}
        hideLabel={labels.hidePassword}
        disabled={disabled}
        autoComplete="new-password"
      />
      <PasswordField
        label={labels.confirmLabel}
        value={value.confirm}
        onChange={(confirm) => onChange({ confirm })}
        placeholder={labels.confirmPlaceholder}
        showLabel={labels.showPassword}
        hideLabel={labels.hidePassword}
        disabled={disabled}
        autoComplete="new-password"
      />

      <div className="space-y-1.5">
        <span
          className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--ink-soft)" }}
        >
          {labels.permissionsLabel}
        </span>
        <label className="flex items-center gap-2 font-body text-[12px]" style={{ color: "var(--ink)" }}>
          <input
            type="checkbox"
            checked={value.permissions.allowPrint}
            onChange={(e) => setPerm({ allowPrint: e.target.checked })}
            disabled={disabled}
            className="size-3.5 accent-[color:var(--emphasis)] disabled:cursor-not-allowed"
          />
          {labels.allowPrint}
        </label>
        <label className="flex items-center gap-2 font-body text-[12px]" style={{ color: "var(--ink)" }}>
          <input
            type="checkbox"
            checked={value.permissions.allowCopy}
            onChange={(e) => setPerm({ allowCopy: e.target.checked })}
            disabled={disabled}
            className="size-3.5 accent-[color:var(--emphasis)] disabled:cursor-not-allowed"
          />
          {labels.allowCopy}
        </label>
        <p className="font-body text-[11px] leading-[1.4]" style={{ color: "var(--ink-soft)" }}>
          {labels.permissionsHint}
        </p>
        <p
          className="rounded-[5px] border px-2 py-1.5 font-body text-[11px] leading-[1.45]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink-soft)",
          }}
        >
          {labels.permissionsViewerNote}
        </p>
      </div>
    </div>
  );
}
