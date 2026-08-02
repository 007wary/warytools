"use client";

import { useState } from "react";
import { colors } from "@/lib/theme";

// <input type="date"> gives "YYYY-MM-DD". new Date(that string) parses it
// as UTC midnight, not local midnight — in timezones behind UTC that rolls
// back to the previous local day. Parse the parts directly instead so the
// date always means what the user picked, regardless of timezone.
function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function calculateAge(birthDate, onDate) {
  let years = onDate.getFullYear() - birthDate.getFullYear();
  let months = onDate.getMonth() - birthDate.getMonth();
  let days = onDate.getDate() - birthDate.getDate();

  if (days < 0) {
    months -= 1;
    // Days in the month before `onDate`.
    const prevMonth = new Date(onDate.getFullYear(), onDate.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.floor((onDate - birthDate) / (1000 * 60 * 60 * 24));

  return { years, months, days, totalDays };
}

export default function AgeCalculatorClient() {
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function handleCalculate() {
    setError("");
    setResult(null);

    if (!birthDate) {
      setError("Please choose a date of birth.");
      return;
    }

    const parsed = parseDateInput(birthDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (parsed > today) {
      setError("Date of birth can't be in the future.");
      return;
    }

    setResult(calculateAge(parsed, today));
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
