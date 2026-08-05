import PercentageCalculatorClient from "./PercentageCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Percentage Calculator — Percent & Change";
const description =
  "Free online percentage calculator: work out a percentage of a number, percentage increase or decrease, and what percent one number is of another.";
const appName = "Percentage Calculator";
const href = "/calculators/percentage";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "How do I find what percentage one number is of another?",
    answer: "Use the \"X is what percent of Y\" mode — enter both numbers and the calculator returns the percentage directly.",
  },
  {
    question: "How is percentage change calculated?",
    answer: "Percentage change is (new value − old value) ÷ old value × 100, and the calculator handles both increases and decreases.",
  },
  {
    question: "Can I calculate a percentage of a number, like 15% of 200?",
    answer: "Yes — that's the calculator's default mode: enter the percentage and the number to get the result instantly.",
  },
];

export default function PercentageCalculatorPage() {
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
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Percentage Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Percentage of a number, what percent one number is of another, or percentage change. A
        free online percentage calculator that works instantly in your browser, with no sign-up.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Covers the three percentage calculations people actually need — finding a percentage of
        a number, working out what percent one number is of another, and calculating percentage
        increase or decrease between two values.
      </p>

      <PercentageCalculatorClient />

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
