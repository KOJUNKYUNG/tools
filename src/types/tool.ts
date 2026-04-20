export type ProcessingState = "idle" | "processing" | "done" | "error";

export const ToolErrorCode = {
  MEMORY: "MEMORY",
  INVALID_FILE: "INVALID_FILE",
  PROCESSING_FAILED: "PROCESSING_FAILED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ToolErrorCode = (typeof ToolErrorCode)[keyof typeof ToolErrorCode];

export interface ToolError {
  code: ToolErrorCode;
  message: string;
}

export interface ToolResult<T> {
  data: T;
  fileName?: string;
  mimeType?: string;
}
