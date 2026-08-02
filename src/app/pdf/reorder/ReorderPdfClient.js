"use client";

import { useState } from "react";
import { X } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import { colors } from "@/lib/theme";

// Each page is { id, originalIndex, thumbnail } — id is stable across
// reorders/deletes, originalIndex maps back to the source PDF for export.
let nextId = 0;

export default function ReorderPdfClient() {
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [isLoadingThumbs, setIsLoadingThumbs] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  async function handleFiles(fileList) {
    const selected = fileList[0];
    if (!selected || selected.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }

    setError("");
    setResultBlob(null);
    setFile(selected);
    setIsLoadingThumbs(true);

    try {
      const pdfjsLib = (await import("@/lib/pdfjs")).default;
      const bytes = await selected.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const newPages = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        newPages.push({
          id: nextId++,
          originalIndex: i - 1,
          thumbnail: canvas.toDataURL("image/png"),
        });
      }

      setPages(newPages);
    } catch (err) {
      console.error(err);
      setError("Could not read this PDF. Make sure it's valid and unencrypted.");
      setFile(null);
    } finally {
      setIsLoadingThumbs(false);
    }
  }

  function removePage(id) {
    setResultBlob(null);
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  function handleDragStart(index) {
    setDragIndex(index);
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
    setResultBlob(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  async function handleApply() {
    if (pages.length === 0) {
      setError("At least one page must remain.");
      return;
    }

    setError("");
    setIsWorking(true);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes);
      const newPdf = await PDFDocument.create();

      const indices = pages.map((p) => p.originalIndex);
      const copiedPages = await newPdf.copyPages(sourcePdf, indices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const outBytes = await newPdf.save();
      setResultBlob(new Blob([outBytes], { type: "application/pdf" }));
    } catch (err) {
      console.error(err);
      setError("Could not save the reordered PDF.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPages([]);
    setResultBlob(null);
    setError("");
  }

  return (
    <div>
      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept="application/pdf"
          label="Drag & drop a PDF here, or click to browse"
        />
      )}

      {error && (
        <p style={{ color: colors.danger, fontSize: "14px", marginTop: "12px" }}>{error}</p>
      )}

      {isLoadingThumbs && (
        <p style={{ fontSize: "14px", color: colors.textMuted, marginTop: "12px" }}>
          Loading pages…
        </p>
      )}

      {file && pages.length > 0 && !isLoadingThumbs && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              padding: "10px 12px",
              margin: "20px 0",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: colors.textSecondary,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name} · {pages.length} page{pages.length === 1 ? "" : "s"}
            </span>
            <button onClick={handleReset} style={{ ...smallButtonStyle, flexShrink: 0 }}>
              Choose another file
            </button>
          </div>

          <p style={{ fontSize: "13px", color: colors.textFaint, marginBottom: "16px" }}>
            Drag pages to reorder them, or click the remove button to delete a page.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            {pages.map((page, index) => (
              <div
                key={page.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                style={{
                  position: "relative",
                  border: `1px solid ${dragIndex === index ? colors.primary : colors.border}`,
                  borderRadius: "8px",
                  padding: "6px",
                  cursor: "grab",
                  backgroundColor: colors.surface,
                }}
              >
                <button
                  onClick={() => removePage(page.id)}
                  aria-label={`Delete page ${index + 1}`}
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: colors.surface,
                    color: colors.danger,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "var(--shadow-float)",
                  }}
                >
                  <X size={13} />
                </button>
                <img
                  src={page.thumbnail}
                  alt={`Page ${index + 1}`}
                  style={{ width: "100%", borderRadius: "4px", display: "block" }}
                />
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "12px",
                    color: colors.textMuted,
                    marginTop: "6px",
                  }}
                >
                  Page {index + 1}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={handleApply}
              disabled={isWorking}
              style={{
                backgroundColor: isWorking ? colors.primaryDisabled : colors.primary,
                color: colors.primaryContrast,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isWorking ? "not-allowed" : "pointer",
              }}
            >
              {isWorking ? "Saving…" : "Save PDF"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename="reordered.pdf">
                Download reordered.pdf
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const smallButtonStyle = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "13px",
  color: colors.textSecondary,
  cursor: "pointer",
};
