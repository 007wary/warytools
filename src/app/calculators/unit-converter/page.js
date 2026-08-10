import UnitConverterClient from "./UnitConverterClient";
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
import { unitCategories, convertLinear } from "@/lib/unitConversions";
import { formatNumber } from "@/lib/calculatorFormat";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Unit Converter — Length, Weight & Temperature";
const description =
  "Free online unit converter: cm to inches, kg to pounds, Celsius to Fahrenheit, and more. Convert length, weight, and temperature instantly in your browser.";
const appName = "Unit Converter";
const href = "/calculators/unit-converter";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const howToName = "How to convert units";
const howToSteps = [
  {
    name: "Choose a category",
    text: "Pick Length, Weight, or Temperature. The unit lists update to match.",
  },
  {
    name: "Enter a value and pick the units",
    text: "Type the amount, then choose what you are converting from and to. Use the swap button to reverse the direction without retyping.",
  },
  {
    name: "Read the result and the rate",
    text: "The converted value appears instantly, along with the conversion rate in both directions — useful when you need the factor rather than a single answer.",
  },
];

const faqs = [
  {
    question: "Which unit categories can I convert?",
    answer:
      "Length, weight, and temperature. Length covers millimetres through to miles, weight covers milligrams through to tonnes, and temperature covers Celsius, Fahrenheit, and Kelvin — so the common pairs like metres to feet, kilograms to pounds, and Celsius to Fahrenheit are all there.",
  },
  {
    question: "How accurate are the conversions?",
    answer:
      "The factors are the internationally defined ones — an inch is exactly 2.54 cm and a mile is exactly 1609.344 m, so those conversions are exact. Pound and ounce use the standard avoirdupois factors rounded to six significant figures, which is well inside everyday and trade tolerances. Results are displayed rounded for readability, so for metrology or laboratory work, check the displayed precision against what your task requires.",
  },
  {
    question: "Can I convert between metric and imperial units?",
    answer:
      "Yes, in both directions — centimetres to inches and inches to centimetres, kilograms to pounds and pounds to kilograms. The swap button reverses the direction without retyping the value.",
  },
  {
    question: "How many centimetres are in an inch?",
    answer: "Exactly 2.54 cm, by international definition since 1959. So 12 inches is 30.48 cm, and 1 cm is about 0.3937 inches.",
  },
  {
    question: "How do I convert kilograms to pounds?",
    answer: "Multiply by about 2.20462 — so 70 kg is roughly 154.3 lb. Going the other way, divide by the same figure, or multiply pounds by about 0.4536 to get kilograms.",
  },
  {
    question: "How do I convert Celsius to Fahrenheit?",
    answer: "Multiply by 9/5 and add 32: 20°C is 68°F. Temperature is the one category that needs a formula rather than a multiplier, because the two scales have different zero points — which is also why 0°C is 32°F, not 0°F.",
  },
];

// A reference table of the pairs people actually search for ("cm to inches",
// "kg to lbs"), which the page otherwise only answered interactively — a
// crawler sees an empty form, not an answer.
//
// Every figure is computed from the same conversion factors the tool itself
// uses rather than typed by hand, so the table cannot drift away from the
// calculator sitting above it. Publishing a wrong constant here would be worse
// than publishing nothing.
const commonConversions = [
  { category: "length", from: "centimeter", to: "inch", label: "1 centimetre" },
  { category: "length", from: "inch", to: "centimeter", label: "1 inch" },
  { category: "length", from: "meter", to: "foot", label: "1 metre" },
  { category: "length", from: "kilometer", to: "mile", label: "1 kilometre" },
  { category: "length", from: "mile", to: "kilometer", label: "1 mile" },
  { category: "weight", from: "kilogram", to: "pound", label: "1 kilogram" },
  { category: "weight", from: "pound", to: "kilogram", label: "1 pound" },
  { category: "weight", from: "gram", to: "ounce", label: "1 gram" },
  { category: "weight", from: "ounce", to: "gram", label: "1 ounce" },
];

function CommonConversions() {
  return (
    <section style={{ marginTop: "48px" }}>
      <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
        Common conversions at a glance
      </h2>
      <div
        style={{
          overflowX: "auto",
          border: `1px solid ${colors.border}`,
          borderRadius: "10px",
          marginBottom: "16px",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
            minWidth: "320px",
          }}
        >
          <tbody>
            {commonConversions.map(({ category, from, to, label }) => {
              const units = unitCategories[category].units;
              const value = convertLinear(1, category, from, to);
              return (
                <tr key={`${from}-${to}`}>
                  <th
                    scope="row"
                    style={{
                      textAlign: "left",
                      padding: "9px 14px",
                      color: colors.textSecondary,
                      fontWeight: 500,
                      borderTop: `1px solid ${colors.borderMuted}`,
                    }}
                  >
                    {label}
                  </th>
                  <td
                    style={{
                      textAlign: "right",
                      padding: "9px 14px",
                      color: colors.text,
                      borderTop: `1px solid ${colors.borderMuted}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatNumber(value)} {units[to].label.replace(/\s*\(.*\)$/, "").toLowerCase()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.7, margin: 0 }}>
        Temperature works differently from the rest. Length and weight convert by multiplying by a
        fixed factor, but the temperature scales have different zero points, so Celsius to
        Fahrenheit is (°C × 9/5) + 32 and Fahrenheit to Celsius is (°F − 32) × 5/9. Kelvin shares
        Celsius&apos;s degree size and simply shifts by 273.15.
      </p>
    </section>
  );
}

export default function UnitConverterPage() {
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
        Unit Converter
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Convert between length, weight, and temperature units — cm to inches, kg to pounds,
        Celsius to Fahrenheit. A free online unit converter that runs instantly in your browser.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick a category, choose your source and target units, and get the converted value
        instantly — no need to remember conversion factors or hunt down a formula. Each result also
        shows the rate in both directions, so you can reuse the factor elsewhere.
      </p>

      <UnitConverterClient />

      <HowToSteps title={howToName} steps={howToSteps} />

      <CommonConversions />

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
