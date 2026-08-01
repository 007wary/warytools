"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import { colors } from "@/lib/theme";

// Each item in the list is { id, file } — id lets us reorder/remove
// reliably even if two files share the same name.
let nextId = 0;

export default function MergePdfClient() {
  const [items, setItems] = useState([]);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState("");
  const [mergedBlob, setMergedBlob] = useState(null);

  function handleFiles(fileList) {
    const newItems = Array.from(fileList)
      .filter((file) => file.type === "application/pdf")
      .map((file) => ({ id: nextId++, file }));

    if (newItems.length === 0) {
      setError("Please choose PDF files only.");
      return;
    }

    setError("");
    setMergedBlob(null);
    setItems((prev) => [...prev, ...newItems]);
  }

  function removeItem(id) {
    setMergedBlob(null);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function moveItem(index, direction) {
    setMergedBlob(null);
    setItems((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  async function handleMerge() {
    if (items.length < 2) {
      setError("Add at least two PDF files to merge.");
      return;
    }

    setError("");
    setIsMerging(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of items) {
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes);
        const copiedPages = await mergedPdf.copyPages(
          sourcePdf,
          sourcePdf.getPageIndices()
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      setMergedBlob(new Blob([mergedBytes], { type: "application/pdf" }));
    } catch (err) {
      setError("Could not merge these PDFs. Make sure each file is a valid, unencrypted PDF.");
      console.error(err);
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div>
      <FileDropzone
        onFiles={handleFiles}
        accept="application/pdf"
        multiple
        label="Drag & drop PDF files here, or click to browse"
      />

      {error && (
        <p style={{ color: colors.danger, fontSize: "14px", marginTop: "12px" }}>{error}</p>
      )}

      {items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
          {items.map((item, index) => (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                padding: "10px 12px",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "13px", color: colors.textFaint, width: "20px", flexShrink: 0 }}>
                {index + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "14px",
                  color: colors.textSecondary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.file.name}
              </span>
              <button
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                style={iconButtonStyle(index === 0)}
                aria-label="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                style={iconButtonStyle(index === items.length - 1)}
                aria-label="Move down"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => removeItem(item.id)}
                style={iconButtonStyle(false, colors.danger)}
                aria-label="Remove"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
        <button
          onClick={handleMerge}
          disabled={items.length < 2 || isMerging}
          style={{
            backgroundColor: items.length < 2 || isMerging ? colors.primaryDisabled : colors.primary,
            color: colors.primaryContrast,
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: items.length < 2 || isMerging ? "not-allowed" : "pointer",
          }}
        >
          {isMerging ? "Merging…" : "Merge PDFs"}
        </button>

        {mergedBlob && (
          <DownloadButton getBlob={() => mergedBlob} filename="merged.pdf">
            Download merged.pdf
          </DownloadButton>
        )}
      </div>
    </div>
  );
}

function iconButtonStyle(disabled, color = colors.textSecondary) {
  return {
    background: "none",
    border: `1px solid ${colors.border}`,
    borderRadius: "7px",
    width: "28px",
    height: "28px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: disabled ? colors.borderInput : color,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
