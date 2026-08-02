import DateDifferenceClient from "./DateDifferenceClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Date Difference Calculator";
const description = "Days, months, and years between two dates.";
const href = "/calculators/date-difference";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "Does the calculator count the difference in days, or years and months too?",
    answer: "Both — it breaks the difference down into years, months, and days, plus a total day count.",
  },
  {
    question: "Can I calculate the difference between a past date and a future date?",
    answer: "Yes. Either date can be in the past or future — the calculator works out the difference either way.",
  },
  {
    question: "Is today's date included in the count?",
    answer: "The difference is calculated as full elapsed days between the two dates, so it reflects the actual time span between them.",
  },
];

export default function DateDifferencePage() {
  const category = categories.find((c) => c.slug === "calculators");

  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: title, description, href, categorySlug: "calculators" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Calculators", href: "/calculators" },
            { name: title, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Date Difference Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Find the number of days, months, and years between two dates.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick a start and end date to see exactly how much time separates them — useful for
        countdowns, deadlines, project timelines, or figuring out how long ago something
        happened.
      </p>

      <DateDifferenceClient />

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
