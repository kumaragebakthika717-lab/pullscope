"use client";

import { Input } from "@/components/ui/input";

export function NumInput({
  value,
  onChange,
  disabled,
  min = 0,
  max,
  step = 1,
  className,
  placeholder,
  id,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder ?? "—"}
      value={value ?? ""}
      onChange={(e) => {
        const next = e.target.valueAsNumber;
        onChange(Number.isFinite(next) ? next : null);
      }}
      className={className}
    />
  );
}