"use client";
import type { PlacementAlign } from "@/lib/pptx/slidePlacement";
import { ChoiceTabs } from "@/components/common/ChoiceTabs";

export function AlignSelector(props: {
  value: PlacementAlign;
  onChange: (a: PlacementAlign) => void;
  labels: { alignLabel: string; alignTopLeft: string; alignCenter: string };
}) {
  return (
    <ChoiceTabs
      label={props.labels.alignLabel}
      options={[
        { value: "top-left", label: props.labels.alignTopLeft },
        { value: "center", label: props.labels.alignCenter },
      ]}
      value={props.value}
      onChange={props.onChange}
      labelBeside
    />
  );
}
