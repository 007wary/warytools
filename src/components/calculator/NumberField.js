"use client";

import { useId, useRef } from "react";
import { colors } from "@/lib/theme";
import { sanitizeNumericInput } from "@/lib/calculatorInput";

// A numeric input that behaves the way people actually use one.
//
// Every calculator previously used a bare <input type="number">, which carries
// three real problems:
//
//   1. **Scroll-wheel hijacking.** Focus the field, scroll the page, and the
//      value silently changes. This is a long-standing browser behaviour and a
//      genuine source of wrong answers, so we blur-on-wheel to neutralise it.
//   2. **The wrong mobile keyboard.** type="number" gives a spinner-oriented
//      keypad that on several Android keyboards omits the decimal point
//      entirely. `inputMode="decimal"` on a text input is the current standard
//      guidance and yields a numeric pad *with* a decimal key.
//   3. **Paste rejection.** type="number" discards a pasted "1,234.56"
//      outright, leaving the field empty with no explanation — and people
//      paste from spreadsheets and invoices constantly.
//
// Using type="text" also means the raw string is preserved exactly (a
// half-typed "12." stays "12."), which is what the string-state rule in
// CLAUDE.md requires. Validation happens in lib/calculatorInput.js.

export default function NumberField({
  label,
  value,
  onChange,
  placeholder = "0",
  suffix,
  prefix,
  invalid = false,
  hint,
  maxWidth = "100%",
  autoFocus = false,
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const inputRef = useRef(null);

  return (
    <div style={{ flex: `1 1 ${maxWidth === "100%" ? "160px" : maxWidth}`, maxWidth, minWidth: 0 }}>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: "14px",
          color: colors.textSecondary,
          marginBottom: "6px",
        }}
      >
        {label}
      </label>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          border: `1px solid ${invalid ? colors.danger : colors.borderInput}`,
          borderRadius: "8px",
          backgroundColor: colors.surface,
          padding: "0 12px",
        }}
      >
        {prefix && (
          <span aria-hidden="true" style={{ fontSize: "15px", color: colors.textMuted }}>
            {prefix}
          </span>
        )}
        <input
          id={id}
          ref={inputRef}
          type="text"
          // The pattern is what triggers the numeric keypad on iOS Safari,
          // which ignores inputMode on its own in older versions.
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="done"
          autoFocus={autoFocus}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(sanitizeNumericInput(event.target.value))}
          onWheel={() => inputRef.current?.blur()}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            // 16px is the threshold below which iOS Safari zooms the viewport
            // on focus — smaller text here would make every field jarring on
            // an iPhone.
            fontSize: "16px",
            padding: "10px 0",
            color: colors.text,
          }}
        />
        {suffix && (
          <span aria-hidden="true" style={{ fontSize: "14px", color: colors.textMuted }}>
            {suffix}
          </span>
        )}
      </div>

      {hint && (
        <p id={hintId} style={{ fontSize: "12px", color: colors.textMuted, marginTop: "5px" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
