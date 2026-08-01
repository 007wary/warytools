import { AlertTriangle } from "lucide-react";
import { colors } from "@/lib/theme";

// Amber inline warning used across tools for non-blocking caveats
// (e.g. "this format choice will make your file bigger").
export default function WarningBanner({ children }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        backgroundColor: colors.warningSoft,
        border: `1px solid ${colors.warningSoftBorder}`,
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "20px",
      }}
    >
      <AlertTriangle size={16} style={{ color: colors.warningIcon, flexShrink: 0, marginTop: "1px" }} />
      <p style={{ fontSize: "13px", color: colors.warningText, lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  );
}
