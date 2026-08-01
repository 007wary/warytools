"use client";

import { useState } from "react";

const gstSlabs = [5, 12, 18, 28];

export default function GstCalculatorClient() {
  const [mode, setMode] = useState("add"); // "add" | "remove"
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(18);

  const amountNum = Number(amount);
  const canCompute = amount !== "" && !Number.isNaN(amountNum) && amountNum >= 0;

  function getResult() {
    if (!canCompute) return null;

    if (mode === "add") {
      const gstAmount = (amountNum * rate) / 100;
      return {
        base: amountNum,
        gstAmount,
        total: amountNum + gstAmount,
      };
    }

    // Remove GST: amountNum is treated as the GST-inclusive total.
    const base = amountNum / (1 + rate / 100);
    const gstAmount = amountNum - base;
    return { base, gstAmount, total: amountNum };
  }

  const result = getResult();

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <ModeButton active={mode === "add"} onClick={() => setMode("add")}>
          Add GST
        </ModeButton>
        <ModeButton active={mode === "remove"} onClick={() => setMode("remove")}>
          Remove GST
        </ModeButton>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontSize: "14px", color: "#374151", display: "block", marginBottom: "6px" }}>
          {mode === "add" ? "Amount (before GST)" : "Amount (GST-inclusive)"}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={inputStyle}
          placeholder="0"
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ fontSize: "14px", color: "#374151", display: "block", marginBottom: "6px" }}>
          GST rate
        </label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {gstSlabs.map((slab) => (
            <ModeButton key={slab} active={rate === slab} onClick={() => setRate(slab)}>
              {slab}%
            </ModeButton>
          ))}
        </div>
      </div>

      {result && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "20px",
          }}
        >
          <ResultRow label="Base amount" value={result.base} />
          <ResultRow label={`GST (${rate}%)`} value={result.gstAmount} />
          <ResultRow label="Total" value={result.total} bold />
        </div>
      )}
    </div>
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
        color: bold ? "#111827" : "#374151",
      }}
    >
      <span>{label}</span>
      <span>₹{value.toFixed(2)}</span>
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? "#2563eb" : "#e5e7eb"}`,
        backgroundColor: active ? "#eff6ff" : "#fff",
        color: active ? "#2563eb" : "#374151",
        borderRadius: "8px",
        padding: "8px 14px",
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
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  color: "#374151",
  width: "100%",
  maxWidth: "220px",
  boxSizing: "border-box",
};
