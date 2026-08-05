"use client";

import { useCallback, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Save, RotateCcw } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import PdfPageThumbnail from "@/components/PdfPageThumbnail";
import { PrimaryButton, SecondaryButton, iconButtonStyle } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// Each entry is { id, originalIndex } — id is stable across reorders and
// deletes, originalIndex maps back to the source PDF for export.
export default function ReorderPdfClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pages, setPages] = useState([]);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  // Index of the page "picked up" by keyboard. The whole reason this exists:
  // the old tool was drag-and-drop only, so reordering was impossible with a
  // keyboard or a screen reader.
  const [grabbedIndex, setGrabbedIndex] = useState(null);
  const [status, setStatus] = useState("");
  // The document `pages` was built from. Kept in state rather than a ref so
  // the rebuild below is a state comparison during render — React's
  // documented "adjusting state when a prop changes" pattern — instead of a
  // ref read, which isn't allowed during render.
  const [builtFor, setBuiltFor] = useState(null);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);

  // Built during render, once per document. It can't key off the list length
  // the way Rotate does, because removing a page is a legitimate user edit
  // that must not trigger a rebuild — so the source document is the identity.
  // Doing this inline rather than in an effect avoids an intermediate render
  // where the document is ready but the grid is still empty.
  if (isReady && pageCount > 0 && builtFor !== bytes) {
    setBuiltFor(bytes);
    setPages(Array.from({ length: pageCount }, (_, i) => ({ id: i, originalIndex: i })));
  }

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setPages([]);
    setResultBlob(null);
    setError("");
    setGrabbedIndex(null);
    setStatus("");
    setBuiltFor(null);
    bytesRef.current = null;
  }, []);

  async function handleFiles(fileList) {
    setError("");
    setResultBlob(null);

    const check = await validatePdfFile(fileList[0]);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    try {
      const buffer = await check.file.arrayBuffer();
      bytesRef.current = buffer;
      setFile(check.file);
      // Drives the thumbnail hook, which owns cancellation of any previous
      // document's in-flight renders.
      setBytes(buffer);
    } catch (err) {
      console.error(err);
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  function removePage(id) {
    setResultBlob(null);
    setPages((prev) => prev.filter((p) => p.id !== id));
    setGrabbedIndex(null);
  }

  const movePage = useCallback((from, to) => {
    if (to < 0) return;
    setResultBlob(null);
    setPages((prev) => {
      if (to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Keyboard reordering: Space picks a page up and puts it down, arrows move
  // it, Escape cancels. This is the standard the WAI-ARIA authoring practices
  // describe for a reorderable list, and it makes the tool usable without a
  // mouse for the first time.
  function handleKeyDown(event, index) {
    const { key } = event;

    if (key === " " || key === "Enter") {
      event.preventDefault();
      if (grabbedIndex === index) {
        setGrabbedIndex(null);
        setStatus(`Page dropped at position ${index + 1}.`);
      } else {
        setGrabbedIndex(index);
        setStatus(`Page ${index + 1} grabbed. Use the arrow keys to move it, then press space.`);
      }
      return;
    }

    if (key === "Escape" && grabbedIndex !== null) {
      event.preventDefault();
      setGrabbedIndex(null);
      setStatus("Move cancelled.");
      return;
    }

    if (key !== "ArrowLeft" && key !== "ArrowRight") return;

    event.preventDefault();
    const delta = key === "ArrowLeft" ? -1 : 1;
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;

    if (grabbedIndex === index) {
      // Captured before the move: after it, `index` points at whichever page
      // shifted into the vacated slot, so focusing by position would follow
      // the wrong card and the next arrow press would move a different page.
      const movedId = pages[index].id;
      movePage(index, target);
      setGrabbedIndex(target);
      setStatus(`Moved to position ${target + 1} of ${pages.length}.`);
      requestAnimationFrame(() => {
        document.getElementById(`page-card-${movedId}`)?.focus();
      });
    } else {
      document.getElementById(`page-card-${pages[target].id}`)?.focus();
    }
  }

  async function handleApply() {
    if (pages.length === 0) {
      setError("At least one page must remain.");
      return;
    }

    setError("");
    setResultBlob(null);

    try {
      const result = await run(
        ops.REORDER,
        { bytes: bytesRef.current.slice(0), order: pages.map((p) => p.originalIndex) },
        { transfer: [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, { page_count: pages.length });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "reorder_failed" });
      setError(describePdfError(err, "Could not save the reordered PDF."));
    }
  }

  function handleRevert() {
    setPages((prev) => [...prev].sort((a, b) => a.originalIndex - b.originalIndex));
    setResultBlob(null);
    setStatus("Original page order restored.");
  }

  const removedCount = pageCount - pages.length;
  const isModified =
    removedCount > 0 || pages.some((page, index) => page.originalIndex !== index);

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

      {file && !isReady && !renderError && (
        <p style={{ fontSize: "14px", color: colors.textMuted, marginTop: "16px" }}>
          Opening PDF…
        </p>
      )}

      {file && isReady && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pages.length}
            onReset={resetState}
            disabled={isRunning}
          />

          <p style={{ fontSize: "13px", color: colors.textFaint, margin: "0 0 16px" }}>
            Drag a page to move it, or focus one and press space to pick it up and the arrow keys
            to move it. Remove a page with the ✕ button.
          </p>

          {/* Announces reorder outcomes to screen readers, which otherwise
              get no feedback at all from a purely visual rearrangement. */}
          <p
            aria-live="polite"
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
            }}
          >
            {status}
          </p>

          {removedCount > 0 && (
            <p style={{ fontSize: "13px", color: colors.warningText, margin: "0 0 16px" }}>
              {removedCount} page{removedCount === 1 ? "" : "s"} will be removed from the saved
              file.
            </p>
          )}

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "14px",
            }}
          >
            {pages.map((page, index) => (
              <li
                key={page.id}
                id={`page-card-${page.id}`}
                tabIndex={0}
                role="button"
                aria-label={`Page ${index + 1} of ${pages.length}${
                  grabbedIndex === index ? ", grabbed" : ""
                }`}
                aria-grabbed={grabbedIndex === index}
                draggable={!isRunning}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                // Applied on drop, not dragover. Reordering on every dragover
                // made the card jump out from under the pointer and the grid
                // shuffle through orders the user never chose.
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) movePage(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                style={{
                  position: "relative",
                  border: `2px solid ${
                    grabbedIndex === index
                      ? colors.primary
                      : dragIndex === index
                        ? colors.primarySoftBorder
                        : colors.border
                  }`,
                  borderRadius: "10px",
                  padding: "8px",
                  backgroundColor: colors.surface,
                  cursor: isRunning ? "default" : "grab",
                  boxShadow: grabbedIndex === index ? "var(--shadow-float)" : "none",
                }}
              >
                <button
                  onClick={() => removePage(page.id)}
                  disabled={isRunning}
                  aria-label={`Remove page ${index + 1}`}
                  style={{
                    position: "absolute",
                    top: "6px",
                    right: "6px",
                    zIndex: 1,
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: colors.surface,
                    color: colors.danger,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: isRunning ? "not-allowed" : "pointer",
                    boxShadow: "var(--shadow-float)",
                  }}
                >
                  <X size={15} />
                </button>

                <PdfPageThumbnail
                  pageNumber={page.originalIndex + 1}
                  getThumbnail={getThumbnail}
                  alt={`Page ${index + 1}`}
                />

                <div
                  style={{
                    textAlign: "center",
                    fontSize: "12px",
                    color: colors.textMuted,
                    margin: "8px 0",
                  }}
                >
                  Page {index + 1}
                  {page.originalIndex !== index && (
                    <span style={{ color: colors.textFaint }}> (was {page.originalIndex + 1})</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => movePage(index, index - 1)}
                    disabled={index === 0 || isRunning}
                    aria-label={`Move page ${index + 1} earlier`}
                    style={{ ...iconButtonStyle(index === 0 || isRunning), flex: 1, width: "auto" }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => movePage(index, index + 1)}
                    disabled={index === pages.length - 1 || isRunning}
                    aria-label={`Move page ${index + 1} later`}
                    style={{
                      ...iconButtonStyle(index === pages.length - 1 || isRunning),
                      flex: 1,
                      width: "auto",
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Saving PDF…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleApply} disabled={isRunning || pages.length === 0}>
              <Save size={16} />
              {isRunning ? "Saving…" : "Save PDF"}
            </PrimaryButton>

            {isModified && !isRunning && (
              <SecondaryButton onClick={handleRevert}>
                <RotateCcw size={15} /> Reset order
              </SecondaryButton>
            )}

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
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
