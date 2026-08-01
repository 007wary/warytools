"use client";

import { Download } from "lucide-react";

// Triggers a browser download for a Blob/File, entirely client-side.
// Usage: <DownloadButton getBlob={() => myBlob} filename="result.pdf" />
export default function DownloadButton({ getBlob, filename, children, disabled }) {
  function handleClick() {
    const blob = getBlob();
    if (!blob) return;

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
        backgroundColor: disabled ? "#93c5fd" : "#16a34a",
        color: "#fff",
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
