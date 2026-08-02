import { colors } from "@/lib/theme";

// Visible FAQ block for tool pages. Pair with faqJsonLd() from
// src/lib/jsonLd.js (rendered separately via <JsonLd>) so the same Q&A
// content backs both the on-page copy and the FAQPage structured data.
export default function FaqSection({ items }) {
  return (
    <section style={{ marginTop: "48px" }}>
      <h2 style={{ fontSize: "19px", fontWeight: 600, color: colors.text, marginBottom: "16px" }}>
        Frequently asked questions
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {items.map(({ question, answer }) => (
          <div key={question}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: colors.text, marginBottom: "6px" }}>
              {question}
            </h3>
            <p style={{ fontSize: "14px", color: colors.textMuted, lineHeight: 1.6, margin: 0 }}>
              {answer}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
