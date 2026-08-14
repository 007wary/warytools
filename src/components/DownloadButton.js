"use client";

import { Download } from "lucide-react";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";
import { useDownloadSignal } from "@/components/PostDownloadPrompt";

// Triggers a browser download for a Blob/File, entirely client-side.
// Usage: <DownloadButton getBlob={() => myBlob} filename="result.pdf" />
//
// It also *signals* a completed download to the post-download newsletter
// prompt. The signal lives here rather than in each tool's client because
// this component is the single place on the site that knows a tool actually
// succeeded — 25 of the 33 tools route their output through it, and it
// already treats a download as the closest thing to a conversion (see the
// FILE_DOWNLOADED event below). The prompt itself renders elsewhere: every
// DownloadButton on this site sits inside a `display: flex` row of buttons,
// so a card rendered as its sibling would land *inside* that row. The signal
// goes up to <PostDownloadPrompt>, which the tool layout places after the
// whole panel.
export default function DownloadButton({ getBlob, filename, children, disabled }) {
  const signalDownload = useDownloadSignal();
  // `getBlob` may return a Blob or a Promise of one. Awaiting covers both, so
  // callers that build their output lazily (zipping a batch, which can take a
  // moment) work without every existing synchronous caller having to change.
  async function handleClick() {
    const blob = await getBlob();
    if (!blob) return;

    // A completed download is the closest thing this site has to a
    // conversion — it means the tool actually produced something usable.
    // Only the extension is sent, never the filename itself (user data).
    trackEvent(events.FILE_DOWNLOADED, {
      file_type: filename?.includes(".") ? filename.split(".").pop().toLowerCase() : "unknown",
      size_bucket: sizeBucket(blob.size),
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Signalled after the download is triggered, never before: a getBlob()
    // that throws or resolves null returns early above, so a failed run must
    // not count as a completion and must not raise the prompt.
    signalDownload();
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? colors.primaryDisabled : colors.success,
        color: colors.primaryContrast,
        border: "none",
        borderRadius: "8px",
        padding: "10px 20px",
        fontSize: "14px",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <Download size={16} />
      {children || "Download"}
    </button>
  );
}
