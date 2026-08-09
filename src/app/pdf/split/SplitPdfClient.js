"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Scissors } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { parsePageSelection, formatPageSelection } from "@/lib/pdfPageRange";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// mode: "select" pulls a chosen set of pages into one PDF.
// mode: "all" splits every page into its own PDF, bundled as a zip.
export default function SplitPdfClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [mode, setMode] = useState("select");
  // Held as raw text and validated on submit — see parsePageSelection. The
  // input's own attributes constrain nothing.
  const [selection, setSelection] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [result, setResult] = useState(null);
  const [isZipping, setIsZipping] = useState(false);

  const { run, cancel, progress, isRunning } = usePdfWorker();

  // The loaded document's bytes, read once. The old tool called
  // file.arrayBuffer() again for every operation, re-reading a 40 MB file
  // from disk each time the user adjusted a range and re-ran.
  const bytesRef = useRef(null);

  useEffect(() => {
    return () => {
      bytesRef.current = null;
    };
  }, []);

  const resetState = useCallback(() => {
    setFile(null);
    setPageCount(null);
    setResult(null);
    setError("");
    setWarning("");
    setSelection("");
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
        `This is a large PDF (${Math.round(check.file.size / (1024 * 1024))} MB). Processing runs on your device, so it may take a moment.`
      );
    }

    try {
      const bytes = await check.file.arrayBuffer();
      // The worker takes ownership of a transferred buffer, so keep a copy
      // for subsequent runs — otherwise the second operation on the same file
      // would find a detached, zero-length buffer.
      bytesRef.current = bytes;

      const info = await run(ops.INSPECT, { bytes: bytes.slice(0) }, { transfer: [] });

      setFile(check.file);
      setPageCount(info.pageCount);
      setSelection(info.pageCount === 1 ? "1" : `1-${info.pageCount}`);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "split_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  async function handleExtract() {
    const parsed = parsePageSelection(selection, pageCount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError("");
    setResult(null);

    try {
      const extracted = await run(
        ops.EXTRACT_RANGE,
        { bytes: bytesRef.current.slice(0), pages: parsed.pages },
        { transfer: [] }
      );

      setResult({
        blob: new Blob([extracted.bytes], { type: "application/pdf" }),
        filename: `pages-${formatPageSelection(parsed.pages).replace(/[,\s]+/g, "_")}.pdf`,
      });
      trackEvent(events.TOOL_RUN, {
        mode: "select",
        page_count: parsed.pages.length,
        source_page_count: pageCount,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "split_range_failed" });
      setError(describePdfError(err, "Something went wrong extracting those pages."));
    }
  }

  async function handleSplitAll() {
    setError("");
    setResult(null);

    try {
      // Zipping stays on the main thread: JSZip's generateAsync already
      // yields between chunks, so it doesn't block, and keeping it here means
      // the worker bundle doesn't carry a second heavy dependency.
      //
      // Loaded BEFORE the run, not after: pages now arrive as chunks while the
      // worker is still splitting, so the zip has to exist to receive them.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      const split = await run(
        ops.SPLIT_ALL,
        { bytes: bytesRef.current.slice(0) },
        {
          transfer: [],
          // Each page is filed and immediately dropped. Holding the array the
          // worker used to return meant every one-page document stayed
          // resident until the zip was built — the source, all N outputs, and
          // JSZip's copy of them all at once, which is what made a large split
          // fail rather than merely be slow.
          onChunk: (chunk) => zip.file(chunk.name, chunk.bytes),
        }
      );

      setIsZipping(true);
      const zipBlob = await zip.generateAsync({ type: "blob" });

      setResult({ blob: zipBlob, filename: "split-pages.zip" });
      trackEvent(events.TOOL_RUN, { mode: "split_all", page_count: split.pageCount });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "split_all_failed" });
      setError(describePdfError(err, "Something went wrong splitting this PDF."));
    } finally {
      setIsZipping(false);
    }
  }

  const preview = (() => {
    if (mode !== "select" || !pageCount) return null;
    const parsed = parsePageSelection(selection, pageCount);
    if (!parsed.ok) return null;
    return parsed.pages;
  })();

  const busy = isRunning || isZipping;

  return (
    <div>
      {!file && (
        <FileDropzone
          onFiles={handleFiles}
          accept="application/pdf,.pdf"
          label="Drag & drop a PDF here, or click to browse"
        />
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {warning && (
        <p role="status" style={{ fontSize: "13px", color: colors.warningText, marginTop: "12px" }}>
          {warning}
        </p>
      )}

      {file && pageCount && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={busy}
          />

          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            <ModeButton active={mode === "select"} onClick={() => setMode("select")}>
              Extract pages
            </ModeButton>
            <ModeButton active={mode === "all"} onClick={() => setMode("all")}>
              Split into individual pages
            </ModeButton>
          </div>

          {mode === "select" && (
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="page-selection"
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
                id="page-selection"
                type="text"
                inputMode="numeric"
                value={selection}
                onChange={(e) => {
                  setSelection(e.target.value);
                  setError("");
                  setResult(null);
                }}
                placeholder="e.g. 1-3, 7, 12-15"
                aria-describedby="page-selection-help"
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
                id="page-selection-help"
                style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}
              >
                Single pages, ranges, or both — this PDF has {pageCount} page
                {pageCount === 1 ? "" : "s"}.
                {preview && (
                  <span style={{ color: colors.textMuted }}>
                    {" "}
                    Selecting {preview.length} page{preview.length === 1 ? "" : "s"}:{" "}
                    {formatPageSelection(preview)}.
                  </span>
                )}
              </p>

              <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                <PresetButton onClick={() => setSelection(`1-${pageCount}`)}>All pages</PresetButton>
                <PresetButton
                  onClick={() => setSelection(`1-${Math.ceil(pageCount / 2)}`)}
                  disabled={pageCount < 2}
                >
                  First half
                </PresetButton>
                <PresetButton
                  onClick={() => setSelection(`${Math.ceil(pageCount / 2) + 1}-${pageCount}`)}
                  disabled={pageCount < 2}
                >
                  Second half
                </PresetButton>
              </div>
            </div>
          )}

          {mode === "all" && (
            <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "20px" }}>
              Each of the {pageCount} pages will be saved as its own PDF, bundled into a zip.
            </p>
          )}

          {busy && (
            <ProgressBar
              progress={progress}
              indeterminate={isZipping || !progress?.total}
              label={isZipping ? "Building zip file…" : undefined}
            />
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton
              onClick={mode === "select" ? handleExtract : handleSplitAll}
              disabled={busy}
            >
              <Scissors size={16} />
              {busy ? "Working…" : mode === "select" ? "Extract pages" : "Split PDF"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {result && !busy && (
              <DownloadButton getBlob={() => result.blob} filename={result.filename}>
                Download {result.filename}
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

function PresetButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceMuted,
        color: disabled ? colors.textFaint : colors.textSecondary,
        borderRadius: "999px",
        padding: "5px 12px",
        fontSize: "13px",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
