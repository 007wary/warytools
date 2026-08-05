import GstCalculatorClient from "./GstCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "GST Calculator — Add or Remove GST Online";
const description =
  "Free GST calculator for Indian tax slabs (5%, 12%, 18%, 28%). Add GST to a base price or extract GST from an inclusive amount instantly.";
const appName = "GST Calculator";
const href = "/calculators/gst";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Which GST slabs does the calculator support?",
    answer: "The common Indian GST rates — 5%, 12%, 18%, and 28% — are built in as quick-select options.",
  },
  {
    question: "Can I remove GST from a GST-inclusive price?",
    answer: "Yes. Switch to \"remove GST\" mode, enter the final price, and the calculator backs out the base price and GST amount.",
  },
  {
    question: "How is GST added to a price calculated?",
    answer: "GST amount = base price × (GST rate ÷ 100), and the final price is the base price plus that GST amount.",
  },
];

export default function GstCalculatorPage() {
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
        GST Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Add or remove GST using the common Indian slabs — 5%, 12%, 18%, and 28%.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Enter a base price to add GST and see the final amount, or enter a GST-inclusive price
        to work out the pre-tax base and the GST portion — handy for invoicing or checking a
        bill.
      </p>

      <GstCalculatorClient />

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
