"use client";

import { useCallback, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { UploadCloudIcon, XIcon, FileIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FILE_SIZE_LIMIT } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";

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
  /** Optional localisation override for the auto-generated hint line. */
  labels?: {
    /** Template for the max-size hint, with {size} substituted (e.g. "최대 {size}", "Max {size}"). */
    maxSize?: string;
  };
}

export function FileUpload({
  accept,
  maxSize = FILE_SIZE_LIMIT.guest,
  multiple = true,
  onFiles,
  label = "파일을 드래그하거나 클릭하여 업로드",
  description,
  hideFileList = false,
  hideAutoHint = false,
  labels,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      for (const rejection of rejections) {
        const name = rejection.file.name;
        for (const err of rejection.errors) {
          if (err.code === "file-too-large") {
            toast.error(`${name}: 파일 크기가 ${formatBytes(maxSize)}를 초과합니다.`);
          } else if (err.code === "file-invalid-type") {
            toast.error(`${name}: 지원하지 않는 파일 형식입니다.`);
          } else {
            toast.error(`${name}: ${err.message}`);
          }
        }
      }

      if (accepted.length > 0) {
        const next = multiple ? [...files, ...accepted] : accepted;
        setFiles(next);
        onFiles(next);
      }
    },
    [files, maxSize, multiple, onFiles],
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

  const acceptedExtensions = Object.values(accept).flat().join(", ");
  const maxSizeTemplate = labels?.maxSize ?? "최대 {size}";
  const maxSizeHint = maxSizeTemplate.replace("{size}", formatBytes(maxSize));

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
              {acceptedExtensions} · {maxSizeHint}
            </p>
          )}
        </div>
      </div>

      {!hideFileList && files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {files.length}개 파일 선택됨
            </p>
            <Button variant="ghost" size="xs" onClick={clearAll}>
              전체 삭제
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
                  aria-label={`${file.name} 제거`}
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
