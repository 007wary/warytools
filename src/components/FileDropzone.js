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
  const [isFocused, setIsFocused] = useState(false);

  function handleFiles(fileList) {
    if (fileList && fileList.length > 0) {
      onFiles(fileList);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
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
        transition: "border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease",
        boxShadow: isFocused ? `0 0 0 3px ${colors.primarySoft}, 0 0 0 1px ${colors.primary}` : "none",
        outline: "none",
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
