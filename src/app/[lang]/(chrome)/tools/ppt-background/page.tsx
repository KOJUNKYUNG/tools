"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { InlineGallery } from "@/components/ppt/InlineGallery";
import { Button } from "@/components/ui/button";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  changeBackground,
  type BgMode,
} from "@/lib/ppt/changeBackground";
import {
  extractCurrentBackgrounds,
  type SlideBackground,
} from "@/lib/ppt/extractCurrentBackgrounds";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import type { GalleryImage } from "@/lib/gallery/types";
import {
  PaintbrushIcon,
  ImageIcon,
  XIcon,
  Loader2Icon,
  LayersIcon,
} from "lucide-react";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
};

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

const MODE_OPTIONS: { value: BgMode; label: string; desc: string }[] = [
  {
    value: "all-slides",
    label: "전체 슬라이드 일괄 적용",
    desc: "모든 슬라이드의 배경을 개별적으로 교체합니다.",
  },
  {
    value: "master",
    label: "마스터 슬라이드 적용",
    desc: "마스터/레이아웃 슬라이드의 배경만 교체하여 전체에 반영합니다.",
  },
];

const SOURCE_LABEL: Record<string, string> = {
  slide: "슬라이드",
  layout: "레이아웃",
  master: "마스터",
  none: "없음",
};

export default function PptBackgroundPage() {
  const [bgFiles, setBgFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<BgMode>("all-slides");

  const [galleryImage, setGalleryImage] = useState<GalleryImage | null>(null);
  const [currentBgs, setCurrentBgs] = useState<SlideBackground[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgObjectUrls, setBgObjectUrls] = useState<Map<number, string>>(new Map());
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);

  const bgImage = bgFiles[0];

  const {
    files: pptxFiles,
    setFiles: setPptxFiles,
    status,
    progress,
    errorMessage,
    run,
    retry,
    download,
  } = useToolProcessor<Uint8Array>({
    processor: (files, onProgress) =>
      changeBackground({
        pptxFile: files[0],
        bgImage,
        mode,
        onProgress,
      }),
    onDownload: (bytes) => {
      const baseName =
        pptxFiles[0]?.name.replace(/\.pptx?$/i, "") ?? "presentation";
      downloadBlob(
        bytes,
        `${baseName}-bg-changed.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    },
  });

  const pptxFile = pptxFiles[0];
  const isPpt = pptxFile?.name.toLowerCase().endsWith(".ppt");
  const canProcess = pptxFile && bgImage && !isPpt;

  useEffect(() => {
    if (!pptxFile || isPpt) {
      setCurrentBgs([]);
      bgObjectUrls.forEach((url) => URL.revokeObjectURL(url));
      setBgObjectUrls(new Map());
      return;
    }

    setBgLoading(true);
    extractCurrentBackgrounds(pptxFile)
      .then((bgs) => {
        setCurrentBgs(bgs);
        const urls = new Map<number, string>();
        bgs.forEach((bg) => {
          if (bg.imageBlob) {
            urls.set(bg.slideIndex, URL.createObjectURL(bg.imageBlob));
          }
        });
        bgObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        setBgObjectUrls(urls);
      })
      .catch(() => {
        setCurrentBgs([]);
      })
      .finally(() => {
        setBgLoading(false);
      });

    return () => {
      bgObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pptxFile, isPpt]);

  const handleGallerySelect = useCallback(
    async (image: GalleryImage) => {
      setGalleryImage(image);
      if (bgPreviewUrl) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(image.thumbnailUrl);
      try {
        const res = await fetch(image.url);
        const blob = await res.blob();
        const ext = image.url.includes(".png") ? "png" : "jpg";
        const file = new File([blob], `gallery-${image.id}.${ext}`, {
          type: ext === "png" ? "image/png" : "image/jpeg",
        });
        setBgFiles([file]);
      } catch {
        setGalleryImage(null);
        setBgPreviewUrl(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [bgPreviewUrl],
  );

  const handleDirectUpload = useCallback(
    (files: File[]) => {
      setBgFiles(files);
      setGalleryImage(null);
      if (bgPreviewUrl) URL.revokeObjectURL(bgPreviewUrl);
      if (files[0]) {
        setBgPreviewUrl(URL.createObjectURL(files[0]));
      } else {
        setBgPreviewUrl(null);
      }
    },
    [bgPreviewUrl],
  );

  const clearBgSelection = useCallback(() => {
    setGalleryImage(null);
    setBgFiles([]);
    if (bgPreviewUrl) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
  }, [bgPreviewUrl]);

  const downloadFileName = `${pptxFile?.name.replace(/\.pptx?$/i, "") ?? "presentation"}-bg-changed.pptx`;
  const hasBgImages = currentBgs.some((bg) => bg.imageBlob !== null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PaintbrushIcon className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          PPT 배경 일괄 변경
        </h1>
        <p className="mt-2 text-muted-foreground">
          PPTX 슬라이드의 배경 이미지를 한 번에 교체합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: PPTX Upload */}
        <div>
          <p className="mb-2 text-sm font-medium">1. PPT/PPTX 파일 업로드</p>
          <FileUpload
            accept={PPTX_ACCEPT}
            multiple={false}
            onFiles={setPptxFiles}
            label="PPT/PPTX 파일을 드래그하거나 클릭하여 업로드"
            description=".ppt 및 .pptx 형식을 지원합니다."
          />
        </div>

        {isPpt && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <p>
              <strong>배경 변경은 .pptx 형식만 지원합니다.</strong>
            </p>
            <p>
              .ppt 파일은 구버전 바이너리 형식으로, 브라우저에서 배경을 수정할 수
              없습니다. 아래 방법 중 하나로 .pptx로 변환한 후 다시 업로드해 주세요.
            </p>
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <p className="font-semibold">방법 1: Microsoft PowerPoint</p>
              <ol className="list-inside list-decimal space-y-0.5 text-xs">
                <li>.ppt 파일을 PowerPoint에서 열기</li>
                <li>
                  <strong>파일 → 다른 이름으로 저장</strong> 클릭
                </li>
                <li>
                  파일 형식에서{" "}
                  <strong>PowerPoint 프레젠테이션 (*.pptx)</strong> 선택 후 저장
                </li>
              </ol>
            </div>
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <p className="font-semibold">
                방법 2: Google 슬라이드 (무료, 설치 불필요)
              </p>
              <ol className="list-inside list-decimal space-y-0.5 text-xs">
                <li>
                  <a
                    href="https://slides.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    slides.google.com
                  </a>
                  {" "}접속 후 Google 드라이브에 .ppt 파일 업로드
                </li>
                <li>업로드된 파일을 Google 슬라이드로 열기</li>
                <li>
                  <strong>파일 → 다운로드 → Microsoft PowerPoint (.pptx)</strong>
                </li>
              </ol>
            </div>
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <p className="font-semibold">방법 3: LibreOffice Impress (무료 설치형)</p>
              <ol className="list-inside list-decimal space-y-0.5 text-xs">
                <li>
                  <a
                    href="https://www.libreoffice.org/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    LibreOffice
                  </a>
                  {" "}설치 후 .ppt 파일 열기
                </li>
                <li>
                  <strong>파일 → 다른 이름으로 저장</strong> 클릭
                </li>
                <li>
                  파일 형식 <strong>PowerPoint 2007-365 (.pptx)</strong> 선택 후
                  저장
                </li>
              </ol>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              💡 이미지 추출 기능은 .ppt 파일도 지원합니다.
            </p>
          </div>
        )}

        {/* Current backgrounds */}
        {pptxFile && !isPpt && bgLoading && (
          <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            슬라이드 배경을 분석하는 중…
          </div>
        )}

        {pptxFile && !isPpt && !bgLoading && currentBgs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LayersIcon className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">현재 슬라이드 배경</p>
              {hasBgImages && (
                <span className="text-xs text-muted-foreground">
                  ({currentBgs.filter((b) => b.imageBlob).length}개 배경 이미지 발견)
                </span>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {currentBgs.map((bg) => {
                const url = bgObjectUrls.get(bg.slideIndex);
                return (
                  <div
                    key={bg.slideIndex}
                    className="flex shrink-0 flex-col items-center gap-1"
                  >
                    <div className="relative h-[72px] w-[128px] overflow-hidden rounded-md border bg-muted">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={bg.slideName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                          배경 없음
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-medium">{bg.slideName}</p>
                      {bg.source !== "none" && (
                        <p className="text-[10px] text-muted-foreground">
                          {SOURCE_LABEL[bg.source]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Background selection */}
        {pptxFile && !isPpt && (
          <div className="space-y-3">
            <p className="text-sm font-medium">2. 새 배경 이미지 선택</p>

            {/* Selected background display + preview */}
            {bgImage && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                  {galleryImage ? (
                    <PaintbrushIcon className="size-5 text-primary" />
                  ) : (
                    <ImageIcon className="size-5 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {galleryImage ? galleryImage.title : bgImage.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {galleryImage
                        ? "갤러리에서 선택한 배경 이미지"
                        : "직접 업로드한 배경 이미지"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={clearBgSelection}
                    aria-label="배경 이미지 선택 해제"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>

                {bgPreviewUrl && (
                  <div className="overflow-hidden rounded-lg border">
                    <p className="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      새 배경 미리보기
                    </p>
                    <div className="relative aspect-video bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bgPreviewUrl}
                        alt="새 배경 미리보기"
                        className="size-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Direct upload */}
            {!bgImage && (
              <FileUpload
                accept={IMAGE_ACCEPT}
                multiple={false}
                onFiles={handleDirectUpload}
                label="배경 이미지를 드래그하거나 클릭하여 업로드"
                description="JPG, PNG 파일을 지원합니다."
              />
            )}

            {/* Inline gallery */}
            <InlineGallery
              onSelect={handleGallerySelect}
              selectedImageId={galleryImage?.id}
              forceCollapsed={!!bgImage}
            />
          </div>
        )}

        {/* Step 3: Mode selection */}
        {canProcess && status === "idle" && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-medium">3. 적용 모드</p>
            <div className="space-y-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    mode === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>

            {mode === "master" && (
              <p className="text-xs text-muted-foreground">
                개별 슬라이드에 자체 배경이 설정된 경우, 마스터 배경이 적용되지
                않을 수 있습니다.
              </p>
            )}
          </div>
        )}

        {canProcess && status === "idle" && (
          <Button className="w-full" size="lg" onClick={run}>
            배경 변경 적용
          </Button>
        )}

        <ProcessingStatus
          status={status}
          progress={progress}
          errorMessage={errorMessage}
          onRetry={retry}
          onDownload={download}
          downloadFileName={downloadFileName}
        />
      </div>
    </div>
  );
}
