"use client";

import { useCallback, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { UploadCloudIcon, XIcon, FileIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  };
}

export function FileUpload({
  accept,
  maxSize = DEFAULT_UPLOAD_LIMIT,
  multiple = true,
  onFiles,
  label = "파일을 드래그하거나 클릭하여 업로드",
  description,
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
  });

  const maxSizeTemplate = labels?.maxSize ?? "최대 {size}";
  const maxSizeHint = template(maxSizeTemplate, { size: formatBytes(maxSize) });
  const selectedCountTpl = labels?.selectedCountTemplate ?? "{n}개 파일 선택됨";
  const clearAllLabel = labels?.clearAll ?? "전체 삭제";
  const removeAriaTpl = labels?.removeAriaTemplate ?? "{name} 제거";

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        )}
      >
        <input {...getInputProps()} />
        <UploadCloudIcon
          className={cn(
            "size-10 transition-colors",
            isDragActive ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div>
          <p className="text-sm font-medium">{label}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
          {!hideAutoHint && (
            <p className="mt-1 text-xs text-muted-foreground">
              {maxSizeHint}
            </p>
          )}
        </div>
      </div>

      {!hideFileList && files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {template(selectedCountTpl, { n: files.length })}
            </p>
            <Button variant="ghost" size="xs" onClick={clearAll}>
              {clearAllLabel}
            </Button>
          </div>
          <ul className="space-y-1.5">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              >
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeFile(i)}
                  aria-label={template(removeAriaTpl, { name: file.name })}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
