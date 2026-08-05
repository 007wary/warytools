"use client";

import { useId } from "react";
import { colors } from "@/lib/theme";
import { MIN_YEAR, MAX_YEAR } from "@/lib/dateMath";

// A native <input type="date"> rather than anything hand-rolled: the built-in
// picker is better than a custom calendar on every platform, and far better on
// mobile. Shared by the age and date-difference calculators, which previously
// each carried their own copy of this markup with slightly different widths.
//
// min/max are set so the native picker steers users toward sensible years —
// they don't validate anything on their own (a typed or pasted value bypasses
// them entirely), which is why validateDateInput() still checks the range.
export default function DateField({ label, value, onChange, hint, invalid, max }) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div style={{ flex: "1 1 190px", maxWidth: "230px", minWidth: 0 }}>
      <label
        htmlFor={id}
        style={{ display: "block", fontSize: "14px", color: colors.textSecondary, marginBottom: "6px" }}
      >
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={`${MIN_YEAR}-01-01`}
        max={max || `${MAX_YEAR}-12-31`}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          // 16px avoids the iOS Safari focus-zoom.
          fontSize: "16px",
          border: `1px solid ${invalid ? colors.danger : colors.borderInput}`,
          borderRadius: "8px",
          color: colors.text,
          backgroundColor: colors.surface,
        }}
      />
      {hint && (
        <p id={hintId} style={{ fontSize: "12px", color: colors.textMuted, marginTop: "5px" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
