import AgeCalculatorClient from "./AgeCalculatorClient";
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

// The old title repeated "Age" twice ("Age Calculator — Age from Date of
// Birth"). "Date of Birth" is the phrase with the volume, so it stays, and the
// duplicate is replaced by the "free"/"online" modifiers. Kept as a readable
// phrase rather than a keyword list — a title that reads as stuffing suppresses
// the click it was widened to win.
const title = "Age Calculator — Free, from Date of Birth";
const description =
  "Free online age calculator: find your exact age in years, months, and days from a date of birth. Handles leap years and any target date. No sign-up.";
const appName = "Age Calculator";
const href = "/calculators/age";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to calculate your age";
const howToSteps = [
  {
    name: "Enter your date of birth",
    text: "Pick the date from the calendar field, or type it in. The result appears the moment a valid date is entered.",
  },
  {
    name: "Optionally set an as-of date",
    text: "Leave the second field blank to measure to today. Fill it in to find an age on a specific date instead — what a school cut-off or eligibility form usually asks for.",
  },
  {
    name: "Read the full breakdown",
    text: "You get the age in years, months, and days, plus the totals in months, weeks, and days, the weekday you were born on, and the countdown to the next birthday.",
  },
];

const faqs = [
  {
    question: "How is exact age calculated?",
    answer:
      "The calculator finds the full years, months, and days between your date of birth and today (or another date you choose), accounting for varying month lengths and leap years.",
  },
  {
    question: "Can I calculate age as of a future or past date, not just today?",
    answer: "Yes. Enter any reference date and the calculator shows the age as of that date instead of today.",
  },
  {
    question: "How is age handled if I was born on 29 February?",
    answer:
      "Your age in years increments normally. For the birthday countdown in a non-leap year, the anniversary is treated as falling on 1 March, which is the convention most official forms in India and the UK follow.",
  },
  {
    question: "Why don't the months and days match a simple day count divided by 30?",
    answer:
      "Because months are not all the same length. The calculator steps forward whole calendar months from your birth date and then measures the remaining days, so the answer matches how people actually count age rather than an averaged approximation.",
  },
  {
    question: "Is my date of birth stored or sent anywhere?",
    answer: "No. The calculation runs entirely in your browser and nothing you enter is saved or transmitted.",
  },
];

export default function AgeCalculatorPage() {
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
        Age Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Find your exact age in years, months, and days from your date of birth. This free online
        age calculator runs entirely in your browser — nothing you enter is sent anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Enter a date of birth to get the precise age breakdown instantly — useful for forms,
        eligibility checks, or just settling an argument about who&apos;s older. You also get the
        age in total months, weeks, and days, the day of the week you were born on, and how long
        until the next birthday.
      </p>

      <AgeCalculatorClient />

      <HowToSteps title={howToName} steps={howToSteps} />

      <section style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          How age is counted
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          Age is measured in whole calendar units rather than by dividing a day count. The
          calculator steps forward from your birth date one full year at a time, then one full month
          at a time, and whatever is left over is the days. That is why someone born on 31 January
          is 1 month old on 28 February and not before — the month has to complete.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          Leap years are handled by the calendar itself, so a 29 February birth date is measured
          correctly rather than being shifted. The day totals count real calendar days, including
          the extra day in each leap year the span crosses.
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
