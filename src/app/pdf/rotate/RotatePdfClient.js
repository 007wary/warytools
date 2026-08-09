"use client";

import { useCallback, useRef, useState } from "react";
import { RotateCcw, RotateCw, Check } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import PdfPageThumbnail from "@/components/PdfPageThumbnail";
import { PrimaryButton, SecondaryButton, iconButtonStyle } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops, isCancellation } from "@/lib/pdfWorkerClient";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// rotations[i] is the extra rotation (0/90/180/270) to apply to page i, on
// top of whatever rotation the page already has.
//
// The old version listed pages as text rows with a degree readout and no
// preview, so you rotated blind and only found out whether a scan came out
// upright by downloading it. Every page now shows a live preview that turns
// with the buttons.
export default function RotatePdfClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [rotations, setRotations] = useState([]);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);

  // Derived during render rather than synced by an effect. The page count
  // arrives asynchronously, and setting state from an effect on its arrival
  // costs an extra render pass in which the grid is present but its rotation
  // array is still empty — React 19's lint flags exactly this. Adjusting the
  // array inline means the first render that knows the page count already has
  // a correctly-sized array.
  if (isReady && pageCount > 0 && rotations.length !== pageCount) {
    setRotations(new Array(pageCount).fill(0));
  }

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setRotations([]);
    setResultBlob(null);
    setError("");
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
      setBytes(buffer);
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  // Any rotation change invalidates a previously generated file. Clearing it
  // unconditionally is safe here because "Apply" is gated on hasChanges, and
  // a rotation set that sums back to 0 legitimately has nothing to apply.
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

  function resetRotations() {
    setResultBlob(null);
    setRotations((prev) => prev.map(() => 0));
  }

  async function handleApply() {
    setError("");
    setResultBlob(null);

    try {
      const result = await run(
        ops.ROTATE,
        { bytes: bytesRef.current.slice(0), rotations },
        { transfer: [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, {
        page_count: result.pageCount,
        rotated_pages: rotations.filter((r) => r).length,
      });
    } catch (err) {
      // A cancel is the user's own action, not a failure — reporting it as an
      // error banner contradicts the button they just pressed.
      if (isCancellation(err)) return;
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "rotate_failed" });
      setError(describePdfError(err, "Could not rotate this PDF."));
    }
  }

  const rotatedCount = rotations.filter((r) => r !== 0).length;
  const hasChanges = rotatedCount > 0;

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

      {file && isReady && rotations.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={isRunning}
          />

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <SecondaryButton onClick={() => rotateAll(-90)} disabled={isRunning}>
              <RotateCcw size={15} /> Rotate all left
            </SecondaryButton>
            <SecondaryButton onClick={() => rotateAll(90)} disabled={isRunning}>
              <RotateCw size={15} /> Rotate all right
            </SecondaryButton>
            {hasChanges && (
              <SecondaryButton onClick={resetRotations} disabled={isRunning}>
                Reset all
              </SecondaryButton>
            )}
          </div>

          <p style={{ fontSize: "13px", color: colors.textFaint, margin: "0 0 16px" }}>
            {hasChanges
              ? `${rotatedCount} of ${pageCount} page${pageCount === 1 ? "" : "s"} rotated. Previews show how each page will be saved.`
              : "Rotate individual pages with the buttons under each preview, or use the controls above for all pages at once."}
          </p>

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
            {rotations.map((rotation, index) => (
              <li
                key={index}
                style={{
                  border: `1px solid ${rotation ? colors.primarySoftBorder : colors.border}`,
                  borderRadius: "10px",
                  padding: "8px",
                  backgroundColor: rotation ? colors.primarySoft : colors.surface,
                }}
              >
                <PdfPageThumbnail
                  pageNumber={index + 1}
                  getThumbnail={getThumbnail}
                  rotation={rotation}
                  alt={`Page ${index + 1}${rotation ? `, rotated ${rotation} degrees` : ""}`}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: colors.textMuted,
                    margin: "8px 2px",
                  }}
                >
                  <span>Page {index + 1}</span>
                  <span style={{ color: rotation ? colors.primary : colors.textFaint }}>
                    {rotation}°
                  </span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => rotatePage(index, -90)}
                    disabled={isRunning}
                    style={{ ...iconButtonStyle(isRunning), flex: 1, width: "auto" }}
                    aria-label={`Rotate page ${index + 1} left`}
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    onClick={() => rotatePage(index, 90)}
                    disabled={isRunning}
                    style={{ ...iconButtonStyle(isRunning), flex: 1, width: "auto" }}
                    aria-label={`Rotate page ${index + 1} right`}
                  >
                    <RotateCw size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Applying rotation…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleApply} disabled={!hasChanges || isRunning}>
              <Check size={16} />
              {isRunning ? "Applying…" : "Apply rotation"}
            </PrimaryButton>

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
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
