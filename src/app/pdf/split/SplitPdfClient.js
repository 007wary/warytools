"use client";

import { useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// mode: "range" extracts pages [from, to] into one PDF.
// mode: "all" splits every page into its own PDF, bundled as a zip.
export default function SplitPdfClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [mode, setMode] = useState("range");
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [resultFilename, setResultFilename] = useState("");

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
      setFromPage(1);
      setToPage(count);
    } catch (err) {
      console.error(err);
      setError("Could not read this PDF. Make sure it's valid and unencrypted.");
      setFile(null);
    }
  }

  async function handleExtractRange() {
    setError("");
    setIsWorking(true);

    try {
      const from = Math.max(1, Math.min(fromPage, pageCount));
      const to = Math.max(1, Math.min(toPage, pageCount));
      if (from > to) {
        setError("The starting page must be before the ending page.");
        setIsWorking(false);
        return;
      }

      const { PDFDocument } = await import("pdf-lib");
      const bytes = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes);
      const newPdf = await PDFDocument.create();

      const indices = [];
      for (let i = from - 1; i <= to - 1; i++) indices.push(i);

      const copiedPages = await newPdf.copyPages(sourcePdf, indices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const outBytes = await newPdf.save();
      setResultBlob(new Blob([outBytes], { type: "application/pdf" }));
      setResultFilename(`pages-${from}-${to}.pdf`);
      trackEvent(events.TOOL_RUN, {
        mode: "range",
        page_count: to - from + 1,
        source_page_count: pageCount,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "split_range_failed" });
      setError("Something went wrong extracting those pages.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSplitAll() {
    setError("");
    setIsWorking(true);

    try {
      const [{ default: JSZip }, { PDFDocument }] = await Promise.all([
        import("jszip"),
        import("pdf-lib"),
      ]);
      const bytes = await file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes);
      const zip = new JSZip();

      for (let i = 0; i < pageCount; i++) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
        newPdf.addPage(copiedPage);
        const pageBytes = await newPdf.save();
        zip.file(`page-${i + 1}.pdf`, pageBytes);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      setResultBlob(zipBlob);
      setResultFilename("split-pages.zip");
      trackEvent(events.TOOL_RUN, { mode: "split_all", page_count: pageCount });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "split_all_failed" });
      setError("Something went wrong splitting this PDF.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPageCount(null);
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

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            <ModeButton active={mode === "range"} onClick={() => setMode("range")}>
              Extract a page range
            </ModeButton>
            <ModeButton active={mode === "all"} onClick={() => setMode("all")}>
              Split into individual pages
            </ModeButton>
          </div>

          {mode === "range" && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
              <label style={{ fontSize: "14px", color: colors.textSecondary }}>
                From page{" "}
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={fromPage}
                  onChange={(e) => setFromPage(Number(e.target.value))}
                  style={numberInputStyle}
                />
              </label>
              <label style={{ fontSize: "14px", color: colors.textSecondary }}>
                To page{" "}
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={toPage}
                  onChange={(e) => setToPage(Number(e.target.value))}
                  style={numberInputStyle}
                />
              </label>
            </div>
          )}

          {mode === "all" && (
            <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "20px" }}>
              Each of the {pageCount} pages will be saved as its own PDF, bundled into a zip.
            </p>
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={mode === "range" ? handleExtractRange : handleSplitAll}
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
              {isWorking ? "Working…" : mode === "range" ? "Extract Pages" : "Split PDF"}
            </button>

            {resultBlob && (
              <DownloadButton getBlob={() => resultBlob} filename={resultFilename}>
                Download {resultFilename}
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "8px",
        padding: "8px 14px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const numberInputStyle = {
  width: "70px",
  padding: "6px 8px",
  fontSize: "14px",
  border: `1px solid ${colors.borderInput}`,
  borderRadius: "6px",
  marginLeft: "4px",
};
