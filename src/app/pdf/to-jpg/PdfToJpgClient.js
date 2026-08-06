"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Images } from "lucide-react";
import FileDropzone from "@/components/FileDropzone";
import DownloadButton from "@/components/DownloadButton";
import ProgressBar from "@/components/ProgressBar";
import ErrorBanner from "@/components/ErrorBanner";
import PdfFileHeader from "@/components/PdfFileHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ToolButton";
import { validatePdfFile, describePdfError } from "@/lib/pdfFile";
import { parsePageSelection, formatPageSelection } from "@/lib/pdfPageRange";
import { canvasToBlob } from "@/lib/imageFile";
import {
  DPI_PRESETS,
  DEFAULT_DPI_PRESET,
  RASTER_FORMATS,
  findDpiPreset,
  planPageRaster,
  describeRasterSize,
  describeClamp,
  pageImageName,
  rasterExtension,
} from "@/lib/pdfRasterSettings";
import { formatBytes } from "@/lib/formatBytes";
import { colors } from "@/lib/theme";
import { events, trackEvent } from "@/lib/analytics";

// Rendering happens here rather than in the PDF worker: pdf.js needs a real
// canvas and its own worker, and the pdf-lib worker deliberately carries
// neither. Pages are rendered one at a time with a yield between them, so the
// tab stays responsive and a cancel is honoured promptly.
export default function PdfToJpgClient() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [firstPageSize, setFirstPageSize] = useState(null);
  const [dpiPresetId, setDpiPresetId] = useState(DEFAULT_DPI_PRESET);
  const [format, setFormat] = useState("image/jpeg");
  const [selection, setSelection] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [result, setResult] = useState(null);
  const [isRendering, setIsRendering] = useState(false);
  const [rendered, setRendered] = useState(0);

  // pdf.js loading task, kept so teardown can release its worker. Destroy
  // lives on the TASK, not the document proxy — PDFDocumentProxy has no
  // destroy() in pdf.js v6, and calling doc.destroy?.() silently does nothing
  // while leaking a worker per file.
  const taskRef = useRef(null);
  const docRef = useRef(null);
  const cancelRef = useRef(false);

  const teardown = useCallback(() => {
    taskRef.current?.destroy?.().catch(() => {});
    taskRef.current = null;
    docRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const resetState = useCallback(() => {
    cancelRef.current = true;
    setFile(null);
    setPageCount(null);
    setFirstPageSize(null);
    setSelection("");
    setResult(null);
    setError("");
    setWarning("");
    setRendered(0);
    teardown();
  }, [teardown]);

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
        `This is a large PDF (${Math.round(check.file.size / (1024 * 1024))} MB). Rendering runs on your device, so it may take a moment.`
      );
    }

    try {
      const bytes = await check.file.arrayBuffer();

      // Dynamic import, never at module scope: pdf.js touches DOMMatrix on
      // evaluation, which doesn't exist in Node, and this page is statically
      // prerendered — a top-level import fails the build outright.
      const pdfjsLib = (await import("@/lib/pdfjs")).default;

      teardown();
      const task = pdfjsLib.getDocument({ data: bytes });
      const doc = await task.promise;

      taskRef.current = task;
      docRef.current = doc;

      // The first page's dimensions drive the live "you'll get N × M px"
      // readout. Mixed-size documents exist, but the first page is a fair
      // stand-in and the alternative is a per-page table nobody reads.
      const firstPage = await doc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });

      setFile(check.file);
      setPageCount(doc.numPages);
      setFirstPageSize({ width: viewport.width, height: viewport.height });
      setSelection(doc.numPages === 1 ? "1" : `1-${doc.numPages}`);
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "pdf_to_jpg_read_failed" });
      setError(describePdfError(err, "Could not open this PDF."));
      resetState();
    }
  }

  const plan = useMemo(() => {
    if (!firstPageSize) return null;
    return planPageRaster(
      firstPageSize.width,
      firstPageSize.height,
      findDpiPreset(dpiPresetId).dpi
    );
  }, [firstPageSize, dpiPresetId]);

  const selectedPages = useMemo(() => {
    if (!pageCount) return null;
    const parsed = parsePageSelection(selection, pageCount);
    return parsed.ok ? parsed.pages : null;
  }, [selection, pageCount]);

  async function handleExport() {
    const parsed = parsePageSelection(selection, pageCount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError("");
    setResult(null);
    setIsRendering(true);
    setRendered(0);
    cancelRef.current = false;

    const dpi = findDpiPreset(dpiPresetId).dpi;
    const extension = rasterExtension(format);
    const stem = file.name.replace(/\.[^./\\]+$/, "");

    try {
      const doc = docRef.current;
      const images = [];
      let clampedAny = false;

      for (let i = 0; i < parsed.pages.length; i++) {
        if (cancelRef.current) return;

        const pageNumber = parsed.pages[i];
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });

        // Planned per page, not once from the first: a document can mix A4 and
        // A3, and a single plan would either clamp pages that didn't need it
        // or blow the ceiling on the ones that did.
        const pagePlan = planPageRaster(base.width, base.height, dpi);
        if (pagePlan.clamped) clampedAny = true;

        const viewport = page.getViewport({ scale: pagePlan.scale });
        const canvas = document.createElement("canvas");
        canvas.width = pagePlan.width;
        canvas.height = pagePlan.height;

        const context = canvas.getContext("2d");

        // JPG has no alpha, so an unfilled canvas encodes transparent pixels
        // as black — a page would come out with a black background instead of
        // white. PDF pages are white by definition, so fill before rendering.
        if (format === "image/jpeg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({ canvasContext: context, viewport }).promise;

        // Rejects on a null blob rather than letting URL.createObjectURL(null)
        // throw — encoding fails on very large pages, which is exactly when
        // the raw callback returns null.
        const blob = await canvasToBlob(canvas, format, 0.92);

        // Release the backing store explicitly. Safari holds detached canvases
        // far longer than GC would suggest, and at 200 pages that is the
        // difference between working and not.
        canvas.width = 0;
        canvas.height = 0;

        images.push({
          name: pageImageName(stem, pageNumber, pageCount, extension),
          blob,
        });

        setRendered(i + 1);

        // Yield to the event loop between pages. Rendering is async but the
        // encode is not, and without this the tab stops painting the progress
        // bar it exists to show.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (cancelRef.current) return;

      if (clampedAny) {
        setWarning(
          describeClamp({ clamped: true, requestedDpi: dpi, effectiveDpi: plan?.effectiveDpi || dpi })
        );
      }

      // A single page downloads directly — wrapping one image in a zip just
      // makes the user unpack it for no reason.
      if (images.length === 1) {
        setResult({ blob: images[0].blob, filename: images[0].name, count: 1 });
      } else {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        images.forEach((image) => zip.file(image.name, image.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });

        setResult({ blob: zipBlob, filename: `${stem}-images.zip`, count: images.length });
      }

      trackEvent(events.TOOL_RUN, {
        page_count: images.length,
        source_page_count: pageCount,
        dpi,
        output_format: format,
      });
    } catch (err) {
      console.error(err);
      trackEvent(events.TOOL_ERROR, { reason: "pdf_to_jpg_failed" });
      setError(describePdfError(err, "Could not convert these pages to images."));
    } finally {
      setIsRendering(false);
    }
  }

  function handleCancel() {
    cancelRef.current = true;
    setIsRendering(false);
    setRendered(0);
  }

  const totalToRender = selectedPages?.length || 0;

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
            disabled={isRendering}
          />

          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="jpg-page-selection"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: colors.textSecondary,
                marginBottom: "6px",
              }}
            >
              Pages to convert
            </label>
            <input
              id="jpg-page-selection"
              type="text"
              inputMode="numeric"
              value={selection}
              onChange={(event) => {
                setSelection(event.target.value);
                setError("");
                setResult(null);
              }}
              placeholder="e.g. 1-3, 7, 12-15"
              aria-describedby="jpg-page-selection-help"
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
              id="jpg-page-selection-help"
              style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}
            >
              Single pages, ranges, or both — this PDF has {pageCount} page
              {pageCount === 1 ? "" : "s"}.
              {selectedPages && (
                <span style={{ color: colors.textMuted }}>
                  {" "}
                  Converting {selectedPages.length} page
                  {selectedPages.length === 1 ? "" : "s"}: {formatPageSelection(selectedPages)}.
                </span>
              )}
            </p>
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
              Quality
            </legend>

            <div style={{ display: "grid", gap: "10px" }}>
              {DPI_PRESETS.map((preset) => {
                const presetPlan = firstPageSize
                  ? planPageRaster(firstPageSize.width, firstPageSize.height, preset.dpi)
                  : null;
                const active = dpiPresetId === preset.id;

                return (
                  <label
                    key={preset.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      border: `1px solid ${active ? colors.primary : colors.border}`,
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                      borderRadius: "10px",
                      padding: "12px 14px",
                      cursor: isRendering ? "not-allowed" : "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="dpi"
                      value={preset.id}
                      checked={active}
                      disabled={isRendering}
                      onChange={() => {
                        setDpiPresetId(preset.id);
                        setResult(null);
                        setWarning("");
                      }}
                      style={{ marginTop: "3px" }}
                    />
                    <span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: active ? colors.primary : colors.text,
                        }}
                      >
                        {preset.label} · {preset.dpi} DPI
                        {presetPlan && (
                          <span
                            style={{
                              fontWeight: 400,
                              color: colors.textMuted,
                              marginLeft: "8px",
                              fontSize: "13px",
                            }}
                          >
                            {describeRasterSize(presetPlan)}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "13px", color: colors.textMuted }}>
                        {preset.note}
                      </span>
                      {presetPlan?.clamped && (
                        <span
                          style={{ display: "block", fontSize: "12px", color: colors.warningText }}
                        >
                          Capped at about {presetPlan.effectiveDpi} DPI — these pages are too large
                          for a browser to render at full size.
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div style={{ marginTop: "16px" }}>
              <span
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: colors.textSecondary,
                  marginBottom: "8px",
                }}
              >
                Image format
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {RASTER_FORMATS.map((option) => (
                  <button
                    key={option.mimeType}
                    onClick={() => {
                      setFormat(option.mimeType);
                      setResult(null);
                    }}
                    disabled={isRendering}
                    aria-pressed={format === option.mimeType}
                    title={option.note}
                    style={{
                      border: `1px solid ${
                        format === option.mimeType ? colors.primary : colors.border
                      }`,
                      backgroundColor:
                        format === option.mimeType ? colors.primarySoft : colors.surface,
                      color: format === option.mimeType ? colors.primary : colors.textSecondary,
                      borderRadius: "999px",
                      padding: "6px 14px",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: isRendering ? "not-allowed" : "pointer",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: "13px", color: colors.textFaint, margin: "8px 0 0" }}>
                {RASTER_FORMATS.find((option) => option.mimeType === format)?.note}
              </p>
            </div>
          </fieldset>

          {isRendering && (
            <ProgressBar
              progress={{
                completed: rendered,
                total: totalToRender,
                ratio: totalToRender ? rendered / totalToRender : 0,
                label: "Rendering page",
              }}
              label={`Rendering page ${rendered} of ${totalToRender}…`}
            />
          )}

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
            <PrimaryButton onClick={handleExport} disabled={isRendering || !selectedPages}>
              <Images size={16} />
              {isRendering ? "Converting…" : "Convert to images"}
            </PrimaryButton>

            {isRendering && <SecondaryButton onClick={handleCancel}>Cancel</SecondaryButton>}

            {result && !isRendering && (
              <DownloadButton getBlob={() => result.blob} filename={result.filename}>
                Download {result.filename}
                <span style={{ opacity: 0.8 }}>({formatBytes(result.blob.size)})</span>
              </DownloadButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
