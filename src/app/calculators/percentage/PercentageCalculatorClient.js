"use client";

import { useState } from "react";

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
      return `${xNum}% of ${yNum} is ${((xNum / 100) * yNum).toLocaleString()}`;
    }
    if (mode === "isWhatPercent") {
      if (yNum === 0) return "Y can't be zero.";
      return `${xNum} is ${((xNum / yNum) * 100).toFixed(2)}% of ${yNum}`;
    }
    // change
    if (xNum === 0) return "X can't be zero.";
    const change = ((yNum - xNum) / xNum) * 100;
    const direction = change >= 0 ? "increase" : "decrease";
    return `${Math.abs(change).toFixed(2)}% ${direction} from ${xNum} to ${yNum}`;
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
              border: `1px solid ${mode === m.id ? "#2563eb" : "#e5e7eb"}`,
              backgroundColor: mode === m.id ? "#eff6ff" : "#fff",
              color: mode === m.id ? "#2563eb" : "#374151",
              borderRadius: "8px",
              padding: "8px 14px",
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
        <label style={{ fontSize: "14px", color: "#374151" }}>
          X{" "}
          <input
            type="number"
            value={x}
            onChange={(e) => setX(e.target.value)}
            style={inputStyle}
            placeholder="0"
          />
        </label>
        <label style={{ fontSize: "14px", color: "#374151" }}>
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
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "16px 20px",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#111827" }}>{result}</p>
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
  fontSize: "14px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  marginLeft: "4px",
};
