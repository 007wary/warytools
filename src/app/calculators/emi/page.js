import EmiCalculatorClient from "./EmiCalculatorClient";
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

// The three loan types are the queries with volume here ("home loan EMI
// calculator" far outweighs the bare head term), so they stay in the title.
// "EMI" is not repeated at the end as it was before — that slot now carries the
// "free" modifier instead.
const title = "EMI Calculator — Home, Car & Personal Loan";
const description =
  "Free EMI calculator for home, car, and personal loans. Get your monthly instalment, total interest, and a year-by-year amortisation schedule instantly.";
const appName = "EMI Calculator";
const href = "/calculators/emi";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to calculate your loan EMI";
const howToSteps = [
  {
    name: "Enter the loan amount",
    text: "Type the principal you plan to borrow — the sanctioned amount, not the property or vehicle price, if you are paying a down payment.",
  },
  {
    name: "Add the interest rate",
    text: "Enter the annual interest rate your lender quoted. If you have been given an APR as well, use the plain interest rate here — an APR folds in processing fees, which this calculation deliberately excludes.",
  },
  {
    name: "Set the tenure in years",
    text: "Enter how long you will repay over. Try a few values — the total interest figure moves far more than the EMI does.",
  },
  {
    name: "Compare the EMI and total interest",
    text: "The monthly instalment, total interest, and total payable appear immediately, followed by a year-by-year breakdown of how each payment splits.",
  },
];

const faqs = [
  {
    question: "How is EMI calculated?",
    answer:
      "EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), where P is the loan amount, r is the monthly interest rate (annual rate ÷ 12 ÷ 100), and n is the tenure in months.",
  },
  {
    question: "Does a longer tenure reduce my EMI?",
    answer:
      "Yes, a longer tenure lowers the monthly instalment, but it increases the total interest you pay over the life of the loan. The result panel shows the EMI and the total interest side by side, so you can change the tenure and watch both move.",
  },
  {
    question: "What is an amortisation schedule?",
    answer:
      "It shows how each year's payments split between interest and principal. Early instalments are mostly interest; the principal share grows as the outstanding balance falls.",
  },
  {
    question: "Why is so much of my early EMI going to interest?",
    answer:
      "Interest is charged on the outstanding balance, which is at its largest at the start. The instalment stays fixed, so as the balance falls the interest portion shrinks and the principal portion grows. On a 20-year home loan, roughly half of the first year's payments typically go to interest.",
  },
  {
    question: "How much can I save by prepaying my loan?",
    answer:
      "Prepayment reduces the outstanding balance, so all future interest is charged on a smaller figure. Shortening the tenure in the calculator gives a good approximation: the drop in total interest between two tenures is close to what clearing the balance early would save.",
  },
  {
    question: "Does this include processing fees or insurance?",
    answer:
      "No. The result covers principal and interest only. Lenders often add a one-time processing fee and may bundle insurance, so the amount actually debited can be slightly higher than the EMI shown here.",
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
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

      <HowToSteps title={howToName} steps={howToSteps} />

      <section style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
          How the EMI formula works
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          An EMI is a fixed monthly payment that clears both the interest and the principal over an
          agreed term. The formula is EMI = P × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> − 1),
          where P is the loan amount, r is the monthly rate — the annual rate divided by 12 and by
          100 — and n is the number of months.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, marginBottom: "14px" }}>
          The instalment stays the same every month, but its composition does not. Interest is
          charged on whatever is still outstanding, so early payments are mostly interest and later
          ones are mostly principal. That crossover is what the year-by-year table above shows, and
          it is the reason prepaying early saves far more than prepaying late.
        </p>
        <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
          Tenure is the lever worth testing. Stretching a loan lowers the monthly figure but raises
          the total interest substantially, because the balance is outstanding for longer — so the
          cheapest-looking EMI is often the most expensive loan. Compare the total interest, not
          just the instalment, before choosing a term.
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
