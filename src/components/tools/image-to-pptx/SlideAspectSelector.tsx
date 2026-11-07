"use client";
import type { SlideKind } from "@/lib/pptx/slideSize";
import { ChoiceTabs } from "@/components/common/ChoiceTabs";

export function SlideAspectSelector(props: {
  value: SlideKind;
  onChange: (k: SlideKind) => void;
  labels: { slideAspectLabel: string; aspect169: string; aspect43: string };
}) {
  return (
    <ChoiceTabs
      label={props.labels.slideAspectLabel}
      options={[
        { value: "16:9", label: props.labels.aspect169 },
        { value: "4:3", label: props.labels.aspect43 },
      ]}
      value={props.value}
      onChange={props.onChange}
      labelBeside
    />
  );
}
