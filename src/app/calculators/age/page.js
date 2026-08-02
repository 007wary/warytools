import AgeCalculatorClient from "./AgeCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Age Calculator";
const description = "Calculate exact age from a date of birth.";
const href = "/calculators/age";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

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
        Age Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Find your exact age in years, months, and days from your date of birth.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Enter a date of birth to get the precise age breakdown instantly — useful for forms,
        eligibility checks, or just settling an argument about who&apos;s older.
      </p>

      <AgeCalculatorClient />

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
