"use client";

import { loanEmi, CalculationError } from "@/lib/calculatorMath";
import { parseFields } from "@/lib/calculatorInput";
import { formatMoney, formatPercent } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useDetectedCurrency } from "@/lib/useDetectedCurrency";
import { getCurrency, CURRENCY_CODES, DEFAULT_CURRENCY } from "@/lib/calculatorCurrency";
import { useTrackedCalculation } from "@/lib/analytics";
import NumberField from "@/components/calculator/NumberField";
import CurrencySelect from "@/components/calculator/CurrencySelect";
import ResultPanel from "@/components/calculator/ResultPanel";
import ErrorBanner from "@/components/ErrorBanner";
import { colors } from "@/lib/theme";

const defaults = { amount: "", rate: "", years: "", currency: DEFAULT_CURRENCY };
const schema = {
  amount: "number",
  rate: "number",
  years: "number",
  // Constrained to the known codes: this value reaches Intl.NumberFormat, which
  // throws on an unrecognised currency, and the URL is untrusted input.
  currency: CURRENCY_CODES,
};

export default function EmiCalculatorClient() {
  const { state, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { amount, rate, years, currency: currencyCode } = state;

  useDetectedCurrency((next) => setField("currency", next));
  const currency = getCurrency(currencyCode);
  const money = (value) => formatMoney(value, currency);

  const parsed = parseFields({
    amount: [amount, { label: "Loan amount", allowNegative: false }],
    rate: [rate, { label: "Interest rate", allowNegative: false, max: 100 }],
    // 40 years covers the longest home loans on offer.
    years: [years, { label: "Tenure", allowNegative: false, max: 40 }],
  });

  let result = null;
  let calcError = "";

  if (parsed.ok) {
    try {
      result = loanEmi(parsed.values.amount, parsed.values.rate, parsed.values.years);
    } catch (err) {
      calcError = err instanceof CalculationError ? err.message : "Couldn't calculate that.";
    }
  }

  // Share of every unit repaid that is interest rather than principal — the
  // number that actually tells someone whether a loan is expensive.
  const interestShare = result ? (result.totalInterest / result.totalPayable) * 100 : null;

  // Never the loan amount — a financial figure, and none of analytics'
  // business. Only that an EMI was computed.
  useTrackedCalculation({
    active: Boolean(result),
    params: {},
    deps: [Boolean(result), amount, rate, years],
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
        <NumberField
          label="Loan amount"
          value={amount}
          onChange={(next) => setField("amount", next)}
          prefix={currency.symbol}
          maxWidth="190px"
        />
        <NumberField
          label="Interest rate (per year)"
          value={rate}
          onChange={(next) => setField("rate", next)}
          suffix="%"
          maxWidth="170px"
        />
        <NumberField
          label="Tenure (years)"
          value={years}
          onChange={(next) => setField("years", next)}
          maxWidth="150px"
        />
        <CurrencySelect
          value={currencyCode}
          onChange={(next) => setField("currency", next)}
        />
      </div>

      <ErrorBanner>{parsed.ok ? calcError : parsed.error}</ErrorBanner>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel
            headline={{ label: "Monthly EMI", value: money(result.emi) }}
            rows={[
              { label: "Principal", value: money(result.principal) },
              { label: "Total interest", value: money(result.totalInterest) },
              { label: "Total payable", value: money(result.totalPayable), emphasis: true },
              { label: "Number of instalments", value: `${result.months} months` },
              ...(interestShare !== null
                ? [{ label: "Interest share of repayment", value: formatPercent(interestShare) }]
                : []),
            ]}
            shareUrl={shareUrl}
          />

          <AmortisationTable schedule={result.schedule} money={money} />
        </div>
      )}
    </div>
  );
}

// The year-by-year breakdown is what turns an EMI figure into something
// useful: it shows how little of an early instalment goes to principal, which
// is the thing most borrowers are surprised by.
function AmortisationTable({ schedule, money }) {
  return (
    <div style={{ marginTop: "24px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: colors.text, marginBottom: "10px" }}>
        Year-by-year breakdown
      </h2>
      {/* Wide content scrolls inside its own container so the page body never
          scrolls horizontally on a phone. */}
      <div style={{ overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: "10px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "440px" }}>
          <thead>
            <tr>
              {["Year", "Principal paid", "Interest paid", "Balance"].map((heading, index) => (
                <th
                  key={heading}
                  scope="col"
                  style={{
                    textAlign: index === 0 ? "left" : "right",
                    padding: "10px 14px",
                    color: colors.textMuted,
                    fontWeight: 600,
                    borderBottom: `1px solid ${colors.border}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.year}>
                <th
                  scope="row"
                  style={{
                    textAlign: "left",
                    padding: "9px 14px",
                    color: colors.textSecondary,
                    fontWeight: 500,
                    borderTop: `1px solid ${colors.borderMuted}`,
                  }}
                >
                  {row.year}
                </th>
                <Cell>{money(row.principalPaid)}</Cell>
                <Cell>{money(row.interestPaid)}</Cell>
                <Cell>{money(row.balance)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ children }) {
  return (
    <td
      style={{
        textAlign: "right",
        padding: "9px 14px",
        color: colors.textSecondary,
        borderTop: `1px solid ${colors.borderMuted}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}
