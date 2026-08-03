"use client";

import { useState } from "react";
import { parseDateInput, diffBetween } from "@/lib/dateMath";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

export default function DateDifferenceClient() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function handleCalculate() {
    setError("");
    setResult(null);

    if (!startDate || !endDate) {
      setError("Please choose both dates.");
      trackEvent(events.TOOL_ERROR, { reason: "missing_dates" });
      return;
    }

    const start = parseDateInput(startDate);
    const end = parseDateInput(endDate);
    setResult(diffBetween(start, end));
    trackEvent(events.TOOL_RUN);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
        <label style={{ fontSize: "14px", color: colors.textSecondary }}>
          <span style={{ display: "block", marginBottom: "6px" }}>Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: "14px", color: colors.textSecondary }}>
          <span style={{ display: "block", marginBottom: "6px" }}>End date</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </label>
      </div>

      {error && <p style={{ color: colors.danger, fontSize: "14px", marginBottom: "16px" }}>{error}</p>}

      <button onClick={handleCalculate} style={buttonStyle}>
        Calculate Difference
      </button>

      {result && (
        <div style={{ marginTop: "24px", border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "20px" }}>
          <p style={{ fontSize: "20px", fontWeight: 600, color: colors.text, marginBottom: "8px" }}>
            {result.years} years, {result.months} months, {result.days} days
          </p>
          <p style={{ fontSize: "14px", color: colors.textMuted }}>
            That&apos;s {result.totalDays.toLocaleString()} days total.
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
  maxWidth: "180px",
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
