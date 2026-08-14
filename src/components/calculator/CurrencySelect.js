"use client";

import { useId } from "react";
import { colors } from "@/lib/theme";
import { CURRENCIES } from "@/lib/calculatorCurrency";

// The currency picker for the EMI and Interest calculators.
//
// A native <select> rather than the site's ModeToggle, deliberately. ModeToggle
// renders a radio group, which is the right control for two to four options
// (interest type, compounding frequency) and a wall of twenty-plus buttons for
// this. A select also gets the native wheel picker on mobile and type-ahead on
// desktop for free — both of which matter on a list this long.
//
// This is the only <select> on the site, so it carries its own styling rather
// than a shared primitive; the surrounding calculators use inline styles per
// the repo convention.

export default function CurrencySelect({ value, onChange, label = "Currency" }) {
  const id = useId();

  return (
    <div style={{ flex: "0 1 auto", minWidth: 0 }}>
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

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          border: `1px solid ${colors.borderInput}`,
          borderRadius: "8px",
          backgroundColor: colors.surface,
          color: colors.text,
          // 16px matches NumberField: below this iOS Safari zooms the viewport
          // when the control takes focus.
          fontSize: "16px",
          padding: "10px 12px",
          // The two controls sit side by side, so their heights must agree.
          // NumberField's is 10px padding + 16px text + 1px borders.
          lineHeight: "normal",
          maxWidth: "100%",
        }}
      >
        {CURRENCIES.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {/* Code first: it is what someone scans for, and it disambiguates
                the four currencies on this list that all use "$". */}
            {currency.code} — {currency.label}
          </option>
        ))}
      </select>
    </div>
  );
}
