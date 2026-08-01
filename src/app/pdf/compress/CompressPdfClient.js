"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CompressPdfClient() {
  const [file, setFile] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  function handleFiles(fileList) {
    const selected = fileList[0];
    if (!selected || selected.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }

    setError("");
    setResultBlob(null);
    setFile(selected);
    setOriginalSize(selected.size);
  }

  async function handleCompress() {
    setError("");
    setIsWorking(true);

    try {
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);

      // pdf-lib can't recompress embedded images, but saving with object
      // streams removes redundant objects and compresses the PDF's internal
      // structure — this mainly helps text/vector-heavy PDFs.
      const outBytes = await pdf.save({ useObjectStreams: true });
      setResultBlob(new Blob([outBytes], { type: "application/pdf" }));
    } catch (err) {
      console.error(err);
      setError("Could not compress this PDF. Make sure it's valid and unencrypted.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleReset() {
    setFile(null);
    setOriginalSize(0);
    setResultBlob(null);
    setError("");
  }

  const savedPercent =
    resultBlob && originalSize > 0
      ? Math.max(0, Math.round((1 - resultBlob.size / originalSize) * 100))
      : null;

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
        <p style={{ color: "#dc2626", fontSize: "14px", marginTop: "12px" }}>{error}</p>
      )}

      {file && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: "#374151",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name} · {formatBytes(originalSize)}
            </span>
            <button
              onClick={handleReset}
              style={{
                background: "none",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "13px",
                color: "#374151",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Choose another file
            </button>
          </div>

          <p style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "20px" }}>
            Note: this compresses the PDF&apos;s internal structure (removes redundant data).
            It works best on text/vector-heavy PDFs — scanned or image-heavy PDFs will shrink
            much less, since re-encoding embedded images isn&apos;t possible fully in-browser yet.
          </p>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleCompress}
              disabled={isWorking}
              style={{
                backgroundColor: isWorking ? "#93c5fd" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isWorking ? "not-allowed" : "pointer",
              }}
            >
              {isWorking ? "Compressing…" : "Compress PDF"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename="compressed.pdf">
                Download compressed.pdf
              </DownloadButton>
            )}
          </div>

          {resultBlob && (
            <p style={{ fontSize: "14px", color: "#374151", marginTop: "16px" }}>
              {formatBytes(originalSize)} → {formatBytes(resultBlob.size)}
              {savedPercent !== null && savedPercent > 0 && (
                <span style={{ color: "#16a34a", fontWeight: 600 }}> ({savedPercent}% smaller)</span>
              )}
              {savedPercent === 0 && (
                <span style={{ color: "#6b7280" }}> (already well optimized)</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
