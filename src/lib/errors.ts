import { ToolErrorCode, type ToolError } from "@/types";

/**
 * The page's shared error copy, from the dictionary (`common.errors`), so
 * every message is in the page's language.
 */
export interface ErrorCopy {
  /** An error nothing more specific explains: the tool's problem (#75). */
  unexpected: string;
  memory: string;
  invalidFile: string;
}

/**
 * An error whose message was written for the user, in the page's language.
 * Shown as it is; any other error's message is an engine's or library's and
 * never reaches the user (#83).
 */
export class UserFacingError extends Error {
  override name = "UserFacingError";
}

/**
 * Sentinel prefix thrown by qpdfCrypto.decryptPdf when qpdf reports an invalid
 * password (exit code != 0 with "invalid password" on stderr). Distinguishes a
 * normal user mistake (wrong password) from a corrupt/structurally-broken PDF,
 * so the UI can say "wrong password" instead of "file is damaged".
 */
export const WRONG_PASSWORD_PREFIX = "WRONG_PASSWORD";

/**
 * Sentinel prefix for a caller-detected invalid/unreadable input (e.g. a PDF
 * pdf-lib refuses to parse). Lets a tool supply a task-specific hint while
 * defaulting to the shared INVALID_FILE message.
 */
export const INVALID_INPUT_PREFIX = "INVALID_INPUT";

/**
 * Thrown by the ppt-extract extractors when a deck holds no images: the
 * tool's answer to the user, not a failure.
 */
export const NO_IMAGES = "NO_IMAGES";

/**
 * Sentinel prefix for a result an output check (or a tool's own integrity
 * guard) found unusable. Maps to the tool's `corruptOutputHint`.
 */
export const CORRUPT_OUTPUT_PREFIX = "CORRUPT_OUTPUT";

export interface GetErrorMessageOptions {
  copy: ErrorCopy;
  /** Replaces `copy.unexpected` where the caller knows what was being done. */
  fallbackMessage?: string;
  memoryHint?: string;
  /**
   * Override message for outputs flagged by the pdf-compress integrity
   * guard (header check, page-count drop, suspicious ratio). Detected by
   * the `CORRUPT_OUTPUT:` prefix on the thrown error message.
   */
  corruptOutputHint?: string;
  /**
   * Override message for an unlock attempt with the wrong password. Detected
   * by the `WRONG_PASSWORD:` prefix on the thrown error message.
   */
  wrongPasswordHint?: string;
  /**
   * Override message for an input the caller flagged as invalid/unreadable.
   * Detected by the `INVALID_INPUT` prefix on the thrown error message.
   */
  invalidInputHint?: string;
  /** ppt-extract's answer for a deck without images (`NO_IMAGES`). */
  noImagesHint?: string;
}

export function getErrorMessage(
  err: unknown,
  options: GetErrorMessageOptions,
): ToolError {
  const { copy } = options;
  const rawMessage = err instanceof Error ? err.message : "";

  if (err instanceof UserFacingError) {
    return { code: ToolErrorCode.PROCESSING_FAILED, message: err.message };
  }

  if (rawMessage === NO_IMAGES) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message: options.noImagesHint ?? copy.invalidFile,
    };
  }

  if (rawMessage.startsWith(WRONG_PASSWORD_PREFIX)) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message:
        options.wrongPasswordHint ?? copy.invalidFile,
    };
  }

  if (rawMessage.startsWith(INVALID_INPUT_PREFIX)) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message:
        options.invalidInputHint ?? copy.invalidFile,
    };
  }

  if (rawMessage.startsWith(CORRUPT_OUTPUT_PREFIX)) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message:
        options.corruptOutputHint ?? copy.invalidFile,
    };
  }

  if (rawMessage.includes("memory") || rawMessage.includes("OOM")) {
    return {
      code: ToolErrorCode.MEMORY,
      message: options.memoryHint ?? copy.memory,
    };
  }

  // An engine's or library's own message: for the developer log, not the user.
  console.error("Unexpected tool error:", err);
  return {
    code: rawMessage ? ToolErrorCode.PROCESSING_FAILED : ToolErrorCode.UNKNOWN,
    message: options.fallbackMessage ?? copy.unexpected,
  };
}
