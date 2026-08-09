import { colors } from "@/lib/theme";

// Visible "how to" steps for tool pages. Pair with howToJsonLd() from
// src/lib/jsonLd.js (rendered separately via <JsonLd>) so the same steps back
// both the on-page copy and the HowTo structured data.
//
// Rendering these is not optional decoration around the schema. Google's
// structured-data policy requires HowTo content to be visible to the user on
// the page — markup describing steps a visitor cannot see is grounds for the
// rich result being dropped and, at worst, a manual action. So the schema
// builder and this component are always used as a pair, the same arrangement
// FaqSection has with faqJsonLd.
//
// An ordered list, because the steps are genuinely ordered and <ol> is what
// says so to a screen reader. The numbers are the list's own markers rather
// than text baked into each step, so they can never drift out of sequence.
//
// The id is what the schema's step `url` anchors point at, so a crawler
// following one lands on the rendered steps rather than the top of the page.
export default function HowToSteps({ title, steps }) {
  return (
    <section id="how-to" style={{ marginTop: "48px" }}>
      <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
        {title}
      </h2>
      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          margin: 0,
          paddingLeft: "22px",
        }}
      >
        {steps.map(({ name, text }) => (
          <li key={name} style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: colors.text, fontWeight: 600 }}>{name}.</strong> {text}
          </li>
        ))}
      </ol>
    </section>
  );
}
