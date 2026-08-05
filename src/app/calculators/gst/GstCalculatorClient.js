"use client";

import { addGst, removeGst, CalculationError } from "@/lib/calculatorMath";
import { parseNumber, okValue } from "@/lib/calculatorInput";
import { formatCurrency } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useTrackedCalculation } from "@/lib/analytics";
import ModeToggle from "@/components/calculator/ModeToggle";
import NumberField from "@/components/calculator/NumberField";
import ResultPanel from "@/components/calculator/ResultPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { colors } from "@/lib/theme";

const gstSlabs = [5, 12, 18, 28];

const modes = [
  { id: "add", label: "Add GST" },
  { id: "remove", label: "Remove GST" },
];

// Custom rates matter: 0.25% and 3% apply to gems and gold, and plenty of
// invoices use a rate outside the four headline slabs.
const rateOptions = [
  ...gstSlabs.map((slab) => ({ id: String(slab), label: `${slab}%` })),
  { id: "custom", label: "Custom" },
];

const defaults = { mode: "add", amount: "", rate: "18", customRate: "" };
const schema = {
  mode: ["add", "remove"],
  amount: "number",
  rate: [...gstSlabs.map(String), "custom"],
  customRate: "number",
};

export default function GstCalculatorClient() {
  const { state, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { mode, amount, rate, customRate } = state;

  const isCustom = rate === "custom";
  const parsedAmount = parseNumber(amount, { label: "Amount", allowNegative: false });
  const parsedRate = isCustom
    ? parseNumber(customRate, { label: "GST rate", allowNegative: false, max: 100 })
    : okValue(Number(rate));

  const inputError = !parsedAmount.ok && !parsedAmount.empty
    ? parsedAmount.error
    : !parsedRate.ok && !parsedRate.empty
      ? parsedRate.error
      : "";

  const canCompute = parsedAmount.ok && parsedRate.ok;

  let result = null;
  let calcError = "";
  if (canCompute) {
    try {
      result =
        mode === "add"
          ? addGst(parsedAmount.value, parsedRate.value)
          : removeGst(parsedAmount.value, parsedRate.value);
    } catch (err) {
      calcError = err instanceof CalculationError ? err.message : "Couldn't calculate that.";
    }
  }

  const effectiveRate = parsedRate.ok ? parsedRate.value : null;

  // Debounced so typing an amount sends one event, not one per keystroke.
  // The amount itself is never sent — only which mode and rate were used.
  useTrackedCalculation({
    active: Boolean(result),
    params: { mode, rate: effectiveRate },
    deps: [Boolean(result), mode, effectiveRate, amount],
  });

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <ModeToggle
          label="Calculation mode"
          options={modes}
          value={mode}
          onChange={(next) => setField("mode", next)}
        />
      </div>

      <div style={{ marginBottom: "20px", maxWidth: "260px" }}>
        <NumberField
          label={mode === "add" ? "Amount (before GST)" : "Amount (GST-inclusive)"}
          value={amount}
          onChange={(next) => setField("amount", next)}
          prefix="₹"
          invalid={!parsedAmount.ok && !parsedAmount.empty}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <p
          style={{
            fontSize: "14px",
            color: colors.textSecondary,
            marginBottom: "8px",
          }}
        >
          GST rate
        </p>
        <ModeToggle
          label="GST rate"
          size="sm"
          options={rateOptions}
          value={rate}
          onChange={(next) => setField("rate", next)}
        />
        {isCustom && (
          <div style={{ marginTop: "12px", maxWidth: "180px" }}>
            <NumberField
              label="Custom rate"
              value={customRate}
              onChange={(next) => setField("customRate", next)}
              suffix="%"
              placeholder="e.g. 3"
              invalid={!parsedRate.ok && !parsedRate.empty}
            />
          </div>
        )}
      </div>

      <ErrorBanner>{inputError || calcError}</ErrorBanner>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel
            headline={{
              label: mode === "add" ? "Total (with GST)" : "Base amount (before GST)",
              value: formatCurrency(mode === "add" ? result.total : result.base),
            }}
            rows={[
              { label: "Base amount", value: formatCurrency(result.base) },
              { label: `GST (${effectiveRate}%)`, value: formatCurrency(result.gstAmount) },
              { label: "Total", value: formatCurrency(result.total), emphasis: true },
            ]}
            footnote={
              // CGST/SGST is the split that actually appears on an intra-state
              // invoice, and working it out by hand is the most common thing
              // people do straight after using a GST calculator.
              `On an intra-state invoice this splits as CGST ${formatCurrency(
                result.gstAmount / 2
              )} + SGST ${formatCurrency(result.gstAmount / 2)}.`
            }
            shareUrl={shareUrl}
          />
        </div>
      )}
    </div>
  );
}
