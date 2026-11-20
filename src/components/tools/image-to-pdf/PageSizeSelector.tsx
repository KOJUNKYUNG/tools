"use client";

import { ChoiceSelect } from "@/components/common/ChoiceSelect";
import { ChoiceTabs } from "@/components/common/ChoiceTabs";
import { NumberField } from "@/components/common/NumberField";
import { template } from "@/lib/common/template";
import {
  type CustomSizeMm,
  MAX_PAGE_MM,
  MIN_PAGE_MM,
  PAGE_MARGINS,
  PAGE_ORIENTATIONS,
  type PageMargin,
  type PageOrientation,
  type PagePreset,
  type PageSizeMode,
  PRINT_PRESETS,
  SCREEN_PRESETS,
  presetSizeMm,
  toTenthMm,
} from "@/lib/pdf/pageSize";

export interface PageSizeSelectorLabels {
  sizeLabel: string;
  sizePreset: string;
  sizeFit: string;
  sizeCustom: string;
  presetAria: string;
  presetGroupPrint: string;
  presetGroupScreen: string;
  presetPrintOptionTemplate: string;
  presetNameLetter: string;
  presetScreenWide: string;
  presetScreenStandard: string;
  customWidth: string;
  customHeight: string;
  orientationLabel: string;
  orientationAuto: string;
  orientationPortrait: string;
  orientationLandscape: string;
  marginLabel: string;
  marginNone: string;
  marginOptionTemplate: string;
  marginFill: string;
}

const FIELD_CLASS =
  "w-full rounded-[5px] border px-2.5 py-1.5 font-body text-[12px] tabular-nums outline-none focus:border-[color:var(--emphasis)] focus:ring-1 focus:ring-[color:var(--emphasis)]";
const FIELD_STYLE = {
  background: "var(--surface)",
  borderColor: "var(--border)",
  color: "var(--ink-strong)",
} as const;

export function PageSizeSelector({
  mode,
  onModeChange,
  preset,
  onPresetChange,
  custom,
  onCustomChange,
  orientation,
  onOrientationChange,
  margin,
  onMarginChange,
  labels,
}: {
  mode: PageSizeMode;
  onModeChange: (mode: PageSizeMode) => void;
  preset: PagePreset;
  onPresetChange: (preset: PagePreset) => void;
  custom: CustomSizeMm;
  onCustomChange: (next: CustomSizeMm) => void;
  orientation: PageOrientation;
  onOrientationChange: (next: PageOrientation) => void;
  margin: PageMargin;
  onMarginChange: (next: PageMargin) => void;
  labels: PageSizeSelectorLabels;
}) {
  // ISO and JIS sizes are written the same in every language (A4, B5);
  // Letter's name comes from the dictionary.
  const printName: Record<(typeof PRINT_PRESETS)[number], string> = {
    a3: "A3",
    a4: "A4",
    a5: "A5",
    b4: "B4",
    b5: "B5",
    letter: labels.presetNameLetter,
  };
  const screenLabel: Record<(typeof SCREEN_PRESETS)[number], string> = {
    "16:9": labels.presetScreenWide,
    "4:3": labels.presetScreenStandard,
  };
  const orientationLabel: Record<PageOrientation, string> = {
    auto: labels.orientationAuto,
    portrait: labels.orientationPortrait,
    landscape: labels.orientationLandscape,
  };

  return (
    <div className="space-y-2">
      <ChoiceTabs
        label={labels.sizeLabel}
        options={[
          { value: "preset", label: labels.sizePreset },
          { value: "image-fit", label: labels.sizeFit },
          { value: "custom", label: labels.sizeCustom },
        ]}
        value={mode}
        onChange={onModeChange}
      />

      {/* One fixed-height slot for every mode, empty under image fit, so the
          picture cards below never move when the mode changes. */}
      <div className="flex h-[34px] items-center">
        {mode === "preset" && (
          <ChoiceSelect
            ariaLabel={labels.presetAria}
            groups={[
              {
                label: labels.presetGroupPrint,
                options: PRINT_PRESETS.map((p) => {
                  const { widthMm, heightMm } = presetSizeMm(p);
                  return {
                    value: p,
                    label: template(labels.presetPrintOptionTemplate, {
                      name: printName[p],
                      w: Math.round(widthMm),
                      h: Math.round(heightMm),
                    }),
                  };
                }),
              },
              {
                label: labels.presetGroupScreen,
                options: SCREEN_PRESETS.map((p) => ({ value: p, label: screenLabel[p] })),
              },
            ]}
            value={preset}
            onChange={onPresetChange}
          />
        )}

        {mode === "custom" && (
          <div className="flex w-full items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="shrink-0 whitespace-nowrap font-mono text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {labels.customWidth}
              </span>
              <NumberField
                min={MIN_PAGE_MM}
                max={toTenthMm(MAX_PAGE_MM)}
                fallback={MIN_PAGE_MM}
                normalize={toTenthMm}
                inputMode="decimal"
                value={custom.widthMm}
                onCommit={(widthMm) => onCustomChange({ ...custom, widthMm })}
                ariaLabel={labels.customWidth}
                className={FIELD_CLASS}
                style={FIELD_STYLE}
              />
            </label>
            <span className="font-body text-[12px]" style={{ color: "var(--ink-soft)" }}>
              ×
            </span>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="shrink-0 whitespace-nowrap font-mono text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {labels.customHeight}
              </span>
              <NumberField
                min={MIN_PAGE_MM}
                max={toTenthMm(MAX_PAGE_MM)}
                fallback={MIN_PAGE_MM}
                normalize={toTenthMm}
                inputMode="decimal"
                value={custom.heightMm}
                onCommit={(heightMm) => onCustomChange({ ...custom, heightMm })}
                ariaLabel={labels.customHeight}
                className={FIELD_CLASS}
                style={FIELD_STYLE}
              />
            </label>
          </div>
        )}
      </div>

      {/* Orientation and margin do nothing under image fit, so they are hidden
          there, keeping their space so nothing below them moves. */}
      <div
        className={`space-y-2 ${mode === "image-fit" ? "invisible" : ""}`}
        aria-hidden={mode === "image-fit" || undefined}
      >
        <ChoiceTabs
          label={labels.orientationLabel}
          options={PAGE_ORIENTATIONS.map((o) => ({ value: o, label: orientationLabel[o] }))}
          value={orientation}
          onChange={onOrientationChange}
        />
        <ChoiceTabs
          label={labels.marginLabel}
          options={PAGE_MARGINS.map((m) => ({
            // ChoiceTabs takes string values; the choices stay distinct as strings.
            value: String(m),
            label:
              m === "fill"
                ? labels.marginFill
                : m === 0
                  ? labels.marginNone
                  : template(labels.marginOptionTemplate, { n: m }),
          }))}
          value={String(margin)}
          onChange={(v) => onMarginChange(marginFromValue(v))}
        />
      </div>
    </div>
  );
}

/** The margin a tab's value names; only values built from PAGE_MARGINS reach here. */
function marginFromValue(value: string): PageMargin {
  return PAGE_MARGINS.find((m) => String(m) === value) ?? 0;
}
