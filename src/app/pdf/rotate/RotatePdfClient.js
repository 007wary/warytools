"use client";

import { useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import { colors } from "@/lib/theme";

// rotations[i] is the extra rotation (0/90/180/270) to apply to page i,
// on top of whatever rotation the page already has.
export default function RotatePdfClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [rotations, setRotations] = useState([]);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  async function handleFiles(fileList) {
    const selected = fileList[0];
    if (!selected || selected.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }

    setError("");
    setResultBlob(null);
    setFile(selected);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const bytes = await selected.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const count = pdf.getPageCount();
      setPageCount(count);
      setRotations(new Array(count).fill(0));
    } catch (err) {
      console.error(err);
      setError("Could not read this PDF. Make sure it's valid and unencrypted.");
      setFile(null);
    }
  }

  function rotatePage(index, delta) {
    setResultBlob(null);
    setRotations((prev) => {
      const next = [...prev];
      next[index] = (next[index] + delta + 360) % 360;
      return next;
    });
  }

  function rotateAll(delta) {
    setResultBlob(null);
    setRotations((prev) => prev.map((r) => (r + delta + 360) % 360));
  }

  async function handleApply() {
    setError("");
    setIsWorking(true);

    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const pages = pdf.getPages();

      pages.forEach((page, index) => {
        const extra = rotations[index] || 0;
        if (extra === 0) return;
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + extra) % 360));
      });

      const outBytes = await pdf.save();
      setResultBlob(new Blob([outBytes], { type: "application/pdf" }));
    } catch (err) {
      console.error(err);
      setError("Could not rotate this PDF.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPageCount(null);
    setRotations([]);
    setResultBlob(null);
    setError("");
  }

  const hasChanges = rotations.some((r) => r !== 0);

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

      {file && pageCount && (
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
              marginBottom: "20px",
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
              {file.name} · {pageCount} page{pageCount === 1 ? "" : "s"}
            </span>
            <button
              onClick={handleReset}
              style={{
                background: "none",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "13px",
                color: colors.textSecondary,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Choose another file
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button onClick={() => rotateAll(-90)} style={secondaryButtonStyle}>
              <RotateCcw size={15} /> Rotate all left
            </button>
            <button onClick={() => rotateAll(90)} style={secondaryButtonStyle}>
              <RotateCw size={15} /> Rotate all right
            </button>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px" }}>
            {rotations.map((rotation, index) => (
              <li
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  padding: "10px 12px",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "14px", color: colors.textSecondary, flex: 1, minWidth: 0 }}>
                  Page {index + 1}
                </span>
                <span style={{ fontSize: "13px", color: colors.textFaint, width: "50px", flexShrink: 0 }}>
                  {rotation}°
                </span>
                <button
                  onClick={() => rotatePage(index, -90)}
                  style={iconButtonStyle}
                  aria-label={`Rotate page ${index + 1} left`}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => rotatePage(index, 90)}
                  style={iconButtonStyle}
                  aria-label={`Rotate page ${index + 1} right`}
                >
                  <RotateCw size={14} />
                </button>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={handleApply}
              disabled={!hasChanges || isWorking}
              style={{
                backgroundColor: !hasChanges || isWorking ? colors.primaryDisabled : colors.primary,
                color: colors.primaryContrast,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: !hasChanges || isWorking ? "not-allowed" : "pointer",
              }}
            >
              {isWorking ? "Applying…" : "Apply Rotation"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename="rotated.pdf">
                Download rotated.pdf
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const iconButtonStyle = {
  background: "none",
  border: `1px solid ${colors.border}`,
  borderRadius: "7px",
  width: "38px",
  height: "38px",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: colors.textSecondary,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.textSecondary,
  borderRadius: "8px",
  padding: "8px 14px",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};
