import { ToolErrorCode, type ToolError } from "@/types";

const ERROR_MESSAGES: Record<ToolErrorCode, string> = {
  [ToolErrorCode.MEMORY]:
    "브라우저 메모리가 부족합니다. 파일 크기나 개수를 줄여 다시 시도해 주세요.",
  [ToolErrorCode.INVALID_FILE]: "지원하지 않거나 손상된 파일입니다.",
  [ToolErrorCode.PROCESSING_FAILED]: "처리 중 문제가 발생했습니다. 다시 시도해 주세요.",
  [ToolErrorCode.UNKNOWN]: "알 수 없는 오류가 발생했습니다.",
};

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

export interface GetErrorMessageOptions {
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
}

export function getErrorMessage(
  err: unknown,
  options: GetErrorMessageOptions = {},
): ToolError {
  const rawMessage = err instanceof Error ? err.message : "";

  if (rawMessage.startsWith(WRONG_PASSWORD_PREFIX)) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message:
        options.wrongPasswordHint ?? ERROR_MESSAGES[ToolErrorCode.INVALID_FILE],
    };
  }

  if (rawMessage.startsWith(INVALID_INPUT_PREFIX)) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message:
        options.invalidInputHint ?? ERROR_MESSAGES[ToolErrorCode.INVALID_FILE],
    };
  }

  if (rawMessage.startsWith("CORRUPT_OUTPUT")) {
    return {
      code: ToolErrorCode.INVALID_FILE,
      message:
        options.corruptOutputHint ?? ERROR_MESSAGES[ToolErrorCode.INVALID_FILE],
    };
  }

  if (rawMessage.includes("memory") || rawMessage.includes("OOM")) {
    return {
      code: ToolErrorCode.MEMORY,
      message: options.memoryHint ?? ERROR_MESSAGES[ToolErrorCode.MEMORY],
    };
  }

  if (rawMessage) {
    return {
      code: ToolErrorCode.PROCESSING_FAILED,
      message: rawMessage,
    };
  }

  return {
    code: ToolErrorCode.UNKNOWN,
    message: options.fallbackMessage ?? ERROR_MESSAGES[ToolErrorCode.UNKNOWN],
  };
}
