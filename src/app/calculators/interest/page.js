import InterestCalculatorClient from "./InterestCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Interest Calculator";
const description = "Simple interest or compound interest calculator.";
const href = "/calculators/interest";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "What's the difference between simple and compound interest?",
    answer:
      "Simple interest is calculated only on the original principal each period. Compound interest is calculated on the principal plus any interest already earned, so it grows faster over time.",
  },
  {
    question: "Can I set how often interest compounds?",
    answer: "Yes — choose the compounding frequency (e.g. annually, monthly) along with the rate and time period.",
  },
  {
    question: "What do I need to enter to calculate interest?",
    answer: "Principal amount, interest rate, and time period — the calculator returns the interest earned and the total amount.",
  },
];

export default function InterestCalculatorPage() {
  const category = categories.find((c) => c.slug === "calculators");

  return (
    <section style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 20px 80px" }}>
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
        Interest Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Calculate simple or compound interest on a principal amount.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Enter a principal, rate, and time period to see interest earned either way — useful for
        comparing a savings account&apos;s compound growth against a simple-interest loan or deposit.
      </p>

      <InterestCalculatorClient />

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
