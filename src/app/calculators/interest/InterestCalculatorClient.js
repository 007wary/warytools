"use client";

import { simpleInterest, compoundInterest, CalculationError } from "@/lib/calculatorMath";
import { parseFields } from "@/lib/calculatorInput";
import { formatMoney, formatPercent } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useDetectedCurrency } from "@/lib/useDetectedCurrency";
import { getCurrency, CURRENCY_CODES, DEFAULT_CURRENCY } from "@/lib/calculatorCurrency";
import { useTrackedCalculation } from "@/lib/analytics";
import ModeToggle from "@/components/calculator/ModeToggle";
import NumberField from "@/components/calculator/NumberField";
import CurrencySelect from "@/components/calculator/CurrencySelect";
import ResultPanel from "@/components/calculator/ResultPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { colors } from "@/lib/theme";

const modes = [
  { id: "simple", label: "Simple Interest" },
  { id: "compound", label: "Compound Interest" },
];

const compoundFrequencies = [
  { id: "1", label: "Annually" },
  { id: "2", label: "Semi-annually" },
  { id: "4", label: "Quarterly" },
  { id: "12", label: "Monthly" },
];

const defaults = {
  mode: "simple",
  principal: "",
  rate: "",
  years: "",
  frequency: "1",
  currency: DEFAULT_CURRENCY,
};
const schema = {
  mode: ["simple", "compound"],
  principal: "number",
  rate: "number",
  years: "number",
  frequency: compoundFrequencies.map((f) => f.id),
  // Constrained to the known codes: this value reaches Intl.NumberFormat, which
  // throws on an unrecognised currency, and the URL is untrusted input.
  currency: CURRENCY_CODES,
};

export default function InterestCalculatorClient() {
  const { state, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { mode, principal, rate, years, frequency, currency: currencyCode } = state;

  useDetectedCurrency((next) => setField("currency", next));
  const currency = getCurrency(currencyCode);
  const money = (value) => formatMoney(value, currency);

  const parsed = parseFields({
    principal: [principal, { label: "Principal", allowNegative: false }],
    rate: [rate, { label: "Rate", allowNegative: false, max: 1000 }],
    // 100 years covers every realistic deposit; beyond that compounding
    // overflows and the answer stops meaning anything.
    years: [years, { label: "Time", allowNegative: false, max: 100 }],
  });

  let result = null;
  let calcError = "";

  if (parsed.ok) {
    const { principal: p, rate: r, years: t } = parsed.values;
    try {
      result =
        mode === "simple"
          ? simpleInterest(p, r, t)
          : compoundInterest(p, r, t, Number(frequency));
    } catch (err) {
      calcError = err instanceof CalculationError ? err.message : "Couldn't calculate that.";
    }
  }

  // Effective annual yield is the number that actually lets someone compare
  // two offers with different compounding frequencies.
  //
  // A zero principal is a valid input (the field only forbids negatives) and
  // makes total/principal 0/0 = NaN, which reached the panel as a bare "—"
  // next to perfectly good figures. There is no meaningful yield on nothing,
  // so the row is dropped instead. `Number.isFinite` is the guard rather than
  // a `> 0` check on the inputs alone, matching the rule in calculatorInput.js.
  const rawEffectiveRate =
    result && parsed.ok && parsed.values.years > 0 && parsed.values.principal > 0
      ? (Math.pow(result.total / parsed.values.principal, 1 / parsed.values.years) - 1) * 100
      : null;
  const effectiveRate = Number.isFinite(rawEffectiveRate) ? rawEffectiveRate : null;

  // Only the mode and (for compound) the frequency are sent — never the
  // principal, which is a financial figure and none of analytics' business.
  useTrackedCalculation({
    active: Boolean(result),
    params: { mode, ...(mode === "compound" ? { frequency: Number(frequency) } : {}) },
    deps: [Boolean(result), mode, frequency, principal, rate, years],
  });

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <ModeToggle
          label="Interest type"
          options={modes}
          value={mode}
          onChange={(next) => setField("mode", next)}
        />
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <NumberField
          label="Principal"
          value={principal}
          onChange={(next) => setField("principal", next)}
          prefix={currency.symbol}
          maxWidth="180px"
        />
        <NumberField
          label="Rate (per year)"
          value={rate}
          onChange={(next) => setField("rate", next)}
          suffix="%"
          maxWidth="150px"
        />
        <NumberField
          label="Time (years)"
          value={years}
          onChange={(next) => setField("years", next)}
          maxWidth="150px"
        />
        <CurrencySelect
          value={currencyCode}
          onChange={(next) => setField("currency", next)}
        />
      </div>

      {mode === "compound" && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "14px", color: colors.textSecondary, marginBottom: "8px" }}>
            Compounding frequency
          </p>
          <ModeToggle
            label="Compounding frequency"
            size="sm"
            options={compoundFrequencies}
            value={frequency}
            onChange={(next) => setField("frequency", next)}
          />
        </div>
      )}

      <ErrorBanner>{parsed.ok ? calcError : parsed.error}</ErrorBanner>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel
            headline={{ label: "Maturity amount", value: money(result.total) }}
            rows={[
              { label: "Principal", value: money(parsed.values.principal) },
              { label: "Interest earned", value: money(result.interest) },
              { label: "Total amount", value: money(result.total), emphasis: true },
              ...(mode === "compound" && effectiveRate !== null
                ? [{ label: "Effective annual rate", value: formatPercent(effectiveRate) }]
                : []),
            ]}
            footnote={
              mode === "compound"
                ? "Compounded " +
                  compoundFrequencies
                    .find((f) => f.id === frequency)
                    .label.toLowerCase() +
                  ". The effective annual rate is what this works out to once compounding is included."
                : "Simple interest is charged on the original principal only — it doesn't compound."
            }
            shareUrl={shareUrl}
          />
        </div>
      )}
    </div>
  );
}
