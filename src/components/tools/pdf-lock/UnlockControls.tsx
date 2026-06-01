"use client";

import { PasswordField } from "./PasswordField";
import type { PdfLockLabels } from "./labels";

export interface UnlockState {
  password: string;
}

interface UnlockControlsProps {
  value: UnlockState;
  onChange: (patch: Partial<UnlockState>) => void;
  labels: PdfLockLabels;
  disabled?: boolean;
}

export function UnlockControls({ value, onChange, labels, disabled = false }: UnlockControlsProps) {
  return (
    <div className="space-y-3">
      <PasswordField
        label={labels.unlockPasswordLabel}
        value={value.password}
        onChange={(password) => onChange({ password })}
        placeholder={labels.unlockPasswordPlaceholder}
        showLabel={labels.showPassword}
        hideLabel={labels.hidePassword}
        disabled={disabled}
        autoComplete="current-password"
      />
    </div>
  );
}
