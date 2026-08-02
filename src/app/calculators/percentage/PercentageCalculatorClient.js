"use client";

import { useState } from "react";
import { percentageOf, whatPercent, percentChange } from "@/lib/calculatorMath";
import { colors } from "@/lib/theme";

const modes = [
  { id: "of", label: "X% of Y" },
  { id: "isWhatPercent", label: "X is what % of Y" },
  { id: "change", label: "% change from X to Y" },
];

export default function PercentageCalculatorClient() {
  const [mode, setMode] = useState("of");
  const [x, setX] = useState("");
  const [y, setY] = useState("");

  const xNum = Number(x);
  const yNum = Number(y);
  const canCompute = x !== "" && y !== "" && !Number.isNaN(xNum) && !Number.isNaN(yNum);

  function getResult() {
    if (!canCompute) return null;

    if (mode === "of") {
      const value = percentageOf(xNum, yNum);
      return `${xNum}% of ${yNum} is ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    if (mode === "isWhatPercent") {
      try {
        return `${xNum} is ${whatPercent(xNum, yNum).toFixed(2)}% of ${yNum}`;
      } catch {
        return "Y can't be zero.";
      }
    }
    // change
    try {
      const change = percentChange(xNum, yNum);
      const direction = change >= 0 ? "increase" : "decrease";
      return `${Math.abs(change).toFixed(2)}% ${direction} from ${xNum} to ${yNum}`;
    } catch {
      return "X can't be zero.";
    }
  }

  const result = getResult();

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              border: `1px solid ${mode === m.id ? colors.primary : colors.border}`,
              backgroundColor: mode === m.id ? colors.primarySoft : colors.surface,
              color: mode === m.id ? colors.primary : colors.textSecondary,
              borderRadius: "8px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "14px", color: colors.textSecondary }}>
          X{" "}
          <input
            type="number"
            value={x}
            onChange={(e) => setX(e.target.value)}
            style={inputStyle}
            placeholder="0"
          />
        </label>
        <label style={{ fontSize: "14px", color: colors.textSecondary }}>
          Y{" "}
          <input
            type="number"
            value={y}
            onChange={(e) => setY(e.target.value)}
            style={inputStyle}
            placeholder="0"
          />
        </label>
      </div>

      {result && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "16px 20px",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: colors.text }}>{result}</p>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  maxWidth: "120px",
  boxSizing: "border-box",
  padding: "8px 10px",
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "6px",
  marginLeft: "4px",
};
