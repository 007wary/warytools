import PercentageCalculatorClient from "./PercentageCalculatorClient";
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

// Titles lead with the head term and carry the "free"/"online" modifiers people
// actually type, matching the pattern the PDF and image pages already use. The
// old title was "Percentage Calculator — Percent & Change", which spent its
// second half on a phrase nobody searches and repeated the word "Percent".
const title = "Percentage Calculator — Free & Online";
const description =
  "Free online percentage calculator. Find a percentage of a number, work out percentage increase or decrease, and see what percent one number is of another.";
const appName = "Percentage Calculator";
const href = "/calculators/percentage";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to calculate a percentage";
const howToSteps = [
  {
    name: "Pick the calculation",
    text: "Choose \"X% of Y\" to find a percentage of a number, \"X is what % of Y\" to turn a score into a percentage, or \"% change\" to compare two values.",
  },
  {
    name: "Enter your two numbers",
    text: "Type the values into the two fields. The result updates as you type — there is no calculate button to press.",
  },
  {
    name: "Read or share the result",
    text: "The answer appears immediately, along with the difference. Use Copy link to share the exact calculation with someone else.",
  },
];

const faqs = [
  {
    question: "How do I find what percentage one number is of another?",
    answer: "Use the \"X is what percent of Y\" mode — enter both numbers and the calculator returns the percentage directly. For example, 45 out of 60 is 75%.",
  },
  {
    question: "How is percentage change calculated?",
    answer: "Percentage change is (new value − old value) ÷ old value × 100, and the calculator handles both increases and decreases. Going from 80 to 100 is a 25% increase; going from 100 to 80 is a 20% decrease.",
  },
  {
    question: "Can I calculate a percentage of a number, like 15% of 200?",
    answer: "Yes — that's the calculator's default mode: enter the percentage and the number to get the result instantly. 15% of 200 is 30.",
  },
  {
    question: "How do I work out a percentage discount?",
    answer: "Use \"X% of Y\" with the discount rate and the original price to get the amount off — 20% of ₹2,500 is ₹500, so the sale price is ₹2,000. The Remaining row shows that final figure directly.",
  },
  {
    question: "Why is a percentage increase and decrease of the same size not symmetrical?",
    answer: "Because each is measured against a different starting value. A 50% rise from 100 gives 150, but returning from 150 to 100 is a 33.3% fall — the second calculation divides by 150, not 100.",
  },
  {
    question: "Can I share a calculation with someone?",
    answer: "Yes. The inputs are stored in the page's web address, so the Copy link button gives you a URL that reopens the calculator with the same numbers already filled in.",
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
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
        increase or decrease between two values. Results appear as you type, and every calculation
        has its own link you can bookmark or send to someone.
      </p>

      <PercentageCalculatorClient />

      <HowToSteps title={howToName} steps={howToSteps} />

      <section style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          The three percentage formulas
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>Percentage of a number.</strong> Divide the
          percentage by 100 and multiply by the value: 15% of 200 is (15 ÷ 100) × 200 = 30. This is
          the one behind discounts, tips, and commission.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          <strong style={{ color: colors.text }}>What percent one number is of another.</strong>{" "}
          Divide the part by the whole and multiply by 100: 45 out of 60 is (45 ÷ 60) × 100 = 75%.
          This is how test scores, completion rates, and shares of a total are worked out.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: colors.text }}>Percentage change.</strong> Subtract the old value
          from the new one, divide by the old value, and multiply by 100: from 80 to 100 is
          (100 − 80) ÷ 80 × 100 = a 25% increase. A negative result is a decrease. Note that the
          old value is always the denominator, which is why a rise and the fall that undoes it are
          different percentages.
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
