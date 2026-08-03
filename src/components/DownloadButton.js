"use client";

import { Download } from "lucide-react";
import { colors } from "@/lib/theme";
import { events, sizeBucket, trackEvent } from "@/lib/analytics";

// Triggers a browser download for a Blob/File, entirely client-side.
// Usage: <DownloadButton getBlob={() => myBlob} filename="result.pdf" />
export default function DownloadButton({ getBlob, filename, children, disabled }) {
  function handleClick() {
    const blob = getBlob();
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
