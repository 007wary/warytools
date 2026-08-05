"use client";

import { AlertCircle } from "lucide-react";
import { colors } from "@/lib/theme";

// Errors were previously a bare red <p> with no role, so a screen reader user
// who triggered a validation failure got no announcement at all — the message
// simply appeared. role="alert" makes it interrupt and be read out, which is
// the whole point of an error.
export default function ErrorBanner({ children }) {
  if (!children) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        border: `1px solid ${colors.dangerSoftBorder}`,
        backgroundColor: colors.dangerSoft,
        color: colors.danger,
        borderRadius: "10px",
        padding: "12px 14px",
        fontSize: "14px",
        lineHeight: 1.5,
        marginTop: "16px",
      }}
    >
      <AlertCircle size={17} style={{ flexShrink: 0, marginTop: "1px" }} />
      <span>{children}</span>
    </div>
  );
}
