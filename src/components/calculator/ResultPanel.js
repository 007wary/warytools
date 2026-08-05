"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { colors } from "@/lib/theme";
import { copyText } from "@/lib/copyText";
import { formatResultForCopy } from "@/lib/calculatorFormat";
import { events, trackEvent } from "@/lib/analytics";

// The shared result surface for every calculator.
//
// The accessibility problem this solves: these calculators recompute live as
// you type, so the answer simply *appears* in the DOM. A sighted user sees it
// change; a screen reader user gets nothing, because nothing moved focus and
// no region announced. Wrapping the result in an aria-live region — and using
// the semantically correct <output> element, which is literally "the result of
// a calculation" — makes the answer audible.
//
// aria-live is "polite" so it waits for a pause in typing rather than
// interrupting every keystroke.

export default function ResultPanel({ rows, headline, footnote, shareUrl }) {
  const [copied, setCopied] = useState(null);

  async function handleCopy(kind) {
    const text =
      kind === "link"
        ? shareUrl
        : formatResultForCopy([
            ...(headline ? [{ label: headline.label, value: headline.value }] : []),
            ...rows.map((row) => ({ label: row.label, value: row.value })),
          ]);

    try {
      await copyText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      trackEvent(events.LINK_COPIED, { kind });
    } catch {
      // A failed copy shouldn't destroy the result the user came for; the
      // values stay on screen and selectable.
      trackEvent(events.TOOL_ERROR, { reason: "copy_failed" });
    }
  }

  return (
    <output
      aria-live="polite"
      style={{
        display: "block",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
        borderRadius: "12px",
        padding: "20px",
      }}
    >
      {headline && (
        <div style={{ marginBottom: rows.length ? "16px" : 0 }}>
          <p
            style={{
              fontSize: "13px",
              color: colors.textMuted,
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {headline.label}
          </p>
          <p
            style={{
              fontSize: "26px",
              fontWeight: 700,
              color: colors.text,
              lineHeight: 1.25,
              wordBreak: "break-word",
            }}
          >
            {headline.value}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <dl style={{ margin: 0 }}>
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                padding: "7px 0",
                borderTop: `1px solid ${colors.borderMuted}`,
                fontSize: row.emphasis ? "16px" : "14px",
                fontWeight: row.emphasis ? 700 : 400,
                color: row.emphasis ? colors.text : colors.textSecondary,
              }}
            >
              <dt>{row.label}</dt>
              <dd style={{ margin: 0, wordBreak: "break-word", textAlign: "right" }}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footnote && (
        <p style={{ fontSize: "13px", color: colors.textMuted, marginTop: "12px", lineHeight: 1.5 }}>
          {footnote}
        </p>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
        <CopyButton
          onClick={() => handleCopy("result")}
          copied={copied === "result"}
          icon={Copy}
          label="Copy result"
        />
        {shareUrl && (
          <CopyButton
            onClick={() => handleCopy("link")}
            copied={copied === "link"}
            icon={Link2}
            label="Copy link"
          />
        )}
      </div>
    </output>
  );
}

function CopyButton({ onClick, copied, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        border: `1px solid ${copied ? colors.successSoftBorder : colors.border}`,
        backgroundColor: copied ? colors.successSoft : colors.surface,
        color: copied ? colors.success : colors.textSecondary,
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {copied ? <Check size={15} /> : <Icon size={15} />}
      {copied ? "Copied" : label}
    </button>
  );
}
