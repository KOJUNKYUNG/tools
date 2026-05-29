import { ToolErrorCode, type ToolError } from "@/types";

const ERROR_MESSAGES: Record<ToolErrorCode, string> = {
  [ToolErrorCode.MEMORY]:
    "브라우저 메모리가 부족합니다. 파일 크기나 개수를 줄여 다시 시도해 주세요.",
  [ToolErrorCode.INVALID_FILE]: "지원하지 않거나 손상된 파일입니다.",
  [ToolErrorCode.PROCESSING_FAILED]: "처리 중 문제가 발생했습니다. 다시 시도해 주세요.",
  [ToolErrorCode.UNKNOWN]: "알 수 없는 오류가 발생했습니다.",
};

export interface GetErrorMessageOptions {
  fallbackMessage?: string;
  memoryHint?: string;
  /**
   * Override message for outputs flagged by the pdf-compress integrity
   * guard (header check, page-count drop, suspicious ratio). Detected by
   * the `CORRUPT_OUTPUT:` prefix on the thrown error message.
   */
  corruptOutputHint?: string;
}

export function getErrorMessage(
  err: unknown,
  options: GetErrorMessageOptions = {},
): ToolError {
  const rawMessage = err instanceof Error ? err.message : "";

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
