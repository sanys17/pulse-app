import {
  alertLabel,
  alertOffsets,
  alertSummary,
  applyPrimary,
  applySecondary,
  primaryChoice,
  secondaryChoice,
  type AlertChoice,
} from "../lib/alerts.ts";
import { SelectField, type SelectOption } from "./SelectField";

interface AlertPickerProps {
  value: number[] | null;
  onChange: (value: number[] | null) => void;
  timed: boolean;
  /** When given, the first select offers "Default (...)" which means null. */
  defaultAlerts?: number[];
  label?: string;
}

const toChoice = (raw: string): AlertChoice => (raw === "default" || raw === "none" ? raw : Number(raw));

export function AlertPicker({ value, onChange, timed, defaultAlerts, label = "Alert" }: AlertPickerProps) {
  const offsets = alertOffsets(timed);
  const primary = primaryChoice(value);
  const secondary = secondaryChoice(value);

  const primaryOptions: SelectOption[] = [
    ...(defaultAlerts ? [{ value: "default", label: `Default (${alertSummary(defaultAlerts, timed)})` }] : []),
    { value: "none", label: "None" },
    ...offsets.map((m) => ({ value: String(m), label: alertLabel(m, timed) })),
  ];
  // Keep a stored value selectable even if it is not in this list (e.g. a timed offset on a date-only item).
  if (typeof primary === "number" && !offsets.includes(primary)) {
    primaryOptions.push({ value: String(primary), label: alertLabel(primary, true) });
  }
  const secondaryOptions: SelectOption[] = [
    { value: "none", label: "None" },
    ...offsets.filter((m) => m !== primary).map((m) => ({ value: String(m), label: alertLabel(m, timed) })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <SelectField
        label={label}
        value={String(primary)}
        options={primaryOptions}
        onChange={(raw) => onChange(applyPrimary(value, toChoice(raw)))}
      />
      {typeof primary === "number" && (
        <SelectField
          label={`Second ${label.toLowerCase()}`}
          value={String(secondary)}
          options={secondaryOptions}
          onChange={(raw) => onChange(applySecondary(value, raw === "none" ? "none" : Number(raw)))}
        />
      )}
    </div>
  );
}
