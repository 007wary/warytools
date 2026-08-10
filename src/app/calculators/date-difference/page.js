import DateDifferenceClient from "./DateDifferenceClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import HowToSteps from "@/components/HowToSteps";
import {
  jsonLdGraph,
  toolSoftwareAppJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
} from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// "Days between dates" is the phrasing people search, well ahead of "date
// difference calculator", so it leads. Business days are a distinct query the
// tool already answers but the page never mentioned — now in the description.
const title = "Days Between Dates Calculator — Free & Online";
const description =
  "Free date difference calculator: count the days, business days, weeks, months, and years between two dates. Handles leap years. No sign-up required.";
const appName = "Date Difference Calculator";
const href = "/calculators/date-difference";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to count the days between two dates";
const howToSteps = [
  {
    name: "Pick the start date",
    text: "Choose the earlier date from the calendar field. The order does not matter — the calculator measures the span either way.",
  },
  {
    name: "Pick the end date",
    text: "Choose the second date. The result appears immediately, with no calculate button to press.",
  },
  {
    name: "Read the totals you need",
    text: "You get the span in years, months, and days, plus totals in days, business days, weeks, and months, and the weekday each date falls on.",
  },
];

const faqs = [
  {
    question: "Does the calculator count the difference in days, or years and months too?",
    answer:
      "Both. The headline is the span in years, months, and days, and below it you get the totals in calendar days, business days, weeks, and months, plus the weekday each date falls on.",
  },
  {
    question: "Can I calculate the difference between a past date and a future date?",
    answer: "Yes. Either date can be in the past or future — the calculator works out the difference either way.",
  },
  {
    question: "Is today's date included in the count?",
    answer: "The difference is calculated as full elapsed days between the two dates, so it reflects the actual time span between them. A start and end one day apart counts as 1 day, not 2.",
  },
  {
    question: "How many business days are between two dates?",
    answer:
      "The Business days row counts only Monday to Friday, excluding every Saturday and Sunday in the span. It's the figure notice periods, delivery windows, and service-level agreements are usually written in.",
  },
  {
    question: "Are public holidays excluded from the business day count?",
    answer:
      "No, deliberately. Public holidays differ by country, state, and year, and a half-correct holiday calendar would be worse than none — it would quietly produce wrong answers for most people. Subtract the holidays that apply to you from the business day total.",
  },
  {
    question: "Are leap years handled?",
    answer:
      "Yes. The count uses real calendar dates, so every 29 February inside the span is included. 2024 was a leap year, so 1 January 2024 to 1 January 2025 is 366 days rather than 365.",
  },
];

export default function DateDifferencePage() {
  const category = categories.find((c) => c.slug === "calculators");

  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "calculators" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Calculators", href: "/calculators" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Date Difference Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Find the number of days, business days, months, and years between two dates. A free online
        date calculator that handles leap years automatically — no sign-up, nothing uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick a start and end date to see exactly how much time separates them — useful for
        countdowns, deadlines, project timelines, or figuring out how long ago something
        happened. The business-day total counts weekdays only, which is how notice periods and
        delivery windows are usually written.
      </p>

      <DateDifferenceClient />

      <HowToSteps title={howToName} steps={howToSteps} />

      <section style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          Calendar days, business days, and months
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Calendar days</strong> count every day in the span,
          weekends and holidays included. This is the figure interest, age, and most deadlines are
          measured in. The count is exclusive of the start date, so 1 March to 2 March is 1 day.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Business days</strong> count Monday to Friday only.
          Over a long span the two diverge sharply — a 30-day month is about 22 business days — which
          is why a &quot;30 day&quot; and a &quot;30 working day&quot; deadline are more than a week
          apart.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: colors.text }}>Months and years</strong> are counted as whole
          calendar units rather than by dividing days by 30 or 365. Months vary from 28 to 31 days,
          so an averaged figure drifts; stepping through the calendar keeps the answer matching how
          a contract or a person would count it.
        </p>
      </section>

      <FaqSection items={faqs} />
      <RelatedTools
        currentHref={href}
        categorySlug="calculators"
        categoryLabel="calculators"
        hubHref="/calculators"
        tools={category.tools}
      />
    </section>
  );
}
