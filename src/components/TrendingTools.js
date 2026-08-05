import Link from "next/link";
import ToolIcon from "./ToolIcon";
import { categoryColors, colors } from "@/lib/theme";

// Compact horizontal row of tools shown directly under the homepage search
// box. Deliberately not ToolCard: these sit above the main grid, where full
// cards would push the actual tool listing below the fold on a laptop and
// duplicate cards the user is about to scroll past anyway.
//
// Two modes, from rankTools():
//   "trending" — real ranking, labelled as such
//   "curated"  — not enough data yet, labelled neutrally ("Popular tools")
// The label MUST track the mode. Calling a curated fallback "trending" would
// be a claim about data we don't have.
export default function TrendingTools({ mode, tools }) {
  if (!Array.isArray(tools) || tools.length === 0) return null;

  const isTrending = mode === "trending";

  return (
    <section
      aria-labelledby="trending-tools-heading"
      style={{ maxWidth: "720px", margin: "28px auto 0", padding: "0 20px" }}
    >
      <h2
        id="trending-tools-heading"
        style={{
          fontSize: "12px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: colors.textFaint,
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        {isTrending && <ToolIcon name="TrendingUp" size={13} aria-hidden="true" />}
        {isTrending ? "Trending this week" : "Popular tools"}
      </h2>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        {tools.map((tool) => {
          const accent = categoryColors[tool.category] || categoryColors.pdf;
          return (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="trending-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.surface,
                  color: colors.textSecondary,
                  fontSize: "13.5px",
                  fontWeight: 500,
                  textDecoration: "none",
                  lineHeight: 1.2,
                }}
              >
                <span style={{ color: accent.text, display: "inline-flex" }}>
                  <ToolIcon name={tool.icon} size={15} aria-hidden="true" />
                </span>
                {tool.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
