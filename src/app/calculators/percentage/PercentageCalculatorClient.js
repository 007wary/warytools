"use client";

import { percentageOf, whatPercent, percentChange, CalculationError } from "@/lib/calculatorMath";
import { parseNumber } from "@/lib/calculatorInput";
import { formatNumber, formatPercent } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useTrackedCalculation } from "@/lib/analytics";
import ModeToggle from "@/components/calculator/ModeToggle";
import NumberField from "@/components/calculator/NumberField";
import ResultPanel from "@/components/calculator/ResultPanel";
import ErrorBanner from "@/components/ErrorBanner";

const modes = [
  { id: "of", label: "X% of Y" },
  { id: "isWhatPercent", label: "X is what % of Y" },
  { id: "change", label: "% change from X to Y" },
];

// Field labels change meaning per mode. Spelling them out beats a bare "X"/"Y",
// which forces the user to re-read the mode button to know what to type where.
const fieldLabels = {
  of: { x: "Percentage (X)", y: "Of value (Y)", xSuffix: "%", ySuffix: null },
  isWhatPercent: { x: "Value (X)", y: "Of total (Y)", xSuffix: null, ySuffix: null },
  change: { x: "From (X)", y: "To (Y)", xSuffix: null, ySuffix: null },
};

const defaults = { mode: "of", x: "", y: "" };
const schema = { mode: modes.map((m) => m.id), x: "number", y: "number" };

export default function PercentageCalculatorClient() {
  const { state, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { mode, x, y } = state;

  const labels = fieldLabels[mode];
  const parsedX = parseNumber(x, { label: labels.x });
  const parsedY = parseNumber(y, { label: labels.y });

  const inputError = !parsedX.ok && !parsedX.empty
    ? parsedX.error
    : !parsedY.ok && !parsedY.empty
      ? parsedY.error
      : "";

  const canCompute = parsedX.ok && parsedY.ok;

  let result = null;
  let calcError = "";

  if (canCompute) {
    const xNum = parsedX.value;
    const yNum = parsedY.value;
    try {
      if (mode === "of") {
        const value = percentageOf(xNum, yNum);
        result = {
          headline: { label: `${formatNumber(xNum)}% of ${formatNumber(yNum)}`, value: formatNumber(value) },
          rows: [
            { label: "Result", value: formatNumber(value), emphasis: true },
            { label: "Remaining", value: formatNumber(yNum - value) },
          ],
        };
      } else if (mode === "isWhatPercent") {
        const percent = whatPercent(xNum, yNum);
        result = {
          headline: {
            label: `${formatNumber(xNum)} out of ${formatNumber(yNum)}`,
            value: formatPercent(percent),
          },
          rows: [
            { label: "Percentage", value: formatPercent(percent), emphasis: true },
            { label: "Difference", value: formatNumber(yNum - xNum) },
          ],
        };
      } else {
        const change = percentChange(xNum, yNum);
        const direction = change > 0 ? "increase" : change < 0 ? "decrease" : "no change";
        result = {
          headline: {
            label: `Change from ${formatNumber(xNum)} to ${formatNumber(yNum)}`,
            value: change === 0 ? "No change" : `${formatPercent(Math.abs(change))} ${direction}`,
          },
          rows: [
            { label: "Percentage change", value: formatPercent(change), emphasis: true },
            { label: "Absolute change", value: formatNumber(yNum - xNum) },
          ],
        };
      }
    } catch (err) {
      calcError = err instanceof CalculationError ? err.message : "Couldn't calculate that.";
    }
  }

  // Which of the three variants people actually use — useful for deciding
  // which one should be the default.
  useTrackedCalculation({
    active: Boolean(result),
    params: { mode },
    deps: [Boolean(result), mode, x, y],
  });

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <ModeToggle
          label="Calculation type"
          options={modes}
          value={mode}
          onChange={(next) => setField("mode", next)}
        />
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
        <NumberField
          label={labels.x}
          value={x}
          onChange={(next) => setField("x", next)}
          suffix={labels.xSuffix}
          maxWidth="180px"
          invalid={!parsedX.ok && !parsedX.empty}
        />
        <NumberField
          label={labels.y}
          value={y}
          onChange={(next) => setField("y", next)}
          suffix={labels.ySuffix}
          maxWidth="180px"
          invalid={!parsedY.ok && !parsedY.empty}
        />
      </div>

      <ErrorBanner>{inputError || calcError}</ErrorBanner>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel headline={result.headline} rows={result.rows} shareUrl={shareUrl} />
        </div>
      )}
    </div>
  );
}
