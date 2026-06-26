"use client";

import { useCallback, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { UploadCloudIcon, XIcon, FileIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_UPLOAD_LIMIT } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";

interface FileUploadProps {
  accept: Accept;
  maxSize?: number;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
  description?: string;
  /**
   * When true the dropzone is inert — clicks and drops are ignored, the prompt
   * is replaced by the busy label, and the cloud icon swaps to a spinner. Used
   * while an upload is being prepared (e.g. HEIC→JPEG normalization) so the
   * dropzone stays in place instead of a separate block pushing the layout.
   */
  busy?: boolean;
  hideFileList?: boolean;
  /** Hide the auto-generated "{exts} · 최대 {size}" hint line. */
  hideAutoHint?: boolean;
  /**
   * Localisation overrides. Korean defaults are kept for backwards-compat,
   * but EN locale callers MUST inject all keys to avoid KR leaking into
   * toasts and the file list. Templates support {name}, {size}, {message},
   * and {n} placeholders as documented per key.
   */
  labels?: {
    /** "{size}" — auto-hint suffix. e.g. "최대 {size}" / "Max {size}". */
    maxSize?: string;
    /** "{name}", "{size}" — toast on oversize drop. */
    tooLargeTemplate?: string;
    /** "{name}" — toast on bad MIME/extension. */
    invalidTypeTemplate?: string;
    /** "{name}", "{message}" — toast fallback for any other rejection. */
    errorTemplate?: string;
    /** "{n}" — selected-file count header. */
    selectedCountTemplate?: string;
    /** Button text to clear the in-component file list. */
    clearAll?: string;
    /** "{name}" — aria-label on the per-file remove button. */
    removeAriaTemplate?: string;
    /** Prompt shown in place of `label` while `busy` is true. */
    busy?: string;
  };
}

export function FileUpload({
  accept,
  maxSize = DEFAULT_UPLOAD_LIMIT,
  multiple = true,
  onFiles,
  label = "파일을 드래그하거나 클릭하여 업로드",
  description,
  busy = false,
  hideFileList = false,
  hideAutoHint = false,
  labels,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);

  const tooLargeTpl = labels?.tooLargeTemplate ?? "{name}: 파일 크기가 {size}를 초과합니다.";
  const invalidTypeTpl = labels?.invalidTypeTemplate ?? "{name}: 지원하지 않는 파일 형식입니다.";
  const errorTpl = labels?.errorTemplate ?? "{name}: {message}";

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      for (const rejection of rejections) {
        const name = rejection.file.name;
        for (const err of rejection.errors) {
          if (err.code === "file-too-large") {
            toast.error(template(tooLargeTpl, { name, size: formatBytes(maxSize) }));
          } else if (err.code === "file-invalid-type") {
            toast.error(template(invalidTypeTpl, { name }));
          } else {
            toast.error(template(errorTpl, { name, message: err.message }));
          }
        }
      }

      if (accepted.length > 0) {
        const next = multiple ? [...files, ...accepted] : accepted;
        setFiles(next);
        onFiles(next);
      }
    },
    [files, maxSize, multiple, onFiles, tooLargeTpl, invalidTypeTpl, errorTpl],
  );

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    onFiles(next);
  };

  const clearAll = () => {
    setFiles([]);
    onFiles([]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple,
    disabled: busy,
  });

  const busyLabel = labels?.busy ?? "처리 중…";

  const maxSizeTemplate = labels?.maxSize ?? "최대 {size}";
  const maxSizeHint = template(maxSizeTemplate, { size: formatBytes(maxSize) });
  const selectedCountTpl = labels?.selectedCountTemplate ?? "{n}개 파일 선택됨";
  const clearAllLabel = labels?.clearAll ?? "전체 삭제";
  const removeAriaTpl = labels?.removeAriaTemplate ?? "{name} 제거";

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        data-drag={isDragActive}
        data-busy={busy}
        aria-busy={busy}
        className={`dropzone flex flex-col items-center justify-center gap-3 rounded-[8px] p-8 text-center ${
          busy ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <input {...getInputProps()} />
        {busy ? (
          <Loader2Icon
            className="size-10 animate-spin"
            style={{ color: "var(--emphasis)" }}
          />
        ) : (
          <UploadCloudIcon
            className="size-10 transition-colors"
            style={{ color: isDragActive ? "var(--ink-strong)" : "var(--ink-soft)" }}
          />
        )}
        <div>
          <p
            className="font-ko text-[13px] font-medium"
            style={{ color: "var(--ink-strong)" }}
          >
            {busy ? busyLabel : label}
          </p>
          {description && (
            <p
              className="mt-1 font-body text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {description}
            </p>
          )}
          {!hideAutoHint && (
            <p
              className="mt-1 font-body text-[11px] tabular-nums"
              style={{ color: "var(--ink-soft)" }}
            >
              {maxSizeHint}
            </p>
          )}
        </div>
      </div>

      {!hideFileList && files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p
              className="font-body text-[12px] font-medium"
              style={{ color: "var(--ink-strong)" }}
            >
              {template(selectedCountTpl, { n: files.length })}
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="subtle-action shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px]"
            >
              {clearAllLabel}
            </button>
          </div>
          <ul className="space-y-1.5">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-[6px] border px-3 py-2"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                }}
              >
                <FileIcon
                  className="size-4 shrink-0"
                  style={{ color: "var(--ink-soft)" }}
                />
                <span
                  className="flex-1 truncate font-body text-[12px]"
                  style={{ color: "var(--ink-strong)" }}
                >
                  {file.name}
                </span>
                <span
                  className="shrink-0 font-body text-[11px] tabular-nums"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={template(removeAriaTpl, { name: file.name })}
                  className="shrink-0 rounded-[5px] p-1 transition-colors text-[color:var(--ink-soft)] hover:text-[color:var(--ink-strong)]"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
