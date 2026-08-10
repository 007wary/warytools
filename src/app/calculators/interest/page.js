import InterestCalculatorClient from "./InterestCalculatorClient";
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

// "Compound interest calculator" is the query with real volume here — far more
// than the bare "interest calculator" head term — so it leads the title, with
// simple interest named after it since the tool does both.
const title = "Compound & Simple Interest Calculator";
const description =
  "Free compound and simple interest calculator. Enter principal, rate, and time to see the interest earned, the maturity amount, and the effective annual rate.";
const appName = "Interest Calculator";
const href = "/calculators/interest";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to calculate compound interest";
const howToSteps = [
  {
    name: "Choose simple or compound",
    text: "Pick Compound Interest for savings, fixed deposits, and most investments. Simple Interest applies to some short-term loans and bonds where interest never earns interest.",
  },
  {
    name: "Enter principal, rate, and time",
    text: "Type the starting amount, the annual interest rate, and how many years it runs for.",
  },
  {
    name: "Set the compounding frequency",
    text: "In compound mode, choose whether interest is added annually, semi-annually, quarterly, or monthly. The more often it compounds, the more it earns.",
  },
  {
    name: "Compare the effective annual rate",
    text: "The result shows the interest earned, the maturity amount, and — in compound mode — the effective annual rate, which is the figure to compare two offers by.",
  },
];

const faqs = [
  {
    question: "What's the difference between simple and compound interest?",
    answer:
      "Simple interest is calculated only on the original principal each period. Compound interest is calculated on the principal plus any interest already earned, so it grows faster over time.",
  },
  {
    question: "Can I set how often interest compounds?",
    answer:
      "Yes. Compound mode offers annual, semi-annual, quarterly, and monthly compounding. Pick the one your bank or deposit actually uses — Indian fixed deposits are usually quarterly, while most savings accounts credit interest quarterly on a daily balance.",
  },
  {
    question: "What do I need to enter to calculate interest?",
    answer:
      "Three figures: the principal, the annual interest rate, and the number of years. In compound mode there is a fourth choice, the compounding frequency. The interest earned and the maturity amount appear as soon as all three are filled in.",
  },
  {
    question: "What is the effective annual rate, and why does it differ from the quoted rate?",
    answer:
      "The effective annual rate is what a quoted rate actually works out to once compounding is counted. 10% compounded monthly earns about 10.47% over a year, because each month's interest starts earning interest itself. It's the only fair way to compare two offers with different compounding frequencies.",
  },
  {
    question: "Does more frequent compounding always earn more?",
    answer:
      "Yes, but with diminishing returns. At a 10% rate, annual compounding gives 10%, quarterly about 10.38%, and monthly about 10.47%. The gap between monthly and daily is very small, so a slightly higher rate usually beats more frequent compounding.",
  },
  {
    question: "Is this the right calculator for a recurring deposit or SIP?",
    answer:
      "No. This calculates growth on a single lump sum. A recurring deposit or SIP adds a fresh contribution every period, so each instalment compounds for a different length of time and needs a different formula.",
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
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
        Compound mode also shows the effective annual rate, which is what lets you compare two
        offers that compound at different frequencies.
      </p>

      <InterestCalculatorClient />

      <HowToSteps title={howToName} steps={howToSteps} />

      <section style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          The interest formulas
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Simple interest</strong> is P × r × t ÷ 100 — the
          principal, the annual rate, and the number of years. The interest is the same every year
          because it is always charged on the original amount. ₹1,00,000 at 8% for 5 years earns
          ₹40,000.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Compound interest</strong> is P × (1 + r ÷ n)
          <sup>n×t</sup> − P, where n is how many times a year interest is added. Each period&apos;s
          interest joins the principal and earns interest itself, so the same ₹1,00,000 at 8%
          compounded annually earns about ₹46,933 over 5 years — nearly ₹7,000 more than simple
          interest, from an identical rate.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          That gap widens sharply with time, because the interest being re-invested is itself larger
          every year. Over one or two years simple and compound barely differ; over decades the
          difference dominates the result. The same logic applies to the compounding frequency,
          which is why the effective annual rate — not the quoted rate — is the figure to compare
          two offers by.
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
