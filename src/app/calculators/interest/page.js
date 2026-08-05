import InterestCalculatorClient from "./InterestCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Interest Calculator — Simple & Compound";
const description =
  "Free online interest calculator for simple and compound interest. Enter principal, rate, and time to see the interest earned and total amount.";
const appName = "Interest Calculator";
const href = "/calculators/interest";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

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
        Interest Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Calculate simple or compound interest on a principal amount. A free online interest
        calculator showing the interest earned and the total, with no sign-up required.
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
