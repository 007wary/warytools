"use client";

import { FileText } from "lucide-react";
import { colors } from "@/lib/theme";
import { formatBytes } from "@/lib/formatBytes";

// The "here's your loaded file, pick a different one" bar. Four PDF tools had
// their own near-identical copy of this markup, which is how they drifted:
// some showed the size, some the page count, none showed both, and the reset
// button's styling was re-declared each time. One component, one behaviour.
export default function PdfFileHeader({ file, pageCount, onReset, disabled }) {
  if (!file) return null;

  const details = [
    formatBytes(file.size),
    typeof pageCount === "number" ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        border: `1px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "20px",
        backgroundColor: colors.surface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
        <span
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "8px",
            backgroundColor: colors.primarySoft,
            color: colors.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <FileText size={17} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              color: colors.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
          </span>
          <span style={{ display: "block", fontSize: "13px", color: colors.textMuted }}>
            {details}
          </span>
        </span>
      </div>

      <button
        onClick={onReset}
        disabled={disabled}
        style={{
          background: "none",
          border: `1px solid ${colors.border}`,
          borderRadius: "8px",
          padding: "7px 12px",
          fontSize: "13px",
          color: disabled ? colors.textFaint : colors.textSecondary,
          cursor: disabled ? "not-allowed" : "pointer",
          flexShrink: 0,
        }}
      >
        Choose another file
      </button>
    </div>
  );
}
