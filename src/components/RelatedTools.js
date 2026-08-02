import Link from "next/link";
import { categoryColors, colors } from "@/lib/theme";

// "Related tools" links at the bottom of a tool page: other tools in the
// same category, plus a link back to the category hub. Gives crawlers and
// users a real internal-linking path between sibling tools instead of
// relying solely on the persistent navbar/footer.
export default function RelatedTools({ currentHref, categorySlug, categoryLabel, hubHref, tools }) {
  const others = tools.filter((tool) => tool.href !== currentHref);
  const accent = categoryColors[categorySlug] || categoryColors.pdf;

  if (others.length === 0) return null;

  return (
    <section style={{ marginTop: "48px", paddingTop: "32px", borderTop: `1px solid ${colors.border}` }}>
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: colors.text, marginBottom: "14px" }}>
        More {categoryLabel}
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {others.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              border: `1px solid ${accent.border}`,
              backgroundColor: accent.bg,
              color: accent.text,
              fontSize: "13.5px",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            {tool.title}
          </Link>
        ))}
        <Link
          href={hubHref}
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: "999px",
            border: `1px solid ${colors.border}`,
            color: colors.textMuted,
            fontSize: "13.5px",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          All {categoryLabel} →
        </Link>
      </div>
    </section>
  );
}
