"use client";

import { useState } from "react";
import { parseDateInput, diffBetween } from "@/lib/dateMath";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

export default function AgeCalculatorClient() {
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function handleCalculate() {
    setError("");
    setResult(null);

    if (!birthDate) {
      setError("Please choose a date of birth.");
      trackEvent(events.TOOL_ERROR, { reason: "missing_date" });
      return;
    }

    const parsed = parseDateInput(birthDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (parsed > today) {
      setError("Date of birth can't be in the future.");
      trackEvent(events.TOOL_ERROR, { reason: "future_date" });
      return;
    }

    setResult(diffBetween(parsed, today));
    trackEvent(events.TOOL_RUN);
  }

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontSize: "14px", color: colors.textSecondary, display: "block", marginBottom: "6px" }}>
          Date of birth
        </label>
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          style={inputStyle}
        />
      </div>

      {error && <p style={{ color: colors.danger, fontSize: "14px", marginBottom: "16px" }}>{error}</p>}

      <button onClick={handleCalculate} style={buttonStyle}>
        Calculate Age
      </button>

      {result && (
        <div
          style={{
            marginTop: "24px",
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "20px",
          }}
        >
          <p style={{ fontSize: "20px", fontWeight: 600, color: colors.text, marginBottom: "8px" }}>
            {result.years} years, {result.months} months, {result.days} days
          </p>
          <p style={{ fontSize: "14px", color: colors.textMuted }}>
            That&apos;s {result.totalDays.toLocaleString()} days old.
          </p>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "8px",
  color: colors.textSecondary,
  width: "100%",
  maxWidth: "220px",
  boxSizing: "border-box",
};

const buttonStyle = {
  backgroundColor: colors.primary,
  color: colors.primaryContrast,
  border: "none",
  borderRadius: "8px",
  padding: "12px 20px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
