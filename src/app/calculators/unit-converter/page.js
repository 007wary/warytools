import UnitConverterClient from "./UnitConverterClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Unit Converter";
const description = "Convert length, weight, and temperature units.";
const href = "/calculators/unit-converter";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "Which unit categories can I convert?",
    answer: "Length, weight, and temperature — covering the units people convert most often, like meters to feet, kilograms to pounds, or Celsius to Fahrenheit.",
  },
  {
    question: "Are the conversions accurate for precise work?",
    answer: "Yes, conversions use standard conversion factors; results are shown with enough precision for everyday and professional use.",
  },
  {
    question: "Can I convert between metric and imperial units?",
    answer: "Yes — the converter handles metric-to-imperial and imperial-to-metric conversions in both directions.",
  },
];

export default function UnitConverterPage() {
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
        Unit Converter
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Convert between length, weight, and temperature units.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick a category, choose your source and target units, and get the converted value
        instantly — no need to remember conversion factors or hunt down a formula.
      </p>

      <UnitConverterClient />

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
