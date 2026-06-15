"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { ToolTopStrip } from "@/components/common/ToolTopStrip";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import { uploadLimitFor } from "@/lib/constants";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { encryptPdf, decryptPdf, type QpdfCryptoResult } from "@/lib/pdf/qpdfCrypto";
import { deriveLockedName, type LockMode } from "@/lib/pdf/pdfLockNaming";
import { validateLockForm, validateUnlockForm } from "@/lib/pdf/lockFormValidation";
import { isPdfEncrypted } from "@/lib/pdf/detectEncryption";
import { PdfLockModeToggle } from "./PdfLockModeToggle";
import { PdfLockPreview } from "./PdfLockPreview";
import { LockControls, type LockState } from "./LockControls";
import { UnlockControls, type UnlockState } from "./UnlockControls";
import { PdfLockResult } from "./PdfLockResult";
import type { PdfLockLabels } from "./labels";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };
const PDF_MIME = "application/pdf";

const DEFAULT_LOCK: LockState = {
  password: "",
  confirm: "",
  permissions: { allowPrint: false, allowCopy: false },
};

const DEFAULT_UNLOCK: UnlockState = { password: "" };

interface PdfLockProps {
  labels: PdfLockLabels;
  inline?: boolean;
}

export function PdfLock({ labels, inline = false }: PdfLockProps) {
  const [mode, setMode] = useState<LockMode>("lock");
  // The mode that produced the current result. Snapshotted when a run starts so
  // the result panel shows the correct lock/unlock copy even if the user flips
  // the toggle afterward. Reading modeRef during render is both an ESLint error
  // and a real staleness bug, so we keep it in state.
  const [resultMode, setResultMode] = useState<LockMode>("lock");
  const [lockState, setLockState] = useState<LockState>(DEFAULT_LOCK);
  const [unlockState, setUnlockState] = useState<UnlockState>(DEFAULT_UNLOCK);
  // null = detecting, true = uploaded PDF is already encrypted, false = plain.
  const [encrypted, setEncrypted] = useState<boolean | null>(null);
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<File[]>([]);
  const modeRef = useRef<LockMode>(mode);
  // The uploaded file read once into bytes during encryption detection, reused
  // by the qpdf run so a large PDF isn't re-read from the Blob per operation.
  // (The preview keeps its own read because pdfjs detaches the buffer it gets.)
  const bytesRef = useRef<Uint8Array | null>(null);

  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
    download,
  } = useToolProcessor<QpdfCryptoResult>({
    processor: async (processorFiles, onProgress) => {
      // Prefer the bytes already read during encryption detection; fall back to
      // reading the File if detection hasn't populated them yet.
      const bytes =
        bytesRef.current ?? new Uint8Array(await processorFiles[0].arrayBuffer());
      if (modeRef.current === "lock") {
        return encryptPdf({
          bytes,
          userPassword: lockState.password,
          permissions: lockState.permissions,
          onProgress,
        });
      }
      return decryptPdf({ bytes, password: unlockState.password, onProgress });
    },
    onDownload: (res) =>
      downloadBlob(
        res.data,
        deriveLockedName(filesRef.current[0]?.name ?? "", modeRef.current),
        PDF_MIME,
      ),
    errorOptions: {
      memoryHint: labels.errorMemory,
      corruptOutputHint: labels.errorCorrupt,
      wrongPasswordHint: labels.errorWrongPassword,
    },
  });

  useEffect(() => {
    filesRef.current = files;
    modeRef.current = mode;
  });

  const file = files[0];

  // Detect whether the uploaded PDF is already encrypted, then steer the UI:
  // an encrypted file auto-switches to unlock mode, a plain file to lock mode.
  // This both prevents the "unusable output" error from running the wrong op
  // and shows the user a first-page preview only when it's meaningful (plain).
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      // Reset to "detecting" inside the async flow (setState in the effect body
      // itself is disallowed by react-hooks/set-state-in-effect).
      setEncrypted(null);
      bytesRef.current = null;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        // Share these bytes with the qpdf run (isPdfEncrypted uses pdf-lib,
        // which does NOT detach the buffer, so they stay valid to reuse).
        bytesRef.current = bytes;
        const isEnc = await isPdfEncrypted(bytes);
        if (cancelled) return;
        setEncrypted(isEnc);
        setMode(isEnc ? "unlock" : "lock");
      } catch {
        // Detection failed — leave mode as-is and don't gate buttons.
        if (!cancelled) setEncrypted(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      retry();
      setFiles(newFiles.slice(0, 1));
    },
    [retry, setFiles],
  );

  const handleReupload = useCallback(() => reuploadInputRef.current?.click(), []);

  const handleHiddenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (status === "processing") {
        e.target.value = "";
        return;
      }
      const picked = e.target.files ? Array.from(e.target.files) : [];
      // The dropzone enforces maxSize; this hidden re-upload input bypasses it,
      // so guard here too (mirrors pdf-watermark).
      const tooLarge = picked.find((f) => f.size > uploadLimitFor("pdf-lock"));
      if (tooLarge) {
        toast.error(
          template(labels.fileUpload.tooLargeTemplate, {
            name: tooLarge.name,
            size: formatBytes(uploadLimitFor("pdf-lock")),
          }),
        );
        e.target.value = "";
        return;
      }
      if (picked.length > 0) handleFilesChange(picked);
      e.target.value = "";
    },
    [handleFilesChange, status, labels.fileUpload.tooLargeTemplate],
  );

  const onReset = useCallback(() => {
    handleFilesChange([]);
    setMode("lock");
    setLockState(DEFAULT_LOCK);
    setUnlockState(DEFAULT_UNLOCK);
    setEncrypted(null);
    bytesRef.current = null;
  }, [handleFilesChange]);

  const handleAgain = useCallback(() => retry(), [retry]);

  const patchLock = useCallback(
    (patch: Partial<LockState>) => setLockState((p) => ({ ...p, ...patch })),
    [],
  );
  const patchUnlock = useCallback(
    (patch: Partial<UnlockState>) => setUnlockState((p) => ({ ...p, ...patch })),
    [],
  );

  const hasFile = !!file;
  const busy = status === "processing";
  const isDone = status === "done" && !!result;

  // Button gating: don't let the user lock an already-encrypted file (qpdf
  // refuses to double-encrypt → "unusable output") or unlock a plain file.
  // `encrypted === null` means detection is still pending, so allow both.
  const lockDisabled = encrypted === true;
  const unlockDisabled = encrypted === false;
  const actionDisabled = (mode === "lock" && lockDisabled) || (mode === "unlock" && unlockDisabled);

  const fileInfo = file
    ? template(labels.fileInfoTemplate, { name: file.name, size: formatBytes(file.size) })
    : "";

  const handleActionClick = useCallback(() => {
    if (!file) {
      toast.error(labels.uploadPrompt);
      return;
    }
    // Pre-validate so the worker never throws and so a typo can't silently lock
    // a PDF with the wrong password (data-loss guard).
    if (mode === "lock") {
      const v = validateLockForm({ password: lockState.password, confirm: lockState.confirm });
      if (!v.ok) {
        toast.error(
          v.reason === "empty"
            ? labels.needPassword
            : v.reason === "tooShort"
              ? labels.needPasswordTooShort
              : labels.passwordMismatch,
        );
        return;
      }
    } else {
      const v = validateUnlockForm({ password: unlockState.password });
      if (!v.ok) {
        toast.error(labels.needPassword);
        return;
      }
    }
    setResultMode(mode);
    run();
  }, [
    file,
    mode,
    lockState.password,
    lockState.confirm,
    unlockState.password,
    run,
    labels.uploadPrompt,
    labels.needPassword,
    labels.needPasswordTooShort,
    labels.passwordMismatch,
  ]);

  const actionLabel = mode === "lock" ? labels.lock : labels.unlock;

  const body = (
    <div className={inline ? "space-y-4" : "space-y-4 px-6 py-3"}>
      <input
        ref={reuploadInputRef}
        type="file"
        accept=".pdf"
        onChange={handleHiddenInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasFile ? (
        <FileUpload
          accept={PDF_ACCEPT}
          multiple={false}
          hideFileList
          maxSize={uploadLimitFor("pdf-lock")}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
          labels={{ ...labels.fileUpload, maxSize: labels.uploadMaxSize }}
        />
      ) : (
        <div className="flex flex-col gap-3" style={{ height: "52vh" }}>
          <ToolTopStrip
            filesSummary={fileInfo}
            meta={
              encrypted !== null ? (
                <span
                  className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-medium"
                  style={{
                    background: encrypted ? "var(--emphasis)" : "var(--surface-2)",
                    color: encrypted ? "var(--surface)" : "var(--ink-soft)",
                    border: encrypted ? undefined : "1px solid var(--border)",
                  }}
                >
                  {encrypted ? labels.badgeEncrypted : labels.badgePlain}
                </span>
              ) : undefined
            }
            onReupload={handleReupload}
            reuploadLabel={labels.reupload}
            busy={busy}
            onExecute={status === "idle" ? handleActionClick : undefined}
            executeLabel={actionLabel}
            executeDisabled={actionDisabled}
          />

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2">
            {/* LEFT: preview (persists) */}
            <div className="flex h-full min-h-0 flex-col gap-2">
              <PdfLockPreview file={file} encrypted={encrypted} labels={labels} />
          </div>

          {/* RIGHT: mode toggle + controls / result / status */}
          {isDone && result ? (
            <div className="self-start">
              <PdfLockResult
                mode={resultMode}
                outputSize={result.data.length}
                onDownload={download}
                onAgain={handleAgain}
                labels={labels}
              />
            </div>
          ) : status === "idle" ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <PdfLockModeToggle value={mode} onChange={setMode} labels={labels} disabled={busy} />
              {actionDisabled && (
                <p className="-mt-1 font-body text-[11px] leading-[1.4]" style={{ color: "var(--ink-soft)" }}>
                  {mode === "lock" ? labels.lockDisabledHint : labels.unlockDisabledHint}
                </p>
              )}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {mode === "lock" ? (
                  <LockControls value={lockState} onChange={patchLock} labels={labels} disabled={busy} />
                ) : (
                  <UnlockControls value={unlockState} onChange={patchUnlock} labels={labels} disabled={busy} />
                )}
              </div>
            </div>
          ) : (
            <ProcessingStatus
              status={status}
              progress={progress}
              errorMessage={errorMessage}
              onRetry={retry}
              labels={{ processing: labels.processing }}
            />
          )}
          </div>
        </div>
      )}
    </div>
  );

  if (inline) return body;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <button
        type="button"
        onClick={onReset}
        disabled={busy}
        aria-label={labels.reset}
        title={labels.reset}
        className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: "var(--ink-soft)" }}
      >
        <RotateCcwIcon className="size-4" />
      </button>
      <div className="flex items-start gap-3 border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0 flex-1">
          <div
            className="font-ko text-[16px] font-medium leading-[1.2] tracking-[0.005em]"
            style={{ color: "var(--headline)" }}
          >
            {labels.title}
          </div>
          <div className="mt-1 font-body text-[12px] leading-[1.45]" style={{ color: "var(--ink)" }}>
            {labels.description}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
