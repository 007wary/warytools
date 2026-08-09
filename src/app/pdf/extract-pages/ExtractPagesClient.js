"use client";

import { useCallback, useRef, useState } from "react";
import { FileOutput, RotateCcw, CheckCheck } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import PdfPageSelector from "@/components/PdfPageSelector";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops, isCancellation } from "@/lib/pdfWorkerClient";
import {
  applyPageClick,
  validateExtraction,
  normalizeSelection,
  parseSelectionText,
  describeSelection,
  outputFilename,
} from "@/lib/pdfPageSelection";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// Extract Pages: pick the pages you want, get back a PDF of just those.
//
// The mirror of Delete Pages, sharing its selector and its selection module.
// Two things differ, and both come from what an extraction means:
//
//   1. Order matters. "Give me pages 5, 1, 9" is a real request, and the text
//      box honours it — so the parsed ARRAY is what exports, not the Set. The
//      Set only drives which thumbnails look selected, since a Set can't carry
//      order at all.
//   2. There's a second output shape. Pulling out 12 pages sometimes means one
//      12-page PDF and sometimes means 12 one-page PDFs, and guessing wrong
//      wastes the whole run — so it's an explicit choice rather than a default.
export default function ExtractPagesClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [rangeText, setRangeText] = useState("");
  // The selection in the order the user asked for, when they typed it. Null
  // when the selection came from clicking the grid, where there is no
  // meaningful order to preserve and ascending is the only sane reading.
  const [orderedPages, setOrderedPages] = useState(null);
  const [mode, setMode] = useState("single");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [result, setResult] = useState(null);
  const [isZipping, setIsZipping] = useState(false);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setSelected(new Set());
    setRangeText("");
    setOrderedPages(null);
    setResult(null);
    setError("");
    setWarning("");
    bytesRef.current = null;
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setWarning("");
    setResult(null);

    const check = await validatePdfFile(fileList[0]);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    if (check.isLarge) {
      setWarning(
        `This is a large PDF (${Math.round(check.file.size / (1024 * 1024))} MB). Page previews render as you scroll, so give it a moment.`
      );
    }

    try {
      const buffer = await check.file.arrayBuffer();
      bytesRef.current = buffer;
      setSelected(new Set());
      setRangeText("");
      setOrderedPages(null);
      setFile(check.file);
      setBytes(buffer);
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "extract_pages_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  const handleToggle = useCallback(
    (pageNumber, modifiers) => {
      setResult(null);
      setError("");
      // Clicking abandons any typed ordering. A grid click can't express "put
      // page 5 first", so silently keeping a stale order from an earlier typed
      // range would export pages in an order the grid never showed.
      setOrderedPages(null);
      setSelected((prev) => {
        const next = applyPageClick(prev, pageNumber, modifiers, pageCount);
        setRangeText(describeSelection(next, pageCount));
        return next;
      });
    },
    [pageCount]
  );

  function handleRangeChange(value) {
    setRangeText(value);
    setResult(null);
    setError("");

    if (value.trim() === "") {
      setSelected(new Set());
      setOrderedPages(null);
      return;
    }

    const parsed = parseSelectionText(value, pageCount);
    // Only successful parses are applied, so a half-typed "1-" doesn't clear
    // the grid or scold the user mid-word. validateExtraction gates the export.
    if (parsed.ok) {
      setSelected(parsed.set);
      setOrderedPages(parsed.pages);
    }
  }

  // What actually exports: the typed order when there is one, otherwise the
  // selection in page order.
  function exportPages() {
    return orderedPages ?? normalizeSelection([...selected], pageCount);
  }

  async function handleExtract() {
    const check = validateExtraction(exportPages(), pageCount);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setError("");
    setResult(null);

    try {
      if (mode === "single") {
        // EXTRACT_RANGE takes 1-based page numbers and converts to indices
        // itself — see toPageIndices in pdfPageSelection.js on why converting
        // here too would be a silent off-by-one.
        const extracted = await run(
          ops.EXTRACT_RANGE,
          { bytes: bytesRef.current.slice(0), pages: check.pages },
          { transfer: [] }
        );

        setResult({
          blob: new Blob([extracted.bytes], { type: "application/pdf" }),
          filename: outputFilename(file?.name, "extracted"),
          count: check.pages.length,
        });
        trackEvent(events.TOOL_RUN, {
          mode: "single",
          page_count: check.pages.length,
          source_page_count: pageCount,
        });
        return;
      }

      // Separate files. Each page is extracted on its own rather than using
      // SPLIT_ALL, which would split the whole document — the user asked for
      // four pages, not for all two hundred.
      const documents = [];
      for (const page of check.pages) {
        const extracted = await run(
          ops.EXTRACT_RANGE,
          { bytes: bytesRef.current.slice(0), pages: [page] },
          { transfer: [] }
        );
        documents.push({ name: `page-${page}.pdf`, bytes: extracted.bytes });
      }

      // Zipping stays on the main thread: JSZip's generateAsync already yields
      // between chunks, so it doesn't block, and it keeps a second heavy
      // dependency out of the worker bundle. Same call as Split PDF makes.
      setIsZipping(true);
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      documents.forEach((doc) => zip.file(doc.name, doc.bytes));
      const zipBlob = await zip.generateAsync({ type: "blob" });

      setResult({
        blob: zipBlob,
        filename: outputFilename(file?.name, "extracted").replace(/\.pdf$/i, ".zip"),
        count: documents.length,
      });
      trackEvent(events.TOOL_RUN, {
        mode: "separate",
        page_count: documents.length,
        source_page_count: pageCount,
      });
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "extract_pages_failed" });
      setError(describePdfError(err, "Something went wrong extracting those pages."));
    } finally {
      setIsZipping(false);
    }
  }

  function selectAll() {
    const all = new Set(Array.from({ length: pageCount }, (_, i) => i + 1));
    setSelected(all);
    setRangeText(describeSelection(all, pageCount));
    setOrderedPages(null);
    setResult(null);
    setError("");
  }

  function clearSelection() {
    setSelected(new Set());
    setRangeText("");
    setOrderedPages(null);
    setResult(null);
    setError("");
  }

  const selectedCount = selected.size;
  const busy = isRunning || isZipping;
  // Only worth telling the user about when it differs from page order — the
  // common case is ascending, and announcing "in the order 1, 2, 3" is noise.
  const isCustomOrder =
    orderedPages !== null &&
    orderedPages.join(",") !== normalizeSelection(orderedPages, pageCount).join(",");

  return (
    <div>
      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept="application/pdf,.pdf"
          label="Drag & drop a PDF here, or click to browse"
        />
      )}

      <ErrorBanner>{error || renderError}</ErrorBanner>

      {warning && (
        <p role="status" style={{ fontSize: "13px", color: colors.warningText, marginTop: "12px" }}>
          {warning}
        </p>
      )}

      {file && !isReady && !renderError && (
        <p style={{ fontSize: "14px", color: colors.textMuted, marginTop: "16px" }}>Opening PDF…</p>
      )}

      {file && isReady && pageCount > 0 && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={busy}
          />

          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="extract-range"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Pages to extract
            </label>
            <input
              id="extract-range"
              type="text"
              inputMode="numeric"
              value={rangeText}
              onChange={(e) => handleRangeChange(e.target.value)}
              placeholder="e.g. 1-3, 7, 12-15"
              aria-describedby="extract-range-help"
              style={{
                width: "100%",
                maxWidth: "360px",
                padding: "9px 12px",
                fontSize: "14px",
                border: `1px solid ${colors.borderInput}`,
                borderRadius: "8px",
                backgroundColor: colors.surface,
                color: colors.text,
              }}
            />
            <p
              id="extract-range-help"
              style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}
            >
              Type page numbers, or click the pages below. Hold Shift to select a run. Typing them
              out of order (5, 1, 9) keeps that order in the result.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <ModeButton active={mode === "single"} onClick={() => setMode("single")}>
              One PDF
            </ModeButton>
            <ModeButton active={mode === "separate"} onClick={() => setMode("separate")}>
              Separate file per page
            </ModeButton>
          </div>

          <p
            aria-live="polite"
            style={{
              fontSize: "14px",
              color: selectedCount > 0 ? colors.primary : colors.textMuted,
              margin: "0 0 16px",
              fontWeight: selectedCount > 0 ? 500 : 400,
            }}
          >
            {selectedCount === 0
              ? "No pages selected yet."
              : mode === "single"
                ? `Extracting ${selectedCount} page${selectedCount === 1 ? "" : "s"} into one PDF${
                    isCustomOrder ? `, in the order ${orderedPages.join(", ")}` : ""
                  }.`
                : `Extracting ${selectedCount} page${selectedCount === 1 ? "" : "s"} as ${selectedCount} separate file${selectedCount === 1 ? "" : "s"}, zipped.`}
          </p>

          <PdfPageSelector
            pageCount={pageCount}
            selected={selected}
            onToggle={handleToggle}
            getThumbnail={getThumbnail}
            tone="primary"
            selectedLabel="extract"
            disabled={busy}
          />

          {busy && (
            <ProgressBar
              progress={progress}
              indeterminate
              label={isZipping ? "Building zip file…" : "Extracting pages…"}
            />
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleExtract} disabled={busy || selectedCount === 0}>
              <FileOutput size={16} />
              {busy ? "Extracting…" : "Extract selected pages"}
            </PrimaryButton>

            {selectedCount < pageCount && !busy && (
              <SecondaryButton onClick={selectAll}>
                <CheckCheck size={15} /> Select all
              </SecondaryButton>
            )}

            {selectedCount > 0 && !busy && (
              <SecondaryButton onClick={clearSelection}>
                <RotateCcw size={15} /> Clear selection
              </SecondaryButton>
            )}

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {result && !busy && (
              <DownloadButton getBlob={() => result.blob} filename={result.filename}>
                Download {result.filename}
              </DownloadButton>
            )}
          </div>

          {result && !busy && (
            <p role="status" style={{ fontSize: "13px", color: colors.textMuted, marginTop: "12px" }}>
              Extracted {result.count} page{result.count === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "8px",
        padding: "9px 14px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
