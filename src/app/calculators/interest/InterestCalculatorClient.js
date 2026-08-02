"use client";

import { useState } from "react";
import { colors } from "@/lib/theme";

const compoundFrequencies = [
  { id: 1, label: "Annually" },
  { id: 2, label: "Semi-annually" },
  { id: 4, label: "Quarterly" },
  { id: 12, label: "Monthly" },
];

export default function InterestCalculatorClient() {
  const [mode, setMode] = useState("simple"); // "simple" | "compound"
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [years, setYears] = useState("");
  const [frequency, setFrequency] = useState(1);

  const p = Number(principal);
  const r = Number(rate);
  const t = Number(years);
  const canCompute =
    principal !== "" && rate !== "" && years !== "" && !Number.isNaN(p) && !Number.isNaN(r) && !Number.isNaN(t) && p >= 0 && r >= 0 && t >= 0;

  function getResult() {
    if (!canCompute) return null;

    if (mode === "simple") {
      const interest = (p * r * t) / 100;
      return { interest, total: p + interest };
    }

    const total = p * Math.pow(1 + r / 100 / frequency, frequency * t);
    return { interest: total - p, total };
  }

  const result = getResult();

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <ModeButton active={mode === "simple"} onClick={() => setMode("simple")}>
          Simple Interest
        </ModeButton>
        <ModeButton active={mode === "compound"} onClick={() => setMode("compound")}>
          Compound Interest
        </ModeButton>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <Field label="Principal">
          <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
        <Field label="Rate (% per year)">
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
        <Field label="Time (years)">
          <input type="number" value={years} onChange={(e) => setYears(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
      </div>

      {mode === "compound" && (
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "14px", color: colors.textSecondary, display: "block", marginBottom: "6px" }}>
            Compounding frequency
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {compoundFrequencies.map((f) => (
              <ModeButton key={f.id} active={frequency === f.id} onClick={() => setFrequency(f.id)}>
                {f.label}
              </ModeButton>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "20px", marginTop: "4px" }}>
          <ResultRow label="Interest earned" value={result.interest} />
          <ResultRow label="Total amount" value={result.total} bold />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ fontSize: "14px", color: colors.textSecondary }}>
      <span style={{ display: "block", marginBottom: "6px" }}>{label}</span>
      {children}
    </label>
  );
}

function ResultRow({ label, value, bold }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        fontSize: bold ? "18px" : "14px",
        fontWeight: bold ? 700 : 400,
        color: bold ? colors.text : colors.textSecondary,
      }}
    >
      <span>{label}</span>
      <span style={{ wordBreak: "break-word" }}>{value.toFixed(2)}</span>
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "8px",
        padding: "10px 16px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  width: "100%",
  maxWidth: "140px",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "8px",
  color: colors.textSecondary,
};
