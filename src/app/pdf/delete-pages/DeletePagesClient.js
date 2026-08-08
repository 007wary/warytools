"use client";

import { useCallback, useRef, useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import PdfPageSelector from "@/components/PdfPageSelector";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import {
  applyPageClick,
  validateDeletion,
  parseSelectionText,
  describeSelection,
  outputFilename,
} from "@/lib/pdfPageSelection";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// Delete Pages: pick the pages to remove, get back everything else.
//
// There is no "delete" op in the PDF worker and there shouldn't be — removing
// page 4 and keeping pages 1,2,3,5,6 produce the same document, so this runs
// EXTRACT_RANGE over the complement of the selection (invertSelection) and
// needs no new worker code at all.
//
// The selection is a Set of 1-based page NUMBERS throughout, matching what the
// UI shows and what the user types. It becomes 0-based exactly once, in
// toPageIndices() at the worker call.
export default function DeletePagesClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  // The range box and the thumbnail grid are two views of one selection. This
  // holds the box's raw text — kept separate from `selected` so a half-typed
  // "1-" doesn't wipe the grid on its way to becoming "1-5".
  const [rangeText, setRangeText] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [result, setResult] = useState(null);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  // The worker takes ownership of a transferred buffer, so the document is
  // kept here and passed as a copy on every run — otherwise a second attempt
  // after adjusting the selection would find a detached, zero-length buffer.
  const bytesRef = useRef(null);

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setSelected(new Set());
    setRangeText("");
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
      setFile(check.file);
      // Drives the thumbnail hook, which owns cancellation of any previous
      // document's in-flight renders.
      setBytes(buffer);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "delete_pages_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  const handleToggle = useCallback(
    (pageNumber, modifiers) => {
      setResult(null);
      setError("");
      setSelected((prev) => {
        const next = applyPageClick(prev, pageNumber, modifiers, pageCount);
        // The text box follows the grid, so the two never disagree about what
        // is selected. Derived from the new Set rather than tracked
        // separately — a second source of truth here is how a grid and a box
        // drift apart.
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

    // An empty box means an empty selection, which is a valid intermediate
    // state rather than a parse error — clearing the field to start over
    // shouldn't show a complaint.
    if (value.trim() === "") {
      setSelected(new Set());
      return;
    }

    const parsed = parseSelectionText(value, pageCount);
    // A half-typed range ("1-") parses as an error on nearly every keystroke.
    // Applying only successful parses lets the grid update live without the
    // box scolding the user mid-word; validateDeletion below is what actually
    // gates the export.
    if (parsed.ok) setSelected(parsed.set);
  }

  async function handleDelete() {
    const check = validateDeletion([...selected], pageCount);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setError("");
    setResult(null);

    try {
      // EXTRACT_RANGE takes 1-based page numbers and does its own conversion
      // to indices, so check.keep goes across as-is. (toPageIndices exists for
      // ops that take raw indices — REORDER is the one in this pipeline — and
      // is deliberately not applied here; doing both conversions is the
      // off-by-one that returns a valid PDF with the wrong pages in it.)
      const extracted = await run(
        ops.EXTRACT_RANGE,
        { bytes: bytesRef.current.slice(0), pages: check.keep },
        { transfer: [] }
      );

      setResult({
        blob: new Blob([extracted.bytes], { type: "application/pdf" }),
        filename: outputFilename(file?.name, "pages-removed"),
        removedCount: check.removed.length,
        keptCount: check.keep.length,
      });
      trackEvent(events.TOOL_RUN, {
        removed_count: check.removed.length,
        source_page_count: pageCount,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "delete_pages_failed" });
      setError(describePdfError(err, "Something went wrong removing those pages."));
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setRangeText("");
    setResult(null);
    setError("");
  }

  const selectedCount = selected.size;
  const remaining = pageCount - selectedCount;

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
            disabled={isRunning}
          />

          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="delete-range"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Pages to delete
            </label>
            <input
              id="delete-range"
              type="text"
              inputMode="numeric"
              value={rangeText}
              onChange={(e) => handleRangeChange(e.target.value)}
              placeholder="e.g. 2, 5-7"
              aria-describedby="delete-range-help"
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
              id="delete-range-help"
              style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}
            >
              Type page numbers, or click the pages below. Hold Shift to select a run.
            </p>
          </div>

          {/* aria-live so the running count reaches a screen reader — a
              selection that only changes colours in a grid is invisible
              otherwise, and the count is the one thing you check before
              committing to a deletion. */}
          <p
            aria-live="polite"
            style={{
              fontSize: "14px",
              color: selectedCount > 0 ? colors.danger : colors.textMuted,
              margin: "0 0 16px",
              fontWeight: selectedCount > 0 ? 500 : 400,
            }}
          >
            {selectedCount === 0
              ? "No pages selected yet."
              : `Deleting ${selectedCount} page${selectedCount === 1 ? "" : "s"} — ${remaining} will remain.`}
          </p>

          <PdfPageSelector
            pageCount={pageCount}
            selected={selected}
            onToggle={handleToggle}
            getThumbnail={getThumbnail}
            tone="danger"
            selectedLabel="delete"
            disabled={isRunning}
          />

          {isRunning && <ProgressBar progress={progress} indeterminate label="Removing pages…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleDelete} disabled={isRunning || selectedCount === 0}>
              <Trash2 size={16} />
              {isRunning ? "Removing…" : "Delete selected pages"}
            </PrimaryButton>

            {selectedCount > 0 && !isRunning && (
              <SecondaryButton onClick={clearSelection}>
                <RotateCcw size={15} /> Clear selection
              </SecondaryButton>
            )}

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {result && !isRunning && (
              <DownloadButton getBlob={() => result.blob} filename={result.filename}>
                Download {result.filename}
              </DownloadButton>
            )}
          </div>

          {result && !isRunning && (
            <p role="status" style={{ fontSize: "13px", color: colors.textMuted, marginTop: "12px" }}>
              Removed {result.removedCount} page{result.removedCount === 1 ? "" : "s"}. The new PDF
              has {result.keptCount} page{result.keptCount === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
