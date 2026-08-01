import { AlertTriangle } from "lucide-react";

// Amber inline warning used across tools for non-blocking caveats
// (e.g. "this format choice will make your file bigger").
export default function WarningBanner({ children }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        backgroundColor: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "20px",
      }}
    >
      <AlertTriangle size={16} style={{ color: "#b45309", flexShrink: 0, marginTop: "1px" }} />
      <p style={{ fontSize: "13px", color: "#92400e", lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  );
}
