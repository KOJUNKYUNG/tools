"use client";
import type { ScreenSize } from "@/lib/image/slideImage";
import { ChoiceTabs } from "@/components/common/ChoiceTabs";

/**
 * The deck-wide screen size (CONTEXT "Screen size"): every picture, the
 * background included, is sized for it. It changes nothing in the placement
 * preview. Its options' copy (screenFullHd, screen4k) was settled at the
 * spec-end visual QA (#152, 2026-11-07); its label was shortened for the
 * label-beside settings block (#156), to settle at spec #154's QA.
 */
export function ScreenSizeSelector(props: {
  value: ScreenSize;
  onChange: (s: ScreenSize) => void;
  labels: { screenSizeLabel: string; screenFullHd: string; screen4k: string };
}) {
  return (
    <ChoiceTabs
      label={props.labels.screenSizeLabel}
      options={[
        { value: "full-hd", label: props.labels.screenFullHd },
        { value: "4k", label: props.labels.screen4k },
      ]}
      value={props.value}
      onChange={props.onChange}
      labelBeside
    />
  );
}
