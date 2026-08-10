"use client";

import { useEffect } from "react";
import { ArrowLeftRight } from "lucide-react";
import { unitCategories, convertLinear, convertTemperature } from "@/lib/unitConversions";
import { parseNumber } from "@/lib/calculatorInput";
import { formatNumber } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useTrackedCalculation } from "@/lib/analytics";
import ModeToggle from "@/components/calculator/ModeToggle";
import NumberField from "@/components/calculator/NumberField";
import ResultPanel from "@/components/calculator/ResultPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { colors } from "@/lib/theme";

const categoryIds = Object.keys(unitCategories);
const categoryOptions = categoryIds.map((id) => ({ id, label: unitCategories[id].label }));
const allUnitIds = categoryIds.flatMap((id) => Object.keys(unitCategories[id].units));

const defaults = { category: "length", from: "meter", to: "foot", value: "1" };
const schema = {
  category: categoryIds,
  from: allUnitIds,
  to: allUnitIds,
  value: "number",
};

function convert(value, category, from, to) {
  return category === "temperature"
    ? convertTemperature(value, from, to)
    : convertLinear(value, category, from, to);
}

export default function UnitConverterClient() {
  const { state, setState, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { category, value } = state;

  const units = unitCategories[category].units;
  const unitIds = Object.keys(units);

  // A shared link could name a unit that belongs to a different category
  // (?category=weight&from=meter). Falling back keeps such a URL usable
  // instead of crashing on `units[from].label`.
  const from = unitIds.includes(state.from) ? state.from : unitIds[0];
  const to = unitIds.includes(state.to) ? state.to : unitIds[1] ?? unitIds[0];

  // The fallback above only fixes what is *rendered*; state still holds the
  // mismatched unit. That leaks in two ways — the copy-link button hands out
  // the same broken URL the visitor arrived on, and a swap writes the stale
  // id back into the new category — so reconcile state to what is on screen.
  // Guarded by the inequality, so this is a no-op on every normal render
  // rather than a render loop.
  useEffect(() => {
    if (from !== state.from || to !== state.to) {
      setState((previous) => ({ ...previous, from, to }));
    }
  }, [from, to, state.from, state.to, setState]);

  // Temperature is the one category where negatives are meaningful; a negative
  // length or weight is a typo.
  const parsed = parseNumber(value, {
    label: "Value",
    allowNegative: category === "temperature",
  });

  const result = parsed.ok ? convert(parsed.value, category, from, to) : null;

  function handleCategoryChange(next) {
    const nextUnitIds = Object.keys(unitCategories[next].units);
    setState((previous) => ({
      ...previous,
      category: next,
      from: nextUnitIds[0],
      to: nextUnitIds[1] ?? nextUnitIds[0],
    }));
  }

  function handleSwap() {
    setState((previous) => ({ ...previous, from: to, to: from }));
  }

  // The from->to pair is the useful signal here: it shows which conversions
  // are worth featuring (and which deserve their own landing page for SEO).
  useTrackedCalculation({
    active: result !== null,
    params: { category, from_unit: from, to_unit: to },
    deps: [result !== null, category, from, to, value],
  });

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <ModeToggle
          label="Unit category"
          options={categoryOptions}
          value={category}
          onChange={handleCategoryChange}
        />
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "4px" }}>
        <NumberField
          label="Value"
          value={value}
          onChange={(next) => setField("value", next)}
          maxWidth="150px"
          invalid={!parsed.ok && !parsed.empty}
        />

        <UnitSelect
          label="From"
          value={from}
          units={units}
          onChange={(next) => setField("from", next)}
        />

        <button
          type="button"
          onClick={handleSwap}
          aria-label={`Swap units — convert ${units[to].label} to ${units[from].label} instead`}
          title="Swap units"
          style={{
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            color: colors.textSecondary,
            borderRadius: "8px",
            width: "42px",
            height: "42px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ArrowLeftRight size={17} />
        </button>

        <UnitSelect
          label="To"
          value={to}
          units={units}
          onChange={(next) => setField("to", next)}
        />
      </div>

      <ErrorBanner>{!parsed.ok && !parsed.empty ? parsed.error : ""}</ErrorBanner>

      {result !== null && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel
            headline={{
              label: `${formatNumber(parsed.value)} ${units[from].label}`,
              value: `${formatNumber(result)} ${units[to].label}`,
            }}
            rows={[
              {
                label: "Conversion rate",
                value: `1 ${units[from].label} = ${formatNumber(
                  convert(1, category, from, to)
                )} ${units[to].label}`,
              },
              {
                label: "Reverse",
                value: `1 ${units[to].label} = ${formatNumber(
                  convert(1, category, to, from)
                )} ${units[from].label}`,
              },
            ]}
            shareUrl={shareUrl}
          />
        </div>
      )}
    </div>
  );
}

function UnitSelect({ label, value, units, onChange }) {
  return (
    <label style={{ fontSize: "14px", color: colors.textSecondary, flex: "1 1 150px", minWidth: 0 }}>
      <span style={{ display: "block", marginBottom: "6px" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "11px 12px",
          fontSize: "16px",
          border: `1px solid ${colors.borderInput}`,
          borderRadius: "8px",
          color: colors.text,
          backgroundColor: colors.surface,
        }}
      >
        {Object.entries(units).map(([id, unit]) => (
          <option key={id} value={id}>
            {unit.label}
          </option>
        ))}
      </select>
    </label>
  );
}
