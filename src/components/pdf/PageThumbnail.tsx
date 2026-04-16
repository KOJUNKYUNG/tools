"use client";

import { RotateCwIcon, Trash2Icon, GripVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageInfo } from "@/lib/pdf/managePages";

interface PageThumbnailProps {
  page: PageInfo;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PageThumbnail({
  page,
  onRotate,
  onDelete,
}: PageThumbnailProps) {
  return (
    <div
      className={`group relative flex cursor-grab flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors active:cursor-grabbing ${
        page.deleted
          ? "border-destructive/30 bg-destructive/5 opacity-50"
          : "border-border bg-background hover:border-primary/40"
      }`}
    >
      <div className="pointer-events-none absolute top-1 left-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <GripVerticalIcon className="size-4" />
      </div>

      <div className="relative overflow-hidden rounded-lg">
        <img
          src={page.thumbnail}
          alt={`페이지 ${page.index + 1}`}
          className="h-auto w-full"
          style={{ transform: `rotate(${page.rotation}deg)` }}
          draggable={false}
        />
      </div>

      <div className="flex w-full items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {page.index + 1}
        </span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRotate(page.id)}
            title="90° 회전"
          >
            <RotateCwIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(page.id)}
            title={page.deleted ? "삭제 취소" : "삭제"}
          >
            <Trash2Icon
              className={`size-3.5 ${page.deleted ? "text-destructive" : ""}`}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
