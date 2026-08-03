"use client";

import { useState } from "react";
import { unitCategories, convertLinear, convertTemperature } from "@/lib/unitConversions";
import { colors } from "@/lib/theme";
import { useTrackedCalculation } from "@/lib/analytics";

export default function UnitConverterClient() {
  const [category, setCategory] = useState("length");
  const unitIds = Object.keys(unitCategories[category].units);
  const [fromUnit, setFromUnit] = useState(unitIds[0]);
  const [toUnit, setToUnit] = useState(unitIds[1]);
  const [value, setValue] = useState("1");

  function handleCategoryChange(newCategory) {
    const newUnitIds = Object.keys(unitCategories[newCategory].units);
    setCategory(newCategory);
    setFromUnit(newUnitIds[0]);
    setToUnit(newUnitIds[1]);
  }

  const numValue = Number(value);
  const canCompute = value !== "" && !Number.isNaN(numValue);

  let result = null;
  if (canCompute) {
    result =
      category === "temperature"
        ? convertTemperature(numValue, fromUnit, toUnit)
        : convertLinear(numValue, category, fromUnit, toUnit);
  }

  const units = unitCategories[category].units;

  // The from->to pair is the useful signal here: it shows which conversions
  // are worth featuring (and which deserve their own landing page for SEO).
  useTrackedCalculation({
    active: canCompute,
    params: { category, from_unit: fromUnit, to_unit: toUnit },
    deps: [canCompute, category, fromUnit, toUnit, value],
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {Object.entries(unitCategories).map(([id, cat]) => (
          <button
            key={id}
            onClick={() => handleCategoryChange(id)}
            style={{
              border: `1px solid ${category === id ? colors.primary : colors.border}`,
              backgroundColor: category === id ? colors.primarySoft : colors.surface,
              color: category === id ? colors.primary : colors.textSecondary,
              borderRadius: "8px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "stretch", flexWrap: "wrap", marginBottom: "20px" }}>
        <label style={{ fontSize: "14px", color: colors.textSecondary, flex: "1 1 140px" }}>
          <span style={{ display: "block", marginBottom: "6px" }}>Value</span>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ fontSize: "14px", color: colors.textSecondary, flex: "1 1 140px" }}>
          <span style={{ display: "block", marginBottom: "6px" }}>From</span>
          <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} style={selectStyle}>
            {Object.entries(units).map(([id, unit]) => (
              <option key={id} value={id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: "14px", color: colors.textSecondary, flex: "1 1 140px" }}>
          <span style={{ display: "block", marginBottom: "6px" }}>To</span>
          <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} style={selectStyle}>
            {Object.entries(units).map(([id, unit]) => (
              <option key={id} value={id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {result !== null && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "20px" }}>
          <p style={{ fontSize: "18px", fontWeight: 600, color: colors.text, wordBreak: "break-word" }}>
            {numValue} {units[fromUnit].label} = {result.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
            {units[toUnit].label}
          </p>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "8px",
  color: colors.textSecondary,
};

const selectStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: "16px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "8px",
  color: colors.textSecondary,
  backgroundColor: colors.surface,
};
