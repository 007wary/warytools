"use client";

import {
  validateDateInput,
  diffBetween,
  startOfToday,
  nextAnniversary,
  weekdayName,
} from "@/lib/dateMath";
import { formatCount } from "@/lib/calculatorFormat";
import { useCalculatorState } from "@/lib/useCalculatorState";
import { useTrackedCalculation } from "@/lib/analytics";
import ResultPanel from "@/components/calculator/ResultPanel";
import DateField from "@/components/calculator/DateField";
import ErrorBanner from "@/components/ErrorBanner";

const defaults = { dob: "", on: "" };
const schema = { dob: "date", on: "date" };

export default function AgeCalculatorClient() {
  const { state, setField, shareUrl } = useCalculatorState(schema, defaults);
  const { dob, on } = state;

  // Age was previously computed on a button click, which meant the answer
  // silently went stale the moment you changed the date — the old result just
  // sat there next to the new input. It now recomputes live, like every other
  // calculator on the site.
  const parsedDob = validateDateInput(dob, { label: "Date of birth", allowFuture: false });

  // "Age on a given date" is a real need (eligibility cut-offs, forms) and
  // costs one optional field. Empty means today.
  const parsedOn = validateDateInput(on, { label: "Age-on date" });
  const asOf = parsedOn.ok ? parsedOn.date : startOfToday();

  const error = !parsedDob.ok && !parsedDob.empty
    ? parsedDob.error
    : !parsedOn.ok && !parsedOn.empty
      ? parsedOn.error
      : parsedDob.ok && parsedDob.date > asOf
        ? "Date of birth is after the date you're measuring to."
        : "";

  const canCompute = parsedDob.ok && !error;
  const result = canCompute ? diffBetween(parsedDob.date, asOf) : null;
  const birthday = canCompute ? nextAnniversary(parsedDob.date, asOf) : null;

  useTrackedCalculation({
    active: Boolean(result),
    params: { has_custom_date: parsedOn.ok },
    deps: [Boolean(result), dob, on],
  });

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
        <DateField
          label="Date of birth"
          value={dob}
          onChange={(next) => setField("dob", next)}
          invalid={!parsedDob.ok && !parsedDob.empty}
        />
        <DateField
          label="Age on (optional)"
          value={on}
          onChange={(next) => setField("on", next)}
          hint="Defaults to today"
          invalid={!parsedOn.ok && !parsedOn.empty}
        />
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <ResultPanel
            headline={{
              label: parsedOn.ok ? "Age on that date" : "Current age",
              value: `${result.years} years, ${result.months} months, ${result.days} days`,
            }}
            rows={[
              { label: "In months", value: `${formatCount(result.totalMonths)} months` },
              { label: "In weeks", value: `${formatCount(result.totalWeeks)} weeks` },
              { label: "In days", value: `${formatCount(result.totalDays)} days` },
              { label: "Born on a", value: weekdayName(parsedDob.date) },
              ...(birthday
                ? [
                    {
                      label: `Turns ${birthday.turning}`,
                      value:
                        birthday.daysUntil === 0
                          ? "Today 🎉"
                          : `in ${formatCount(birthday.daysUntil)} days`,
                    },
                  ]
                : []),
            ]}
            shareUrl={shareUrl}
          />
        </div>
      )}
    </div>
  );
}
