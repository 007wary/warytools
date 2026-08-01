import Link from "next/link";
import ToolIcon from "./ToolIcon";
import { categoryColors } from "@/lib/theme";

// A single tool card used on the homepage and hub pages.
export default function ToolCard({ title, description, href, icon, category }) {
  const accent = categoryColors[category] || categoryColors.pdf;

  return (
    <Link
      href={href}
      className="tool-card group"
      style={{
        display: "block",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "20px",
        textDecoration: "none",
        color: "inherit",
        backgroundColor: "#fff",
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
      <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px", color: "#111827" }}>
        {title}
      </div>
      <div style={{ fontSize: "13.5px", color: "#6b7280", lineHeight: 1.5 }}>{description}</div>
    </Link>
  );
}
