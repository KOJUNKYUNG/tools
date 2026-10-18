import { template } from "./template";

/** The preset ladder pdf-compress and ppt-compress share. */
export type CompressionPreset = "low" | "medium" | "high";

/** The next stronger preset, or null for the strongest. */
export const STRONGER_PRESET: Record<CompressionPreset, CompressionPreset | null> = {
  low: "medium",
  medium: "high",
  high: null,
};

/** Each preset's display name, from the tool's i18n copy. */
export interface PresetLabels {
  presetLightLabel: string;
  presetMediumLabel: string;
  presetHeavyLabel: string;
}

/** A preset's display name (Light / Medium / Heavy). */
export function presetLabel(preset: CompressionPreset, labels: PresetLabels): string {
  return { low: labels.presetLightLabel, medium: labels.presetMediumLabel, high: labels.presetHeavyLabel }[
    preset
  ];
}

/** The copy for a preset that could not shrink the file. */
export interface PresetNotSmallerLabels extends PresetLabels {
  /** `{preset}` and `{next}`: the chosen and the next stronger preset's name. */
  notSmallerTryStronger: string;
  /** `{preset}`: the strongest preset's name. */
  notSmallerOptimized: string;
}

/**
 * What to tell the user when `preset` could not shrink the file: try the next
 * stronger preset, or, at the strongest, that even it does not shrink the file.
 */
export function presetNotSmallerMessage(
  preset: CompressionPreset,
  labels: PresetNotSmallerLabels,
): string {
  const next = STRONGER_PRESET[preset];
  return next
    ? template(labels.notSmallerTryStronger, {
        preset: presetLabel(preset, labels),
        next: presetLabel(next, labels),
      })
    : template(labels.notSmallerOptimized, { preset: presetLabel(preset, labels) });
}
