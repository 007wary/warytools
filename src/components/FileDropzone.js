"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { colors } from "@/lib/theme";

// Drag-and-drop + click-to-browse file picker used across PDF/Image tools.
// Calls onFiles(FileList) whenever files are dropped or selected.
export default function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  label = "Drag & drop a file here, or click to browse",
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList) {
    if (fileList && fileList.length > 0) {
      onFiles(fileList);
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      style={{
        border: `2px dashed ${isDragging ? colors.primary : colors.borderInput}`,
        borderRadius: "14px",
        padding: "40px 20px",
        textAlign: "center",
        cursor: "pointer",
        backgroundColor: isDragging ? colors.primarySoft : colors.surfaceMuted,
        transition: "border-color 0.15s ease, background-color 0.15s ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: "none" }}
      />
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          backgroundColor: colors.primarySoft,
          color: colors.primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <UploadCloud size={24} strokeWidth={1.75} />
      </div>
      <div style={{ fontSize: "14px", color: colors.textSecondary }}>{label}</div>
    </div>
  );
}
