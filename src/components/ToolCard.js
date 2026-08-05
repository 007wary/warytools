import Link from "next/link";
import ToolIcon from "./ToolIcon";
import { categoryColors, colors } from "@/lib/theme";

// A single tool card used on the homepage and hub pages.
export default function ToolCard({
  title,
  description,
  href,
  icon,
  category,
  headingLevel = "h3",
  onClick,
}) {
  const Heading = headingLevel;
  const accent = categoryColors[category] || categoryColors.pdf;

  return (
    <Link
      href={href}
      onClick={onClick}
      className="tool-card group"
      style={{
        display: "block",
        border: `1px solid ${colors.border}`,
        borderRadius: "14px",
        padding: "20px",
        textDecoration: "none",
        color: "inherit",
        backgroundColor: colors.surface,
      }}
    >
      {icon && (
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            backgroundColor: accent.bg,
            color: accent.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "14px",
          }}
        >
          <ToolIcon name={icon} size={20} />
        </div>
      )}
      <Heading style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px", color: colors.text }}>
        {title}
      </Heading>
      <p style={{ fontSize: "13.5px", color: colors.textMuted, lineHeight: 1.5, margin: 0 }}>{description}</p>
    </Link>
  );
}
