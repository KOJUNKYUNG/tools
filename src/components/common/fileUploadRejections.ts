import { ErrorCode, type FileRejection } from "react-dropzone";
import { template } from "@/lib/common/template";

export interface RejectionTemplates {
  /** "{name}", "{size}": a file over the size limit. */
  tooLarge: string;
  /** "{name}": a file of a type the tool does not take. */
  invalidType: string;
  /** No placeholders: more files dropped than the tool takes. */
  tooMany: string;
  /** "{name}", "{message}": any other rejection. */
  other: string;
}

/**
 * The toasts for one drop's rejected files, in order. A drop of more files
 * than a single-file tool takes rejects every file with `too-many-files`;
 * that is one problem with the drop, so it gets one message, not one per
 * file (#82). Each file's other problems keep their own message.
 */
export function rejectionMessages(
  rejections: readonly FileRejection[],
  templates: RejectionTemplates,
  maxSize: string,
): string[] {
  const tooMany = rejections.some((r) => r.errors.some((e) => e.code === ErrorCode.TooManyFiles));
  const messages = tooMany ? [templates.tooMany] : [];
  for (const { file, errors } of rejections) {
    const name = file.name;
    for (const err of errors) {
      if (err.code === ErrorCode.TooManyFiles) continue;
      if (err.code === ErrorCode.FileTooLarge) {
        messages.push(template(templates.tooLarge, { name, size: maxSize }));
      } else if (err.code === ErrorCode.FileInvalidType) {
        messages.push(template(templates.invalidType, { name }));
      } else {
        messages.push(template(templates.other, { name, message: err.message }));
      }
    }
  }
  return messages;
}
