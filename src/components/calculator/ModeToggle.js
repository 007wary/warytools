"use client";

import { colors } from "@/lib/theme";

// The GST, interest, and percentage calculators each carried their own
// byte-identical copy of a `ModeButton`, and the unit converter inlined a
// fourth copy in its category row. Beyond the duplication they shared an
// accessibility bug: a plain <button> whose only "selected" signal is a colour
// change tells a screen reader nothing at all about which mode is active.
//
// This renders a real radio group. `role="radiogroup"` + `aria-checked` is the
// correct semantic for "pick exactly one of these", and it brings arrow-key
// navigation, which a row of buttons doesn't have.

export default function ModeToggle({ options, value, onChange, label, size = "md" }) {
  function handleKeyDown(event, index) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    event.preventDefault();
    let nextIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      nextIndex = (index + delta + options.length) % options.length;
    }

    const next = options[nextIndex];
    onChange(next.id);
    // Roving focus follows selection, which is the expected radio behaviour.
    event.currentTarget.parentElement?.children[nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
    >
      {options.map((option, index) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            // Only the selected control is a tab stop; arrows move within the
            // group. Without this, a six-option group costs six tab presses.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{
              border: `1px solid ${active ? colors.primary : colors.border}`,
              backgroundColor: active ? colors.primarySoft : colors.surface,
              color: active ? colors.primary : colors.textSecondary,
              borderRadius: "8px",
              padding: size === "sm" ? "7px 12px" : "10px 16px",
              fontSize: size === "sm" ? "13px" : "14px",
              fontWeight: 500,
              cursor: "pointer",
              // A 1px border change alone shifts nothing, so the active state
              // stays legible in forced-colors/high-contrast mode too.
              outlineOffset: "2px",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
