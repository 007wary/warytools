import GstCalculatorClient from "./GstCalculatorClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import HowToSteps from "@/components/HowToSteps";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import {
  jsonLdGraph,
  toolSoftwareAppJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
} from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// "Free" and "Online" are the modifiers this query set actually carries, and
// the reverse-GST intent ("remove GST") is a distinct high-volume query worth
// keeping in the title rather than burying in the body.
const title = "GST Calculator — Add or Remove GST Online Free";
const description =
  "Free GST calculator for Indian tax slabs — 5%, 12%, 18%, and 28%. Add GST to a base price or remove GST from an inclusive amount, with the CGST/SGST split.";
const appName = "GST Calculator";
const href = "/calculators/gst";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to calculate GST";
const howToSteps = [
  {
    name: "Choose add or remove GST",
    text: "Pick \"Add GST\" if your figure is the pre-tax base price, or \"Remove GST\" if it already includes tax and you need the base amount back.",
  },
  {
    name: "Enter the amount",
    text: "Type the price into the amount field. You can paste a figure straight from an invoice — commas and the ₹ symbol are handled.",
  },
  {
    name: "Select the GST rate",
    text: "Tap one of the standard slabs — 5%, 12%, 18%, or 28% — or choose Custom for a rate like the 0.25% and 3% used on gems and gold.",
  },
  {
    name: "Read the breakdown",
    text: "The base amount, GST, and total appear instantly, along with the CGST and SGST halves for an intra-state invoice.",
  },
];

const faqs = [
  {
    question: "Which GST slabs does the calculator support?",
    answer: "The common Indian GST rates — 5%, 12%, 18%, and 28% — are built in as quick-select options. There's also a Custom field for other rates, such as the 0.25% on rough gemstones and 3% on gold.",
  },
  {
    question: "Can I remove GST from a GST-inclusive price?",
    answer: "Yes. Switch to \"remove GST\" mode, enter the final price, and the calculator backs out the base price and GST amount. This is called reverse GST, and it's the calculation you need when a receipt shows only the total.",
  },
  {
    question: "How is GST added to a price calculated?",
    answer: "GST amount = base price × (GST rate ÷ 100), and the final price is the base price plus that GST amount. At 18%, a ₹1,000 base becomes ₹180 GST and ₹1,180 total.",
  },
  {
    question: "How do I work out GST backwards from the total?",
    answer: "Divide the inclusive amount by (1 + rate ÷ 100) to get the base. At 18%, a ₹1,180 total divided by 1.18 gives a ₹1,000 base and ₹180 GST. Dividing by the rate alone is the common mistake and gives the wrong answer.",
  },
  {
    question: "What are CGST and SGST, and how are they split?",
    answer: "On a sale within a single state, GST is collected half by the centre (CGST) and half by the state (SGST). An 18% rate is therefore 9% CGST plus 9% SGST. The calculator shows both halves under the result. On an inter-state sale the same total is charged as a single IGST line instead.",
  },
  {
    question: "Is this GST calculator free, and are my figures private?",
    answer: "It's completely free with no sign-up. The calculation runs entirely in your browser, so the amounts you enter are never sent to a server.",
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        GST Calculator
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Add or remove GST using the common Indian slabs — 5%, 12%, 18%, and 28%. This free online
        GST calculator gives you the base amount, GST, and total instantly, with no sign-up.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Enter a base price to add GST and see the final amount, or enter a GST-inclusive price
        to work out the pre-tax base and the GST portion — handy for invoicing or checking a
        bill. Every result also shows the CGST and SGST halves, which is what an intra-state
        invoice has to list separately.
      </p>

      <GstCalculatorClient />

      <HowToSteps title={howToName} steps={howToSteps} />

      <section style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          The GST formulas
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Adding GST.</strong> Multiply the base price by the
          rate over 100, then add it back: a ₹1,000 base at 18% gives ₹180 GST and a ₹1,180 total.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Removing GST (reverse GST).</strong> Divide the
          inclusive amount by 1 plus the rate over 100 — ₹1,180 ÷ 1.18 = a ₹1,000 base, leaving ₹180
          GST. Subtracting 18% from the total instead is the usual mistake, and it under-reports the
          base by about ₹18 on this example, because the 18% was charged on the base and not on the
          total.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: colors.text }}>CGST, SGST and IGST.</strong> A sale within one
          state splits the GST evenly between the centre and the state, so 18% is listed as 9% CGST
          plus 9% SGST. A sale across state lines carries the same 18% as a single IGST line. The
          total the customer pays is identical either way — only the split on the invoice changes.
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
