"use client";

import {
  validateDateInput,
  diffBetween,
  weekdayName,
  businessDaysBetween,
} from "@/lib/dateMath";
import { formatCount } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useTrackedCalculation } from "@/lib/analytics";
import ResultPanel from "@/components/calculator/ResultPanel";
import DateField from "@/components/calculator/DateField";
import ErrorBanner from "@/components/ErrorBanner";

const defaults = { start: "", end: "" };
const schema = { start: "date", end: "date" };

export default function DateDifferenceClient() {
  const { state, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { start, end } = state;

  // Live, like the rest of the calculators — the old click-to-calculate flow
  // left a stale result on screen whenever a date changed afterwards.
  const parsedStart = validateDateInput(start, { label: "Start date" });
  const parsedEnd = validateDateInput(end, { label: "End date" });

  const error = !parsedStart.ok && !parsedStart.empty
    ? parsedStart.error
    : !parsedEnd.ok && !parsedEnd.empty
      ? parsedEnd.error
      : "";

  const canCompute = parsedStart.ok && parsedEnd.ok;
  const result = canCompute ? diffBetween(parsedStart.date, parsedEnd.date) : null;
  const businessDays = canCompute ? businessDaysBetween(parsedStart.date, parsedEnd.date) : null;

  useTrackedCalculation({
    active: Boolean(result),
    params: {},
    deps: [Boolean(result), start, end],
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
        <DateField
          label="Start date"
          value={start}
          onChange={(next) => setField("start", next)}
          invalid={!parsedStart.ok && !parsedStart.empty}
        />
        <DateField
          label="End date"
          value={end}
          onChange={(next) => setField("end", next)}
          invalid={!parsedEnd.ok && !parsedEnd.empty}
        />
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel
            headline={{
              label: "Difference",
              value: `${result.years} years, ${result.months} months, ${result.days} days`,
            }}
            rows={[
              { label: "Total days", value: formatCount(result.totalDays), emphasis: true },
              { label: "Business days", value: `${formatCount(businessDays)} days` },
              { label: "Total weeks", value: `${formatCount(result.totalWeeks)} weeks` },
              { label: "Total months", value: `${formatCount(result.totalMonths)} months` },
              { label: "Start day", value: weekdayName(parsedStart.date) },
              { label: "End day", value: weekdayName(parsedEnd.date) },
            ]}
            footnote="Business days exclude Saturdays and Sundays, but not public holidays."
            shareUrl={shareUrl}
          />
        </div>
      )}
    </div>
  );
}
