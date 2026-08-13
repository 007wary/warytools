import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ToolIcon from "@/components/ToolIcon";
import { allTools, categories } from "@/lib/tools";
import { categoryColors, colors } from "@/lib/theme";

// An inline CTA linking a post to the tool it is about. Used inside MDX:
//
//   <ToolCallout slug="delete-pages" />
//
// It takes a *slug* and looks the rest up in the tool registry rather than
// accepting a title and href, so a post can never drift from the tool it
// points at. When a tool's copy changes in tools.js, every post citing it
// updates with no edit; when a tool is removed, the build fails here loudly
// instead of leaving a dead link in a published article.
export default function ToolCallout({ slug, label }) {
  const tool = allTools.find((entry) => entry.slug === slug);

  if (!tool) {
    // Deliberately a throw, not a null render. A silently-dropped CTA is the
    // one element of a guide the post exists to deliver — losing it invisibly
    // would leave a perfectly readable article that converts nobody, and no
    // test or build output would say so.
    throw new Error(
      `<ToolCallout slug="${slug}" /> does not match any tool in src/lib/tools.js`,
    );
  }

  const category = categories.find((entry) =>
    entry.tools.some((candidate) => candidate.slug === slug),
  );
  const accent = categoryColors[category?.slug] || categoryColors.pdf;

  return (
    <Link
      href={tool.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "16px 18px",
        margin: "28px 0",
        borderRadius: "12px",
        border: `1px solid ${accent.border}`,
        backgroundColor: accent.bg,
        textDecoration: "none",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "40px",
          borderRadius: "10px",
          backgroundColor: colors.surface,
          color: accent.text,
          flexShrink: 0,
        }}
      >
        <ToolIcon name={tool.icon} size={20} />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "15.5px",
            fontWeight: 600,
            color: colors.text,
            marginBottom: "2px",
          }}
        >
          {label || tool.title}
        </span>
        <span style={{ display: "block", fontSize: "13.5px", color: colors.textMuted, lineHeight: 1.5 }}>
          {tool.description}
        </span>
      </span>

      <ArrowRight size={18} style={{ color: accent.text, flexShrink: 0 }} aria-hidden="true" />
    </Link>
  );
}
