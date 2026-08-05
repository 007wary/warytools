"use client";

import { colors } from "@/lib/theme";
import { formatProgress } from "@/lib/pdfWorkerProtocol";

// Determinate progress for multi-page/multi-file work.
//
// The old tools showed a static "Working…" label for operations that could
// run for thirty seconds. With no evidence of forward motion, a user can't
// tell a slow job from a hung one, and the reasonable response to a hung job
// is to close the tab — losing work that was about to finish. Real counts fix
// that, and they're free: the worker already walks page by page.
export default function ProgressBar({ progress, indeterminate = false, label }) {
  const percent = indeterminate ? null : Math.round((progress?.ratio || 0) * 100);
  const text = label || formatProgress(progress) || "Working…";

  return (
    <div style={{ marginTop: "16px" }} aria-live="polite">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          fontSize: "13px",
          color: colors.textSecondary,
          marginBottom: "6px",
        }}
      >
        <span>{text}</span>
        {percent !== null && <span style={{ color: colors.textMuted }}>{percent}%</span>}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        // Omitted while indeterminate: an aria-valuenow of 0 on a job that is
        // running announces "0 percent" and reads as stalled to a screen
        // reader user. Absent valuenow is the spec's way to say "unknown".
        aria-valuenow={percent === null ? undefined : percent}
        aria-label={text}
        style={{
          height: "6px",
          borderRadius: "999px",
          backgroundColor: colors.surfaceMuted,
          border: `1px solid ${colors.borderMuted}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: indeterminate ? "35%" : `${percent}%`,
            borderRadius: "999px",
            backgroundColor: colors.primary,
            transition: indeterminate ? "none" : "width 0.2s ease",
            animation: indeterminate ? "wt-indeterminate 1.1s ease-in-out infinite" : "none",
          }}
        />
      </div>
    </div>
  );
}
