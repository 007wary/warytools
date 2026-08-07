"use client";

import { useEffect, useMemo } from "react";
import { X, ArrowRight } from "lucide-react";
import { colors } from "@/lib/theme";
import { formatBytes } from "@/lib/formatBytes";
import { iconButtonStyle } from "@/components/ToolButton";

// The file list shared by every image tool once they became multi-file.
//
// Shows each queued image with a thumbnail, and — once processed — its
// before/after size side by side. That comparison is the point: the old tools
// reported a single percentage after the fact, which tells you nothing about
// whether quality 0.6 was acceptable for *this* image.
export default function ImageQueue({ items, results, onRemove, disabled }) {
  if (items.length === 0) return null;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
      {items.map((item) => (
        <QueueRow
          key={item.id}
          item={item}
          result={results?.get(item.id)}
          onRemove={onRemove}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}

function QueueRow({ item, result, onRemove, disabled }) {
  // Derived rather than held in state: the URL is a pure function of the
  // file, so an effect would only add a render pass with no thumbnail.
  const thumbnail = useMemo(() => URL.createObjectURL(item.file), [item.file]);

  // Revoked when the row unmounts or the file changes. The old tools revoked
  // only on explicit reset, so churning through files left every preview blob
  // alive for the tab's lifetime.
  useEffect(() => () => URL.revokeObjectURL(thumbnail), [thumbnail]);

  const savedPercent =
    result && item.file.size > 0
      ? Math.round((1 - result.bytes.byteLength / item.file.size) * 100)
      : null;

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        border: `1px solid ${result ? colors.successSoftBorder : colors.border}`,
        backgroundColor: result ? colors.successSoft : colors.surface,
        borderRadius: "10px",
        padding: "10px 12px",
        marginBottom: "8px",
      }}
    >
      <span
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "8px",
          overflow: "hidden",
          flexShrink: 0,
          backgroundColor: colors.surfaceMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: "14px",
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.file.name}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: colors.textMuted,
            flexWrap: "wrap",
          }}
        >
          {formatBytes(item.file.size)}
          {result && (
            <>
              <ArrowRight size={12} aria-hidden="true" />
              {formatBytes(result.bytes.byteLength)}
              <span
                style={{
                  color: savedPercent > 0 ? colors.success : colors.textMuted,
                  fontWeight: savedPercent > 0 ? 600 : 400,
                }}
              >
                {savedPercent > 0
                  ? `${savedPercent}% smaller`
                  : savedPercent < 0
                    ? `${Math.abs(savedPercent)}% larger`
                    : "no change"}
              </span>
              <span style={{ color: colors.textFaint }}>
                · {result.width}×{result.height}
              </span>
            </>
          )}
        </span>
      </span>

      <button
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        style={iconButtonStyle(disabled, colors.danger)}
        aria-label={`Remove ${item.file.name}`}
      >
        <X size={14} />
      </button>
    </li>
  );
}

/**
 * Aggregate before/after for a finished batch.
 *
 * A per-file breakdown is useful, but the number people actually want from a
 * batch is the total — "I saved 14 MB across 20 photos".
 */
export function BatchSummary({ items, results }) {
  const summary = useMemo(() => {
    if (!results || results.size === 0) return null;

    let before = 0;
    let after = 0;
    items.forEach((item) => {
      const result = results.get(item.id);
      if (!result) return;
      before += item.file.size;
      after += result.bytes.byteLength;
    });

    if (before === 0) return null;
    return { before, after, percent: Math.round((1 - after / before) * 100), count: results.size };
  }, [items, results]);

  if (!summary) return null;

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "12px 14px",
        borderRadius: "10px",
        border: `1px solid ${summary.percent > 0 ? colors.successSoftBorder : colors.border}`,
        backgroundColor: summary.percent > 0 ? colors.successSoft : colors.surfaceMuted,
        fontSize: "14px",
        color: colors.textSecondary,
      }}
    >
      {summary.count} image{summary.count === 1 ? "" : "s"} processed ·{" "}
      {formatBytes(summary.before)} → {formatBytes(summary.after)}
      {summary.percent > 0 && (
        <span style={{ color: colors.success, fontWeight: 600 }}> ({summary.percent}% smaller)</span>
      )}
      {summary.percent < 0 && (
        <span style={{ color: colors.textMuted }}>
          {" "}
          ({Math.abs(summary.percent)}% larger — try a lossy format or lower quality)
        </span>
      )}
    </div>
  );
}
