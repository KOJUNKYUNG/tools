// Pure form-guard logic for the pdf-lock tool. Separated from the component so
// the "wrong password typed twice locks a PDF forever" data-loss guard is fully
// unit-testable. The component calls these and shows an i18n toast on failure
// (mirrors how pdf-watermark pre-validates needText/needLogo before run()).

/** Minimum length for a NEW lock password. Unlock has no length rule.
 * The user's open password is the only thing protecting the content (the owner
 * password is random/unguessable), so a too-short one gives false security. 6
 * balances real protection against non-expert friction. */
export const MIN_PASSWORD_LENGTH = 6;

export type LockFormError = "empty" | "tooShort" | "mismatch";
export type UnlockFormError = "empty";

export type ValidationResult<E> = { ok: true } | { ok: false; reason: E };

export interface LockFormInput {
  password: string;
  confirm: string;
}

/**
 * Validate the lock (encrypt) form. Order matters: emptiness is checked first
 * (so a blank field never reports "mismatch"), then minimum length, then the
 * confirmation match. The password is NOT trimmed — spaces are valid chars —
 * but a whitespace-only password counts as empty.
 */
export function validateLockForm({
  password,
  confirm,
}: LockFormInput): ValidationResult<LockFormError> {
  if (password.trim().length === 0) return { ok: false, reason: "empty" };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "tooShort" };
  if (password !== confirm) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

export interface UnlockFormInput {
  password: string;
}

/** Validate the unlock (decrypt) form — only requires a non-empty password. */
export function validateUnlockForm({
  password,
}: UnlockFormInput): ValidationResult<UnlockFormError> {
  if (password.trim().length === 0) return { ok: false, reason: "empty" };
  return { ok: true };
}
