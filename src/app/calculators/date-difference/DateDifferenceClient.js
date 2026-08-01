"use client";

import { useState } from "react";

// <input type="date"> gives "YYYY-MM-DD". new Date(that string) parses it
// as UTC midnight, not local midnight — in timezones behind UTC that rolls
// back to the previous local day. Parse the parts directly instead so the
// date always means what the user picked, regardless of timezone.
function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function diffBetween(start, end) {
  const [earlier, later] = start <= end ? [start, end] : [end, start];

  let years = later.getFullYear() - earlier.getFullYear();
  let months = later.getMonth() - earlier.getMonth();
  let days = later.getDate() - earlier.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(later.getFullYear(), later.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.floor((later - earlier) / (1000 * 60 * 60 * 24));

  return { years, months, days, totalDays };
}

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
      return;
    }

    const start = parseDateInput(startDate);
    const end = parseDateInput(endDate);
    setResult(diffBetween(start, end));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
        <label style={{ fontSize: "14px", color: "#374151" }}>
          <span style={{ display: "block", marginBottom: "6px" }}>Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: "14px", color: "#374151" }}>
          <span style={{ display: "block", marginBottom: "6px" }}>End date</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </label>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: "14px", marginBottom: "16px" }}>{error}</p>}

      <button onClick={handleCalculate} style={buttonStyle}>
        Calculate Difference
      </button>

      {result && (
        <div style={{ marginTop: "24px", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "20px" }}>
          <p style={{ fontSize: "20px", fontWeight: 600, color: "#111827", marginBottom: "8px" }}>
            {result.years} years, {result.months} months, {result.days} days
          </p>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            That&apos;s {result.totalDays.toLocaleString()} days total.
          </p>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  color: "#374151",
  width: "100%",
  maxWidth: "180px",
  boxSizing: "border-box",
};

const buttonStyle = {
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
