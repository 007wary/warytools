"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Crop as CropIcon, RotateCcw } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import CropOverlay from "@/components/CropOverlay";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { usePdfThumbnails } from "@/lib/pdfThumbnails";
import { usePdfWorker, ops } from "@/lib/pdfWorkerClient";
import {
  ASPECT_RATIOS,
  FULL_RECT,
  resolveAspect,
  normalizeRect,
  describeCrop,
} from "@/lib/cropGeometry";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// Two scopes, because both are real needs and they want different UI:
//   "all"     — one rectangle applied to every page. The common case, since a
//               scanner's margins or a slide deck's borders are uniform.
//   "current" — crop only the page being previewed, leaving the rest intact.
const SCOPES = [
  { id: "all", label: "All pages" },
  { id: "current", label: "This page only" },
];

export default function CropPdfClient() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rect, setRect] = useState(FULL_RECT);
  const [aspectId, setAspectId] = useState("free");
  const [scope, setScope] = useState("all");
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);

  const { pageCount, getThumbnail, isReady, error: renderError } = usePdfThumbnails(bytes);
  const { run, cancel, progress, isRunning } = usePdfWorker();

  const bytesRef = useRef(null);
  // Per-page dimensions, needed for the aspect maths and the size readout. A
  // document can mix page sizes, so this is read per page rather than once.
  const [pageSizes, setPageSizes] = useState([]);

  const resetState = useCallback(() => {
    setFile(null);
    setBytes(null);
    setPageIndex(0);
    setRect(FULL_RECT);
    setResultBlob(null);
    setError("");
    setPageSizes([]);
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

      // INSPECT gives page dimensions without a second parse in the client —
      // the worker already has the document open for this.
      const info = await run(ops.INSPECT, { bytes: buffer.slice(0) }, { transfer: [] });

      setFile(check.file);
      setBytes(buffer);
      setPageSizes(info.pages);
      setPageIndex(0);
      setRect(FULL_RECT);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "crop_read_failed" });
      setError(describePdfError(err, "Could not read this PDF."));
      resetState();
    }
  }

  // The preview thumbnail, read during render rather than mirrored into state.
  //
  // usePdfThumbnails already bumps an internal version counter when a render
  // finishes, so this component re-renders and picks up the new URL on its
  // own. Copying it into state via an effect would add a second render pass
  // per page and a cascading-render lint error, for no behaviour that the hook
  // doesn't already provide. This is how Reorder and Rotate consume it too.
  const preview = isReady && pageCount > 0 ? getThumbnail(pageIndex + 1) : null;

  const currentSize = pageSizes[pageIndex];

  // A page with a /Rotate of 90 or 270 displays with its axes swapped, so the
  // preview is landscape while getSize() reports portrait. Using the unswapped
  // numbers would make the aspect presets and the mm readout wrong on exactly
  // those pages.
  const displaySize = useMemo(() => {
    if (!currentSize) return null;
    const quarterTurned = Math.abs(currentSize.rotation % 180) === 90;
    return quarterTurned
      ? { width: currentSize.height, height: currentSize.width }
      : { width: currentSize.width, height: currentSize.height };
  }, [currentSize]);

  const aspect = useMemo(
    () => resolveAspect(aspectId, displaySize?.width, displaySize?.height),
    [aspectId, displaySize]
  );

  const handleRectChange = useCallback((next) => {
    setRect(normalizeRect(next));
    setResultBlob(null);
  }, []);

  async function handleApply() {
    setError("");
    setResultBlob(null);

    try {
      // A map rather than an array: pages absent from it are left untouched,
      // so "this page only" doesn't rewrite the rest of the document.
      const rects = {};
      if (scope === "all") {
        for (let i = 0; i < pageCount; i++) rects[i] = rect;
      } else {
        rects[pageIndex] = rect;
      }

      const result = await run(
        ops.CROP,
        { bytes: bytesRef.current.slice(0), rects },
        { transfer: [] }
      );

      setResultBlob(new Blob([result.bytes], { type: "application/pdf" }));
      trackEvent(events.TOOL_RUN, {
        scope,
        page_count: result.croppedCount,
        source_page_count: pageCount,
        aspect: aspectId,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "crop_failed" });
      setError(describePdfError(err, "Could not save the cropped PDF."));
    }
  }

  const isCropped = rect.width < 0.999 || rect.height < 0.999;

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
        <p style={{ fontSize: "14px", color: colors.textMuted, marginTop: "16px" }}>Opening PDF…</p>
      )}

      {file && isReady && (
        <div style={{ marginTop: "20px" }}>
          <PdfFileHeader
            file={file}
            pageCount={pageCount}
            onReset={resetState}
            disabled={isRunning}
          />

          <p style={{ fontSize: "13px", color: colors.textFaint, margin: "0 0 16px" }}>
            Drag on the page to draw a crop, or drag the corner handles to adjust it. With the
            crop focused, the arrow keys move it and Alt + arrows resize it.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: "20px",
              marginBottom: "20px",
            }}
          >
            <div style={{ maxWidth: "460px", margin: "0 auto", width: "100%" }}>
              {preview ? (
                <CropOverlay
                  rect={rect}
                  onChange={handleRectChange}
                  aspect={aspect}
                  sourceWidth={displaySize?.width}
                  sourceHeight={displaySize?.height}
                  disabled={isRunning}
                  label={`Crop region on page ${pageIndex + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt={`Page ${pageIndex + 1}`}
                    draggable={false}
                    style={{ width: "100%", display: "block" }}
                  />
                </CropOverlay>
              ) : (
                <div
                  style={{
                    aspectRatio: displaySize
                      ? `${displaySize.width} / ${displaySize.height}`
                      : "1 / 1.414",
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    color: colors.textFaint,
                  }}
                >
                  Rendering page…
                </div>
              )}

              {pageCount > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    marginTop: "12px",
                  }}
                >
                  <SecondaryButton
                    onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                    disabled={pageIndex === 0 || isRunning}
                  >
                    Previous
                  </SecondaryButton>
                  <span style={{ fontSize: "13px", color: colors.textMuted }}>
                    Page {pageIndex + 1} of {pageCount}
                  </span>
                  <SecondaryButton
                    onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
                    disabled={pageIndex === pageCount - 1 || isRunning}
                  >
                    Next
                  </SecondaryButton>
                </div>
              )}

              {displaySize && (
                <p
                  style={{
                    fontSize: "13px",
                    color: colors.textMuted,
                    textAlign: "center",
                    margin: "10px 0 0",
                  }}
                >
                  {describeCrop(rect, displaySize.width, displaySize.height)}
                </p>
              )}
            </div>
          </div>

          <fieldset
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: "10px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <legend
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: colors.textSecondary,
                padding: "0 6px",
              }}
            >
              Crop settings
            </legend>

            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <span
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: colors.textSecondary,
                    marginBottom: "8px",
                  }}
                >
                  Aspect ratio
                </span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {ASPECT_RATIOS.map((option) => (
                    <Chip
                      key={option.id}
                      active={aspectId === option.id}
                      onClick={() => setAspectId(option.id)}
                      disabled={isRunning}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {pageCount > 1 && (
                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: colors.textSecondary,
                      marginBottom: "8px",
                    }}
                  >
                    Apply to
                  </span>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {SCOPES.map((option) => (
                      <Chip
                        key={option.id}
                        active={scope === option.id}
                        onClick={() => {
                          setScope(option.id);
                          setResultBlob(null);
                        }}
                        disabled={isRunning}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  {scope === "all" && (
                    <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}>
                      The same crop is applied to all {pageCount} pages. If the document mixes page
                      sizes, the crop is proportional to each page rather than a fixed measurement.
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>

          {isRunning && <ProgressBar progress={progress} indeterminate label="Cropping PDF…" />}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleApply} disabled={isRunning || !isCropped}>
              <CropIcon size={16} />
              {isRunning ? "Cropping…" : "Crop PDF"}
            </PrimaryButton>

            {isCropped && !isRunning && (
              <SecondaryButton onClick={() => setRect(FULL_RECT)}>
                <RotateCcw size={15} /> Reset crop
              </SecondaryButton>
            )}

            {isRunning && <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>}

            {resultBlob && !isRunning && (
              <DownloadButton getBlob={() => resultBlob} filename="cropped.pdf">
                Download cropped.pdf
              </DownloadButton>
            )}
          </div>

          {!isCropped && (
            <p style={{ fontSize: "13px", color: colors.textFaint, margin: "12px 0 0" }}>
              Draw a crop region on the page above to enable the button.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? colors.primary : colors.border}`,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textSecondary,
        borderRadius: "999px",
        padding: "6px 14px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
