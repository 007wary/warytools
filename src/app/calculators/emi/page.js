import EmiCalculatorClient from "./EmiCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "EMI Calculator — Home, Car & Personal Loan EMI";
const description =
  "Free EMI calculator for home, car, and personal loans. Get your monthly instalment, total interest, and a year-by-year amortisation breakdown instantly.";
const appName = "EMI Calculator";
const href = "/calculators/emi";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "How is EMI calculated?",
    answer:
      "EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), where P is the loan amount, r is the monthly interest rate (annual rate ÷ 12 ÷ 100), and n is the tenure in months.",
  },
  {
    question: "Does a longer tenure reduce my EMI?",
    answer:
      "Yes, a longer tenure lowers the monthly instalment, but it increases the total interest you pay over the life of the loan. The breakdown below the result shows both figures so you can compare.",
  },
  {
    question: "What is an amortisation schedule?",
    answer:
      "It shows how each year's payments split between interest and principal. Early instalments are mostly interest; the principal share grows as the outstanding balance falls.",
  },
  {
    question: "Is this EMI calculator free?",
    answer:
      "Yes — it's completely free, needs no sign-up, and runs entirely in your browser, so your loan figures are never sent to a server.",
  },
];

export default function EmiCalculatorPage() {
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
        EMI Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Work out the monthly EMI on a home, car, or personal loan. Enter the loan amount, interest
        rate, and tenure to see your instalment, the total interest, and how much you repay overall.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        The year-by-year breakdown shows how each instalment splits between interest and principal,
        so you can compare tenures properly — a longer loan means a smaller EMI but more interest
        paid in total.
      </p>

      <EmiCalculatorClient />

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
