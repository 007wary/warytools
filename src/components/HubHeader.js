import ToolIcon from "./ToolIcon";
import { categoryColors, colors } from "@/lib/theme";

// Shared header for hub pages (/pdf, /image, /calculators): a colored
// icon badge, title, and description, consistent with the category's
// accent color used on its tool cards.
export default function HubHeader({ categorySlug, icon, title, description }) {
  const accent = categoryColors[categorySlug];

  return (
    <div style={{ marginBottom: "36px" }}>
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          backgroundColor: accent.bg,
          color: accent.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
        }}
      >
        <ToolIcon name={icon} size={24} />
      </div>
      <h1
        style={{
          fontSize: "clamp(24px, 4vw, 32px)",
          fontWeight: 700,
          color: colors.text,
          marginBottom: "10px",
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, maxWidth: "620px" }}>{description}</p>
    </div>
  );
}
